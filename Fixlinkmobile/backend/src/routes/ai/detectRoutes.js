// POST /api/ai/detect-category — analyze a customer's natural-language
// repair description (device, category, problem, skills).
// Thin route: HTTP only, analysis lives in services/repairAnalyzer.js.

const express = require('express');

const router = express.Router();
const { analyzeRepairDescription } = require('../../services/repairAnalyzer');
const { isOmniRouteConfigured } = require('../../services/omniRoute');

router.post('/detect-category', async (req, res) => {
  try {
    const { description, applianceType, category } = req.body || {};
    if (!String(description || '').trim()) {
      return res.status(400).json({ error: 'A repair description is required.' });
    }
    if (!isOmniRouteConfigured()) {
      return res.status(502).json({ error: 'AI service is not configured.', ai: 'degraded' });
    }
    const analysis = await analyzeRepairDescription({ description, applianceType, category });
    return res.status(200).json(analysis);
  } catch (error) {
    console.error('AI detect-category error:', error.message);
    return res.status(502).json({ error: 'AI service unavailable.', ai: 'degraded' });
  }
});

module.exports = router;
