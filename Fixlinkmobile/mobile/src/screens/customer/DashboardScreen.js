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

  const firstName = (user?.name || 'there').split(' ')[0];
  const name = user?.name;
  const uid = user?.uid;

  const fetchAll = () => Promise.all([
    fetchCompletedJobs(name).then(setCompletedJobs).catch(() => setCompletedJobs([])),
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

      <View style={styles.tipCard}>
        <Ionicons name="sparkles-outline" size={21} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.tipTitle}>Quick tip</Text>
          <Text style={styles.tipCopy}>Add a photo to your request so technicians can prepare before they arrive.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingBottom: 32 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  brand: { color: colors.ink, fontSize: 18, fontFamily: fonts.extraBold },
  brandAccent: { color: colors.teal, fontFamily: fonts.extraBold },
  role: { color: colors.muted, fontSize: 9, letterSpacing: 1.5, fontFamily: fonts.bold, marginTop: 3 },
  notification: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  dot: { position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { color: colors.white, fontSize: 9, fontFamily: fonts.extraBold },

  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heroCopyWrap: { flex: 1, paddingRight: 8 },
  eyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 8 },
  greeting: { color: colors.ink, fontSize: 28, fontFamily: fonts.bold, letterSpacing: -0.8 },
  heroCopy: { color: colors.muted, fontSize: 14, marginTop: 7, fontFamily: fonts.regular },
  avatar: { width: 48, height: 48, borderRadius: 18, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.tealDark, fontSize: 18, fontFamily: fonts.bold },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 14, alignItems: 'center' },
  statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { color: colors.ink, fontSize: 22, fontFamily: fonts.extraBold },
  statLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 2 },

  sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3, marginBottom: 12 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  primaryAction: { flex: 1, minHeight: 172, backgroundColor: colors.teal, borderRadius: 22, padding: 16, overflow: 'hidden' },
  secondaryAction: { flex: 1, minHeight: 172, backgroundColor: colors.white, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  actionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  secondaryIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  primaryActionTitle: { color: colors.white, fontSize: 16, fontFamily: fonts.bold, marginBottom: 5 },
  secondaryActionTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginBottom: 5 },
  primaryActionCopy: { color: '#C7F1EC', fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  secondaryActionCopy: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  actionArrow: { position: 'absolute', right: 16, bottom: 16 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewAll: { color: colors.teal, fontFamily: fonts.bold, fontSize: 13, marginBottom: 12 },
  loadingBox: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingVertical: 34, alignItems: 'center', marginBottom: 14 },
  reqCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  reqIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  reqCopy: { flex: 1 },
  reqTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, marginBottom: 7 },
  reqMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, borderWidth: 1 },
  pillText: { fontSize: 10, fontFamily: fonts.semiBold },
  reqDate: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  emptyText: { flex: 1 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 3 },
  emptyCopy: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular },

  tipCard: { backgroundColor: '#FFF8E7', borderRadius: 20, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tipTitle: { color: '#8A5B00', fontFamily: fonts.bold, fontSize: 13, marginBottom: 4 },
  tipCopy: { color: '#9A711E', fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
});