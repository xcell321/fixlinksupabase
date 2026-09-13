const { createClient } = require('@supabase/supabase-js');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_JWKS_URL) {
  console.error('[supabase] Missing SUPABASE_URL, SUPABASE_SECRET_KEY, or SUPABASE_JWKS_URL in backend/.env');
}

// Service-level client (secret key). Bypasses RLS and unlocks auth.admin.*
// plus storage/RPC operations. NEVER signs users in, so its requests always
// run as the service role (otherwise a user session would attach the user JWT
// and hit RLS, which has no policies).
const supabase = createClient(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_SECRET_KEY || 'placeholder-secret-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Public client (publishable key) used ONLY for auth provider calls such as
// sign-in, sign-up, and OTP verification. It never touches the Postgres tables.
const supabaseAuth = createClient(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_PUBLISHABLE_KEY || 'placeholder-publishable-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const STORAGE_BUCKET = 'fixlink';

const publicStorageUrl = (bucket, path) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(path)}` : null;

// Upload a buffer to Supabase Storage and return its public URL.
const uploadBuffer = async ({ folder, file, buffer, contentType }) => {
  const ext = file.originalname ? String(file.originalname).split('.').pop().toLowerCase().replace(/[^a-z0-9]/gi, '') : '';
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(key, buffer, { contentType: contentType || file.mimetype || 'application/octet-stream', upsert: true });
  if (error) throw error;
  return publicStorageUrl(STORAGE_BUCKET, key);
};

const storageUrl = (key) => publicStorageUrl(STORAGE_BUCKET, key);

// Remote JWK Set fetched from the project's JWKS endpoint. Keys are cached and
// refreshed by `jose` as needed, so this is created once at module load.
const remoteJWKS = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null;

// Verifies a Supabase access_token (signed JWT) using the project's JWKS.
// New Supabase projects sign with ES256, so HS256/JWT-secret verification is obsolete.
const verifyAccessToken = async (token) => {
  if (!remoteJWKS) throw new Error('SUPABASE_JWKS_URL is not configured');
  const { payload } = await jwtVerify(token, remoteJWKS, { algorithms: ['ES256', 'RS256'] });
  if (!payload.sub) throw new Error('Token has no subject');
  return payload;
};

module.exports = { supabase, supabaseAuth, verifyAccessToken, publicStorageUrl, uploadBuffer, storageUrl, STORAGE_BUCKET };