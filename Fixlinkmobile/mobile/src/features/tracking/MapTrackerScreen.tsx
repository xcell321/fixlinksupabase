import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import LocationIQMap from '../../components/LocationIQMap';
import {
  fetchJobLiveTracking,
  updateCustomerLocation
} from '../../services/api';
import { geocodeAddressPrecise, getDrivingRoute } from '../../services/locationIq';
import { colors, fonts, themedStyles } from '../../theme';
import { customerPinFromJob, distanceInKm } from './trackingGeometry';

// The subset of a job this screen reads.
type JobItem = {
  id?: string;
  status?: string;
  applianceType?: string;
  technicianName?: string;
  customerName?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location?: string;
};

type MapCoord = {
  latitude: number | null;
  longitude: number | null;
  name: string;
  // The technician pin has no address, only the job pin does.
  address?: string;
};

// Polyline points as the map component wants them: [lat, lng] pairs.
type DrivingRoute = {
  // [lng, lat] pairs exactly as LocationIQ returns them.
  geometry?: { coordinates?: Array<[number, number]> } | null;
  distance?: number | null;
  duration?: number | null;
};

// Shape of the `{ technician, customer }` payload from live tracking.
type LiveTracking = {
  technician?: { latitude?: number | string | null; longitude?: number | string | null; name?: string } | null;
  customer?: {
    latitude?: number | string | null;
    longitude?: number | string | null;
    name?: string;
    address?: string | null;
  } | null;
};

type UserRef = { uid?: string; name?: string; role?: string } | null | undefined;

type MapTrackerScreenProps = {
  currentUser?: UserRef;
  selectedJob?: JobItem | null;
  onBack?: () => void;
  onNavigateToJobs?: () => void;
};

// Derive the customer/destination marker strictly from the selected job.
// The pin is `null` when the job has no real lat/lng yet and is only filled by
// geocoding, the live-tracking poll, or the GPS watcher -- see
// ./trackingGeometry for why fabricating a default broke the map.
// A technician viewing someone else's job sees that customer's name; the
// customer sees their own.
const deriveCustomerCoords = (job: JobItem | null | undefined, isTechnician: boolean, currentUser: UserRef) =>
  customerPinFromJob(
    job,
    isTechnician ? (job?.customerName || 'Customer') : (currentUser?.name || 'Customer')
  );

const resetJobScopedRouteState = (setters: {
  setRouteCoordinates: (value: number[][]) => void;
  setDistanceKm: (value: number | null) => void;
  setTravelMinutes: (value: number | null) => void;
  setIsRouting: (value: boolean) => void;
}) => {
  setters.setRouteCoordinates([]);
  setters.setDistanceKm(null);
  setters.setTravelMinutes(null);
  setters.setIsRouting(false);
};

export default function MapTrackerScreen({ currentUser, selectedJob: initialJob, onBack, onNavigateToJobs }: MapTrackerScreenProps) {
  const [activeJob, setActiveJob] = useState<JobItem | null>(initialJob ?? null);

  // Sync activeJob when initialJob prop changes from parent navigation
  useEffect(() => {
    if (initialJob) {
      setActiveJob(initialJob);
      setCustomerCoords(deriveCustomerCoords(initialJob, false, currentUser));
      resetJobScopedRouteState({ setRouteCoordinates, setDistanceKm, setTravelMinutes, setIsRouting });
    }
  }, [currentUser, initialJob]);

  const isAccepted = ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(activeJob?.status ?? '');

  // Always reflect the currently selected job. Any late response from a
  // previous job (route request, geocode, refresh) is discarded with this ref.
  const activeJobIdRef = useRef(activeJob?.id);
  useEffect(() => {
    activeJobIdRef.current = activeJob?.id;
  }, [activeJob?.id]);

  // Central safety net: whenever the active job changes through any path,
  // clear every piece of job-scoped route/marker state so a previous job's
  // customer or route can never bleed into the new one.
  useEffect(() => {
    setRouteCoordinates([]);
    setDistanceKm(null);
    setTravelMinutes(null);
  }, [activeJob?.id]);

  // The customer's technician pin starts empty. Only the live-tracking poll (or
  // the live tracking response) fills it - never the job's coordinates, so the
  // technician pin can never sit on the customer's home.
  const initialTechnicianCoords: MapCoord | null = null;

  const initialCustomerCoords = useMemo(
    () => deriveCustomerCoords(activeJob, false, currentUser),
    [currentUser, activeJob]
  );

  const [technicianCoords, setTechnicianCoords] = useState<MapCoord | null>(initialTechnicianCoords);
  const [customerCoords, setCustomerCoords] = useState<MapCoord>(initialCustomerCoords);
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [travelMinutes, setTravelMinutes] = useState<number | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  // Sync state when initialCoords change
  useEffect(() => {
    setTechnicianCoords(initialTechnicianCoords);
    setCustomerCoords(initialCustomerCoords);
  }, [initialTechnicianCoords, initialCustomerCoords]);

  // Geocode address dynamically if coordinates were missing or need verification
  useEffect(() => {
    if (!activeJob?.location) return;
    const jobId = activeJob.id;
    // Captured before the async callback: property narrowing does not survive
    // into a nested closure.
    const jobLocation = activeJob.location;
    const lat = Number(activeJob.latitude);
    const lon = Number(activeJob.longitude);
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0;

    if (!hasValidCoords) {
      // API-only precise geocode: the tracking destination must never snap to
      // a coarse barangay-center fallback, or the pin lands ~1km off.
      geocodeAddressPrecise(activeJob.location).then((res) => {
        if (jobId !== activeJobIdRef.current) return;
        if (res?.latitude && res?.longitude) {
          setCustomerCoords((prev) => ({
            ...prev,
            latitude: res.latitude,
            longitude: res.longitude,
            address: jobLocation,
          }));
        }
      }).catch((err) => console.warn('Geocoding job location failed:', err));
    }
  }, [activeJob?.id, activeJob?.location, activeJob?.latitude, activeJob?.longitude]);

  // GPS Watcher
  useEffect(() => {
    if (!isAccepted || !activeJob?.id) return undefined;
    // On web the pins come from the job/account rows via live-tracking. A
    // browser geolocation would overwrite the correct customer position (and be
    // written back to the job), so GPS-over-GPS updates are native-only.
    if (Platform.OS === 'web') return undefined;
    let active = true;
    let watcher: Location.LocationSubscription | null = null;
    // Captured for the watcher callback; narrowing does not cross the closure.
    const jobId = activeJob.id;
    const uid = currentUser?.uid;
    if (!uid) return undefined;

    const syncLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;

        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 15 },
          async (pos) => {
            const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            if (!active) return;
            try { await updateCustomerLocation(jobId, uid, next); } catch (e) {}
          }
        );
      } catch (err) {
        console.warn('GPS watcher error:', err);
      }
    };

    syncLocation();
    return () => { active = false; watcher?.remove(); };
  }, [currentUser, isAccepted, activeJob?.id]);

  // Live tracking: fetch the other party's REAL location so the technician pin
  // is placed at the technician's position and the customer pin at the
  // customer's position - never mixed up. The response is an explicit split
  // `{ technician, customer }` object so the two roles map 1:1 to markers.
  useEffect(() => {
    if (!isAccepted || !activeJob?.id) return undefined;
    let active = true;
    const jobId = activeJob.id;

    const refresh = async () => {
      try {
        const tracking = (await fetchJobLiveTracking(jobId)) as LiveTracking | null;
        if (!active || !tracking) return;

        const techLat = Number(tracking.technician?.latitude);
        const techLon = Number(tracking.technician?.longitude);
        if (Number.isFinite(techLat) && Number.isFinite(techLon) && techLat !== 0) {
          setTechnicianCoords({
            latitude: techLat,
            longitude: techLon,
            name: tracking.technician?.name || activeJob?.technicianName || 'Technician',
          });
        }

        const custLat = Number(tracking.customer?.latitude);
        const custLon = Number(tracking.customer?.longitude);
        if (Number.isFinite(custLat) && Number.isFinite(custLon) && custLat !== 0) {
          setCustomerCoords((prev) => ({
            ...prev,
            latitude: custLat,
            longitude: custLon,
            name: tracking.customer?.name || prev.name,
            address: tracking.customer?.address || prev.address,
          }));
        }
      } catch (error) {
        console.warn('Live tracking refresh failed:', error);
      }
    };

    refresh();
    const intervalId = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(intervalId); };
  }, [activeJob?.id, activeJob?.technicianName, isAccepted]);

  // Compute road route via LocationIQ (with automatic caching and straight-line fallback)
  useEffect(() => {
    let isMounted = true;
    const jobId = activeJob?.id;
    const loadRoute = async (origin: MapCoord | null, destination: MapCoord | null) => {
      if (!isAccepted || !destination?.latitude || !origin?.latitude) {
        if (jobId === activeJobIdRef.current) setRouteCoordinates([]);
        return;
      }
      try {
        const route = (await getDrivingRoute(origin, destination)) as DrivingRoute | null;
        // Discard stale responses: the technician may have switched to
        // another customer while this route request was in flight, and that
        // previous job's line must never overwrite the current one.
        if (isMounted && jobId === activeJobIdRef.current && route && route.geometry?.coordinates) {
          setRouteCoordinates(route.geometry.coordinates.map(([lon, lat]) => [lat, lon]));
          if (route.distance) setDistanceKm(Number((route.distance / 1000).toFixed(1)));
          if (route.duration) setTravelMinutes(Math.max(1, Math.round(route.duration / 60)));
        }
      } catch (e) {
        console.warn('Driving route load notice:', e);
      }
    };

    loadRoute(technicianCoords, customerCoords);
    return () => { isMounted = false; };
  }, [customerCoords?.latitude, customerCoords?.longitude, technicianCoords?.latitude, technicianCoords?.longitude, isAccepted, activeJob?.id]);

  // Fallback distance calculation if driving route distance is pending
  useEffect(() => {
    if (distanceKm == null) {
      const calc = distanceInKm(technicianCoords, customerCoords);
      if (calc != null) {
        setDistanceKm(Number(calc.toFixed(1)));
        setTravelMinutes(Math.max(1, Math.round((calc / 25) * 60)));
      }
    }
  }, [technicianCoords, customerCoords, distanceKm]);

  // Handler: Open Turn-by-Turn GPS navigation in Google Maps / Apple Maps
  const handleOpenGoogleMapsNavigation = async () => {
    if (!customerCoords?.latitude || !customerCoords?.longitude) {
      Alert.alert('Location Loading', 'Please wait a moment while the customer location is resolved.');
      return;
    }
    const destLat = customerCoords.latitude;
    const destLng = customerCoords.longitude;
    const label = encodeURIComponent(customerCoords.address || customerCoords.name || 'Customer Location');

    const appUrl = Platform.select({
      ios: `maps:0,0?q=${label}&daddr=${destLat},${destLng}`,
      android: `google.navigation:q=${destLat},${destLng}&mode=d`
    });
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;

    try {
      // Platform.select returns undefined off-platform, so fall back to the web
      // link up front rather than letting canOpenURL throw on undefined.
      const target = appUrl ?? webUrl;
      const canOpen = await Linking.canOpenURL(target);
      if (canOpen) {
        await Linking.openURL(target);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch (err) {
      await Linking.openURL(webUrl);
    }
  };

  // Handler: Re-calculate and center in-app route
  const handleRefreshInAppRoute = async () => {
    const jobId = activeJob?.id;
    const origin = technicianCoords;
    const destination = customerCoords;
    setIsRouting(true);
    try {
      const route = (await getDrivingRoute(origin, destination)) as DrivingRoute | null;
      if (jobId !== activeJobIdRef.current) return;
      if (route && route.geometry?.coordinates) {
        setRouteCoordinates(route.geometry.coordinates.map(([lon, lat]) => [lat, lon]));
        // distance/duration always accompany a real geometry; defaulting keeps
        // the display deterministic instead of rendering "NaN km".
        const dist = (Number(route.distance ?? 0) / 1000).toFixed(1);
        const mins = Math.max(1, Math.round(Number(route.duration ?? 0) / 60));
        setDistanceKm(Number(dist));
        setTravelMinutes(mins);
        Alert.alert('Route Centered', `Driving distance: ${dist} km\nEstimated travel time: ~${mins} minutes.`);
      } else {
        Alert.alert('Route Centered', 'In-app road path refreshed.');
      }
    } catch (e) {
      Alert.alert('Notice', 'Driving route re-centered.');
    } finally {
      setIsRouting(false);
    }
  };

  // If no job is active
  if (!activeJob) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="map-outline" size={48} color={colors.customer} />
        </View>
        <Text style={styles.emptyTitle}>No Active Request</Text>
        <Text style={styles.emptySubtitle}>
          Open an accepted request from your Requests tab to track the assigned technician.
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={18} color={colors.onAccent} />
          <Text style={styles.emptyButtonText}>Back to Requests</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <LocationIQMap
          key={activeJob?.id || 'job'}
          technicianCoords={currentUser?.role === 'customer' ? technicianCoords : null}
          customerCoords={currentUser?.role === 'technician' ? customerCoords : null}
          routeCoordinates={routeCoordinates}
          currentUserRole={currentUser?.role || 'customer'}
          isAccepted={isAccepted}
          style={styles.map}
        />
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.tripRow}>
          <View style={styles.tripCell}>
            <View style={styles.tripIconWrap}><Ionicons name="navigate-outline" size={14} color={colors.customer} /></View>
            <Text style={styles.tripLabel}>DISTANCE</Text>
            <Text style={styles.tripValue}>{distanceKm != null ? `${distanceKm} km` : '--'}</Text>
          </View>
          <View style={styles.tripDivider} />
          <View style={styles.tripCell}>
            <View style={styles.tripIconWrap}><Ionicons name="time-outline" size={14} color={colors.customer} /></View>
            <Text style={styles.tripLabel}>ETA</Text>
            <Text style={styles.tripValue}>{travelMinutes != null ? `${travelMinutes} min` : (routeCoordinates.length ? 'In app' : '--')}</Text>
          </View>
          <View style={styles.tripDivider} />
          <View style={styles.tripCell}>
            <View style={[styles.tripIconWrap, isAccepted && technicianCoords?.latitude != null && styles.tripIconWrapActive]}><Ionicons name={isAccepted && technicianCoords?.latitude != null ? "locate-outline" : "radio-outline"} size={14} color={isAccepted && technicianCoords?.latitude != null ? colors.white : colors.muted} /></View>
            <Text style={styles.tripLabel}>TRACKING</Text>
            <Text style={[styles.tripValue, isAccepted && technicianCoords?.latitude != null && styles.tripValueActive]}>{isAccepted ? (technicianCoords?.latitude != null ? 'Active' : 'Locating...') : 'Locked'}</Text>
          </View>
        </View>

        <View style={styles.destinationRow}>
          <View style={styles.personIconWrap}><Ionicons name="person-outline" size={18} color={colors.customer} /></View>
          <View style={styles.destinationCopy}>
            <Text style={styles.destinationKicker}>SERVICE DESTINATION</Text>
            <Text style={styles.destinationName} numberOfLines={1}>{customerCoords.name}</Text>
            <Text style={styles.destinationMeta} numberOfLines={1}>{activeJob?.applianceType || 'Repair request'} - {customerCoords.latitude != null ? customerCoords.address : 'Resolving location...'}</Text>
          </View>
        </View>

        <Pressable style={styles.primaryCta} onPress={handleOpenGoogleMapsNavigation} accessibilityRole="button">
          <Text style={styles.primaryCtaText} numberOfLines={1}>Navigate in Google Maps GPS</Text>
        </Pressable>
        <Pressable style={styles.secondaryCta} onPress={handleRefreshInAppRoute} disabled={isRouting} accessibilityRole="button">
          {isRouting ? <ActivityIndicator color={colors.customer} size="small" /> : <Text style={styles.secondaryCtaText}>Center Route</Text>}
        </Pressable>
        {onBack && (
          <Pressable style={styles.quietCta} onPress={onBack} accessibilityRole="button">
            <Ionicons name="arrow-back-outline" size={16} color={colors.muted} />
            <Text style={styles.quietCtaText}>Back to Requests</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = themedStyles({
  container: { flex: 1, backgroundColor: colors.canvas },
  selectorBar: { position: 'absolute', right: 12, top: 12, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, boxShadow: '0 3px 8px rgba(16,42,67,0.15)' },
  selectorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  selectorKicker: { fontSize: 11, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.6 },
  collapseBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.collapseBtnBg, alignItems: 'center', justifyContent: 'center' },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.customer, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  expandBtnText: { color: colors.onAccent, fontSize: 11, fontFamily: fonts.bold },
  chipRow: { flexDirection: 'column', gap: 5 },
  jobChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  jobChipActive: { backgroundColor: colors.customer, borderColor: colors.customer },
  jobChipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted, marginRight: 6 },
  jobChipDotActive: { backgroundColor: colors.white },
  jobChipText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.ink },
  jobChipTextActive: { color: colors.onAccent },
  mapArea: { flex: 1, minHeight: 250, position: 'relative' },
  map: { flex: 1 },
  bottomPanel: { backgroundColor: colors.white, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 14, borderTopWidth: 1, borderTopColor: colors.lineSoft, boxShadow: '0 -4px 16px rgba(16,42,67,0.08)' },
  tripRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.tripRowBg, borderRadius: 12, borderWidth: 1, borderColor: colors.lineSoft, paddingVertical: 10, paddingHorizontal: 8, gap: 0 },
  tripCell: { flex: 1, alignItems: 'center', gap: 4 },
  tripIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center' },
  tripIconWrapActive: { backgroundColor: colors.customer, borderColor: colors.customer },
  tripLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.7, textTransform: 'uppercase' as const },
  tripValue: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] as const },
  tripValueActive: { color: colors.customer },
  tripDivider: { width: 1, height: 36, backgroundColor: colors.lineSoft },
  trackingValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted, opacity: 0.6 },
  liveDotActive: { backgroundColor: colors.customer, opacity: 1 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surfaceSunken },
  personIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  destinationCopy: { flex: 1, minWidth: 0 },
  destinationKicker: { color: colors.customer, fontSize: 10, letterSpacing: 1.0, fontFamily: fonts.bold, marginBottom: 2, textTransform: 'uppercase' as const },
  destinationName: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, lineHeight: 18 },
  destinationMeta: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, lineHeight: 15, marginTop: 2 },
  primaryCta: { height: 54, borderRadius: 13, backgroundColor: colors.customer, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, boxShadow: '0 4px 10px rgba(15,118,110,0.18)' },
  primaryCtaText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.1 },
  secondaryCta: { height: 46, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.customer, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  secondaryCtaText: { color: colors.customer, fontSize: 13, fontFamily: fonts.bold },
  quietCta: { height: 44, borderRadius: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  quietCtaText: { color: colors.muted, fontSize: 13, fontFamily: fonts.semiBold },
  // Empty State Styles
  emptyContainer: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { color: colors.ink, fontSize: 21, fontFamily: fonts.bold, marginBottom: 8 },
  emptySubtitle: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 24, fontFamily: fonts.medium },
  emptyButton: { height: 48, borderRadius: 14, backgroundColor: colors.customer, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
});

