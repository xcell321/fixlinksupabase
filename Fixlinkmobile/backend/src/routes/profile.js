const express = require('express');
const multer = require('multer');
const { supabase, verifyAccessToken, uploadBuffer } = require('../config/supabase');
const { serializeUser } = require('../domain/userSerializer');
const { resolveCoordinates } = require('../services/geocodeService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

const requireAuthenticatedUser = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });
  try {
    const payload = await verifyAccessToken(token);
    if (payload.sub !== req.params.id) return res.status(403).json({ error: 'You can only update your own profile.' });
    req.authUser = { uid: payload.sub };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

router.put('/:id/profile', requireAuthenticatedUser, upload.single('profileImage'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    const { name, phone, address } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });

    if (!existing) {
      const { error: insertError } = await supabase.from('users').insert({
        id: req.params.id,
        name: name.trim(),
        email: '',
        role: 'customer',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
    }

    const updates = { name: name.trim(), phone: String(phone || '').trim(), address: String(address || '').trim(), updated_at: new Date().toISOString() };
    if (req.file) {
      try {
        updates.profile_image = await uploadBuffer({ folder: 'profiles', file: req.file, buffer: req.file.buffer, contentType: req.file.mimetype });
      } catch (uploadError) {
        console.error('Profile image upload failed:', uploadError.message);
      }
    }

    const { data: updated } = await supabase.from('users').update(updates).eq('id', req.params.id).select('*').single();
    res.json(serializeUser(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/technician', requireAuthenticatedUser, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (!profile || profile.role !== 'technician') return res.status(404).json({ error: 'Technician profile not found.' });

    const { name, phone, address, bio, skills, yearsExperience, latitude, longitude } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    const normalizedSkills = Array.isArray(skills)
      ? skills.map((skill) => String(skill).trim()).filter(Boolean)
      : String(skills || '').split(',').map((skill) => skill.trim()).filter(Boolean);
    const providedLatitude = Number(latitude);
    const providedLongitude = Number(longitude);
    const hasProvidedCoords = Number.isFinite(providedLatitude) && Number.isFinite(providedLongitude)
      && providedLatitude >= -90 && providedLatitude <= 90
      && providedLongitude >= -180 && providedLongitude <= 180;
    const updates = {
      name: name.trim(),
      phone: String(phone || '').trim(),
      address: String(address || '').trim(),
      bio: String(bio || '').trim(),
      skills: normalizedSkills,
      years_experience: Number(yearsExperience) || 0,
      updated_at: new Date().toISOString()
    };
    if (hasProvidedCoords) {
      updates.latitude = providedLatitude;
      updates.longitude = providedLongitude;
      updates.location_updated_at = new Date().toISOString();
    } else if (updates.address && updates.address !== String(profile.address || '').trim()) {
      try {
        const coords = await resolveCoordinates(updates.address);
        if (coords) {
          updates.latitude = coords.latitude;
          updates.longitude = coords.longitude;
          updates.location_updated_at = new Date().toISOString();
        }
      } catch (error) {
        console.error('Geocoding failed for technician address:', error.message);
      }
    }
    const { data: updated } = await supabase.from('users').update(updates).eq('id', req.params.id).select('*').single();
    res.json(serializeUser(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;