/**
 * FixLink — re-screen legacy credentials (UAT #9/#10 backfill).
 *
 * Finds every user whose `credential_risk_score` is null (accounts created
 * before screening existed) and, with --apply, re-runs the screening on the
 * government ID + selfie already stored for them and writes the advisory
 * result back.
 *
 * SAFE BY DEFAULT: with no flag it is a DRY RUN — it only lists what it would
 * change. Pass --apply to write to the live database.
 *
 * Usage:
 *   node scripts/rescreen-credentials.js              # dry run (list only)
 *   node scripts/rescreen-credentials.js --apply      # write results
 *   node scripts/rescreen-credentials.js --apply --force   # re-screen EVERYONE with an ID
 *   node scripts/rescreen-credentials.js --apply --limit=20
 *
 * --force is the upgrade path: run it again after AI_VISION_MODEL is
 * configured so already-scored users get the AI vision verdict too.
 */
require('dotenv').config();

const { supabase } = require('../src/config/supabase');
const { screenCredential } = require('../src/services/credential/credentialScreeningService');
const { isScreeningEnabled } = require('../src/domain/credentialScreening');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const fetchFile = async (url) => {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimetype: response.headers.get('content-type') || 'image/jpeg' };
};

const LIST_COLUMNS = 'id, name, role, government_id_number, government_id_file_url, selfie_url, profile_image, credential_risk_score, created_at';

const listTargets = async () => {
  let query = supabase.from('users').select(LIST_COLUMNS).order('created_at', { ascending: true });
  // Default: only users with no score yet. --force re-screens everyone with an ID.
  if (!force) query = query.is('credential_risk_score', null);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const run = async () => {
  console.log('\n=== FixLink re-screen legacy credentials ===\n');
  console.log(`Mode: ${apply ? 'APPLY (writes to the database)' : 'DRY RUN (no writes)'}${force ? ' — FORCE (re-screen even already-scored users)' : ''}\n`);

  if (!isScreeningEnabled()) {
    console.error('CREDENTIAL_SCREENING_ENABLED is false — nothing to do.');
    process.exit(1);
  }

  const legacy = await listTargets();
  const withId = legacy.filter((user) => user.government_id_file_url);
  const withoutId = legacy.length - withId.length;

  console.log(`${force ? 'Users (all)' : 'Users missing credential_risk_score'} : ${legacy.length}`);
  console.log(`  • with a government ID to screen   : ${withId.length}`);
  console.log(`  • without a government ID (skip)   : ${withoutId}\n`);

  if (legacy.length === 0) {
    console.log('Nothing to do — every user already has a credential risk score. ✅\n');
    return;
  }
  if (withId.length === 0) {
    console.log('No user has a government ID on file — nothing to screen.\n');
    return;
  }

  console.log(`${'NAME'.padEnd(24)} ${'ROLE'.padEnd(11)} ${'ID FILE'.padEnd(9)} ${'SELFIE'.padEnd(7)} SCORE`);
  console.log('-'.repeat(70));

  let screened = 0;
  let failed = 0;

  for (const user of withId.slice(0, limit)) {
    const hasSelfie = Boolean(user.selfie_url || user.profile_image);
    let line = `${String(user.name || user.id).slice(0, 23).padEnd(24)} ${String(user.role || '').padEnd(11)} ${'yes'.padEnd(9)} ${(hasSelfie ? 'yes' : 'no').padEnd(7)}`;

    if (!apply) {
      console.log(`${line} (would screen)`);
      continue;
    }

    try {
      const governmentIdFile = await fetchFile(user.government_id_file_url);
      const selfieFile = await fetchFile(user.selfie_url || user.profile_image);
      const screening = await screenCredential({
        role: user.role,
        name: user.name,
        governmentIdNumber: user.government_id_number,
        governmentIdFile,
        selfieFile,
      });
      if (!screening) throw new Error('screening disabled');

      // Honesty guard: when the AI vision pass did not run, say so in the note
      // and leave the face fields null rather than implying a face verdict.
      const visionRan = screening.vision !== null;
      const notes = visionRan
        ? screening.notes
        : [screening.notes, 'Local forensics only — AI vision unavailable at re-screen time. Re-run with --force once AI_VISION_MODEL is set.'].filter(Boolean).join(' ');

      const updates = {
        credential_risk_score: screening.riskScore,
        credential_risk_level: screening.riskLevel,
        credential_flags: screening.flags,
        credential_notes: notes,
        credential_screened_at: screening.screenedAt,
        verification_note: notes,
        ...(visionRan ? {
          face_check_level: screening.face?.level ?? null,
          face_match_confidence: screening.face?.matchConfidence ?? null,
          face_liveness_risk: screening.face?.livenessRisk ?? null,
        } : {}),
      };
      const { error } = await supabase.from('users').update(updates).eq('id', user.id);
      if (error) throw new Error(error.message);
      screened += 1;
      console.log(`${line} ${screening.riskScore} (${screening.riskLevel})`);
    } catch (error) {
      failed += 1;
      console.log(`${line} FAILED: ${error.message}`);
    }
  }

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to write the scores.');
  } else {
    console.log(`\nDone. Screened ${screened}, failed ${failed}.`);
  }
};

run()
  .then(() => {
    // Close the Supabase realtime socket before exiting so Windows Node does
    // not race the libuv async handle on shutdown.
    try { supabase.removeAllChannels?.(); } catch (_) {}
    setTimeout(() => process.exit(0), 50);
  })
  .catch((error) => {
    console.error('Re-screen failed:', error);
    setTimeout(() => process.exit(1), 50);
  });
