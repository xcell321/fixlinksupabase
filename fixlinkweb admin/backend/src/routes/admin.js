const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { serializeUser, serializeJob, serializeReport, serializeReview, serializeCategory, serializeAnnouncement } = require('../utils/serialize');

const sessions = new Map();

const tableNames = {
  requests: 'jobs',
  reports: 'reports',
  reviews: 'reviews',
  categories: 'categories',
  announcements: 'announcements'
};

const status = row => row.status || (row.skills && row.skills.status) || (row.disabled ? 'inactive' : 'active');

async function listTable(name) {
  let query = supabase.from(name).select('*').order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  const cookie = cookies.find(item => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function requireAdmin(request, response, next) {
  const sessionId = cookieValue(request, 'fixlink_admin_session');
  if (!sessionId || !sessions.has(sessionId)) return response.status(401).json({ error: 'Admin login required' });
  request.admin = sessions.get(sessionId);
  next();
}

// POST: Start an admin session using credentials stored in backend/.env.
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!safeEqual(username, process.env.ADMIN_USERNAME) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid admin username or password' });
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, { username, createdAt: Date.now() });
  res.setHeader('Set-Cookie', `fixlink_admin_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ message: 'Admin login successful' });
});

// POST: End the current admin session.
router.post('/logout', (req, res) => {
  const sessionId = cookieValue(req, 'fixlink_admin_session');
  if (sessionId) sessions.delete(sessionId);
  res.setHeader('Set-Cookie', 'fixlink_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ message: 'Logged out' });
});

// GET: Check whether the browser has an active admin session.
router.get('/session', (req, res) => {
  const sessionId = cookieValue(req, 'fixlink_admin_session');
  res.json({ authenticated: Boolean(sessionId && sessions.has(sessionId)) });
});

router.use(requireAdmin);

// GET: Dashboard metrics and recent activity.
router.get('/overview', async (req, res) => {
  try {
    const [{ data: users }, jobs, reviews] = await Promise.all([
      supabase.from('users').select('*'),
      listTable(tableNames.requests),
      listTable(tableNames.reviews)
    ]);
    const safeUsers = (users || []).map(serializeUser);
    const pendingTechnicians = safeUsers.filter(user => user.role === 'technician' && user.status === 'pending_verification');
    const technicians = safeUsers.filter(user => user.role === 'technician');
    const customers = safeUsers.filter(user => user.role === 'customer');
    const completedRequests = jobs.filter(job => String(job.status).toLowerCase() === 'completed').length;
    const averageRating = reviews.length
      ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
      : 0;

    res.json({
      counts: {
        customers: customers.length,
        technicians: technicians.length,
        pendingTechnicians: pendingTechnicians.length,
        requests: jobs.length,
        completedRequests,
        activeRequests: jobs.filter(job => ['pending', 'accepted', 'in progress'].includes(String(job.status || 'pending').toLowerCase())).length,
        reviews: reviews.length,
        averageRating: Number(averageRating.toFixed(1))
      },
      requestStatuses: jobs.reduce((result, job) => {
        const jobStatus = job.status || 'Pending';
        result[jobStatus] = (result[jobStatus] || 0) + 1;
        return result;
      }, {}),
      recentUsers: safeUsers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5),
      pendingTechnicians: pendingTechnicians.slice(0, 5)
    });
  } catch (error) {
    console.error('Error loading admin overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: All user accounts for the admin directory.
router.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    let users = (data || []).map(serializeUser);
    const search = String(req.query.search || '').toLowerCase();
    const role = String(req.query.role || 'all').toLowerCase();
    const statusFilter = String(req.query.status || 'all').toLowerCase();

    users = users.filter(user => {
      const matchesSearch = !search || `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(search);
      const matchesRole = role === 'all' || String(user.role).toLowerCase() === role;
      const matchesStatus = statusFilter === 'all' || String(user.status).toLowerCase() === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });

    res.json(users);
  } catch (error) {
    console.error('Error loading admin users:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Load the complete stored profile for an admin's technician review.
router.get('/technicians/:uid', async (req, res) => {
  try {
    const { data: profile, error } = await supabase.from('users').select('*').eq('id', req.params.uid).maybeSingle();
    if (error) throw error;
    if (!profile) return res.status(404).json({ error: 'Technician profile not found' });
    if (profile.role !== 'technician') return res.status(404).json({ error: 'Technician profile not found' });

    const safeProfile = serializeUser(profile);
    res.json(safeProfile);
  } catch (error) {
    console.error('Error loading technician profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Proxy a technician credential only after the admin session is verified.
router.get('/technicians/:uid/credential/:type', async (req, res) => {
  try {
    const fieldByType = { 'government-id': 'government_id_file_url', certificate: 'certificate_file_url' };
    const field = fieldByType[req.params.type];
    if (!field) return res.status(400).json({ error: 'Invalid credential type' });

    const { data: profile, error } = await supabase.from('users').select(field).eq('id', req.params.uid).maybeSingle();
    if (error) throw error;
    const fileUrl = profile ? profile[field] : null;
    if (!fileUrl) return res.status(404).json({ error: 'Credential file not found' });

    let fetchUrl = fileUrl;
    if (fetchUrl.includes(':5000')) {
      const urlObj = new URL(fetchUrl);
      urlObj.hostname = 'localhost';
      fetchUrl = urlObj.toString();
    }

    const fileResponse = await fetch(fetchUrl, { headers: { 'x-file-access-token': process.env.FILE_ACCESS_TOKEN || 'fixlink-local-credential-access-2026' } });
    if (!fileResponse.ok) return res.status(fileResponse.status).json({ error: 'Credential file could not be loaded' });
    res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(await fileResponse.arrayBuffer()));
  } catch (error) {
    console.error('Error loading technician credential:', error);
    res.status(500).json({ error: 'Credential file could not be loaded' });
  }
});

// PATCH: Approve or reject a technician application.
router.patch('/technicians/:uid/decision', async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const statusValue = decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : null;
    if (!statusValue) return res.status(400).json({ error: 'decision must be approve or reject' });

    const updates = decision === 'approve'
      ? { status: 'active', verification_status: 'verified', rejection_reason: null, updated_at: new Date().toISOString() }
      : { status: 'rejected', verification_status: 'rejected', rejection_reason: reason || null, updated_at: new Date().toISOString() };

    const { error } = await supabase.from('users').update(updates).eq('id', req.params.uid);
    if (error) throw error;
    res.json({ message: `Technician ${decision}d successfully`, status: statusValue });
  } catch (error) {
    console.error('Error deciding technician application:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH: Activate, deactivate, suspend, or ban an account.
router.patch('/users/:uid/status', async (req, res) => {
  try {
    const allowedStatuses = ['active', 'inactive', 'suspended', 'banned'];
    const { status: statusValue } = req.body;
    if (!allowedStatuses.includes(statusValue)) return res.status(400).json({ error: 'Invalid account status' });

    const { error: dbError } = await supabase.from('users').update({ status: statusValue, updated_at: new Date().toISOString() }).eq('id', req.params.uid);
    if (dbError) throw dbError;

    if (statusValue === 'banned') {
      try {
        await supabase.auth.admin.updateUserById(req.params.uid, { ban_duration: '3650 days' });
      } catch (authError) {
        console.warn('Auth ban sync skipped:', authError.message);
      }
    }
    res.json({ message: 'Account status updated', status: statusValue });
  } catch (error) {
    console.error('Error updating account status:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Remove a user profile and Supabase Auth account.
router.delete('/users/:uid', async (req, res) => {
  try {
    const { error: authError } = await supabase.auth.admin.deleteUser(req.params.uid);
    if (authError) {
      console.warn('Auth deletion skipped:', authError.message);
      await supabase.from('users').delete().eq('id', req.params.uid);
    }
    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Generate and email a Supabase password-reset link.
router.post('/users/:uid/password-reset', async (req, res) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD === 'your-gmail-app-password') {
      return res.status(503).json({ error: 'Password email is not configured. Add SMTP_USER and SMTP_PASSWORD to backend/.env.' });
    }

    const { data: authUser, error: getUserError } = await supabase.auth.admin.getUserById(req.params.uid);
    if (getUserError) throw getUserError;
    if (!authUser || !authUser.user) return res.status(404).json({ error: 'User not found' });

    const userEmail = authUser.user.email;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: userEmail,
      options: { redirectTo: process.env.SUPABASE_REDIRECT_URL || 'fixlink://recovery' }
    });
    if (linkError) throw linkError;
    const link = linkData.properties.action_link;

    const { sendMail } = require('../utils/smtpSender');
    await sendMail({
      to: userEmail,
      subject: 'Reset your FixLink password',
      text: `A password reset was requested for your FixLink account. Open this link to choose a new password:\n\n${link}\n\nIf you did not request this, you can ignore this email.`
    });

    res.json({ email: userEmail, message: 'Password reset email sent' });
  } catch (error) {
    console.error('Error generating password reset link:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Reporting metrics for request volume, technician performance, and popular categories.
router.get('/analytics', async (req, res) => {
  try {
    const [jobs, users, reviews] = await Promise.all([
      listTable(tableNames.requests),
      listTable('users'),
      listTable(tableNames.reviews)
    ]);
    const safeUsers = users.map(serializeUser);
    const technicians = safeUsers.filter(user => user.role === 'technician');
    const technicianPerformance = technicians.map(technician => {
      const assigned = jobs.filter(job => job.technicianUid === technician.uid || job.technicianName === technician.name);
      return { name: technician.name || technician.email, requests: assigned.length, completed: assigned.filter(job => String(job.status).toLowerCase() === 'completed').length };
    }).filter(item => item.requests > 0).sort((left, right) => right.completed - left.completed);
    const categories = jobs.reduce((result, job) => { const category = job.appliance_type || job.category || 'Other'; result[category] = (result[category] || 0) + 1; return result; }, {});
    res.json({ requestVolume: jobs.length, completedRequests: jobs.filter(job => String(job.status).toLowerCase() === 'completed').length, technicianPerformance, popularCategories: Object.entries(categories).sort((left, right) => right[1] - left[1]).map(([name, count]) => ({ name, count })), reviewCount: reviews.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Load a platform collection for the corresponding admin section.
router.get('/:section', async (req, res) => {
  try {
    const table = tableNames[req.params.section];
    if (!table) return res.status(404).json({ error: 'Unknown admin section' });

    const rows = await listTable(table);
    let serialized;
    switch (req.params.section) {
      case 'requests': serialized = rows.map(serializeJob); break;
      case 'reports': serialized = rows.map(serializeReport); break;
      case 'reviews': serialized = rows.map(serializeReview); break;
      case 'categories': serialized = rows.map(serializeCategory); break;
      case 'announcements': serialized = rows.map(serializeAnnouncement); break;
      default: serialized = rows;
    }
    res.json(serialized);
  } catch (error) {
    console.error(`Error loading ${req.params.section}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Add a category or announcement.
router.post('/:section', async (req, res) => {
  try {
    const table = tableNames[req.params.section];
    if (!table || !['categories', 'announcements'].includes(req.params.section)) {
      return res.status(404).json({ error: 'This section does not support creation' });
    }
    const record = { ...req.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (req.params.section === 'categories') {
      record.name = String(req.body.name || '').trim();
      record.devices = Array.isArray(req.body.devices)
        ? req.body.devices.map(device => String(device).trim()).filter(Boolean)
        : [];
    }
    delete record.id;
    const { data, error } = await supabase.from(table).insert(record).select().single();
    if (error) throw error;
    const serialized = req.params.section === 'categories' ? serializeCategory(data) : serializeAnnouncement(data);
    res.status(201).json(serialized);
  } catch (error) {
    console.error(`Error creating ${req.params.section} record:`, error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH: Reassign a repair request to another technician.
router.patch('/requests/:id/reassign', async (req, res) => {
  try {
    const { technicianUid, technicianName } = req.body;
    if (!technicianUid) return res.status(400).json({ error: 'technicianUid is required' });
    const { data: existing, error: findError } = await supabase.from('jobs').select('id').eq('id', req.params.id).maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'Repair request not found' });
    await supabase.from('jobs').update({ technician_uid: technicianUid, technician_name: technicianName || 'Assigned technician', status: 'Accepted', updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ message: 'Repair request reassigned' });
  } catch (error) {
    console.error('Error reassigning repair request:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Remove an inappropriate review.
router.delete('/reviews/:id', async (req, res) => {
  try {
    await supabase.from('reviews').delete().eq('id', req.params.id);
    res.json({ message: 'Review removed' });
  } catch (error) {
    console.error('Error removing review:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH/DELETE: Maintain marketplace skill categories.
router.patch('/categories/:id', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const updates = { name, updated_at: new Date().toISOString() };
    if (Array.isArray(req.body.devices)) {
      updates.devices = req.body.devices.map(device => String(device).trim()).filter(Boolean);
    }
    await supabase.from('categories').update(updates).eq('id', req.params.id);
    res.json({ message: 'Category updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    await supabase.from('categories').delete().eq('id', req.params.id);
    res.json({ message: 'Category removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH: Resolve a complaint and optionally update the reported account.
router.patch('/reports/:id/resolve', async (req, res) => {
  try {
    const { action = 'reviewed', userUid, userStatus } = req.body;
    await supabase.from('reports').update({ status: 'resolved', resolution: action, resolved_at: new Date().toISOString() }).eq('id', req.params.id);
    if (userUid && ['active', 'suspended', 'banned'].includes(userStatus)) {
      await supabase.from('users').update({ status: userStatus, updated_at: new Date().toISOString() }).eq('id', userUid);
    }
    res.json({ message: 'Report resolved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH: Verify/Approve a technician account
router.patch('/verify-technician/:uid', async (req, res) => {
  try {
    const { uid } = req.params;

    const { data: existing, error: findError } = await supabase.from('users').select('id').eq('id', uid).maybeSingle();
    if (findError) throw findError;
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    await supabase.from('users').update({ status: 'active', verification_status: 'verified', updated_at: new Date().toISOString() }).eq('id', uid);

    res.status(200).json({ message: 'Technician verified and activated successfully' });
  } catch (error) {
    console.error('Error verifying technician:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;