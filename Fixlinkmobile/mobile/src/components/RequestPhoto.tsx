import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, themedStyles } from '../theme';

interface PhotoLightboxProps {
  visible: boolean;
  photoUrl: string | null | undefined;
  title?: string;
  subtitle?: string;
  // The viewer is shared by repair photos and chat photos, so the closing line
  // is caller-supplied instead of hardcoded to the repair flow.
  caption?: string;
  onClose: () => void;
}

/**
 * Shared bottom-sheet photo viewer used across customer + technician flows.
 * Matches the FixLink sheet pattern (white sheet, 28px top radius, ink overlay)
 * so viewing a repair photo feels like the rest of the app — no fullscreen
 * black gallery, no decorative effects.
 */
export function PhotoLightbox({ visible, photoUrl, title = 'Problem photo', subtitle = 'Attached by the customer', caption = 'Use this photo to understand the issue before travelling to the site.', onClose }: PhotoLightboxProps): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close photo viewer"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.image} resizeMode="cover" accessibilityLabel="Attached repair photo" />
          ) : (
            <View style={styles.emptyRow}>
              <Ionicons name="image-outline" size={18} color={colors.muted} />
              <Text style={styles.emptyText}>No photo attached to this request.</Text>
            </View>
          )}

          <Text style={styles.caption}>{caption}</Text>
        </View>
      </View>
    </Modal>
  );
}

interface PhotoThumbProps {
  photoUrl: string;
  onPress: () => void;
  label?: string;
}

/**
 * Compact inline row shown inside job / request cards when a photo exists.
 * 52px thumbnail keeps cards scannable; the full image opens in PhotoLightbox.
 */
export function PhotoThumb({ photoUrl, onPress, label = 'tap to view' }: PhotoThumbProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View attached repair photo"
      accessibilityHint="Opens the attached photo"
      onPress={onPress}
      style={({ pressed }) => [styles.thumbRow, pressed && styles.pressedSoft]}
    >
      <Image source={{ uri: photoUrl }} style={styles.thumb} accessibilityLabel="Repair photo thumbnail" />
      <Ionicons name="image-outline" size={16} color={colors.tech} />
      <Text style={styles.thumbLabel} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = themedStyles({
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  overlay: { flex: 1, backgroundColor: 'rgba(16, 42, 67, 0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 28, maxHeight: '82%' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerSpacer: { width: 32 },
  headerCopy: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 3 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center' },

  image: { width: '100%', height: 260, borderRadius: 14, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  caption: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17, textAlign: 'center', marginTop: 12 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16 },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },

  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 8, paddingRight: 12, marginTop: 10 },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.lineSoft ?? '#E3ECF2' },
  thumbLabel: { flex: 1, color: colors.tech, fontSize: 12, fontFamily: fonts.semiBold },
});
