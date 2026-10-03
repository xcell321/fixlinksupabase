// Rating rules (UAT #11): the accepted score band and which roles are allowed
// to leave a rating. Both sides rate each other, so a technician rating a
// customer and a customer rating a technician share these rules.
//
// Env-driven: RATING_MIN, RATING_MAX, REVIEWER_ROLES. The defaults are only a
// fallback so an empty .env still works.

const DEFAULT_MIN = 1;
const DEFAULT_MAX = 5;
const DEFAULT_REVIEWER_ROLES = 'customer,technician';

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const minRating = () => asInt(process.env.RATING_MIN, DEFAULT_MIN);
const maxRating = () => asInt(process.env.RATING_MAX, DEFAULT_MAX);

const isValidRating = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= minRating() && numeric <= maxRating();
};

const reviewerRoles = () => String(process.env.REVIEWER_ROLES || DEFAULT_REVIEWER_ROLES)
  .split(',')
  .map((role) => role.trim().toLowerCase())
  .filter(Boolean);

const canReview = (role) => reviewerRoles().includes(String(role || '').toLowerCase());

const ratingRangeLabel = () => `${minRating()} to ${maxRating()}`;

// --- Negative-rating reputation policy (UAT #11) ---------------------------
// The requirement is explicit: "multiple negative -> auto-suspend customer".
// A rating at or below NEGATIVE_RATING_MAX counts as negative, and reaching
// CUSTOMER_NEGATIVE_RATING_LIMIT of them suspends the customer, unless the
// whole rule is switched off with CUSTOMER_NEGATIVE_RATING_AUTO_SUSPEND=false.
const DEFAULT_NEGATIVE_MAX = 2;
const DEFAULT_NEGATIVE_LIMIT = 3;

const negativeRatingMax = () => asInt(process.env.NEGATIVE_RATING_MAX, DEFAULT_NEGATIVE_MAX);
const negativeRatingLimit = () => asInt(process.env.CUSTOMER_NEGATIVE_RATING_LIMIT, DEFAULT_NEGATIVE_LIMIT);

const isNegativeRating = (rating) => {
  const numeric = Number(rating);
  return Number.isFinite(numeric) && numeric <= negativeRatingMax();
};

const DEFAULT_NEGATIVE_AUTO_SUSPEND = 'true';

const autoSuspendOnNegativeRatingsEnabled = () =>
  String(process.env.CUSTOMER_NEGATIVE_RATING_AUTO_SUSPEND ?? DEFAULT_NEGATIVE_AUTO_SUSPEND)
    .toLowerCase() !== 'false';

const shouldSuspendForNegativeRatings = (count) =>
  autoSuspendOnNegativeRatingsEnabled() && Number(count) >= negativeRatingLimit();

const ratingRangeLabelFinal = ratingRangeLabel;

module.exports = {
  minRating,
  maxRating,
  isValidRating,
  reviewerRoles,
  canReview,
  ratingRangeLabel,
  negativeRatingMax,
  negativeRatingLimit,
  isNegativeRating,
  autoSuspendOnNegativeRatingsEnabled,
  shouldSuspendForNegativeRatings,
};
