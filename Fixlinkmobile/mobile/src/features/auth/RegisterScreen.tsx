import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { fetchPlatformCategories, registerUser } from '../../services/api';
import { colors, fonts, themedStyles } from '../../theme';

// Reference Register layout for both roles: dark rounded header, uppercase
// labels, gray-50 inputs, full-width accent button.
// Backend-mandated extras kept for technicians only: credentials uploads
// (government ID + certificate files are required by the API).
type RegisterRole = 'customer' | 'technician';

// A picked credential document (government ID / certificate).
type CredentialFile = DocumentPicker.DocumentPickerAsset;

type CategoryOption = { id?: string; name?: string };

type RegisterScreenProps = {
  switchToLogin: () => void;
  initialRole?: RegisterRole;
  // Receives the registered email so the pending screen can check the status.
  onTechnicianPending?: (email: string) => void;
  onRegistered?: (user: unknown) => void;
};

export default function RegisterScreen({ switchToLogin, initialRole = 'customer', onTechnicianPending, onRegistered }: RegisterScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [skills, setSkills] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [governmentIdNumber, setGovernmentIdNumber] = useState('');
  const [governmentIdFile, setGovernmentIdFile] = useState<CredentialFile | null>(null);
  const [certificateFile, setCertificateFile] = useState<CredentialFile | null>(null);
  const [role, setRole] = useState<RegisterRole>(initialRole); // 'customer' or 'technician'
  const [loading, setLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformCategories()
      .then((data) => setCategoryOptions(data as CategoryOption[]))
      .catch(() => setCategoryOptions([]));
  }, []);

  const isTechRole = role === 'technician';
  const accent = isTechRole ? colors.tech : colors.customer;
  const accentSoft = isTechRole ? colors.techSoft : colors.customerSoft;

  const clearFieldError = (key: string) => setFieldErrors((prev) => { if (!prev[key]) return prev; const next: Record<string, string> = { ...prev }; delete next[key]; return next; });

  // The phone field shows a fixed "+63" prefix, so the user only types the
  // 10-digit local number (917 123 4567). Values that already carry a country
  // code (pasted "+63 ..." or a full "09...") are normalized to 09XXXXXXXXX.
  const normalizePhone = (raw?: string | null): string => {
    let digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('63') && digits.length >= 12) digits = `0${digits.slice(2)}`;
    else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
    return digits;
  };

  // Philippine mobile numbers are exactly 11 digits starting with 09. With the
  // visible +63 prefix the 10-digit local form is accepted as well.
  const validatePhone = (raw?: string | null): string | null => {
    if (!String(raw ?? '').trim()) return 'Phone number is required';
    const digits = normalizePhone(raw);
    if (digits.length < 11) return 'Phone number is incomplete. Enter 10 digits.';
    if (digits.length > 11) return 'Phone number must be 11 digits only.';
    if (!/^09\d{9}$/.test(digits)) return 'Enter a valid mobile number (e.g. 917 123 4567).';
    return null;
  };

  const toggleSkill = (categoryName: string) => {
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
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!email.trim()) nextErrors.email = 'Email is required';
    const phoneError = validatePhone(phone);
    if (phoneError) nextErrors.phone = phoneError;
    if (role === 'customer' && !address.trim()) nextErrors.address = 'Address is required';
    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters';
    if (!confirmPassword) nextErrors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    if (role === 'technician') {
      if (!serviceArea.trim()) nextErrors.serviceArea = 'Service area is required';
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
    setSuccessMessage(null);
    setSubmitError(null);

    setLoading(true);
    try {
      await registerUser({
        name: fullName,
        email: email.trim().toLowerCase(),
        password,
        role,
        phone: normalizePhone(phone) || phone.trim(),
        address: role === 'technician' ? serviceArea.trim() : address.trim(),
        skills: role === 'technician' ? skills.trim() : undefined,
        yearsExperience: role === 'technician' ? yearsExperience.trim() : undefined,
        governmentIdNumber: role === 'technician' ? governmentIdNumber.trim() : undefined,
        governmentIdFile: role === 'technician' ? governmentIdFile : undefined,
        certificateFile: role === 'technician' ? certificateFile : undefined,
      });

      const message = role === 'technician'
        ? 'Your technician application is pending admin review. You can log in after it is approved.'
        : 'Account created successfully! You can now log in.';
      setSuccessMessage(message);

      // A technician has nothing to do on the register form after submitting, so
      // go straight to the verification-pending screen instead of an alert they
      // would have to dismiss first.
      if (role === 'technician' && onTechnicianPending) {
        onTechnicianPending(email.trim().toLowerCase());
        return;
      }

      Alert.alert('Account created', message, [{ text: 'OK', onPress: () => switchToLogin() }]);
    } catch (error) {
      const failure = error as { response?: { data?: { error?: string } }; message?: string } | null;
      const rawMessage = failure?.response?.data?.error || failure?.message || 'Registration failed';
      const friendlyMessage = /timeout/i.test(String(rawMessage))
        ? 'The request took too long. Check your connection and try again. If the account was created, just log in.'
        : String(rawMessage);
      setSubmitError(friendlyMessage);
      console.warn('Registration failed:', friendlyMessage);
      Alert.alert('Registration Error', friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const isAcceptedCredentialFile = (asset: CredentialFile | null | undefined) => {
    const mime = String(asset?.mimeType || '').toLowerCase();
    if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'application/pdf') return true;
    const fileName = String(asset?.name || '');
    const dotIndex = fileName.lastIndexOf('.');
    const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
    return extension === '.jpg' || extension === '.jpeg' || extension === '.png' || extension === '.pdf';
  };

  const chooseCredential = async (
    setter: (file: CredentialFile) => void,
    fieldKey: string,
    label: string
  ) => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/pdf'], copyToCacheDirectory: true });
    if (result.canceled) return;
    // `assets[0]` is `T | undefined` under noUncheckedIndexedAccess; a canceled
    // picker with no asset has nothing to validate.
    const asset = result.assets?.[0];
    if (!asset) return;
    if (!isAcceptedCredentialFile(asset)) {
      setFieldErrors((prev) => ({ ...prev, [fieldKey]: `${label} must be JPG, PNG, or PDF.` }));
      return;
    }
    clearFieldError(fieldKey);
    setter(asset);
  };

  // `prefix` renders a fixed, non-editable leading label inside the field box
  // (used for the +63 country code on the phone number).
  const renderField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    fieldKey: string,
    placeholder: string,
    extraProps: Record<string, unknown> = {},
    prefix?: string
  ) => {
    const errored = Boolean(fieldErrors[fieldKey]);
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        {prefix ? (
          <View style={[styles.prefixWrap, errored && styles.inputError]}>
            <Text style={styles.prefixText}>{prefix}</Text>
            <TextInput
              style={styles.prefixInput}
              placeholder={placeholder}
              placeholderTextColor={colors.subtle}
              value={value}
              onChangeText={(t) => { onChange(t); clearFieldError(fieldKey); }}
              accessibilityLabel={label}
              {...extraProps}
            />
          </View>
        ) : (
          <TextInput
            style={[styles.input, errored && styles.inputError]}
            placeholder={placeholder}
            placeholderTextColor={colors.subtle}
            value={value}
            onChangeText={(t) => { onChange(t); clearFieldError(fieldKey); }}
            accessibilityLabel={label}
            {...extraProps}
          />
        )}
        {errored ? <Text style={styles.errorText}>{fieldErrors[fieldKey]}</Text> : null}
      </View>
    );
  };

  // Password inputs with a visibility toggle (eye icon) so users can verify
  // what they typed. Applied to both roles since they share this screen.
  // Icon shows the CURRENT state: slashed eye while rendered as dots,
  // plain eye while the password is readable.
  const renderPasswordField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    fieldKey: string,
    visible: boolean,
    onToggleVisible: () => void
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordWrap, fieldErrors[fieldKey] && styles.inputError]}>
        <TextInput
          style={styles.passwordInput}
          placeholder="••••••••"
          placeholderTextColor={colors.subtle}
          value={value}
          onChangeText={(t) => { onChange(t); clearFieldError(fieldKey); }}
          secureTextEntry={!visible}
          autoCapitalize="none"
          accessibilityLabel={label}
        />
        {value ? (
          <TouchableOpacity
            onPress={onToggleVisible}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          >
            <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.subtle} />
          </TouchableOpacity>
        ) : null}
      </View>
      {fieldErrors[fieldKey] ? <Text style={styles.errorText}>{fieldErrors[fieldKey]}</Text> : null}
    </View>
  );

  const selectedSkills = skills.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, isTechRole && styles.headerTech]}>
        <TouchableOpacity onPress={switchToLogin} style={styles.backLink} accessibilityRole="button" accessibilityLabel="Back to login">
          <Ionicons name="arrow-back" size={16} color={colors.subtle} />
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
            {renderField('First Name', firstName, setFirstName, 'firstName', isTechRole ? 'Marcus' : 'Alex')}
          </View>
          <View style={styles.nameCell}>
            {renderField('Last Name', lastName, setLastName, 'lastName', isTechRole ? 'Rivera' : 'Morgan')}
          </View>
        </View>

        {renderField('Email', email, setEmail, 'email', isTechRole ? 'tech@email.com' : 'you@email.com', { autoCapitalize: 'none', keyboardType: 'email-address' })}
        {renderField('Phone Number', phone, setPhone, 'phone', '917 123 4567', { keyboardType: 'number-pad' }, '+63')}
        {!isTechRole && renderField('Address', address, setAddress, 'address', 'Street, Barangay, City')}
        {isTechRole && renderField('Service Area', serviceArea, setServiceArea, 'serviceArea', 'Bogo City, Cebu')}

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

        {renderPasswordField('Password', password, setPassword, 'password', showPassword, () => setShowPassword((v) => !v))}
        {!fieldErrors.password && (
          <Text style={styles.hintText}>Use at least 8 characters.</Text>
        )}
        {renderPasswordField('Confirm Password', confirmPassword, setConfirmPassword, 'confirmPassword', showConfirmPassword, () => setShowConfirmPassword((v) => !v))}
        {!fieldErrors.confirmPassword && (
          <Text style={styles.hintText}>Use at least 8 characters.</Text>
        )}

        {isTechRole && (
          <>
            {renderField('Government ID Number', governmentIdNumber, setGovernmentIdNumber, 'governmentIdNumber', 'Enter valid government ID number')}
            <View style={styles.field}>
              <Text style={styles.label}>Government ID File</Text>
              <TouchableOpacity style={[styles.input, styles.docButton, fieldErrors.governmentIdFile && styles.inputError]} onPress={() => chooseCredential(setGovernmentIdFile, 'governmentIdFile', 'Government ID file')} accessibilityRole="button" accessibilityLabel="Choose Government ID file">
                <Ionicons name="cloud-upload-outline" size={18} color={accent} />
                <Text style={styles.docButtonText} numberOfLines={1}>{governmentIdFile ? governmentIdFile.name : 'Choose Government ID file'}</Text>
              </TouchableOpacity>
              {fieldErrors.governmentIdFile ? <Text style={styles.errorText}>{fieldErrors.governmentIdFile}</Text> : null}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Certificate or Proof of Experience</Text>
              <TouchableOpacity style={[styles.input, styles.docButton, fieldErrors.certificateFile && styles.inputError]} onPress={() => chooseCredential(setCertificateFile, 'certificateFile', 'Certificate file')} accessibilityRole="button" accessibilityLabel="Choose certificate file">
                <Ionicons name="cloud-upload-outline" size={18} color={accent} />
                <Text style={styles.docButtonText} numberOfLines={1}>{certificateFile ? certificateFile.name : 'Choose certificate file'}</Text>
              </TouchableOpacity>
              {fieldErrors.certificateFile ? <Text style={styles.errorText}>{fieldErrors.certificateFile}</Text> : null}
            </View>
          </>
        )}

        {Object.keys(fieldErrors).length > 0 ? (
          <View style={styles.formErrorBox} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={16} color={colors.dangerText} />
            <Text style={styles.formErrorText}>Please check the highlighted fields.</Text>
          </View>
        ) : null}

        {submitError ? (
          <View style={styles.submitErrorBox} accessibilityRole="alert">
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBox} accessibilityRole="alert">
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={[styles.primary, { backgroundColor: accent }]} onPress={handleRegister} disabled={loading} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={isTechRole ? 'Submit application' : 'Create account'}>
          {loading ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{isTechRole ? 'Submit Application' : 'Create Account'}</Text>}
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

const styles = themedStyles({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.dark, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTech: { backgroundColor: colors.dark },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 24 },
  backText: { color: colors.subtle, fontSize: 14, fontFamily: fonts.regular },
  title: { color: colors.onAccent, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.3, marginBottom: 4 },
  subtitle: { color: colors.subtle, fontSize: 14, fontFamily: fonts.regular },
  form: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, gap: 0 },
  roleTabs: { flexDirection: 'row', backgroundColor: colors.cardBorder, borderRadius: 12, padding: 4, gap: 4, marginBottom: 20 },
  roleTab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  roleTabCustomer: { backgroundColor: colors.customer },
  roleTabTech: { backgroundColor: colors.tech },
  roleTabText: { color: colors.gray500, fontSize: 13, fontFamily: fonts.semiBold },
  roleTabTextOn: { color: colors.onAccent },
  nameGrid: { flexDirection: 'row', gap: 12 },
  nameCell: { flex: 1, minWidth: 0 },
  field: { marginBottom: 16 },
  label: { color: colors.gray500, fontSize: 12, fontFamily: fonts.semiBold, letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 12, paddingHorizontal: 16, minHeight: 52, fontSize: 14, fontFamily: fonts.medium, color: colors.ink, backgroundColor: colors.appBg },
  inputError: { borderColor: colors.danger },
  prefixWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.gray200, borderRadius: 12, paddingLeft: 16, minHeight: 52, backgroundColor: colors.appBg },
  prefixText: { color: colors.gray500, fontSize: 14, fontFamily: fonts.semiBold },
  prefixInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 14, fontSize: 14, fontFamily: fonts.medium, color: colors.ink },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.gray200, borderRadius: 12, paddingHorizontal: 16, minHeight: 52, backgroundColor: colors.appBg },
  passwordInput: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.ink, paddingVertical: 14 },
  eyeButton: { paddingLeft: 12, paddingVertical: 8, marginLeft: 8 },
  errorText: { color: colors.danger, fontSize: 12, fontFamily: fonts.medium, marginTop: 6 },
  hintText: { color: colors.subtle, fontSize: 12, fontFamily: fonts.medium, marginTop: -10, marginBottom: 16 },
  successBox: { backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.tealTint, borderRadius: 12, padding: 14, marginBottom: 16 },
  successText: { color: colors.teal, fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 18 },
  formErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 12, padding: 12, marginBottom: 16 },
  formErrorText: { flex: 1, color: colors.dangerText, fontSize: 13, fontFamily: fonts.semiBold },
  submitErrorBox: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 12, padding: 14, marginBottom: 16 },
  submitErrorText: { color: colors.dangerText, fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 18 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.gray200, backgroundColor: colors.white },
  chipText: { color: colors.gray600, fontSize: 12, fontFamily: fonts.semiBold },
  helperText: { color: colors.subtle, fontSize: 12, fontFamily: fonts.regular },
  docButton: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-start' },
  docButtonText: { flex: 1, color: colors.gray600, fontSize: 13, fontFamily: fonts.medium },
  primary: { borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.semiBold },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  switchText: { color: colors.gray500, fontSize: 13, fontFamily: fonts.regular },
  switchLink: { fontSize: 13, fontFamily: fonts.semiBold },
});
