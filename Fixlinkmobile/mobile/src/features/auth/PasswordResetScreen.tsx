// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resetPassword } from '../../services/api';
import { colors, fonts } from '../../theme';

// Same prototype header family as ForgotPassword (not in prototype, deep-link only).
const ORANGE = colors.customer;

export default function PasswordResetScreen({ params, switchToLogin }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a new password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        uid: params?.uid,
        email: params?.email,
        token: params?.token,
        token_hash: params?.token_hash,
        newPassword: password,
      });
      Alert.alert('Success', 'Password updated. You can now sign in.', [
        { text: 'OK', onPress: switchToLogin },
      ]);
    } catch (e) {
      Alert.alert('Error', e.error || 'Unable to reset password. Please try again.');
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
        <Text style={styles.backTitle}>Set New Password</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.iconTile}>
          <Ionicons name="lock-closed-outline" size={28} color={ORANGE} />
        </View>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.copy}>Enter and confirm your new password below.</Text>
        <Text style={styles.label}>NEW PASSWORD</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>
        <Text style={styles.label}>CONFIRM PASSWORD</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>
        <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={loading} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Save new password">
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save New Password</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  // SafeAreaView in AppNavigator already clears the status bar; keep only a
  // small gap so the back row sits at the top instead of floating mid-screen.
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.semiBold },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 40, gap: 4 },
  iconTile: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: '#111827', fontSize: 20, fontFamily: fonts.extraBold, marginBottom: 8 },
  copy: { color: '#6B7280', fontSize: 14, fontFamily: fonts.regular, lineHeight: 20, marginBottom: 20 },
  label: { color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  inputWrap: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F9FAFB', minHeight: 52, justifyContent: 'center', marginBottom: 4 },
  input: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.medium, paddingVertical: 12 },
  primary: { backgroundColor: ORANGE, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
