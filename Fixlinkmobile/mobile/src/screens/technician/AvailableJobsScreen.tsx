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
  // Pending metric represents unassigned queue requests ready to accept
  const pendingCount = jobs.length;

  // Display-only count used in the at-capacity message and the compact
  // workload strip. Authoritative blocking stays server-side
  // (409 TECHNICIAN_AT_CAPACITY).
  const workloadActiveJobs = acceptedJobs.length;
  const workloadStatus = getWorkloadDisplayStatus(workloadActiveJobs);

  const nearbyJobs = jobs.filter((job) => {
    if (highlightedJobId && String(job.id) === String(highlightedJobId)) return true;
    if (job.distanceKm == null) return true;
    return Number(job.distanceKm) <= NEARBY_QUEUE_RADIUS_KM;
  });

  const [feedTab, setFeedTab] = useState<'active' | 'queue'>('active');

  useEffect(() => {
    if (!highlightedJobId) return;
    const hid = String(highlightedJobId);
    if (acceptedJobs.some((j) => String(j.id) === hid)) setFeedTab('active');
    else if (jobs.some((j) => String(j.id) === hid)) setFeedTab('queue');
  }, [highlightedJobId, acceptedJobs, jobs]);

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0F5132" colors={['#0F5132']} />}
    >
      <View style={styles.centerWrap}>
        {/* FIXLINK Header & Notification Icon */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.brandTitle}>FIXLINK</Text>
            <Text style={styles.brandSubtitle}>TECHNICIAN SPACE</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notificationCount > 0 ? `Open notifications, ${notificationCount} unread` : 'Open notifications'}
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.notificationBtn, pressed && styles.pressedSoft]}
          >
            <Ionicons name="notifications-outline" size={20} color="#0F5132" />
            {notificationCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.greetingTitle}>Good day, {technician?.name || 'Technician'}</Text>
          <Text style={styles.greetingSubtitle}>Let&apos;s keep your service queue running smoothly.</Text>
        </View>

        {/* Compact workload status strip — secondary, above the feed */}
        {(() => {
          const workloadConfig = workloadStatus === 'at_capacity'
            ? {
                label: 'At Capacity' as const,
                icon: 'alert-circle-outline' as IconName,
                color: colors.danger,
                bg: colors.danger + '10',
                border: colors.danger + '20',
                message: 'New jobs paused — complete one to resume.',
              }
            : workloadStatus === 'busy'
              ? {
                  label: 'Busy' as const,
                  icon: 'time-outline' as IconName,
                  color: colors.gold,
                  bg: colors.gold + '12',
                  border: colors.gold + '22',
                  message: 'Several active jobs — you can still accept.',
                }
              : {
                  label: 'Available' as const,
                  icon: 'checkmark-circle-outline' as IconName,
                  color: colors.green,
                  bg: colors.green + '10',
                  border: colors.green + '20',
                  message: 'Ready for new requests.',
                };
          return (
            <View
              style={[
                styles.workloadStrip,
                workloadStatus === 'at_capacity'
                  ? styles.workloadStripAtCapacity
                  : workloadStatus === 'busy'
                    ? styles.workloadStripBusy
                    : styles.workloadStripAvailable,
              ]}
              accessibilityRole="text"
              accessibilityLabel={`${workloadConfig.label} — ${workloadActiveJobs} active ${workloadActiveJobs === 1 ? 'job' : 'jobs'}. ${workloadConfig.message}`}
            >
              <View style={[styles.workloadIcon, { backgroundColor: workloadConfig.bg, borderColor: workloadConfig.border }]}>
                <Ionicons name={workloadConfig.icon} size={14} color={workloadConfig.color} accessible={false} />
              </View>
              <Text style={styles.workloadKicker}>WORKLOAD</Text>
              <Text style={[styles.workloadText, { color: workloadConfig.color }]} numberOfLines={1}>
                {workloadConfig.label}
                <Text style={styles.workloadCount}> · {workloadActiveJobs} active</Text>
              </Text>
              <View style={[styles.workloadDot, { backgroundColor: workloadConfig.color }]} accessible={false} />
            </View>
          );
        })()}

        {/* 2 Status Metric Cards (Reference Image Style) */}
        <View style={styles.metricsRow}>
          <Pressable
            style={[styles.metricCard, feedTab === 'active' && styles.metricCardActive]}
            onPress={() => setFeedTab('active')}
          >
            <View style={styles.metricIconWrap}>
              <Ionicons name="refresh" size={14} color="#0F5132" />
            </View>
            <Text style={styles.metricValue}>{activeCount}</Text>
            <Text style={styles.metricLabel}>ACTIVE</Text>
          </Pressable>

          <Pressable
            style={[styles.metricCard, feedTab === 'queue' && styles.metricCardActive]}
            onPress={() => setFeedTab('queue')}
          >
            <View style={[styles.metricIconWrap, { backgroundColor: '#FFF8F0' }]}>
              <Ionicons name="time-outline" size={14} color="#D97706" />
            </View>
            <Text style={styles.metricValue}>{pendingCount}</Text>
            <Text style={styles.metricLabel}>PENDING</Text>
          </Pressable>

        </View>

        {/* Interactive Action Hub (Reference Style Green & White Blocks) */}
        <Text style={styles.sectionHeading}>What do you need today?</Text>
        <View style={styles.actionCardsGrid}>
          <Pressable
            style={[styles.actionCardPrimary, styles.pressedSoft]}
            onPress={() => setFeedTab('queue')}
          >
            <View style={styles.actionCardIconBox}>
              <Ionicons name="add" size={18} color="#0F5132" />
            </View>
            <Text style={styles.actionCardPrimaryTitle}>Queue Feed</Text>
            <Text style={styles.actionCardPrimaryDesc}>Browse incoming jobs nearby</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" style={styles.actionCardArrow} />
          </Pressable>

          <Pressable
            style={[styles.actionCardSecondary, styles.pressedSoft]}
            onPress={() => setFeedTab('active')}
          >
            <View style={styles.actionCardIconBoxSecondary}>
              <Ionicons name="pulse" size={16} color="#0F5132" />
            </View>
            <Text style={styles.actionCardSecondaryTitle}>Active Jobs</Text>
            <Text style={styles.actionCardSecondaryDesc}>Track live execution steps</Text>
            <Ionicons name="arrow-forward" size={16} color="#0F5132" style={styles.actionCardArrow} />
          </Pressable>
        </View>

        {/* Dynamic Feed Header */}
        <View style={styles.feedHeaderRow}>
          <Text style={styles.sectionHeading}>{feedTab === 'active' ? 'My Active Jobs' : 'Nearby Request Queue'}</Text>
          <Text style={styles.viewAllText}>{feedTab === 'active' ? `${acceptedJobs.length} jobs` : `${nearbyJobs.length} available`}</Text>
        </View>

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
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color="#0F5132" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No Active Jobs</Text>
              <Text style={styles.emptySubtitle}>Select an open request from the Queue to get started.</Text>
            </View>
          ) : (
            acceptedJobs.map((job) => {
              const isInProgress = job.status === 'In Progress';
              const isConfirmed = job.status === 'Confirmed';
              const isReady = job.status === 'Customer Ready';
              const hasArrived = !!job.technicianArrivalAt;

              return (
                <View key={job.id} style={styles.jobCard}>
                  <View style={styles.jobCardTop}>
                    <View style={styles.jobIconWrap}>
                      <Ionicons name={statusIconName(job.status)} size={16} color="#0F5132" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.jobStatusRow}>
                        <Text style={styles.jobAppliance}>{job.applianceType || 'Repair Job'}</Text>
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>{job.status || 'Accepted'}</Text>
                        </View>
                      </View>
                      <Text style={styles.jobLocation}>{job.customerName || 'Customer'} · {job.location || 'Location specified'}</Text>
                      <Text style={styles.jobDate}>{formatSchedule(job)}</Text>
                    </View>
                  </View>

                  {job.photoUrl ? (
                    <PhotoThumb photoUrl={job.photoUrl} onPress={() => setPreviewUrl(job.photoUrl ?? null)} />
                  ) : null}

                  <View style={styles.jobToolbar}>
                    {onNavigateToMap && (
                      <Pressable style={styles.toolBtn} onPress={() => onNavigateToMap(job)}>
                        <Ionicons name="map-outline" size={16} color="#0F5132" />
                      </Pressable>
                    )}
                    {onNavigateToChat && (
                      <Pressable style={styles.toolBtn} onPress={() => onNavigateToChat(job)}>
                        <Ionicons name="chatbubble-outline" size={16} color="#0F5132" />
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.jobActionRow}>
                    {!isInProgress && !hasArrived && (isConfirmed || isReady || job.status === 'Accepted') && (
                      <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                        <Pressable style={styles.primaryBtn} onPress={() => handleArrival(job)} disabled={actionLoadingId === job.id}>
                          {actionLoadingId === job.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Mark Arrival</Text>}
                        </Pressable>
                        <Pressable style={styles.dangerOutlineBtn} onPress={() => handleNoShow(job)}>
                          <Text style={styles.dangerOutlineText}>No-Show</Text>
                        </Pressable>
                      </View>
                    )}

                    {!isInProgress && hasArrived && (
                      <Pressable style={styles.primaryBtn} onPress={() => handleStartJob(job)} disabled={actionLoadingId === job.id}>
                        {actionLoadingId === job.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Start Repair</Text>}
                      </Pressable>
                    )}

                    {isInProgress && (
                      <Pressable style={styles.completeBtn} onPress={() => openOtpModal(job)}>
                        <Ionicons name="key-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.primaryBtnText}>Complete (Enter OTP)</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )
        ) : (
          nearbyJobs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="radio-outline" size={32} color="#0F5132" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>Queue is Clear</Text>
              <Text style={styles.emptySubtitle}>No pending requests available right now.</Text>
            </View>
          ) : (
            nearbyJobs.map((job) => (
              <View key={job.id} style={styles.jobCard}>
                <View style={styles.jobCardTop}>
                  <View style={styles.jobIconWrap}>
                    <Ionicons name="construct-outline" size={16} color="#0F5132" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobAppliance}>{job.applianceType || 'Repair request'}</Text>
                    <Text style={styles.jobLocation}>{job.location || 'Location specified'} {job.distanceKm != null ? `· ${Number(job.distanceKm).toFixed(1)} km` : ''}</Text>
                    <Text style={styles.jobDate}>{formatSchedule(job)}</Text>
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
                    {acceptingJobId === job.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Accept Job</Text>}
                  </Pressable>
                  <Pressable style={styles.dangerOutlineBtn} onPress={() => handleDeclineJob(job)}>
                    <Text style={styles.dangerOutlineText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))
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
                <Ionicons name="close" size={20} color="#1E293B" />
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>Ask the customer for their 4-digit completion code to close out this job.</Text>
            <TextInput
              style={styles.otpInputBox}
              placeholder="0000"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={4}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus={true}
            />
            <Pressable style={styles.primaryBtn} onPress={handleVerifyOtp} disabled={verifyingOtp}>
              {verifyingOtp ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Verify & Complete</Text>}
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
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  centerWrap: { width: '100%', maxWidth: 600, alignSelf: 'center' },

  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitle: {
    fontFamily: fonts?.bold,
    fontSize: 20,
    letterSpacing: 1.2,
    color: '#0F5132',
  },
  brandSubtitle: {
    fontFamily: fonts?.medium,
    fontSize: 10,
    letterSpacing: 1,
    color: '#64748B',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.subtle,
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#fff', fontSize: 9, fontFamily: fonts?.bold },

  welcomeSection: { marginBottom: 20 },
  greetingTitle: { fontFamily: fonts?.bold, fontSize: 24, color: '#1E293B', marginBottom: 4 },
  greetingSubtitle: { fontFamily: fonts?.regular, fontSize: 13, color: '#64748B' },

  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'flex-start',
    ...shadows.subtle,
  },
  metricCardActive: {
    borderColor: '#0F5132',
    borderWidth: 2,
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricValue: {
    fontFamily: fonts?.bold,
    fontSize: 22,
    color: '#1E293B',
    marginBottom: 2,
  },
  metricLabel: {
    fontFamily: fonts?.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#64748B',
  },

  sectionHeading: {
    fontFamily: fonts?.bold,
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 12,
  },
  actionCardsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionCardPrimary: {
    flex: 1,
    backgroundColor: '#0F5132',
    borderRadius: 20,
    padding: 16,
    minHeight: 120,
    justifyContent: 'space-between',
    ...shadows.subtle,
  },
  actionCardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionCardPrimaryTitle: {
    fontFamily: fonts?.bold,
    fontSize: 15,
    color: '#fff',
    marginBottom: 2,
  },
  actionCardPrimaryDesc: {
    fontFamily: fonts?.regular,
    fontSize: 11,
    color: '#D1FAE5',
  },
  actionCardSecondary: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    minHeight: 120,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.subtle,
  },
  actionCardIconBoxSecondary: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionCardSecondaryTitle: {
    fontFamily: fonts?.bold,
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 2,
  },
  actionCardSecondaryDesc: {
    fontFamily: fonts?.regular,
    fontSize: 11,
    color: '#64748B',
  },
  actionCardArrow: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },

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
  workloadStripAvailable: { borderColor: colors.line, backgroundColor: colors.canvas },
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
  workloadKicker: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1 },
  workloadText: { flex: 1, fontSize: 13, fontFamily: fonts.bold },
  workloadCount: { color: colors.muted, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  workloadDot: { width: 8, height: 8, borderRadius: 4, opacity: 0.9 },

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
    backgroundColor: '#FEE2E2',
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

  feedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllText: {
    fontFamily: fonts?.medium,
    fontSize: 12,
    color: '#0F5132',
  },

  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.subtle,
  },
  jobCardTop: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  jobIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  jobStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  jobAppliance: {
    fontFamily: fonts?.bold,
    fontSize: 15,
    color: '#1E293B',
  },
  statusPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontFamily: fonts?.bold,
    fontSize: 10,
    color: '#0F5132',
  },
  jobLocation: {
    fontFamily: fonts?.regular,
    fontSize: 13,
    color: '#64748B',
    marginBottom: 2,
  },
  jobDate: {
    fontFamily: fonts?.medium,
    fontSize: 12,
    color: '#0F5132',
  },
  jobToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginBottom: 10,
  },
  toolBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0F5132',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  completeBtn: {
    flex: 1,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  primaryBtnText: {
    fontFamily: fonts?.bold,
    fontSize: 13,
    color: '#fff',
  },
  dangerOutlineBtn: {
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerOutlineText: {
    fontFamily: fonts?.bold,
    fontSize: 13,
    color: '#DC2626',
  },

  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontFamily: fonts?.bold,
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: fonts?.regular,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
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
    color: '#1E293B',
  },
  modalDesc: {
    fontFamily: fonts?.regular,
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  otpInputBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    height: 52,
    textAlign: 'center',
    fontFamily: fonts?.bold,
    fontSize: 22,
    color: '#1E293B',
    letterSpacing: 8,
    marginBottom: 20,
  },
  pressedSoft: { opacity: 0.85 },
});
