const dns = require('dns');
const { promisify } = require('util');
const nodemailer = require('nodemailer');
const { getPublicBaseUrl } = require('../utils/network');

const lookup = promisify(dns.lookup);

// Inline email palette. Email clients only honour inline styles, so these
// values live here (mirroring the mobile theme) rather than in CSS variables.
const EMAIL_COLORS = {
  ink: '#102A43',
  muted: '#6B7280',
  brand: '#F97316',
  white: '#FFFFFF',
  link: '#2563EB',
  infoBg: '#EFF6FF',
  infoBorder: '#BFDBFE',
  infoText: '#1E40AF',
};

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// Fallbacks for an unset SMTP config, so no host or port is a literal in use.
const DEFAULT_EMAIL_HOST = 'smtp.gmail.com';
const DEFAULT_EMAIL_PORT = 587;
const DEFAULT_EMAIL_FROM = '"FixLink Support" <noreply@fixlink.com>';
const EMAIL_PORT_SSL = 465;

async function createTransporter() {
  let host = process.env.EMAIL_HOST || DEFAULT_EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT) || DEFAULT_EMAIL_PORT;
  const tls = {};
  try {
    const { address } = await lookup(host);
    host = address;
    tls.servername = process.env.EMAIL_HOST || DEFAULT_EMAIL_HOST;
  } catch (_) {
    /* keep using the hostname as-is */
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === EMAIL_PORT_SSL,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

const sendPasswordResetEmail = async (to, link, requestHost, forwardedProto, forwardedHost) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email credentials not configured.');
  }

  // "link" is the app deep link (fixlink://recovery?...) used to carry the
  // recovery token. Email clients strip custom-scheme links, so we point the
  // clickable button at a standard https:// landing page on the backend that
  // forwards the token into the app. The deep link is still shown as plain
  // text for users who cannot open it directly.
  const resolvedLink = link || '';
  const baseUrl = getPublicBaseUrl(requestHost, forwardedProto, forwardedHost);
  try {
    console.log(`[reset-email] landing host=${new URL(baseUrl).host} (auto-detected from request, no .env edit needed)`);
  } catch (_) {}
  const landingUrl = new URL('/reset-password', baseUrl);
  if (resolvedLink.startsWith('fixlink://')) {
    const query = resolvedLink.replace('fixlink://recovery?', '');
    query.split('&').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key && value) {
        try {
          landingUrl.searchParams.append(key, decodeURIComponent(value));
        } catch (_) {
          landingUrl.searchParams.append(key, value);
        }
      }
    });
  } else {
    landingUrl.searchParams.append('link', resolvedLink);
  }

  const landingUrlHref = String(landingUrl.toString()).replace(/&/g, '&amp;');

  // Minimal copy: heading, one-time/24h note, the button, a paste fallback, and
  // a short ignore line. Colors come from EMAIL_COLORS below.
  const mailOptions = {
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to,
    subject: 'Reset your FixLink password',
    html: `
      <div style="font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; color: ${EMAIL_COLORS.ink}; max-width: 440px;">
        <h2 style="margin: 0 0 8px; font-size: 18px;">Reset your FixLink password</h2>
        <p style="margin: 0 0 16px; color: ${EMAIL_COLORS.muted}; font-size: 13px;">This one-time link expires in 24 hours.</p>
        <p style="margin: 0 0 16px;">
          <a href="${landingUrlHref}" style="background: ${EMAIL_COLORS.brand}; color: ${EMAIL_COLORS.white}; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 12px; display: inline-block;">Reset password</a>
        </p>
        <p style="margin: 0 0 12px; font-size: 12px; color: ${EMAIL_COLORS.muted};">Or paste this link into your browser:<br><span style="word-break: break-all; color: ${EMAIL_COLORS.link};">${landingUrlHref}</span></p>
        <p style="margin: 0; font-size: 12px; color: ${EMAIL_COLORS.muted};">If you did not request this, ignore this email.</p>
      </div>
    `,
  };

  const transporter = await createTransporter();
  return withTimeout(transporter.sendMail(mailOptions), 15000, 'Email could not be delivered (SMTP timed out)');
};

// Escape values that came from the database or the admin form before they are
// interpolated into the email HTML.
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Sent when an admin approves a technician application. This is the email that
// tells the applicant they are now registered on the FixLink platform and can
// sign in, so it is only sent on the transition into 'active'.
const sendTechnicianApprovedEmail = async (to, name) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email credentials not configured.');
  }
  // Fail fast on a bad recipient instead of burning a 15s SMTP timeout.
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
    throw new Error('Recipient email address is invalid.');
  }

  const firstName = escapeHtml(String(name || '').trim().split(/\s+/)[0] || 'Technician');
  const registeredEmail = escapeHtml(to);

  const mailOptions = {
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to,
    subject: 'Your FixLink technician account is approved',
    html: `
      <div style="font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; color: ${EMAIL_COLORS.ink}; max-width: 440px;">
        <h2 style="margin: 0 0 8px; font-size: 18px;">You're approved, ${firstName}</h2>
        <p style="margin: 0 0 16px; color: ${EMAIL_COLORS.muted}; font-size: 13px;">Your FixLink technician application passed review.</p>
        <p style="margin: 0 0 14px;">You are now an <strong>active FixLink technician</strong>. Your account is registered and ready to accept repair jobs.</p>
        <div style="background: ${EMAIL_COLORS.infoBg}; border: 1px solid ${EMAIL_COLORS.infoBorder}; border-radius: 12px; padding: 14px; margin: 0 0 16px;">
          <p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: ${EMAIL_COLORS.infoText};">What happens next</p>
          <p style="margin: 0; font-size: 13px; color: ${EMAIL_COLORS.link}; line-height: 22px;">
            1. Open the FixLink app<br>
            2. Sign in as Technician with ${registeredEmail}<br>
            3. Turn on availability to receive repair leads
          </p>
        </div>
        <p style="margin: 0; font-size: 12px; color: ${EMAIL_COLORS.muted};">If you did not apply to be a FixLink technician, please ignore this email.</p>
      </div>
    `,
  };

  const transporter = await createTransporter();
  return withTimeout(transporter.sendMail(mailOptions), 15000, 'Email could not be delivered (SMTP timed out)');
};

module.exports = { sendPasswordResetEmail, sendTechnicianApprovedEmail };
