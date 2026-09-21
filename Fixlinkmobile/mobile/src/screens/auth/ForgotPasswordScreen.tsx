// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { forgotPassword } from '../services/api';
import AppButton from '../../components/AppButton';
import { colors, fonts } from '../../theme';

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

  if (isSent) {
    return (
      <View style={styles.container}>
        <View style={styles.brandBlock}>
          <View style={styles.logo}><Ionicons name="construct" size={24} color={colors.white} /></View>
          <Text style={styles.brand}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="mail-open-outline" size={70} color="#0F766E" />
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.subTitle}>We have sent password recovery instructions to your email address. Open the link in the email to set a new password — it will open this app automatically if you are on your device.</Text>
          <AppButton title="Back to Login" icon="arrow-back" onPress={switchToLogin} style={styles.btn} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandBlock}>
        <View style={styles.logo}><Ionicons name="construct" size={24} color={colors.white} /></View>
        <Text style={styles.brand}>FIX<Text style={styles.brandAccent}>LINK</Text></Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subTitle}>Enter your registered email to receive recovery steps.</Text>
        
        <Text style={styles.label}>Email Address</Text>
        <TextInput 
          style={styles.input} 
          placeholder="name@example.com" 
          placeholderTextColor={colors.muted} 
          value={email} 
          onChangeText={setEmail} 
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <AppButton title="Send Reset Link" loading={loading} onPress={handleReset} style={styles.btn} />
        
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
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', elevation: 5, alignItems: 'center' },
  title: { fontSize: 22, fontFamily: fonts.bold, color: '#102A43', marginBottom: 8, textAlign: 'center' },
  subTitle: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 20, fontFamily: fonts.regular },
  label: { alignSelf: 'flex-start', fontSize: 14, fontFamily: fonts.medium, color: '#102A43', marginBottom: 8 },
  input: { width: '100%', backgroundColor: '#fff', padding: 15, marginBottom: 15, borderRadius: 12, borderWidth: 1, borderColor: '#D9E2EC', color: '#102A43', fontFamily: fonts.medium },
  btn: { width: '100%', marginTop: 10 },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkTxt: { fontSize: 14, color: colors.muted, fontFamily: fonts.medium },
  linkAccent: { color: '#0F766E', fontFamily: fonts.bold }
});

