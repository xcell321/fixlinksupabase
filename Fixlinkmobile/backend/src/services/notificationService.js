// In-app notification service: the workflow fan-out helper used by the job
// lifecycle, plus the notification feed endpoints.

const notificationRepository = require('../repositories/notificationRepository');
const messageRepository = require('../repositories/messageRepository');
const { serializeNotification } = require('../domain/chatSerializer');
const { HttpError } = require('../domain/httpError');

// Only chat and job notifications are surfaced to the app.
const NOTIFICATION_TYPES = ['chat', 'job'];

// Fan out an in-app notification. Best-effort: a failure is logged, never
// thrown, so a notification problem can never fail the workflow action that
// triggered it.
const notify = async (recipientUid, { type = 'job', text, jobId, senderUid = null, senderName = null }) => {
  if (!recipientUid) return;
  const { error } = await notificationRepository.insertOne({
    recipient_uid: String(recipientUid),
    sender_uid: senderUid ? String(senderUid) : null,
    sender_name: senderName,
    job_id: jobId || null,
    type,
    text: String(text || '').trim(),
    timestamp: new Date().toISOString(),
    read: false,
  });
  if (error) console.warn('Unable to create workflow notification:', error.message);
};

// GET /api/requests/notifications — read + unread, newest first.
const listNotifications = async ({ uid }) => {
  const rows = await notificationRepository.findRecentByRecipient(uid, NOTIFICATION_TYPES, 100);
  return { body: rows.map(serializeNotification) };
};

// PUT /api/requests/notifications/:id/read
// Idempotent: clicking an already-read notification never decrements twice.
const markNotificationRead = async ({ uid, notificationId }) => {
  const notifId = String(notificationId || '').trim();
  if (!notifId) throw new HttpError(400, { error: 'Notification id is required.' });

  const { row: existing, error: fetchError } = await notificationRepository.findById(notifId);
  if (fetchError) {
    console.error('Error fetching notification for mark-read:', fetchError.message);
    throw new HttpError(500, { error: 'Unable to mark notification as read.' });
  }
  if (!existing) {
    // Notification may have been cascade-deleted with its job, or never
    // existed. Per spec, mark optimistically instead of raising 404 noise.
    return { body: { alreadyRead: true, read: true, notFound: true } };
  }
  if (String(existing.recipient_uid) !== uid) {
    throw new HttpError(403, { error: 'Not authorized.' });
  }
  if (existing.read === true) {
    return { body: { alreadyRead: true, read: true } };
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await notificationRepository.markRead(notifId, uid, nowIso);
  if (updateError) throw updateError;

  // For chat notifications also mark the underlying message as read so the
  // inbox unreadCount stays in sync without a separate call.
  if (existing.message_id) {
    const { error: readError } = await messageRepository.insertReadIfAbsent({
      message_id: existing.message_id,
      user_uid: uid,
      read_at: nowIso,
    });
    if (readError
      && !String(readError.code).includes('23505')
      && !/duplicate/i.test(String(readError.message || ''))) {
      console.warn('Unable to sync message_reads for notification:', readError.message);
    }
  }

  return { body: { marked: true, read: true } };
};

module.exports = { NOTIFICATION_TYPES, notify, listNotifications, markNotificationRead };
