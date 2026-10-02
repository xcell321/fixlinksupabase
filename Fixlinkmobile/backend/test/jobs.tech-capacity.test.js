// Red-Green: UAT #7 — one active job per technician at a time.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const TECH_UID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

installSupabaseStub({
  users: [{ id: TECH_UID, role: 'technician', email: 'cap@fixlink.test', status: 'active', skills: ['Refrigerator'] }],
  tokens: { 'technician-token': TECH_UID },
  tables: {
    jobs: [
      { id: '11111111-1111-1111-1111-111111111111', status: 'Accepted', technician_uid: TECH_UID },
      { id: '22222222-2222-2222-2222-222222222222', status: 'Pending', appliance_type: 'Refrigerator' },
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

test('second accept while one job is active is denied', async () => {
  const response = await fetch(`${baseUrl}/api/requests/22222222-2222-2222-2222-222222222222/accept`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer technician-token' },
    body: JSON.stringify({ technicianUid: TECH_UID, technicianName: 'Cap Tech' }),
  });
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.match(payload.message || payload.error || '', /finish it before accepting/i);
});
