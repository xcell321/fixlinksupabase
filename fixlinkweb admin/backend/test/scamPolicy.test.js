const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scamStrikeThreshold, shouldAutoSuspend } = require('../src/domain/scamPolicy');

test('default threshold is 3 upheld reports', () => {
  const saved = process.env.SCAM_STRIKE_THRESHOLD;
  delete process.env.SCAM_STRIKE_THRESHOLD;
  try {
    assert.equal(scamStrikeThreshold(), 3);
  } finally {
    if (saved !== undefined) process.env.SCAM_STRIKE_THRESHOLD = saved;
  }
});

test('threshold is env-driven', () => {
  const saved = process.env.SCAM_STRIKE_THRESHOLD;
  process.env.SCAM_STRIKE_THRESHOLD = '5';
  try {
    assert.equal(scamStrikeThreshold(), 5);
    assert.equal(shouldAutoSuspend(4), false);
    assert.equal(shouldAutoSuspend(5), true);
  } finally {
    if (saved === undefined) delete process.env.SCAM_STRIKE_THRESHOLD;
    else process.env.SCAM_STRIKE_THRESHOLD = saved;
  }
});

test('two strikes do not suspend by default', () => {
  assert.equal(shouldAutoSuspend(2), false);
});

test('three strikes suspend by default', () => {
  assert.equal(shouldAutoSuspend(3), true);
});
