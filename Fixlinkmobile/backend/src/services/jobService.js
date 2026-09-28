// Job (repair request) service.
//
// Holds the lifecycle rules for a repair request: submission, the technician
// feed, accept/decline, the confirmation -> ready -> arrival -> completion
// workflow, cancellation, no-shows and reviews.
//
// This module knows nothing about `req`/`res`. It takes plain arguments and
// either returns `{ status?, body }` or throws HttpError for expected client
// errors. controllers/jobController.js turns that into HTTP.

const { uploadBuffer } = require('../config/supabase');
const jobRepository = require('../repositories/jobRepository');
const userRepository = require('../repositories/userRepository');
const reviewRepository = require('../repositories/reviewRepository');
const { serializeJob } = require('../domain/jobSerializer');
const { distanceInKm, roundKm } = require('../domain/geo');
const { resolveLocalCoords } = require('../domain/landmarks');
const {
  skillMatchesFeedJob,
  isVerifiedTechnician,
  hasDeclined,
} = require('../domain/jobFeedEligibility');
const {
  TECHNICIAN_SETTABLE_STATUSES,
  isCustomerCancellable,
  isTechnicianEnRoute,
  isNoShowReportable,
  stageOf,
} = require('../domain/jobWorkflow');
const { otpGuard, OTP_MAX_ATTEMPTS } = require('../domain/otpPolicy');
const { buildSubmitFingerprint, submitDedupe } = require('../domain/submitDedupe');
const { HttpError } = require('../domain/httpError');
const { resolveJobCoordinates } = require('./locationService');
const { getTechnicianActiveJobCount, getWorkloadStatus } = require('./workloadService');
const { notify } = require('./notificationService');
const { analyzeRepairDescription, isOmniRouteConfigured } = require('./repairAnalyzer');

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

// POST /api/requests — submit a new repair request (customer side).
const submitRequest = async ({ authUid, body, file }) => {
  const {
    customerName,
    customerUid,
    applianceType,
    category,
    description,
    location,
    latitude,
    longitude,
    preferredDate,
    preferredTime,
    scheduledDate,
    isOther,
  } = body;

  if (customerUid && customerUid !== authUid) {
    throw new HttpError(403, { error: 'You can only submit requests for your own account.' });
  }
  if (!customerName || !applianceType || !description || !location) {
    throw new HttpError(400, { error: 'Please fill out all required fields.' });
  }

  // Duplicate-submit guard: a double tap or a retried request must not create
  // two jobs.
  const fingerprint = buildSubmitFingerprint({ customerUid, applianceType, description });
  if (submitDedupe.isDuplicate(fingerprint)) {
    throw new HttpError(429, {
      error: 'It looks like you already submitted this. Please wait a moment before trying again.',
    });
  }
  submitDedupe.remember(fingerprint);

  let finalLat = Number(latitude);
  let finalLon = Number(longitude);
  if (!Number.isFinite(finalLat) || !Number.isFinite(finalLon)) {
    const resolved = await resolveJobCoordinates(latitude, longitude, location);
    if (resolved) {
      finalLat = resolved.latitude;
      finalLon = resolved.longitude;
    }
  }

  let resolvedDate = preferredDate ? String(preferredDate).trim() : null;
  let resolvedTime = preferredTime ? String(preferredTime).trim() : null;
  const resolvedScheduled = scheduledDate ? String(scheduledDate).trim() : null;

  // A scheduled timestamp is the single source of truth; derive the display
  // date/time from it when the app only sent the machine value.
  if ((!resolvedDate || !resolvedTime) && resolvedScheduled) {
    try {
      const scheduled = new Date(resolvedScheduled);
      if (!isNaN(scheduled.getTime())) {
        if (!resolvedDate) {
          resolvedDate = scheduled.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        if (!resolvedTime) {
          resolvedTime = scheduled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
      }
    } catch (_) {}
  }

  const newRequest = {
    customerName,
    ...(customerUid && { customerUid }),
    applianceType,
    ...(category && String(category).trim() && { category: String(category).trim() }),
    description,
    location,
    ...(Number.isFinite(finalLat) && { latitude: finalLat }),
    ...(Number.isFinite(finalLon) && { longitude: finalLon }),
    ...(resolvedDate && { preferredDate: resolvedDate }),
    ...(resolvedTime && { preferredTime: resolvedTime }),
    ...(resolvedScheduled && { scheduledDate: resolvedScheduled }),
    status: 'Pending',
    createdAt: new Date().toISOString(),
    isOther: Boolean(isOther),
  };

  let photoUrl = null;
  if (file) {
    try {
      photoUrl = await uploadBuffer({
        folder: 'repair-photos',
        file,
        buffer: file.buffer,
        contentType: file.mimetype,
      });
    } catch (photoError) {
      console.error('Photo upload failed; saving request without photo:', photoError.message);
    }
  }

  // The confirmed service location is snapshotted at submit time and kept
  // separate from the customer's live GPS. The technician always travels to
  // this location even if the customer is physically somewhere else.
  const nowIso = new Date().toISOString();
  const { id: requestId, error: insertError } = await jobRepository.insertJob({
    customer_name: customerName,
    ...(customerUid && { customer_uid: customerUid }),
    appliance_type: applianceType,
    ...(category && String(category).trim() && { category: String(category).trim() }),
    description,
    location,
    ...(Number.isFinite(finalLat) && { latitude: finalLat }),
    ...(Number.isFinite(finalLon) && { longitude: finalLon }),
    ...(Number.isFinite(finalLat) && { service_latitude: finalLat }),
    ...(Number.isFinite(finalLon) && { service_longitude: finalLon }),
    confirmed_service_location: location,
    ...(resolvedDate && { preferred_date: resolvedDate }),
    ...(resolvedTime && { preferred_time: resolvedTime }),
    ...(resolvedScheduled && { scheduled_date: resolvedScheduled }),
    status: 'Pending',
    is_other: Boolean(isOther),
    ...(photoUrl && { photo_url: photoUrl }),
    created_at: nowIso,
  });

  if (insertError) {
    console.error('Error saving repair request:', insertError);
    throw new HttpError(500, { error: 'Internal Server Error' });
  }

  // Best-effort AI auto-fill: when no category was picked (e.g. "other"), let
  // the AI triage the description into a category so technician matching keeps
  // working. Never blocks the response — a failure leaves the job as-is.
  const resolvedCategory = String(category || '').trim();
  if (!resolvedCategory && isOmniRouteConfigured()) {
    analyzeRepairDescription({ description, applianceType, category })
      .then((analysis) => {
        const detectedCategory = analysis?.category;
        if (!detectedCategory) return null;
        return jobRepository.updateById(requestId, { category: detectedCategory });
      })
      .then((result) => {
        if (result?.error) console.warn('AI category auto-fill failed:', result.error.message);
      })
      .catch((error) => console.warn('AI category auto-fill skipped:', error.message));
  }

  return {
    status: 201,
    body: {
      message: photoUrl
        ? 'Repair request submitted successfully!'
        : 'Repair request submitted successfully. The photo could not be uploaded.',
      photoUploaded: Boolean(photoUrl),
      requestId,
      request: newRequest,
    },
  };
};

// ---------------------------------------------------------------------------
// Feeds / lists
// ---------------------------------------------------------------------------

// GET /api/requests — the technician's available-jobs feed.
const listAvailableJobs = async ({ authUid, query }) => {
  const { technicianUid, category, latitude: queryLat, longitude: queryLon } = query;
  if (!technicianUid || technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }

  const technician = await userRepository.findById(technicianUid);
  const pendingSnapshot = await jobRepository.findPending(200);

  const requests = [];
  const techLat = Number(technician?.latitude ?? queryLat);
  const techLon = Number(technician?.longitude ?? queryLon);
  const hasTechCoords = Number.isFinite(techLat) && Number.isFinite(techLon);
  const verified = isVerifiedTechnician(technician);
  const skills = Array.isArray(technician?.skills) ? technician.skills : [];

  pendingSnapshot.forEach((row) => {
    const skillMatch = !technicianUid || (verified && skillMatchesFeedJob(skills, row, category));

    const jobCoords = resolveLocalCoords(
      Number.isFinite(Number(row.service_latitude)) ? row.service_latitude : row.latitude,
      Number.isFinite(Number(row.service_longitude)) ? row.service_longitude : row.longitude,
      row.confirmed_service_location || row.location
    );
    const distanceKm = hasTechCoords && jobCoords
      ? distanceInKm(techLat, techLon, jobCoords.latitude, jobCoords.longitude)
      : null;

    if ((!row.status || row.status === 'Pending') && skillMatch && !hasDeclined(row, technicianUid)) {
      requests.push({
        // Available-jobs feed: Pending rows have no code yet, and the viewer is
        // a technician — the OTP stays hidden either way.
        ...serializeJob(row),
        ...(jobCoords && { latitude: jobCoords.latitude, longitude: jobCoords.longitude }),
        ...(distanceKm !== null && { distanceKm: roundKm(distanceKm) }),
      });
    }
  });

  requests.sort((first, second) =>
    (first.distanceKm ?? Number.POSITIVE_INFINITY) - (second.distanceKm ?? Number.POSITIVE_INFINITY));

  return { body: requests };
};

// GET /api/requests/customer/:customerName — the customer's active requests.
const listCustomerJobs = async ({ customerName, customerUid, authUid }) => {
  const requestedName = String(customerName || '').trim().toLowerCase();
  const requestedUid = String(customerUid || '').trim();
  if (!requestedUid || requestedUid !== authUid) {
    throw new HttpError(403, { error: 'Customer identity does not match the authenticated account.' });
  }

  const allJobs = (await jobRepository.findByCustomerUid(requestedUid)).slice();

  // Legacy rows may only be linked by display name, so those are merged in.
  if (requestedName) {
    (await jobRepository.findByCustomerNameLike(requestedName)).forEach((job) => {
      if (!allJobs.some((existing) => existing.id === job.id)) allJobs.push(job);
    });
  }

  const jobs = allJobs.filter((job) => {
    const jobName = String(job.customer_name || '').trim().toLowerCase();
    const nameMatches = jobName && requestedName && (
      jobName === requestedName
      || jobName.includes(requestedName)
      || requestedName.includes(jobName)
      || jobName.split(/\s+/)[0] === requestedName.split(/\s+/)[0]
    );
    const uidMatches = requestedUid && job.customer_uid === requestedUid;
    return (uidMatches || nameMatches) && String(job.status || '').toLowerCase() !== 'completed';
  });

  // Customer-owned list (uid-verified above) — the completion OTP is theirs.
  const withTechnician = await Promise.all(jobs.map(async (job) => {
    if (!job.technician_uid && !job.technician_name) return serializeJob(job, { viewerUid: requestedUid });

    const technician = (job.technician_uid && await userRepository.findById(job.technician_uid)) || {};

    let reviews = [];
    if (job.technician_uid) reviews = await reviewRepository.findByTechnicianUid(job.technician_uid);
    if (reviews.length === 0 && (job.technician_name || technician.name)) {
      reviews = await reviewRepository.findByTechnicianName(job.technician_name || technician.name);
    }

    let technicianRating = null;
    let technicianTotalReviews = reviews.length;
    if (reviews.length > 0) {
      technicianRating = Number(
        (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
      );
    } else if (technician.rating != null && Number(technician.rating) > 0) {
      technicianRating = Number(Number(technician.rating).toFixed(1));
      technicianTotalReviews = Number(technician.total_reviews || 1);
    }

    return {
      ...serializeJob(job, { viewerUid: requestedUid }),
      technicianPhone: technician.phone || null,
      technicianSkills: technician.skills || [],
      technicianRating,
      technicianTotalReviews,
    };
  }));

  return { body: withTechnician };
};

// GET /api/requests/completed/:customerName — the customer's completed history.
const listCompletedJobs = async ({ customerName, customerUid, authUid }) => {
  // Ownership gate: the customer UID must match the authenticated account.
  // Name alone is never sufficient, otherwise any authenticated user could read
  // another customer's completed jobs and repair photos by name.
  const requestedUid = String(customerUid || '').trim();
  if (!requestedUid || requestedUid !== authUid) {
    throw new HttpError(403, { error: 'Customer identity does not match the authenticated account.' });
  }

  const rows = await jobRepository.findByCustomerForStatus({
    customerUid: requestedUid,
    customerName,
    status: 'Completed',
  });
  return { body: rows.map((row) => serializeJob(row, { viewerUid: requestedUid })) };
};

// GET /api/requests/technician/:technicianUid — the technician's own job list.
const listTechnicianJobs = async ({ technicianUid, authUid }) => {
  if (technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }
  const rows = await jobRepository.findByTechnicianUid(technicianUid);
  // Technician's own job list: the OTP is customer-held, never sent here.
  return { body: rows.map((row) => serializeJob(row)) };
};

// GET /api/requests/technician/:technicianUid/workload
const getTechnicianWorkload = async ({ technicianUid, authUid }) => {
  if (technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }
  const activeJobs = await getTechnicianActiveJobCount(technicianUid);
  return { body: { activeJobs, workloadStatus: getWorkloadStatus(activeJobs) } };
};

// ---------------------------------------------------------------------------
// Accept / decline / cancel
// ---------------------------------------------------------------------------

// PUT /api/requests/:id/accept — accept a job atomically (via the accept_job RPC).
const acceptJob = async ({ jobId, authUid, technicianUid, technicianName }) => {
  if (!technicianUid || !technicianName) {
    throw new HttpError(400, { error: 'Technician identity is required to accept a job.' });
  }
  if (technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }

  // Authoritative workload validation: recalculate current active jobs before
  // accepting, so a stale AI filter cannot let a technician exceed capacity.
  let atCapacity = null;
  try {
    const activeJobs = await getTechnicianActiveJobCount(technicianUid);
    const workloadStatus = getWorkloadStatus(activeJobs);
    if (workloadStatus === 'at_capacity') {
      atCapacity = {
        code: 'TECHNICIAN_AT_CAPACITY',
        message: `You currently have ${activeJobs} active repair requests and cannot automatically accept another request.`,
        activeJobs,
        workloadStatus,
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
  if (!technicianUid || technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }

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
const cancelJob = async ({ jobId, authUid, cancellationReason }) => {
  const existing = await jobRepository.findCancellationContext(jobId);
  if (!existing) throw new HttpError(404, { error: 'Repair request not found.' });
  if (existing.customer_uid !== authUid) {
    throw new HttpError(403, { error: 'You can only cancel your own request.' });
  }
  if (!isCustomerCancellable(existing.status)) {
    throw new HttpError(409, { error: 'This request can no longer be cancelled.' });
  }

  const stage = stageOf(existing.status);
  const reason = String(cancellationReason || '').trim() || null;
  await jobRepository.updateById(existing.id, {
    status: 'Cancelled',
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cancellation_stage: stage,
    cancelled_by: 'customer',
    cancellation_reason: reason,
  });

  // Log an incident only when the customer cancels after having already
  // confirmed that someone would be at the service location.
  if (stage === 'after_ready' || stage === 'after_confirmation') {
    await jobRepository.insertIncident({
      job_id: existing.id,
      customer_uid: existing.customer_uid,
      technician_uid: existing.technician_uid,
      type: 'cancellation',
      stage,
      reason: reason || 'Customer cancelled after confirmation',
      status: 'logged',
      created_at: new Date().toISOString(),
    });
  }

  if (existing.technician_uid) {
    await notify(existing.technician_uid, {
      text: `Customer cancelled the request${stage !== 'before_accept' ? ` (stage: ${stage.replace('after_', '')})` : ''}.`,
      jobId: existing.id,
      senderName: 'Customer',
    });
  }

  return { body: { message: 'Repair request cancelled.' } };
};

// ---------------------------------------------------------------------------
// Confirmation -> ready -> arrival -> completion workflow
// ---------------------------------------------------------------------------

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
  if (!technicianUid || technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }
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
  if (!technicianUid || technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }

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
  if (status === 'In Progress') updates.started_at = new Date().toISOString();
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

// ---------------------------------------------------------------------------
// No-show + reviews
// ---------------------------------------------------------------------------

// POST /api/requests/:id/report-no-show
// Each no-show is logged atomically; the returned no_show_count drives the
// warning level shown to the customer.
const reportNoShow = async ({ jobId, authUid, technicianUid, reason }) => {
  if (!technicianUid || technicianUid !== authUid) {
    throw new HttpError(403, { error: 'Technician identity does not match the authenticated account.' });
  }
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

// POST /api/requests/:id/review
const submitReview = async ({ jobId, authUid, customerName, rating, comment }) => {
  const numericRating = Number(rating);
  if (!customerName || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new HttpError(400, { error: 'Customer name and a rating from 1 to 5 are required.' });
  }

  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job
    || job.customer_uid !== authUid
    || job.customer_name !== customerName
    || String(job.status).toLowerCase() !== 'completed') {
    throw new HttpError(404, { error: 'Completed job not found.' });
  }
  if (job.review_id) throw new HttpError(409, { error: 'This job has already been reviewed.' });

  const { data: review, error: reviewError } = await reviewRepository.insertReview({
    technician_uid: job.technician_uid,
    technician_name: job.technician_name,
    customer_name: customerName,
    rating: numericRating,
    comment: String(comment || '').trim(),
    request_id: job.id,
    created_at: new Date().toISOString(),
  });
  if (reviewError) throw reviewError;

  await jobRepository.updateById(job.id, { review_id: review.id, reviewed_at: new Date().toISOString() });

  if (job.technician_uid) {
    try {
      await reviewRepository.recomputeTechnicianRating(job.technician_uid);
    } catch (ratingError) {
      console.warn('Could not sync user rating:', ratingError.message);
    }
  }

  return { status: 201, body: { message: 'Review submitted successfully.' } };
};

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
};
