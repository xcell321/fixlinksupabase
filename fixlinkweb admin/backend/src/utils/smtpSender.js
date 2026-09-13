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
  let host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const tls = {};
  try {
    const { address } = await lookup(host);
    host = address;
    tls.servername = process.env.SMTP_HOST || 'smtp.gmail.com';
  } catch (_) {
    /* keep using the hostname as-is */
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: String(process.env.SMTP_PASSWORD || '').replace(/\s+/g, '')
    },
    tls,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

async function sendMail({ to, subject, text, html }) {
  const from = `FixLink Support <${process.env.SMTP_USER}>`;
  const transporter = await createTransporter();
  return withTimeout(
    transporter.sendMail({ from, to, subject, text, html }),
    15000,
    'Email could not be delivered (SMTP timed out)'
  );
}

module.exports = { sendMail };