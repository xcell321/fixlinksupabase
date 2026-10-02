// Daily request cap (UAT #6): at most `MAX_REQUESTS_PER_DAY` job requests per
// customer per calendar day.
//
// Nothing here is hardcoded. The ceiling, the UTC offset used to decide which
// calendar day "today" is (the app runs in the Philippines, UTC+8), and the
// statuses that free a slot back up all come from the environment. The
// constants below are only fallbacks so a local run with an empty .env still
// behaves sensibly.

const DEFAULT_MAX_REQUESTS_PER_DAY = 3;
const DEFAULT_UTC_OFFSET_HOURS = 8;
const DEFAULT_FREE_STATUSES = 'cancelled,canceled';

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const maxDailyRequests = () => asInt(process.env.MAX_REQUESTS_PER_DAY, DEFAULT_MAX_REQUESTS_PER_DAY);

const utcOffsetHours = () => {
  const parsed = Number(process.env.DAILY_LIMIT_UTC_OFFSET_HOURS);
  return Number.isFinite(parsed) ? parsed : DEFAULT_UTC_OFFSET_HOURS;
};

// A cancelled request should not keep the customer locked out for the rest of
// the day, so these statuses are excluded from the count.
const freeStatuses = () => String(process.env.DAILY_LIMIT_FREE_STATUSES || DEFAULT_FREE_STATUSES)
  .split(',')
  .map((status) => status.trim().toLowerCase())
  .filter(Boolean);

const countsTowardLimit = (job) => !freeStatuses().includes(String(job?.status || '').toLowerCase());

// Calendar-day key in the configured offset, so "today" matches the customer's
// local midnight rather than UTC midnight.
const dayKey = (value, offsetHours = utcOffsetHours()) => {
  const time = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(time)) return null;
  const shifted = new Date(time + offsetHours * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`;
};

const countToday = (jobs, now = new Date(), offsetHours = utcOffsetHours()) => {
  const today = dayKey(now instanceof Date ? now : new Date(now), offsetHours);
  return (Array.isArray(jobs) ? jobs : [])
    .filter(countsTowardLimit)
    .filter((job) => dayKey(job.created_at, offsetHours) === today)
    .length;
};

// True when the customer has already used up today's allowance, i.e. the next
// submit must be rejected.
const overDailyLimit = (jobs, now = new Date()) => countToday(jobs, now) >= maxDailyRequests();

module.exports = {
  maxDailyRequests,
  utcOffsetHours,
  freeStatuses,
  countsTowardLimit,
  countToday,
  overDailyLimit,
};
