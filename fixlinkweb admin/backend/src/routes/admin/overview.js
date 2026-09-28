// Admin overview + analytics. Thin routes over services/adminAnalyticsService.js.
const express = require('express');

const router = express.Router();
const { getOverview, getAnalytics } = require('../../services/adminAnalyticsService');

router.get('/overview', async (req, res) => {
  try {
    res.json(await getOverview());
  } catch (error) {
    console.error('Error loading admin overview:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    res.json(await getAnalytics());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
