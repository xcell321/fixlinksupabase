// Data access for chat: the `messages` table, the `message_reads` table and
// the `send_chat_message` RPC.

const { supabase } = require('../config/supabase');

const MESSAGES = 'messages';
const MESSAGE_READS = 'message_reads';

// `ordered: false` skips the ORDER BY for callers that only need the rows as a
// set (e.g. working out which messages are still unread).
const findByJobId = async (jobId, { ordered = true } = {}) => {
  let query = supabase.from(MESSAGES).select('*').eq('job_id', jobId);
  if (ordered) query = query.order('timestamp', { ascending: true });
  const { data } = await query;
  return data || [];
};

const findByJobIds = async (jobIds) => {
  const { data } = await supabase
    .from(MESSAGES)
    .select('*')
    .in('job_id', jobIds)
    .order('timestamp', { ascending: true });
  return data || [];
};

const findRecentByJobIds = async (jobIds, limit = 100) => {
  const { data } = await supabase
    .from(MESSAGES)
    .select('*')
    .in('job_id', jobIds)
    .order('timestamp', { ascending: false })
    .limit(limit);
  return data || [];
};

// Reads for a set of messages -> { message_id, user_uid } rows.
const findReadsForMessages = async (messageIds) => {
  if (!messageIds || messageIds.length === 0) return [];
  const { data } = await supabase
    .from(MESSAGE_READS)
    .select('message_id, user_uid')
    .in('message_id', messageIds);
  return data || [];
};

// Which of these messages the given user has already read.
const findReadsForUser = async (userUid, messageIds) => {
  const { data } = await supabase
    .from(MESSAGE_READS)
    .select('message_id')
    .eq('user_uid', userUid)
    .in('message_id', messageIds);
  return data || [];
};

const insertReads = async (rows) => supabase.from(MESSAGE_READS).insert(rows);

const insertReadIfAbsent = async (row) => supabase.from(MESSAGE_READS).insert(row);

// Atomic send: the RPC inserts the message and returns its id.
const sendChatMessage = async ({ jobId, senderUid, senderName, senderRole, text }) =>
  supabase.rpc('send_chat_message', {
    p_job_id: jobId,
    p_sender_uid: senderUid,
    p_sender_name: senderName,
    p_sender_role: senderRole,
    p_text: text,
  });

module.exports = {
  findByJobId,
  findByJobIds,
  findRecentByJobIds,
  findReadsForMessages,
  findReadsForUser,
  insertReads,
  insertReadIfAbsent,
  sendChatMessage,
};
