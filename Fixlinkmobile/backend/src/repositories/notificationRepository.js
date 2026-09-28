// Data access for the `notifications` table (in-app notification feed).

const { supabase } = require('../config/supabase');

const TABLE = 'notifications';

const findByRecipient = async (uid, types) => {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('recipient_uid', uid)
    .in('type', types);
  return data || [];
};

const findRecentByRecipient = async (uid, types, limit = 100) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('recipient_uid', uid)
    .in('type', types)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

const findById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  return { row: data || null, error };
};

const markRead = async (id, uid, readAt) =>
  supabase.from(TABLE).update({ read: true, read_at: readAt }).eq('id', id).eq('recipient_uid', uid);

// Bulk "you opened this thread" sync: clears every unread notification for one job.
const markJobNotificationsRead = async (uid, jobId, readAt) =>
  supabase
    .from(TABLE)
    .update({ read: true, read_at: readAt })
    .eq('recipient_uid', uid)
    .eq('job_id', jobId)
    .eq('read', false);

const insertOne = async (row) => supabase.from(TABLE).insert(row);

// Returns the created ids so the caller can attach them to its payload.
const insertManyReturningIds = async (rows) => supabase.from(TABLE).insert(rows).select('id');

module.exports = {
  findByRecipient,
  findRecentByRecipient,
  findById,
  markRead,
  markJobNotificationsRead,
  insertOne,
  insertManyReturningIds,
};
