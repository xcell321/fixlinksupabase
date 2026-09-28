// Assigned-job card with Accepted > Arrived > Repair > OTP stepper.
// Moved verbatim from AvailableJobsScreen.tsx. No visual or behavior change.
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon } from '../../../utils/applianceIcons';
import { splitJobDescription } from '../../../utils/jobDescription';
import { PhotoThumb } from '../../../components/RequestPhoto';
import { canMarkArrival, canStartRepair, formatJobSchedule, type JobItem } from '../availableJobsHelpers';
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
  // "[Brand] words" -> show the words, and the brand only when it is all there is.
  const { brand: jobBrand, text: problemText } = splitJobDescription(job.description);
  const problemPreview = problemText || jobBrand || '';
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
        {problemPreview ? (
          <View style={styles.problemSnippetBox}>
            <Ionicons name="construct-outline" size={13} color={colors.muted} />
            <Text style={styles.problemSnippetText} numberOfLines={2}>
              {problemPreview}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Customer Photo preview */}
      {job.photoUrl && (
        <View style={{ marginBottom: 12 }}>
          <PhotoThumb photoUrl={job.photoUrl} onPress={() => onPreviewPhoto(job.photoUrl ?? null)} />
        </View>
      )}

      {/* Action Bar */}
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
            onPress={() => onComplete(job)}
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

      </View>

      {/* Utility row: no-show plus view/map/chat, even icon spacing */}
      <View style={styles.utilityRow}>
        <View style={styles.utilityIcons}>
        {isArrivalEligible && (
          <Pressable
            style={styles.dangerOutlineBtn}
            onPress={() => onNoShow(job)}
            disabled={actionLoadingId === job.id}
            accessibilityRole="button"
            accessibilityLabel="Report customer no-show"
          >
            {actionLoadingId === job.id ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
            )}
          </Pressable>
        )}
        {/* Detail Launcher */}
        <Pressable
          style={styles.iconCompanion}
          onPress={() => onOpenDetails(job)}
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
    </View>
  );
};
