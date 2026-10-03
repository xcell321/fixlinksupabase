// Job completion service: OTP verification and no-show reports.
// Extracted verbatim from services/jobService.js. Behavior is unchanged.

const jobRepository = require('../../repositories/jobRepository');
const { isNoShowReportable, isTechnicianArrived, stageOf } = require('../../domain/jobWorkflow');
const { otpGuard, OTP_MAX_ATTEMPTS } = require('../../domain/otpPolicy');
const { HttpError } = require('../../domain/httpError');
const { assertTechnicianOwner } = require('../../middleware/identityGuards');
const { notify } = require('../notificationService');
const { suspendAccount } = require('./accountSuspension');
const {
  waitProgress,
  waitMessage,
  shouldSuspendForNoShow,
  customerNoShowLimit,
  customerNoShowWaitMinutes,
} = require('../../domain/autoSuspendPolicy');

// POST /api/requests/:id/verify-completion — the completion OTP check.
const verifyCompletion = async ({ jobId, authUid, code }) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Job not found.' });
  if (job.technician_uid !== authUid) {
    throw new HttpError(403, { error: 'Only the assigned technician can verify completion.' });
  }
  if (job.status !== 'In Progress') {
    throw new HttpError(409, { error: 'Job must be in progress before completion can be verified.' });
  }

  if (job.verification_code !== String(code).trim()) {
    otpGuard.recordFail(job.id, authUid);
    const left = otpGuard.remainingAttempts(job.id, authUid);
    throw new HttpError(400, {
      error: `Invalid verification code.${left > 0 && left < OTP_MAX_ATTEMPTS ? ` ${left} attempt${left === 1 ? '' : 's'} remaining.` : ''}`,
    });
  }
  otpGuard.recordSuccess(job.id, authUid);

  await jobRepository.updateById(job.id, { status: 'Completed', completed_at: new Date().toISOString() });

  await notify(job.customer_uid, {
    text: `Your ${job.appliance_type || 'repair'} request has been completed. We hope everything is fixed to your satisfaction!`,
    jobId: job.id,
    senderUid: authUid,
    senderName: job.technician_name || 'Technician',
  });

  return { body: { message: 'Job completed successfully!' } };
};

// POST /api/requests/:id/report-no-show
//
// UAT #2 — the technician reports that nobody was at the service location.
// Two gates make the report trustworthy before it counts:
//   1. the technician has actually recorded an arrival, and
//   2. the technician has waited CUSTOMER_NOSHOW_WAIT_MINUTES (30-60 min) since
//      that arrival.
// Once the report is accepted it is logged atomically, and the customer is
// auto-suspended at CUSTOMER_NOSHOW_LIMIT reported no-shows.
const reportNoShow = async ({ jobId, authUid, technicianUid, reason }) => {
  assertTechnicianOwner(authUid, technicianUid);
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job || job.technician_uid !== technicianUid) {
    throw new HttpError(404, { error: 'Assigned job not found.' });
  }
  if (!isNoShowReportable(job.status)) {
    throw new HttpError(409, { error: 'A no-show can only be reported once the request is underway.' });
  }
  // The wait window is measured from the arrival stamp, so there has to be one.
  if (!isTechnicianArrived(job)) {
    throw new HttpError(409, {
      error: 'Record your arrival at the service location before reporting a no-show.',
      code: 'ARRIVAL_REQUIRED',
    });
  }

  const wait = waitProgress(job);
  if (!wait.ready) {
    throw new HttpError(409, {
      error: waitMessage(wait.remainingMs),
      code: 'CUSTOMER_NO_SHOW_WAIT',
      waitMinutes: wait.waitMinutes,
      waitedMinutes: wait.waitedMinutes,
      remainingMinutes: Math.max(Math.ceil(wait.remainingMs / 60000), 0),
    });
  }

  const { data: noShowCount, error: noShowError } = await jobRepository.recordNoShow({
    jobId: job.id,
    customerUid: job.customer_uid,
    technicianUid,
    stage: stageOf(job.status) || 'after_ready',
    reason: String(reason || '').trim() || 'No one available at the service location',
  });
  if (noShowError) throw noShowError;

  await jobRepository.updateById(job.id, { status: 'No-Show', updated_at: new Date().toISOString() });

  const count = Number(noShowCount) || 1;
  let customerSuspended = false;
  if (job.customer_uid && shouldSuspendForNoShow(count)) {
    customerSuspended = await suspendAccount(job.customer_uid, { reason: 'customer no-show' });
  }

  const level = customerSuspended
    ? 'suspended'
    : count >= 3
      ? 'restricted'
      : count === 2
        ? 'flagged'
        : 'warning';
  const notice = customerSuspended
    ? `Your account has been suspended after ${customerNoShowLimit()} reported no-show${customerNoShowLimit() === 1 ? '' : 's'}.`
    : count >= 3
      ? 'A report has been submitted for review.'
      : count === 2
        ? 'Your account has been flagged for review.'
        : 'This is a warning. Repeated no-shows may restrict your account.';

  await notify(job.customer_uid, {
    text: `The technician reported a no-show (${count === 1 ? 'first' : count === 2 ? 'second' : 'repeated'} occurrence) after waiting ${wait.waitedMinutes} minutes. ${notice}`,
    jobId: job.id,
    senderName: job.technician_name || 'Technician',
  });

  return {
    body: {
      message: customerSuspended
        ? `No-show reported. The customer was suspended after the technician waited ${customerNoShowWaitMinutes()} minutes.`
        : 'No-show reported.',
      noShowCount: count,
      level,
      customerSuspended,
      waitedMinutes: wait.waitedMinutes,
    },
  };
};

module.exports = { verifyCompletion, reportNoShow };
