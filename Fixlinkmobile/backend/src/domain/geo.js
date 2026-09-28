// Pure geometry helpers. No I/O, no database — safe to unit test directly.

// Great-circle distance between two WGS84 points, in kilometres.
// Returns null unless all four inputs are finite numbers, so callers can
// distinguish "no distance available" from "distance is zero".
const distanceInKm = (firstLatitude, firstLongitude, secondLatitude, secondLongitude) => {
  if (![firstLatitude, firstLongitude, secondLatitude, secondLongitude].every(Number.isFinite)) return null;
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(firstLatitude)) * Math.cos(radians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

// Round to one decimal place for the API payloads (e.g. "3.4 km").
const roundKm = (value) => (value == null ? null : Number(value.toFixed(1)));

module.exports = { distanceInKm, roundKm };
