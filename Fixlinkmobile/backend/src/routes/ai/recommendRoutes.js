// GET /api/ai/recommend?jobId= — AI-assisted technician recommendation.
// Thin route: orchestration lives in services/ai/recommendationService.js.

const express = require('express');

const router = express.Router();
const { recommendTechnicians } = require('../../services/ai/recommendationService');

router.get('/recommend', async (req, res) => {
  try {
    const result = await recommendTechnicians({ jobId: req.query.jobId });
    return res.status(200).json(result);
  } catch (error) {
    if (error && error.status === 404) return res.status(404).json({ error: 'Repair request not found.' });
    console.error('AI recommend error:', error);
    return res.status(500).json({ error: 'Unable to produce recommendations.' });
  }
});

module.exports = router;
