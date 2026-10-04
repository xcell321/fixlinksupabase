// UAT #2 — the app-side half of the auto-suspend rule.
//
// The server stays the authority: it refuses a customer no-show report until
// the technician has recorded an arrival AND waited the window, and it suspends
// the customer once the report lands. This module only mirrors those numbers so
// the technician sees a countdown instead of a rejected request.
//
// Every value is an EXPO_PUBLIC_* variable (Expo inlines these at build time)
// and the defaults match the backend's documented fallbacks.

const DEFAULT_WAIT_MINUTES = 60;
const MIN_WAIT_MINUTES = 30;
const MAX_WAIT_MINUTES = 60;
const MS_PER_MINUTE = 60 * 1000;

const asInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * How long the technician must wait at the service location before a customer
 * no-show counts. The UAT requirement fixes the window at 30 minutes to 1 hour,
 * so an out-of-band value is clamped rather than quietly disabling the rule.
 */
export const noShowWaitMinutes = (): number => {
  const raw = asInt(process.env.EXPO_PUBLIC_CUSTOMER_NOSHOW_WAIT_MINUTES, DEFAULT_WAIT_MINUTES);
  return Math.min(Math.max(raw, MIN_WAIT_MINUTES), MAX_WAIT_MINUTES);
};

export interface NoShowWaitState {
  /** The technician has recorded an arrival, so the clock is running. */
  hasArrived: boolean;
  /** The wait window has passed and a report will be accepted. */
  ready: boolean;
  waitedMinutes: number;
  remainingMinutes: number;
  waitMinutes: number;
}

/**
 * How far through the wait window a job is. Before an arrival is recorded the
 * report is not allowed at all, which is why `hasArrived` is reported
 * separately from `ready`.
 */
export const noShowWaitState = (
  job: { technicianArrivalAt?: string | null } | null | undefined,
  now: number = Date.now(),
): NoShowWaitState => {
  const waitMinutes = noShowWaitMinutes();
  const anchor = job?.technicianArrivalAt ? new Date(job.technicianArrivalAt).getTime() : Number.NaN;
  if (Number.isNaN(anchor)) {
    return { hasArrived: false, ready: false, waitedMinutes: 0, remainingMinutes: waitMinutes, waitMinutes };
  }
  const waitedMs = Math.max(now - anchor, 0);
  const remainingMs = Math.max(waitMinutes * MS_PER_MINUTE - waitedMs, 0);
  return {
    hasArrived: true,
    ready: remainingMs === 0,
    waitedMinutes: Math.floor(waitedMs / MS_PER_MINUTE),
    remainingMinutes: Math.ceil(remainingMs / MS_PER_MINUTE),
    waitMinutes,
  };
};

export const minutesText = (minutes: number): string =>
  `${minutes} minute${minutes === 1 ? '' : 's'}`;

/** Shown to the technician when the wait window has not passed yet. */
export const noShowBlockedText = (state: NoShowWaitState): string =>
  `Wait ${minutesText(state.remainingMinutes)} more before reporting a no-show. `
  + `A customer no-show only counts once you have waited ${minutesText(state.waitMinutes)} at the service location.`;

/** The technician's confirmation copy, naming what the report does. */
export const noShowConfirmMessage = (waitedMinutes: number): string =>
  `You have waited ${minutesText(waitedMinutes)} and nobody is at the service location. `
  + 'Reporting this no-show suspends the customer\'s account. Only report it if you really are there.';
