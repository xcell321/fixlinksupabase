import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Skeleton from '../../components/Skeleton';
import { PhotoThumb, PhotoLightbox } from '../../components/RequestPhoto';
import {
  acceptRepairRequest,
  declineRepairRequest,
  fetchRepairRequests,
  fetchTechnicianJobs,
  recordTechnicianArrival,
  reportNoShow,
  updateJobStatus,
  updateTechnicianLocation,
  verifyCompletionCode
} from '../services/api';
import { colors, fonts, shadows } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon } from '../../utils/applianceIcons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Coords {
  latitude: number;
  longitude: number;
}

interface TechnicianRef {
  uid: string;
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
}

interface Job {
  id: string;
  status?: string;
  applianceType?: string;
  customerName?: string;
  location?: string;
  latitude?: number | string;
  longitude?: number | string;
  distanceKm?: number;
  description?: string;
  preferredDate?: string;
  preferredTime?: string;
  scheduledDate?: string;
  technicianArrivalAt?: string;
  technicianUid?: string;
  technicianName?: string;
  photoUrl?: string | null;
}

interface AvailableJobsScreenProps {
  technician: TechnicianRef;
  onNavigateToMap?: (job: Job) => void;
  onNavigateToChat?: (job: Job) => void;
  onOpenNotifications?: () => void;
  notificationCount?: number;
  highlightedJobId?: string | null;
}

const NEARBY_QUEUE_RADIUS_KM = 10;
const jobsCache = new Map<string, { jobs: Job[]; acceptedJobs: Job[]; lastSyncAt: Date | null; fetchError: boolean }>();

const formatSchedule = (job: Job): string => {
  if (job?.preferredDate && job?.preferredTime) {
    return `${job.preferredDate} • ${job.preferredTime}`;
  }
  if (job?.preferredTime) return job.preferredTime;
  if (job?.preferredDate) return job.preferredDate;
  if (job?.scheduledDate) {
    try {
      const d = new Date(job.scheduledDate);
      if (!isNaN(d.getTime())) {
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
    } catch {
      return String(job.scheduledDate);
    }
  }
  return 'Schedule to confirm';
};

const scheduleParts = (job: Job): { date: string; time: string | null } => {
  const full = formatSchedule(job);
  const sep = full.indexOf('•');
  if (sep === -1) return { date: full, time: null };
  return { date: full.slice(0, sep).trim(), time: full.slice(sep + 1).trim() };
};

const statusIconName = (status: string | undefined): IconName =>
  getStatusIcon(status) as IconName;

// Display-only mapping from the existing active-job count to a workload label.
// Thresholds mirror backend/src/utils/workload.js#getWorkloadStatus
// (0–2 available, 3–5 busy, 6+ at_capacity) for ambient presentation only.
// Authoritative capacity protection stays server-side (409 TECHNICIAN_AT_CAPACITY).
const getWorkloadDisplayStatus = (count: number): 'available' | 'busy' | 'at_capacity' => {
  if (count >= 6) return 'at_capacity';
  if (count >= 3) return 'busy';
  return 'available';
};

export default function AvailableJobsScreen({
  technician,
  onNavigateToMap,
  onNavigateToChat,
  onOpenNotifications,
  notificationCount = 0,
  highlightedJobId = null
}: AvailableJobsScreenProps): React.JSX.Element {
  const cached = technician?.uid ? jobsCache.get(technician.uid) : undefined;
  const [jobs, setJobs] = useState<Job[]>(cached?.jobs ?? []);
  const [acceptedJobs, setAcceptedJobs] = useState<Job[]>(cached?.acceptedJobs ?? []);
  const [loading, setLoading] = useState<boolean>(cached ? false : true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<boolean>(cached?.fetchError ?? false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(cached?.lastSyncAt ?? null);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [techCoords, setTechCoords] = useState<Coords | null>(
    technician?.latitude && technician?.longitude
      ? { latitude: Number(technician.latitude), longitude: Number(technician.longitude) }
      : null
  );

  // OTP Verification Modal State
  const [otpModalVisible, setOtpModalVisible] = useState<boolean>(false);
  const [selectedJobForOtp, setSelectedJobForOtp] = useState<Job | null>(null);
  const [otpCode, setOtpCode] = useState<string>('');
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);

  const activeCount = acceptedJobs.length;
  const technicianName = technician?.name || 'Technician';
  const avatarInitial = technicianName.charAt(0).toUpperCase();

  // Display-only count used in the at-capacity message and the compact
  // workload strip. Authoritative blocking stays server-side
  // (409 TECHNICIAN_AT_CAPACITY).
  const workloadActiveJobs = acceptedJobs.length;
  const workloadStatus = getWorkloadDisplayStatus(workloadActiveJobs);

  // Ambient workload state for the status strip (display-only; authoritative
  // capacity protection stays server-side via 409 TECHNICIAN_AT_CAPACITY).
  const workloadHue = workloadStatus === 'at_capacity'
    ? { label: 'At Capacity', color: colors.danger }
    : workloadStatus === 'busy'
      ? { label: 'Busy', color: colors.gold }
      : { label: 'Available', color: colors.green };

  const nearbyJobs = jobs.filter((job) => {
    if (highlightedJobId && String(job.id) === String(highlightedJobId)) return true;
    if (job.distanceKm == null) return true;
    return Number(job.distanceKm) <= NEARBY_QUEUE_RADIUS_KM;
  });

  // Pending metric mirrors the visible nearby queue (10 km rule) so the
  // PENDING card never disagrees with the list the technician can see.
  const pendingCount = nearbyJobs.length;

  const [feedTab, setFeedTab] = useState<'active' | 'queue'>('active');

  useEffect(() => {
    if (!highlightedJobId) return;
    const hid = String(highlightedJobId);
    if (acceptedJobs.some((j) => String(j.id) === hid)) setFeedTab('active');
    else if (jobs.some((j) => String(j.id) === hid)) setFeedTab('queue');
  }, [highlightedJobId, acceptedJobs, jobs]);

  // The one job that leads the board: the deep-linked job, else the
  // action-needed active job (In Progress, then arrived-and-startable).
  // Display precedence only — no ordering or state change.
  const focusJob = (() => {
    const pool = feedTab === 'active' ? acceptedJobs : nearbyJobs;
    if (!pool.length) return null;
    if (highlightedJobId) {
      const hit = pool.find((j) => String(j.id) === String(highlightedJobId));
      if (hit) return hit;
    }
    if (feedTab === 'active') {
      return acceptedJobs.find((j) => j.status === 'In Progress')
        ?? acceptedJobs.find((j) => !!j.technicianArrivalAt)
        ?? null;
    }
    return null;
  })();
  const isFocus = (job: Job): boolean => !!focusJob && String(focusJob.id) === String(job.id);

  const getUpdatedTechCoords = async (): Promise<Coords | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setTechCoords(coords);
        if (technician?.uid) {
          updateTechnicianLocation(technician.uid, coords).catch(() => {});
        }
        return coords;
      }
    } catch (e) {
      console.warn('Could not update technician GPS:', e);
    }
    return techCoords;
  };

  const loadJobs = async (opts: { background?: boolean } = {}): Promise<void> => {
    const isBackground = opts.background ?? false;
    if (!isBackground && !(technician?.uid ? jobsCache.has(technician.uid) : false)) {
      setLoading(true);
    }
    try {
      const coordsForFetch = techCoords ?? undefined;
      getUpdatedTechCoords().catch(() => null);
      const [result, assigned] = await Promise.all([
        fetchRepairRequests(technician?.uid, coordsForFetch),
        fetchTechnicianJobs(technician?.uid),
      ]);
      const newJobs = Array.isArray(result) ? (result as Job[]) : [];
      const newAccepted = Array.isArray(assigned)
        ? (assigned as Job[]).filter((job) => ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(job.status ?? ''))
        : [];
      setJobs(newJobs);
      setAcceptedJobs(newAccepted);
      setFetchError(false);
      const now = new Date();
      setLastSyncAt(now);
      if (technician?.uid) jobsCache.set(technician.uid, { jobs: newJobs, acceptedJobs: newAccepted, lastSyncAt: now, fetchError: false });
    } catch (error) {
      console.warn('Failed to load technician jobs:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs({ background: technician?.uid ? jobsCache.has(technician.uid) : false });
  }, [technician?.uid]);

  const handleRefresh = (): void => {
    setRefreshing(true);
    loadJobs();
  };

  const handleAcceptJob = (job: Job): void => {
    if (!technician?.uid || acceptingJobId) return;
    Alert.alert(
      'Accept this job?',
      `${job.applianceType || 'Repair request'}${job.location ? ` — ${job.location}` : ''}\n\nThe customer will be notified and the job will move to your active list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAcceptingJobId(job.id);
            try {
              const accepted = await acceptRepairRequest(job.id, technician.uid, technician.name || 'Technician') as { jobId: string };
              setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
              setAcceptedJobs((currentJobs) => [
                {
                  ...job,
                  id: accepted.jobId,
                  status: 'Accepted',
                  technicianUid: technician.uid,
                  technicianName: technician.name,
                },
                ...currentJobs,
              ]);
              Alert.alert('Job Accepted!', 'Customer details and live route are now available in your active jobs.');
            } catch (error) {
              const err = error as { code?: string; message?: string; activeJobs?: number };
              if (err?.code === 'TECHNICIAN_AT_CAPACITY') {
                Alert.alert("You're At Capacity", err?.message || 'Complete an active job to accept new work.');
              } else {
                Alert.alert('Unable to accept job', (error as { error?: string })?.error || 'This job may already have been taken.');
              }
            } finally {
              setAcceptingJobId(null);
            }
          },
        },
      ],
    );
  };

  // Dismiss permanently hides the request for this technician, so it confirms
  // intent the same way Accept and No-Show do.
  const handleDeclineJob = (job: Job): void => {
    Alert.alert(
      'Dismiss this request?',
      `${job.applianceType || 'Repair request'}${job.location ? ` — ${job.location}` : ''}\n\nIt will no longer appear in your queue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            try {
              await declineRepairRequest(job.id, technician?.uid);
              setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
            } catch (error) {
              Alert.alert('Error', (error as { error?: string })?.error || 'Failed to dismiss job.');
            }
          },
        },
      ],
    );
  };

  const handleStartJob = async (job: Job): Promise<void> => {
    setActionLoadingId(job.id);
    try {
      await updateJobStatus(job.id, 'In Progress', technician?.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) => (j.id === job.id ? { ...j, status: 'In Progress' } : j))
      );
      Alert.alert('Job In Progress', 'Repair started. Collect the 4-digit code from the customer when finished.');
    } catch (error) {
      Alert.alert('Error', (error as { error?: string })?.error || 'Failed to update job status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArrival = async (job: Job): Promise<void> => {
    setActionLoadingId(job.id);
    try {
      await recordTechnicianArrival(job.id, technician?.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) => (j.id === job.id ? { ...j, status: 'In Progress' } : j))
      );
      Alert.alert('Arrival recorded', 'The customer has been notified of your arrival.');
    } catch (error) {
      Alert.alert('Unable to record arrival', (error as { error?: string })?.error || 'Please try again.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNoShow = (job: Job): void => {
    Alert.alert('Report no-show?', 'This records that no one was available at the service location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: async () => {
        setActionLoadingId(job.id);
        try {
          await reportNoShow(job.id, technician?.uid, 'No one available at service location');
          setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== job.id));
          Alert.alert('No-show reported', 'Customer status updated.');
          loadJobs();
        } catch (error) {
          Alert.alert('Error', (error as { error?: string })?.error || 'Please try again.');
        } finally {
          setActionLoadingId(null);
        }
      } },
    ]);
  };

  const openOtpModal = (job: Job): void => {
    setSelectedJobForOtp(job);
    setOtpCode('');
    setOtpModalVisible(true);
  };

  const handleVerifyOtp = async (): Promise<void> => {
    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length !== 4) {
      Alert.alert('Invalid Code', 'Please enter the 4-digit customer code.');
      return;
    }
    setVerifyingOtp(true);
    try {
      await verifyCompletionCode(selectedJobForOtp!.id, cleanCode);
      setOtpModalVisible(false);
      setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== selectedJobForOtp!.id));
      Alert.alert('Job Completed!', 'Repair verified and finalized successfully.');
      loadJobs();
    } catch (error) {
      Alert.alert('Verification Failed', (error as { error?: string })?.error || 'Incorrect code entered.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.centerWrap}>
          <Skeleton style={{ width: 150, height: 24, borderRadius: 6, marginBottom: 16 }} />
          <Skeleton style={{ width: '100%', height: 90, borderRadius: 16, marginBottom: 20 }} />
          <Skeleton style={{ width: '100%', height: 110, borderRadius: 16, marginBottom: 20 }} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} colors={[colors.teal]} />}
    >
      <View style={styles.centerWrap}>
        {/* Brand bar — same identity block as Customer Home, TECHNICIAN HUB variant */}
        <View style={styles.topBar}>
          <View style={styles.brandLeft}>
            <Text style={styles.brandSmall}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
            <Text style={styles.roleSmall}>TECHNICIAN HUB</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications, no unread'}
            onPress={onOpenNotifications}
            hitSlop={6}
            style={({ pressed }) => [styles.notificationQuiet, pressed && styles.pressedSoft]}
          >
            <Ionicons name="notifications-outline" size={21} color={colors.tealDark} />
            {notificationCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Hero row — Home's greeting anatomy, pointed at the dispatch board */}
        <View style={styles.heroRow}>
          <View style={styles.heroCopyWrap}>
            <Text style={styles.greeting}>Good day, {technicianName}</Text>
            <Text style={styles.heroCopy}>Here&apos;s your dispatch board for today.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{avatarInitial}</Text></View>
        </View>

        {/* Work-state banner — present only when workload changes behavior */}
        {workloadStatus !== 'available' && (() => {
          const workloadConfig = workloadStatus === 'at_capacity'
            ? {
                label: 'At Capacity' as const,
                icon: 'alert-circle-outline' as IconName,
                color: colors.danger,
                bg: colors.danger + '10',
                border: colors.danger + '20',
                message: 'New jobs paused — complete one to resume.',
              }
            : {
                label: 'Busy' as const,
                icon: 'time-outline' as IconName,
                color: colors.gold,
                bg: colors.gold + '12',
                border: colors.gold + '22',
                message: 'Several active jobs — you can still accept.',
              };
          return (
            <View
              style={[
                styles.workloadStrip,
                workloadStatus === 'at_capacity' ? styles.workloadStripAtCapacity : styles.workloadStripBusy,
              ]}
              accessibilityRole="text"
              accessibilityLabel={`${workloadConfig.label} — ${workloadActiveJobs} active ${workloadActiveJobs === 1 ? 'job' : 'jobs'}. ${workloadConfig.message}`}
            >
              <View style={[styles.workloadIcon, { backgroundColor: workloadConfig.bg, borderColor: workloadConfig.border }]}>
                <Ionicons name={workloadConfig.icon} size={14} color={workloadConfig.color} accessible={false} />
              </View>
              <Text style={[styles.workloadText, { color: workloadConfig.color }]} numberOfLines={1}>
                {workloadConfig.label}
                <Text style={styles.workloadCount}> · {workloadActiveJobs} active</Text>
              </Text>
            </View>
          );
        })()}

        {/* Status strip — Home's stat-strip anatomy carrying the feed tabs */}
        <View style={styles.statusStrip} accessibilityRole="tablist">
          <Pressable
            style={({ pressed }) => [styles.statusSegment, feedTab === 'active' && styles.statusSegmentSelected, pressed && styles.pressedSoft]}
            accessibilityRole="tab"
            accessibilityState={{ selected: feedTab === 'active' }}
            accessibilityLabel={`My Active Jobs, ${activeCount}`}
            onPress={() => setFeedTab('active')}
          >
            <View style={styles.statusLabelRow}>
              <Ionicons name="sync" size={12} color={colors.teal} />
              <Text style={styles.statusLabel}>Active</Text>
            </View>
            <Text style={[styles.statusValue, feedTab === 'active' && styles.statusValueActive]}>{activeCount}</Text>
          </Pressable>
          <View style={styles.statusDivider} />
          <Pressable
            style={({ pressed }) => [styles.statusSegment, feedTab === 'queue' && styles.statusSegmentSelected, pressed && styles.pressedSoft]}
            accessibilityRole="tab"
            accessibilityState={{ selected: feedTab === 'queue' }}
            accessibilityLabel={`Pending requests, ${pendingCount}`}
            onPress={() => setFeedTab('queue')}
          >
            <View style={styles.statusLabelRow}>
              <Ionicons name="time" size={12} color={colors.gold} />
              <Text style={styles.statusLabel}>Pending</Text>
            </View>
            <Text style={[styles.statusValue, feedTab === 'queue' && styles.statusValueActive]}>{pendingCount}</Text>
          </Pressable>
          <View style={styles.statusDivider} />
          <View style={styles.statusSegment}>
            <View style={styles.statusLabelRow}>
              <Ionicons name={workloadStatus === 'at_capacity' ? 'alert-circle-outline' : workloadStatus === 'busy' ? 'time' : 'checkmark-circle'} size={12} color={workloadHue.color} />
              <Text style={styles.statusLabel}>Workload</Text>
            </View>
            <Text style={[styles.statusValue, styles.statusValueWorkload, { color: workloadHue.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{workloadHue.label}</Text>
          </View>
        </View>
        {feedTab === 'queue' ? (
          <Text style={styles.queueHelper} numberOfLines={1}>Showing within 10 km</Text>
        ) : null}

        <Text style={styles.sectionTitle} numberOfLines={1}>{feedTab === 'active' ? 'My active jobs' : 'Nearby queue'}</Text>

        {/* Offline / error state — rendered only when the existing fetchError is set */}
        {fetchError && jobs.length === 0 && acceptedJobs.length === 0 ? (
          <View
            style={styles.errorCard}
            accessibilityRole="alert"
            accessibilityLabel="Unable to load jobs. Check your connection and try again."
          >
            <View style={styles.errorIconWrap}>
              <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} accessible={false} />
            </View>
            <Text style={styles.errorTitle}>Unable to load jobs</Text>
            <Text style={styles.errorText}>Check your connection and try again. Your accepted jobs are safe.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading jobs"
              onPress={handleRefresh}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="refresh" size={16} color={colors.white} accessible={false} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {fetchError && (jobs.length > 0 || acceptedJobs.length > 0) ? (
          <View style={styles.offlineBanner} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} accessible={false} />
            <Text style={styles.offlineBannerText} numberOfLines={2}>Unable to refresh — showing last loaded jobs.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry refreshing jobs"
              onPress={handleRefresh}
              style={({ pressed }) => [styles.offlineRetry, pressed && styles.pressedSoft]}
            >
              <Text style={styles.offlineRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Feed List Items */}
        {feedTab === 'active' ? (
          acceptedJobs.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Ionicons name="checkmark-circle-outline" size={20} color={colors.teal} /></View>
              <View style={styles.emptyText}>
                <Text style={styles.emptyTitle}>No active jobs</Text>
                <Text style={styles.emptyCopy}>Pull a request from the Nearby queue to get started.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.jobLedger}>
            {acceptedJobs.map((job, idx) => {
              const isInProgress = job.status === 'In Progress';
              const isConfirmed = job.status === 'Confirmed';
              const isReady = job.status === 'Customer Ready';
              const hasArrived = !!job.technicianArrivalAt;

              return (
                <View key={job.id} style={[styles.jobLedgerRow, idx > 0 && styles.jobLedgerDivider, isFocus(job) && styles.jobLedgerRowFocus]}>
                  <View style={styles.jobCardTop}>
                    <View style={[styles.ledgerIcon, { backgroundColor: getStatusColor(job.status) + '15' }]}>
                      <Ionicons name={statusIconName(job.status)} size={18} color={getStatusColor(job.status)} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.jobStatusRow}>
                        <Text style={styles.jobAppliance} numberOfLines={1}>{job.applianceType || 'Repair Job'}</Text>
                        <View style={[styles.statusPill, { backgroundColor: getStatusColor(job.status) + '15', borderColor: getStatusColor(job.status) + '40' }]}>
                          <Ionicons name={statusIconName(job.status)} size={10} color={getStatusColor(job.status)} />
                          <Text style={[styles.statusPillText, { color: getStatusColor(job.status) }]} numberOfLines={1}>{job.status || 'Accepted'}</Text>
                        </View>
                      </View>
                      <View style={styles.jobMetaRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.tealDark} />
                        <Text style={styles.jobDate} numberOfLines={1}>{formatSchedule(job)}</Text>
                      </View>
                      <View style={styles.jobMetaRow}>
                        <Ionicons name="person-outline" size={13} color={colors.muted} />
                        <Text style={styles.jobCustomer} numberOfLines={1}>{job.customerName || 'Customer'}</Text>
                      </View>
                      <View style={styles.jobMetaRow}>
                        <Ionicons name="location-outline" size={13} color={colors.muted} />
                        <Text style={styles.jobLocation} numberOfLines={1}>{job.location || 'Location specified'}</Text>
                      </View>
                    </View>
                  </View>

                  {job.photoUrl ? (
                    <PhotoThumb photoUrl={job.photoUrl} onPress={() => setPreviewUrl(job.photoUrl ?? null)} />
                  ) : null}

                  <View style={styles.jobActionRow}>
                    {!isInProgress && !hasArrived && (isConfirmed || isReady || job.status === 'Accepted') && (
                      <View style={styles.arrivalRow}>
                        <Pressable style={styles.primaryBtn} onPress={() => handleArrival(job)} disabled={actionLoadingId === job.id} accessibilityRole="button" accessibilityLabel={`Mark arrival for ${job.applianceType || 'job'}`}>
                          {actionLoadingId === job.id ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.primaryBtnText}>Mark Arrival</Text>}
                        </Pressable>
                        <Pressable style={styles.dangerOutlineBtn} onPress={() => handleNoShow(job)} accessibilityRole="button" accessibilityLabel={`Report no-show for ${job.applianceType || 'job'}`}>
                          <Text style={styles.dangerOutlineText}>No-Show</Text>
                        </Pressable>
                      </View>
                    )}

                    {!isInProgress && hasArrived && (
                      <Pressable style={styles.primaryBtn} onPress={() => handleStartJob(job)} disabled={actionLoadingId === job.id}>
                        {actionLoadingId === job.id ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.primaryBtnText}>Start Repair</Text>}
                      </Pressable>
                    )}

                    {isInProgress && (
                      <Pressable style={styles.completeBtn} onPress={() => openOtpModal(job)}>
                        <Ionicons name="key-outline" size={15} color={colors.white} style={{ marginRight: 6 }} />
                        <Text style={styles.primaryBtnText}>Complete (Enter OTP)</Text>
                      </Pressable>
                    )}

                    {onNavigateToMap && (
                      <Pressable style={styles.iconCompanion} onPress={() => onNavigateToMap(job)} accessibilityRole="button" accessibilityLabel={`Open map for ${job.applianceType || 'job'}`}>
                        <Ionicons name="map-outline" size={20} color={colors.tealDark} />
                      </Pressable>
                    )}
                    {onNavigateToChat && (
                      <Pressable style={styles.iconCompanion} onPress={() => onNavigateToChat(job)} accessibilityRole="button" accessibilityLabel={`Message ${job.customerName || 'customer'}`}>
                        <Ionicons name="chatbubble-outline" size={20} color={colors.tealDark} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
            </View>
          )
        ) : (
          nearbyJobs.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Ionicons name="radio-outline" size={20} color={colors.teal} /></View>
              <View style={styles.emptyText}>
                <Text style={styles.emptyTitle}>Queue is clear</Text>
                <Text style={styles.emptyCopy}>No pending requests within 10 km right now.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.jobLedger}>
            {nearbyJobs.map((job, idx) => (
              <View key={job.id} style={[styles.jobLedgerRow, idx > 0 && styles.jobLedgerDivider, isFocus(job) && styles.jobLedgerRowFocus]}>
                <View style={styles.jobCardTop}>
                  <View style={[styles.ledgerIcon, styles.ledgerIconQueue]}>
                    <Ionicons name={getApplianceIcon(job.applianceType) as never} size={18} color={colors.teal} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.queueTitleRow}>
                      <Text style={styles.jobAppliance} numberOfLines={1}>{job.applianceType || 'Repair request'}</Text>
                      {job.distanceKm != null ? (
                        <View style={styles.distancePill} accessibilityRole="text" accessibilityLabel={`${Number(job.distanceKm).toFixed(1)} kilometers away`}>
                          <Ionicons name="navigate" size={10} color={colors.tealDark} />
                          <Text style={styles.distancePillText} numberOfLines={1}>{`${Number(job.distanceKm).toFixed(1)} km`}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.jobMetaRow}>
                      <Ionicons name="calendar-outline" size={13} color={colors.tealDark} />
                      <Text style={styles.jobDate} numberOfLines={1}>{formatSchedule(job)}</Text>
                    </View>
                    <View style={styles.jobMetaRow}>
                      <Ionicons name="location-outline" size={13} color={colors.muted} />
                      <Text style={styles.jobLocation} numberOfLines={1}>{job.location || 'Location specified'}</Text>
                    </View>
                  </View>
                </View>

                {job.photoUrl ? (
                  <PhotoThumb photoUrl={job.photoUrl} onPress={() => setPreviewUrl(job.photoUrl ?? null)} />
                ) : null}

                <View style={styles.jobActionRow}>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => handleAcceptJob(job)}
                    disabled={acceptingJobId === job.id}
                  >
                    {acceptingJobId === job.id ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.primaryBtnText}>Accept Job</Text>}
                  </Pressable>
                  <Pressable style={styles.dangerOutlineBtn} onPress={() => handleDeclineJob(job)}>
                    <Text style={styles.dangerOutlineText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            </View>
          )
        )}
      </View>

      {/* OTP Verification Modal */}
      <Modal visible={otpModalVisible} transparent={true} animationType="fade" onRequestClose={() => setOtpModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Completion Code</Text>
              <Pressable onPress={() => setOtpModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>Ask the customer for their 4-digit completion code to close out this job.</Text>
            <TextInput
              style={styles.otpInputBox}
              placeholder="0000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={4}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus={true}
            />
            <Pressable style={styles.primaryBtn} onPress={handleVerifyOtp} disabled={verifyingOtp}>
              {verifyingOtp ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.primaryBtnText}>Verify & Complete</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Attached repair photo viewer */}
      <PhotoLightbox
        visible={previewUrl !== null}
        photoUrl={previewUrl}
        title="Problem photo"
        subtitle="Attached by the customer"
        onClose={() => setPreviewUrl(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  centerWrap: { width: '100%', maxWidth: 600, alignSelf: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  brandLeft: { flex: 1, minWidth: 0, gap: 1 },
  brandSmall: { color: colors.ink, fontSize: 16, fontFamily: fonts.extraBold, letterSpacing: -0.3, lineHeight: 18 },
  brandAccent: { color: colors.teal, fontFamily: fonts.extraBold },
  roleSmall: { color: colors.muted, fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold, lineHeight: 11 },
  notificationQuiet: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealLight,
    borderWidth: 1,
    borderColor: colors.hudBorder,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.white,
  },
  notifBadgeText: { color: colors.white, fontSize: 11, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },

  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 },
  heroCopyWrap: { flex: 1, paddingRight: 6, minWidth: 0 },
  greeting: { color: colors.ink, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.7, lineHeight: 30 },
  heroCopy: { color: colors.muted, fontSize: 13, marginTop: 2, fontFamily: fonts.regular, lineHeight: 18 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hudBorder },
  avatarText: { color: colors.tealDark, fontSize: 18, fontFamily: fonts.bold },

  statusStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  statusSegment: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, minWidth: 0, borderRadius: 16 },
  statusSegmentSelected: { backgroundColor: colors.tealLight },
  statusDivider: { borderLeftWidth: 1, borderColor: colors.lineSoft, marginVertical: 2 },
  statusLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, letterSpacing: 0.4, textTransform: 'uppercase' },
  statusValue: { color: colors.ink, fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], lineHeight: 26 },
  statusValueActive: { color: colors.teal },
  statusValueWorkload: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold },

  sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3, marginBottom: 10 },
  workloadStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  workloadStripBusy: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  workloadStripAtCapacity: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  workloadIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  workloadText: { flex: 1, fontSize: 13, fontFamily: fonts.bold },
  workloadCount: { color: colors.muted, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  errorCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    ...shadows.subtle,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.danger + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, marginBottom: 4 },
  errorText: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 16 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.teal,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 20,
  },
  retryButtonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  offlineBannerText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  offlineRetry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  offlineRetryText: { fontFamily: fonts.bold, fontSize: 13, color: colors.teal },

  queueHelper: {
    fontFamily: fonts?.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    marginBottom: 10,
  },

  jobLedger: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
    overflow: 'hidden',
    ...shadows.subtle,
  },
  jobLedgerRow: { padding: 14 },
  jobLedgerDivider: { borderTopWidth: 1, borderColor: colors.lineSoft },
  jobLedgerRowFocus: { backgroundColor: colors.tealLight },
  ledgerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  ledgerIconQueue: { backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder },
  jobCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  jobStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  jobAppliance: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts?.bold,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.15,
    color: colors.ink,
  },
  queueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  distancePill: {
    flexShrink: 0,
    maxWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.tealLight,
    borderColor: colors.hudBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: 'center',
  },
  distancePillText: {
    fontFamily: fonts?.bold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.tealDark,
    fontVariant: ['tabular-nums'],
  },
  jobMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  jobCustomer: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts?.semiBold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.ink,
  },
  statusPill: {
    flexShrink: 0,
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tealLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.teal + '40',
  },
  statusPillText: {
    fontFamily: fonts?.bold,
    fontSize: 10,
    color: colors.teal,
  },
  jobLocation: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts?.regular,
    fontSize: 13,
    lineHeight: 17,
    color: colors.muted,
  },
  jobDate: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts?.semiBold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.tealDark,
  },
  iconCompanion: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.tealLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  arrivalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  primaryBtn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.teal,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
  },
  completeBtn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.green,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
  },
  primaryBtnText: {
    fontFamily: fonts?.bold,
    fontSize: 13,
    color: colors.white,
  },
  dangerOutlineBtn: {
    flexShrink: 0,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerOutlineText: {
    fontFamily: fonts?.bold,
    fontSize: 13,
    color: colors.danger,
  },

  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
  },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hudBorder },
  emptyText: { flex: 1, gap: 2, minWidth: 0 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 2, lineHeight: 18 },
  emptyCopy: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, lineHeight: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...shadows.subtle,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: fonts?.bold,
    fontSize: 18,
    color: colors.ink,
  },
  modalDesc: {
    fontFamily: fonts?.regular,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  otpInputBox: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    height: 52,
    textAlign: 'center',
    fontFamily: fonts?.bold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: 8,
    marginBottom: 20,
  },
  pressedSoft: { opacity: 0.85 },
});
