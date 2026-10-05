// Login face gate policy: a live selfie is compared against the stored face
// photo at sign-in when REQUIRE_LOGIN_FACE=true.
//
// Everything is env-driven. The constants below are only fallbacks so a local
// run with an empty .env still behaves sensibly, which is what the
// "nothing is hardcoded" rule means here.

const DEFAULTS = {
  requireLoginFace: false,
  // Full-judge bar, set from the measured live split (same 0.98, other 0.25).
  matchThreshold: 0.7,
  // Fallback-judge bar: the lite model scores generously (a wrong face once
  // read 0.85 while true faces read 0.98+), so its verdicts face a higher bar.
  liteMatchThreshold: 0.95,
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

// Higher bar applied only when the verdict came from the fallback lite
// judge, whose scores run hot on strangers.
const loginFaceLiteThreshold = () => {
  const parsed = Number.parseFloat(process.env.LOGIN_FACE_LITE_THRESHOLD);
  return Number.isFinite(parsed) ? parsed : DEFAULTS.liteMatchThreshold;
};

module.exports = {
  DEFAULTS,
  requireLoginFace,
  loginFaceMatchThreshold,
  loginFaceLiteThreshold,
};
