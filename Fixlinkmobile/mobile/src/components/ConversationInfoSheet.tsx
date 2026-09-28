// Conversation details sheet — who you are talking to, and the job this chat
// belongs to. Shared by both roles; only the accent follows the viewer, so a
// technician sees the blue system and a customer the orange one.
//
// Same sheet grammar as HelpSheet / PhotoLightbox: ink scrim, white sheet with
// a 28px top radius, 4px-grid spacing, accent-tinted icon tiles.
import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadows, themedStyles } from '../theme';
import { getStatusColor, getStatusIcon } from '../utils/applianceIcons';

type ViewerRole = 'customer' | 'technician';

interface ConversationInfoSheetProps {
  visible: boolean;
  // The signed-in user's role. Drives the accent only.
  viewerRole: ViewerRole;
  peerName: string;
  peerInitial: string;
  peerImage?: string | null;
  // e.g. "Verified Technician" / "Customer", straight from the conversation.
  peerRoleLabel?: string;
  peerPhone?: string | null;
  online?: boolean;
  jobCode?: string;
  applianceType?: string;
  status?: string;
  lastActivityLabel?: string;
  onCall: () => void;
  onCopyPhone: () => void;
  onClose: () => void;
}

export default function ConversationInfoSheet({
  visible,
  viewerRole,
  peerName,
  peerInitial,
  peerImage,
  peerRoleLabel,
  peerPhone,
  online = false,
  jobCode,
  applianceType,
  status,
  lastActivityLabel,
  onCall,
  onCopyPhone,
  onClose,
}: ConversationInfoSheetProps): React.JSX.Element {
  const isCustomer = viewerRole === 'customer';
  const accent = isCustomer ? colors.customer : colors.tech;
  const accentDark = isCustomer ? colors.customerDark : colors.techDark;
  const accentSoft = isCustomer ? colors.customerSoft : colors.techSoft;
  const accentEdge = isCustomer ? colors.customerMist : colors.techMist;

  const phone = String(peerPhone ?? '').trim();
  const hasPhone = phone.length > 0;
  const statusColor = status ? getStatusColor(status) : colors.muted;
  const statusIcon = status ? getStatusIcon(status) : 'time-outline';

  // The closeout code is the one rule both sides must not get wrong.
  const safetyNote = isCustomer
    ? 'Keep this chat inside FixLink. Never share your 4-digit completion code until the repair is finished.'
    : 'Keep this chat inside FixLink. Ask for the 4-digit completion code only after the repair is finished.';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Identity: who am I talking to */}
          <View style={styles.identity}>
            {peerImage ? (
              <Image source={{ uri: peerImage }} style={styles.avatar} accessibilityLabel={`${peerName} photo`} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: accentSoft, borderColor: accentEdge }]}>
                <Text style={[styles.avatarText, { color: accentDark }]}>{peerInitial}</Text>
              </View>
            )}

            <View style={styles.identityCopy}>
              <Text style={styles.name} numberOfLines={1}>{peerName}</Text>
              <View style={styles.metaRow}>
                <View style={[styles.onlineDot, online ? styles.onlineDotOn : styles.onlineDotOff]} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {online ? 'Online now' : 'Offline'}
                  {peerRoleLabel ? `  ·  ${peerRoleLabel}` : ''}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close conversation details"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* The job behind the conversation */}
            <Text style={styles.sectionKicker}>CONVERSATION</Text>
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.iconTile, { backgroundColor: accentSoft, borderColor: accentEdge }]}>
                  <Ionicons name="construct-outline" size={16} color={accent} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{applianceType || 'Repair job'}</Text>
                  {jobCode ? <Text style={styles.cardMeta} numberOfLines={1}>Job #{jobCode}</Text> : null}
                </View>
                {status ? (
                  <View style={[styles.statusPill, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
                    <Ionicons name={statusIcon as never} size={11} color={statusColor} />
                    <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>{status}</Text>
                  </View>
                ) : null}
              </View>
              {lastActivityLabel ? (
                <View style={styles.metaLine}>
                  <Ionicons name="time-outline" size={13} color={colors.muted} />
                  <Text style={styles.metaLineText} numberOfLines={1}>Last message {lastActivityLabel}</Text>
                </View>
              ) : null}
            </View>

            {/* Contact */}
            <Text style={styles.sectionKicker}>CONTACT</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasPhone ? `Copy phone number ${phone}` : 'No phone number on file'}
              accessibilityState={{ disabled: !hasPhone }}
              disabled={!hasPhone}
              onPress={onCopyPhone}
              style={({ pressed }) => [styles.contactRow, pressed && hasPhone && styles.pressedSoft]}
            >
              <View style={[styles.iconTile, { backgroundColor: accentSoft, borderColor: accentEdge }]}>
                <Ionicons name="call-outline" size={16} color={accent} />
              </View>
              <View style={styles.cardCopy}>
                <Text style={[styles.contactNumber, !hasPhone && styles.contactNumberMuted]} numberOfLines={1}>
                  {hasPhone ? phone : 'No number on file'}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {hasPhone ? 'Tap to copy' : 'Use chat to coordinate instead'}
                </Text>
              </View>
              {hasPhone ? <Ionicons name="copy-outline" size={16} color={colors.muted} /> : null}
            </Pressable>

            <View style={styles.safetyNote}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted} />
              <Text style={styles.safetyText}>{safetyNote}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasPhone ? `Call ${peerName}` : 'No phone number available'}
              accessibilityState={{ disabled: !hasPhone }}
              disabled={!hasPhone}
              onPress={onCall}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: accent },
                !hasPhone && styles.primaryButtonDisabled,
                pressed && hasPhone && styles.pressed,
              ]}
            >
              <Ionicons name="call" size={16} color={colors.onAccent} />
              <Text style={styles.primaryButtonText} numberOfLines={1}>Call {peerName.split(' ')[0]}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close conversation details"
              onPress={onClose}
              style={({ pressed }) => [styles.dismissButton, pressed && styles.pressedSoft]}
            >
              <Text style={styles.dismissButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  overlay: { flex: 1, backgroundColor: 'rgba(16, 42, 67, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: '88%',
  },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarText: { fontSize: 22, fontFamily: fonts.extraBold },
  identityCopy: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineDotOn: { backgroundColor: colors.green },
  onlineDotOff: { backgroundColor: colors.line },
  metaText: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },

  body: { paddingTop: 4, paddingBottom: 8 },
  sectionKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginTop: 16, marginBottom: 8 },

  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, ...shadows.card },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  cardMeta: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  metaLineText: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.regular },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, flexShrink: 0, maxWidth: 128 },
  statusText: { fontSize: 11, fontFamily: fonts.bold, flexShrink: 1 },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, minHeight: 64, ...shadows.card },
  contactNumber: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  contactNumberMuted: { color: colors.muted, fontFamily: fonts.semiBold },

  safetyNote: { flexDirection: 'row', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginTop: 16, alignItems: 'flex-start' },
  safetyText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16, fontFamily: fonts.regular },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  primaryButtonDisabled: { backgroundColor: colors.line },
  primaryButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold, flexShrink: 1 },
  dismissButton: { minWidth: 88, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dismissButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.semiBold },
});
