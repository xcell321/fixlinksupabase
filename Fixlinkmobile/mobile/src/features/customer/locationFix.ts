// GPS acquisition for the repair-location step.
//
// Extracted from SubmitRequestScreen: this is device/GPS plumbing with no
// knowledge of the form, so it can be reasoned about (and eventually tested)
// without rendering the 1,600-line screen.

import * as Location from 'expo-location';

export const LOCATION_TIMEOUT_MESSAGE =
  'Location request timed out. Try again outside or type the address manually.';

// A fix tighter than this is rooftop-grade; stop sampling as soon as we have one.
const ROOFTOP_ACCURACY_M = 12;
// Hard cap on samples, so a noisy indoor sky does not sample forever.
const MAX_SAMPLES = 6;

/** Straight-line metres between two coordinates (haversine). */
export const distanceInMeters = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number => {
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) return Infinity;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Best-of-N GPS fix.
 *
 * A single reading can be tens of metres off (worst indoors), so keep sampling
 * in high-accuracy mode and resolve with the tightest radius. Resolves early
 * once a rooftop-grade fix is in hand, so the common case still finishes in a
 * couple of seconds.
 */
export const collectBestFix = (budgetMs = 12000): Promise<Location.LocationObject> =>
  new Promise((resolve, reject) => {
    let best: Location.LocationObject | null = null;
    let samples = 0;
    let finished = false;
    let subscription: Location.LocationSubscription | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { subscription?.remove?.(); } catch {}
      if (best) resolve(best);
      else reject(new Error(LOCATION_TIMEOUT_MESSAGE));
    };

    timer = setTimeout(finish, budgetMs);

    try {
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 0, timeInterval: 1000 },
        (pos) => {
          if (finished) return;
          const accuracy = Number(pos?.coords?.accuracy);
          if (!best || (Number.isFinite(accuracy) && accuracy < Number(best.coords.accuracy))) best = pos;
          samples += 1;
          if ((Number.isFinite(accuracy) && accuracy <= ROOFTOP_ACCURACY_M) || samples >= MAX_SAMPLES) finish();
        },
      )
        .then((sub) => {
          subscription = sub;
          if (finished) {
            try { sub.remove(); } catch {}
          }
        })
        .catch(() => finish());
    } catch {
      finish();
    }
  });
