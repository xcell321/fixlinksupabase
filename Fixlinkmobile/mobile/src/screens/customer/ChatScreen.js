import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Skeleton from '../../components/Skeleton';
import { fetchJobMessages, fetchMessageInbox, markJobMessagesRead, sendJobMessage } from '../services/api';
import { colors, fonts } from '../../theme';
import { getStatusColor, getStatusIcon } from '../../utils/applianceIcons';

const formatMessageTime = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function ChatScreen({ currentUser, initialTarget = null }) {
  const isTechnician = currentUser?.role === 'technician';
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const chatScrollRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const loadInbox = async () => {
      try {
        const inbox = await fetchMessageInbox(currentUser.uid, currentUser.role);
        if (isMounted) {
          setConversations(Array.isArray(inbox) ? inbox : []);
          setLoading(false);
        }
      } catch (error) {
        console.warn('Error loading inbox:', error);
        if (isMounted) setLoading(false);
      }
    };
    loadInbox();
    const interval = setInterval(loadInbox, 30000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [currentUser?.uid, currentUser?.role]);

  useEffect(() => {
    if (!initialTarget) return;
    const targetId = initialTarget.id || initialTarget.jobId;
    if (!targetId) return;
    const matched = conversations.find((c) => c.jobId === targetId);
    if (matched) {
      setSelectedConversation(matched);
    } else {
      setSelectedConversation({
        jobId: targetId,
        peerName: isTechnician ? (initialTarget.customerName || 'Customer') : (initialTarget.technicianName || 'Technician'),
        peerInitial: String(isTechnician ? initialTarget.customerName : (initialTarget.technicianName || 'U')).charAt(0).toUpperCase(),
        applianceType: initialTarget.applianceType || 'Repair Job',
        status: initialTarget.status || 'Active',
        roleLabel: isTechnician ? 'Customer' : 'Verified Technician',
        unreadCount: 0,
      });
    }
  }, [initialTarget, conversations]);

  useEffect(() => {
    const jobId = selectedConversation?.jobId;
    if (!jobId) return undefined;

    let isMounted = true;
    const loadMessages = async () => {
      try {
        const messages = await fetchJobMessages(jobId);
        if (isMounted) {
          setMessagesByConv((prev) => ({ ...prev, [jobId]: messages || [] }));
          await markJobMessagesRead(jobId, currentUser.uid);
          setConversations((cur) => cur.map((c) => (c.jobId === jobId ? { ...c, unreadCount: 0 } : c)));
        }
      } catch (error) {
        console.warn('Error loading job messages:', error);
      }
    };

    loadMessages();
    const intervalId = setInterval(loadMessages, 20000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [selectedConversation?.jobId, currentUser?.uid]);

  const currentMessages = selectedConversation ? (messagesByConv[selectedConversation.jobId] || []) : [];

  useEffect(() => {
    if (currentMessages.length > 0) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [selectedConversation?.jobId, currentMessages.length]);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    const jobId = selectedConversation?.jobId;
    if (!text || !jobId || sending) return;
    setSending(true);
    try {
      const message = await sendJobMessage(jobId, {
        senderUid: currentUser.uid,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        text,
      });
      setMessagesByConv((prev) => ({ ...prev, [jobId]: [...(prev[jobId] || []), message] }));
      setInputText('');
    } catch (error) {
      console.warn('Error sending job message:', error);
    } finally {
      setSending(false);
    }
  };

  const activeConversations = conversations.filter((c) => ['accepted', 'in progress'].includes(String(c.status || '').toLowerCase()));
  const completedConversations = conversations.filter((c) => String(c.status || '').toLowerCase() === 'completed');
  const filters = [
    { key: 'all', label: 'All', count: conversations.length },
    { key: 'active', label: 'Active', count: activeConversations.length },
    { key: 'completed', label: 'Completed', count: completedConversations.length },
  ];
  const visibleConversations = statusFilter === 'active' ? activeConversations : statusFilter === 'completed' ? completedConversations : conversations;

  if (selectedConversation) {
    const s = selectedConversation;
    const statusColor = getStatusColor(s.status);

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backButtonContainer} onPress={() => setSelectedConversation(null)}>
            <Ionicons name="arrow-back" size={20} color={colors.ink} />
            <Text style={styles.backButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{s.peerName}</Text>
          <View style={[styles.navPill, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
            <Ionicons name={getStatusIcon(s.status)} size={11} color={statusColor} />
            <Text style={[styles.navPillText, { color: statusColor }]} numberOfLines={1}>{s.status || 'Active'}</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.chatHeaderCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{s.peerInitial}</Text>
            </View>
            <View style={styles.chatHeaderInfo}>
              <Text style={styles.chatHeaderName}>{s.peerName}</Text>
              <View style={styles.verifiedRow}>
                <Ionicons name="shield-checkmark" size={13} color={colors.green} />
                <Text style={styles.verifiedText}>{s.roleLabel}</Text>
                <Text style={styles.dotSeparator}>•</Text>
                <Text style={styles.statusSubtext} numberOfLines={1}>{s.applianceType}</Text>
              </View>
            </View>
          </View>

          <ScrollView ref={chatScrollRef} contentContainerStyle={styles.chatArea} showsVerticalScrollIndicator={false}>
            {currentMessages.length === 0 ? (
              <View style={styles.chatEmpty}>
                <Ionicons name="chatbubble-outline" size={30} color={colors.muted} />
                <Text style={styles.chatEmptyText}>No messages yet. Say hello!</Text>
              </View>
            ) : (
              currentMessages.map((msg, index) => {
                const isMe = msg.senderUid === currentUser.uid || msg.senderRole === currentUser.role;
                const isLast = index === currentMessages.length - 1;
                const read = isMe && isLast && Array.isArray(msg.readBy) && msg.readBy.some((uid) => uid && String(uid) !== String(currentUser.uid));
                return (
                  <View key={msg.id} style={[styles.msgWrapper, isMe ? styles.myMsgWrapper : styles.otherMsgWrapper]}>
                    <View style={[styles.msgBubble, isMe ? styles.myMsg : styles.otherMsg]}>
                      <Text style={[styles.msgText, isMe ? styles.myMsgText : styles.otherMsgText]}>{msg.text}</Text>
                      <Text style={[styles.msgTime, isMe ? styles.myMsgTime : styles.otherMsgTime]}>
                        {formatMessageTime(msg.timestamp)}{isMe && read ? '  Read ✓' : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.inputArea}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder={isTechnician ? 'Message the customer...' : 'Message the technician...'}
                placeholderTextColor={colors.muted}
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage} disabled={sending}>
                <Ionicons name="send" size={17} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeaderContainer}>
          <Text style={styles.kicker}>MESSAGES</Text>
          <Text style={styles.sectionTitle}>{isTechnician ? 'Customer Contacts' : 'Technician Messages'}</Text>
        </View>

        <View style={styles.filterRow}>
          {filters.map((f) => {
            const active = statusFilter === f.key;
            return (
              <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setStatusFilter(f.key)} activeOpacity={0.85}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{f.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.skeletonList}>
            {[1, 2, 3, 4].map((item) => (
              <View key={item} style={styles.conversationItem}>
                <Skeleton style={styles.skeletonAvatar} />
                <View style={styles.skeletonConversationInfo}>
                  <View style={styles.skeletonConversationHeader}>
                    <Skeleton style={{ width: '42%', height: 15 }} />
                    <Skeleton style={{ width: 54, height: 19, borderRadius: 8 }} />
                  </View>
                  <Skeleton style={{ width: '68%', height: 12 }} />
                </View>
              </View>
            ))}
          </View>
        ) : visibleConversations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubbles-outline" size={36} color={colors.muted} />
            <Text style={styles.emptyTitle}>No Active Conversations</Text>
            <Text style={styles.emptyText}>
              {isTechnician
                ? 'When you accept a service request, you can coordinate directly with the customer here.'
                : 'Once a technician accepts your repair request, you can message them here to coordinate scheduling.'}
            </Text>
          </View>
        ) : (
          visibleConversations.map((item) => {
            const color = getStatusColor(item.status);
            const preview = item.lastMessage
              ? `${item.lastMessage.senderName === currentUser.name ? 'You: ' : ''}${item.lastMessage.text}`
              : 'No messages yet';
            return (
              <TouchableOpacity
                key={item.jobId}
                style={styles.conversationItem}
                onPress={() => {
                  setSelectedConversation(item);
                  setConversations((cur) => cur.map((c) => (c.jobId === item.jobId ? { ...c, unreadCount: 0 } : c)));
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.avatar, item.unreadCount > 0 && { backgroundColor: colors.tealDark }]}>
                  <Text style={styles.avatarText}>{item.peerInitial}</Text>
                </View>
                <View style={styles.conversationInfo}>
                  <View style={styles.convHeaderRow}>
                    <Text style={styles.convName} numberOfLines={1}>{item.peerName}</Text>
                    {item.unreadCount > 0 && (
                      <View style={styles.unreadPill}>
                        <Text style={styles.unreadPillText}>{item.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.convMetaRow}>
                    <View style={[styles.badgePill, { backgroundColor: color + '15', borderColor: color + '40' }]}>
                      <Ionicons name={getStatusIcon(item.status)} size={9} color={color} />
                      <Text style={[styles.badgePillText, { color }]} numberOfLines={1}>{item.status || 'Active'}</Text>
                    </View>
                    {item.lastMessage?.timestamp ? (
                      <Text style={styles.convTime} numberOfLines={1}>{formatMessageTime(item.lastMessage.timestamp)}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.lastMsg, item.unreadCount > 0 && styles.lastMsgUnread]} numberOfLines={1}>{preview}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  navBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white },
  backButtonContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  backButton: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  navTitle: { flex: 1, textAlign: 'center', color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1, maxWidth: 92 },
  navPillText: { fontSize: 10, fontFamily: fonts.bold, flexShrink: 1 },

  scrollContent: { flexGrow: 1, padding: 20 },
  sectionHeaderContainer: { marginBottom: 14 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 2 },
  sectionTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.ink },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  filterChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  filterChipText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  filterChipTextActive: { color: colors.white },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  filterCountText: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold },
  filterCountTextActive: { color: colors.white },

  conversationItem: { flexDirection: 'row', padding: 16, backgroundColor: colors.white, borderRadius: 22, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.line, shadowColor: '#102A43', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 17 },
  conversationInfo: { flex: 1 },
  convHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1 },
  unreadPill: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 },
  unreadPillText: { color: colors.white, fontSize: 10, fontFamily: fonts.extraBold },
  convMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgePillText: { color: colors.teal, fontSize: 10, fontFamily: fonts.bold },
  convTime: { color: colors.muted, fontSize: 10, fontFamily: fonts.medium, flexShrink: 1 },
  lastMsg: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  lastMsgUnread: { color: colors.ink, fontFamily: fonts.semiBold },

  chatHeaderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  verifiedText: { color: colors.green, fontSize: 12, fontFamily: fonts.semiBold },
  dotSeparator: { color: colors.muted, fontSize: 10, fontFamily: fonts.regular },
  statusSubtext: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },

  chatArea: { padding: 16, flexGrow: 1 },
  chatEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40 },
  chatEmptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  msgWrapper: { width: '100%', marginVertical: 3 },
  myMsgWrapper: { alignItems: 'flex-end' },
  otherMsgWrapper: { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '78%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 18, shadowColor: '#102A43', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  myMsg: { backgroundColor: colors.teal, borderBottomRightRadius: 4 },
  otherMsg: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 20 },
  myMsgText: { color: colors.white },
  otherMsgText: { color: colors.ink },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end', fontFamily: fonts.regular },
  myMsgTime: { color: 'rgba(255,255,255,0.7)' },
  otherMsgTime: { color: colors.muted },

  inputArea: { padding: 14, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, maxHeight: 90, paddingVertical: 6 },
  sendButton: { backgroundColor: colors.teal, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: colors.teal, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },

  skeletonList: { gap: 12 },
  skeletonAvatar: { width: 46, height: 46, borderRadius: 16, marginRight: 14 },
  skeletonConversationInfo: { flex: 1, gap: 8 },
  skeletonConversationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, gap: 10 },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
});