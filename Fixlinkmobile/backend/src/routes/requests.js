// /api/requests — repair requests, chat, notifications and live tracking.
//
// This file is intentionally a thin map: guards, then one line per endpoint.
// Every handler lives in controllers/, the business rules in services/, and the
// database access in repositories/.
//
// REGISTRATION ORDER IS LOAD-BEARING. Express matches layers in the order they
// were added, so the original sequence is frozen here and asserted by
// test/requests.routes.test.js. Two examples of why:
//   - `GET /technician/:technicianUid/workload` must precede
//     `GET /technician/:technicianUid`, or the workload path is swallowed.
//   - literal paths such as `GET /messages/unread` and
//     `PUT /notifications/:id/read` must stay ahead of the generic `/:id/*`.
// Do not "tidy" these into domain blocks; that would reorder them.

const express = require('express');

const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const { memoryUpload } = require('../middleware/upload');
const { perUserLimiter, unreadLimiter, otpVerifyLimiter } = require('../middleware/requestLimits');
const { otpGuard } = require('../domain/otpPolicy');

const jobController = require('../controllers/jobController');
const chatController = require('../controllers/chatController');
const trackingController = require('../controllers/trackingController');
const notificationController = require('../controllers/notificationController');

// Multer errors default to an HTML 500 page, which the app cannot display.
// Convert them to JSON so chat and submit screens show a readable message.
const handlePhotoUpload = (field) => (req, res, next) => {
  memoryUpload.single(field)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'The photo must be 5MB or smaller. Please use a smaller image.' });
      }
      return res.status(400).json({ error: 'Photo upload failed. Please use an image file.' });
    }
    next();
  });
};

// Every endpoint requires a valid session, then the shared per-user budget.
// Both run at router level so no route can accidentally ship unguarded.
router.use(requireAuth);
router.use(perUserLimiter);

// --- Repair requests: submit + available feed ------------------------------
router.post('/', handlePhotoUpload('photo'), jobController.submitRequest);
router.get('/', jobController.listAvailableJobs);

// --- Chat: unread badge + inbox --------------------------------------------
router.get('/messages/unread', unreadLimiter, chatController.getUnreadNotifications);
router.get('/messages/inbox', chatController.getInbox);

// --- Notifications ---------------------------------------------------------
router.get('/notifications', notificationController.listNotifications);
router.put('/notifications/:id/read', notificationController.markNotificationRead);

// --- Single job (notification deep link) -----------------------------------
router.get('/job/:id', trackingController.getJobForDeepLink);

// --- Chat: read receipts on a job thread -----------------------------------
router.put('/accepted/:id/messages/read', chatController.markMessagesRead);

// --- Customer's own jobs ---------------------------------------------------
router.get('/customer/:customerName', jobController.listCustomerJobs);

// --- Technician workload + job list ----------------------------------------
router.get('/technician/:technicianUid/workload', jobController.getTechnicianWorkload);
router.get('/technician/:technicianUid', jobController.listTechnicianJobs);

// --- Chat: the message thread itself ---------------------------------------
router.get('/accepted/:id/messages', chatController.listMessages);
// Optional photo attachment: JSON when text-only, multipart when a photo rides along.
router.post('/accepted/:id/messages', handlePhotoUpload('photo'), chatController.sendMessage);

// --- Queue actions ---------------------------------------------------------
router.put('/:id/decline', jobController.declineJob);
router.put('/:id/cancel', jobController.cancelJob);

// --- Live tracking ---------------------------------------------------------
router.get('/accepted/:id/location', trackingController.getJobLocation);
router.get('/accepted/:id/live-tracking', trackingController.getLiveTracking);
router.put('/accepted/:id/customer-location', trackingController.updateCustomerLocation);

// --- Technician status changes --------------------------------------------
router.put('/accepted/:id/status', jobController.updateJobStatus);

// --- Confirmation -> ready -> arrival -> no-show workflow -----------------
router.post('/:id/confirm-repair', jobController.confirmRepair);
router.post('/:id/customer-ready', jobController.markCustomerReady);
router.post('/:id/arrive', jobController.recordArrival);
router.post('/:id/report-no-show', jobController.reportNoShow);

// --- Completed history + review -------------------------------------------
router.get('/completed/:customerName', jobController.listCompletedJobs);
router.post('/:id/review', jobController.submitReview);
router.post('/:id/rate-customer', jobController.rateCustomer);
// UAT #8: report the other party as a scammer.
router.post('/:id/report-scam', jobController.reportScam);

// --- Accept a job ----------------------------------------------------------
router.put('/:id/accept', jobController.acceptJob);

// --- Completion: two independent caps, strict limiter then per-job lockout -
router.post(
  '/:id/verify-completion',
  otpVerifyLimiter,
  otpGuard.gate,
  jobController.verifyCompletion
);

module.exports = router;
