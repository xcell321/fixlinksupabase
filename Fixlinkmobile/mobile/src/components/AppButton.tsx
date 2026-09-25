import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../theme';

export interface AppButtonProps {
  title: string;
  icon?: string;
  loading?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'customer' | 'tech';
}

const TONES = { customer: '#F97316', tech: '#2563EB' } as const;

export default function AppButton({ title, icon, loading = false, onPress, style, tone = 'customer' }: AppButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.button, { backgroundColor: TONES[tone] }, pressed ? styles.pressed : undefined, style] as const}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : icon ? <Ionicons name={icon as never} size={18} color="#FFFFFF" /> : null}
      {!loading ? <Text style={styles.label}>{title}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 4px 10px rgba(15,118,110,0.18)',
    elevation: 3,
  } as ViewStyle,
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] } as ViewStyle,
  label: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold, letterSpacing: 0.1 } as const,
});
