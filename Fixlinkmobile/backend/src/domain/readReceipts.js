// Pure helper for chat read receipts.
//
// `message_reads` rows are (message_id, user_uid) pairs. The API needs them
// grouped per message so a thread can be serialized in one pass, and so the
// unread count can be computed without an O(n*m) scan.

// reads: [{ message_id, user_uid }] -> { [messageId]: [userUid, ...] }
const groupReadsByMessage = (reads) => {
  const byMessage = {};
  (reads || []).forEach((read) => {
    if (!byMessage[read.message_id]) byMessage[read.message_id] = [];
    byMessage[read.message_id].push(read.user_uid);
  });
  return byMessage;
};

module.exports = { groupReadsByMessage };
