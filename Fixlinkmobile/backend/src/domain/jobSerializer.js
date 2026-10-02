// Maps a Postgres `jobs` row (snake_case) to the camelCase JSON the mobile app
// expects. Pure: no database access, no side effects.

// `viewerUid` gates the completion OTP. The OTP is the customer's proof-of-work
// signal, so only the job's own customer may ever see it. Technicians (and
// anyone else) get the field omitted, which means a job can never be completed
// without the customer reading out their code.
const serializeJob = (row, { viewerUid = null } = {}) => {
  const job = {
    id: row.id,
    customerName: row.customer_name,
    applianceType: row.appliance_type,
    description: row.description,
    location: row.location,
    status: row.status,
    isOther: Boolean(row.is_other),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
  if (row.customer_uid) job.customerUid = row.customer_uid;
  if (row.technician_uid) job.technicianUid = row.technician_uid;
  if (row.technician_name) job.technicianName = row.technician_name;
  if (row.category) job.category = row.category;
  if (row.latitude != null) job.latitude = row.latitude;
  if (row.longitude != null) job.longitude = row.longitude;
  if (row.customer_latitude != null) job.customerLatitude = row.customer_latitude;
  if (row.customer_longitude != null) job.customerLongitude = row.customer_longitude;
  if (row.confirmed_service_location) job.confirmedServiceLocation = row.confirmed_service_location;
  if (row.service_latitude != null) job.serviceLatitude = row.service_latitude;
  if (row.service_longitude != null) job.serviceLongitude = row.service_longitude;
  if (row.service_latitude == null && row.latitude != null) job.serviceLatitude = row.latitude;
  if (row.service_longitude == null && row.longitude != null) job.serviceLongitude = row.longitude;
  if (row.preferred_date) job.preferredDate = row.preferred_date;
  if (row.preferred_time) job.preferredTime = row.preferred_time;
  if (row.scheduled_date) job.scheduledDate = row.scheduled_date;
  if (row.photo_url) job.photoUrl = row.photo_url;
  // UAT #6: fake/AI device-photo warning for the technician.
  if (row.photo_risk_score != null) job.photoRiskScore = row.photo_risk_score;
  if (row.photo_risk_level) job.photoRiskLevel = row.photo_risk_level;
  if (row.photo_flags) job.photoFlags = row.photo_flags;
  if (row.photo_notes) job.photoNotes = row.photo_notes;
  // UAT #5: address / harassment warning for the technician.
  if (row.safety_flags) job.safetyFlags = row.safety_flags;
  if (row.safety_level) job.safetyLevel = row.safety_level;
  if (row.declined_by) job.declinedBy = row.declined_by;
  if (row.verification_code && viewerUid && String(row.customer_uid) === String(viewerUid)) {
    job.verificationCode = row.verification_code;
  }
  if (row.accepted_at) job.acceptedAt = new Date(row.accepted_at).toISOString();
  if (row.customer_confirmation_timestamp) job.customerConfirmedAt = new Date(row.customer_confirmation_timestamp).toISOString();
  if (row.customer_ready_timestamp) job.customerReadyAt = new Date(row.customer_ready_timestamp).toISOString();
  if (row.technician_arrival_timestamp) job.technicianArrivalAt = new Date(row.technician_arrival_timestamp).toISOString();
  if (row.completed_at) job.completedAt = new Date(row.completed_at).toISOString();
  if (row.cancelled_at) job.cancelledAt = new Date(row.cancelled_at).toISOString();
  if (row.cancellation_stage) job.cancellationStage = row.cancellation_stage;
  if (row.cancelled_by) job.cancelledBy = row.cancelled_by;
  if (row.review_id) job.reviewId = row.review_id;
  if (row.reviewed_at) job.reviewedAt = new Date(row.reviewed_at).toISOString();
  if (row.original_request_id) job.originalRequestId = row.original_request_id;
  if (row.updated_at) job.updatedAt = new Date(row.updated_at).toISOString();
  return job;
};

module.exports = { serializeJob };
