// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { forgotPassword } from '../services/api';
import { colors, fonts } from '../../theme';

// Prototype ForgotPassword: white BackHeader + orange lock tile. Logic unchanged.
const ORANGE = colors.customer;

export default function ForgotPasswordScreen({ switchToLogin }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword({ email });
      setIsSent(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to send password reset instructions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.backHeader}>
        <TouchableOpacity onPress={switchToLogin} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back to login">
          <Ionicons name="arrow-back" size={18} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.backTitle}>Forgot Password</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.iconTile}>
          <Ionicons name={isSent ? 'mail-open-outline' : 'lock-closed-outline'} size={28} color={ORANGE} />
        </View>
        <Text style={styles.title}>{isSent ? 'Check your email' : 'Reset your password'}</Text>
        <Text style={styles.copy}>
          {isSent
            ? `We sent recovery instructions to ${email}. Open the link in the email to set a new password.`
            : `Enter your registered email and we'll send a reset link`}
        </Text>
        {!isSent && (
          <>
            <Text style={styles.label}>EMAIL</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="you@email.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </>
        )}
        <TouchableOpacity
          style={styles.primary}
          onPress={isSent ? switchToLogin : handleReset}
          disabled={loading}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={isSent ? 'Back to login' : 'Send reset link'}
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{isSent ? 'Back to Login' : 'Send Reset Link'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.semiBold },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 40, gap: 4 },
  iconTile: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: '#111827', fontSize: 20, fontFamily: fonts.extraBold, marginBottom: 8 },
  copy: { color: '#6B7280', fontSize: 14, fontFamily: fonts.regular, lineHeight: 20, marginBottom: 20 },
  label: { color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F9FAFB', minHeight: 52, marginBottom: 8 },
  input: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.medium, paddingVertical: 12 },
  primary: { backgroundColor: ORANGE, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
