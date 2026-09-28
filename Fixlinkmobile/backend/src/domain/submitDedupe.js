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

const buildSubmitFingerprint = ({ customerUid, applianceType, description }) =>
  `${customerUid}|${String(applianceType || '').toLowerCase().trim()}|${String(description || '').toLowerCase().trim()}`;

const createSubmitDedupeStore = ({ windowMs = SUBMIT_DEDUPE_MS } = {}) => {
  const recentSubmits = new Map();

  // Sweep expired fingerprints, then report whether this one was seen inside
  // the window. Mirrors the original sweep-then-lookup order exactly.
  const isDuplicate = (fingerprint) => {
    const now = Date.now();
    for (const [key, timestamp] of recentSubmits) {
      if (now - timestamp > windowMs) recentSubmits.delete(key);
    }
    return Boolean(recentSubmits.get(fingerprint));
  };

  const remember = (fingerprint) => recentSubmits.set(fingerprint, Date.now());

  return { isDuplicate, remember, recentSubmits, windowMs };
};

const submitDedupe = createSubmitDedupeStore();

module.exports = { SUBMIT_DEDUPE_MS, buildSubmitFingerprint, createSubmitDedupeStore, submitDedupe };
