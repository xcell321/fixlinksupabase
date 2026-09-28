// Offline Bogo City landmark table.
//
// This is a *fallback* used by the technician job feed to place legacy rows
// that were saved before coordinates were stored. Live geocoding
// (services/geocodeService.js) is always tried first when a job is created.
//
// NOTE: services/technicianMatching.js (used by the AI recommendation
// endpoint) keeps its own landmark table with slightly different values for
// `dakit`. The two tables were edited independently, so they are kept apart
// here on purpose — unifying them would silently move a candidate's distance.
const FEED_LANDMARKS = {
  'lepiten': { latitude: 11.0278, longitude: 124.0355 },
  'san vicente': { latitude: 11.0550, longitude: 124.0216 },
  'p. rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'poblacion': { latitude: 11.0485, longitude: 124.0038 },
  'taytayan': { latitude: 11.0430, longitude: 124.0080 },
  'gairan': { latitude: 11.0554, longitude: 124.0217 },
  'cogon': { latitude: 11.0380, longitude: 124.0150 },
  'dakit': { latitude: 11.0580, longitude: 124.0080 },
  'nailon': { latitude: 11.0850, longitude: 124.0350 },
  'libertad': { latitude: 11.0310, longitude: 124.0020 },
  'siocon': { latitude: 11.0680, longitude: 124.0250 },
  'cantecson': { latitude: 11.0410, longitude: 123.9890 },
  'sudtongan': { latitude: 11.0720, longitude: 124.0010 },
  'la paz': { latitude: 11.0720, longitude: 124.0010 }
};

// Synchronous local fallback used when listing jobs (avoids one network call
// per row). Real coordinates always win; the landmark table only applies to
// legacy rows that predate coordinate storage.
const resolveLocalCoords = (latitude, longitude, locationText) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  const lower = String(locationText || '').toLowerCase();
  for (const [key, coords] of Object.entries(FEED_LANDMARKS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
};

module.exports = { FEED_LANDMARKS, resolveLocalCoords };
