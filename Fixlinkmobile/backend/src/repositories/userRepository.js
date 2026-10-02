// Data access for the `users` table (shared by jobs, chat and tracking).

const { supabase } = require('../config/supabase');

const TABLE = 'users';

const findById = async (uid) => {
  const { data } = await supabase.from(TABLE).select('*').eq('id', uid).maybeSingle();
  return data || null;
};

// Role lookup used by the notification deep-link authorization check.
const findRoleById = async (uid) => {
  const { data } = await supabase.from(TABLE).select('role').eq('id', uid).maybeSingle();
  return String(data?.role || '').toLowerCase();
};

// Contact card for chat peers: phone plus the avatar shown next to their name.
const findContactsByIds = async (uids) => {
  if (!uids || uids.length === 0) return [];
  const { data } = await supabase.from(TABLE).select('id, phone, profile_image').in('id', uids);
  return data || [];
};

// Non-sensitive profile cards used when a technician rates a customer
// (UAT #11): the verified badge and portfolio need only these fields.
const findPublicProfilesByIds = async (uids) => {
  const list = [...new Set((uids || []).filter(Boolean))];
  if (list.length === 0) return [];
  const { data } = await supabase
    .from(TABLE)
    .select('id, name, profile_image, portfolio, verification_status, government_id_file_url, credential_risk_level, rating, total_reviews')
    .in('id', list);
  return data || [];
};

// Status write used by automated trust actions (repeat-scammer suspend).
const updateStatus = async (uid, status) => {
  const { error } = await supabase.from(TABLE).update({ status }).eq('id', uid);
  return { error };
};
const findByNameLike = async (name, role) => {
  const { data } = await supabase
    .from(TABLE)
    .select('id, name')
    .eq('role', role)
    .ilike('name', `%${name}%`);
  return data || [];
};

module.exports = { findById, findRoleById, findContactsByIds, findByNameLike, findPublicProfilesByIds, updateStatus };
