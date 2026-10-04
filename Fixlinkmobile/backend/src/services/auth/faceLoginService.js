// Login face verification: compares a live sign-in selfie against the face
// photo stored at signup (users.profile_image).
//
// Fail-safe by design: when vision is unconfigured, the reference cannot be
// fetched, or the gateway errors, the verdict is `unavailable` and the caller
// falls back to the password result instead of locking the user out. Only a
// positive mismatch (wrong face, no face, or spoof signs) blocks sign-in.

const { visionComplete, isVisionConfigured } = require('../aiClient');
const {
  FLAGS,
  config,
  faceConfig,
  judgeFace,
} = require('../../domain/credentialScreening');
const { loginFaceMatchThreshold } = require('../../domain/loginFacePolicy');

const VISION_SYSTEM = `You verify a sign-in selfie for FixLink, a Philippine services platform.
You receive two portrait photos. The first image is the stored reference face photo from signup. The second image is the live selfie taken at sign-in.
Decide whether both show the same real, live person. Still images of screens, prints, or photos-of-photos are spoof attempts, never a match.
Return STRICT JSON only: output exactly the JSON object, no markdown fences, no prose before or after it.`;

const VISION_INSTRUCTION = `Return a JSON object with exactly these keys:
{
  "facePresent": boolean (a human face is visible in the reference photo),
  "selfieFacePresent": boolean (a live human face is visible in the sign-in selfie),
  "idFacePresent": boolean (the reference photo contains a face),
  "livenessRisk": number 0..1 (0 = almost certainly a live person, 1 = almost certainly a screen/print/photo-of-photo),
  "matchConfidence": number 0..1 (similarity between the reference face and the selfie),
  "notes": string (short English sentence)
}`;

const toImage = (buffer, mimetype, maxBytes) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > maxBytes) return null;
  const mime = typeof mimetype === 'string' && mimetype.startsWith('image/') ? mimetype : 'image/jpeg';
  return { base64: buffer.toString('base64'), mimeType: mime };
};

const downloadReference = async (url) => {
  const response = await fetch(String(url));
  if (!response.ok) throw new Error(`Reference photo unavailable (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error('Reference photo is empty.');
  return buffer;
};

// Blocking verdicts: no face on either side, an explicit mismatch, spoof
// signs, or similarity below the configured threshold.
const isMismatch = (vision, threshold) => {
  if (!vision || typeof vision !== 'object') return true;
  const flags = judgeFace({ screening: { vision }, selfieProvided: true }).flags || [];
  if (flags.includes(FLAGS.FACE_MISMATCH)) return true;
  if (flags.includes(FLAGS.FACE_NOT_DETECTED)) return true;
  if (flags.includes(FLAGS.ID_PHOTO_NOT_FOUND)) return true;
  if (flags.includes(FLAGS.SELFIE_MISSING)) return true;
  if (flags.includes(FLAGS.SELFIE_LIVENESS_RISK)) return true;
  return Number(vision.matchConfidence) < threshold;
};

const verifyLoginFace = async ({ referenceUrl, selfieFile }) => {
  if (!isVisionConfigured()) return { unavailable: true };
  try {
    const { visionMaxBytes, visionTimeoutMs } = config();
    const referenceBuffer = await downloadReference(referenceUrl);
    const reference = toImage(referenceBuffer, 'image/jpeg', visionMaxBytes);
    const selfie = toImage(selfieFile?.buffer, selfieFile?.mimetype, visionMaxBytes);
    if (!reference || !selfie) return { unavailable: true };
    const { parsed, model } = await visionComplete({
      system: VISION_SYSTEM,
      user: VISION_INSTRUCTION,
      images: [reference, selfie],
      timeoutMs: visionTimeoutMs,
    });
    const threshold = loginFaceMatchThreshold();
    const mismatch = isMismatch(parsed, threshold);
    return {
      unavailable: false,
      match: !mismatch,
      matchConfidence: Number(parsed?.matchConfidence) || 0,
      livenessThreshold: faceConfig().livenessThreshold,
      model: model || null,
    };
  } catch (error) {
    console.warn('Login face check skipped:', error.message);
    return { unavailable: true };
  }
};

module.exports = { verifyLoginFace };
