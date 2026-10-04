// POST /api/auth/login — customer/technician sign-in with role enforcement.
// Thin route: HTTP only, business rules live in services/auth/loginService.js.

const express = require('express');

const router = express.Router();
const { login } = require('../../services/auth/loginService');
const { memoryUpload } = require('../../middleware/upload');
const { HttpError } = require('../../domain/httpError');

// The face field is optional multipart: JSON logins pass through untouched
// (multer only handles multipart bodies), while app logins attach a selfie.
router.post('/login', memoryUpload.single('face'), async (req, res) => {
  try {
    const result = await login({ ...(req.body || {}), faceFile: req.file || null });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);
    console.error('Login error details:', error.message);
    res.status(500).json({ error: 'Server error during login. Please try again later.' });
  }
});

module.exports = router;
