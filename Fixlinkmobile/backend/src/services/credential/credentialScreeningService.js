// Credential screening orchestrator (UAT #9) + facial verification (#10).
//
// Two passes are merged into one 0-100 risk:
//   Layer 1  documentForensics  local, offline, zero dependencies
//   Layer 2  OmniRoute vision   AI read of the ID and the selfie
//
// The result is ADVISORY. It never blocks registration and never accuses
// anyone: when the AI gateway is unreachable the local score stands alone and
// the verdict is `unverified` rather than a false mismatch.

const {
  FLAGS,
  LEVELS,
  config,
  isScreeningEnabled,
  isVisionEnabled,
  mergeRisk,
  levelForScore,
  namesMatch,
  idNumbersMatch,
  judgeFace,
} = require('../../domain/credentialScreening');
const { analyzeDocument } = require('./documentForensics');
const { visionComplete, isOmniRouteConfigured } = require('../omniRoute');

const VISION_SYSTEM = `You are a document-integrity analyst for FixLink, a Philippine services platform.
You receive a government ID image (and possibly a selfie) and must return STRICT JSON only, no prose.
Judge only what is visible. Never guess a person's identity beyond what is written on the document.
Be conservative: if you cannot tell, use the least accusatory value.`;

const VISION_INSTRUCTION = `Return a JSON object with exactly these keys:
{
  "role": "technician" | "customer" | "unknown",
  "readable": boolean,
  "aiGeneratedLikelihood": number 0..1,
  "tamperingLikelihood": number 0..1,
  "idNumber": string (the ID number printed on the document, or ""),
  "nameOnDocument": string (full name printed on the document, or ""),
  "documentType": string,
  "facePresent": boolean (a human face is visible in the ID photo),
  "selfieFacePresent": boolean (a live human face is visible in the selfie, false when no selfie was sent),
  "idFacePresent": boolean (the ID contains a photo of a face),
  "livenessRisk": number 0..1 (0 = almost certainly a live person, 1 = almost certainly a screen/print/photo-of-photo),
  "matchConfidence": number 0..1 (similarity between the ID photo and the selfie),
  "notes": string (short English sentence)
}`;

// Image bytes are only sent when small enough; the gateway has a body limit.
const toImage = (file, maxBytes) => {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > maxBytes) return null;
  const mimeType = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
  return { base64: file.buffer.toString('base64'), mimeType };
};

const runVision = async ({ role, governmentIdFile, selfieFile, governmentIdNumber, name }) => {
  const { visionMaxBytes, visionTimeoutMs } = config();
  const images = [];
  const idImage = toImage(governmentIdFile, visionMaxBytes);
  if (idImage) images.push(idImage);
  const selfieImage = toImage(selfieFile, visionMaxBytes);
  if (selfieImage) images.push(selfieImage);
  if (images.length === 0) return null;

  const context = [
    `Account role: ${role || 'unknown'}.`,
    governmentIdNumber ? `The applicant typed this ID number: ${governmentIdNumber}.` : '',
    name ? `The applicant's registered name: ${name}.` : '',
    `The first image is the government ID.${selfieImage ? ' The second image is the live selfie.' : ' No selfie was provided.'}`,
  ].filter(Boolean).join(' ');

  const { parsed, model } = await visionComplete({
    system: VISION_SYSTEM,
    user: `${context}\n\n${VISION_INSTRUCTION}`,
    images,
    timeoutMs: visionTimeoutMs,
  });
  return { ...parsed, model };
};

// Cross-checks the ID number and name the applicant declared against what the
// model read off the document. Tolerant matching avoids false accusations.
const judgeIdentity = ({ vision, governmentIdNumber, name }) => {
  const flags = [];
  if (!vision) return flags;
  if (governmentIdNumber) {
    if (!vision.idNumber) flags.push(FLAGS.ID_NUMBER_NOT_FOUND);
    else if (!idNumbersMatch(vision.idNumber, governmentIdNumber)) flags.push(FLAGS.ID_NUMBER_MISMATCH);
  }
  if (name && vision.nameOnDocument && !namesMatch(vision.nameOnDocument, name)) {
    flags.push(FLAGS.NAME_MISMATCH);
  }
  return flags;
};

const FLAG_NOTES = {
  [FLAGS.NO_CAMERA_METADATA]: 'The image has no camera metadata (could be a screenshot or export).',
  [FLAGS.AI_TOOL_MARKER]: 'An AI image-generation signature was found in the file.',
  [FLAGS.EDITOR_MARKER]: 'A photo-editor signature was found in the file.',
  [FLAGS.LOW_RESOLUTION]: 'The image resolution is below the readable threshold.',
  [FLAGS.TINY_FILE]: 'The file is unusually small.',
  [FLAGS.DOCUMENT_UNREADABLE]: 'The document could not be read clearly.',
  [FLAGS.AI_GENERATED]: 'The image looks AI-generated.',
  [FLAGS.TAMPERED]: 'Signs of digital tampering were detected.',
  [FLAGS.ID_NUMBER_MISMATCH]: 'The typed ID number does not match the document.',
  [FLAGS.ID_NUMBER_NOT_FOUND]: 'No ID number could be read from the document.',
  [FLAGS.NAME_MISMATCH]: 'The registered name does not match the document.',
  [FLAGS.SELFIE_MISSING]: 'No selfie was provided.',
  [FLAGS.FACE_NOT_DETECTED]: 'No human face was detected in the selfie.',
  [FLAGS.ID_PHOTO_NOT_FOUND]: 'No face photo was found on the ID.',
  [FLAGS.FACE_MISMATCH]: 'The selfie does not match the photo on the ID.',
  [FLAGS.SELFIE_LIVENESS_RISK]: 'The selfie may be a photo of a screen or print (liveness risk).',
};

const buildNotes = (flags) => flags.map((flag) => FLAG_NOTES[flag]).filter(Boolean).join(' ');

const screenCredential = async ({ role, name, governmentIdNumber, governmentIdFile, selfieFile }) => {
  if (!isScreeningEnabled()) return null;

  const forensic = analyzeDocument(governmentIdFile);
  const flags = [...forensic.flags];

  let vision = null;
  if (isVisionEnabled() && isOmniRouteConfigured()) {
    try {
      vision = await runVision({ role, governmentIdFile, selfieFile, governmentIdNumber, name });
    } catch (error) {
      // Offline / misconfigured gateway is expected: degrade to the local pass.
      console.warn('AI vision screening unavailable:', error.message);
    }
  }

  let visionScore = null;
  if (vision) {
    const { visionAiThreshold, visionTamperThreshold } = config();
    const ai = Number(vision.aiGeneratedLikelihood) || 0;
    const tampering = Number(vision.tamperingLikelihood) || 0;
    if (ai >= visionAiThreshold) flags.push(FLAGS.AI_GENERATED);
    if (tampering >= visionTamperThreshold) flags.push(FLAGS.TAMPERED);
    if (vision.readable === false) flags.push(FLAGS.DOCUMENT_UNREADABLE);
    visionScore = Math.round(Math.max(ai, tampering) * 100);
  }

  const identityFlags = judgeIdentity({ vision, governmentIdNumber, name });
  flags.push(...identityFlags);
  if (identityFlags.includes(FLAGS.ID_NUMBER_MISMATCH)) visionScore = Math.max(visionScore ?? 0, 85);
  if (identityFlags.includes(FLAGS.NAME_MISMATCH)) visionScore = Math.max(visionScore ?? 0, 70);

  const faceVerdict = judgeFace({ screening: { vision }, selfieProvided: Boolean(selfieFile) });
  flags.push(...faceVerdict.flags);

  const uniqueFlags = [...new Set(flags)];
  const riskScore = mergeRisk({ forensicScore: forensic.score, visionScore });
  const riskLevel = levelForScore(riskScore);

  return {
    riskScore,
    riskLevel,
    flags: uniqueFlags,
    notes: buildNotes(uniqueFlags),
    forensic,
    vision: vision
      ? {
        aiGeneratedLikelihood: Number(vision.aiGeneratedLikelihood) || 0,
        tamperingLikelihood: Number(vision.tamperingLikelihood) || 0,
        readable: vision.readable !== false,
        idNumber: vision.idNumber || null,
        nameOnDocument: vision.nameOnDocument || null,
        model: vision.model || null,
      }
      : null,
    face: {
      level: faceVerdict.level || LEVELS.UNVERIFIED,
      flags: faceVerdict.flags,
      matchConfidence: vision ? (Number(vision.matchConfidence) || 0) : null,
      livenessRisk: vision ? (Number(vision.livenessRisk) || 0) : null,
    },
    screenedAt: new Date().toISOString(),
  };
};

module.exports = { screenCredential, FLAG_NOTES };
