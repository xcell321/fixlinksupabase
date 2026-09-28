// Request-path test for the peer identity shown in the chat inbox.
//
// A conversation must carry the other party's avatar, not just their initial,
// so a customer and a technician can recognise each other when they contact one
// another. Supabase is replaced with the in-memory stub, so a failure here means
// the inbox stopped reading profile_image, not that the network is down.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const CUSTOMER_UID = 'customer-1';
const TECHNICIAN_UID = 'technician-1';
const CUSTOMER_PHOTO = 'https://stub.local/profiles/maria.jpg';

const stub = installSupabaseStub({
  users: [
    { id: CUSTOMER_UID, role: 'customer', name: 'Maria Santos', phone: '09171112222', profile_image: CUSTOMER_PHOTO },
    { id: TECHNICIAN_UID, role: 'technician', name: 'Jonard Masong', phone: '09173334444', profile_image: null },
  ],
  tokens: { 'customer-token': CUSTOMER_UID, 'technician-token': TECHNICIAN_UID },
  tables: {
    jobs: [
      {
        id: 'job-1',
        customer_uid: CUSTOMER_UID,
        technician_uid: TECHNICIAN_UID,
        customer_name: 'Maria Santos',
        technician_name: 'Jonard Masong',
        appliance_type: 'Refrigerator',
        status: 'In Progress',
      },
    ],
    messages: [
      {
        id: 'message-1',
        job_id: 'job-1',
        sender_uid: TECHNICIAN_UID,
        sender_name: 'Jonard Masong',
        text: 'On my way.',
        timestamp: '2026-09-28T02:00:00.000Z',
      },
    ],
    message_reads: [],
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

const fetchInbox = async (token, uid, role) => {
  const response = await fetch(
    `${baseUrl}/api/requests/messages/inbox?uid=${encodeURIComponent(uid)}&role=${role}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  return { status: response.status, body: await response.json() };
};

test('a technician sees the customer avatar in the inbox', async () => {
  const { status, body } = await fetchInbox('technician-token', TECHNICIAN_UID, 'technician');
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].peerName, 'Maria Santos');
  assert.equal(body[0].peerImage, CUSTOMER_PHOTO, 'the peer avatar must reach the inbox');
  assert.equal(body[0].peerPhone, '09171112222');
});

test('a peer without a photo falls back to their initial', async () => {
  const { status, body } = await fetchInbox('customer-token', CUSTOMER_UID, 'customer');
  assert.equal(status, 200);
  assert.equal(body[0].peerName, 'Jonard Masong');
  assert.equal(body[0].peerImage, null, 'no stored photo must stay null, never undefined');
  assert.equal(body[0].peerInitial, 'J');
});

test('an inbox is only readable with a bearer token', async () => {
  const response = await fetch(
    `${baseUrl}/api/requests/messages/inbox?uid=${TECHNICIAN_UID}&role=technician`
  );
  assert.equal(response.status, 401);
});
