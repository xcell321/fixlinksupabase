// Candidate serialization for the AI recommendation endpoint.
// Extracted from routes/ai.js so routes stay thin and the payload shape lives
// in one place. Output shape is unchanged.

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

module.exports = { serializeCandidate };
