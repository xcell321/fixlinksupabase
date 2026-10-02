// Multer configuration for technician verification documents.
// Extracted from routes/auth.js so register, profile and portfolio uploads
// share one documented 10MB JPG/PNG/PDF rule. Behavior is unchanged.

const multer = require('multer');

const DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const DOCUMENT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

const registrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const dotIndex = file.originalname.lastIndexOf('.');
    const extension = dotIndex >= 0 ? file.originalname.slice(dotIndex).toLowerCase() : '';
    // Rejecting with an error (instead of a silent false) matters: a silent
    // drop makes the route report both files as missing even though the user
    // attached them, which hides the real problem (wrong file type).
    if (DOCUMENT_MIME_TYPES.includes(file.mimetype) || DOCUMENT_EXTENSIONS.includes(extension)) {
      callback(null, true);
    } else {
      callback(new Error(`UNSUPPORTED_FILE_TYPE:${file.fieldname || 'document'}`));
    }
  },
});

// Multer errors default to an HTML 500 page, which the app cannot display.
// Convert them to JSON so the register screen always shows a readable message
// instead of spinning with no result.
const registerUpload = registrationUpload.fields([
  { name: 'facePhotoFile', maxCount: 1 },
  { name: 'governmentIdFile', maxCount: 1 },
  { name: 'certificateFile', maxCount: 1 },
]);

const handleUploadErrors = (req, res, next) => {
  registerUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Each document must be 10MB or smaller. Please use a smaller file.' });
      }
      if (String(err.message || '').startsWith('UNSUPPORTED_FILE_TYPE')) {
        return res.status(400).json({ error: 'Verification documents must be JPG, PNG, or PDF. Please pick a different file.' });
      }
      return res.status(400).json({ error: 'Document upload failed. Use JPG, PNG, or PDF files.' });
    }
    next();
  });
};

module.exports = { registrationUpload, registerUpload, handleUploadErrors };
