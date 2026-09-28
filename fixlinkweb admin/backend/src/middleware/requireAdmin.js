// Admin session middleware: cookie sessions + timing-safe credential compare.
// Extracted from routes/admin.js. Behavior is unchanged: in-memory Map,
// HttpOnly SameSite=Strict cookie, 401 when the session is missing.

const crypto = require('crypto');

const sessions = new Map();

function safeEqual(left, right) {
  const lb = Buffer.from(String(left || ''));
  const rb = Buffer.from(String(right || ''));
  return lb.length === rb.length && crypto.timingSafeEqual(lb, rb);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  const cookie = cookies.find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function requireAdmin(request, response, next) {
  const sessionId = cookieValue(request, 'fixlink_admin_session');
  if (!sessionId || !sessions.has(sessionId)) return response.status(401).json({ error: 'Admin login required' });
  request.admin = sessions.get(sessionId);
  next();
}

module.exports = { sessions, safeEqual, cookieValue, requireAdmin };
