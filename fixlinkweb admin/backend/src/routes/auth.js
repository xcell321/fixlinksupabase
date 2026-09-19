const express = require('express');
const router = express.Router();
const { supabase, supabaseAuth, verifyAccessToken } = require('../config/supabase');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name, and role are required.' });
    }
    const sanitizedEmail = String(email).trim().toLowerCase();
    const { data, error } = await supabase.auth.admin.createUser({
      email: sanitizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { displayName: name },
    });
    if (error) return res.status(500).json({ error: error.message });
    const uid = data.user.id;
    const userRow = {
      id: uid,
      name: String(name).trim(),
      email: sanitizedEmail,
      role: String(role).trim(),
      status: role === 'technician' ? 'pending_verification' : 'active',
      verification_status: role === 'technician' ? 'pending' : 'verified',
      created_at: new Date().toISOString(),
    };
    const { error: insertError } = await supabase.from('users').insert(userRow);
    if (insertError) {
      await supabase.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(500).json({ error: insertError.message });
    }
    res.status(201).json({ uid, message: 'User registered successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-token — verifies Supabase access_token (ES256)
router.post('/verify-token', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required.' });
    const payload = await verifyAccessToken(idToken);
    res.json({ uid: payload.sub, email: payload.email });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
