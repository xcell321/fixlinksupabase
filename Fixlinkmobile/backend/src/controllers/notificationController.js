// HTTP layer for in-app notifications.

const { handleRequest } = require('./handleRequest');
const notificationService = require('../services/notificationService');

// GET /api/requests/notifications — read + unread, newest first.
const listNotifications = handleRequest(
  { logLabel: 'Error loading notifications:', serverMessage: 'Unable to load notifications.' },
  (req) => notificationService.listNotifications({ uid: String(req.authUser.uid) })
);

// PUT /api/requests/notifications/:id/read
const markNotificationRead = handleRequest(
  { logLabel: 'Error marking notification read:', serverMessage: 'Unable to mark notification as read.' },
  (req) => notificationService.markNotificationRead({
    uid: String(req.authUser.uid),
    notificationId: req.params.id,
  })
);

module.exports = { listNotifications, markNotificationRead };
