// GET /api/users/platform/* — admin-managed catalog + announcements.
// Thin route: caching + queries live in services/platform/platformService.js.

const express = require('express');

const router = express.Router();
const { listCategories, listAnnouncements } = require('../../services/platform/platformService');

router.get('/platform/categories', async (req, res) => {
  try {
    res.json(await listCategories());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/platform/announcements', async (req, res) => {
  try {
    res.json(await listAnnouncements());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
