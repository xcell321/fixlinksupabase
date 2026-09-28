// Eligibility rules for the technician "available jobs" feed.
//
// This is the pure decision logic that used to be inline inside the GET
// /api/requests handler: given a technician's stored skills and one pending
// job row, should the technician see it?
//
// It is deliberately NOT the same function as
// services/technicianMatching.js#skillMatchesJob (used by the AI
// recommendation endpoint). That one ranks AI candidates and applies a
// slightly different rule (it also folds AI-extracted skills in, and drops the
// `requestDevice` fallback clause). Merging them would change which jobs a
// technician sees, so the feed rule is preserved exactly as it shipped.

// "Refrigerator" / "Air Conditioner" -> "refrigerator" / "airconditioner".
const normalizeSkillToken = (value) => String(value || '').toLowerCase().trim().replace(/[\s\/]/g, '');

const GENERAL_SKILLS = ['generalrepair', 'general repair', 'allaround', 'allaroundrepair'];
const OTHER_SKILLS = ['others', 'other'];
const COMPUTER_REQUEST_HINTS = ['laptop', 'computermonitor', 'desktopcomputer', 'systemunit', 'computer', 'pc'];
const APPLIANCE_REQUEST_HINTS = ['refrigerator', 'washingmachine', 'waterheater', 'television', 'tv', 'airconditioner'];

// `fallbackCategory` is the optional `?category=` query param the app can send.
const skillMatchesFeedJob = (skillsRaw, job, fallbackCategory = '') => {
  const skillsNormalized = (Array.isArray(skillsRaw) ? skillsRaw : []).map(normalizeSkillToken);
  const deviceToken = normalizeSkillToken(job?.application_type || job?.appliance_type || fallbackCategory || '');
  const requestCategory = normalizeSkillToken(job?.category || '');

  if (requestCategory && skillsNormalized.includes(requestCategory)) return true;

  return skillsNormalized.some((skillNorm) => {
    if (GENERAL_SKILLS.includes(skillNorm)) return true;
    if (job?.is_other && OTHER_SKILLS.includes(skillNorm)) return true;

    const isComputerRequest = COMPUTER_REQUEST_HINTS.some((hint) => deviceToken.includes(hint));
    const hasComputerSkill = skillsNormalized.some((skill) =>
      skill.includes('computer') || skill.includes('laptop') || skill.includes('electronics'));

    const isApplianceRequest = APPLIANCE_REQUEST_HINTS.some((hint) => deviceToken.includes(hint));
    const hasApplianceSkill = skillsNormalized.some((skill) =>
      skill.includes('appliance') || skill.includes('refrigerator') || skill.includes('washing'));

    return skillNorm === deviceToken
      || deviceToken.includes(skillNorm)
      || skillNorm.includes(deviceToken)
      || (isComputerRequest && hasComputerSkill)
      || (isApplianceRequest && hasApplianceSkill)
      || (deviceToken && (deviceToken.includes(skillNorm) || skillNorm.includes(deviceToken)));
  });
};

// A technician is eligible for the feed when they are verified/active and have
// not already declined the job. (Skill matching is applied separately so the
// caller can short-circuit when no technician filter is requested.)
const isVerifiedTechnician = (technician) =>
  technician?.status === 'active' || technician?.verification_status === 'verified';

const hasDeclined = (job, technicianUid) =>
  Boolean(technicianUid) && job?.declined_by === technicianUid;

module.exports = {
  normalizeSkillToken,
  skillMatchesFeedJob,
  isVerifiedTechnician,
  hasDeclined,
};
