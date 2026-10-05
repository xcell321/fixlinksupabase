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
const { loginFaceMatchThreshold, loginFaceLiteThreshold } = require('../../domain/loginFacePolicy');

const VISION_SYSTEM = `You are a strict face-match examiner for FixLink sign-in security. A wrong approval lets a stranger into someone else's account, so a false match is far worse than a cautious low score.
You receive two portrait photos. The first image is the stored reference face from signup. The second image is the live sign-in selfie.
Compare identity feature by feature: face shape, eyes, eyebrows, nose, lips, moles and marks, ears, and skin tone. Age bracket, gender presentation, and ethnicity prove nothing on their own and must never raise the score by themselves.
If you find even one decisive structural difference, cap matchConfidence at 0.4 no matter how similar the overall impression feels.
Still images of screens, prints, or photos-of-photos are spoof attempts: set livenessRisk 0.8 or higher and matchConfidence 0.2 or lower.
Return STRICT JSON only: output exactly the JSON object, no markdown fences, no prose before or after it.`;

const VISION_INSTRUCTION = `Return a JSON object with exactly these keys:
{
  "facePresent": boolean (a human face is visible in the reference photo),
  "selfieFacePresent": boolean (a live human face is visible in the sign-in selfie),
  "idFacePresent": boolean (the reference photo contains a face),
  "faceCovered": boolean (the selfie face is covered by a mask, sunglasses, hands, or cloth),
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

// Blocking verdicts with a machine-readable reason so the sign-in gate can
// tell the user exactly what went wrong: nobody in frame (NO_FACE), a
// covered face (COVERED), a screen or print replay (SPOOF), or simply the
// wrong person (MISMATCH). Order matters: absence and covering are checked
// before identity, because a covered or missing face must never read as a
// plain mismatch.
const REASONS = {
  NO_FACE: 'NO_FACE',
  COVERED: 'COVERED',
  SPOOF: 'SPOOF',
  MISMATCH: 'MISMATCH',
};

const judgeSelfie = (vision, threshold) => {
  if (!vision || typeof vision !== 'object') return { ok: false, reason: REASONS.MISMATCH };
  const flags = judgeFace({ screening: { vision }, selfieProvided: true }).flags || [];
  if (flags.includes(FLAGS.FACE_NOT_DETECTED)) return { ok: false, reason: REASONS.NO_FACE };
  if (flags.includes(FLAGS.FACE_COVERED)) return { ok: false, reason: REASONS.COVERED };
  if (flags.includes(FLAGS.SELFIE_LIVENESS_RISK)) return { ok: false, reason: REASONS.SPOOF };
  if (flags.includes(FLAGS.FACE_MISMATCH)) return { ok: false, reason: REASONS.MISMATCH };
  if (flags.includes(FLAGS.ID_PHOTO_NOT_FOUND)) return { ok: false, reason: REASONS.MISMATCH };
  if (flags.includes(FLAGS.SELFIE_MISSING)) return { ok: false, reason: REASONS.MISMATCH };
  if (Number(vision.matchConfidence) < threshold) return { ok: false, reason: REASONS.MISMATCH };
  return { ok: true, reason: null };
};

const verifyLoginFace = async ({ referenceUrl, selfieFile }) => {
  if (!isVisionConfigured()) return { unavailable: true, reason: 'NO_VISION' };
  try {
    const { visionMaxBytes } = config();
    let referenceBuffer = null;
    try {
      referenceBuffer = await downloadReference(referenceUrl);
    } catch {
      return { unavailable: true, reason: 'REF_FETCH_FAIL' };
    }
    const reference = toImage(referenceBuffer, 'image/jpeg', visionMaxBytes);
    const selfie = toImage(selfieFile?.buffer, selfieFile?.mimetype, visionMaxBytes);
    if (!reference || !selfie) return { unavailable: true, reason: 'IMAGE_TOO_LARGE' };
    const { parsed, model } = await visionComplete({
      system: VISION_SYSTEM,
      user: VISION_INSTRUCTION,
      images: [reference, selfie],
      // The capable judge is slow: give it a full minute so the verdict comes
      // from the strongest model instead of timing out into the fallback.
      timeoutMs: 60000,
    });
    const threshold = /lite/i.test(String(model || ''))
      ? loginFaceLiteThreshold()
      : loginFaceMatchThreshold();
    const { ok, reason } = judgeSelfie(parsed, threshold);
    return {
      unavailable: false,
      match: ok,
      reason,
      matchConfidence: Number(parsed?.matchConfidence) || 0,
      livenessThreshold: faceConfig().livenessThreshold,
      model: model || null,
    };
  } catch (error) {
    console.warn('Login face check skipped:', error.message);
    return { unavailable: true, reason: 'GATEWAY_ERROR' };
  }
};

module.exports = { verifyLoginFace, FACE_GATE_REASONS: REASONS };
