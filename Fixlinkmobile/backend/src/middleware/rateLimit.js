const defaultKeyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

function createRateLimiter({
  windowMs = 60000,
  max = 60,
  keyGenerator = defaultKeyGenerator,
  message = 'Too many requests, please try again later.',
} = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 300000)).unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

const ipUidKeyGenerator = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const uid = req.query?.uid || '';
  return uid ? `${ip}:${uid}` : ip;
};

module.exports = { createRateLimiter, ipUidKeyGenerator };