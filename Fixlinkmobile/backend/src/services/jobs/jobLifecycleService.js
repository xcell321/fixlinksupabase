// Job lifecycle service: accept/decline/cancel plus the
// confirmation -> ready -> arrival -> status workflow.
// Extracted verbatim from services/jobService.js. Behavior is unchanged.

const jobRepository = require('../../repositories/jobRepository');
const {
  TECHNICIAN_SETTABLE_STATUSES,
  isCustomerCancellable,
  isTechnicianEnRoute,
  isTechnicianArrived,
  stageOf,
} = require('../../domain/jobWorkflow');
const { shouldSuspendForLateCancel } = require('../../domain/autoSuspendPolicy');
const { suspendAccount } = require('./accountSuspension');
const { HttpError } = require('../../domain/httpError');
const { assertTechnicianOwner } = require('../../middleware/identityGuards');
const { getTechnicianActiveJobCount, getWorkloadStatus, isAtJobLimit, getMaxActiveJobs } = require('../workloadService');
const { notify } = require('../notificationService');
const { assertUuid } = require('../../domain/ids');

// PUT /api/requests/:id/accept — accept a job atomically (via the accept_job RPC).
const acceptJob = async ({ jobId, authUid, technicianUid, technicianName }) => {
  // Malformed ids must fail here with a 400: passed straight to the RPC they
  // surface as a Postgres syntax error and would otherwise become a 500.
  assertUuid(jobId, 'job id');
  if (!technicianUid || !technicianName) {
    throw new HttpError(400, { error: 'Technician identity is required to accept a job.' });
  }
  assertTechnicianOwner(authUid, technicianUid);

  // Authoritative capacity rule (UAT #7): recalculate current active jobs
  // before accepting, so a stale AI filter cannot let a technician exceed the
  // env-configured ceiling (TECHNICIAN_MAX_ACTIVE_JOBS, default 1).
  let atCapacity = null;
  try {
    const activeJobs = await getTechnicianActiveJobCount(technicianUid);
    if (isAtJobLimit(activeJobs)) {
      atCapacity = {
        code: 'TECHNICIAN_AT_CAPACITY',
        message: `You already have ${activeJobs} active job${activeJobs === 1 ? '' : 's'} (limit ${getMaxActiveJobs()}). Finish it before accepting another request.`,
        activeJobs,
        maxActiveJobs: getMaxActiveJobs(),
        workloadStatus: getWorkloadStatus(activeJobs),
      };
    }
  } catch (workloadError) {
    console.warn('Workload capacity check failed, proceeding with accept:', workloadError.message);
  }
  if (atCapacity) throw new HttpError(409, atCapacity);

  const { data: acceptedJobId, error } = await jobRepository.acceptJob({
    jobId,
    technicianUid: String(technicianUid),
    technicianName: String(technicianName),
  });

  if (error) {
    if (/Repair request not found/i.test(error.message)) {
      throw new HttpError(404, { error: 'Repair request not found' });
    }
    if (/no longer pending/i.test(error.message)) {
      throw new HttpError(409, { error: 'This job has already been taken.' });
    }
    console.error('Error accepting job:', error.message);
    throw new HttpError(500, { error: 'Internal Server Error' });
  }

  const acceptedRow = await jobRepository.findAssignmentSummary(acceptedJobId);
  if (acceptedRow?.customer_uid) {
    await notify(acceptedRow.customer_uid, {
      text: `${technicianName} accepted your ${acceptedRow.appliance_type || 'repair'} request.`,
      jobId: acceptedJobId,
      senderUid: technicianUid,
      senderName: technicianName,
    });
  }

  return { body: { message: 'Job accepted successfully!', jobId: acceptedJobId } };
};

// PUT /api/requests/:id/decline — return a job to the available queue.
const declineJob = async ({ jobId, authUid, technicianUid }) => {
  assertTechnicianOwner(authUid, technicianUid);

  const { data, error } = await jobRepository.updateByIdReturningIds(jobId, {
    declined_by: technicianUid,
    status: 'Pending',
    updated_at: new Date().toISOString(),
  });
  if (error || !data || data.length === 0) {
    throw new HttpError(404, { error: 'Repair request not found.' });
  }

  return { body: { message: 'Request declined and returned to the available queue.' } };
};

// PUT /api/requests/:id/cancel — the customer cancels their own request.
//
// UAT #2: once the technician has physically arrived, cancelling stops being a
// scheduling change. The cancellation still goes through — the technician
// should not be left waiting — but it is logged at stage `after_travel` and the
// customer is auto-suspended at CUSTOMER_LATE_CANCEL_LIMIT such cancellations.
const cancelJob = async ({ jobId, authUid, cancellationReason }) => {
  const existing = await jobRepository.findCancellationContext(jobId);
  if (!existing) throw new HttpError(404, { error: 'Repair request not found.' });
  if (existing.customer_uid !== authUid) {
    throw new HttpError(403, { error: 'You can only cancel your own request.' });
  }
  if (!isCustomerCancellable(existing.status)) {
    throw new HttpError(409, { error: 'This request can no longer be cancelled.' });
  }

  const arrived = isTechnicianArrived(existing);
  // `after_travel` is the stage that means "the technician was already there".
  const stage = arrived ? 'after_travel' : stageOf(existing.status);
  const reason = String(cancellationReason || '').trim() || null;
  await jobRepository.updateById(existing.id, {
    status: 'Cancelled',
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cancellation_stage: stage,
    cancelled_by: 'customer',
    cancellation_reason: reason,
  });

  // Log an incident when the customer cancels after having already confirmed
  // that someone would be at the service location, or after the technician
  // arrived. The row is also the counter the UAT #2 rule reads back.
  if (arrived || stage === 'after_ready' || stage === 'after_confirmation') {
    await jobRepository.insertIncident({
      job_id: existing.id,
      customer_uid: existing.customer_uid,
      technician_uid: existing.technician_uid,
      type: 'cancellation',
      stage,
      reason: reason || (arrived
        ? 'Customer cancelled after the technician arrived'
        : 'Customer cancelled after confirmation'),
      status: 'logged',
      created_at: new Date().toISOString(),
    });
  }

  // UAT #2: enough late cancellations suspend the customer.
  let customerSuspended = false;
  if (arrived && existing.customer_uid) {
    const lateCancellations = await jobRepository.countLateCancellations(existing.customer_uid);
    if (shouldSuspendForLateCancel(lateCancellations)) {
      customerSuspended = await suspendAccount(existing.customer_uid, {
        reason: 'cancelled after the technician arrived',
      });
    }
  }

  if (existing.technician_uid) {
    await notify(existing.technician_uid, {
      text: arrived
        ? 'Customer cancelled the request after you had already arrived at the service location.'
        : `Customer cancelled the request${stage !== 'before_accept' ? ` (stage: ${stage.replace('after_', '')})` : ''}.`,
      jobId: existing.id,
      senderName: 'Customer',
    });
  }

  return {
    body: {
      message: customerSuspended
        ? 'Repair request cancelled. Your account was suspended for cancelling after the technician had already arrived.'
        : 'Repair request cancelled.',
      cancelledBy: 'customer',
      cancellationStage: stage,
      lateCancellation: arrived,
      customerSuspended,
    },
  };
};

// POST /api/requests/:id/confirm-repair
// The anti-spam checkpoint: a request does NOT move forward until the customer
// confirms they really need the repair and will be present.
const confirmRepair = async ({ jobId, authUid }) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Repair request not found.' });
  if (!job.customer_uid || String(job.customer_uid) !== authUid) {
    throw new HttpError(403, { error: 'You can only confirm your own request.' });
  }
  if (String(job.status).toLowerCase() !== 'accepted') {
    throw new HttpError(409, { error: 'This request can only be confirmed after a technician accepts it.' });
  }

  const confirmationTime = new Date().toISOString();
  await jobRepository.updateById(job.id, {
    status: 'Confirmed',
    customer_confirmation_timestamp: confirmationTime,
    updated_at: confirmationTime,
  });

  if (job.technician_uid) {
    await notify(job.technician_uid, {
      text: `${job.customer_name} confirmed the repair request. You are now assigned.`,
      jobId: job.id,
      senderName: job.customer_name || 'Customer',
    });
  }

  return {
    body: { message: 'Repair request confirmed.', status: 'Confirmed', customerConfirmedAt: confirmationTime },
  };
};

// POST /api/requests/:id/customer-ready
const markCustomerReady = async ({ jobId, authUid }) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Repair request not found.' });
  if (!job.customer_uid || String(job.customer_uid) !== authUid) {
    throw new HttpError(403, { error: 'You can only update your own request.' });
  }
  if (String(job.status).toLowerCase() !== 'confirmed') {
    throw new HttpError(409, { error: 'Confirm the repair request before marking it ready.' });
  }

  const readyTime = new Date().toISOString();
  await jobRepository.updateById(job.id, {
    status: 'Customer Ready',
    customer_ready_timestamp: readyTime,
    updated_at: readyTime,
  });

  if (job.technician_uid) {
    await notify(job.technician_uid, {
      text: `${job.customer_name} marked the request ready. You may now begin the repair.`,
      jobId: job.id,
      senderName: job.customer_name || 'Customer',
    });
  }

  return { body: { message: 'Marked as ready for the technician.', status: 'Customer Ready', customerReadyAt: readyTime } };
};

// POST /api/requests/:id/arrive — technician records physical arrival.
const recordArrival = async ({ jobId, authUid, technicianUid }) => {
  assertTechnicianOwner(authUid, technicianUid);
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job || job.technician_uid !== technicianUid) {
    throw new HttpError(404, { error: 'Assigned job not found.' });
  }
  if (!isTechnicianEnRoute(job.status)) {
    throw new HttpError(409, { error: 'You can only mark arrival for an active assigned request.' });
  }

  const arrivalTime = new Date().toISOString();
  await jobRepository.updateById(job.id, { technician_arrival_timestamp: arrivalTime, updated_at: arrivalTime });

  await notify(job.customer_uid, {
    text: `${job.technician_name || 'Your technician'} has arrived at the service location.`,
    jobId: job.id,
    senderName: job.technician_name || 'Technician',
  });

  return { body: { message: 'Arrival recorded.', technicianArrivalAt: arrivalTime } };
};

// PUT /api/requests/accepted/:id/status — the technician status shortcut.
const updateJobStatus = async ({ jobId, authUid, status, technicianUid, cancellationReason }) => {
  if (!TECHNICIAN_SETTABLE_STATUSES.includes(status)) {
    throw new HttpError(400, { error: 'Invalid job status.' });
  }
  assertTechnicianOwner(authUid, technicianUid);

  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job || (technicianUid && job.technician_uid !== technicianUid)) {
    throw new HttpError(404, { error: 'Assigned job not found.' });
  }

  // The completion OTP protects the actual completion, so the status shortcut
  // may not jump straight to Completed (that would bypass both the OTP and the
  // In Progress requirement).
  if (status === 'Completed' && job.status !== 'In Progress') {
    throw new HttpError(409, { error: 'Job must be in progress before it can be completed.' });
  }
  if (status === 'In Progress' && !isTechnicianEnRoute(job.status) && !job.technician_arrival_timestamp) {
    throw new HttpError(409, { error: 'The request must be accepted before starting the repair.' });
  }

  const updates = { status, updated_at: new Date().toISOString() };
  if (status === 'In Progress') {
    updates.started_at = new Date().toISOString();
    if (job.customer_uid) {
      await notify(job.customer_uid, {
        text: `${job.technician_name || 'Your technician'} started the repair.`,
        jobId: job.id,
        senderUid: technicianUid,
        senderName: job.technician_name || 'Technician',
      });
    }
  }
  if (status === 'Cancelled') {
    updates.cancelled_at = new Date().toISOString();
    updates.cancelled_by = 'technician';
    updates.cancellation_stage = stageOf(job.status) || 'after_accept';
    updates.cancellation_reason = String(cancellationReason || '').trim() || null;
    await notify(job.customer_uid, {
      text: `Your technician cancelled this request. ${updates.cancellation_reason ? `Reason: ${updates.cancellation_reason}` : ''}`.trim(),
      jobId: job.id,
      senderUid: technicianUid,
      senderName: job.technician_name || 'Technician',
    });
  }

  await jobRepository.updateById(job.id, updates);
  return { body: { message: `Job marked ${status}.`, status } };
};

module.exports = {
  acceptJob,
  declineJob,
  cancelJob,
  confirmRepair,
  markCustomerReady,
  recordArrival,
  updateJobStatus,
};
