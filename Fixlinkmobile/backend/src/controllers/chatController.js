// HTTP layer for chat: the unread feed, the inbox, message threads and read
// receipts. Identity/authorization checks live in services/chatService.js; this
// file only maps request fields to service arguments.

const { handleRequest } = require('./handleRequest');
const chatService = require('../services/chatService');

// GET /api/requests/messages/unread
const getUnreadNotifications = handleRequest(
  { logLabel: 'Error loading unread messages:', serverMessage: 'Unable to load unread messages.' },
  (req) => chatService.getUnreadNotifications({
    uid: req.query?.uid,
    role: req.query?.role,
    authUid: req.authUser.uid,
  })
);

// GET /api/requests/messages/inbox
const getInbox = handleRequest(
  { logLabel: 'Error loading inbox:', serverMessage: 'Unable to load inbox.' },
  (req) => chatService.getInbox({
    uid: req.query?.uid,
    role: req.query?.role,
    authUid: req.authUser.uid,
  })
);

// GET /api/requests/accepted/:id/messages
const listMessages = handleRequest(
  { logLabel: 'Error loading job messages:', serverMessage: 'Unable to load job messages.' },
  (req) => chatService.listMessages({ jobId: req.params.id, authUid: req.authUser.uid })
);

// POST /api/requests/accepted/:id/messages
const sendMessage = handleRequest(
  { logLabel: 'Error saving job message:', serverMessage: 'Unable to save job message.' },
  (req) => chatService.sendMessage({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    senderUid: req.body?.senderUid,
    senderName: req.body?.senderName,
    senderRole: req.body?.senderRole,
    text: req.body?.text,
  })
);

// PUT /api/requests/accepted/:id/messages/read
const markMessagesRead = handleRequest(
  { logLabel: 'Error marking messages read:', serverMessage: 'Unable to mark messages as read.' },
  (req) => chatService.markMessagesRead({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    viewerUid: req.body?.viewerUid,
  })
);

module.exports = {
  getUnreadNotifications,
  getInbox,
  listMessages,
  sendMessage,
  markMessagesRead,
};
