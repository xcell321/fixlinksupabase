// Password-reset service: POST /api/auth/forgot-password + reset-password.
// Extracted verbatim from routes/auth.js. Behavior is unchanged: unknown
// emails still get the same success message, tokens are single-use.

const { supabase } = require('../../config/supabase');
const { sendPasswordResetEmail } = require('../emailService');
const { signResetToken, verifyResetToken, hashResetToken, TOKEN_TTL_MS } = require('../../utils/resetToken');
const { HttpError } = require('../../domain/httpError');

const requestPasswordReset = async ({ email, reqMeta }) => {
  const sanitizedEmail = String(email || '').trim().toLowerCase();
  if (!sanitizedEmail) {
    throw new HttpError(400, { error: 'Email is required.' });
  }

  // 1. Find the auth user by email.
  const { data: profile } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', sanitizedEmail)
    .maybeSingle();
  let uid = profile?.id || null;

  if (!uid) {
    const { data: allUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 5000 });
    const match = (allUsers?.users || []).find(
      (u) => String(u.email || '').trim().toLowerCase() === sanitizedEmail
    );
    uid = match?.id || null;
  }

  if (!uid) {
    // Unknown email — no reset email is sent, same success message.
    return { message: 'Password reset link sent to your email.' };
  }

  // 2. Build a short-lived, signed recovery token (no Supabase redirect needed).
  const token = signResetToken({ uid, email: sanitizedEmail });

  // 3. Record the token (as a fingerprint) so it can only be redeemed once.
  // Any previously issued, still-unused reset links for this account are discarded.
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error: purgeError } = await supabase
    .from('password_resets')
    .delete()
    .eq('user_id', uid)
    .is('used_at', null);
  const { error: insertError } = await supabase.from('password_resets').insert({
    user_id: uid,
    token_hash: hashResetToken(token),
    expires_at: expiresAt,
  });
  if (purgeError || insertError) {
    console.error('Unable to record password reset token:', {
      purge: purgeError?.message,
      insert: insertError?.message,
    });
    throw new HttpError(500, { error: 'Unable to send reset link.' });
  }

  const query = new URLSearchParams();
  query.set('uid', uid);
  query.set('email', sanitizedEmail);
  query.set('token', token);
  const deepLink = `fixlink://recovery?${query.toString()}`;

  sendPasswordResetEmail(
    sanitizedEmail,
    deepLink,
    reqMeta?.host,
    reqMeta?.forwardedProto,
    reqMeta?.forwardedHost
  ).catch((err) => console.error('Failed to send reset email:', err));

  return { message: 'Password reset link sent to your email.' };
};

const completePasswordReset = async ({ uid, email, token, newPassword }) => {
  if (!newPassword || String(newPassword).length < 6) {
    throw new HttpError(400, { error: 'New password must be at least 6 characters.' });
  }

  const payload = verifyResetToken(token);
  if (!payload) {
    throw new HttpError(400, { error: 'The password reset link is invalid or has expired.' });
  }

  // The token is bound to the account uid + email from the link.
  const matchesUid = uid && payload.sub === uid;
  const matchesEmail = !email || payload.email === String(email).trim().toLowerCase();
  if (!matchesUid || !matchesEmail) {
    throw new HttpError(400, { error: 'The password reset link is invalid or has expired.' });
  }

  // 1. Claim the recorded token atomically. The row is matched on the stored
  // fingerprint and requires it to be unused and unexpired — a row that is
  // already used (or absent) makes the whole link invalid, so a link that
  // worked once can never be replayed.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('password_resets')
    .update({ used_at: nowIso })
    .eq('token_hash', hashResetToken(token))
    .eq('user_id', payload.sub)
    .gt('expires_at', nowIso)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('Unable to claim password reset token:', claimError.message);
    throw new HttpError(500, { error: 'Unable to reset password. Please try again.' });
  }
  if (!claimed) {
    throw new HttpError(400, { error: 'The password reset link has already been used or has expired.' });
  }

  // 2. Apply the new password. The link is already burned at this point, so a
  // failed password write cannot be retried with the same link.
  const { error } = await supabase.auth.admin.updateUserById(payload.sub, {
    password: String(newPassword),
  });
  if (error) {
    console.error('Supabase password update error:', error.message);
    throw new HttpError(400, { error: `Unable to update password: ${error.message}` });
  }
  return { message: 'Password updated successfully. You can now sign in.' };
};

module.exports = { requestPasswordReset, completePasswordReset };
