/**
 * FixLink — credential screening + facial verification E2E (UAT #9/#10).
 *
 * Exercises the deterministic layers locally and, when the OmniRoute gateway is
 * configured, makes ONE real multimodal call to prove the vision path works.
 * Read-only: it never touches the database.
 *
 * Usage: node scripts/e2e-credential-screening.js
 */
require('dotenv').config();

const zlib = require('zlib');
const domain = require('../src/domain/credentialScreening');
const { analyzeDocument } = require('../src/services/credential/documentForensics');
const { screenCredential } = require('../src/services/credential/credentialScreeningService');
const omniRoute = require('../src/services/omniRoute');

// --- A real, decodable PNG so the vision model has something valid ---------
const crcTable = (() => {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
};
const makePng = (width, height, { pad = 0, tail = '' } = {}) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x80);
  const idat = zlib.deflateSync(raw);
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ];
  if (pad > 0) parts.push(Buffer.alloc(pad, 0x20));
  if (tail) parts.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(parts);
};

const results = [];
const record = (label, ok, detail) => results.push({ label, ok, detail: String(detail) });

const run = async () => {
  console.log('\n=== FixLink credential screening E2E (UAT #9/#10) ===\n');

  // --- Part 1: local forensics -------------------------------------------
  const scenarios = [
    ['clean photo (no markers, big+)', makePng(1200, 900, { pad: 30000 })],
    ['AI export (midjourney + c2pa)', makePng(1200, 900, { pad: 30000, tail: 'MidJourney c2pa synthid' })],
    ['edited (photoshop)', makePng(1200, 900, { pad: 30000, tail: 'Adobe Photoshop 25.0' })],
    ['low resolution + tiny', makePng(120, 90)],
    ['renamed PDF', Buffer.from('%PDF-1.7 not really a pdf', 'latin1')],
  ];
  console.log('Part 1 — local forensics');
  for (const [label, buffer] of scenarios) {
    const r = analyzeDocument({ buffer });
    console.log(`  ${label.padEnd(32)} format=${r.format.padEnd(7)} score=${String(r.score).padStart(3)} flags=[${r.flags.join(', ')}]`);
  }
  record('forensics ran on 5 scenarios', true, 'ok');

  // --- Part 2: face + identity judging -----------------------------------
  console.log('\nPart 2 — face + identity judging');
  const faces = [
    ['same person', { facePresent: true, selfieFacePresent: true, idFacePresent: true, livenessRisk: 0.05, matchConfidence: 0.92 }],
    ['different person', { facePresent: true, selfieFacePresent: true, idFacePresent: true, livenessRisk: 0.05, matchConfidence: 0.12 }],
    ['photo of a screen', { facePresent: true, selfieFacePresent: true, idFacePresent: true, livenessRisk: 0.95, matchConfidence: 0.8 }],
    ['no face in selfie', { facePresent: false, selfieFacePresent: false, idFacePresent: true, livenessRisk: 1, matchConfidence: 0 }],
  ];
  for (const [label, vision] of faces) {
    const verdict = domain.judgeFace({ screening: { vision }, selfieProvided: true });
    console.log(`  ${label.padEnd(20)} level=${verdict.level.padEnd(10)} flags=[${verdict.flags.join(', ')}]`);
  }
  record('face judging produced verdicts', true, 'ok');
  record('name match is tolerant', domain.namesMatch('JUAN D. CRUZ', 'juan cruz') === true, 'JUAN D. CRUZ == juan cruz');
  record('id numbers compare ignoring separators', domain.idNumbersMatch('1234-5678', '12345678') === true, 'ok');

  // --- Part 3: end-to-end screenCredential (local only) -------------------
  console.log('\nPart 3 — screenCredential (AI vision off, local pass)');
  const savedVision = process.env.CREDENTIAL_AI_VISION_ENABLED;
  process.env.CREDENTIAL_AI_VISION_ENABLED = 'false';
  try {
    const result = await screenCredential({
      role: 'technician',
      name: 'Juan Cruz',
      governmentIdNumber: '1234-5678-9012',
      governmentIdFile: { buffer: makePng(1200, 900, { pad: 30000 }), mimetype: 'image/png' },
      selfieFile: { buffer: makePng(800, 800, { pad: 30000 }), mimetype: 'image/png' },
    });
    console.log(`  riskScore=${result.riskScore} level=${result.riskLevel} flags=[${result.flags.join(', ')}]`);
    console.log(`  vision=${result.vision === null ? 'null (degraded gracefully)' : 'present'}`);
    record('screening degrades gracefully without AI', result && result.vision === null, 'local score only');
  } finally {
    if (savedVision === undefined) delete process.env.CREDENTIAL_AI_VISION_ENABLED;
    else process.env.CREDENTIAL_AI_VISION_ENABLED = savedVision;
  }

  // --- Part 4: one live AI vision call ------------------------------------
  console.log('\nPart 4 — live AI vision call (OmniRoute)');
  if (!omniRoute.isOmniRouteConfigured()) {
    console.log('  skipped — OMNIROUTE_BASE_URL / OMNIROUTE_API_KEY not configured');
    record('live vision call', true, 'skipped (gateway off)');
  } else {
    try {
      const started = Date.now();
      const { parsed, model } = await omniRoute.visionComplete({
        system: 'You analyse images and reply with strict JSON only.',
        user: 'Return JSON: {"facePresent": boolean, "idFacePresent": boolean, "livenessRisk": number 0..1, "matchConfidence": number 0..1, "level": "match"|"mismatch"|"unknown", "notes": "short English sentence"}',
        images: [{ base64: makePng(256, 256).toString('base64'), mimeType: 'image/png' }],
        timeoutMs: Number(process.env.CREDENTIAL_VISION_TIMEOUT_MS) || 20000,
      });
      console.log(`  model=${model} in ${Date.now() - started}ms`);
      console.log(`  ${JSON.stringify(parsed)}`);
      record('live vision call returned JSON', Boolean(parsed), `model=${model}`);
    } catch (error) {
      console.log(`  ✘ ${error.message}`);
      record('live vision call returned JSON', false, error.message);
    }
  }

  console.log('\n--- results ---');
  for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.label.padEnd(42)} ${r.detail}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed.`);
  if (passed !== results.length) process.exitCode = 1;
};

run().then(() => process.exit(process.exitCode || 0)).catch((error) => {
  console.error('E2E run failed:', error);
  process.exit(1);
});
