// Dark header + Available/Assigned tab bar for the Available Jobs screen.
// Moved verbatim from AvailableJobsScreen.tsx. No visual or behavior change.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './availableJobsStyles';

interface QueueHeaderProps {
  technicianName: string;
  notificationCount: number;
  onOpenNotifications?: () => void;
  pendingCount: number;
  activeCount: number;
  feedTab: 'queue' | 'active';
  onSelectTab: (tab: 'queue' | 'active') => void;
}

export const QueueHeader = ({
  technicianName,
  notificationCount,
  onOpenNotifications,
  pendingCount,
  activeCount,
  feedTab,
  onSelectTab,
}: QueueHeaderProps): React.JSX.Element => (
  <>
    {/* Prototype TechJobs dark header */}
    <View style={styles.protoHeader}>
      <View style={styles.protoHeaderRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.protoKicker}>Good afternoon,</Text>
          <Text style={styles.protoName} numberOfLines={1}>{technicianName}</Text>
        </View>
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
          <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
          {notificationCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
      <View style={styles.protoStatsRow}>
        <View style={styles.protoStat}>
          <Text style={styles.protoStatValue}>{pendingCount}</Text>
          <Text style={styles.protoStatLabel}>Available</Text>
        </View>
        <View style={styles.protoStat}>
          <Text style={styles.protoStatValue}>{activeCount}</Text>
          <Text style={styles.protoStatLabel}>Assigned</Text>
        </View>
      </View>
    </View>

    {/* Segmented Feed Tabs */}
    <View style={styles.feedTabBar} accessibilityRole="tablist">
      <Pressable
        style={({ pressed }) => [
          styles.feedTabItem,
          feedTab === 'queue' && styles.feedTabItemActive,
          pressed && styles.pressedSoft
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: feedTab === 'queue' }}
        accessibilityLabel={`Available leads queue, ${pendingCount} jobs`}
        onPress={() => onSelectTab('queue')}
      >
        <Text style={[styles.feedTabLabel, feedTab === 'queue' && styles.feedTabLabelActive]}>
          Available
        </Text>
        <View style={[styles.tabBadge, feedTab === 'queue' && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, feedTab === 'queue' && styles.tabBadgeTextActive]}>
            {pendingCount}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.feedTabItem,
          feedTab === 'active' && styles.feedTabItemActive,
          pressed && styles.pressedSoft
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: feedTab === 'active' }}
        accessibilityLabel={`Active jobs, ${activeCount} jobs`}
        onPress={() => onSelectTab('active')}
      >
        <Text style={[styles.feedTabLabel, feedTab === 'active' && styles.feedTabLabelActive]}>
          Assigned
        </Text>
        <View style={[styles.tabBadge, feedTab === 'active' && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, feedTab === 'active' && styles.tabBadgeTextActive]}>
            {activeCount}
          </Text>
        </View>
      </Pressable>
    </View>
  </>
);
