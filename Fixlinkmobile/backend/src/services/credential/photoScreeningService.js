// Device-photo screening (UAT #6, second part).
//
// Reuses the credential pipeline on the customer's repair photo: local
// forensics (Layer 1) plus an AI vision read (Layer 2). The result is ADVISORY
// — it warns the technician, it never blocks a submission.

const { analyzeDocument } = require('./documentForensics');
const { visionComplete, isOmniRouteConfigured } = require('../omniRoute');
const { config, mergeRisk, levelForScore } = require('../../domain/credentialScreening');
const photo = require('../../domain/photoScreening');

const toImage = (file, maxBytes) => {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > maxBytes) return null;
  const mimeType = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
  return { base64: file.buffer.toString('base64'), mimeType };
};

const runVision = async (file) => {
  const { visionMaxBytes, visionTimeoutMs } = config();
  const image = toImage(file, visionMaxBytes);
  if (!image) return null;
  const { parsed, model } = await visionComplete({
    system: photo.VISION_SYSTEM,
    user: photo.VISION_INSTRUCTION,
    images: [image],
    timeoutMs: visionTimeoutMs,
  });
  return { ...parsed, model };
};

const screenRepairPhoto = async (file) => {
  if (!photo.isPhotoScreeningEnabled() || !file?.buffer) return null;

  const forensic = analyzeDocument(file);
  const flags = [...forensic.flags];

  let vision = null;
  if (photo.isPhotoVisionEnabled() && isOmniRouteConfigured()) {
    try {
      vision = await runVision(file);
    } catch (error) {
      console.warn('AI photo vision unavailable:', error.message);
    }
  }

  let visionScore = null;
  if (vision) {
    const threshold = photo.photoAiThreshold();
    const ai = Number(vision.aiGeneratedLikelihood) || 0;
    const edited = Number(vision.editingLikelihood) || 0;
    if (ai >= threshold) flags.push(photo.PHOTO_FLAGS.AI_GENERATED);
    if (edited >= threshold) flags.push(photo.PHOTO_FLAGS.EDITED);
    if (vision.showsRealAppliance === false) flags.push(photo.PHOTO_FLAGS.NO_APPLIANCE_VISIBLE);
    if (vision.isScreenshot === true) flags.push(photo.PHOTO_FLAGS.SCREENSHOT);
    visionScore = Math.round(Math.max(ai, edited) * 100);
  }

  const uniqueFlags = [...new Set(flags)];
  const riskScore = mergeRisk({ forensicScore: forensic.score, visionScore });
  return {
    riskScore,
    riskLevel: levelForScore(riskScore),
    flags: uniqueFlags,
    notes: photo.buildNotes(uniqueFlags),
    forensic,
    vision: vision
      ? {
        aiGeneratedLikelihood: Number(vision.aiGeneratedLikelihood) || 0,
        editingLikelihood: Number(vision.editingLikelihood) || 0,
        showsRealAppliance: vision.showsRealAppliance !== false,
        isScreenshot: vision.isScreenshot === true,
        model: vision.model || null,
      }
      : null,
    screenedAt: new Date().toISOString(),
  };
};

module.exports = { screenRepairPhoto };
