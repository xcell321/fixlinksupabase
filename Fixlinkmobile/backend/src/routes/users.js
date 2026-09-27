const express = require('express');
const multer = require('multer');
const router = express.Router();
const { supabase, uploadBuffer } = require('../config/supabase');
const { serializeUser } = require('../utils/serialize');
const { requireAuth } = require('../middleware/requireAuth');
const { getTechnicianSchedule, dayKeyOf, availabilityForDay } = require('../utils/techSchedule');

const portfolioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
});

// Short-lived memory cache for admin-managed platform data.
const platformCache = {
  categories: { at: 0, data: null },
  announcements: { at: 0, data: null },
};

router.get('/platform/categories', async (req, res) => {
  try {
    // Admin-managed catalog barely changes. 60s memory cache shields the
    // database when many users open register or submit at once.
    const now = Date.now();
    if (platformCache.categories.data && now - platformCache.categories.at < 60000) {
      return res.json(platformCache.categories.data);
    }
    const { data } = await supabase.from('categories').select('*').order('name', { ascending: true });
    platformCache.categories = {
      at: now,
      data: (data || []).map((doc) => ({ id: doc.id, name: doc.name, devices: doc.devices || [] })),
    };
    res.json(platformCache.categories.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/platform/announcements', async (req, res) => {
  try {
    const now = Date.now();
    if (platformCache.announcements.data && now - platformCache.announcements.at < 60000) {
      return res.json(platformCache.announcements.data);
    }
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    platformCache.announcements = {
      at: now,
      data: (data || []).map((doc) => ({ id: doc.id, ...doc, createdAt: doc.created_at ? new Date(doc.created_at).toISOString() : null })),
    };
    res.json(platformCache.announcements.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/profile', async (req, res) => {
  try {
    const { data: profile } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (!profile || profile.role !== 'technician') return res.status(404).json({ error: 'Technician profile not found' });

    const [jobsResult, reviewsResult] = await Promise.all([
      supabase.from('jobs').select('id, status, category, appliance_type').eq('technician_uid', req.params.id),
      supabase.from('reviews').select('*').eq('technician_uid', req.params.id)
    ]);

    const completedJobs = (jobsResult.data || []).filter((job) => String(job.status).toLowerCase() === 'completed');

    // Per-skill experience derived from real completed jobs. A skill name
    // matches a job when the normalized category equals the skill or either
    // side contains the other, mirroring the matching algorithm. No levels
    // stored. Counts computed live so bars grow as technicians finish work.
    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const techSkills = Array.isArray(profile.skills) ? profile.skills.map((s) => String(s).trim()).filter(Boolean) : [];
    const skillStats = techSkills.map((skill) => {
      const skillKey = normalize(skill);
      const count = completedJobs.filter((job) => {
        const categoryKey = normalize(job.category);
        const applianceKey = normalize(job.appliance_type);
        return (categoryKey && (categoryKey === skillKey || categoryKey.includes(skillKey) || skillKey.includes(categoryKey)))
          || (applianceKey && skillKey && (applianceKey.includes(skillKey) || skillKey.includes(applianceKey)));
      }).length;
      return { name: skill, completedJobs: count };
    });

    let reviews = reviewsResult.data || [];
    if (reviews.length === 0 && profile.name) {
      const { data: nameReviews } = await supabase.from('reviews').select('*').eq('technician_name', profile.name);
      if (nameReviews && nameReviews.length > 0) reviews = nameReviews;
    }

    const averageRating = reviews.length
      ? Number((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1))
      : (profile.rating != null && Number(profile.rating) > 0 ? Number(Number(profile.rating).toFixed(1)) : null);
    const totalReviews = reviews.length || (profile.total_reviews ? Number(profile.total_reviews) : 0);

    res.json({
      ...serializeUser(profile),
      uid: req.params.id,
      verified: profile.status === 'active' || profile.verification_status === 'verified',
      completedJobs: completedJobs.length,
      averageRating,
      totalReviews,
      skillStats,
      reviews: reviews.map((review) => ({ rating: review.rating || 0, comment: review.comment || review.text || '', createdAt: review.created_at ? new Date(review.created_at).toISOString() : null, customerName: review.customer_name || null })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:technicianUid/schedule — customer-safe technician
// schedule visibility. Authenticated. Returns ONLY safe schedule fields
// for occupied jobs (no customer PII, no GPS, never full job rows).
// Optional ?date=ISO: also returns availability ('available' | 'busy')
// for that calendar day using the same-day rule.
router.get('/:technicianUid/schedule', requireAuth, async (req, res) => {
  try {
    const technicianUid = String(req.params.technicianUid || '').trim();
    if (!technicianUid) return res.status(400).json({ error: 'Technician identity is required.' });

    const { data: tech } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', technicianUid)
      .maybeSingle();
    if (!tech || String(tech.role || '') !== 'technician') {
      return res.status(404).json({ error: 'Technician schedule not found.' });
    }

    const jobs = await getTechnicianSchedule(technicianUid);
    const requestedDay = req.query.date ? dayKeyOf({ scheduled_date: String(req.query.date) }) : null;
    res.json({
      technicianUid,
      availability: requestedDay ? availabilityForDay(requestedDay, jobs) : jobs.length > 0 ? 'busy' : 'available',
      jobs,
    });
  } catch (error) {
    console.error('Error loading technician schedule:', error);
    res.status(500).json({ error: 'Unable to load technician schedule.' });
  }
});

router.put('/:id/location', async (req, res) => {

  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: 'Valid coordinates are required.' });
  await supabase
    .from('users')
    .update({ latitude, longitude, location_updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  res.json({ latitude, longitude });
});

router.post('/:id/portfolio', requireAuth, portfolioUpload.array('photos', 6), async (req, res) => {
  try {
    if (String(req.authUser.uid) !== String(req.params.id)) {
      return res.status(403).json({ error: 'You can only update your own portfolio.' });
    }
    const { data: profile } = await supabase.from('users').select('portfolio, role').eq('id', req.params.id).maybeSingle();
    if (!profile || profile.role !== 'technician') {
      return res.status(404).json({ error: 'Technician profile not found' });
    }
    const existing = profile.portfolio || [];

    const files = [];
    for (const file of (req.files || [])) {
      try {
        const url = await uploadBuffer({ folder: 'technician-portfolio', file, buffer: file.buffer, contentType: file.mimetype });
        files.push({ name: file.originalname, url, uploadedAt: new Date().toISOString() });
      } catch (uploadError) {
        console.error('Portfolio upload failed for one photo:', uploadError.message);
      }
    }

    const portfolio = [...existing, ...files];
    const { data: updated } = await supabase.from('users').update({ portfolio }).eq('id', req.params.id).select('portfolio').single();
    res.status(201).json({ portfolio: updated ? updated.portfolio : portfolio });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Fetch user profile by ID
router.get('/:id', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;