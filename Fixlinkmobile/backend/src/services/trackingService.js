// Tracking service: single-job deep links, the accepted job's destination, the
// live technician feed and the customer's live GPS ping.
//
// The customer pin ALWAYS renders the confirmed service location
// (service_latitude/service_longitude). The customer's live GPS is stored
// separately in customer_latitude/customer_longitude and is never used as the
// travel destination.

const jobRepository = require('../repositories/jobRepository');
const userRepository = require('../repositories/userRepository');
const { serializeJob } = require('../domain/jobSerializer');
const { isLiveTrackable } = require('../domain/jobWorkflow');
const { HttpError } = require('../domain/httpError');

// GET /api/requests/job/:id — used by notification deep links.
const getJobForDeepLink = async ({ jobId, authUid }) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Job not found.' });

  const uid = String(authUid);
  const role = await userRepository.findRoleById(uid);
  const isOwner = uid === String(job.customer_uid || '') || uid === String(job.technician_uid || '');
  const isPendingAndTechnician = String(job.status || '').toLowerCase() === 'pending' && role === 'technician';
  if (!isOwner && !isPendingAndTechnician) {
    throw new HttpError(403, { error: 'Not authorized to view this job.' });
  }

  // Single-job view: only the customer owner may see the completion OTP.
  return { body: serializeJob(job, { viewerUid: uid === String(job.customer_uid || '') ? uid : null }) };
};

// GET /api/requests/accepted/:id/location
const getJobLocation = async ({ jobId, authUid }) => {
  const job = await requireParticipant(jobId, authUid);
  return {
    body: {
      latitude: job.latitude || null,
      longitude: job.longitude || null,
      location: job.location || null,
    },
  };
};

// GET /api/requests/accepted/:id/live-tracking
const getLiveTracking = async ({ jobId, authUid }) => {
  const job = await requireParticipant(jobId, authUid);
  if (!isLiveTrackable(job.status)) {
    throw new HttpError(409, { error: 'Live tracking is available after job acceptance.' });
  }

  const technician = (job.technician_uid && await userRepository.findById(job.technician_uid)) || {};

  const serviceLat = Number.isFinite(Number(job.service_latitude)) ? Number(job.service_latitude) : Number(job.latitude);
  const serviceLon = Number.isFinite(Number(job.service_longitude)) ? Number(job.service_longitude) : Number(job.longitude);
  const customerLiveLat = job.customer_latitude != null ? Number(job.customer_latitude) : null;
  const customerLiveLon = job.customer_longitude != null ? Number(job.customer_longitude) : null;

  return {
    body: {
      customer: {
        latitude: Number.isFinite(serviceLat) ? serviceLat : null,
        longitude: Number.isFinite(serviceLon) ? serviceLon : null,
        liveLatitude: Number.isFinite(customerLiveLat) ? customerLiveLat : null,
        liveLongitude: Number.isFinite(customerLiveLon) ? customerLiveLon : null,
        name: job.customer_name || 'Customer',
        address: job.confirmed_service_location || job.location || null,
      },
      technician: {
        latitude: Number(technician.latitude) || null,
        longitude: Number(technician.longitude) || null,
        name: job.technician_name || technician.name || 'Technician',
      },
      status: job.status,
      updatedAt: technician.location_updated_at ? new Date(technician.location_updated_at).toISOString() : null,
    },
  };
};

// PUT /api/requests/accepted/:id/customer-location
const updateCustomerLocation = async ({ jobId, authUid, latitude, longitude, customerUid }) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !customerUid) {
    throw new HttpError(400, { error: 'Customer identity and valid coordinates are required.' });
  }
  if (customerUid !== authUid) {
    throw new HttpError(403, { error: 'Customer identity does not match the authenticated account.' });
  }

  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job || job.customer_uid !== customerUid) {
    throw new HttpError(404, { error: 'Assigned job not found.' });
  }

  const locationUpdatedAt = new Date().toISOString();
  await jobRepository.updateById(job.id, {
    customer_latitude: lat,
    customer_longitude: lon,
    location_updated_at: locationUpdatedAt,
  });

  return { body: { latitude: lat, longitude: lon, locationUpdatedAt } };
};

// Customer or assigned technician only.
const requireParticipant = async (jobId, authUid) => {
  const job = await jobRepository.findByIdOrOriginalId(jobId);
  if (!job) throw new HttpError(404, { error: 'Accepted job not found.' });
  const uid = String(authUid);
  if (uid !== String(job.customer_uid) && uid !== String(job.technician_uid)) {
    throw new HttpError(403, { error: 'Not authorized.' });
  }
  return job;
};

module.exports = { getJobForDeepLink, getJobLocation, getLiveTracking, updateCustomerLocation };
