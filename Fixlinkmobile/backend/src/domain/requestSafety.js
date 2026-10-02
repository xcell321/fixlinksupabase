// Request-safety policy (UAT #5): guard against fake addresses, grudge
// bookings ("silingan nga lagot" — someone booking a repair at a neighbour's
// address) and repeated bookings used to harass a technician or an address.
//
// Everything is env-driven. The pure helpers (address inspection, similarity)
// are unit-testable without any I/O.

const FLAGS = {
  ADDRESS_TOO_SHORT: 'address_too_short',
  ADDRESS_GIBBERISH: 'address_gibberish',
  ADDRESS_REPEATED_CHARS: 'address_repeated_chars',
  CUSTOMER_NOT_NEAR_ADDRESS: 'customer_not_near_address',
  ADDRESS_TARGETED_TODAY: 'address_targeted_today',
  DUPLICATE_REQUEST: 'duplicate_request',
};

const LEVELS = { LOW: 'low', FLAGGED: 'flagged', HIGH: 'high' };

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const asFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const isRequestSafetyEnabled = () => asBool(process.env.REQUEST_SAFETY_ENABLED, true);

// --- Address sanity -------------------------------------------------------
const addressMinLength = () => asInt(process.env.ADDRESS_MIN_LENGTH, 8);
const addressMinTokens = () => asInt(process.env.ADDRESS_MIN_TOKENS, 2);
const addressMaxRepeatRun = () => asInt(process.env.ADDRESS_MAX_REPEAT_RUN, 4);

// --- Proximity ("is the customer actually at the address?") ---------------
const addressGpsToleranceKm = () => asFloat(process.env.ADDRESS_GPS_TOLERANCE_KM, 5);
// 'flag' (default) warns the technician; 'block' refuses the submission.
const addressEnforcement = () => String(process.env.ADDRESS_ENFORCEMENT || 'flag').toLowerCase();

// --- Repeated / spam bookings --------------------------------------------
const submitCooldownSeconds = () => asInt(process.env.SUBMIT_COOLDOWN_SECONDS, 60);
const spamWindowHours = () => asFloat(process.env.SPAM_WINDOW_HOURS, 24);
const spamSimilarityThreshold = () => asFloat(process.env.SPAM_SIMILARITY_THRESHOLD, 0.8);
const spamMaxMatches = () => asInt(process.env.SPAM_MAX_MATCHES, 2);
const addressDailyCap = () => asInt(process.env.MAX_BOOKINGS_PER_ADDRESS_PER_DAY, 3);

// Which calendar day "today" is, so the anti-harassment window lines up with the
// customer's local midnight instead of the server's timezone. Reuses the daily
// limit offset unless overridden, keeping one definition of "today" app-wide.
const DEFAULT_UTC_OFFSET_HOURS = 8;
const safetyUtcOffsetHours = () => {
  const raw = process.env.REQUEST_SAFETY_UTC_OFFSET_HOURS
    ?? process.env.DAILY_LIMIT_UTC_OFFSET_HOURS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_UTC_OFFSET_HOURS;
};

// --- Pure helpers ---------------------------------------------------------
const normalizeAddress = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value) => normalizeAddress(value).split(' ').filter(Boolean);

// Jaccard similarity over word sets: 0 (unrelated) .. 1 (identical words).
const similarity = (first, second) => {
  const left = new Set(tokenize(first));
  const right = new Set(tokenize(second));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const longestRepeatRun = (value) => {
  const text = String(value || '');
  let longest = 0;
  let run = 1;
  for (let i = 1; i <= text.length; i += 1) {
    if (i < text.length && text[i] === text[i - 1]) run += 1;
    else { longest = Math.max(longest, run); run = 1; }
  }
  return longest;
};

// Returns { ok, reason, flags }. A failed check is a hard validation error.
const inspectAddress = (address) => {
  const raw = String(address || '').trim();
  const flags = [];
  if (raw.length < addressMinLength()) {
    flags.push(FLAGS.ADDRESS_TOO_SHORT);
    return { ok: false, reason: `Please enter a complete service address (at least ${addressMinLength()} characters).`, flags };
  }
  if (!/[a-z]/i.test(raw) || tokenize(raw).length < addressMinTokens()) {
    flags.push(FLAGS.ADDRESS_GIBBERISH);
    return { ok: false, reason: 'That service address does not look valid. Please enter a real street address.', flags };
  }
  if (longestRepeatRun(raw) > addressMaxRepeatRun()) {
    flags.push(FLAGS.ADDRESS_REPEATED_CHARS);
    return { ok: false, reason: 'That service address does not look valid. Please enter a real street address.', flags };
  }
  return { ok: true, reason: null, flags };
};

const levelForFlags = (flags) => {
  const list = flags || [];
  if (list.includes(FLAGS.DUPLICATE_REQUEST) || list.includes(FLAGS.CUSTOMER_NOT_NEAR_ADDRESS)) return LEVELS.HIGH;
  return list.length > 0 ? LEVELS.FLAGGED : LEVELS.LOW;
};

// Calendar-day key in the configured offset (same convention as
// domain/dailyRequestLimit), so the same booking lands on the same day no
// matter where the server runs.
const dayKey = (value, offsetHours = safetyUtcOffsetHours()) => {
  const time = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(time)) return null;
  const shifted = new Date(time + offsetHours * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`;
};

module.exports = {
  FLAGS,
  LEVELS,
  isRequestSafetyEnabled,
  addressMinLength,
  addressMinTokens,
  addressMaxRepeatRun,
  addressGpsToleranceKm,
  addressEnforcement,
  submitCooldownSeconds,
  spamWindowHours,
  spamSimilarityThreshold,
  spamMaxMatches,
  addressDailyCap,
  safetyUtcOffsetHours,
  normalizeAddress,
  tokenize,
  similarity,
  longestRepeatRun,
  inspectAddress,
  levelForFlags,
  dayKey,
};
