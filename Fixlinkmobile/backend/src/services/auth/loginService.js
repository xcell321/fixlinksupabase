// Login service: POST /api/auth/login.
// Extracted verbatim from routes/auth.js. Takes plain arguments, returns the
// login payload, throws HttpError for expected client errors.

const { supabase, supabaseAuth } = require('../../config/supabase');
const { HttpError } = require('../../domain/httpError');
const { requireLoginFace } = require('../../domain/loginFacePolicy');
const { verifyLoginFace } = require('./faceLoginService');

const login = async ({ email, password, expectedRole, faceFile }) => {
  if (!email || !password) {
    throw new HttpError(400, { error: 'Missing email or password' });
  }

  const sanitizedEmail = email.trim().toLowerCase();

  const statusMessage = (status) => {
    const state = String(status || '').toLowerCase();
    if (state === 'banned') return 'This account has been banned. Contact support for help.';
    if (state === 'suspended') return 'This account is suspended. Contact support for help.';
    if (state === 'inactive') return 'This account is deactivated. Contact support for help.';
    return null;
  };

  // Restricted states are resolved from the stored profile so a banned,
  // suspended, or deactivated account sees its real state instead of a
  // misleading credentials error (works for customer and technician roles).
  const lookupStatusMessage = async () => {
    try {
      const { data: row } = await supabase
        .from('users')
        .select('status')
        .eq('email', sanitizedEmail)
        .maybeSingle();
      return row ? statusMessage(row.status) : null;
    } catch {
      return null;
    }
  };

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: sanitizedEmail, password });

  if (error) {
    console.error('Supabase Login Error:', error.message);
    if (error.message && /invalid login credentials|user is banned|banned/i.test(error.message)) {
      const restricted = await lookupStatusMessage();
      if (restricted) throw new HttpError(403, { error: restricted });
      throw new HttpError(401, { error: 'Incorrect email or password.' });
    }
    if (error.message && /email not confirmed/i.test(error.message)) {
      throw new HttpError(401, { error: 'Please confirm your email before logging in.' });
    }
    throw new HttpError(401, { error: 'Unable to sign in. Please try again.' });
  }

  const { data: userData, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !userData) {
    throw new HttpError(404, { error: 'User profile not found in database' });
  }

  // Enforce role: customer cannot log in as technician and vice versa
  if (expectedRole && String(expectedRole).toLowerCase() !== String(userData.role).toLowerCase()) {
    const actual = String(userData.role).toLowerCase();
    if (actual === 'customer' && String(expectedRole).toLowerCase() === 'technician') {
      throw new HttpError(403, { error: 'This account is registered as a customer. Please use Customer login.' });
    }
    if (actual === 'technician' && String(expectedRole).toLowerCase() === 'customer') {
      throw new HttpError(403, { error: 'This account is registered as a technician. Please use Technician login.' });
    }
    throw new HttpError(403, { error: `Role mismatch: this account is a ${userData.role}.` });
  }

  // Check if technician account is still pending verification
  if (userData.role === 'technician' && userData.status === 'pending_verification') {
    throw new HttpError(403, { error: 'Your account is pending admin verification.' });
  }

  // Restricted states win over a successful sign-in so an admin ban or
  // suspension takes effect even when the auth record still accepts credentials.
  const restricted = statusMessage(userData.status);
  if (restricted) {
    throw new HttpError(403, { error: restricted });
  }

  if (userData.role === 'technician' && userData.status === 'rejected') {
    throw new HttpError(403, {
      error: `Your technician application was rejected${userData.rejection_reason ? `: ${userData.rejection_reason}` : '.'}`,
    });
  }

  // Optional face gate: a live selfie is compared against the face photo
  // stored at signup. Off by default so existing clients keep working. When on
  // and vision is unreachable, sign-in falls back to the password result
  // instead of locking the user out; only a positive mismatch blocks.
  let faceVerified = 'skipped';
  if (requireLoginFace()) {
    if (!faceFile || !Buffer.isBuffer(faceFile.buffer) || faceFile.buffer.length === 0) {
      throw new HttpError(400, { error: 'A live face photo is required to sign in. Take a selfie to continue.' });
    }
    const referenceUrl = userData.profile_image || userData.selfie_url;
    if (!referenceUrl) {
      console.warn(`Login face check skipped for ${userData.id}: no stored face photo.`);
    } else {
      const verdict = await verifyLoginFace({ referenceUrl, selfieFile: faceFile });
      if (!verdict.unavailable && !verdict.match) {
        throw new HttpError(401, { error: 'Face verification failed. The selfie does not match the face photo on this account.' });
      }
      if (!verdict.unavailable) faceVerified = true;
    }
  }

  return {
    message: 'Login successful',
    faceVerified,
    uid: data.user.id,
    role: userData.role,
    name: userData.name,
    email: userData.email,
    phone: userData.phone || '',
    address: userData.address || '',
    profileImage: userData.profile_image || null,
    status: userData.status,
    idToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
  };
};

module.exports = { login };
