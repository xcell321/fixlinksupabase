// Recommendation orchestration: GET /api/ai/recommend?jobId=.
// Extracted from routes/ai.js. Uses jobRepository.findByIdOrOriginalId instead
// of the deleted local resolveJob copy. Behavior is unchanged.

const { supabase } = require('../../config/supabase');
const jobRepository = require('../../repositories/jobRepository');
const { analyzeRepairDescription } = require('../repairAnalyzer');
const {
  getEligibleCandidates,
  rankObjective,
  buildCandidatePayload,
} = require('../technicianMatching');
const { chatComplete, isAiConfigured } = require('../aiClient');
const { getSchedulesForTechnicians, dayKeyOf, availabilityForDay } = require('../techScheduleService');
const { getActiveJobCountsForTechnicians, getWorkloadStatus } = require('../workloadService');
const { serializeCandidate } = require('../../domain/candidateSerializer');

const jobPayload = (job, interpretation) => ({
  id: job.id,
  applianceType: job.appliance_type,
  category: job.category || interpretation?.category || null,
  description: job.description,
  latitude: job.latitude ?? null,
  longitude: job.longitude ?? null,
});

const recommendTechnicians = async ({ jobId }) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) {
    const error = new Error('Repair request not found.');
    error.status = 404;
    throw error;
  }

  const { data: technicians } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'technician');

  // R1: interpret the request; the extracted skills broaden candidate matching.
  let interpretation = null;
  let requiredSkills = [];
  if (isAiConfigured()) {
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
  const emptyResult = (note) => ({
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
    note,
  });
  if (candidates.length === 0) {
    return emptyResult('No eligible technicians match this request yet.');
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
    return emptyResult('No eligible technicians match this request yet.');
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

  if (isAiConfigured()) {
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

  return {
    ai: mode,
    interpretation,
    job: jobPayload(job, interpretation),
    recommendations,
    note: mode === 'ai'
      ? 'AI-assisted technician recommendation ranked using FixLink data.'
      : 'Recommendation shown from deterministic ranking (AI gateway unavailable).',
  };
};

module.exports = { recommendTechnicians };
