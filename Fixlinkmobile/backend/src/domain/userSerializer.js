// Maps Postgres snake_case rows to the camelCase JSON the mobile app expects.
const serializeUser = (row) => {
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    address: row.address || '',
    role: row.role,
    status: row.status,
    skills: row.skills || [],
    portfolio: row.portfolio || [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
  if (row.verification_status) user.verificationStatus = row.verification_status;
  if (row.rejection_reason) user.rejectionReason = row.rejection_reason;
  if (row.government_id_number) user.governmentIdNumber = row.government_id_number;
  if (row.government_id_file_url) user.governmentIdFileUrl = row.government_id_file_url;
  if (row.certificate_file_url) user.certificateFileUrl = row.certificate_file_url;
  if (row.bio) user.bio = row.bio;
  if (row.years_experience != null) user.yearsExperience = row.years_experience;
  if (row.latitude != null) user.latitude = row.latitude;
  if (row.longitude != null) user.longitude = row.longitude;
  if (row.location_updated_at) user.locationUpdatedAt = new Date(row.location_updated_at).toISOString();
  if (row.fcm_token) user.fcmToken = row.fcm_token;
  if (row.rating != null) user.rating = row.rating;
  if (row.total_reviews != null) user.totalReviews = row.total_reviews;
  if (row.is_available != null) user.isAvailable = row.is_available;
  if (row.profile_image) user.profileImage = row.profile_image;
  if (row.no_show_count != null) user.noShowCount = row.no_show_count;

  // UAT #8: repeat-scammer standing.
  if (row.scam_count != null) user.scamCount = row.scam_count;

  // UAT #9: credential screening result (advisory, admin-facing).
  if (row.credential_risk_score != null) user.credentialRiskScore = row.credential_risk_score;
  if (row.credential_risk_level) user.credentialRiskLevel = row.credential_risk_level;
  if (row.credential_flags) user.credentialFlags = row.credential_flags;
  if (row.credential_notes) user.credentialNotes = row.credential_notes;
  if (row.credential_screened_at) user.credentialScreenedAt = new Date(row.credential_screened_at).toISOString();
  if (row.verification_note) user.verificationNote = row.verification_note;

  // UAT #10: facial verification at signup.
  if (row.selfie_url) user.selfieUrl = row.selfie_url;
  if (row.face_check_level) user.faceCheckLevel = row.face_check_level;
  if (row.face_match_confidence != null) user.faceMatchConfidence = row.face_match_confidence;
  if (row.face_liveness_risk != null) user.faceLivenessRisk = row.face_liveness_risk;
  return user;
};

module.exports = { serializeUser };