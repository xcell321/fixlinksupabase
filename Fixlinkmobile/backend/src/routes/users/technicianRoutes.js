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
  // Accept any image type (jpeg, png, webp, heic, and so forth). A strict
  // allowlist silently dropped phone photos (for example HEIC) because multer
  // discards them with no error, which surfaced as a misleading
  // `400 'A photo is required.'` even though the user attached a picture.
  fileFilter: (req, file, callback) => {
    const isImage = !file.mimetype || String(file.mimetype).startsWith('image/');
    if (!isImage) req.fileRejected = true;
    callback(null, isImage);
  },
});

// Multer errors default to an HTML 500 page, which the app cannot display.
// Convert them to JSON so the portfolio sheet always shows a readable message.
const handlePortfolioUpload = (req, res, next) => {
  portfolioUpload.array('photos', 1)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Each photo must be 10MB or smaller. Please use a smaller file.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Please attach one photo per request.' });
      }
      return res.status(400).json({ error: 'Photo upload failed. Please use an image file.' });
    }
    next();
  });
};

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

router.post('/:id/portfolio', requireAuth, handlePortfolioUpload, async (req, res) => {
  try {
    if (String(req.authUser.uid) !== String(req.params.id)) {
      return res.status(403).json({ error: 'You can only update your own portfolio.' });
    }
    if (req.fileRejected) {
      return res.status(400).json({ error: 'Your photo must be an image file.' });
    }
    const { data: profile } = await supabase.from('users').select('portfolio, role').eq('id', req.params.id).maybeSingle();
    if (!profile || profile.role !== 'technician') {
      return res.status(404).json({ error: 'Technician profile not found' });
    }
    const existing = Array.isArray(profile.portfolio) ? profile.portfolio : [];

    // One photo per request. The technician describes the repair before the
    // photo is stored, so the card can show what was fixed and which model
    // instead of a raw file name.
    const file = (req.files || [])[0];
    if (!file) {
      return res.status(400).json({ error: 'A photo is required.' });
    }
    const repairType = String(req.body?.repairType || '').trim().slice(0, 80);
    const model = String(req.body?.model || '').trim().slice(0, 80);
    if (!repairType || !model) {
      return res.status(400).json({ error: 'Repair type and model are required.' });
    }

    let photo;
    try {
      const url = await uploadBuffer({ folder: 'technician-portfolio', file, buffer: file.buffer, contentType: file.mimetype });
      photo = { name: file.originalname, url, uploadedAt: new Date().toISOString(), repairType, model };
    } catch (uploadError) {
      console.error('Portfolio upload failed:', uploadError.message);
      return res.status(500).json({ error: 'Unable to store the photo.' });
    }

    const portfolio = [...existing, photo];
    const { data: updated, error: updateError } = await supabase.from('users').update({ portfolio }).eq('id', req.params.id).select('portfolio').single();
    if (updateError) {
      console.error('Portfolio save failed:', updateError.message);
      return res.status(500).json({ error: 'Unable to save the photo. Please try again.' });
    }
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
