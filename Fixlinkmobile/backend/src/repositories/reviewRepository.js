// Data access for the `reviews` table and the rating roll-up RPCs.
//
// UAT #11 keeps both directions in this one table, separated by
// `reviewer_role`: a customer rating a technician ('customer'), and a
// technician rating a customer ('technician').

const { supabase } = require('../config/supabase');

const TABLE = 'reviews';

const findByTechnicianUid = async (technicianUid) => {
  const { data } = await supabase.from(TABLE).select('*').eq('technician_uid', technicianUid);
  return data || [];
};

// Legacy reviews were keyed by display name only.
// Every technician -> customer review for one customer. Used to count negative
// ratings for the UAT #11 auto-suspend rule.
const findTechnicianReviewsForCustomer = async (customerUid) => {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('customer_uid', customerUid)
    .eq('reviewer_role', 'technician');
  return data || [];
};

const findByTechnicianName = async (technicianName) => {
  const { data } = await supabase.from(TABLE).select('*').eq('technician_name', technicianName);
  return data || [];
};

// Guards against rating the same party twice for the same job.
const findByRequestAndReviewerRole = async (requestId, reviewerRole) => {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('request_id', requestId)
    .eq('reviewer_role', reviewerRole)
    .maybeSingle();
  return data || null;
};

const insertReview = async (row) => supabase.from(TABLE).insert(row).select('id').single();

const recomputeTechnicianRating = async (technicianUid) =>
  supabase.rpc('recompute_technician_rating', { p_technician_uid: technicianUid });

const recomputeCustomerRating = async (customerUid) =>
  supabase.rpc('recompute_customer_rating', { p_customer_uid: customerUid });

module.exports = {
  findByTechnicianUid,
  findTechnicianReviewsForCustomer,
  findByTechnicianName,
  findByRequestAndReviewerRole,
  insertReview,
  recomputeTechnicianRating,
  recomputeCustomerRating,
};
