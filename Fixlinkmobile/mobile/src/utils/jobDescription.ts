// A repair request stores its problem description with the brand the customer
// typed, as "[Brand Model] their words" (see SubmitRequestScreen). Showing the
// raw string leaks the raw brackets into the UI, so screens split it and render
// the brand as its own label. The stored value is never changed.
export const splitJobDescription = (raw?: string | null): { brand: string | null; text: string } => {
  const value = String(raw ?? '').trim();
  if (!value) return { brand: null, text: '' };

  const match = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(value);
  if (!match) return { brand: null, text: value };

  const brand = String(match[1] ?? '').trim();
  if (!brand) return { brand: null, text: value };

  return { brand, text: String(match[2] ?? '').trim() };
};
