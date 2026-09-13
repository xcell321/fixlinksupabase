import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resetPassword } from '../services/api';
import AppButton from '../../components/AppButton';
import { colors, fonts } from '../../theme';

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
    <View style={styles.container}>
      <View style={styles.brandBlock}>
        <View style={styles.logo}><Ionicons name="construct" size={24} color={colors.white} /></View>
        <Text style={styles.brand}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Set New Password</Text>
        <Text style={styles.subTitle}>Choose a new password for your FixLink account.</Text>

        <Text style={styles.label}>New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 6 characters"
          placeholderTextColor="#5A7A91"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Repeat your new password"
          placeholderTextColor="#5A7A91"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <AppButton title="Save New Password" loading={loading} onPress={handleSubmit} style={styles.btn} />

        <Pressable onPress={switchToLogin} style={styles.backLink}>
          <Text style={styles.backLinkTxt}>Remember your password? <Text style={styles.linkAccent}>Sign in</Text></Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#F5F8FA' },
  brandBlock: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 54, height: 54, borderRadius: 19, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  brand: { color: colors.ink, fontSize: 18, fontFamily: fonts.extraBold },
  brandAccent: { color: colors.teal, fontFamily: fonts.extraBold },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, alignItems: 'center' },
  title: { fontSize: 22, fontFamily: fonts.bold, color: '#102A43', marginBottom: 8, textAlign: 'center' },
  subTitle: { fontSize: 14, color: '#5A7A91', textAlign: 'center', marginBottom: 20, fontFamily: fonts.regular },
  label: { alignSelf: 'flex-start', fontSize: 14, fontFamily: fonts.medium, color: '#102A43', marginBottom: 8 },
  input: { width: '100%', backgroundColor: '#fff', padding: 15, marginBottom: 15, borderRadius: 12, borderWidth: 1, borderColor: '#D9E2EC', color: '#102A43', fontFamily: fonts.medium },
  btn: { width: '100%', marginTop: 10 },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkTxt: { fontSize: 14, color: '#5A7A91', fontFamily: fonts.medium },
  linkAccent: { color: '#0F766E', fontFamily: fonts.bold }
});