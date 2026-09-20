const { createClient } = require('@supabase/supabase-js');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_JWKS_URL) {
  console.error('[supabase] Missing SUPABASE_URL, SUPABASE_SECRET_KEY, or SUPABASE_JWKS_URL in backend/.env');
}

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

const remoteJWKS = SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(SUPABASE_JWKS_URL)) : null;

const verifyAccessToken = async (token) => {
  if (!remoteJWKS) throw new Error('SUPABASE_JWKS_URL is not configured');
  const { payload } = await jwtVerify(token, remoteJWKS, { algorithms: ['ES256', 'RS256'] });
  if (!payload.sub) throw new Error('Token has no subject');
  return payload;
};

module.exports = { supabase, supabaseAuth, verifyAccessToken };
