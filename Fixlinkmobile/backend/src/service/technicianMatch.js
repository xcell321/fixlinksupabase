// Deterministic technician matching for the AI-assisted recommendation feature.
// This is the OBJECTIVE ranking foundation: eligibility rules mirror the
// existing GET /api/requests feed (requests.js) and the score is a transparent
// weighted blend of real FixLink data. The AI layer (routes/ai.js) re-ranks and
// explains, but it can only choose from the candidates this service returns.

const BOGO_LANDMARKS = {
  'lepiten': { latitude: 11.0278, longitude: 124.0355 },
  'san vicente': { latitude: 11.0550, longitude: 124.0216 },
  'p. rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'poblacion': { latitude: 11.0485, longitude: 124.0038 },
  'taytayan': { latitude: 11.0430, longitude: 124.0080 },
  'gairan': { latitude: 11.0554, longitude: 124.0217 },
  'cogon': { latitude: 11.0380, longitude: 124.0150 },
  'dakit': { latitude: 11.0620, longitude: 124.0120 },
  'nailon': { latitude: 11.0850, longitude: 124.0350 },
  'libertad': { latitude: 11.0310, longitude: 124.0020 },
  'siocon': { latitude: 11.0680, longitude: 124.0250 },
  'cantecson': { latitude: 11.0410, longitude: 123.9890 },
  'sudtongan': { latitude: 11.0720, longitude: 124.0010 },
  'la paz': { latitude: 11.0720, longitude: 124.0010 }
};

const distanceInKm = (firstLatitude, firstLongitude, secondLatitude, secondLongitude) => {
  if (![firstLatitude, firstLongitude, secondLatitude, secondLongitude].every(Number.isFinite)) return null;
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(firstLatitude)) * Math.cos(radians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const resolveJobCoords = (latitude, longitude, locationText) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  const lower = String(locationText || '').toLowerCase();
  for (const [key, coords] of Object.entries(BOGO_LANDMARKS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
};

const normalize = (value) => String(value || '').toLowerCase().trim().replace(/[\s\/]/g, '');

// Skill-match gate. `requiredSkills` (optional) are AI-extracted skill labels
// that broaden matching beyond the stored category/device (Requirement 1 -> 2).
const skillMatchesJob = (skillsRaw, job, requiredSkills = []) => {
  const skills = Array.isArray(skillsRaw) ? skillsRaw : [];
  const skillsNormalized = skills.map(normalize);
  const requestCategory = normalize(job?.category || '');
  const requestDevice = normalize(job?.appliance_type || '');
  const requestedNorms = [requestCategory, requestDevice].filter(Boolean);
  const extraNorms = (Array.isArray(requiredSkills) ? requiredSkills : [])
    .map(normalize)
    .filter(Boolean);

  if (!skillsNormalized.length) return false;
  if (requestCategory && skillsNormalized.includes(requestCategory)) return true;
  if (extraNorms.some((token) => skillsNormalized.includes(token))) return true;

  return skillsNormalized.some((skillNorm) => {
    if (['generalrepair', 'general repair', 'allaround', 'allaroundrepair'].includes(skillNorm)) return true;
    if (job?.is_other && ['others', 'other'].includes(skillNorm)) return true;

    const requestedJoined = [...requestedNorms, ...extraNorms].join(' ');
    const isComputerRequest = ['laptop', 'computermonitor', 'desktopcomputer', 'systemunit', 'computer', 'pc']
      .some((c) => requestedJoined.includes(c));
    const hasComputerSkill = skillsNormalized.some((s) => s.includes('computer') || s.includes('laptop') || s.includes('electronics'));

    const isApplianceRequest = ['refrigerator', 'washingmachine', 'waterheater', 'television', 'tv', 'airconditioner']
      .some((c) => requestedJoined.includes(c));
    const hasApplianceSkill = skillsNormalized.some((s) => s.includes('appliance') || s.includes('refrigerator') || s.includes('washing'));

    return requestedNorms.some((requested) =>
      skillNorm === requested || requested.includes(skillNorm) || skillNorm.includes(requested)
    ) || extraNorms.some((extra) => skillNorm.includes(extra) || extra.includes(skillNorm))
      || (isComputerRequest && hasComputerSkill)
      || (isApplianceRequest && hasApplianceSkill);
  });
};

// Build the eligible candidate list using the SAME gates as the technician feed
// (verified/active, skill match, not previously declined) plus distance.
const getEligibleCandidates = ({ job, technicians, requiredSkills = [] }) => {
  const jobCoords = resolveJobCoords(job?.latitude, job?.longitude, job?.location);
  return (Array.isArray(technicians) ? technicians : [])
    .filter((t) => String(t.role || '') === 'technician')
    .filter((t) => t.status === 'active' || t.verification_status === 'verified')
    .filter((t) => skillMatchesJob(t.skills, job, requiredSkills))
    .filter((t) => !job?.declined_by || t.id !== job.declined_by)
    .map((t) => {
      const techLat = Number(t.latitude);
      const techLon = Number(t.longitude);
      const distanceKm = jobCoords && Number.isFinite(techLat) && Number.isFinite(techLon)
        ? distanceInKm(techLat, techLon, jobCoords.latitude, jobCoords.longitude)
        : null;
      const rating = Number(t.rating) || 0;
      return {
        uid: t.id,
        name: t.name || 'Technician',
        skills: Array.isArray(t.skills) ? t.skills : [],
        yearsExperience: Number(t.years_experience) || 0,
        rating,
        totalReviews: Number(t.total_reviews) || 0,
        isAvailable: Boolean(t.is_available),
        distanceKm,
        profileImage: t.profile_image || null,
      };
    });
};

// Transparent weighted score over real FixLink fields (0..1).
const scoreCandidate = (job, candidate) => {
  const weights = { skill: 0.25, proximity: 0.20, rating: 0.20, track: 0.15, experience: 0.15, availability: 0.05 };
  const exactMatch = candidate.skills.some((s) => normalize(s) === normalize(job?.category || ''));
  const skill = exactMatch ? 1 : 0.8;
  const proximity = candidate.distanceKm == null ? 0.5 : Math.max(0, 1 - candidate.distanceKm / 50);
  const rating = candidate.rating > 0 ? Math.min(candidate.rating, 5) / 5 : (candidate.totalReviews ? 0.6 : 0.4);
  const track = Math.min(candidate.totalReviews / 20, 1);
  const experience = Math.min(candidate.yearsExperience / 10, 1);
  const availability = candidate.isAvailable ? 1 : 0.5;
  const total = skill * weights.skill + proximity * weights.proximity + rating * weights.rating
    + track * weights.track + experience * weights.experience + availability * weights.availability;
  return Number(total.toFixed(4));
};

// Deterministic one-line reason grounded in the stored data.
const buildObjectiveReason = (candidate) => {
  const parts = [];
  if (candidate.distanceKm != null) {
    const rounded = Math.round(candidate.distanceKm);
    parts.push(rounded <= 0 ? 'less than 1 km away' : `${rounded} km away`);
  }
  if (candidate.totalReviews > 0) parts.push(`${candidate.rating.toFixed(1)}★ from ${candidate.totalReviews} review${candidate.totalReviews === 1 ? '' : 's'}`);
  else if (candidate.rating > 0) parts.push(`${candidate.rating.toFixed(1)}★ rating`);
  if (candidate.yearsExperience > 0) parts.push(`${candidate.yearsExperience} yr${candidate.yearsExperience === 1 ? '' : 's'} experience`);
  return parts.length ? parts.join(' · ') : 'Skill match';
};

// Objective ranking foundation: score + sort + slice.
const rankObjective = (job, candidates, limit = 10) =>
  candidates
    .map((c) => ({ ...c, totalScore: scoreCandidate(job, c), reason: buildObjectiveReason(c) }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);

const buildCandidatePayload = (candidates) =>
  (Array.isArray(candidates) ? candidates : []).map((c) => ({
    uid: c.uid,
    name: c.name,
    skills: c.skills,
    yearsExperience: c.yearsExperience,
    rating: c.rating,
    totalReviews: c.totalReviews,
    distanceKm: c.distanceKm == null ? null : Math.round(c.distanceKm * 10) / 10,
  }));

module.exports = {
  distanceInKm,
  skillMatchesJob,
  getEligibleCandidates,
  scoreCandidate,
  buildObjectiveReason,
  rankObjective,
  buildCandidatePayload,
};