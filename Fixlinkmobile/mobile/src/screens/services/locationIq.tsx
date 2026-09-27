import axios from 'axios';
import { API_BASE_URL } from './api';

export const getLocationIqTileUrl = (): string => `${API_BASE_URL}/maps/tiles/{z}/{x}/{y}.png`;

const routeCache = new Map<string, unknown>();
// Geocode cache entries carry an expiry so long sessions revalidate stale
// addresses instead of pinning them forever.
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const geocodeCache = new Map<string, { value: { latitude: number; longitude: number } | null; expiresAt: number }>();
const autocompleteCache = new Map<string, unknown[]>();
let lastRouteRequestTime = 0;
let lastAutocompleteRequestTime = 0;

type LatLng = { latitude: number; longitude: number };

const calculateDistanceKm = (start: LatLng, end: LatLng): number => {
  if (![start?.latitude, start?.longitude, end?.latitude, end?.longitude].every(Number.isFinite)) return 1;
  const toRad = (v: number): number => (v * Math.PI) / 180;
  const dLat: number = toRad(end.latitude - start.latitude);
  const dLon: number = toRad(end.longitude - start.longitude);
  const a: number =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(start.latitude)) * Math.cos(toRad(end.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getDrivingRoute = async (startCoords: LatLng, endCoords: LatLng): Promise<unknown | null> => {
  if (!startCoords?.latitude || !startCoords?.longitude || !endCoords?.latitude || !endCoords?.longitude) {
    return null;
  }
  const cacheKey: string = `${startCoords.latitude.toFixed(4)},${startCoords.longitude.toFixed(4)};${endCoords.latitude.toFixed(4)},${endCoords.longitude.toFixed(4)}`;
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey) as unknown;

  const now: number = Date.now();
  if (now - lastRouteRequestTime < 800) {
    await new Promise<void>((resolve) => setTimeout(resolve, 800 - (now - lastRouteRequestTime)));
  }
  lastRouteRequestTime = Date.now();
  try {
    const coordsString: string = `${startCoords.longitude},${startCoords.latitude};${endCoords.longitude},${endCoords.latitude}`;
    const response = await axios.get(`${API_BASE_URL}/maps/directions/driving/${coordsString}`, { timeout: 9000 });
    const route = (response.data as { routes?: unknown[] })?.routes?.[0];
    if (route) {
      routeCache.set(cacheKey, route);
      return route;
    }
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; message?: string };
    console.warn('LocationIQ Route Notice (falling back to direct road link):', err?.response?.status ?? err?.message);
  }
  const fallbackKm: number = calculateDistanceKm(startCoords, endCoords);
  const fallbackRoute = {
    distance: Math.round(fallbackKm * 1000),
    duration: Math.max(60, Math.round((fallbackKm / 25) * 3600)),
    geometry: { coordinates: [[startCoords.longitude, startCoords.latitude], [endCoords.longitude, endCoords.latitude]] },
    isFallback: true,
  };
  routeCache.set(cacheKey, fallbackRoute);
  return fallbackRoute;
};

// Coarse offline fallback ONLY (barangay centers, land-verified). The live
// LocationIQ API is always tried first for rooftop accuracy. NOTE: there is
// no "Lepiten" barangay (it is a street name) so it must resolve via API.
const BOGO_LOCAL_COORDS: Record<string, LatLng> = {
  'san vicente': { latitude: 11.05, longitude: 124.005 },
  'p. rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  rodriguez: { latitude: 11.0485, longitude: 124.0038 },
  poblacion: { latitude: 11.0485, longitude: 124.0038 },
  taytayan: { latitude: 11.043, longitude: 124.008 },
  gairan: { latitude: 11.0554, longitude: 124.0217 },
  cogon: { latitude: 11.0463, longitude: 124.0028 },
  dakit: { latitude: 11.058, longitude: 124.008 },
  nailon: { latitude: 11.085, longitude: 124.035 },
  libertad: { latitude: 11.031, longitude: 124.002 },
  siocon: { latitude: 11.068, longitude: 124.025 },
  cantecson: { latitude: 11.041, longitude: 123.989 },
  sudtongan: { latitude: 11.072, longitude: 124.001 },
  'la paz': { latitude: 11.072, longitude: 124.001 },
  crmc: { latitude: 11.0505, longitude: 124.0045 },
  'cebu roosevelt': { latitude: 11.0505, longitude: 124.0045 },
};

export interface AddressParts {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

// Structured parts from a LocationIQ addressdetails block. Road plus house
// number forms the street, city falls back through town, village, suburb,
// county, and state plus postcode pass through when present.
export const extractAddressParts = (details: Record<string, unknown> | null | undefined): AddressParts => {
  const d = (details ?? {}) as Record<string, string>;
  const text = (v: unknown): string => String(v ?? '').trim();
  const house = text(d.house_number);
  const road = text(d.road);
  const street = [house, road].filter(Boolean).join(' ')
    || text(d.residential) || text(d.pedestrian) || text(d.footway) || text(d.cycleway) || text(d.path);
  const city = text(d.city) || text(d.town) || text(d.village) || text(d.suburb)
    || text(d.neighbourhood) || text(d.county) || text(d.municipality);
  return {
    street,
    city,
    state: text(d.state) || text(d.region),
    postalCode: text(d.postcode),
  };
};

// Precise reverse geocode through the backend proxy. Returns coordinates plus
// street, city, state, and postal code in one call.
export const reverseGeocodePrecise = async (
  latitude: number,
  longitude: number,
): Promise<(AddressParts & { latitude: number; longitude: number }) | null> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/maps/reverse`, {
      params: { lat: latitude, lon: longitude },
      timeout: 8000,
    });
    const data = (response.data ?? {}) as { lat?: string; lon?: string; address?: Record<string, unknown> };
    if (!data.lat || !data.lon) return null;
    return {
      latitude: Number(data.lat),
      longitude: Number(data.lon),
      ...extractAddressParts(data.address),
    };
  } catch {
    return null;
  }
};

const searchLocationIq = async (rawQuery: string, suffix: string | null): Promise<LatLng | null> => {
  const q: string = suffix ? `${rawQuery}, ${suffix}` : rawQuery;
  try {
    const response = await axios.get(`${API_BASE_URL}/maps/search`, { params: { q }, timeout: 6000 });
    const result = (response.data as Array<{ lat?: string; lon?: string }>)?.[0];
    if (result?.lat && result?.lon) return { latitude: Number(result.lat), longitude: Number(result.lon) };
    return null;
  } catch (error: unknown) {
    // Quota exhausted: throw so callers skip remaining retries — hammering a
    // rate-limited key only burns time and gets more 429s.
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 429) throw new Error('GEOCODE_RATE_LIMITED');
    throw error;
  }
};

// One address → coordinates attempt. The backend now locks every search to
// the Philippines (countrycodes=ph), so a single raw query is usually enough;
// a city-context retry only runs when the raw form returns nothing.
const geocodeOnce = async (clean: string): Promise<LatLng | null> => {
  const coords = await searchLocationIq(clean, null);
  if (coords) return coords;
  return searchLocationIq(clean, 'Philippines');
};

const geocodeWithCache = async (cacheKey: string, clean: string, lookup: () => Promise<LatLng | null>): Promise<LatLng | null> => {
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) geocodeCache.delete(cacheKey);
  try {
    const coords = await lookup();
    if (geocodeCache.size > 200) geocodeCache.clear();
    geocodeCache.set(cacheKey, { value: coords, expiresAt: Date.now() + GEOCODE_TTL_MS });
    return coords;
  } catch (error) {
    // Rate-limited: remember the miss briefly so a UI loop cannot re-burst the
    // quota, then surface null (callers keep GPS/prior coords).
    if (String((error as Error)?.message) === 'GEOCODE_RATE_LIMITED') {
      geocodeCache.set(cacheKey, { value: null, expiresAt: Date.now() + 60 * 1000 });
      return null;
    }
    throw error;
  }
};

const resolveGeocode = async (query: string, useCompact: boolean): Promise<LatLng | null> => {
  const clean: string = String(query ?? '').trim();
  if (!clean) return null;
  const cacheKey = `free:${clean.toLowerCase()}`;
  // Live API first (rooftop-accurate). Coarse dict is offline fallback only,
  // so a wrong dict entry can never override a real street position again.
  try {
    const coords = await geocodeWithCache(cacheKey, clean, () => geocodeOnce(clean));
    if (coords) return coords;
  } catch {}
  const compact = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compareValue: string = useCompact ? compact(clean) : clean.toLowerCase();
  for (const [key, coords] of Object.entries(BOGO_LOCAL_COORDS)) {
    const dictKey: string = useCompact ? compact(key) : key;
    if (dictKey && compareValue.includes(dictKey)) return coords;
  }
  return null;
};

// API-only forward geocode (LocationIQ rooftop). Never touches the coarse
// local dict, so it is safe to OVERRIDE a weak GPS fix (snap-to-house).
export const geocodeAddressPrecise = async (address: string): Promise<LatLng | null> => {
  const clean: string = String(address ?? '').trim();
  if (!clean) return null;
  const cacheKey = `precise:${clean.toLowerCase()}`;
  try {
    return await geocodeWithCache(cacheKey, clean, () => geocodeOnce(clean));
  } catch {
    return null;
  }
};

export interface StructuredAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  /** Extra free-text context (province/island) appended for disambiguation. */
  context?: string;
}

// Structured forward geocode — sends the separate street/city/postal fields
// straight to LocationIQ's structured search mode instead of one concatenated
// free-text blob. This is the most accurate path when the caller already has
// address parts (e.g. the submit form).
export const geocodeAddressStructured = async (parts: StructuredAddress): Promise<LatLng | null> => {
  const street = String(parts?.street ?? '').trim();
  const city = String(parts?.city ?? '').trim();
  const postalCode = String(parts?.postalCode ?? '').trim();
  const context = String(parts?.context ?? '').trim();
  if (!street && !city && !postalCode) return null;
  const cacheKey = `struct:${street.toLowerCase()}|${city.toLowerCase()}|${postalCode}|${context.toLowerCase()}`;
  const lookup = async (): Promise<LatLng | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/maps/search`, {
        params: {
          ...(street ? { street } : {}),
          ...(city ? { city } : {}),
          ...(postalCode ? { postalcode: postalCode } : {}),
          ...(context ? { q: context } : {}),
        },
        timeout: 6000,
      });
      const result = (response.data as Array<{ lat?: string; lon?: string }>)?.[0];
      if (result?.lat && result?.lon) return { latitude: Number(result.lat), longitude: Number(result.lon) };
      return null;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429) throw new Error('GEOCODE_RATE_LIMITED');
      throw error;
    }
  };
  try {
    return await geocodeWithCache(cacheKey, context || city || street, lookup);
  } catch {
    return null;
  }
};

export const geocodeAddress = async (address: string): Promise<LatLng | null> => resolveGeocode(address, false);

export interface AutocompleteSuggestion {
  label: string;
  sublabel: string;
  latitude: number;
  longitude: number;
  type: string;
  fullName: string;
}

export const autocompleteLocation = async (query: string): Promise<AutocompleteSuggestion[]> => {
  const clean: string = String(query ?? '').trim();
  if (clean.length < 3) return [];
  const cacheKey: string = clean.toLowerCase();
  if (autocompleteCache.has(cacheKey)) return autocompleteCache.get(cacheKey) as AutocompleteSuggestion[];
  const now: number = Date.now();
  if (now - lastAutocompleteRequestTime < 800) {
    await new Promise<void>((resolve) => setTimeout(resolve, 800 - (now - lastAutocompleteRequestTime)));
  }
  lastAutocompleteRequestTime = Date.now();
  try {
    const response = await axios.get(`${API_BASE_URL}/maps/autocomplete`, {
      params: { q: clean, limit: 10, countrycodes: 'ph', dedupe: 1, 'accept-language': 'en' },
      timeout: 6000,
    });
    const items = Array.isArray(response.data) ? (response.data as Array<Record<string, unknown>>) : [];
    const seen = new Set<string>();
    const suggestions: AutocompleteSuggestion[] = [];
    for (const item of items) {
      if (!item?.lat || !item?.lon || !item?.display_name) continue;
      const lat: number = Number(item.lat as string);
      const lon: number = Number(item.lon as string);
      const coordKey: string = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (seen.has(coordKey)) continue;
      seen.add(coordKey);
      const fallbackName: string = String(item.display_name).split(',')[0] || 'Place';
      suggestions.push({
        label: (item.display_place as string) ?? (item.address as { name?: string })?.name ?? fallbackName,
        sublabel: (item.display_address as string) ?? (item.display_name as string),
        latitude: lat,
        longitude: lon,
        type: (item.type as string) ?? (item.class as string) ?? 'place',
        fullName: item.display_name as string,
      });
    }
    if (autocompleteCache.size > 100) autocompleteCache.clear();
    autocompleteCache.set(cacheKey, suggestions);
    return suggestions;
  } catch (error: unknown) {
    const err = error as { response?: { status?: number }; message?: string };
    console.warn('LocationIQ autocomplete notice:', err?.response?.status ?? err?.message);
    return [];
  }
};

export const geocodeAddressStrict = async (address: string): Promise<LatLng | null> => resolveGeocode(address, true);
