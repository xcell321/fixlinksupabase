// Dark header for the Available Jobs screen. The two Available/Assigned cards
// ARE the feed tabs (there used to be a second, identical segmented bar under
// the header, which just duplicated these labels).
import React from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './availableJobsStyles';
import { colors } from '../../../theme';
import { getTimeGreeting } from '../../../utils/timeFormat';

interface QueueHeaderProps {
  technicianName: string;
  // The signed-in technician's own avatar, shown next to the bell.
  technicianImage?: string | null;
  // Derived from the profile address (utils/serviceArea), never hardcoded.
  serviceArea?: string | null;
  notificationCount: number;
  onOpenNotifications?: () => void;
  pendingCount: number;
  activeCount: number;
  feedTab: 'queue' | 'active';
  onSelectTab: (tab: 'queue' | 'active') => void;
}

export const QueueHeader = ({
  technicianName,
  technicianImage,
  serviceArea,
  notificationCount,
  onOpenNotifications,
  pendingCount,
  activeCount,
  feedTab,
  onSelectTab,
}: QueueHeaderProps): React.JSX.Element => {
  // Below 380px the name matters more than the avatar, so the avatar steps
  // aside instead of squeezing the greeting onto a second line (the service
  // area and the bell always stay).
  const { width } = useWindowDimensions();
  const showAvatar = width >= 380;

  return (
  <>
    {/* Prototype TechJobs dark header */}
    <View style={styles.protoHeader}>
      <View style={styles.protoHeaderRow}>
        {/* Avatar then name: "[photo] Name of technician". */}
        <View style={styles.protoIdentity}>
          {showAvatar ? (
            technicianImage ? (
              <Image source={{ uri: technicianImage }} style={styles.protoAvatar} />
            ) : (
              <View style={[styles.protoAvatar, styles.protoAvatarFallback]}>
                <Text style={styles.protoAvatarText}>{String(technicianName || 'T').trim().charAt(0).toUpperCase()}</Text>
              </View>
            )
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.protoKicker}>{getTimeGreeting()}</Text>
            <Text style={styles.protoName} numberOfLines={2}>{technicianName}</Text>
          </View>
        </View>
        <View style={styles.protoHeaderActions}>
          {serviceArea ? (
            <View style={styles.serviceAreaBlock}>
              <Text style={styles.serviceAreaLabel}>Service area</Text>
              <Text style={styles.serviceAreaValue} numberOfLines={1}>{serviceArea}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              notificationCount > 0
                ? `Notifications, ${notificationCount} unread`
                : 'Notifications, no unread'
            }
            onPress={onOpenNotifications}
            hitSlop={8}
            style={({ pressed }) => [styles.protoBell, pressed && styles.pressedSoft]}
          >
            <Ionicons name="notifications-outline" size={18} color={colors.onAccent} />
            {notificationCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
      <View style={styles.protoStatsRow} accessibilityRole="tablist">
        <Pressable
          style={({ pressed }) => [
            styles.protoStat,
            feedTab === 'queue' && styles.protoStatActive,
            pressed && styles.pressedSoft
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: feedTab === 'queue' }}
          accessibilityLabel={`Available leads queue, ${pendingCount} jobs`}
          onPress={() => onSelectTab('queue')}
        >
          <Text style={[styles.protoStatLabel, feedTab === 'queue' && styles.protoStatLabelActive]}>
            Available
          </Text>
          <View style={[styles.protoStatBadge, feedTab === 'queue' && styles.protoStatBadgeActive]}>
            <Text style={[styles.protoStatBadgeText, feedTab === 'queue' && styles.protoStatBadgeTextActive]}>
              {pendingCount > 99 ? '99+' : pendingCount}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.protoStat,
            feedTab === 'active' && styles.protoStatActive,
            pressed && styles.pressedSoft
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: feedTab === 'active' }}
          accessibilityLabel={`Active jobs, ${activeCount} jobs`}
          onPress={() => onSelectTab('active')}
        >
          <Text style={[styles.protoStatLabel, feedTab === 'active' && styles.protoStatLabelActive]}>
            Assigned
          </Text>
          <View style={[styles.protoStatBadge, feedTab === 'active' && styles.protoStatBadgeActive]}>
            <Text style={[styles.protoStatBadgeText, feedTab === 'active' && styles.protoStatBadgeTextActive]}>
              {activeCount > 99 ? '99+' : activeCount}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  </>
  );
};
