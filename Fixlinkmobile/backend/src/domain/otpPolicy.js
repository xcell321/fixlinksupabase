// Completion-OTP verification policy.
//
// A 4-digit code has only 9,000 combinations, so verification is protected by
// two independent caps:
//   1. a strict rate limiter (see middleware/requestLimits.js), and
//   2. the per-(job, technician) lockout implemented here.
//
// The guard is a factory so tests can build an isolated instance with its own
// state, while the app uses the shared singleton at the bottom of this file
// (same process-local lifetime as the Map that used to live inside the router).

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

const attemptKey = (jobId, uid) => `${jobId}:${uid}`;

const createOtpGuard = ({ maxAttempts = OTP_MAX_ATTEMPTS, lockoutMs = OTP_LOCKOUT_MS } = {}) => {
  // key: "<jobId>:<uid>" -> { fails, lockedUntil }
  const attempts = new Map();

  // Express middleware: reject while the caller is locked out for this job.
  const gate = (req, res, next) => {
    const key = attemptKey(req.params.id, req.authUser?.uid || req.ip);
    const entry = attempts.get(key);
    if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
      const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Too many incorrect codes. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      });
    }
    return next();
  };

  const recordFail = (jobId, uid) => {
    const key = attemptKey(jobId, uid);
    const entry = attempts.get(key) || { fails: 0, lockedUntil: 0 };
    entry.fails += 1;
    if (entry.fails >= maxAttempts) {
      entry.lockedUntil = Date.now() + lockoutMs;
      entry.fails = 0; // counter resets; the lock itself is the penalty
    }
    attempts.set(key, entry);
  };

  const remainingAttempts = (jobId, uid) =>
    maxAttempts - (attempts.get(attemptKey(jobId, uid))?.fails ?? 0);

  const recordSuccess = (jobId, uid) => {
    attempts.delete(attemptKey(jobId, uid));
    // Opportunistic sweep so the map cannot grow unbounded.
    if (attempts.size > 500) {
      const now = Date.now();
      for (const [key, value] of attempts) {
        if (value.lockedUntil && value.lockedUntil <= now) attempts.delete(key);
      }
    }
  };

  return { gate, recordFail, recordSuccess, remainingAttempts, attempts, maxAttempts };
};

// Shared instance used by the API.
const otpGuard = createOtpGuard();

module.exports = { createOtpGuard, otpGuard, OTP_MAX_ATTEMPTS, OTP_LOCKOUT_MS };
