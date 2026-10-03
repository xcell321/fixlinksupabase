// Login face gate policy: a live selfie is compared against the stored face
// photo at sign-in when REQUIRE_LOGIN_FACE=true.
//
// Everything is env-driven. The constants below are only fallbacks so a local
// run with an empty .env still behaves sensibly, which is what the
// "nothing is hardcoded" rule means here.

const DEFAULTS = {
  requireLoginFace: false,
  matchThreshold: 0.5,
};

const asBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

// Off unless explicitly enabled, so existing password logins, tests, and
// clients that send no photo keep working untouched.
const requireLoginFace = () => asBool(process.env.REQUIRE_LOGIN_FACE, DEFAULTS.requireLoginFace);

// Minimum face similarity that passes, sharing the signup scale default.
const loginFaceMatchThreshold = () => {
  const parsed = Number.parseFloat(process.env.LOGIN_FACE_MATCH_THRESHOLD);
  return Number.isFinite(parsed) ? parsed : DEFAULTS.matchThreshold;
};

module.exports = {
  DEFAULTS,
  requireLoginFace,
  loginFaceMatchThreshold,
};
