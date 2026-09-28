// POST /api/auth/login — customer/technician sign-in with role enforcement.
// Thin route: HTTP only, business rules live in services/auth/loginService.js.

const express = require('express');

const router = express.Router();
const { login } = require('../../services/auth/loginService');
const { HttpError } = require('../../domain/httpError');

router.post('/login', async (req, res) => {
  try {
    const result = await login(req.body || {});
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);
    console.error('Login error details:', error.message);
    res.status(500).json({ error: 'Server error during login. Please try again later.' });
  }
});

module.exports = router;
