// Canonical skill-matching entry point.
// The feed rule (domain/jobFeedEligibility.js) and the AI ranking rule
// (services/technicianMatching.js) stay behavior-identical and separate,
// because merging them would change which jobs technicians see. This module
// only gives callers one import path and documents which rule to use when.

const {
  normalizeSkillToken,
  skillMatchesFeedJob,
  isVerifiedTechnician,
  hasDeclined,
} = require('../domain/jobFeedEligibility');
const { skillMatchesJob } = require('./technicianMatching');

// Unified matcher: feed mode preserves the technician-queue behavior exactly,
// recommend mode preserves the AI candidate behavior exactly (folds in
// AI-extracted requiredSkills). No new logic, only dispatch.
function skillMatches(skills, job, options = {}) {
  const { mode = 'feed', requiredSkills = [], fallbackCategory = '' } = options;
  if (mode === 'recommend') return skillMatchesJob(skills, job, requiredSkills);
  return skillMatchesFeedJob(skills, job, fallbackCategory);
}

module.exports = {
  normalizeSkillToken,
  skillMatchesFeedJob,
  skillMatchesJob,
  skillMatches,
  isVerifiedTechnician,
  hasDeclined,
};
