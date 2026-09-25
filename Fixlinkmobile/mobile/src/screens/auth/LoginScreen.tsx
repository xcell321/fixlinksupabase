// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { setAuthToken } from '../services/api';
import { colors, fonts } from '../../theme';

// Prototype: CustomerLogin — dark #0D1B2A header, orange #F97316 primary. Logic unchanged.
const ORANGE = colors.customer;
const DARK = colors.dark;

export default function LoginScreen({ onLoginSuccess, switchToRegister, switchToForgotPassword }) {
  const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
     const [fieldErrors, setFieldErrors] = useState({});
     const [showPassword, setShowPassword] = useState(false);
   const [role, setRole] = useState('customer');
   const accent = role === 'technician' ? colors.tech : colors.customer;
  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
     const errors = {};
    if (!normalizedEmail) errors.email = 'Email is required.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.email = 'Enter a valid email.';
    if (!password) errors.password = 'Password is required.'; else if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    setFieldErrors(errors); setLoginError(''); if (Object.keys(errors).length) return; setLoading(true);
    try { const response = await api.post('/auth/login', { email: normalizedEmail, password });
    setAuthToken(response.data.idToken);
     onLoginSuccess(response.data);
     } catch (error)
     { const status = error.response?.status;
       const errorMessage = error.response?.data?.error;
          const messageByStatus = { 401: 'Incorrect email or password.',
             403: errorMessage || 'Technician account pending approval.',
         404: 'Profile not found.' };
             setLoginError(messageByStatus[status] || errorMessage || 'Unable to log in.');
          } finally { setLoading(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <View style={styles.modeToggle}>
        <TouchableOpacity onPress={() => setRole('customer')} style={[styles.modeTab, role === 'customer' && styles.modeTabCustomer]} activeOpacity={0.85}>
          <Text style={[styles.modeText, role === 'customer' && styles.modeTextOn]}>Customer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setRole('technician')} style={[styles.modeTab, role === 'technician' && styles.modeTabTech]} activeOpacity={0.85}>
          <Text style={[styles.modeText, role === 'technician' && styles.modeTextOn]}>Technician</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.logoRow}>
        <View style={[styles.logo, { backgroundColor: accent }]}><Ionicons name={role === 'technician' ? 'construct-outline' : 'construct'} size={22} color="#FFFFFF" /></View>
        <View>
          <Text style={styles.brandSmall}>{role === 'technician' ? 'FixLink Pro' : 'FIXLINK'}</Text>
          <Text style={styles.roleSmall}>{role === 'technician' ? 'TECHNICIAN PORTAL' : 'HOME SERVICES'}</Text>
        </View>
      </View>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>{role === 'technician' ? 'Sign in to manage your jobs' : 'Sign in to manage your repairs'}</Text>
    </View>
    <View style={styles.form}>
      <Text style={styles.label}>EMAIL</Text>
      <View style={[styles.inputWrap, fieldErrors.email && styles.inputError]}>
        <Ionicons name="mail-outline" size={18} color={colors.muted} />
        <TextInput style={styles.input} placeholder="you@email.com" placeholderTextColor="#9CA3AF" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={(value) => { setEmail(value); setFieldErrors(e => ({ ...e, email: '' })); }}
        /></View>{fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
      <Text style={styles.label}>PASSWORD</Text>
      <View style={[styles.inputWrap, fieldErrors.password && styles.inputError]}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.muted}
        /><TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#9CA3AF" secureTextEntry={!showPassword}
         value={password} onChangeText={(value) => { setPassword(value);
          setFieldErrors(e => ({ ...e, password: '' }));
           }} /><TouchableOpacity onPress={() => setShowPassword(!showPassword)}
           ><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} /></TouchableOpacity></View>{fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
      <TouchableOpacity style={styles.forgotWrap} onPress={switchToForgotPassword}><Text style={[styles.forgot, { color: accent }]}>Forgot password?</Text></TouchableOpacity>
      {loginError ? <Text style={styles.errorText}>{loginError}</Text>
       : null}<TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={handleLogin} disabled={loading} activeOpacity={0.88}>{loading ?
        <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Sign In</Text>}</TouchableOpacity>
      <View style={styles.registerRow}><Text style={styles.registerText}>{role === 'technician' ? 'New technician? ' : "Don't have an account? "}</Text><TouchableOpacity onPress={() => switchToRegister(role)}><Text style={[styles.registerLink, { color: accent }]}>{role === 'technician' ? 'Apply Now' : 'Register'}</Text></TouchableOpacity></View>
    </View>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#FFFFFF' },
   scrollContent: { flexGrow: 1 },
   header: { backgroundColor: DARK, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
   modeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4, gap: 4, marginBottom: 24 },
   modeTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
   modeTabCustomer: { backgroundColor: colors.customer },
   modeTabTech: { backgroundColor: colors.tech },
   modeText: { color: '#9CA3AF', fontSize: 13, fontFamily: fonts.semiBold },
   modeTextOn: { color: '#FFFFFF' },
   logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
   logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
   brandSmall: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.extraBold },
   roleSmall: { color: '#9CA3AF', fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold },
   title: { color: '#FFFFFF', fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
   subtitle: { color: '#9CA3AF', fontSize: 14, marginTop: 4, fontFamily: fonts.regular },
   form: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, gap: 4 },
   label: { color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
   inputWrap: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: '#F9FAFB', gap: 10 },
   input: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.medium, paddingVertical: 12 },
   inputError: { borderColor: '#FC8181' }, fieldError: { color: colors.danger, fontSize: 12, marginTop: 6, fontFamily: fonts.medium },
   forgotWrap: { alignItems: 'flex-end', marginTop: 10 },
   forgot: { color: ORANGE, fontSize: 13, fontFamily: fonts.semiBold },
   errorText: { color: colors.danger, fontSize: 13, marginTop: 12, textAlign: 'center', fontFamily: fonts.medium },
   button: { minHeight: 52, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
   buttonText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
   registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
   registerText: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular }, registerLink: { color: ORANGE, fontSize: 13, fontFamily: fonts.bold } });
