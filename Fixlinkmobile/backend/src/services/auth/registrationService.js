// Registration service: POST /api/auth/register.
// Extracted verbatim from routes/auth.js, including the orphan-auth-user
// self-heal loop and technician document uploads. Behavior is unchanged.

const { supabase, uploadBuffer } = require('../../config/supabase');
const { resolveCoordinates } = require('../geocodeService');
const { withTimeout } = require('../../utils/async');
const { HttpError } = require('../../domain/httpError');

const registerUser = async ({ body, files }) => {
  const { email, password, role, name, skills, phone, address, bio, yearsExperience, governmentIdNumber, latitude, longitude } = body || {};

  const providedLatitude = Number(latitude);
  const providedLongitude = Number(longitude);
  const hasProvidedCoords = Number.isFinite(providedLatitude) && Number.isFinite(providedLongitude)
    && providedLatitude >= -90 && providedLatitude <= 90
    && providedLongitude >= -180 && providedLongitude <= 180;

  if (!email || !password || !role || !name) {
    throw new HttpError(400, { error: 'Missing required fields (email, password, role, name)' });
  }

  // Supabase only enforces a 6-character minimum, so the 8-character policy for
  // FixLink accounts is enforced here before any auth user is created.
  if (String(password).length < 8) {
    throw new HttpError(400, { error: 'Password must be at least 8 characters.' });
  }

  const sanitizedEmail = email.trim().toLowerCase();

  const verificationFiles = files || {};
  if (role === 'technician' && (!verificationFiles.governmentIdFile?.[0] || !verificationFiles.certificateFile?.[0])) {
    throw new HttpError(400, { error: 'Both a government ID file and a certificate file are required.' });
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
        throw new HttpError(409, { error: 'This email is already registered. Please log in instead.' });
      }
      throw new HttpError(500, { error: 'Unable to create the account. Please try again.' });
    }
  }
  if (!signUpData.user || !signUpData.user.id) {
    throw new HttpError(500, { error: 'Unable to create the account. Please try again.' });
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
    created_at: new Date().toISOString(),
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
      throw new HttpError(400, { error: `Document upload failed: ${uploadError.message}. Please try again with a valid file.` });
    }
  }

  const { error: insertError } = await supabase.from('users').insert(userData);
  if (insertError) {
    await supabase.auth.admin.deleteUser(uid);
    throw new HttpError(500, { error: `Failed to save user profile: ${insertError.message}` });
  }

  if (role === 'customer') {
    return {
      status: 201,
      body: { message: 'Account created successfully. You can now log in.', uid, status: initialStatus },
    };
  }

  return {
    status: 201,
    body: {
      message: 'User registered successfully',
      uid,
      status: initialStatus,
      credentialsUploaded: Boolean(userData.government_id_file_url && userData.certificate_file_url),
    },
  };
};

module.exports = { registerUser };
