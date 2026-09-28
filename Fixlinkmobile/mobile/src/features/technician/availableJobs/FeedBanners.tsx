// Offline / stale-data / action-error banners for the Available Jobs screen.
// Moved verbatim from AvailableJobsScreen.tsx. No visual or behavior change.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { styles } from './availableJobsStyles';

interface FeedBannersProps {
  fetchError: boolean;
  hasJobs: boolean;
  acceptError: string | null;
  onRetry: () => void;
}

export const FeedBanners = ({ fetchError, hasJobs, acceptError, onRetry }: FeedBannersProps): React.JSX.Element => (
  <>
    {/* Offline and Stale Data Banner */}
    {fetchError && !hasJobs ? (
      <View
        style={styles.errorCard}
        accessibilityRole="alert"
        accessibilityLabel="Unable to load jobs. Check your internet connection."
      >
        <Ionicons name="cloud-offline-outline" size={36} color={colors.danger} />
        <Text style={styles.errorTitle}>Connection Unavailable</Text>
        <Text style={styles.errorText}>
          Unable to reach dispatch server. Check your connection and try refreshing.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading jobs"
          onPress={onRetry}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressedSoft, { marginTop: 12 }]}
        >
          <Ionicons name="refresh" size={16} color={colors.white} style={{ marginRight: 6 }} />
          <Text style={styles.primaryBtnText}>Retry Connection</Text>
        </Pressable>
      </View>
    ) : null}

    {fetchError && hasJobs ? (
      <View style={styles.offlineBanner} accessibilityRole="alert">
        <Ionicons name="alert-circle-outline" size={16} color={colors.muted} />
        <Text style={styles.offlineBannerText} numberOfLines={1}>
          Offline: showing cached dispatch feed.
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry refreshing" onPress={onRetry}>
          <Text style={styles.offlineRetryText}>Refresh</Text>
        </Pressable>
      </View>
    ) : null}

    {acceptError ? (
      <View style={styles.acceptErrorBox} accessibilityRole="alert">
        <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
        <Text style={styles.acceptErrorText}>{acceptError}</Text>
      </View>
    ) : null}
  </>
);
