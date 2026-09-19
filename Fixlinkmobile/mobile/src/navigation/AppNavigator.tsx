// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable, StatusBar, Modal, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import PasswordResetScreen from '../screens/auth/PasswordResetScreen';
import DashboardScreen from '../screens/customer/DashboardScreen';
import SubmitRequestScreen from '../screens/customer/SubmitRequestScreen';
import RequestProgressScreen from '../screens/customer/RequestProgressScreen';
import RequestDetailsScreen from '../screens/customer/RequestDetailsScreen';
import CustomerProfileScreen from '../screens/customer/CustomerProfileScreen';
import ChatScreen from '../screens/customer/ChatScreen';
import MapTrackerScreen from '../screens/shared/MapTrackerScreen';
import TechnicianTrackerScreen from '../screens/shared/TechnicianTrackerScreen';
import AvailableJobsScreen from '../screens/technician/AvailableJobsScreen';
import TechnicianProfileScreen from '../screens/technician/TechnicianProfileScreen';
import { fetchNotifications, fetchUnreadMessageNotifications, setAuthToken, updateCustomerProfile, markJobMessagesRead, markNotificationRead, fetchJobById } from '../screens/services/api';
import { fonts } from '../theme';
import MessageBanner from '../components/MessageBanner';

const colors = { ink: '#102A43', teal: '#0F766E', canvas: '#F5F8FA', white: '#FFFFFF', muted: '#5A7A91', line: '#D9E2EC' };

const formatNotificationTime = (iso) => {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Just now';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
};

export default function AppNavigator() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [customerTab, setCustomerTab] = useState('dashboard');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [technicianTab, setTechnicianTab] = useState('jobs');
  const [selectedJobForMap, setSelectedJobForMap] = useState(null);
  const [selectedChatTarget, setSelectedChatTarget] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatNotifications, setChatNotifications] = useState([]);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [notifDetailError, setNotifDetailError] = useState(null);
  const [notifNavLoading, setNotifNavLoading] = useState(null);
  const [acceptedOnlyProgress, setAcceptedOnlyProgress] = useState(false);
  const [customerFocusedJobId, setCustomerFocusedJobId] = useState(null);
  const [technicianHighlightedJobId, setTechnicianHighlightedJobId] = useState(null);
  const [viewedTechnician, setViewedTechnician] = useState(null);
  const [recoveryParams, setRecoveryParams] = useState(null);
  const [banner, setBanner] = useState(null);
  const [activeChatJobId, setActiveChatJobId] = useState(null);
  const bannerRef = useRef(null);
  const activeChatJobIdRef = useRef(null);
  const seenNotifIdsRef = useRef(new Set());
  const bootstrappedRef = useRef(false);
  const bannerQueueRef = useRef([]);

  useEffect(() => {
    const handleRecoveryUrl = (url) => {
      if (typeof url === 'string' && url.startsWith('fixlink://recovery')) {
        const parsed = Linking.parse(url);
        setRecoveryParams(parsed.queryParams || {});
        setAuthMode('resetPassword');
      }
    };

    Linking.getInitialURL().then(handleRecoveryUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleRecoveryUrl(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!user?.uid || !user?.role) {
      setChatNotifications([]);
      bootstrappedRef.current = false;
      seenNotifIdsRef.current.clear();
      bannerQueueRef.current.length = 0;
      bannerRef.current = null;
      setBanner(null);
      setSelectedNotification(null);
      setNotifDetailError(null);
      return undefined;
    }

    let isMounted = true;
    const loadNotifications = async () => {
      try {
        // Prefer new all-notifications endpoint (read+unread) for correct badge + two-step UX.
        // Fallback to legacy unread-only endpoint if new endpoint not yet deployed.
        let notifications = null;
        try {
          const all = await fetchNotifications();
          notifications = Array.isArray(all) ? all : [];
        } catch (_e) {
          const legacy = await fetchUnreadMessageNotifications(user.uid, user.role);
          notifications = Array.isArray(legacy) ? legacy : [];
          // legacy already filtered to unread, mark them as unread explicitly
          notifications = notifications.map((n) => ({ ...n, read: n.read === true ? true : false }));
        }
        if (!isMounted) return;
        const list = Array.isArray(notifications) ? notifications : [];
        // Sort newest first by timestamp
        list.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
        setChatNotifications(list);

        // Banner queue: only for unread, deduped
        if (!bootstrappedRef.current) {
          bootstrappedRef.current = true;
          list.forEach((n) => {
            const dedupKey = String(n.id || (n.type === 'job' ? `job-${n.id}` : n.messageId || ''));
            if (dedupKey) seenNotifIdsRef.current.add(dedupKey);
          });
          return;
        }

        list.forEach((n) => {
          if (n.read) return;
          const dedupKey = String(n.id || (n.type === 'job' ? `job-${n.id}` : n.messageId || ''));
          if (!dedupKey || seenNotifIdsRef.current.has(dedupKey)) return;
          seenNotifIdsRef.current.add(dedupKey);
          if (n.jobId && n.jobId === activeChatJobIdRef.current && n.type === 'chat') return;
          if (bannerRef.current) {
            bannerQueueRef.current.push(n);
          } else {
            bannerRef.current = n;
            setBanner(n);
          }
        });
      } catch (error) {
        console.warn('Unable to refresh chat notifications:', error);
      }
    };

    seenNotifIdsRef.current.clear();
    bannerQueueRef.current.length = 0;
    bannerRef.current = null;
    setBanner(null);
    bootstrappedRef.current = false;
    loadNotifications();
    const intervalId = setInterval(loadNotifications, 10000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [user?.uid, user?.role]);

  useEffect(() => {
    activeChatJobIdRef.current = activeChatJobId;
  }, [activeChatJobId]);

  // Keep selectedNotification in sync with updated read status from poll
  useEffect(() => {
    if (!selectedNotification) return;
    const updated = chatNotifications.find((n) => n.id === selectedNotification.id);
    if (updated && updated.read !== selectedNotification.read) {
      setSelectedNotification(updated);
    }
  }, [chatNotifications]);

  const handleLogout = () => { 
    setAuthToken(null);
    setUser(null); 
    setCustomerTab('dashboard'); 
    setTechnicianTab('jobs'); 
    setSelectedJobForMap(null); 
    setSelectedChatTarget(null);
    setViewedTechnician(null);
    setCustomerFocusedJobId(null);
    setTechnicianHighlightedJobId(null);
    setActiveChatJobId(null);
    setBanner(null);
    setChatNotifications([]);
    setSelectedNotification(null);
    setNotifDetailError(null);
    setAuthMode('login'); 
  };
  const handleCustomerProfileUpdate = async (profile) => {
    setAuthToken(user.idToken);
    const updatedUser = await updateCustomerProfile(user.uid, profile);
    setUser((currentUser) => ({ ...currentUser, ...updatedUser }));
  };
  const isCustomer = user?.role === 'customer';
  const customerTabs = [
    { key: 'dashboard', label: 'Home', icon: 'home' },
    { key: 'progress', label: 'Requests', icon: 'receipt' },
    { key: 'chat', label: 'Messages', icon: 'chatbubble-ellipses' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ];
  const techTabs = [
    { key: 'jobs', label: 'Jobs', icon: 'briefcase' },
    { key: 'map', label: 'Map', icon: 'map' },
    { key: 'chat', label: 'Messages', icon: 'chatbubble-ellipses' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ];

  if (!user) return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      {authMode === 'login' ? <LoginScreen onLoginSuccess={setUser} switchToRegister={() => setAuthMode('register')} switchToForgotPassword={() => setAuthMode('forgotPassword')} /> : authMode === 'register' ? <RegisterScreen switchToLogin={() => setAuthMode('login')} /> : authMode === 'resetPassword' ? <PasswordResetScreen params={recoveryParams} switchToLogin={() => setAuthMode('login')} /> : <ForgotPasswordScreen switchToLogin={() => setAuthMode('login')} />}
    </SafeAreaView>
  );

  const activeTab = isCustomer ? customerTab : technicianTab;
  const setTab = isCustomer ? setCustomerTab : setTechnicianTab;
  const navItems = isCustomer ? customerTabs : techTabs;
  const unreadCount = chatNotifications.filter((n) => !n.read).length;

  const dequeueBanner = () => {
    const next = bannerQueueRef.current.shift() || null;
    bannerRef.current = next;
    setBanner(next);
  };

  const dismissBanner = () => dequeueBanner();

  const openBannerNotification = (notification) => {
    if (!notification) return;
    dequeueBanner();
    if (notification.type === 'job') {
      if (isCustomer) {
        setAcceptedOnlyProgress(true);
        setCustomerTab('progress');
      } else {
        setTechnicianTab('jobs');
      }
      return;
    }
    setSelectedChatTarget({
      id: notification.jobId,
      customerName: isCustomer ? user.name : notification.senderName,
      technicianName: isCustomer ? notification.senderName : undefined,
    });
    markJobMessagesRead(notification.jobId, user.uid).catch((error) => console.warn('Unable to mark banner chat read:', error));
    // Also mark notification read if unread
    if (!notification.read && notification.id) {
      markNotificationRead(notification.id).catch(() => {});
      setChatNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n));
    }
    setTab('chat');
  };

  const handleNotificationPress = async (notification) => {
    const isFirstClick = !selectedNotification || String(selectedNotification.id) !== String(notification.id);
    if (isFirstClick) {
      // First click -> show details + mark read if unread (immediate badge update)
      setSelectedNotification(notification);
      setNotifDetailError(null);
      if (!notification.read) {
        // optimistic UI: decrease badge immediately by 1, never negative
        setChatNotifications((prev) => prev.map((n) => String(n.id) === String(notification.id) ? { ...n, read: true, readAt: new Date().toISOString() } : n));
        void markNotificationRead(notification.id).catch((error) => {
          const status = error?.response?.status ?? error?.status;
          const isNotFound = status === 404 || String(error?.message || '').includes('404') || String(error?.error || '').toLowerCase().includes('not found');
          if (isNotFound) {
            // Row may have been cascade-deleted with its job (spec says keep notification available) or backend not yet deployed.
            // Keep optimistic read state – do not revert, do not spam console, do not show error.
            return;
          }
          console.warn('Unable to mark notification read:', error);
          // revert on failure so badge stays synced; backend will still show unread on next poll
          setChatNotifications((prev) => prev.map((n) => String(n.id) === String(notification.id) ? { ...n, read: false, readAt: null } : n));
          setNotifDetailError('Could not mark as read. Please check your connection.');
        });
      }
      return;
    }

    // Second click on same notification -> navigate to exact destination
    if (!notification.jobId) {
      setNotifDetailError('This notification has no related request to open.');
      return;
    }
    if (notifNavLoading) return;
    setNotifNavLoading(notification.id);
    setNotifDetailError(null);
    try {
      let job = null;
      try {
        const fetched = await fetchJobById(notification.jobId);
        job = fetched;
      } catch (fetchError) {
        const msg = String(fetchError?.error || fetchError?.message || '');
        if (/not found/i.test(msg) || /job not found/i.test(msg)) {
          setNotifDetailError('The related request no longer exists. It may have been deleted. The notification has been kept for your records.');
          return;
        }
        if (/not authorized/i.test(msg) || /permission/i.test(msg)) {
          setNotifDetailError('You no longer have permission to view this request.');
          return;
        }
        // For network errors, still show generic but keep notification
        if (msg) {
          setNotifDetailError(msg);
        } else {
          setNotifDetailError('Unable to open the related request. Please try again.');
        }
        return;
      }

      // job fetched successfully; now role-aware navigation using actual job/request ID
      if (notification.type === 'chat') {
        // New Message -> direct to Chat screen exact conversation/thread
        setSelectedChatTarget({
          id: notification.jobId,
          jobId: notification.jobId,
          customerName: isCustomer ? user.name : notification.senderName,
          technicianName: isCustomer ? notification.senderName : undefined,
          applianceType: job?.applianceType || job?.appliance_type || 'Repair Job',
          status: job?.status || 'Active',
        });
        // Ensure inbox sync: markJobMessagesRead already called via notification read, but ensure
        try { await markJobMessagesRead(notification.jobId, user.uid); } catch (_) {}
        setTab('chat');
        setNotificationsOpen(false);
        setSelectedNotification(null);
        setNotifDetailError(null);
        return;
      }

      // type === 'job' : covers Request Update / Request Accepted / Request Completed
      // All use actual job/request ID; destination based on status and role via existing workflow
      if (isCustomer) {
        const statusKey = String(job.status || '').toLowerCase();
        if (statusKey === 'completed') {
          // Customer Request Completed → exact completed job in Progress with review accessible
          setCustomerFocusedJobId(job.id);
          setTechnicianHighlightedJobId(null);
          setAcceptedOnlyProgress(false);
          setCustomerTab('progress');
          setNotificationsOpen(false);
          setSelectedNotification(null);
          setNotifDetailError(null);
          return;
        }
        // Request Update / Request Accepted → exact request details
        setCustomerFocusedJobId(null);
        setSelectedRequest(job);
        setCustomerTab('details');
        setNotificationsOpen(false);
        setSelectedNotification(null);
        setNotifDetailError(null);
        return;
      } else {
        // Technician job notification → exact job highlighted in AvailableJobsScreen
        setTechnicianHighlightedJobId(job.id);
        setCustomerFocusedJobId(null);
        setTechnicianTab('jobs');
        setNotificationsOpen(false);
        setSelectedNotification(null);
        setNotifDetailError(null);
        return;
      }
    } finally {
      setNotifNavLoading(null);
    }
  };

  const handleCloseNotifications = () => {
    setNotificationsOpen(false);
    // keep selected for next open? Reset after close delay to avoid flicker
    setTimeout(() => {
      setSelectedNotification(null);
      setNotifDetailError(null);
      setNotifNavLoading(null);
    }, 200);
  };

  const screen = isCustomer ? (
    customerTab === 'dashboard' ? <DashboardScreen user={user} notificationCount={unreadCount} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToSubmit={() => setCustomerTab('submit')} onNavigateToProgress={() => { setAcceptedOnlyProgress(false); setCustomerTab('progress'); }} onTrackAcceptedJob={() => { setAcceptedOnlyProgress(true); setCustomerTab('progress'); }} onOpenRequest={(req) => { setSelectedRequest(req); setCustomerTab('details'); }} /> :
    customerTab === 'submit' ? <SubmitRequestScreen currentUser={user} customerName={user.name} onNavigateToProgress={() => setCustomerTab('progress')} /> :
    customerTab === 'details' ? <RequestDetailsScreen request={selectedRequest} onBack={() => setCustomerTab('progress')} onMessageTechnician={() => { setSelectedChatTarget(selectedRequest); setCustomerTab('chat'); }} onTrackMap={(req) => { setSelectedRequest(req); setCustomerTab('map'); }} /> :
    customerTab === 'progress' ? <RequestProgressScreen customerName={user.name} customerUid={user.uid} acceptedOnly={acceptedOnlyProgress} focusedJobId={customerFocusedJobId} autoExpandReview={Boolean(customerFocusedJobId)} onViewDetails={(req) => { setSelectedRequest(req); setCustomerTab('details'); }} onTrackMap={(req) => { setSelectedRequest(req); setCustomerTab('map'); }} onViewTechnicianProfile={(tech) => { setViewedTechnician({ uid: tech.uid, name: tech.name }); setCustomerTab('techProfile'); }} onMessageTechnician={(req, tech) => { setSelectedChatTarget({ id: req.id, technicianName: tech.name, applianceType: req.applianceType, status: req.status }); setCustomerTab('chat'); }} /> :
    customerTab === 'techProfile' ? <TechnicianProfileScreen technician={viewedTechnician || {}} readOnly onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'map' ? <MapTrackerScreen currentUser={user} selectedJob={selectedRequest} onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'profile' ? <CustomerProfileScreen user={user} onLogout={handleLogout} onUpdateProfile={handleCustomerProfileUpdate} /> : 
    <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} />
  ) : (
    technicianTab === 'jobs' ? <AvailableJobsScreen technician={user} notificationCount={unreadCount} highlightedJobId={technicianHighlightedJobId} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToMap={(job) => { setSelectedJobForMap(job); setTechnicianTab('map'); }} onNavigateToChat={(job) => { setSelectedChatTarget(job); setTechnicianTab('chat'); }} /> : 
    technicianTab === 'map' ? <TechnicianTrackerScreen currentUser={user} selectedJob={selectedJobForMap} onNavigateToJobs={() => setTechnicianTab('jobs')} /> : 
    technicianTab === 'chat' ? <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} /> :
    <TechnicianProfileScreen technician={user} onLogout={handleLogout} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      
      <MessageBanner banner={banner} onDismiss={dismissBanner} onPress={() => banner && openBannerNotification(banner)} />

      <View style={styles.screenContainer}>{screen}</View>

      <Modal visible={notificationsOpen} transparent animationType="fade" onRequestClose={handleCloseNotifications}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleCloseNotifications}>
          <TouchableOpacity style={styles.notificationPanel} activeOpacity={1}>
            <View style={styles.panelHeader}><View><Text style={styles.panelKicker}>FIXLINK UPDATES</Text><Text style={styles.panelTitle}>Notifications</Text></View><TouchableOpacity style={styles.closeButton} onPress={handleCloseNotifications}><Ionicons name="close" size={18} color={colors.ink} /></TouchableOpacity></View>

            {/* Detail card: first click shows details */}
            {selectedNotification ? (
              <View style={styles.detailCard}>
                <View style={styles.detailHeader}>
                  <View style={[styles.detailIcon, selectedNotification.type === 'job' ? styles.noticeIconGold : null]}><Ionicons name={selectedNotification.type === 'job' ? 'construct' : 'chatbubble-ellipses'} size={16} color={colors.teal} /></View>
                  <View style={styles.detailHeaderCopy}>
                    <Text style={styles.detailTitle}>{selectedNotification.type === 'job' ? (selectedNotification.senderName ? `${selectedNotification.senderName} · request update` : 'Request update') : `New message from ${selectedNotification.senderName}`}</Text>
                    <Text style={styles.detailSub}>{selectedNotification.read ? 'Read • ' : 'Unread • '}{formatNotificationTime(selectedNotification.timestamp)}{selectedNotification.jobId ? ` • #${String(selectedNotification.jobId).slice(0,6).toUpperCase()}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedNotification(null); setNotifDetailError(null); }} style={styles.detailClose}><Ionicons name="close" size={14} color={colors.muted} /></TouchableOpacity>
                </View>
                <Text style={styles.detailText}>{selectedNotification.text}</Text>
                {selectedNotification.jobId ? <Text style={styles.detailMeta}>Tap again to open {selectedNotification.type === 'chat' ? 'conversation' : 'request'} #{String(selectedNotification.jobId).slice(0,6).toUpperCase()}</Text> : <Text style={styles.detailMeta}>No related request to open.</Text>}
                {notifNavLoading === selectedNotification.id ? <View style={styles.detailLoading}><ActivityIndicator size="small" color={colors.teal} /><Text style={styles.detailLoadingText}>Opening…</Text></View> : null}
                {notifDetailError ? <View style={styles.detailError}><Ionicons name="alert-circle-outline" size={14} color="#B91C1C" /><Text style={styles.detailErrorText}>{notifDetailError}</Text></View> : null}
                <View style={styles.detailActions}>
                  <Pressable onPress={() => selectedNotification && handleNotificationPress(selectedNotification)} style={({ pressed }) => [styles.detailPrimary, pressed && { opacity: 0.85 }]}><Text style={styles.detailPrimaryText}>{selectedNotification.type === 'chat' ? 'Open conversation' : 'Open request'}</Text><Ionicons name="arrow-forward" size={14} color={colors.white} /></Pressable>
                  <Pressable onPress={() => { setSelectedNotification(null); setNotifDetailError(null); }} style={({ pressed }) => [styles.detailSecondary, pressed && { opacity: 0.85 }]}><Text style={styles.detailSecondaryText}>Close</Text></Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.notifList}>
              {chatNotifications.length === 0 ? (
                <View style={styles.emptyNotif}><Ionicons name="notifications-outline" size={20} color={colors.muted} /><Text style={styles.emptyNotifText}>No notifications yet</Text><Text style={styles.emptyNotifSub}>Updates about your requests and messages will appear here.</Text></View>
              ) : null}
              {chatNotifications.map((notification) => {
                const isJob = notification.type === 'job';
                const isSelected = selectedNotification && String(selectedNotification.id) === String(notification.id);
                const isRead = notification.read === true;
                return (
                  <TouchableOpacity
                    key={`${notification.jobId}-${notification.id}-${notification.messageId || ''}`}
                    style={[styles.notice, isSelected && styles.noticeSelected, isRead && styles.noticeRead]}
                    onPress={() => handleNotificationPress(notification)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.noticeIcon, isJob && styles.noticeIconGold, isRead && styles.noticeIconRead, isSelected && styles.noticeIconSelected]}><Ionicons name={isJob ? 'construct' : 'chatbubble-ellipses'} size={18} color={isRead ? colors.muted : colors.teal} /></View>
                    <View style={styles.noticeCopy}>
                      <Text style={[styles.noticeTitle, isRead && styles.noticeTitleRead]}>{isJob ? (notification.senderName ? `${notification.senderName} · request update` : 'Request update') : `New message from ${notification.senderName}`}</Text>
                      <Text style={[styles.noticeText, isRead && styles.noticeTextRead]} numberOfLines={2}>{notification.text}</Text>
                      <View style={styles.noticeMetaRow}>
                        <Text style={[styles.noticeTime, isRead && styles.noticeTimeRead]}>{isRead ? 'Read' : 'Unread'} • {formatNotificationTime(notification.timestamp)}</Text>
                        {isSelected ? <View style={styles.tapHint}><Text style={styles.tapHintText}>Tap again to open</Text></View> : null}
                      </View>
                    </View>
                    {!isRead ? <View style={styles.unreadDot} /> : null}
                  </TouchableOpacity>
                );
              })}
              <View style={styles.notice}><View style={styles.noticeIcon}><Ionicons name="checkmark-circle" size={19} color={colors.teal} /></View><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>You’re all set</Text><Text style={styles.noticeText}>Your FixLink account is ready for service requests.</Text><Text style={styles.noticeTime}>Just now</Text></View></View>
              <View style={styles.notice}><View style={[styles.noticeIcon, styles.noticeIconGold]}><Ionicons name="sparkles" size={18} color="#B7791F" /></View><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{isCustomer ? 'Need something fixed?' : 'New jobs nearby'}</Text><Text style={styles.noticeText}>{isCustomer ? 'Add a request and we’ll match you with a verified technician.' : 'Refresh your jobs feed to see the latest repair requests.'}</Text><Text style={styles.noticeTime}>Today</Text></View></View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <View style={styles.bottomNav}>{navItems.map((item) => { const active = activeTab === item.key || (item.key === 'progress' && ['submit', 'details', 'map', 'techProfile'].includes(activeTab)); return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label} tab`} accessibilityState={{ selected: active }} style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]} onPress={() => { if (isCustomer && item.key === 'progress') setAcceptedOnlyProgress(false); setTab(item.key); }}><View style={[styles.navIcon, active && styles.navIconActive]}><Ionicons name={active ? item.icon : `${item.icon}-outline`} size={20} color={active ? colors.teal : colors.muted} /></View><Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text></Pressable>; })}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas }, authContainer: { flex: 1, backgroundColor: colors.canvas }, screenContainer: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(16,42,67,0.26)', alignItems: 'flex-end', paddingTop: 86, paddingHorizontal: 16 }, notificationPanel: { width: '100%', maxWidth: 390, maxHeight: 560, backgroundColor: colors.white, borderRadius: 22, padding: 20, boxShadow: '0 12px 24px rgba(16,42,67,0.2)', elevation: 12 }, panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, panelKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 5 }, panelTitle: { color: colors.ink, fontSize: 23, fontFamily: fonts.bold }, closeButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  detailCard: { backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#B2E2D8', borderRadius: 16, padding: 14, marginBottom: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center' },
  detailHeaderCopy: { flex: 1 },
  detailTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  detailSub: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  detailClose: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  detailText: { color: colors.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginBottom: 8 },
  detailMeta: { color: colors.teal, fontSize: 11, fontFamily: fonts.semiBold, marginBottom: 10 },
  detailLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailLoadingText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  detailError: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  detailErrorText: { flex: 1, color: '#B91C1C', fontSize: 12, fontFamily: fonts.medium, lineHeight: 16 },
  detailActions: { flexDirection: 'row', gap: 8 },
  detailPrimary: { flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  detailPrimaryText: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },
  detailSecondary: { minHeight: 40, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  detailSecondaryText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  notifList: { maxHeight: 360 },
  emptyNotif: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  emptyNotifText: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  emptyNotifSub: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, textAlign: 'center', paddingHorizontal: 12, lineHeight: 15 },
  notice: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line, alignItems: 'center' }, noticeSelected: { backgroundColor: '#F0FDFA', borderRadius: 12, paddingHorizontal: 10, borderTopColor: 'transparent', marginVertical: 2, borderWidth: 1, borderColor: '#B2E2D8' }, noticeRead: { opacity: 0.72 }, noticeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center' }, noticeIconGold: { backgroundColor: '#FFF8E7' }, noticeIconRead: { backgroundColor: '#F1F5F9' }, noticeIconSelected: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#B2E2D8' }, noticeCopy: { flex: 1 }, noticeTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 4 }, noticeTitleRead: { color: colors.muted }, noticeText: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular }, noticeTextRead: { color: '#94A3B8' }, noticeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }, noticeTime: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold }, noticeTimeRead: { color: '#94A3B8', fontFamily: fonts.medium }, tapHint: { backgroundColor: colors.teal, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }, tapHintText: { color: colors.white, fontSize: 9, fontFamily: fonts.bold }, unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginLeft: 4 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 9, paddingBottom: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }, navItem: { alignItems: 'center', minWidth: 65, minHeight: 52, justifyContent: 'center' }, navItemPressed: { transform: [{ scale: 0.97 }], opacity: 0.94 }, navIcon: { width: 42, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, navIconActive: { backgroundColor: '#E6F6F3' }, navLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 3 }, navLabelActive: { color: colors.teal },
});
