const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const { analyzeRepairDescription } = require('../service/repairAnalyzer');
const {
  getEligibleCandidates,
  rankObjective,
  buildCandidatePayload,
} = require('../service/technicianMatch');
const { chatComplete, isOmniRouteConfigured } = require('../utils/omniRoute');

router.use(requireAuth);

// Resolve a job by its own id or the legacy original request id (same lookup
// as the requests router).
const resolveJob = async (id) => {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .or(`id.eq.${cleanId},original_request_id.eq.${cleanId}`)
    .maybeSingle();
  return error || !data ? null : data;
};

const serializeCandidate = (candidate) => ({
  uid: candidate.uid,
  name: candidate.name,
  skills: candidate.skills,
  rating: candidate.rating,
  totalReviews: candidate.totalReviews,
  yearsExperience: candidate.yearsExperience,
  distanceKm: candidate.distanceKm == null ? null : Math.round(candidate.distanceKm * 10) / 10,
  matchScore: Number(candidate.totalScore.toFixed(3)),
  reason: candidate.reason || '',
  confidence: Number(candidate.confidence) || 0,
  profileImage: candidate.profileImage || null,
});

// POST /api/ai/detect-category — Requirement 1: analyze a customer's
// natural-language repair description (device, category, problem, skills).
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

// GET /api/ai/recommend?jobId= — Requirement 2: AI-assisted technician
// recommendation. Objective ranking is the foundation; the AI interprets the
// request (feeding candidate selection) and explains why each matches.
router.get('/recommend', async (req, res) => {
  try {
    const job = await resolveJob(req.query.jobId);
    if (!job) return res.status(404).json({ error: 'Repair request not found.' });

    const { data: technicians } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'technician');

    // R1: interpret the request; the extracted skills broaden candidate matching.
    let interpretation = null;
    let requiredSkills = [];
    if (isOmniRouteConfigured()) {
      try {
        interpretation = await analyzeRepairDescription({
          description: job.description,
          applianceType: job.appliance_type,
          category: job.category,
        });
        requiredSkills = interpretation.skills || [];
      } catch (error) {
        console.warn('AI interpretation unavailable, using deterministic matching only:', error.message);
      }
    }

    const candidates = getEligibleCandidates({ job, technicians, requiredSkills });
    if (candidates.length === 0) {
      return res.status(200).json({
        ai: 'deterministic',
        interpretation,
        job: {
          id: job.id,
          applianceType: job.appliance_type,
          category: job.category,
          description: job.description,
          latitude: job.latitude ?? null,
          longitude: job.longitude ?? null,
        },
        recommendations: [],
        note: 'No eligible technicians match this request yet.',
      });
    }

    const objective = rankObjective(job, candidates, 10);
    let recommendations = [];
    let mode = 'deterministic';

    const serializeFromObjective = (slice) => slice.map((c) => serializeCandidate(c));

    if (isOmniRouteConfigured()) {
      try {
        const system = [
          "You are FixLink's technician recommendation assistant.",
          'You receive a customer repair request plus a list of candidate technicians with verified FixLink data.',
          'Choose the 3 best candidates for THIS request and return STRICT JSON only:',
          '{"recommendations":[{"uid":"<exact candidate uid>","reason":"<one concise sentence grounded in the data>","confidence":0.9}]}',
          'Rules:',
          '- Only use uids that appear in the provided candidate list, ordered best first.',
          '- The reason must reference the real values in the data (rating, number of reviews, years of experience, distance). Never invent numbers.',
          '- confidence is a number 0..1 reflecting how strongly this technician fits the specific repair.',
        ].join(' ');
        const user = JSON.stringify({
          request: {
            description: job.description,
            applianceType: job.appliance_type,
            category: job.category,
          },
          aiInterpretation: interpretation,
          candidates: buildCandidatePayload(objective),
        });

        const { parsed } = await chatComplete({ system, user, json: true, temperature: 0.2 });
        const chosen = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
        const byUid = new Map(objective.map((c) => [String(c.uid), c]));

        const validated = [];
        for (const item of chosen) {
          const candidate = byUid.get(String(item.uid));
          if (!candidate) continue;
          validated.push({
            ...candidate,
            confidence: Number(item.confidence),
            reason: String(item.reason || candidate.reason || '').trim(),
          });
          if (validated.length >= 3) break;
        }

        if (validated.length) {
          // Preserve the objective order for items the model chose.
          const rankIndex = new Map(validated.map((c, i) => [c.uid, i]));
          recommendations = validated
            .sort((a, b) => rankIndex.get(a.uid) - rankIndex.get(b.uid))
            .map((c) => serializeCandidate(c));
          recommendations.forEach((c, index) => { c.rank = index + 1; });
          mode = 'ai';
        } else {
          recommendations = serializeFromObjective(objective.slice(0, 3));
        }
      } catch (error) {
        console.warn('AI recommendation unavailable, using deterministic ranking:', error.message);
        recommendations = serializeFromObjective(objective.slice(0, 3));
      }
    } else {
      recommendations = serializeFromObjective(objective.slice(0, 3));
    }

    recommendations.forEach((c, index) => { if (!c.rank) c.rank = index + 1; });

    return res.status(200).json({
      ai: mode,
      interpretation,
      job: {
        id: job.id,
        applianceType: job.appliance_type,
        category: job.category || interpretation?.category || null,
        description: job.description,
        latitude: job.latitude ?? null,
        longitude: job.longitude ?? null,
      },
      recommendations,
      note: mode === 'ai'
        ? 'AI-assisted technician recommendation ranked using FixLink data.'
        : 'Recommendation shown from deterministic ranking (AI gateway unavailable).',
    });
  } catch (error) {
    console.error('AI recommend error:', error);
    return res.status(500).json({ error: 'Unable to produce recommendations.' });
  }
});

module.exports = router;