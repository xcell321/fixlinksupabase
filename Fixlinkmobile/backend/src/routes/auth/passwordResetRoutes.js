// Password recovery: POST /api/auth/forgot-password + reset-password.
// Thin routes: HTTP only, token lifecycle lives in services/auth/passwordResetService.js.

const express = require('express');

const router = express.Router();
const { requestPasswordReset, completePasswordReset } = require('../../services/auth/passwordResetService');
const { HttpError } = require('../../domain/httpError');

router.post('/forgot-password', async (req, res) => {
  try {
    const result = await requestPasswordReset({
      email: req.body?.email,
      reqMeta: {
        host: req.headers?.host,
        forwardedProto: req.headers?.['x-forwarded-proto'],
        forwardedHost: req.headers?.['x-forwarded-host'],
      },
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);
    console.error('Error generating/sending reset link:', error);
    res.status(500).json({ error: 'Unable to send reset link.', details: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const result = await completePasswordReset(req.body || {});
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Unable to reset password. Please try again.' });
  }
});

module.exports = router;
