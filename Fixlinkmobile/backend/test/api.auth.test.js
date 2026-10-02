// Refactor safety net: boots the real Express app on an ephemeral port and
// checks the HTTP surface end to end (no database is touched because every
// assertion stops at the auth guard or the open health endpoint).
//
// Run with: npm test   (node --test)

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/index');
const { routeKeys } = require('./helpers/routeInventory');

let server;
let baseUrl;

const SAMPLE_UUID = '00000000-0000-0000-0000-000000000000';

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const call = (method, path, { headers = {}, body } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('GET /api/health is open and returns ok', async () => {
  const response = await call('GET', '/api/health');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'ok');
  assert.ok(typeof payload.time === 'string');
});

// Turn a router path like `/accepted/:id/messages` into a concrete URL.
const concretize = (path) =>
  path
    .replace(':id', SAMPLE_UUID)
    .replace(':customerName', 'test-customer')
    .replace(':technicianUid', SAMPLE_UUID);

test('every /api/requests endpoint rejects unauthenticated calls with 401', async () => {
  const routes = routeKeys(require('../src/routes/requests'));
  assert.equal(routes.length, 29);

  const failures = [];
  for (const key of routes) {
    const [method, path] = key.split(' ');
    const response = await call(method, `/api/requests${concretize(path)}`);
    if (response.status !== 401) {
      failures.push(`${key} -> ${response.status}`);
    }
  }

  assert.deepEqual(failures, [], 'routes that did not return 401 without a token');
});

test('other protected routers also reject unauthenticated calls', async () => {
  const protectedCalls = [
    ['GET', `/api/users/${SAMPLE_UUID}/schedule`],
    ['POST', `/api/users/${SAMPLE_UUID}/portfolio`],
    ['PUT', `/api/profile/${SAMPLE_UUID}/profile`],
    ['PUT', `/api/profile/${SAMPLE_UUID}/technician`],
    ['POST', '/api/ai/assistant'],
    ['POST', '/api/ai/detect-category'],
    ['GET', '/api/ai/recommend'],
  ];

  const failures = [];
  for (const [method, path] of protectedCalls) {
    const response = await call(method, path);
    if (response.status !== 401) failures.push(`${method} ${path} -> ${response.status}`);
  }

  assert.deepEqual(failures, [], 'protected routes that did not return 401');
});

test('garbage bearer tokens are rejected, not accepted', async () => {
  const response = await call('GET', '/api/requests/', {
    headers: { authorization: 'Bearer not-a-real-jwt' },
  });
  assert.equal(response.status, 401);
});

test('unknown API paths still 404 (routers are mounted, not catch-alls)', async () => {
  const response = await call('GET', '/api/definitely-not-a-route');
  assert.equal(response.status, 404);
});
