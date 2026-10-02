// Admin moderation: request reassignment, review removal (with rating sync),
// report resolution (with UAT #8 repeat-scammer auto-suspend).
const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');
const { scamStrikeThreshold, shouldAutoSuspend } = require('../../domain/scamPolicy');

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
    let finalStatus = ['active', 'suspended', 'banned'].includes(userStatus) ? userStatus : null;
    // UAT #8: three upheld reports against the same user auto-suspend, even
    // when the admin only warned. A ban decision is never downgraded.
    let targetUid = userUid || null;
    if (!targetUid) {
      try {
        const { data: report } = await supabase
          .from('reports')
          .select('reported_user_uid')
          .eq('id', req.params.id)
          .maybeSingle();
        targetUid = report?.reported_user_uid || null;
      } catch (lookupError) {
        console.warn('Could not load reported user:', lookupError.message);
      }
    }
    if (targetUid && finalStatus !== 'banned') {
      try {
        const { data: strikes, error: strikeError } = await supabase
          .from('reports')
          .select('id')
          .eq('reported_user_uid', targetUid)
          .eq('status', 'resolved');
        if (!strikeError && shouldAutoSuspend((strikes || []).length)) {
          finalStatus = 'suspended';
        }
      } catch (strikeError) {
        console.warn('Could not count scam strikes:', strikeError.message);
      }
    }
    if (targetUid && finalStatus) {
      await supabase.from('users').update({ status: finalStatus }).eq('id', targetUid);
    }
    res.json({ message: 'Report resolved', strikes: scamStrikeThreshold() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
