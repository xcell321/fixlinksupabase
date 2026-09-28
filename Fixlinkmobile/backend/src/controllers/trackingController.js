// HTTP layer for job lookup and live tracking.

const { handleRequest } = require('./handleRequest');
const trackingService = require('../services/trackingService');

// GET /api/requests/job/:id — notification deep link.
const getJobForDeepLink = handleRequest(
  { logLabel: 'Error loading job:', serverMessage: 'Unable to load job.' },
  (req) => trackingService.getJobForDeepLink({ jobId: req.params.id, authUid: req.authUser.uid })
);

// GET /api/requests/accepted/:id/location
const getJobLocation = handleRequest(
  { logLabel: 'Error loading customer location:', serverMessage: 'Unable to load customer location.' },
  (req) => trackingService.getJobLocation({ jobId: req.params.id, authUid: req.authUser.uid })
);

// GET /api/requests/accepted/:id/live-tracking
const getLiveTracking = handleRequest(
  { logLabel: 'Error loading live tracking:', serverMessage: 'Unable to load live tracking.' },
  (req) => trackingService.getLiveTracking({ jobId: req.params.id, authUid: req.authUser.uid })
);

// PUT /api/requests/accepted/:id/customer-location
const updateCustomerLocation = handleRequest(
  { logLabel: 'Error updating customer location:', serverMessage: 'Unable to update customer location.' },
  (req) => trackingService.updateCustomerLocation({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    latitude: req.body?.latitude,
    longitude: req.body?.longitude,
    customerUid: req.body?.customerUid,
  })
);

module.exports = { getJobForDeepLink, getJobLocation, getLiveTracking, updateCustomerLocation };
