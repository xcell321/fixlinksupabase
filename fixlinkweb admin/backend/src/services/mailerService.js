// Admin mailer: password-reset email via the configured Gmail account.
// Extracted from routes/admin.js (inline nodemailer transporter). The EMAIL_*
// env scheme and plain-text template are preserved exactly.

const nodemailer = require('nodemailer');
const { supabase } = require('../config/supabase');

async function sendAdminPasswordReset(uid) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    const error = new Error('Password email is not configured.');
    error.status = 503;
    throw error;
  }
  const { data: user } = await supabase.from('users').select('email').eq('id', uid).maybeSingle();
  if (!user?.email) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  // Generate Supabase recovery link via admin
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email: user.email });
  if (error) throw error;
  const link = data.properties?.action_link || '';
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: String(process.env.EMAIL_PASS).replace(/\s+/g, '') },
  });
  await transporter.sendMail({
    from: `FixLink Support <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: 'Reset your FixLink password',
    text: `A password reset was requested. Open this link:\n\n${link}\n\nIf you did not request this, ignore this email.`,
  });
  return { email: user.email, message: 'Password reset email sent' };
}

module.exports = { sendAdminPasswordReset };
