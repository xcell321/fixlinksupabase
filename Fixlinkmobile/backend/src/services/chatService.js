// Chat service: the messaging inbox, unread feed, message threads and read
// receipts. HTTP shape lives in controllers/chatController.js.

const jobRepository = require('../repositories/jobRepository');
const messageRepository = require('../repositories/messageRepository');
const notificationRepository = require('../repositories/notificationRepository');
const userRepository = require('../repositories/userRepository');
const { serializeMessage, serializeUnreadNotification } = require('../domain/chatSerializer');
const { groupReadsByMessage } = require('../domain/readReceipts');
const { HttpError } = require('../domain/httpError');
const { uploadBuffer } = require('../config/supabase');
const { withTimeout } = require('../utils/async');
const { NOTIFICATION_TYPES } = require('./notificationService');

const CHAT_ROLES = ['customer', 'technician'];

// Shared identity gate for the inbox/unread feeds. `role` picks which side of
// the job the caller is on, which in turn picks the column to filter on.
const resolveViewer = ({ uid, role, authUid }) => {
  if (!uid || !CHAT_ROLES.includes(role)) {
    throw new HttpError(400, { error: 'User identity and role are required.' });
  }
  if (String(uid) !== authUid) {
    throw new HttpError(403, { error: 'User identity does not match the authenticated account.' });
  }
  return {
    profileUid: String(authUid),
    field: role === 'technician' ? 'technician_uid' : 'customer_uid',
  };
};

// Attach read receipts to a page of messages. [{ ...message, readBy: [uid] }]
const withReadBy = async (messageRows) => {
  if (!messageRows || messageRows.length === 0) return [];
  const reads = await messageRepository.findReadsForMessages(messageRows.map((m) => m.id));
  const readsByMessage = groupReadsByMessage(reads);
  return messageRows.map((row) => ({
    ...serializeMessage(row),
    readBy: readsByMessage[row.id] || [],
  }));
};

// GET /api/requests/messages/unread
// Returns the unread notification list, back-filling a notification for any
// older chat message that predates the notifications table.
const getUnreadNotifications = async ({ uid, role, authUid }) => {
  const { profileUid, field } = resolveViewer({ uid, role, authUid });

  const [jobs, notificationRows] = await Promise.all([
    jobRepository.findChatLabelsByField(field, profileUid),
    notificationRepository.findByRecipient(profileUid, NOTIFICATION_TYPES),
  ]);

  const allSavedNotifications = notificationRows
    .map((row) => ({ id: row.id, ...row }))
    .filter((notification) => NOTIFICATION_TYPES.includes(notification.type));
  const savedNotifications = allSavedNotifications.filter((notification) => notification.read !== true);
  const notifications = savedNotifications.map(serializeUnreadNotification);
  const savedMessageIds = new Set(
    allSavedNotifications.map((notification) => notification.message_id).filter(Boolean)
  );
  const legacyNotifications = [];

  if (jobs.length > 0) {
    const recentMessages = await messageRepository.findRecentByJobIds(jobs.map((job) => job.id), 100);
    const readsByMessage = groupReadsByMessage(
      await messageRepository.findReadsForMessages(recentMessages.map((message) => message.id))
    );

    recentMessages.forEach((message) => {
      const readBy = readsByMessage[message.id] || [];
      if (message.sender_uid !== profileUid && !readBy.includes(profileUid) && !savedMessageIds.has(message.id)) {
        const jobMeta = jobs.find((item) => item.id === message.job_id) || {};
        legacyNotifications.push({
          jobId: message.job_id,
          messageId: message.id,
          senderName: message.sender_name || (role === 'customer' ? jobMeta.technician_name : jobMeta.customer_name) || 'Contact',
          text: message.text || 'New message',
          timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : null,
          senderUid: message.sender_uid,
          senderNameForInsert: message.sender_name,
        });
      }
    });
  }

  if (legacyNotifications.length > 0) {
    const inserts = legacyNotifications.map((notification) => ({
      type: 'chat',
      recipient_uid: profileUid,
      sender_uid: notification.senderUid || null,
      sender_name: notification.senderNameForInsert || notification.senderName,
      job_id: notification.jobId,
      message_id: notification.messageId,
      text: notification.text,
      timestamp: notification.timestamp ? new Date(notification.timestamp).toISOString() : new Date().toISOString(),
      read: false,
    }));
    const { data: created, error: insertError } = await notificationRepository.insertManyReturningIds(inserts);
    if (!insertError && created) {
      created.forEach((row, index) => {
        notifications.push({ ...legacyNotifications[index], id: row.id });
      });
    }
  }

  notifications.sort((first, second) =>
    String(second.timestamp || '').localeCompare(String(first.timestamp || '')));

  return { body: notifications };
};

// GET /api/requests/messages/inbox
const getInbox = async ({ uid, role, authUid }) => {
  const { profileUid, field } = resolveViewer({ uid, role, authUid });
  const jobs = await jobRepository.findByOwnerField(field, profileUid);

  if (jobs.length === 0) return { body: [] };

  const allMessages = await messageRepository.findByJobIds(jobs.map((job) => job.id));

  const messagesByJob = {};
  allMessages.forEach((message) => {
    if (!messagesByJob[message.job_id]) messagesByJob[message.job_id] = [];
    messagesByJob[message.job_id].push(message);
  });

  const readsByMessage = groupReadsByMessage(
    await messageRepository.findReadsForMessages(allMessages.map((message) => message.id))
  );

  // Peer contact card lookup: technician sees the customer's phone and photo,
  // and vice versa, so a chat shows a real face instead of only initials.
  const peerUidField = field === 'technician_uid' ? 'customer_uid' : 'technician_uid';
  const peerUids = [...new Set(jobs.map((job) => job[peerUidField]).filter(Boolean).map(String))];
  const phoneByUid = {};
  const imageByUid = {};
  (await userRepository.findContactsByIds(peerUids)).forEach((row) => {
    phoneByUid[String(row.id)] = row.phone || null;
    imageByUid[String(row.id)] = row.profile_image || null;
  });

  const inbox = jobs.map((job) => {
    if (String(job.status || '').toLowerCase() === 'cancelled') return null;

    const messages = messagesByJob[job.id] || [];
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const unreadCount = messages.filter((message) =>
      message.sender_uid !== profileUid && !(readsByMessage[message.id] || []).includes(profileUid)
    ).length;

    const peerName = field === 'technician_uid' ? job.customer_name : job.technician_name;
    const peerUid = job[peerUidField] ? String(job[peerUidField]) : null;
    return {
      jobId: job.id,
      jobCode: String(job.id || '').slice(0, 6).toUpperCase(),
      peerUid,
      peerPhone: peerUid ? phoneByUid[peerUid] || null : null,
      peerImage: peerUid ? imageByUid[peerUid] || null : null,
      peerName: peerName || (field === 'technician_uid' ? 'Customer' : 'Technician'),
      peerInitial: String(peerName || (field === 'technician_uid' ? 'C' : 'T')).charAt(0).toUpperCase(),
      applianceType: job.appliance_type || 'Repair Job',
      status: job.status || 'Active',
      lastMessage: lastMessage
        ? {
            text: lastMessage.text || (lastMessage.image_url ? 'Sent a photo' : ''),
            imageUrl: lastMessage.image_url || null,
            senderName: lastMessage.sender_name || 'Contact',
            senderUid: lastMessage.sender_uid ? String(lastMessage.sender_uid) : null,
            timestamp: lastMessage.timestamp ? new Date(lastMessage.timestamp).toISOString() : null,
          }
        : null,
      unreadCount,
    };
  });

  // Most recent conversation first; threads without messages sink to the bottom.
  const sorted = inbox
    .filter((item) => item !== null)
    .sort((a, b) => String(b.lastMessage?.timestamp || '').localeCompare(String(a.lastMessage?.timestamp || '')));

  return { body: sorted };
};

// GET /api/requests/accepted/:id/messages
const listMessages = async ({ jobId, authUid }) => {
  const job = await requireParticipant(jobId, authUid);
  const rows = await messageRepository.findByJobId(job.id);
  return { body: await withReadBy(rows) };
};

// POST /api/requests/accepted/:id/messages
// A message carries text, a photo, or both — but never nothing.
const sendMessage = async ({ jobId, authUid, senderUid, senderName, senderRole, text, file }) => {
  const messageText = String(text || '').trim();
  if (!senderUid || !senderName || !senderRole || (!messageText && !file)) {
    throw new HttpError(400, { error: 'Sender identity and a message or photo are required.' });
  }
  if (!CHAT_ROLES.includes(String(senderRole))) {
    throw new HttpError(400, { error: 'Sender role must be customer or technician.' });
  }
  if (String(senderUid) !== authUid) {
    throw new HttpError(403, { error: 'Sender identity does not match the authenticated account.' });
  }
  if (file && !String(file.mimetype || '').startsWith('image/')) {
    throw new HttpError(400, { error: 'Only image attachments can be sent in chat.' });
  }

  const job = await requireParticipant(jobId, authUid);

  // Upload first: a failed upload must never leave a half-saved message behind.
  let imageUrl = null;
  if (file) {
    try {
      imageUrl = await withTimeout(uploadBuffer({
        folder: 'chat-images',
        file,
        buffer: file.buffer,
        contentType: file.mimetype,
      }), 45000, 'Photo upload timed out. Please try again with a smaller image.');
    } catch (uploadError) {
      console.error('Chat photo upload failed:', uploadError.message);
      const timedOut = /timed out|timeout/i.test(String(uploadError.message || ''));
      throw new HttpError(timedOut ? 504 : 502, { error: `Photo upload failed: ${uploadError.message}. Please try again.` });
    }
  }

  const { data, error } = await messageRepository.sendChatMessage({
    jobId: job.id,
    senderUid: String(senderUid),
    senderName: String(senderName),
    senderRole: String(senderRole),
    text: messageText,
    imageUrl,
  });

  if (error) {
    console.error('Error saving job message:', error.message);
    // A stale database (schema.sql migration not run, or the PostgREST
    // schema cache not reloaded) surfaces here as a missing-function error.
    // Fail retryable instead of a flat 500 so the app can ask for a retry.
    if (/could not find the function|PGRST202|schema cache/i.test(String(error.message || '') + String(error.code || ''))) {
      console.error('Chat RPC missing: run backend/src/db/schema.sql in Supabase SQL Editor, then reload the PostgREST schema cache.');
      throw new HttpError(503, { error: 'Chat is temporarily unavailable. Please try again in a moment.' });
    }
    throw new HttpError(500, { error: 'Unable to save job message.' });
  }

  // The `send_chat_message` RPC already fans out the chat notification
  // atomically with the message insert. Do not insert a second row here,
  // or every message would appear twice in the feed and badge.

  return {
    status: 201,
    body: {
      id: data,
      senderUid: String(senderUid),
      senderName: String(senderName),
      senderRole: String(senderRole),
      text: messageText,
      imageUrl,
      timestamp: new Date().toISOString(),
      readBy: [String(senderUid)],
    },
  };
};

// PUT /api/requests/accepted/:id/messages/read
const markMessagesRead = async ({ jobId, authUid, viewerUid }) => {
  if (!viewerUid) throw new HttpError(400, { error: 'Viewer identity is required.' });
  if (String(viewerUid) !== authUid) {
    throw new HttpError(403, { error: 'Viewer identity does not match the authenticated account.' });
  }

  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Accepted job not found.' });

  const messageRows = await messageRepository.findByJobId(job.id, { ordered: false });
  const alreadyRead = new Set(
    (await messageRepository.findReadsForUser(String(viewerUid), messageRows.map((m) => m.id)))
      .map((read) => read.message_id)
  );
  const unreadMessages = messageRows.filter((message) =>
    message.sender_uid !== String(viewerUid) && !alreadyRead.has(message.id));

  if (unreadMessages.length > 0) {
    const { error: insertError } = await messageRepository.insertReads(
      unreadMessages.map((message) => ({
        message_id: message.id,
        user_uid: String(viewerUid),
        read_at: new Date().toISOString(),
      }))
    );
    if (insertError) console.error('Error inserting message reads:', insertError.message);
  }

  const { error: notifError } = await notificationRepository.markJobNotificationsRead(
    String(viewerUid),
    job.id,
    new Date().toISOString()
  );
  if (notifError) console.error('Error marking notifications read:', notifError.message);

  return { body: { markedCount: unreadMessages.length } };
};

// A chat participant is the job's customer or its technician.
const requireParticipant = async (jobId, authUid) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Accepted job not found.' });
  const uid = String(authUid);
  if (uid !== String(job.customer_uid) && uid !== String(job.technician_uid)) {
    throw new HttpError(403, { error: 'Not authorized.' });
  }
  return job;
};

module.exports = {
  getUnreadNotifications,
  getInbox,
  listMessages,
  sendMessage,
  markMessagesRead,
};
