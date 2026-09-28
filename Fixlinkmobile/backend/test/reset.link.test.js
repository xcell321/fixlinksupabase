// Request-path tests for the password-reset landing page.
//
// They lock the rule the user asked for: once a reset link has been used (or it
// has expired, or the token is not on record), GET /reset-password must NOT show
// the password form any more. Only a token that is still unused and unexpired
// renders the form.
//
// Supabase is replaced with the in-memory stub so no network is touched.

require('dotenv').config();

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');
const { signResetToken, hashResetToken } = require('../src/utils/resetToken');

const UID = '66666666-6666-6666-6666-666666666666';
const EMAIL = 'reset@fixlink.test';

const now = Date.now();
const futureIso = new Date(now + 60 * 60 * 1000).toISOString(); // +1 hour
const pastIso = new Date(now - 60 * 60 * 1000).toISOString(); // -1 hour

const freshToken = signResetToken({ uid: UID, email: EMAIL });
const usedToken = signResetToken({ uid: UID, email: EMAIL });
const expiredToken = signResetToken({ uid: UID, email: EMAIL });
const unknownToken = signResetToken({ uid: UID, email: EMAIL });

installSupabaseStub({
  users: [{ id: UID, role: 'customer', email: EMAIL }],
  tables: {
    password_resets: [
      { id: 'pr-fresh', user_id: UID, token_hash: hashResetToken(freshToken), expires_at: futureIso, used_at: null },
      { id: 'pr-used', user_id: UID, token_hash: hashResetToken(usedToken), expires_at: futureIso, used_at: new Date(now).toISOString() },
      { id: 'pr-expired', user_id: UID, token_hash: hashResetToken(expiredToken), expires_at: pastIso, used_at: null },
      // unknownToken has no row on purpose.
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

const fetchPage = async (token) => {
  const query = token ? `?uid=${UID}&email=${encodeURIComponent(EMAIL)}&token=${encodeURIComponent(token)}` : '';
  const response = await fetch(`${baseUrl}/reset-password${query}`);
  const html = await response.text();
  return { status: response.status, html, showsForm: html.includes('id="newPassword"') };
};

test('an unused, unexpired link shows the reset form', async () => {
  const { status, html, showsForm } = await fetchPage(freshToken);
  assert.equal(status, 200);
  assert.equal(showsForm, true, 'valid link should render the form');
  assert.doesNotMatch(html, /already been used or has expired/i);
});

test('a used link no longer shows the reset form', async () => {
  const { status, html, showsForm } = await fetchPage(usedToken);
  assert.equal(status, 200);
  assert.equal(showsForm, false, 'used link must not render the form');
  assert.match(html, /already been used or has expired/i);
  assert.match(html, /Link unavailable/);
});

test('an expired link no longer shows the reset form', async () => {
  const { html, showsForm } = await fetchPage(expiredToken);
  assert.equal(showsForm, false, 'expired link must not render the form');
  assert.match(html, /already been used or has expired/i);
});

test('a token with no record does not show the reset form', async () => {
  const { showsForm } = await fetchPage(unknownToken);
  assert.equal(showsForm, false, 'unknown token must not render the form');
});

test('opening the page without credentials does not show the reset form', async () => {
  const { showsForm } = await fetchPage(null);
  assert.equal(showsForm, false);
});
