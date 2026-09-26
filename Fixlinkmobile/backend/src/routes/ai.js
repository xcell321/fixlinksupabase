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
const { getSchedulesForTechnicians, dayKeyOf, availabilityForDay } = require('../utils/techSchedule');
const { getActiveJobCountsForTechnicians, getWorkloadStatus } = require('../utils/workload');

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
  activeJobs: Number(candidate.activeJobs) || 0,
  workloadStatus: candidate.workloadStatus || 'available',
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

// POST /api/ai/assistant — Customer floating FixLink Assistant.
// Grounded in the customer's live FixLink data sent by the app. Real AI via
// the OmniRoute gateway (billed per prompt); the app falls back to local
// replies when the gateway is unavailable.
router.post('/assistant', async (req, res) => {
  try {
    const { message, context } = req.body || {};
    const text = String(message || '').trim().slice(0, 500);
    if (!text) {
      return res.status(400).json({ error: 'A message is required.' });
    }
    if (!isOmniRouteConfigured()) {
      return res.status(502).json({ error: 'AI service is not configured.', ai: 'degraded' });
    }
    // Language detection (logic only, no canned answers): Bisaya, Tagalog, or English.
    const detectLanguage = (t) => {
      const s = ` ${String(t || '').toLowerCase()} `;
      const has = (words) => words.some((w) => s.includes(` ${w} `) || s.includes(` ${w}?`) || s.includes(` ${w}!`) || s.includes(` ${w}.`) || s.includes(` ${w},`));
      const bisaya = ['unsa', 'unsaon', 'ngano', 'asa', 'kanus-a', 'kanusa', 'kinsa', 'kinsay', 'pila', 'pwede', 'lage', 'jud', 'gyud', 'kaayo', 'nako', 'nimo', 'niya', 'akoa', 'imoha', 'ila', 'diri', 'didto', 'dinhi', 'didto', 'karon', 'ugma', 'gahapon', 'salamat', 'palihug', 'maayong', 'kumusta', 'gani', 'nindot', 'dili', 'wala', 'naa', 'tabang', 'pangan', 'buhat', 'tan-aw', 'tanawa'];
      const tagalog = ['ano', 'paano', 'bakit', 'saan', 'kailan', 'sino', 'magkano', 'puwede', 'kamusta', 'naman', 'gusto', 'kailangan', 'akin', 'iyo', 'dito', 'doon', 'ngayon', 'bukas', 'salamat', 'paki'];
      if (has(bisaya)) return 'Bisaya';
      if (has(tagalog)) return 'Tagalog';
      return 'English';
    };
    const lang = detectLanguage(text);
    const c = context && typeof context === 'object' ? context : {};
    // Top technicians by rating for ranking/recommendation questions (real data only).
    let topTechnicians = [];
    try {
      const { data: techRows } = await supabase
        .from('users')
        .select('name, rating, total_reviews, years_experience, skills')
        .eq('role', 'technician')
        .order('rating', { ascending: false, nullsFirst: false })
        .limit(5);
      topTechnicians = (techRows || []).map((t) => ({
        name: t.name,
        rating: t.rating != null ? Number(Number(t.rating).toFixed(1)) : null,
        reviews: t.total_reviews != null ? Number(t.total_reviews) : 0,
        yearsExperience: t.years_experience ?? null,
        skills: Array.isArray(t.skills) ? t.skills.slice(0, 5) : [],
      }));
    } catch (_) {}
    const live = {
      customerName: c.customerName || null,
      activeJob: c.activeJob || null,
      activeCount: c.activeCount ?? null,
      pendingCount: c.pendingCount ?? null,
      completedCount: c.completedCount ?? null,
      topTechnicians,
    };
    const system = [
      "You are FixLink Assistant, the friendly in-app helper for FixLink customers (repair request + technician dispatch, Philippines).",
      'Reply ONLY in the detected customer language. Never mix languages: English messages get English-only replies, Bisaya gets Bisaya-only, Tagalog gets Tagalog-only.',
      'Reply warmly and directly, at most 4 short sentences, plain text, no markdown.',
      'Greet by first name only when the customer greets you.',
      'You know the FixLink mobile system: customer submits a repair in 4 steps (Appliance, Problem, Schedule, Location with GPS + map), tracks it under Repairs with live map, chats via Messages, verifies completion with a 4-digit OTP code, and rates the technician. Technicians see Available/Assigned jobs within 20km, accept jobs, navigate on the in-app map, and complete via OTP. Customer login and technician login are separate; a customer account cannot log in as technician and vice versa.',
      'For questions about the system or how to use the app, explain using the real screen and button names above.',
      'For ranking or recommendation questions, rank using ONLY topTechnicians (rating, then reviews). Name names with rating and review count, e.g. "1. Dustine Villaruz - 4.9 (12 reviews)".',
      'For status or time questions, use ONLY activeJob (status, technicianName, preferredTime). Never invent names, statuses, times, or prices.',
      'Do NOT provide price estimates. FixLink matching itself is free.',
      'If the data does not answer the question, say what the customer should tap (Book service, Repairs, Messages).',
    ].join(' ');
    const user = `Detected language: ${lang}. Reply ONLY in ${lang}.\nCustomer message: ${text}\nLive FixLink data: ${JSON.stringify(live).slice(0, 2000)}`;
    const { content } = await chatComplete({ system, user, json: false, temperature: 0.4, maxTokens: 260 });
    return res.status(200).json({ reply: String(content).trim().slice(0, 900), ai: 'ai' });
  } catch (error) {
    console.error('AI assistant error:', error.message);
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

    let candidates = getEligibleCandidates({ job, technicians, requiredSkills });
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

    // Workload capacity: 0-2 available, 3-5 busy (still eligible), 6+ at_capacity (excluded from automatic AI matching)
    // Order: eligibility -> skill/category -> verification -> workload -> distance/schedule/rating
    // Do not cancel existing jobs, do not disable account – just filter automatic recommendations.
    try {
      const workloadMap = await getActiveJobCountsForTechnicians(candidates.map((c) => c.uid));
      const filtered = [];
      for (const c of candidates) {
        const activeJobs = workloadMap.get(String(c.uid)) ?? 0;
        const workloadStatus = getWorkloadStatus(activeJobs);
        c.activeJobs = activeJobs;
        c.workloadStatus = workloadStatus;
        if (workloadStatus === 'at_capacity') continue;
        filtered.push(c);
      }
      candidates = filtered;
    } catch (workloadError) {
      console.warn('Workload filter unavailable, skipping:', workloadError.message);
      candidates.forEach((c) => {
        if (c.activeJobs == null) c.activeJobs = 0;
        if (!c.workloadStatus) c.workloadStatus = 'available';
      });
    }
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

    let objective = rankObjective(job, candidates, 10);
    // Slight priority reduction for busy (3-5) without overpowering skill/rating/distance.
    // Penalty 0.06 preserves transparency and keeps other factors dominant.
    objective = objective.map((c) => {
      if (c.workloadStatus === 'busy') {
        const penalized = Math.max(0, Number(c.totalScore) - 0.06);
        return { ...c, totalScore: Number(penalized.toFixed(4)) };
      }
      return c;
    }).sort((a, b) => b.totalScore - a.totalScore);
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

    // ADDITIVE schedule visibility: same-day availability + safe upcoming
    // schedule per recommended technician, in ONE batched query (no N+1).
    // Ranking, scores, reasons, and order above are untouched.
    try {
      const requestDay = dayKeyOf({ scheduled_date: job.scheduled_date, preferred_date: job.preferred_date });
      const schedulesByUid = await getSchedulesForTechnicians(recommendations.map((c) => c.uid));
      recommendations.forEach((c) => {
        const schedule = schedulesByUid.get(String(c.uid)) || [];
        c.availability = availabilityForDay(requestDay, schedule);
        c.upcomingSchedule = schedule.slice(0, 5);
      });
    } catch (scheduleError) {
      console.warn('Technician schedule unavailable, omitting availability:', scheduleError.message);
    }

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