/**
 * FixLink — consolidated E2E for UAT #2-#11.
 *
 * Boots the REAL Express app against the in-memory Supabase stub and drives it
 * over HTTP (no live database, no writes outside the test process). It also
 * audits that every tunable is env-driven rather than hardcoded.
 *
 * Usage: node scripts/e2e-uat.js
 */
require('dotenv').config();

const { installSupabaseStub } = require('../test/helpers/supabaseStub');

const CUSTOMER_DAILY = 'c0000000-0000-0000-0000-000000000001';
const CUSTOMER_LIMIT = 'c0000000-0000-0000-0000-000000000002';
const CUSTOMER_SCAM = 'c0000000-0000-0000-0000-000000000003';
const CUSTOMER_RATE = 'c0000000-0000-0000-0000-000000000004';
const CUSTOMER_SAFETY = 'c0000000-0000-0000-0000-000000000005';
const CUSTOMER_TERMS = 'c0000000-0000-0000-0000-000000000006';
const CUSTOMER_NOSHOW = 'c0000000-0000-0000-0000-000000000007';
const CUSTOMER_LATE_CANCEL = 'c0000000-0000-0000-0000-000000000008';
const CUSTOMER_EARLY_CANCEL = 'c0000000-0000-0000-0000-000000000009';
const TECH_A = 'e0000000-0000-0000-0000-000000000001';
const TECH_SCAM = 'e0000000-0000-0000-0000-000000000002';
const TECH_RATE = 'e0000000-0000-0000-0000-000000000003';
const STRANGER = 'e0000000-0000-0000-0000-000000000004';

const J_ACTIVE = 'a0000000-0000-0000-0000-000000000001';
const J_PENDING_OVER = 'a0000000-0000-0000-0000-000000000002';
const J_PENDING_OK = 'a0000000-0000-0000-0000-000000000003';
const J_SCAM = ['a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000013'];
const J_RATE_OK = 'a0000000-0000-0000-0000-000000000021';
const J_RATE_BAD = 'a0000000-0000-0000-0000-000000000022';
const J_NOSHOW = 'a0000000-0000-0000-0000-000000000031';
const J_LATE_CANCEL = 'a0000000-0000-0000-0000-000000000032';
const J_EARLY_CANCEL = 'a0000000-0000-0000-0000-000000000033';

// UAT #2 measures a wait window, so the fixtures carry an arrival stamp.
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

const T_CUSTOMER_DAILY = 'daily-token';
const T_CUSTOMER_LIMIT = 'limit-token';
const T_TECH_SCAM = 'scam-tech-token';
const T_TECH_RATE = 'rate-tech-token';
const T_TECH_A = 'tech-a-token';
const T_STRANGER = 'stranger-token';
const T_CUSTOMER_SAFETY = 'safety-token';
const T_CUSTOMER_TERMS = 'terms-token';
const T_CUSTOMER_LATE_CANCEL = 'late-cancel-token';
const T_CUSTOMER_EARLY_CANCEL = 'early-cancel-token';

const completed = (id, techUid, techName, custUid, custName) => ({
  id, status: 'Completed', technician_uid: techUid, technician_name: techName, customer_uid: custUid, customer_name: custName,
});

installSupabaseStub({
  users: [
    { id: CUSTOMER_DAILY, role: 'customer', email: 'daily@fixlink.test', status: 'active' },
    { id: CUSTOMER_LIMIT, role: 'customer', email: 'limit@fixlink.test', status: 'active' },
    { id: CUSTOMER_SCAM, role: 'customer', email: 'scam@fixlink.test', status: 'active', scam_count: 0 },
    { id: CUSTOMER_SAFETY, role: 'customer', email: 'safety@fixlink.test', status: 'active' },
    { id: CUSTOMER_TERMS, role: 'customer', email: 'terms@fixlink.test', status: 'active' },
    { id: CUSTOMER_NOSHOW, role: 'customer', email: 'noshow@fixlink.test', status: 'active', no_show_count: 0 },
    { id: CUSTOMER_LATE_CANCEL, role: 'customer', email: 'latecancel@fixlink.test', status: 'active' },
    { id: CUSTOMER_EARLY_CANCEL, role: 'customer', email: 'earlycancel@fixlink.test', status: 'active' },
    {
      id: CUSTOMER_RATE,
      role: 'customer',
      email: 'rate@fixlink.test',
      status: 'active',
      government_id_file_url: 'https://stub.local/id.jpg',
      portfolio: ['https://stub.local/p1.jpg', 'https://stub.local/p2.jpg'],
      rating: 4.5,
      total_reviews: 8,
    },
    { id: TECH_A, role: 'technician', email: 'techa@fixlink.test', status: 'active' },
    { id: TECH_SCAM, role: 'technician', email: 'techscam@fixlink.test', status: 'active' },
    { id: TECH_RATE, role: 'technician', email: 'techrate@fixlink.test', status: 'active' },
    { id: STRANGER, role: 'customer', email: 'stranger@fixlink.test', status: 'active' },
  ],
  tokens: {
    [T_CUSTOMER_DAILY]: CUSTOMER_DAILY, [T_CUSTOMER_LIMIT]: CUSTOMER_LIMIT,
    [T_TECH_SCAM]: TECH_SCAM, [T_TECH_RATE]: TECH_RATE, [T_TECH_A]: TECH_A, [T_STRANGER]: STRANGER,
    [T_CUSTOMER_SAFETY]: CUSTOMER_SAFETY, [T_CUSTOMER_TERMS]: CUSTOMER_TERMS,
    [T_CUSTOMER_LATE_CANCEL]: CUSTOMER_LATE_CANCEL, [T_CUSTOMER_EARLY_CANCEL]: CUSTOMER_EARLY_CANCEL,
  },
  tables: {
    jobs: [
      { id: J_ACTIVE, status: 'In Progress', technician_uid: TECH_A, technician_name: 'Tech A', customer_uid: CUSTOMER_DAILY, customer_name: 'Daily' },
      { id: J_PENDING_OVER, status: 'Pending', appliance_type: 'Fan', customer_name: 'Someone' },
      { id: J_PENDING_OK, status: 'Pending', appliance_type: 'Fan', customer_name: 'Someone' },
      ...J_SCAM.map((id) => completed(id, TECH_SCAM, 'Tech Scam', CUSTOMER_SCAM, 'Scam Cust')),
      completed(J_RATE_OK, TECH_RATE, 'Tech Rate', CUSTOMER_RATE, 'Rate Cust'),
      completed(J_RATE_BAD, TECH_RATE, 'Tech Rate', CUSTOMER_RATE, 'Rate Cust'),
      // UAT #2: the technician is on site and has been waiting.
      {
        id: J_NOSHOW, status: 'In Progress', appliance_type: 'Fan',
        technician_uid: TECH_A, technician_name: 'Tech A',
        customer_uid: CUSTOMER_NOSHOW, customer_name: 'NoShow Cust',
        technician_arrival_timestamp: minutesAgo(45),
      },
      {
        id: J_LATE_CANCEL, status: 'Customer Ready', appliance_type: 'Fan',
        technician_uid: TECH_A, technician_name: 'Tech A',
        customer_uid: CUSTOMER_LATE_CANCEL, customer_name: 'Late Cust',
        technician_arrival_timestamp: minutesAgo(15),
      },
      // Customer Ready with no arrival stamp: an ordinary cancellation, and a
      // no-show report the technician is not allowed to file yet.
      {
        id: J_EARLY_CANCEL, status: 'Customer Ready', appliance_type: 'Fan',
        technician_uid: TECH_A, technician_name: 'Tech A',
        customer_uid: CUSTOMER_EARLY_CANCEL, customer_name: 'Early Cust',
      },
    ],
    reviews: [
      { id: 'r1', customer_uid: CUSTOMER_RATE, reviewer_role: 'technician', rating: 1, request_id: 'x1' },
      { id: 'r2', customer_uid: CUSTOMER_RATE, reviewer_role: 'technician', rating: 2, request_id: 'x2' },
    ],
    service_incidents: [],
  },
});

const { app } = require('../src/index');
const domain = require('../src/domain/credentialScreening');
const photoDomain = require('../src/domain/photoScreening');
const { screenCredential } = require('../src/services/credential/credentialScreeningService');
const { screenRepairPhoto } = require('../src/services/credential/photoScreeningService');

const results = [];
const record = (feature, label, ok, detail = '') => results.push({ feature, label, ok, detail: String(detail) });

const withEnv = async (vars, run) => {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const pngBytes = (width, height, { pad = 0, extra = '' } = {}) => {
  const buffer = Buffer.alloc(24 + pad + extra.length);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  if (extra) Buffer.from(extra, 'latin1').copy(buffer, 24 + pad);
  return buffer;
};

let baseUrl = null;
const post = async (path, token, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, body: json };
};
const get = async (path, token) => {
  const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, body: json };
};
const put = async (path, token, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, body: json };
};

// UAT #4: every booking carries the regulation acceptance, so these checks reach
// the behaviour under test instead of the terms gate.
const submit = (token, description, uid) => post('/api/requests', token, {
  customerName: 'Test Customer', customerUid: uid, applianceType: 'Fan', description, location: 'Bogo City',
  termsAccepted: true,
});

const run = async () => {
  console.log('\n=== FixLink consolidated E2E — UAT #2-#11 ===\n');

  // ---------------- #4 booking regulations before the location step ----------------
  const noTerms = await post('/api/requests', T_CUSTOMER_TERMS, {
    customerName: 'Terms Tester', customerUid: CUSTOMER_TERMS, applianceType: 'Fan',
    description: '[Brand] no terms', location: 'Bogo City',
  });
  record('#4', 'a booking without the regulations is rejected (400)', noTerms.status === 400, `status ${noTerms.status}`);

  const withTerms = await post('/api/requests', T_CUSTOMER_TERMS, {
    customerName: 'Terms Tester', customerUid: CUSTOMER_TERMS, applianceType: 'Fan',
    description: '[Brand] with terms', location: 'Bogo City', termsAccepted: true,
  });
  record('#4', 'accepting the regulations lets the booking through (201)', withTerms.status === 201, `status ${withTerms.status}`);

  // ---------------- #2 auto-suspend after a wasted technician trip ----------------
  // Outside the wait window the report is refused, so nobody can suspend a
  // customer the moment they knock on the door.
  const tooEarly = await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '60' }, () =>
    post(`/api/requests/${J_NOSHOW}/report-no-show`, T_TECH_A, { technicianUid: TECH_A, reason: 'No one here' }));
  record('#2', 'a no-show inside the wait window is refused (409)',
    tooEarly.status === 409 && tooEarly.body?.code === 'CUSTOMER_NO_SHOW_WAIT',
    `status ${tooEarly.status} remaining=${tooEarly.body?.remainingMinutes}m`);

  const noShow = await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '30' }, () =>
    post(`/api/requests/${J_NOSHOW}/report-no-show`, T_TECH_A, { technicianUid: TECH_A, reason: 'No one here' }));
  record('#2', 'a no-show after the wait window suspends the customer',
    noShow.status === 200 && noShow.body?.customerSuspended === true,
    `waited=${noShow.body?.waitedMinutes}m count=${noShow.body?.noShowCount}`);

  const noArrival = await post(`/api/requests/${J_EARLY_CANCEL}/report-no-show`, T_TECH_A, {
    technicianUid: TECH_A, reason: 'No one here',
  });
  record('#2', 'a no-show without a recorded arrival is refused (409)',
    noArrival.status === 409 && noArrival.body?.code === 'ARRIVAL_REQUIRED', `status ${noArrival.status}`);

  const lateCancel = await put(`/api/requests/${J_LATE_CANCEL}/cancel`, T_CUSTOMER_LATE_CANCEL, {
    cancellationReason: 'Changed my mind',
  });
  record('#2', 'cancelling after the technician arrived suspends the customer',
    lateCancel.status === 200 && lateCancel.body?.customerSuspended === true,
    `stage=${lateCancel.body?.cancellationStage}`);

  const earlyCancel = await put(`/api/requests/${J_EARLY_CANCEL}/cancel`, T_CUSTOMER_EARLY_CANCEL, {
    cancellationReason: 'Changed my mind',
  });
  record('#2', 'cancelling before the technician arrives only cancels',
    earlyCancel.status === 200 && earlyCancel.body?.customerSuspended === false,
    `stage=${earlyCancel.body?.cancellationStage}`);

  // ---------------- #6 max 3 requests/day ----------------
  let s1 = await submit(T_CUSTOMER_DAILY, '[Brand] request one', CUSTOMER_DAILY);
  let s2 = await submit(T_CUSTOMER_DAILY, '[Brand] request two', CUSTOMER_DAILY);
  let s3 = await submit(T_CUSTOMER_DAILY, '[Brand] request three', CUSTOMER_DAILY);
  let s4 = await submit(T_CUSTOMER_DAILY, '[Brand] request four', CUSTOMER_DAILY);
  record('#6', 'first three requests are accepted', [s1, s2, s3].every((r) => r.status === 201), `${s1.status}/${s2.status}/${s3.status}`);
  record('#6', 'fourth request is rejected with 429', s4.status === 429, `status ${s4.status}`);

  const limitRes = await withEnv({ MAX_REQUESTS_PER_DAY: '1' }, async () => {
    const first = await submit(T_CUSTOMER_LIMIT, '[Brand] only one', CUSTOMER_LIMIT);
    const second = await submit(T_CUSTOMER_LIMIT, '[Brand] too many', CUSTOMER_LIMIT);
    return [first.status, second.status];
  });
  record('#6', 'limit is env-driven (MAX_REQUESTS_PER_DAY=1)', limitRes[0] === 201 && limitRes[1] === 429, limitRes.join('/'));

  // ---------------- #7 one active job per technician ----------------
  const over = await put(`/api/requests/${J_PENDING_OVER}/accept`, T_TECH_A, { technicianUid: TECH_A, technicianName: 'Tech A' });
  record('#7', 'technician with an active job is blocked (409)', over.status === 409, `status ${over.status}`);

  const relaxed = await withEnv({ TECHNICIAN_MAX_ACTIVE_JOBS: '2' }, () =>
    put(`/api/requests/${J_PENDING_OK}/accept`, T_TECH_A, { technicianUid: TECH_A, technicianName: 'Tech A' }));
  record('#7', 'capacity is env-driven (TECHNICIAN_MAX_ACTIVE_JOBS=2)', relaxed.status === 200, `status ${relaxed.status}`);

  // ---------------- #5 fake address / harassment / spam booking ----------------
  const booking = (description, location) => post('/api/requests', T_CUSTOMER_SAFETY, {
    customerName: 'Safety Tester', customerUid: CUSTOMER_SAFETY, applianceType: 'Refrigerator', description, location,
    termsAccepted: true,
  });

  const gibberish = await booking('[Brand] not cooling', 'aaaaaaaa');
  record('#5', 'a gibberish address is rejected (400)', gibberish.status === 400, `status ${gibberish.status}`);

  const spam = await withEnv({ SPAM_MAX_MATCHES: '1' }, async () => {
    const first = await booking('[Brand] ref not cooling', 'Mabini St, Bogo City');
    const second = await booking('[Brand] ref not cooling please', 'Mabini St, Bogo City');
    return [first.status, second.status];
  });
  record('#5', 'a repeated spam booking is rejected (429)', spam[0] === 201 && spam[1] === 429, spam.join('/'));

  // ---------------- #8 three scam reports auto-suspend ----------------
  const scam1 = await post(`/api/requests/${J_SCAM[0]}/report-scam`, T_TECH_SCAM, { reason: 'Fake request.' });
  const scam2 = await post(`/api/requests/${J_SCAM[1]}/report-scam`, T_TECH_SCAM, { reason: 'Fake request.' });
  const scam3 = await post(`/api/requests/${J_SCAM[2]}/report-scam`, T_TECH_SCAM, { reason: 'Fake request.' });
  record('#8', 'first two scam reports warn, do not suspend', scam1.body?.suspended === false && scam2.body?.suspended === false, `count=${scam3.body?.scamCount}`);
  record('#8', 'third scam report suspends the customer', scam3.body?.suspended === true, `count=${scam3.body?.scamCount}`);

  const stranger = await post(`/api/requests/${J_SCAM[0]}/report-scam`, T_STRANGER, { reason: 'n/a' });
  record('#8', 'a stranger cannot report (403)', stranger.status === 403, `status ${stranger.status}`);

  // ---------------- #11 two-way ratings + negative auto-suspend ----------------
  const rateOk = await post(`/api/requests/${J_RATE_OK}/rate-customer`, T_TECH_RATE, { technicianUid: TECH_RATE, rating: 5 });
  record('#11', 'technician rates the customer (201)', rateOk.status === 201, `status ${rateOk.status}`);
  const dup = await post(`/api/requests/${J_RATE_OK}/rate-customer`, T_TECH_RATE, { technicianUid: TECH_RATE, rating: 4 });
  record('#11', 'the same job cannot be rated twice (409)', dup.status === 409, `status ${dup.status}`);
  const rateBad = await post(`/api/requests/${J_RATE_BAD}/rate-customer`, T_TECH_RATE, { technicianUid: TECH_RATE, rating: 1 });
  record('#11', 'third negative rating auto-suspends the customer', rateBad.body?.customerSuspended === true, `suspended=${rateBad.body?.customerSuspended}`);

  const techJobs = await get(`/api/requests/technician/${TECH_RATE}`, T_TECH_RATE);
  const withProfile = (Array.isArray(techJobs.body) ? techJobs.body : []).find((job) => job.customerProfile);
  record('#11', 'technician job list exposes the customer profile', Boolean(withProfile), withProfile ? 'customerProfile present' : 'missing');
  record('#11', 'customer verified badge is surfaced', withProfile?.customerProfile?.verified === true, `verified=${withProfile?.customerProfile?.verified}`);
  record('#11', 'customer portfolio is surfaced', (withProfile?.customerProfile?.portfolio || []).length === 2, `portfolio=${(withProfile?.customerProfile?.portfolio || []).length}`);

  // ---------------- #9/#10 credential + facial screening ----------------
  await withEnv({ CREDENTIAL_AI_VISION_ENABLED: 'false' }, async () => {
    const clean = await screenCredential({
      role: 'technician', name: 'Juan Cruz', governmentIdNumber: '1234-5678',
      governmentIdFile: { buffer: pngBytes(1200, 900, { pad: 30000 }), mimetype: 'image/png' },
      selfieFile: { buffer: pngBytes(800, 800, { pad: 30000 }), mimetype: 'image/png' },
    });
    record('#9', 'screening runs offline (local forensics only)', clean !== null && clean.vision === null, `score=${clean?.riskScore}`);

    const ai = await screenCredential({
      role: 'technician', name: 'Fake Person', governmentIdNumber: '9999',
      governmentIdFile: { buffer: pngBytes(1200, 900, { pad: 30000, extra: 'midjourney c2pa' }), mimetype: 'image/png' },
    });
    record('#9', 'an AI-generated ID is flagged high', ['flagged', 'high'].includes(ai.riskLevel) && ai.flags.includes('ai_tool_marker'), `score=${ai.riskScore} level=${ai.riskLevel}`);
  });

  const face = domain.judgeFace({ screening: { vision: { facePresent: true, idFacePresent: true, livenessRisk: 0.95, matchConfidence: 0.9 } }, selfieProvided: true });
  record('#10', 'a photo-of-screen selfie raises a liveness flag', face.flags.includes(domain.FLAGS.SELFIE_LIVENESS_RISK), face.flags.join(','));
  const face2 = domain.judgeFace({ screening: { vision: { facePresent: true, idFacePresent: true, livenessRisk: 0.05, matchConfidence: 0.1 } }, selfieProvided: true });
  record('#10', 'a different face is flagged as a mismatch', face2.flags.includes(domain.FLAGS.FACE_MISMATCH), face2.flags.join(','));

  // ---------------- #6 (part 2) fake device photo ----------------
  await withEnv({ PHOTO_AI_VISION_ENABLED: 'false' }, async () => {
    const fake = await screenRepairPhoto({ buffer: pngBytes(1200, 900, { pad: 30000, extra: 'midjourney c2pa' }), mimetype: 'image/png' });
    record('#6-photo', 'a fake/AI device photo is flagged', ['flagged', 'high'].includes(fake.riskLevel), `score=${fake.riskScore} flags=[${fake.flags.join(',')}]`);
  });

  // ---------------- tokenization audit ----------------
  // Every AI key variable, cleared. A key-list assertion then sees only the
  // variable under test and not whatever backend/.env already contains.
  const NO_AI_KEYS = {
    AI_API_KEY: undefined, AI_API_KEYS: undefined,
    AI_VISION_API_KEY: undefined, AI_VISION_API_KEYS: undefined,
    GEMINI_API_KEY: undefined, GEMINI_API_KEYS: undefined, GEMINI_API_KEY_BACKUP: undefined,
    OMNIROUTE_API_KEY: undefined, OMNIROUTE_API_KEYS: undefined,
  };
  const tokenChecks = [
    ['MAX_REQUESTS_PER_DAY', { MAX_REQUESTS_PER_DAY: '7' }, () => require('../src/domain/dailyRequestLimit').maxDailyRequests() === 7],
    ['TECHNICIAN_MAX_ACTIVE_JOBS', { TECHNICIAN_MAX_ACTIVE_JOBS: '4' }, () => require('../src/services/workloadService').getMaxActiveJobs() === 4],
    ['CUSTOMER_SCAM_LIMIT', { CUSTOMER_SCAM_LIMIT: '5' }, () => require('../src/domain/scamPolicy').customerScamLimit() === 5],
    ['RATING_MAX', { RATING_MAX: '9' }, () => require('../src/domain/ratingRules').maxRating() === 9],
    ['CUSTOMER_NEGATIVE_RATING_LIMIT', { CUSTOMER_NEGATIVE_RATING_LIMIT: '6' }, () => require('../src/domain/ratingRules').negativeRatingLimit() === 6],
    ['CREDENTIAL_FLAG_THRESHOLD', { CREDENTIAL_FLAG_THRESHOLD: '42' }, () => domain.config().flagThreshold === 42],
    ['CREDENTIAL_AI_MARKERS', { CREDENTIAL_AI_MARKERS: 'custom-tool' }, () => require('../src/services/credential/documentForensics').aiToolMarkers().includes('custom-tool')],
    ['PHOTO_FLAG_THRESHOLD', { PHOTO_FLAG_THRESHOLD: '33' }, () => photoDomain.photoFlagThreshold() === 33],
    ['SCAM_REPORTABLE_STATUSES', { SCAM_REPORTABLE_STATUSES: 'completed, cancelled' }, () => require('../src/domain/jobWorkflow').isScamReportable('Cancelled') === true],
    ['CUSTOMER_REQUIRED_DOCS', { CUSTOMER_REQUIRED_DOCS: 'governmentIdFile' }, () => require('../src/domain/verificationRequirements').verificationRequirements('customer', { governmentIdFile: [{}] }) === null],
    ['ACTIVE_JOB_STATUSES', { ACTIVE_JOB_STATUSES: 'Accepted' }, () => require('../src/services/workloadService').activeStatuses().length === 1],
    ['ADDRESS_MIN_LENGTH', { ADDRESS_MIN_LENGTH: '25' }, () => require('../src/domain/requestSafety').addressMinLength() === 25],
    ['SPAM_MAX_MATCHES', { SPAM_MAX_MATCHES: '9' }, () => require('../src/domain/requestSafety').spamMaxMatches() === 9],
    ['ADDRESS_GPS_TOLERANCE_KM', { ADDRESS_GPS_TOLERANCE_KM: '12.5' }, () => require('../src/domain/requestSafety').addressGpsToleranceKm() === 12.5],
    ['SUBMIT_COOLDOWN_SECONDS', { SUBMIT_COOLDOWN_SECONDS: '15' }, () => require('../src/domain/submitDedupe').submitCooldownMs() === 15000],
    ['REQUEST_SAFETY_ENABLED', { REQUEST_SAFETY_ENABLED: 'false' }, () => require('../src/domain/requestSafety').isRequestSafetyEnabled() === false],
    ['ADDRESS_MIN_TOKENS', { ADDRESS_MIN_TOKENS: '4' }, () => require('../src/domain/requestSafety').addressMinTokens() === 4],
    ['ADDRESS_MAX_REPEAT_RUN', { ADDRESS_MAX_REPEAT_RUN: '2' }, () => require('../src/domain/requestSafety').addressMaxRepeatRun() === 2],
    ['ADDRESS_ENFORCEMENT', { ADDRESS_ENFORCEMENT: 'block' }, () => require('../src/domain/requestSafety').addressEnforcement() === 'block'],
    ['SPAM_WINDOW_HOURS', { SPAM_WINDOW_HOURS: '6' }, () => require('../src/domain/requestSafety').spamWindowHours() === 6],
    ['SPAM_SIMILARITY_THRESHOLD', { SPAM_SIMILARITY_THRESHOLD: '0.5' }, () => require('../src/domain/requestSafety').spamSimilarityThreshold() === 0.5],
    ['MAX_BOOKINGS_PER_ADDRESS_PER_DAY', { MAX_BOOKINGS_PER_ADDRESS_PER_DAY: '7' }, () => require('../src/domain/requestSafety').addressDailyCap() === 7],
    ['REQUEST_SAFETY_UTC_OFFSET_HOURS', { REQUEST_SAFETY_UTC_OFFSET_HOURS: '3' }, () => require('../src/domain/requestSafety').safetyUtcOffsetHours() === 3],
    ['SUBMIT_TERMS_REQUIRED', { SUBMIT_TERMS_REQUIRED: 'false' }, () => require('../src/domain/submitTerms').isTermsRequired() === false],
    ['SUBMIT_TERMS_VERSION', { SUBMIT_TERMS_VERSION: '2027-05-05' }, () => require('../src/domain/submitTerms').termsVersion() === '2027-05-05'],
    ['SUBMIT_TERMS_REJECTION', { SUBMIT_TERMS_REJECTION: 'Read the rules.' }, () => require('../src/domain/submitTerms').verifyTerms({}).reason === 'Read the rules.'],
    ['CUSTOMER_NOSHOW_WAIT_MINUTES', { CUSTOMER_NOSHOW_WAIT_MINUTES: '45' }, () => require('../src/domain/autoSuspendPolicy').customerNoShowWaitMinutes() === 45],
    ['CUSTOMER_NOSHOW_WAIT_MINUTES floor', { CUSTOMER_NOSHOW_WAIT_MINUTES: '10' }, () => require('../src/domain/autoSuspendPolicy').customerNoShowWaitMinutes() === 30],
    ['CUSTOMER_NOSHOW_WAIT_MINUTES ceiling', { CUSTOMER_NOSHOW_WAIT_MINUTES: '600' }, () => require('../src/domain/autoSuspendPolicy').customerNoShowWaitMinutes() === 60],
    ['CUSTOMER_NOSHOW_LIMIT', { CUSTOMER_NOSHOW_LIMIT: '4' }, () => require('../src/domain/autoSuspendPolicy').customerNoShowLimit() === 4],
    ['CUSTOMER_NOSHOW_AUTO_SUSPEND', { CUSTOMER_NOSHOW_AUTO_SUSPEND: 'false' }, () => require('../src/domain/autoSuspendPolicy').shouldSuspendForNoShow(9) === false],
    ['CUSTOMER_LATE_CANCEL_LIMIT', { CUSTOMER_LATE_CANCEL_LIMIT: '3' }, () => require('../src/domain/autoSuspendPolicy').shouldSuspendForLateCancel(2) === false],
    ['CUSTOMER_LATE_CANCEL_AUTO_SUSPEND', { CUSTOMER_LATE_CANCEL_AUTO_SUSPEND: 'false' }, () => require('../src/domain/autoSuspendPolicy').shouldSuspendForLateCancel(9) === false],
    ['AI_PROVIDER', { AI_PROVIDER: 'gemini' }, () => require('../src/domain/aiProvider').textProviderName() === 'gemini'],
    ['AI_BASE_URL', { AI_BASE_URL: 'https://example.test/v1/' }, () => require('../src/domain/aiProvider').aiBaseUrl() === 'https://example.test/v1'],
    ['AI_MODEL', { AI_MODEL: 'custom-model' }, () => require('../src/domain/aiProvider').aiModel() === 'custom-model'],
    ['AI_VISION_PROVIDER', { AI_VISION_PROVIDER: 'gemini' }, () => require('../src/domain/aiProvider').visionProviderName() === 'gemini'],
    ['AI_VISION_BASE_URL', { AI_VISION_BASE_URL: 'https://vision.test/v1/' }, () => require('../src/domain/aiProvider').aiVisionBaseUrl() === 'https://vision.test/v1'],
    ['AI_VISION_MODEL', { AI_MODEL: 'text-model', AI_VISION_MODEL: 'vision-model' }, () => require('../src/domain/aiProvider').aiVisionModel() === 'vision-model'],
    ['AI_VISION_FALLBACK_MODELS', { AI_VISION_FALLBACK_MODELS: 'a, b ,c' }, () => require('../src/domain/aiProvider').aiVisionFallbackModels().join('|') === 'a|b|c'],
    ['AI_MAX_TOKENS', { AI_MAX_TOKENS: '1234' }, () => require('../src/domain/aiProvider').aiMaxTokens() === 1234],
    ['AI_VISION_MAX_TOKENS', { AI_VISION_MAX_TOKENS: '4321' }, () => require('../src/domain/aiProvider').aiVisionMaxTokens() === 4321],
    ['AI_TIMEOUT_MS', { AI_TIMEOUT_MS: '9000' }, () => require('../src/domain/aiProvider').aiTimeoutMs() === 9000],
    ['AI_VISION_TIMEOUT_MS', { AI_VISION_TIMEOUT_MS: '45000' }, () => require('../src/domain/aiProvider').aiVisionTimeoutMs() === 45000],
    ['AI_REASONING_EFFORT', { AI_REASONING_EFFORT: 'medium' }, () => require('../src/domain/aiProvider').aiReasoningEffort() === 'medium'],
    ['AI_REASONING_EFFORT validation', { AI_REASONING_EFFORT: 'nonsense' }, () => require('../src/domain/aiProvider').aiReasoningEffort() === ''],
    ['AI_API_KEYS list', { ...NO_AI_KEYS, AI_PROVIDER: 'gemini', AI_API_KEYS: 'a, b ,c' }, () => require('../src/domain/aiProvider').aiApiKeys().join('|') === 'a|b|c'],
    ['AI_VISION_API_KEYS list', { ...NO_AI_KEYS, AI_VISION_API_KEYS: 'v1, v2' }, () => require('../src/domain/aiProvider').aiVisionApiKeys().join('|') === 'v1|v2'],
    ['GEMINI_API_KEY', { ...NO_AI_KEYS, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }, () => require('../src/domain/aiProvider').aiApiKeys().join('|') === 'k'],
    ['GEMINI_API_KEY_BACKUP', { ...NO_AI_KEYS, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'first', GEMINI_API_KEY_BACKUP: 'second' }, () => require('../src/domain/aiProvider').aiApiKeys().join('|') === 'first|second'],
    ['OMNIROUTE_API_KEY alias', { ...NO_AI_KEYS, AI_PROVIDER: 'omniroute', OMNIROUTE_API_KEY: 'legacy' }, () => require('../src/domain/aiProvider').aiApiKeys().join('|') === 'legacy'],
    ['OMNIROUTE_MODEL alias', { AI_MODEL: undefined, AI_PROVIDER: undefined, OMNIROUTE_MODEL: 'legacy-model' }, () => require('../src/domain/aiProvider').aiModel() === 'legacy-model'],
  ];
  for (const [key, vars, assertion] of tokenChecks) {
    await withEnv(vars, async () => {
      let ok = false;
      let detail = '';
      try { ok = assertion() === true; } catch (error) { detail = error.message; }
      record('tokenized', `${key} is env-driven`, ok, detail);
    });
  }

  // ---------------- env inventory coverage ----------------
  // The strongest form of "nothing is hardcoded": every environment variable
  // the backend reads has to be listed in scripts/check-uat-env.js, so that one
  // file is the complete inventory of knobs. A new variable that skips the
  // inventory fails here.
  const fs = require('node:fs');
  const path = require('node:path');

  // These two build the key at runtime (`process.env[envKey]`), which no source
  // scan can resolve, so they are pinned by hand. A third file that starts
  // doing the same thing fails the check below until it is pinned too.
  const DYNAMIC_ENV_READERS = {
    'domain/verificationRequirements.js': ['TECHNICIAN_REQUIRED_DOCS', 'CUSTOMER_REQUIRED_DOCS'],
    'services/credential/documentForensics.js': ['CREDENTIAL_AI_MARKERS', 'CREDENTIAL_EDITOR_MARKERS'],
  };

  const SRC_DIR = path.join(__dirname, '..', 'src');
  const walkJs = (dir, found = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walkJs(path.join(dir, entry.name), found);
        continue;
      }
      if (entry.name.endsWith('.js')) found.push(path.join(dir, entry.name));
    }
    return found;
  };

  // Comments are blanked out (same length, so line numbers survive) because the
  // files explain these rules in prose — and that prose must not trip them.
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length));

  const staticReads = new Set();
  const dynamicReaders = new Set();
  for (const file of walkJs(SRC_DIR)) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) staticReads.add(match[1]);
    for (const match of source.matchAll(/process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g)) {
      staticReads.add(match[1]);
    }
    // A bracket read with a quoted literal is static-safe and already collected;
    // the pattern below only matches the computed-key form.
    if (/process\.env\[\s*(?!['"])/.test(source)) {
      dynamicReaders.add(path.relative(SRC_DIR, file).split(path.sep).join('/'));
    }
  }

  let auditSource = '';
  try {
    auditSource = fs.readFileSync(path.join(__dirname, 'check-uat-env.js'), 'utf8');
  } catch (error) {
    auditSource = '';
  }
  const inventoried = new Set([...auditSource.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]));

  // No inline literal fallbacks. `asInt(process.env.X, 60)` puts a magic value
  // back in the code; every default has to be named (DEFAULT_*, DEFAULTS.x). An
  // empty string is allowed because it literally means "unset", and the `, 10`
  // in `parseInt(process.env.X, 10)` is a radix, not a fallback.
  const LITERAL_FALLBACK =
    /process\.env\.([A-Z][A-Z0-9_]*)\s*(,|\?\?|\|\|)\s*('[^']*'|"[^"]*"|true|false|-?\d[\d.]*)/g;
  const literalFallbacks = [];
  for (const file of walkJs(SRC_DIR)) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of source.matchAll(LITERAL_FALLBACK)) {
      const [full, , connector, literal] = match;
      if (literal === "''" || literal === '""') continue;
      const before = source.slice(Math.max(0, match.index - 40), match.index);
      if (connector === ',' && /parseInt\(\s*$/.test(before)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      literalFallbacks.push(`${path.relative(SRC_DIR, file).split(path.sep).join('/')}:${line} ${full.trim()}`);
    }
  }
  record('tokenized', 'no inline literal fallbacks — every default is a named constant',
    literalFallbacks.length === 0,
    literalFallbacks.length ? literalFallbacks.join(' | ') : `${staticReads.size} reads use named defaults`);

  const missingFromInventory = [...staticReads].filter((key) => !inventoried.has(key)).sort();
  record('tokenized', 'every backend env read is listed in check-uat-env.js',
    missingFromInventory.length === 0,
    missingFromInventory.length ? `missing: ${missingFromInventory.join(', ')}` : `${staticReads.size} static reads covered`);

  const expectedDynamic = Object.keys(DYNAMIC_ENV_READERS).sort();
  const foundDynamic = [...dynamicReaders].sort();
  record('tokenized', 'computed-key env readers are all pinned in the audit',
    JSON.stringify(expectedDynamic) === JSON.stringify(foundDynamic),
    foundDynamic.length ? foundDynamic.join(', ') : 'none');

  const dynamicKeys = Object.values(DYNAMIC_ENV_READERS).flat();
  const missingDynamic = dynamicKeys.filter((key) => !inventoried.has(key)).sort();
  record('tokenized', 'computed-key env variables are listed in check-uat-env.js',
    missingDynamic.length === 0,
    missingDynamic.length ? `missing: ${missingDynamic.join(', ')}` : dynamicKeys.join(', '));

  // ---------------- report ----------------
  let lastFeature = null;
  for (const r of results) {
    if (r.feature !== lastFeature) { console.log(`\n${r.feature}`); lastFeature = r.feature; }
    console.log(`  ${r.ok ? '✔' : '✘'} ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exitCode = 1;
};

let server;
(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run();
  } catch (error) {
    console.error('E2E failed:', error);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  }
})();
