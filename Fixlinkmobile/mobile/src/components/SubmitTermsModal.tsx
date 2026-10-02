import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadows, themedStyles } from '../theme';
import {
  submitTermRules,
  termsAgreeLabel,
  termsContinueLabel,
  termsDeclineLabel,
  termsIntro,
  termsTitle,
  termsVersion,
} from '../utils/submitTerms';

interface SubmitTermsModalProps {
  visible: boolean;
  onAgree: () => void;
  onDecline: () => void;
}

/**
 * UAT #4 — the regulation gate that stands between step 3 (appointment) and
 * step 4 (location + map).
 *
 * Strict by construction: the confirmation checkbox starts unticked, the agree
 * button stays disabled until it is ticked, and dismissing the modal is treated
 * as a refusal, so the booking never advances by accident.
 */
export default function SubmitTermsModal({
  visible,
  onAgree,
  onDecline,
}: SubmitTermsModalProps): React.JSX.Element {
  const [accepted, setAccepted] = useState(false);

  // Re-opening the modal must always start from an unticked box, otherwise a
  // previous agreement would silently carry into a later booking.
  useEffect(() => {
    if (visible) setAccepted(false);
  }, [visible]);

  const rules = submitTermRules();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="document-text-outline" size={20} color={colors.customer} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{termsTitle()}</Text>
              <Text style={styles.version}>Version {termsVersion()}</Text>
            </View>
          </View>

          <Text style={styles.intro}>{termsIntro()}</Text>

          <ScrollView style={styles.ruleScroll} contentContainerStyle={styles.ruleList}>
            {rules.map((rule, index) => (
              <View key={rule.id} style={styles.ruleRow}>
                <View style={styles.ruleIndex}>
                  <Text style={styles.ruleIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.ruleCopy}>
                  <Text style={styles.ruleLabel}>{rule.label}</Text>
                  <Text style={styles.ruleBody}>{rule.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={styles.acceptRow}
            onPress={() => setAccepted((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            accessibilityLabel={termsAgreeLabel()}
            hitSlop={8}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
            </View>
            <Text style={styles.acceptText}>{termsAgreeLabel()}</Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={termsDeclineLabel()}
              onPress={onDecline}
              style={({ pressed }) => [styles.declineButton, pressed && styles.pressedSoft]}
            >
              <Text style={styles.declineText}>{termsDeclineLabel()}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={termsContinueLabel()}
              accessibilityState={{ disabled: !accepted }}
              onPress={onAgree}
              disabled={!accepted}
              style={({ pressed }) => [
                styles.agreeButton,
                !accepted && styles.agreeButtonDisabled,
                pressed && accepted && styles.pressedSoft,
              ]}
            >
              <Text style={[styles.agreeText, !accepted && styles.agreeTextDisabled]}>
                {termsContinueLabel()}
              </Text>
            </Pressable>
          </View>

          {!accepted && (
            <Text style={styles.hint} accessibilityLiveRegion="polite">
              Tick the box to enable continuing.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    ...shadows.hud
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.customerSoft,
    borderWidth: 1,
    borderColor: colors.customerMist,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontFamily: fonts.extraBold, color: colors.ink, letterSpacing: -0.3 },
  version: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted, marginTop: 2 },
  intro: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, lineHeight: 19, marginTop: 14 },

  ruleScroll: { marginTop: 14 },
  ruleList: { gap: 12, paddingBottom: 2 },
  ruleRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 12,
    padding: 12
  },
  ruleIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.customerSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ruleIndexText: { fontSize: 11, fontFamily: fonts.bold, color: colors.customerDark },
  ruleCopy: { flex: 1, minWidth: 0 },
  ruleLabel: { fontSize: 13, fontFamily: fonts.bold, color: colors.ink, marginBottom: 3 },
  ruleBody: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, lineHeight: 18 },

  // Strict acknowledgement: unticked by default, and the only path forward.
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 8,
    minHeight: 44
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkboxChecked: { backgroundColor: colors.customer, borderColor: colors.customer },
  acceptText: { flex: 1, fontSize: 13, fontFamily: fonts.semiBold, color: colors.ink, lineHeight: 18 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  declineButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.appBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  declineText: { fontSize: 13, fontFamily: fonts.bold, color: colors.muted },
  agreeButton: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.customer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  agreeButtonDisabled: { backgroundColor: colors.line },
  agreeText: { fontSize: 13, fontFamily: fonts.bold, color: colors.onAccent, textAlign: 'center' },
  agreeTextDisabled: { color: colors.muted },
  hint: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted, marginTop: 8, textAlign: 'center' },

  pressedSoft: { opacity: 0.85, transform: [{ scale: 0.98 }] }
});
