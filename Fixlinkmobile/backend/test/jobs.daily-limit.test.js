// Red-Green: UAT #6 — max N job requests per user per day, env-driven.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { maxDailyRequests, countToday, overDailyLimit, freeStatuses } = require('../src/domain/dailyRequestLimit');

const withEnv = (vars, run) => {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('default limit is 3 requests per day', () => {
  withEnv({ MAX_REQUESTS_PER_DAY: undefined }, () => {
    assert.equal(maxDailyRequests(), 3);
  });
});

test('the limit is read from MAX_REQUESTS_PER_DAY, not hardcoded', () => {
  withEnv({ MAX_REQUESTS_PER_DAY: '5' }, () => {
    assert.equal(maxDailyRequests(), 5);
  });
});

test('counts only jobs created today in the configured offset', () => {
  withEnv({ DAILY_LIMIT_UTC_OFFSET_HOURS: '8' }, () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    const jobs = [{ created_at: today }, { created_at: today }, { created_at: yesterday }];
    assert.equal(countToday(jobs, new Date()), 2);
  });
});

test('cancelled requests free up a slot by default', () => {
  withEnv({ DAILY_LIMIT_FREE_STATUSES: undefined }, () => {
    assert.deepEqual(freeStatuses(), ['cancelled', 'canceled']);
    const today = new Date().toISOString();
    const jobs = [{ created_at: today, status: 'Cancelled' }, { created_at: today, status: 'Pending' }];
    assert.equal(countToday(jobs, new Date()), 1);
  });
});

test('limit is inclusive: third allowed, fourth denied', () => {
  const today = new Date().toISOString();
  const two = [{ created_at: today }, { created_at: today }];
  const three = [...two, { created_at: today }];
  assert.equal(overDailyLimit(two, new Date()), false);
  assert.equal(overDailyLimit(three, new Date()), true);
});

test('fourth submit same day is rejected with 429', async () => {
  const { installSupabaseStub } = require('./helpers/supabaseStub');
  const uid = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const today = new Date().toISOString();
  installSupabaseStub({
    users: [{ id: uid, role: 'customer', email: 'daily@fixlink.test' }],
    tokens: { 'daily-token': uid },
    tables: {
      jobs: [
        { id: 'j1', customer_uid: uid, created_at: today },
        { id: 'j2', customer_uid: uid, created_at: today },
        { id: 'j3', customer_uid: uid, created_at: today },
      ],
    },
  });
  const { app } = require('../src/index');
  let server;
  let baseUrl;
  {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }
  try {
    const response = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer daily-token' },
      body: JSON.stringify({
        customerName: 'Daily Tester',
        customerUid: uid,
        applianceType: 'Fan',
        description: '[Brand] Fourth today',
        location: 'Bogo City',
        termsAccepted: true,
      }),
    });
    assert.equal(response.status, 429);
    const payload = await response.json();
    assert.match(payload.error, /daily limit/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
