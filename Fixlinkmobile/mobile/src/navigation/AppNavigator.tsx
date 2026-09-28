import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable, StatusBar, Modal, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { startOnlinePresence } from '../utils/onlinePresence';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from '../features/auth/LoginScreen';
import SplashScreen from '../features/auth/SplashScreen';
import VerifyPendingScreen from '../features/auth/VerifyPendingScreen';
import RegisterScreen from '../features/auth/RegisterScreen';
import ForgotPasswordScreen from '../features/auth/ForgotPasswordScreen';
import PasswordResetScreen from '../features/auth/PasswordResetScreen';
import DashboardScreen from '../features/customer/DashboardScreen';
import SubmitRequestScreen from '../features/customer/SubmitRequestScreen';
import RequestProgressScreen from '../features/customer/RequestProgressScreen';
import RequestDetailsScreen from '../features/customer/RequestDetailsScreen';
import CustomerProfileScreen from '../features/customer/CustomerProfileScreen';
import ChatScreen from '../features/customer/ChatScreen';
import RateTechnicianScreen from '../features/customer/RateTechnicianScreen';
import MapTrackerScreen from '../features/tracking/MapTrackerScreen';
import TechnicianTrackerScreen from '../features/tracking/TechnicianTrackerScreen';
import TechMapScreen from '../features/technician/TechMapScreen';
import AvailableJobsScreen from '../features/technician/AvailableJobsScreen';
import TechnicianProfileScreen from '../features/technician/TechnicianProfileScreen';
import { fetchNotifications, fetchUnreadMessageNotifications, setAuthToken, updateCustomerProfile, markJobMessagesRead, markNotificationRead, fetchJobById } from '../services/api';
import { colors, fonts, shadows } from '../theme';
import type { IconName } from '../utils/applianceIcons';
import MessageBanner from '../components/MessageBanner';

type NavTab = { key: string; label: string; icon: IconName };

type AuthRole = 'customer' | 'technician';

// Fields are optional because the API payload grows with the profile forms.
type SessionUser = {
  // Always present: a session without a uid is not a logged-in user.
  uid: string;
  id?: string;
  // The login/register response always carries a display name.
  name: string;
  email?: string;
  // The app only ever navigates customer and technician sessions.
  role: AuthRole;
  phone?: string;
  address?: string;
  idToken?: string;
  profileImage?: string | null;
  latitude?: number | string;
  longitude?: number | string;
};

// A job as held by the navigator. `id` is required: every screen that receives
// one uses it to act on the job (and RequestDetailsScreen requires it).
type SelectedJob = {
  id: string;
  status?: string;
  applianceType?: string;
  // Snake_case alias some endpoints still return; kept as a read fallback.
  appliance_type?: string;
  description?: string;
  location?: string;
  photoUrl?: string | null;
  verificationCode?: string;
  createdAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  technicianUid?: string;
  technicianName?: string;
  technicianRating?: number | string | null;
  technicianTotalReviews?: number | string | null;
  customerName?: string;
  preferredTime?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

// Notification row. The first three fields are required because the banner
// component requires them and the feed always renders `text`.
type NotificationItem = {
  id: string;
  senderName: string;
  text: string;
  jobId?: string;
  messageId?: string;
  type?: string;
  timestamp?: string;
  read?: boolean;
  readAt?: string | null;
};

type ChatTarget = {
  id?: string;
  jobId?: string;
  customerName?: string;
  technicianName?: string;
  applianceType?: string;
  status?: string;
};

type ViewedTechnician = { uid?: string; name?: string } | null;

type RecoveryParams = Record<string, string | undefined>;

// The screens declare the shapes they require internally. The navigator can
// only guarantee the session/job data it actually holds (a session always has
// a uid at runtime, but the type is optional), so these aliases keep the two
// sides honest without loosening the screens' own prop types.
type TechnicianScreenProp = Parameters<typeof TechnicianProfileScreen>[0]['technician'];
type RateJobProp = Parameters<typeof RateTechnicianScreen>[0]['job'];

const formatNotificationTime = (iso?: string | null): string => {
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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState('splash');
  const [authRole, setAuthRole] = useState<AuthRole>('customer');
  // Email from a technician registration, reused by the pending screen's
  // "Check Status" lookup so the applicant does not retype it.
  const [pendingTechEmail, setPendingTechEmail] = useState<string | null>(null);
  const [customerTab, setCustomerTab] = useState('dashboard');
  const [selectedRequest, setSelectedRequest] = useState<SelectedJob | null>(null);
  const [technicianTab, setTechnicianTab] = useState('jobs');
  const [selectedJobForMap, setSelectedJobForMap] = useState<SelectedJob | null>(null);
  const [selectedChatTarget, setSelectedChatTarget] = useState<ChatTarget | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatNotifications, setChatNotifications] = useState<NotificationItem[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [notifDetailError, setNotifDetailError] = useState<string | null>(null);
  const [notifNavLoading, setNotifNavLoading] = useState<string | null>(null);
  const [acceptedOnlyProgress, setAcceptedOnlyProgress] = useState(false);
  const [selectedJobForRate, setSelectedJobForRate] = useState<SelectedJob | null>(null);
  const [customerFocusedJobId, setCustomerFocusedJobId] = useState<string | null>(null);
  const [technicianHighlightedJobId, setTechnicianHighlightedJobId] = useState<string | null>(null);
  const [viewedTechnician, setViewedTechnician] = useState<ViewedTechnician>(null);
  const [recoveryParams, setRecoveryParams] = useState<RecoveryParams | null>(null);
  const [banner, setBanner] = useState<NotificationItem | null>(null);
  const [activeChatJobId, setActiveChatJobId] = useState<string | null>(null);
  const bannerRef = useRef<NotificationItem | null>(null);
  const activeChatJobIdRef = useRef<string | null>(null);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);
  const bannerQueueRef = useRef<NotificationItem[]>([]);

  useEffect(() => {
    const handleRecoveryUrl = (url: string | null | undefined) => {
      if (typeof url === 'string' && url.startsWith('fixlink://recovery')) {
        const parsed = Linking.parse(url);
        setRecoveryParams((parsed.queryParams || {}) as RecoveryParams);
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
    // Captured because property narrowing does not survive into a closure.
    const uid = user.uid;
    const role = user.role;
    const loadNotifications = async () => {
      try {
        // Prefer new all-notifications endpoint (read+unread) for correct badge + two-step UX.
        // Fallback to legacy unread-only endpoint if new endpoint not yet deployed.
        let notifications: NotificationItem[] | null = null;
        try {
          const all = await fetchNotifications();
          notifications = Array.isArray(all) ? (all as NotificationItem[]) : [];
        } catch (_e) {
          const legacy = await fetchUnreadMessageNotifications(uid, role);
          const legacyList: NotificationItem[] = Array.isArray(legacy) ? (legacy as NotificationItem[]) : [];
          // legacy already filtered to unread, mark them as unread explicitly
          notifications = legacyList.map((n) => ({ ...n, read: n.read === true ? true : false }));
        }
        if (!isMounted) return;
        const list: NotificationItem[] = Array.isArray(notifications) ? notifications : [];
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
  const handleCustomerProfileUpdate = async (profile: {
    name: string;
    phone: string;
    address: string;
    profileImage?: unknown;
  }) => {
    setAuthToken(user?.idToken ?? null);
    // The profile form may hold a freshly picked image asset; the API client
    // accepts either that or an already-uploaded URL.
    const updatedUser = await updateCustomerProfile(user?.uid as string, profile as Parameters<typeof updateCustomerProfile>[1]);
    setUser((currentUser) => ({ ...currentUser, ...(updatedUser as SessionUser) }));
  };
  // Announce this session as online for as long as the app is open, so peers
  // only ever see a green dot when the other person is really using the app.
  // ChatScreen is unmounted on other tabs, so presence lives here.
  useEffect(() => {
    if (!user?.uid) return undefined;
    return startOnlinePresence({ uid: user.uid, name: user.name });
  }, [user?.uid, user?.name]);

  // Keep the session in step with the technician's saved profile so the Jobs
  // header (service area) and avatar reflect an edit without a re-login.
  const handleTechnicianProfileUpdate = (updated: unknown): void => {
    setUser((currentUser) => ({ ...currentUser, ...(updated as SessionUser) }));
  };
  const isCustomer = user?.role === 'customer';
  const roleAccent = isCustomer ? colors.customer : colors.tech;
  const roleSoft = isCustomer ? colors.customerSoft : colors.techSoft;
  const customerTabs: NavTab[] = [
    { key: 'dashboard', label: 'Home', icon: 'home' },
    { key: 'progress', label: 'Repairs', icon: 'construct' },
    { key: 'chat', label: 'Chat', icon: 'chatbubble-ellipses' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ];
  // Reference TechNav: Jobs / Map / Message / Profile.
  const techTabs: NavTab[] = [
    { key: 'jobs', label: 'Jobs', icon: 'briefcase' },
    { key: 'map', label: 'Map', icon: 'map' },
    { key: 'chat', label: 'Message', icon: 'chatbubble-ellipses' },
    { key: 'profile', label: 'Profile', icon: 'person' },
  ];

  if (!user) return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      {authMode === 'splash' ? <SplashScreen onGetStarted={() => { setAuthRole('customer'); setAuthMode('register'); }} onHaveAccount={() => setAuthMode('login')} /> : authMode === 'login' ? <LoginScreen onLoginSuccess={(session) => setUser(session as SessionUser)} switchToRegister={(role) => { if (role) setAuthRole(role); setAuthMode('register'); }} switchToForgotPassword={(role) => { if (role) setAuthRole(role); setAuthMode('forgotPassword'); }} /> : authMode === 'register' ? <RegisterScreen key={authRole} initialRole={authRole} switchToLogin={() => setAuthMode('login')} onTechnicianPending={(email) => { setPendingTechEmail(email); setAuthMode('verifyPending'); }} onRegistered={(registered) => setUser(registered as SessionUser)} /> : authMode === 'verifyPending' ? <VerifyPendingScreen email={pendingTechEmail} onBackToLogin={() => setAuthMode('login')} /> : authMode === 'resetPassword' ? <PasswordResetScreen params={recoveryParams} switchToLogin={() => setAuthMode('login')} /> : <ForgotPasswordScreen role={authRole} switchToLogin={() => setAuthMode('login')} />}
    </SafeAreaView>
  );

  const activeTab = isCustomer ? customerTab : technicianTab;
  const setTab = isCustomer ? setCustomerTab : setTechnicianTab;
  const navItems = isCustomer ? customerTabs : techTabs;
  const unreadCount = chatNotifications.filter((n) => !n.read).length;
  // Unread updates lead the feed; already-seen rows are grouped below them.
  const unreadNotifications = chatNotifications.filter((n) => n.read !== true);
  const readNotifications = chatNotifications.filter((n) => n.read === true);

  const dequeueBanner = () => {
    const next = bannerQueueRef.current.shift() || null;
    bannerRef.current = next;
    setBanner(next);
  };

  const dismissBanner = () => dequeueBanner();

  const openBannerNotification = (notification: NotificationItem | null) => {
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
    markJobMessagesRead(notification.jobId as string, user?.uid as string).catch((error) => console.warn('Unable to mark banner chat read:', error));
    // Also mark notification read if unread
    if (!notification.read && notification.id) {
      markNotificationRead(notification.id).catch(() => {});
      setChatNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n));
    }
    setTab('chat');
  };

  const handleNotificationPress = (notification?: NotificationItem | null) => {
    // One-tap direct: mark read, then navigate straight to the related job/chat.
    if (!notification || notifNavLoading) return;
    if (!notification.read) {
      setChatNotifications((prev) => prev.map((n) => String(n.id) === String(notification.id) ? { ...n, read: true, readAt: new Date().toISOString() } : n));
      void markNotificationRead(notification.id).catch((error) => {
        const status = error?.response?.status ?? error?.status;
        const isNotFound = status === 404 || String(error?.message || '').includes('404') || String(error?.error || '').toLowerCase().includes('not found');
        if (isNotFound) return;
        console.warn('Unable to mark notification read:', error);
        setChatNotifications((prev) => prev.map((n) => String(n.id) === String(notification.id) ? { ...n, read: false, readAt: null } : n));
      });
    }
    void handleOpenNotification(notification);
  };

  const handleOpenNotification = async (notification?: NotificationItem | null) => {
    if (!notification) return;
    if (!notification.jobId) {
      Alert.alert('No related request', 'This notification has no related request to open.');
      return;
    }
    if (notifNavLoading) return;
    setNotifNavLoading(notification.id);
    setNotifDetailError(null);
    try {
      let job: SelectedJob | null = null;
      try {
        const fetched = await fetchJobById(notification.jobId);
        job = fetched as SelectedJob;
      } catch (fetchError) {
        const failure = fetchError as { error?: string; message?: string } | null;
        const msg = String(failure?.error || failure?.message || '');
        if (/not found/i.test(msg) || /job not found/i.test(msg)) {
          Alert.alert('Request gone', 'The related request no longer exists. It may have been deleted.');
          return;
        }
        if (/not authorized/i.test(msg) || /permission/i.test(msg)) {
          Alert.alert('Not allowed', 'You no longer have permission to view this request.');
          return;
        }
        Alert.alert('Unable to open', msg || 'Unable to open the related request. Please try again.');
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
        try { await markJobMessagesRead(notification.jobId as string, user?.uid as string); } catch (_) {}
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

  // One feed row. It leads with who sent it (avatar initials + name) so a
  // technician's message reads like that person rather than a system alert.
  // Every value comes from the payload and the signed-in role — no per-entry
  // styling or fake content.
  const renderNotification = (notification: NotificationItem) => {
    const isJob = notification.type === 'job';
    const isRead = notification.read === true;
    const senderName = String(notification.senderName || '').trim() || (isJob ? 'Request update' : 'New message');
    const initial = senderName.charAt(0).toUpperCase();
    const preview = String(notification.text || '').trim();
    // The sender is always the other party: a customer is messaged by technicians.
    const avatarBg = isCustomer ? colors.techSoft : colors.customerSoft;
    const badgeBg = isCustomer ? colors.techDark : colors.customerDark;

    return (
      <Pressable
        key={`${notification.jobId}-${notification.id}-${notification.messageId || ''}`}
        style={({ pressed }) => [
          styles.notifCard,
          isRead ? styles.notifCardRead : styles.notifCardUnread,
          pressed && styles.notifCardPressed,
        ]}
        onPress={() => handleNotificationPress(notification)}
        accessibilityRole="button"
        accessibilityLabel={`${isRead ? '' : 'Unread '}${isJob ? 'request update' : 'message'} from ${senderName}: ${preview}`}
      >
        <View style={styles.notifAvatarWrap}>
          <View style={[styles.notifAvatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.notifAvatarText}>{initial}</Text>
          </View>
          <View style={[styles.notifTypeBadge, { backgroundColor: badgeBg }]}>
            <Ionicons name={isJob ? 'construct' : 'chatbubble-ellipses'} size={10} color={colors.white} />
          </View>
        </View>

        <View style={styles.notifCardContent}>
          <View style={styles.notifCardTopRow}>
            <Text style={[styles.notifSender, isRead && styles.notifSenderRead]} numberOfLines={1}>{senderName}</Text>
            <Text style={styles.notifCardTime}>{formatNotificationTime(notification.timestamp)}</Text>
          </View>
          <Text style={styles.notifPreview} numberOfLines={2}>{preview}</Text>
        </View>

        {notifNavLoading === notification.id
          ? <ActivityIndicator size="small" color={roleAccent} />
          : (!isRead ? <View style={[styles.notifUnreadDot, { backgroundColor: roleAccent }]} /> : null)}
      </Pressable>
    );
  };

  const screen = isCustomer ? (
    customerTab === 'dashboard' ? <DashboardScreen user={user} notificationCount={unreadCount} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToSubmit={() => setCustomerTab('submit')} onNavigateToProgress={() => { setAcceptedOnlyProgress(false); setCustomerTab('progress'); }} onTrackAcceptedJob={() => { setAcceptedOnlyProgress(true); setCustomerTab('progress'); }} onOpenRequest={(req) => { setSelectedRequest(req as SelectedJob); setCustomerTab('details'); }} /> :
    customerTab === 'submit' ? <SubmitRequestScreen currentUser={user} customerName={user?.name as string} onNavigateToProgress={() => setCustomerTab('progress')} onClose={() => setCustomerTab('dashboard')} /> :
    customerTab === 'details' ? <RequestDetailsScreen request={selectedRequest} onBack={() => setCustomerTab('progress')} onMessageTechnician={() => { setSelectedChatTarget(selectedRequest); setCustomerTab('chat'); }} onTrackMap={(req) => { setSelectedRequest(req); setCustomerTab('map'); }} onViewTechnicianProfile={(tech) => { setViewedTechnician({ uid: tech.uid, name: tech.name }); setCustomerTab('techProfile'); }} /> :
    customerTab === 'progress' ? <RequestProgressScreen customerName={user?.name as string} customerUid={user?.uid as string} acceptedOnly={acceptedOnlyProgress} focusedJobId={customerFocusedJobId} autoExpandReview={Boolean(customerFocusedJobId)} onViewDetails={(req) => { setSelectedRequest(req as SelectedJob); setCustomerTab('details'); }} onTrackMap={(req) => { setSelectedRequest(req as SelectedJob); setCustomerTab('map'); }} onViewTechnicianProfile={(tech) => { setViewedTechnician({ uid: tech.uid, name: tech.name }); setCustomerTab('techProfile'); }} onMessageTechnician={(req, tech) => { setSelectedChatTarget({ id: req.id, technicianName: tech.name, applianceType: req.applianceType, status: req.status }); setCustomerTab('chat'); }} onRate={(job) => { setSelectedJobForRate(job); setCustomerTab('rate'); }} /> :
    customerTab === 'rate' ? <RateTechnicianScreen job={(selectedJobForRate || {}) as RateJobProp} customerName={user?.name as string} onBack={() => setCustomerTab('progress')} onSubmitted={() => { setSelectedJobForRate(null); setCustomerFocusedJobId(null); setCustomerTab('progress'); }} /> :
    customerTab === 'techProfile' ? <TechnicianProfileScreen technician={(viewedTechnician || {}) as TechnicianScreenProp} readOnly onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'map' ? <MapTrackerScreen currentUser={user} selectedJob={selectedRequest} onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'profile' ? <CustomerProfileScreen user={user} onLogout={handleLogout} onUpdateProfile={handleCustomerProfileUpdate} onNavigateToProgress={() => { setAcceptedOnlyProgress(false); setCustomerTab('progress'); }} onOpenNotifications={() => setNotificationsOpen(true)} /> : 
    <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} />
  ) : (
    technicianTab === 'jobs' ? <AvailableJobsScreen technician={user} notificationCount={unreadCount} highlightedJobId={technicianHighlightedJobId} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToMap={(job) => { setSelectedJobForMap(job); setTechnicianTab('map'); }} onNavigateToChat={(job) => { setSelectedChatTarget(job); setTechnicianTab('chat'); }} /> : 
    technicianTab === 'map' ? (selectedJobForMap ? <TechnicianTrackerScreen currentUser={user} selectedJob={selectedJobForMap} onNavigateToJobs={() => setSelectedJobForMap(null)} /> : <TechMapScreen technician={user} onOpenJob={(job) => { setTechnicianHighlightedJobId(job.id); setTechnicianTab('jobs'); }} />) : 
    technicianTab === 'chat' ? <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} /> :
    <TechnicianProfileScreen technician={user as TechnicianScreenProp} onLogout={handleLogout} onProfileUpdate={handleTechnicianProfileUpdate} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      
      <MessageBanner banner={banner} onDismiss={dismissBanner} onPress={() => banner && openBannerNotification(banner)} />

      <View style={styles.screenContainer}>{screen}</View>

      <Modal visible={notificationsOpen} animationType="slide" onRequestClose={handleCloseNotifications}>
        <View style={styles.modalBackdrop}>
          <View style={styles.notificationPanel}>
            <View style={styles.notifHeader}>
              <Pressable
                style={styles.notifBackBtn}
                onPress={handleCloseNotifications}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
              >
                <Ionicons name="arrow-back" size={20} color={colors.ink} />
              </Pressable>
              <View style={styles.notifHeaderCopy}>
                <Text style={styles.notifHeaderTitle}>Notifications</Text>
                <Text style={styles.notifHeaderSub}>
                  {unreadCount > 0
                    ? `${unreadCount} unread update${unreadCount !== 1 ? 's' : ''}`
                    : 'You are all caught up'}
                </Text>
              </View>
              {unreadCount > 0 ? (
                <Pressable
                  style={[styles.markAllBtn, { backgroundColor: roleSoft }]}
                  onPress={() => {
                    chatNotifications.forEach((n) => {
                      if (!n.read && n.id) {
                        markNotificationRead(n.id).catch(() => {});
                      }
                    });
                    setChatNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all notifications as read"
                >
                  <Ionicons name="checkmark-done" size={15} color={roleAccent} />
                  <Text style={[styles.markAllRead, { color: roleAccent }]}>Mark all</Text>
                </Pressable>
              ) : null}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.notifList} contentContainerStyle={styles.notifListContent}>
              {chatNotifications.length === 0 ? (
                <View style={styles.emptyNotif}>
                  <View style={styles.emptyNotifIcon}>
                    <Ionicons name="notifications-outline" size={30} color={colors.muted} />
                  </View>
                  <Text style={styles.emptyNotifText}>No notifications yet</Text>
                  <Text style={styles.emptyNotifSub}>
                    {isCustomer
                      ? 'Job updates and messages from your technician will show up here.'
                      : 'Job updates and messages from your customers will show up here.'}
                  </Text>
                </View>
              ) : (
                <>
                  {unreadNotifications.length > 0 ? <Text style={styles.notifSectionLabel}>New</Text> : null}
                  {unreadNotifications.map(renderNotification)}
                  {readNotifications.length > 0 ? <Text style={styles.notifSectionLabel}>Earlier</Text> : null}
                  {readNotifications.map(renderNotification)}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {(isCustomer && customerTab === 'submit') ? null : (<View style={styles.bottomNav}>{navItems.map((item) => { const active = activeTab === item.key || (item.key === 'progress' && ['submit', 'details', 'map', 'techProfile', 'rate'].includes(activeTab)); return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label} tab`} accessibilityState={{ selected: active }} style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]} onPress={() => { if (isCustomer && item.key === 'progress') setAcceptedOnlyProgress(false); setTab(item.key); }}><View style={[styles.navIcon, active && { backgroundColor: roleSoft }]}><Ionicons name={active ? item.icon : (`${item.icon}-outline` as IconName)} size={20} color={active ? roleAccent : colors.muted} /></View><Text style={[styles.navLabel, active && { color: roleAccent }]}>{item.label}</Text></Pressable>; })}</View>)}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas }, authContainer: { flex: 1, backgroundColor: colors.canvas }, screenContainer: { flex: 1, width: '100%' as const, alignSelf: 'center' as const },
  modalBackdrop: { flex: 1, backgroundColor: colors.white },
  backdropPress: { flex: 1 },
  notificationPanel: { flex: 1, width: '100%', backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  notifBackBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  notifHeaderCopy: { flex: 1, minWidth: 0 },
  notifHeaderTitle: { color: colors.ink, fontSize: 20, fontFamily: fonts.extraBold },
  notifHeaderSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999 },
  markAllRead: { fontSize: 12, fontFamily: fonts.bold },

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

  notifList: { flex: 1 },
  notifListContent: { paddingBottom: 8 },
  notifSectionLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6, marginBottom: 10 },
  emptyNotif: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyNotifIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyNotifText: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  emptyNotifSub: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  notifCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  notifCardUnread: { backgroundColor: colors.white, borderColor: colors.line, ...shadows.subtle },
  notifCardRead: { backgroundColor: colors.surfaceSunken, borderColor: colors.lineSoft },
  notifCardPressed: { opacity: 0.92 },
  notifAvatarWrap: { width: 48, height: 48, flexShrink: 0 },
  notifAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  notifAvatarText: { color: colors.ink, fontSize: 18, fontFamily: fonts.extraBold },
  notifTypeBadge: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  notifCardContent: { flex: 1, minWidth: 0 },
  notifCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  notifSender: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  notifSenderRead: { color: colors.muted, fontFamily: fonts.semiBold },
  notifPreview: { color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  notifCardTime: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 0 },
  notifUnreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 9, paddingBottom: 8, paddingHorizontal: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, gap: 4 }, navItem: { alignItems: 'center', minWidth: 64, minHeight: 52, justifyContent: 'center', flex: 1, maxWidth: 120 }, navItemPressed: { transform: [{ scale: 0.97 }], opacity: 0.94 }, navIcon: { width: 42, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, navIconActive: { backgroundColor: '#E6F6F3' }, navLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 3, letterSpacing: 0.2 }, navLabelActive: { color: colors.teal, fontFamily: fonts.bold },
});
