import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  ScrollView,
  FlatList,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Skeleton from '../../components/Skeleton';
import { fetchJobMessages, fetchMessageInbox, markJobMessagesRead, sendJobMessage } from '../services/api';
import { colors, fonts } from '../../theme';
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

const shouldShowDivider = (messages: ChatMessage[], index: number): boolean => {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1]?.timestamp ?? 0).toDateString();
  const cur = new Date(messages[index]?.timestamp ?? 0).toDateString();
  return prev !== cur;
};

const statusIcon = (status: string | undefined): IconName =>
  getStatusIcon(status) as IconName;

// -  -  - Messenger row -  -  - 
interface ConversationRowProps {
  item: Conversation;
  currentUid: string;
  accent: string;
  onOpen: () => void;
}

const ConversationRow = memo(function ConversationRow({ item, currentUid, accent, onOpen }: ConversationRowProps): React.JSX.Element {
  const isUnread = (item.unreadCount ?? 0) > 0;
  const preview = item.lastMessage
    ? `${String(item.lastMessage.senderUid ?? '') === String(currentUid) ? 'You: ' : ''}${item.lastMessage.text}`
    : 'No messages yet. Say hello!';
  const timeLabel = item.lastMessage?.timestamp ? formatMessageTime(item.lastMessage.timestamp) : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${item.peerName}`}
      accessibilityHint={isUnread ? `${item.unreadCount} unread messages` : 'Open chat history'}
      onPress={onOpen}
      style={({ pressed }) => [styles.rowCard, pressed && styles.rowPressed]}
    >
      <View style={styles.rowAvatarWrap}>
        <View style={[styles.rowAvatar, { backgroundColor: accent }]}>
          <Text style={styles.rowAvatarText}>{item.peerInitial}</Text>
        </View>
        <View style={styles.rowOnlineDot} />
      </View>
      <View style={styles.rowCenter}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.peerName}
          </Text>
          <Text style={styles.rowTime} numberOfLines={1}>
            {timeLabel}
          </Text>
        </View>
        <Text style={styles.rowRole} numberOfLines={1}>{item.roleLabel}</Text>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      {isUnread ? (
        <View style={[styles.rowUnread, { backgroundColor: accent }]}>
          <Text style={styles.rowUnreadText}>{item.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});
export default function ChatScreen({ currentUser, initialTarget = null, onActiveConversationChange }:
ChatScreenProps): React.JSX.Element {
  const isTechnician = currentUser?.role === 'technician';
  const accent = isTechnician ? colors.tech : colors.customer;
  const accentDark = isTechnician ? colors.techDark : colors.customerDark;
  const accentSoft = isTechnician ? colors.techSoft : colors.customerSoft;
  const insets = useSafeAreaInsets();
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

  const inboxSubtitle = totalUnread > 0
    ? `${totalUnread} unread  -  ${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
    : conversations.length > 0
      ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
      : 'Your repair conversations will appear here.';

  // -- Thread view - Messenger-style single header + context strip + bubbles + lightweight composer --
  if (selectedConversation) {
    const s = selectedConversation;
    const peerPhone = s.peerPhone ?? null;
    const canSend = inputText.trim().length > 0 && !sending;
    const stripColor = getStatusColor(s.status);

    return (
      <SafeAreaView style={styles.threadContainer} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

        {/* Single clean header: back, avatar 40, name + role, phone action */}
        <View style={styles.threadHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            hitSlop={10}
            onPress={() => setSelectedConversation(null)}
            style={({ pressed }) => [styles.headerBack, pressed && styles.pressedSoft]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>

          <Pressable
            onPress={() => peerPhone && handleCopyPhone(peerPhone)}
            style={styles.headerAvatarWrap}
          >
            <View style={[styles.headerAvatar, { backgroundColor: accent }]}>
              <Text style={styles.headerAvatarText}>{s.peerInitial}</Text>
            </View>
          </Pressable>

          <Pressable style={styles.headerCenter} onPress={() => peerPhone && handleCopyPhone(peerPhone)}>
            <Text style={styles.headerName} numberOfLines={1}>{s.peerName}</Text>
            <Text style={styles.headerOnline} numberOfLines={1}>Online</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={peerPhone ? `Call ${s.peerName}` : 'No phone number available'}
            hitSlop={8}
            onPress={() => handleCall(peerPhone, s.peerName)}
            style={({ pressed }) => [styles.headerCall, { backgroundColor: accent }, pressed && styles.pressedSoft]}
          >
            <Ionicons name="call" size={18} color={colors.white} />
          </Pressable>
        </View>

        {/* Prototype: no job strip — Today pill opens the message list date */}

        {threadLoading && currentMessages.length > 0 ? (
          <View style={styles.syncRow}>
            <ActivityIndicator size="small" color={colors.customer} />
            <Text style={styles.syncText}>Syncing latest messages.</Text>
          </View>
        ) : null}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            ref={chatScrollRef}
            contentContainerStyle={styles.chatArea}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (currentMessages.length > 0 && inputText.length === 0) {
                chatScrollRef.current?.scrollToEnd({ animated: false });
              }
            }}
          >
            {threadLoading && currentMessages.length === 0 ? (
              <View style={styles.chatLoading}>
                <ActivityIndicator size="large" color={colors.customer} />
                <Text style={styles.chatLoadingText}>Loading conversation...</Text>
              </View>
            ) : currentMessages.length === 0 ? (
              <View style={styles.chatEmpty}>
                <View style={styles.chatEmptyIcon}>
                  <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.customer} />
                </View>
                <Text style={styles.chatEmptyTitle}>Say hello to {s.peerName}</Text>
                <Text style={styles.chatEmptyBody}>Coordinate scheduling, access, and parts. Your history loads instantly here.</Text>
                {peerPhone ? (
                  <Pressable onPress={() => handleCopyPhone(peerPhone)} style={({ pressed }) => [styles.chatEmptyPhone, pressed && styles.pressedSoft]}>
                    <Ionicons name="call-outline" size={14} color={colors.customer} />
                    <Text style={styles.chatEmptyPhoneText}>{peerPhone}</Text>
                    <Text style={styles.chatEmptyPhoneHint}>tap to copy</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              currentMessages.map((msg, index) => {
                const isMe = String(msg.senderUid) === String(currentUser.uid);
                const isLast = index === currentMessages.length - 1;
                const read = isMe && isLast && Array.isArray(msg.readBy) && msg.readBy.some((uid) => uid && String(uid) !== String(currentUser.uid));
                const prevSame = index > 0 && String(currentMessages[index - 1]?.senderUid) === String(msg.senderUid);
                const nextSame = index < currentMessages.length - 1 && String(currentMessages[index + 1]?.senderUid) === String(msg.senderUid);
                const isFirstInGroup = !prevSame;
                const isLastInGroup = !nextSame;

                return (
                  <React.Fragment key={msg.id || `${msg.timestamp}-${index}`}>
                    {shouldShowDivider(currentMessages, index) ? (
                      <View style={styles.dayDivider}>
                        <Text style={styles.dayDividerText}>{formatDayDivider(msg.timestamp)}</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.msgRow,
                        isMe ? styles.msgRowMe : styles.msgRowOther,
                        !isFirstInGroup && styles.msgRowGrouped,
                      ]}
                    >
                      <View
                        style={[
                          styles.bubble,
                          isMe ? null : styles.bubbleOther,
                          isMe ? { backgroundColor: accent, borderWidth: 0 } : null,
                          msg.pending && styles.bubblePending,
                          isMe
                            ? {
                                borderTopRightRadius: isFirstInGroup ? 18 : 8,
                                borderBottomRightRadius: isLastInGroup ? 4 : 8,
                              }
                            : {
                                borderTopLeftRadius: isFirstInGroup ? 18 : 8,
                                borderBottomLeftRadius: isLastInGroup ? 4 : 8,
                              },
                        ]}
                      >
                        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]} selectable>
                          {msg.text}
                        </Text>
                      </View>
                      {/* Timestamp shown only for last in group - keeps bubbles lightweight */}
                      {isLastInGroup ? (
                        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther]}>
                          {formatMessageTime(msg.timestamp)}
                          {isMe && read ? '  -  Read' : ''}
                          {msg.pending ? '  -  Sending...' : ''}
                        </Text>
                      ) : null}
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

          {/* Prototype composer: input + send only */}
          <View style={[styles.composerBar, { paddingBottom: Math.max(8, insets.bottom > 0 ? insets.bottom : 10) }]}>
            <View style={styles.composerInputWrap}>
              <TextInput
                style={styles.composerInput}
                placeholder={isTechnician ? 'Message the customer...' : 'Message the technician...'}
                placeholderTextColor="#8AA0B5"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
                returnKeyType="send"
                onSubmitEditing={handleSendMessage}
                accessibilityLabel="Type your message"
                accessibilityHint="Write a message to your contact"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sending ? 'Sending message' : 'Send message'}
              accessibilityState={{ disabled: !canSend }}
              hitSlop={6}
              onPress={handleSendMessage}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.composerSend,
                { backgroundColor: accent },
                !canSend && styles.composerSendDisabled,
                pressed && canSend && styles.pressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="send" size={16} color={colors.white} style={{ marginLeft: 1, marginTop: 1 }} />
              )}
            </Pressable>
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

  // -- Prototype inbox: dark header, conversation cards, no filters --
  return (
    <SafeAreaView style={styles.inboxContainer} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1B2A" />

      <View style={styles.inboxHeaderDark}>
        <Text style={styles.inboxTitleDark}>Messages</Text>
      </View>

      {inboxError ? (
        <View style={styles.inlineError}>
          <View style={styles.inlineErrorLeft}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inlineErrorTitle}>Could not load chats</Text>
              <Text style={styles.inlineErrorBody}>{inboxError}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => loadInbox(false)}
            style={({ pressed }) => [styles.inlineRetry, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.white} />
            <Text style={styles.inlineRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.skeletonList}>
          {[1, 2, 3, 4, 5].map((k) => (
            <View key={k} style={styles.skeletonRow}>
              <Skeleton style={styles.skeletonAvatar} />
              <View style={styles.skeletonCol}>
                <View style={styles.skeletonLineRow}>
                  <Skeleton style={{ width: '46%', height: 14, borderRadius: 6 }} />
                  <Skeleton style={{ width: 36, height: 11, borderRadius: 6 }} />
                </View>
                <Skeleton style={{ width: '78%', height: 12, borderRadius: 6 }} />
                <Skeleton style={{ width: '52%', height: 11, borderRadius: 6 }} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.jobId)}
          renderItem={({ item }) => (
            <ConversationRow item={item} currentUid={currentUser?.uid} accent={accent} onOpen={() => handleOpenConversation(item)} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.customer} />
              </View>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyBody}>{isTechnician ? 'When you accept a service request, you can coordinate directly with the customer here.' : 'Once a technician accepts your repair request, you can message them here to coordinate scheduling.'}</Text>
            </View>
          }
        />
      )}

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// Helper for bubble radius type
type ViewStyleWithRadius = { borderTopRightRadius?: number; borderBottomRightRadius?: number; borderTopLeftRadius?: number; borderBottomLeftRadius?: number };

const styles = StyleSheet.create({
  // Shared press
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.98 }], opacity: 0.92 },

  // -- Prototype inbox: dark header + cards --
  inboxContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  inboxHeaderDark: { backgroundColor: '#0D1B2A', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  inboxTitleDark: { color: '#FFFFFF', fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  inboxHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
    gap: 12,
  },
  inboxHeaderLeft: { flex: 1 },
  inboxTitle: { fontSize: 26, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.6, lineHeight: 28 },
  inboxSubtitle: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 3, lineHeight: 18 },
  headerUnreadBadge: {
    backgroundColor: colors.customer,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerUnreadText: { color: colors.white, fontSize: 11, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },

  filterBar: {
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
    paddingVertical: 10,
  },
  filterScroll: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillIdle: { backgroundColor: colors.white, borderColor: colors.line },
  filterPillActive: { backgroundColor: colors.customer, borderColor: colors.customerDark },
  filterLabel: { fontSize: 13, fontFamily: fonts.semiBold },
  filterLabelIdle: { color: colors.muted },
  filterLabelActive: { color: colors.white },
  filterCount: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  filterCountIdle: { backgroundColor: '#EDF2F7' },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  filterCountText: { fontSize: 11, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  filterCountTextIdle: { color: colors.muted },
  filterCountTextActive: { color: colors.white },

  inlineError: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineErrorLeft: { flexDirection: 'row', gap: 10, flex: 1, alignItems: 'center' },
  inlineErrorTitle: { color: colors.error, fontSize: 13, fontFamily: fonts.bold },
  inlineErrorBody: { color: colors.ink, fontSize: 12, fontFamily: fonts.regular, marginTop: 2, lineHeight: 16 },
  inlineRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.customer,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 999,
    justifyContent: 'center',
  },
  inlineRetryText: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },

  // Prototype conversation cards
  rowCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  rowPressed: { opacity: 0.92 },
  rowAvatarWrap: { position: 'relative' },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowOnlineDot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#FFFFFF' },
  rowAvatarText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 15 },
  rowCenter: { flex: 1, gap: 1, minWidth: 0 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, fontSize: 14, fontFamily: fonts.bold, color: '#111827', lineHeight: 18 },
  rowTime: { fontSize: 11, fontFamily: fonts.regular, color: '#9CA3AF', fontVariant: ['tabular-nums'], flexShrink: 0 },
  rowRole: { fontSize: 11, fontFamily: fonts.regular, color: '#6B7280' },
  rowPreview: { fontSize: 12, fontFamily: fonts.regular, color: '#6B7280', lineHeight: 16, marginTop: 2 },
  rowUnread: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  rowUnreadText: { color: '#FFFFFF', fontSize: 10, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },

  skeletonList: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  skeletonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skeletonAvatar: { width: 46, height: 46, borderRadius: 23 },
  skeletonCol: { flex: 1, gap: 7 },
  skeletonLineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, flexGrow: 1, backgroundColor: '#F9FAFB', gap: 8 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 64, paddingBottom: 32, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.customerSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center', marginTop: 4 },
  emptyBody: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },

  // -- Thread --
  threadContainer: { flex: 1, backgroundColor: colors.canvas },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    minHeight: 60,
  },
  headerBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarWrap: { padding: 2 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.customer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 15 },
  headerCenter: { flex: 1, gap: 2, paddingRight: 4 },
  headerName: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink, lineHeight: 18 },
  headerOnline: { fontSize: 12, fontFamily: fonts.semiBold, color: '#10B981' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerSub: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.green, flexShrink: 1 },
  headerCall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.customer,
    alignItems: 'center',
    justifyContent: 'center',
  },

  jobStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  jobStripLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  jobStripIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  jobStripText: { fontSize: 12, fontFamily: fonts.bold, color: colors.ink, flexShrink: 1 },
  jobStripDot: { fontSize: 10, color: colors.muted, fontFamily: fonts.regular },
  jobStripStatus: { fontSize: 11, fontFamily: fonts.bold, flexShrink: 1 },
  jobStripRight: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  jobStripAction: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.customer },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 7,
    backgroundColor: '#F0FDFA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  syncText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.customerDark },

  chatArea: { padding: 14, paddingTop: 10, flexGrow: 1, paddingBottom: 16 },
  chatLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 12 },
  chatLoadingText: { fontSize: 13, fontFamily: fonts.medium, color: colors.muted },
  chatEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10, paddingHorizontal: 24 },
  chatEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.customerSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatEmptyTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  chatEmptyBody: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  chatEmptyPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chatEmptyPhoneText: { fontSize: 12, fontFamily: fonts.bold, color: colors.customerDark, fontVariant: ['tabular-nums'] },
  chatEmptyPhoneHint: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted },

  dayDivider: {
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 12,
  },
  dayDividerText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.muted },

  msgRow: { width: '100%', marginVertical: 2 },
  msgRowMe: { alignItems: 'flex-end' },
  msgRowOther: { alignItems: 'flex-start' },
  msgRowGrouped: { marginTop: 1 },

  bubble: { maxWidth: '76%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  bubbleMe: { backgroundColor: colors.customer },
  bubbleOther: { backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E3ECF2' },
  bubblePending: { opacity: 0.78 },
  bubbleText: { fontSize: 14, fontFamily: fonts.medium, lineHeight: 19 },
  bubbleTextMe: { color: colors.white },
  bubbleTextOther: { color: colors.ink },
  bubbleTime: { fontSize: 10.5, fontFamily: fonts.regular, marginTop: 4, fontVariant: ['tabular-nums'], paddingHorizontal: 2 },
  bubbleTimeMe: { color: '#6B8A9A', alignSelf: 'flex-end' },
  bubbleTimeOther: { color: '#8AA0B5', alignSelf: 'flex-start' },

  sendErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FECACA',
  },
  sendErrorText: { flex: 1, fontSize: 12, fontFamily: fonts.semiBold, color: colors.error },

  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  composerPlus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.customerSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: '#F1F5F9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  composerInput: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.ink, paddingVertical: 8, lineHeight: 20, maxHeight: 96 },
  composerSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.customer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSendDisabled: { backgroundColor: '#94A3B8', opacity: 0.55 },

  toast: {
    position: 'absolute',
    bottom: 88,
    left: 16,
    right: 16,
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toastText: { color: colors.white, fontSize: 13, fontFamily: fonts.semiBold, textAlign: 'center' },
});
