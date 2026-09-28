// Available Jobs screen (technician queue + assigned jobs).
//
// Orchestrator only. Data lives in availableJobs/useTechnicianJobs.ts,
// actions in availableJobs/useJobActions.ts, and every visual block in
// availableJobs/*.tsx (QueueHeader, FeedBanners, ActiveJobCard,
// QueueJobCard, OtpModal, AcceptConfirmModal, availableJobsStyles.ts).
// No UI, flow, API or state behavior was changed in the split.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Skeleton from '../../components/Skeleton';
import TechJobDetailScreen from './TechJobDetailScreen';
import { PhotoLightbox } from '../../components/RequestPhoto';
import { updateTechnicianLocation } from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { colors } from '../../theme';
import {
  calculateWorkloadSummary,
  filterJobs,
  type JobItem
} from './availableJobsHelpers';
import { useTechnicianJobs } from './availableJobs/useTechnicianJobs';
import { useJobActions } from './availableJobs/useJobActions';
import { QueueHeader } from './availableJobs/QueueHeader';
import { FeedBanners } from './availableJobs/FeedBanners';
import { ActiveJobCard } from './availableJobs/ActiveJobCard';
import { QueueJobCard } from './availableJobs/QueueJobCard';
import { OtpModal } from './availableJobs/OtpModal';
import { AcceptConfirmModal } from './availableJobs/AcceptConfirmModal';
import { styles } from './availableJobs/availableJobsStyles';
import { NEARBY_QUEUE_RADIUS_KM, type AvailableJobsScreenProps } from './availableJobs/types';

export default function AvailableJobsScreen({
  technician,
  onNavigateToMap,
  onNavigateToChat,
  onOpenNotifications,
  notificationCount = 0,
  highlightedJobId = null
}: AvailableJobsScreenProps): React.JSX.Element {
  const {
    jobs,
    acceptedJobs,
    loading,
    refreshing,
    fetchError,
    techCoords,
    setJobs,
    setAcceptedJobs,
    loadJobs,
    getUpdatedTechCoords,
    handleRefresh,
  } = useTechnicianJobs(technician);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Operational states
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<JobItem | null>(null);

  // Feed Tab navigation: 'queue' (Available Leads) vs 'active' (My Active Jobs)
  const [feedTab, setFeedTab] = useState<'queue' | 'active'>('queue');

  const actions = useJobActions({
    technician,
    workloadStatus: calculateWorkloadSummary(acceptedJobs.length).status,
    setJobs,
    setAcceptedJobs,
    loadJobs,
    setSelectedJobForDetails,
    selectedJobForDetails,
    setFeedTab,
  });

  const {
    acceptingJobId,
    confirmJob,
    setConfirmJob,
    dismissJob,
    setDismissJob,
    dismissing,
    acceptError,
    actionLoadingId,
    noShowJob,
    setNoShowJob,
    otpModalVisible,
    setOtpModalVisible,
    otpCode,
    setOtpCode,
    verifyingOtp,
    handleAcceptJob,
    doAcceptJob,
    handleDeclineJob,
    doDismissJob,
    handleArrival,
    handleStartJob,
    handleNoShow,
    doNoShow,
    openOtpModal,
    handleVerifyOtp,
  } = actions;

  const technicianName = technician?.name || 'Technician';

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
  void workloadHue;

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
  void toggleDutyStatus;

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
        <QueueHeader
          technicianName={technicianName}
          notificationCount={notificationCount}
          onOpenNotifications={onOpenNotifications}
          pendingCount={pendingCount}
          activeCount={activeCount}
          feedTab={feedTab}
          onSelectTab={setFeedTab}
        />

        <FeedBanners
          fetchError={fetchError}
          hasJobs={jobs.length > 0 || acceptedJobs.length > 0}
          acceptError={acceptError}
          onRetry={handleRefresh}
        />

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
              acceptedJobs.map((job) => (
                <ActiveJobCard
                  key={job.id}
                  job={job}
                  actionLoadingId={actionLoadingId}
                  onArrival={handleArrival}
                  onStart={handleStartJob}
                  onComplete={openOtpModal}
                  onNoShow={handleNoShow}
                  onOpenDetails={setSelectedJobForDetails}
                  onNavigateToMap={onNavigateToMap}
                  onNavigateToChat={onNavigateToChat}
                  onPreviewPhoto={setPreviewUrl}
                />
              ))
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
                <QueueJobCard
                  key={job.id}
                  job={job}
                  acceptingJobId={acceptingJobId}
                  onAccept={handleAcceptJob}
                  onDecline={handleDeclineJob}
                  onOpenDetails={setSelectedJobForDetails}
                  onPreviewPhoto={setPreviewUrl}
                />
              ))
            )}
          </View>
        )}
      </View>
      )}

      {/* 4-Digit OTP Completion Handshake Modal */}
      <OtpModal
        visible={otpModalVisible}
        otpCode={otpCode}
        verifying={verifyingOtp}
        onChangeCode={setOtpCode}
        onClose={() => setOtpModalVisible(false)}
        onVerify={handleVerifyOtp}
      />

      {/* No-show confirm modal. Works on web plus native. */}
      <ConfirmDialog
        visible={noShowJob !== null}
        title="Report customer no-show?"
        message="This records that the customer or appliance was not accessible at the specified service address."
        confirmLabel="Confirm Report"
        danger
        busy={actionLoadingId !== null}
        accentColor={colors.tech}
        onCancel={() => { if (!actionLoadingId) setNoShowJob(null); }}
        onConfirm={doNoShow}
      />

      {/* Dismiss confirm modal. Works on web plus native. */}
      <ConfirmDialog
        visible={dismissJob !== null}
        title="Dismiss this request?"
        message={`${dismissJob?.applianceType || 'Repair request'}${dismissJob?.location ? `\nLocation: ${dismissJob.location}` : ''}\n\nThis will remove the lead from your visible queue.`}
        confirmLabel="Dismiss"
        danger
        busy={dismissing}
        accentColor={colors.tech}
        onCancel={() => { if (!dismissing) setDismissJob(null); }}
        onConfirm={doDismissJob}
      />

      {/* Customer Repair Photo Lightbox */}
      <PhotoLightbox
        visible={previewUrl !== null}
        photoUrl={previewUrl}
        title="Repair Problem Photo"
        subtitle="Captured by customer upon request submission"
        onClose={() => setPreviewUrl(null)}
      />

      {/* Accept confirm modal. Works on web plus native. */}
      <AcceptConfirmModal
        job={confirmJob}
        accepting={acceptingJobId !== null}
        onCancel={() => setConfirmJob(null)}
        onConfirm={doAcceptJob}
      />
    </ScrollView>
  );
}
