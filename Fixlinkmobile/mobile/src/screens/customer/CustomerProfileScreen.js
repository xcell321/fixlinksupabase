import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fonts } from '../../theme';

const colors = { ink: '#102A43', teal: '#0F766E', canvas: '#F5F8FA', white: '#FFFFFF', muted: '#5A7A91', line: '#D9E2EC', error: '#E53935' };

export default function CustomerProfileScreen({ user, onLogout, onUpdateProfile }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [profileImage, setProfileImage] = useState(user?.profileImage || null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProfileImage(result.assets[0]);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      if (onUpdateProfile) {
        await onUpdateProfile({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          profileImage,
        });
      }
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to update profile.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={isEditing ? pickImage : undefined} activeOpacity={isEditing ? 0.7 : 1} style={styles.avatarContainer}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(name || 'C').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {isEditing && (
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={16} color={colors.white} />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>{name || 'Customer Name'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.role}>Customer</Text>
            </View>
          </View>

          {!isEditing && (
            <TouchableOpacity style={styles.editIconButton} onPress={() => setIsEditing(true)}>
              <Ionicons name="pencil-outline" size={18} color={colors.teal} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.cardHeader}>
          <Text style={styles.kicker}>DETAILS</Text>
          <Text style={styles.title}>{isEditing ? 'Edit Profile' : 'Contact Information'}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              {isEditing ? (
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Full Name"
                  placeholderTextColor={colors.muted}
                />
              ) : (
                <Text style={styles.infoValue}>{name || 'Not Available'}</Text>
              )}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={[styles.inputContainer, styles.disabledInput]}>
              <Ionicons name="mail-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              <Text style={[styles.infoValue, { color: colors.muted }]}>{user?.email || 'Not Available'}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color={colors.muted} style={styles.inputIcon} />
              {isEditing ? (
                <TextInput
                  style={styles.textInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="09XX XXX XXXX"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                />
              ) : (
                <Text style={styles.infoValue}>{phone || '+1 (555) 000-0000'}</Text>
              )}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Service Address</Text>
            <View style={[styles.inputContainer, styles.textAreaContainer, isEditing && { height: 80 }]}>
              <Ionicons name="location-outline" size={20} color={colors.muted} style={[styles.inputIcon, isEditing ? { alignSelf: 'flex-start', marginTop: 14 } : { alignSelf: 'center' }]} />
              {isEditing ? (
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="House number, street, barangay, city"
                  placeholderTextColor={colors.muted}
                  multiline
                />
              ) : (
                <Text style={[styles.infoValue, { paddingTop: 14, paddingBottom: 14 }]}>{address || 'No address provided'}</Text>
              )}
            </View>
          </View>

          {isEditing ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)} disabled={loading}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, padding: 20, backgroundColor: colors.canvas, justifyContent: 'center' },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.line, shadowColor: '#102A43', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 6 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatarContainer: { position: 'relative', marginRight: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.teal, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.white },
  avatarText: { color: colors.white, fontSize: 26, fontFamily: fonts.extraBold },
  identity: { flex: 1, justifyContent: 'center' },
  name: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold, marginBottom: 4 },
  roleBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#BBF7D0' },
  role: { color: colors.teal, fontSize: 11, fontFamily: fonts.semiBold },
  editIconButton: { padding: 8, borderRadius: 10, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  cardHeader: { marginBottom: 16 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, marginBottom: 4 },
  title: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 50 },
  disabledInput: { backgroundColor: '#F0F4F8' },
  textAreaContainer: { minHeight: 50, alignItems: 'center' },
  inputIcon: { marginRight: 10, alignSelf: 'center' },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 12 },
  textArea: { height: 60, textAlignVertical: 'top', paddingTop: 12 },
  infoValue: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 14 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelButton: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bold },
  saveButton: { flex: 2, height: 50, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F766E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  logoutButton: { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FECACA', height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  logoutText: { color: '#DC2626', fontSize: 14, fontFamily: fonts.bold },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.5 }
});