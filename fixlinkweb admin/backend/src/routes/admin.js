const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const router = express.Router();
const { supabase, supabaseAuth } = require('../config/supabase');

const sessions = new Map();

function mapUser(row) {
  return {
    uid: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status || row.verification_status || 'active',
    verification_status: row.verification_status,
    phone: row.phone,
    address: row.address,
    skills: row.skills,
    government_id_file_url: row.government_id_file_url,
    certificate_file_url: row.certificate_file_url,
    rating: row.rating,
    total_reviews: row.total_reviews,
    createdAt: row.created_at,
    created_at: row.created_at,
    disabled: row.status !== 'active',
  };
}

async function listUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return (data || []).map(mapUser);
}

async function listJobs() {
  const { data, error } = await supabase.from('jobs').select('*');
  if (error) throw error;
  return data || [];
}

function safeEqual(left, right) {
  const lb = Buffer.from(String(left || ''));
  const rb = Buffer.from(String(right || ''));
  return lb.length === rb.length && crypto.timingSafeEqual(lb, rb);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  const cookie = cookies.find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function requireAdmin(request, response, next) {
  const sessionId = cookieValue(request, 'fixlink_admin_session');
  if (!sessionId || !sessions.has(sessionId)) return response.status(401).json({ error: 'Admin login required' });
  request.admin = sessions.get(sessionId);
  next();
}

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

router.post('/logout', (req, res) => {
  const sessionId = cookieValue(req, 'fixlink_admin_session');
  if (sessionId) sessions.delete(sessionId);
  res.setHeader('Set-Cookie', 'fixlink_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ message: 'Logged out' });
});

router.get('/session', (req, res) => {
  const sessionId = cookieValue(req, 'fixlink_admin_session');
  res.json({ authenticated: Boolean(sessionId && sessions.has(sessionId)) });
});

router.use(requireAdmin);

router.get('/overview', async (req, res) => {
  try {
    const users = await listUsers();
    const jobs = await listJobs();
    const { data: reviews } = await supabase.from('reviews').select('*');
    const reviewList = reviews || [];
    const pendingTechnicians = users.filter((u) => u.role === 'technician' && u.status === 'pending_verification');
    const technicians = users.filter((u) => u.role === 'technician');
    const customers = users.filter((u) => u.role === 'customer');
    const completedRequests = jobs.filter((j) => String(j.status).toLowerCase() === 'completed').length;
    const averageRating = reviewList.length
      ? reviewList.reduce((t, r) => t + Number(r.rating || 0), 0) / reviewList.length
      : 0;
    res.json({
      counts: {
        customers: customers.length,
        technicians: technicians.length,
        pendingTechnicians: pendingTechnicians.length,
        requests: jobs.length,
        completedRequests,
        activeRequests: jobs.filter((j) => ['pending', 'accepted', 'in progress'].includes(String(j.status || 'pending').toLowerCase())).length,
        reviews: reviewList.length,
        averageRating: Number(averageRating.toFixed(1)),
      },
      requestStatuses: jobs.reduce((acc, j) => {
        const s = j.status || 'Pending';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {}),
      recentUsers: [...users].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5),
      pendingTechnicians: pendingTechnicians.slice(0, 5),
    });
  } catch (error) {
    console.error('Error loading admin overview:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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

router.get('/technicians/:uid', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', req.params.uid).maybeSingle();
    if (error) throw error;
    if (!data || data.role !== 'technician') return res.status(404).json({ error: 'Technician profile not found' });
    const { password, passwordHash, resetToken, ...safe } = data;
    // Provide camelCase aliases for the technician-review frontend (which expects governmentIdFileUrl etc.)
    // while keeping snake_case for backwards compatibility.
    const camelAliases = {
      governmentIdNumber: data.government_id_number ?? null,
      governmentIdFileUrl: data.government_id_file_url ?? null,
      certificateFileUrl: data.certificate_file_url ?? null,
      yearsExperience: data.years_experience ?? null,
      verificationStatus: data.verification_status ?? null,
      rejectionReason: data.rejection_reason ?? null,
    };
    res.json({ uid: data.id, ...safe, ...camelAliases, status: data.status || data.verification_status || 'active', createdAt: data.created_at || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/technicians/:uid/credential/:type', async (req, res) => {
  try {
    const fieldByType = { 'government-id': 'government_id_file_url', certificate: 'certificate_file_url' };
    const field = fieldByType[req.params.type];
    if (!field) return res.status(400).json({ error: 'Invalid credential type' });
    const { data } = await supabase.from('users').select(field).eq('id', req.params.uid).maybeSingle();
    const fileUrl = data ? data[field] : null;
    if (!fileUrl) return res.status(404).json({ error: 'Credential file not found' });
    // Supabase Storage public URL — fetch and proxy
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) return res.status(fileResponse.status).json({ error: 'Credential file could not be loaded' });
    res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(await fileResponse.arrayBuffer()));
  } catch (error) {
    res.status(500).json({ error: 'Credential file could not be loaded' });
  }
});

router.patch('/technicians/:uid/decision', async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const status = decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : null;
    if (!status) return res.status(400).json({ error: 'decision must be approve or reject' });
    const { error } = await supabase
      .from('users')
      .update({
        status,
        verification_status: status === 'active' ? 'verified' : 'rejected',
        rejection_reason: reason || null,
      })
      .eq('id', req.params.uid);
    if (error) throw error;
    res.json({ message: `Technician ${decision}d successfully`, status });
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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(503).json({ error: 'Password email is not configured.' });
    }
    const { data: user } = await supabase.from('users').select('email').eq('id', req.params.uid).maybeSingle();
    if (!user?.email) return res.status(404).json({ error: 'User not found' });
    // Generate Supabase recovery link via admin
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email: user.email });
    if (error) throw error;
    const link = data.properties?.action_link || '';
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: String(process.env.EMAIL_PASS).replace(/\s+/g, '') },
    });
    await transporter.sendMail({
      from: `FixLink Support <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Reset your FixLink password',
      text: `A password reset was requested. Open this link:\n\n${link}\n\nIf you did not request this, ignore this email.`,
    });
    res.json({ email: user.email, message: 'Password reset email sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const jobs = await listJobs();
    const users = await listUsers();
    const { data: reviews } = await supabase.from('reviews').select('*');
    const technicians = users.filter((u) => u.role === 'technician');
    const technicianPerformance = technicians
      .map((t) => {
        const assigned = jobs.filter((j) => j.technician_uid === t.uid || j.technician_name === t.name);
        return { name: t.name || t.email, requests: assigned.length, completed: assigned.filter((j) => String(j.status).toLowerCase() === 'completed').length };
      })
      .filter((x) => x.requests > 0)
      .sort((a, b) => b.completed - a.completed);
    const categories = jobs.reduce((acc, j) => {
      const cat = j.appliance_type || j.category || 'Other';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    res.json({
      requestVolume: jobs.length,
      completedRequests: jobs.filter((j) => String(j.status).toLowerCase() === 'completed').length,
      technicianPerformance,
      popularCategories: Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      reviewCount: (reviews || []).length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

router.patch('/verify-technician/:uid', async (req, res) => {
  try {
    const { error } = await supabase.from('users').update({ status: 'active', verification_status: 'verified' }).eq('id', req.params.uid);
    if (error) throw error;
    res.status(200).json({ message: 'Technician verified and activated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
