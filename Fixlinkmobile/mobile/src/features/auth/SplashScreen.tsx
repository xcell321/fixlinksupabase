// Prototype Splash — FixIt CustomerSplash layout (dark #0D1B2A, orange #F97316).
// Entry screen before login/register. No backend calls.
import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, themedStyles } from '../../theme';

const ORANGE = colors.customer;
const DARK = colors.dark;

interface SplashScreenProps {
  onGetStarted: () => void;
  onHaveAccount: () => void;
}

export default function SplashScreen({ onGetStarted, onHaveAccount }: SplashScreenProps): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />
      <View style={styles.center}>
        <View style={styles.logo}>
          <Ionicons name="construct" size={36} color={colors.onAccent} />
        </View>
        <Text style={styles.brand}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
        <Text style={styles.tagline}>Fast, reliable device repair at your doorstep</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primary} onPress={onGetStarted} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Get started">
            <Text style={styles.primaryText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outline} onPress={onHaveAccount} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="I already have an account">
            <Text style={styles.outlineText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.foot}>Customer & Technician App</Text>
    </View>
  );
}

const styles = themedStyles({
  screen: { flex: 1, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  blobTop: { position: 'absolute', top: -80, right: -80, width: 288, height: 288, borderRadius: 144, backgroundColor: ORANGE, opacity: 0.10 },
  blobBottom: { position: 'absolute', bottom: 40, left: -64, width: 192, height: 192, borderRadius: 96, backgroundColor: ORANGE, opacity: 0.10 },
  center: { alignItems: 'center', paddingHorizontal: 32, width: '100%', maxWidth: 360 },
  logo: { width: 80, height: 80, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 8px 24px rgba(249,115,22,0.35)', elevation: 6 },
  brand: { color: colors.onAccent, fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  brandAccent: { color: ORANGE, fontFamily: fonts.extraBold },
  tagline: { color: '#9CA3AF', fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },
  actions: { width: '100%', gap: 12, marginTop: 32 },
  primary: { backgroundColor: ORANGE, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
  outline: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.semiBold },
  foot: { position: 'absolute', bottom: 24, color: '#4B5563', fontSize: 12, fontFamily: fonts.regular },
});
