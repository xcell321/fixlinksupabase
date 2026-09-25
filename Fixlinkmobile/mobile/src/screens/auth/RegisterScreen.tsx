// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { fetchPlatformCategories, registerUser, setAuthToken } from '../services/api';
import { colors, fonts } from '../../theme';

// Reference Register layout for both roles: dark rounded header, uppercase
// labels, gray-50 inputs, full-width accent button.
// Backend-mandated extras kept for technicians only: credentials uploads
// (government ID + certificate files are required by the API).
export default function RegisterScreen({ switchToLogin, initialRole = 'customer', onTechnicianPending }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [governmentIdNumber, setGovernmentIdNumber] = useState('');
  const [governmentIdFile, setGovernmentIdFile] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [role, setRole] = useState(initialRole); // 'customer' or 'technician'
  const [loading, setLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({}); // Record<string,string>

  useEffect(() => {
    fetchPlatformCategories().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  const isTechRole = role === 'technician';
  const accent = isTechRole ? colors.tech : colors.customer;
  const accentSoft = isTechRole ? colors.techSoft : colors.customerSoft;

  const clearFieldError = (key) => setFieldErrors((prev) => { if (!prev[key]) return prev; const next = { ...prev }; delete next[key]; return next; });

  const toggleSkill = (categoryName) => {
    const skillList = skills.split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (skillList.includes(categoryName)) {
      setSkills(skillList.filter((s) => s !== categoryName).join(', '));
    } else {
      setSkills(skillList.concat(categoryName).join(', '));
    }
    clearFieldError('skills');
  };

  const handleRegister = async () => {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const nextErrors = {};
    if (!fullName) nextErrors.name = 'Please enter your name';
    if (!email.trim()) nextErrors.email = 'Email is required';
    if (!phone.trim()) nextErrors.phone = 'Phone number is required';
    if (!password) nextErrors.password = 'Password is required';
    if (!confirmPassword) nextErrors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    if (role === 'technician') {
      if (!skills.trim()) nextErrors.skills = 'Select at least one expertise';
      if (!yearsExperience.trim()) nextErrors.yearsExperience = 'Years of experience is required';
      if (!governmentIdNumber.trim()) nextErrors.governmentIdNumber = 'Government ID is required';
      if (!governmentIdFile) nextErrors.governmentIdFile = 'Government ID file is required';
      if (!certificateFile) nextErrors.certificateFile = 'Certificate is required';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const regData = await registerUser({
        name: fullName,
        email: email.trim().toLowerCase(),
        password,
        role,
        phone: phone.trim(),
        skills: role === 'technician' ? skills.trim() : undefined,
        yearsExperience: role === 'technician' ? yearsExperience.trim() : undefined,
        governmentIdNumber: role === 'technician' ? governmentIdNumber.trim() : undefined,
        governmentIdFile: role === 'technician' ? governmentIdFile : undefined,
        certificateFile: role === 'technician' ? certificateFile : undefined,
      });

      if (regData?.idToken) {
        setAuthToken(regData.idToken);
        Alert.alert('Welcome to FixLink!', 'Your account is ready.');
        return;
      }

      Alert.alert('Application submitted', role === 'technician'
        ? 'Your technician application is pending admin review. You can log in after it is approved.'
        : 'Account created successfully! Please log in.');
      if (role === 'technician' && onTechnicianPending) onTechnicianPending();
      else switchToLogin();
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

  const renderField = (label, value, onChange, fieldKey, placeholder, extraProps = {}) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, fieldErrors[fieldKey] && styles.inputError]}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={(t) => { onChange(t); clearFieldError(fieldKey); }}
        accessibilityLabel={label}
        {...extraProps}
      />
      {fieldErrors[fieldKey] ? <Text style={styles.errorText}>{fieldErrors[fieldKey]}</Text> : null}
    </View>
  );

  const selectedSkills = skills.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, isTechRole && styles.headerTech]}>
        <TouchableOpacity onPress={switchToLogin} style={styles.backLink} accessibilityRole="button" accessibilityLabel="Back to login">
          <Ionicons name="arrow-back" size={16} color="#9CA3AF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isTechRole ? 'Join as Technician' : 'Create account'}</Text>
        <Text style={styles.subtitle}>{isTechRole ? 'Apply to become a FixLink Pro technician' : 'Join FixLink and get repairs done fast'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.roleTabs}>
          <TouchableOpacity
            style={[styles.roleTab, role === 'customer' && styles.roleTabCustomer]}
            onPress={() => setRole('customer')}
            accessibilityRole="button"
            accessibilityLabel="Register as customer"
          >
            <Text style={[styles.roleTabText, role === 'customer' && styles.roleTabTextOn]}>Customer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleTab, role === 'technician' && styles.roleTabTech]}
            onPress={() => setRole('technician')}
            accessibilityRole="button"
            accessibilityLabel="Register as technician"
          >
            <Text style={[styles.roleTabText, role === 'technician' && styles.roleTabTextOn]}>Technician</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.nameGrid}>
          <View style={styles.nameCell}>
            {renderField('First Name', firstName, setFirstName, 'name', isTechRole ? 'Marcus' : 'Alex')}
          </View>
          <View style={styles.nameCell}>
            {renderField('Last Name', lastName, setLastName, 'lastname', isTechRole ? 'Rivera' : 'Morgan')}
          </View>
        </View>
        {fieldErrors.name && !firstName.trim() && !lastName.trim() ? <Text style={styles.errorText}>{fieldErrors.name}</Text> : null}

        {renderField('Email', email, setEmail, 'email', isTechRole ? 'tech@email.com' : 'you@email.com', { autoCapitalize: 'none', keyboardType: 'email-address' })}
        {renderField('Phone', phone, setPhone, 'phone', '+1 555 000 0000', { keyboardType: 'phone-pad' })}

        {isTechRole && (
          <View style={styles.field}>
            <Text style={styles.label}>Primary Expertise</Text>
            <View style={styles.chipsRow}>
              {categoryOptions.length > 0 ? categoryOptions.map((cat) => {
                const catName = String(cat?.name || '').trim();
                if (!catName) return null;
                const selected = selectedSkills.includes(catName);
                return (
                  <TouchableOpacity
                    key={String(cat?.id || catName)}
                    onPress={() => toggleSkill(catName)}
                    style={[styles.chip, selected && { borderColor: accent, backgroundColor: accentSoft }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={catName}
                  >
                    <Text style={[styles.chipText, selected && { color: accent }]}>{catName}</Text>
                  </TouchableOpacity>
                );
              }) : (
                <Text style={styles.helperText}>Loading expertise list...</Text>
              )}
            </View>
            {fieldErrors.skills ? <Text style={styles.errorText}>{fieldErrors.skills}</Text> : null}
          </View>
        )}

        {isTechRole && renderField('Years of Experience', yearsExperience, setYearsExperience, 'yearsExperience', '5', { keyboardType: 'number-pad' })}

        {renderField('Password', password, setPassword, 'password', '••••••••', { secureTextEntry: true })}
        {renderField('Confirm Password', confirmPassword, setConfirmPassword, 'confirmPassword', '••••••••', { secureTextEntry: true })}

        {isTechRole && (
          <>
            {renderField('Government ID Number', governmentIdNumber, setGovernmentIdNumber, 'governmentIdNumber', 'Enter valid government ID number')}
            <View style={styles.field}>
              <Text style={styles.label}>Government ID File</Text>
              <TouchableOpacity style={[styles.input, styles.docButton, fieldErrors.governmentIdFile && styles.inputError]} onPress={() => { chooseCredential(setGovernmentIdFile); clearFieldError('governmentIdFile'); }} accessibilityRole="button" accessibilityLabel="Choose Government ID file">
                <Ionicons name="cloud-upload-outline" size={18} color={accent} />
                <Text style={styles.docButtonText} numberOfLines={1}>{governmentIdFile ? governmentIdFile.name : 'Choose Government ID file'}</Text>
              </TouchableOpacity>
              {fieldErrors.governmentIdFile ? <Text style={styles.errorText}>{fieldErrors.governmentIdFile}</Text> : null}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Certificate or Proof of Experience</Text>
              <TouchableOpacity style={[styles.input, styles.docButton, fieldErrors.certificateFile && styles.inputError]} onPress={() => { chooseCredential(setCertificateFile); clearFieldError('certificateFile'); }} accessibilityRole="button" accessibilityLabel="Choose certificate file">
                <Ionicons name="cloud-upload-outline" size={18} color={accent} />
                <Text style={styles.docButtonText} numberOfLines={1}>{certificateFile ? certificateFile.name : 'Choose certificate file'}</Text>
              </TouchableOpacity>
              {fieldErrors.certificateFile ? <Text style={styles.errorText}>{fieldErrors.certificateFile}</Text> : null}
            </View>
          </>
        )}

        <TouchableOpacity style={[styles.primary, { backgroundColor: accent }]} onPress={handleRegister} disabled={loading} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={isTechRole ? 'Submit application' : 'Create account'}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{isTechRole ? 'Submit Application' : 'Create Account'}</Text>}
        </TouchableOpacity>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{isTechRole ? 'Already applied? ' : 'Already registered? '}</Text>
          <TouchableOpacity onPress={switchToLogin}>
            <Text style={[styles.switchLink, { color: accent }]}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { backgroundColor: '#0D1B2A', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTech: { backgroundColor: '#0D1B2A' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 24 },
  backText: { color: '#9CA3AF', fontSize: 14, fontFamily: fonts.regular },
  title: { color: '#FFFFFF', fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.3, marginBottom: 4 },
  subtitle: { color: '#9CA3AF', fontSize: 14, fontFamily: fonts.regular },
  form: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, gap: 0 },
  roleTabs: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4, gap: 4, marginBottom: 20 },
  roleTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  roleTabCustomer: { backgroundColor: colors.customer },
  roleTabTech: { backgroundColor: colors.tech },
  roleTabText: { color: '#6B7280', fontSize: 13, fontFamily: fonts.semiBold },
  roleTabTextOn: { color: '#FFFFFF' },
  nameGrid: { flexDirection: 'row', gap: 12 },
  nameCell: { flex: 1, minWidth: 0 },
  field: { marginBottom: 16 },
  label: { color: '#6B7280', fontSize: 12, fontFamily: fonts.semiBold, letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, minHeight: 52, fontSize: 14, fontFamily: fonts.medium, color: colors.ink, backgroundColor: '#F9FAFB' },
  inputError: { borderColor: '#FCA5A5' },
  errorText: { color: '#DC2626', fontSize: 12, fontFamily: fonts.medium, marginTop: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chipText: { color: '#4B5563', fontSize: 12, fontFamily: fonts.semiBold },
  helperText: { color: '#9CA3AF', fontSize: 12, fontFamily: fonts.regular },
  docButton: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-start' },
  docButtonText: { flex: 1, color: '#4B5563', fontSize: 13, fontFamily: fonts.medium },
  primary: { borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.semiBold },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  switchText: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular },
  switchLink: { fontSize: 13, fontFamily: fonts.semiBold },
});
