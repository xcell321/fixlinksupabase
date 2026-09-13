const express = require('express');
const router = express.Router();

// GET /reset-password — landing page linked from the password-reset email.
// Email clients render custom schemes like "fixlink://" as plain text, so the
// email always points to this standard https:// URL instead. The page lets the
// user change the password right away (posts to /api/auth/reset-password).
router.get('/reset-password', (req, res) => {
  const { uid, email, token } = req.query || {};

  const safe = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const hasCredential = Boolean(uid && token);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FixLink — Reset Password</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F5F8FA; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #FFFFFF; max-width: 380px; width: 90%; border-radius: 20px; padding: 32px 24px; text-align: center; box-shadow: 0 12px 24px rgba(16,42,67,0.12); }
    .logo { width: 54px; height: 54px; border-radius: 19px; background: #0F766E; color: #fff; font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    h1 { color: #102A43; font-size: 22px; margin: 0 0 8px; }
    p.sub { color: #5A7A91; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
    .field { text-align: left; margin-bottom: 14px; }
    .field label { display: block; color: #102A43; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .field input { width: 100%; box-sizing: border-box; padding: 12px 14px; border: 1px solid #D9E2EC; border-radius: 10px; font-size: 14px; color: #102A43; background: #fff; }
    .field input:focus { outline: none; border-color: #0F766E; }
    .submit { width: 100%; background: #0F766E; color: #fff; border: none; font-weight: 700; font-size: 15px; padding: 14px; border-radius: 12px; margin-bottom: 18px; }
    .submit:disabled { opacity: 0.6; }
    .msg { font-size: 13px; font-weight: 600; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; display: none; }
    .msg.error { display: block; background: #FDF0EF; color: #B23B2F; border: 1px solid #F4C4BE; }
    .msg.success { display: block; background: #E6F6F3; color: #0F766E; border: 1px solid #B5E7DE; }
    .msg:empty { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">FL</div>
    <h1>FixLink Password Reset</h1>
    ${hasCredential ? `
    <p class="sub">Enter a new password below.</p>
    <form id="resetForm">
      <input type="hidden" id="f_uid" value="${safe(uid)}" />
      <input type="hidden" id="f_email" value="${safe(email)}" />
      <input type="hidden" id="f_token" value="${safe(token)}" />
      <div class="msg" id="msg"></div>
      <div class="field">
        <label for="newPassword">New Password</label>
        <input type="password" id="newPassword" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required />
      </div>
      <div class="field">
        <label for="confirmPassword">Confirm Password</label>
        <input type="password" id="confirmPassword" autocomplete="new-password" placeholder="Repeat your new password" required />
      </div>
      <button class="submit" id="submitBtn" type="submit">Save New Password</button>
    </form>
    ` : `
    <p class="sub">This password recovery link is invalid or has expired. Please request a new one from the FixLink app.</p>
    `}
  </div>

  ${hasCredential ? `<script>
    const form = document.getElementById('resetForm');
    const msg = document.getElementById('msg');
    const btn = document.getElementById('submitBtn');
    const uid   = document.getElementById('f_uid').value;
    const email = document.getElementById('f_email').value;
    const token = document.getElementById('f_token').value;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      msg.className = 'msg';
      msg.textContent = '';
      if (String(newPassword).trim().length < 6) { msg.className = 'msg error'; msg.textContent = 'Password must be at least 6 characters.'; return; }
      if (newPassword !== confirmPassword) { msg.className = 'msg error'; msg.textContent = 'Passwords do not match.'; return; }
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
          msg.className = 'msg error';
          msg.textContent = result.error || 'Unable to reset password. Please try again.';
        } else {
          msg.className = 'msg success';
          msg.textContent = 'Password updated successfully. You can now sign in to the FixLink app.';
          form.reset();
        }
      } catch (err) {
        msg.className = 'msg error';
        msg.textContent = 'Unable to reset password. Please try again.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save New Password';
      }
    });
  </script>` : ''}
</body>
</html>`);
});

module.exports = router;