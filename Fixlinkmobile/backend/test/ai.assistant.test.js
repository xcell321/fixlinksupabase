// Request-path test for POST /api/ai/assistant after the knowledge base + RAG
// wiring. It boots the real Express app (and the real route, retriever, and
// prompt builder) but swaps two boundaries for deterministic fakes:
//   - src/config/supabase  -> in-memory stub so requireAuth accepts a token
//   - src/services/aiClient -> captures the prompt instead of calling the LLM
//
// The point is to assert that the knowledge base actually reaches the model
// prompt and that the role filter and outside-world instruction are present.
//
// Run with: npm test   (node --test)

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseStub } = require('./helpers/supabaseStub');

const CUSTOMER_UID = '55555555-5555-5555-5555-555555555555';

// Capture every prompt the assistant builds.
const captured = [];
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
    chatComplete: async ({ system, user }) => {
      captured.push({ system, user });
      // The assistant route reads `content` (plain text); ranking/analyzer read
      // `parsed`. The stub returns both, like the real client does.
      return { content: 'stubbed reply', parsed: { reply: 'stubbed reply' }, raw: {} };
    },
    // Present so a module that destructures it at load time still sees a
    // function; this test never reaches the vision path.
    visionComplete: async () => { throw new Error('visionComplete is not stubbed in this test.'); },
  },
};

installSupabaseStub({
  users: [{ id: CUSTOMER_UID, role: 'customer', email: 'customer@fixlink.test' }],
  tokens: { 'customer-token': CUSTOMER_UID },
});

// Required after the stubs are installed.
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

const ask = async (message, context) => {
  const response = await fetch(`${baseUrl}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer customer-token' },
    body: JSON.stringify({ message, context }),
  });
  return { status: response.status, body: await response.json() };
};

const lastPrompt = () => captured[captured.length - 1];

test('assistant still requires authentication', async () => {
  const response = await fetch(`${baseUrl}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  });
  assert.equal(response.status, 401);
});

test('a system question reaches the model with the matching knowledge section', async () => {
  const result = await ask('unsaon pag submit ug repair request?', { customerName: 'Test' });
  assert.equal(result.status, 200);
  assert.equal(result.body.reply, 'stubbed reply');
  assert.ok(captured.length > 0, 'the LLM boundary should have been called');

  const { system } = lastPrompt();
  assert.match(system, /FixLink knowledge base:/, 'prompt must include the knowledge block');
  assert.match(system, /four steps/i, 'customer booking knowledge should be retrieved');
  assert.match(system, /general-knowledge questions that are NOT about FixLink/i, 'outside-world allowance must be present');
});

test('a general question is still grounded with baseline FixLink knowledge', async () => {
  await ask('what is the capital of France?', {});
  const { system } = lastPrompt();
  assert.match(system, /What FixLink is/i, 'baseline grounding must always be present');
  assert.match(system, /general-knowledge questions that are NOT about FixLink/i);
});

test('the technician role injects technician knowledge, not customer-only knowledge', async () => {
  await ask('unsaon pag accept ug available jobs?', { role: 'technician' });
  const { system } = lastPrompt();
  assert.match(system, /technician job feed lists/i, 'technician feed knowledge should be retrieved');
  assert.doesNotMatch(system, /four steps/i, 'customer-only booking knowledge must be excluded');
});

test('the AI assistant exposes its reply contract', async () => {
  const result = await ask('hello', {});
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.reply, 'string');
});
