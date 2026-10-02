/**
 * FixLink — UAT environment audit (#6-#11)
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
  'OmniRoute (AI gateway)': [
    'OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY', 'OMNIROUTE_MODEL',
    'OMNIROUTE_VISION_MODEL', 'OMNIROUTE_VISION_FALLBACK_MODELS', 'OMNIROUTE_TIMEOUT_MS',
  ],
  '#6 daily request cap': ['MAX_REQUESTS_PER_DAY', 'DAILY_LIMIT_UTC_OFFSET_HOURS', 'DAILY_LIMIT_FREE_STATUSES'],
  '#7 technician capacity': ['TECHNICIAN_MAX_ACTIVE_JOBS', 'TECHNICIAN_BUSY_JOBS', 'TECHNICIAN_AT_CAPACITY_JOBS'],
  '#8 repeat scammer': ['CUSTOMER_SCAM_LIMIT', 'CUSTOMER_SCAM_AUTO_SUSPEND'],
  '#11 two-way ratings': ['RATING_MIN', 'RATING_MAX', 'REVIEWER_ROLES'],
  '#9/#10 credential screening': [
    'CREDENTIAL_SCREENING_ENABLED', 'CREDENTIAL_AI_VISION_ENABLED', 'CREDENTIAL_FACE_CHECK_ENABLED',
    'CREDENTIAL_SELFIE_REQUIRED', 'CREDENTIAL_FLAG_THRESHOLD', 'CREDENTIAL_HIGH_THRESHOLD',
    'CREDENTIAL_MIN_DIMENSION', 'CREDENTIAL_MIN_FILE_BYTES', 'CREDENTIAL_FORENSIC_WEIGHT',
    'CREDENTIAL_VISION_WEIGHT', 'CREDENTIAL_VISION_AI_THRESHOLD', 'CREDENTIAL_VISION_TAMPER_THRESHOLD',
    'CREDENTIAL_FACE_MATCH_THRESHOLD', 'CREDENTIAL_LIVENESS_RISK_THRESHOLD',
    'CREDENTIAL_VISION_MAX_BYTES', 'CREDENTIAL_VISION_TIMEOUT_MS',
  ],
};

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
console.log(`  vision model chain          ${[require('../src/services/omniRoute').getVisionModel(), ...require('../src/services/omniRoute').getVisionFallbackModels()].join(' -> ')}`);

console.log(`\nSummary: ${present} set, ${missing} missing.`);
console.log(missing === 0
  ? 'All UAT variables are configured. ✅'
  : 'Missing variables fall back to the documented defaults (still works, not env-driven).\n');
