const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET: Fetch all pending technicians for the admin panel
router.get('/pending-technicians', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, status, verification_status, role')
      .eq('role', 'technician')
      .eq('status', 'pending_verification');
    if (error) throw error;
    const pendingTechs = (data || []).map((u) => ({
      uid: u.id,
      name: u.name || 'N/A',
      email: u.email || 'N/A',
      status: u.status || u.verification_status || 'pending_verification',
    }));
    res.status(200).json(pendingTechs);
  } catch (error) {
    console.error('Error fetching pending technicians:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
