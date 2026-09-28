// Job location resolution.
//
// Coordinates supplied by the app (from the GPS pin) always win. The free-text
// address is only geocoded when the app did not send usable coordinates, which
// keeps the common path free of a network round trip.

const { resolveCoordinates } = require('./geocodeService');

const resolveJobCoordinates = async (latitude, longitude, locationText) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  if (!locationText) return null;
  return resolveCoordinates(locationText);
};

module.exports = { resolveJobCoordinates };
