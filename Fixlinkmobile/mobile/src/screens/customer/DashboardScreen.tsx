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
    { key: 'Completed', value: completedCount, icon: 'checkmark-done', color: colors.green },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.teal} />} showsVerticalScrollIndicator={false}>
      <View style={styles.centerWrap}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
          <Text style={styles.role}>HOME SERVICES</Text>
        </View>
        <TouchableOpacity style={styles.notification} onPress={onOpenNotifications}>
          <Ionicons name="notifications-outline" size={21} color={colors.ink} />
          {notificationCount > 0 && (
            <View style={styles.dot}>
              <Text style={styles.dotText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.heroRow}>
        <View style={styles.heroCopyWrap}>
          <Text style={styles.eyebrow}>CUSTOMER SPACE</Text>
          <Text style={styles.greeting}>Good day, {firstName}</Text>
          <Text style={styles.heroCopy}>Let’s get your home back in shape.</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text></View>
      </View>

      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.key} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: s.color + '15' }]}>
              <Ionicons name={s.icon} size={15} color={s.color} />
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.key}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>What do you need today?</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryAction} onPress={onNavigateToSubmit} activeOpacity={0.88}>
          <View style={styles.actionIcon}><Ionicons name="add" size={24} color={colors.white} /></View>
          <Text style={styles.primaryActionTitle}>New request</Text>
          <Text style={styles.primaryActionCopy}>Tell us what needs fixing</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} style={styles.actionArrow} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryAction} onPress={onNavigateToProgress} activeOpacity={0.88}>
          <View style={styles.secondaryIcon}><Ionicons name="pulse" size={22} color={colors.teal} /></View>
          <Text style={styles.secondaryActionTitle}>Track a job</Text>
          <Text style={styles.secondaryActionCopy}>See live request updates</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.teal} style={styles.actionArrow} />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent requests</Text>
        <TouchableOpacity onPress={onNavigateToProgress}><Text style={styles.viewAll}>View all</Text></TouchableOpacity>
      </View>

      {loading && recentRequests.length === 0 ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.teal} /></View>
      ) : recentRequests.length > 0 ? (
        recentRequests.map((req) => {
          const color = getStatusColor(req.status);
          return (
            <TouchableOpacity key={req.id} style={styles.reqCard} onPress={() => onOpenRequest(req)} activeOpacity={0.85}>
              <View style={[styles.reqIcon, { backgroundColor: color + '15' }]}>
                <Ionicons name={getApplianceIcon(req.applianceType)} size={21} color={color} />
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
        })
      ) : (
        <TouchableOpacity style={styles.emptyCard} onPress={onNavigateToSubmit} activeOpacity={0.85}>
          <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={22} color={colors.teal} /></View>
          <View style={styles.emptyText}><Text style={styles.emptyTitle}>No requests yet</Text><Text style={styles.emptyCopy}>Start your first service request to see it here.</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      )}

      {!tipDismissed && (
        <View style={styles.tipCard}>
          <Ionicons name="sparkles-outline" size={21} color={colors.gold} />
          <View style={{ flex: 1 }}>
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
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, alignItems: 'center' },
  centerWrap: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  brand: { color: colors.ink, fontSize: 18, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  brandAccent: { color: colors.teal, fontFamily: fonts.extraBold },
  role: { color: colors.muted, fontSize: 11, letterSpacing: 1.3, fontFamily: fonts.bold, marginTop: 3 },
  notification: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, boxShadow: '0 4px 10px rgba(16,42,67,0.06)', elevation: 2 },
  dot: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.white },
  dotText: { color: colors.white, fontSize: 11, fontFamily: fonts.extraBold },

  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  heroCopyWrap: { flex: 1, paddingRight: 8, gap: 2 },
  eyebrow: { color: colors.teal, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.extraBold, marginBottom: 4, textTransform: 'uppercase' },
  greeting: { color: colors.ink, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.7, lineHeight: 30 },
  heroCopy: { color: colors.muted, fontSize: 13, marginTop: 2, fontFamily: fonts.regular, lineHeight: 18 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBE7E1' },
  avatarText: { color: colors.tealDark, fontSize: 18, fontFamily: fonts.bold },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', boxShadow: '0 6px 12px rgba(16,42,67,0.06)', elevation: 2, gap: 2 },
  statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { color: colors.ink, fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] as const, lineHeight: 24 },
  statLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 1, letterSpacing: 0.4, textTransform: 'uppercase' as const },

  sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 28, flexWrap: 'wrap' as const },
  primaryAction: { flex: 1, minWidth: 148, minHeight: 168, backgroundColor: colors.teal, borderRadius: 22, padding: 16, overflow: 'hidden', boxShadow: '0 8px 16px rgba(15,118,110,0.22)', elevation: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  secondaryAction: { flex: 1, minWidth: 148, minHeight: 168, backgroundColor: colors.white, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', boxShadow: '0 6px 12px rgba(16,42,67,0.06)', elevation: 2 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  secondaryIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 22, borderWidth: 1, borderColor: '#CBE7E1' },
  primaryActionTitle: { color: colors.white, fontSize: 16, fontFamily: fonts.bold, marginBottom: 4, letterSpacing: -0.2 },
  secondaryActionTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginBottom: 4, letterSpacing: -0.2 },
  primaryActionCopy: { color: '#C7F1EC', fontSize: 12, lineHeight: 17, fontFamily: fonts.medium },
  secondaryActionCopy: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  actionArrow: { position: 'absolute', right: 16, bottom: 16 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 12 },
  viewAll: { color: colors.teal, fontFamily: fonts.bold, fontSize: 13, marginBottom: 10, minHeight: 28, textAlignVertical: 'center' as const, paddingVertical: 6 },
  loadingBox: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingVertical: 34, alignItems: 'center', marginBottom: 14 },
  reqCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, boxShadow: '0 4px 10px rgba(16,42,67,0.05)', elevation: 1, gap: 12 },
  reqIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reqCopy: { flex: 1, gap: 6 },
  reqTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, letterSpacing: -0.15, lineHeight: 18 },
  reqMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, maxWidth: '65%' },
  pillText: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.2, textTransform: 'capitalize' as const },
  reqDate: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1, fontVariant: ['tabular-nums'] as const },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 14, boxShadow: '0 4px 10px rgba(16,42,67,0.05)', elevation: 1, gap: 12 },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBE7E1' },
  emptyText: { flex: 1, gap: 2 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 2, lineHeight: 18 },
  emptyCopy: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, lineHeight: 16 },

  tipCard: { backgroundColor: '#FFF8E7', borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: '#FDE68A', marginTop: 6 },
  tipTitle: { color: '#8A5B00', fontFamily: fonts.bold, fontSize: 13, marginBottom: 2, lineHeight: 16 },
  tipCopy: { color: '#9A711E', fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  tipDismiss: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
});
