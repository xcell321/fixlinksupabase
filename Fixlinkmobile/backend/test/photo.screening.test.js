// Red-Green: UAT #6 (second part) — fake / AI-generated device photos.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const photo = require('../src/domain/photoScreening');
const { screenRepairPhoto } = require('../src/services/credential/photoScreeningService');
const { serializeJob } = require('../src/domain/jobSerializer');

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

const pngBytes = (width, height, { pad = 0, extra = '' } = {}) => {
  const buffer = Buffer.alloc(24 + pad + extra.length);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  if (extra) Buffer.from(extra, 'latin1').copy(buffer, 24 + pad);
  return buffer;
};

test('photo screening returns null when disabled', async () => {
  await withEnv({ PHOTO_SCREENING_ENABLED: 'false' }, async () => {
    const result = await screenRepairPhoto({ buffer: pngBytes(1000, 1000, { pad: 30000 }) });
    assert.equal(result, null);
  });
});

test('an AI-exported device photo is flagged and scored high', async () => {
  await withEnv({ PHOTO_AI_VISION_ENABLED: 'false' }, async () => {
    const result = await screenRepairPhoto({ buffer: pngBytes(1200, 900, { pad: 30000, extra: 'midjourney c2pa' }), mimetype: 'image/png' });
    assert.ok(result);
    assert.ok(result.flags.includes('ai_tool_marker'));
    assert.ok(result.riskScore >= 60);
    assert.ok(['flagged', 'high'].includes(result.riskLevel));
  });
});

test('a low-resolution tiny photo is flagged', async () => {
  await withEnv({ PHOTO_AI_VISION_ENABLED: 'false' }, async () => {
    const result = await screenRepairPhoto({ buffer: pngBytes(120, 90), mimetype: 'image/png' });
    assert.ok(result.flags.includes('low_resolution'));
    assert.ok(result.flags.includes('tiny_file'));
  });
});

test('the serializer exposes the photo risk to the technician', () => {
  const job = serializeJob({
    id: 'j1',
    customer_name: 'Cust',
    status: 'Pending',
    photo_url: 'https://x/y.jpg',
    photo_risk_score: 90,
    photo_risk_level: 'high',
    photo_flags: ['ai_generated'],
    photo_notes: 'The device photo looks AI-generated.',
  });
  assert.equal(job.photoRiskScore, 90);
  assert.equal(job.photoRiskLevel, 'high');
  assert.deepEqual(job.photoFlags, ['ai_generated']);
  assert.match(job.photoNotes, /AI-generated/i);
});

test('photo screening policy is env-driven', () => {
  withEnv({ PHOTO_FLAG_THRESHOLD: '50', PHOTO_HIGH_THRESHOLD: '70' }, () => {
    assert.equal(photo.photoFlagThreshold(), 50);
    assert.equal(photo.photoHighThreshold(), 70);
  });
});
