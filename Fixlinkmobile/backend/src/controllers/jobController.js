// HTTP layer for repair requests (jobs). Each handler only reads the request,
// calls the service and lets handleRequest shape the response.

const { handleRequest } = require('./handleRequest');
const jobService = require('../services/jobService');

const submitRequest = handleRequest(
  { logLabel: 'Error saving repair request:', serverMessage: 'Internal Server Error', status: 201 },
  (req) => jobService.submitRequest({
    authUid: req.authUser.uid,
    body: req.body || {},
    file: req.file,
  })
);

const listAvailableJobs = handleRequest(
  { logLabel: 'Error fetching repair requests:', serverMessage: 'Internal Server Error' },
  (req) => jobService.listAvailableJobs({ authUid: req.authUser.uid, query: req.query || {} })
);

const listCustomerJobs = handleRequest(
  { logLabel: 'Error loading customer requests:', serverMessage: 'Unable to load request status.' },
  (req) => jobService.listCustomerJobs({
    customerName: req.params.customerName,
    customerUid: req.query.customerUid,
    authUid: req.authUser.uid,
  })
);

const listCompletedJobs = handleRequest(
  { logLabel: 'Error loading completed jobs:', serverMessage: 'Unable to load completed jobs.' },
  (req) => jobService.listCompletedJobs({
    customerName: req.params.customerName,
    customerUid: req.query.customerUid,
    authUid: req.authUser.uid,
  })
);

const listTechnicianJobs = handleRequest(
  { logLabel: 'Error loading technician jobs:', serverMessage: 'Unable to load technician jobs.' },
  (req) => jobService.listTechnicianJobs({
    technicianUid: req.params.technicianUid,
    authUid: req.authUser.uid,
  })
);

const getTechnicianWorkload = handleRequest(
  { logLabel: 'Error loading technician workload:', serverMessage: 'Unable to load workload.' },
  (req) => jobService.getTechnicianWorkload({
    technicianUid: req.params.technicianUid,
    authUid: req.authUser.uid,
  })
);

const acceptJob = handleRequest(
  { logLabel: 'Error accepting job:', serverMessage: 'Internal Server Error' },
  (req) => jobService.acceptJob({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    technicianUid: req.body?.technicianUid,
    technicianName: req.body?.technicianName,
  })
);

const declineJob = handleRequest(
  { logLabel: 'Error declining request:', serverMessage: 'Unable to decline request.' },
  (req) => jobService.declineJob({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    technicianUid: req.body?.technicianUid,
  })
);

const cancelJob = handleRequest(
  { logLabel: 'Error cancelling repair request:', serverMessage: 'Unable to cancel repair request.' },
  (req) => jobService.cancelJob({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    cancellationReason: req.body?.cancellationReason,
  })
);

const confirmRepair = handleRequest(
  { logLabel: 'Error confirming repair request:', serverMessage: 'Unable to confirm repair request.' },
  (req) => jobService.confirmRepair({ jobId: req.params.id, authUid: req.authUser.uid })
);

const markCustomerReady = handleRequest(
  { logLabel: 'Error marking request ready:', serverMessage: 'Unable to mark request ready.' },
  (req) => jobService.markCustomerReady({ jobId: req.params.id, authUid: req.authUser.uid })
);

const recordArrival = handleRequest(
  { logLabel: 'Error recording arrival:', serverMessage: 'Unable to record arrival.' },
  (req) => jobService.recordArrival({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    technicianUid: req.body?.technicianUid,
  })
);

const updateJobStatus = handleRequest(
  { logLabel: 'Error updating job status:', serverMessage: 'Unable to update job status.' },
  (req) => jobService.updateJobStatus({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    status: req.body?.status,
    technicianUid: req.body?.technicianUid,
    cancellationReason: req.body?.cancellationReason,
  })
);

const verifyCompletion = handleRequest(
  { logLabel: 'Error verifying completion:', serverMessage: 'Internal Server Error' },
  (req) => jobService.verifyCompletion({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    code: req.body?.code,
  })
);

const reportNoShow = handleRequest(
  { logLabel: 'Error reporting no-show:', serverMessage: 'Unable to report no-show.' },
  (req) => jobService.reportNoShow({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    technicianUid: req.body?.technicianUid,
    reason: req.body?.reason,
  })
);

const submitReview = handleRequest(
  { logLabel: 'Error submitting review:', serverMessage: 'Unable to submit review.', status: 201 },
  (req) => jobService.submitReview({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    customerName: req.body?.customerName,
    rating: req.body?.rating,
    comment: req.body?.comment,
  })
);

const rateCustomer = handleRequest(
  { logLabel: 'Error submitting customer rating:', serverMessage: 'Unable to submit customer rating.', status: 201 },
  (req) => jobService.rateCustomer({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    technicianUid: req.body?.technicianUid,
    rating: req.body?.rating,
    comment: req.body?.comment,
  })
);

const reportScam = handleRequest(
  { logLabel: 'Error filing scam report:', serverMessage: 'Unable to file the scam report.', status: 201 },
  (req) => jobService.reportScam({
    jobId: req.params.id,
    authUid: req.authUser.uid,
    reason: req.body?.reason,
  })
);

module.exports = {
  submitRequest,
  listAvailableJobs,
  listCustomerJobs,
  listCompletedJobs,
  listTechnicianJobs,
  getTechnicianWorkload,
  acceptJob,
  declineJob,
  cancelJob,
  confirmRepair,
  markCustomerReady,
  recordArrival,
  updateJobStatus,
  verifyCompletion,
  reportNoShow,
  submitReview,
  rateCustomer,
  reportScam,
};
