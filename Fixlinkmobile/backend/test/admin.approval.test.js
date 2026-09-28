// Request-path test for technician approval.
//
// Approving a technician in the admin console must email the applicant that
// they are now a registered FixLink technician — exactly once per approval, and
// never at the cost of the status change itself. The public status endpoint the
// pending screen calls is covered here too.
//
// Both the database and the mailer are replaced (in-memory rows, captured
// sends), so a failure here means the wiring is wrong, not that SMTP or
// Supabase is down.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const ADMIN_UID = 'admin-1';
const TECH_UID = 'tech-pending-1';
const TECH_EMAIL = 'jonard.tech@fixlink.test';
// A second pending applicant, so the delivery-failure test still sees a real
// 'pending_verification' -> 'active' transition (rows are shared per file).
const TECH2_UID = 'tech-pending-2';
const TECH2_EMAIL = 'noel.tech@fixlink.test';

// Captured sends + a switch so a test can make delivery fail.
const sent = [];
let failDelivery = false;

const emailPath = require.resolve('../src/services/emailService');
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    sendPasswordResetEmail: async () => ({ messageId: 'stub' }),
    sendTechnicianApprovedEmail: async (to, name) => {
      if (failDelivery) throw new Error('SMTP timed out');
      sent.push({ to, name });
      return { messageId: 'stub' };
    },
  },
  children: [],
  paths: [],
};

const stub = installSupabaseStub({
  users: [
    { id: ADMIN_UID, role: 'admin', name: 'FixLink Admin', email: 'admin@fixlink.test', status: 'active' },
    { id: TECH_UID, role: 'technician', name: 'Jonard Masong', email: TECH_EMAIL, status: 'pending_verification' },
    { id: TECH2_UID, role: 'technician', name: 'Noel Reyes', email: TECH2_EMAIL, status: 'pending_verification' },
    { id: 'tech-active-1', role: 'technician', name: 'James Rojas', email: 'james@fixlink.test', status: 'active' },
    { id: 'cust-1', role: 'customer', name: 'Maria Santos', email: 'maria@fixlink.test', status: 'active' },
  ],
  tokens: { 'admin-token': ADMIN_UID, 'customer-token': 'cust-1' },
});

const { app } = require('../src/index');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  sent.length = 0;
  failDelivery = false;
});

const verify = async (uid, body, token = 'admin-token') => {
  const response = await fetch(`${baseUrl}/api/admin/verify-technician/${uid}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const status = async (email) => {
  const response = await fetch(`${baseUrl}/api/auth/technician-status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return { status: response.status, body: await response.json() };
};

test('approving a technician activates the account and emails them', async () => {
  const { status: code, body } = await verify(TECH_UID, { status: 'active' });
  assert.equal(code, 200);
  assert.equal(body.emailSent, true, 'the approval email must be reported as sent');
  assert.equal(sent.length, 1, 'exactly one approval email');
  assert.equal(sent[0].to, TECH_EMAIL);
  assert.equal(sent[0].name, 'Jonard Masong');

  const row = stub.tables.users.find((user) => user.id === TECH_UID);
  assert.equal(row.status, 'active');
  assert.equal(row.verification_status, 'verified');
});

test('re-saving an already active technician does not email them again', async () => {
  const { status: code, body } = await verify('tech-active-1', { status: 'active' });
  assert.equal(code, 200);
  assert.equal(body.emailSent, false);
  assert.equal(sent.length, 0, 'no duplicate approval email');
});

test('rejecting does not send an approval email', async () => {
  const { status: code, body } = await verify('cust-1', { status: 'rejected', rejectionReason: 'Incomplete documents' });
  assert.equal(code, 200);
  assert.equal(body.emailSent, false);
  assert.equal(sent.length, 0);
});

test('an undeliverable email still saves the approval and warns instead', async () => {
  failDelivery = true;
  const { status: code, body } = await verify(TECH2_UID, { status: 'active' });
  assert.equal(code, 200, 'the admin action must not fail because of email');
  assert.equal(body.emailSent, false);
  assert.match(String(body.emailWarning || ''), /approval email/i);
  assert.equal(sent.length, 0);

  const row = stub.tables.users.find((user) => user.id === TECH2_UID);
  assert.equal(row.status, 'active', 'the approval is saved even when the email fails');
});

test('only an admin can approve a technician', async () => {
  const { status: code } = await verify(TECH_UID, { status: 'active' }, 'customer-token');
  assert.equal(code, 403);
  assert.equal(sent.length, 0);
});

test('the pending screen can look up a technician application by email', async () => {
  const { status: code, body } = await status(TECH_EMAIL);
  assert.equal(code, 200);
  assert.equal(body.status, 'active', 'an approved applicant reads as active');
  assert.equal(body.name, 'Jonard Masong');
});

test('a non-technician or unknown email returns none, not an account probe', async () => {
  const customer = await status('maria@fixlink.test');
  assert.equal(customer.status, 200);
  assert.equal(customer.body.status, 'none');

  const unknown = await status('nobody@fixlink.test');
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.status, 'none');
});

test('an invalid email is rejected before hitting the database', async () => {
  const { status: code } = await status('not-an-email');
  assert.equal(code, 400);
});
