// Prototype TechJobDetail: pay card, customer card, live mini map, action rows.
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { rateCustomer, reportScam } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { PhotoThumb } from '../../components/RequestPhoto';
import TechnicianLocationMap from '../../components/TechnicianLocationMap';
import { colors, fonts, shadows, themedStyles } from '../../theme';
import { getApplianceIcon } from '../../utils/applianceIcons';
import { splitJobDescription } from '../../utils/jobDescription';
import {
  formatJobSchedule,
  canMarkArrival,
  canStartRepair,
  hasPhotoWarning,
  hasSafetyWarning,
  safetyWarningText,
  type JobItem,
} from './availableJobsHelpers';

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
  const isCompleted = String(job.status || '').toLowerCase() === 'completed';
  // UAT #11: rate the customer once per completed job. Stars + optional
  // comment, submitted to the same endpoint the tests cover.
  const [custStars, setCustStars] = useState(0);
  const [custComment, setCustComment] = useState('');
  const [custRatingBusy, setCustRatingBusy] = useState(false);
  const [custRatingSent, setCustRatingSent] = useState(false);
  const [custRatingError, setCustRatingError] = useState<string | null>(null);
  // UAT #8: report the customer as a scammer (files a logged incident).
  const [scamReason, setScamReason] = useState('');
  const [scamBusy, setScamBusy] = useState(false);
  const [scamSent, setScamSent] = useState(false);
  const [scamError, setScamError] = useState<string | null>(null);
  const submitCustomerRating = async (): Promise<void> => {
    if (!custStars || custRatingBusy || !job.technicianUid) return;
    setCustRatingBusy(true);
    setCustRatingError(null);
    try {
      await rateCustomer(String(job.id), String(job.technicianUid), custStars, custComment.trim() || undefined);
      setCustRatingSent(true);
    } catch (error) {
      const err = error as { error?: string; message?: string };
      setCustRatingError(err?.error || err?.message || 'Failed to submit rating.');
    } finally {
      setCustRatingBusy(false);
    }
  };
  const submitScamReport = async (): Promise<void> => {
    if (scamBusy) return;
    setScamBusy(true);
    setScamError(null);
    try {
      await reportScam(String(job.id), scamReason.trim());
      setScamSent(true);
    } catch (error) {
      const err = error as { error?: string; message?: string };
      setScamError(err?.error || err?.message || 'Failed to file the report.');
    } finally {
      setScamBusy(false);
    }
  };
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
          {hasPhotoWarning(job) ? (
            <View style={styles.photoRisk}>
              <Ionicons name="warning-outline" size={16} color={colors.warningText} />
              <Text style={styles.photoRiskText}>
                {job.photoNotes || 'This device photo may be fake or AI-generated. Verify it before travelling.'}
              </Text>
            </View>
          ) : null}
          {hasSafetyWarning(job) ? (
            <View style={styles.photoRisk}>
              <Ionicons name="location-outline" size={16} color={colors.warningText} />
              <Text style={styles.photoRiskText}>{safetyWarningText(job)}</Text>
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
            {isCompleted && !isQueue && !custRatingSent && (
              <View style={styles.rateCard}>
                <Text style={styles.rateTitle}>Rate this customer</Text>
                {job.customerProfile ? (
                  <View style={styles.custMeta}>
                    {job.customerProfile.verified ? (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="shield-checkmark" size={12} color={colors.tech} />
                        <Text style={styles.verifiedText}>ID Verified</Text>
                      </View>
                    ) : (
                      <View style={styles.unverifiedBadge}>
                        <Ionicons name="alert-circle-outline" size={12} color={colors.muted} />
                        <Text style={styles.unverifiedText}>Not ID verified</Text>
                      </View>
                    )}
                    {job.customerProfile.rating != null ? (
                      <Text style={styles.custStat}>
                        {Number(job.customerProfile.rating).toFixed(1)} ★ · {job.customerProfile.totalReviews ?? 0} reviews
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {job.customerProfile?.portfolio?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.custPortfolio}>
                    {job.customerProfile.portfolio.slice(0, 8).map((uri, index) => (
                      <Image
                        key={`${uri}-${index}`}
                        source={{ uri }}
                        style={styles.custPortfolioImage}
                        accessibilityLabel="Customer portfolio photo"
                      />
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.rateStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={star}
                      onPress={() => setCustStars(star)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${star} star${star === 1 ? '' : 's'}`}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={star <= custStars ? 'star' : 'star-outline'}
                        size={28}
                        color={star <= custStars ? colors.gold : colors.line}
                      />
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.rateInput}
                  placeholder="Comment (optional)"
                  placeholderTextColor={colors.muted}
                  value={custComment}
                  onChangeText={(value) => { setCustComment(value); if (custRatingError) setCustRatingError(null); }}
                  multiline
                />
                {custRatingError ? <Text style={styles.rateError}>{custRatingError}</Text> : null}
                <Pressable
                  onPress={() => { void submitCustomerRating(); }}
                  disabled={!custStars || custRatingBusy}
                  style={({ pressed }) => [styles.rateBtn, (!custStars || custRatingBusy) && styles.rateBtnDisabled, pressed && { opacity: 0.88 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Submit customer rating"
                >
                  {custRatingBusy
                    ? <ActivityIndicator color={colors.onAccent} size="small" />
                    : <Text style={styles.rateBtnText}>Submit Rating</Text>}
                </Pressable>
              </View>
            )}
            {isCompleted && !isQueue && custRatingSent && (
              <View style={styles.rateDone}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={styles.rateDoneText}>Customer rated. Thank you.</Text>
              </View>
            )}
            {(isCompleted || isInProgress) && !isQueue && !scamSent && (
              <View style={styles.rateCard}>
                <Text style={styles.rateTitle}>Report as scammer</Text>
                <TextInput
                  style={styles.rateInput}
                  placeholder="What happened? (optional)"
                  placeholderTextColor={colors.muted}
                  value={scamReason}
                  onChangeText={(value) => { setScamReason(value); if (scamError) setScamError(null); }}
                  multiline
                />
                {scamError ? <Text style={styles.rateError}>{scamError}</Text> : null}
                <Pressable
                  onPress={() => { void submitScamReport(); }}
                  disabled={scamBusy}
                  style={({ pressed }) => [styles.reportBtn, scamBusy && styles.rateBtnDisabled, pressed && { opacity: 0.88 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Report customer as scammer"
                >
                  {scamBusy
                    ? <ActivityIndicator color={colors.onAccent} size="small" />
                    : <Text style={styles.rateBtnText}>Report Scam</Text>}
                </Pressable>
              </View>
            )}
            {(isCompleted || isInProgress) && !isQueue && scamSent && (
              <View style={styles.rateDone}>
                <Ionicons name="flag" size={16} color={colors.danger} />
                <Text style={styles.rateDoneText}>Report filed. Our team will review it.</Text>
              </View>
            )}
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
  // UAT #11: technician rates the customer. Tokenized, 44px targets.
  rateCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
    marginTop: 4
  },
  rateTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  rateStars: { flexDirection: 'row', gap: 8 },
  rateInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.ink
  },
  rateError: { color: colors.danger, fontSize: 12, fontFamily: fonts.medium },
  rateBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.tech,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rateBtnDisabled: { opacity: 0.5 },
  rateBtnText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  rateDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 12,
    padding: 12
  },
  rateDoneText: { color: colors.successText, fontSize: 13, fontFamily: fonts.bold },
  reportBtn: { minHeight: 48, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  // UAT #6: fake-photo warning chip.
  photoRisk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  photoRiskText: { flex: 1, color: colors.warningText, fontSize: 12, fontFamily: fonts.medium },
  // UAT #11: verified badge + portfolio on the customer rating card.
  custMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.badgeBlueBorder,
  },
  verifiedText: { color: colors.tech, fontSize: 11, fontFamily: fonts.bold },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  unverifiedText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  custStat: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  custPortfolio: { gap: 8, paddingVertical: 2 },
  custPortfolioImage: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.canvas },
});
