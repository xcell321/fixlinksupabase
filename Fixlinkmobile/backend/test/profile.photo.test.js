// Request-path test for the customer avatar upload.
//
// It proves the whole chain the customer relies on: multipart request -> multer
// -> storage upload -> users.profile_image -> serialized response. Supabase is
// replaced with the in-memory stub (uploadBuffer returns a fixed URL), so a
// failure here means the wiring is broken, not the network.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const UID = '77777777-7777-7777-7777-777777777777';
const TECH_UID = '88888888-8888-8888-8888-888888888888';
const STUB_URL = 'https://stub.local/upload';

const stub = installSupabaseStub({
  users: [
    { id: UID, role: 'customer', name: 'Old Name', email: 'customer@fixlink.test' },
    { id: TECH_UID, role: 'technician', name: 'Old Name', email: 'tech@fixlink.test' },
  ],
  tokens: { 'customer-token': UID, 'technician-token': TECH_UID },
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

const putProfile = async (fileType) => {
  const form = new FormData();
  form.append('name', 'Maria Santos');
  form.append('phone', '09171234567');
  form.append('address', 'Bogo City, Cebu');
  if (fileType) {
    form.append('profileImage', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: fileType }), 'avatar.png');
  }
  const response = await fetch(`${baseUrl}/api/profile/${UID}/profile`, {
    method: 'PUT',
    headers: { authorization: 'Bearer customer-token' },
    body: form,
  });
  return { status: response.status, body: await response.json() };
};

test('an uploaded avatar is stored and returned so it survives a re-login', async () => {
  const { status, body } = await putProfile('image/png');
  assert.equal(status, 200);
  assert.equal(body.profileImage, STUB_URL, 'response must carry the stored photo URL');
  assert.equal(body.name, 'Maria Santos');

  const row = stub.tables.users.find((user) => user.id === UID);
  assert.ok(row, 'the user row must exist');
  assert.equal(row.profile_image, STUB_URL, 'the photo URL must be persisted on the row');
});

test('a non-image upload is rejected instead of silently dropped', async () => {
  const { status } = await putProfile('text/plain');
  assert.equal(status, 400);
});

test('profile fields still save without a photo', async () => {
  const { status, body } = await putProfile(null);
  assert.equal(status, 200);
  assert.equal(body.name, 'Maria Santos');
  // The previously stored photo stays in place.
  assert.equal(body.profileImage, STUB_URL);
});

const putTechnician = async (fileType) => {
  const form = new FormData();
  form.append('name', 'Jonard Masong');
  form.append('phone', '09173334444');
  form.append('address', 'Bogo City, Cebu');
  form.append('bio', 'Refrigeration and aircon specialist');
  form.append('skills', 'Refrigerator, Air Conditioning');
  form.append('yearsExperience', '5');
  if (fileType) {
    form.append('profileImage', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: fileType }), 'avatar.png');
  }
  const response = await fetch(`${baseUrl}/api/profile/${TECH_UID}/technician`, {
    method: 'PUT',
    headers: { authorization: 'Bearer technician-token' },
    body: form,
  });
  return { status: response.status, body: await response.json() };
};

test('a technician can add a profile picture too', async () => {
  const { status, body } = await putTechnician('image/png');
  assert.equal(status, 200);
  assert.equal(body.profileImage, STUB_URL, 'the technician avatar must be returned');
  assert.deepEqual(body.skills, ['Refrigerator', 'Air Conditioning']);

  const row = stub.tables.users.find((user) => user.id === TECH_UID);
  assert.ok(row, 'the technician row must exist');
  assert.equal(row.profile_image, STUB_URL, 'the technician photo must be persisted');
});

test('a technician non-image upload is rejected, not dropped', async () => {
  const { status } = await putTechnician('text/plain');
  assert.equal(status, 400);
});

test('a technician profile still saves as plain JSON without a photo', async () => {
  const response = await fetch(`${baseUrl}/api/profile/${TECH_UID}/technician`, {
    method: 'PUT',
    headers: { authorization: 'Bearer technician-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Jonard Masong', phone: '09173334444', skills: ['Refrigerator'], yearsExperience: 5 }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.name, 'Jonard Masong');
  // The photo saved earlier is untouched by a text-only edit.
  assert.equal(body.profileImage, STUB_URL);
});
