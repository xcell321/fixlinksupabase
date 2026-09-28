// Admin catalog: generic section reads plus category/announcement writes.
// NOTE: GET /:section stays mounted AFTER /overview + /analytics (see
// routes/admin.js barrel) so it cannot shadow those specific GET routes.
const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');
const { listJobs } = require('../../services/adminAnalyticsService');

router.get('/:section', async (req, res) => {
  try {
    const map = { requests: 'jobs', reports: 'reports', reviews: 'reviews', categories: 'categories', announcements: 'announcements' };
    const table = map[req.params.section];
    if (!table) return res.status(404).json({ error: 'Unknown admin section' });
    if (req.params.section === 'requests') {
      const jobs = await listJobs();
      return res.json(jobs);
    }
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:section', async (req, res) => {
  try {
    if (!['categories', 'announcements'].includes(req.params.section)) {
      return res.status(404).json({ error: 'This section does not support creation' });
    }
    const table = req.params.section;
    const record = { ...req.body };
    if (table === 'categories') {
      record.name = String(req.body.name || '').trim();
      record.devices = Array.isArray(req.body.devices) ? req.body.devices.map((d) => String(d).trim()).filter(Boolean) : [];
    }
    const { data, error } = await supabase.from(table).insert(record).select().maybeSingle();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/categories/:id', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const updates = { name };
    if (Array.isArray(req.body.devices)) updates.devices = req.body.devices.map((d) => String(d).trim()).filter(Boolean);
    const { error } = await supabase.from('categories').update(updates).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Category updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Category removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
