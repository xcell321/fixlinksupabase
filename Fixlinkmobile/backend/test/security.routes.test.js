// Security regression tests for the two verified findings:
//   1. /api/admin had no authentication or authorization guard.
//   2. PUT /api/users/:id/location let any caller (or any user) move another
//      technician's pin.
//
// The real Express app is booted on an ephemeral port, but Supabase access is
// replaced with the in-memory stub (see helpers/supabaseStub.js) so the tests
// hit the actual request paths and assert on status codes, not internals.
//
// Run with: npm test   (node --test)

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const ADMIN_UID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_UID = '22222222-2222-2222-2222-222222222222';
const TECHNICIAN_UID = '33333333-3333-3333-3333-333333333333';
const OTHER_TECHNICIAN_UID = '44444444-4444-4444-4444-444444444444';

installSupabaseStub({
  users: [
    { id: ADMIN_UID, role: 'admin', email: 'admin@fixlink.test' },
    { id: CUSTOMER_UID, role: 'customer', email: 'customer@fixlink.test' },
    { id: TECHNICIAN_UID, role: 'technician', email: 'tech@fixlink.test' },
    { id: OTHER_TECHNICIAN_UID, role: 'technician', email: 'tech2@fixlink.test' },
  ],
  tokens: {
    'admin-token': ADMIN_UID,
    'customer-token': CUSTOMER_UID,
    'technician-token': TECHNICIAN_UID,
  },
});

// Required AFTER the stub is installed so the auth guard uses the fake verifier.
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

const call = (method, path, { token, body } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// --- 1. Admin route protection -------------------------------------------------

test('admin routes reject unauthenticated requests', async () => {
  const listUsers = await call('GET', '/api/admin/users');
  assert.equal(listUsers.status, 401);

  const verify = await call('PUT', `/api/admin/verify-technician/${TECHNICIAN_UID}`, {
    body: { status: 'active' },
  });
  assert.equal(verify.status, 401);
});

test('admin routes reject an authenticated non-admin', async () => {
  const response = await call('GET', '/api/admin/users', { token: 'customer-token' });
  assert.equal(response.status, 403);
});

test('admin routes still work for an authenticated admin', async () => {
  const response = await call('GET', '/api/admin/users', { token: 'admin-token' });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload), 'admin user list should be an array');
});

test('admin routes reject a garbage bearer token', async () => {
  const response = await call('GET', '/api/admin/users', { token: 'not-a-real-jwt' });
  assert.equal(response.status, 401);
});

// --- 2. Technician location ownership -----------------------------------------

test('location update rejects unauthenticated requests', async () => {
  const response = await call('PUT', `/api/users/${TECHNICIAN_UID}/location`, {
    body: { latitude: 10.3, longitude: 123.9 },
  });
  assert.equal(response.status, 401);
});

test('location update allows the authenticated owner', async () => {
  const response = await call('PUT', `/api/users/${TECHNICIAN_UID}/location`, {
    token: 'technician-token',
    body: { latitude: 10.3, longitude: 123.9 },
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.latitude, 10.3);
  assert.equal(payload.longitude, 123.9);
});

test('location update rejects updating another user', async () => {
  const response = await call('PUT', `/api/users/${OTHER_TECHNICIAN_UID}/location`, {
    token: 'technician-token',
    body: { latitude: 1, longitude: 2 },
  });
  assert.equal(response.status, 403);
});

test('location update rejects a garbage bearer token', async () => {
  const response = await call('PUT', `/api/users/${TECHNICIAN_UID}/location`, {
    token: 'not-a-real-jwt',
    body: { latitude: 1, longitude: 2 },
  });
  assert.equal(response.status, 401);
});
