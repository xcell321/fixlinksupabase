// Admin authorization guard for the mobile backend.
//
// This must run AFTER requireAuth, which verifies the Supabase access token and
// populates req.authUser.uid. It does not authenticate anyone itself; it only
// decides whether the already-authenticated account is allowed into /api/admin.
//
// The application role ("customer" | "technician" | "admin") lives in the
// users table rather than in the token, so it is resolved from the database and
// then handed to the existing requireRole checker. Reusing requireRole keeps
// the 403 response identical to every other role-gated route in the codebase.

const { supabase } = require('../config/supabase');
const { requireRole } = require('./requireAuth');

const requireAdmin = async (req, res, next) => {
  try {
    const uid = req.authUser && req.authUser.uid;
    if (!uid) return res.status(401).json({ error: 'Authentication is required.' });

    const { data: user } = await supabase.from('users').select('role').eq('id', uid).maybeSingle();
    req.authUser.role = user ? user.role : null;

    return requireRole('admin')(req, res, next);
  } catch (error) {
    console.error('Error verifying administrator access:', error);
    return res.status(500).json({ error: 'Unable to verify administrator access.' });
  }
};

module.exports = { requireAdmin };
