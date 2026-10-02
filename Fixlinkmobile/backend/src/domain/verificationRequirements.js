// Signup verification requirements (UAT #10): every account carries identity on
// record from day one so scammers can be flagged later.
//
// Which documents each role must upload is env-driven, so the requirement can
// change without touching code:
//   TECHNICIAN_REQUIRED_DOCS=facePhotoFile,governmentIdFile,certificateFile
//   CUSTOMER_REQUIRED_DOCS=facePhotoFile,governmentIdFile
//
// Returns an error string, or null when the file set is complete.

const DEFAULT_TECHNICIAN_DOCS = ['facePhotoFile', 'governmentIdFile', 'certificateFile'];
const DEFAULT_CUSTOMER_DOCS = ['facePhotoFile', 'governmentIdFile'];

const FILE_LABELS = {
  facePhotoFile: 'A face photo is required.',
  governmentIdFile: 'A government ID file is required.',
  certificateFile: 'A certificate file is required.',
};

const requiredDocs = (role) => {
  const isTechnician = String(role || '').toLowerCase() === 'technician';
  const envKey = isTechnician ? 'TECHNICIAN_REQUIRED_DOCS' : 'CUSTOMER_REQUIRED_DOCS';
  const fallback = isTechnician ? DEFAULT_TECHNICIAN_DOCS : DEFAULT_CUSTOMER_DOCS;
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const list = String(raw).split(',').map((field) => field.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
};

const verificationRequirements = (role, files) => {
  const has = (field) => Boolean(files && files[field] && files[field][0]);
  for (const field of requiredDocs(role)) {
    if (!has(field)) return FILE_LABELS[field] || `${field} is required.`;
  }
  return null;
};

module.exports = { verificationRequirements, requiredDocs, FILE_LABELS };
