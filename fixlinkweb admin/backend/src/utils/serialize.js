// Map Supabase (snake_case) rows to the camelCase shapes the admin panel HTML expects.

const serializeUser = (row) => {
  if (!row) return null;
  return {
    uid: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    role: row.role,
    status: row.status || 'active',
    verificationStatus: row.verification_status || null,
    rejectionReason: row.rejection_reason || null,
    governmentIdNumber: row.government_id_number || null,
    governmentIdFileUrl: row.government_id_file_url || null,
    certificateFileUrl: row.certificate_file_url || null,
    bio: row.bio || null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    yearsExperience: row.years_experience || 0,
    latitude: row.latitude,
    longitude: row.longitude,
    rating: row.rating,
    totalReviews: row.total_reviews || 0,
    noShowCount: row.no_show_count || 0,
    profileImage: row.profile_image || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const serializeJob = (row) => ({
  id: row.id,
  originalRequestId: row.original_request_id || null,
  customerUid: row.customer_uid,
  customerName: row.customer_name,
  technicianUid: row.technician_uid,
  technicianName: row.technician_name || null,
  applianceType: row.appliance_type,
  category: row.category,
  description: row.description,
  location: row.location,
  latitude: row.latitude,
  longitude: row.longitude,
  preferredDate: row.preferred_date,
  preferredTime: row.preferred_time,
  scheduledDate: row.scheduled_date,
  photoUrl: row.photo_url,
  status: row.status || 'Pending',
  isOther: row.is_other || false,
  verificationCode: row.verification_code || null,
  acceptedAt: row.accepted_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  reviewedAt: row.reviewed_at,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});

const serializeReport = (row) => ({
  id: row.id,
  reporterUid: row.reporter_uid,
  userUid: row.reported_user_uid,
  reportedUserName: row.reported_user_name || null,
  title: row.title || null,
  reason: row.reason || null,
  description: row.description || null,
  status: row.status || 'open',
  resolution: row.resolution || null,
  userStatus: row.user_status || null,
  createdAt: row.created_at || null,
  resolvedAt: row.resolved_at || null,
});

const serializeReview = (row) => ({
  id: row.id,
  technicianUid: row.technician_uid,
  technicianName: row.technician_name || null,
  customerName: row.customer_name,
  rating: row.rating,
  comment: row.comment || null,
  requestId: row.request_id || null,
  createdAt: row.created_at || null,
});

const serializeCategory = (row) => ({
  id: row.id,
  name: row.name,
  devices: Array.isArray(row.devices) ? row.devices : [],
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

const serializeAnnouncement = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  active: row.active,
  createdAt: row.created_at || null,
});

const serializeIncident = (row) => ({
  id: row.id,
  jobId: row.job_id || null,
  customerUid: row.customer_uid || null,
  technicianUid: row.technician_uid || null,
  type: row.type,
  stage: row.stage,
  reason: row.reason || null,
  status: row.status || 'logged',
  customerName: row.customer_name || null,
  technicianName: row.technician_name || null,
  applianceType: row.appliance_type || null,
  jobLocation: row.location || null,
  createdAt: row.created_at || null,
  resolvedAt: row.resolved_at || null,
});

module.exports = {
  serializeUser,
  serializeJob,
  serializeReport,
  serializeReview,
  serializeCategory,
  serializeAnnouncement,
  serializeIncident,
};