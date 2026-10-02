// Red-Green: UAT #8 — either party reports the other as a scammer, and three
// reports auto-suspend the customer.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const TECH_UID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CUSTOMER_UID = '11111111-1111-1111-1111-111111111111';
const STRANGER_UID = '22222222-2222-2222-2222-222222222222';
const JOB_IDS = [
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
];
const PENDING_JOB = 'a0000000-0000-0000-0000-0000000000ff';

const stub = installSupabaseStub({
  users: [
    { id: TECH_UID, role: 'technician', email: 'tech@fixlink.test', status: 'active', scam_count: 0 },
    { id: CUSTOMER_UID, role: 'customer', email: 'cust@fixlink.test', status: 'active', scam_count: 0 },
    { id: STRANGER_UID, role: 'customer', email: 'stranger@fixlink.test', status: 'active' },
  ],
  tokens: { 'technician-token': TECH_UID, 'customer-token': CUSTOMER_UID, 'stranger-token': STRANGER_UID },
  tables: {
    jobs: [
      ...JOB_IDS.map((id) => ({
        id,
        status: 'Completed',
        technician_uid: TECH_UID,
        technician_name: 'Tech',
        customer_uid: CUSTOMER_UID,
        customer_name: 'Cust',
      })),
      { id: PENDING_JOB, status: 'Pending', customer_uid: CUSTOMER_UID, customer_name: 'Cust' },
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

const report = (jobId, token = 'technician-token', reason = 'No-show scam.') =>
  fetch(`${baseUrl}/api/requests/${jobId}/report-scam`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });

test('a request that has not started cannot be reported', async () => {
  const response = await report(PENDING_JOB, 'customer-token');
  assert.equal(response.status, 409);
});

test('a stranger cannot report a request they are not part of', async () => {
  const response = await report(JOB_IDS[0], 'stranger-token');
  assert.equal(response.status, 403);
});

test('three reports auto-suspend the customer', async () => {
  const first = await report(JOB_IDS[0]);
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.scamCount, 1);
  assert.equal(firstBody.suspended, false);

  const second = await report(JOB_IDS[1]);
  assert.equal(second.status, 201);

  const third = await report(JOB_IDS[2]);
  assert.equal(third.status, 201);
  const thirdBody = await third.json();
  assert.equal(thirdBody.scamCount, 3);
  assert.equal(thirdBody.suspended, true);

  const customer = stub.tables.users.find((user) => user.id === CUSTOMER_UID);
  assert.equal(customer.status, 'suspended');
});
