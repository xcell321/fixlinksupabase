/**
 * FixLink — Admin Password Reset
 * Resets a user's password directly via the Supabase Admin API.
 *
 * Usage:
 *   node scripts/reset-password.js <email> <newPassword>
 * Example:
 *   node scripts/reset-password.js maryann@gmail.com "NewPass123!"
 */
require('dotenv').config();

const { supabase } = require('../src/config/supabase');

const email = process.argv[2]?.trim().toLowerCase();
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log('Usage: node scripts/reset-password.js <email> <newPassword>');
  process.exit(1);
}

const run = async () => {
  console.log(`\n🔎 Looking up auth user: ${email}`);
  let target = null;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error('Auth list error:', error.message); process.exit(1); }
    target = data.users.find((u) => (u.email || '').toLowerCase() === email) || null;
    if (target || data.users.length < 200) break;
    page += 1;
  }

  if (!target) {
    console.error(`❌ No auth user found for ${email}. Register a new account instead.`);
    process.exit(1);
  }

  const { error } = await supabase.auth.admin.updateUserById(target.id, { password: newPassword });
  if (error) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Password updated for ${email} (auth id: ${target.id})`);
  console.log('   You can now log in with the new password.\n');
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
