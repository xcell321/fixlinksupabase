// Red-Green: UAT #9 (credential screening) + #10 (facial verification).
// These cover the deterministic layers; the AI vision call itself is exercised
// by scripts/e2e-credential-screening.js against the live gateway.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../src/domain/credentialScreening');
const { analyzeDocument } = require('../src/services/credential/documentForensics');
const { screenCredential } = require('../src/services/credential/credentialScreeningService');

const withEnv = (vars, run) => {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = run();
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
};

// A structurally valid PNG header with the given dimensions. Padded so it can
// clear the tiny-file threshold when a test needs it to.
const pngBytes = (width, height, { pad = 0, extra = '' } = {}) => {
  const buffer = Buffer.alloc(24 + pad + extra.length);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  if (extra) Buffer.from(extra, 'latin1').copy(buffer, 24 + pad);
  return buffer;
};

test('config is read from the environment, not hardcoded', () => {
  withEnv({ CREDENTIAL_FLAG_THRESHOLD: '70', CREDENTIAL_AI_VISION_ENABLED: 'false' }, () => {
    assert.equal(domain.config().flagThreshold, 70);
    assert.equal(domain.isVisionEnabled(), false);
  });
});

test('names match tolerantly (middle initial, case)', () => {
  assert.equal(domain.namesMatch('JUAN D. CRUZ', 'juan cruz'), true);
  assert.equal(domain.namesMatch('Maria Santos', 'Pedro Reyes'), false);
});

test('ID numbers match ignoring separators', () => {
  assert.equal(domain.idNumbersMatch('1234-5678-9012', '123456789012'), true);
  assert.equal(domain.idNumbersMatch('1111-0000', '2222-0000'), false);
});

test('risk levels follow the configured thresholds', () => {
  withEnv({ CREDENTIAL_FLAG_THRESHOLD: '60', CREDENTIAL_HIGH_THRESHOLD: '80' }, () => {
    assert.equal(domain.levelForScore(10), 'low');
    assert.equal(domain.levelForScore(65), 'flagged');
    assert.equal(domain.levelForScore(90), 'high');
    assert.equal(domain.levelForScore(null), 'unverified');
  });
});

test('local forensics reads real PNG dimensions from the header', () => {
  const result = analyzeDocument({ buffer: pngBytes(1200, 800, { pad: 30000 }) });
  assert.equal(result.format, 'png');
  assert.equal(result.width, 1200);
  assert.equal(result.height, 800);
});

test('local forensics flags an AI-generation signature', () => {
  const result = analyzeDocument({ buffer: pngBytes(1200, 800, { extra: 'MidJourney c2pa' }) });
  assert.ok(result.flags.includes(domain.FLAGS.AI_TOOL_MARKER));
  assert.ok(result.score >= 70);
});

test('local forensics flags low resolution and tiny files', () => {
  const result = analyzeDocument({ buffer: pngBytes(100, 100) });
  assert.ok(result.flags.includes(domain.FLAGS.LOW_RESOLUTION));
  assert.ok(result.flags.includes(domain.FLAGS.TINY_FILE));
});

test('a renamed PDF is detected by magic bytes, not the extension', () => {
  const result = analyzeDocument({ buffer: Buffer.from('%PDF-1.7 fake', 'latin1') });
  assert.equal(result.format, 'pdf');
});

test('judgeFace flags a liveness risk from a photo of a screen', () => {
  const verdict = domain.judgeFace({
    screening: { vision: { facePresent: true, idFacePresent: true, livenessRisk: 0.9, matchConfidence: 0.8 } },
    selfieProvided: true,
  });
  assert.ok(verdict.flags.includes(domain.FLAGS.SELFIE_LIVENESS_RISK));
  assert.equal(verdict.level, 'high');
});

test('judgeFace flags a face mismatch when confidence is below the threshold', () => {
  const verdict = domain.judgeFace({
    screening: { vision: { facePresent: true, idFacePresent: true, livenessRisk: 0.1, matchConfidence: 0.1 } },
    selfieProvided: true,
  });
  assert.ok(verdict.flags.includes(domain.FLAGS.FACE_MISMATCH));
});

test('screenCredential returns null when screening is disabled', async () => {
  await withEnv({ CREDENTIAL_SCREENING_ENABLED: 'false' }, async () => {
    const result = await screenCredential({ role: 'technician', governmentIdFile: { buffer: pngBytes(1000, 1000) } });
    assert.equal(result, null);
  });
});

test('screenCredential degrades to the local pass when AI vision is off', async () => {
  await withEnv({ CREDENTIAL_AI_VISION_ENABLED: 'false' }, async () => {
    const result = await screenCredential({
      role: 'technician',
      name: 'Juan Cruz',
      governmentIdNumber: '1234-5678',
      governmentIdFile: { buffer: pngBytes(1200, 800, { pad: 30000 }), mimetype: 'image/png' },
      selfieFile: { buffer: pngBytes(800, 800, { pad: 30000 }), mimetype: 'image/png' },
    });
    assert.ok(result);
    assert.equal(typeof result.riskScore, 'number');
    assert.equal(result.vision, null);
    assert.ok(Array.isArray(result.flags));
  });
});
