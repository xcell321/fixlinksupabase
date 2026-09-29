import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadows, themedStyles } from '../theme';

interface InfoModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  accentColor?: string;
  onClose: () => void;
}

// Single-button floating success/info modal. Alert dialogs misfire on web
// clients opened through a tunnel link, so success feedback renders in-app.
export default function InfoModal({
  visible,
  title,
  message,
  buttonLabel,
  accentColor,
  onClose,
}: InfoModalProps): React.JSX.Element {
  const accent = accentColor ?? colors.customer;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconWell, { backgroundColor: `${accent}15` }]}>
            <Ionicons name="checkmark-circle" size={30} color={accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            onPress={onClose}
            style={({ pressed }) => [styles.button, { backgroundColor: accent }, pressed && styles.pressedSoft]}
          >
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,27,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: 18, padding: 20, alignItems: 'center', ...shadows.hud },
  iconWell: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  message: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 8, lineHeight: 19, textAlign: 'center' },
  button: { width: '100%', minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonText: { fontSize: 14, fontFamily: fonts.bold, color: colors.onAccent },
  pressedSoft: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
