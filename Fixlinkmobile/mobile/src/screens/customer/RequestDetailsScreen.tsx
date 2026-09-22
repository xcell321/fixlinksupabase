// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, StatusBar, Alert, ActivityIndicator, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { confirmRepairRequest, fetchTechnicianProfile, markCustomerReady } from '../services/api';
import { PhotoLightbox } from '../../components/RequestPhoto';
import { colors, fonts } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon, getStatusGuidance } from '../../utils/applianceIcons';

// Six-step workflow, using exact request status names (no renames, no abbreviations).
const FULL_STEPS = ['Pending', 'Accepted', 'Confirmed', 'Customer Ready', 'In Progress', 'Completed'] as const;

// Accepted = technician has accepted (hand), Confirmed = customer has confirmed (check).
// Shared utils keep both as 'hand-left'; this detail-screen mapping makes the pair
// visually distinct with existing Ionicons only. All other statuses defer to utils.
const detailStatusIcon = (status: unknown): string => {
  const key = String(status ?? '').toLowerCase();
  if (key === 'accepted') return 'hand-left';
  if (key === 'confirmed') return 'checkmark-circle';
  return getStatusIcon(status);
};

// Show date AND time only when a real timestamp already exists; otherwise return
// null so the caller gracefully omits the line instead of inventing data.
const formatHistoryDateTime = (iso: unknown): string | null => {
  if (!iso) return null;
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} • ${time}`;
};

export default function RequestDetailsScreen({ request, onBack, onMessageTechnician, onTrackMap }) {
  const [techProfile, setTechProfile] = useState(null);
  const [workflowLoading, setWorkflowLoading] = useState(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);

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
  const detailIcon = detailStatusIcon(status);
  const isAccepted = statusKey === 'accepted';
  const isConfirmed = statusKey === 'confirmed';
  const isReady = statusKey === 'customer ready';
  const isInProgress = statusKey === 'in progress';
  const isActive = isAccepted || isConfirmed || isReady || isInProgress;
  const isCancelled = statusKey === 'cancelled';
  const isNoShow = statusKey === 'no-show' || statusKey === 'no show';
  const isTerminal = isCancelled || isNoShow;
  const isCompleted = statusKey === 'completed';

  const currentStep = isCancelled || isNoShow
    ? 0
    : isCompleted
      ? 6
      : isInProgress
        ? 5
        : isReady
          ? 4
          : isConfirmed
            ? 3
            : isAccepted
              ? 2
              : 1;

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

  const handleConfirmRepair = () => {
    Alert.alert('Confirm repair?', 'This confirms you need the repair and will be at the service location.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setWorkflowLoading('confirm');
        try {
          await confirmRepairRequest(request.id);
          onBack?.();
        } catch (error) {
          Alert.alert('Unable to confirm', error?.error || 'Please try again.');
        } finally {
          setWorkflowLoading(null);
        }
      } },
    ]);
  };

  const handleMarkReady = () => {
    Alert.alert('Mark ready?', 'Confirm that someone will be at the service location to meet the technician.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Ready', onPress: async () => {
        setWorkflowLoading('ready');
        try {
          await markCustomerReady(request.id);
          onBack?.();
        } catch (error) {
          Alert.alert('Unable to mark ready', error?.error || 'Please try again.');
        } finally {
          setWorkflowLoading(null);
        }
      } },
    ]);
  };

  // Single coherent history rail: chronological, status dots, date AND time only
  // from timestamps that already exist. Steps without a stored timestamp (Confirmed,
  // Customer Ready) appear when reached, with the time line gracefully omitted.
  const historyEvents = (() => {
    const events = [];
    const reached = (n: number) => currentStep >= n;
    events.push({
      key: 'pending',
      label: 'Pending',
      detail: 'Request submitted',
      timestamp: request.createdAt ?? null,
      color: getStatusColor('Pending'),
      icon: detailStatusIcon('Pending'),
    });
    if (reached(2) || request.acceptedAt) {
      events.push({
        key: 'accepted',
        label: 'Accepted',
        detail: 'Technician accepted the request',
        timestamp: request.acceptedAt ?? null,
        color: getStatusColor('Accepted'),
        icon: detailStatusIcon('Accepted'),
      });
    }
    if (reached(3)) {
      events.push({
        key: 'confirmed',
        label: 'Confirmed',
        detail: 'You confirmed the repair',
        timestamp: null,
        color: getStatusColor('Confirmed'),
        icon: detailStatusIcon('Confirmed'),
      });
    }
    if (reached(4)) {
      events.push({
        key: 'ready',
        label: 'Customer Ready',
        detail: 'Service location marked ready',
        timestamp: null,
        color: getStatusColor('Customer Ready'),
        icon: detailStatusIcon('Customer Ready'),
      });
    }
    if (reached(5) || request.startedAt) {
      events.push({
        key: 'progress',
        label: 'In Progress',
        detail: 'Repair started',
        timestamp: request.startedAt ?? null,
        color: getStatusColor('In Progress'),
        icon: detailStatusIcon('In Progress'),
      });
    }
    if (isCompleted) {
      events.push({
        key: 'completed',
        label: 'Completed',
        detail: 'Job completed',
        timestamp: request.completedAt ?? null,
        color: getStatusColor('Completed'),
        icon: detailStatusIcon('Completed'),
      });
    }
    if (isCancelled) {
      events.push({
        key: 'cancelled',
        label: 'Cancelled',
        detail: 'Request cancelled',
        timestamp: request.cancelledAt ?? null,
        color: getStatusColor('Cancelled'),
        icon: detailStatusIcon('Cancelled'),
      });
    }
    if (isNoShow) {
      events.push({
        key: 'noshow',
        label: 'No-Show',
        detail: 'No one was at the service location',
        timestamp: null,
        color: getStatusColor('No-Show'),
        icon: detailStatusIcon('No-Show'),
      });
    }
    return events;
  })();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />

      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backButtonContainer}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1} ellipsizeMode="tail">REQUEST DETAILS</Text>
        <View style={[styles.navPill, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
          <Ionicons name={detailIcon} size={11} color={statusColor} />
          <Text style={[styles.navPillText, { color: statusColor }]} numberOfLines={1} ellipsizeMode="tail">{status}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1 — Current status: single compact header, no triple repetition */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeaderRow}>
            <View
              style={[
                styles.statusTile,
                isAccepted
                  ? styles.statusTileOutlined
                  : styles.statusTileFilled,
                (isAccepted || isConfirmed)
                  ? { borderColor: statusColor, backgroundColor: isAccepted ? colors.white : statusColor }
                  : { borderColor: statusColor + '30', backgroundColor: statusColor + '16' },
              ]}
            >
              <Ionicons
                name={detailIcon}
                size={22}
                color={isAccepted ? statusColor : (isConfirmed ? colors.white : statusColor)}
              />
            </View>
            <View style={styles.statusHeaderCopy}>
              {!isTerminal ? (
                <Text style={styles.stepKicker}>STEP {currentStep} OF 6</Text>
              ) : (
                <Text style={styles.stepKicker}>{isCancelled ? 'CLOSED' : 'ATTENTION NEEDED'}</Text>
              )}
              <Text style={[styles.statusName, { color: statusColor }]} numberOfLines={2}>{status}</Text>
            </View>
          </View>

          {isTerminal ? (
            <View style={[styles.terminalBanner, isCancelled ? styles.terminalCancelled : styles.terminalNoShow]}>
              <Ionicons
                name={isCancelled ? 'close-circle' : 'alert-circle'}
                size={18}
                color={isCancelled ? colors.error : colors.danger}
              />
              <Text style={styles.terminalText}>
                {isCancelled ? 'This request was cancelled.' : 'No-show reported. No one was at the service location.'}
              </Text>
            </View>
          ) : (
            <View
              style={styles.progressRail}
              accessibilityRole="text"
              accessibilityLabel={`Step ${currentStep} of 6, ${status}`}
            >
              <View style={styles.progressDots}>
                {FULL_STEPS.map((label, idx) => {
                  const n = idx + 1;
                  const done = n < currentStep;
                  const active = n === currentStep;
                  const upcoming = n > currentStep;
                  return (
                    <View key={label} style={styles.progressStep} accessible={false}>
                      <View style={styles.progressTrack}>
                        {idx > 0 && (
                          <View style={[styles.progressLine, n <= currentStep && { backgroundColor: statusColor }]} />
                        )}
                        <View
                          accessibilityLabel={`${label}${active ? ', current step' : done ? ', done' : ''}`}
                          style={[
                            styles.progressDot,
                            done && { backgroundColor: statusColor, borderColor: statusColor },
                            active && { backgroundColor: statusColor, borderColor: statusColor },
                            upcoming && styles.progressDotUpcoming,
                          ]}
                        >
                          {done ? (
                            <Ionicons name="checkmark" size={10} color={colors.white} />
                          ) : active ? (
                            <Text style={styles.progressDotNumber}>{n}</Text>
                          ) : null}
                        </View>
                        {idx < FULL_STEPS.length - 1 && (
                          <View style={[styles.progressLine, n < currentStep && { backgroundColor: statusColor }]} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {!isTerminal && (
            <View
              style={[
                styles.guidanceBlock,
                isAccepted
                  ? styles.guidanceOutlined
                  : styles.guidanceFilled,
                { borderColor: statusColor + '38', backgroundColor: isAccepted ? colors.white : statusColor + '12' },
              ]}
            >
              <Ionicons
                name={detailIcon}
                size={16}
                color={statusColor}
                style={styles.guidanceIcon}
              />
              <View style={styles.guidanceCopy}>
                <Text style={styles.guidanceTitle}>{guidance.title}</Text>
                <Text style={styles.guidanceBody}>{guidance.body}</Text>
              </View>
            </View>
          )}
        </View>

        {/* 2 — History: single coherent rail matching the progress above */}
        {historyEvents.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.cardKicker}>HISTORY</Text>
            {historyEvents.map((event, idx) => {
              const dateTime = formatHistoryDateTime(event.timestamp);
              const last = idx === historyEvents.length - 1;
              return (
                <View key={event.key} style={styles.historyRow}>
                  <View style={styles.historyRail}>
                    <View style={[styles.historyDot, { backgroundColor: event.color + '14', borderColor: event.color + '30' }]}>
                      <Ionicons name={event.icon} size={13} color={event.color} />
                    </View>
                    {!last && <View style={styles.historyLine} />}
                  </View>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyLabel}>{event.label}</Text>
                    <Text style={styles.historyDetail}>{event.detail}</Text>
                    {dateTime ? <Text style={styles.historyDateTime}>{dateTime}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 3 — Request information */}
        <View style={styles.card}>
          <Text style={styles.cardKicker}>APPLIANCE</Text>
          <View style={styles.applianceHeader}>
            <View style={styles.applianceTile}>
              <Ionicons name={getApplianceIcon(request.applianceType)} size={22} color={colors.ink} />
            </View>
            <View style={styles.applianceCopy}>
              <Text style={styles.cardTitle} numberOfLines={2}>{request.applianceType}</Text>
              {request.category ? <Text style={styles.cardSub} numberOfLines={1}>{request.category}</Text> : null}
            </View>
          </View>
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>PROBLEM DESCRIPTION</Text>
          <Text style={styles.fieldText}>{request.description || 'No description provided'}</Text>

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>ATTACHED PHOTO</Text>
          {request.photoUrl ? (
            <TouchableOpacity style={styles.photoWrap} onPress={() => setPhotoViewerVisible(true)} activeOpacity={0.85}>
              <Image source={{ uri: request.photoUrl }} style={styles.photoImage} resizeMode="cover" />
              <View style={styles.photoHintRow}>
                <Ionicons name="expand-outline" size={14} color={colors.teal} />
                <Text style={styles.photoHintText}>Tap to view full size</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.photoEmpty}>
              <Ionicons name="image-outline" size={16} color={colors.muted} />
              <Text style={styles.photoEmptyText}>No photo attached to this request.</Text>
            </View>
          )}
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

        {/* 4 — Primary action + supporting technician details */}
        {request.technicianName && (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>ASSIGNED TO</Text>
            <View style={styles.techRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{request.technicianName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.techCopy}>
                <Text style={styles.techName} numberOfLines={1}>{request.technicianName}</Text>
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

            {/* Completion code — tap to copy for easy pasting/sharing on device */}
            {(isConfirmed || isReady || isInProgress) && request.verificationCode && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Completion code ${request.verificationCode}, tap to copy`}
                accessibilityHint="Copies the 4-digit code to clipboard"
                onPress={async () => {
                  try {
                    await Clipboard.setStringAsync(String(request.verificationCode));
                    Alert.alert('Copied', 'Completion code copied to clipboard.');
                  } catch {}
                }}
                style={({ pressed }) => [styles.codeCard, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.codeCardHeader}>
                  <Ionicons name="key-outline" size={18} color={colors.teal} />
                  <Text style={styles.codeCardTitle}>Job Completion Code</Text>
                  <View style={styles.copyPill}>
                    <Ionicons name="copy-outline" size={12} color={colors.teal} />
                    <Text style={styles.copyPillText}>Tap to copy</Text>
                  </View>
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
              </Pressable>
            )}

            {/* Confirm / Ready action buttons */}
            {isAccepted && (
              <TouchableOpacity
                style={[styles.trackMapButton, { marginBottom: 10 }]}
                onPress={handleConfirmRepair}
                disabled={workflowLoading === 'confirm'}
                activeOpacity={0.88}
              >
                {workflowLoading === 'confirm'
                  ? <ActivityIndicator color={colors.white} />
                  : (
                      <Text style={styles.primaryButtonText}>Confirm Repair</Text>
                  )}
              </TouchableOpacity>
            )}
            {isConfirmed && (
              <TouchableOpacity
                style={[styles.trackMapButton, { marginBottom: 10 }]}
                onPress={handleMarkReady}
                disabled={workflowLoading === 'ready'}
                activeOpacity={0.88}
              >
                {workflowLoading === 'ready'
                  ? <ActivityIndicator color={colors.white} />
                  : (
                      <Text style={styles.primaryButtonText}>I'm Ready for the Technician</Text>
                  )}
              </TouchableOpacity>
            )}

            {/* Actions */}
            {isActive && onTrackMap && (
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
        {!isActive && !isCompleted && !isTerminal && (
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

      <PhotoLightbox
        visible={photoViewerVisible}
        photoUrl={request.photoUrl}
        title="Problem photo"
        subtitle="Attached to this request"
        onClose={() => setPhotoViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white, gap: 8 },
  backButtonContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 44, justifyContent: 'center' },
  backButton: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  navTitle: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.bold, flexShrink: 1 },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 1, maxWidth: 140, minHeight: 28 },
  navPillText: { fontSize: 11, fontFamily: fonts.bold, flexShrink: 1 },

  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },

  statusCard: { backgroundColor: colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14, boxShadow: '0 6px 14px rgba(16,42,67,0.06)', elevation: 3 },
  statusHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  statusTileOutlined: { backgroundColor: colors.white },
  statusTileFilled: {},
  statusHeaderCopy: { flex: 1, flexShrink: 1, gap: 2 },
  stepKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  statusName: { fontSize: 20, fontFamily: fonts.extraBold, lineHeight: 24, letterSpacing: -0.3 },

  terminalBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  terminalCancelled: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  terminalNoShow: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  terminalText: { flex: 1, flexShrink: 1, color: '#B91C1C', fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 18 },

  progressRail: { marginTop: 14 },
  progressDots: { flexDirection: 'row' },
  progressStep: { flex: 1, alignItems: 'center' },
  progressTrack: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  progressDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, flexShrink: 0 },
  progressDotUpcoming: { backgroundColor: colors.white, borderColor: colors.line },
  progressDotNumber: { fontSize: 10, fontFamily: fonts.bold, color: colors.white, fontVariant: ['tabular-nums'] },
  progressLine: { flex: 1, height: 2, backgroundColor: colors.line, marginHorizontal: 3, borderRadius: 1 },

  guidanceBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  guidanceOutlined: {},
  guidanceFilled: {},
  guidanceIcon: { marginTop: 1, flexShrink: 0 },
  guidanceCopy: { flex: 1, flexShrink: 1 },
  guidanceTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 3, lineHeight: 18 },
  guidanceBody: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },

  historyCard: { backgroundColor: colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14, boxShadow: '0 6px 14px rgba(16,42,67,0.06)', elevation: 3 },
  historyRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  historyRail: { alignItems: 'center', flexShrink: 0 },
  historyDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  historyLine: { width: 2, flex: 1, minHeight: 12, backgroundColor: colors.lineSoft, borderRadius: 1, marginTop: 4 },
  historyCopy: { flex: 1, flexShrink: 1, paddingBottom: 4 },
  historyLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  historyDetail: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 1, lineHeight: 16 },
  historyDateTime: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 3, fontVariant: ['tabular-nums'] },

  card: { backgroundColor: colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 14, boxShadow: '0 6px 14px rgba(16,42,67,0.06)', elevation: 3 },
  cardKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 10 },
  applianceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  applianceTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  applianceCopy: { flex: 1, flexShrink: 1 },
  cardTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink, lineHeight: 22, letterSpacing: -0.2 },
  cardSub: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  fieldLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 6 },
  fieldText: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, lineHeight: 21 },

  photoWrap: { marginTop: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 8 },
  photoImage: { width: '100%', height: 190, borderRadius: 12, backgroundColor: colors.line },
  photoHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  photoHintText: { color: colors.teal, fontSize: 12, fontFamily: fonts.semiBold },
  photoEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginTop: 8 },
  photoEmptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, flexShrink: 1 },

  iconRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  iconBubble: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconRowCopy: { flex: 1, flexShrink: 1 },
  rowLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, marginBottom: 2 },
  rowValue: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, lineHeight: 20 },

  techRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: colors.white, fontSize: 21, fontFamily: fonts.extraBold },
  techCopy: { flex: 1, flexShrink: 1 },
  techName: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  verified: { fontSize: 12, color: colors.green, fontFamily: fonts.semiBold },

  ratingBlock: { backgroundColor: colors.canvas, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  ratingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  ratingBig: { fontSize: 30, fontFamily: fonts.extraBold, color: colors.ink, fontVariant: ['tabular-nums'] },
  starsRow: { flexDirection: 'row', gap: 1 },
  starGlyph: { fontSize: 15, color: colors.line, fontFamily: fonts.regular },
  starGlyphActive: { color: '#F59E0B' },
  ratingCount: { flex: 1, color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },
  bars: { gap: 7 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 22, fontSize: 11, color: colors.ink, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4, backgroundColor: '#F59E0B' },
  barValue: { width: 34, textAlign: 'right', fontSize: 11, color: colors.muted, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },
  noReviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 14 },
  noReviewText: { color: colors.muted, fontSize: 13, fontFamily: fonts.semiBold },

  codeCard: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center', gap: 10, marginBottom: 14 },
  codeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  codeCardTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.green, letterSpacing: 0.5 },
  copyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.white, borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  copyPillText: { fontSize: 10, fontFamily: fonts.bold, color: colors.teal, letterSpacing: 0.2 },
  codeDigitsRow: { flexDirection: 'row', gap: 10 },
  codeDigitBox: { width: 44, height: 48, borderRadius: 12, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.green, justifyContent: 'center', alignItems: 'center' },
  codeDigitText: { fontSize: 24, fontFamily: fonts.extraBold, color: colors.ink, fontVariant: ['tabular-nums'] },
  codeCardSub: { fontSize: 11, color: '#065F46', textAlign: 'center', lineHeight: 15, fontFamily: fonts.medium },

  trackMapButton: { backgroundColor: colors.teal, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10, paddingHorizontal: 18, boxShadow: '0 4px 8px rgba(15,118,110,0.25)', elevation: 4 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.5, flexShrink: 1, textAlign: 'center' },
  messageButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },

  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tealLight, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#B2E2D8' },
  noticeTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.teal, marginBottom: 2 },
  noticeText: { fontSize: 12, color: colors.ink, lineHeight: 17, fontFamily: fonts.regular },
});
