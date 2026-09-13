import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { fetchPlatformCategories, registerUser, setAuthToken } from '../services/api';
import { geocodeAddressStrict } from '../services/locationIq';
import { fonts } from '../../theme';

const colors = { ink: '#102A43', teal: '#0F766E', canvas: '#F5F8FA', white: '#FFFFFF', muted: '#5A7A91', line: '#D9E2EC', error: '#E53935' };

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

  const handleRegister = async () => {
    const technicianMissing = role === 'technician' && (!phone.trim() || !governmentIdNumber.trim() || !address.trim() || !skills.trim() || !yearsExperience.trim() || !governmentIdFile || !certificateFile);
    if (!name.trim() || !email.trim() || !password || !confirmPassword || (role === 'customer' && (!phone.trim() || !address.trim())) || technicianMissing) {
      Alert.alert('Missing details', role === 'customer'
        ? 'Please provide your name, email, passwords, phone number, and service address.'
        : 'Please complete all technician application fields and upload both credentials.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure both password fields are identical.');
      return;
    }

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
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
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
          >
            <Text style={[styles.roleText, role === 'customer' && styles.activeRoleText]}>Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.roleButton, role === 'technician' && styles.activeRole]} 
            onPress={() => setRole('technician')}
          >
            <Text style={[styles.roleText, role === 'technician' && styles.activeRoleText]}>Technician</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="John Doe"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="name@example.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
          </View>

          {role === 'technician' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="call-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="09XX XXX XXXX" placeholderTextColor={colors.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Skills / Specializations</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="construct-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="Refrigerator repair, computers, electronics" placeholderTextColor={colors.muted} value={skills} onChangeText={setSkills} />
                </View>
                <Text style={styles.helperText}>Separate multiple skills with commas.</Text>
              </View>

              {categoryOptions.length > 0 && (
                <View style={styles.categoryList}>
                  <TouchableOpacity
                    style={styles.selectAllButton}
                    onPress={() => {
                      const allSelected = categoryOptions.every(cat => skills.split(',').map(s => s.trim()).includes(cat.name));
                      if (allSelected) {
                        setSkills('');
                      } else {
                        setSkills(categoryOptions.map(cat => cat.name).join(', '));
                      }
                    }}
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
                        }}
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
                <Text style={styles.inputLabel}>Government ID Number</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="card-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="Enter valid government ID number" placeholderTextColor={colors.muted} value={governmentIdNumber} onChangeText={setGovernmentIdNumber} />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address</Text>
                <View style={[styles.inputContainer, styles.textAreaContainer]}>
                  <Ionicons name="location-outline" size={20} color={colors.muted} style={[styles.inputIcon, { marginTop: 14 }]} />
                  <TextInput style={[styles.textInput, styles.textArea]} placeholder="House number, street, barangay, city" placeholderTextColor={colors.muted} multiline value={address} onChangeText={setAddress} onBlur={() => { if (address.trim()) { setGeoStatus('detecting'); geocodeAddressStrict(address).then((coords) => { setDetectedCoords(coords || null); setGeoStatus(coords ? 'found' : 'not-found'); }).catch(() => { setDetectedCoords(null); setGeoStatus('not-found'); }); } }} />
                </View>
                {geoStatus === 'detecting' && <Text style={[styles.geoHint, styles.geoPending]}>Detecting location...</Text>}
                {geoStatus === 'found' && detectedCoords && <Text style={[styles.geoHint, styles.geoOk]}>✔ Latitude {detectedCoords.latitude.toFixed(4)} • Longitude {detectedCoords.longitude.toFixed(4)}</Text>}
                {geoStatus === 'not-found' && <Text style={[styles.geoHint, styles.geoWarn]}>⚠ Location not recognized — coordinates will stay empty</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Years of Experience</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="time-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                  <TextInput style={styles.textInput} placeholder="e.g. 5" placeholderTextColor={colors.muted} keyboardType="number-pad" value={yearsExperience} onChangeText={setYearsExperience} />
                </View>
              </View>

              <Text style={styles.credentialsTitle}>Credentials</Text>
              
              <View style={styles.credentialCard}>
                <Text style={styles.inputLabel}>Government ID File</Text>
                <TouchableOpacity style={styles.documentButton} onPress={() => chooseCredential(setGovernmentIdFile)}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.teal} />
                  <Text style={styles.documentButtonText}>{governmentIdFile ? governmentIdFile.name : 'Choose Government ID file'}</Text>
                </TouchableOpacity>
                <Text style={styles.fileHint}>JPG, PNG, or PDF. Maximum 10 MB.</Text>
              </View>

              <View style={styles.credentialCard}>
                <Text style={styles.inputLabel}>Certificate or Proof of Experience</Text>
                <TouchableOpacity style={styles.documentButton} onPress={() => chooseCredential(setCertificateFile)}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.teal} />
                  <Text style={styles.documentButtonText}>{certificateFile ? certificateFile.name : 'Choose certificate file'}</Text>
                </TouchableOpacity>
                <Text style={styles.fileHint}>JPG, PNG, or PDF. Maximum 10 MB.</Text>
              </View>

              <Text style={styles.helperText}>Your application will remain pending until an administrator reviews your credentials.</Text>
            </>
          )}

          {role === 'customer' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="call-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="09XX XXX XXXX"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
                <Text style={styles.helperText}>Technicians may use this to coordinate your repair.</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Address</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="location-outline" size={20} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="House number, street, barangay, city"
                    placeholderTextColor={colors.muted}
                    value={address}
                    onChangeText={setAddress}
                  />
                </View>
              </View>

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
                  />
                </View>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{role === 'technician' ? 'Submit Application' : 'Register'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={switchToLogin}>
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
  roleHeader: { color: colors.muted, fontSize: 10, letterSpacing: 2, fontFamily: fonts.bold, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.line, shadowColor: '#102A43', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 6 },
  cardHeader: { marginBottom: 20 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 6 },
  title: { color: colors.ink, fontSize: 24, fontFamily: fonts.bold, marginBottom: 6 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  roleContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: colors.canvas, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.line },
  roleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeRole: { backgroundColor: colors.teal, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  roleText: { fontFamily: fonts.semiBold, color: colors.muted, fontSize: 13 },
  activeRoleText: { color: colors.white },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, height: 50 },
  textAreaContainer: { height: 90, alignItems: 'flex-start' },
  inputIcon: { marginRight: 10, alignSelf: 'center' },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium },
  textArea: { height: 74, textAlignVertical: 'top', paddingTop: 12 },
  geoHint: { fontSize: 11, lineHeight: 15, marginTop: 6, fontFamily: fonts.medium },
  geoPending: { color: colors.muted },
  geoOk: { color: colors.teal },
  geoWarn: { color: colors.error },
  helperText: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 2, fontFamily: fonts.regular },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 4 },
  categoryChip: { backgroundColor: colors.canvas, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.line },
  selectedCategoryChip: { backgroundColor: colors.teal, borderColor: colors.teal },
  selectAllButton: { backgroundColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  categoryText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  selectedCategoryText: { color: colors.white },
  selectAllText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold },
  credentialsTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, marginTop: 8, marginBottom: 4 },
  credentialCard: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, gap: 6 },
  documentButton: { backgroundColor: colors.white, padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  documentButtonText: { color: colors.teal, fontFamily: fonts.semiBold, fontSize: 13 },
  fileHint: { color: colors.muted, fontSize: 10, textAlign: 'center', fontFamily: fonts.medium },
  primaryButton: { backgroundColor: colors.teal, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.5 },
  linkButton: { alignItems: 'center', marginTop: 8, paddingVertical: 4 },
  linkText: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  linkBold: { color: colors.teal, fontFamily: fonts.bold }
});