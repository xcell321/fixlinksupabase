// /api/auth barrel — preserves existing mount paths.
// Endpoints now live in focused sub-routers:
//   loginRoutes.js          POST /login
//   registerRoutes.js       POST /register (+ technician document upload)
//   passwordResetRoutes.js  POST /forgot-password, POST /reset-password

const express = require('express');

const router = express.Router();

router.use('/', require('./auth/loginRoutes'));
router.use('/', require('./auth/registerRoutes'));
router.use('/', require('./auth/passwordResetRoutes'));

module.exports = router;
