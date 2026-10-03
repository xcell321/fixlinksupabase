// UAT #4 — booking regulations the customer must accept before the location
// step, and therefore before any GPS is acquired.
//
// Every number and every sentence the office may want to retune comes from the
// environment (EXPO_PUBLIC_*), so the regulation can be reworded without
// touching this file. The literals below are only fallbacks for a local run
// with an empty .env.
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

const asInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(asText(value, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
  minLeadDays: 1,
  cancelWindowHours: 5,
  version: '2026-10-01',
  title: 'Booking regulations',
  intro: 'FixLink only dispatches a technician when these rules are followed. Read them before you continue - the location step and the map are unlocked once you agree.',
  agreeLabel: 'I have read and accept these booking regulations',
  continueLabel: 'Agree and continue',
  declineLabel: 'I do not agree',
  declineNotice: 'You must accept the booking regulations to continue. Your request was not submitted and no technician was called.',
  leadLabel: '-day rule',
  cancelLabel: '-hour rule',
  sameDayLabel: 'Same-day charge',
  leadRule: (lead: number) => `A repair request must be scheduled at least ${lead} day${lead === 1 ? '' : 's'} ahead. A same-day request is only accepted with the same-day charge and depends on a technician still being available.`,
  cancelRule: (hours: number) => `You may cancel or reschedule at no charge up to ${hours} hours before the appointment. Cancelling inside the ${hours}-hour window, or after the technician has already travelled, may still be charged.`,
  sameDayRule: 'A same-day visit carries an extra same-day charge on top of the agreed repair price. Your technician confirms the final amount before any work starts.',
};

export const termsRequired = (): boolean =>
  asBool(process.env.EXPO_PUBLIC_SUBMIT_TERMS_REQUIRED, FALLBACKS.required);

export const minLeadDays = (): number =>
  asInt(process.env.EXPO_PUBLIC_TERMS_MIN_LEAD_DAYS, FALLBACKS.minLeadDays);

export const cancelWindowHours = (): number =>
  asInt(process.env.EXPO_PUBLIC_TERMS_CANCEL_WINDOW_HOURS, FALLBACKS.cancelWindowHours);

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

// The three regulations the UAT sheet names: the 1-day rule, the 5-hour rule
// and the same-day charge. The numbers inside the copy come from the variables
// above, so changing a window changes the sentence too.
export const submitTermRules = (): SubmitTermRule[] => {
  const lead = minLeadDays();
  const hours = cancelWindowHours();

  return [
    {
      id: 'lead-time',
      label: asText(process.env.EXPO_PUBLIC_TERMS_LEAD_LABEL, `${lead}${FALLBACKS.leadLabel}`),
      body: asText(
        process.env.EXPO_PUBLIC_TERMS_LEAD_RULE,
        FALLBACKS.leadRule(lead)
      ),
    },
    {
      id: 'cancellation-window',
      label: asText(process.env.EXPO_PUBLIC_TERMS_CANCEL_LABEL, `${hours}${FALLBACKS.cancelLabel}`),
      body: asText(
        process.env.EXPO_PUBLIC_TERMS_CANCEL_RULE,
        FALLBACKS.cancelRule(hours)
      ),
    },
    {
      id: 'same-day-charge',
      label: asText(process.env.EXPO_PUBLIC_TERMS_SAME_DAY_LABEL, FALLBACKS.sameDayLabel),
      body: asText(
        process.env.EXPO_PUBLIC_TERMS_SAME_DAY_RULE,
        FALLBACKS.sameDayRule
      ),
    },
  ];
};
