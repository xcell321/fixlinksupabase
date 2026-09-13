import axios from 'axios';
import { API_BASE_URL } from './api';

// LocationIQ is reached ONLY through the FixLink backend proxy (routes/maps.js)
// so the API key never ships inside the app bundle.
export const getLocationIqTileUrl = () => (
  `${API_BASE_URL}/maps/tiles/{z}/{x}/{y}.png`
);

// In-memory cache to prevent duplicate calls and avoid LocationIQ 429 rate limiting
const routeCache = new Map();
const geocodeCache = new Map();
const autocompleteCache = new Map();
let lastRouteRequestTime = 0;
let lastAutocompleteRequestTime = 0;

// Haversine distance helper
const calculateDistanceKm = (start, end) => {
  if (![start?.latitude, start?.longitude, end?.latitude, end?.longitude].every(Number.isFinite)) return 1;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(end.latitude - start.latitude);
  const dLon = toRad(end.longitude - start.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(start.latitude)) * Math.cos(toRad(end.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getDrivingRoute = async (startCoords, endCoords) => {
  if (!startCoords?.latitude || !startCoords?.longitude || !endCoords?.latitude || !endCoords?.longitude) {
    return null;
  }

  const cacheKey = `${startCoords.latitude.toFixed(4)},${startCoords.longitude.toFixed(4)};${endCoords.latitude.toFixed(4)},${endCoords.longitude.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  // Throttle: Ensure at least 800ms between network requests to respect LocationIQ 2 req/sec limit
  const now = Date.now();
  if (now - lastRouteRequestTime < 800) {
    await new Promise((resolve) => setTimeout(resolve, 800 - (now - lastRouteRequestTime)));
  }
  lastRouteRequestTime = Date.now();

  try {
    const coordsString = `${startCoords.longitude},${startCoords.latitude};${endCoords.longitude},${endCoords.latitude}`;
    const response = await axios.get(`${API_BASE_URL}/maps/directions/driving/${coordsString}`, {
      timeout: 9000,
    });
    const route = response.data?.routes?.[0];
    if (route) {
      routeCache.set(cacheKey, route);
      return route;
    }
  } catch (error) {
    console.warn('LocationIQ Route Notice (falling back to direct road link):', error?.response?.status || error?.message);
  }

  // Fallback: Generate straight-line connection if rate-limited (HTTP 429) or offline
  const fallbackKm = calculateDistanceKm(startCoords, endCoords);
  const fallbackRoute = {
    distance: Math.round(fallbackKm * 1000),
    duration: Math.max(60, Math.round((fallbackKm / 25) * 3600)), // ~25 km/h driving speed
    geometry: {
      coordinates: [
        [startCoords.longitude, startCoords.latitude],
        [endCoords.longitude, endCoords.latitude],
      ],
    },
    isFallback: true,
  };
  routeCache.set(cacheKey, fallbackRoute);
  return fallbackRoute;
};

// Known Bogo City, Cebu locations dictionary for instant, accurate local resolution
const BOGO_LOCAL_COORDS = {
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

// Query the backend proxy with an optional context suffix. Raw query first so
// ANY address anywhere on the map resolves (nationwide/global), not just Bogo City.
const searchLocationIq = async (rawQuery, suffix) => {
  const q = suffix ? `${rawQuery}, ${suffix}` : rawQuery;
  const response = await axios.get(`${API_BASE_URL}/maps/search`, {
    params: { q },
    timeout: 6000,
  });
  const result = response.data?.[0];
  if (result?.lat && result?.lon) {
    return { latitude: Number(result.lat), longitude: Number(result.lon) };
  }
  return null;
};

// Resolve using the local dictionary first, then LocationIQ. Never fabricates a
// default location — returns null when the address isn't recognized.
const resolveGeocode = async (query, useCompact) => {
  const clean = String(query || '').trim();
  if (!clean) return null;

  const compact = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compareValue = useCompact ? compact(clean) : clean.toLowerCase();
  for (const [key, coords] of Object.entries(BOGO_LOCAL_COORDS)) {
    const dictKey = useCompact ? compact(key) : key;
    if (dictKey && compareValue.includes(dictKey)) return coords;
  }

  if (geocodeCache.has(clean)) {
    return geocodeCache.get(clean);
  }

  // Try the raw address first, then add country/regional context as fallback.
  // The Bogo suffix is intentionally LAST so out-of-town locations resolve first.
  for (const suffix of [null, 'Philippines', 'Bogo City, Cebu']) {
    const coords = await searchLocationIq(clean, suffix);
    if (coords) {
      geocodeCache.set(clean, coords);
      return coords;
    }
  }
  return null;
};

export const geocodeAddress = async (address) => resolveGeocode(address, false);

// Type-ahead search for places while the customer types. Returns barangays,
// cities, streets, stores and landmarks that exist on the map, each with their
// exact coordinates so the picked place pins precisely. Limited to the
// Philippines and respects LocationIQ's free-tier rate limits.
export const autocompleteLocation = async (query) => {
  const clean = String(query || '').trim();
  if (clean.length < 3) return [];

  const cacheKey = clean.toLowerCase();
  if (autocompleteCache.has(cacheKey)) {
    return autocompleteCache.get(cacheKey);
  }

  const now = Date.now();
  if (now - lastAutocompleteRequestTime < 800) {
    await new Promise((resolve) => setTimeout(resolve, 800 - (now - lastAutocompleteRequestTime)));
  }
  lastAutocompleteRequestTime = Date.now();

  try {
    const response = await axios.get(`${API_BASE_URL}/maps/autocomplete`, {
      params: {
        q: clean,
        limit: 10,
        countrycodes: 'ph',
        dedupe: 1,
        'accept-language': 'en',
      },
      timeout: 6000,
    });

    const items = Array.isArray(response.data) ? response.data : [];
    const seen = new Set();
    const suggestions = [];
    for (const item of items) {
      if (!item?.lat || !item?.lon || !item?.display_name) continue;
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (seen.has(coordKey)) continue;
      seen.add(coordKey);
      const fallbackName = String(item.display_name).split(',')[0] || 'Place';
      suggestions.push({
        label: item.display_place || item.address?.name || fallbackName,
        sublabel: item.display_address || item.display_name,
        latitude: lat,
        longitude: lon,
        type: item.type || item.class || 'place',
        fullName: item.display_name,
      });
    }

    if (autocompleteCache.size > 100) autocompleteCache.clear();
    autocompleteCache.set(cacheKey, suggestions);
    return suggestions;
  } catch (error) {
    console.warn('LocationIQ autocomplete notice:', error?.response?.status || error?.message);
    return [];
  }
};

// Strict geocoding for technician service addresses: resolves only when the
// address is actually recognized (never fabricates a default location).
export const geocodeAddressStrict = async (address) => resolveGeocode(address, true);