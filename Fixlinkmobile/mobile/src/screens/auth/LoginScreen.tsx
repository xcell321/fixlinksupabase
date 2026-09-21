// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { setAuthToken } from '../services/api';
import { colors, fonts } from '../../theme';

export default function LoginScreen({ onLoginSuccess, switchToRegister, switchToForgotPassword }) {
  const [email, setEmail] = useState('');
   const [password, setPassword] = useState(''); 
   const [loading, setLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
     const [fieldErrors, setFieldErrors] = useState({}); 
     const [showPassword, setShowPassword] = useState(false);
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
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
    <View style={styles.brandBlock}><View style={styles.logo}><Ionicons name="construct" size={24} color={colors.white} /></View><Text style={styles.brand}>FIX<Text style={styles.brandAccent}>LINK</Text></Text></View>
    <View style={styles.heading}><Text style={styles.kicker}>WELCOME BACK</Text><Text style={styles.subtitle}>Sign in to manage your service requests.</Text></View>
    <View style={styles.card}>
      <Text style={styles.label}>Email Address</Text><View 
      style={[styles.inputWrap, fieldErrors.email && styles.inputError]}><
        Ionicons name="mail-outline" size={19} color={colors.muted} /><
          TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#9FB3C8" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={(value) => { setEmail(value); setFieldErrors(e => ({ ...e, email: '' })); }} 
          /></View>{fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
      <View style={styles.passwordLabel}><
        Text style={styles.label}>Password</Text><TouchableOpacity onPress={switchToForgotPassword}><Text style={styles.forgot}>Forgot Password?
          </Text></TouchableOpacity></View><View style={[styles.inputWrap, fieldErrors.password && styles.inputError]}><Ionicons name="lock-closed-outline" size={19} color={colors.muted} 
          /><TextInput style={styles.input} placeholder="Enter your password" placeholderTextColor="#9FB3C8" secureTextEntry={!showPassword}
           value={password} onChangeText={(value) => { setPassword(value);
            setFieldErrors(e => ({ ...e, password: '' }));
             }} /><TouchableOpacity onPress={() => setShowPassword(!showPassword)}
             ><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} /></TouchableOpacity></View>{fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
      {loginError ? <Text style={styles.errorText}>{loginError}</Text>
       : null}<TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>{loading ?
        <ActivityIndicator color={colors.white} /> : <><Text style={styles.buttonText}>Sign in</Text><Ionicons
         name="arrow-forward" size={19} color={colors.white} /></>}</TouchableOpacity>
    </View>
    <View style={styles.registerRow}><Text style={styles.registerText}>New to FixLink? </Text><TouchableOpacity onPress={switchToRegister}><Text style={styles.registerLink}>Create an account</Text></TouchableOpacity></View>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.canvas },
   scrollContent: { flexGrow: 1, padding: 22, paddingTop: 38,
     justifyContent: 'center' }, brandBlock: { alignItems: 'center', 
      marginBottom: 38 }, logo: { width: 54, height: 54, borderRadius: 19,
         backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center',
          marginBottom: 13 }, brand: { color: colors.ink, fontSize: 18, fontFamily: fonts.extraBold },
             brandAccent: { color: colors.teal, fontFamily: fonts.extraBold }, heading: { marginBottom: 20 }, kicker: { color: colors.teal,
                 letterSpacing: 1.6, fontSize: 11, fontFamily: fonts.bold, marginBottom: 9 },
                   subtitle: { color: colors.muted, fontSize: 14, marginTop: 8, fontFamily: fonts.regular }, card: { backgroundColor: colors.white, 
              borderRadius: 22, padding: 20, borderWidth: 1, borderColor: colors.line }, label: { color: colors.ink,
                       fontSize: 13, fontFamily: fonts.bold, marginBottom: 8 }, inputWrap: { height: 52, borderRadius: 13,
            borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, 
                marginBottom: 16, backgroundColor: '#FBFDFE' }, input: { flex: 1, color: colors.ink, fontSize: 15, marginLeft: 10, fontFamily: fonts.medium },
              inputError: { borderColor: '#FC8181' }, fieldError: { color: colors.danger, fontSize: 12, marginTop: -9,
                 marginBottom: 12, fontFamily: fonts.medium }, passwordLabel: { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'center' }, forgot: { color: colors.teal, fontSize: 12, fontFamily: fonts.bold, marginBottom: 8 },
                    errorText: { color: colors.danger, fontSize: 13, marginBottom: 14, textAlign: 'center', fontFamily: fonts.medium }, button: { height: 54,
                       borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', 
                       justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 4 }, 
                       buttonText: { color: colors.white, fontSize: 15, fontFamily: fonts.bold },
                        registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 }, 
                        registerText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular }, registerLink: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold } });

