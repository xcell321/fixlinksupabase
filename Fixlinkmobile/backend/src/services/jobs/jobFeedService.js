// Job feed service: the read-only job lists.
// Extracted verbatim from services/jobService.js. Rating enrichment now uses
// the shared summarizeRatings helper with identical output shape.

const jobRepository = require('../../repositories/jobRepository');
const userRepository = require('../../repositories/userRepository');
const reviewRepository = require('../../repositories/reviewRepository');
const { serializeJob } = require('../../domain/jobSerializer');
const { distanceInKm, roundKm } = require('../../domain/geo');
const { resolveLocalCoords } = require('../../domain/landmarks');
const {
  skillMatchesFeedJob,
  isVerifiedTechnician,
  hasDeclined,
} = require('../../domain/jobFeedEligibility');
const { HttpError } = require('../../domain/httpError');
const { assertTechnicianOwner } = require('../../middleware/identityGuards');
const { getTechnicianActiveJobCount, getWorkloadStatus } = require('../workloadService');
const { summarizeRatings } = require('../ratings/ratingSummary');

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

    const { rating: technicianRating, totalReviews: technicianTotalReviews } = summarizeRatings(reviews, {
      rating: technician.rating,
      totalReviews: technician.total_reviews,
    });

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
  assertTechnicianOwner(authUid, technicianUid);
  const rows = await jobRepository.findByTechnicianUid(technicianUid);

  // UAT #11: the technician rates the customer, so attach the customer's
  // verified badge + portfolio (non-sensitive fields only) for context.
  const profiles = await userRepository.findPublicProfilesByIds(rows.map((row) => row.customer_uid));
  const byId = new Map(profiles.map((profile) => [String(profile.id), profile]));

  const enrich = (row) => {
    // Technician's own job list: the OTP is customer-held, never sent here.
    const job = serializeJob(row);
    const profile = byId.get(String(row.customer_uid));
    if (!profile) return job;
    return {
      ...job,
      customerProfile: {
        uid: profile.id,
        name: profile.name || row.customer_name || null,
        profileImage: profile.profile_image || null,
        portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : [],
        verified: Boolean(profile.government_id_file_url)
          || String(profile.verification_status || '').toLowerCase() === 'verified',
        riskLevel: profile.credential_risk_level || null,
        rating: profile.rating ?? null,
        totalReviews: profile.total_reviews || 0,
      },
    };
  };

  return { body: rows.map(enrich) };
};

// GET /api/requests/technician/:technicianUid/workload
const getTechnicianWorkload = async ({ technicianUid, authUid }) => {
  assertTechnicianOwner(authUid, technicianUid);
  const activeJobs = await getTechnicianActiveJobCount(technicianUid);
  return { body: { activeJobs, workloadStatus: getWorkloadStatus(activeJobs) } };
};

module.exports = {
  listAvailableJobs,
  listCustomerJobs,
  listCompletedJobs,
  listTechnicianJobs,
  getTechnicianWorkload,
};
