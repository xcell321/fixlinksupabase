const express = require('express');
const router = express.Router();
const { supabase, supabaseAuth, verifyAccessToken } = require('../config/supabase');

// POST /api/auth/register
// Creates a Supabase Auth user and a matching users profile row.
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name, and role are required.' });
    }

    const { data, error: signUpError } = await supabaseAuth.auth.signUp({ email, password });
    if (signUpError) throw signUpError;

    const uid = data.user && data.user.id;
    if (!uid) return res.status(500).json({ error: 'Unable to create account.' });

    const { error: profileError } = await supabase.from('users').insert({
      id: uid,
      name,
      email,
      role,
      status: role === 'technician' ? 'pending_verification' : 'active',
      verification_status: role === 'technician' ? 'unverified' : 'verified',
      created_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;

    res.status(201).json({ uid, message: 'User registered successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-token
// Verifies a Supabase access token (JWT signed with ES256) via the project's JWKS.
router.post('/verify-token', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required.' });

    const decoded = await verifyAccessToken(idToken);
    res.json({ uid: decoded.sub, email: decoded.email });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;