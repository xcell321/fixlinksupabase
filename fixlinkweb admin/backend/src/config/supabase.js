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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Resends a GET/HEAD request once when PostgREST rejects an internally-minted
// service token with PGRST303 ("JWT issued at future"). This is a known
// Supabase platform-side clock-drift issue between the API gateway and
// PostgREST: the identical request succeeds immediately on retry. Writes are
// never resent to avoid duplicate side effects.
async function fetchWithRetry(input, init) {
  const isSafeToRetry = init && ['GET', 'HEAD'].includes(String(init.method || 'GET').toUpperCase());
  const attempt = () => global.fetch(input, init);

  let response = await attempt();
  if (isSafeToRetry && response && response.status === 401) {
    let bodyText = '';
    try { bodyText = await response.clone().text(); } catch (_) {}
    if (bodyText.includes('PGRST303')) {
      await sleep(350);
      response = await attempt();
    }
  }
  return response;
}

// Service-level client (secret key). Bypasses RLS and unlocks auth.admin.*
// plus storage/RPC operations. NEVER signs users in so its requests always
// run as the service role.
const supabase = createClient(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_SECRET_KEY || 'placeholder-secret-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithRetry,
    },
  }
);

// Public client (publishable key) used ONLY for auth provider calls such as
// sign-in and sign-up. It never touches the Postgres tables.
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

const uploadBuffer = async ({ folder, file, buffer, contentType }) => {
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}-${file.originalname}`;
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