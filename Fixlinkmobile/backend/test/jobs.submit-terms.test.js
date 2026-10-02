// Red-Green: UAT #4 — the booking regulations must be accepted before the
// location step, and the server refuses a submission that never agreed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const terms = require('../src/domain/submitTerms');

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

// ---------------- pure: the gate ----------------
test('an empty body is rejected while the gate is on', () => {
  const verdict = terms.verifyTerms({});
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /accept the booking regulations/i);
});

test('a multipart "true" string counts as accepted', () => {
  // The app posts FormData, so every value arrives as a string.
  assert.equal(terms.verifyTerms({ termsAccepted: 'true' }).ok, true);
});

test('a boolean true and the snake_case spelling both count as accepted', () => {
  assert.equal(terms.verifyTerms({ termsAccepted: true }).ok, true);
  assert.equal(terms.verifyTerms({ terms_accepted: 'yes' }).ok, true);
});

test('an explicit false is still a refusal', () => {
  assert.equal(terms.verifyTerms({ termsAccepted: 'false' }).ok, false);
  assert.equal(terms.verifyTerms({ termsAccepted: false }).ok, false);
});

test('the gate is required by default and the switch is env-driven', () => {
  assert.equal(terms.isTermsRequired(), true);
  withEnv({ SUBMIT_TERMS_REQUIRED: 'false' }, () => {
    assert.equal(terms.isTermsRequired(), false);
    assert.equal(terms.verifyTerms({}).ok, true);
  });
});

test('the version stamp and the rejection wording are env-driven', () => {
  withEnv({ SUBMIT_TERMS_VERSION: '2027-01-15' }, () => {
    assert.equal(terms.termsVersion(), '2027-01-15');
  });
  withEnv({ SUBMIT_TERMS_REJECTION: 'Read the rules first.' }, () => {
    assert.equal(terms.verifyTerms({}).reason, 'Read the rules first.');
  });
});

// ---------------- integration over HTTP ----------------
const { installSupabaseStub } = require('./helpers/supabaseStub');

const UID_NO_TERMS = 'e0000000-0000-0000-0000-00000000000a';
const UID_WITH_TERMS = 'e0000000-0000-0000-0000-00000000000b';

const stub = installSupabaseStub({
  users: [
    { id: UID_NO_TERMS, role: 'customer', email: 'noterms@fixlink.test', status: 'active' },
    { id: UID_WITH_TERMS, role: 'customer', email: 'terms@fixlink.test', status: 'active' },
  ],
  tokens: { 'noterms-token': UID_NO_TERMS, 'terms-token': UID_WITH_TERMS },
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
    body: JSON.stringify({
      customerName: 'Terms Tester',
      customerUid: uid,
      applianceType: 'Refrigerator',
      description: '[Brand] not cooling',
      location: 'Mabini St, Bogo City',
      ...body,
    }),
  });

test('submitting without accepting the regulations is rejected with 400', async () => {
  const response = await submit('noterms-token', UID_NO_TERMS, {});
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /regulations/i);
  assert.equal(stub.tables.jobs.length, 0, 'no booking may be created');
});

test('accepting the regulations submits and stamps the audit trail', async () => {
  const response = await submit('terms-token', UID_WITH_TERMS, {
    termsAccepted: 'true',
    termsVersion: '2026-10-01',
  });
  assert.equal(response.status, 201, `submit was ${response.status}`);
  const created = stub.tables.jobs.find((job) => job.customer_uid === UID_WITH_TERMS);
  assert.ok(created, 'expected the job to be stored');
  assert.ok(created.terms_accepted_at, 'expected terms_accepted_at to be stamped');
  assert.equal(created.terms_version, terms.termsVersion());
});
