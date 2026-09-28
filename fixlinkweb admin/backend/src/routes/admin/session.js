// Admin session routes: login/logout/session. Unguarded by design — the
// requireAdmin gate is applied in routes/admin.js AFTER this router mounts.
const express = require('express');
const crypto = require('crypto');

const router = express.Router();
const { sessions, safeEqual, cookieValue } = require('../../middleware/requireAdmin');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!safeEqual(username, process.env.ADMIN_USERNAME) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid admin username or password' });
  }
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, { username, createdAt: Date.now() });
  res.setHeader('Set-Cookie', `fixlink_admin_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ message: 'Admin login successful' });
});

router.post('/logout', (req, res) => {
  const sessionId = cookieValue(req, 'fixlink_admin_session');
  if (sessionId) sessions.delete(sessionId);
  res.setHeader('Set-Cookie', 'fixlink_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ message: 'Logged out' });
});

router.get('/session', (req, res) => {
  const sessionId = cookieValue(req, 'fixlink_admin_session');
  res.json({ authenticated: Boolean(sessionId && sessions.has(sessionId)) });
});

module.exports = router;
