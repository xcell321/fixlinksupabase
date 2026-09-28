// Admin moderation: request reassignment, review removal (with rating sync),
// report resolution.
const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');

router.patch('/requests/:id/reassign', async (req, res) => {
  try {
    const { technicianUid, technicianName } = req.body;
    if (!technicianUid) return res.status(400).json({ error: 'technicianUid is required' });
    const { data, error } = await supabase.from('jobs').select('id').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Repair request not found' });
    const { error: upd } = await supabase
      .from('jobs')
      .update({ technician_uid: technicianUid, technician_name: technicianName || 'Assigned technician', status: 'Accepted' })
      .eq('id', req.params.id);
    if (upd) throw upd;
    res.json({ message: 'Repair request reassigned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    const { data: target } = await supabase.from('reviews').select('technician_uid').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('reviews').delete().eq('id', req.params.id);
    if (error) throw error;
    if (target?.technician_uid) {
      try {
        await supabase.rpc('recompute_technician_rating', { p_technician_uid: target.technician_uid });
      } catch (recomputeError) {
        console.warn('Could not sync technician rating after review deletion:', recomputeError.message);
      }
    }
    res.json({ message: 'Review removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/reports/:id/resolve', async (req, res) => {
  try {
    const { action = 'reviewed', userUid, userStatus } = req.body;
    const { error } = await supabase.from('reports').update({ status: 'resolved', resolution: action }).eq('id', req.params.id);
    if (error) throw error;
    if (userUid && ['active', 'suspended', 'banned'].includes(userStatus)) {
      await supabase.from('users').update({ status: userStatus }).eq('id', userUid);
    }
    res.json({ message: 'Report resolved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
