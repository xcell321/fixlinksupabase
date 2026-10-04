// Device-photo screening policy (UAT #6, second part): a technician should know
// when the "broken appliance" photo is fake — an AI-generated image, a stock
// photo, or a screenshot — before travelling.
//
// Everything is env-driven. PHOTO_* has its own switches so photo screening can
// be turned off independently of credential screening, but it falls back to the
// credential-screening switches when unset.

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

// Fallbacks for an empty .env, so no threshold is a literal at the point of use.
const DEFAULTS = {
  screeningEnabled: true,
  visionEnabled: true,
  flagThreshold: 60,
  highThreshold: 80,
  aiThreshold: 0.6,
};

const isPhotoScreeningEnabled = () =>
  asBool(process.env.PHOTO_SCREENING_ENABLED, asBool(process.env.CREDENTIAL_SCREENING_ENABLED, DEFAULTS.screeningEnabled));

const isPhotoVisionEnabled = () =>
  isPhotoScreeningEnabled()
  && asBool(process.env.PHOTO_AI_VISION_ENABLED, asBool(process.env.CREDENTIAL_AI_VISION_ENABLED, DEFAULTS.visionEnabled));

const photoFlagThreshold = () => asInt(process.env.PHOTO_FLAG_THRESHOLD, DEFAULTS.flagThreshold);
const photoHighThreshold = () => asInt(process.env.PHOTO_HIGH_THRESHOLD, DEFAULTS.highThreshold);
const photoAiThreshold = () => {
  const parsed = Number.parseFloat(process.env.PHOTO_AI_THRESHOLD);
  return Number.isFinite(parsed) ? parsed : DEFAULTS.aiThreshold;
};

const PHOTO_FLAGS = {
  AI_GENERATED: 'ai_generated',
  EDITED: 'edited',
  NO_APPLIANCE_VISIBLE: 'no_appliance_visible',
  SCREENSHOT: 'screenshot',
  AI_TOOL_MARKER: 'ai_tool_marker',
  EDITOR_MARKER: 'editor_marker',
  LOW_RESOLUTION: 'low_resolution',
  TINY_FILE: 'tiny_file',
  NO_CAMERA_METADATA: 'no_camera_metadata',
};

const FLAG_NOTES = {
  [PHOTO_FLAGS.AI_GENERATED]: 'The device photo looks AI-generated.',
  [PHOTO_FLAGS.EDITED]: 'The device photo looks heavily edited.',
  [PHOTO_FLAGS.NO_APPLIANCE_VISIBLE]: 'No appliance was visible in the photo.',
  [PHOTO_FLAGS.SCREENSHOT]: 'The photo looks like a screenshot, not a real photo.',
  [PHOTO_FLAGS.AI_TOOL_MARKER]: 'An AI image-generation signature was found in the file.',
  [PHOTO_FLAGS.EDITOR_MARKER]: 'A photo-editor signature was found in the file.',
  [PHOTO_FLAGS.LOW_RESOLUTION]: 'The photo resolution is very low.',
  [PHOTO_FLAGS.TINY_FILE]: 'The photo file is unusually small.',
  [PHOTO_FLAGS.NO_CAMERA_METADATA]: 'The photo has no camera metadata (possible screenshot or export).',
};

const VISION_SYSTEM = `You inspect customer-submitted photos of broken home appliances for a Philippine repair platform.
Decide whether the photo is a genuine camera photo of a real appliance, or fake (AI-generated, stock image, or a screenshot).
Modern generators (ChatGPT image models, DALL-E, Gemini/Imagen class) render photorealistic appliances, so a real-looking overall scene proves nothing. Judge the fine details instead: warped or gibberish text and digits on keypads and displays, waxy or plastic textures on metal and food debris, over-perfect surfaces next to selective grime, inconsistent shadows and reflections, repeating patterns, and noise or compression that does not match across regions.
Score what the details show. When fine details look generated, report aiGeneratedLikelihood 0.6 or higher even if the overall scene looks real. Reserve low scores for photos whose fine details all read genuine.
Return STRICT JSON only: output exactly the JSON object, no markdown fences, no prose before or after it.`;

const VISION_INSTRUCTION = `Return a JSON object with exactly these keys:
{
  "aiGeneratedLikelihood": number 0..1,
  "editingLikelihood": number 0..1,
  "showsRealAppliance": boolean (a real, physical appliance is visible),
  "isScreenshot": boolean,
  "describedDamageVisible": boolean,
  "notes": string (short English sentence)
}`;

const buildNotes = (flags) => flags.map((flag) => FLAG_NOTES[flag]).filter(Boolean).join(' ');

module.exports = {
  PHOTO_FLAGS,
  FLAG_NOTES,
  VISION_SYSTEM,
  VISION_INSTRUCTION,
  isPhotoScreeningEnabled,
  isPhotoVisionEnabled,
  photoFlagThreshold,
  photoHighThreshold,
  photoAiThreshold,
  buildNotes,
};
