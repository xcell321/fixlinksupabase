// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, StatusBar, Alert, ActivityIndicator, Image, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { confirmRepairRequest, fetchTechnicianProfile, markCustomerReady } from '../../services/api';
import { PhotoLightbox } from '../../components/RequestPhoto';
import ConfirmDialog from '../../components/ConfirmDialog';
import { colors, fonts } from '../../theme';
import { getStatusColor } from '../../utils/applianceIcons';

// Reference RequestDetail layout: device card + progress, Status Timeline
// checkmark rail, Technician card with Message/Call. Steps derive done-ness
// from the real status; the sub-line is a real timestamp when one exists,
// otherwise Done/Pending. No invented times.
const STATUS_PROGRESS = { pending: 10, accepted: 25, confirmed: 40, 'customer ready': 60, 'in progress': 80, completed: 100 };

const formatDateTime = (iso) => {
  if (!iso) return null;
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

function StarRating({ rating }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= Math.round(rating) ? 'star' : 'star-outline'} size={14} color={i <= Math.round(rating) ? '#F97316' : '#D1D5DB'} />
      ))}
    </View>
  );
}

export default function RequestDetailsScreen({ request, onBack, onMessageTechnician, onTrackMap, onViewTechnicianProfile }) {
  const [techProfile, setTechProfile] = useState(null);
  const [workflowLoading, setWorkflowLoading] = useState(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [workflowError, setWorkflowError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (request?.technicianUid) {
      fetchTechnicianProfile(request.technicianUid)
        .then((profile) => { if (isMounted && profile) setTechProfile(profile); })
        .catch(() => {});
    }
    return () => { isMounted = false; };
  }, [request?.technicianUid]);

  if (!request) return null;

  const status = request.status || 'Pending';
  const statusKey = status.toLowerCase();
  const statusColor = getStatusColor(status);
  const isAccepted = statusKey === 'accepted';
  const isConfirmed = statusKey === 'confirmed';
  const isReady = statusKey === 'customer ready';
  const isInProgress = statusKey === 'in progress';
  const isActive = isAccepted || isConfirmed || isReady || isInProgress;
  const isCancelled = statusKey === 'cancelled';
  const isNoShow = statusKey === 'no-show' || statusKey === 'no show';
  const isTerminal = isCancelled || isNoShow;
  const isCompleted = statusKey === 'completed';
  const progress = STATUS_PROGRESS[statusKey] ?? 10;

  const stepIndex = isCompleted ? 6 : isInProgress ? 4 : isReady ? 3 : isConfirmed ? 2 : isAccepted ? 1 : 0;
  const timelineSteps = [
    { label: 'Request Submitted', time: formatDateTime(request.createdAt), done: true },
    { label: 'Technician Assigned', time: formatDateTime(request.acceptedAt), done: stepIndex >= 1 || !!request.technicianName },
    { label: 'On the way', time: null, done: stepIndex >= 3 },
    { label: 'Repair in Progress', time: formatDateTime(request.startedAt), done: stepIndex >= 4 },
    { label: 'Quality Check', time: null, done: isCompleted },
    { label: 'Completed', time: formatDateTime(request.completedAt), done: isCompleted },
  ];

  const reviews = Array.isArray(techProfile?.reviews) && techProfile.reviews.length > 0 ? techProfile.reviews : null;
  const reviewCount = reviews
    ? reviews.length
    : (techProfile?.totalReviews != null && Number(techProfile.totalReviews) > 0 ? Number(techProfile.totalReviews)
      : (request?.technicianTotalReviews != null && Number(request.technicianTotalReviews) > 0 ? Number(request.technicianTotalReviews) : 0));
  const averageRating = reviewCount > 0
    ? (techProfile?.averageRating != null && Number(techProfile.averageRating) > 0
        ? Number(techProfile.averageRating)
        : (request?.technicianRating != null ? Number(request.technicianRating) : 0))
    : null;
  const techInitial = String(request.technicianName || 'T').charAt(0).toUpperCase();
  const techPhone = techProfile?.phone ? String(techProfile.phone) : null;

  const runPendingAction = async () => {
    if (!pendingAction || workflowLoading) return;
    setWorkflowLoading(pendingAction.key);
    try {
      await pendingAction.run();
      setWorkflowError(null);
      setPendingAction(null);
    } catch (error) {
      setWorkflowError(error?.error || 'Please try again.');
    } finally {
      setWorkflowLoading(null);
    }
  };

  const handleConfirmRepair = () => {
    setWorkflowError(null);
    setPendingAction({
      key: 'confirm',
      title: 'Confirm repair?',
      message: 'This confirms you need the repair and will be at the service location.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Not yet',
      run: async () => {
        await confirmRepairRequest(request.id);
        onBack?.();
      },
    });
  };

  const handleMarkReady = () => {
    setWorkflowError(null);
    setPendingAction({
      key: 'ready',
      title: 'Mark ready?',
      message: 'Confirm that someone will be at the service location to meet the technician.',
      confirmLabel: 'Ready',
      cancelLabel: 'Not yet',
      run: async () => {
        await markCustomerReady(request.id);
        onBack?.();
      },
    });
  };

  const handleCall = async () => {
    if (!techPhone) {
      Alert.alert('No number on file', 'The technician has not shared a contact number yet. Use Message instead.');
      return;
    }
    try {
      const url = `tel:${techPhone.replace(/[^+\d]/g, '')}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Call technician', techPhone);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Call technician', techPhone);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.backHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={18} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.backTitle}>Repair Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Device card with progress */}
        <View style={styles.card}>
          <View style={styles.deviceRow}>
            <View style={styles.deviceCopy}>
              <Text style={styles.deviceTitle} numberOfLines={1}>{request.applianceType || 'Repair request'}</Text>
              <Text style={styles.deviceIssue} numberOfLines={2}>{request.description || 'No description provided'}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]} numberOfLines={1}>{status}</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}% Complete</Text>
        </View>

        {isTerminal && (
          <View style={styles.terminalBanner}>
            <Ionicons name={isCancelled ? 'close-circle' : 'alert-circle'} size={18} color="#DC2626" />
            <Text style={styles.terminalText}>
              {isCancelled ? 'This request was cancelled.' : 'No-show reported. No one was at the service location.'}
            </Text>
          </View>
        )}

        {/* Status Timeline */}
        {!isTerminal && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Status Timeline</Text>
            {timelineSteps.map((s, i) => (
              <View key={s.label} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, s.done ? styles.timelineDotDone : styles.timelineDotTodo]}>
                    {s.done && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
                  </View>
                  {i < timelineSteps.length - 1 && <View style={[styles.timelineLine, s.done && styles.timelineLineDone]} />}
                </View>
                <View style={styles.timelineCopy}>
                  <Text style={[styles.timelineLabel, s.done ? styles.timelineLabelDone : styles.timelineLabelTodo]}>{s.label}</Text>
                  <Text style={styles.timelineTime}>{s.time || (s.done ? 'Done' : 'Pending')}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Technician */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Technician</Text>
          {request.technicianName ? (
            <>
              <View style={styles.techRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{techInitial}</Text>
                </View>
                <View style={styles.techCopy}>
                  <Text style={styles.techName} numberOfLines={1}>{request.technicianName}</Text>
                  {averageRating ? <StarRating rating={averageRating} /> : null}
                  <Text style={styles.techMeta}>
                    {averageRating ? `${Number(averageRating).toFixed(1)} avg · ${reviewCount} review${reviewCount === 1 ? '' : 's'}` : 'Not yet reviewed'}
                  </Text>
                </View>
              </View>
              <View style={styles.techActions}>
                <TouchableOpacity style={styles.messageBtn} onPress={onMessageTechnician} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Message technician">
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color="#EA580C" />
                  <Text style={styles.messageText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.callBtn} onPress={handleCall} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Call technician">
                  <Ionicons name="call-outline" size={16} color="#374151" />
                  <Text style={styles.callText}>Call</Text>
                </TouchableOpacity>
              </View>
              {request.technicianUid && onViewTechnicianProfile ? (
                <TouchableOpacity
                  style={styles.viewProfileBtn}
                  onPress={() => onViewTechnicianProfile({ uid: request.technicianUid, name: request.technicianName })}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="View technician profile"
                >
                  <Ionicons name="person-outline" size={16} color={colors.customer} />
                  <Text style={styles.viewProfileText}>View Profile</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <Text style={styles.waitingText}>Waiting for a technician to accept this request.</Text>
          )}
        </View>

        {/* Completion code */}
        {(isConfirmed || isReady || isInProgress) && request.verificationCode && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Completion code ${request.verificationCode}, tap to copy`}
            onPress={async () => {
              try {
                await Clipboard.setStringAsync(String(request.verificationCode));
                Alert.alert('Copied', 'Completion code copied to clipboard.');
              } catch {}
            }}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.codeHeader}>
              <Ionicons name="key-outline" size={18} color={colors.customer} />
              <Text style={styles.codeTitle}>Job Completion Code</Text>
            </View>
            <View style={styles.codeDigitsRow}>
              {String(request.verificationCode).split('').map((digit, idx) => (
                <View key={idx} style={styles.codeDigitBox}>
                  <Text style={styles.codeDigitText}>{digit}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.codeSub}>Provide this 4-digit code to the technician ONLY after they finish repairing your device.</Text>
          </Pressable>
        )}

        {/* Workflow actions */}
        {workflowError ? (
          <View style={styles.workflowErrorBox} accessibilityRole="alert">
            <Text style={styles.workflowErrorText}>{workflowError}</Text>
          </View>
        ) : null}
        {isAccepted && (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirmRepair} disabled={workflowLoading === 'confirm'} activeOpacity={0.88}>
            {workflowLoading === 'confirm' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Confirm Repair</Text>}
          </TouchableOpacity>
        )}
        {isConfirmed && (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleMarkReady} disabled={workflowLoading === 'ready'} activeOpacity={0.88}>
            {workflowLoading === 'ready' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>I&apos;m Ready for the Technician</Text>}
          </TouchableOpacity>
        )}
        {isActive && onTrackMap && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => onTrackMap(request)} activeOpacity={0.88}>
            <Ionicons name="map" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.primaryBtnText}>Track Technician on Live Map</Text>
          </TouchableOpacity>
        )}

        {/* Photo + location */}
        {request.photoUrl || request.location ? (
          <View style={styles.card}>
            {request.photoUrl ? (
              <TouchableOpacity style={styles.photoWrap} onPress={() => setPhotoViewerVisible(true)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="View attached photo">
                <Image source={{ uri: request.photoUrl }} style={styles.photoImage} resizeMode="cover" />
                <View style={styles.photoHintRow}>
                  <Ionicons name="expand-outline" size={14} color={colors.customer} />
                  <Text style={styles.photoHintText}>Attached photo · tap to view</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {request.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={16} color={colors.customer} />
                <Text style={styles.locationText} numberOfLines={2}>{request.location}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <PhotoLightbox
        visible={photoViewerVisible}
        photoUrl={request.photoUrl}
        title="Problem photo"
        subtitle="Attached to this request"
        onClose={() => setPhotoViewerVisible(false)}
      />
      <ConfirmDialog
        visible={pendingAction !== null}
        title={pendingAction?.title ?? ''}
        message={pendingAction?.message ?? ''}
        confirmLabel={pendingAction?.confirmLabel ?? 'Confirm'}
        cancelLabel={pendingAction?.cancelLabel ?? 'Cancel'}
        busy={workflowLoading !== null}
        onCancel={() => { if (!workflowLoading) setPendingAction(null); }}
        onConfirm={runPendingAction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.semiBold },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, gap: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  workflowErrorBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 12, marginBottom: 12 },
  workflowErrorText: { color: '#B91C1C', fontSize: 12, fontFamily: fonts.semiBold, lineHeight: 17 },
  cardTitle: { color: '#111827', fontSize: 14, fontFamily: fonts.bold, marginBottom: 16 },
  deviceRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
  deviceCopy: { flex: 1, minWidth: 0 },
  deviceTitle: { color: '#111827', fontSize: 16, fontFamily: fonts.bold },
  deviceIssue: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, flexShrink: 0 },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bold },
  progressTrack: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.customer, borderRadius: 999 },
  progressText: { textAlign: 'right', color: colors.customer, fontSize: 12, fontFamily: fonts.semiBold, marginTop: 4 },
  terminalBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  terminalText: { flex: 1, color: '#B91C1C', fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 18 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { flexDirection: 'column', alignItems: 'center' },
  timelineDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  timelineDotDone: { backgroundColor: colors.customer },
  timelineDotTodo: { backgroundColor: '#E5E7EB' },
  timelineLine: { width: 2, height: 32, marginTop: 2, backgroundColor: '#E5E7EB' },
  timelineLineDone: { backgroundColor: colors.customer },
  timelineCopy: { paddingBottom: 16 },
  timelineLabel: { fontSize: 14, fontFamily: fonts.semiBold },
  timelineLabelDone: { color: '#111827' },
  timelineLabelTodo: { color: '#9CA3AF' },
  timelineTime: { fontSize: 12, fontFamily: fonts.regular, color: '#9CA3AF', marginTop: 1 },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.extraBold },
  techCopy: { flex: 1, minWidth: 0 },
  techName: { color: '#111827', fontSize: 14, fontFamily: fonts.semiBold },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  techMeta: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  waitingText: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular },
  techActions: { flexDirection: 'row', gap: 8 },
  messageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF7ED', borderRadius: 12, paddingVertical: 10 },
  messageText: { color: '#EA580C', fontSize: 14, fontFamily: fonts.semiBold },
  callBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, paddingVertical: 10 },
  callText: { color: '#374151', fontSize: 14, fontFamily: fonts.semiBold },
  viewProfileBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 12, minHeight: 48 },
  viewProfileText: { color: colors.customer, fontSize: 14, fontFamily: fonts.bold },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  codeTitle: { color: '#111827', fontSize: 14, fontFamily: fonts.bold },
  codeDigitsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  codeDigitBox: { width: 48, height: 56, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  codeDigitText: { color: '#111827', fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  codeSub: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.customer, borderRadius: 12, minHeight: 52, paddingHorizontal: 16 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.semiBold },
  photoWrap: { marginBottom: 12 },
  photoImage: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#F3F4F6' },
  photoHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  photoHintText: { color: colors.customer, fontSize: 12, fontFamily: fonts.semiBold },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { flex: 1, color: '#4B5563', fontSize: 13, fontFamily: fonts.regular },
});
