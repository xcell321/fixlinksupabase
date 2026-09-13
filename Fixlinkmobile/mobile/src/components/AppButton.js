import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../theme';

export default function AppButton({ title, icon, loading = false, onPress, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : icon ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
      {!loading && <Text style={styles.label}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.9 },
  label: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
