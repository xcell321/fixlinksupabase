const multer = require('multer');

// Repair-request photos are small (phone camera JPEGs) and are streamed
// straight to Supabase Storage, so they never need to touch disk. The 5 MB cap
// matches the mobile client's own downscaling limit and keeps a bad upload from
// buffering the whole process.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { memoryUpload };
