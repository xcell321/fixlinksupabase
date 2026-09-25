import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import TechJobDetailScreen from './TechJobDetailScreen';
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
import {
  calculateWorkloadSummary,
  formatJobSchedule,
  filterJobs,
  validateOtpCode,
  canMarkArrival,
  canStartRepair,
  getTechnicianCredentialBadgeInfo,
  type JobItem
} from '../../utils/availableJobsHelpers';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Coords {
  [key: string]: unknown;
  latitude: number;
  longitude: number;
}

interface TechnicianRef {
  uid: string;
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
  verified?: boolean;
  verificationStatus?: string;
  status?: string;
  profileImage?: string | null;
}

interface AvailableJobsScreenProps {
  technician: TechnicianRef;
  onNavigateToMap?: (job: JobItem) => void;
  onNavigateToChat?: (job: JobItem) => void;
  onOpenNotifications?: () => void;
  notificationCount?: number;
  highlightedJobId?: string | null;
}

const NEARBY_QUEUE_RADIUS_KM = 20;
const jobsCache = new Map<string, { jobs: JobItem[]; acceptedJobs: JobItem[]; lastSyncAt: Date | null; fetchError: boolean }>();

const CATEGORY_CHIPS = [
  { id: 'all', label: 'All Jobs', icon: 'grid-outline' as IconName },
  { id: 'aircon', label: 'Aircon', icon: 'snow-outline' as IconName },
  { id: 'refrigerator', label: 'Refrigerator', icon: 'cube-outline' as IconName },
  { id: 'washing', label: 'Washing', icon: 'water-outline' as IconName },
  { id: 'computer', label: 'Computer', icon: 'laptop-outline' as IconName }
];

export default function AvailableJobsScreen({
  technician,
  onNavigateToMap,
  onNavigateToChat,
  onOpenNotifications,
  notificationCount = 0,
  highlightedJobId = null
}: AvailableJobsScreenProps): React.JSX.Element {
  const cached = technician?.uid ? jobsCache.get(technician.uid) : undefined;
  const [jobs, setJobs] = useState<JobItem[]>(cached?.jobs ?? []);
  const [acceptedJobs, setAcceptedJobs] = useState<JobItem[]>(cached?.acceptedJobs ?? []);
  const [loading, setLoading] = useState<boolean>(cached ? false : true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<boolean>(cached?.fetchError ?? false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(cached?.lastSyncAt ?? null);
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Operational states
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<JobItem | null>(null);

  // Feed Tab navigation: 'queue' (Available Leads) vs 'active' (My Active Jobs)
  const [feedTab, setFeedTab] = useState<'queue' | 'active'>('queue');

  // Coords state
  const [techCoords, setTechCoords] = useState<Coords | null>(
    technician?.latitude && technician?.longitude
      ? { latitude: Number(technician.latitude), longitude: Number(technician.longitude) }
      : null
  );

  // OTP Verification Modal State
  const [otpModalVisible, setOtpModalVisible] = useState<boolean>(false);
  const [selectedJobForOtp, setSelectedJobForOtp] = useState<JobItem | null>(null);
  const [otpCode, setOtpCode] = useState<string>('');
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);

  const technicianName = technician?.name || 'Technician';
  const avatarInitial = technicianName.charAt(0).toUpperCase();

  // Filtered jobs in queue based on category, search text, and radius
  const filteredQueueJobs = useMemo(() => {
    return filterJobs(jobs, {
      category: selectedCategory,
      searchQuery: searchQuery,
      maxDistanceKm: NEARBY_QUEUE_RADIUS_KM,
      highlightedJobId: highlightedJobId
    });
  }, [jobs, selectedCategory, searchQuery, highlightedJobId]);

  // Workload computation based on real accepted jobs in database
  const activeCount = acceptedJobs.length;
  const pendingCount = filteredQueueJobs.length;
  const workloadSummary = calculateWorkloadSummary(activeCount);
  const workloadStatus = workloadSummary.status;

  const workloadHue = workloadStatus === 'at_capacity'
    ? { label: 'At Capacity', color: colors.danger }
    : workloadStatus === 'busy'
      ? { label: 'Busy', color: colors.gold }
      : { label: 'Available', color: colors.green };

  // Switch to corresponding tab when a highlighted job ID is passed
  useEffect(() => {
    if (!highlightedJobId) return;
    const hid = String(highlightedJobId);
    if (acceptedJobs.some((j) => String(j.id) === hid)) {
      setFeedTab('active');
    } else if (jobs.some((j) => String(j.id) === hid)) {
      setFeedTab('queue');
    }
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
        fetchTechnicianJobs(technician?.uid)
      ]);
      const newJobs = Array.isArray(result) ? (result as JobItem[]) : [];
      const newAccepted = Array.isArray(assigned)
        ? (assigned as JobItem[]).filter((job) =>
            ['Accepted', 'Confirmed', 'Customer Ready', 'In Progress'].includes(job.status ?? '')
          )
        : [];
      setJobs(newJobs);
      setAcceptedJobs(newAccepted);
      setFetchError(false);
      const now = new Date();
      setLastSyncAt(now);
      if (technician?.uid) {
        jobsCache.set(technician.uid, {
          jobs: newJobs,
          acceptedJobs: newAccepted,
          lastSyncAt: now,
          fetchError: false
        });
      }
    } catch (error) {
      console.warn('Failed to load technician jobs from backend:', error);
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

  const handleAcceptJob = (job: JobItem): void => {
    if (!technician?.uid) {
      Alert.alert('Authentication required', 'Please sign in with a verified technician account.');
      return;
    }
    if (acceptingJobId) return;

    if (workloadStatus === 'at_capacity') {
      Alert.alert(
        'At Capacity',
        'You currently have 6 active jobs. Please complete an ongoing repair before accepting more requests.'
      );
      return;
    }

    Alert.alert(
      'Accept this repair request?',
      `${job.applianceType || 'Repair request'}\nLocation: ${job.location || 'Local Catchment'}\n\nThe customer will be notified immediately and live GPS navigation will be unlocked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept Job',
          onPress: async () => {
            setAcceptingJobId(job.id);
            try {
              const response = (await acceptRepairRequest(
                job.id,
                technician.uid,
                technician.name || 'Technician'
              )) as { jobId?: string; message?: string };

              const acceptedJobId = response?.jobId || job.id;

              setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
              setAcceptedJobs((currentJobs) => [
                {
                  ...job,
                  id: acceptedJobId,
                  status: 'Accepted',
                  technicianUid: technician.uid,
                  technicianName: technician.name
                },
                ...currentJobs
              ]);
              setSelectedJobForDetails(null);
              setFeedTab('active');
              Alert.alert(
                'Job Accepted',
                'Customer details and live route are now available in your active jobs.'
              );
              loadJobs({ background: true });
            } catch (error) {
              const err = error as { code?: string; message?: string; error?: string };
              if (err?.code === 'TECHNICIAN_AT_CAPACITY') {
                Alert.alert('You are At Capacity', err?.message || 'Complete an active job to accept new work.');
              } else {
                Alert.alert(
                  'Unable to accept job',
                  err?.error || err?.message || 'This job may already have been claimed by another technician.'
                );
              }
            } finally {
              setAcceptingJobId(null);
            }
          }
        }
      ]
    );
  };

  const handleDeclineJob = (job: JobItem): void => {
    if (!technician?.uid) return;
    Alert.alert(
      'Dismiss this request?',
      `${job.applianceType || 'Repair request'}\n${job.location ? `Location: ${job.location}` : ''}\n\nThis will remove the lead from your visible queue.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            try {
              await declineRepairRequest(job.id, technician.uid);
              setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
              if (selectedJobForDetails?.id === job.id) {
                setSelectedJobForDetails(null);
              }
            } catch (error) {
              const err = error as { error?: string; message?: string };
              Alert.alert('Error', err?.error || err?.message || 'Failed to dismiss job.');
            }
          }
        }
      ]
    );
  };

  const handleArrival = async (job: JobItem): Promise<void> => {
    if (!technician?.uid) return;
    setActionLoadingId(job.id);
    try {
      await recordTechnicianArrival(job.id, technician.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) =>
          j.id === job.id
            ? { ...j, technicianArrivalAt: new Date().toISOString() }
            : j
        )
      );
      Alert.alert('Arrival Confirmed', 'The customer has been notified of your physical arrival.');
      loadJobs({ background: true });
    } catch (error) {
      const err = error as {
        response?: { data?: { error?: string; message?: string } };
        error?: string;
        message?: string;
      };
      const errorMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        'Please try again.';
      Alert.alert('Unable to record arrival', errorMessage);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartJob = async (job: JobItem): Promise<void> => {
    if (!technician?.uid) return;
    setActionLoadingId(job.id);
    try {
      await updateJobStatus(job.id, 'In Progress', technician.uid);
      setAcceptedJobs((currentJobs) =>
        currentJobs.map((j) => (j.id === job.id ? { ...j, status: 'In Progress' } : j))
      );
      Alert.alert('Job In Progress', 'Repair started. Collect the 4-digit code from the customer when finished.');
      loadJobs({ background: true });
    } catch (error) {
      const err = error as {
        response?: { data?: { error?: string; message?: string } };
        error?: string;
        message?: string;
      };
      const errorMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.error ||
        err?.message ||
        'Failed to update job status.';
      Alert.alert('Error', errorMessage);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNoShow = (job: JobItem): void => {
    if (!technician?.uid) return;
    Alert.alert(
      'Report customer no-show?',
      'This records that the customer or appliance was not accessible at the specified service address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Report',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(job.id);
            try {
              await reportNoShow(job.id, technician.uid, 'No one available at service location');
              setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== job.id));
              Alert.alert('No-show reported', 'Customer status updated.');
              loadJobs();
            } catch (error) {
              const err = error as {
                response?: { data?: { error?: string; message?: string } };
                error?: string;
                message?: string;
              };
              const errorMessage =
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                err?.error ||
                err?.message ||
                'Please try again.';
              Alert.alert('Error', errorMessage);
            } finally {
              setActionLoadingId(null);
            }
          }
        }
      ]
    );
  };

  const openOtpModal = (job: JobItem): void => {
    setSelectedJobForOtp(job);
    setOtpCode('');
    setOtpModalVisible(true);
  };

  const handleVerifyOtp = async (): Promise<void> => {
    const cleanCode = otpCode.trim();
    if (!validateOtpCode(cleanCode)) {
      Alert.alert('Invalid Code', 'Please enter the complete 4-digit numeric code provided by the customer.');
      return;
    }
    if (!selectedJobForOtp) return;

    setVerifyingOtp(true);
    try {
      await verifyCompletionCode(selectedJobForOtp.id, cleanCode);
      setOtpModalVisible(false);
      setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== selectedJobForOtp.id));
      Alert.alert('Job Completed', 'Repair verified and finalized successfully.');
      loadJobs();
    } catch (error) {
      const err = error as { error?: string; message?: string };
      Alert.alert('Verification Failed', err?.error || err?.message || 'Incorrect code entered.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const toggleDutyStatus = async (): Promise<void> => {
    const nextState = !isOnline;
    setIsOnline(nextState);
    if (nextState) {
      Alert.alert('Status: Online', 'You are active and ready to receive repair leads in your catchment.');
      const coords = await getUpdatedTechCoords();
      if (coords && technician?.uid) {
        updateTechnicianLocation(technician.uid, coords).catch(() => {});
      }
      loadJobs({ background: true });
    } else {
      Alert.alert('Status: Paused', 'You are currently off duty. Incoming job notifications are paused.');
    }
  };

  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.centerWrap}>
          <Skeleton style={{ width: 140, height: 26, borderRadius: 8, marginBottom: 16 }} />
          <Skeleton style={{ width: '100%', height: 80, borderRadius: 16, marginBottom: 16 }} />
          <Skeleton style={{ width: '100%', height: 110, borderRadius: 16, marginBottom: 16 }} />
          <Skeleton style={{ width: '100%', height: 180, borderRadius: 20, marginBottom: 16 }} />
        </View>
      </ScrollView>
    );
  }

  // Live detail job: refresh from feed state so arrival/start update the screen.
  const allJobs = [...acceptedJobs, ...jobs];
  const liveDetailJob = selectedJobForDetails
    ? (allJobs.find((j) => String(j.id) === String(selectedJobForDetails.id)) ?? selectedJobForDetails)
    : null;
  const detailIsAssigned = liveDetailJob ? acceptedJobs.some((j) => String(j.id) === String(liveDetailJob.id)) : false;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.tech}
          colors={[colors.tech]}
        />
      }
    >
      {liveDetailJob ? (
        <TechJobDetailScreen
          job={liveDetailJob}
          techCoords={techCoords}
          isQueue={!detailIsAssigned}
          acceptingJobId={acceptingJobId}
          actionLoadingId={actionLoadingId}
          onBack={() => setSelectedJobForDetails(null)}
          onAccept={handleAcceptJob}
          onDecline={handleDeclineJob}
          onArrival={handleArrival}
          onNoShow={handleNoShow}
          onStart={handleStartJob}
          onComplete={openOtpModal}
          onMessage={(job) => onNavigateToChat && onNavigateToChat(job)}
          onPreviewPhoto={(url) => setPreviewUrl(url)}
        />
      ) : (
      <View style={styles.centerWrap}>
        {/* Prototype TechJobs dark header */}
        <View style={styles.protoHeader}>
          <View style={styles.protoHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.protoKicker}>Good afternoon,</Text>
              <Text style={styles.protoName} numberOfLines={1}>{technicianName}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                notificationCount > 0
                  ? `Notifications, ${notificationCount} unread`
                  : 'Notifications, no unread'
              }
              onPress={onOpenNotifications}
              hitSlop={8}
              style={({ pressed }) => [styles.protoBell, pressed && styles.pressedSoft]}
            >
              <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
              {notificationCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
          <View style={styles.protoStatsRow}>
            <View style={styles.protoStat}>
              <Text style={styles.protoStatValue}>{filteredQueueJobs.length}</Text>
              <Text style={styles.protoStatLabel}>Available</Text>
            </View>
            <View style={styles.protoStat}>
              <Text style={styles.protoStatValue}>{acceptedJobs.length}</Text>
              <Text style={styles.protoStatLabel}>Assigned</Text>
            </View>
          </View>
        </View>

        {/* Segmented Feed Tabs */}
        <View style={styles.feedTabBar} accessibilityRole="tablist">
          <Pressable
            style={({ pressed }) => [
              styles.feedTabItem,
              feedTab === 'queue' && styles.feedTabItemActive,
              pressed && styles.pressedSoft
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: feedTab === 'queue' }}
            accessibilityLabel={`Available leads queue, ${pendingCount} jobs`}
            onPress={() => setFeedTab('queue')}
          >
            <Ionicons
              name="radio"
              size={16}
              color={feedTab === 'queue' ? '#FFFFFF' : colors.muted}
            />
            <Text style={[styles.feedTabLabel, feedTab === 'queue' && styles.feedTabLabelActive]}>
              Available
            </Text>
            <View style={[styles.tabBadge, feedTab === 'queue' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, feedTab === 'queue' && styles.tabBadgeTextActive]}>
                {pendingCount}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.feedTabItem,
              feedTab === 'active' && styles.feedTabItemActive,
              pressed && styles.pressedSoft
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: feedTab === 'active' }}
            accessibilityLabel={`Active jobs, ${activeCount} jobs`}
            onPress={() => setFeedTab('active')}
          >
            <Ionicons
              name="construct"
              size={16}
              color={feedTab === 'active' ? '#FFFFFF' : colors.muted}
            />
            <Text style={[styles.feedTabLabel, feedTab === 'active' && styles.feedTabLabelActive]}>
              Assigned
            </Text>
            <View style={[styles.tabBadge, feedTab === 'active' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, feedTab === 'active' && styles.tabBadgeTextActive]}>
                {activeCount}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Offline and Stale Data Banner */}
        {fetchError && jobs.length === 0 && acceptedJobs.length === 0 ? (
          <View
            style={styles.errorCard}
            accessibilityRole="alert"
            accessibilityLabel="Unable to load jobs. Check your internet connection."
          >
            <Ionicons name="cloud-offline-outline" size={36} color={colors.danger} />
            <Text style={styles.errorTitle}>Connection Unavailable</Text>
            <Text style={styles.errorText}>
              Unable to reach dispatch server. Check your connection and try refreshing.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading jobs"
              onPress={handleRefresh}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressedSoft, { marginTop: 12 }]}
            >
              <Ionicons name="refresh" size={16} color={colors.white} style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>Retry Connection</Text>
            </Pressable>
          </View>
        ) : null}

        {fetchError && (jobs.length > 0 || acceptedJobs.length > 0) ? (
          <View style={styles.offlineBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={16} color={colors.muted} />
            <Text style={styles.offlineBannerText} numberOfLines={1}>
              Offline: showing cached dispatch feed.
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry refreshing" onPress={handleRefresh}>
              <Text style={styles.offlineRetryText}>Refresh</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Active Jobs Feed Content */}
        {feedTab === 'active' && (
          <View style={styles.feedListContainer}>
            {acceptedJobs.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="checkmark-done-circle-outline" size={28} color={colors.tech} />
                </View>
                <View style={styles.emptyTextContainer}>
                  <Text style={styles.emptyTitle}>No Active Jobs</Text>
                  <Text style={styles.emptyCopy}>
                    Your schedule is clear. Check the Available Leads tab to accept repair requests.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Switch to Available Leads tab"
                  onPress={() => setFeedTab('queue')}
                  style={({ pressed }) => [styles.emptyActionBtn, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.emptyActionBtnText}>Browse Leads</Text>
                </Pressable>
              </View>
            ) : (
              acceptedJobs.map((job) => {
                const isInProgress = job.status === 'In Progress';
                const hasArrived = Boolean(job.technicianArrivalAt);
                const isArrivalEligible = canMarkArrival(job);
                const isStartRepairEligible = canStartRepair(job);

                return (
                  <View key={job.id} style={styles.jobCard}>
                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                      <View style={styles.applianceAvatar}>
                        <Ionicons
                          name={getApplianceIcon(job.applianceType) as IconName}
                          size={22}
                          color={colors.techDark}
                        />
                      </View>
                      <View style={styles.cardTitleWrap}>
                        <View style={styles.cardTitleTop}>
                          <Text style={styles.cardTitle} numberOfLines={1}>
                            {job.applianceType || 'Repair Request'}
                          </Text>
                          <View
                            style={[
                              styles.statusPill,
                              {
                                backgroundColor: getStatusColor(job.status) + '15',
                                borderColor: getStatusColor(job.status) + '40'
                              }
                            ]}
                          >
                            <Ionicons
                              name={getStatusIcon(job.status) as IconName}
                              size={11}
                              color={getStatusColor(job.status)}
                            />
                            <Text style={[styles.statusPillText, { color: getStatusColor(job.status) }]}>
                              {job.status || 'Accepted'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.customerNameText} numberOfLines={1}>
                          Customer: {job.customerName || 'Verified Homeowner'}
                        </Text>
                      </View>
                    </View>

                    {/* Stage Stepper Progress */}
                    <View style={styles.stepperContainer}>
                      <View style={styles.stepItem}>
                        <View style={[styles.stepCircle, styles.stepCircleDone]}>
                          <Ionicons name="checkmark" size={10} color={colors.white} />
                        </View>
                        <Text style={[styles.stepLabel, styles.stepLabelDone]}>Accepted</Text>
                      </View>
                      <View style={[styles.stepLine, hasArrived && styles.stepLineDone]} />
                      <View style={styles.stepItem}>
                        <View
                          style={[
                            styles.stepCircle,
                            hasArrived ? styles.stepCircleDone : styles.stepCirclePending
                          ]}
                        >
                          <Ionicons
                            name={hasArrived ? 'checkmark' : 'location'}
                            size={10}
                            color={hasArrived ? colors.white : colors.muted}
                          />
                        </View>
                        <Text style={[styles.stepLabel, hasArrived && styles.stepLabelDone]}>Arrived</Text>
                      </View>
                      <View style={[styles.stepLine, isInProgress && styles.stepLineDone]} />
                      <View style={styles.stepItem}>
                        <View
                          style={[
                            styles.stepCircle,
                            isInProgress ? styles.stepCircleDone : styles.stepCirclePending
                          ]}
                        >
                          <Ionicons
                            name={isInProgress ? 'checkmark' : 'construct'}
                            size={10}
                            color={isInProgress ? colors.white : colors.muted}
                          />
                        </View>
                        <Text style={[styles.stepLabel, isInProgress && styles.stepLabelDone]}>Repair</Text>
                      </View>
                      <View style={styles.stepLine} />
                      <View style={styles.stepItem}>
                        <View style={[styles.stepCircle, styles.stepCirclePending]}>
                          <Ionicons name="key" size={10} color={colors.muted} />
                        </View>
                        <Text style={styles.stepLabel}>OTP</Text>
                      </View>
                    </View>

                    {/* Address and Schedule Details */}
                    <View style={styles.cardDetailsBox}>
                      <View style={styles.detailRow}>
                        <Ionicons name="location" size={14} color={colors.tech} />
                        <Text style={styles.detailText} numberOfLines={1}>
                          {job.location || 'Bogo City, Cebu'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={14} color={colors.techDark} />
                        <Text style={styles.detailTextSchedule} numberOfLines={1}>
                          {formatJobSchedule(job)}
                        </Text>
                      </View>
                      {job.description && (
                        <View style={styles.problemSnippetBox}>
                          <Ionicons name="construct-outline" size={13} color={colors.muted} />
                          <Text style={styles.problemSnippetText} numberOfLines={2}>
                            {job.description}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Customer Photo preview */}
                    {job.photoUrl && (
                      <View style={{ marginBottom: 12 }}>
                        <PhotoThumb photoUrl={job.photoUrl} onPress={() => setPreviewUrl(job.photoUrl ?? null)} />
                      </View>
                    )}

                    {/* Action Bar */}
                    <View style={styles.cardActionRow}>
                      {isArrivalEligible && (
                        <View style={styles.actionGroup}>
                          <Pressable
                            style={styles.primaryBtn}
                            onPress={() => handleArrival(job)}
                            disabled={actionLoadingId === job.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Mark arrival for ${job.applianceType || 'job'}`}
                          >
                            {actionLoadingId === job.id ? (
                              <ActivityIndicator color={colors.white} size="small" />
                            ) : (
                              <>
                                <Ionicons
                                  name="location"
                                  size={15}
                                  color={colors.white}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.primaryBtnText}>Mark Arrival</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            style={styles.dangerOutlineBtn}
                            onPress={() => handleNoShow(job)}
                            accessibilityRole="button"
                            accessibilityLabel="Report customer no-show"
                          >
                            <Text style={styles.dangerOutlineText}>No-Show</Text>
                          </Pressable>
                        </View>
                      )}

                      {isStartRepairEligible && (
                        <Pressable
                          style={styles.primaryBtn}
                          onPress={() => handleStartJob(job)}
                          disabled={actionLoadingId === job.id}
                          accessibilityRole="button"
                          accessibilityLabel="Start repair"
                        >
                          {actionLoadingId === job.id ? (
                            <ActivityIndicator color={colors.white} size="small" />
                          ) : (
                            <>
                              <Ionicons
                                name="play"
                                size={15}
                                color={colors.white}
                                style={{ marginRight: 6 }}
                              />
                              <Text style={styles.primaryBtnText}>Start Repair</Text>
                            </>
                          )}
                        </Pressable>
                      )}

                      {isInProgress && (
                        <Pressable
                          style={styles.completeBtn}
                          onPress={() => openOtpModal(job)}
                          accessibilityRole="button"
                          accessibilityLabel="Enter customer 4-digit OTP to complete job"
                        >
                          <Ionicons
                            name="key"
                            size={16}
                            color={colors.white}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.primaryBtnText}>Verify & Complete (OTP)</Text>
                        </Pressable>
                      )}

                      {/* Detail Launcher */}
                      <Pressable
                        style={styles.iconCompanion}
                        onPress={() => setSelectedJobForDetails(job)}
                        accessibilityRole="button"
                        accessibilityLabel="Open job details"
                      >
                        <Ionicons name="eye-outline" size={20} color={colors.techDark} />
                      </Pressable>

                      {/* Map Launcher */}
                      {onNavigateToMap && (
                        <Pressable
                          style={styles.iconCompanion}
                          onPress={() => onNavigateToMap(job)}
                          accessibilityRole="button"
                          accessibilityLabel="Open GPS navigation map"
                        >
                          <Ionicons name="map-outline" size={20} color={colors.techDark} />
                        </Pressable>
                      )}

                      {/* Chat Launcher */}
                      {onNavigateToChat && (
                        <Pressable
                          style={styles.iconCompanion}
                          onPress={() => onNavigateToChat(job)}
                          accessibilityRole="button"
                          accessibilityLabel="Open customer chat"
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.techDark} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Nearby Queue Feed Content */}
        {feedTab === 'queue' && (
          <View style={styles.feedListContainer}>
            {filteredQueueJobs.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="radio-outline" size={28} color={colors.tech} />
                </View>
                <View style={styles.emptyTextContainer}>
                  <Text style={styles.emptyTitle}>Queue is Clear</Text>
                  <Text style={styles.emptyCopy}>
                    No unassigned repair requests within 20 km matching your current filter. Pull down to refresh or check other categories.
                  </Text>
                </View>
                {selectedCategory !== 'all' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reset category filter to all"
                    onPress={() => setSelectedCategory('all')}
                    style={({ pressed }) => [styles.emptyActionBtn, pressed && styles.pressedSoft]}
                  >
                    <Text style={styles.emptyActionBtnText}>Show All Categories</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              filteredQueueJobs.map((job) => (
                <View key={job.id} style={styles.jobCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.applianceAvatar}>
                      <Ionicons
                        name={getApplianceIcon(job.applianceType) as IconName}
                        size={22}
                        color={colors.techDark}
                      />
                    </View>
                    <View style={styles.cardTitleWrap}>
                      <View style={styles.cardTitleTop}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {job.applianceType || 'Repair Request'}
                        </Text>
                        {job.distanceKm != null && (
                          <View
                            style={styles.distanceBadge}
                            accessibilityRole="text"
                            accessibilityLabel={`${Number(job.distanceKm).toFixed(1)} kilometers away`}
                          >
                            <Ionicons name="navigate" size={10} color={colors.techDark} />
                            <Text style={styles.distanceBadgeText}>
                              {`${Number(job.distanceKm).toFixed(1)} km`}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.customerNameText} numberOfLines={1}>
                        {job.customerName || 'Verified Homeowner'}
                      </Text>
                    </View>
                  </View>

                  {/* Privacy Location Shield Notice */}
                  <View style={styles.privacyShieldRow}>
                    <Ionicons name="shield-outline" size={13} color={colors.techDark} />
                    <Text style={styles.privacyShieldText} numberOfLines={1}>
                      {job.location || 'Bogo Catchment'} (Street masked until accepted)
                    </Text>
                  </View>

                  {/* Schedule Pill Row (no payments in FixLink) */}
                  <View style={styles.pillRow}>
                    <View style={styles.schedulePill}>
                      <Ionicons name="time-outline" size={12} color={colors.techDark} />
                      <Text style={styles.schedulePillText} numberOfLines={1}>
                        {formatJobSchedule(job)}
                      </Text>
                    </View>
                  </View>

                  {/* Issue Description Box */}
                  {job.description && (
                    <View style={styles.issueBox}>
                      <Text style={styles.issueText} numberOfLines={3}>
                        {job.description}
                      </Text>
                    </View>
                  )}

                  {/* Customer Photo */}
                  {job.photoUrl && (
                    <View style={{ marginBottom: 12 }}>
                      <PhotoThumb photoUrl={job.photoUrl} onPress={() => setPreviewUrl(job.photoUrl ?? null)} />
                    </View>
                  )}

                  {/* Action Bar */}
                  <View style={styles.cardActionRow}>
                    <Pressable
                      style={styles.primaryBtn}
                      onPress={() => handleAcceptJob(job)}
                      disabled={acceptingJobId === job.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Accept repair job for ${job.applianceType || 'request'}`}
                    >
                      {acceptingJobId === job.id ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <>
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={colors.white}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.primaryBtnText}>Accept Job</Text>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => setSelectedJobForDetails(job)}
                      accessibilityRole="button"
                      accessibilityLabel="View full job details"
                    >
                      <Ionicons name="eye-outline" size={16} color={colors.ink} />
                      <Text style={styles.secondaryBtnText}>Details</Text>
                    </Pressable>

                    <Pressable
                      style={styles.dangerOutlineBtn}
                      onPress={() => handleDeclineJob(job)}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss repair request"
                    >
                      <Ionicons name="close" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </View>
      )}

      {/* 4-Digit OTP Completion Handshake Modal */}
      <Modal
        visible={otpModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setOtpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalKicker}>COMPLETION HANDSHAKE</Text>
                <Text style={styles.modalTitle}>Enter 4-Digit Code</Text>
              </View>
              <Pressable
                hitSlop={12}
                onPress={() => setOtpModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close OTP modal"
                style={styles.modalCloseTarget}
              >
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <Text style={styles.modalDesc}>
              Ask the customer to display their 4-digit completion code on their FixLink phone screen to confirm repair closeout.
            </Text>

            {/* Discrete 4-Box PIN Display */}
            <View style={styles.pinBoxesContainer}>
              {[0, 1, 2, 3].map((idx) => {
                const digit = otpCode[idx] ?? '';
                const isFocused = otpCode.length === idx;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinBox,
                      digit !== '' && styles.pinBoxFilled,
                      isFocused && styles.pinBoxActive
                    ]}
                  >
                    <Text style={styles.pinDigit}>{digit}</Text>
                  </View>
                );
              })}
            </View>

            {/* Hidden Input field driving the 4-box display */}
            <TextInput
              style={styles.hiddenPinInput}
              value={otpCode}
              onChangeText={(text) => setOtpCode(text.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus={true}
            />

            <Pressable
              style={[styles.primaryBtn, { width: '100%', marginTop: 8 }]}
              onPress={handleVerifyOtp}
              disabled={verifyingOtp}
              accessibilityRole="button"
              accessibilityLabel="Verify and finalize job"
            >
              {verifyingOtp ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={16} color={colors.white} style={{ marginRight: 6 }} />
                  <Text style={styles.primaryBtnText}>Verify and Complete Job</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Customer Repair Photo Lightbox */}
      <PhotoLightbox
        visible={previewUrl !== null}
        photoUrl={previewUrl}
        title="Repair Problem Photo"
        subtitle="Captured by customer upon request submission"
        onClose={() => setPreviewUrl(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 },
  centerWrap: { width: '100%', maxWidth: 640,
alignSelf: 'center' },
  // Dark header matching Make file design
  protoHeader: { backgroundColor: colors.dark, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginHorizontal: -16, marginTop: -12, marginBottom: 16 },
  protoHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 },
  protoKicker: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular },
  protoName: { color: colors.white, fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.3, marginTop: 2 },
  protoBell: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  protoStatsRow: { flexDirection: 'row', gap: 12 },
  protoStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  protoStatValue: { color: colors.white, fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  protoStatLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  brandLeft: { flex: 1, minWidth: 0 },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandSmall: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.4,
    lineHeight: 22
  },
  brandAccent: { color: colors.tech, fontFamily: fonts.extraBold },
  dispatchPill: {
    backgroundColor: colors.techSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  dispatchPillText: {
    color: colors.techDark,
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 0.8
  },
  roleSmall: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.1,
    marginTop: 2
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 18,
    borderWidth: 1
  },
  dutyPillOnline: { backgroundColor: colors.techSoft, borderColor: colors.hudBorder },
  dutyPillOffline: { backgroundColor: colors.white, borderColor: colors.line },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotOnline: { backgroundColor: colors.green },
  statusDotOffline: { backgroundColor: colors.muted },
  dutyPillText: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.5 },
  dutyTextOnline: { color: colors.techDark },
  dutyTextOffline: { color: colors.muted },

  notificationQuiet: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.subtle
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.white
  },
  notifBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fonts.extraBold,
    fontVariant: ['tabular-nums']
  },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
    ...shadows.subtle
  },
  heroLeft: { flex: 1, paddingRight: 10, minWidth: 0 },
  greeting: {
    color: colors.ink,
    fontSize: 20,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.4,
    lineHeight: 24,
    marginBottom: 4
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 16,
    marginBottom: 10
  },
  heroMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  heroMetricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line
  },
  heroMetricText: {
    color: colors.ink,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    fontVariant: ['tabular-nums']
  },
  avatarWrap: {
    position: 'relative',
    marginLeft: 8
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.techSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  avatarText: { color: colors.techDark, fontSize: 18, fontFamily: fonts.bold },
  avatarPresenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.white
  },
  presenceOnline: {
    backgroundColor: colors.green
  },
  presenceOffline: {
    backgroundColor: '#94A3B8'
  },

  workloadStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1
  },
  workloadStripBusy: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  workloadStripAtCapacity: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  workloadTitle: { fontSize: 13, fontFamily: fonts.bold, marginBottom: 2 },
  workloadSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, lineHeight: 16 },

  feedTabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 4,
    marginBottom: 12,
    ...shadows.subtle
  },
  feedTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    minHeight: 44
  },
  feedTabItemActive: { backgroundColor: colors.tech },
  feedTabLabel: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.muted
  },
  feedTabLabelActive: {
    fontFamily: fonts.bold,
    color: colors.white
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5
  },
  tabBadgeActive: { backgroundColor: colors.white },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.muted,
    fontVariant: ['tabular-nums']
  },
  tabBadgeTextActive: { color: colors.tech },

  queueControlSection: { marginBottom: 12 },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink
  },

  categoryScroll: { gap: 8, paddingBottom: 6 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  categoryChipSelected: {
    backgroundColor: colors.tech,
    borderColor: colors.tech
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.techDark
  },
  categoryChipTextSelected: { color: colors.white },

  queueMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 4
  },
  queueMetaText: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  queueMetaCount: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },

  feedListContainer: { gap: 12 },

  jobCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    ...shadows.card
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10
  },
  applianceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.2
  },
  customerNameText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.muted
  },

  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  distanceBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1
  },
  statusPillText: { fontSize: 10, fontFamily: fonts.bold },

  privacyShieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10
  },
  privacyShieldText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.techDark,
    flex: 1
  },

  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap'
  },
  schedulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvas,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  schedulePillText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },
  issueBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginBottom: 12
  },
  issueText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.ink,
    lineHeight: 17
  },

  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  stepItem: { alignItems: 'center', gap: 3 },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepCircleDone: { backgroundColor: colors.tech },
  stepCirclePending: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  stepLabel: { fontSize: 9, fontFamily: fonts.medium, color: colors.muted },
  stepLabelDone: { color: colors.techDark, fontFamily: fonts.bold },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
    marginHorizontal: 4,
    marginTop: -10
  },
  stepLineDone: { backgroundColor: colors.tech },

  cardDetailsBox: {
    backgroundColor: colors.canvas,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    marginBottom: 12
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { flex: 1, fontSize: 12, fontFamily: fonts.medium, color: colors.ink },
  detailTextSchedule: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },
  problemSnippetBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft
  },
  problemSnippetText: { flex: 1, fontSize: 11, fontFamily: fonts.regular, color: colors.muted, lineHeight: 16 },

  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },

  primaryBtn: {
    flex: 1,
    minWidth: 120,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.tech,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...shadows.card
  },
  primaryBtnText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.white
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 6,
    minHeight: 48
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink
  },
  dangerOutlineBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48
  },
  dangerOutlineText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.danger
  },
  completeBtn: {
    flex: 1,
    minWidth: 150,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.tech,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...shadows.card
  },
  iconCompanion: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48
  },

  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...shadows.subtle
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.techSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  emptyTextContainer: { alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  emptyCopy: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18
  },
  emptyActionBtn: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.techSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyActionBtnText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.techDark
  },

  errorCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    ...shadows.subtle
  },
  errorTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink, marginTop: 8 },
  errorText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  offlineBannerText: { flex: 1, fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  offlineRetryText: { fontSize: 12, fontFamily: fonts.bold, color: colors.tech },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 42, 67, 0.45)',
    justifyContent: 'flex-end'
  },
  detailsSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '85%'
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 12
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 12
  },
  sheetKicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.techDark,
    letterSpacing: 1.2,
    marginBottom: 2
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.ink
  },
  sheetCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetSection: { marginBottom: 16 },
  sheetSectionLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 6
  },
  sheetInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  sheetInfoText: { fontSize: 13, fontFamily: fonts.medium, color: colors.ink },
  sheetBodyText: { fontSize: 13, fontFamily: fonts.regular, color: colors.ink, lineHeight: 19 },
  sheetActionRow: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },

  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    width: '100%',
    ...shadows.hud
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  modalKicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.techDark,
    letterSpacing: 1.2,
    marginBottom: 2
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  modalCloseTarget: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalDesc: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 18,
    lineHeight: 18
  },
  pinBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16
  },
  pinBox: {
    width: 54,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinBoxFilled: {
    borderColor: colors.tech,
    backgroundColor: colors.white
  },
  pinBoxActive: {
    borderColor: colors.techDark,
    borderWidth: 2
  },
  pinDigit: {
    fontSize: 24,
    fontFamily: fonts.extraBold,
    color: colors.ink,
    fontVariant: ['tabular-nums']
  },
  hiddenPinInput: {
    position: 'absolute',
    opacity: 0.01,
    width: 1,
    height: 1
  },

  pressedSoft: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 }
});
