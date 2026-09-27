/**
 * FixLink — User Account Diagnostic
 * Checks where an email exists: Supabase Auth, public.users, or both.
 *
 * Usage:
 *   node scripts/check-user.js someone@email.com
 */
require('dotenv').config();

const { supabase } = require('../src/config/supabase');

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.log('Usage: node scripts/check-user.js <email>');
  process.exit(1);
}

const run = async () => {
  console.log(`\n🔍 Checking: ${email}\n`);

  // 1. Supabase Auth (auth.users)
  let authUser = null;
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('Auth list error:', error.message);
      break;
    }
    authUser = data.users.find((u) => (u.email || '').toLowerCase() === email) || null;
    if (authUser || data.users.length < perPage) break;
    page += 1;
  }

  if (authUser) {
    console.log('✅ Supabase Auth (auth.users): EXISTS');
    console.log(`   id            : ${authUser.id}`);
    console.log(`   email         : ${authUser.email}`);
    console.log(`   confirmed     : ${authUser.email_confirmed_at ? 'yes' : 'NO'}`);
    console.log(`   created_at    : ${authUser.created_at}`);
    console.log(`   last_sign_in  : ${authUser.last_sign_in_at || 'never'}`);
  } else {
    console.log('❌ Supabase Auth (auth.users): NOT FOUND  ← login will ALWAYS fail with "Invalid login credentials"');
  }

  // 2. Profile table (public.users)
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, name, role, status, verification_status, created_at')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    console.error('Profile query error:', profileError.message);
  } else if (profile) {
    console.log('✅ users table (public.users): EXISTS');
    console.log(`   id            : ${profile.id}`);
    console.log(`   name          : ${profile.name}`);
    console.log(`   role          : ${profile.role}`);
    console.log(`   status        : ${profile.status}`);
    console.log(`   verification  : ${profile.verification_status || 'n/a'}`);
    console.log(`   created_at    : ${profile.created_at}`);
  } else {
    console.log('❌ users table (public.users): NOT FOUND');
  }

  // 3. Verdict
  console.log('\n📋 VERDICT:');
  if (authUser && profile) {
    if (authUser.id === profile.id) {
      console.log('   Account looks HEALTHY. If login still fails → the PASSWORD is wrong.');
      console.log('   Fix: use "Forgot Password" in the app, or reset in Supabase dashboard');
      console.log('   (Authentication → Users → ⋯ → Send password recovery / Update password).');
    } else {
      console.log(`   ⚠️ ID MISMATCH: auth id ${authUser.id} ≠ table id ${profile.id}`);
      console.log('   → The users-table row points to a different auth account. Delete the');
      console.log('     stale row and re-register, or fix the id to match the auth id.');
    }
  } else if (authUser && !profile) {
    console.log('   ⚠️ ORPHANED AUTH USER (auth only, no profile). This is why register says');
    console.log('     "already registered" but login can never fully succeed.');
    console.log(`   → Delete the auth user (id: ${authUser.id}) via Supabase dashboard`);
    console.log('     (Authentication → Users) and register again, or run cleanup script.');
  } else if (!authUser && profile) {
    console.log('   ⚠️ PROFILE WITHOUT AUTH ACCOUNT (table only). Login impossible —');
    console.log('     signInWithPassword has no auth user to match.');
    console.log(`   → Delete the stale row (id: ${profile.id}) and register again.`);
  } else {
    console.log('   Account does not exist anywhere — just register normally.');
  }
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
