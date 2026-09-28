// Central identity guards for job/request ownership.
// Replaces 12+ inline copies of the same 403 messages across jobService.js,
// chatService.js, users.js and profile.js. Behavior is identical: throw
// HttpError(403) with the original message so API responses do not change.

const { HttpError } = require('../domain/httpError');

const TECHNICIAN_MISMATCH = 'Technician identity does not match the authenticated account.';
const CUSTOMER_MISMATCH = 'Customer identity does not match the authenticated account.';

function assertTechnicianOwner(authUid, technicianUid, message = TECHNICIAN_MISMATCH) {
  if (!technicianUid || String(technicianUid) !== String(authUid)) {
    throw new HttpError(403, { error: message });
  }
}

function assertCustomerOwner(authUid, customerUid, message = CUSTOMER_MISMATCH) {
  if (!customerUid || String(customerUid) !== String(authUid)) {
    throw new HttpError(403, { error: message });
  }
}

module.exports = {
  TECHNICIAN_MISMATCH,
  CUSTOMER_MISMATCH,
  assertTechnicianOwner,
  assertCustomerOwner,
};
