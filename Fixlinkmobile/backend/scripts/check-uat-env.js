/**
 * FixLink — UAT environment audit (#2-#11)
 * Reports which env vars are present in backend/.env and the effective values
 * the domain modules resolve (env value, or the documented fallback).
 *
 * Secrets are never printed: only "set (masked)" / "MISSING".
 *
 * Usage: node scripts/check-uat-env.js
 */
require('dotenv').config();

const SECRET_PATTERN = /(_KEY|_SECRET|_PASSWORD|_TOKEN|JWT)/i;

const groups = {
  'Supabase (required)': ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_JWKS_URL'],
  // Two independent axes: TEXT (assistant/ranking) and VISION (#6/#9/#10
  // screening) can point at different providers. `AI_*` is current; the
  // `OMNIROUTE_*` names are still read as a fallback alias, so an older .env
  // keeps working untouched. Each provider accepts several keys, tried in
  // order, so an exhausted free-tier key falls through to the next.
  'AI provider (text: assistant/ranking · vision: #6/#9/#10 screening)': [
    'AI_PROVIDER', 'AI_BASE_URL', 'AI_API_KEY', 'AI_API_KEYS', 'AI_MODEL',
    'AI_VISION_PROVIDER', 'AI_VISION_BASE_URL', 'AI_VISION_API_KEY', 'AI_VISION_API_KEYS',
    'AI_VISION_MODEL', 'AI_VISION_FALLBACK_MODELS',
    'AI_TIMEOUT_MS', 'AI_VISION_TIMEOUT_MS',
    'AI_MAX_TOKENS', 'AI_VISION_MAX_TOKENS', 'AI_REASONING_EFFORT',
    'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GEMINI_API_KEY_BACKUP',
    'OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY', 'OMNIROUTE_API_KEYS', 'OMNIROUTE_MODEL',
    'OMNIROUTE_VISION_BASE_URL', 'OMNIROUTE_VISION_MODEL', 'OMNIROUTE_VISION_FALLBACK_MODELS',
    'OMNIROUTE_TIMEOUT_MS', 'OMNIROUTE_VISION_TIMEOUT_MS',
    'OMNIROUTE_MAX_TOKENS', 'OMNIROUTE_VISION_MAX_TOKENS', 'OMNIROUTE_REASONING_EFFORT',
  ],
  // Not UAT tunables, but every process.env read in src/ has to appear in this
  // file: e2e-uat.js asserts exactly that, so a new variable can never be
  // introduced without being documented here.
  'Infrastructure (non-UAT)': [
    'PORT', 'PUBLIC_BASE_URL', 'RESET_TOKEN_SECRET',
    'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM',
    'LOCATIONIQ_ACCESS_TOKEN',
  ],
  '#2 auto-suspend': [
    'CUSTOMER_NOSHOW_WAIT_MINUTES', 'CUSTOMER_NOSHOW_LIMIT', 'CUSTOMER_NOSHOW_AUTO_SUSPEND',
    'CUSTOMER_LATE_CANCEL_LIMIT', 'CUSTOMER_LATE_CANCEL_AUTO_SUSPEND',
  ],
  // Keys these modules build at runtime (`process.env[envKey]`), so they cannot
  // be found by scanning for a literal member expression.
  'Signup requirements + screening keywords': [
    'TECHNICIAN_REQUIRED_DOCS', 'CUSTOMER_REQUIRED_DOCS',
    'CREDENTIAL_AI_MARKERS', 'CREDENTIAL_EDITOR_MARKERS',
  ],
  '#4 booking regulations': ['SUBMIT_TERMS_REQUIRED', 'SUBMIT_TERMS_VERSION', 'SUBMIT_TERMS_REJECTION'],
  '#5 request safety': [
    'REQUEST_SAFETY_ENABLED', 'ADDRESS_MIN_LENGTH', 'ADDRESS_MIN_TOKENS', 'ADDRESS_MAX_REPEAT_RUN',
    'ADDRESS_GPS_TOLERANCE_KM', 'ADDRESS_ENFORCEMENT', 'SUBMIT_COOLDOWN_SECONDS',
    'SPAM_WINDOW_HOURS', 'SPAM_SIMILARITY_THRESHOLD', 'SPAM_MAX_MATCHES',
    'MAX_BOOKINGS_PER_ADDRESS_PER_DAY', 'REQUEST_SAFETY_UTC_OFFSET_HOURS',
  ],
  '#6 daily request cap': ['MAX_REQUESTS_PER_DAY', 'DAILY_LIMIT_UTC_OFFSET_HOURS', 'DAILY_LIMIT_FREE_STATUSES'],
  '#6 device-photo screening': [
    'PHOTO_SCREENING_ENABLED', 'PHOTO_AI_VISION_ENABLED',
    'PHOTO_FLAG_THRESHOLD', 'PHOTO_HIGH_THRESHOLD', 'PHOTO_AI_THRESHOLD',
  ],
  '#7 technician capacity': [
    'TECHNICIAN_MAX_ACTIVE_JOBS', 'TECHNICIAN_BUSY_JOBS', 'TECHNICIAN_AT_CAPACITY_JOBS',
    'ACTIVE_JOB_STATUSES',
  ],
  '#8 repeat scammer': ['CUSTOMER_SCAM_LIMIT', 'CUSTOMER_SCAM_AUTO_SUSPEND', 'SCAM_REPORTABLE_STATUSES'],
  '#11 two-way ratings': [
    'RATING_MIN', 'RATING_MAX', 'REVIEWER_ROLES',
    'NEGATIVE_RATING_MAX', 'CUSTOMER_NEGATIVE_RATING_LIMIT', 'CUSTOMER_NEGATIVE_RATING_AUTO_SUSPEND',
  ],
  '#9/#10 credential screening': [
    'CREDENTIAL_SCREENING_ENABLED', 'CREDENTIAL_AI_VISION_ENABLED', 'CREDENTIAL_FACE_CHECK_ENABLED',
    'CREDENTIAL_SELFIE_REQUIRED', 'CREDENTIAL_FLAG_THRESHOLD', 'CREDENTIAL_HIGH_THRESHOLD',
    'CREDENTIAL_MIN_DIMENSION', 'CREDENTIAL_MIN_FILE_BYTES', 'CREDENTIAL_FORENSIC_WEIGHT',
    'CREDENTIAL_VISION_WEIGHT', 'CREDENTIAL_VISION_AI_THRESHOLD', 'CREDENTIAL_VISION_TAMPER_THRESHOLD',
    'CREDENTIAL_FACE_MATCH_THRESHOLD', 'CREDENTIAL_LIVENESS_RISK_THRESHOLD',
    'CREDENTIAL_VISION_MAX_BYTES', 'CREDENTIAL_VISION_TIMEOUT_MS',
  ],
  'Login face gate': ['REQUIRE_LOGIN_FACE', 'LOGIN_FACE_MATCH_THRESHOLD'],
};

const ai = require('../src/domain/aiProvider');
const autoSuspend = require('../src/domain/autoSuspendPolicy');
const loginFace = require('../src/domain/loginFacePolicy');
const daily = require('../src/domain/dailyRequestLimit');
const workload = require('../src/services/workloadService');
const scam = require('../src/domain/scamPolicy');
const ratings = require('../src/domain/ratingRules');
const screening = require('../src/domain/credentialScreening');

let missing = 0;
let present = 0;

console.log('\n=== FixLink UAT environment audit ===\n');
for (const [group, keys] of Object.entries(groups)) {
  console.log(group);
  for (const key of keys) {
    const raw = process.env[key];
    const has = raw !== undefined && raw !== '';
    if (has) present += 1; else missing += 1;
    const shown = !has ? 'MISSING' : SECRET_PATTERN.test(key) ? 'set (masked)' : raw;
    console.log(`  ${has ? '✔' : '✘'} ${key.padEnd(38)} ${shown}`);
  }
  console.log('');
}

console.log('=== Effective values (env or documented fallback) ===');
console.log(`  customerNoShowWaitMinutes() ${autoSuspend.customerNoShowWaitMinutes()}`);
console.log(`  customerNoShowLimit()       ${autoSuspend.customerNoShowLimit()}`);
console.log(`  noShowAutoSuspendEnabled()  ${autoSuspend.customerNoShowAutoSuspendEnabled()}`);
console.log(`  customerLateCancelLimit()   ${autoSuspend.customerLateCancelLimit()}`);
console.log(`  lateCancelAutoSuspendOn()   ${autoSuspend.customerLateCancelAutoSuspendEnabled()}`);
console.log(`  maxDailyRequests()          ${daily.maxDailyRequests()}`);
console.log(`  utcOffsetHours()            ${daily.utcOffsetHours()}`);
console.log(`  freeStatuses()              ${daily.freeStatuses().join(', ')}`);
console.log(`  getMaxActiveJobs()          ${workload.getMaxActiveJobs()}`);
console.log(`  getBusyThreshold()          ${workload.getBusyThreshold()}`);
console.log(`  getAtCapacityThreshold()    ${workload.getAtCapacityThreshold()}`);
console.log(`  customerScamLimit()         ${scam.customerScamLimit()}`);
console.log(`  autoSuspendEnabled()        ${scam.autoSuspendEnabled()}`);
console.log(`  ratingRange()               ${ratings.ratingRangeLabel()}`);
console.log(`  reviewerRoles()             ${ratings.reviewerRoles().join(', ')}`);
console.log(`  screeningEnabled()          ${screening.isScreeningEnabled()}`);
console.log(`  visionEnabled()             ${screening.isVisionEnabled()}`);
console.log(`  faceCheckEnabled()          ${screening.isFaceCheckEnabled()}`);
console.log(`  textProviderName()          ${ai.textProviderName()}`);
console.log(`  visionProviderName()        ${ai.visionProviderName()}`);
console.log(`  aiBaseUrl()                 ${ai.aiBaseUrl()}`);
console.log(`  aiVisionBaseUrl()           ${ai.aiVisionBaseUrl()}`);
console.log(`  aiApiKeys()                 ${ai.aiApiKeys().length} configured`);
console.log(`  aiVisionApiKeys()           ${ai.aiVisionApiKeys().length} configured`);
console.log(`  aiModel()                   ${ai.aiModel()}`);
console.log(`  aiVisionModel()             ${ai.aiVisionModel()}`);
console.log(`  vision model chain          ${[ai.aiVisionModel(), ...ai.aiVisionFallbackModels()].join(' -> ')}`);
console.log(`  aiTimeoutMs()               ${ai.aiTimeoutMs()}`);
console.log(`  aiVisionTimeoutMs()         ${ai.aiVisionTimeoutMs()}`);
console.log(`  aiMaxTokens()               ${ai.aiMaxTokens()}`);
console.log(`  aiVisionMaxTokens()         ${ai.aiVisionMaxTokens()}`);
console.log(`  aiReasoningEffort()         ${ai.aiReasoningEffort() || '(omitted)'}`);
  console.log(`  isAiConfigured()            ${ai.isAiConfigured()}`);
  console.log(`  isVisionConfigured()        ${ai.isVisionConfigured()}`);
  console.log(`  requireLoginFace()          ${loginFace.requireLoginFace()}`);
  console.log(`  loginFaceMatchThreshold()   ${loginFace.loginFaceMatchThreshold()}`);

console.log(`\nSummary: ${present} set, ${missing} missing.`);
console.log(missing === 0
  ? 'All UAT variables are configured. ✅'
  : 'Missing variables fall back to the documented defaults (still works, not env-driven).\n');
