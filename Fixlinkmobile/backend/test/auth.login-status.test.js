// Red-Green: banned/suspended/deactivated accounts must see their status at
// login instead of the generic "Incorrect email or password." message.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const banned = { id: 'banned-uid', email: 'banned@fixlink.test', role: 'customer', status: 'banned' };
const suspended = { id: 'susp-uid', email: 'susp@fixlink.test', role: 'technician', status: 'suspended' };
const inactive = { id: 'inact-uid', email: 'inact@fixlink.test', role: 'customer', status: 'inactive' };
const active = { id: 'active-uid', email: 'ok@fixlink.test', role: 'customer', status: 'active' };

installSupabaseStub({ users: [banned, suspended, inactive, active] });

const configPath = require.resolve('../src/config/supabase');
const stub = require(configPath);
stub.supabaseAuth.auth.signInWithPassword = async ({ email }) => {
  if (email === 'ok@fixlink.test') {
    return {
      data: { user: { id: 'active-uid' }, session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 } },
      error: null,
    };
  }
  return { data: null, error: { message: 'Invalid login credentials' } };
};

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

const login = (email, expectedRole = 'customer') =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password', expectedRole }),
  });

test('banned account sees banned message, not generic credentials error', async () => {
  const response = await login('banned@fixlink.test');
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.match(payload.error, /banned/i);
});

test('suspended technician sees suspended message', async () => {
  const response = await login('susp@fixlink.test', 'technician');
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.match(payload.error, /suspended/i);
});

test('deactivated account sees deactivated message', async () => {
  const response = await login('inact@fixlink.test');
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.match(payload.error, /deactivat/i);
});

test('unknown email keeps generic credentials message', async () => {
  const response = await login('nobody@fixlink.test');
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.match(payload.error, /incorrect email or password/i);
});
