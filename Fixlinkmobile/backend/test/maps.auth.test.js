// Quota guard: every LocationIQ-spending maps endpoint requires sign-in.
// The tile proxy stays open by design (Leaflet <img> tags carry no auth
// headers and tiles are cached server-side), so only the metered routes
// are asserted here.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

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

const get = (path) => fetch(`${baseUrl}${path}`);

test('metered maps endpoints reject unauthenticated calls with 401', async () => {
  for (const path of [
    '/api/maps/search?q=Bogo',
    '/api/maps/autocomplete?q=Bogo',
    '/api/maps/reverse?lat=11.05&lon=124.00',
    '/api/maps/directions/driving/124.00,11.05;124.01,11.06',
  ]) {
    const response = await get(path);
    assert.equal(response.status, 401, `${path} must require sign-in`);
  }
});
