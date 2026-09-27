const express = require('express');
const multer = require('multer');
const router = express.Router();
const { supabase, supabaseAuth, uploadBuffer } = require('../config/supabase');
const { sendPasswordResetEmail } = require('../utils/emailService');
const { signResetToken, verifyResetToken, hashResetToken, TOKEN_TTL_MS } = require('../utils/resetToken');
const { resolveCoordinates } = require('../utils/geocode');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
    const dotIndex = file.originalname.lastIndexOf('.');
    const extension = dotIndex >= 0 ? file.originalname.slice(dotIndex).toLowerCase() : '';
    // Rejecting with an error (instead of a silent false) matters: a silent
    // drop makes the route report both files as missing even though the user
    // attached them, which hides the real problem (wrong file type).
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(extension)) {
      callback(null, true);
    } else {
      callback(new Error(`UNSUPPORTED_FILE_TYPE:${file.fieldname || 'document'}`));
    }
  }
});

// Multer errors default to an HTML 500 page, which the app cannot display.
// Convert them to JSON so the register screen always shows a readable message
// instead of spinning with no result.
const registerUpload = upload.fields([
  { name: 'governmentIdFile', maxCount: 1 },
  { name: 'certificateFile', maxCount: 1 }
]);

const handleUploadErrors = (req, res, next) => {
  registerUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Each document must be 10MB or smaller. Please use a smaller file.' });
      }
      if (String(err.message || '').startsWith('UNSUPPORTED_FILE_TYPE')) {
        return res.status(400).json({ error: 'Verification documents must be JPG, PNG, or PDF. Please pick a different file.' });
      }
      return res.status(400).json({ error: 'Document upload failed. Use JPG, PNG, or PDF files.' });
    }
    next();
  });
};

// Bounds any promise that has no built-in timeout (Supabase storage writes can
// hang on slow networks). The spinner on the register screen always resolves
// because the request can never hang forever.
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

// POST: Login user - enforces role: customer cannot log in as technician and vice versa
router.post('/login', async (req, res) => {
  try {
    const { email, password, expectedRole } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: sanitizedEmail, password });

    if (error) {
      console.error('Supabase Login Error:', error.message);
      if (error.message && /invalid login credentials/i.test(error.message)) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
      }
      if (error.message && /email not confirmed/i.test(error.message)) {
        return res.status(401).json({ error: 'Please confirm your email before logging in.' });
      }
      return res.status(401).json({ error: 'Unable to sign in. Please try again.' });
    }

    const { data: userData, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !userData) {
      return res.status(404).json({ error: 'User profile not found in database' });
    }

    // Enforce role: customer cannot log in as technician and vice versa
    if (expectedRole && String(expectedRole).toLowerCase() !== String(userData.role).toLowerCase()) {
      const actual = String(userData.role).toLowerCase();
      if (actual === 'customer' && String(expectedRole).toLowerCase() === 'technician') {
        return res.status(403).json({ error: 'This account is registered as a customer. Please use Customer login.' });
      }
      if (actual === 'technician' && String(expectedRole).toLowerCase() === 'customer') {
        return res.status(403).json({ error: 'This account is registered as a technician. Please use Technician login.' });
      }
      return res.status(403).json({ error: `Role mismatch: this account is a ${userData.role}.` });
    }

    // Check if technician account is still pending verification
    if (userData.role === 'technician' && userData.status === 'pending_verification') {
      return res.status(403).json({ error: 'Your account is pending admin verification.' });
    }

    if (userData.role === 'technician' && userData.status === 'rejected') {
      return res.status(403).json({ error: `Your technician application was rejected${userData.rejection_reason ? `: ${userData.rejection_reason}` : '.'}` });
    }

    res.status(200).json({
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
      expiresIn: data.session.expires_in
    });

  } catch (error) {
    console.error('Login error details:', error.message);
    res.status(500).json({ error: 'Server error during login. Please try again later.' });
  }
});

// POST: Register a new user (Customer or Technician)
router.post('/register', handleUploadErrors, async (req, res) => {
  try {
    const { email, password, role, name, skills, phone, address, bio, yearsExperience, governmentIdNumber, latitude, longitude } = req.body || {};

    const providedLatitude = Number(latitude);
    const providedLongitude = Number(longitude);
    const hasProvidedCoords = Number.isFinite(providedLatitude) && Number.isFinite(providedLongitude)
      && providedLatitude >= -90 && providedLatitude <= 90
      && providedLongitude >= -180 && providedLongitude <= 180;

    if (!email || !password || !role || !name) {
      return res.status(400).json({ error: 'Missing required fields (email, password, role, name)' });
    }

    const sanitizedEmail = email.trim().toLowerCase();

    const verificationFiles = req.files || {};
    if (role === 'technician' && (!verificationFiles.governmentIdFile?.[0] || !verificationFiles.certificateFile?.[0])) {
      return res.status(400).json({ error: 'Both a government ID file and a certificate file are required.' });
    }

    // 1. Create user in Supabase Auth (service role -> confirmed immediately, no confirmation email needed)
    const createAuthUser = () => withTimeout(supabase.auth.admin.createUser({
      email: sanitizedEmail,
      password,
      email_confirm: true,
      user_metadata: { displayName: name },
    }), 30000, 'Account creation timed out. Please try again.');

    let { data: signUpData, error: signUpError } = await createAuthUser();

    if (signUpError) {
      console.error('Registration error:', signUpError.message);

      if (/user_already_exists|already been registered|already registered/i.test(String(signUpError.message))) {
        // Self-heal: the email exists in Supabase Auth, but it may be an ORPHAN left
        // behind by a previous failed/partial registration (auth user with no profile
        // row). If no profile exists, delete the stale auth user and retry so the
        // person can register normally instead of being stuck on "already registered".
        const { data: existingProfile } = await supabase
          .from('users')
          .select('id')
          .eq('email', sanitizedEmail)
          .maybeSingle();

        if (!existingProfile) {
          let orphan = null;
          let page = 1;
          for (;;) {
            const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
            orphan = (data?.users || []).find((u) => (u.email || '').toLowerCase() === sanitizedEmail) || null;
            if (orphan || (data?.users || []).length < 200) break;
            page += 1;
          }
          if (orphan) {
            const { error: deleteError } = await supabase.auth.admin.deleteUser(orphan.id);
            if (!deleteError) {
              console.log(`[register] Removed orphaned auth user for ${sanitizedEmail} — retrying registration.`);
              const retry = await createAuthUser();
              signUpData = retry.data;
              signUpError = retry.error;
            }
          }
        }
      }

      if (signUpError) {
        if (/user_already_exists|already been registered|already registered/i.test(String(signUpError.message))) {
          return res.status(409).json({ error: 'This email is already registered. Please log in instead.' });
        }
        return res.status(500).json({ error: 'Unable to create the account. Please try again.' });
      }
    }
    if (!signUpData.user || !signUpData.user.id) {
      return res.status(500).json({ error: 'Unable to create the account. Please try again.' });
    }

    const uid = signUpData.user.id;

    // 2. Determine initial status based on role (Technicians require admin verification)
    const initialStatus = role === 'technician' ? 'pending_verification' : 'active';

    // 3. Save extended profile details in Postgres using Auth UID as the primary key
    const userData = {
      id: uid,
      name,
      email: sanitizedEmail,
      role, // 'customer', 'technician', or 'admin'
      status: initialStatus,
      created_at: new Date().toISOString()
    };

    if (phone) userData.phone = String(phone).trim();
    if (address) userData.address = String(address).trim();
    if (bio) userData.bio = String(bio).trim();

    if (role === 'technician') {
      userData.skills = skills ? String(skills).split(',').map((skill) => skill.trim()).filter(Boolean) : [];
      userData.years_experience = Number(yearsExperience) || 0;
      userData.government_id_number = governmentIdNumber?.trim();
      userData.verification_status = 'pending';

      if (hasProvidedCoords) {
        userData.latitude = providedLatitude;
        userData.longitude = providedLongitude;
      } else if (userData.address) {
        try {
          const coords = await resolveCoordinates(userData.address);
          if (coords) {
            userData.latitude = coords.latitude;
            userData.longitude = coords.longitude;
          }
        } catch (error) {
          console.error('Geocoding failed for technician address:', error.message);
        }
      }

      try {
        if (verificationFiles.governmentIdFile?.[0]) {
          userData.government_id_file_url = await withTimeout(uploadBuffer({
            folder: 'technician-documents',
            file: verificationFiles.governmentIdFile[0],
            buffer: verificationFiles.governmentIdFile[0].buffer,
            contentType: verificationFiles.governmentIdFile[0].mimetype,
          }), 45000, 'Government ID upload timed out. Please try again with a smaller file.');
        }
        if (verificationFiles.certificateFile?.[0]) {
          userData.certificate_file_url = await withTimeout(uploadBuffer({
            folder: 'technician-documents',
            file: verificationFiles.certificateFile[0],
            buffer: verificationFiles.certificateFile[0].buffer,
            contentType: verificationFiles.certificateFile[0].mimetype,
          }), 45000, 'Certificate upload timed out. Please try again with a smaller file.');
        }
      } catch (uploadError) {
        console.error('Document upload failed:', uploadError.message);
        await supabase.auth.admin.deleteUser(uid);
        return res.status(400).json({ error: `Document upload failed: ${uploadError.message}. Please try again with a valid file.` });
      }
    }

const { error: insertError } = await supabase.from('users').insert(userData);
    if (insertError) {
      await supabase.auth.admin.deleteUser(uid);
      return res.status(500).json({ error: `Failed to save user profile: ${insertError.message}` });
    }

    if (role === 'customer') {
      return res.status(201).json({
        message: 'Account created successfully. You can now log in.',
        uid,
        status: initialStatus,
      });
    }

    res.status(201).json({
      message: 'User registered successfully',
      uid,
      status: initialStatus,
      credentialsUploaded: Boolean(userData.government_id_file_url && userData.certificate_file_url),
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST: Request password reset
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const sanitizedEmail = String(email || '').trim().toLowerCase();
  if (!sanitizedEmail) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  try {
    // Always return the same message so we don't reveal which emails exist.
    const respond = () => res.status(200).json({ message: 'Password reset link sent to your email.' });

    // 1. Find the auth user by email.
    const { data: profile } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', sanitizedEmail)
      .maybeSingle();
    let uid = profile?.id || null;

    if (!uid) {
      const { data: allUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 5000 });
      const match = (allUsers?.users || []).find(
        (u) => String(u.email || '').trim().toLowerCase() === sanitizedEmail
      );
      uid = match?.id || null;
    }

    if (!uid) {
      return respond(); // Unknown email — no reset email is sent.
    }

    // 2. Build a short-lived, signed recovery token (no Supabase redirect needed).
    const token = signResetToken({ uid, email: sanitizedEmail });

    // 3. Record the token (as a fingerprint) so it can only be redeemed once.
    // Any previously issued, still-unused reset links for this account are discarded.
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const { error: purgeError } = await supabase
      .from('password_resets')
      .delete()
      .eq('user_id', uid)
      .is('used_at', null);
    const { error: insertError } = await supabase.from('password_resets').insert({
      user_id: uid,
      token_hash: hashResetToken(token),
      expires_at: expiresAt,
    });
    if (purgeError || insertError) {
      console.error('Unable to record password reset token:', {
        purge: purgeError?.message,
        insert: insertError?.message,
      });
      return res.status(500).json({ error: 'Unable to send reset link.' });
    }

    const query = new URLSearchParams();
    query.set('uid', uid);
    query.set('email', sanitizedEmail);
    query.set('token', token);
    const deepLink = `fixlink://recovery?${query.toString()}`;

    sendPasswordResetEmail(
      sanitizedEmail,
      deepLink,
      req.headers?.host,
      req.headers?.['x-forwarded-proto'],
      req.headers?.['x-forwarded-host'],
    ).catch((err) =>
      console.error('Failed to send reset email:', err)
    );

    return respond();
  } catch (error) {
    console.error('Error generating/sending reset link:', error);
    return res.status(500).json({ error: 'Unable to send reset link.', details: error.message });
  }
});

// POST: Complete password reset using the token delivered in the recovery link
router.post('/reset-password', async (req, res) => {
  const { uid, email, token, newPassword } = req.body || {};

  try {
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const payload = verifyResetToken(token);
    if (!payload) {
      return res.status(400).json({ error: 'The password reset link is invalid or has expired.' });
    }

    // The token is bound to the account uid + email from the link.
    const matchesUid = uid && payload.sub === uid;
    const matchesEmail = !email || payload.email === String(email).trim().toLowerCase();
    if (!matchesUid || !matchesEmail) {
      return res.status(400).json({ error: 'The password reset link is invalid or has expired.' });
    }

    // 1. Claim the recorded token atomically. The row is matched on the stored
    // fingerprint and requires it to be unused and unexpired — a row that is
    // already used (or absent) makes the whole link invalid, so a link that
    // worked once can never be replayed.
    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from('password_resets')
      .update({ used_at: nowIso })
      .eq('token_hash', hashResetToken(token))
      .eq('user_id', payload.sub)
      .gt('expires_at', nowIso)
      .is('used_at', null)
      .select('id')
      .maybeSingle();

    if (claimError) {
      console.error('Unable to claim password reset token:', claimError.message);
      return res.status(500).json({ error: 'Unable to reset password. Please try again.' });
    }
    if (!claimed) {
      return res.status(400).json({ error: 'The password reset link has already been used or has expired.' });
    }

    // 2. Apply the new password. The link is already burned at this point, so a
    // failed password write cannot be retried with the same link.
    const { error } = await supabase.auth.admin.updateUserById(payload.sub, {
      password: String(newPassword),
    });
    if (error) {
      console.error('Supabase password update error:', error.message);
      return res.status(400).json({ error: `Unable to update password: ${error.message}` });
    }
    return res.status(200).json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    return res.status(500).json({ error: 'Unable to reset password. Please try again.' });
  }
});

module.exports = router;