// Assigned-job work-order ticket: Accepted > Arrived > Repair > OTP stages.
// Ticket layout (status colour rail + perforated action stub) keeps a long
// job list scannable: the status of every card reads from the rail before a
// single word is read, and the stub groups only the actions.
import React from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon } from '../../../utils/applianceIcons';
import { splitJobDescription } from '../../../utils/jobDescription';
import { canMarkArrival, canStartRepair, formatJobSchedule, noShowState, type JobItem } from '../availableJobsHelpers';
import { styles } from './availableJobsStyles';
import type { IconName } from './types';

interface ActiveJobCardProps {
  job: JobItem;
  actionLoadingId: string | null;
  onArrival: (job: JobItem) => void;
  onStart: (job: JobItem) => void;
  onComplete: (job: JobItem) => void;
  onNoShow: (job: JobItem) => void;
  onOpenDetails: (job: JobItem) => void;
  onNavigateToMap?: (job: JobItem) => void;
  onNavigateToChat?: (job: JobItem) => void;
  onPreviewPhoto: (url: string | null) => void;
}

/** Short, speakable ticket reference for on-site confirmation and support. */
const ticketRefOf = (id?: string): string => {
  const cleaned = String(id ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned ? cleaned.slice(0, 6) : 'PENDING';
};

export const ActiveJobCard = ({
  job,
  actionLoadingId,
  onArrival,
  onStart,
  onComplete,
  onNoShow,
  onOpenDetails,
  onNavigateToMap,
  onNavigateToChat,
  onPreviewPhoto,
}: ActiveJobCardProps): React.JSX.Element => {
  const isInProgress = job.status === 'In Progress';
  const hasArrived = Boolean(job.technicianArrivalAt);
  const isArrivalEligible = canMarkArrival(job);
  // UAT #2: the no-show tile only becomes active once the technician has been
  // on site for the wait window; until then it shows the countdown.
  const noShow = noShowState(job);
  // "[Brand] words" -> show the words, and the brand only when it is all there is.
  const { brand: jobBrand, text: problemText } = splitJobDescription(job.description);
  const problemPreview = problemText || jobBrand || '';
  const isStartRepairEligible = canStartRepair(job);
  const statusColor = getStatusColor(job.status);

  return (
    <View key={job.id} style={styles.ticketCard}>
      {/* Clipping layer: lets the perforation notches cut through the card
          without cancelling the card shadow. */}
      <View style={styles.ticketClip}>
        <View style={[styles.ticketRail, { backgroundColor: statusColor }]} />

        <View style={styles.ticketBody}>
          {/* Ticket kicker: what this card is, and which job it is */}
          <View style={styles.ticketKickerRow}>
            <Text style={styles.ticketKicker}>WORK ORDER</Text>
            <Text style={styles.ticketRef} numberOfLines={1}>
              REF {ticketRefOf(job.id)}
            </Text>
          </View>

          {/* Identity: appliance, customer, and the photo angle when attached */}
          <View style={[styles.cardHeader, styles.ticketHeader]}>
            <View style={styles.applianceAvatar}>
              <Ionicons
                name={getApplianceIcon(job.applianceType) as IconName}
                size={20}
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
                      backgroundColor: statusColor + '15',
                      borderColor: statusColor + '40'
                    }
                  ]}
                >
                  <Ionicons
                    name={getStatusIcon(job.status) as IconName}
                    size={11}
                    color={statusColor}
                  />
                  <Text style={[styles.statusPillText, { color: statusColor }]}>
                    {job.status || 'Accepted'}
                  </Text>
                </View>
              </View>
              <View style={styles.ticketCustomerRow}>
                <Ionicons name="person-outline" size={11} color={colors.muted} />
                <Text style={styles.customerNameText} numberOfLines={1}>
                  {job.customerName || 'Verified Homeowner'}
                </Text>
              </View>
            </View>

            {job.photoUrl ? (
              <Pressable
                style={({ pressed }) => [styles.ticketPhoto, pressed && styles.utilityActionPressed]}
                onPress={() => onPreviewPhoto(job.photoUrl ?? null)}
                accessibilityRole="button"
                accessibilityLabel="View customer photo of the appliance"
              >
                <Image source={{ uri: job.photoUrl }} style={styles.ticketPhotoImage} />
                <View style={styles.ticketPhotoScrim} />
                <Ionicons
                  name="expand-outline"
                  size={11}
                  color={colors.onAccent}
                  style={styles.ticketPhotoBadge}
                />
              </Pressable>
            ) : null}
          </View>

          {/* Stage Stepper Progress */}
          <View style={styles.stepperContainer}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, styles.stepCircleDone]}>
                <Ionicons name="checkmark" size={10} color={colors.onAccent} />
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

          {/* Site, schedule, issue: flat rows so nothing competes with the CTA */}
          <View style={styles.ticketMeta}>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={13} color={colors.tech} />
              <Text style={styles.detailText} numberOfLines={1}>
                {job.location || 'Bogo City, Cebu'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.techDark} />
              <Text style={styles.detailTextSchedule} numberOfLines={1}>
                {formatJobSchedule(job)}
              </Text>
            </View>
            {problemPreview ? (
              <View style={styles.detailRow}>
                <Ionicons name="construct-outline" size={13} color={colors.muted} />
                <Text style={styles.problemSnippetText} numberOfLines={1}>
                  {problemPreview}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Perforation: everything below is the tear-off action stub */}
          <View style={styles.ticketPerforation}>
            <View style={styles.ticketNotchLeft} />
            <View style={styles.ticketPerforationLine} />
            <View style={styles.ticketNotchRight} />
          </View>

          {/* Action Stub */}
          <View style={styles.cardActionRow}>
            {isArrivalEligible && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => onArrival(job)}
                disabled={actionLoadingId === job.id}
                accessibilityRole="button"
                accessibilityLabel={`Mark arrival for ${job.applianceType || 'job'}`}
              >
                {actionLoadingId === job.id ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="location"
                      size={15}
                      color={colors.onAccent}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.primaryBtnText}>Mark Arrival</Text>
                  </>
                )}
              </Pressable>
            )}

            {isStartRepairEligible && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => onStart(job)}
                disabled={actionLoadingId === job.id}
                accessibilityRole="button"
                accessibilityLabel="Start repair"
              >
                {actionLoadingId === job.id ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="play"
                      size={15}
                      color={colors.onAccent}
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
                onPress={() => onComplete(job)}
                accessibilityRole="button"
                accessibilityLabel="Enter customer 4-digit OTP to complete job"
              >
                <Ionicons
                  name="key"
                  size={16}
                  color={colors.onAccent}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.primaryBtnText}>Verify & Complete (OTP)</Text>
              </Pressable>
            )}
          </View>

          {/* Utility stub: labelled actions in evenly sized columns */}
          <View style={styles.utilityRow}>
            {/* Detail Launcher */}
            <Pressable
              style={({ pressed }) => [styles.utilityAction, pressed && styles.utilityActionPressed]}
              onPress={() => onOpenDetails(job)}
              accessibilityRole="button"
              accessibilityLabel="Open job details"
            >
              <View style={styles.utilityTile}>
                <Ionicons name="eye-outline" size={19} color={colors.techDark} />
              </View>
              <Text style={styles.utilityLabel} numberOfLines={1}>
                Details
              </Text>
            </Pressable>

            {/* Map Launcher */}
            {onNavigateToMap && (
              <Pressable
                style={({ pressed }) => [styles.utilityAction, pressed && styles.utilityActionPressed]}
                onPress={() => onNavigateToMap(job)}
                accessibilityRole="button"
                accessibilityLabel="Open GPS navigation map"
              >
                <View style={styles.utilityTile}>
                  <Ionicons name="map-outline" size={19} color={colors.techDark} />
                </View>
                <Text style={styles.utilityLabel} numberOfLines={1}>
                  Map
                </Text>
              </Pressable>
            )}

            {/* Chat Launcher */}
            {onNavigateToChat && (
              <Pressable
                style={({ pressed }) => [styles.utilityAction, pressed && styles.utilityActionPressed]}
                onPress={() => onNavigateToChat(job)}
                accessibilityRole="button"
                accessibilityLabel="Open customer chat"
              >
                <View style={styles.utilityTile}>
                  <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.techDark} />
                </View>
                <Text style={styles.utilityLabel} numberOfLines={1}>
                  Message
                </Text>
              </Pressable>
            )}

            {/* No-show: destructive, kept last so it is never a mis-tap next to the primary action.
                UAT #2 gates it on the arrival stamp plus the wait window, so the
                technician is told to keep waiting rather than getting a rejection.
                Once the repair itself starts, the customer is necessarily present,
                so the tile leaves together with the wait state. */}
            {noShow.hasArrived && String(job.status ?? '').toLowerCase() !== 'in progress' && (
              <Pressable
                style={({ pressed }) => [styles.utilityAction, pressed && styles.utilityActionPressed]}
                onPress={() => onNoShow(job)}
                disabled={!noShow.ready || actionLoadingId === job.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: !noShow.ready }}
                accessibilityLabel={noShow.ready
                  ? 'Report customer no-show'
                  : `Report no-show available in ${noShow.remainingMinutes} minutes`}
              >
                <View style={[styles.utilityTile, styles.utilityTileDanger, !noShow.ready && styles.utilityTileDisabled]}>
                  {actionLoadingId === job.id ? (
                    <ActivityIndicator color={colors.danger} size="small" />
                  ) : (
                    <Ionicons
                      name="person-remove-outline"
                      size={19}
                      color={noShow.ready ? colors.danger : colors.subtle}
                    />
                  )}
                </View>
                <Text
                  style={[styles.utilityLabel, noShow.ready ? styles.utilityLabelDanger : styles.utilityLabelMuted]}
                  numberOfLines={1}
                >
                  {noShow.ready ? 'No-Show' : `Wait ${noShow.remainingMinutes}m`}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};
