// The technician's service area shown in the Jobs header, derived from the
// address saved on their profile — never hardcoded.
//
// Philippine addresses are written most-specific first, so the city or
// municipality sits just before the province:
//   "San Vicente St., Bogo City, Cebu"        -> "Bogo City"
//   "Bogo City, Cebu"                         -> "Bogo City"
//   "Bogo City"                               -> "Bogo City"
export const serviceAreaOf = (address?: string | null): string | null => {
  const parts = String(address ?? '')
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] ?? null;

  // Prefer an explicit city/municipality segment wherever it sits.
  const named = parts.find((part) => /\b(city|municipality|mun\.?|bayan|poblacion)\b/i.test(part));
  if (named) return named;

  // Otherwise drop the province (and any trailing zip/country) and use the
  // segment before it, which is the town in the usual "street, town, province"
  // layout.
  const withoutTrailing = parts.filter((part) => !/^\d{3,}.*$|^philippines$/i.test(part));
  if (withoutTrailing.length >= 2) return withoutTrailing[withoutTrailing.length - 2] ?? null;
  return withoutTrailing[0] ?? parts[0] ?? null;
};
