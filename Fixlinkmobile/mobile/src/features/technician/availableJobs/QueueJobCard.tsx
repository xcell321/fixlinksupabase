// Available-lead queue card with masked location + Accept/Details/Dismiss.
// Moved verbatim from AvailableJobsScreen.tsx. No visual or behavior change.
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { getApplianceIcon } from '../../../utils/applianceIcons';
import { splitJobDescription } from '../../../utils/jobDescription';
import { PhotoThumb } from '../../../components/RequestPhoto';
import { formatJobSchedule, type JobItem } from '../availableJobsHelpers';
import { styles } from './availableJobsStyles';
import type { IconName } from './types';

interface QueueJobCardProps {
  job: JobItem;
  acceptingJobId: string | null;
  onAccept: (job: JobItem) => void;
  onDecline: (job: JobItem) => void;
  onOpenDetails: (job: JobItem) => void;
  onPreviewPhoto: (url: string | null) => void;
}

export const QueueJobCard = ({
  job,
  acceptingJobId,
  onAccept,
  onDecline,
  onOpenDetails,
  onPreviewPhoto,
}: QueueJobCardProps): React.JSX.Element => {
  // "[Brand] words" -> show the words, and the brand only when it is all there is.
  const { brand, text } = splitJobDescription(job.description);
  const problemPreview = text || brand || '';

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

    {/* Issue Description Box. The stored value is "[Brand] words", so only the
        customer's own words are shown — the brand chip already carries the rest. */}
    {problemPreview ? (
      <View style={styles.issueBox}>
        <Text style={styles.issueText} numberOfLines={3}>
          {problemPreview}
        </Text>
      </View>
    ) : null}

    {/* Customer Photo */}
    {job.photoUrl && (
      <View style={{ marginBottom: 12 }}>
        <PhotoThumb photoUrl={job.photoUrl} onPress={() => onPreviewPhoto(job.photoUrl ?? null)} />
      </View>
    )}

    {/* Action Bar */}
    <View style={styles.cardActionRow}>
      <Pressable
        style={styles.primaryBtn}
        onPress={() => onAccept(job)}
        disabled={acceptingJobId === job.id}
        accessibilityRole="button"
        accessibilityLabel={`Accept repair job for ${job.applianceType || 'request'}`}
      >
        {acceptingJobId === job.id ? (
          <ActivityIndicator color={colors.onAccent} size="small" />
        ) : (
          <>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={colors.onAccent}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.primaryBtnText}>Accept Job</Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={styles.secondaryBtn}
        onPress={() => onOpenDetails(job)}
        accessibilityRole="button"
        accessibilityLabel="View full job details"
      >
        <Ionicons name="eye-outline" size={16} color={colors.ink} />
        <Text style={styles.secondaryBtnText}>Details</Text>
      </Pressable>

      <Pressable
        style={styles.dangerOutlineBtn}
        onPress={() => onDecline(job)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss repair request"
      >
        <Ionicons name="close" size={16} color={colors.danger} />
      </Pressable>
    </View>
  </View>
  );
};
