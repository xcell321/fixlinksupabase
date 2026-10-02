// Red-Green: UAT #5 — fake addresses, grudge bookings and spam bookings.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const safety = require('../src/domain/requestSafety');

const withEnv = (vars, run) => {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = run();
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
};

// ---------------- pure: address sanity ----------------
test('a real address passes', () => {
  assert.equal(safety.inspectAddress('Blk 3 Lot 4 Mabini St, Bogo City').ok, true);
});

test('a too-short address is rejected', () => {
  const result = safety.inspectAddress('Bogo');
  assert.equal(result.ok, false);
  assert.ok(result.flags.includes(safety.FLAGS.ADDRESS_TOO_SHORT));
});

test('a gibberish single-token address is rejected', () => {
  const result = safety.inspectAddress('aaaaaaaa');
  assert.equal(result.ok, false);
  assert.ok(result.flags.includes(safety.FLAGS.ADDRESS_GIBBERISH));
});

test('an address with a long character run is rejected', () => {
  const result = safety.inspectAddress('Blk 3 aaaaaaaaaaaaa Mabini St');
  assert.equal(result.ok, false);
  assert.ok(result.flags.includes(safety.FLAGS.ADDRESS_REPEATED_CHARS));
});

test('address rules are env-driven', () => {
  withEnv({ ADDRESS_MIN_LENGTH: '50' }, () => {
    assert.equal(safety.addressMinLength(), 50);
    assert.equal(safety.inspectAddress('Mabini St, Bogo City').ok, false);
  });
});

test('the day boundary follows the configured UTC offset, not the server timezone', () => {
  withEnv({ REQUEST_SAFETY_UTC_OFFSET_HOURS: '8' }, () => {
    assert.equal(safety.safetyUtcOffsetHours(), 8);
    // 17:00Z is already the next calendar day in UTC+8.
    assert.equal(safety.dayKey('2026-01-01T17:00:00Z'), safety.dayKey('2026-01-02T01:00:00Z'));
    assert.notEqual(safety.dayKey('2026-01-01T17:00:00Z'), safety.dayKey('2026-01-01T10:00:00Z'));
  });
  withEnv({ REQUEST_SAFETY_UTC_OFFSET_HOURS: '0', DAILY_LIMIT_UTC_OFFSET_HOURS: '8' }, () => {
    assert.notEqual(safety.dayKey('2026-01-01T17:00:00Z'), safety.dayKey('2026-01-02T01:00:00Z'));
  });
});

test('the offset falls back to the daily-limit offset, then to the default', () => {
  withEnv({ REQUEST_SAFETY_UTC_OFFSET_HOURS: undefined, DAILY_LIMIT_UTC_OFFSET_HOURS: '2' }, () => {
    assert.equal(safety.safetyUtcOffsetHours(), 2);
  });
  withEnv({ REQUEST_SAFETY_UTC_OFFSET_HOURS: undefined, DAILY_LIMIT_UTC_OFFSET_HOURS: undefined }, () => {
    assert.equal(safety.safetyUtcOffsetHours(), 8);
  });
});

// ---------------- pure: similarity ----------------
test('similarity is 1 for identical text and 0 for unrelated text', () => {
  assert.equal(safety.similarity('ref not cooling', 'ref not cooling'), 1);
  assert.equal(safety.similarity('ref not cooling', 'washing machine leak'), 0);
});

test('near-identical descriptions score at or above the default threshold', () => {
  const score = safety.similarity('[Brand] ref not cooling', '[Brand] ref not cooling help');
  assert.ok(score >= safety.spamSimilarityThreshold(), `score ${score}`);
});

test('spam thresholds are env-driven', () => {
  withEnv({ SPAM_MAX_MATCHES: '1', SUBMIT_COOLDOWN_SECONDS: '5' }, () => {
    assert.equal(safety.spamMaxMatches(), 1);
    assert.equal(require('../src/domain/submitDedupe').submitCooldownMs(), 5000);
  });
});

// ---------------- integration over HTTP ----------------
const { installSupabaseStub } = require('./helpers/supabaseStub');

const UID_GIBBERISH = 'c0000000-0000-0000-0000-00000000000a';
const UID_SPAM = 'c0000000-0000-0000-0000-00000000000b';
const UID_FAR = 'c0000000-0000-0000-0000-00000000000c';

const stub = installSupabaseStub({
  users: [
    { id: UID_GIBBERISH, role: 'customer', email: 'gib@fixlink.test', status: 'active' },
    { id: UID_SPAM, role: 'customer', email: 'spam@fixlink.test', status: 'active' },
    // Stored live location in Manila; the booking below is in Cebu.
    { id: UID_FAR, role: 'customer', email: 'far@fixlink.test', status: 'active', latitude: 14.5995, longitude: 120.9842 },
  ],
  tokens: { 'gib-token': UID_GIBBERISH, 'spam-token': UID_SPAM, 'far-token': UID_FAR },
  tables: { jobs: [] },
});

const { app } = require('../src/index');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const submit = (token, uid, body) =>
  fetch(`${baseUrl}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    // UAT #4: every booking must accept the regulations before it is accepted.
    body: JSON.stringify({ customerName: 'Safety Tester', customerUid: uid, applianceType: 'Refrigerator', termsAccepted: true, ...body }),
  });

test('a gibberish address is rejected with 400', async () => {
  const response = await submit('gib-token', UID_GIBBERISH, { description: '[Brand] not cooling', location: 'aaaaaaaa' });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /address/i);
});

test('a spam booking is rejected with 429', async () => {
  await withEnv({ SPAM_MAX_MATCHES: '1' }, async () => {
    const first = await submit('spam-token', UID_SPAM, { description: '[Brand] ref not cooling', location: 'Mabini St, Bogo City' });
    assert.equal(first.status, 201, `first submit was ${first.status}`);
    const second = await submit('spam-token', UID_SPAM, { description: '[Brand] ref not cooling please', location: 'Mabini St, Bogo City' });
    assert.equal(second.status, 429);
    const payload = await second.json();
    assert.match(payload.error, /similar repair requests/i);
  });
});

test('a booking far from the customer location is flagged, not blocked', async () => {
  const response = await submit('far-token', UID_FAR, {
    description: '[Brand] freezer not freezing',
    location: 'Mabini St, Bogo City',
    latitude: 11.05,
    longitude: 124.0,
  });
  assert.equal(response.status, 201);
  const created = stub.tables.jobs.find((job) => job.customer_uid === UID_FAR);
  assert.ok(created, 'expected the job to be stored');
  assert.ok((created.safety_flags || []).includes(safety.FLAGS.CUSTOMER_NOT_NEAR_ADDRESS), JSON.stringify(created.safety_flags));
});

test('address enforcement can be switched to block', async () => {
  await withEnv({ ADDRESS_ENFORCEMENT: 'block' }, async () => {
    const response = await submit('far-token', UID_FAR, {
      description: '[Brand] second freezer issue',
      location: 'Mabini St, Bogo City',
      latitude: 11.05,
      longitude: 124.0,
    });
    assert.equal(response.status, 429);
  });
});
