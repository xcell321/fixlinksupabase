import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadows, themedStyles } from '../theme';

type Role = 'customer' | 'technician';

interface HelpSheetProps {
  visible: boolean;
  role: Role;
  onClose: () => void;
  // When provided, the sheet offers a shortcut into the FixLink Assistant for
  // questions the static guide does not answer.
  onAskAssistant?: () => void;
}

type HelpItem = { icon: string; title: string; body: string };

const CUSTOMER_ITEMS: HelpItem[] = [
  {
    icon: 'create-outline',
    title: 'Requesting',
    body: 'Create a repair request with appliance, issue description, optional photo, preferred schedule, and service location. Your address stays masked until a technician accepts.',
  },
  {
    icon: 'people-outline',
    title: 'Matching',
    body: 'Verified technicians near you see the request. AI suggestions can help you compare skills, ratings, and distance — they don’t guarantee a match.',
  },
  {
    icon: 'calendar-outline',
    title: 'Scheduling',
    body: 'Choose today or a future date and a time window. You can reschedule after a technician is matched.',
  },
  {
    icon: 'map-outline',
    title: 'Tracking',
    body: 'When a job is accepted, follow the technician live on the map. Keep your phone nearby so you don’t miss updates.',
  },
  {
    icon: 'key-outline',
    title: 'Completion',
    body: 'After the repair, share your 4-digit completion code with the technician so they can close the job on their side.',
  },
  {
    icon: 'star-outline',
    title: 'Reviews',
    body: 'Leave a rating and optional comment after completion. It helps the technician and the next customer.',
  },
];

const TECHNICIAN_ITEMS: HelpItem[] = [
  {
    icon: 'radio-outline',
    title: 'Finding work',
    body: 'Keep your profile verified and skills up to date. Nearby requests matching your skills appear in the Jobs feed.',
  },
  {
    icon: 'hand-left-outline',
    title: 'Accepting',
    body: 'Review the issue, photo, schedule, and distance before accepting. Accept only work you can complete on time.',
  },
  {
    icon: 'calendar-outline',
    title: 'Scheduling',
    body: 'Check your upcoming schedule — the app shows if a request overlaps a day you already have work.',
  },
  {
    icon: 'navigate-outline',
    title: 'Tracking',
    body: 'Use live tracking to coordinate arrival. Your location helps the customer follow your ETA.',
  },
  {
    icon: 'checkmark-done-outline',
    title: 'Completion',
    body: 'Finish the repair, then ask the customer for their 4-digit completion code to close the job. Don’t share or guess codes.',
  },
  {
    icon: 'briefcase-outline',
    title: 'Workload',
    body: 'You can see your active jobs at any time. At capacity, new acceptances are paused until you complete existing work.',
  },
];

export default function HelpSheet({ visible, role, onClose, onAskAssistant }: HelpSheetProps): React.JSX.Element {
  const isCustomer = role === 'customer';
  // Accent follows the role, same as the rest of the app: orange for customers,
  // blue for technicians.
  const accent = isCustomer ? colors.customer : colors.tech;
  const accentDark = isCustomer ? colors.customerDark : colors.techDark;
  const accentSoft = isCustomer ? colors.customerSoft : colors.techSoft;
  const accentEdge = isCustomer ? colors.customerMist : colors.techMist;
  const items = isCustomer ? CUSTOMER_ITEMS : TECHNICIAN_ITEMS;
  const intro = isCustomer
    ? 'FixLink connects you with verified nearby technicians — from request to OTP closeout — without exposing your exact address before a match.'
    : 'FixLink sends verified nearby jobs to your Jobs feed and keeps the workflow honest — accept, track, and close with the customer’s OTP.';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: accentSoft, borderColor: accentEdge }]}>
              <Ionicons name="help-circle-outline" size={20} color={accent} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.kicker, { color: accentDark }]}>HELP & HOW IT WORKS</Text>
              <Text style={styles.title}>{isCustomer ? 'Customer' : 'Technician'}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{intro}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close help"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {items.map((item) => (
              <View key={item.title} style={styles.row}>
                <View style={[styles.iconTile, { backgroundColor: accentSoft, borderColor: accentEdge }]}>
                  <Ionicons name={item.icon as never} size={16} color={accent} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowBody}>{item.body}</Text>
                </View>
              </View>
            ))}

            <View style={styles.trustNote}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted} />
              <Text style={styles.trustNoteText}>
                FixLink does not process payments inside the app and does not guarantee arrival times. Availability, workload, and AI suggestions support your decision — they don’t replace it.
              </Text>
            </View>
          </ScrollView>

          {/* Progressive disclosure: the guide answers the common questions,
              the assistant handles the specific one. */}
          <View style={styles.footer}>
            {onAskAssistant ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask the FixLink Assistant"
                onPress={onAskAssistant}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: accent }, pressed && styles.pressed]}
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.onAccent} />
                <Text style={styles.primaryButtonText}>Ask the Assistant</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close help sheet"
              onPress={onClose}
              style={({ pressed }) => [styles.dismissButton, !onAskAssistant && styles.dismissButtonFull, pressed && styles.pressedSoft]}
            >
              <Text style={styles.dismissButtonText}>Got it</Text>
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
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 28, maxHeight: '86%' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerIcon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  kicker: { fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.regular, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 12, paddingBottom: 12 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, ...shadows.card },
  iconTile: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  rowBody: { color: colors.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  trustNote: { flexDirection: 'row', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, alignItems: 'flex-start' },
  trustNoteText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16, fontFamily: fonts.regular },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  primaryButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  dismissButton: { minWidth: 88, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // Without an assistant shortcut the dismiss button is the only action.
  dismissButtonFull: { flex: 1 },
  dismissButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.semiBold },
});
