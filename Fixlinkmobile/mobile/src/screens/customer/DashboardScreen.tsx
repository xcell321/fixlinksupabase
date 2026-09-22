// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchCompletedJobs, fetchCustomerRequests } from '../services/api';
import { colors, fonts } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon } from '../../utils/applianceIcons';

export default function DashboardScreen({ user, notificationCount = 0, onOpenNotifications, onNavigateToSubmit, onNavigateToProgress, onOpenRequest }) {
  const [trackedRequests, setTrackedRequests] = useState([]);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);

  const firstName = (user?.name || 'there').split(' ')[0];
  const name = user?.name;
  const uid = user?.uid;

  const fetchAll = () => Promise.all([
    fetchCompletedJobs(name, uid).then(setCompletedJobs).catch(() => setCompletedJobs([])),
    fetchCustomerRequests(name, uid).then(setTrackedRequests).catch(() => setTrackedRequests([])),
  ]);

  useEffect(() => {
    let active = true;
    const refresh = () => fetchAll().finally(() => { if (active) setLoading(false); });
    refresh();
    const interval = setInterval(refresh, 45000);
    return () => { active = false; clearInterval(interval); };
  }, [name, uid]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchAll(); } finally { setRefreshing(false); }
  };

  const pendingCount = trackedRequests.filter((r) => (r.status || '').toLowerCase() === 'pending').length;
  const activeCount = trackedRequests.filter((r) => ['accepted', 'confirmed', 'customer ready', 'in progress'].includes((r.status || '').toLowerCase())).length;
  const completedCount = completedJobs.length;

  const recentRequests = [...trackedRequests, ...completedJobs]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 2);

  const stats = [
    { key: 'Active', value: activeCount, icon: 'sync', color: colors.teal },
    { key: 'Pending', value: pendingCount, icon: 'time', color: colors.gold },
    { key: 'Completed', value: completedCount, icon: 'checkmark-circle', color: colors.green },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} />} showsVerticalScrollIndicator={false}>
      <View style={styles.centerWrap}>
      <View style={styles.topBar}>
        <View style={styles.brandLeft}>
          <Text style={styles.brandSmall}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
          <Text style={styles.roleSmall}>HOME SERVICES</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationQuiet}
          onPress={onOpenNotifications}
          accessibilityRole="button"
          accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications, no unread'}
          hitSlop={6}
          activeOpacity={0.85}
        >
          <Ionicons name="notifications-outline" size={21} color={colors.tealDark} />
          {notificationCount > 0 && (
            <View style={styles.dot}>
              <Text style={styles.dotText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.heroRow}>
        <View style={styles.heroCopyWrap}>
          <Text style={styles.greeting}>Good day, {firstName}</Text>
          <Text style={styles.heroCopy}>Let’s get your home back in shape.</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text></View>
      </View>

      <View style={styles.statusStrip}>
        {stats.map((s, idx) => (
          <View key={s.key} style={[styles.statusSegment, idx > 0 && styles.statusDivider]}>
            <View style={styles.statusLabelRow}>
              <Ionicons name={s.icon} size={12} color={s.color} />
              <Text style={styles.statusLabel} numberOfLines={1}>{s.key}</Text>
            </View>
            <Text style={styles.statusValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>What do you need today?</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryAction} onPress={onNavigateToSubmit} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="New request">
          <View style={styles.actionIcon}><Ionicons name="add" size={22} color={colors.white} /></View>
          <Text style={styles.primaryActionTitle}>New request</Text>
          <Text style={styles.primaryActionCopy}>Tell us what needs fixing</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.white} style={styles.actionArrow} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryAction} onPress={onNavigateToProgress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Track a job">
          <View style={styles.secondaryIcon}><Ionicons name="navigate-outline" size={20} color={colors.teal} /></View>
          <Text style={styles.secondaryActionTitle}>Track a job</Text>
          <Text style={styles.secondaryActionCopy}>See live request updates</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.teal} style={styles.actionArrow} />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent requests</Text>
        <TouchableOpacity
          onPress={onNavigateToProgress}
          accessibilityRole="button"
          accessibilityLabel="View all requests"
          hitSlop={6}
          style={styles.viewAllHit}
        >
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      {loading && recentRequests.length === 0 ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.teal} /></View>
      ) : recentRequests.length > 0 ? (
        <View style={styles.recentLedger}>
          {recentRequests.map((req, idx) => {
            const color = getStatusColor(req.status);
            return (
              <TouchableOpacity
                key={req.id}
                style={[styles.recentRow, idx > 0 && styles.recentDivider]}
                onPress={() => onOpenRequest(req)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${req.applianceType}, ${req.status}`}
              >
                <View style={[styles.reqIcon, { backgroundColor: color + '15' }]}>
                  <Ionicons name={getApplianceIcon(req.applianceType)} size={20} color={color} />
                </View>
                <View style={styles.reqCopy}>
                  <Text style={styles.reqTitle} numberOfLines={1}>{req.applianceType}</Text>
                  <View style={styles.reqMeta}>
                    <View style={[styles.pill, { backgroundColor: color + '15', borderColor: color + '40' }]}>
                      <Ionicons name={getStatusIcon(req.status)} size={10} color={color} />
                      <Text style={[styles.pillText, { color }]} numberOfLines={1}>{req.status}</Text>
                    </View>
                    {req.createdAt ? <Text style={styles.reqDate} numberOfLines={1}>{new Date(req.createdAt).toLocaleDateString()}</Text> : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <TouchableOpacity style={styles.emptyCard} onPress={onNavigateToSubmit} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="No requests yet, start your first service request">
          <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={22} color={colors.teal} /></View>
          <View style={styles.emptyText}><Text style={styles.emptyTitle}>No requests yet</Text><Text style={styles.emptyCopy}>Start your first service request to see it here.</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}

      {!tipDismissed && (
        <View style={styles.tipHint}>
          <Ionicons name="sparkles-outline" size={16} color={colors.gold} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.tipTitle}>Quick tip</Text>
            <Text style={styles.tipCopy}>Add a photo to your request so technicians can prepare before they arrive.</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Dismiss tip"
            onPress={() => setTipDismissed(true)}
            hitSlop={8}
            style={styles.tipDismiss}
          >
            <Ionicons name="close" size={14} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, alignItems: 'center' },
  centerWrap: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 },
  brandLeft: { flex: 1, minWidth: 0, gap: 1 },
  brandSmall: { color: colors.ink, fontSize: 16, fontFamily: fonts.extraBold, letterSpacing: -0.3, lineHeight: 18 },
  brandAccent: { color: colors.teal, fontFamily: fonts.extraBold },
  roleSmall: { color: colors.muted, fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold, lineHeight: 11 },
  notificationQuiet: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder },
  dot: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.white },
  dotText: { color: colors.white, fontSize: 11, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] as const },

  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 10 },
  heroCopyWrap: { flex: 1, paddingRight: 6, minWidth: 0 },
  greeting: { color: colors.ink, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.7, lineHeight: 30 },
  heroCopy: { color: colors.muted, fontSize: 13, marginTop: 2, fontFamily: fonts.regular, lineHeight: 18 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hudBorder },
  avatarText: { color: colors.tealDark, fontSize: 18, fontFamily: fonts.bold },

  statusStrip: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, marginBottom: 20, paddingVertical: 14, paddingHorizontal: 6 },
  statusSegment: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, minWidth: 0 },
  statusDivider: { borderLeftWidth: 1, borderColor: colors.lineSoft },
  statusLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  statusValue: { color: colors.ink, fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] as const, lineHeight: 26 },

  sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  primaryAction: { flex: 1, minWidth: 0, minHeight: 128, backgroundColor: colors.teal, borderRadius: 20, padding: 14, overflow: 'hidden', boxShadow: '0 4px 10px rgba(15,118,110,0.18)', elevation: 3 },
  secondaryAction: { flex: 1, minWidth: 0, minHeight: 128, backgroundColor: colors.white, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  actionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  secondaryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1, borderColor: colors.hudBorder },
  primaryActionTitle: { color: colors.white, fontSize: 16, fontFamily: fonts.bold, marginBottom: 2, letterSpacing: -0.2 },
  secondaryActionTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginBottom: 2, letterSpacing: -0.2 },
  primaryActionCopy: { color: '#C7F1EC', fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },
  secondaryActionCopy: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },
  actionArrow: { position: 'absolute', right: 14, bottom: 14 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 },
  viewAllHit: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 4 },
  viewAll: { color: colors.teal, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  loadingBox: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingVertical: 28, alignItems: 'center', marginBottom: 14 },
  recentLedger: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, marginBottom: 14, overflow: 'hidden' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, minHeight: 72 },
  recentDivider: { borderTopWidth: 1, borderColor: colors.lineSoft },
  reqIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reqCopy: { flex: 1, gap: 4, minWidth: 0 },
  reqTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, letterSpacing: -0.15, lineHeight: 18 },
  reqMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  pillText: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.2, textTransform: 'capitalize' as const },
  reqDate: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1, fontVariant: ['tabular-nums'] as const },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12, minHeight: 72 },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hudBorder },
  emptyText: { flex: 1, gap: 2, minWidth: 0 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 2, lineHeight: 18 },
  emptyCopy: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, lineHeight: 16 },

  tipHint: { backgroundColor: '#FFF8E7', borderRadius: 20, paddingVertical: 6, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A', marginTop: 6 },
  tipTitle: { color: '#8A5B00', fontFamily: fonts.bold, fontSize: 12, lineHeight: 15 },
  tipCopy: { color: '#9A711E', fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },
  tipDismiss: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
