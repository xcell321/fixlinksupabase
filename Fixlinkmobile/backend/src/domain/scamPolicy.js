// Repeat-scammer policy (UAT #8): when a customer accumulates
// `CUSTOMER_SCAM_LIMIT` upheld scam reports, the account is auto-suspended.
//
// Env-driven: CUSTOMER_SCAM_LIMIT, CUSTOMER_SCAM_AUTO_SUSPEND. The defaults
// exist only so an empty .env still behaves sensibly.

const DEFAULT_CUSTOMER_SCAM_LIMIT = 3;

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const customerScamLimit = () => asInt(process.env.CUSTOMER_SCAM_LIMIT, DEFAULT_CUSTOMER_SCAM_LIMIT);

const DEFAULT_SCAM_AUTO_SUSPEND = 'true';

const autoSuspendEnabled = () =>
  String(process.env.CUSTOMER_SCAM_AUTO_SUSPEND ?? DEFAULT_SCAM_AUTO_SUSPEND).toLowerCase() !== 'false';

// `count` is the user's running total of upheld scam reports after the one just
// filed. Auto-suspend fires once it reaches the configured limit.
const shouldAutoSuspend = (count) => autoSuspendEnabled() && Number(count) >= customerScamLimit();

module.exports = {
  customerScamLimit,
  autoSuspendEnabled,
  shouldAutoSuspend,
};
