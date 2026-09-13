const LANDMARK_COORDS = {
  'lepiten': { latitude: 11.0278, longitude: 124.0355 },
  'san vicente': { latitude: 11.0550, longitude: 124.0216 },
  'p. rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'poblacion': { latitude: 11.0485, longitude: 124.0038 },
  'taytayan': { latitude: 11.0430, longitude: 124.0080 },
  'gairan': { latitude: 11.0554, longitude: 124.0217 },
  'cogon': { latitude: 11.0380, longitude: 124.0150 },
  'dakit': { latitude: 11.0620, longitude: 124.0120 },
  'nailon': { latitude: 11.0850, longitude: 124.0350 },
  'libertad': { latitude: 11.0310, longitude: 124.0020 },
  'siocon': { latitude: 11.0680, longitude: 124.0250 },
  'cantecson': { latitude: 11.0410, longitude: 123.9890 },
  'sudtongan': { latitude: 11.0720, longitude: 124.0010 },
  'la paz': { latitude: 11.0720, longitude: 124.0010 },
  'crmc': { latitude: 11.0505, longitude: 124.0045 },
  'cebu roosevelt': { latitude: 11.0505, longitude: 124.0045 },
};

const LOCATIONIQ_ACCESS_TOKEN = process.env.LOCATIONIQ_ACCESS_TOKEN || '';
const LOCATIONIQ_BASE_URL = 'https://us1.locationiq.com/v1';

const resolveCoordinates = async (address) => {
  const query = String(address || '').trim();
  if (!query) return null;

  const compact = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compactQuery = compact(query);
  for (const [key, coords] of Object.entries(LANDMARK_COORDS)) {
    const compactKey = compact(key);
    if (compactKey && compactQuery.includes(compactKey)) return coords;
  }

  if (!LOCATIONIQ_ACCESS_TOKEN) return null;

  // Query the raw address first so ANY mapped location resolves, then add
  // country/regional context. The Bogo suffix is intentionally LAST so
  // out-of-town addresses resolve correctly.
  const attempts = [query, `${query}, Philippines`, `${query}, Bogo City, Cebu`];
  for (const searchQuery of attempts) {
    try {
      const url = `${LOCATIONIQ_BASE_URL}/search?key=${encodeURIComponent(LOCATIONIQ_ACCESS_TOKEN)}&q=${encodeURIComponent(searchQuery)}&format=json&limit=1`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) continue;
      const results = await response.json();
      const result = Array.isArray(results) ? results[0] : null;
      if (result && result.lat && result.lon) {
        return { latitude: Number(result.lat), longitude: Number(result.lon) };
      }
    } catch (error) {
      console.warn('Geocoding notice (location left empty):', error?.message || error);
    }
  }
  return null;
};

module.exports = { resolveCoordinates };