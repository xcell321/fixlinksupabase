// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable, StatusBar, Modal, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from '../screens/auth/LoginScreen';
import SplashScreen from '../screens/auth/SplashScreen';
import VerifyPendingScreen from '../screens/auth/VerifyPendingScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import PasswordResetScreen from '../screens/auth/PasswordResetScreen';
import DashboardScreen from '../screens/customer/DashboardScreen';
import SubmitRequestScreen from '../screens/customer/SubmitRequestScreen';
import RequestProgressScreen from '../screens/customer/RequestProgressScreen';
import RequestDetailsScreen from '../screens/customer/RequestDetailsScreen';
import CustomerProfileScreen from '../screens/customer/CustomerProfileScreen';
import ChatScreen from '../screens/customer/ChatScreen';
import RateTechnicianScreen from '../screens/customer/RateTechnicianScreen';
import MapTrackerScreen from '../screens/shared/MapTrackerScreen';
import TechnicianTrackerScreen from '../screens/shared/TechnicianTrackerScreen';
import TechMapScreen from '../screens/technician/TechMapScreen';
import AvailableJobsScreen from '../screens/technician/AvailableJobsScreen';
import TechnicianProfileScreen from '../screens/technician/TechnicianProfileScreen';
import { fetchNotifications, fetchUnreadMessageNotifications, setAuthToken, updateCustomerProfile, markJobMessagesRead, markNotificationRead, fetchJobById } from '../screens/services/api';
import { colors, fonts } from '../theme';
import MessageBanner from '../components/MessageBanner';

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
  const [authMode, setAuthMode] = useState('splash');
  const [authRole, setAuthRole] = useState('customer');
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
  const [selectedJobForRate, setSelectedJobForRate] = useState(null);
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
    setSelectedJobForRate(null);
    setViewedTechnician(null);
    setCustomerFocusedJobId(null);
    setTechnicianHighlightedJobId(null);
    setActiveChatJobId(null);
    setBanner(null);
    setChatNotifications([]);
    setSelectedNotification(null);
    setNotifDetailError(null);
    setAuthMode('splash'); 
  };
  const handleCustomerProfileUpdate = async (profile) => {
    setAuthToken(user.idToken);
    const updatedUser = await updateCustomerProfile(user.uid, profile);
    setUser((currentUser) => ({ ...currentUser, ...updatedUser }));
  };
  const isCustomer = user?.role === 'customer';
  const roleAccent = isCustomer ? colors.customer : colors.tech;
  const roleSoft = isCustomer ? colors.customerSoft : colors.techSoft;
  const customerTabs = [
    { key: 'dashboard', label: 'Home', icon: 'home' },
    { key: 'progress', label: 'Repairs', icon: 'construct' },
    { key: 'chat', label: 'Chat', icon: 'chatbubble-ellipses' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ];
  // Reference TechNav: Jobs / Map / Message / Profile.
  const techTabs = [
    { key: 'jobs', label: 'Jobs', icon: 'briefcase' },
    { key: 'map', label: 'Map', icon: 'map' },
    { key: 'chat', label: 'Message', icon: 'chatbubble-ellipses' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ];

  if (!user) return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      {authMode === 'splash' ? <SplashScreen onGetStarted={() => { setAuthRole('customer'); setAuthMode('register'); }} onHaveAccount={() => setAuthMode('login')} /> : authMode === 'login' ? <LoginScreen onLoginSuccess={setUser} switchToRegister={(role) => { if (role) setAuthRole(role); setAuthMode('register'); }} switchToForgotPassword={(role) => { if (role) setAuthRole(role); setAuthMode('forgotPassword'); }} /> : authMode === 'register' ? <RegisterScreen key={authRole} initialRole={authRole} switchToLogin={() => setAuthMode('login')} onTechnicianPending={() => setAuthMode('verifyPending')} /> : authMode === 'verifyPending' ? <VerifyPendingScreen onBackToLogin={() => setAuthMode('login')} /> : authMode === 'resetPassword' ? <PasswordResetScreen params={recoveryParams} switchToLogin={() => setAuthMode('login')} /> : <ForgotPasswordScreen role={authRole} switchToLogin={() => setAuthMode('login')} />}
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

  const handleNotificationPress = (notification) => {
    const isFirstClick = !selectedNotification || String(selectedNotification.id) !== String(notification.id);
    // Tap row → show details + mark read. Navigation is explicit via Open button.
    if (isFirstClick) {
      setSelectedNotification(notification);
      setNotifDetailError(null);
      if (!notification.read) {
        setChatNotifications((prev) => prev.map((n) => String(n.id) === String(notification.id) ? { ...n, read: true, readAt: new Date().toISOString() } : n));
        void markNotificationRead(notification.id).catch((error) => {
          const status = error?.response?.status ?? error?.status;
          const isNotFound = status === 404 || String(error?.message || '').includes('404') || String(error?.error || '').toLowerCase().includes('not found');
          if (isNotFound) return;
          console.warn('Unable to mark notification read:', error);
          setChatNotifications((prev) => prev.map((n) => String(n.id) === String(notification.id) ? { ...n, read: false, readAt: null } : n));
          setNotifDetailError('Could not mark as read. Please check your connection.');
        });
      }
      return;
    }
    // Already selected — keep details visible; use Open button to navigate.
    setSelectedNotification(notification);
    setNotifDetailError(null);
  };

  const handleOpenNotification = async (notification) => {
    if (!notification) return;
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
        if (msg) setNotifDetailError(msg);
        else setNotifDetailError('Unable to open the related request. Please try again.');
        return;
      }
      if (notification.type === 'chat') {
        setSelectedChatTarget({
          id: notification.jobId,
          jobId: notification.jobId,
          customerName: isCustomer ? user.name : notification.senderName,
          technicianName: isCustomer ? notification.senderName : undefined,
          applianceType: job?.applianceType || job?.appliance_type || 'Repair Job',
          status: job?.status || 'Active',
        });
        try { await markJobMessagesRead(notification.jobId, user.uid); } catch (_) {}
        setTab('chat');
        setNotificationsOpen(false);
        setSelectedNotification(null);
        setNotifDetailError(null);
        return;
      }
      if (isCustomer) {
        const statusKey = String(job.status || '').toLowerCase();
        if (statusKey === 'completed') {
          setSelectedJobForRate(job);
          setTechnicianHighlightedJobId(null);
          setAcceptedOnlyProgress(false);
          setCustomerFocusedJobId(null);
          setCustomerTab('rate');
          setNotificationsOpen(false);
          setSelectedNotification(null);
          setNotifDetailError(null);
          return;
        }
        setCustomerFocusedJobId(null);
        setSelectedRequest(job);
        setCustomerTab('details');
        setNotificationsOpen(false);
        setSelectedNotification(null);
        setNotifDetailError(null);
        return;
      } else {
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
    customerTab === 'progress' ? <RequestProgressScreen customerName={user.name} customerUid={user.uid} acceptedOnly={acceptedOnlyProgress} focusedJobId={customerFocusedJobId} autoExpandReview={Boolean(customerFocusedJobId)} onViewDetails={(req) => { setSelectedRequest(req); setCustomerTab('details'); }} onTrackMap={(req) => { setSelectedRequest(req); setCustomerTab('map'); }} onViewTechnicianProfile={(tech) => { setViewedTechnician({ uid: tech.uid, name: tech.name }); setCustomerTab('techProfile'); }} onMessageTechnician={(req, tech) => { setSelectedChatTarget({ id: req.id, technicianName: tech.name, applianceType: req.applianceType, status: req.status }); setCustomerTab('chat'); }} onRate={(job) => { setSelectedJobForRate(job); setCustomerTab('rate'); }} /> :
    customerTab === 'rate' ? <RateTechnicianScreen job={selectedJobForRate || {}} customerName={user.name} onBack={() => setCustomerTab('progress')} onSubmitted={() => { setSelectedJobForRate(null); setCustomerFocusedJobId(null); setCustomerTab('progress'); }} /> :
    customerTab === 'techProfile' ? <TechnicianProfileScreen technician={viewedTechnician || {}} readOnly onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'map' ? <MapTrackerScreen currentUser={user} selectedJob={selectedRequest} onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'profile' ? <CustomerProfileScreen user={user} onLogout={handleLogout} onUpdateProfile={handleCustomerProfileUpdate} onNavigateToProgress={() => { setAcceptedOnlyProgress(false); setCustomerTab('progress'); }} onOpenNotifications={() => setNotificationsOpen(true)} /> : 
    <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} />
  ) : (
    technicianTab === 'jobs' ? <AvailableJobsScreen technician={user} notificationCount={unreadCount} highlightedJobId={technicianHighlightedJobId} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToMap={(job) => { setSelectedJobForMap(job); setTechnicianTab('map'); }} onNavigateToChat={(job) => { setSelectedChatTarget(job); setTechnicianTab('chat'); }} /> : 
    technicianTab === 'map' ? (selectedJobForMap ? <TechnicianTrackerScreen currentUser={user} selectedJob={selectedJobForMap} onNavigateToJobs={() => setSelectedJobForMap(null)} /> : <TechMapScreen technician={user} onOpenJob={(job) => { setTechnicianHighlightedJobId(job.id); setTechnicianTab('jobs'); }} />) : 
    technicianTab === 'chat' ? <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} /> :
    <TechnicianProfileScreen technician={user} onLogout={handleLogout} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      
      <MessageBanner banner={banner} onDismiss={dismissBanner} onPress={() => banner && openBannerNotification(banner)} />

      <View style={styles.screenContainer}>{screen}</View>

      <Modal visible={notificationsOpen} transparent animationType="slide" onRequestClose={handleCloseNotifications}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.backdropPress} onPress={handleCloseNotifications} />
          <View style={styles.notificationPanel}>
            <View style={styles.notifHeader}>
              <Pressable style={styles.notifBackBtn} onPress={handleCloseNotifications} hitSlop={12}>
                <Ionicons name="arrow-back" size={20} color={colors.ink} />
              </Pressable>
              <Text style={styles.notifHeaderTitle}>Notifications</Text>
              <View style={{ width: 32 }} />
            </View>

            <View style={styles.notifTopBar}>
              <View>
                <Text style={styles.unreadCount}>{unreadCount} unread update{unreadCount !== 1 ? 's' : ''}</Text>
              </View>
              {unreadCount > 0 && (
                <Pressable onPress={() => {
                  chatNotifications.forEach(n => {
                    if (!n.read && n.id) {
                      markNotificationRead(n.id).catch(() => {});
                    }
                  });
                  setChatNotifications(prev => prev.map(n => ({ ...n, read: true })));
                }}>
                  <Text style={[styles.markAllRead, { color: roleAccent }]}>Mark all as read</Text>
                </Pressable>
              )}
            </View>

            {/* Detail card: first click shows details */}
            {selectedNotification ? (
              <View style={styles.detailCard}>
                <View style={styles.detailCardTop}>
                  <View style={[
                    styles.detailIcon,
                    { backgroundColor: selectedNotification.type === 'job'
                        ? (isCustomer ? colors.customer : colors.tech)
                        : (isCustomer ? colors.tech : '#6366F1') },
                  ]}>
                    <Ionicons name={selectedNotification.type === 'job' ? 'construct' : 'chatbubble-ellipses'} size={18} color={colors.white} />
                  </View>
                  <View style={styles.detailCardCopy}>
                    <Text style={styles.detailTitle}>{selectedNotification.type === 'job' ? (selectedNotification.senderName ? `${selectedNotification.senderName} · request update` : 'Request update') : `New message from ${selectedNotification.senderName}`}</Text>
                    <Text style={styles.detailSub}>{formatNotificationTime(selectedNotification.timestamp)}</Text>
                  </View>
                </View>
                <Text style={styles.detailText}>{selectedNotification.text}</Text>
                {notifDetailError ? (
                  <View style={styles.detailError}>
                    <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                    <Text style={styles.detailErrorText}>{notifDetailError}</Text>
                  </View>
                ) : null}
                <View style={styles.detailActions}>
                  <Pressable
                    onPress={() => selectedNotification && handleOpenNotification(selectedNotification)}
                    disabled={notifNavLoading === selectedNotification.id}
                    style={({ pressed }) => [styles.detailPrimary, { backgroundColor: roleAccent }, pressed && { opacity: 0.9 }]}
                  >
                    {notifNavLoading === selectedNotification.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Text style={styles.detailPrimaryText}>{selectedNotification.type === 'chat' ? 'View conversation' : 'View request'}</Text>
                        <Ionicons name="arrow-forward" size={14} color={colors.white} style={{ marginLeft: 6 }} />
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => { setSelectedNotification(null); setNotifDetailError(null); }}
                    style={({ pressed }) => [styles.detailSecondary, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.detailSecondaryText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.notifList} contentContainerStyle={styles.notifListContent}>
              {chatNotifications.length === 0 ? (
                <View style={styles.emptyNotif}>
                  <Ionicons name="notifications-outline" size={28} color={colors.muted} />
                  <Text style={styles.emptyNotifText}>No notifications</Text>
                  <Text style={styles.emptyNotifSub}>Updates about your requests will appear here</Text>
                </View>
              ) : (
                chatNotifications.map((notification) => {
                  const isJob = notification.type === 'job';
                  const isRead = notification.read === true;
                  return (
                    <Pressable
                      key={`${notification.jobId}-${notification.id}-${notification.messageId || ''}`}
                      style={[styles.notifCard, isRead && styles.notifCardRead]}
                      onPress={() => handleNotificationPress(notification)}
                    >
                      <View style={[
                        styles.notifIconBadge,
                        { backgroundColor: isJob
                            ? (isCustomer ? colors.customer : colors.tech)
                            : (isCustomer ? colors.tech : '#6366F1') },
                      ]}>
                        <Ionicons
                          name={isJob ? 'construct' : 'chatbubble-ellipses'}
                          size={20}
                          color={colors.white}
                        />
                      </View>

                      <View style={styles.notifCardContent}>
                        <Text style={[styles.notifCardTitle, isRead && styles.notifCardTitleRead]} numberOfLines={1}>
                          {notification.text.split('\n')[0] || (isJob ? 'Job Update' : 'New Message')}
                        </Text>
                        <Text style={[styles.notifCardDesc, isRead && styles.notifCardDescRead]} numberOfLines={2}>
                          {notification.text}
                        </Text>
                        <Text style={[styles.notifCardTime, isRead && styles.notifCardTimeRead]}>
                          {formatNotificationTime(notification.timestamp)}
                        </Text>
                      </View>

                      {!isRead && <View style={[styles.notifUnreadDot, { backgroundColor: roleAccent }]} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomNav}>{navItems.map((item) => { const active = activeTab === item.key || (item.key === 'progress' && ['submit', 'details', 'map', 'techProfile', 'rate'].includes(activeTab)); return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label} tab`} accessibilityState={{ selected: active }} style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]} onPress={() => { if (isCustomer && item.key === 'progress') setAcceptedOnlyProgress(false); setTab(item.key); }}><View style={[styles.navIcon, active && { backgroundColor: roleSoft }]}><Ionicons name={active ? item.icon : `${item.icon}-outline`} size={20} color={active ? roleAccent : colors.muted} /></View><Text style={[styles.navLabel, active && { color: roleAccent }]}>{item.label}</Text></Pressable>; })}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas }, authContainer: { flex: 1, backgroundColor: colors.canvas }, screenContainer: { flex: 1, width: '100%' as const, alignSelf: 'center' as const },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(16,42,67,0.4)', justifyContent: 'flex-end' },
  backdropPress: { flex: 1 },
  notificationPanel: { width: '100%', backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, maxHeight: '90%', elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  notifBackBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  notifHeaderTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, flex: 1, textAlign: 'center' },
  notifTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  unreadCount: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  markAllRead: { color: colors.customer, fontSize: 13, fontFamily: fonts.bold },

  detailCard: { backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, marginBottom: 16 },
  detailCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  detailIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  detailIconJob: { backgroundColor: colors.gold },
  detailIconChat: { backgroundColor: colors.tech },
  detailCardCopy: { flex: 1 },
  detailTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  detailSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  detailText: { color: colors.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginBottom: 12 },
  detailError: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  detailErrorText: { flex: 1, color: '#DC2626', fontSize: 12, fontFamily: fonts.medium, lineHeight: 16 },
  detailActions: { flexDirection: 'row', gap: 8 },
  detailPrimary: { flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  detailPrimaryText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  detailSecondary: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  detailSecondaryText: { color: colors.muted, fontSize: 13, fontFamily: fonts.semiBold },

  notifList: { maxHeight: 420 },
  notifListContent: { gap: 12, paddingBottom: 8 },
  emptyNotif: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyNotifText: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  emptyNotifSub: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18 },

  notifCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  notifCardRead: { opacity: 0.6 },
  notifIconBadge: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifIconJob: { backgroundColor: colors.customer },
  notifCardContent: { flex: 1, minWidth: 0 },
  notifCardTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold, marginBottom: 4 },
  notifCardTitleRead: { color: colors.muted },
  notifCardDesc: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, marginBottom: 6 },
  notifCardDescRead: { color: '#94A3B8' },
  notifCardTime: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  notifCardTimeRead: { color: '#94A3B8', fontFamily: fonts.regular },
  notifUnreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.customer, flexShrink: 0, marginTop: 2 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 9, paddingBottom: 8, paddingHorizontal: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, gap: 4 }, navItem: { alignItems: 'center', minWidth: 64, minHeight: 52, justifyContent: 'center', flex: 1, maxWidth: 120 }, navItemPressed: { transform: [{ scale: 0.97 }], opacity: 0.94 }, navIcon: { width: 42, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, navIconActive: { backgroundColor: '#E6F6F3' }, navLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 3, letterSpacing: 0.2 }, navLabelActive: { color: colors.teal, fontFamily: fonts.bold },
});
