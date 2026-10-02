// Layer 1 of credential screening (UAT #9): local forensics.
//
// Runs before any network call and uses zero third-party packages. It sniffs
// the real file type from magic bytes (a renamed .pdf or an AI export often
// lies about its extension), reads image dimensions straight out of the header,
// detects whether camera metadata is present, and greps the raw bytes for the
// fingerprints AI generators and photo editors leave behind.
//
// It never decides anything on its own: it returns evidence and a 0-100
// forensic risk that the orchestrator blends with the AI vision pass.

const { config } = require('../../domain/credentialScreening');

// Exact AI-generation / provenance fingerprints. Matched case-insensitively
// against the raw file bytes, which is enough to catch exports that keep their
// generator signature or C2PA manifest in the metadata.
const DEFAULT_AI_TOOL_MARKERS = [
  'midjourney', 'dall-e', 'dalle', 'stable diffusion', 'stablediffusion',
  'comfyui', 'c2pa', 'synthid', 'govai', 'imagen', 'firefly', 'flux',
];
const DEFAULT_EDITOR_MARKERS = [
  'photoshop', 'adobe photoshop', 'canva', 'snapseed', 'lightroom',
  'gimp', 'picsart', 'pixlr',
];

// Signature lists are tunable from the environment so new AI tools / editors can
// be added without a code change.
const markerList = (envKey, fallback) => {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const list = String(raw).split(',').map((marker) => marker.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : fallback;
};
const aiToolMarkers = () => markerList('CREDENTIAL_AI_MARKERS', DEFAULT_AI_TOOL_MARKERS);
const editorMarkers = () => markerList('CREDENTIAL_EDITOR_MARKERS', DEFAULT_EDITOR_MARKERS);

const sniffFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return 'unknown';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8
    && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.slice(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (buffer.slice(0, 3).toString('latin1') === 'GIF') return 'gif';
  if (buffer.slice(0, 2).toString('latin1') === 'BM') return 'bmp';
  return 'unknown';
};

// PNG: IHDR width/height are big-endian uint32 at offsets 16 and 20.
const pngDimensions = (buffer) => {
  if (buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

// JPEG: walk the marker segments until a Start-Of-Frame, which carries the
// height (offset +5) and width (offset +7) as big-endian uint16.
const jpegDimensions = (buffer) => {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
};

const hasExif = (buffer) => buffer.slice(0, 4096).toString('latin1').includes('Exif');

const findMarkers = (buffer, markers) => {
  const haystack = buffer.toString('latin1').toLowerCase();
  return markers.filter((marker) => haystack.includes(marker));
};

// Forensic risk is additive and capped at 100. Each finding also contributes a
// named flag so the admin can see exactly why the document was flagged.
const analyzeDocument = (file) => {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer)) {
    return { format: 'unknown', bytes: 0, width: null, height: null, hasCameraMetadata: false, aiMarkers: [], editorMarkers: [], score: null, flags: [] };
  }

  const { minFileBytes, minDimension } = config();
  const format = sniffFormat(buffer);
  const bytes = buffer.length;
  const isImage = format === 'jpeg' || format === 'png';
  const dims = format === 'png' ? pngDimensions(buffer) : format === 'jpeg' ? jpegDimensions(buffer) : null;
  const cameraMetadata = format === 'jpeg' ? hasExif(buffer) : false;
  const foundAiMarkers = findMarkers(buffer, aiToolMarkers());
  const foundEditorMarkers = findMarkers(buffer, editorMarkers());

  const flags = [];
  let score = 0;
  if (bytes < minFileBytes) { flags.push('tiny_file'); score += 30; }
  if (isImage && dims && (dims.width < minDimension || dims.height < minDimension)) {
    flags.push('low_resolution'); score += 35;
  }
  if (isImage && !cameraMetadata) { flags.push('no_camera_metadata'); score += 20; }
  if (foundAiMarkers.length > 0) { flags.push('ai_tool_marker'); score += 70; }
  if (foundEditorMarkers.length > 0) { flags.push('editor_marker'); score += 30; }

  return {
    format,
    bytes,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    hasCameraMetadata: cameraMetadata,
    aiMarkers: foundAiMarkers,
    editorMarkers: foundEditorMarkers,
    score: Math.min(100, score),
    flags,
  };
};

module.exports = {
  analyzeDocument,
  sniffFormat,
  aiToolMarkers,
  editorMarkers,
  DEFAULT_AI_TOOL_MARKERS,
  DEFAULT_EDITOR_MARKERS,
};
