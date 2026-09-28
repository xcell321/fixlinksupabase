// /api/ai barrel — preserves existing mount paths and auth guard.
// Endpoints now live in focused sub-routers:
//   ai/detectRoutes.js     POST /detect-category
//   ai/assistantRoutes.js  POST /assistant
//   ai/recommendRoutes.js  GET /recommend

const express = require('express');

const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');

router.use(requireAuth);
router.use('/', require('./ai/detectRoutes'));
router.use('/', require('./ai/assistantRoutes'));
router.use('/', require('./ai/recommendRoutes'));

module.exports = router;
