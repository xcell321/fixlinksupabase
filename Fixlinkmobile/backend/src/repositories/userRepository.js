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

const findPhonesByIds = async (uids) => {
  if (!uids || uids.length === 0) return [];
  const { data } = await supabase.from(TABLE).select('id, phone').in('id', uids);
  return data || [];
};

// Resolve a display name to a uid within a role (legacy name-based lookups).
const findByNameLike = async (name, role) => {
  const { data } = await supabase
    .from(TABLE)
    .select('id, name')
    .eq('role', role)
    .ilike('name', `%${name}%`);
  return data || [];
};

module.exports = { findById, findRoleById, findPhonesByIds, findByNameLike };
