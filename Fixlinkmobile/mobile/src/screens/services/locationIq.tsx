import axios from 'axios';
import { API_BASE_URL } from './api';

export const getLocationIqTileUrl = (): string => `${API_BASE_URL}/maps/tiles/{z}/{x}/{y}.png`;

const routeCache = new Map<string, unknown>();
const geocodeCache = new Map<string, { latitude: number; longitude: number } | null>();
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

const searchLocationIq = async (rawQuery: string, suffix: string | null): Promise<LatLng | null> => {
  const q: string = suffix ? `${rawQuery}, ${suffix}` : rawQuery;
  const response = await axios.get(`${API_BASE_URL}/maps/search`, { params: { q }, timeout: 6000 });
  const result = (response.data as Array<{ lat?: string; lon?: string }>)?.[0];
  if (result?.lat && result?.lon) return { latitude: Number(result.lat), longitude: Number(result.lon) };
  return null;
};

const resolveGeocode = async (query: string, useCompact: boolean): Promise<LatLng | null> => {
  const clean: string = String(query ?? '').trim();
  if (!clean) return null;
  if (geocodeCache.has(clean)) return geocodeCache.get(clean) ?? null;
  // Live API first (rooftop-accurate). Coarse dict is offline fallback only,
  // so a wrong dict entry can never override a real street position again.
  for (const suffix of [null, 'Philippines', 'Bogo City, Cebu'] as const) {
    try {
      const coords: LatLng | null = await searchLocationIq(clean, suffix);
      if (coords) {
        geocodeCache.set(clean, coords);
        return coords;
      }
    } catch {}
  }
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
  for (const suffix of [null, 'Philippines', 'Bogo City, Cebu'] as const) {
    try {
      const coords: LatLng | null = await searchLocationIq(clean, suffix);
      if (coords) {
        geocodeCache.set(clean, coords);
        return coords;
      }
    } catch {}
  }
  return null;
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
