const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { serializeUser } = require('../domain/userSerializer');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { sendTechnicianApprovedEmail } = require('../services/emailService');

// Every /api/admin endpoint is privileged: require a valid Supabase session
// (requireAuth) and an account whose role is 'admin' (requireAdmin).
router.use(requireAuth, requireAdmin);

// GET: Fetch all users (so admin can view customers and technicians)
router.get('/users', async (req, res) => {
  try {
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    res.status(200).json((data || []).map(serializeUser));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT: Verify or update technician status (e.g., 'active', 'deactivated')
router.put('/verify-technician/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const { status, rejectionReason } = req.body; // e.g., 'active' or 'suspended'

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id, role, status, email, name')
      .eq('id', uid)
      .maybeSingle();
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {
      status,
      ...(status === 'active' ? { verification_status: 'verified', rejection_reason: null } : {}),
      ...(status === 'rejected' ? { verification_status: 'rejected', rejection_reason: rejectionReason || 'Application was not approved.' } : {})
    };

    await supabase.from('users').update(updates).eq('id', uid);

    // Approval is the moment the applicant becomes a registered technician, so
    // it is the moment they get the welcome email. Only the transition into
    // 'active' sends it, so re-saving the same status cannot email them twice.
    const justApproved = status === 'active'
      && existing.role === 'technician'
      && String(existing.status || '').toLowerCase() !== 'active';
    let emailSent = false;
    if (justApproved && existing.email) {
      try {
        await sendTechnicianApprovedEmail(existing.email, existing.name);
        emailSent = true;
      } catch (emailError) {
        // The status change is what matters and is already saved; report the
        // failure instead of rolling it back or failing the admin action.
        console.error('Technician approval email failed:', emailError.message);
      }
    }

    res.status(200).json({
      message: `Technician status successfully updated to ${status}`,
      uid,
      emailSent,
      ...(justApproved && !emailSent
        ? { emailWarning: 'Status saved, but the approval email could not be delivered.' }
        : {})
    });
  } catch (error) {
    console.error('Error updating technician status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;