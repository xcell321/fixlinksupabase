// /api/admin barrel — preserves paths, auth gating and route order.
//   admin/session.js      POST /login, /logout, GET /session (unguarded)
//   admin/overview.js     GET /overview, /analytics
//   admin/users.js        GET /users, PATCH|DELETE /users/:uid, POST password-reset
//   admin/technicians.js  GET /technicians/:uid, credential proxy, decisions
//   admin/moderation.js   PATCH /requests/:id/reassign, DELETE /reviews/:id, PATCH /reports/:id/resolve
//   admin/incidents.js    GET /incidents, PATCH /incidents/:id/status, PATCH /customers/:uid/reset-no-show
//   admin/catalog.js      GET|POST /:section, PATCH|DELETE /categories/:id (mounted last so GET /:section cannot shadow /overview or /analytics)
const express = require('express');

const router = express.Router();
const { requireAdmin } = require('../middleware/requireAdmin');

router.use('/', require('./admin/session'));

router.use(requireAdmin);

router.use('/', require('./admin/overview'));
router.use('/', require('./admin/users'));
router.use('/', require('./admin/technicians'));
router.use('/', require('./admin/moderation'));
router.use('/', require('./admin/incidents'));
router.use('/', require('./admin/catalog'));

module.exports = router;
