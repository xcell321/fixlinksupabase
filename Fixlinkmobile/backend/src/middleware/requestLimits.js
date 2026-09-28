const { createRateLimiter } = require('./rateLimit');

// Rate limits that apply to the /api/requests router. All three run AFTER
// requireAuth, so the key can be the authenticated uid instead of the shared
// IP. That matters on a shared WiFi where many phones look like one client.

// Budget sized for normal app usage: listing jobs, polling progress, sending
// messages. 300/min per user is comfortably above real use.
const perUserLimiter = createRateLimiter({
  windowMs: 60000,
  max: 300,
  keyGenerator: (req) => (req.authUser ? `user:${req.authUser.uid}` : req.ip),
  message: 'Too many requests, please try again later.',
});

// Chat unread polling is the noisiest endpoint, so it gets its own tighter cap.
const unreadLimiter = createRateLimiter({
  windowMs: 60000,
  max: 20,
  keyGenerator: (req) => (req.authUser ? `user:${req.authUser.uid}` : req.ip),
  message: 'Too many chat refresh requests, please try again later.',
});

// Strict per-technician cap on completion-code attempts (10/min). The per-job
// lockout in domain/otpPolicy.js is the second, independent layer.
const otpVerifyLimiter = createRateLimiter({
  windowMs: 60000,
  max: 10,
  keyGenerator: (req) => (req.authUser ? `otp:${req.authUser.uid}` : req.ip),
  message: 'Too many code attempts. Please wait a minute and try again.',
});

module.exports = { perUserLimiter, unreadLimiter, otpVerifyLimiter };
