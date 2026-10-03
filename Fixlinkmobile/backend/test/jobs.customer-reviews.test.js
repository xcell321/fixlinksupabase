// Red-Green: UAT #11 — other technicians can read the reviews written about a
// customer (stars + comment, newest first, no reporter identity), so a legit
// customer is identifiable before accepting.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const TECH_A = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const TECH_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CUSTOMER_UID = '00000000-0000-0000-0000-000000000001';

installSupabaseStub({
  users: [
    { id: TECH_A, role: 'technician', email: 'a@fixlink.test', status: 'active' },
    { id: TECH_B, role: 'technician', email: 'b@fixlink.test', status: 'active' },
    { id: CUSTOMER_UID, role: 'customer', email: 'rated@fixlink.test', status: 'active' },
  ],
  tokens: { 'technician-token': TECH_B },
  tables: {
    reviews: [
      { id: 'r1', customer_uid: CUSTOMER_UID, reviewer_role: 'technician', rating: 5, comment: 'Buotan kaayo, gipa-snack ko.', created_at: '2026-09-02T10:00:00.000Z', request_id: 'j1' },
      { id: 'r2', customer_uid: CUSTOMER_UID, reviewer_role: 'technician', rating: 4, comment: '', created_at: '2026-09-03T10:00:00.000Z', request_id: 'j2' },
      // A customer -> technician review must never leak into the customer list.
      { id: 'r3', customer_uid: CUSTOMER_UID, reviewer_role: 'customer', rating: 1, comment: 'Not about the customer.', created_at: '2026-09-04T10:00:00.000Z', request_id: 'j3' },
    ],
  },
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

const get = (uid, token) =>
  fetch(`${baseUrl}/api/requests/customer/${uid}/reviews`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

test('another technician reads the reviews written about a customer', async () => {
  const response = await get(CUSTOMER_UID, 'technician-token');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.reviews));
  assert.equal(payload.reviews.length, 2);
  assert.deepEqual(
    payload.reviews.map((row) => row.rating).sort(),
    [4, 5]
  );
  const commented = payload.reviews.find((row) => row.rating === 5);
  assert.equal(commented.comment, 'Buotan kaayo, gipa-snack ko.');
  assert.ok(commented.createdAt);
  for (const row of payload.reviews) {
    assert.equal(Object.keys(row).sort().join(','), 'comment,createdAt,rating');
  }
});

test('customer reviews require authentication', async () => {
  const response = await get(CUSTOMER_UID);
  assert.equal(response.status, 401);
});
