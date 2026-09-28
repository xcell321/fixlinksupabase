import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { setAuthToken } from '../../services/api';
import { colors, fonts, themedStyles } from '../../theme';

// Prototype: CustomerLogin — dark #0D1B2A header, orange #F97316 primary. Logic unchanged.
const ORANGE = colors.customer;
const DARK = colors.dark;

type LoginRole = 'customer' | 'technician';

type LoginScreenProps = {
  onLoginSuccess: (session: unknown) => void;
  switchToRegister: (role?: LoginRole) => void;
  switchToForgotPassword: (role?: LoginRole) => void;
};

type FieldErrors = { email?: string; password?: string };

// Shape of the rejection the API client produces on a failed login.
type RequestFailure = {
  // axios sets `code` for transport failures (for example ECONNABORTED on a
  // timeout). `data` is JSON on a normal API error, but an HTML error page when
  // a proxy or Cloudflare tunnel answers because the app behind it is down.
  code?: string;
  response?: { status?: number; data?: { error?: string } | string };
};

export default function LoginScreen({ onLoginSuccess, switchToRegister, switchToForgotPassword }: LoginScreenProps) {
  const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [loading, setLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
     const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState<LoginRole>('customer');
    useEffect(() => {
      if (loginError) {
        const t = setTimeout(() => setLoginError(''), 3500);
        return () => clearTimeout(t);
      }
    }, [loginError]);
   const accent = role === 'technician' ? colors.tech : colors.customer;
   const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
     const errors: FieldErrors = {};
    if (!normalizedEmail) errors.email = 'Email is required.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.email = 'Enter a valid email.';
    if (!password) errors.password = 'Password is required.'; else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    setFieldErrors(errors); setLoginError(''); if (Object.keys(errors).length) return; setLoading(true);
    try { const response = await api.post('/auth/login', { email: normalizedEmail, password, expectedRole: role });
    setAuthToken(response.data.idToken);
     onLoginSuccess(response.data);
     } catch (error)
     { const failure = error as RequestFailure;
       const status = failure.response?.status;
       const payload = failure.response?.data;
       const errorMessage = payload && typeof payload === 'object' ? payload.error : undefined;
       // No HTTP response at all: the request never reached the API (backend
       // down, tunnel closed, wrong host, or a network/timeout failure). Say so
       // plainly instead of showing the misleading generic message.
       if (status == null) {
         const timedOut = failure.code === 'ECONNABORTED' || failure.code === 'ETIMEDOUT';
         setLoginError(timedOut
           ? 'The server took too long to respond. Check your connection and try again.'
           : 'Cannot reach the server. Check your connection and try again.');
       } else if (status === 502 || status === 503 || status === 504) {
         // The proxy or tunnel answered, but the API behind it is unreachable.
         setLoginError(errorMessage || 'Cannot reach the server. Check your connection and try again.');
       } else {
         const messageByStatus: Record<number, string> = { 401: 'Incorrect email or password.',
             403: errorMessage || 'Technician account pending approval.',
             404: 'Profile not found.' };
         setLoginError(messageByStatus[status] || errorMessage || 'Unable to log in.');
       }
          } finally { setLoading(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <View style={styles.logoRow}>
        <View style={[styles.logo, { backgroundColor: accent }]}><Ionicons name="construct" size={22} color={colors.onAccent} /></View>
        <View>
          <Text style={styles.brandSmall}>FIXLINK</Text>
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
           }} />{password ? (<TouchableOpacity onPress={() => setShowPassword(!showPassword)}
           accessibilityRole="button"
           accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
           ><Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.muted} /></TouchableOpacity>) : null}</View>{fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
      <TouchableOpacity style={styles.forgotWrap} onPress={() => switchToForgotPassword(role)}><Text style={[styles.forgot, { color: accent }]}>Forgot password?</Text></TouchableOpacity>
      {loginError ? <Text style={styles.errorText}>{loginError}</Text>
       : null}<TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={handleLogin} disabled={loading} activeOpacity={0.88}>{loading ?
        <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Sign In</Text>}</TouchableOpacity>
      <View style={styles.registerRow}><Text style={styles.registerText}>{role === 'technician' ? 'New technician? ' : "Don't have an account? "}</Text><TouchableOpacity onPress={() => switchToRegister(role)}><Text style={[styles.registerLink, { color: accent }]}>{role === 'technician' ? 'Apply Now' : 'Register'}</Text></TouchableOpacity></View>
      <View style={styles.techLoginRow}>
        <Text style={styles.techLoginText}>Log in as </Text>
        <TouchableOpacity
          onPress={() => setRole(role === 'customer' ? 'technician' : 'customer')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={role === 'customer' ? 'Log in as technician' : 'Log in as customer'}
        >
          <Text style={[role === 'customer' ? styles.techLoginBlue : styles.techLoginOrange, styles.techLoginLink]}>
            {role === 'customer' ? 'Technician' : 'Customer'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = themedStyles({ container: { flex: 1, backgroundColor: '#FFFFFF' },
   scrollContent: { flexGrow: 1 },
   header: { backgroundColor: DARK, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
   modeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4, gap: 4, marginBottom: 24 },
   modeTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
   modeTabCustomer: { backgroundColor: colors.customer },
   modeTabTech: { backgroundColor: colors.tech },
   modeText: { color: '#9CA3AF', fontSize: 13, fontFamily: fonts.semiBold },
   modeTextOn: { color: colors.onAccent },
   logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
   logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
   brandSmall: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.extraBold },
   roleSmall: { color: '#9CA3AF', fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold },
   title: { color: colors.onAccent, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
   subtitle: { color: '#9CA3AF', fontSize: 14, marginTop: 4, fontFamily: fonts.regular },
   form: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, gap: 4 },
   label: { color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
   inputWrap: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: '#F9FAFB', gap: 10 },
   input: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.medium, paddingVertical: 12 },
   inputError: { borderColor: '#DC2626' }, fieldError: { color: colors.danger, fontSize: 12, marginTop: 6, fontFamily: fonts.medium },
   forgotWrap: { alignSelf: 'flex-end', marginTop: 10 },
   forgot: { color: ORANGE, fontSize: 13, fontFamily: fonts.semiBold },
    errorText: { color: colors.danger, fontSize: 11, marginTop: 10, textAlign: 'center', fontFamily: fonts.medium, lineHeight: 15 },
   button: { minHeight: 52, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
   buttonText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
    registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
    registerText: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular }, registerLink: { color: ORANGE, fontSize: 13, fontFamily: fonts.bold },
    techLoginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, flexWrap: 'wrap' },
    techLoginText: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular },
    techLoginLink: { fontSize: 13 },
    techLoginBlue: { color: colors.tech, fontFamily: fonts.bold },
    techLoginOrange: { color: colors.customer, fontFamily: fonts.bold } });
