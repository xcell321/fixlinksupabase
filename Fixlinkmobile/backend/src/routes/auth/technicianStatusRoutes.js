// POST /api/auth/technician-status — public lookup behind the "Check Status"
// action on the pending-verification screen.
//
// A technician who just applied cannot log in yet, so login cannot be used to
// find out whether the admin approved the application. This endpoint answers
// that question for a technician email only.
//
// Privacy: an unknown or non-technician email returns the same `{ status:
// 'none' }` shape, so the endpoint cannot be used to discover which addresses
// have accounts. Responses are also rate limited per IP.

const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');
const { createRateLimiter } = require('../../middleware/rateLimit');

const statusLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many status checks. Please try again in a few minutes.',
});

// Only these account states are ever disclosed.
const PUBLIC_STATUSES = ['active', 'pending_verification', 'rejected'];
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

router.post('/technician-status', statusLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const { data } = await supabase
      .from('users')
      .select('role, status, rejection_reason, name')
      .eq('email', email)
      .maybeSingle();

    if (!data || String(data.role || '').toLowerCase() !== 'technician') {
      return res.status(200).json({ status: 'none' });
    }

    const status = String(data.status || '').toLowerCase();
    if (!PUBLIC_STATUSES.includes(status)) {
      return res.status(200).json({ status: 'none' });
    }

    res.status(200).json({
      status,
      name: data.name || null,
      ...(status === 'rejected'
        ? { rejectionReason: data.rejection_reason || 'Application was not approved.' }
        : {}),
    });
  } catch (error) {
    console.error('Error checking technician status:', error.message);
    res.status(500).json({ error: 'Unable to check the application status right now.' });
  }
});

module.exports = router;
