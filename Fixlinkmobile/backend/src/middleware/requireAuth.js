const { verifyAccessToken } = require('../config/supabase');

const requireAuth = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });

  try {
    const payload = await verifyAccessToken(token);
    req.authUser = { uid: payload.sub, email: payload.email || null };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.authUser || !roles.includes(req.authUser.role)) {
    return res.status(403).json({ error: 'You do not have permission for this action.' });
  }
  next();
};

module.exports = { requireAuth, requireRole };