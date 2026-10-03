// Red-Green: UAT #2 — automatic suspension of a customer who wastes a
// technician's trip, either by cancelling after the technician already arrived
// or by not being there when the technician shows up.
//
// Both rules are env-driven, so every timing-sensitive case pins the variables
// it depends on instead of trusting whatever the developer's .env holds.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../src/domain/autoSuspendPolicy');
const { installSupabaseStub } = require('./helpers/supabaseStub');

const withEnv = async (vars, run) => {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// The wait window
// ---------------------------------------------------------------------------

test('the no-show wait window defaults to one hour', async () => {
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: undefined }, () => {
    assert.equal(policy.customerNoShowWaitMinutes(), 60);
    assert.equal(policy.customerNoShowWaitMs(), 60 * 60 * 1000);
  });
});

test('the wait window is env-driven and clamped to the 30-60 minute rule', async () => {
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '45' }, () => {
    assert.equal(policy.customerNoShowWaitMinutes(), 45);
  });
  // The requirement's floor is 30 minutes, so a shorter value must not slip through.
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '5' }, () => {
    assert.equal(policy.customerNoShowWaitMinutes(), 30);
  });
  // ...and its ceiling is one hour.
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '180' }, () => {
    assert.equal(policy.customerNoShowWaitMinutes(), 60);
  });
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: 'nonsense' }, () => {
    assert.equal(policy.customerNoShowWaitMinutes(), 60);
  });
});

test('a report is not ready until the technician has waited the window', async () => {
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '60' }, () => {
    const early = policy.waitProgress({ technician_arrival_timestamp: minutesAgo(20) });
    assert.equal(early.ready, false);
    assert.equal(early.waitedMinutes, 20);
    assert.ok(early.remainingMs > 0);

    const onTime = policy.waitProgress({ technician_arrival_timestamp: minutesAgo(60) });
    assert.equal(onTime.ready, true);
    assert.equal(onTime.remainingMs, 0);
  });
});

test('the wait is measured from the arrival stamp when there is one', () => {
  const job = {
    technician_arrival_timestamp: minutesAgo(10),
    customer_ready_timestamp: minutesAgo(90),
    created_at: minutesAgo(120),
  };
  assert.equal(policy.noShowAnchor(job), job.technician_arrival_timestamp);
  assert.equal(policy.waitProgress(job).ready, false);
});

test('the wait falls back to the ready stamp, then the creation stamp', () => {
  const ready = { customer_ready_timestamp: minutesAgo(5), created_at: minutesAgo(500) };
  assert.equal(policy.noShowAnchor(ready), ready.customer_ready_timestamp);

  const created = { created_at: minutesAgo(500) };
  assert.equal(policy.noShowAnchor(created), created.created_at);

  assert.equal(policy.noShowAnchor({}), null);
  // Nothing to measure from must never block a legitimate report.
  assert.equal(policy.waitProgress({}).ready, true);
});

test('the wait message counts down in whole minutes', () => {
  assert.match(policy.waitMessage(40 * 60 * 1000), /wait 40 minutes more/);
  assert.match(policy.waitMessage(60 * 1000), /wait 1 minute more/);
});

// ---------------------------------------------------------------------------
// The suspend thresholds
// ---------------------------------------------------------------------------

test('one reported no-show suspends the customer by default', async () => {
  await withEnv({ CUSTOMER_NOSHOW_LIMIT: undefined, CUSTOMER_NOSHOW_AUTO_SUSPEND: undefined }, () => {
    assert.equal(policy.customerNoShowLimit(), 1);
    assert.equal(policy.shouldSuspendForNoShow(1), true);
  });
});

test('the no-show threshold and its switch are env-driven', async () => {
  await withEnv({ CUSTOMER_NOSHOW_LIMIT: '3' }, () => {
    assert.equal(policy.shouldSuspendForNoShow(1), false);
    assert.equal(policy.shouldSuspendForNoShow(3), true);
  });
  await withEnv({ CUSTOMER_NOSHOW_AUTO_SUSPEND: 'false' }, () => {
    assert.equal(policy.shouldSuspendForNoShow(99), false);
  });
});

test('the cancel-after-arrival rule is env-driven and on by default', async () => {
  await withEnv({ CUSTOMER_LATE_CANCEL_LIMIT: undefined, CUSTOMER_LATE_CANCEL_AUTO_SUSPEND: undefined }, () => {
    assert.equal(policy.customerLateCancelLimit(), 1);
    assert.equal(policy.shouldSuspendForLateCancel(1), true);
  });
  await withEnv({ CUSTOMER_LATE_CANCEL_LIMIT: '2' }, () => {
    assert.equal(policy.shouldSuspendForLateCancel(1), false);
    assert.equal(policy.shouldSuspendForLateCancel(2), true);
  });
  await withEnv({ CUSTOMER_LATE_CANCEL_AUTO_SUSPEND: 'false' }, () => {
    assert.equal(policy.shouldSuspendForLateCancel(9), false);
  });
});

// ---------------------------------------------------------------------------
// The HTTP surface
// ---------------------------------------------------------------------------

const TECH_UID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CUSTOMER_UID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_CANCEL = '33333333-3333-3333-3333-333333333333';
const CUSTOMER_CANCEL_EARLY = '44444444-4444-4444-4444-444444444444';
const CUSTOMER_RULE_OFF = '55555555-5555-5555-5555-555555555555';

const WAITING_JOB = 'a0000000-0000-0000-0000-0000000000a1';
const NO_ARRIVAL_JOB = 'a0000000-0000-0000-0000-0000000000a2';
const PENDING_JOB = 'a0000000-0000-0000-0000-0000000000a3';
const ARRIVED_CANCEL_JOB = 'a0000000-0000-0000-0000-0000000000b1';
const EARLY_CANCEL_JOB = 'a0000000-0000-0000-0000-0000000000b2';
const RULE_OFF_JOB = 'a0000000-0000-0000-0000-0000000000b3';

// The stub must replace the Supabase config BEFORE ../src/index is required,
// because the middleware destructures its exports at load time.
const stub = installSupabaseStub({
  users: [
    { id: TECH_UID, role: 'technician', email: 'tech@fixlink.test', status: 'active' },
    { id: CUSTOMER_UID, role: 'customer', email: 'cust@fixlink.test', status: 'active', no_show_count: 0 },
    { id: CUSTOMER_CANCEL, role: 'customer', email: 'cancel@fixlink.test', status: 'active' },
    { id: CUSTOMER_CANCEL_EARLY, role: 'customer', email: 'early@fixlink.test', status: 'active' },
    { id: CUSTOMER_RULE_OFF, role: 'customer', email: 'off@fixlink.test', status: 'active' },
  ],
  tokens: {
    'technician-token': TECH_UID,
    'customer-token': CUSTOMER_UID,
    'cancel-token': CUSTOMER_CANCEL,
    'early-cancel-token': CUSTOMER_CANCEL_EARLY,
    'rule-off-token': CUSTOMER_RULE_OFF,
  },
  tables: {
    jobs: [
      // In progress and on site for 45 minutes: inside the 60-minute default
      // window, past the 30-minute floor.
      {
        id: WAITING_JOB, status: 'In Progress', appliance_type: 'Fan',
        technician_uid: TECH_UID, technician_name: 'Tech',
        customer_uid: CUSTOMER_UID, customer_name: 'Cust',
        technician_arrival_timestamp: minutesAgo(45),
      },
      // No arrival stamp at all: the report is refused outright.
      {
        id: NO_ARRIVAL_JOB, status: 'Customer Ready', appliance_type: 'Fan',
        technician_uid: TECH_UID, technician_name: 'Tech',
        customer_uid: CUSTOMER_UID, customer_name: 'Cust',
        customer_ready_timestamp: minutesAgo(200),
      },
      {
        id: PENDING_JOB, status: 'Pending', appliance_type: 'Fan',
        technician_uid: TECH_UID, technician_name: 'Tech',
        customer_uid: CUSTOMER_UID, customer_name: 'Cust',
      },
      // Customer Ready + arrival stamp: cancelling here is a late cancellation.
      {
        id: ARRIVED_CANCEL_JOB, status: 'Customer Ready', appliance_type: 'Fan',
        technician_uid: TECH_UID, technician_name: 'Tech',
        customer_uid: CUSTOMER_CANCEL, customer_name: 'Cancel Cust',
        technician_arrival_timestamp: minutesAgo(15),
      },
      // Customer Ready, technician still travelling: an ordinary cancellation.
      {
        id: EARLY_CANCEL_JOB, status: 'Customer Ready', appliance_type: 'Fan',
        technician_uid: TECH_UID, technician_name: 'Tech',
        customer_uid: CUSTOMER_CANCEL_EARLY, customer_name: 'Early Cust',
      },
      {
        id: RULE_OFF_JOB, status: 'Customer Ready', appliance_type: 'Fan',
        technician_uid: TECH_UID, technician_name: 'Tech',
        customer_uid: CUSTOMER_RULE_OFF, customer_name: 'Off Cust',
        technician_arrival_timestamp: minutesAgo(15),
      },
    ],
    service_incidents: [],
  },
});

const { app } = require('../src/index');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const reportNoShow = (jobId, token = 'technician-token') =>
  fetch(`${baseUrl}/api/requests/${jobId}/report-no-show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ technicianUid: TECH_UID, reason: 'No one at the location' }),
  });

const cancel = (jobId, token) =>
  fetch(`${baseUrl}/api/requests/${jobId}/cancel`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ cancellationReason: 'Changed my mind' }),
  });

test('a no-show cannot be reported before the technician has arrived', async () => {
  const response = await reportNoShow(NO_ARRIVAL_JOB);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'ARRIVAL_REQUIRED');
});

test('a no-show cannot be reported before the wait window has passed', async () => {
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '60' }, async () => {
    const response = await reportNoShow(WAITING_JOB);
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, 'CUSTOMER_NO_SHOW_WAIT');
    assert.equal(body.waitedMinutes, 45);
    assert.equal(body.remainingMinutes, 15);
  });
});

test('a no-show is refused while the request has not started', async () => {
  const response = await reportNoShow(PENDING_JOB);
  assert.equal(response.status, 409);
});

test('a reported no-show after the wait window suspends the customer', async () => {
  await withEnv(
    { CUSTOMER_NOSHOW_WAIT_MINUTES: '30', CUSTOMER_NOSHOW_LIMIT: '1', CUSTOMER_NOSHOW_AUTO_SUSPEND: 'true' },
    async () => {
      const response = await reportNoShow(WAITING_JOB);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.customerSuspended, true);
      assert.equal(body.noShowCount, 1);
      assert.equal(body.level, 'suspended');
      assert.equal(body.waitedMinutes, 45);
    },
  );

  const customer = stub.tables.users.find((user) => user.id === CUSTOMER_UID);
  assert.equal(customer.status, 'suspended');
  assert.equal(customer.no_show_count, 1);

  const job = stub.tables.jobs.find((row) => row.id === WAITING_JOB);
  assert.equal(job.status, 'No-Show');
});

test('the same report only warns while the limit is not reached', async () => {
  await withEnv({ CUSTOMER_NOSHOW_WAIT_MINUTES: '30', CUSTOMER_NOSHOW_LIMIT: '3' }, async () => {
    // The job is already No-Show, so move it back to a reportable status.
    const job = stub.tables.jobs.find((row) => row.id === WAITING_JOB);
    job.status = 'In Progress';
    const response = await reportNoShow(WAITING_JOB);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.noShowCount, 2);
    assert.equal(body.customerSuspended, false);
    assert.equal(body.level, 'flagged');
  });
});

test('cancelling after the technician arrived suspends the customer', async () => {
  const response = await cancel(ARRIVED_CANCEL_JOB, 'cancel-token');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.lateCancellation, true);
  assert.equal(body.customerSuspended, true);
  assert.equal(body.cancellationStage, 'after_travel');

  const customer = stub.tables.users.find((user) => user.id === CUSTOMER_CANCEL);
  assert.equal(customer.status, 'suspended');
});

test('cancelling before the technician arrives is not punishable', async () => {
  const response = await cancel(EARLY_CANCEL_JOB, 'early-cancel-token');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.lateCancellation, false);
  assert.equal(body.customerSuspended, false);
  assert.equal(body.cancellationStage, 'after_ready');

  const customer = stub.tables.users.find((user) => user.id === CUSTOMER_CANCEL_EARLY);
  assert.equal(customer.status, 'active');
});

test('the late-cancellation rule can be switched off', async () => {
  const response = await withEnv({ CUSTOMER_LATE_CANCEL_AUTO_SUSPEND: 'false' }, () =>
    cancel(RULE_OFF_JOB, 'rule-off-token'));
  // The cancellation still succeeds; only the suspension is suppressed.
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.lateCancellation, true);
  assert.equal(body.customerSuspended, false);

  const customer = stub.tables.users.find((user) => user.id === CUSTOMER_RULE_OFF);
  assert.equal(customer.status, 'active');
});

test('a stranger cannot cancel someone else\'s request', async () => {
  const response = await cancel(PENDING_JOB, 'technician-token');
  assert.equal(response.status, 403);
});
