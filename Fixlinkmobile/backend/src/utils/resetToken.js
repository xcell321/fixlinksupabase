const crypto = require('crypto');

// How long a password-reset token stays valid (30 minutes).
const TOKEN_TTL_MS = 30 * 60 * 1000;

const toB64Url = (value) =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// One-way fingerprint of a reset token, stored in the database so we can
// detect replayed links without keeping the raw (usable) token anywhere.
const hashResetToken = (token) =>
  crypto
    .createHash('sha256')
    .update(`${token}:${process.env.RESET_TOKEN_SECRET || ''}`)
    .digest('hex');

// Creates a signed, short-lived token that carries the account uid + email so
// password resets never depend on Supabase-hosted recovery links.
const signResetToken = ({ uid, email }) => {
  const secret = process.env.RESET_TOKEN_SECRET;
  if (!secret) {
    throw new Error('RESET_TOKEN_SECRET is not configured.');
  }
  const header = toB64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toB64Url(JSON.stringify({ sub: uid, email, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payload}.${signature}`;
};

// Returns the decoded { sub, email, exp } when the token is valid and unexpired,
// otherwise null.
const verifyResetToken = (token) => {
  try {
    const secret = process.env.RESET_TOKEN_SECRET;
    if (!secret) return null;
    const [header, payload, signature] = String(token || '').split('.');
    if (!header || !payload || !signature) return null;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const actual = Buffer.from(signature || '', 'base64');
    const wanted = Buffer.from(expected, 'base64');
    if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || !data.email) return null;
    if (typeof data.exp !== 'number' || Date.now() > data.exp) return null;
    return data;
  } catch (_) {
    return null;
  }
};

module.exports = { signResetToken, verifyResetToken, hashResetToken, TOKEN_TTL_MS };