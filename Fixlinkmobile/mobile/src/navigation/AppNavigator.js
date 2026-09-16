import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, Modal, ScrollView } from 'react-native';
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
import { fetchUnreadMessageNotifications, setAuthToken, updateCustomerProfile, markJobMessagesRead } from '../screens/services/api';
import { fonts } from '../theme';
import MessageBanner from '../components/MessageBanner';

const colors = { ink: '#102A43', teal: '#0F766E', canvas: '#F5F8FA', white: '#FFFFFF', muted: '#5A7A91', line: '#D9E2EC' };

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
  const [acceptedOnlyProgress, setAcceptedOnlyProgress] = useState(false);
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
      return undefined;
    }

    let isMounted = true;
    const loadNotifications = async () => {
      try {
        const notifications = await fetchUnreadMessageNotifications(user.uid, user.role);
        if (!isMounted) return;
        const list = Array.isArray(notifications) ? notifications : [];
        setChatNotifications(list);

        if (!bootstrappedRef.current) {
          bootstrappedRef.current = true;
          list.forEach((n) => {
            const dedupKey = String(n.type === 'job' ? `job-${n.id}` : n.messageId || '');
            if (dedupKey) seenNotifIdsRef.current.add(dedupKey);
          });
          return;
        }

        list.forEach((n) => {
          const dedupKey = String(n.type === 'job' ? `job-${n.id}` : n.messageId || '');
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

  const handleLogout = () => { 
    setAuthToken(null);
    setUser(null); 
    setCustomerTab('dashboard'); 
    setTechnicianTab('jobs'); 
    setSelectedJobForMap(null); 
    setSelectedChatTarget(null);
    setViewedTechnician(null);
    setActiveChatJobId(null);
    setBanner(null);
    setChatNotifications([]);
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
    setTab('chat');
  };
  const screen = isCustomer ? (
    customerTab === 'dashboard' ? <DashboardScreen user={user} notificationCount={chatNotifications.length} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToSubmit={() => setCustomerTab('submit')} onNavigateToProgress={() => { setAcceptedOnlyProgress(false); setCustomerTab('progress'); }} onTrackAcceptedJob={() => { setAcceptedOnlyProgress(true); setCustomerTab('progress'); }} onOpenRequest={(req) => { setSelectedRequest(req); setCustomerTab('details'); }} /> :
    customerTab === 'submit' ? <SubmitRequestScreen currentUser={user} customerName={user.name} onNavigateToProgress={() => setCustomerTab('progress')} /> :
    customerTab === 'details' ? <RequestDetailsScreen request={selectedRequest} onBack={() => setCustomerTab('progress')} onMessageTechnician={() => { setSelectedChatTarget(selectedRequest); setCustomerTab('chat'); }} onTrackMap={(req) => { setSelectedRequest(req); setCustomerTab('map'); }} /> :
    customerTab === 'progress' ? <RequestProgressScreen customerName={user.name} customerUid={user.uid} acceptedOnly={acceptedOnlyProgress} onViewDetails={(req) => { setSelectedRequest(req); setCustomerTab('details'); }} onTrackMap={(req) => { setSelectedRequest(req); setCustomerTab('map'); }} onViewTechnicianProfile={(tech) => { setViewedTechnician({ uid: tech.uid, name: tech.name }); setCustomerTab('techProfile'); }} onMessageTechnician={(req, tech) => { setSelectedChatTarget({ id: req.id, technicianName: tech.name, applianceType: req.applianceType, status: req.status }); setCustomerTab('chat'); }} /> :
    customerTab === 'techProfile' ? <TechnicianProfileScreen technician={viewedTechnician || {}} readOnly onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'map' ? <MapTrackerScreen currentUser={user} selectedJob={selectedRequest} onBack={() => setCustomerTab('progress')} /> :
    customerTab === 'profile' ? <CustomerProfileScreen user={user} onLogout={handleLogout} onUpdateProfile={handleCustomerProfileUpdate} /> : 
    <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} />
  ) : (
    technicianTab === 'jobs' ? <AvailableJobsScreen technician={user} notificationCount={chatNotifications.length} onOpenNotifications={() => setNotificationsOpen(true)} onNavigateToMap={(job) => { setSelectedJobForMap(job); setTechnicianTab('map'); }} onNavigateToChat={(job) => { setSelectedChatTarget(job); setTechnicianTab('chat'); }} /> : 
    technicianTab === 'map' ? <TechnicianTrackerScreen currentUser={user} selectedJob={selectedJobForMap} onNavigateToJobs={() => setTechnicianTab('jobs')} /> : 
    technicianTab === 'chat' ? <ChatScreen currentUser={user} initialTarget={selectedChatTarget} onActiveConversationChange={setActiveChatJobId} /> :
    <TechnicianProfileScreen technician={user} onLogout={handleLogout} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      
      <MessageBanner banner={banner} onDismiss={dismissBanner} onPress={() => banner && openBannerNotification(banner)} />

      <View style={styles.screenContainer}>{screen}</View>

      <Modal visible={notificationsOpen} transparent animationType="fade" onRequestClose={() => setNotificationsOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setNotificationsOpen(false)}>
          <TouchableOpacity style={styles.notificationPanel} activeOpacity={1}>
            <View style={styles.panelHeader}><View><Text style={styles.panelKicker}>FIXLINK UPDATES</Text><Text style={styles.panelTitle}>Notifications</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setNotificationsOpen(false)}><Ionicons name="close" size={18} color={colors.ink} /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {chatNotifications.map((notification) => {
                const isJob = notification.type === 'job';
                return (
                  <TouchableOpacity
                    key={`${notification.jobId}-${notification.id}-${notification.messageId || ''}`}
                    style={styles.notice}
                    onPress={() => {
                      if (isJob) {
                        setNotificationsOpen(false);
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
                      setNotificationsOpen(false);
                      setTab('chat');
                    }}
                  >
                    <View style={[styles.noticeIcon, isJob && styles.noticeIconGold]}><Ionicons name={isJob ? 'construct' : 'chatbubble-ellipses'} size={18} color={colors.teal} /></View>
                    <View style={styles.noticeCopy}>
                      <Text style={styles.noticeTitle}>{isJob ? (notification.senderName ? `${notification.senderName} · request update` : 'Request update') : `New message from ${notification.senderName}`}</Text>
                      <Text style={styles.noticeText} numberOfLines={2}>{notification.text}</Text>
                      <Text style={styles.noticeTime}>Unread</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <View style={styles.notice}><View style={styles.noticeIcon}><Ionicons name="checkmark-circle" size={19} color={colors.teal} /></View><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>You’re all set</Text><Text style={styles.noticeText}>Your FixLink account is ready for service requests.</Text><Text style={styles.noticeTime}>Just now</Text></View></View>
              <View style={styles.notice}><View style={[styles.noticeIcon, styles.noticeIconGold]}><Ionicons name="sparkles" size={18} color="#B7791F" /></View><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{isCustomer ? 'Need something fixed?' : 'New jobs nearby'}</Text><Text style={styles.noticeText}>{isCustomer ? 'Add a request and we’ll match you with a verified technician.' : 'Refresh your jobs feed to see the latest repair requests.'}</Text><Text style={styles.noticeTime}>Today</Text></View></View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <View style={styles.bottomNav}>{navItems.map((item) => { const active = activeTab === item.key || (item.key === 'progress' && ['submit', 'details', 'map', 'techProfile'].includes(activeTab)); return <TouchableOpacity key={item.key} style={styles.navItem} onPress={() => { if (isCustomer && item.key === 'progress') setAcceptedOnlyProgress(false); setTab(item.key); }}><View style={[styles.navIcon, active && styles.navIconActive]}><Ionicons name={active ? item.icon : `${item.icon}-outline`} size={20} color={active ? colors.teal : colors.muted} /></View><Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text></TouchableOpacity>; })}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas }, authContainer: { flex: 1, backgroundColor: colors.canvas }, screenContainer: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(16,42,67,0.26)', alignItems: 'flex-end', paddingTop: 86, paddingHorizontal: 16 }, notificationPanel: { width: '100%', maxWidth: 390, maxHeight: 430, backgroundColor: colors.white, borderRadius: 22, padding: 20, shadowColor: '#102A43', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 }, panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, panelKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 5 }, panelTitle: { color: colors.ink, fontSize: 23, fontFamily: fonts.bold }, closeButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }, notice: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line }, noticeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center' }, noticeIconGold: { backgroundColor: '#FFF8E7' }, noticeCopy: { flex: 1 }, noticeTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginBottom: 4 }, noticeText: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular }, noticeTime: { color: colors.muted, fontSize: 10, marginTop: 6, fontFamily: fonts.semiBold },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 9, paddingBottom: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }, navItem: { alignItems: 'center', minWidth: 65 }, navIcon: { width: 42, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, navIconActive: { backgroundColor: '#E6F6F3' }, navLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold, marginTop: 3 }, navLabelActive: { color: colors.teal },
});