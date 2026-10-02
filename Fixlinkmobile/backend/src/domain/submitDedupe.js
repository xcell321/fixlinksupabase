// In-memory duplicate-submit ledger.
//
// Kills duplicate-submit write amplification (double-tapped buttons, flaky
// mobile networks retrying) without any extra database read. Keyed by
// customer + device + description fingerprint.
//
// A factory is exported so tests can build an isolated store; the app uses the
// singleton at the bottom with the same process-local lifetime as the Map that
// used to live inside the router.

const SUBMIT_DEDUPE_MS = 60000;

// UAT #5: the cooldown is env-driven so operators can tune how quickly the same
// request may be re-submitted. Reads SUBMIT_COOLDOWN_SECONDS per call.
const DEFAULT_COOLDOWN_SECONDS = 60;
const submitCooldownMs = () => {
  const parsed = Number.parseInt(process.env.SUBMIT_COOLDOWN_SECONDS, 10);
  const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COOLDOWN_SECONDS;
  return seconds * 1000;
};

const buildSubmitFingerprint = ({ customerUid, applianceType, description }) =>
  `${customerUid}|${String(applianceType || '').toLowerCase().trim()}|${String(description || '').toLowerCase().trim()}`;

// `windowMs` may be a number or a function resolved per call (used by the
// singleton so the cooldown stays env-driven at runtime).
const createSubmitDedupeStore = ({ windowMs = SUBMIT_DEDUPE_MS } = {}) => {
  const recentSubmits = new Map();
  const resolveWindow = () => (typeof windowMs === 'function' ? windowMs() : windowMs);

  // Sweep expired fingerprints, then report whether this one was seen inside
  // the window. Mirrors the original sweep-then-lookup order exactly.
  const isDuplicate = (fingerprint) => {
    const now = Date.now();
    const window = resolveWindow();
    for (const [key, timestamp] of recentSubmits) {
      if (now - timestamp > window) recentSubmits.delete(key);
    }
    return Boolean(recentSubmits.get(fingerprint));
  };

  const remember = (fingerprint) => recentSubmits.set(fingerprint, Date.now());

  return { isDuplicate, remember, recentSubmits, windowMs };
};

const submitDedupe = createSubmitDedupeStore({ windowMs: submitCooldownMs });

module.exports = { SUBMIT_DEDUPE_MS, submitCooldownMs, buildSubmitFingerprint, createSubmitDedupeStore, submitDedupe };
