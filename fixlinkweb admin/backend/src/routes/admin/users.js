// Admin user management: list/search, status, delete, password reset.
// Thin routes over services/adminUserService.js + services/mailerService.js.
const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');
const { listUsers } = require('../../services/adminUserService');
const { sendAdminPasswordReset } = require('../../services/mailerService');

router.get('/users', async (req, res) => {
  try {
    let users = await listUsers();
    const search = String(req.query.search || '').toLowerCase();
    const role = String(req.query.role || 'all').toLowerCase();
    const status = String(req.query.status || 'all').toLowerCase();
    users = users.filter((user) => {
      const matchesSearch = !search || `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(search);
      const matchesRole = role === 'all' || String(user.role).toLowerCase() === role;
      const matchesStatus = status === 'all' || String(user.status).toLowerCase() === status;
      return matchesSearch && matchesRole && matchesStatus;
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/users/:uid/status', async (req, res) => {
  try {
    const allowed = ['active', 'inactive', 'suspended', 'banned'];
    const { status } = req.body;
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid account status' });
    const { error } = await supabase.from('users').update({ status, verification_status: status === 'active' ? 'verified' : status }).eq('id', req.params.uid);
    if (error) throw error;
    try {
      await supabase.auth.admin.updateUserById(req.params.uid, { ban_duration: status !== 'active' ? '876000h' : 'none' });
    } catch (e) {
      console.warn('Auth status sync skipped:', e.message);
    }
    res.json({ message: 'Account status updated', status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:uid', async (req, res) => {
  try {
    await supabase.from('users').delete().eq('id', req.params.uid);
    try {
      await supabase.auth.admin.deleteUser(req.params.uid);
    } catch (e) {
      console.warn('Auth deletion skipped:', e.message);
    }
    res.json({ message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:uid/password-reset', async (req, res) => {
  try {
    res.json(await sendAdminPasswordReset(req.params.uid));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
