/**
 * FixLink — live AI provider diagnostic.
 *
 * Answers "is the AI half of #6/#9/#10 actually working right now?" in one
 * command, without touching the database. It makes two real calls:
 *
 *   1. a text completion that must come back as JSON, and
 *   2. a vision completion with a generated PNG that must also come back as
 *      JSON.
 *
 * Nothing is written and no job or account is touched. Exit code is 1 when a
 * required call fails, so this can gate a deploy.
 *
 * Usage:
 *   node scripts/probe-ai-provider.js
 *   node scripts/probe-ai-provider.js --payload    # add per-attempt timings
 */

require('dotenv').config();

const ai = require('../src/domain/aiProvider');
const {
  chatComplete,
  visionComplete,
  isAiConfigured,
  isVisionConfigured,
  isTransientStatus,
} = require('../src/services/aiClient');

const verbose = process.argv.includes('--payload');

// A real 1x1 PNG: enough for the vision endpoint to accept the request and
// answer, without shipping a fixture image in the repo.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const mask = (value) => (value ? `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)` : '(unset)');

// Keys are tried in order, so the position matters as much as the value.
const maskKeys = (keys) => (Array.isArray(keys) && keys.length
  ? keys.map((key, index) => `${index + 1}:${mask(key)}`).join(', ')
  : '(unset)');

const results = [];
const record = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? '✔' : '✘'} ${label}${detail ? `  (${detail})` : ''}`);
};

// A throttled or overloaded provider fixes itself; a wrong key or model does
// not. Saying which one it is saves a round of guessing.
const describe = (error) => {
  const detail = String(error.message || error).replace(/\s+/g, ' ').slice(0, 220);
  if (isTransientStatus(error.status)) return `transient upstream failure — retry shortly :: ${detail}`;
  return detail;
};

const timeIt = async (run) => {
  const started = Date.now();
  try {
    return { value: await run(), ms: Date.now() - started };
  } catch (error) {
    error.elapsedMs = Date.now() - started;
    throw error;
  }
};

const run = async () => {
  console.log('\n=== FixLink AI provider diagnostic ===\n');

  console.log('Resolved configuration');
  console.log('  -- text axis (assistant / ranking) --');
  console.log(`  AI_PROVIDER                 ${ai.textProviderName()}`);
  console.log(`  text base url               ${ai.aiBaseUrl()}`);
  console.log(`  text api keys               ${maskKeys(ai.aiApiKeys())}`);
  console.log(`  text model                  ${ai.aiModel()}`);
  console.log('  -- vision axis (#6/#9/#10 screening) --');
  console.log(`  AI_VISION_PROVIDER          ${ai.visionProviderName()}`);
  console.log(`  vision base url             ${ai.aiVisionBaseUrl()}`);
  console.log(`  vision api keys             ${maskKeys(ai.aiVisionApiKeys())}`);
  console.log(`  vision chain                ${[ai.aiVisionModel(), ...ai.aiVisionFallbackModels()].join(' -> ')}`);
  console.log('  -- budgets --');
  console.log(`  timeout (text/vision)       ${ai.aiTimeoutMs()} / ${ai.aiVisionTimeoutMs()} ms`);
  console.log(`  max tokens (text/vision)    ${ai.aiMaxTokens()} / ${ai.aiVisionMaxTokens()}`);
  console.log(`  reasoning effort            ${ai.aiReasoningEffort() || '(omitted)'}`);
  console.log('');

  if (!isAiConfigured() && !isVisionConfigured()) {
    console.log('✘ No provider configured — set AI_* (or GEMINI_API_KEY) in backend/.env.');
    console.log('  Everything AI-powered degrades gracefully until then; no UAT feature is blocked.\n');
    process.exitCode = 1;
    return;
  }

  // --- text completion, JSON mode -----------------------------------------
  // The two axes are independent, so each is probed and reported on its own:
  // a deployment can have a working chatbot and an unconfigured screener.
  console.log('Text completion (JSON)');
  if (!isAiConfigured()) {
    record('text provider configured', false, 'set AI_* (or GEMINI_API_KEY) — assistant/ranking is off');
  } else {
    try {
      const { value, ms } = await timeIt(() => chatComplete({
        system: 'You are a connectivity probe. Reply with JSON only.',
        user: 'Reply exactly {"ok": true, "pong": "fixlink"}',
        temperature: 0,
      }));
      const parsed = value?.parsed;
      record('returned parseable JSON', parsed !== undefined, verbose ? JSON.stringify(parsed).slice(0, 120) : `${ms} ms`);
      record('carried the expected field', parsed?.pong === 'fixlink' || parsed?.ok === true, `pong=${parsed?.pong}`);
    } catch (error) {
      record('text completion succeeded', false, describe(error));
    }
  }

  // --- vision completion, JSON mode ---------------------------------------
  console.log('\nVision completion (JSON)');
  if (!isVisionConfigured()) {
    record('vision provider configured', false, 'set AI_VISION_* (or AI_*) — #6/#9/#10 screening is off');
  } else {
    try {
      const { value, ms } = await timeIt(() => visionComplete({
        system: 'You are an image analyst. Reply with JSON only.',
        user: 'Describe this image in JSON: {"description": string, "hasText": boolean}',
        images: [{ base64: TINY_PNG_BASE64, mimeType: 'image/png' }],
        temperature: 0,
      }));
      record('returned parseable JSON', value?.parsed !== undefined, `${ms} ms via ${value?.model}`);
      record('reported which model answered', Boolean(value?.model), value?.model);
    } catch (error) {
      record('vision completion succeeded', false, describe(error));
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exitCode = 1;
};

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error('Probe failed:', error);
    process.exit(1);
  });
