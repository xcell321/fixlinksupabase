import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api, { setAuthToken } from '../../services/api';
import { alpha, colors, fonts, themedStyles } from '../../theme';

// Prototype: CustomerLogin — colors.dark header, colors.customer primary. Logic unchanged.
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
    // Live inline front-camera check: the user only holds still and shows
    // their face. Capture plus sign-in fire automatically, and a match
    // proceeds into the system with no extra taps.
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView | null>(null);
    const autoAttempted = useRef(false);
    // Step two of sign-in: credentials pass first, then face verification
    // appears and only a match proceeds into the system.
    const [faceStep, setFaceStep] = useState(false);
    // Perceived progress for the verify call: ticks to 90 while waiting,
    // resolves with the request itself. Never invents a verdict.
    const [scanProgress, setScanProgress] = useState(0);
    // Sweeping scan line while the verdict is in flight. Loops until the
    // request resolves, then stops with the frame.
    const scanLine = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!loading || !faceStep) return;
      scanLine.setValue(0);
      const sweep = Animated.loop(
        Animated.timing(scanLine, { toValue: 1, duration: 1600, useNativeDriver: true })
      );
      sweep.start();
      return () => sweep.stop();
    }, [loading, faceStep]);
    useEffect(() => {
      if (!loading) {
        setScanProgress(0);
        return;
      }
      setScanProgress(8);
      const timer = setInterval(() => {
        setScanProgress((done) => (done >= 90 ? 90 : done + 4));
      }, 140);
      return () => clearInterval(timer);
    }, [loading]);
    useEffect(() => {
      if (loginError) {
        const t = setTimeout(() => setLoginError(''), 3500);
        return () => clearTimeout(t);
      }
    }, [loginError]);
   const accent = role === 'technician' ? colors.tech : colors.customer;
   const takeLoginSelfie = async (): Promise<string | null> => {
     if (!cameraPermission?.granted) {
       const result = await requestCameraPermission();
       if (!result.granted) {
         setLoginError('Allow camera access to verify your face.');
         return null;
       }
     }
     let photo: { uri?: string } | null = null;
     try {
       photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 }) ?? null;
     } catch {
       photo = null;
     }
     if (!photo?.uri) {
       setLoginError('Could not read your face. Hold still and try again.');
       return null;
     }
     return photo.uri;
   };
   const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
     const errors: FieldErrors = {};
    if (!normalizedEmail) errors.email = 'Email is required.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.email = 'Enter a valid email.';
    if (!password) errors.password = 'Password is required.'; else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    setFieldErrors(errors); setLoginError(''); if (Object.keys(errors).length) return;
    // Credentials look fine: show the live face frame. Capture plus sign-in
    // fire on their own once the preview reports ready.
    autoAttempted.current = false;
    setFaceStep(true);
   };
   // One automatic attempt per step visit: capture, then sign in with the
   // selfie attached. A match enters the system with no further taps.
   // The camera module throws when asked too early, so a failed capture
   // retries twice before settling on a message with a manual retry.
   // Every path ends with words on screen, never a frozen frame.
   useEffect(() => {
     if (!faceStep || loading) return;
     let cancelled = false;
     const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
     const timer = setTimeout(() => {
       void (async () => {
         if (cancelled || autoAttempted.current) return;
         autoAttempted.current = true;
         try {
           await handleFaceSignIn();
         } catch {
           if (cancelled) return;
           await sleep(2000);
           if (cancelled) return;
           try {
             await handleFaceSignIn();
           } catch {
             if (!cancelled) setLoginError('Could not reach the verification service. Tap Try Again.');
           }
         }
       })();
     }, 1800);
     return () => { cancelled = true; clearTimeout(timer); };
   }, [faceStep, loading]);
   const handleFaceSignIn = async (retryUri?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const uri = retryUri ?? (await takeLoginSelfie());
    if (!uri) {
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      const form = new FormData();
      form.append('email', normalizedEmail);
      form.append('password', password);
      form.append('expectedRole', role);
      // Native ships the file by uri handle. Web XHR cannot do that: a plain
      // object arrives as "[object Object]" and multer sees no file, which is
      // exactly the 400 this screen used to show. Web therefore re-reads its
      // own capture into a real Blob first.
      if (Platform.OS === 'web') {
        let blob: Blob;
        try {
          blob = await (await fetch(uri)).blob();
        } catch {
          setLoginError('Could not read the captured photo. Hold still and try again.');
          return;
        }
        if (!blob || blob.size === 0) {
          setLoginError('Could not read the captured photo. Hold still and try again.');
          return;
        }
        form.append('face', blob, 'login-selfie.jpg');
      } else {
        form.append('face', { uri, name: 'login-selfie.jpg', type: 'image/jpeg' } as unknown as Blob);
      }
      // Explicit multipart header: this exact shape is the one proven working
      // against the server on web. Axios keeps the FormData boundary intact.
      const response = await api.post('/auth/login', form, { headers: { 'Content-Type': 'multipart/form-data' } });
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
          // 422 carries the face-gate verdicts (no person, covered face):
          // they must reach the screen verbatim so the user knows what to
          // fix, instead of collapsing into the generic fallback below.
          const messageByStatus: Record<number, string> = { 401: errorMessage || 'Incorrect email or password.',
              403: errorMessage || 'Technician account pending approval.',
              404: 'Profile not found.',
              422: errorMessage || 'Face check failed. Adjust and try again.' };
          setLoginError(messageByStatus[status] || errorMessage || 'Unable to log in.');
       }
          } finally { setLoading(false); }
   };
   // Full-screen face takeover: once Sign In passes credentials, the whole
   // phone shows only this scan screen until a match proceeds into the system.
   if (faceStep) {
     return (
       <View style={styles.scanScreen}>
         <TouchableOpacity onPress={() => { if (!loading) { setFaceStep(false); setLoginError(''); } }} disabled={loading} accessibilityRole="button" accessibilityLabel="Back to sign in" style={styles.scanBack} hitSlop={12}>
           <Ionicons name="chevron-back" size={22} color={colors.ink} />
         </TouchableOpacity>
          <Text style={styles.scanTitle}>Face recognition</Text>
           <Text style={styles.scanSubtitle}>Keep your face uncovered, look into the camera, and hold still</Text>
         <View style={styles.scanHeroFrame}>
          {cameraPermission?.granted ? (
            <CameraView ref={cameraRef} style={styles.scanCamera} facing="front" />
          ) : (
             <View style={styles.scanPlaceholder}>
               <Ionicons name="person-outline" size={72} color={colors.subtle} />
             </View>
           )}
           <View style={[styles.scanCorner, styles.scanCornerTL]} />
           <View style={[styles.scanCorner, styles.scanCornerTR]} />
          <View style={[styles.scanCorner, styles.scanCornerBL]} />
          <View style={[styles.scanCorner, styles.scanCornerBR]} />
          {loading ? (
            <Animated.View
              style={[
                styles.scanSweep,
                { transform: [{ translateY: scanLine.interpolate({ inputRange: [0, 1], outputRange: [8, 336] }) }] },
              ]}
            />
          ) : null}
        </View>
         {loading ? (
           <>
             <Text style={styles.scanBigPercent}>{scanProgress}%</Text>
             <Text style={styles.scanStatus}>Verifying your face...</Text>
           </>
         ) : (
           <Text style={styles.scanStatus}>
             {cameraPermission?.granted
               ? 'Sign-in is automatic on a match.'
               : 'Camera access is needed to verify your face.'}
           </Text>
         )}
         {!cameraPermission?.granted && !loading ? (
           <TouchableOpacity style={[styles.button, styles.scanButton, { backgroundColor: colors.customer }]} onPress={() => { void takeLoginSelfie().then(() => undefined); }} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Allow camera access">
             <Text style={styles.buttonText}>Allow Camera</Text>
           </TouchableOpacity>
         ) : null}
         {!loading && loginError ? (
           <>
             <Text style={styles.errorText}>{loginError}</Text>
              <Text style={styles.scanGuide}>Stay in bright light with a clear, uncovered face at a straight angle. Remove masks, sunglasses, or hands covering your face. An empty frame or a photo of a screen will not sign you in.</Text>
             <TouchableOpacity style={[styles.button, styles.scanButton, { backgroundColor: accent }]} onPress={() => { autoAttempted.current = true; void handleFaceSignIn(); }} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Try face verification again">
               <Text style={styles.buttonText}>Try Again</Text>
             </TouchableOpacity>
           </>
         ) : null}
         {loading ? <ActivityIndicator color={accent} style={{ marginTop: 12 }} /> : null}
       </View>
     );
   }
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
        <TextInput style={styles.input} placeholder="you@email.com" placeholderTextColor={colors.subtle} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={(value) => { setEmail(value); setFieldErrors(e => ({ ...e, email: '' })); }}
        /></View>{fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
      <Text style={styles.label}>PASSWORD</Text>
      <View style={[styles.inputWrap, fieldErrors.password && styles.inputError]}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.muted}
        /><TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={colors.subtle} secureTextEntry={!showPassword}
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
const styles = themedStyles({ container: { flex: 1, backgroundColor: colors.white },
   scrollContent: { flexGrow: 1 },
   header: { backgroundColor: DARK, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
   modeToggle: { flexDirection: 'row', backgroundColor: alpha(colors.white, 0.08), borderRadius: 12, padding: 4, gap: 4, marginBottom: 24 },
   modeTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
   modeTabCustomer: { backgroundColor: colors.customer },
   modeTabTech: { backgroundColor: colors.tech },
   modeText: { color: colors.subtle, fontSize: 13, fontFamily: fonts.semiBold },
   modeTextOn: { color: colors.onAccent },
   logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
   logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
   brandSmall: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.extraBold },
   roleSmall: { color: colors.subtle, fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold },
   title: { color: colors.onAccent, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
   subtitle: { color: colors.subtle, fontSize: 14, marginTop: 4, fontFamily: fonts.regular },
   form: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, gap: 4 },
   label: { color: colors.gray500, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
   inputWrap: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.gray200, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: colors.appBg, gap: 10 },
   input: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.medium, paddingVertical: 12 },
   inputError: { borderColor: colors.danger }, fieldError: { color: colors.danger, fontSize: 12, marginTop: 6, fontFamily: fonts.medium },
   forgotWrap: { alignSelf: 'flex-end', marginTop: 10 },
   forgot: { color: ORANGE, fontSize: 13, fontFamily: fonts.semiBold },
   faceBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.gray200, backgroundColor: colors.appBg, paddingHorizontal: 14 },
   faceBoxText: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
   faceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.gray200, backgroundColor: colors.appBg },
   faceThumb: { width: 52, height: 52, borderRadius: 26 },
   faceReady: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
   faceRetake: { fontSize: 13, fontFamily: fonts.bold, marginTop: 2 },
   faceHelp: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, lineHeight: 18, marginTop: 4 },
   scanCard: { marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.gray200, backgroundColor: colors.white, padding: 16, alignItems: 'center' },
   scanScreen: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 32, alignItems: 'center' },
   scanBack: { alignSelf: 'flex-start', width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
   scanTitle: { color: colors.ink, fontSize: 22, fontFamily: fonts.extraBold, marginTop: 12 },
   scanSubtitle: { color: colors.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 6, textAlign: 'center' },
   scanHeroFrame: { width: 300, height: 360, borderRadius: 28, backgroundColor: colors.appBg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
   scanSweep: { position: 'absolute', left: 20, right: 20, height: 3, borderRadius: 2, backgroundColor: colors.customer, opacity: 0.9 },
   scanGuide: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },
   scanBigPercent: { color: colors.ink, fontSize: 30, fontFamily: fonts.extraBold, marginTop: 18, fontVariant: ['tabular-nums'] },
   scanFrame: { width: 220, height: 260, borderRadius: 24, backgroundColor: colors.appBg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
   scanImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
   scanCamera: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
   scanPlaceholder: { alignItems: 'center', justifyContent: 'center' },
   scanCorner: { position: 'absolute', width: 36, height: 36, borderColor: colors.customer },
   scanCornerTL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
   scanCornerTR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
   scanCornerBL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 },
   scanCornerBR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },
   scanPercent: { color: colors.ink, fontSize: 26, fontFamily: fonts.extraBold, marginTop: 14, fontVariant: ['tabular-nums'] },
   scanStatus: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 4, textAlign: 'center' },
   scanButton: { width: '100%', marginTop: 14 },
    errorText: { color: colors.danger, fontSize: 11, marginTop: 10, textAlign: 'center', fontFamily: fonts.medium, lineHeight: 15 },
   button: { minHeight: 52, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
   buttonText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
    registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
    registerText: { color: colors.gray500, fontSize: 13, fontFamily: fonts.regular }, registerLink: { color: ORANGE, fontSize: 13, fontFamily: fonts.bold },
    techLoginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, flexWrap: 'wrap' },
    techLoginText: { color: colors.gray500, fontSize: 13, fontFamily: fonts.regular },
    techLoginLink: { fontSize: 13, fontFamily: fonts.bold },
    techLoginBlue: { color: colors.tech, fontFamily: fonts.bold },
    techLoginOrange: { color: colors.customer, fontFamily: fonts.bold } });
