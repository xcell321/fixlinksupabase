// Red-Green: login face gate — a live selfie is compared against the stored
// face photo when REQUIRE_LOGIN_FACE=true. Mismatch blocks with a friendly
// message, missing face is rejected, vision outage fails safe to password.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const TECH_UID = '11111111-1111-1111-1111-111111111111';
const FACE_URL = 'data:image/jpeg;base64,' + Buffer.alloc(64, 7).toString('base64');

installSupabaseStub({
  users: [
    { id: TECH_UID, role: 'technician', email: 'face@fixlink.test', status: 'active', profile_image: FACE_URL },
  ],
  tokens: { 'technician-token': TECH_UID },
  tables: {},
});

const configPath = require.resolve('../src/config/supabase');
const stub = require(configPath);
stub.supabaseAuth.auth.signInWithPassword = async ({ email }) => {
  if (email === 'face@fixlink.test') {
    return {
      data: { user: { id: TECH_UID }, session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 } },
      error: null,
    };
  }
  return { data: null, error: { message: 'Invalid login credentials' } };
};

// Controllable vision verdict for the face comparison.
let verdict = { matchConfidence: 0.9, livenessRisk: 0.1 };
let visionBroken = false;
const aiClientPath = require.resolve('../src/services/aiClient');
require.cache[aiClientPath] = {
  id: aiClientPath,
  filename: aiClientPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {
    isAiConfigured: () => true,
    isVisionConfigured: () => true,
    chatComplete: async () => { throw new Error('not stubbed here'); },
    visionComplete: async () => {
      if (visionBroken) throw new Error('gateway down');
      return {
        parsed: {
          facePresent: true,
          selfieFacePresent: true,
          idFacePresent: true,
          livenessRisk: verdict.livenessRisk,
          matchConfidence: verdict.matchConfidence,
        },
        model: 'stub',
      };
    },
  },
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

const withEnv = (vars, run) => {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const result = run();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      });
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return result;
  } catch (error) {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    throw error;
  }
};

const faceBytes = Buffer.alloc(128, 9);
const faceBlob = () => new Blob([faceBytes], { type: 'image/jpeg' });

const loginJson = () =>
  fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'face@fixlink.test', password: 'password123', expectedRole: 'technician' }),
  });

const loginFace = () => {
  const form = new FormData();
  form.set('email', 'face@fixlink.test');
  form.set('password', 'password123');
  form.set('expectedRole', 'technician');
  form.set('face', faceBlob(), 'selfie.jpg');
  return fetch(`${baseUrl}/api/auth/login`, { method: 'POST', body: form });
};

test('flag off: plain JSON login still works', async () => {
  await withEnv({ REQUIRE_LOGIN_FACE: 'false' }, async () => {
    const response = await loginJson();
    assert.equal(response.status, 200);
  });
});

test('flag on: login without a face photo is rejected', async () => {
  await withEnv({ REQUIRE_LOGIN_FACE: 'true' }, async () => {
    const response = await loginJson();
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /face photo/i);
  });
});

test('flag on: matching face signs in with verification flag', async () => {
  verdict = { matchConfidence: 0.9, livenessRisk: 0.1 };
  visionBroken = false;
  await withEnv({ REQUIRE_LOGIN_FACE: 'true' }, async () => {
    const response = await loginFace();
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.faceVerified, true);
  });
});

test('flag on: mismatched face is blocked with a friendly message', async () => {
  verdict = { matchConfidence: 0.1, livenessRisk: 0.1 };
  visionBroken = false;
  await withEnv({ REQUIRE_LOGIN_FACE: 'true' }, async () => {
    const response = await loginFace();
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.match(payload.error, /face verification failed/i);
    assert.doesNotMatch(payload.error, /status code/i);
  });
});

test('flag on: vision outage fails safe to password login', async () => {
  visionBroken = true;
  await withEnv({ REQUIRE_LOGIN_FACE: 'true' }, async () => {
    const response = await loginFace();
    assert.equal(response.status, 200);
  });
  visionBroken = false;
});
