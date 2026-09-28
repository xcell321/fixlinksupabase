// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Image, Animated, PanResponder, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCompletedJobs, fetchCustomerRequests, fetchPlatformCategories, askAssistant } from '../../services/api';
import { colors, fonts } from '../../theme';
import { getApplianceIcon, getStatusColor, getStatusIcon } from '../../utils/applianceIcons';

// Prototype: FixIt Customer Home (orange #F97316 on dark #0D1B2A).
// Logic preserved: real requests, active hero, stats, recent, categories, tip.
const ACTIVE_STATUSES = ['accepted', 'confirmed', 'customer ready', 'in progress'];

const getNextAction = (req) => {
  const s = String(req?.status || '').toLowerCase();
  if (s === 'accepted') return { icon: 'checkmark-circle', text: 'Confirm repair' };
  if (s === 'confirmed') return { icon: 'flag', text: 'Mark ready for visit' };
  if (s === 'customer ready' || s === 'in progress') return { icon: 'map', text: 'Track technician' };
  if (s === 'completed') return { icon: 'star-outline', text: 'Leave a review' };
  if (s === 'pending') return { icon: 'time-outline', text: 'Finding your technician' };
  return null;
};

const ORANGE = colors.customer;
const DARK = colors.dark;

export default function DashboardScreen({ user, notificationCount = 0, onOpenNotifications, onNavigateToSubmit, onNavigateToProgress, onOpenRequest, onTrackJob }) {
  const [trackedRequests, setTrackedRequests] = useState([]);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);

  // Customer-only floating AI assistant (working, no Estimate price)
  // Draggable robot: user can move it anywhere on screen, stays in bounds.
  const [homeSize, setHomeSize] = useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height });
  const fabPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fabLast = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const id = fabPos.addListener((v) => { fabLast.current = { x: v.x, y: v.y }; });
    return () => fabPos.removeListener(id);
  }, [fabPos]);
  const clampFab = (x, y) => ({
    x: Math.max(-(homeSize.w - 56 - 40), Math.min(0, x)),
    y: Math.max(-(homeSize.h - 56 - 200), Math.min(40, y)),
  });
  const fabPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      fabPos.setOffset({ x: fabLast.current.x, y: fabLast.current.y });
      fabPos.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event([null, { dx: fabPos.x, dy: fabPos.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      fabPos.flattenOffset();
      const c = clampFab(fabLast.current.x, fabLast.current.y);
      fabLast.current = c;
      Animated.spring(fabPos, { toValue: c, friction: 7, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => { fabPos.flattenOffset(); },
  })).current;
  const [aiVisible, setAiVisible] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    { id: 'ai-hello', from: 'ai', text: 'Hi! I am your FixLink Assistant. Ask me about repairs, technicians, or tracking.' },
  ]);
  // Persisted conversation: survives reload/restart, per customer.
  // NOTE: uses user?.uid directly (uid const is declared further below).
  const aiChatKey = `fixlink_ai_chat_${user?.uid || 'guest'}`;
  const [aiChatReady, setAiChatReady] = useState(false);
  useEffect(() => {
    let on = true;
    setAiChatReady(false);
    AsyncStorage.getItem(aiChatKey).then((raw) => {
      if (!on) return;
      try {
        const saved = raw ? JSON.parse(raw) : null;
        if (Array.isArray(saved) && saved.length > 0 && saved.every((m) => m && typeof m.text === 'string')) {
          setAiMessages(saved.slice(-50));
        }
      } catch {}
      setAiChatReady(true);
    }).catch(() => { if (on) setAiChatReady(true); });
    return () => { on = false; };
  }, [aiChatKey]);
  useEffect(() => {
    if (!aiChatReady) return;
    AsyncStorage.setItem(aiChatKey, JSON.stringify(aiMessages.slice(-50))).catch(() => {});
  }, [aiMessages, aiChatReady, aiChatKey]);

  const firstName = (user?.name || 'there').split(' ')[0];
  const fullName = user?.name || 'there';
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

  useEffect(() => {
    let active = true;
    fetchPlatformCategories()
      .then((data) => { if (active) setCategories(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setCategories([]); });
    return () => { active = false; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchAll(); } finally { setRefreshing(false); }
  };

  const pendingCount = trackedRequests.filter((r) => (r.status || '').toLowerCase() === 'pending').length;
  const activeJobs = trackedRequests.filter((r) => ACTIVE_STATUSES.includes((r.status || '').toLowerCase()));
  const activeCount = activeJobs.length;
  const completedCount = completedJobs.length;
  const heroJob = activeJobs[0] || trackedRequests[0] || null;

  const handleCategoryTap = () => {
    if (typeof onNavigateToSubmit === 'function') onNavigateToSubmit();
  };

  const recentRequests = [...trackedRequests, ...completedJobs]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 2);

  const stats = [
    { key: 'Repairs Done', value: String(completedCount) },
    { key: 'Active', value: String(activeCount) },
    { key: 'Pending', value: String(pendingCount) },
  ];

  // No hardcoded answers: every reply comes from the real AI (OmniRoute)
  // with live FixLink data. When the gateway is down, say so honestly.
  const AI_DOWN = 'AI service is unavailable right now. Please check your connection and try again.';
  const aiSend = (preset) => {
    const text = String(preset ?? aiInput).trim();
    if (!text || aiTyping) return;
    setAiMessages((cur) => [...cur, { id: `me-${Date.now()}`, from: 'me', text }]);
    setAiInput('');
    setAiTyping(true);
    const ctx = {
      customerName: fullName,
      customerUid: uid || null,
      activeJob: heroJob ? {
        applianceType: heroJob.applianceType || null,
        status: heroJob.status || null,
        technicianName: heroJob.technicianName || null,
        preferredTime: heroJob.preferredTime || null,
      } : null,
      activeCount,
      pendingCount,
      completedCount,
    };
    askAssistant(text, ctx).then((r) => {
      const reply = String(r?.reply || '').trim() || AI_DOWN;
      setAiMessages((cur) => [...cur, { id: `ai-${Date.now()}`, from: 'ai', text: reply }]);
      setAiTyping(false);
    }).catch(() => {
      setAiMessages((cur) => [...cur, { id: `ai-${Date.now()}`, from: 'ai', text: AI_DOWN }]);
      setAiTyping(false);
    });
  };

  return (
    <View style={styles.homeWrap} onLayout={(e) => setHomeSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />} showsVerticalScrollIndicator={false}>
      {/* Dark header — prototype MAIN APP */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>Good afternoon,</Text>
            <Text style={styles.greeting} numberOfLines={1}>{fullName}</Text>
          </View>
          <TouchableOpacity
            style={styles.bell}
            onPress={onOpenNotifications}
            accessibilityRole="button"
            accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications, no unread'}
            hitSlop={8}
            activeOpacity={0.85}
          >
            <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
            {notificationCount > 0 ? <View style={styles.bellDot} /> : <View style={styles.bellDotDim} />}
          </TouchableOpacity>
        </View>

        {heroJob ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeKicker}>Active Repair</Text>
            <View style={styles.activeRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.activeTitle} numberOfLines={1}>{heroJob.applianceType || 'Repair request'}{heroJob.description ? ` · ${heroJob.description.slice(0, 24)}` : ''}</Text>
                <Text style={styles.activeSub} numberOfLines={1}>{heroJob.status || 'Pending'}{heroJob.preferredTime ? ` · ETA ${heroJob.preferredTime}` : ''}</Text>
              </View>
              <TouchableOpacity style={styles.trackBtn} onPress={() => onOpenRequest(heroJob)} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Track active repair">
                <Text style={styles.trackBtnText}>Track</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${heroJob.status && String(heroJob.status).toLowerCase() === 'pending' ? 20 : 65}%` }]} />
            </View>
          </View>
        ) : (
          <View style={styles.activeCard}>
            <Text style={styles.activeKicker}>Active Repair</Text>
            <Text style={styles.activeTitle}>No active repair</Text>
            <Text style={styles.activeSub}>Submit a request to get started</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionKicker}>NEW REPAIR REQUEST</Text>
        <TouchableOpacity style={styles.submitCard} onPress={onNavigateToSubmit} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Submit a repair">
          <View style={styles.plusTile}>
            <Ionicons name="add" size={22} color={ORANGE} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.submitTitle}>Submit a Repair</Text>
            <Text style={styles.submitCopy}>Laptop, phone, TV, tablet & more</Text>
          </View>
        </TouchableOpacity>

        {categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categories.map((c) => {
              const catName = String(c?.name || '').trim();
              if (!catName) return null;
              return (
                <TouchableOpacity key={String(c?.id || catName)} style={styles.catChip} onPress={handleCategoryTap} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Request ${catName}`}>
                  <Ionicons name={getApplianceIcon(catName)} size={13} color={ORANGE} />
                  <Text style={styles.catChipText} numberOfLines={1}>{catName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <Text style={styles.sectionKicker}>QUICK STATS</Text>
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.key} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.key}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionKicker}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={onNavigateToProgress} hitSlop={6} accessibilityRole="button" accessibilityLabel="View all requests">
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {loading && recentRequests.length === 0 ? (
          <View style={styles.loadingBox}><ActivityIndicator color={ORANGE} /></View>
        ) : recentRequests.length > 0 ? (
          <View style={{ gap: 8 }}>
            {recentRequests.map((req) => {
              const color = getStatusColor(req.status);
              const next = getNextAction(req);
              return (
                <TouchableOpacity key={req.id} style={styles.recentCard} onPress={() => onOpenRequest(req)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${req.applianceType}, ${req.status}`}>
                  <View style={styles.recentIcon}>
                    <Ionicons name={getApplianceIcon(req.applianceType)} size={18} color="#6B7280" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.recentTitle} numberOfLines={1}>{req.applianceType}</Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</Text>
                    {next ? <Text style={styles.nextHint} numberOfLines={1}>{next.text}</Text> : null}
                  </View>
                  <View style={[styles.pill, { backgroundColor: color + '15', borderColor: color + '40' }]}>
                    <Text style={[styles.pillText, { color }]}>{req.status}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TouchableOpacity style={styles.recentCard} onPress={onNavigateToSubmit} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="No requests yet">
            <View style={styles.recentIcon}>
              <Ionicons name="receipt-outline" size={18} color="#6B7280" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recentTitle}>No requests yet</Text>
              <Text style={styles.recentMeta}>Start your first service request</Text>
            </View>
          </TouchableOpacity>
        )}

        {!tipDismissed && (
          <View style={styles.tipHint}>
            <Ionicons name="sparkles-outline" size={16} color="#D97706" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.tipTitle}>Quick tip</Text>
              <Text style={styles.tipCopy}>Add a photo to your request so technicians can prepare before they arrive.</Text>
            </View>
            <TouchableOpacity onPress={() => setTipDismissed(true)} hitSlop={8} style={styles.tipDismiss} accessibilityRole="button" accessibilityLabel="Dismiss tip">
              <Ionicons name="close" size={14} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>

      {/* Customer-only draggable AI robot */}
      <Animated.View style={[styles.aiFabWrap, { transform: fabPos.getTranslateTransform() }]} {...fabPan.panHandlers}>
        <TouchableOpacity
          style={styles.aiFab}
          onPress={() => setAiVisible(true)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Open FixLink Assistant. Drag to move."
          hitSlop={8}
        >
          <Image source={require('../../../assets/ai-assistant.png')} style={styles.aiFabImage} accessibilityLabel="FixLink Assistant" />
        </TouchableOpacity>
      </Animated.View>

      {/* FixLink Assistant sheet (Image 3, no Estimate price) */}
      <Modal visible={aiVisible} transparent animationType="slide" onRequestClose={() => setAiVisible(false)}>
        <View style={styles.aiOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.aiSheet}>
            <View style={styles.aiHeader}>
              <Image source={require('../../../assets/ai-assistant.png')} style={styles.aiHeaderImage} accessibilityLabel="FixLink Assistant" />
              <View style={{ flex: 1 }}>
                <Text style={styles.aiTitle}>FixLink Assistant</Text>
                <View style={styles.aiReadyRow}>
                  <View style={styles.aiReadyDot} />
                  <Text style={styles.aiReadyText}>Ready to help</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setAiVisible(false)} hitSlop={8} style={styles.aiClose} accessibilityRole="button" accessibilityLabel="Close assistant">
                <Ionicons name="close" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.aiMessages} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
              {aiMessages.map((m) => (
                <View key={m.id} style={[styles.aiBubbleRow, m.from === 'me' ? styles.aiBubbleRowMe : styles.aiBubbleRowAi]}>
                  {m.from === 'ai' ? (
                    <Image source={require('../../../assets/ai-assistant.png')} style={styles.aiMiniImage} accessibilityLabel="FixLink Assistant" />
                  ) : null}
                  <View style={[styles.aiBubble, m.from === 'me' ? styles.aiBubbleMe : styles.aiBubbleAi]}>
                    <Text style={[styles.aiBubbleText, m.from === 'me' ? styles.aiBubbleTextMe : styles.aiBubbleTextAi]}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {aiTyping ? (
                <View style={[styles.aiBubbleRow, styles.aiBubbleRowAi]}>
                  <Image source={require('../../../assets/ai-assistant.png')} style={styles.aiMiniImage} accessibilityLabel="FixLink Assistant" />
                  <View style={[styles.aiBubble, styles.aiBubbleAi]}>
                    <Text style={styles.aiBubbleTextAi}>Typing...</Text>
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.aiChips}>
              {['Find nearby technician', 'Track my repair'].map((c) => (
                <TouchableOpacity key={c} style={styles.aiChip} onPress={() => aiSend(c)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={c}>
                  <Text style={styles.aiChipText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.aiInputRow}>
              <TextInput
                style={styles.aiInput}
                value={aiInput}
                onChangeText={setAiInput}
                placeholder="Ask FixLink AI..."
                placeholderTextColor="#9CA3AF"
                onSubmitEditing={() => aiSend()}
                returnKeyType="send"
                accessibilityLabel="Ask FixLink AI"
              />
              <TouchableOpacity style={styles.aiSend} onPress={() => aiSend()} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Send message">
                <Ionicons name="send" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { paddingBottom: 110 },
  header: { backgroundColor: DARK, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 10 },
  kicker: { color: '#9CA3AF', fontSize: 12, fontFamily: fonts.regular },
  greeting: { color: '#FFFFFF', fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.3, marginTop: 2 },
  bell: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE, borderWidth: 2, borderColor: DARK },
  bellDotDim: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent' },
  activeCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 16, padding: 16 },
  activeKicker: { color: '#D1D5DB', fontSize: 12, fontFamily: fonts.regular, marginBottom: 6 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activeTitle: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.bold },
  activeSub: { color: ORANGE, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  trackBtn: { backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  trackBtnText: { color: '#FFFFFF', fontSize: 12, fontFamily: fonts.bold },
  progressTrack: { marginTop: 12, height: 6, backgroundColor: 'rgba(255,255,255,0.20)', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ORANGE, borderRadius: 999 },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  sectionKicker: { color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  viewAll: { color: ORANGE, fontFamily: fonts.bold, fontSize: 13 },
  submitCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: ORANGE, borderStyle: 'dashed', padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  plusTile: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.customerMist, alignItems: 'center', justifyContent: 'center' },
  submitTitle: { color: '#111827', fontSize: 14, fontFamily: fonts.bold },
  submitCopy: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  catRow: { gap: 8, paddingVertical: 2 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 12, minHeight: 44 },
  catChipText: { color: '#111827', fontSize: 12, fontFamily: fonts.semiBold },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  statValue: { color: '#111827', fontSize: 24, fontFamily: fonts.extraBold },
  statLabel: { color: '#6B7280', fontSize: 10, fontFamily: fonts.regular, marginTop: 2, textAlign: 'center' },
  recentCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  recentIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  recentTitle: { color: '#111827', fontSize: 14, fontFamily: fonts.bold },
  recentMeta: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  nextHint: { color: '#9CA3AF', fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 10, fontFamily: fonts.bold },
  loadingBox: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6', paddingVertical: 28, alignItems: 'center' },
  tipHint: { backgroundColor: '#FFF8E7', borderRadius: 16, paddingVertical: 6, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A', marginTop: 6 },
  tipTitle: { color: '#8A5B00', fontFamily: fonts.bold, fontSize: 12, lineHeight: 15 },
  tipCopy: { color: '#9A711E', fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },
  tipDismiss: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  homeWrap: { flex: 1 },
  aiFabWrap: { position: 'absolute', right: 20, bottom: 90 },
  aiFab: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 6, boxShadow: '0 6px 14px rgba(16,42,67,0.25)', overflow: 'hidden' },
  aiFabImage: { width: 56, height: 56, borderRadius: 28 },
  aiHeaderImage: { width: 32, height: 32, borderRadius: 10 },
  aiMiniImage: { width: 20, height: 20, borderRadius: 10 },
  aiOverlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.4)', justifyContent: 'flex-end' },
  aiSheet: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 20 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  aiHeaderIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.bold },
  aiReadyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  aiReadyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  aiReadyText: { color: '#6B7280', fontSize: 11, fontFamily: fonts.regular },
  aiClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  aiMessages: { flex: 1 },
  aiBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  aiBubbleRowMe: { justifyContent: 'flex-end' },
  aiBubbleRowAi: { justifyContent: 'flex-start' },
  aiMiniIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  aiBubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  aiBubbleMe: { backgroundColor: ORANGE, borderTopRightRadius: 4 },
  aiBubbleAi: { backgroundColor: '#F3F4F6', borderTopLeftRadius: 4 },
  aiBubbleText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  aiBubbleTextMe: { color: '#FFFFFF' },
  aiBubbleTextAi: { color: '#374151' },
  aiChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  aiChip: { borderWidth: 1, borderColor: '#FDBA74', backgroundColor: '#FFF7ED', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  aiChipText: { color: '#EA580C', fontSize: 12, fontFamily: fonts.semiBold },
  aiInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  aiInput: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', borderRadius: 999, paddingHorizontal: 14, minHeight: 44, fontSize: 13, fontFamily: fonts.regular, color: '#111827' },
  aiSend: { width: 44, height: 44, borderRadius: 22, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
});
