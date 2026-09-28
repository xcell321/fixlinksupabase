// Prototype TechVerifyPending: blue shield, pending copy, next-steps card.
import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';

const BLUE = colors.tech;

interface VerifyPendingScreenProps {
  onBackToLogin: () => void;
}

export default function VerifyPendingScreen({ onBackToLogin }: VerifyPendingScreenProps): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <View style={styles.iconWrap}>
        <Ionicons name="shield-checkmark-outline" size={36} color={BLUE} />
      </View>
      <Text style={styles.title}>Verification Pending</Text>
      <Text style={styles.copy}>We&apos;re reviewing your application. You&apos;ll receive an email within 24–48 hours.</Text>
      <View style={styles.nextCard}>
        <Text style={styles.nextTitle}>What happens next?</Text>
        <Text style={styles.nextItem}>1. Background check initiated</Text>
        <Text style={styles.nextItem}>2. Skills verification</Text>
        <Text style={styles.nextItem}>3. Account activation</Text>
      </View>
      <TouchableOpacity onPress={onBackToLogin} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Back to sign in">
        <Text style={styles.link}>Back to Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 4 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: '#111827', fontSize: 24, fontFamily: fonts.extraBold, marginBottom: 8, textAlign: 'center' },
  copy: { color: '#6B7280', fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  nextCard: { alignSelf: 'stretch', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 16, padding: 16, marginBottom: 20 },
  nextTitle: { color: '#1E40AF', fontSize: 14, fontFamily: fonts.bold, marginBottom: 8 },
  nextItem: { color: '#2563EB', fontSize: 13, fontFamily: fonts.regular, lineHeight: 22 },
  link: { color: BLUE, fontSize: 14, fontFamily: fonts.semiBold },
});
