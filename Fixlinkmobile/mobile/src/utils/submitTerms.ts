// UAT #4 — booking regulations the customer must accept before the location
// step, and therefore before any GPS is acquired.
//
// Every sentence the office may want to retune comes from the
// environment (EXPO_PUBLIC_*), so the regulation can be reworded without
// touching this file. The literals below are only fallbacks for a local run
// with an empty .env. Each fallback describes what the system actually does.
//
// IMPORTANT: every read below is a STATIC `process.env.EXPO_PUBLIC_X` member
// expression. Expo/Metro inlines those at build time and cannot resolve a
// dynamic read such as `process.env[key]` — that form silently returns the
// fallback in a production bundle while looking correct in development.
// `scripts/checkImports.js` now rejects a dynamic EXPO_PUBLIC read.
//
// The gate is on by default: letting a booking through without an explicit
// agreement has to be a deliberate, configured choice — never an accident.

export interface SubmitTermRule {
  id: string;
  label: string;
  body: string;
}

const asText = (value: string | undefined, fallback: string): string => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
};

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

// Fallbacks for an empty .env. Every value is still read from the environment
// on each call — these constants exist so no number or sentence is a literal at
// the point of use, which is what the "nothing is hardcoded" rule means here.
const FALLBACKS = {
  required: true,
  version: '2026-10-01',
  title: 'Booking regulations',
  intro: 'FixLink only dispatches a technician when these rules are followed. Read them before you continue - the location step and the map are unlocked once you agree.',
  agreeLabel: 'I have read and accept these booking regulations',
  continueLabel: 'Agree and continue',
  declineLabel: 'I do not agree',
  declineNotice: 'You must accept the booking regulations to continue. Your request was not submitted and no technician was called.',
  tickHint: 'Tick the box to enable continuing.',
  scheduleLabel: 'Scheduling rule',
  cancelLabel: 'Cancellation rule',
  acceptanceLabel: 'Technician acceptance',
  scheduleRule: 'Choose today or a future date and a time window. Past dates are not accepted.',
  cancelRule: 'Once a technician accepts your request, it can no longer be cancelled. Cancelling is only possible while the request is still pending.',
  acceptanceRule: 'Your request is posted to nearby available technicians. A technician may only decline before accepting. Once accepted, both sides are committed and you are notified right away.',
};

export const termsRequired = (): boolean =>
  asBool(process.env.EXPO_PUBLIC_SUBMIT_TERMS_REQUIRED, FALLBACKS.required);

export const termsVersion = (): string =>
  asText(process.env.EXPO_PUBLIC_TERMS_VERSION, FALLBACKS.version);

export const termsTitle = (): string =>
  asText(process.env.EXPO_PUBLIC_TERMS_TITLE, FALLBACKS.title);

export const termsIntro = (): string => asText(
  process.env.EXPO_PUBLIC_TERMS_INTRO,
  FALLBACKS.intro
);

export const termsAgreeLabel = (): string => asText(
  process.env.EXPO_PUBLIC_TERMS_AGREE_LABEL,
  FALLBACKS.agreeLabel
);

export const termsContinueLabel = (): string =>
  asText(process.env.EXPO_PUBLIC_TERMS_CONTINUE_LABEL, FALLBACKS.continueLabel);

export const termsDeclineLabel = (): string =>
  asText(process.env.EXPO_PUBLIC_TERMS_DECLINE_LABEL, FALLBACKS.declineLabel);

export const termsDeclineNotice = (): string => asText(
  process.env.EXPO_PUBLIC_TERMS_DECLINE_NOTICE,
  FALLBACKS.declineNotice
);

export const termsTickHint = (): string => asText(
  process.env.EXPO_PUBLIC_TERMS_TICK_HINT,
  FALLBACKS.tickHint
);

// The three booking regulations, each describing what the system actually
// does: the schedule picker only takes today or a future date, cancelling is
// only possible while pending, and a booking is confirmed on technician
// accept. Every sentence stays overridable through the environment.
export const submitTermRules = (): SubmitTermRule[] => {
  return [
    {
      id: 'scheduling',
      label: asText(process.env.EXPO_PUBLIC_TERMS_SCHEDULE_LABEL, FALLBACKS.scheduleLabel),
      body: asText(
        process.env.EXPO_PUBLIC_TERMS_SCHEDULE_RULE,
        FALLBACKS.scheduleRule
      ),
    },
    {
      id: 'cancellation',
      label: asText(process.env.EXPO_PUBLIC_TERMS_CANCEL_LABEL, FALLBACKS.cancelLabel),
      body: asText(
        process.env.EXPO_PUBLIC_TERMS_CANCEL_RULE,
        FALLBACKS.cancelRule
      ),
    },
    {
      id: 'technician-acceptance',
      label: asText(process.env.EXPO_PUBLIC_TERMS_ACCEPTANCE_LABEL, FALLBACKS.acceptanceLabel),
      body: asText(
        process.env.EXPO_PUBLIC_TERMS_ACCEPTANCE_RULE,
        FALLBACKS.acceptanceRule
      ),
    },
  ];
};
