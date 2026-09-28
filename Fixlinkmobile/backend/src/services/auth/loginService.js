// Login service: POST /api/auth/login.
// Extracted verbatim from routes/auth.js. Takes plain arguments, returns the
// login payload, throws HttpError for expected client errors.

const { supabase, supabaseAuth } = require('../../config/supabase');
const { HttpError } = require('../../domain/httpError');

const login = async ({ email, password, expectedRole }) => {
  if (!email || !password) {
    throw new HttpError(400, { error: 'Missing email or password' });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: sanitizedEmail, password });

  if (error) {
    console.error('Supabase Login Error:', error.message);
    if (error.message && /invalid login credentials/i.test(error.message)) {
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

  if (userData.role === 'technician' && userData.status === 'rejected') {
    throw new HttpError(403, {
      error: `Your technician application was rejected${userData.rejection_reason ? `: ${userData.rejection_reason}` : '.'}`,
    });
  }

  return {
    message: 'Login successful',
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
