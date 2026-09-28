// Shared geometry for the two tracker screens.
//
// The customer tracker (MapTrackerScreen) and the technician tracker
// (TechnicianTrackerScreen) are deliberately kept separate: their routing,
// recentring and polling behave differently, and a change to one must never
// move the other's pin. What was genuinely identical — and had been copied
// verbatim into both files — is only the haversine distance and the rule for
// deciding whether a job's stored coordinate is usable. Those two live here so
// the "is this coordinate real?" rule can only be fixed in one place.

export type Mappable = {
  latitude?: unknown;
  longitude?: unknown;
  location?: unknown;
};

export type CustomerPin = {
  latitude: number | null;
  longitude: number | null;
  name: string;
  address: string;
};

// Equivalent to `Number.isFinite`, but as a type guard so the caller gets
// `number` back instead of `unknown`.
const isCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Haversine distance in kilometres, or `null` when either endpoint is missing
 * or is not a real fix. Both trackers show distance only when it is meaningful.
 *
 * Note the guard is on the raw values, not on `Number(value)`: `Number(null)`
 * is `0`, which would silently turn a missing coordinate into a point off the
 * coast of Africa.
 */
export const distanceInKm = (first?: Mappable | null, second?: Mappable | null): number | null => {
  const firstLat = first?.latitude;
  const firstLon = first?.longitude;
  const secondLat = second?.latitude;
  const secondLon = second?.longitude;

  if (!isCoordinate(firstLat) || !isCoordinate(firstLon)
    || !isCoordinate(secondLat) || !isCoordinate(secondLon)) {
    return null;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(secondLat - firstLat);
  const longitudeDelta = toRadians(secondLon - firstLon);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

/**
 * Derive the customer/destination marker strictly from the job.
 *
 * Never fabricates coordinates: a job with no real lat/lng yields a `null` pin
 * that is later filled by geocoding or the live-tracking poll. Fabricated
 * defaults used to pile every coordinate-less job onto the same fake point,
 * which made popups look shuffled and routes point at the wrong place.
 *
 * `name` is passed in because the two screens disagree on whose name the
 * customer pin shows (the technician screen always shows the job's customer,
 * the customer screen shows its own logged-in name).
 */
export const customerPinFromJob = (job: Mappable | null | undefined, name: string): CustomerPin => {
  const lat = Number(job?.latitude);
  const lon = Number(job?.longitude);
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0;

  return {
    latitude: hasValidCoords ? lat : null,
    longitude: hasValidCoords ? lon : null,
    name,
    address: (job?.location as string | undefined) || 'Customer location',
  };
};
