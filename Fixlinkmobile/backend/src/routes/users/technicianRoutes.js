// Technician-facing user routes: public profile aggregate, safe schedule
// visibility, live location updates and portfolio uploads.
// Thin routes: aggregation lives in services/technician/technicianProfileService.js.

const express = require('express');
const multer = require('multer');

const router = express.Router();
const { supabase, uploadBuffer } = require('../../config/supabase');
const { serializeUser } = require('../../domain/userSerializer');
const { requireAuth } = require('../../middleware/requireAuth');
const { getTechnicianSchedule, dayKeyOf, availabilityForDay } = require('../../services/techScheduleService');
const { getTechnicianPublicProfile } = require('../../services/technician/technicianProfileService');

const portfolioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype)),
});

router.get('/:id/profile', async (req, res) => {
  try {
    res.json(await getTechnicianPublicProfile({ technicianId: req.params.id }));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
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

router.put('/:id/location', requireAuth, async (req, res) => {
  // A technician may only publish their own live location. requireAuth sets
  // req.authUser.uid, so reject any update that targets a different account.
  if (String(req.authUser.uid) !== String(req.params.id)) {
    return res.status(403).json({ error: 'You can only update your own location.' });
  }
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
