const dns = require('dns');
const { promisify } = require('util');
const nodemailer = require('nodemailer');

const lookup = promisify(dns.lookup);

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

async function createTransporter() {
  let host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_PORT) || 587;
  const tls = {};
  try {
    const { address } = await lookup(host);
    host = address;
    tls.servername = process.env.EMAIL_HOST || 'smtp.gmail.com';
  } catch (_) {
    /* keep using the hostname as-is */
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
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

const sendPasswordResetEmail = async (to, link, requestHost) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email credentials not configured.');
  }

  // "link" is the app deep link (fixlink://recovery?...) used to carry the
  // recovery token. Email clients strip custom-scheme links, so we point the
  // clickable button at a standard https:// landing page on the backend that
  // forwards the token into the app. The deep link is still shown as plain
  // text for users who cannot open it directly.
  const resolvedLink = link || '';
  const baseUrl = requestHost
    ? `http://${requestHost}`
    : (process.env.PUBLIC_BASE_URL || 'http://localhost:5050');
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

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"FixLink Support" <noreply@fixlink.com>',
    to,
    subject: 'FixLink Password Reset',
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested a password reset for your FixLink account.</p>
      <p style="margin: 20px 0;">
        <a href="${landingUrlHref}" style="background:#0F766E;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;display:inline-block;">Reset my FixLink password</a>
      </p>
      <p style="font-size:12px;color:#5A7A91;">If the link above does not open the reset page, copy this entire link into your browser (make sure it is not cut off):<br><span style="word-break:break-all;">${landingUrlHref}</span></p>
      <p>If you did not request this, please ignore this email.</p>
      <p>Best regards,<br>The FixLink Team</p>
    `,
  };

  const transporter = await createTransporter();
  return withTimeout(transporter.sendMail(mailOptions), 15000, 'Email could not be delivered (SMTP timed out)');
};

module.exports = { sendPasswordResetEmail };