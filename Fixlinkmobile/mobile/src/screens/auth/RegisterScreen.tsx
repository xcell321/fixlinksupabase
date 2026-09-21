// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { fetchPlatformCategories, registerUser, setAuthToken } from '../services/api';
import { geocodeAddressStrict } from '../services/locationIq';
import { colors, fonts } from '../../theme';

export default function RegisterScreen({ switchToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [governmentIdNumber, setGovernmentIdNumber] = useState('');
  const [governmentIdFile, setGovernmentIdFile] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [role, setRole] = useState('customer'); // 'customer' or 'technician'
  const [loading, setLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [detectedCoords, setDetectedCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // 'idle' | 'detecting' | 'found' | 'not-found'
  const [fieldErrors, setFieldErrors] = useState({}); // Record<string,string>
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchPlatformCategories().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  useEffect(() => {
    if (role !== 'technician' || !address.trim()) {
      setDetectedCoords(null);
      setGeoStatus('idle');
      return;
    }
    let cancelled = false;
    setGeoStatus('detecting');
    const timer = setTimeout(async () => {
      try {
        const coords = await geocodeAddressStrict(address);
        if (cancelled) return;
        setDetectedCoords(coords || null);
        setGeoStatus(coords ? 'found' : 'not-found');
      } catch (error) {
        if (!cancelled) {
          setDetectedCoords(null);
          setGeoStatus('not-found');
        }
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [address, role]);

  const clearFieldError = (key) => setFieldErrors((prev) => { if (!prev[key]) return prev; const next = { ...prev }; delete next[key]; return next; });

  const handleRegister = async () => {
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Name is required';
    if (!email.trim()) nextErrors.email = 'Email is required';
    if (!password) nextErrors.password = 'Password is required';
    if (!confirmPassword) nextErrors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    if (!phone.trim()) nextErrors.phone = 'Phone number is required';
    if (!address.trim()) nextErrors.address = 'Address is required';
    if (role === 'technician') {
      if (!skills.trim()) nextErrors.skills = 'Select at least one skill';
      if (!governmentIdNumber.trim()) nextErrors.governmentIdNumber = 'Government ID is required';
      if (!yearsExperience.trim()) nextErrors.yearsExperience = 'Years of experience is required';
      if (!governmentIdFile) nextErrors.governmentIdFile = 'Government ID file is required';
      if (!certificateFile) nextErrors.certificateFile = 'Certificate is required';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const regData = await registerUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        phone: role === 'customer' || role === 'technician' ? phone.trim() : undefined,
        address: role === 'customer' || role === 'technician' ? address.trim() : undefined,
        bio: role === 'customer' ? bio.trim() : undefined,
        skills: role === 'technician' ? skills.trim() : undefined,
        yearsExperience: role === 'technician' ? yearsExperience.trim() : undefined,
        governmentIdNumber: role === 'technician' ? governmentIdNumber.trim() : undefined,
        governmentIdFile: role === 'technician' ? governmentIdFile : undefined,
        certificateFile: role === 'technician' ? certificateFile : undefined,
        latitude: role === 'technician' && detectedCoords ? detectedCoords.latitude : undefined,
        longitude: role === 'technician' && detectedCoords ? detectedCoords.longitude : undefined,
      });

      if (regData?.idToken) {
        setAuthToken(regData.idToken);
        Alert.alert('Welcome to FixLink!', 'Your account is ready.');
        return;
      }

      Alert.alert('Application submitted', role === 'technician'
        ? 'Your technician application is pending admin review. You can log in after it is approved.'
        : 'Account created successfully! Please log in.');
      switchToLogin();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Registration failed';
      Alert.alert('Registration Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const chooseCredential = async (setter) => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!result.canceled) setter(result.assets[0]);
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
      <View style={styles.headerContainer}>
        <Text style={styles.roleHeader}>ACCOUNT REGISTRATION</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.kicker}>GET STARTED</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Tell us a little about yourself so technicians can serve you better.</Text>
        </View>

        {/* Role Selector Tabs */}
        <View style={styles.roleContainer}>
          <TouchableOpacity 
            style={[styles.roleButton, role === 'customer' && styles.activeRole]} 
            onPress={() => setRole('customer')}
            accessibilityRole="button"
            accessibilityLabel="Register as customer"
          >
            <Text style={[styles.roleText, role === 'customer' && styles.activeRoleText]}>Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.roleButton, role === 'technician' && styles.activeRole]} 
            onPress={() => setRole('technician')}
            accessibilityRole="button"
            accessibilityLabel="Register as technician"
          >
            <Text style={[styles.roleText, role === 'technician' && styles.activeRoleText]}>Technician</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {/* IDENTITY */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={14} color={colors.teal} />
              <Text style={styles.sectionKicker}>IDENTITY</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={[styles.inputContainer, fieldErrors.name && styles.inputError]}>
                <Ionicons name="person-outline" size={20} color={fieldErrors.name ? colors.error : colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="John Doe"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={(t) => { setName(t); if (t.trim()) clearFieldError('name'); }}
                  accessibilityLabel="Full name"
                />
              </View>
              {fieldErrors.name ? <Text style={styles.errorText}>{fieldErrors.name}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={[styles.inputContainer, fieldErrors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={20} color={fieldErrors.email ? colors.error : colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(t) => { setEmail(t); if (t.trim()) clearFieldError('email'); }}
                  accessibilityLabel="Email address"
                />
              </View>
              {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={[styles.inputContainer, fieldErrors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={20} color={fieldErrors.password ? colors.error : colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  value={password}
                  onChangeText={(t) => { setPassword(t); if (t) clearFieldError('password'); }}
                  accessibilityLabel="Password"
                />
              </View>
              {fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={[styles.inputContainer, fieldErrors.confirmPassword && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={20} color={fieldErrors.confirmPassword ? colors.error : colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={(t) => { setConfirmPassword(t); if (t) clearFieldError('confirmPassword'); }}
                  accessibilityLabel="Confirm password"
                />
              </View>
              {fieldErrors.confirmPassword ? <Text style={styles.errorText}>{fieldErrors.confirmPassword}</Text> : null}
            </View>
          </View>

          {/* CONTACT */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="call-outline" size={14} color={colors.teal} />
              <Text style={styles.sectionKicker}>CONTACT</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={[styles.inputContainer, fieldErrors.phone && styles.inputError]}>
                <Ionicons name="call-outline" size={20} color={fieldErrors.phone ? colors.error : colors.muted} style={styles.inputIcon} />
                <TextInput style={styles.textInput} placeholder="09XX XXX XXXX" placeholderTextColor={colors.muted} keyboardType="phone-pad" value={phone} onChangeText={(t) => { setPhone(t); if (t.trim()) clearFieldError('phone'); }} accessibilityLabel="Phone number" />
              </View>
              {fieldErrors.phone ? <Text style={styles.errorText}>{fieldErrors.phone}</Text> : null}
              {role === 'customer' ? <Text style={styles.helperText}>Technicians may use this to coordinate your repair.</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{role === 'customer' ? 'Service Address' : 'Address'}</Text>
              <View style={[styles.inputContainer, role === 'technician' && styles.textAreaContainer, fieldErrors.address && styles.inputError]}>
                <Ionicons name="location-outline" size={20} color={fieldErrors.address ? colors.error : colors.muted} style={[styles.inputIcon, role === 'technician' && { marginTop: 14 }]} />
                <TextInput
                  style={[styles.textInput, role === 'technician' && styles.textArea]}
                  placeholder={role === 'customer' ? 'House number, street, barangay, city' : 'House number, street, barangay, city'}
                  placeholderTextColor={colors.muted}
                  multiline={role === 'technician'}
                  value={address}
                  onChangeText={(t) => { setAddress(t); if (t.trim()) clearFieldError('address'); }}
                  onBlur={() => { if (role === 'technician' && address.trim()) { setGeoStatus('detecting'); geocodeAddressStrict(address).then((coords) => { setDetectedCoords(coords || null); setGeoStatus(coords ? 'found' : 'not-found'); }).catch(() => { setDetectedCoords(null); setGeoStatus('not-found'); }); } }}
                  accessibilityLabel="Address"
                />
              </View>
              {fieldErrors.address ? <Text style={styles.errorText}>{fieldErrors.address}</Text> : null}
              {role === 'technician' && geoStatus === 'detecting' && <Text style={[styles.geoHint, styles.geoPending]}>Detecting location...</Text>}
              {role === 'technician' && geoStatus === 'found' && detectedCoords && (
                <View style={styles.locationVerifiedRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.teal} />
                  <Text style={[styles.geoHint, styles.geoOk]}>Location verified</Text>
                </View>
              )}
              {role === 'technician' && geoStatus === 'not-found' && <Text style={[styles.geoHint, styles.geoWarn]}>⚠ Location not recognized — coordinates will stay empty</Text>}
            </View>

            {role === 'customer' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>About You (Optional)</Text>
                <View style={[styles.inputContainer, styles.textAreaContainer]}>
                  <Ionicons name="document-text-outline" size={20} color={colors.muted} style={[styles.inputIcon, { marginTop: 14 }]} />
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Anything helpful about your home or service needs..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    value={bio}
                    onChangeText={setBio}
                    accessibilityLabel="About you"
                  />
                </View>
              </View>
            )}
          </View>

          {/* SKILLS — technician only */}
          {role === 'technician' && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="construct-outline" size={14} color={colors.teal} />
                <Text style={styles.sectionKicker}>SKILLS</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Skills / Specializations</Text>
                <View style={[styles.inputContainer, fieldErrors.skills && styles.inputError]}>
                  <Ionicons name="construct-outline" size={20} color={fieldErrors.skills ? colors.error : colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="Refrigerator repair, computers, electronics" placeholderTextColor={colors.muted} value={skills} onChangeText={(t) => { setSkills(t); if (t.trim()) clearFieldError('skills'); }} accessibilityLabel="Skills" />
                </View>
                <Text style={styles.helperText}>Separate multiple skills with commas.</Text>
                {fieldErrors.skills ? <Text style={styles.errorText}>{fieldErrors.skills}</Text> : null}
              </View>

              {categoryOptions.length > 0 && (
                <View style={styles.categoryList}>
                  <TouchableOpacity
                    style={[styles.selectAllButton, { minHeight: 44 }]}
                    onPress={() => {
                      const allSelected = categoryOptions.every(cat => skills.split(',').map(s => s.trim()).includes(cat.name));
                      if (allSelected) {
                        setSkills('');
                      } else {
                        setSkills(categoryOptions.map(cat => cat.name).join(', '));
                      }
                      clearFieldError('skills');
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.selectAllText}>
                      {categoryOptions.every(cat => skills.split(',').map(s => s.trim()).includes(cat.name)) ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                  {categoryOptions.map((category) => {
                    const isSelected = skills.split(',').map(s => s.trim()).includes(category.name);
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={[styles.categoryChip, isSelected && styles.selectedCategoryChip]}
                        onPress={() => {
                          const skillList = skills.split(',').map(s => s.trim()).filter(s => s !== '');
                          if (isSelected) {
                            setSkills(skillList.filter(s => s !== category.name).join(', '));
                          } else {
                            setSkills(skillList.concat(category.name).join(', '));
                          }
                          if (skills.trim()) clearFieldError('skills');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={category.name}
                      >
                        <Text style={[styles.categoryText, isSelected && styles.selectedCategoryText]}>
                          {category.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Years of Experience</Text>
                <View style={[styles.inputContainer, fieldErrors.yearsExperience && styles.inputError]}>
                  <Ionicons name="time-outline" size={20} color={fieldErrors.yearsExperience ? colors.error : colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="e.g. 5" placeholderTextColor={colors.muted} keyboardType="number-pad" value={yearsExperience} onChangeText={(t) => { setYearsExperience(t); if (t.trim()) clearFieldError('yearsExperience'); }} accessibilityLabel="Years of experience" />
                </View>
                {fieldErrors.yearsExperience ? <Text style={styles.errorText}>{fieldErrors.yearsExperience}</Text> : null}
              </View>
            </View>
          )}

          {/* CREDENTIALS — technician only */}
          {role === 'technician' && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.teal} />
                <Text style={styles.sectionKicker}>CREDENTIALS</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Government ID Number</Text>
                <View style={[styles.inputContainer, fieldErrors.governmentIdNumber && styles.inputError]}>
                  <Ionicons name="card-outline" size={20} color={fieldErrors.governmentIdNumber ? colors.error : colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="Enter valid government ID number" placeholderTextColor={colors.muted} value={governmentIdNumber} onChangeText={(t) => { setGovernmentIdNumber(t); if (t.trim()) clearFieldError('governmentIdNumber'); }} accessibilityLabel="Government ID number" />
                </View>
                {fieldErrors.governmentIdNumber ? <Text style={styles.errorText}>{fieldErrors.governmentIdNumber}</Text> : null}
              </View>

              <View style={styles.credentialCard}>
                <Text style={styles.inputLabel}>Government ID File</Text>
                <TouchableOpacity style={[styles.documentButton, fieldErrors.governmentIdFile && styles.inputError]} onPress={() => { chooseCredential(setGovernmentIdFile); clearFieldError('governmentIdFile'); }} accessibilityRole="button" accessibilityLabel="Choose Government ID file">
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.teal} />
                  <Text style={styles.documentButtonText}>{governmentIdFile ? governmentIdFile.name : 'Choose Government ID file'}</Text>
                </TouchableOpacity>
                <Text style={styles.fileHint}>JPG, PNG, or PDF. Maximum 10 MB.</Text>
                {fieldErrors.governmentIdFile ? <Text style={styles.errorText}>{fieldErrors.governmentIdFile}</Text> : null}
              </View>

              <View style={styles.credentialCard}>
                <Text style={styles.inputLabel}>Certificate or Proof of Experience</Text>
                <TouchableOpacity style={[styles.documentButton, fieldErrors.certificateFile && styles.inputError]} onPress={() => { chooseCredential(setCertificateFile); clearFieldError('certificateFile'); }} accessibilityRole="button" accessibilityLabel="Choose certificate file">
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.teal} />
                  <Text style={styles.documentButtonText}>{certificateFile ? certificateFile.name : 'Choose certificate file'}</Text>
                </TouchableOpacity>
                <Text style={styles.fileHint}>JPG, PNG, or PDF. Maximum 10 MB.</Text>
                {fieldErrors.certificateFile ? <Text style={styles.errorText}>{fieldErrors.certificateFile}</Text> : null}
              </View>

              <Text style={styles.helperText}>Your application will remain pending until an administrator reviews your credentials.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading} accessibilityRole="button" accessibilityLabel="Register">
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{role === 'technician' ? 'Submit Application' : 'Register'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={switchToLogin} accessibilityRole="button" accessibilityLabel="Already have an account, log in">
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Log In</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.canvas },
  headerContainer: { alignItems: 'center', marginBottom: 28 },
  brand: { color: colors.ink, fontSize: 32, fontFamily: fonts.extraBold, letterSpacing: -1.5 },
  brandAccent: { color: colors.teal },
  roleHeader: { color: colors.muted, fontSize: 11, letterSpacing: 1.6, fontFamily: fonts.bold, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.line, boxShadow: '0 8px 16px rgba(16,42,67,0.1)', elevation: 6 },
  cardHeader: { marginBottom: 20 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 6 },
  title: { color: colors.ink, fontSize: 24, fontFamily: fonts.bold, marginBottom: 6 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  roleContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: colors.canvas, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.line },
  roleButton: { flex: 1, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  activeRole: { backgroundColor: colors.teal, boxShadow: '0 2px 3px rgba(0,0,0,0.1)', elevation: 2 },
  roleText: { fontFamily: fonts.semiBold, color: colors.muted, fontSize: 13 },
  activeRoleText: { color: colors.white },
  form: { gap: 16 },
  sectionCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  sectionKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold },
  inputGroup: { gap: 6 },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, height: 50 },
  textAreaContainer: { height: 90, alignItems: 'flex-start' },
  inputIcon: { marginRight: 10, alignSelf: 'center' },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium },
  textArea: { height: 74, textAlignVertical: 'top', paddingTop: 12 },
  inputError: { borderColor: colors.error, backgroundColor: '#FFF5F5' },
  errorText: { color: colors.error, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  geoHint: { fontSize: 11, lineHeight: 15, marginTop: 6, fontFamily: fonts.medium },
  geoPending: { color: colors.muted },
  geoOk: { color: colors.teal },
  geoWarn: { color: colors.error },
  locationVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start' },
  helperText: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 2, fontFamily: fonts.regular },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 4 },
  categoryChip: { backgroundColor: colors.canvas, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  selectedCategoryChip: { backgroundColor: colors.teal, borderColor: colors.teal },
  selectAllButton: { backgroundColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  categoryText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  selectedCategoryText: { color: colors.white },
  selectAllText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold },
  credentialsTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginTop: 8, marginBottom: 4 },
  credentialCard: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, gap: 6 },
  documentButton: { backgroundColor: colors.white, padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  documentButtonText: { color: colors.teal, fontFamily: fonts.semiBold, fontSize: 13 },
  fileHint: { color: colors.muted, fontSize: 11, textAlign: 'center', fontFamily: fonts.medium },
  primaryButton: { backgroundColor: colors.teal, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.5 },
  linkButton: { alignItems: 'center', marginTop: 8, paddingVertical: 4 },
  linkText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  linkBold: { color: colors.teal, fontFamily: fonts.bold }
});
