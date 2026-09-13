const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET: Fetch all pending technicians for the admin panel
router.get('/pending-technicians', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, status')
      .eq('role', 'technician')
      .eq('status', 'pending_verification')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json((data || []).map(user => ({
      uid: user.id,
      name: user.name || 'N/A',
      email: user.email || 'N/A',
      status: user.status
    })));
  } catch (error) {
    console.error('Error fetching pending technicians:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;