// Red-Green: UAT #11 — the technician rates the customer through the shared
// reviews table, and enough negative ratings auto-suspend the customer.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const TECH_UID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CUSTOMER_UID = '00000000-0000-0000-0000-000000000001';
const JOB_OK = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_BAD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const stub = installSupabaseStub({
  users: [
    { id: TECH_UID, role: 'technician', email: 'rater@fixlink.test', status: 'active' },
    { id: CUSTOMER_UID, role: 'customer', email: 'rated@fixlink.test', status: 'active' },
  ],
  tokens: { 'technician-token': TECH_UID },
  tables: {
    jobs: [
      { id: JOB_OK, status: 'Completed', technician_uid: TECH_UID, technician_name: 'Rater', customer_uid: CUSTOMER_UID, customer_name: 'Rated' },
      { id: JOB_BAD, status: 'Completed', technician_uid: TECH_UID, technician_name: 'Rater', customer_uid: CUSTOMER_UID, customer_name: 'Rated' },
      { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', status: 'In Progress', technician_uid: TECH_UID, technician_name: 'Rater', customer_uid: CUSTOMER_UID, customer_name: 'Rated' },
    ],
    reviews: [
      // Two prior negative ratings (<= 2) already on file for this customer.
      { id: 'r1', customer_uid: CUSTOMER_UID, reviewer_role: 'technician', rating: 1, request_id: 'x1' },
      { id: 'r2', customer_uid: CUSTOMER_UID, reviewer_role: 'technician', rating: 2, request_id: 'x2' },
      // A customer -> technician review must not be counted as a customer negative.
      { id: 'rev-c', customer_uid: CUSTOMER_UID, reviewer_role: 'customer', rating: 1, request_id: 'y1' },
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

const rate = (jobId, rating, comment) =>
  fetch(`${baseUrl}/api/requests/${jobId}/rate-customer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer technician-token' },
    body: JSON.stringify({ technicianUid: TECH_UID, rating, comment }),
  });

test('technician rates customer after a completed job', async () => {
  const response = await rate(JOB_OK, 5, 'Buotan kaayo, naghatag og tip.');
  assert.equal(response.status, 201);
  const stored = stub.tables.reviews.find((row) => row.request_id === JOB_OK && row.reviewer_role === 'technician');
  assert.ok(stored, 'expected a technician review row to be stored');
  assert.equal(stored.rating, 5);
});

test('same job cannot be rated twice by the same technician', async () => {
  const second = await rate(JOB_OK, 4);
  assert.equal(second.status, 409);
});

test('an unfinished job cannot be rated', async () => {
  const response = await rate('dddddddd-dddd-dddd-dddd-dddddddddddd', 2);
  assert.equal(response.status, 404);
});

test('third negative rating auto-suspends the customer', async () => {
  const response = await rate(JOB_BAD, 1, 'Scammer, walay bayad.');
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.customerSuspended, true);
  const customer = stub.tables.users.find((user) => user.id === CUSTOMER_UID);
  assert.equal(customer.status, 'suspended');
});
