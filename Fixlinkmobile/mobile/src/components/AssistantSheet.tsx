// FixLink Assistant — the AI chatbot bottom sheet.
//
// Extracted from DashboardScreen so more than one entry point (the Home robot
// FAB and Profile > Help & Support) can open the same conversation, with the
// same per-user history. The caller supplies the grounding context; the sheet
// owns the thread, the typing state and the persistence.
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { askAssistant } from '../services/api';
import { colors, fonts, themedStyles } from '../theme';

type AiMessage = { id: string; from: 'ai' | 'me'; text: string };

// Live FixLink data handed to the model so answers are grounded in the
// customer's real state instead of generic advice.
export type AssistantContext = {
  customerName?: string | null;
  customerUid?: string | null;
  activeJob?: {
    applianceType?: string | null;
    status?: string | null;
    technicianName?: string | null;
    preferredTime?: string | null;
  } | null;
  activeCount?: number;
  pendingCount?: number;
  completedCount?: number;
};

type AssistantSheetProps = {
  visible: boolean;
  // Scopes the saved conversation to the signed-in user.
  uid?: string;
  context: AssistantContext;
  onClose: () => void;
};

// No hardcoded answers: every reply comes from the real AI with live FixLink
// data. When the gateway is down, say so honestly instead of inventing one.
const AI_DOWN = 'AI service is unavailable right now. Please check your connection and try again.';
const GREETING = 'Hi! I am your FixLink Assistant. Ask me about repairs, technicians, or tracking.';
const SUGGESTIONS = ['Find nearby technician', 'Track my repair'];
const ASSISTANT_IMAGE = require('../../assets/ai-assistant.png');

export default function AssistantSheet({ visible, uid, context, onClose }: AssistantSheetProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([{ id: 'ai-hello', from: 'ai', text: GREETING }]);

  // Keep the thread pinned to the newest bubble: when the sheet opens, when a
  // bubble is added, and after the keyboard resizes the sheet.
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollToEnd = (animated = false, delay = 0) => {
    const run = () => scrollRef.current?.scrollToEnd({ animated });
    if (delay > 0) setTimeout(run, delay); else run();
  };
  useEffect(() => {
    if (!visible) return undefined;
    scrollToEnd(false, 80);
    const timer = setTimeout(() => scrollToEnd(false), 420);
    return () => clearTimeout(timer);
  }, [visible]);
  useEffect(() => {
    if (visible) scrollToEnd(true, 60);
  }, [messages.length, typing]);

  // Persisted conversation: survives reload/restart, per customer.
  const chatKey = `fixlink_ai_chat_${uid || 'guest'}`;
  const [chatReady, setChatReady] = useState(false);
  useEffect(() => {
    let on = true;
    setChatReady(false);
    AsyncStorage.getItem(chatKey).then((raw) => {
      if (!on) return;
      try {
        const saved = raw ? JSON.parse(raw) : null;
        if (Array.isArray(saved) && saved.length > 0 && saved.every((m) => m && typeof m.text === 'string')) {
          setMessages(saved.slice(-50));
        }
      } catch {}
      setChatReady(true);
    }).catch(() => { if (on) setChatReady(true); });
    return () => { on = false; };
  }, [chatKey]);
  useEffect(() => {
    if (!chatReady) return;
    AsyncStorage.setItem(chatKey, JSON.stringify(messages.slice(-50))).catch(() => {});
  }, [messages, chatReady, chatKey]);

  const send = (preset?: string) => {
    const text = String(preset ?? input).trim();
    if (!text || typing) return;
    setMessages((cur) => [...cur, { id: `me-${Date.now()}`, from: 'me', text }]);
    setInput('');
    setTyping(true);
    askAssistant(text, context).then((response) => {
      const reply = String(response?.reply || '').trim() || AI_DOWN;
      setMessages((cur) => [...cur, { id: `ai-${Date.now()}`, from: 'ai', text: reply }]);
      setTyping(false);
    }).catch(() => {
      setMessages((cur) => [...cur, { id: `ai-${Date.now()}`, from: 'ai', text: AI_DOWN }]);
      setTyping(false);
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheet}>
          <View style={styles.header}>
            <Image source={ASSISTANT_IMAGE} style={styles.headerImage} accessibilityLabel="FixLink Assistant" />
            <View style={styles.headerCopy}>
              <Text style={styles.title}>FixLink Assistant</Text>
              <View style={styles.readyRow}>
                <View style={styles.readyDot} />
                <Text style={styles.readyText}>Ready to help</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close assistant">
              <Ionicons name="close" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollToEnd(false)}
          >
            {messages.map((m) => (
              <View key={m.id} style={[styles.bubbleRow, m.from === 'me' ? styles.bubbleRowMe : styles.bubbleRowAi]}>
                {m.from === 'ai' ? (
                  <Image source={ASSISTANT_IMAGE} style={styles.miniImage} accessibilityLabel="FixLink Assistant" />
                ) : null}
                <View style={[styles.bubble, m.from === 'me' ? styles.bubbleMe : styles.bubbleAi]}>
                  <Text style={[styles.bubbleText, m.from === 'me' ? styles.bubbleTextMe : styles.bubbleTextAi]}>{m.text}</Text>
                </View>
              </View>
            ))}
            {typing ? (
              <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
                <Image source={ASSISTANT_IMAGE} style={styles.miniImage} accessibilityLabel="FixLink Assistant" />
                <View style={[styles.bubble, styles.bubbleAi]}>
                  <Text style={styles.bubbleTextAi}>Typing...</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.chips}>
            {SUGGESTIONS.map((c) => (
              <TouchableOpacity key={c} style={styles.chip} onPress={() => send(c)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={c}>
                <Text style={styles.chipText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask FixLink AI..."
              placeholderTextColor={colors.muted}
              onFocus={() => scrollToEnd(false, 180)}
              onSubmitEditing={() => send()}
              returnKeyType="send"
              accessibilityLabel="Ask FixLink AI"
            />
            <TouchableOpacity style={styles.send} onPress={() => send()} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Send message">
              <Ionicons name="send" size={16} color={colors.onAccent} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { flex: 1, backgroundColor: colors.white, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  headerImage: { width: 32, height: 32, borderRadius: 10 },
  headerCopy: { flex: 1 },
  title: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  readyText: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  messages: { flex: 1 },
  messagesContent: { gap: 8, paddingBottom: 4 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowAi: { justifyContent: 'flex-start' },
  miniImage: { width: 20, height: 20, borderRadius: 10 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleMe: { backgroundColor: colors.customer, borderTopRightRadius: 4 },
  bubbleAi: { backgroundColor: colors.cardBorder, borderTopLeftRadius: 4 },
  bubbleText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  bubbleTextMe: { color: colors.onAccent },
  bubbleTextAi: { color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: colors.customerMist, backgroundColor: colors.customerSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: colors.customerDark, fontSize: 12, fontFamily: fonts.semiBold },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.appBg, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, fontSize: 13, fontFamily: fonts.regular, color: colors.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.customer, alignItems: 'center', justifyContent: 'center' },
});
