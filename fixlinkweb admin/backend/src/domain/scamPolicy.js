// Scam-strike policy (UAT #8): when a user accumulates `SCAM_STRIKE_THRESHOLD`
// resolved reports, the admin resolve action auto-suspends the account.
//
// Env-driven so the threshold can be tuned without a code change; 3 is only a
// fallback for an empty environment.

const DEFAULT_SCAM_STRIKE_THRESHOLD = 3;

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const scamStrikeThreshold = () => asInt(process.env.SCAM_STRIKE_THRESHOLD, DEFAULT_SCAM_STRIKE_THRESHOLD);

const shouldAutoSuspend = (resolvedCount) => Number(resolvedCount) >= scamStrikeThreshold();

module.exports = { scamStrikeThreshold, shouldAutoSuspend };
