// /api/users barrel — preserves existing mount paths and route order.
//   users/platformRoutes.js    GET /platform/categories, /platform/announcements
//   users/technicianRoutes.js  profile, schedule, location, portfolio, GET /:id
//
// NOTE: platformRoutes must mount before technicianRoutes so /platform/* is
// not swallowed by the generic /:id route.

const express = require('express');

const router = express.Router();

router.use('/', require('./users/platformRoutes'));
router.use('/', require('./users/technicianRoutes'));

module.exports = router;
