// UAT #4 — booking regulations the customer must accept before the location
// step, and therefore before any GPS is acquired.
//
// Every number and every sentence the office may want to retune comes from the
// environment (EXPO_PUBLIC_*), so the regulation can be reworded without
// touching this file. The literals below are only fallbacks for a local run
// with an empty .env.
//
// The gate is on by default: letting a booking through without an explicit
// agreement has to be a deliberate, configured choice — never an accident.

export interface SubmitTermRule {
  id: string;
  label: string;
  body: string;
}

const asText = (key: string, fallback: string): string => {
  const value = process.env?.[key];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
};

const asInt = (key: string, fallback: number): number => {
  const parsed = Number.parseInt(asText(key, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const asBool = (key: string, fallback: boolean): boolean => {
  const value = process.env?.[key];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

export const termsRequired = (): boolean => asBool('EXPO_PUBLIC_SUBMIT_TERMS_REQUIRED', true);

export const minLeadDays = (): number => asInt('EXPO_PUBLIC_TERMS_MIN_LEAD_DAYS', 1);

export const cancelWindowHours = (): number => asInt('EXPO_PUBLIC_TERMS_CANCEL_WINDOW_HOURS', 5);

export const termsVersion = (): string => asText('EXPO_PUBLIC_TERMS_VERSION', '2026-10-01');

export const termsTitle = (): string => asText('EXPO_PUBLIC_TERMS_TITLE', 'Booking regulations');

export const termsIntro = (): string => asText(
  'EXPO_PUBLIC_TERMS_INTRO',
  'FixLink only dispatches a technician when these rules are followed. Read them before you continue - the location step and the map are unlocked once you agree.'
);

export const termsAgreeLabel = (): string => asText(
  'EXPO_PUBLIC_TERMS_AGREE_LABEL',
  'I have read and accept these booking regulations'
);

export const termsContinueLabel = (): string => asText('EXPO_PUBLIC_TERMS_CONTINUE_LABEL', 'Agree and continue');

export const termsDeclineLabel = (): string => asText('EXPO_PUBLIC_TERMS_DECLINE_LABEL', 'I do not agree');

export const termsDeclineNotice = (): string => asText(
  'EXPO_PUBLIC_TERMS_DECLINE_NOTICE',
  'You must accept the booking regulations to continue. Your request was not submitted and no technician was called.'
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
      label: asText('EXPO_PUBLIC_TERMS_LEAD_LABEL', `${lead}-day rule`),
      body: asText(
        'EXPO_PUBLIC_TERMS_LEAD_RULE',
        `A repair request must be scheduled at least ${lead} day${lead === 1 ? '' : 's'} ahead. A same-day request is only accepted with the same-day charge and depends on a technician still being available.`
      ),
    },
    {
      id: 'cancellation-window',
      label: asText('EXPO_PUBLIC_TERMS_CANCEL_LABEL', `${hours}-hour rule`),
      body: asText(
        'EXPO_PUBLIC_TERMS_CANCEL_RULE',
        `You may cancel or reschedule at no charge up to ${hours} hours before the appointment. Cancelling inside the ${hours}-hour window, or after the technician has already travelled, may still be charged.`
      ),
    },
    {
      id: 'same-day-charge',
      label: asText('EXPO_PUBLIC_TERMS_SAME_DAY_LABEL', 'Same-day charge'),
      body: asText(
        'EXPO_PUBLIC_TERMS_SAME_DAY_RULE',
        'A same-day visit carries an extra same-day charge on top of the agreed repair price. Your technician confirms the final amount before any work starts.'
      ),
    },
  ];
};
