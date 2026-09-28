// Data access for the `reviews` table and the technician rating roll-up RPC.

const { supabase } = require('../config/supabase');

const TABLE = 'reviews';

const findByTechnicianUid = async (technicianUid) => {
  const { data } = await supabase.from(TABLE).select('*').eq('technician_uid', technicianUid);
  return data || [];
};

// Legacy reviews were keyed by display name only.
const findByTechnicianName = async (technicianName) => {
  const { data } = await supabase.from(TABLE).select('*').eq('technician_name', technicianName);
  return data || [];
};

const insertReview = async (row) => supabase.from(TABLE).insert(row).select('id').single();

const recomputeTechnicianRating = async (technicianUid) =>
  supabase.rpc('recompute_technician_rating', { p_technician_uid: technicianUid });

module.exports = { findByTechnicianUid, findByTechnicianName, insertReview, recomputeTechnicianRating };
