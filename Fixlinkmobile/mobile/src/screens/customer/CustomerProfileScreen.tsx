// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts } from '../../theme';
import HelpSheet from '../../components/HelpSheet';
import { fetchCompletedJobs, fetchCustomerRequests } from '../services/api';

// Prototype CustomerProfile: dark header + stats + menu list + red sign out.
// Edit Profile kept as sub-view (prototype EditProfile). Stats are real counts.
const ORANGE = colors.customer;
const DARK = colors.dark;
const ACTIVE_STATUSES = ['accepted', 'confirmed', 'customer ready', 'in progress'];

export default function CustomerProfileScreen({ user, onLogout, onUpdateProfile, onNavigateToProgress, onOpenNotifications }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [profileImage, setProfileImage] = useState(user?.profileImage || null);
  const [loading, setLoading] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setStatsLoading(true);
    Promise.all([
      fetchCompletedJobs(user?.name, user?.uid).catch(() => []),
      fetchCustomerRequests(user?.name, user?.uid).catch(() => []),
    ]).then(([completed, tracked]) => {
      if (!active) return;
      const c = Array.isArray(completed) ? completed : [];
      const t = Array.isArray(tracked) ? tracked : [];
      setCompletedCount(c.length);
      setActiveCount(t.filter((r) => ACTIVE_STATUSES.includes(String(r.status || '').toLowerCase())).length);
      setTotalCount(c.length + t.length);
      setStatsLoading(false);
    });
    return () => { active = false; };
  }, [user?.name, user?.uid]);

  const initials = String(name || user?.name || 'C').trim().charAt(0).toUpperCase();

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
        await onUpdateProfile({ name: name.trim(), phone: phone.trim(), address: address.trim(), profileImage });
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

  if (isEditing) {
    return (
      <ScrollView contentContainerStyle={styles.editScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.editHeader}>
          <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back to profile">
            <Ionicons name="arrow-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.editTitle}>Edit Profile</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.avatarCenter}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
            {profileImage ? (
              <Image source={{ uri: typeof profileImage === 'string' ? profileImage : profileImage.uri }} style={styles.avatarLg} />
            ) : (
              <View style={styles.avatarLgPh}><Text style={styles.avatarLgText}>{initials}</Text></View>
            )}
            <View style={styles.cameraBadge}><Ionicons name="pencil" size={12} color="#FFFFFF" /></View>
          </TouchableOpacity>
          <Text style={styles.changePhoto}>Change Photo</Text>
        </View>
        <Text style={styles.label}>FIRST NAME</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Alex" placeholderTextColor="#9CA3AF" />
        <Text style={styles.label}>PHONE</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+1 555 000 0000" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
        <Text style={styles.label}>ADDRESS</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="142 Oak St, Apt 3B" placeholderTextColor="#9CA3AF" />
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading} activeOpacity={0.88}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const menu = [
    { key: 'account', label: 'Account Information', icon: 'person-outline', onPress: () => setIsEditing(true) },
    { key: 'history', label: 'Repair History', icon: 'construct-outline', onPress: () => onNavigateToProgress && onNavigateToProgress() },
    { key: 'notifications', label: 'Notifications', icon: 'notifications-outline', onPress: () => onOpenNotifications && onOpenNotifications() },
    { key: 'help', label: 'Help & Support', icon: 'chatbubble-ellipses-outline', onPress: () => setHelpVisible(true) },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {profileImage ? (
            <Image source={{ uri: typeof profileImage === 'string' ? profileImage : profileImage.uri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarText}>{initials}</Text></View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={1}>{user?.name || 'Customer'}</Text>
        <Text style={styles.email} numberOfLines={1}>{user?.email || ''}</Text>
        <View style={styles.statsRow}>
          {[{ v: String(totalCount), l: 'Requests' }, { v: String(activeCount), l: 'Active' }, { v: String(completedCount), l: 'Completed' }].map((s) => (
            <View key={s.l} style={styles.stat}>
              {statsLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.statValue}>{s.v}</Text>
              )}
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.body}>
        {menu.map((item) => (
          <Pressable key={item.key} onPress={item.onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={item.label}>
            <View style={styles.menuIcon}><Ionicons name={item.icon} size={18} color={ORANGE} /></View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
          </Pressable>
        ))}
        <TouchableOpacity style={styles.logoutRow} onPress={onLogout} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Sign out">
          <View style={styles.logoutIcon}><Ionicons name="close" size={18} color="#EF4444" /></View>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      <HelpSheet visible={helpVisible} role="customer" onClose={() => setHelpVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { paddingBottom: 28 },
  header: { backgroundColor: DARK, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: 'center' },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPh: { backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extraBold },
  name: { color: '#FFFFFF', fontSize: 20, fontFamily: fonts.extraBold },
  email: { color: '#9CA3AF', fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 16 },
  stat: { alignItems: 'center' },
  statValue: { color: '#FFFFFF', fontSize: 17, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  statLabel: { color: '#9CA3AF', fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  menuRow: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  menuIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: '#374151', fontSize: 14, fontFamily: fonts.semiBold },
  logoutRow: { backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#FECACA' },
  logoutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#EF4444', fontSize: 14, fontFamily: fonts.semiBold },
  // Edit sub-view (prototype EditProfile)
  editScroll: { flexGrow: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 4 },
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  editTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.semiBold },
  avatarCenter: { alignItems: 'center', marginBottom: 20 },
  avatarLg: { width: 56, height: 56, borderRadius: 28 },
  avatarLgPh: { width: 56, height: 56, borderRadius: 28, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extraBold },
  cameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  changePhoto: { color: ORANGE, fontSize: 12, fontFamily: fonts.semiBold, marginTop: 8 },
  label: { color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, minHeight: 52, fontSize: 14, fontFamily: fonts.medium, color: colors.ink, backgroundColor: '#F9FAFB' },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
