// Auto-suspend policy (UAT #2).
//
// The customer is the account that gets suspended in both cases the requirement
// describes:
//
//   1. the customer cancels a booking after the technician has already arrived
//      at the service location, and
//   2. the customer is not there when the technician shows up, and the
//      technician reports the no-show after waiting the grace window
//      (30 minutes to 1 hour).
//
// Every number is env-driven; the DEFAULT_* values exist only so an empty .env
// still behaves exactly like the requirement describes.
//
// Env:
//   CUSTOMER_NOSHOW_WAIT_MINUTES       how long the technician must wait at the
//                                      location before a customer no-show
//                                      counts. Clamped to 30..60 (default 60).
//   CUSTOMER_NOSHOW_LIMIT              reported no-shows before suspension (1).
//   CUSTOMER_NOSHOW_AUTO_SUSPEND       toggle the no-show rule (true).
//   CUSTOMER_LATE_CANCEL_LIMIT         cancels after arrival before suspension (1).
//   CUSTOMER_LATE_CANCEL_AUTO_SUSPEND  toggle the late-cancel rule (true).

const DEFAULT_WAIT_MINUTES = 60;
const MIN_WAIT_MINUTES = 30;
const MAX_WAIT_MINUTES = 60;
const DEFAULT_NO_SHOW_LIMIT = 1;
const DEFAULT_LATE_CANCEL_LIMIT = 1;
const MIN_SUSPEND_LIMIT = 1;
const DEFAULT_NO_SHOW_AUTO_SUSPEND = true;
const DEFAULT_LATE_CANCEL_AUTO_SUSPEND = true;

const MS_PER_MINUTE = 60 * 1000;

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() !== 'false';
};

// The requirement fixes the window at 30 minutes to 1 hour, so a value outside
// that band is clamped instead of silently disabling the rule.
const customerNoShowWaitMinutes = () => {
  const raw = asInt(process.env.CUSTOMER_NOSHOW_WAIT_MINUTES, DEFAULT_WAIT_MINUTES);
  return Math.min(Math.max(raw, MIN_WAIT_MINUTES), MAX_WAIT_MINUTES);
};

const customerNoShowWaitMs = () => customerNoShowWaitMinutes() * MS_PER_MINUTE;

const customerNoShowLimit = () =>
  Math.max(asInt(process.env.CUSTOMER_NOSHOW_LIMIT, DEFAULT_NO_SHOW_LIMIT), MIN_SUSPEND_LIMIT);

const customerNoShowAutoSuspendEnabled = () =>
  asBool(process.env.CUSTOMER_NOSHOW_AUTO_SUSPEND, DEFAULT_NO_SHOW_AUTO_SUSPEND);

const shouldSuspendForNoShow = (count) =>
  customerNoShowAutoSuspendEnabled() && Number(count) >= customerNoShowLimit();

const customerLateCancelLimit = () =>
  Math.max(asInt(process.env.CUSTOMER_LATE_CANCEL_LIMIT, DEFAULT_LATE_CANCEL_LIMIT), MIN_SUSPEND_LIMIT);

const customerLateCancelAutoSuspendEnabled = () =>
  asBool(process.env.CUSTOMER_LATE_CANCEL_AUTO_SUSPEND, DEFAULT_LATE_CANCEL_AUTO_SUSPEND);

const shouldSuspendForLateCancel = (count) =>
  customerLateCancelAutoSuspendEnabled() && Number(count) >= customerLateCancelLimit();

// The clock for "the technician has been waiting" starts at the strongest
// signal available, newest first: the arrival stamp, then the moment the
// customer said someone would be there.
const noShowAnchor = (job = {}) => {
  const candidates = [
    job.technician_arrival_timestamp,
    job.customer_ready_timestamp,
    job.customer_confirmation_timestamp,
    job.updated_at,
    job.created_at,
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (!Number.isNaN(new Date(value).getTime())) return value;
  }
  return null;
};

// How far through the wait window a job is. `ready` is false until the
// technician has waited the configured minimum.
const waitProgress = (job, now = Date.now()) => {
  const waitMinutes = customerNoShowWaitMinutes();
  const waitMs = waitMinutes * MS_PER_MINUTE;
  const anchor = noShowAnchor(job);
  if (!anchor) {
    // No timestamp to measure from: nothing to enforce, so do not block.
    return { anchor: null, waitMs, waitMinutes, waitedMs: 0, remainingMs: 0, waitedMinutes: 0, ready: true };
  }
  const waitedMs = Math.max(now - new Date(anchor).getTime(), 0);
  return {
    anchor,
    waitMs,
    waitMinutes,
    waitedMs,
    remainingMs: Math.max(waitMs - waitedMs, 0),
    waitedMinutes: Math.floor(waitedMs / MS_PER_MINUTE),
    ready: waitedMs >= waitMs,
  };
};

const minutesText = (ms) => {
  const minutes = Math.max(Math.ceil(ms / MS_PER_MINUTE), 0);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const waitMessage = (remainingMs) =>
  `Please wait ${minutesText(remainingMs)} more before reporting a no-show. `
  + `A customer no-show only counts once you have waited ${customerNoShowWaitMinutes()} minutes at the service location.`;

module.exports = {
  MIN_WAIT_MINUTES,
  MAX_WAIT_MINUTES,
  customerNoShowWaitMinutes,
  customerNoShowWaitMs,
  customerNoShowLimit,
  customerNoShowAutoSuspendEnabled,
  shouldSuspendForNoShow,
  customerLateCancelLimit,
  customerLateCancelAutoSuspendEnabled,
  shouldSuspendForLateCancel,
  noShowAnchor,
  waitProgress,
  minutesText,
  waitMessage,
};
