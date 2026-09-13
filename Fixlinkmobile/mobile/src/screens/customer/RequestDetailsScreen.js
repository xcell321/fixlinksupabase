import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchTechnicianProfile } from '../services/api';
import { fonts } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon, getStatusGuidance, STEPS } from '../../utils/applianceIcons';

const colors = { ink: '#102A43', teal: '#0F766E', tealLight: '#E6F6F3', green: '#059669', canvas: '#F5F8FA', white: '#FFFFFF', muted: '#5A7A91', line: '#D9E2EC', error: '#E53935', blue: '#2563EB', amber: '#D97706' };

export default function RequestDetailsScreen({ request, onBack, onMessageTechnician, onTrackMap }) {
  const [techProfile, setTechProfile] = useState(null);

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
  const guidance = getStatusGuidance(status);
  const isAccepted = ['accepted', 'in progress'].includes(statusKey);
  const isCancelled = statusKey === 'cancelled';
  const isCompleted = statusKey === 'completed';

  const currentStep = isCancelled ? 0 : isCompleted ? 4 : statusKey === 'in progress' ? 3 : statusKey === 'accepted' ? 2 : 1;

  // Technician rating data
  const reviews = Array.isArray(techProfile?.reviews) && techProfile.reviews.length > 0 ? techProfile.reviews : null;
  const reviewCount = reviews
    ? reviews.length
    : (techProfile?.totalReviews != null && Number(techProfile.totalReviews) > 0 ? Number(techProfile.totalReviews)
      : (request?.technicianTotalReviews != null && Number(request.technicianTotalReviews) > 0 ? Number(request.technicianTotalReviews) : 0));
  const hasReviews = reviewCount > 0;

  const averageRating = hasReviews
    ? (techProfile?.averageRating != null && Number(techProfile.averageRating) > 0
        ? Number(techProfile.averageRating)
        : (request?.technicianRating != null ? Number(request.technicianRating) : 0))
    : null;

  const distribution = reviews
    ? [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: reviews.filter((r) => Number(r.rating) === star).length,
        percent: Math.round((reviews.filter((r) => Number(r.rating) === star).length / reviews.length) * 100),
      }))
    : [];

  const scheduleText = request.preferredDate && request.preferredTime
    ? `${request.preferredDate} • ${request.preferredTime}`
    : request.preferredTime || request.preferredDate || (request.scheduledDate
        ? `${new Date(request.scheduledDate).toLocaleDateString()} at ${new Date(request.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Not set');

  const activityRows = [
    request.createdAt && { icon: 'paper-plane-outline', label: 'Submitted', date: new Date(request.createdAt).toLocaleDateString() },
    request.acceptedAt && { icon: 'hand-left-outline', label: 'Accepted', date: new Date(request.acceptedAt).toLocaleDateString() },
    request.completedAt && { icon: 'checkmark-done-outline', label: 'Completed', date: new Date(request.completedAt).toLocaleDateString() },
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButtonContainer} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>REQUEST DETAILS</Text>
        <View style={[styles.navPill, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
          <Ionicons name={getStatusIcon(status)} size={11} color={statusColor} />
          <Text style={[styles.navPillText, { color: statusColor }]}>{status}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Hero */}
        <View style={styles.heroCard}>
          <View style={[styles.heroIcon, { backgroundColor: statusColor + '15' }]}>
            <Ionicons name={getApplianceIcon(request.applianceType)} size={30} color={statusColor} />
          </View>
          <Text style={styles.heroKicker}>CURRENT STATUS</Text>
          <Text style={[styles.heroStatus, { color: statusColor }]}>{status}</Text>

          {isCancelled ? (
            <View style={styles.cancelledBanner}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
              <Text style={styles.cancelledText}>This request was cancelled.</Text>
            </View>
          ) : (
            <View style={styles.stepper}>
              {STEPS.map((label, idx) => {
                const n = idx + 1;
                const reached = n <= currentStep;
                const active = n === currentStep;
                return (
                  <View key={label} style={styles.stepItem}>
                    <View style={styles.stepTop}>
                      <View style={[styles.dot, reached ? (active ? styles.dotActive : styles.dotDone) : styles.dotIdle]}>
                        {reached && !active ? (
                          <Ionicons name="checkmark" size={11} color={colors.white} />
                        ) : (
                          <Text style={[styles.dotText, reached && styles.dotTextActive]}>{n}</Text>
                        )}
                      </View>
                      {idx < STEPS.length - 1 && <View style={[styles.link, n < currentStep && styles.linkDone]} />}
                    </View>
                    <Text style={[styles.stepLabel, reached && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={[styles.guidanceBanner, { backgroundColor: statusColor + '12', borderColor: statusColor + '38' }]}>
            <Ionicons name={getStatusIcon(status)} size={16} color={statusColor} style={styles.guidanceIcon} />
            <View style={styles.guidanceCopy}>
              <Text style={[styles.guidanceKicker, { color: statusColor }]}>WHAT HAPPENS NEXT</Text>
              <Text style={styles.guidanceTitle}>{guidance.title}</Text>
              <Text style={styles.guidanceBody}>{guidance.body}</Text>
            </View>
          </View>
        </View>

        {/* Activity mini-list */}
        {activityRows.length > 0 && (
          <View style={styles.activityCard}>
            {activityRows.map((row) => (
              <View key={row.label} style={styles.activityRow}>
                <Ionicons name={row.icon} size={15} color={colors.teal} />
                <Text style={styles.activityLabel}>{row.label}</Text>
                <Text style={styles.activityDate}>{row.date}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Appliance */}
        <View style={styles.card}>
          <Text style={styles.cardKicker}>APPLIANCE</Text>
          <Text style={styles.cardTitle}>{request.applianceType}</Text>
          {request.category ? <Text style={styles.cardSub}>{request.category}</Text> : null}
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>PROBLEM DESCRIPTION</Text>
          <Text style={styles.fieldText}>{request.description || 'No description provided'}</Text>
        </View>

        {/* Schedule & Location */}
        <View style={styles.card}>
          <Text style={styles.cardKicker}>SCHEDULE &amp; LOCATION</Text>
          <View style={styles.iconRow}>
            <View style={styles.iconBubble}>
              <Ionicons name="calendar-outline" size={18} color={colors.teal} />
            </View>
            <View style={styles.iconRowCopy}>
              <Text style={styles.rowLabel}>Preferred schedule</Text>
              <Text style={styles.rowValue}>{scheduleText}</Text>
            </View>
          </View>
          <View style={styles.iconRow}>
            <View style={styles.iconBubble}>
              <Ionicons name="location-outline" size={18} color={colors.teal} />
            </View>
            <View style={styles.iconRowCopy}>
              <Text style={styles.rowLabel}>Service location</Text>
              <Text style={styles.rowValue}>{request.location || 'No location provided'}</Text>
            </View>
          </View>
        </View>

        {/* Technician */}
        {request.technicianName && (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>ASSIGNED TO</Text>
            <View style={styles.techRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{request.technicianName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.techCopy}>
                <Text style={styles.techName}>{request.technicianName}</Text>
                <View style={styles.verifiedRow}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                  <Text style={styles.verified}>Verified Technician</Text>
                </View>
              </View>
            </View>

            {/* Rating block */}
            {hasReviews ? (
              <View style={styles.ratingBlock}>
                <View style={styles.ratingHeader}>
                  <Text style={styles.ratingBig}>{averageRating != null ? Number(averageRating).toFixed(1) : '—'}</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Text key={s} style={[styles.starGlyph, averageRating != null && Math.round(Number(averageRating)) >= s && styles.starGlyphActive]}>★</Text>
                    ))}
                  </View>
                  <Text style={styles.ratingCount}>based on {reviewCount} reviews</Text>
                </View>

                {distribution.length > 0 && (
                  <View style={styles.bars}>
                    {distribution.map((d) => (
                      <View key={d.star} style={styles.barRow}>
                        <Text style={styles.barLabel}>{d.star}★</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${d.percent}%` }]} />
                        </View>
                        <Text style={styles.barValue}>{d.percent}%</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.noReviewRow}>
                <Ionicons name="star-outline" size={16} color={colors.muted} />
                <Text style={styles.noReviewText}>Not yet reviewed</Text>
              </View>
            )}

            {/* Completion code */}
            {isAccepted && request.verificationCode && (
              <View style={styles.codeCard}>
                <View style={styles.codeCardHeader}>
                  <Ionicons name="key-outline" size={18} color={colors.teal} />
                  <Text style={styles.codeCardTitle}>Job Completion Code</Text>
                </View>
                <View style={styles.codeDigitsRow}>
                  {String(request.verificationCode).split('').map((digit, idx) => (
                    <View key={idx} style={styles.codeDigitBox}>
                      <Text style={styles.codeDigitText}>{digit}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.codeCardSub}>
                  Provide this 4-digit code to the technician ONLY after they finish repairing your device.
                </Text>
              </View>
            )}

            {/* Actions */}
            {isAccepted && onTrackMap && (
              <TouchableOpacity style={styles.trackMapButton} onPress={() => onTrackMap(request)} activeOpacity={0.88}>
                <Ionicons name="map" size={18} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Track Technician on Live Map</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.messageButton} onPress={onMessageTechnician} activeOpacity={0.88}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.ink} style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Message Technician</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tracking privacy notice */}
        {!isAccepted && !isCompleted && (
          <View style={styles.noticeCard}>
            <Ionicons name="shield-outline" size={20} color={colors.teal} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Location Tracking Privacy</Text>
              <Text style={styles.noticeText}>
                You and the technician can locate each other once a technician accepts your request.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white },
  backButtonContainer: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 76 },
  backButton: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  navTitle: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.bold },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1, width: 76, justifyContent: 'center' },
  navPillText: { fontSize: 11, fontFamily: fonts.bold },

  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 32 },

  heroCard: { backgroundColor: colors.white, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.line, marginBottom: 14, shadowColor: '#102A43', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  heroIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 4 },
  heroStatus: { fontSize: 26, fontFamily: fonts.extraBold, marginBottom: 18 },
  cancelledBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },

  guidanceBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, backgroundColor: colors.canvas },
  guidanceIcon: { marginTop: 1 },
  guidanceCopy: { flex: 1 },
  guidanceKicker: { fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold, marginBottom: 3 },
  guidanceTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 3 },
  guidanceBody: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  cancelledText: { color: '#B91C1C', fontSize: 13, fontFamily: fonts.semiBold },

  stepper: { width: '100%', flexDirection: 'row', marginTop: 4 },
  stepItem: { flex: 1, alignItems: 'center' },
  stepTop: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 6 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderWidth: 1.5, borderColor: colors.line },
  dotDone: { backgroundColor: colors.green, borderColor: colors.green },
  dotActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  dotIdle: { backgroundColor: colors.canvas },
  dotText: { fontSize: 11, fontFamily: fonts.bold, color: colors.muted },
  dotTextActive: { color: colors.white },
  link: { flex: 1, height: 2, backgroundColor: colors.line, marginHorizontal: 4 },
  linkDone: { backgroundColor: colors.green },
  stepLabel: { marginTop: 6, fontSize: 9, color: colors.muted, fontFamily: fonts.semiBold },
  stepLabelActive: { color: colors.teal },

  activityCard: { backgroundColor: colors.white, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  activityLabel: { flex: 1, color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  activityDate: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },

  card: { backgroundColor: colors.white, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.line, marginBottom: 14, shadowColor: '#102A43', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  cardKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 6 },
  cardTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink },
  cardSub: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  fieldLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.bold, marginBottom: 6 },
  fieldText: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, lineHeight: 21 },

  iconRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  iconBubble: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  iconRowCopy: { flex: 1 },
  rowLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, marginBottom: 2 },
  rowValue: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, lineHeight: 20 },

  techRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 21, fontFamily: fonts.extraBold },
  techCopy: { flex: 1 },
  techName: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  verified: { fontSize: 12, color: colors.green, fontFamily: fonts.semiBold },

  ratingBlock: { backgroundColor: colors.canvas, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  ratingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  ratingBig: { fontSize: 30, fontFamily: fonts.extraBold, color: colors.ink },
  starsRow: { flexDirection: 'row', gap: 1 },
  starGlyph: { fontSize: 15, color: colors.line, fontFamily: fonts.regular },
  starGlyphActive: { color: '#F59E0B' },
  ratingCount: { flex: 1, color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  bars: { gap: 7 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 22, fontSize: 11, color: colors.ink, fontFamily: fonts.semiBold },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4, backgroundColor: '#F59E0B' },
  barValue: { width: 34, textAlign: 'right', fontSize: 11, color: colors.muted, fontFamily: fonts.semiBold },
  noReviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 14 },
  noReviewText: { color: colors.muted, fontSize: 13, fontFamily: fonts.semiBold },

  codeCard: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center', gap: 10, marginBottom: 14 },
  codeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeCardTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.green, letterSpacing: 0.5 },
  codeDigitsRow: { flexDirection: 'row', gap: 10 },
  codeDigitBox: { width: 44, height: 48, borderRadius: 12, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  codeDigitText: { fontSize: 24, fontFamily: fonts.extraBold, color: colors.ink },
  codeCardSub: { fontSize: 11, color: '#065F46', textAlign: 'center', lineHeight: 15, fontFamily: fonts.medium },

  trackMapButton: { backgroundColor: colors.teal, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowColor: colors.teal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.5 },
  messageButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },

  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tealLight, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#B2E2D8' },
  noticeTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.teal, marginBottom: 2 },
  noticeText: { fontSize: 12, color: colors.ink, lineHeight: 17, fontFamily: fonts.regular },
});