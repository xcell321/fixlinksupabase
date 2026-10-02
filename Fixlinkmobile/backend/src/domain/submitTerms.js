// Booking-regulation gate (UAT #4).
//
// The customer must accept the booking regulations — the 1-day rule, the
// 5-hour rule and the same-day charge — before the app reveals the location
// step. The app gates step 3 -> step 4 with a modal; this module is the same
// rule enforced server-side, so a client that skips the modal cannot create a
// booking either.
//
// Nothing here is hardcoded: the switch, the version stamp and the rejection
// wording all come from the environment. The literals below are only fallbacks
// for a local run with an empty .env.

const DEFAULT_TERMS_VERSION = '2026-10-01';

const asBool = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

// On by default: letting a booking through without an explicit agreement has to
// be a deliberate, configured choice — never an accident.
const isTermsRequired = () => asBool(process.env.SUBMIT_TERMS_REQUIRED, true);

const termsVersion = () => String(process.env.SUBMIT_TERMS_VERSION || DEFAULT_TERMS_VERSION).trim();

// The app posts multipart form data, so the flag arrives as a string. Accept
// every spelling a form or a JSON client may send.
const TRUTHY_VALUES = ['true', '1', 'yes', 'on', 'accepted', 'agreed'];

const asAccepted = (value) => {
  if (value === true) return true;
  if (value === false || value === undefined || value === null) return false;
  return TRUTHY_VALUES.includes(String(value).trim().toLowerCase());
};

// Reads either casing, so the gate cannot be side-stepped by a client using the
// snake_case spelling of the same field.
const hasAcceptedTerms = (body = {}) => asAccepted(body.termsAccepted) || asAccepted(body.terms_accepted);

const rejectionMessage = () => String(
  process.env.SUBMIT_TERMS_REJECTION
    || 'You must accept the booking regulations before submitting a repair request.'
).trim();

// Returns { ok, reason }. A failed check is a hard validation error (400).
const verifyTerms = (body = {}) => {
  if (!isTermsRequired()) return { ok: true, reason: null };
  if (hasAcceptedTerms(body)) return { ok: true, reason: null };
  return { ok: false, reason: rejectionMessage() };
};

module.exports = {
  isTermsRequired,
  termsVersion,
  hasAcceptedTerms,
  verifyTerms,
  TRUTHY_VALUES,
};
