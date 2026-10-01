const express = require('express');
const router = express.Router();

const { supabase } = require('../config/supabase');
const { verifyResetToken, hashResetToken } = require('../utils/resetToken');

// GET /reset-password — landing page linked from the password-reset email.
// Email clients render custom schemes like "fixlink://" as plain text, so the
// email always points to this standard https:// URL instead. The page lets the
// user change the password right away (posts to /api/auth/reset-password).
//
// The link is verified BEFORE the form is shown: the signed token must still be
// unused and unexpired, otherwise the page renders the "link unavailable" state.
// This is what makes a link inaccessible once the password has been changed,
// rather than only rejecting the second submit.
//
// The page mirrors the mobile app theme (mobile/src/theme.tsx): the `dark`
// header, `customer` orange primary action, Inter fallback stack, 12px
// radii. Copy is intentionally minimal.
const isResetLinkRedeemable = async ({ uid, email, token }) => {
  const payload = verifyResetToken(token);
  if (!payload || String(payload.sub) !== String(uid)) return false;
  if (email && payload.email !== String(email).trim().toLowerCase()) return false;

  try {
    const { data, error } = await supabase
      .from('password_resets')
      .select('id')
      .eq('token_hash', hashResetToken(token))
      .eq('user_id', uid)
      .gt('expires_at', new Date().toISOString())
      .is('used_at', null)
      .maybeSingle();
    if (error) {
      console.error('Reset link lookup failed:', error.message);
      return false;
    }
    return Boolean(data);
  } catch (error) {
    console.error('Reset link verification failed:', error.message);
    return false;
  }
};

router.get('/reset-password', async (req, res) => {
  const { uid, email, token } = req.query || {};

  const safe = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const hasCredential = Boolean(uid && token) && await isResetLinkRedeemable({ uid, email, token });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FixLink — Reset Password</title>
  <style>
    :root {
      --dark: #0D1B2A; --accent: #F97316; --accent-dark: #EA580C;
      --ink: #102A43; --muted: #6B7280; --line: #E5E7EB; --field: #F9FAFB;
      --bg: #F9FAFB; --danger: #DC2626; --success: #0F766E;
      --white: #FFFFFF; --danger-soft: #FEF2F2; --success-soft: #E6F6F3;
      --ink-rgb: 16,42,67;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
      background: var(--bg); font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { width: 100%; max-width: 400px; background: var(--white); border-radius: 24px; overflow: hidden; box-shadow: 0 12px 32px rgba(var(--ink-rgb),0.10); }
    .head { background: var(--dark); padding: 28px 24px 24px; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
    .logo { width: 40px; height: 40px; border-radius: 12px; background: var(--accent); color: var(--white); font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .brand-name { color: var(--white); font-size: 13px; font-weight: 800; letter-spacing: 1px; }
    h1 { margin: 0; color: var(--white); font-size: 22px; font-weight: 800; letter-spacing: -0.2px; }
    .body { padding: 24px; }
    .field { margin-bottom: 14px; }
    label { display: block; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.8px; margin-bottom: 6px; }
    input { width: 100%; min-height: 52px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); color: var(--ink); font-size: 15px; }
    input:focus { outline: none; border-color: var(--accent); background: var(--white); }
    button { width: 100%; min-height: 52px; margin-top: 8px; border: none; border-radius: 12px; background: var(--accent); color: var(--white); font-size: 15px; font-weight: 700; cursor: pointer; }
    button:hover { background: var(--accent-dark); }
    button:disabled { opacity: 0.6; cursor: default; }
    .hint { margin: 12px 0 0; color: var(--muted); font-size: 11px; text-align: center; }
    .msg { margin: 0 0 14px; font-size: 13px; font-weight: 600; padding: 10px 12px; border-radius: 10px; display: none; }
    .msg.show { display: block; }
    .msg.error { background: var(--danger-soft); color: var(--danger); }
    .msg.success { background: var(--success-soft); color: var(--success); }
    .empty { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="brand">
        <div class="logo">FL</div>
        <div class="brand-name">FIXLINK</div>
      </div>
      <h1>${hasCredential ? 'Reset password' : 'Link unavailable'}</h1>
    </div>
    <div class="body">
      ${hasCredential ? `
      <form id="resetForm">
        <input type="hidden" id="f_uid" value="${safe(uid)}" />
        <input type="hidden" id="f_email" value="${safe(email)}" />
        <input type="hidden" id="f_token" value="${safe(token)}" />
        <div class="msg" id="msg"></div>
        <div class="field">
          <label for="newPassword">NEW PASSWORD</label>
          <input type="password" id="newPassword" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" required />
        </div>
        <div class="field">
          <label for="confirmPassword">CONFIRM PASSWORD</label>
          <input type="password" id="confirmPassword" autocomplete="new-password" placeholder="Repeat password" required />
        </div>
        <button id="submitBtn" type="submit">Save password</button>
        <p class="hint">One-time link. Expires in 24 hours.</p>
      </form>
      ` : `
      <p class="empty">This link has already been used or has expired. Request a new one in the FixLink app.</p>
      `}
    </div>
  </div>

  ${hasCredential ? `<script>
    const form = document.getElementById('resetForm');
    const msg = document.getElementById('msg');
    const btn = document.getElementById('submitBtn');
    const uid   = document.getElementById('f_uid').value;
    const email = document.getElementById('f_email').value;
    const token = document.getElementById('f_token').value;
    const show = (kind, text) => { msg.className = 'msg show ' + kind; msg.textContent = text; };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      msg.className = 'msg';
      msg.textContent = '';
      if (String(newPassword).trim().length < 8) return show('error', 'At least 8 characters.');
      if (newPassword !== confirmPassword) return show('error', 'Passwords do not match.');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: uid, email: email, token: token, newPassword: newPassword }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          show('error', result.error || 'Unable to reset password. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Save password';
        } else {
          // The link is now spent: hide the form so the page cannot be reused.
          show('success', 'Password updated. Sign in to the FixLink app.');
          form.reset();
          form.style.display = 'none';
        }
      } catch (err) {
        show('error', 'Unable to reset password. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Save password';
      }
    });
  </script>` : ''}
</body>
</html>`);
});

module.exports = router;
