// Technician public-profile aggregate: profile + completed-job skill stats +
// reviews + rating summary. Extracted verbatim from routes/users.js so the
// route stays thin. Behavior is unchanged.

const { supabase } = require('../../config/supabase');
const { serializeUser } = require('../../domain/userSerializer');
const { summarizeRatings } = require('../ratings/ratingSummary');
const { normalizeSkillToken } = require('../../domain/jobFeedEligibility');

const getTechnicianPublicProfile = async ({ technicianId }) => {
  const { data: profile } = await supabase.from('users').select('*').eq('id', technicianId).maybeSingle();
  if (!profile || profile.role !== 'technician') {
    const error = new Error('Technician profile not found');
    error.status = 404;
    throw error;
  }

  const [jobsResult, reviewsResult] = await Promise.all([
    supabase.from('jobs').select('id, status, category, appliance_type').eq('technician_uid', technicianId),
    supabase.from('reviews').select('*').eq('technician_uid', technicianId),
  ]);

  const completedJobs = (jobsResult.data || []).filter((job) => String(job.status).toLowerCase() === 'completed');

  // Per-skill experience derived from real completed jobs. A skill name
  // matches a job when the normalized category equals the skill or either
  // side contains the other, mirroring the matching algorithm. No levels
  // stored. Counts computed live so bars grow as technicians finish work.
  const techSkills = Array.isArray(profile.skills) ? profile.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  const skillStats = techSkills.map((skill) => {
    const skillKey = normalizeSkillToken(skill).replace(/[^a-z0-9]/g, '');
    const count = completedJobs.filter((job) => {
      const categoryKey = normalizeSkillToken(job.category).replace(/[^a-z0-9]/g, '');
      const applianceKey = normalizeSkillToken(job.appliance_type).replace(/[^a-z0-9]/g, '');
      return (categoryKey && (categoryKey === skillKey || categoryKey.includes(skillKey) || skillKey.includes(categoryKey)))
        || (applianceKey && skillKey && (applianceKey.includes(skillKey) || skillKey.includes(applianceKey)));
    }).length;
    return { name: skill, completedJobs: count };
  });

  let reviews = reviewsResult.data || [];
  if (reviews.length === 0 && profile.name) {
    const { data: nameReviews } = await supabase.from('reviews').select('*').eq('technician_name', profile.name);
    if (nameReviews && nameReviews.length > 0) reviews = nameReviews;
  }

  const { rating: averageRating, totalReviews } = summarizeRatings(reviews, {
    rating: profile.rating,
    totalReviews: profile.total_reviews,
  });

  // Reviews written after customer_uid existed link straight to the reviewer.
  // Legacy rows only carry the name snapshot. Resolve by uid only: matching
  // by display name can attach a stranger's photo when two customers share a
  // name, so legacy rows keep their snapshot name with no avatar.
  const reviewCustomerUids = [...new Set(reviews.map((r) => r.customer_uid).filter(Boolean))];
  const { data: uidUsers } = reviewCustomerUids.length
    ? await supabase.from('users').select('id, name, profile_image').in('id', reviewCustomerUids)
    : { data: [] };
  const customerByUid = new Map((uidUsers || []).map((u) => [u.id, u]));

  return {
    ...serializeUser(profile),
    uid: technicianId,
    verified: profile.status === 'active' || profile.verification_status === 'verified',
    completedJobs: completedJobs.length,
    averageRating,
    totalReviews,
    skillStats,
    reviews: reviews.map((review) => {
      const match = review.customer_uid ? customerByUid.get(review.customer_uid) : null;
      return {
        rating: review.rating || 0,
        comment: review.comment || review.text || '',
        createdAt: review.created_at ? new Date(review.created_at).toISOString() : null,
        customerName: match?.name || review.customer_name || null,
        customerImage: match?.profile_image || null,
      };
    }),
  };
};

module.exports = { getTechnicianPublicProfile };
