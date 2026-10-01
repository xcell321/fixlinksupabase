// Admin incidents: service-incident list (with live user/job enrichment),
// status transitions, customer no-show counter reset.
const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');
const { listUsers } = require('../../services/adminUserService');
const { listJobs } = require('../../services/adminAnalyticsService');
const { serializeIncident } = require('../../utils/serialize');

const TYPES = ['no_show', 'cancellation'];
const STATUSES = ['logged', 'warning', 'flagged', 'reviewed', 'resolved'];

router.get('/incidents', async (req, res) => {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const stage = String(req.query.stage || 'all').toLowerCase();
    const { data, error } = await supabase
      .from('service_incidents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    let rows = data || [];
    if (TYPES.includes(type)) rows = rows.filter((r) => String(r.type).toLowerCase() === type);
    if (stage !== 'all') rows = rows.filter((r) => String(r.stage).toLowerCase() === stage);
    const [users, jobs] = await Promise.all([
      listUsers().catch(() => []),
      listJobs().catch(() => []),
    ]);
    const names = {};
    users.forEach((u) => { names[u.uid] = u.name || u.email || 'Unknown user'; });
    const jobById = {};
    jobs.forEach((j) => { jobById[j.id] = j; });
    res.json(
      rows.map((r) => {
        const job = jobById[r.job_id] || {};
        return serializeIncident({
          ...r,
          customer_name: names[r.customer_uid] || null,
          technician_name: names[r.technician_uid] || null,
          appliance_type: job.appliance_type || job.category || null,
          location: job.location || null,
        });
      })
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/incidents/:id/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid incident status' });
    const updates = { status };
    if (status === 'resolved') updates.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('service_incidents').update(updates).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Incident status updated', status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/customers/:uid/reset-no-show', async (req, res) => {
  try {
    const { error } = await supabase.from('users').update({ no_show_count: 0 }).eq('id', req.params.uid);
    if (error) throw error;
    res.json({ message: 'No-show counter reset' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
