const express = require('express');
const multer = require('multer');
const router = express.Router();
const { supabase, uploadBuffer } = require('../config/supabase');
const { serializeUser } = require('../utils/serialize');

const portfolioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
});

router.get('/platform/categories', async (req, res) => {
  try {
    const { data } = await supabase.from('categories').select('*').order('name', { ascending: true });
    res.json((data || []).map((doc) => ({ id: doc.id, name: doc.name, devices: doc.devices || [] })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/platform/announcements', async (req, res) => {
  try {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    res.json((data || []).map((doc) => ({ id: doc.id, ...doc, createdAt: doc.created_at ? new Date(doc.created_at).toISOString() : null })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/profile', async (req, res) => {
  try {
    const { data: profile } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (!profile || profile.role !== 'technician') return res.status(404).json({ error: 'Technician profile not found' });

    const [jobsResult, reviewsResult] = await Promise.all([
      supabase.from('jobs').select('id, status').eq('technician_uid', req.params.id),
      supabase.from('reviews').select('*').eq('technician_uid', req.params.id)
    ]);

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
      completedJobs: (jobsResult.data || []).filter((job) => String(job.status).toLowerCase() === 'completed').length,
      averageRating,
      totalReviews,
      reviews: reviews.map((review) => ({ rating: review.rating || 0, comment: review.comment || review.text || '', createdAt: review.created_at ? new Date(review.created_at).toISOString() : null })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

router.post('/:id/portfolio', portfolioUpload.array('photos', 6), async (req, res) => {
  try {
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