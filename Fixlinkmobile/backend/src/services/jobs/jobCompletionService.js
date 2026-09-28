// Job completion service: OTP verification and no-show reports.
// Extracted verbatim from services/jobService.js. Behavior is unchanged.

const jobRepository = require('../../repositories/jobRepository');
const { isNoShowReportable, stageOf } = require('../../domain/jobWorkflow');
const { otpGuard, OTP_MAX_ATTEMPTS } = require('../../domain/otpPolicy');
const { HttpError } = require('../../domain/httpError');
const { assertTechnicianOwner } = require('../../middleware/identityGuards');
const { notify } = require('../notificationService');

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
// Each no-show is logged atomically; the returned no_show_count drives the
// warning level shown to the customer.
const reportNoShow = async ({ jobId, authUid, technicianUid, reason }) => {
  assertTechnicianOwner(authUid, technicianUid);
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job || job.technician_uid !== technicianUid) {
    throw new HttpError(404, { error: 'Assigned job not found.' });
  }
  if (!isNoShowReportable(job.status)) {
    throw new HttpError(409, { error: 'A no-show can only be reported once the request is underway.' });
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
  const level = count >= 3 ? 'restricted' : count === 2 ? 'flagged' : 'warning';
  const notice =
    count >= 3
      ? 'A report has been submitted for review.'
      : count === 2
        ? 'Your account has been flagged for review.'
        : 'This is a warning. Repeated no-shows may restrict your account.';

  await notify(job.customer_uid, {
    text: `The technician reported a no-show (${count === 1 ? 'first' : count === 2 ? 'second' : 'repeated'} occurrence). ${notice}`,
    jobId: job.id,
    senderName: job.technician_name || 'Technician',
  });

  return { body: { message: 'No-show reported.', noShowCount: count, level } };
};

module.exports = { verifyCompletion, reportNoShow };
