import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
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
  fetchTechnicianJobs,
  updateTechnicianLocation
} from '../../services/api';
import { geocodeAddressPrecise, getDrivingRoute } from '../../services/locationIq';
import { colors, fonts, themedStyles } from '../../theme';
import { getApplianceIcon } from '../../utils/applianceIcons';
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
  preferredDate?: string | null;
  preferredTime?: string | null;
  scheduledDate?: string | null;
};

type MapCoord = {
  latitude: number | null;
  longitude: number | null;
  name: string;
  // Only the customer/destination pin carries an address.
  address?: string;
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

type DrivingRoute = {
  // [lng, lat] pairs exactly as LocationIQ returns them.
  geometry?: { coordinates?: Array<[number, number]> } | null;
  distance?: number | null;
  duration?: number | null;
};

type UserRef = {
  uid?: string;
  name?: string;
  role?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
} | null | undefined;

type TechnicianTrackerScreenProps = {
  currentUser?: UserRef;
  selectedJob?: JobItem | null;
  onBack?: () => void;
  onNavigateToJobs?: () => void;
};

// The customer/destination pin comes ONLY from the selected job (or the
// live-tracking customer field). It never falls back to the technician's own
// coordinates, so the two pins can never be swapped on the technician screen.
// This screen always labels the pin with the job's own customer name.
const deriveCustomerCoords = (job: JobItem | null | undefined) =>
  customerPinFromJob(job, job?.customerName || 'Customer');

/**
 * Dedicated technician-side tracker.
 *
 * Kept completely separate from the customer tracker so a change on one side
 * can never affect the other. The technician sees:
 *  - their own live pin (their account GPS / stored location),
 *  - the customer's pin at the job location,
 *  - a driving route that STAYS drawn and connected to the customer's location
 *    until the technician arrives - rail-GPS updates never re-center or clear it.
 */
export default function TechnicianTrackerScreen({ currentUser, selectedJob: initialJob, onBack, onNavigateToJobs }: TechnicianTrackerScreenProps) {
  const [activeJob, setActiveJob] = useState<JobItem | null>(initialJob ?? null);
  const [acceptedJobsList, setAcceptedJobsList] = useState<JobItem[]>([]);
  const [loadingActiveJob, setLoadingActiveJob] = useState(false);
  const [jobsExpanded, setJobsExpanded] = useState(false);

  // Load the technician's active jobs so they can switch between customers.
  useEffect(() => {
    if (!currentUser?.uid) return;
    setLoadingActiveJob(true);
    fetchTechnicianJobs(currentUser.uid)
      .then((jobs) => {
        const activeList: JobItem[] = Array.isArray(jobs)
          ? jobs.filter((j) => ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(j.status))
          : [];
        setAcceptedJobsList(activeList);
        const first = activeList[0];
        if (!initialJob && first) {
          setActiveJob(first);
          setCustomerCoords(deriveCustomerCoords(first));
        }
      })
      .catch((err) => console.warn('Could not load active jobs:', err))
      .finally(() => setLoadingActiveJob(false));
  }, [currentUser?.uid, initialJob]);

  // Sync the active job when the parent changes the selected job.
  useEffect(() => {
    if (initialJob) {
      setActiveJob(initialJob);
      setCustomerCoords(deriveCustomerCoords(initialJob));
    }
  }, [initialJob, currentUser]);

  const isAccepted = ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(activeJob?.status ?? '');

  // Discard any stale response from a previously selected job.
  const activeJobIdRef = useRef(activeJob?.id);
  useEffect(() => {
    activeJobIdRef.current = activeJob?.id;
  }, [activeJob?.id]);

  // On job switch: reset route/metrics and mark that a fresh route is needed.
  const routeDrawnRef = useRef(false);
  useEffect(() => {
    setRouteCoordinates([]);
    setDistanceKm(null);
    setTravelMinutes(null);
    routeDrawnRef.current = false;
  }, [activeJob?.id]);

  // Own location: the technician's account position (their real GPS on native;
  // on web the live-tracking poll reflects the stored/driven location).
  const initialOwnCoords = useMemo<MapCoord>(() => {
    const lat = Number(currentUser?.latitude);
    const lon = Number(currentUser?.longitude);
    return {
      latitude: Number.isFinite(lat) && lat !== 0 ? lat : null,
      longitude: Number.isFinite(lon) && lon !== 0 ? lon : null,
      name: currentUser?.name || 'Technician',
    };
  }, [currentUser]);

  const initialCustomerCoords = useMemo(() => deriveCustomerCoords(activeJob), [activeJob]);

  const [ownCoords, setOwnCoords] = useState<MapCoord>(initialOwnCoords);
  const [customerCoords, setCustomerCoords] = useState<MapCoord>(initialCustomerCoords);
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [travelMinutes, setTravelMinutes] = useState<number | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  // Sync state when initial coords change (e.g. an updated account row).
  useEffect(() => {
    setOwnCoords(initialOwnCoords);
    setCustomerCoords(initialCustomerCoords);
  }, [initialOwnCoords, initialCustomerCoords]);

  // Geocode the destination address if the job has no coordinates yet.
  useEffect(() => {
    if (!activeJob?.location) return;
    const jobId = activeJob.id;
    const lat = Number(activeJob.latitude);
    const lon = Number(activeJob.longitude);
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0;
    if (hasValidCoords) return;
    // Captured before the async callback: property narrowing does not survive
    // into a nested closure.
    const jobLocation = activeJob.location;
    // API-only precise geocode: the tracking destination must never snap to a
    // coarse barangay-center fallback, or the technician navigates ~1km off.
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
  }, [activeJob?.id, activeJob?.location, activeJob?.latitude, activeJob?.longitude]);

  // GPS watcher for the technician's own position. Native-only: on web the pins
  // come from the rows via live-tracking, so a browser geolocation never
  // overwrites (or writes back) coordinates in this side either.
  useEffect(() => {
    if (!isAccepted || !activeJob?.id) return undefined;
    if (Platform.OS === 'web') return undefined;
    let active = true;
    let watcher: Location.LocationSubscription | null = null;
    // Captured for the watcher callback; narrowing does not cross the closure.
    const uid = currentUser?.uid;
    if (!uid) return undefined;
    const syncLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 15 },
          async (pos) => {
            const next = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,              name: currentUser?.name || 'Technician',
            };

            if (active) setOwnCoords(next);
            try { await updateTechnicianLocation(uid, next); } catch (e) {}
          }
        );
      } catch (err) {
        console.warn('GPS watcher error:', err);
      }
    };
    syncLocation();
    return () => { active = false; watcher?.remove(); };
  }, [currentUser, isAccepted, activeJob?.id]);

  // Live tracking: the technician always sees THEIR OWN pin from the
  // technician field and the CUSTOMER pin from the customer field - 1:1, never
  // swapped. Route/markers are updated imperatively, never re-centered.
  useEffect(() => {
    if (!isAccepted || !activeJob?.id) return undefined;
    let active = true;
    const jobId = activeJob.id;
    const refresh = async () => {
      try {
        const tracking = (await fetchJobLiveTracking(jobId)) as LiveTracking | null;
        if (!active || !tracking) return;

        const ownLat = Number(tracking.technician?.latitude);
        const ownLon = Number(tracking.technician?.longitude);
        if (Number.isFinite(ownLat) && Number.isFinite(ownLon) && ownLat !== 0) {
          setOwnCoords({
            latitude: ownLat,
            longitude: ownLon,
            name: tracking.technician?.name || currentUser?.name || 'Technician',
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
  }, [activeJob?.id, currentUser, isAccepted]);

  // Driving route: computed from the technician to the customer. The route is
  // drawn once both sides have coordinates and then STAYS on the map. It is
  // recomputed only when the CUSTOMER's destination actually changes (or on a
  // job switch), never on the technician's own GPS ticks - so the line remains
  // connected to the customer until the technician arrives.
  const routeDestinationRef = useRef<{ lat: number | null; lng: number | null } | null>(null);
  const destinationMoved = (destination: MapCoord) => {
    const prev = routeDestinationRef.current;
    // No previous destination, or either side unresolved: always recompute.
    if (!prev || prev.lat == null || prev.lng == null) return true;
    if (destination.latitude == null || destination.longitude == null) return true;
    return (
      Math.abs(destination.latitude - prev.lat) >= 0.001 ||
      Math.abs(destination.longitude - prev.lng) >= 0.001
    );
  };

  useEffect(() => {
    let isMounted = true;
    const jobId = activeJob?.id;
    const origin = ownCoords;
    const destination = customerCoords;

    if (!isAccepted) return undefined;

    const compute = async () => {
      try {
        const route = (await getDrivingRoute(origin, destination)) as DrivingRoute | null;
        if (!isMounted || jobId !== activeJobIdRef.current || !route || !route.geometry?.coordinates) return;
        setRouteCoordinates(route.geometry.coordinates.map(([lon, lat]) => [lat, lon]));
        if (route.distance) setDistanceKm(Number((route.distance / 1000).toFixed(1)));
        if (route.duration) setTravelMinutes(Math.max(1, Math.round(route.duration / 60)));
        routeDrawnRef.current = true;
        routeDestinationRef.current = { lat: destination.latitude, lng: destination.longitude };
      } catch (e) {
        console.warn('Driving route load notice:', e);
      }
    };

    if (origin?.latitude && destination?.latitude) {
      if (!routeDrawnRef.current || destinationMoved(destination)) compute();
    }
    return () => { isMounted = false; };
  }, [
    customerCoords?.latitude,
    customerCoords?.longitude,
    ownCoords?.latitude,
    ownCoords?.longitude,
    isAccepted,
    activeJob?.id,
  ]);

  // Fallback straight-line distance/metrics while the driving route is pending.
  useEffect(() => {
    if (distanceKm == null) {
      const calc = distanceInKm(ownCoords, customerCoords);
      if (calc != null) {
        setDistanceKm(Number(calc.toFixed(1)));
        setTravelMinutes(Math.max(1, Math.round((calc / 25) * 60)));
      }
    }
  }, [ownCoords, customerCoords, distanceKm]);

  const arrived = distanceKm != null && distanceKm <= 0.05;

  // Open turn-by-turn navigation in Google Maps / Apple Maps.
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
      android: `google.navigation:q=${destLat},${destLng}&mode=d`,
    });
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
    try {
      // Platform.select returns undefined off-platform, so fall back to the web
      // link up front rather than letting canOpenURL throw on undefined.
      const target = appUrl ?? webUrl;
      const canOpen = await Linking.canOpenURL(target);
      if (canOpen) await Linking.openURL(target);
      else await Linking.openURL(webUrl);
    } catch (err) {
      await Linking.openURL(webUrl);
    }
  };

  // Re-center the in-app map on the current route.
  const handleCenterRoute = async () => {
    const jobId = activeJob?.id;
    setIsRouting(true);
    try {
      const route = (await getDrivingRoute(ownCoords, customerCoords)) as DrivingRoute | null;
      if (jobId !== activeJobIdRef.current) return;
      if (route && route.geometry?.coordinates) {
        setRouteCoordinates(route.geometry.coordinates.map(([lon, lat]) => [lat, lon]));
        routeDrawnRef.current = true;
        if (customerCoords) routeDestinationRef.current = { lat: customerCoords.latitude, lng: customerCoords.longitude };
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

  // Switch between accepted customers instantly.
  const handleSwitchJob = (job: JobItem) => {
    setActiveJob(job);
    setCustomerCoords(deriveCustomerCoords(job));
    routeDrawnRef.current = false;
    setJobsExpanded(false);
  };

  const formatSchedule = (job: JobItem | null | undefined) => {
    if (job?.scheduledDate) return job.scheduledDate;
    if (job?.preferredDate && job?.preferredTime) return `${job.preferredDate} - ${job.preferredTime}`;
    if (job?.preferredDate) return job.preferredDate;
    if (job?.preferredTime) return job.preferredTime;
    return job?.status || 'Scheduled';
  };

  if (!activeJob && !loadingActiveJob) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="map-outline" size={42} color={colors.tech} />
        </View>
        <Text style={styles.emptyTitle}>No Active Job Selected</Text>
        <Text style={styles.emptySubtitle}>
          Select an accepted repair from your Jobs feed to start turn-by-turn navigation to the customer's home.
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={onNavigateToJobs || onBack} activeOpacity={0.88}>
          <Ionicons name="briefcase-outline" size={18} color={colors.onAccent} />
          <Text style={styles.emptyButtonText}>Go to My Jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* MAP HERO - largest visual area, hero treatment */}
      <View style={styles.mapArea}>
        <LocationIQMap
          key={activeJob?.id || 'tech-job'}
          technicianCoords={ownCoords}
          customerCoords={customerCoords}
          routeCoordinates={routeCoordinates}
          currentUserRole="technician"
          isAccepted={isAccepted}
          style={styles.map}
        />

        {/* Unified map control family - white surface, subtle border/shadow, 44px min touch */}
        {acceptedJobsList.length > 1 && !jobsExpanded && (
          <View style={styles.mapControlsGroup} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.activeJobsControl}
              onPress={() => setJobsExpanded(true)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Show active jobs"
            >
              <View style={styles.activeJobsControlLeft}>
                <View style={styles.activeJobsIconWrap}>
                  <Ionicons name="briefcase-outline" size={16} color={colors.tech} />
                </View>
                <Text style={styles.activeJobsLabel}>Active</Text>
                <View style={[styles.activeJobsBadge, acceptedJobsList.length >= 6 && { backgroundColor: colors.danger, borderWidth: 1, borderColor: colors.danger }]}>
                  <Text style={styles.activeJobsBadgeText}>{acceptedJobsList.length}</Text>
                </View>
              </View>
              <Ionicons name="chevron-down-outline" size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* BOTTOM NAVIGATION PANEL - single coherent dispatch workspace */}
      <View style={styles.bottomPanel}>
        {/* ACTIVE JOBS - expanded utility (when toggled) */}
        {acceptedJobsList.length > 1 && jobsExpanded && (
          <View style={styles.activeJobsExpanded}>
            <TouchableOpacity
              style={styles.activeJobsExpandedHeader}
              onPress={() => setJobsExpanded(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <View style={styles.activeJobsExpandedHeaderLeft}>
                <Ionicons name="briefcase-outline" size={15} color={colors.tech} />
                <Text style={styles.activeJobsExpandedTitle}>Active jobs</Text>
                <View style={[styles.activeJobsBadge, acceptedJobsList.length >= 6 && { backgroundColor: colors.danger, borderWidth: 1, borderColor: colors.danger }]}>
                  <Text style={styles.activeJobsBadgeText}>{acceptedJobsList.length}</Text>
                </View>
              </View>
              <View style={styles.collapseBtn}>
                <Ionicons name="chevron-up-outline" size={16} color={colors.muted} />
              </View>
            </TouchableOpacity>

            <View style={styles.jobsList}>
              {acceptedJobsList.map((job) => {
                const isSelected = activeJob?.id === job.id;
                const iconName = getApplianceIcon(job.applianceType) as any;
                return (
                  <TouchableOpacity
                    key={job.id}
                    style={[styles.jobRow, isSelected && styles.jobRowSelected]}
                    onPress={() => handleSwitchJob(job)}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[styles.jobIconWrap, isSelected && styles.jobIconWrapSelected]}>
                      <Ionicons
                        name={iconName}
                        size={16}
                        color={isSelected ? colors.white : colors.tech}
                      />
                    </View>
                    <View style={styles.jobCopy}>
                      <Text
                        style={[styles.jobName, isSelected && styles.jobNameSelected]}
                        numberOfLines={1}
                      >
                        {job.applianceType || 'Repair request'}
                      </Text>
                      <Text
                        style={[styles.jobCustomer, isSelected && styles.jobCustomerSelected]}
                        numberOfLines={1}
                      >
                        {job.customerName || 'Customer'} - {formatSchedule(job)}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.selectedCheck}>
                        <Ionicons name="checkmark" size={14} color={colors.tech} />
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward-outline" size={14} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* When collapsed but has jobs, show inline compact bar at top of panel alternative position - only if not overlaying map? We keep map overlay for collapsed to save panel space. */}

        {/* TRIP SUMMARY - single coherent navigation summary - white circular icons like customer */}
        <View style={styles.tripSummary}>
          <View style={styles.tripCell}>
            <View style={styles.tripIconWrap}><Ionicons name="navigate-outline" size={14} color={colors.tech} /></View>
            <Text style={styles.tripLabel}>DISTANCE</Text>
            <Text style={styles.tripValue} numberOfLines={1}>
              {distanceKm != null ? `${distanceKm} km` : '--'}
            </Text>
          </View>

          <View style={styles.tripDivider} />

          <View style={styles.tripCell}>
            <View style={styles.tripIconWrap}><Ionicons name="time-outline" size={14} color={colors.tech} /></View>
            <Text style={styles.tripLabel}>ETA</Text>
            <Text style={styles.tripValue} numberOfLines={1}>
              {travelMinutes != null ? `${travelMinutes} min` : routeCoordinates.length ? 'Live' : '--'}
            </Text>
          </View>

          <View style={styles.tripDivider} />

          <View style={styles.tripCell}>
            <View style={[styles.tripIconWrap, isAccepted && ownCoords?.latitude != null && !arrived && styles.tripIconWrapActive]}><Ionicons name={isAccepted && ownCoords?.latitude != null && !arrived ? "locate-outline" : "radio-outline"} size={14} color={isAccepted && ownCoords?.latitude != null && !arrived ? colors.white : colors.muted} /></View>
            <Text style={styles.tripLabel}>TRACKING</Text>
            <Text style={[styles.tripValue, isAccepted && ownCoords?.latitude != null && !arrived && styles.tripValueActive]} numberOfLines={1}>{isAccepted ? (arrived ? 'Arrived' : ownCoords?.latitude != null ? 'Active' : 'Locating...') : 'Locked'}</Text>
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {/* SERVICE DESTINATION - matches Customer Map alignment */}
        <View style={styles.destinationRow}>
          <View style={styles.personIconWrap}>
            <Ionicons name="person-outline" size={18} color={colors.tech} />
          </View>
          <View style={styles.destinationCopy}>
            <Text style={styles.destinationKicker}>SERVICE DESTINATION</Text>
            <Text style={styles.destinationName} numberOfLines={1}>{customerCoords.name}</Text>
            <Text style={styles.destinationMeta} numberOfLines={1}>{activeJob?.applianceType || 'Repair request'} - {customerCoords.latitude != null ? customerCoords.address : 'Resolving location...'}</Text>
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {/* PRIMARY NAVIGATION - strongest action */}
        <TouchableOpacity
          style={styles.primaryCta}
          onPress={handleOpenGoogleMapsNavigation}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Navigate in Google Maps"
        >
          <Text style={styles.primaryCtaText}>Navigate in Google Maps GPS</Text>
        </TouchableOpacity>

        {/* SECONDARY ACTIONS - subordinate to primary */}
        <View style={styles.secondaryGroup}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleCenterRoute}
            disabled={isRouting}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Center route"
          >
            {isRouting ? (
              <ActivityIndicator color={colors.tech} size="small" />
            ) : (
              <Text style={styles.secondaryBtnText}>Center Route</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quietBtn}
            onPress={onBack || onNavigateToJobs}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Back to jobs"
          >
            <Ionicons name="arrow-back-outline" size={16} color={colors.muted} />
            <Text style={styles.quietBtnText}>Back to jobs</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles({
  container: { flex: 1, backgroundColor: colors.canvas },

  // Map hero - dominant
  mapArea: { flex: 1, minHeight: 280, position: 'relative', backgroundColor: colors.mapBg },
  map: { flex: 1 },

  // Map controls - native navigation family
  mapControlsGroup: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
    alignItems: 'flex-start',
  },
  activeJobsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 168,
    maxWidth: 240,
    // subtle shadow, not excessive
    boxShadow: '0 2px 8px rgba(16,42,67,0.08)',
    gap: 12,
  },
  activeJobsControlLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeJobsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeJobsLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  activeJobsBadge: {
    backgroundColor: colors.ink,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  activeJobsBadgeText: { color: colors.onAccent, fontSize: 11, fontFamily: fonts.bold, textAlign: 'center' },

  // Bottom panel - ONE coherent navigation workspace
  bottomPanel: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    boxShadow: '0 -4px 16px rgba(16,42,67,0.08)',
    gap: 14,
  },

  // Active jobs expanded inside panel
  activeJobsExpanded: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  activeJobsExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.slate50,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    minHeight: 44,
  },
  activeJobsExpandedHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeJobsExpandedTitle: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 0.3, textTransform: 'uppercase' },
  collapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobsList: { padding: 6, gap: 6 },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    gap: 10,
  },
  jobRowSelected: {
    backgroundColor: colors.tech,
    borderColor: colors.tech,
  },
  jobIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.tealLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hudBorder,
  },
  jobIconWrapSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  jobCopy: { flex: 1, minWidth: 0 },
  jobName: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, lineHeight: 16 },
  jobNameSelected: { color: colors.onAccent },
  jobCustomer: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 2, lineHeight: 14 },
  jobCustomerSelected: { color: 'rgba(255,255,255,0.9)' },
  selectedCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Trip summary - ONE compact surface - white circular icon backgrounds like customer
  tripSummary: {
    backgroundColor: colors.tripSummaryBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 72,
  },
  tripCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, gap: 4 },
  tripIconWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center' },
  tripIconWrapActive: { backgroundColor: colors.tech, borderColor: colors.tech },
  tripCellHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.7, textTransform: 'uppercase' as const },
  tripValue: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] as const, textAlign: 'center', marginTop: 2, lineHeight: 18 },
  tripValueActive: { color: colors.tech },
  trackingValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.muted, opacity: 0.6 },
  liveDotActive: { backgroundColor: colors.tech, opacity: 1 },
  tripDivider: { width: 1, backgroundColor: colors.line, alignSelf: 'stretch', marginVertical: 4, opacity: 0.9 },

  sectionDivider: { height: 1, backgroundColor: colors.lineSoft, marginHorizontal: 2 },

  // Service destination - hierarchy without card
  destinationSection: { gap: 8, paddingVertical: 2 },
  destinationKicker: { color: colors.tech, fontSize: 10, letterSpacing: 1.0, fontFamily: fonts.bold, marginBottom: 2, textTransform: 'uppercase' as const },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surfaceSunken },
  personIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  destinationCopy: { flex: 1, minWidth: 0 },
  destinationName: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, lineHeight: 18 },
  destinationMeta: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, lineHeight: 15, marginTop: 2 },

  // Primary CTA - strongest
  primaryCta: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.tech,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryCtaText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.1 },

  // Secondary group - subordinate
  secondaryGroup: { flexDirection: 'column', gap: 8 },
  secondaryBtn: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.tech,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  secondaryBtnText: { color: colors.tech, fontSize: 13, fontFamily: fonts.bold },
  quietBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  quietBtnText: { color: colors.muted, fontSize: 13, fontFamily: fonts.semiBold },

  // Empty state
  emptyContainer: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 18, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20, fontFamily: fonts.regular, paddingHorizontal: 12 },
  emptyButton: { height: 48, borderRadius: 12, backgroundColor: colors.tech, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160, justifyContent: 'center' },
  emptyButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
});
