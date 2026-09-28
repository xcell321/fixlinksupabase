import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, shadows, themedStyles } from '../theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  accentColor?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

// Modal-based confirm. Alert buttons misfire on web clients opened through a
// tunnel link, leaving taps with no effect. This renders in-app so confirm
// actions process on web plus native.
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  accentColor,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  const accent = accentColor ?? colors.customer;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              disabled={busy}
              style={({ pressed }) => [styles.cancelButton, pressed && !busy && styles.pressedSoft]}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => [
                styles.confirmButton,
                { backgroundColor: danger ? colors.danger : accent },
                pressed && !busy && styles.pressedSoft,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,27,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: 18, padding: 20, ...shadows.hud },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  message: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 8, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  // Borderless quiet button, matching every other secondary action in the app.
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.appBg, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontFamily: fonts.bold, color: colors.muted },
  confirmButton: { flex: 2, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  confirmText: { fontSize: 14, fontFamily: fonts.bold, color: colors.onAccent },
  pressedSoft: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
