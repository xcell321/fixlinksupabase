// Pure serializers for chat messages and notifications.

const serializeMessage = (row) => ({
  id: row.id,
  senderUid: row.sender_uid,
  senderName: row.sender_name,
  senderRole: row.sender_role,
  // Empty string for an image-only message; the client renders the photo alone.
  text: row.text,
  imageUrl: row.image_url || null,
  timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
});

// Notification panel payload. `read` is the source of truth for the badge
// count, so it is always returned as a real boolean.
const serializeNotification = (row) => ({
  id: row.id,
  jobId: row.job_id,
  messageId: row.message_id,
  type: row.type,
  senderName: row.sender_name || 'Contact',
  text: row.text,
  timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
  read: row.read === true,
  readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
});

// The unread feed omits `readAt` (it only ever returns unread rows, plus the
// legacy back-fill which has no timestamp yet).
const serializeUnreadNotification = (row) => ({
  id: row.id,
  jobId: row.job_id,
  messageId: row.message_id,
  type: row.type,
  senderName: row.sender_name || 'Contact',
  text: row.text,
  timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
  read: row.read === true,
});

module.exports = { serializeMessage, serializeNotification, serializeUnreadNotification };
