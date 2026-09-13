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
  TouchableOpacity,
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
  updateJobStatus,
  updateTechnicianLocation,
  verifyCompletionCode
} from '../services/api';
import { fonts } from '../../theme';

const colors = {
  ink: '#102A43',
  muted: '#5A7A91',
  line: '#D9E2EC',
  canvas: '#F5F8FA',
  teal: '#0F766E',
  tealDark: '#075E59',
  white: '#FFFFFF',
  gold: '#D97706',
  green: '#059669',
  danger: '#DC2626'
};

const BOGO_LANDMARKS = {
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

const resolveJobCoords = (job) => {
  const lat = Number(job?.latitude);
  const lon = Number(job?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  const lower = String(job?.location || '').toLowerCase();
  for (const [key, coords] of Object.entries(BOGO_LANDMARKS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

const formatSchedule = (job) => {
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

export default function AvailableJobsScreen({ technician, onNavigateToMap, onNavigateToChat, onOpenNotifications, notificationCount = 0 }) {
  const [jobs, setJobs] = useState([]);
  const [acceptedJobs, setAcceptedJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingJobId, setAcceptingJobId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [techCoords, setTechCoords] = useState(
    technician?.latitude && technician?.longitude
      ? { latitude: Number(technician.latitude), longitude: Number(technician.longitude) }
      : null
  );

  // OTP Verification Modal State
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [selectedJobForOtp, setSelectedJobForOtp] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const getUpdatedTechCoords = async () => {
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

  const loadJobs = async () => {
    try {
      const coords = await getUpdatedTechCoords();
      const [result, assigned] = await Promise.all([
        fetchRepairRequests(technician?.uid, coords),
        fetchTechnicianJobs(technician?.uid),
      ]);
      setJobs(Array.isArray(result) ? result : []);
      setAcceptedJobs(
        Array.isArray(assigned)
          ? assigned.filter((job) => ['Accepted', 'In Progress'].includes(job.status))
          : []
      );
    } catch (error) {
      console.warn('Failed to load technician jobs:', error);
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [technician?.uid]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadJobs();
  };

  const handleAcceptJob = async (job) => {
    if (!technician?.uid || acceptingJobId) return;
    setAcceptingJobId(job.id);
    try {
      const accepted = await acceptRepairRequest(job.id, technician.uid, technician.name || 'Technician');
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
      Alert.alert('Unable to accept job', error?.error || 'This job may already have been accepted by another technician.');
    } finally {
      setAcceptingJobId(null);
    }
  };

  const handleDeclineJob = async (job) => {
    try {
      await declineRepairRequest(job.id, technician?.uid);
      setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
    } catch (error) {
      Alert.alert('Error', error?.error || 'Failed to dismiss job.');
    }
  };

  const handleStartJob = async (job) => {
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
      Alert.alert('Error', error?.error || 'Failed to update job status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openOtpModal = (job) => {
    setSelectedJobForOtp(job);
    setOtpCode('');
    setOtpModalVisible(true);
  };

  const handleVerifyOtp = async () => {
    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length !== 4) {
      Alert.alert('Invalid Code', 'Please enter the 4-digit code provided by the customer.');
      return;
    }
    setVerifyingOtp(true);
    try {
      await verifyCompletionCode(selectedJobForOtp.id, cleanCode);
      setOtpModalVisible(false);
      setAcceptedJobs((currentJobs) => currentJobs.filter((j) => j.id !== selectedJobForOtp.id));
      Alert.alert('🎉 Job Completed!', 'The repair has been successfully verified and completed.');
      loadJobs();
    } catch (error) {
      Alert.alert('Verification Failed', error?.error || 'The code entered does not match the customer code.');
    } finally {
      setVerifyingOtp(false);
    }
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} />}
    >
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>TECHNICIAN HUB</Text>
          <Text style={styles.greeting}>Jobs for your skills</Text>
          <Text style={styles.subtitle}>Review nearby repair work and choose your next dispatch.</Text>
        </View>
        <View style={styles.heroActions}>
          <View style={styles.jobCount}>
            <Text style={styles.jobCountValue}>{jobs.length}</Text>
            <Text style={styles.jobCountLabel}>nearby</Text>
          </View>
          <TouchableOpacity style={styles.techNotification} onPress={onOpenNotifications} activeOpacity={0.8}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            {notificationCount > 0 && (
              <View style={styles.techNotificationBadge}>
                <Text style={styles.techNotificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <Ionicons name="radio-outline" size={21} color={colors.teal} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>Availability is ON</Text>
          <Text style={styles.statusText}>Filtered by your verified technician skills.</Text>
        </View>
        <View style={styles.liveDot} />
      </View>

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
          <Ionicons name="checkmark-done-outline" size={22} color={colors.teal} />
          <Text style={styles.acceptedEmptyText}>No active jobs currently in progress.</Text>
        </View>
      ) : (
        acceptedJobs.map((job) => {
          const isInProgress = job.status === 'In Progress';
          return (
            <View key={job.id} style={styles.acceptedCard}>
              <View style={styles.acceptedTopRow}>
                <View style={styles.acceptedIcon}>
                  <Ionicons name="construct" size={20} color={colors.teal} />
                </View>
                <View style={styles.acceptedCopy}>
                  <View style={[styles.statusBadge, isInProgress ? styles.statusInProgress : styles.statusAccepted]}>
                    <Text style={[styles.statusBadgeText, isInProgress ? styles.statusTextInProgress : styles.statusTextAccepted]}>
                      ● {job.status}
                    </Text>
                  </View>
                  <Text style={styles.acceptedTitle}>{job.applianceType || 'Repair request'}</Text>
                  <Text style={styles.acceptedMeta} numberOfLines={1}>
                    {job.customerName || 'Customer'} • {job.location || 'Location pending'}
                  </Text>
                  {(job.preferredDate || job.preferredTime || job.scheduledDate) && (
                    <Text style={[styles.acceptedMeta, { color: colors.tealDark, fontFamily: fonts.semiBold, marginTop: 2 }]} numberOfLines={1}>
                      📅 {formatSchedule(job)}
                    </Text>
                  )}
                </View>
                <View style={styles.acceptedIconActions}>
                  {onNavigateToMap && (
                    <TouchableOpacity style={styles.iconButton} onPress={() => onNavigateToMap(job)}>
                      <Ionicons name="map-outline" size={17} color={colors.white} />
                    </TouchableOpacity>
                  )}
                  {onNavigateToChat && (
                    <TouchableOpacity style={styles.iconButton} onPress={() => onNavigateToChat(job)}>
                      <Ionicons name="chatbubble-outline" size={17} color={colors.white} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Status Action Buttons */}
              <View style={styles.acceptedActionRow}>
                {!isInProgress ? (
                  <TouchableOpacity
                    style={styles.startJobButton}
                    onPress={() => handleStartJob(job)}
                    disabled={actionLoadingId === job.id}
                  >
                    {actionLoadingId === job.id ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <>
                        <Ionicons name="play" size={15} color={colors.white} />
                        <Text style={styles.startJobButtonText}>Start Repair Job</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.completeJobButton}
                    onPress={() => openOtpModal(job)}
                  >
                    <Ionicons name="key" size={15} color={colors.white} />
                    <Text style={styles.completeJobButtonText}>Complete Job (Enter OTP)</Text>
                  </TouchableOpacity>
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
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh-outline" size={21} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {jobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="briefcase-outline" size={28} color={colors.teal} />
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

          return (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobTopRow}>
                <View style={styles.categoryIcon}>
                  <Ionicons name="construct-outline" size={21} color={colors.teal} />
                </View>
                <View style={styles.jobHeading}>
                  <Text style={styles.kicker}>SERVICE REQUEST</Text>
                  <Text style={styles.jobTitle}>{job.applianceType || 'Repair request'}</Text>
                </View>
                {calculatedDistance != null && (
                  <View style={styles.distancePill}>
                    <Ionicons name="navigate-outline" size={13} color="#8A5B00" style={{ transform: [{ rotate: '45deg' }] }} />
                    <Text style={styles.distanceText}>{calculatedDistance} km</Text>
                  </View>
                )}
              </View>

              <Text style={styles.problem} numberOfLines={3}>
                {job.description || 'No issue description provided.'}
              </Text>

              <View style={styles.metaBlock}>
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={colors.muted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {job.location || 'Location pending'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                  <Text style={styles.metaText}>
                    {formatSchedule(job)}
                  </Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.declineAction}
                  onPress={() => handleDeclineJob(job)}
                >
                  <Text style={styles.declineActionText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryAction}
                  onPress={() => handleAcceptJob(job)}
                  disabled={acceptingJobId !== null}
                >
                  {acceptingJobId === job.id ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Text style={styles.primaryActionText}>Accept Job</Text>
                      <Ionicons name="checkmark" size={17} color={colors.white} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })
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
              <Ionicons name="key" size={28} color={colors.green} />
            </View>
            <Text style={styles.otpModalTitle}>Verify Completion</Text>
            <Text style={styles.otpModalSubtitle}>
              Ask {selectedJobForOtp?.customerName || 'the customer'} for the 4-digit code shown on their tracking screen.
            </Text>

            <TextInput
              style={styles.otpInput}
              placeholder="0 0 0 0"
              placeholderTextColor="#9FB3C8"
              keyboardType="number-pad"
              maxLength={4}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setOtpModalVisible(false)}
                disabled={verifyingOtp}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleVerifyOtp}
                disabled={verifyingOtp}
              >
                {verifyingOtp ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Verify & Complete</Text>
                )}
              </TouchableOpacity>
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
  jobCount: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#D7F0ED', alignItems: 'center', justifyContent: 'center' },
  jobCountValue: { color: colors.tealDark, fontSize: 20, fontFamily: fonts.extraBold },
  jobCountLabel: { color: colors.teal, fontSize: 10, fontFamily: fonts.bold },
  techNotification: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  techNotificationBadge: { position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  techNotificationBadgeText: { color: colors.white, fontSize: 9, fontFamily: fonts.extraBold },
  statusCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  statusIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 3 },
  statusText: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#22C55E' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 3 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold },
  acceptedCount: { color: colors.teal, fontSize: 15, fontFamily: fonts.extraBold, marginBottom: 2 },
  acceptedEmpty: { backgroundColor: '#E6F6F3', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  acceptedEmptyText: { color: colors.tealDark, fontSize: 12, fontFamily: fonts.semiBold },
  acceptedCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: '#B9E8E1', padding: 16, marginBottom: 14, shadowColor: colors.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  acceptedTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  acceptedIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  acceptedCopy: { flex: 1 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 4 },
  statusAccepted: { backgroundColor: '#E6F6F3' },
  statusInProgress: { backgroundColor: '#FEF3C7' },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bold },
  statusTextAccepted: { color: colors.teal },
  statusTextInProgress: { color: colors.gold },
  acceptedTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  acceptedMeta: { color: colors.muted, fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
  acceptedIconActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  iconButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  acceptedActionRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  startJobButton: { height: 40, borderRadius: 11, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  startJobButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  completeJobButton: { height: 40, borderRadius: 11, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  completeJobButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  jobCard: { backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 14, shadowColor: colors.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 },
  jobTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  categoryIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  jobHeading: { flex: 1 },
  jobTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold },
  distancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF3C7', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  distanceText: { color: '#8A5B00', fontSize: 12, fontFamily: fonts.bold },
  problem: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 15, fontFamily: fonts.regular },
  metaBlock: { borderTopWidth: 1, borderTopColor: colors.line, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 11, gap: 9, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  declineAction: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  declineActionText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  primaryAction: { flex: 1, height: 42, borderRadius: 12, backgroundColor: colors.teal, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryActionText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 30, alignItems: 'center' },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginBottom: 5 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', fontFamily: fonts.medium },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  otpModalCard: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: colors.ink, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  otpIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  otpModalTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold, marginBottom: 8 },
  otpModalSubtitle: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20, fontFamily: fonts.medium },
  otpInput: { width: '100%', height: 56, borderRadius: 14, borderWidth: 2, borderColor: colors.teal, textAlign: 'center', fontSize: 26, fontFamily: fonts.bold, letterSpacing: 10, color: colors.ink, backgroundColor: '#F8FBFC', marginBottom: 20 },
  modalButtonRow: { flexDirection: 'row', gap: 10, width: '100%' },
  modalCancelButton: { flex: 1, height: 46, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: colors.muted, fontSize: 14, fontFamily: fonts.semiBold },
  modalSubmitButton: { flex: 1.5, height: 46, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  modalSubmitText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold }
});
