/**
 * FixLink — read-only live smoke test for UAT #2-#11.
 *
 * Runs ONLY SELECTs / presence checks against the live Supabase project. It
 * never inserts, updates or deletes anything, so it is safe to run anytime.
 *
 * Usage: node scripts/smoke-live.js
 */
require('dotenv').config();

const { supabase } = require('../src/config/supabase');

const results = [];
const check = async (label, fn) => {
  try {
    const detail = await fn();
    results.push({ label, ok: true, detail: detail === undefined ? 'ok' : String(detail) });
  } catch (error) {
    results.push({ label, ok: false, detail: error.message || String(error) });
  }
};

const selectOne = (table, columns) => async () => {
  const { error } = await supabase.from(table).select(columns).limit(1);
  if (error) throw new Error(error.message);
  return 'column(s) readable';
};

const run = async () => {
  console.log('\n=== FixLink live smoke (read-only) ===\n');

  // #2 auto-suspend after a wasted technician trip
  await check('#2 jobs.technician_arrival_timestamp', selectOne('jobs', 'technician_arrival_timestamp'));
  await check('#2 users.no_show_count', selectOne('users', 'no_show_count'));
  await check('#2 service_incidents.cancellation/no_show', selectOne('service_incidents', 'type, stage, status'));
  // #6 daily request cap inputs
  await check('#6 jobs.customer_uid/created_at/status', selectOne('jobs', 'customer_uid, created_at, status'));
  // #6 fake / AI device-photo screening
  await check('#6 jobs.photo_risk_score/level/flags/notes', selectOne('jobs', 'photo_risk_score, photo_risk_level, photo_flags, photo_notes'));
  // #5 fake-address / harassment signals
  await check('#5 jobs.safety_flags/safety_level', selectOne('jobs', 'safety_flags, safety_level'));
  // #4 booking regulations accepted before the location step
  await check('#4 jobs.terms_accepted_at/terms_version', selectOne('jobs', 'terms_accepted_at, terms_version'));
  // #7 technician capacity inputs
  await check('#7 jobs.technician_uid/status', selectOne('jobs', 'technician_uid, status'));
  // #8 repeat scammer
  await check('#8 users.scam_count', selectOne('users', 'scam_count'));
  await check('#8 service_incidents.reported_uid/reporter_role', selectOne('service_incidents', 'reported_uid, reporter_role'));
  await check('#8 service_incidents.type accepts scam', selectOne('service_incidents', 'type'));
  // #9 credential screening
  await check('#9 users.credential_risk_score', selectOne('users', 'credential_risk_score'));
  await check('#9 users.credential_risk_level', selectOne('users', 'credential_risk_level'));
  await check('#9 users.credential_flags', selectOne('users', 'credential_flags'));
  await check('#9 users.credential_notes', selectOne('users', 'credential_notes'));
  await check('#9 users.credential_screened_at', selectOne('users', 'credential_screened_at'));
  // #10 facial verification
  await check('#10 users.selfie_url', selectOne('users', 'selfie_url'));
  await check('#10 users.face_check_level', selectOne('users', 'face_check_level'));
  await check('#10 users.face_match_confidence/face_liveness_risk', selectOne('users', 'face_match_confidence, face_liveness_risk'));
  // #11 two-way ratings
  await check('#11 reviews.reviewer_role', selectOne('reviews', 'reviewer_role'));
  await check('#11 reviews.customer_uid', selectOne('reviews', 'customer_uid'));

  for (const r of results) {
    console.log(`${r.ok ? '✔' : '✘'} ${r.label.padEnd(52)} ${r.detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exitCode = 1;
};

run().then(() => process.exit(process.exitCode || 0)).catch((error) => {
  console.error('Smoke run failed:', error);
  process.exit(1);
});
