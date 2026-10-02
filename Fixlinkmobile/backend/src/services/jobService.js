// Job (repair request) service — barrel facade.
//
// The lifecycle rules now live in focused modules under services/jobs/:
//   jobSubmitService.js     submission + photo + AI auto-fill
//   jobFeedService.js       available/customer/completed/technician lists
//   jobLifecycleService.js  accept/decline/cancel/confirm/ready/arrive/status
//   jobCompletionService.js OTP verify + no-show
//   reviewService.js        reviews + rating sync
//
// This file re-exports the same 16 functions so existing imports
// (controllers/jobController.js and tests) keep working unchanged.

const { submitRequest } = require('./jobs/jobSubmitService');
const {
  listAvailableJobs,
  listCustomerJobs,
  listCompletedJobs,
  listTechnicianJobs,
  getTechnicianWorkload,
} = require('./jobs/jobFeedService');
const {
  acceptJob,
  declineJob,
  cancelJob,
  confirmRepair,
  markCustomerReady,
  recordArrival,
  updateJobStatus,
} = require('./jobs/jobLifecycleService');
const { verifyCompletion, reportNoShow } = require('./jobs/jobCompletionService');
const { submitReview } = require('./jobs/reviewService');
const { rateCustomer } = require('./jobs/customerRatingService');
const { reportScam } = require('./jobs/scamReportService');

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
