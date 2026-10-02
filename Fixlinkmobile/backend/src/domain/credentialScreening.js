// Credential screening policy (UAT #9) and facial-verification policy (#10).
//
// This module is the single source of truth for every tunable: thresholds,
// weights, file limits and the flag vocabulary. Nothing is hardcoded — all of
// it is read from the environment per call, with fallbacks only so a local run
// with an empty .env keeps working.
//
// The screening is advisory. It never blocks registration or auto-rejects an
// applicant; it only attaches a risk score, a level and a list of flags that an
// admin reviews.

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

// --- Flag vocabulary -------------------------------------------------------
const FLAGS = {
  NO_CAMERA_METADATA: 'no_camera_metadata',
  AI_TOOL_MARKER: 'ai_tool_marker',
  EDITOR_MARKER: 'editor_marker',
  LOW_RESOLUTION: 'low_resolution',
  TINY_FILE: 'tiny_file',
  DOCUMENT_UNREADABLE: 'document_unreadable',
  AI_GENERATED: 'ai_generated',
  TAMPERED: 'tampered',
  ID_NUMBER_MISMATCH: 'id_number_mismatch',
  ID_NUMBER_NOT_FOUND: 'id_number_not_found',
  NAME_MISMATCH: 'name_mismatch',
  SELFIE_MISSING: 'selfie_missing',
  FACE_NOT_DETECTED: 'face_not_detected',
  ID_PHOTO_NOT_FOUND: 'id_photo_not_found',
  FACE_MISMATCH: 'face_mismatch',
  SELFIE_LIVENESS_RISK: 'selfie_liveness_risk',
};

// --- Levels ---------------------------------------------------------------
const LEVELS = {
  UNVERIFIED: 'unverified',
  LOW: 'low',
  FLAGGED: 'flagged',
  HIGH: 'high',
};

const config = () => ({
  enabled: asBool(process.env.CREDENTIAL_SCREENING_ENABLED, true),
  aiVisionEnabled: asBool(process.env.CREDENTIAL_AI_VISION_ENABLED, true),
  flagThreshold: asInt(process.env.CREDENTIAL_FLAG_THRESHOLD, 60),
  highThreshold: asInt(process.env.CREDENTIAL_HIGH_THRESHOLD, 80),
  minDimension: asInt(process.env.CREDENTIAL_MIN_DIMENSION, 300),
  minFileBytes: asInt(process.env.CREDENTIAL_MIN_FILE_BYTES, 20480),
  forensicWeight: asFloat(process.env.CREDENTIAL_FORENSIC_WEIGHT, 0.4),
  visionWeight: asFloat(process.env.CREDENTIAL_VISION_WEIGHT, 0.6),
  visionAiThreshold: asFloat(process.env.CREDENTIAL_VISION_AI_THRESHOLD, 0.6),
  visionTamperThreshold: asFloat(process.env.CREDENTIAL_VISION_TAMPER_THRESHOLD, 0.6),
  visionMaxBytes: asInt(process.env.CREDENTIAL_VISION_MAX_BYTES, 2097152),
  visionTimeoutMs: asInt(process.env.CREDENTIAL_VISION_TIMEOUT_MS, 20000),
});

// --- Facial verification (#10) -------------------------------------------
const faceConfig = () => ({
  enabled: asBool(process.env.CREDENTIAL_FACE_CHECK_ENABLED, true),
  selfieRequired: asBool(process.env.CREDENTIAL_SELFIE_REQUIRED, true),
  matchThreshold: asFloat(process.env.CREDENTIAL_FACE_MATCH_THRESHOLD, 0.5),
  livenessThreshold: asFloat(process.env.CREDENTIAL_LIVENESS_RISK_THRESHOLD, 0.6),
});

const isScreeningEnabled = () => config().enabled;
const isVisionEnabled = () => config().aiVisionEnabled;
const isFaceCheckEnabled = () => config().enabled && faceConfig().enabled;

// --- Scoring --------------------------------------------------------------
// Merge the two passes into one 0-100 risk. A missing pass (e.g. the AI
// gateway is unreachable) does not zero the score: the other pass stands alone
// so an offline gateway can never manufacture a false accusation.
const mergeRisk = ({ forensicScore, visionScore }) => {
  const { forensicWeight, visionWeight } = config();
  const hasForensic = Number.isFinite(forensicScore);
  const hasVision = Number.isFinite(visionScore);
  if (!hasForensic && !hasVision) return null;
  if (hasForensic && !hasVision) return Math.round(forensicScore);
  if (!hasForensic && hasVision) return Math.round(visionScore);
  const total = forensicWeight + visionWeight || 1;
  return Math.round((forensicScore * forensicWeight + visionScore * visionWeight) / total);
};

const levelForScore = (score) => {
  if (!Number.isFinite(score)) return LEVELS.UNVERIFIED;
  const { flagThreshold, highThreshold } = config();
  if (score >= highThreshold) return LEVELS.HIGH;
  if (score >= flagThreshold) return LEVELS.FLAGGED;
  return LEVELS.LOW;
};

const isFlagged = (score) => Number.isFinite(score) && score >= config().flagThreshold;

// --- Identity matching ----------------------------------------------------
// Tolerant name comparison: "JUAN D. CRUZ" and "juan cruz" are the same person.
const normalizeName = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const namesMatch = (a, b) => {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left.length === 0 || right.length === 0) return false;
  const [smaller, larger] = left.length <= right.length ? [left, right] : [right, left];
  // Every token of the shorter name must appear in the longer one.
  return smaller.every((token) => larger.includes(token));
};

const normalizeIdNumber = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

const idNumbersMatch = (a, b) => {
  const left = normalizeIdNumber(a);
  const right = normalizeIdNumber(b);
  return Boolean(left) && Boolean(right) && left === right;
};

// --- Face verdict ---------------------------------------------------------
// Turns the AI face fields into flags + a level. Advisory only.
const judgeFace = ({ screening, declaredId, selfieProvided }) => {
  const flags = [];
  if (!isFaceCheckEnabled()) return { flags, level: LEVELS.UNVERIFIED };
  if (!selfieProvided) flags.push(FLAGS.SELFIE_MISSING);

  const vision = screening?.vision;
  if (!vision) return { flags, level: LEVELS.UNVERIFIED };

  const { matchThreshold, livenessThreshold } = faceConfig();
  if (vision.facePresent === false || vision.selfieFacePresent === false) flags.push(FLAGS.FACE_NOT_DETECTED);
  if (vision.idFacePresent === false) flags.push(FLAGS.ID_PHOTO_NOT_FOUND);
  if (Number(vision.livenessRisk) >= livenessThreshold) flags.push(FLAGS.SELFIE_LIVENESS_RISK);
  const confidence = Number(vision.matchConfidence);
  if (Number.isFinite(confidence) && confidence < matchThreshold
    && !flags.includes(FLAGS.FACE_NOT_DETECTED) && !flags.includes(FLAGS.ID_PHOTO_NOT_FOUND)) {
    flags.push(FLAGS.FACE_MISMATCH);
  }

  let level = LEVELS.LOW;
  if (flags.length > 0) level = LEVELS.FLAGGED;
  if (flags.includes(FLAGS.FACE_MISMATCH) || flags.includes(FLAGS.SELFIE_LIVENESS_RISK)) level = LEVELS.HIGH;
  return { flags, level };
};

module.exports = {
  FLAGS,
  LEVELS,
  config,
  faceConfig,
  isScreeningEnabled,
  isVisionEnabled,
  isFaceCheckEnabled,
  mergeRisk,
  levelForScore,
  isFlagged,
  normalizeName,
  namesMatch,
  normalizeIdNumber,
  idNumbersMatch,
  judgeFace,
};
