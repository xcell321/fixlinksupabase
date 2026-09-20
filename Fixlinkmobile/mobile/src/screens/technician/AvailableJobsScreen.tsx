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
import { getStatusColor, getStatusIcon } from '../../utils/applianceIcons';

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
}

interface AvailableJobsScreenProps {
  technician: TechnicianRef;
  onNavigateToMap?: (job: Job) => void;
  onNavigateToChat?: (job: Job) => void;
  onOpenNotifications?: () => void;
  notificationCount?: number;
  highlightedJobId?: string | null;
}

const BOGO_LANDMARKS: Record<string, Coords> = {
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
  'la paz': { latitude: 11.0720, longitude: 124.0010 }
};

const resolveJobCoords = (job: Job): Coords | null => {
  const lat = Number(job?.latitude);
  const lon = Number(job?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  const lower = String(job?.location || '').toLowerCase();
  for (const [key, coords] of Object.entries(BOGO_LANDMARKS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number | null => {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (x: number): number => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

const formatSchedule = (job: Job): string => {
  if (job?.preferredDate && job?.preferredTime) {
    return `${job.preferredDate} • ${job.preferredTime}`;
  }
  if (job?.preferredTime) {
    return job.preferredTime;
  }
  if (job?.preferredDate) {
    return job.preferredDate;
  }
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

// Display-only split of the existing formatSchedule() output on the '•'
// separator it already emits. Date part gets the calendar icon, time part
// gets the clock icon. No logic or data changes.
const scheduleParts = (job: Job): { date: string; time: string | null } => {
  const full = formatSchedule(job);
  const sep = full.indexOf('•');
  if (sep === -1) return { date: full, time: null };
  return { date: full.slice(0, sep).trim(), time: full.slice(sep + 1).trim() };
};

// Display-only mapping from the existing active-job count to a workload label.
// Thresholds are the existing business rules (0–2 available, 3–5 busy, 6+ at_capacity)
// and are not a new rule — they mirror backend/src/utils/workload.js#getWorkloadStatus
// for ambient presentation only. The count itself comes from the existing
// acceptedJobs filter (Accepted/Confirmed/Customer Ready/In Progress).
const getWorkloadDisplayStatus = (count: number): 'available' | 'busy' | 'at_capacity' => {
  if (count >= 6) return 'at_capacity';
  if (count >= 3) return 'busy';
  return 'available';
};

const statusIconName = (status: string | undefined): IconName =>
  getStatusIcon(status) as IconName;

export default function AvailableJobsScreen({ technician, onNavigateToMap, onNavigateToChat, onOpenNotifications, notificationCount = 0, highlightedJobId = null }: AvailableJobsScreenProps): React.JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [acceptedJobs, setAcceptedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
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

  // Ambient workload strip — display-only derived from existing acceptedJobs state.
  // Count is the existing ACTIVE filter (Accepted/Confirmed/Customer Ready/In Progress)
  // already used for acceptedJobs; status is the display-only threshold mapping
  // (0–2 available, 3–5 busy, 6+ at_capacity) mirroring backend workload.js.
  // No new API, no business-rule change — purely for calm, persistent presentation.
  const workloadActiveJobs = acceptedJobs.length;
  const workloadStatus = getWorkloadDisplayStatus(workloadActiveJobs);

  const formatLastSyncTime = (date: Date): string => {
    try {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return date.toLocaleTimeString();
    }
  };

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

  const loadJobs = async (): Promise<void> => {
    try {
      const coords = await getUpdatedTechCoords();
      const [result, assigned] = await Promise.all([
        fetchRepairRequests(technician?.uid, coords ?? undefined),
        fetchTechnicianJobs(technician?.uid),
      ]);
      setJobs(Array.isArray(result) ? (result as Job[]) : []);
      setAcceptedJobs(
        Array.isArray(assigned)
          ? (assigned as Job[]).filter((job) => ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(job.status ?? ''))
          : []
      );
      setFetchError(false);
      setLastSyncAt(new Date());
    } catch (error) {
      console.warn('Failed to load technician jobs:', error);
      // Preserve previously loaded jobs instead of wiping to empty.
      // fetchError distinguishes this failure from a true empty result.
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [technician?.uid]);

  const handleRefresh = (): void => {
    setRefreshing(true);
    loadJobs();
  };

  const handleRetry = (): void => {
    // Reuse the existing fetch path — do not duplicate API logic.
    // If we have never synced successfully, show the initial loading skeleton.
    // Otherwise use the pull-to-refresh path so the existing list stays visible.
    if (lastSyncAt === null) {
      setLoading(true);
      setFetchError(false);
      loadJobs();
    } else {
      handleRefresh();
    }
  };

  const handleAcceptJob = async (job: Job): Promise<void> => {
    if (!technician?.uid || acceptingJobId) return;
    // Ambient workload: the persistent strip already communicates Busy / At Capacity
    // before the technician taps Accept. Do not block with an informational Alert here;
    // the authoritative backend guard (409 TECHNICIAN_AT_CAPACITY) remains the
    // single source of truth and is handled in the catch below.
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
          technicianName: technician.name
        },
        ...currentJobs
      ]);
      Alert.alert('Job Accepted!', 'The customer details and live route are now available in your active jobs.');
    } catch (error) {
      const err = error as { code?: string; error?: string; message?: string; activeJobs?: number };
      if (err?.code === 'TECHNICIAN_AT_CAPACITY' || String(err?.error || '').toLowerCase().includes('at capacity') || String(err?.message || '').toLowerCase().includes('at capacity')) {
        Alert.alert(
          "You're At Capacity",
          err?.message || `You currently have ${err?.activeJobs ?? workloadActiveJobs} active repair requests and cannot accept another request. New jobs are paused while you're at capacity — complete an active job to accept new work.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Unable to accept job', (error as { error?: string })?.error || 'This job may already have been accepted by another technician.');
      }
    } finally {
      setAcceptingJobId(null);
    }
  };

  const handleDeclineJob = async (job: Job): Promise<void> => {
    try {
      await declineRepairRequest(job.id, technician?.uid);
      setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
    } catch (error) {
      Alert.alert('Error', (error as { error?: string })?.error || 'Failed to dismiss job.');
    }
  };

  const handleStartJob = async (job: Job): Promise<void> => {
    setActionLoadingId(job.id);
    try {
      await updateJobStatus(job.id, 'In Progress', technician?.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) => (j.id === job.id ? { ...j, status: 'In Progress' } : j))
      );
      Alert.alert(
        'Job In Progress',
        'Repair is now in progress. When you finish, ask the customer for their 4-digit completion code.'
      );
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
        currentJobs.map((j) => (j.id === job.id ? { ...j, technicianArrivalAt: new Date().toISOString() } : j))
      );
      Alert.alert('Arrival recorded', 'The customer has been notified you are at the location.');
    } catch (error) {
      Alert.alert('Unable to record arrival', (error as { error?: string })?.error || 'Please try again.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNoShow = (job: Job): void => {
    Alert.alert('Report no-show?', 'This creates a record that no one was available at the service location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: async () => {
        setActionLoadingId(job.id);
        try {
          const result = await reportNoShow(job.id, technician?.uid, 'No one available at the service location') as { level?: string };
          setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== job.id));
          Alert.alert(
            'No-show reported',
            result?.level === 'restricted'
              ? 'A report has been submitted for admin review.'
              : result?.level === 'flagged'
                ? 'Customer account flagged for review.'
                : 'First warning issued to customer.'
          );
          loadJobs();
        } catch (error) {
          Alert.alert('Unable to report no-show', (error as { error?: string })?.error || 'Please try again.');
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
      Alert.alert('Invalid Code', 'Please enter the 4-digit code provided by the customer.');
      return;
    }
    setVerifyingOtp(true);
    try {
      await verifyCompletionCode(selectedJobForOtp!.id, cleanCode);
      setOtpModalVisible(false);
      setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== selectedJobForOtp!.id));
      Alert.alert('Job Completed!', 'The repair has been successfully verified and completed.');
      loadJobs();
    } catch (error) {
      Alert.alert('Verification Failed', (error as { error?: string })?.error || 'The code entered does not match the customer code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const renderStatusPill = (status: string | undefined): React.JSX.Element => {
    const color = getStatusColor(status);
    return (
      <View style={[styles.statusBadge, { backgroundColor: color + '15', borderColor: color + '40' }]}>
        <Ionicons name={statusIconName(status)} size={11} color={color} accessible={false} />
        <Text style={[styles.statusBadgeText, { color }]}>{status}</Text>
      </View>
    );
  };

  const renderScheduleMeta = (job: Job): React.JSX.Element => {
    const parts = scheduleParts(job);
    return (
      <View style={styles.scheduleBlock}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={16} color={colors.muted} accessible={false} />
          <Text style={styles.metaText} numberOfLines={1}>{parts.date}</Text>
        </View>
        {parts.time ? (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.muted} accessible={false} />
            <Text style={styles.metaText} numberOfLines={1}>{parts.time}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.skeletonHeroRow}>
          <View style={styles.skeletonHeroCopy}>
            <Skeleton style={{ width: 105, height: 10, marginBottom: 9 }} />
            <Skeleton style={{ width: '82%', height: 28, marginBottom: 8 }} />
            <Skeleton style={{ width: '96%', height: 13, marginBottom: 5 }} />
            <Skeleton style={{ width: '70%', height: 13 }} />
          </View>
          <Skeleton style={{ width: 46, height: 46, borderRadius: 15 }} />
        </View>

        <View style={styles.skeletonStatusCard}>
          <Skeleton style={{ width: 42, height: 42, borderRadius: 14, marginRight: 12 }} />
          <View style={styles.skeletonStatusCopy}>
            <Skeleton style={{ width: '52%', height: 15, marginBottom: 7 }} />
            <Skeleton style={{ width: '88%', height: 12 }} />
          </View>
          <Skeleton style={{ width: 9, height: 9, borderRadius: 5 }} />
        </View>

        {[1, 2, 3].map((item) => (
          <View key={item} style={styles.skeletonJobCard}>
            <View style={styles.skeletonJobTopRow}>
              <Skeleton style={{ width: 42, height: 42, borderRadius: 14, marginRight: 11 }} />
              <View style={styles.skeletonJobCopy}>
                <Skeleton style={{ width: 78, height: 20, borderRadius: 8, marginBottom: 9 }} />
                <Skeleton style={{ width: '58%', height: 18, marginBottom: 7 }} />
                <Skeleton style={{ width: '82%', height: 12 }} />
              </View>
              <View style={styles.skeletonJobActions}>
                <Skeleton style={{ width: 34, height: 34, borderRadius: 10 }} />
                <Skeleton style={{ width: 34, height: 34, borderRadius: 10 }} />
              </View>
            </View>
            <Skeleton style={{ width: '100%', height: 44, borderRadius: 12 }} />
          </View>
        ))}
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
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>TECHNICIAN HUB</Text>
          <Text style={styles.greeting}>Jobs for your skills</Text>
          <Text style={styles.subtitle}>Review nearby repair work and choose your next dispatch.</Text>
        </View>
        <View style={styles.heroActions}>
          <View
            style={styles.jobCount}
            accessibilityRole="text"
            accessibilityLabel={`${jobs.length} nearby jobs`}
          >
            <Text style={styles.jobCountValue}>{jobs.length}</Text>
            <Text style={styles.jobCountLabel}>nearby</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notificationCount > 0 ? `Open notifications, ${notificationCount} unread` : 'Open notifications'}
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.techNotification, pressed && styles.pressedSoft]}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} accessible={false} />
            {notificationCount > 0 && (
              <View style={styles.techNotificationBadge}>
                <Text style={styles.techNotificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Workload ambient strip — calm, persistent capacity communication.
          Replaces the generic "Availability is ON" presentation. Manual availability
          and workload capacity remain distinct: this strip reflects workload (derived
          from existing acceptedJobs ACTIVE filter) not a manual toggle. */}
      {(() => {
        const workloadConfig = workloadStatus === 'at_capacity'
          ? {
              label: 'At Capacity' as const,
              icon: 'alert-circle-outline' as IconName,
              color: colors.danger,
              bg: colors.danger + '15',
              border: colors.danger + '30',
              title: `At Capacity — ${workloadActiveJobs} active ${workloadActiveJobs === 1 ? 'job' : 'jobs'}`,
              message: 'New jobs are paused. Complete an active job to accept new work.',
            }
          : workloadStatus === 'busy'
            ? {
                label: 'Busy' as const,
                icon: 'time-outline' as IconName,
                color: colors.gold,
                bg: colors.gold + '15',
                border: colors.gold + '30',
                title: `Busy — ${workloadActiveJobs} active ${workloadActiveJobs === 1 ? 'job' : 'jobs'}`,
                message: 'You have several active jobs. You can still accept new work.',
              }
            : {
                label: 'Available' as const,
                icon: 'checkmark-circle-outline' as IconName,
                color: colors.green,
                bg: colors.green + '15',
                border: colors.green + '30',
                title: `Available — ${workloadActiveJobs} active ${workloadActiveJobs === 1 ? 'job' : 'jobs'}`,
                message: workloadActiveJobs === 0
                  ? 'You’re ready for new requests.'
                  : 'You’re ready for new requests.',
              };
        return (
          <View
            style={[
              styles.workloadCard,
              workloadStatus === 'at_capacity'
                ? styles.workloadCardAtCapacity
                : workloadStatus === 'busy'
                  ? styles.workloadCardBusy
                  : styles.workloadCardAvailable,
            ]}
            accessibilityRole="text"
            accessibilityLabel={`${workloadConfig.label} — ${workloadActiveJobs} active ${workloadActiveJobs === 1 ? 'job' : 'jobs'}. ${workloadConfig.message}`}
          >
            <View style={[styles.workloadIcon, { backgroundColor: workloadConfig.bg, borderColor: workloadConfig.border }]}>
              <Ionicons name={workloadConfig.icon} size={20} color={workloadConfig.color} accessible={false} />
            </View>
            <View style={styles.workloadCopy}>
              <Text style={styles.workloadKicker}>WORKLOAD</Text>
              <Text style={[styles.workloadTitle, { color: workloadConfig.color }]} numberOfLines={1}>
                {workloadConfig.label}
                <Text style={[styles.workloadTitle, { color: colors.muted, fontFamily: fonts.medium }]}> — </Text>
                <Text style={[styles.workloadCount, { color: workloadConfig.color }]}>{workloadActiveJobs} active {workloadActiveJobs === 1 ? 'job' : 'jobs'}</Text>
              </Text>
              <Text style={styles.workloadMessage}>{workloadConfig.message}</Text>
            </View>
            <View style={[styles.workloadStatusDot, { backgroundColor: workloadConfig.color }]} accessible={false} />
          </View>
        );
      })()}

      {/* ACCEPTED JOBS SECTION */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.kicker}>YOUR WORK</Text>
          <Text style={styles.sectionTitle}>My active jobs</Text>
        </View>
        <Text style={styles.acceptedCount}>{acceptedJobs.length}</Text>
      </View>

      {acceptedJobs.length === 0 ? (
        <View style={styles.acceptedEmpty}>
          <Ionicons name="checkmark-done-outline" size={22} color={colors.teal} accessible={false} />
          <Text style={styles.acceptedEmptyText}>No active jobs currently in progress.</Text>
        </View>
      ) : (
        acceptedJobs.map((job) => {
          const isInProgress = job.status === 'In Progress';
          const isAccepted = job.status === 'Accepted';
          const isConfirmed = job.status === 'Confirmed';
          const isReady = job.status === 'Customer Ready';
          const hasArrived = !!job.technicianArrivalAt;
          const canStart = isReady;
          const isHighlighted = highlightedJobId && String(highlightedJobId) === String(job.id);
          return (
            <View key={job.id} style={[styles.acceptedCard, isHighlighted && styles.highlightedCard]}>
              <View style={styles.acceptedTopRow}>
                <View style={styles.acceptedIcon}>
                  <Ionicons name="construct" size={20} color={colors.teal} accessible={false} />
                </View>
                <View style={styles.acceptedCopy}>
                  {renderStatusPill(job.status)}
                  <Text style={styles.acceptedTitle}>{job.applianceType || 'Repair request'}</Text>
                  <Text style={styles.acceptedMeta} numberOfLines={1}>
                    {job.customerName || 'Customer'} • {job.location || 'Location pending'}
                  </Text>
                  {(job.preferredDate || job.preferredTime || job.scheduledDate) && (
                    <View style={styles.acceptedSchedule}>
                      {(() => {
                        const parts = scheduleParts(job);
                        return (
                          <View style={styles.scheduleInline}>
                            <Ionicons name="calendar-outline" size={13} color={colors.tealDark} accessible={false} />
                            <Text style={styles.acceptedScheduleText} numberOfLines={1}>
                              {parts.date}{parts.time ? ` • ${parts.time}` : ''}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  )}
                </View>
                <View style={styles.acceptedIconActions}>
                  {onNavigateToMap && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Track ${job.applianceType || 'job'} on the map`}
                      hitSlop={6}
                      onPress={() => onNavigateToMap(job)}
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressedSoft]}
                    >
                      <Ionicons name="map-outline" size={17} color={colors.white} accessible={false} />
                    </Pressable>
                  )}
                  {onNavigateToChat && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Message about ${job.applianceType || 'job'}`}
                      hitSlop={6}
                      onPress={() => onNavigateToChat(job)}
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressedSoft]}
                    >
                      <Ionicons name="chatbubble-outline" size={17} color={colors.white} accessible={false} />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Status Action Buttons */}
              <View style={styles.acceptedActionRow}>
                {!isInProgress && !hasArrived && (isConfirmed || isReady) && (
                  <View style={styles.arrivalRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark arrival for ${job.applianceType || 'job'}`}
                      accessibilityHint="Notify the customer you are at the location"
                      accessibilityState={{ disabled: actionLoadingId === job.id }}
                      onPress={() => handleArrival(job)}
                      disabled={actionLoadingId === job.id}
                      style={({ pressed }) => [styles.arrivalButton, pressed && actionLoadingId !== job.id && styles.pressed]}
                    >
                      {actionLoadingId === job.id ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <>
                          <Ionicons name="navigate" size={15} color={colors.white} accessible={false} />
                          <Text style={styles.arrivalButtonText}>Mark Arrival</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Report no-show for ${job.applianceType || 'job'}`}
                      accessibilityHint="Asks for confirmation first"
                      accessibilityState={{ disabled: actionLoadingId === job.id }}
                      onPress={() => handleNoShow(job)}
                      disabled={actionLoadingId === job.id}
                      style={({ pressed }) => [styles.noShowButton, pressed && actionLoadingId !== job.id && styles.pressedSoft]}
                    >
                      <Text style={styles.noShowButtonText}>No-Show</Text>
                    </Pressable>
                  </View>
                )}
                {!isInProgress && canStart && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Start repair job for ${job.applianceType || 'job'}`}
                    accessibilityState={{ disabled: actionLoadingId === job.id }}
                    onPress={() => handleStartJob(job)}
                    disabled={actionLoadingId === job.id}
                    style={({ pressed }) => [styles.startJobButton, pressed && actionLoadingId !== job.id && styles.pressed]}
                  >
                    {actionLoadingId === job.id ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <>
                        <Ionicons name="play" size={15} color={colors.white} accessible={false} />
                        <Text style={styles.startJobButtonText}>Start Repair Job</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {isInProgress && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Complete job for ${job.applianceType || 'job'}, enter code`}
                    accessibilityHint="Opens the completion code form"
                    onPress={() => openOtpModal(job)}
                    style={({ pressed }) => [styles.completeJobButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="key" size={15} color={colors.white} accessible={false} />
                    <Text style={styles.completeJobButtonText}>Complete Job (Enter OTP)</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* DISPATCH QUEUE */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <View>
          <Text style={styles.kicker}>DISPATCH QUEUE</Text>
          <Text style={styles.sectionTitle}>Available repairs</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh available repairs"
          hitSlop={10}
          onPress={handleRefresh}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressedSoft]}
        >
          <Ionicons name="refresh-outline" size={21} color={colors.teal} accessible={false} />
        </Pressable>
      </View>

      {fetchError && lastSyncAt === null && !loading ? (
        <View
          style={styles.emptyCard}
          accessibilityRole="alert"
          accessibilityLabel="Unable to load jobs. Check your connection and try again."
        >
          <View style={[styles.emptyIcon, styles.emptyIconError]}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} accessible={false} />
          </View>
          <Text style={styles.emptyTitle}>Unable to load jobs</Text>
          <Text style={styles.emptyText}>
            We couldn't load available repairs. Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading jobs"
            accessibilityHint="Retries the jobs request"
            onPress={handleRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={16} color={colors.white} accessible={false} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {fetchError && lastSyncAt !== null ? (
            <View style={styles.syncErrorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <View style={styles.syncErrorLeft}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} accessible={false} />
                <Text style={styles.syncErrorText} numberOfLines={2}>
                  Unable to refresh — Last updated {formatLastSyncTime(lastSyncAt)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry refreshing jobs"
                onPress={handleRefresh}
                hitSlop={8}
                style={({ pressed }) => [styles.syncRetryButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.syncRetryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {jobs.length === 0 ? (
            <View style={styles.emptyCard} accessibilityLabel="No matching jobs">
              <View style={styles.emptyIcon}>
                <Ionicons name="briefcase-outline" size={28} color={colors.teal} accessible={false} />
              </View>
              <Text style={styles.emptyTitle}>No matching jobs nearby</Text>
              <Text style={styles.emptyText}>
                Stay active. New repair requests matching your skills will appear here.
              </Text>
            </View>
          ) : (
        jobs.map((job) => {
          const jobCoords = resolveJobCoords(job);
          const calculatedDistance = job.distanceKm != null
            ? job.distanceKm
            : (techCoords && jobCoords
                ? Number(calculateDistance(techCoords.latitude, techCoords.longitude, jobCoords.latitude, jobCoords.longitude)?.toFixed(1))
                : null);

          const isHighlighted = highlightedJobId && String(highlightedJobId) === String(job.id);
          return (
            <View key={job.id} style={[styles.jobCard, isHighlighted && styles.highlightedCard]}>
              <View style={styles.jobTopRow}>
                <View style={styles.categoryIcon}>
                  <Ionicons name="construct-outline" size={21} color={colors.teal} accessible={false} />
                </View>
                <View style={styles.jobHeading}>
                  <Text style={styles.kicker}>SERVICE REQUEST</Text>
                  <Text style={styles.jobTitle}>{job.applianceType || 'Repair request'}</Text>
                </View>
                {calculatedDistance != null && (
                  <View style={styles.distancePill}>
                    <Ionicons name="navigate-outline" size={13} color={colors.tealDark} accessible={false} />
                    <Text style={styles.distanceText}>{calculatedDistance} km</Text>
                  </View>
                )}
              </View>

              <Text style={styles.problem} numberOfLines={3}>
                {job.description || 'No issue description provided.'}
              </Text>

              <View style={styles.metaBlock}>
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={colors.muted} accessible={false} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {job.location || 'Location pending'}
                  </Text>
                </View>
                {renderScheduleMeta(job)}
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${job.applianceType || 'repair request'}`}
                  onPress={() => handleDeclineJob(job)}
                  style={({ pressed }) => [styles.declineAction, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.declineActionText}>Decline</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Accept job for ${job.applianceType || 'repair request'}`}
                  accessibilityState={{ disabled: acceptingJobId !== null }}
                  onPress={() => handleAcceptJob(job)}
                  disabled={acceptingJobId !== null}
                  style={({ pressed }) => [styles.primaryAction, pressed && acceptingJobId === null && styles.pressed]}
                >
                  {acceptingJobId === job.id ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Text style={styles.primaryActionText}>Accept Job</Text>
                      <Ionicons name="checkmark" size={17} color={colors.white} accessible={false} />
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })
          )}
        </>
      )}

      {/* OTP COMPLETION MODAL */}
      <Modal
        visible={otpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.otpModalCard}>
            <View style={styles.otpIconWrap}>
              <Ionicons name="key" size={28} color={colors.green} accessible={false} />
            </View>
            <Text style={styles.otpModalTitle}>Verify Completion</Text>
            <Text style={styles.otpModalSubtitle}>
              Ask {selectedJobForOtp?.customerName || 'the customer'} for the 4-digit code shown on their tracking screen.
            </Text>

            <TextInput
              style={styles.otpInput}
              placeholder="0 0 0 0"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={4}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus
              accessibilityLabel="4-digit completion code"
              accessibilityHint="Enter the code provided by the customer"
            />

            <View style={styles.modalButtonRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel code entry"
                accessibilityState={{ disabled: verifyingOtp }}
                onPress={() => setOtpModalVisible(false)}
                disabled={verifyingOtp}
                style={({ pressed }) => [styles.modalCancelButton, pressed && !verifyingOtp && styles.pressedSoft]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Verify code and complete job"
                accessibilityState={{ disabled: verifyingOtp }}
                onPress={handleVerifyOtp}
                disabled={verifyingOtp}
                style={({ pressed }) => [styles.modalSubmitButton, pressed && !verifyingOtp && styles.pressed]}
              >
                {verifyingOtp ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Verify & Complete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 36 },

  // Shared anti-slop press states: transform + opacity only (GPU path).
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  skeletonHeroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  skeletonHeroCopy: { flex: 1, paddingRight: 16 },
  skeletonStatusCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  skeletonStatusCopy: { flex: 1 },
  skeletonJobCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  skeletonJobTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  skeletonJobCopy: { flex: 1 },
  skeletonJobActions: { gap: 6 },

  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heroCopy: { flex: 1, paddingRight: 16 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 7 },
  greeting: { color: colors.ink, fontSize: 27, fontFamily: fonts.bold },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6, fontFamily: fonts.regular },
  jobCount: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  jobCountValue: { color: colors.tealDark, fontSize: 20, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  jobCountLabel: { color: colors.teal, fontSize: 10, fontFamily: fonts.bold },
  techNotification: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  techNotificationBadge: { position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  techNotificationBadgeText: { color: colors.white, fontSize: 9, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  statusCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  statusIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 3 },
  statusText: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  // Workload ambient strip — Trusted Harbor calm accountability. Tonal layered
  // surfaces, flat-by-default, functional colors only for status (green/gold/danger).
  // Never color-alone: icon + text + count together; strong contrast on white.
  workloadCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
    gap: 12,
  },
  workloadCardAvailable: { borderColor: colors.line },
  workloadCardBusy: { borderColor: '#FDE68A' },
  workloadCardAtCapacity: { borderColor: '#FECACA' },
  workloadIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  workloadCopy: { flex: 1, gap: 2 },
  workloadKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, lineHeight: 14 },
  workloadTitle: { fontSize: 14, fontFamily: fonts.bold, lineHeight: 18 },
  workloadCount: { fontSize: 14, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  workloadMessage: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },
  workloadStatusDot: { width: 9, height: 9, borderRadius: 5, marginLeft: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 3 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold },
  refreshButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  acceptedCount: { color: colors.teal, fontSize: 15, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], marginBottom: 2 },
  acceptedEmpty: { backgroundColor: colors.tealLight, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  acceptedEmptyText: { color: colors.tealDark, fontSize: 12, fontFamily: fonts.semiBold },
  acceptedCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.hudBorder, padding: 16, marginBottom: 14, ...shadows.card },
  acceptedTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  acceptedIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  acceptedCopy: { flex: 1 },
  statusBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginBottom: 6 },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bold },
  acceptedTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  acceptedMeta: { color: colors.muted, fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
  acceptedSchedule: { marginTop: 4 },
  scheduleInline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  acceptedScheduleText: { color: colors.tealDark, fontSize: 12, fontFamily: fonts.semiBold, flexShrink: 1 },
  acceptedIconActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  acceptedActionRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, gap: 10 },
  arrivalRow: { flexDirection: 'row', gap: 8 },
  arrivalButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  arrivalButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  noShowButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  noShowButtonText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold },
  startJobButton: { minHeight: 48, borderRadius: 14, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  startJobButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  completeJobButton: { minHeight: 48, borderRadius: 14, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  completeJobButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  jobCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 14, ...shadows.card },
  highlightedCard: { borderColor: colors.teal, borderWidth: 2, ...shadows.cardStrong },
  jobTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  categoryIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  jobHeading: { flex: 1 },
  jobTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold },
  distancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  distanceText: { color: colors.tealDark, fontSize: 12, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  problem: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 15, fontFamily: fonts.regular },
  metaBlock: { borderTopWidth: 1, borderTopColor: colors.line, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 11, gap: 9, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  scheduleBlock: { gap: 9 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  declineAction: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  declineActionText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  primaryAction: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.teal, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...shadows.card },
  primaryActionText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 30, alignItems: 'center', ...shadows.card },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyIconError: { backgroundColor: '#FEE2E2' },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginBottom: 5 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', fontFamily: fonts.medium },
  retryButton: {
    marginTop: 18,
    minHeight: 48,
    minWidth: 132,
    borderRadius: 14,
    backgroundColor: colors.teal,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.card,
  },
  retryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.1 },
  syncErrorBanner: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  syncErrorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexShrink: 1 },
  syncErrorText: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.medium, flex: 1, flexShrink: 1 },
  syncRetryButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncRetryText: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  otpModalCard: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: 24, padding: 24, alignItems: 'center', boxShadow: '0 0 20px rgba(16,42,67,0.2)', elevation: 10 },
  otpIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  otpModalTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  otpModalSubtitle: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20, fontFamily: fonts.medium },
  otpInput: { width: '100%', height: 56, borderRadius: 14, borderWidth: 2, borderColor: colors.teal, textAlign: 'center', fontSize: 26, fontFamily: fonts.bold, letterSpacing: 10, color: colors.ink, backgroundColor: colors.surfaceSunken, marginBottom: 20 },
  modalButtonRow: { flexDirection: 'row', gap: 10, width: '100%' },
  modalCancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: colors.muted, fontSize: 14, fontFamily: fonts.semiBold },
  modalSubmitButton: { flex: 1.5, minHeight: 48, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  modalSubmitText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold }
});
