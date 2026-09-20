import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Skeleton from '../../components/Skeleton';
import { cancelRepairRequest, confirmRepairRequest, fetchCompletedJobs, fetchCustomerRequests, fetchTechnicianRecommendations, markCustomerReady, submitTechnicianReview } from '../services/api';
import { colors, fonts, shadows } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusGuidance, getStatusIcon } from '../../utils/applianceIcons';
import type { ScheduleAvailability, TechnicianScheduleItem } from '../../types/schedule';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type StatusFilterKey = 'all' | 'pending' | 'active' | 'completed';
type RecState = 'loading' | 'loaded' | 'empty' | 'error';

interface ServiceRequest {
  id: string;
  status?: string;
  applianceType?: string;
  technicianName?: string;
  description?: string;
  createdAt?: string;
  location?: string;
  verificationCode?: string;
  preferredDate?: string;
  preferredTime?: string;
  scheduledDate?: string;
  photoUrl?: string | null;
}

interface CompletedJob {
  id: string;
  status?: string;
  applianceType?: string;
  technicianName?: string;
  completedAt?: string;
  createdAt?: string;
}

interface TechRecommendation {
  uid: string;
  name?: string;
  matchScore?: number;
  confidence?: number;
  reason?: string;
  rating?: number;
  totalReviews?: number;
  yearsExperience?: number;
  distanceKm?: number;
  skills?: string[];
  profileImage?: string;
  availability?: ScheduleAvailability;
  upcomingSchedule?: TechnicianScheduleItem[];
  activeJobs?: number;
  workloadStatus?: string;
}

interface RecommendationData {
  recommendations?: TechRecommendation[];
  ai?: string;
  note?: string;
}

interface RequestProgressScreenProps {
  customerName: string;
  customerUid?: string;
  acceptedOnly?: boolean;
  focusedJobId?: string | null;
  autoExpandReview?: boolean;
  onViewDetails: (request: ServiceRequest) => void;
  onTrackMap: (request: ServiceRequest) => void;
  onViewTechnicianProfile: (tech: TechRecommendation) => void;
  onMessageTechnician: (request: ServiceRequest, tech: TechRecommendation) => void;
}

const ACTIVE_STATUSES = ['accepted', 'confirmed', 'customer ready', 'in progress'];
const PROGRESS_STEPS = ['Accepted', 'Confirmed', 'Ready', 'In Progress'];

const progressIndexOf = (status: string | undefined): number => {
  switch (String(status ?? '').toLowerCase()) {
    case 'accepted': return 0;
    case 'confirmed': return 1;
    case 'customer ready': return 2;
    case 'in progress': return 3;
    default: return -1;
  }
};

const statusIconName = (status: string | undefined): IconName =>
  getStatusIcon(status) as IconName;

const applianceIconName = (type: string | undefined): IconName =>
  getApplianceIcon(type ?? '') as IconName;

const formatCardDate = (iso: string | undefined): string => {
  if (!iso) return 'Date unavailable';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Date unavailable';
  return new Date(iso).toLocaleDateString();
};

export default function RequestProgressScreen({ customerName, customerUid, acceptedOnly = false, focusedJobId = null, autoExpandReview = false, onViewDetails, onTrackMap, onViewTechnicianProfile, onMessageTechnician }: RequestProgressScreenProps): React.JSX.Element {
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [trackedRequests, setTrackedRequests] = useState<ServiceRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>(acceptedOnly ? 'active' : 'all');
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewSubmitting, setReviewSubmitting] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, RecommendationData>>({});
  const [recommendationsRefresh, setRecommendationsRefresh] = useState<{ run?: number }>({});
  const [recStates, setRecStates] = useState<Record<string, RecState>>({});
  const recommendationsFetched = useRef<Record<string, boolean>>({});

  const fetchAll = (): Promise<void> => {
    let failed = false;
    return Promise.all([
      fetchCompletedJobs(customerName, customerUid)
        .then((data) => setCompletedJobs(Array.isArray(data) ? (data as CompletedJob[]) : []))
        .catch(() => { failed = true; setCompletedJobs([]); }),
      fetchCustomerRequests(customerName, customerUid)
        .then((data) => setTrackedRequests(Array.isArray(data) ? (data as ServiceRequest[]) : []))
        .catch(() => { failed = true; setTrackedRequests([]); }),
    ]).then(() => { setFetchError(failed); });
  };

  useEffect(() => {
    if (focusedJobId) return;
    setStatusFilter(acceptedOnly ? 'active' : 'all');
  }, [acceptedOnly, focusedJobId]);

  // Deep-link from notification: focus exact completed/active job and expose review
  useEffect(() => {
    if (!focusedJobId) return;
    const lower = String(focusedJobId).trim();
    if (!lower) return;
    const isCompleted = completedJobs.some((j) => String(j.id) === lower);
    const isActive = trackedRequests.some((r) => String(r.id) === lower && ACTIVE_STATUSES.includes(String(r.status || '').toLowerCase()));
    const isPending = trackedRequests.some((r) => String(r.id) === lower && String(r.status || '').toLowerCase() === 'pending');
    if (isCompleted || autoExpandReview) {
      setStatusFilter('completed');
      if (autoExpandReview) setExpandedReviewId(lower);
    } else if (isActive) {
      setStatusFilter('active');
    } else if (isPending) {
      setStatusFilter('pending');
    } else if (autoExpandReview) {
      // Completed job not yet in local list (e.g. just completed) – still show completed filter
      setStatusFilter('completed');
      setExpandedReviewId(lower);
    }
  }, [focusedJobId, autoExpandReview, completedJobs, trackedRequests]);

  useEffect(() => {
    let active = true;
    const refreshStatuses = () => fetchAll().finally(() => { if (active) setLoadingRequests(false); });
    refreshStatuses();
    const interval = setInterval(refreshStatuses, 45000);
    return () => { active = false; clearInterval(interval); };
  }, [customerName, customerUid]);

  const handleRefresh = async (): Promise<void> => {
    recommendationsFetched.current = {};
    setRecommendations({});
    setRecStates({});
    setRecommendationsRefresh({ run: Date.now() });
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  const pendingRequests = trackedRequests.filter((r) => (r.status || '').toLowerCase() === 'pending');
  const activeRequests = trackedRequests.filter((r) => ACTIVE_STATUSES.includes((r.status || '').toLowerCase()));
  const totalCount = trackedRequests.length + completedJobs.length;

  // Fetch AI recommendations once per pending job (cache by request id so the
  // 45s poll never re-calls the AI gateway for the same request). Each pending
  // request tracks its own loading / loaded / empty / error state so the panel
  // communicates exactly what is happening.
  const pendingIds = pendingRequests.map((r) => r.id).join(',');
  useEffect(() => {
    pendingRequests.forEach(async (request) => {
      if (!request.id || recommendationsFetched.current[request.id]) return;
      recommendationsFetched.current[request.id] = true;
      setRecStates((current) => ({ ...current, [request.id]: 'loading' }));
      try {
        const data = await fetchTechnicianRecommendations(request.id) as RecommendationData | null;
        const recs = Array.isArray(data?.recommendations) ? (data?.recommendations ?? []) : [];
        if (Array.isArray(data?.recommendations)) {
          setRecommendations((current) => ({ ...current, [request.id]: data as RecommendationData }));
          setRecStates((current) => ({ ...current, [request.id]: recs.length ? 'loaded' : 'empty' }));
        } else {
          setRecStates((current) => ({ ...current, [request.id]: 'empty' }));
        }
      } catch (_) {
        setRecStates((current) => ({ ...current, [request.id]: 'error' }));
      }
    });
  }, [pendingIds, recommendationsRefresh]);

  const handleCancelRequest = (requestId: string): void => {
    Alert.alert('Cancel request?', 'This can only be done before a technician accepts the request.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => {
        try {
          // Reason intentionally empty: backend stores null, identical to the previous call.
          await cancelRepairRequest(requestId, '');
          fetchAll();
          setTrackedRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: 'Cancelled' } : request));
        } catch (error) {
          Alert.alert('Unable to cancel', (error as { error?: string })?.error || 'The request could not be cancelled.');
        }
      } },
    ]);
  };

  const handleReviewSubmit = async (jobId: string): Promise<void> => {
    if (!reviewRatings[jobId]) {
      Alert.alert('Error', 'Please select a rating before submitting.');
      return;
    }
    setReviewSubmitting(jobId);
    try {
      await submitTechnicianReview(jobId, { customerName, rating: reviewRatings[jobId], comment: reviewComments[jobId] });
      Alert.alert('Success', 'Review submitted successfully!');
      setExpandedReviewId(null);
      await fetchAll();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit review.');
    } finally {
      setReviewSubmitting(null);
    }
  };

  const filterOptions: Array<{ key: StatusFilterKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'pending', label: 'Pending', count: pendingRequests.length },
    { key: 'active', label: 'Active', count: activeRequests.length },
    { key: 'completed', label: 'Completed', count: completedJobs.length },
  ];

  const showPending = statusFilter === 'all' || statusFilter === 'pending';
  const showActive = statusFilter === 'all' || statusFilter === 'active';
  const showCompleted = statusFilter === 'all' || statusFilter === 'completed';

  const renderStatusPill = (status: string | undefined): React.JSX.Element => {
    const color = getStatusColor(status);
    return (
      <View style={[styles.statusBadge, { backgroundColor: color + '15', borderColor: color + '40' }]}>
        <Ionicons name={statusIconName(status)} size={11} color={color} accessible={false} />
        <Text style={[styles.statusText, { color }]}>{status}</Text>
      </View>
    );
  };

  const renderMetaItem = (icon: IconName, text: string): React.JSX.Element => (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.muted} accessible={false} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );

  const renderProgressRail = (status: string | undefined): React.JSX.Element | null => {
    const current = progressIndexOf(status);
    if (current < 0) return null;
    return (
      <View
        style={styles.rail}
        accessibilityRole="text"
        accessibilityLabel={`Request progress: step ${current + 1} of ${PROGRESS_STEPS.length}, ${PROGRESS_STEPS[current]}`}
      >
        <View style={styles.railHeader}>
          <Text style={styles.railKicker}>PROGRESS HISTORY</Text>
        </View>
        <View style={styles.railBody}>
          {PROGRESS_STEPS.map((step, i) => {
            const done = i < current;
            const isCurrent = i === current;
            const isUpcoming = i > current;
            return (
              <View key={step} style={styles.railStep}>
                <View style={styles.railTrack}>
                  {i > 0 && <View style={[styles.railLine, (done || isCurrent) && styles.railLineDone, isUpcoming && styles.railLineUpcoming]} />}
                  <View style={[styles.railDot, done && styles.railDotDone, isCurrent && styles.railDotCurrent, isUpcoming && styles.railDotUpcoming]}>
                    {done && <Ionicons name="checkmark" size={8} color={colors.white} accessible={false} />}
                    {isUpcoming && <View style={styles.railDotInner} />}
                  </View>
                  {i < PROGRESS_STEPS.length - 1 && <View style={[styles.railLine, i < current && styles.railLineDone, isUpcoming && styles.railLineUpcoming]} />}
                </View>
                <Text style={[styles.railLabel, isCurrent && styles.railLabelCurrent, isUpcoming && styles.railLabelUpcoming]} numberOfLines={1}>{step}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const confirmRepair = (req: ServiceRequest): void => {
    Alert.alert('Confirm repair?', 'This confirms you need the repair and will be at the service location.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        try {
          await confirmRepairRequest(req.id);
          fetchAll();
          setTrackedRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Confirmed' } : r));
        } catch (error) {
          Alert.alert('Unable to confirm', (error as { error?: string })?.error || 'Please try again.');
        }
      } },
    ]);
  };

  const markReady = (req: ServiceRequest): void => {
    Alert.alert('Mark ready?', 'Confirm that someone will be at the service location to meet the technician.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Ready', onPress: async () => {
        try {
          await markCustomerReady(req.id);
          fetchAll();
          setTrackedRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Customer Ready' } : r));
        } catch (error) {
          Alert.alert('Unable to mark ready', (error as { error?: string })?.error || 'Please try again.');
        }
      } },
    ]);
  };

  const cancelWithMessage = (req: ServiceRequest, message: string): void => {
    Alert.alert('Cancel request?', message, [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => {
        try {
          // Reason intentionally empty: backend stores null, identical to the previous call.
          await cancelRepairRequest(req.id, '');
          fetchAll();
          setTrackedRequests((current) => current.map((request) => request.id === req.id ? { ...request, status: 'Cancelled' } : request));
        } catch (error) {
          Alert.alert('Unable to cancel', (error as { error?: string })?.error || 'The request could not be cancelled.');
        }
      } },
    ]);
  };

  const renderRequestCard = (req: ServiceRequest): React.JSX.Element => {
    const statusKey = String(req.status || '').toLowerCase();
    const isPending = statusKey === 'pending';
    const isAccepted = statusKey === 'accepted';
    const isConfirmed = statusKey === 'confirmed';
    const isReady = statusKey === 'customer ready';
    const isActive = isAccepted || isConfirmed || isReady || statusKey === 'in progress';
    const statusColor = getStatusColor(req.status);
    const guidance = getStatusGuidance(req.status);
    const showWaitingInfo = isPending || (statusKey === 'in progress' && !isAccepted && !isConfirmed && !isReady);
    const cancelMessage = isPending
      ? 'This can only be done before a technician accepts the request.'
      : isReady
        ? 'Cancel now before the technician starts the repair. This will be recorded for review.'
        : isConfirmed
          ? 'Cancel now before the technician travels.'
          : 'Cancel now before marking the request ready.';
    const isFocused = focusedJobId && String(focusedJobId) === String(req.id);
    const hasPrimaryAction = isAccepted || isConfirmed || isReady || (isActive && statusKey === 'in progress');
    return (
      <View key={req.id} style={[styles.card, isFocused && styles.cardFocused]}>
        {/* 1 — CURRENT STATUS HERO: strongest visual near top */}
        <View style={styles.cardHeader}>
          <View style={[styles.iconChip, isActive ? styles.iconChipBlue : styles.iconChipAmber]}>
            <Ionicons name={applianceIconName(req.applianceType)} size={22} color={isActive ? colors.accentBlue : colors.gold} accessible={false} />
          </View>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.applianceTitle} numberOfLines={1}>{req.applianceType}</Text>
            <Text style={styles.subLabel} numberOfLines={1}>
              {req.technicianName
                ? `Tech: ${req.technicianName}`
                : isPending
                  ? 'Awaiting technician match'
                  : 'Matching you with a technician'}
            </Text>
          </View>
          {renderStatusPill(req.status)}
        </View>

        <View style={[styles.statusHero, { backgroundColor: statusColor + '10', borderColor: statusColor + '22' }]}>
          <View style={[styles.statusHeroIcon, { backgroundColor: statusColor + '16', borderColor: statusColor + '28' }]}>
            <Ionicons name={statusIconName(req.status)} size={18} color={statusColor} accessible={false} />
          </View>
          <View style={styles.statusHeroCopy}>
            <Text style={styles.statusHeroKicker} accessibilityRole="text">
              CURRENT STATUS — <Text style={[styles.statusHeroStatus, { color: statusColor }]}>{req.status || 'Pending'}</Text>
            </Text>
            <Text style={styles.statusHeroTitle} numberOfLines={1}>{guidance.title}</Text>
            <Text style={styles.statusHeroBody} numberOfLines={2}>{guidance.body}</Text>
          </View>
        </View>

        {/* 2 — NEXT ACTION: directly below status, visually dominant */}
        {isAccepted && (
          <View style={styles.nextActionBlock}>
            <Text style={styles.nextActionKicker}>NEXT ACTION REQUIRED</Text>
            <View style={styles.primaryRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Confirm repair for ${req.applianceType ?? 'this request'}`}
                accessibilityHint="Confirm you need the repair"
                onPress={() => confirmRepair(req)}
                style={({ pressed }) => [styles.primaryButton, styles.nextActionPrimary, pressed && styles.pressed]}
              >
                <Ionicons name="checkmark-circle" size={16} color={colors.white} accessible={false} />
                <Text style={styles.primaryButtonText}>Confirm Repair</Text>
              </Pressable>
              {onTrackMap && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Track repair for ${req.applianceType ?? 'this request'}`}
                  accessibilityHint="Open live tracking on the map"
                  onPress={() => onTrackMap(req)}
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressedSoft]}
                >
                  <Ionicons name="map" size={15} color={colors.teal} accessible={false} />
                  <Text style={styles.secondaryActionText}>Track</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        {isConfirmed && (
          <View style={styles.nextActionBlock}>
            <Text style={styles.nextActionKicker}>NEXT ACTION REQUIRED</Text>
            <View style={styles.primaryRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark ready for ${req.applianceType ?? 'this request'}`}
                accessibilityHint="Confirm someone will meet the technician"
                onPress={() => markReady(req)}
                style={({ pressed }) => [styles.primaryButton, styles.nextActionPrimary, pressed && styles.pressed]}
              >
                <Ionicons name="flag" size={16} color={colors.white} accessible={false} />
                <Text style={styles.primaryButtonText}>I&apos;m Ready</Text>
              </Pressable>
              {onTrackMap && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Track repair for ${req.applianceType ?? 'this request'}`}
                  onPress={() => onTrackMap(req)}
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressedSoft]}
                >
                  <Ionicons name="map" size={15} color={colors.teal} accessible={false} />
                  <Text style={styles.secondaryActionText}>Track</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        {isReady && (
          <View style={styles.nextActionBlock}>
            <Text style={styles.nextActionKicker}>WHAT&apos;S NEXT</Text>
            <View style={styles.calmingInfo}>
              <Ionicons name="hourglass-outline" size={15} color={colors.teal} accessible={false} />
              <Text style={styles.calmingInfoText}>Your location is marked ready — follow the technician live on the map.</Text>
            </View>
            {onTrackMap && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Track repair for ${req.applianceType ?? 'this request'}`}
                onPress={() => onTrackMap(req)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Ionicons name="map" size={15} color={colors.white} accessible={false} />
                <Text style={styles.primaryButtonText}>Track Technician</Text>
              </Pressable>
            )}
          </View>
        )}
        {statusKey === 'in progress' && (
          <View style={styles.nextActionBlock}>
            <Text style={styles.nextActionKicker}>WHAT&apos;S NEXT</Text>
            <View style={styles.calmingInfo}>
              <Ionicons name="construct-outline" size={15} color={colors.teal} accessible={false} />
              <Text style={styles.calmingInfoText}>Repairs are underway — keep your phone nearby for updates.</Text>
            </View>
            {onTrackMap && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Track repair for ${req.applianceType ?? 'this request'}`}
                onPress={() => onTrackMap(req)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Ionicons name="map" size={15} color={colors.white} accessible={false} />
                <Text style={styles.primaryButtonText}>Track Technician</Text>
              </Pressable>
            )}
          </View>
        )}
        {showWaitingInfo && isPending && (
          <View style={styles.nextActionBlock}>
            <View style={styles.calmingInfo}>
              <Ionicons name="time-outline" size={15} color={colors.muted} accessible={false} />
              <Text style={styles.calmingInfoText}>Waiting for a technician to accept — we&apos;ll notify you the moment someone does.</Text>
            </View>
          </View>
        )}

        {/* Completion code is only relevant when it is the next step — show it right after next action */}
        {isActive && req.verificationCode && !isConfirmed && (
          <View style={styles.completionBadge}>
            <Ionicons name="key-outline" size={14} color={colors.white} accessible={false} />
            <Text style={styles.completionText}>
              Completion Code: <Text style={styles.completionCode}>{req.verificationCode}</Text>
            </Text>
          </View>
        )}
        {isReady && (
          <View style={styles.readyBadge}>
            <Ionicons name="checkmark-circle" size={14} color={colors.teal} accessible={false} />
            <Text style={styles.readyText}>Ready for your technician</Text>
          </View>
        )}

        {/* 3 — JOB SUMMARY: scannable facts */}
        {req.description ? <Text style={styles.description} numberOfLines={2}>{req.description}</Text> : null}

        {req.photoUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View photo for ${req.applianceType ?? 'this request'}`}
            accessibilityHint="Opens request details with the attached photo"
            onPress={() => onViewDetails(req)}
            style={({ pressed }) => [styles.photoBadge, pressed && styles.pressedSoft]}
          >
            <Image source={{ uri: req.photoUrl }} style={styles.photoBadgeThumb} />
            <Ionicons name="image-outline" size={15} color={colors.teal} accessible={false} />
            <Text style={styles.photoBadgeText} numberOfLines={1}>Photo attached</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.muted} accessible={false} />
          </Pressable>
        ) : null}

        <View style={styles.metaRow}>
          {renderMetaItem('calendar-outline', formatCardDate(req.createdAt))}
          {req.location ? renderMetaItem('location-outline', req.location) : null}
        </View>

        {/* 4 — PROGRESS HISTORY: de-emphasized, below facts */}
        {isActive && renderProgressRail(req.status)}

        {/* 5 — SECONDARY: AI support (when pending) */}
        {isPending && (
          <View style={styles.aiPanel}>
            <View style={styles.aiPanelHeader}>
              <Ionicons name="sparkles" size={15} color={colors.teal} accessible={false} />
              <Text style={styles.aiPanelTitle}>AI Recommended Technicians</Text>
            </View>
            {renderAiPanelBody(req)}
          </View>
        )}

        {(isActive || isPending) && (
          <View style={styles.secondaryActionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View details of ${req.applianceType ?? 'this request'}`}
              onPress={() => onViewDetails(req)}
              style={({ pressed }) => [styles.detailsButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="eye-outline" size={16} color={colors.teal} accessible={false} />
              <Text style={styles.detailsButtonText}>Details</Text>
            </Pressable>
            {(isPending || isAccepted || isConfirmed || isReady) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Cancel request for ${req.applianceType ?? 'this request'}`}
                accessibilityHint="Asks for confirmation first"
                onPress={() => cancelWithMessage(req, cancelMessage)}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  const recStateOf = (requestId: string): RecState => recStates[requestId] || 'loading';

  // Display-only day key matching the backend same-day rule (scheduled ISO
  // first, preferred display string parsed component-wise so timezone can
  // never shift the day). Used only to pick which safe schedule row to show
  // beside the server-computed availability.
  const scheduleDayKey = (item: { scheduledDate?: string | null; preferredDate?: string | null }): string | null => {
    if (item.scheduledDate) {
      const time = new Date(item.scheduledDate).getTime();
      if (!Number.isNaN(time)) return new Date(item.scheduledDate).toISOString().slice(0, 10);
    }
    const match = String(item.preferredDate ?? '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (match && match[1] && match[2] && match[3]) {
      const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
      const month = months[match[1].slice(0, 3).toLowerCase()];
      if (month) return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
    }
    return null;
  };

  const requestDayKey = (req: ServiceRequest): string | null =>
    scheduleDayKey({ scheduledDate: req.scheduledDate, preferredDate: req.preferredDate });

  const formatScheduleDate = (item: TechnicianScheduleItem): string => {
    if (item.scheduledDate) {
      const time = new Date(item.scheduledDate).getTime();
      if (!Number.isNaN(time)) {
        return new Date(item.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    return item.preferredDate || 'Date to confirm';
  };

  const renderTechCard = (req: ServiceRequest, tech: TechRecommendation, rank: number, isFirst: boolean): React.JSX.Element => (
    <View key={tech.uid} style={[styles.techRow, isFirst && styles.techRowFirst]}>
      <Text style={styles.techRank}>{rank}</Text>
      {tech.profileImage ? (
        <Image source={{ uri: tech.profileImage }} style={styles.techAvatarImg} />
      ) : (
        <View style={styles.techAvatar}>
          <Text style={styles.techAvatarText}>{(tech.name || 'T').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.techCopy}>
        <View style={styles.techNameRow}>
          <Text style={styles.techName} numberOfLines={1}>{tech.name}</Text>
          <Text style={styles.matchValue}>{Math.round((tech.matchScore || 0) * 100)}% match</Text>
        </View>
        {tech.reason ? <Text style={styles.techReason} numberOfLines={2}>{tech.reason}</Text> : null}
        <View style={styles.techMetaRow}>
          <View style={styles.techMetaItem}>
            <Ionicons name="star" size={12} color={colors.gold} accessible={false} />
            <Text style={styles.techMetaText}>{tech.rating ? Number(tech.rating).toFixed(1) : '—'}</Text>
          </View>
          <View style={styles.techMetaItem}>
            <Ionicons name="people-outline" size={12} color={colors.muted} accessible={false} />
            <Text style={styles.techMetaText}>{tech.totalReviews || 0} review{tech.totalReviews === 1 ? '' : 's'}</Text>
          </View>
          <View style={styles.techMetaItem}>
            <Ionicons name="briefcase-outline" size={12} color={colors.muted} accessible={false} />
            <Text style={styles.techMetaText}>{tech.yearsExperience || 0} yr{tech.yearsExperience === 1 ? '' : 's'}</Text>
          </View>
          {tech.distanceKm != null && (
            <View style={styles.techMetaItem}>
              <Ionicons name="location-outline" size={12} color={colors.muted} accessible={false} />
              <Text style={styles.techMetaText}>{tech.distanceKm} km</Text>
            </View>
          )}
          {tech.confidence ? (
            <Text style={styles.techConfidence}>{Math.round(tech.confidence * 100)}% AI</Text>
          ) : null}
        </View>
        {(tech.workloadStatus || tech.activeJobs != null) ? (
          <View style={styles.workloadRow}>
            <Ionicons name={tech.workloadStatus === 'busy' ? 'time-outline' : 'checkmark-circle-outline'} size={12} color={tech.workloadStatus === 'busy' ? colors.gold : colors.teal} accessible={false} />
            <Text style={[styles.workloadText, tech.workloadStatus === 'busy' && styles.workloadTextBusy]}>
              {tech.workloadStatus === 'busy' ? `Busy — ${tech.activeJobs ?? 0} active jobs` : `Available — ${tech.activeJobs ?? 0} active jobs`}
            </Text>
          </View>
        ) : null}
        {tech.skills && tech.skills.length > 0 && (
          <View style={styles.techSkillsRow}>
            {tech.skills.slice(0, 3).map((skill) => (
              <View key={skill} style={styles.techSkillChip}>
                <Text style={styles.techSkillText} numberOfLines={1}>{skill}</Text>
              </View>
            ))}
          </View>
        )}
        {tech.availability && (
          <View>
            {tech.availability === 'busy' ? (
              <View style={styles.availRow}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.gold} accessible={false} />
                <Text style={styles.availBusyText}>Has a scheduled job that day</Text>
              </View>
            ) : (
              <View style={styles.availRow}>
                <Ionicons name="checkmark-circle-outline" size={14} color={colors.green} accessible={false} />
                <Text style={styles.availOkText}>Available for this schedule</Text>
              </View>
            )}
            {(() => {
              const items = Array.isArray(tech.upcomingSchedule) ? tech.upcomingSchedule : [];
              const day = requestDayKey(req);
              const shown = items.find((item) => day != null && scheduleDayKey(item) === day) ?? items[0];
              if (!shown) return null;
              return (
                <View style={styles.schedRow}>
                  <View style={styles.schedLine}>
                    <Ionicons name="calendar-outline" size={13} color={colors.teal} accessible={false} />
                    <Text style={styles.schedDate} numberOfLines={1}>{formatScheduleDate(shown)}</Text>
                  </View>
                  <View style={styles.schedLine}>
                    <Ionicons name="time-outline" size={13} color={colors.teal} accessible={false} />
                    <Text style={styles.schedTime} numberOfLines={1}>
                      {shown.preferredTime || 'Time to confirm'} • {shown.applianceType}
                    </Text>
                  </View>
                </View>
              );
            })()}
          </View>
        )}
        <View style={styles.techActionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View profile of ${tech.name ?? 'technician'}`}
            onPress={() => onViewTechnicianProfile && onViewTechnicianProfile(tech)}
            style={({ pressed }) => [styles.techProfileButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="person-outline" size={14} color={colors.teal} accessible={false} />
            <Text style={styles.techProfileButtonText}>View Profile</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${tech.name ?? 'technician'}`}
            onPress={() => onMessageTechnician && onMessageTechnician(req, tech)}
            style={({ pressed }) => [styles.techMessageButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.ink} accessible={false} />
            <Text style={styles.techMessageButtonText}>Message</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderAiPanelBody = (req: ServiceRequest): React.JSX.Element => {
    const data = recommendations[req.id];
    const recs = Array.isArray(data?.recommendations) ? (data?.recommendations ?? []) : [];

    if (recs.length > 0) {
      return (
        <View>
          <Text style={styles.aiPanelHint}>
            {data?.ai === 'ai'
              ? 'Ranked from real ratings, reviews, experience, and proximity.'
              : 'Best available matches for this request.'}
          </Text>
          <View style={styles.techList}>
            {recs.map((tech, i) => renderTechCard(req, tech, i + 1, i === 0))}
          </View>
        </View>
      );
    }

    const state = recStateOf(req.id);
    if (state === 'error') {
      return (
        <View style={styles.aiMessageRow}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} accessible={false} />
          <Text style={styles.aiMessageText}>Recommendations are temporarily unavailable. Pull down to try again.</Text>
        </View>
      );
    }

    if (state === 'empty') {
      return (
        <View style={styles.aiMessageRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.muted} accessible={false} />
          <Text style={styles.aiMessageText}>{data?.note || 'No eligible technicians match this request yet.'}</Text>
        </View>
      );
    }

    return (
      <View style={styles.aiLoading}>
        <ActivityIndicator size="small" color={colors.teal} />
        <Text style={styles.aiLoadingText}>Analyzing your request for the best match...</Text>
      </View>
    );
  };

  const renderCompletedCard = (job: CompletedJob): React.JSX.Element => {
    const expanded = expandedReviewId === job.id;
    const currentRating = reviewRatings[job.id] ?? 0;
    const isFocused = focusedJobId && String(focusedJobId) === String(job.id);
    return (
      <View key={job.id} style={[styles.card, isFocused && styles.cardFocused]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconChip, styles.iconChipGreen]}>
            <Ionicons name={applianceIconName(job.applianceType)} size={22} color={colors.green} accessible={false} />
          </View>
          <View style={styles.cardHeaderCopy}>
            <Text style={styles.applianceTitle} numberOfLines={1}>{job.applianceType}</Text>
            <Text style={styles.subLabel} numberOfLines={1}>Completed by {job.technicianName || 'Assigned Tech'}</Text>
          </View>
          <View style={styles.donePill}>
            <Ionicons name="checkmark-circle" size={11} color={colors.green} accessible={false} />
            <Text style={styles.donePillText}>Done</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          {renderMetaItem('calendar-outline', formatCardDate(job.completedAt || job.createdAt))}
          {renderMetaItem('star-outline', currentRating ? `${currentRating} star${currentRating > 1 ? 's' : ''} rating` : 'No rating yet')}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Hide review form for ${job.applianceType ?? 'this job'}` : `Write a review for ${job.applianceType ?? 'this job'}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpandedReviewId(expanded ? null : job.id)}
          style={({ pressed }) => [styles.reviewToggle, pressed && styles.pressedSoft]}
        >
          <Ionicons name={expanded ? 'chevron-up' : 'star-outline'} size={16} color={colors.teal} accessible={false} />
          <Text style={styles.reviewToggleText}>{expanded ? 'Hide review form' : 'Write a review'}</Text>
        </Pressable>

        {expanded && (
          <View style={styles.reviewContainer}>
            <Text style={styles.inputLabel}>Rate your experience</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => {
                const selected = currentRating >= star;
                return (
                  <Pressable
                    key={star}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    accessibilityState={{ selected }}
                    hitSlop={6}
                    onPress={() => setReviewRatings({ ...reviewRatings, [job.id]: star })}
                    style={({ pressed }) => [styles.starButton, pressed && styles.pressedSoft]}
                  >
                    <Ionicons
                      name={selected ? 'star' : 'star-outline'}
                      size={30}
                      color={selected ? colors.gold : colors.line}
                      accessible={false}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="chatbox-outline" size={20} color={colors.muted} style={styles.inputIcon} accessible={false} />
              <TextInput
                style={styles.reviewInput}
                placeholder="How was the service? (Optional)"
                placeholderTextColor={colors.muted}
                multiline
                onChangeText={(text) => setReviewComments({ ...reviewComments, [job.id]: text })}
                accessibilityLabel="Review comment, optional"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Submit review for ${job.applianceType ?? 'this job'}`}
              accessibilityState={{ disabled: reviewSubmitting === job.id }}
              onPress={() => handleReviewSubmit(job.id)}
              disabled={reviewSubmitting === job.id}
              style={({ pressed }) => [styles.reviewButton, pressed && reviewSubmitting !== job.id && styles.pressed]}
            >
              {reviewSubmitting === job.id ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Submit Review</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderSectionHeader = (kicker: string, title: string, count: number, color: string = colors.teal, hint?: string): React.JSX.Element => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={[styles.sectionKicker, { color }]}>{kicker}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.countBadge, { backgroundColor: color + '15' }]}>
        <Text style={[styles.countBadgeText, { color }]}>{count}</Text>
      </View>
    </View>
  );

  const renderSkeleton = (): React.JSX.Element => (
    <View>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.card}>
          <View style={styles.skeletonHeader}>
            <Skeleton style={{ width: 44, height: 44, borderRadius: 14 }} />
            <View style={styles.skeletonCopy}>
              <Skeleton style={{ width: '62%', height: 15, marginBottom: 8 }} />
              <Skeleton style={{ width: '40%', height: 11 }} />
            </View>
            <Skeleton style={{ width: 70, height: 22, borderRadius: 8 }} />
          </View>
          <Skeleton style={{ width: '92%', height: 13, marginBottom: 8 }} />
          <Skeleton style={{ width: '66%', height: 13, marginBottom: 16 }} />
          <View style={styles.skeletonMetaRow}>
            <Skeleton style={{ width: '34%', height: 12 }} />
            <Skeleton style={{ width: '42%', height: 12 }} />
          </View>
          <View style={styles.skeletonActions}>
            <Skeleton style={{ width: '46%', height: 42, borderRadius: 12 }} />
            <Skeleton style={{ width: '46%', height: 42, borderRadius: 12 }} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} colors={[colors.teal]} />}
    >
      <View style={styles.sectionHeaderContainer}>
        <Text style={styles.kicker}>MY REQUESTS</Text>
        <Text style={styles.sectionTitle}>{acceptedOnly ? 'Active Requests' : 'Service Requests'}</Text>
        <Text style={styles.subtitle}>Track your repairs and rate completed work.</Text>
      </View>

      <View style={styles.segmentRow}>
        {filterOptions.map((option) => {
          const active = statusFilter === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${option.label}, ${option.count} requests`}
              accessibilityState={{ selected: active }}
              hitSlop={4}
              style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.pressedSoft]}
              onPress={() => setStatusFilter(option.key)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>{option.label}</Text>
              <View style={[styles.segmentCount, active && styles.segmentCountActive]}>
                <Text style={[styles.segmentCountText, active && styles.segmentCountTextActive]}>{option.count}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {loadingRequests ? (
        renderSkeleton()
      ) : fetchError && trackedRequests.length === 0 && completedJobs.length === 0 ? (
        <View style={styles.errorCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={30} color={colors.error} accessible={false} />
          </View>
          <Text style={styles.emptyTitle}>Unable to load requests</Text>
          <Text style={styles.emptyText}>Check your connection and try again. Your requests are safe.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading requests"
            onPress={handleRefresh}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.white} accessible={false} />
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : trackedRequests.length === 0 && completedJobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="clipboard-outline" size={34} color={colors.teal} accessible={false} />
          </View>
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptyText}>Your repair requests and updates will appear here once you create one.</Text>
        </View>
      ) : (
        <View>
          {showPending && (
            <View>
              {renderSectionHeader('AWAITING MATCH', 'Pending Requests', pendingRequests.length, colors.gold, "We'll notify you the moment a technician accepts.")}
              {pendingRequests.length === 0 ? (
                <View style={styles.sectionEmpty}>
                  <Ionicons name="time-outline" size={20} color={colors.muted} accessible={false} />
                  <Text style={styles.sectionEmptyText}>No pending requests</Text>
                </View>
              ) : pendingRequests.map(renderRequestCard)}
            </View>
          )}

          {showActive && (
            <View>
              {renderSectionHeader('ONGOING', 'Active Jobs', activeRequests.length, colors.accentBlue, "Follow them live on the map and keep your phone close.")}
              {activeRequests.length === 0 ? (
                <View style={styles.sectionEmpty}>
                  <Ionicons name="hand-left-outline" size={20} color={colors.muted} accessible={false} />
                  <Text style={styles.sectionEmptyText}>No active jobs right now</Text>
                </View>
              ) : activeRequests.map(renderRequestCard)}
            </View>
          )}

          {showCompleted && (
            <View>
              {renderSectionHeader('FINISHED', 'Completed Repairs', completedJobs.length, colors.green, "Great job seeing it through — a quick review helps your technician.")}
              {completedJobs.length === 0 ? (
                <View style={styles.sectionEmpty}>
                  <Ionicons name="checkmark-done-outline" size={20} color={colors.muted} accessible={false} />
                  <Text style={styles.sectionEmptyText}>Completed repairs will appear here</Text>
                </View>
              ) : completedJobs.map(renderCompletedCard)}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 32, backgroundColor: colors.canvas, flexGrow: 1 },
  sectionHeaderContainer: { marginBottom: 14 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 3 },
  sectionTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 4 },

  // Shared anti-slop press states: transform + opacity only (GPU path).
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  // Filters
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44, paddingHorizontal: 4, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.teal, borderColor: colors.tealDark },
  segmentText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, flexShrink: 1 },
  segmentTextActive: { color: colors.white },
  segmentCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  segmentCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  segmentCountText: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  segmentCountTextActive: { color: colors.white },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  sectionHeaderCopy: { flex: 1, marginRight: 10 },
  sectionKicker: { fontSize: 9, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  countBadge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 12, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },

  // Cards
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: colors.line, ...shadows.card },
  cardFocused: { borderColor: colors.teal, borderWidth: 2, ...shadows.cardStrong },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconChip: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconChipAmber: { backgroundColor: '#FFF8E7' },
  iconChipBlue: { backgroundColor: '#EBF2FF' },
  iconChipGreen: { backgroundColor: '#ECFDF5' },
  cardHeaderCopy: { flex: 1, marginRight: 8 },
  applianceTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  subLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },

  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontFamily: fonts.bold },
  donePill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.green + '40', backgroundColor: colors.green + '15', flexDirection: 'row', alignItems: 'center', gap: 4 },
  donePillText: { fontSize: 11, fontFamily: fonts.bold, color: colors.green },

  description: { fontSize: 13, color: colors.muted, marginBottom: 12, lineHeight: 19, fontFamily: fonts.regular },
  photoBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 7, paddingRight: 10, marginBottom: 12 },
  photoBadgeThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.line },
  photoBadgeText: { flex: 1, color: colors.teal, fontSize: 12, fontFamily: fonts.semiBold },
  sectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  metaRow: { flexDirection: 'row', gap: 14, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  metaText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, flex: 1 },

  // Current status hero (strongest visual, still compact)
  statusHero: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  statusHeroIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: 1 },
  statusHeroCopy: { flex: 1 },
  statusHeroKicker: { color: colors.muted, fontSize: 9, letterSpacing: 1.1, fontFamily: fonts.bold, marginBottom: 2 },
  statusHeroStatus: { fontSize: 9, fontFamily: fonts.extraBold },
  statusHeroTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, marginBottom: 2 },
  statusHeroBody: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },

  // Next action — visually dominant, directly below status
  nextActionBlock: { gap: 8, marginBottom: 12 },
  nextActionKicker: { color: colors.teal, fontSize: 9, letterSpacing: 1.2, fontFamily: fonts.bold },
  nextActionPrimary: { flex: 1.35 },
  secondaryAction: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryActionText: { color: colors.teal, fontFamily: fonts.bold, fontSize: 13 },
  calmingInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.tealLight, borderRadius: 12, borderWidth: 1, borderColor: colors.hudBorder, paddingHorizontal: 12, paddingVertical: 10 },
  calmingInfoText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },

  // De-emphasized progress history — supports, does not compete
  rail: { marginBottom: 12, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: colors.canvas, borderRadius: 12, borderWidth: 1, borderColor: colors.lineSoft, opacity: 0.97 },
  railHeader: { marginBottom: 6, paddingHorizontal: 2 },
  railKicker: { color: colors.muted, fontSize: 8, letterSpacing: 1.2, fontFamily: fonts.bold },
  railBody: { flexDirection: 'row' },
  railStep: { flex: 1, alignItems: 'center' },
  railTrack: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  railLine: { flex: 1, height: 1.5, backgroundColor: colors.line },
  railLineDone: { backgroundColor: colors.teal },
  railLineUpcoming: { backgroundColor: colors.lineSoft },
  railDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  railDotDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  railDotCurrent: { borderColor: colors.tealDark, borderWidth: 2.5 },
  railDotUpcoming: { backgroundColor: colors.white, borderColor: colors.lineSoft },
  railDotInner: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.lineSoft },
  railLabel: { color: colors.muted, fontSize: 8, fontFamily: fonts.semiBold, marginTop: 4, textAlign: 'center' },
  railLabelCurrent: { color: colors.tealDark, fontFamily: fonts.bold },
  railLabelUpcoming: { color: '#94A3B8', fontFamily: fonts.medium },

  // Codes
  readyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.tealLight, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.hudBorder, marginBottom: 12, gap: 8 },
  readyText: { fontSize: 12, color: colors.tealDark, fontFamily: fonts.bold },
  completionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginBottom: 12, gap: 8 },
  completionText: { fontSize: 12, color: colors.white, fontFamily: fonts.semiBold },
  completionCode: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.white, letterSpacing: 3, fontVariant: ['tabular-nums'] },

  // Action hierarchy
  cardActions: { gap: 10 },
  primaryRow: { flexDirection: 'row', gap: 10 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryActionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  primaryButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  detailsButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailsButtonText: { color: colors.teal, fontFamily: fonts.bold, fontSize: 14 },
  cancelButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.danger, fontSize: 14, fontFamily: fonts.bold },

  // Reviews
  reviewToggle: { minHeight: 48, borderRadius: 14, backgroundColor: colors.tealLight, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  reviewToggleText: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold },
  reviewContainer: { marginTop: 14, gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  stars: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  starButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputContainer: { flexDirection: 'row', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 70, alignItems: 'flex-start' },
  inputIcon: { marginRight: 10, marginTop: 14 },
  reviewInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 12, height: 70, textAlignVertical: 'top' },
  reviewButton: { backgroundColor: colors.teal, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadows.card },

  // Skeleton / empty / error
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  skeletonCopy: { flex: 1, marginLeft: 12 },
  skeletonMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  skeletonActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.line, gap: 10, ...shadows.card },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 19 },
  sectionEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  sectionEmptyText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  errorCard: { backgroundColor: colors.white, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.line, gap: 10, ...shadows.card },
  retryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.teal, borderRadius: 14, paddingHorizontal: 22, minHeight: 48, marginTop: 6, ...shadows.card },
  retryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // AI recommendations
  aiPanel: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginBottom: 12 },
  aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  aiPanelTitle: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold },
  aiPanelHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginBottom: 8, lineHeight: 15 },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  aiLoadingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  aiMessageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.line },
  aiMessageText: { flex: 1, color: colors.muted, fontSize: 11, fontFamily: fonts.medium, lineHeight: 15 },
  techList: { gap: 0 },
  techRow: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  techRowFirst: { borderTopWidth: 0, paddingTop: 4 },
  techRank: { color: colors.teal, fontSize: 13, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], minWidth: 16, textAlign: 'center', marginTop: 2 },
  techAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  techAvatarImg: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.tealLight },
  techAvatarText: { color: colors.white, fontSize: 17, fontFamily: fonts.extraBold },
  techCopy: { flex: 1, gap: 6 },
  techNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  techName: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, flex: 1 },
  matchValue: { color: colors.teal, fontSize: 12, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  techConfidence: { color: colors.teal, fontSize: 10, fontFamily: fonts.bold },
  techReason: { color: colors.ink, fontSize: 11, fontFamily: fonts.medium, lineHeight: 15 },
  techMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  techMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  techMetaText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  techSkillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  techSkillChip: { backgroundColor: colors.tealLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  techSkillText: { color: colors.tealDark, fontSize: 10, fontFamily: fonts.bold },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  availOkText: { color: colors.green, fontSize: 12, fontFamily: fonts.bold },
  availBusyText: { color: colors.gold, fontSize: 12, fontFamily: fonts.bold },
  workloadRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  workloadText: { color: colors.teal, fontSize: 11, fontFamily: fonts.bold },
  workloadTextBusy: { color: colors.gold },
  schedRow: { marginTop: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 5 },
  schedLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  schedDate: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'], flexShrink: 1 },
  schedTime: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },
  techActionsRow: { flexDirection: 'row', gap: 8 },
  techProfileButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.tealLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  techProfileButtonText: { color: colors.teal, fontSize: 12, fontFamily: fonts.bold },
  techMessageButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  techMessageButtonText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold },
});
