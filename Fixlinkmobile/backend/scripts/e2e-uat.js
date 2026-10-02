/**
 * FixLink — consolidated E2E for UAT #6-#11.
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

const T_CUSTOMER_DAILY = 'daily-token';
const T_CUSTOMER_LIMIT = 'limit-token';
const T_TECH_SCAM = 'scam-tech-token';
const T_TECH_RATE = 'rate-tech-token';
const T_TECH_A = 'tech-a-token';
const T_STRANGER = 'stranger-token';
const T_CUSTOMER_SAFETY = 'safety-token';

const completed = (id, techUid, techName, custUid, custName) => ({
  id, status: 'Completed', technician_uid: techUid, technician_name: techName, customer_uid: custUid, customer_name: custName,
});

installSupabaseStub({
  users: [
    { id: CUSTOMER_DAILY, role: 'customer', email: 'daily@fixlink.test', status: 'active' },
    { id: CUSTOMER_LIMIT, role: 'customer', email: 'limit@fixlink.test', status: 'active' },
    { id: CUSTOMER_SCAM, role: 'customer', email: 'scam@fixlink.test', status: 'active', scam_count: 0 },
    { id: CUSTOMER_SAFETY, role: 'customer', email: 'safety@fixlink.test', status: 'active' },
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
    [T_CUSTOMER_SAFETY]: CUSTOMER_SAFETY,
  },
  tables: {
    jobs: [
      { id: J_ACTIVE, status: 'In Progress', technician_uid: TECH_A, technician_name: 'Tech A', customer_uid: CUSTOMER_DAILY, customer_name: 'Daily' },
      { id: J_PENDING_OVER, status: 'Pending', appliance_type: 'Fan', customer_name: 'Someone' },
      { id: J_PENDING_OK, status: 'Pending', appliance_type: 'Fan', customer_name: 'Someone' },
      ...J_SCAM.map((id) => completed(id, TECH_SCAM, 'Tech Scam', CUSTOMER_SCAM, 'Scam Cust')),
      completed(J_RATE_OK, TECH_RATE, 'Tech Rate', CUSTOMER_RATE, 'Rate Cust'),
      completed(J_RATE_BAD, TECH_RATE, 'Tech Rate', CUSTOMER_RATE, 'Rate Cust'),
    ],
    reviews: [
      { id: 'r1', customer_uid: CUSTOMER_RATE, reviewer_role: 'technician', rating: 1, request_id: 'x1' },
      { id: 'r2', customer_uid: CUSTOMER_RATE, reviewer_role: 'technician', rating: 2, request_id: 'x2' },
    ],
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

const submit = (token, description, uid) => post('/api/requests', token, {
  customerName: 'Test Customer', customerUid: uid, applianceType: 'Fan', description, location: 'Bogo City',
});

const run = async () => {
  console.log('\n=== FixLink consolidated E2E — UAT #6-#11 ===\n');

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
  ];
  for (const [key, vars, assertion] of tokenChecks) {
    await withEnv(vars, async () => {
      let ok = false;
      let detail = '';
      try { ok = assertion() === true; } catch (error) { detail = error.message; }
      record('tokenized', `${key} is env-driven`, ok, detail);
    });
  }

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
