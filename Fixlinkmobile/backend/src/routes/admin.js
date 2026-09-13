const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { serializeUser } = require('../utils/serialize');

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

    const { data: existing } = await supabase.from('users').select('id').eq('id', uid).maybeSingle();
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {
      status,
      ...(status === 'active' ? { verification_status: 'verified', rejection_reason: null } : {}),
      ...(status === 'rejected' ? { verification_status: 'rejected', rejection_reason: rejectionReason || 'Application was not approved.' } : {})
    };

    await supabase.from('users').update(updates).eq('id', uid);

    res.status(200).json({
      message: `Technician status successfully updated to ${status}`,
      uid
    });
  } catch (error) {
    console.error('Error updating technician status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;