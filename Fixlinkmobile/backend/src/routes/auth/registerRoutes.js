// POST /api/auth/register — new customer/technician accounts.
// Thin route: upload guard + HTTP only, rules live in services/auth/registrationService.js.

const express = require('express');

const router = express.Router();
const { handleUploadErrors } = require('../../middleware/registrationUpload');
const { registerUser } = require('../../services/auth/registrationService');
const { HttpError } = require('../../domain/httpError');

router.post('/register', handleUploadErrors, async (req, res) => {
  try {
    const { status, body } = await registerUser({ body: req.body || {}, files: req.files || {} });
    res.status(status || 201).json(body);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);
    console.error('Registration error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
