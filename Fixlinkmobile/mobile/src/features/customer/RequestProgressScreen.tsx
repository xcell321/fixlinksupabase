import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Skeleton from '../../components/Skeleton';
import ConfirmDialog from '../../components/ConfirmDialog';
import { cancelRepairRequest, confirmRepairRequest, fetchCompletedJobs, fetchCustomerRequests, fetchTechnicianRecommendations, markCustomerReady, submitTechnicianReview } from '../../services/api';
import { colors, fonts, shadows } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusGuidance, getStatusIcon } from '../../utils/applianceIcons';
import { splitJobDescription } from '../../utils/jobDescription';
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
  reviewId?: string | null;
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
  onRate?: (job: CompletedJob) => void;
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

export default function RequestProgressScreen({ customerName, customerUid, acceptedOnly = false, focusedJobId = null, autoExpandReview = false, onViewDetails, onTrackMap, onViewTechnicianProfile, onMessageTechnician, onRate }: RequestProgressScreenProps): React.JSX.Element {
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [trackedRequests, setTrackedRequests] = useState<ServiceRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewSubmitting, setReviewSubmitting] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [expandedAiId, setExpandedAiId] = useState<string | null>(null);
  const [showCancelledHistory, setShowCancelledHistory] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<Record<string, RecommendationData>>({});
  const [recommendationsRefresh, setRecommendationsRefresh] = useState<{ run?: number }>({});
  const [recStates, setRecStates] = useState<Record<string, RecState>>({});
  const recommendationsFetched = useRef<Record<string, boolean>>({});
  const fetchBusyRef = useRef<boolean>(false);

  interface PendingAction {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    run: () => Promise<void>;
  }
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runPendingAction = async (): Promise<void> => {
    if (!pendingAction || actionBusy) return;
    setActionBusy(true);
    try {
      await pendingAction.run();
      setActionError(null);
      setPendingAction(null);
    } catch (error) {
      setActionError((error as { error?: string; message?: string })?.error
        || (error as Error)?.message
        || 'The request could not be completed. Please try again.');
    } finally {
      setActionBusy(false);
    }
  };

  const fetchAll = (): Promise<void> => {
    // Skip overlapping ticks so slow responses never stack sockets.
    if (fetchBusyRef.current) return Promise.resolve();
    fetchBusyRef.current = true;
    let failed = false;
    return Promise.all([
      fetchCompletedJobs(customerName, customerUid)
        .then((data) => setCompletedJobs(Array.isArray(data) ? (data as CompletedJob[]) : []))
        .catch(() => { failed = true; setCompletedJobs([]); }),
      fetchCustomerRequests(customerName, customerUid)
        .then((data) => setTrackedRequests(Array.isArray(data) ? (data as ServiceRequest[]) : []))
        .catch(() => { failed = true; setTrackedRequests([]); }),
    ]).then(() => { setFetchError(failed); }).finally(() => { fetchBusyRef.current = false; });
  };

  useEffect(() => {
    if (focusedJobId) return;
    setTab('active');
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
      setTab('history');
      if (autoExpandReview) setExpandedReviewId(lower);
    } else if (isActive) {
      setTab('active');
    } else if (isPending) {
      setTab('active');
    } else if (autoExpandReview) {
      // Completed job not yet in local list (e.g. just completed)
      setTab('history');
      setExpandedReviewId(lower);
    }
  }, [focusedJobId, autoExpandReview, completedJobs, trackedRequests]);

  useEffect(() => {
    let active = true;
    const refreshStatuses = () => fetchAll().finally(() => { if (active) setLoadingRequests(false); });
    refreshStatuses();
    // 12s silent refresh. Status changes land without manual reload.
    const interval = setInterval(refreshStatuses, 12000);
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
  const terminalHistoryRequests = trackedRequests.filter((r) => {
    const k = String(r.status || '').toLowerCase();
    return k === 'cancelled' || k === 'no-show' || k === 'no show';
  });
  const totalCount = trackedRequests.length + completedJobs.length;

  // Prototype shows Active / History only — no AI recommendation feed.
  const pendingIds = pendingRequests.map((r) => r.id).join(',');

  const handleCancelRequest = (requestId: string): void => {
    setActionError(null);
    setPendingAction({
      title: 'Cancel request?',
      message: 'This can only be done before a technician accepts the request.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep request',
      danger: true,
      run: async () => {
        // Reason intentionally empty: backend stores null, identical to the previous call.
        await cancelRepairRequest(requestId, '');
        fetchAll();
        setTrackedRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: 'Cancelled' } : request));
      },
    });
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

  // Prototype tabs: Active (pending + ongoing) / History (completed).
  const activeList = [...pendingRequests, ...activeRequests];

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

  // De-emphasized progress history - small, muted, supporting element. Never competes with status.
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
          <Text style={styles.railStepLabel}>Step {current + 1} of {PROGRESS_STEPS.length}</Text>
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
                    {done && <Ionicons name="checkmark" size={7} color={colors.white} accessible={false} />}
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
    setActionError(null);
    setPendingAction({
      title: 'Confirm repair?',
      message: 'This confirms you need the repair and will be at the service location.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Not yet',
      run: async () => {
        await confirmRepairRequest(req.id);
        fetchAll();
        setTrackedRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Confirmed' } : r));
      },
    });
  };

  const markReady = (req: ServiceRequest): void => {
    setActionError(null);
    setPendingAction({
      title: 'Mark ready?',
      message: 'Confirm that someone will be at the service location to meet the technician.',
      confirmLabel: 'Ready',
      cancelLabel: 'Not yet',
      run: async () => {
        await markCustomerReady(req.id);
        fetchAll();
        setTrackedRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Customer Ready' } : r));
      },
    });
  };

  const cancelWithMessage = (req: ServiceRequest, message: string): void => {
    setActionError(null);
    setPendingAction({
      title: 'Cancel request?',
      message,
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep request',
      danger: true,
      run: async () => {
        // Reason intentionally empty: backend stores null, identical to the previous call.
        await cancelRepairRequest(req.id, '');
        fetchAll();
        setTrackedRequests((current) => current.map((request) => request.id === req.id ? { ...request, status: 'Cancelled' } : request));
      },
    });
  };

  const STATUS_PROGRESS: Record<string, number> = { pending: 10, accepted: 25, confirmed: 40, 'customer ready': 60, 'in progress': 80 };

  const etaLabel = (req: ServiceRequest): string => {
    if (req.preferredTime) return req.preferredTime;
    if (req.scheduledDate) {
      const t = new Date(req.scheduledDate).getTime();
      if (!Number.isNaN(t)) return new Date(req.scheduledDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return 'To be confirmed';
  };

  const renderRequestCard = (req: ServiceRequest): React.JSX.Element => {
    // The stored description is "[Brand] words"; show the words (or the brand
    // alone) so the raw brackets never reach the screen.
    const { brand, text: issueText } = splitJobDescription(req.description);
    const statusKey = String(req.status || '').toLowerCase();
    const isPending = statusKey === 'pending';
    const progress = STATUS_PROGRESS[statusKey] ?? 15;
    const isFocused = focusedJobId && String(focusedJobId) === String(req.id);
    return (
      <Pressable
        key={req.id}
        onPress={() => onViewDetails(req)}
        accessibilityRole="button"
        accessibilityLabel={`${req.applianceType}, ${req.status}`}
        style={({ pressed }) => [styles.refCard, isFocused && styles.cardFocused, pressed && { opacity: 0.94 }]}
      >
        <View style={styles.refHeaderRow}>
          <View style={styles.refTitleWrap}>
            <Text style={styles.refDevice} numberOfLines={1}>{req.applianceType || 'Repair request'}</Text>
            <Text style={styles.refIssue} numberOfLines={1}>{issueText || brand || 'Tap to view details'}</Text>
          </View>
          {renderStatusPill(req.status)}
        </View>
        <View style={styles.refProgressBlock}>
          <View style={styles.refProgressLabelRow}>
            <Text style={styles.refProgressLabel}>Progress</Text>
            <Text style={styles.refProgressLabel}>{progress}%</Text>
          </View>
          <View style={styles.refProgressBar}>
            <View style={[styles.refProgressFill, { width: `${progress}%` }]} />
          </View>
        </View>
        <View style={styles.refFooter}>
          <View style={styles.refFooterItem}>
            <Ionicons name="person-outline" size={12} color="#9CA3AF" accessible={false} />
            <Text style={styles.refFooterText} numberOfLines={1}>{req.technicianName || 'Finding technician'}</Text>
          </View>
          <View style={styles.refFooterItem}>
            <Ionicons name="time-outline" size={12} color="#9CA3AF" accessible={false} />
            <Text style={styles.refFooterText} numberOfLines={1}>ETA: {etaLabel(req)}</Text>
          </View>
        </View>
        {isPending && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel request for ${req.applianceType ?? 'this request'}`}
            onPress={() => cancelWithMessage(req, 'This can only be done before a technician accepts the request.')}
            style={({ pressed }) => [styles.refCancelBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.refCancelText}>Cancel request</Text>
          </Pressable>
        )}
      </Pressable>
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
            <Text style={styles.techMetaText}>{tech.rating ? Number(tech.rating).toFixed(1) : '...'}</Text>
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
            <Ionicons name={tech.workloadStatus === 'busy' ? 'time-outline' : 'checkmark-circle-outline'} size={12} color={tech.workloadStatus === 'busy' ? colors.gold : colors.customer} accessible={false} />
            <Text style={[styles.workloadText, tech.workloadStatus === 'busy' && styles.workloadTextBusy]}>
              {tech.workloadStatus === 'busy' ? `Busy - ${tech.activeJobs ?? 0} active jobs` : `Available - ${tech.activeJobs ?? 0} active jobs`}
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
                    <Ionicons name="calendar-outline" size={13} color={colors.customer} accessible={false} />
                    <Text style={styles.schedDate} numberOfLines={1}>{formatScheduleDate(shown)}</Text>
                  </View>
                  <View style={styles.schedLine}>
                    <Ionicons name="time-outline" size={13} color={colors.customer} accessible={false} />
                    <Text style={styles.schedTime} numberOfLines={1}>
                      {shown.preferredTime || 'Time to confirm'} - {shown.applianceType}
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
            <Ionicons name="person-outline" size={14} color={colors.customer} accessible={false} />
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
        <View style={styles.techList}>
          {recs.map((tech, i) => renderTechCard(req, tech, i + 1, i === 0))}
        </View>
      );
    }

    const state = recStateOf(req.id);
    if (state === 'error') {
      return (
        <View style={styles.aiMessageRow}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} accessible={false} />
          <Text style={styles.aiMessageText}>Unavailable. Pull to retry.</Text>
        </View>
      );
    }

    if (state === 'empty') {
      return (
        <View style={styles.aiMessageRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.muted} accessible={false} />
          <Text style={styles.aiMessageText}>{data?.note || 'No matches yet.'}</Text>
        </View>
      );
    }

    return (
      <View style={styles.aiLoading}>
        <ActivityIndicator size="small" color={colors.customer} />
        <Text style={styles.aiLoadingText}>Finding matches...</Text>
      </View>
    );
  };

  const renderCompletedCard = (job: CompletedJob): React.JSX.Element => {
    const isFocused = focusedJobId && String(focusedJobId) === String(job.id);
    const reviewed = Boolean(job.reviewId);
    return (
      <View key={job.id} style={[styles.refCard, isFocused && styles.cardFocused]}>
        <View style={styles.refHeaderRow}>
          <View style={styles.refTitleWrap}>
            <Text style={styles.refDevice} numberOfLines={1}>{job.applianceType || 'Repair'}</Text>
            <Text style={styles.refIssue} numberOfLines={1}>Completed by {job.technicianName || 'Assigned Tech'}</Text>
          </View>
          <View style={styles.refDonePill}>
            <Text style={styles.refDonePillText}>Completed</Text>
          </View>
        </View>
        <View style={styles.refFooter}>
          <View style={styles.refFooterItem}>
            <Ionicons name="calendar-outline" size={12} color="#9CA3AF" accessible={false} />
            <Text style={styles.refFooterText} numberOfLines={1}>{formatCardDate(job.completedAt || job.createdAt)}</Text>
          </View>
          {reviewed ? (
            <Text style={styles.refReviewedText}>Reviewed</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Rate ${job.applianceType ?? 'this job'}`}
              onPress={() => { if (onRate) onRate(job); }}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.refRateLink}>Rate</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderSectionHeader = (kicker: string, title: string, count: number, color: string = colors.customer, hint?: string): React.JSX.Element => (
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.customer} colors={[colors.customer]} />}
    >
      <View style={styles.centerWrap}>
      {/* Prototype dark header with Active / History toggle */}
      <View style={styles.protoHeader}>
        <Text style={styles.protoTitle}>My Repairs</Text>
        <View style={styles.protoTabs}>
          {(['active', 'history'] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityLabel={`${t === 'active' ? 'Active' : 'History'} repairs`}
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={({ pressed }) => [styles.protoTab, tab === t && styles.protoTabActive, pressed && { opacity: 0.9 }]}
            >
              <Text style={[styles.protoTabText, tab === t && styles.protoTabTextActive]}>
                {t === 'active' ? 'Active' : 'History'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.protoBody}>
      {actionError ? (
        <View style={styles.actionErrorBox} accessibilityRole="alert">
          <Text style={styles.actionErrorText}>{actionError}</Text>
        </View>
      ) : null}
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
      ) : tab === 'active' ? (
        activeList.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="clipboard-outline" size={34} color={colors.customer} accessible={false} />
            </View>
            <Text style={styles.emptyTitle}>No active repairs</Text>
            <Text style={styles.emptyText}>Your ongoing repair requests will appear here.</Text>
          </View>
        ) : (
          activeList.map(renderRequestCard)
        )
      ) : (
        completedJobs.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-done-outline" size={34} color={colors.customer} accessible={false} />
            </View>
            <Text style={styles.emptyTitle}>No repair history</Text>
            <Text style={styles.emptyText}>Completed repairs will appear here.</Text>
          </View>
        ) : (
          completedJobs.map(renderCompletedCard)
        )
      )}
      </View>
      </View>
      <ConfirmDialog
        visible={pendingAction !== null}
        title={pendingAction?.title ?? ''}
        message={pendingAction?.message ?? ''}
        confirmLabel={pendingAction?.confirmLabel ?? 'Confirm'}
        cancelLabel={pendingAction?.cancelLabel ?? 'Cancel'}
        danger={pendingAction?.danger ?? false}
        busy={actionBusy}
        onCancel={() => { if (!actionBusy) setPendingAction(null); }}
        onConfirm={runPendingAction}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, backgroundColor: '#F9FAFB', flexGrow: 1, alignItems: 'center' as const },
  centerWrap: { width: '100%' as const, maxWidth: 480, alignSelf: 'center' as const },
  // Prototype dark header with Active / History toggle
  protoHeader: { backgroundColor: '#0D1B2A', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginHorizontal: -20, marginTop: -20, marginBottom: 20 },
  protoTitle: { color: '#FFFFFF', fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.3, marginBottom: 16 },
  protoTabs: { flexDirection: 'row', gap: 8 },
  protoTab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center' },
  protoTabActive: { backgroundColor: colors.customer },
  protoTabText: { color: '#9CA3AF', fontSize: 14, fontFamily: fonts.semiBold },
  protoTabTextActive: { color: '#FFFFFF' },
  protoBody: { gap: 12 },
  sectionHeaderContainer: { marginBottom: 16, gap: 2 },
  kicker: { color: colors.customer, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2, textTransform: 'uppercase' as const },
  sectionTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink, lineHeight: 26, letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 4 },

  // Shared anti-slop press states: transform + opacity only (GPU path).
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  // Filters - tight within (6), generous below (18), touch-safe 44
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 20, flexWrap: 'wrap' as const },
  segment: { flex: 1, minWidth: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, paddingHorizontal: 6, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.customer, borderColor: colors.customerDark },
  segmentText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, flexShrink: 1 },
  segmentTextActive: { color: colors.white },
  segmentCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  segmentCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  segmentCountText: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  segmentCountTextActive: { color: colors.white },

  // Section headers - more space above than below (rhythm)
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 20, gap: 12 },
  sectionHeaderCopy: { flex: 1, marginRight: 10, gap: 2 },
  sectionKicker: { fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.bold, marginBottom: 1, textTransform: 'uppercase' as const },
  countBadge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontSize: 12, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },

  // Cards - generous inner (18), systematic gap rhythm
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.line, gap: 0, ...shadows.card },
  cardFocused: { borderColor: colors.customer, borderWidth: 2, ...shadows.cardStrong },
  // Reference Repairs / History cards (compact, tap-to-detail)
  refCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  refHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
  refTitleWrap: { flex: 1, minWidth: 0 },
  refDevice: { color: '#111827', fontSize: 14, fontFamily: fonts.bold },
  refIssue: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  refProgressBlock: { marginBottom: 12 },
  refProgressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  refProgressLabel: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  refProgressBar: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 999, overflow: 'hidden' },
  refProgressFill: { height: '100%', backgroundColor: colors.customer, borderRadius: 999 },
  refFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  refFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  refFooterText: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, flexShrink: 1 },
  refCancelBtn: { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8 },
  refCancelText: { color: '#DC2626', fontSize: 12, fontFamily: fonts.semiBold },
  refDonePill: { backgroundColor: '#D1FAE5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  refDonePillText: { color: '#047857', fontSize: 10, fontFamily: fonts.bold },
  refRateLink: { color: colors.customer, fontSize: 12, fontFamily: fonts.semiBold },
  refReviewedText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  iconChip: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
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
  photoBadgeText: { flex: 1, color: colors.customer, fontSize: 12, fontFamily: fonts.semiBold },
  sectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  metaRow: { flexDirection: 'row', gap: 14, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  metaText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, flex: 1 },

  // Current status hero - STRONGEST visual on card (distilled: larger, bolder, quiet surroundings)
  statusHero: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingHorizontal: 13, paddingVertical: 13, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  statusHeroIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: 1 },
  statusHeroCopy: { flex: 1 },
  statusHeroKicker: { color: colors.muted, fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.bold, marginBottom: 2 },
  statusHeroStatus: { fontSize: 11, fontFamily: fonts.extraBold },
  statusHeroTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.extraBold, marginBottom: 3, lineHeight: 18, letterSpacing: -0.2 },
  statusHeroBody: { color: colors.muted, fontSize: 11.5, lineHeight: 15.5, fontFamily: fonts.regular },

  // Next action - ONE primary dominates, secondary is ghost. Calm hierarchy.
  nextActionBlock: { gap: 8, marginBottom: 11 },
  nextActionKicker: { color: colors.customer, fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.bold },
  nextActionPrimary: { flex: 1.6 },
  secondaryAction: { minWidth: 92, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lineSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryActionText: { color: colors.muted, fontFamily: fonts.semiBold, fontSize: 12 },
  calmingInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderRadius: 10, borderWidth: 1, borderColor: colors.lineSoft, paddingHorizontal: 11, paddingVertical: 9 },
  calmingInfoText: { flex: 1, color: colors.muted, fontSize: 11.5, lineHeight: 15, fontFamily: fonts.medium },

  // De-emphasized progress history - muted, compact, never competes with statusHero
  rail: { marginBottom: 11, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: 'transparent', borderRadius: 10, borderWidth: 1, borderColor: colors.lineSoft, opacity: 0.88 },
  railHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, paddingHorizontal: 1 },
  railKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, fontFamily: fonts.bold, opacity: 0.9 },
  railStepLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold },
  railBody: { flexDirection: 'row' },
  railStep: { flex: 1, alignItems: 'center' },
  railTrack: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  railLine: { flex: 1, height: 1.5, backgroundColor: colors.line },
  railLineDone: { backgroundColor: colors.customer },
  railLineUpcoming: { backgroundColor: colors.lineSoft },
  railDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  railDotDone: { backgroundColor: colors.customer, borderColor: colors.customer },
  railDotCurrent: { borderColor: colors.customerDark, borderWidth: 2 },
  railDotUpcoming: { backgroundColor: colors.white, borderColor: colors.lineSoft },
  railDotInner: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.lineSoft },
  railLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 3, textAlign: 'center' },
  railLabelCurrent: { color: colors.customerDark, fontFamily: fonts.bold },
  railLabelUpcoming: { color: '#94A3B8', fontFamily: fonts.medium },

  // Codes
  readyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.customerSoft, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.hudBorder, marginBottom: 12, gap: 8 },
  readyText: { fontSize: 12, color: colors.customerDark, fontFamily: fonts.bold },
  completionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginBottom: 12, gap: 8 },
  completionText: { fontSize: 12, color: colors.white, fontFamily: fonts.semiBold },
  completionCode: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.white, letterSpacing: 3, fontVariant: ['tabular-nums'] },

  // Action hierarchy
  cardActions: { gap: 10 },
  primaryRow: { flexDirection: 'row', gap: 10 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryActionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.customer, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  primaryButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  detailsButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailsButtonText: { color: colors.customer, fontFamily: fonts.bold, fontSize: 14 },
  cancelButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.danger, fontSize: 14, fontFamily: fonts.bold },

  // Reviews
  reviewToggle: { minHeight: 48, borderRadius: 14, backgroundColor: colors.customerSoft, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  reviewToggleText: { color: colors.customer, fontSize: 13, fontFamily: fonts.bold },
  reviewContainer: { marginTop: 14, gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  stars: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  starButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputContainer: { flexDirection: 'row', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 70, alignItems: 'flex-start' },
  inputIcon: { marginRight: 10, marginTop: 14 },
  reviewInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 12, height: 70, textAlignVertical: 'top' },
  reviewButton: { backgroundColor: colors.customer, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadows.card },

  // Skeleton / empty / error
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  skeletonCopy: { flex: 1, marginLeft: 12 },
  skeletonMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  skeletonActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.line, gap: 10, ...shadows.card },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.customerSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 19 },
  sectionEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  sectionEmptyText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  terminalSection: { marginTop: 8 },
  terminalHeader: { marginTop: 12, backgroundColor: colors.white, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.line },
  errorCard: { backgroundColor: colors.white, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.line, gap: 10, ...shadows.card },
  actionErrorBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12, marginBottom: 12 },
  actionErrorText: { color: '#B91C1C', fontSize: 12, fontFamily: fonts.semiBold, lineHeight: 17 },
  retryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.customer, borderRadius: 14, paddingHorizontal: 22, minHeight: 48, marginTop: 6, ...shadows.card },
  retryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // AI recommendations - SECONDARY disclosure, collapsed by default. Never competes with status.
  aiPanel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, marginBottom: 11, overflow: 'hidden' as const },
  aiPanelExpanded: { borderColor: colors.hudBorder, backgroundColor: colors.canvas },
  aiPanelToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, gap: 8 },
  aiPanelToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  aiPanelIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center' },
  aiPanelTitle: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  aiCountPill: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  aiCountText: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  aiPanelToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiPanelToggleHint: { color: colors.customer, fontSize: 11, fontFamily: fonts.bold },
  aiPanelBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  aiPanelHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginBottom: 8, lineHeight: 15 },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  aiLoadingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  aiMessageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.line },
  aiMessageText: { flex: 1, color: colors.muted, fontSize: 11, fontFamily: fonts.medium, lineHeight: 15 },
  techList: { gap: 0 },
  techRow: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  techRowFirst: { borderTopWidth: 0, paddingTop: 4 },
  techRank: { color: colors.customer, fontSize: 13, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], minWidth: 16, textAlign: 'center', marginTop: 2 },
  techAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.customer, alignItems: 'center', justifyContent: 'center' },
  techAvatarImg: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.customerSoft },
  techAvatarText: { color: colors.white, fontSize: 17, fontFamily: fonts.extraBold },
  techCopy: { flex: 1, gap: 6 },
  techNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  techName: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, flex: 1 },
  matchValue: { color: colors.customer, fontSize: 12, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  techConfidence: { color: colors.customer, fontSize: 11, fontFamily: fonts.bold },
  techReason: { color: colors.ink, fontSize: 11, fontFamily: fonts.medium, lineHeight: 15 },
  techMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  techMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  techMetaText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  techSkillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  techSkillChip: { backgroundColor: colors.customerSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  techSkillText: { color: colors.customerDark, fontSize: 11, fontFamily: fonts.bold },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  availOkText: { color: colors.green, fontSize: 12, fontFamily: fonts.bold },
  availBusyText: { color: colors.gold, fontSize: 12, fontFamily: fonts.bold },
  workloadRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  workloadText: { color: colors.customer, fontSize: 11, fontFamily: fonts.bold },
  workloadTextBusy: { color: colors.gold },
  schedRow: { marginTop: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 5 },
  schedLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  schedDate: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'], flexShrink: 1 },
  schedTime: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },
  techActionsRow: { flexDirection: 'row', gap: 8 },
  techProfileButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.customerSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  techProfileButtonText: { color: colors.customer, fontSize: 12, fontFamily: fonts.bold },
  techMessageButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  techMessageButtonText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold },
});
