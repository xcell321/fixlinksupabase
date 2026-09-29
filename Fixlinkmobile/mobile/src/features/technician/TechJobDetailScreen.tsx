// Prototype TechJobDetail: pay card, customer card, live mini map, action rows.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PhotoThumb } from '../../components/RequestPhoto';
import TechnicianLocationMap from '../../components/TechnicianLocationMap';
import { colors, fonts, shadows, themedStyles } from '../../theme';
import { getApplianceIcon } from '../../utils/applianceIcons';
import { splitJobDescription } from '../../utils/jobDescription';
import { formatJobSchedule, canMarkArrival, canStartRepair, type JobItem } from './availableJobsHelpers';

const BLUE = colors.tech;

interface TechJobDetailScreenProps {
  job: JobItem;
  techCoords?: { latitude: number; longitude: number } | null;
  isQueue: boolean;
  acceptingJobId: string | null;
  actionLoadingId: string | null;
  onBack: () => void;
  onAccept: (job: JobItem) => void;
  onDecline: (job: JobItem) => void;
  onArrival: (job: JobItem) => void;
  onNoShow: (job: JobItem) => void;
  onStart: (job: JobItem) => void;
  onComplete: (job: JobItem) => void;
  onMessage: (job: JobItem) => void;
  onPreviewPhoto: (url: string) => void;
}

export default function TechJobDetailScreen({
  job, techCoords, isQueue, acceptingJobId, actionLoadingId,
  onBack, onAccept, onDecline, onArrival, onNoShow, onStart, onComplete, onMessage, onPreviewPhoto,
}: TechJobDetailScreenProps): React.JSX.Element {
  const lat = job.latitude != null ? Number(job.latitude) : NaN;
  const lng = job.longitude != null ? Number(job.longitude) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const customerInitial = String(job.customerName || 'C').trim().charAt(0).toUpperCase() || 'C';
  const arrivalEligible = canMarkArrival(job);
  const startEligible = canStartRepair(job);
  const isInProgress = job.status === 'In Progress';
  const busy = actionLoadingId === job.id || acceptingJobId === job.id;
  // The description is stored as "[Brand] words", so the brand becomes a chip
  // and the words are shown once, instead of the raw bracketed string twice.
  const { brand, text: problemText } = splitJobDescription(job.description);
  const jobCode = String(job.id || '').slice(0, 6).toUpperCase();

  return (
    <View style={styles.screen}>
      <View style={styles.backHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back to jobs" hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.gray700} />
        </Pressable>
        <Text style={styles.backTitle}>Job Details</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.jobHeader}>
            <View style={styles.jobIconTile}>
              <Ionicons name={getApplianceIcon(job.applianceType)} size={20} color={BLUE} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.jobTitle} numberOfLines={2}>{job.applianceType || 'Repair Request'}</Text>
              <View style={styles.jobMetaRow}>
                {brand ? (
                  <View style={styles.brandChip}>
                    <Ionicons name="pricetag-outline" size={11} color={BLUE} />
                    <Text style={styles.brandChipText} numberOfLines={1}>{brand}</Text>
                  </View>
                ) : null}
                {jobCode ? <Text style={styles.jobCode}>Job #{jobCode}</Text> : null}
              </View>
            </View>
          </View>
          {problemText ? (
            <View style={styles.descBox}>
              <Text style={styles.descLabel}>PROBLEM DESCRIBED BY CUSTOMER</Text>
              <Text style={styles.descText}>{problemText}</Text>
            </View>
          ) : null}
          {job.photoUrl ? (
            <View style={{ marginTop: 12 }}>
              <PhotoThumb photoUrl={job.photoUrl} onPress={() => onPreviewPhoto(job.photoUrl as string)} />
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{customerInitial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.customerName} numberOfLines={1}>{job.customerName || 'Verified Homeowner'}</Text>
              <Text style={styles.customerMeta} numberOfLines={1}>Verified customer</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={14} color={colors.subtle} />
            <Text style={styles.infoText} numberOfLines={2}>{job.location || 'Local service area'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color={colors.subtle} />
            <Text style={styles.infoText} numberOfLines={1}>{formatJobSchedule(job)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Map</Text>
          {hasCoords ? (
            <TechnicianLocationMap
              customerCoords={{ latitude: lat, longitude: lng, name: job.customerName || 'Customer', address: job.location || '' }}
              isAccepted={!isQueue}
              style={{ height: 140, borderRadius: 12, overflow: 'hidden' }}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="location" size={20} color={BLUE} />
              <Text style={styles.mapPlaceholderText}>
                {job.distanceKm != null ? `${Number(job.distanceKm).toFixed(1)} km away` : 'Map unlocks after accept'}
              </Text>
            </View>
          )}
        </View>

        {isQueue ? (
          <View style={styles.btnRow}>
            <Pressable onPress={() => onDecline(job)} disabled={busy} style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Decline job">
              <Ionicons name="close" size={16} color={colors.dangerBright} />
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable onPress={() => onAccept(job)} disabled={busy} style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Accept job">
              {busy ? <ActivityIndicator color={colors.onAccent} size="small" /> : (<><Ionicons name="checkmark" size={16} color={colors.onAccent} /><Text style={styles.acceptText}>Accept</Text></>)}
            </Pressable>
          </View>
        ) : null}

        {!isQueue ? (
          <View style={{ gap: 8 }}>
            {arrivalEligible ? (
              <View style={styles.btnRow}>
                <Pressable onPress={() => onArrival(job)} disabled={busy} style={({ pressed }) => [styles.primaryBlue, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Mark arrival">
                  {busy ? <ActivityIndicator color={colors.onAccent} size="small" /> : (<><Ionicons name="location" size={15} color={colors.onAccent} /><Text style={styles.primaryBlueText}>Mark Arrival</Text></>)}
                </Pressable>
                <Pressable onPress={() => onNoShow(job)} disabled={busy} style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Report no-show">
                  <Text style={styles.declineText}>No-Show</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.btnRow}>
              <Pressable onPress={() => onMessage(job)} style={({ pressed }) => [styles.messageBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Message customer">
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.gray700} />
                <Text style={styles.messageText}>Message</Text>
              </Pressable>
              {startEligible ? (
                <Pressable onPress={() => onStart(job)} disabled={busy} style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Start repair">
                  {busy ? <ActivityIndicator color={colors.onAccent} size="small" /> : (<><Ionicons name="flash-outline" size={16} color={colors.onAccent} /><Text style={styles.startText}>Start Repair</Text></>)}
                </Pressable>
              ) : null}
            </View>
            {isInProgress ? (
              <Pressable onPress={() => onComplete(job)} style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel="Mark as completed">
                <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                <Text style={styles.completeText}>Mark as Completed</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles({
  screen: { flex: 1, backgroundColor: colors.canvas },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  backTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.semiBold },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 16 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, ...shadows.card },
  cardTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 12 },
  jobHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobIconTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center' },
  jobTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, letterSpacing: -0.2 },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.badgeBlueBorder, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  brandChipText: { color: BLUE, fontSize: 11, fontFamily: fonts.bold, flexShrink: 1 },
  jobCode: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  descBox: { backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 14, padding: 14, marginTop: 14 },
  descLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1, marginBottom: 5 },
  descText: { color: colors.ink, fontSize: 13, fontFamily: fonts.regular, lineHeight: 20 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hudBorder },
  avatarText: { color: colors.techDark, fontSize: 18, fontFamily: fonts.bold },
  customerName: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  customerMeta: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  infoText: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.regular },
  mapPlaceholder: { backgroundColor: colors.surfaceSunken, borderRadius: 12, height: 112, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.lineSoft },
  mapPlaceholderText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  mapAddressBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  mapAddressText: { flex: 1, color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  navigateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 12, minHeight: 44, marginTop: 8, ...shadows.card },
  navigateText: { color: colors.onAccent, fontSize: 13, fontFamily: fonts.bold },
  navigateBtnSystem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.badgeBlueBorder, borderRadius: 12, minHeight: 44, marginTop: 8 },
  navigateTextSystem: { color: colors.tech, fontSize: 13, fontFamily: fonts.bold },
  btnRow: { flexDirection: 'row', gap: 8 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.danger + '40', borderRadius: 14, minHeight: 48, backgroundColor: colors.white },
  declineText: { color: colors.danger, fontSize: 14, fontFamily: fonts.bold },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.tech, borderRadius: 14, minHeight: 48, ...shadows.card },
  acceptText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  messageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, minHeight: 48 },
  messageText: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  startBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.tech, borderRadius: 14, minHeight: 48, ...shadows.card },
  startText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  primaryBlue: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.tech, borderRadius: 14, minHeight: 48, ...shadows.card },
  primaryBlueText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tech, borderRadius: 14, minHeight: 48, ...shadows.card },
  completeText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
});
