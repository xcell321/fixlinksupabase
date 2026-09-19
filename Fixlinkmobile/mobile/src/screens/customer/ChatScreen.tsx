import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  ScrollView,
  FlatList,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Skeleton from '../../components/Skeleton';
import { fetchJobMessages, fetchMessageInbox, markJobMessagesRead, sendJobMessage } from '../services/api';
import { colors, fonts, shadows } from '../../theme';
import { getStatusColor, getStatusIcon } from '../../utils/applianceIcons';
import type { ChatMessage, Conversation } from '../../types/message';

type Role = 'customer' | 'technician';
type FilterKey = 'all' | 'active' | 'completed' | 'unread';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface CurrentUser {
  uid: string;
  role: Role;
  name: string;
}

interface InitialTarget {
  id?: string;
  jobId?: string;
  peerPhone?: string | null;
  customerName?: string;
  technicianName?: string;
  applianceType?: string;
  status?: string;
}

interface ChatScreenProps {
  currentUser: CurrentUser;
  initialTarget?: InitialTarget | null;
  onActiveConversationChange?: (jobId: string | null) => void;
}

const ACTIVE_STATUSES = ['accepted', 'confirmed', 'customer ready', 'in progress'];
const isActiveStatus = (status: string | undefined): boolean =>
  ACTIVE_STATUSES.includes(String(status ?? '').toLowerCase());

const formatMessageTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatDayDivider = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const maskPhone = (phone: string | null | undefined): string => {
  const digits = String(phone ?? '').trim();
  if (!digits) return '';
  if (digits.length < 8) return digits;
  return `${digits.slice(0, 4)}${'•'.repeat(3)}${digits.slice(-4)}`;
};

const statusIcon = (status: string | undefined): IconName =>
  getStatusIcon(status) as IconName;

const shouldShowDivider = (messages: ChatMessage[], index: number): boolean => {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1]?.timestamp ?? 0).toDateString();
  const cur = new Date(messages[index]?.timestamp ?? 0).toDateString();
  return prev !== cur;
};

// Anti-slop press feedback: transform + opacity only (GPU), 120-160ms feel via native driver.
// Shared across every ChatScreen button so radii, timing, and depth stay consistent.
interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

function FilterChip({ label, count, active, onPress, testID }: FilterChipProps): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} conversations`}
      accessibilityHint={`Filter conversations by ${label}`}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && styles.pressedSoft,
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      <View style={[styles.filterCount, active && styles.filterCountActive]}>
        <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}

function StatCard({ label, value, icon, onPress, accessibilityLabel }: StatCardProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.statCard, pressed && styles.pressedSoft]}
    >
      <View style={styles.statTopRow}>
        <Ionicons name={icon} size={15} color={colors.teal} />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

interface ConversationRowProps {
  item: Conversation;
  currentUid: string;
  onOpen: () => void;
}

const ConversationRow = memo(function ConversationRow({ item, currentUid, onOpen }: ConversationRowProps): React.JSX.Element {
  const color = getStatusColor(item.status);
  const isUnread = (item.unreadCount ?? 0) > 0;
  const preview = item.lastMessage
    ? `${String(item.lastMessage.senderUid ?? '') === String(currentUid) ? 'You: ' : ''}${item.lastMessage.text}`
    : 'No messages yet. Say hello!';
  const phoneMasked = item.peerPhone ? maskPhone(item.peerPhone) : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${item.peerName}`}
      accessibilityHint={isUnread ? `${item.unreadCount} unread messages` : 'Open chat history'}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.conversationItem,
        isUnread && styles.conversationItemUnread,
        pressed && styles.pressedCard,
      ]}
    >
      <View style={[styles.avatar, isUnread && styles.avatarUnread]}>
        <Text style={styles.avatarText}>{item.peerInitial}</Text>
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.convHeaderRow}>
          <Text style={styles.convName} numberOfLines={1}>{item.peerName}</Text>
          {isUnread ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadPillText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.convMetaRow}>
          <View style={[styles.badgePill, { backgroundColor: color + '15', borderColor: color + '40' }]}>
            <Ionicons name={statusIcon(item.status)} size={9} color={color} />
            <Text style={[styles.badgePillText, { color }]} numberOfLines={1}>{item.status || 'Active'}</Text>
          </View>
          {item.jobCode ? <Text style={styles.jobCode}>#{item.jobCode}</Text> : null}
          {item.lastMessage?.timestamp ? (
            <Text style={styles.convTime} numberOfLines={1}>{formatMessageTime(item.lastMessage.timestamp)}</Text>
          ) : null}
        </View>
        {phoneMasked ? (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={11} color={colors.muted} />
            <Text style={styles.phoneMasked} numberOfLines={1}>{phoneMasked}</Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.applianceInline} numberOfLines={1}>{item.applianceType}</Text>
          </View>
        ) : (
          <Text style={styles.applianceInline} numberOfLines={1}>{item.applianceType}</Text>
        )}
        <Text style={[styles.lastMsg, isUnread && styles.lastMsgUnread]} numberOfLines={1}>{preview}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} style={styles.chev} accessible={false} />
    </Pressable>
  );
});

export default function ChatScreen({ currentUser, initialTarget = null, onActiveConversationChange }: ChatScreenProps): React.JSX.Element {
  const isTechnician = currentUser?.role === 'technician';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterKey>('all');
  const chatScrollRef = useRef<ScrollView | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string): void => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const loadInbox = useCallback(async (isFirst = false): Promise<void> => {
    try {
      if (isFirst) setLoading(true);
      setInboxError(null);
      const inbox = await fetchMessageInbox(currentUser.uid, currentUser.role);
      setConversations(Array.isArray(inbox) ? (inbox as Conversation[]) : []);
    } catch (error) {
      console.warn('Error loading inbox:', error);
      setInboxError('Could not load conversations. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid, currentUser?.role]);

  useEffect(() => {
    loadInbox(true);
    const interval = setInterval(() => loadInbox(false), 30000);
    return () => clearInterval(interval);
  }, [loadInbox]);

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
        jobCode: String(targetId).slice(0, 6).toUpperCase(),
        peerUid: null,
        peerPhone: initialTarget.peerPhone ?? null,
        peerName: isTechnician ? (initialTarget.customerName || 'Customer') : (initialTarget.technicianName || 'Technician'),
        peerInitial: String(isTechnician ? initialTarget.customerName : (initialTarget.technicianName || 'U')).charAt(0).toUpperCase(),
        applianceType: initialTarget.applianceType || 'Repair Job',
        status: initialTarget.status || 'Active',
        roleLabel: isTechnician ? 'Customer' : 'Verified Technician',
        unreadCount: 0,
      });
    }
  }, [initialTarget, conversations, isTechnician]);

  // Cache-first thread load: cached messages render instantly on tap,
  // network refresh happens in background with a slim indicator (no blocking spinner).
  useEffect(() => {
    const jobId = selectedConversation?.jobId;
    if (!jobId) return undefined;

    let isMounted = true;
    const cached = messagesByConv[jobId];
    const hasCache = Array.isArray(cached) && cached.length > 0;
    const loadMessages = async (silent = false): Promise<void> => {
      try {
        if (!silent && !hasCache) setThreadLoading(true);
        const fetched = await fetchJobMessages(jobId);
        const messages: ChatMessage[] = Array.isArray(fetched) ? (fetched as ChatMessage[]) : [];
        if (isMounted) {
          setMessagesByConv((prev) => ({ ...prev, [jobId]: messages }));
          await markJobMessagesRead(jobId, currentUser.uid);
          setConversations((cur) => cur.map((c) => (c.jobId === jobId ? { ...c, unreadCount: 0 } : c)));
        }
      } catch (error) {
        console.warn('Error loading job messages:', error);
      } finally {
        if (isMounted) setThreadLoading(false);
      }
    };

    loadMessages(false);
    const intervalId = setInterval(() => loadMessages(true), 15000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [selectedConversation?.jobId, currentUser?.uid]);

  useEffect(() => {
    onActiveConversationChange?.(selectedConversation?.jobId ?? null);
    return () => onActiveConversationChange?.(null);
  }, [selectedConversation?.jobId, onActiveConversationChange]);

  const currentMessages: ChatMessage[] = selectedConversation
    ? (messagesByConv[selectedConversation.jobId] ?? [])
    : [];

  useEffect(() => {
    if (currentMessages.length > 0) {
      const t = setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [selectedConversation?.jobId, currentMessages.length]);

  const handleOpenConversation = useCallback((item: Conversation): void => {
    // Instant: paint cached thread first, then let the loader refresh silently.
    setSelectedConversation(item);
    setSendError(null);
    setConversations((cur) => cur.map((c) => (c.jobId === item.jobId ? { ...c, unreadCount: 0 } : c)));
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  const handleSendMessage = async (): Promise<void> => {
    const text = inputText.trim();
    const jobId = selectedConversation?.jobId;
    if (!text || !jobId || sending) return;
    setSending(true);
    setSendError(null);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      jobId,
      senderUid: String(currentUser.uid),
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text,
      timestamp: new Date().toISOString(),
      pending: true,
    };
    setMessagesByConv((prev) => ({ ...prev, [jobId]: [...(prev[jobId] ?? []), optimistic] }));
    setInputText('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
    try {
      const message = await sendJobMessage(jobId, {
        senderUid: currentUser.uid,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        text,
      }) as ChatMessage;
      setMessagesByConv((prev) => ({
        ...prev,
        [jobId]: (prev[jobId] ?? []).map((m) => (m.id === optimistic.id ? message : m)),
      }));
    } catch (error) {
      console.warn('Error sending job message:', error);
      setMessagesByConv((prev) => ({ ...prev, [jobId]: (prev[jobId] ?? []).filter((m) => m.id !== optimistic.id) }));
      setInputText(text);
      setSendError('Message failed to send. Tap Send to retry.');
    } finally {
      setSending(false);
    }
  };

  const handleCall = useCallback(async (phone: string | null | undefined, peerName: string): Promise<void> => {
    const digits = String(phone ?? '').trim();
    if (!digits) {
      showToast('No number on file for this contact');
      return;
    }
    try {
      const url = `tel:${digits.replace(/[^+\d]/g, '')}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showToast(digits);
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      console.warn('Call failed:', error);
      showToast(`Call ${peerName} at ${digits}`.trim());
    }
  }, [showToast]);

  const handleCopyPhone = useCallback(async (phone: string | null | undefined): Promise<void> => {
    const digits = String(phone ?? '').trim();
    if (!digits) {
      showToast('No number on file for this contact');
      return;
    }
    try {
      await Clipboard.setStringAsync(digits);
      showToast('Number copied');
    } catch (error) {
      console.warn('Copy failed:', error);
      showToast('Long-press the number to copy');
    }
  }, [showToast]);

  const activeConversations = conversations.filter((c) => isActiveStatus(c.status));
  const completedConversations = conversations.filter((c) => String(c.status ?? '').toLowerCase() === 'completed');
  const unreadConversations = conversations.filter((c) => (c.unreadCount ?? 0) > 0);
  const totalUnread = unreadConversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: conversations.length },
    { key: 'active', label: 'Active', count: activeConversations.length },
    { key: 'completed', label: 'Completed', count: completedConversations.length },
    { key: 'unread', label: 'Unread', count: unreadConversations.length },
  ];
  const visibleConversations: Conversation[] =
    statusFilter === 'active' ? activeConversations
    : statusFilter === 'completed' ? completedConversations
    : statusFilter === 'unread' ? unreadConversations
    : conversations;

  const emptyCopy: Record<FilterKey, { title: string; body: string }> = {
    all: { title: 'No conversations yet', body: isTechnician ? 'When you accept a service request, you can coordinate directly with the customer here.' : 'Once a technician accepts your repair request, you can message them here to coordinate scheduling.' },
    active: { title: 'No active conversations', body: 'Active jobs you are coordinating will appear here.' },
    completed: { title: 'No completed conversations', body: 'Finished jobs stay here for reference.' },
    unread: { title: 'You are all caught up', body: 'New unread messages will appear here.' },
  };

  if (selectedConversation) {
    const s = selectedConversation;
    const statusColor = getStatusColor(s.status);
    const peerPhone = s.peerPhone ?? null;
    const canSend = inputText.trim().length > 0 && !sending;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            accessibilityHint="Return to the conversation list"
            hitSlop={10}
            onPress={() => setSelectedConversation(null)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.ink} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>{s.peerName}</Text>
          <View style={[styles.navPill, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
            <Ionicons name={statusIcon(s.status)} size={11} color={statusColor} />
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
              <View style={styles.threadPhoneRow}>
                <Ionicons name="call-outline" size={12} color={colors.teal} />
                {peerPhone ? (
                  <Text style={styles.threadPhone} selectable>{peerPhone}</Text>
                ) : (
                  <Text style={styles.threadPhoneMissing}>No number on file</Text>
                )}
                {s.jobCode ? <Text style={styles.jobCode}>#{s.jobCode}</Text> : null}
              </View>
            </View>
            <View style={styles.threadActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={peerPhone ? `Call ${s.peerName} at ${peerPhone}` : 'No phone number available'}
                accessibilityHint="Open the phone dialer"
                hitSlop={8}
                onPress={() => handleCall(peerPhone, s.peerName)}
                style={({ pressed }) => [styles.iconAction, pressed && styles.pressedSoft]}
              >
                <Ionicons name="call" size={17} color={colors.white} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={peerPhone ? `Copy ${s.peerName} phone number` : 'No phone number to copy'}
                accessibilityHint="Copy the registered number"
                hitSlop={8}
                onPress={() => handleCopyPhone(peerPhone)}
                style={({ pressed }) => [styles.iconActionGhost, pressed && styles.pressedSoft]}
              >
                <Ionicons name="copy-outline" size={16} color={colors.teal} />
              </Pressable>
            </View>
          </View>
          {threadLoading && currentMessages.length > 0 ? (
            <View style={styles.syncRow}>
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={styles.syncText}>Syncing latest messages…</Text>
            </View>
          ) : null}

          <ScrollView
            ref={chatScrollRef}
            contentContainerStyle={styles.chatArea}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              if (currentMessages.length > 0 && inputText.length === 0) {
                chatScrollRef.current?.scrollToEnd({ animated: false });
              }
            }}
          >
            {threadLoading && currentMessages.length === 0 ? (
              <View style={styles.chatEmpty}>
                <ActivityIndicator size="large" color={colors.teal} />
                <Text style={styles.chatEmptyText}>Loading conversation…</Text>
              </View>
            ) : currentMessages.length === 0 ? (
              <View style={styles.chatEmpty}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.teal} />
                </View>
                <Text style={styles.chatEmptyTitle}>Say hello to {s.peerName}</Text>
                <Text style={styles.chatEmptyText}>History loads instantly here. Coordinate scheduling, access, and parts.</Text>
              </View>
            ) : (
              currentMessages.map((msg, index) => {
                const isMe = String(msg.senderUid) === String(currentUser.uid);
                const isLast = index === currentMessages.length - 1;
                const read = isMe && isLast && Array.isArray(msg.readBy) && msg.readBy.some((uid) => uid && String(uid) !== String(currentUser.uid));
                return (
                  <React.Fragment key={msg.id || `${msg.timestamp}-${index}`}>
                    {shouldShowDivider(currentMessages, index) ? (
                      <View style={styles.dayDivider}>
                        <Text style={styles.dayDividerText}>{formatDayDivider(msg.timestamp)}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.msgWrapper, isMe ? styles.myMsgWrapper : styles.otherMsgWrapper]}>
                      <View style={[styles.msgBubble, isMe ? styles.myMsg : styles.otherMsg, msg.pending && styles.msgPending]}>
                        <Text style={[styles.msgText, isMe ? styles.myMsgText : styles.otherMsgText]} selectable>{msg.text}</Text>
                        <Text style={[styles.msgTime, isMe ? styles.myMsgTime : styles.otherMsgTime]}>
                          {formatMessageTime(msg.timestamp)}{isMe && read ? '  Read' : ''}{msg.pending ? '  Sending…' : ''}
                        </Text>
                      </View>
                    </View>
                  </React.Fragment>
                );
              })
            )}
          </ScrollView>

          {sendError ? (
            <View style={styles.sendErrorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
              <Text style={styles.sendErrorText}>{sendError}</Text>
            </View>
          ) : null}
          <View style={styles.inputArea}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder={isTechnician ? 'Message the customer…' : 'Message the technician…'}
                placeholderTextColor={colors.muted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
                returnKeyType="send"
                onSubmitEditing={handleSendMessage}
                accessibilityLabel="Type your message"
                accessibilityHint="Write a message to your contact"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sending ? 'Sending message' : 'Send message'}
                accessibilityHint="Send the typed message"
                accessibilityState={{ disabled: !canSend }}
                hitSlop={6}
                onPress={handleSendMessage}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendButton,
                  !canSend && styles.sendButtonDisabled,
                  pressed && canSend && styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="send" size={17} color={colors.white} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />

      <FlatList
        data={visibleConversations}
        keyExtractor={(item) => String(item.jobId)}
        renderItem={({ item }) => (
          <ConversationRow item={item} currentUid={currentUser?.uid} onOpen={() => handleOpenConversation(item)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <View>
            <View style={styles.sectionHeaderContainer}>
              <View style={styles.titleRow}>
                <View>
                  <Text style={styles.kicker}>MESSAGES</Text>
                  <Text style={styles.sectionTitle}>Messages</Text>
                  <Text style={styles.sectionSub}>History opens instantly. Tap any chat to continue.</Text>
                </View>
                {totalUnread > 0 ? (
                  <View style={styles.totalUnreadPill}>
                    <Text style={styles.totalUnreadText}>{totalUnread > 99 ? '99+' : totalUnread} new</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.statRow}>
              <StatCard label="Total chats" value={String(conversations.length)} icon="chatbubbles-outline" onPress={() => setStatusFilter('all')} accessibilityLabel={`Show all ${conversations.length} chats`} />
              <StatCard label="Active" value={String(activeConversations.length)} icon="pulse-outline" onPress={() => setStatusFilter('active')} accessibilityLabel={`Show ${activeConversations.length} active chats`} />
              <StatCard label="Unread" value={String(totalUnread)} icon="mail-unread-outline" onPress={() => setStatusFilter('unread')} accessibilityLabel={`Show ${unreadConversations.length} unread chats`} />
            </View>

            <View style={styles.filterRow}>
              {filters.map((f) => (
                <FilterChip
                  key={f.key}
                  testID={`filter-${f.key}`}
                  label={f.label}
                  count={f.count}
                  active={statusFilter === f.key}
                  onPress={() => setStatusFilter(f.key)}
                />
              ))}
            </View>

            {inboxError ? (
              <View style={styles.errorCard}>
                <Ionicons name="cloud-offline-outline" size={22} color={colors.error} />
                <Text style={styles.errorTitle}>Could not load chats</Text>
                <Text style={styles.errorText}>{inboxError}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading conversations"
                  onPress={() => loadInbox(false)}
                  style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.white} />
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

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
            ) : null}
          </View>
        )}
        ListEmptyComponent={!loading && !inboxError ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={30} color={colors.teal} />
            </View>
            <Text style={styles.emptyTitle}>{emptyCopy[statusFilter].title}</Text>
            <Text style={styles.emptyText}>{emptyCopy[statusFilter].body}</Text>
          </View>
        ) : null}
      />
      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  listContent: { flexGrow: 1, padding: 20, paddingBottom: 28 },

  // Shared anti-slop press states: transform + opacity only (GPU path).
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  pressedCard: { transform: [{ scale: 0.98 }], opacity: 0.97 },

  // Thread nav
  navBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 44, paddingHorizontal: 8, borderRadius: 12, justifyContent: 'center' },
  backButtonText: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  navTitle: { flex: 1, textAlign: 'center', color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, maxWidth: 110, minHeight: 32 },
  navPillText: { fontSize: 10, fontFamily: fonts.bold, flexShrink: 1 },

  // List header
  sectionHeaderContainer: { marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 2 },
  sectionTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink },
  sectionSub: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted, marginTop: 2 },
  totalUnreadPill: { backgroundColor: colors.error, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 28, justifyContent: 'center' },
  totalUnreadText: { color: colors.white, fontSize: 11, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, ...shadows.card },
  statTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontFamily: fonts.extraBold, color: colors.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.muted, marginTop: 2 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  filterChipActive: { backgroundColor: colors.teal, borderColor: colors.tealDark },
  filterChipText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  filterChipTextActive: { color: colors.white },
  filterCount: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  filterCountText: { color: colors.tealDark, fontSize: 11, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  filterCountTextActive: { color: colors.white },

  // Conversation rows
  conversationItem: { flexDirection: 'row', padding: 14, backgroundColor: colors.white, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.line, ...shadows.card },
  conversationItemUnread: { borderColor: colors.teal, borderWidth: 1.5 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarUnread: { backgroundColor: colors.tealDark },
  avatarText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 17 },
  conversationInfo: { flex: 1 },
  convHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  convName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1, flex: 1 },
  unreadPill: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
  unreadPillText: { color: colors.white, fontSize: 10, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  convMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgePillText: { fontSize: 10, fontFamily: fonts.bold },
  jobCode: { color: colors.tealDark, fontSize: 10, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], backgroundColor: colors.tealLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  convTime: { color: colors.muted, fontSize: 10, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], flexShrink: 1, marginLeft: 'auto' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  phoneMasked: { color: colors.tealDark, fontSize: 12, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },
  applianceInline: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },
  lastMsg: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  lastMsgUnread: { color: colors.ink, fontFamily: fonts.semiBold },
  chev: { marginLeft: 8 },

  // Thread header
  chatHeaderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 10 },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  verifiedText: { color: colors.green, fontSize: 12, fontFamily: fonts.semiBold },
  dotSeparator: { color: colors.muted, fontSize: 10, fontFamily: fonts.regular },
  statusSubtext: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, flexShrink: 1 },
  threadPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  threadPhone: { color: colors.tealDark, fontSize: 13, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  threadPhoneMissing: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, fontStyle: 'italic' },
  threadActions: { flexDirection: 'row', gap: 8 },
  iconAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center', ...shadows.card },
  iconActionGhost: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center' },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, backgroundColor: colors.tealLight, borderBottomWidth: 1, borderBottomColor: colors.line },
  syncText: { color: colors.tealDark, fontSize: 11, fontFamily: fonts.semiBold },

  // Thread body
  chatArea: { padding: 16, flexGrow: 1, paddingBottom: 20 },
  chatEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  chatEmptyTitle: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, textAlign: 'center' },
  chatEmptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
  dayDivider: { alignSelf: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 10 },
  dayDividerText: { color: colors.muted, fontSize: 10, fontFamily: fonts.semiBold },
  msgWrapper: { width: '100%', marginVertical: 3 },
  myMsgWrapper: { alignItems: 'flex-end' },
  otherMsgWrapper: { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '78%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 18, ...shadows.card },
  myMsg: { backgroundColor: colors.teal, borderBottomRightRadius: 4 },
  otherMsg: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  msgPending: { opacity: 0.75 },
  msgText: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 20 },
  myMsgText: { color: colors.white },
  otherMsgText: { color: colors.ink },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end', fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  myMsgTime: { color: 'rgba(255,255,255,0.75)' },
  otherMsgTime: { color: colors.muted },

  sendErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FDECEC', borderTopWidth: 1, borderTopColor: '#F5C6C6' },
  sendErrorText: { color: colors.error, fontSize: 12, fontFamily: fonts.semiBold, flex: 1 },
  inputArea: { padding: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, gap: 8 },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, maxHeight: 96, minHeight: 36, paddingVertical: 8 },
  sendButton: { backgroundColor: colors.teal, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', ...shadows.card },
  sendButtonDisabled: { backgroundColor: colors.muted, opacity: 0.55, elevation: 0 },

  skeletonList: { gap: 12, marginTop: 4 },
  skeletonAvatar: { width: 48, height: 48, borderRadius: 16, marginRight: 12 },
  skeletonConversationInfo: { flex: 1, gap: 8 },
  skeletonConversationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyCard: { backgroundColor: colors.white, borderRadius: 20, padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, gap: 10, ...shadows.card },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
  errorCard: { backgroundColor: '#FFF5F5', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F5C6C6', gap: 8, marginBottom: 4 },
  errorTitle: { color: colors.error, fontSize: 14, fontFamily: fonts.bold },
  errorText: { color: colors.ink, fontSize: 12, fontFamily: fonts.medium, textAlign: 'center' },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center', marginTop: 4 },
  retryText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },
  toast: { position: 'absolute', bottom: 28, left: 20, right: 20, backgroundColor: colors.ink, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', ...shadows.cardStrong },
  toastText: { color: colors.white, fontSize: 13, fontFamily: fonts.semiBold, textAlign: 'center' },
});
