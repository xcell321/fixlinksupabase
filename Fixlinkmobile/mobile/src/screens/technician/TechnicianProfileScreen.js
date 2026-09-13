import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetchTechnicianProfile, updateTechnicianProfile, uploadPortfolioPhotos } from '../services/api';
import { geocodeAddressStrict } from '../services/locationIq';
import Skeleton from '../../components/Skeleton';
import { fonts } from '../../theme';

export default function TechnicianProfileScreen({ technician, onLogout, readOnly = false, onBack }) {
  const [profile, setProfile] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', address: '', bio: '', skills: '', yearsExperience: '' });
  const [detectedCoords, setDetectedCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // 'idle' | 'detecting' | 'found' | 'not-found'

  useEffect(() => {
    if (!editing || !draft.address.trim()) {
      setDetectedCoords(null);
      setGeoStatus('idle');
      return;
    }
    let cancelled = false;
    setGeoStatus('detecting');
    const timer = setTimeout(async () => {
      try {
        const coords = await geocodeAddressStrict(draft.address);
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
  }, [draft.address, editing]);

  const loadProfile = async () => {
    try {
      const result = await fetchTechnicianProfile(technician.uid);
      setProfile(result);
      setDraft({ name: result.name || '', phone: result.phone || '', address: result.address || '', bio: result.bio || '', skills: Array.isArray(result.skills) ? result.skills.join(', ') : String(result.skills || ''), yearsExperience: String(result.yearsExperience || '') });
    } catch (error) {
      Alert.alert('Profile unavailable', error.response?.data?.error || 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!draft.name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTechnicianProfile(technician.uid, {
        ...draft,
        ...(detectedCoords ? { latitude: detectedCoords.latitude, longitude: detectedCoords.longitude } : {}),
      });
      setProfile((current) => ({ ...current, ...updated }));
      setDraft({ name: updated.name || '', phone: updated.phone || '', address: updated.address || '', bio: updated.bio || '', skills: Array.isArray(updated.skills) ? updated.skills.join(', ') : String(updated.skills || ''), yearsExperience: String(updated.yearsExperience || '') });
      setEditing(false);
      Alert.alert('Success', 'Technician profile updated.');
    } catch (error) {
      Alert.alert('Update failed', error.response?.data?.error || error.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  const choosePortfolioPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Photo permission needed', 'Allow photo access to add completed repair photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 6, quality: 0.75 });
    if (!result.canceled) setSelectedPhotos(result.assets);
  };

  const savePortfolio = async () => {
    if (!selectedPhotos.length) return;
    setUploading(true);
    try {
      const result = await uploadPortfolioPhotos(technician.uid, selectedPhotos);
      setProfile((current) => ({ ...current, portfolio: result.portfolio }));
      setSelectedPhotos([]);
      Alert.alert('Portfolio updated', 'Your completed repair photos are now in your portfolio.');
    } catch (error) {
      Alert.alert('Upload failed', error.response?.data?.error || 'Unable to upload portfolio photos.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <Skeleton style={{ width: 72, height: 72, borderRadius: 36, marginRight: 16 }} />
        <View style={styles.identity}>
          <Skeleton style={{ width: '80%', height: 26, marginBottom: 6 }} />
          <Skeleton style={{ width: '40%', height: 14 }} />
        </View>
      </View>
      <View style={styles.stats}>
        <Skeleton style={{ width: '30%', height: 60 }} />
        <Skeleton style={{ width: '30%', height: 60 }} />
        <Skeleton style={{ width: '30%', height: 60 }} />
      </View>
      <Skeleton style={{ width: '60%', height: 18, marginBottom: 12 }} />
      <Skeleton style={{ width: '100%', height: 40, marginBottom: 20 }} />
      <Skeleton style={{ width: '40%', height: 18, marginBottom: 12 }} />
      <View style={styles.photoGrid}>
        {[1,2,3].map(i => <Skeleton key={i} style={{ width: '31%', aspectRatio: 1 }} />)}
      </View>
    </View>
  );
  if (!profile) return <View style={styles.center}><Text style={styles.muted}>Profile could not be loaded.</Text></View>;
  const skills = Array.isArray(profile.skills)
    ? profile.skills
    : String(profile.skills || '').split(',').map((skill) => skill.trim()).filter(Boolean);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {readOnly && onBack && (
        <View style={styles.readOnlyNav}>
          <TouchableOpacity style={styles.backButtonContainer} onPress={onBack}>
            <Ionicons name="arrow-back" size={20} color="#102A43" />
            <Text style={styles.backButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.readOnlyNavTitle}>TECHNICIAN PROFILE</Text>
        </View>
      )}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(profile.name || 'T').charAt(0).toUpperCase()}</Text></View>
        <View style={styles.identity}>{editing ? <TextInput style={styles.editName} value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} placeholder="Full name" /> : <Text style={styles.name}>{profile.name}</Text>}<Text style={styles.role}>Technician</Text>{profile.verified && <Text style={styles.badge}>Verified technician</Text>}</View>
        {!editing && !readOnly && <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}><Ionicons name="pencil-outline" size={18} color="#0F766E" /></TouchableOpacity>}
      </View>
      {editing && (
        <View style={styles.editCard}>
          {[['Phone', 'phone'], ['Address', 'address'], ['Bio', 'bio'], ['Skills (comma-separated)', 'skills'], ['Years of experience', 'yearsExperience']].map(([label, key]) => (
            <View key={key} style={styles.editGroup}>
              <Text style={styles.editLabel}>{label}</Text>
              <TextInput style={styles.editInput} value={draft[key]} onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))} multiline={key === 'address' || key === 'bio'} keyboardType={key === 'yearsExperience' ? 'number-pad' : 'default'} placeholder={label} />
              {key === 'address' && (
                <>
                  {geoStatus === 'detecting' && <Text style={[styles.geoHint, styles.geoPending]}>Detecting location...</Text>}
                  {geoStatus === 'found' && detectedCoords && <Text style={[styles.geoHint, styles.geoOk]}>✔ Latitude {detectedCoords.latitude.toFixed(4)} • Longitude {detectedCoords.longitude.toFixed(4)}</Text>}
                  {geoStatus === 'not-found' && <Text style={[styles.geoHint, styles.geoWarn]}>⚠ Location not recognized — coords will stay unchanged</Text>}
                </>
              )}
            </View>
          ))}
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelEditButton} onPress={() => setEditing(false)} disabled={saving}><Text style={styles.cancelEditText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.saveEditButton} onPress={saveProfile} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveEditText}>Save changes</Text>}</TouchableOpacity>
          </View>
        </View>
      )}
      <View style={styles.stats}><View><Text style={styles.statValue}>{profile.completedJobs}</Text><Text style={styles.statLabel}>Completed jobs</Text></View><View><Text style={styles.statValue}>{profile.averageRating || '—'}</Text><Text style={styles.statLabel}>Average rating</Text></View><View><Text style={styles.statValue}>{profile.yearsExperience || 0}</Text><Text style={styles.statLabel}>Years experience</Text></View></View>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeadingRow}><View><Text style={styles.kicker}>SERVICE LOCATION</Text><Text style={styles.sectionTitle}>Where you operate</Text></View><Ionicons name="location-outline" size={22} color="#0F766E" /></View>
        {profile.latitude != null && profile.longitude != null ? <Text style={styles.bodyText}>Latitude {Number(profile.latitude).toFixed(4)} • Longitude {Number(profile.longitude).toFixed(4)}</Text> : <Text style={styles.muted}>No location detected yet — edit your address above to auto-detect your coordinates.</Text>}
      </View>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeadingRow}><View><Text style={styles.kicker}>EXPERTISE</Text><Text style={styles.sectionTitle}>Skills and specializations</Text></View><Ionicons name="construct-outline" size={22} color="#0F766E" /></View>
        {skills.length > 0 ? <View style={styles.skillGrid}>{skills.map((skill) => <View key={skill} style={styles.skillChip}><Ionicons name="checkmark-circle" size={15} color="#0F766E" /><Text style={styles.skillText}>{skill}</Text></View>)}</View> : <Text style={styles.muted}>No skills listed.</Text>}
      </View>
      {profile.reviews && profile.reviews.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {profile.reviews.map((r, i) => <View key={i} style={styles.review}><Text style={styles.reviewRating}>{'★'.repeat(r.rating)}</Text><Text style={styles.bodyText}>{r.comment}</Text></View>)}
        </View>
      ) : <Text style={styles.muted}>No reviews yet.</Text>}
      <View style={styles.portfolioHeading}>
        <View>
          <Text style={styles.kicker}>WORK SHOWCASE</Text>
          <Text style={styles.sectionTitle}>Portfolio</Text>
        </View>
        <Ionicons name="images-outline" size={23} color="#0F766E" style={styles.portfolioIcon} />
      </View>
      {!readOnly && (
        <TouchableOpacity style={styles.secondaryButton} onPress={choosePortfolioPhotos} disabled={uploading}>
          <Text style={styles.secondaryButtonText}>{selectedPhotos.length > 0 ? `${selectedPhotos.length} photo(s) selected` : 'Upload your portfolio'}</Text>
        </TouchableOpacity>
      )}
      {!readOnly && selectedPhotos.length > 0 && <View style={styles.photoGrid}>{selectedPhotos.map((photo) => <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.photo} />)}</View>}
      {!readOnly && selectedPhotos.length > 0 && <TouchableOpacity style={styles.button} onPress={savePortfolio} disabled={uploading}>{uploading ? <ActivityIndicator color='#fff' /> : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={styles.buttonText}>Upload portfolio photos</Text></>}</TouchableOpacity>}
      <View style={styles.photoGrid}>{(profile.portfolio || []).map((photo) => <Image key={photo.url} source={{ uri: photo.url }} style={styles.photo} />)}</View>
      {!readOnly && <TouchableOpacity style={styles.logoutButton} onPress={onLogout}><Ionicons name="log-out-outline" size={18} color="#DC2626" /><Text style={styles.logoutText}>Log Out</Text></TouchableOpacity>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F5F8FA', flexGrow: 1 },
  readOnlyNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backButtonContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  backButton: { color: '#102A43', fontSize: 14, fontFamily: fonts.semiBold },
  readOnlyNavTitle: { color: '#5A7A91', fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.bold },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F8FA' },
  profileHeader: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 16, shadowColor: '#102A43', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontFamily: fonts.bold },
  identity: { flex: 1 },
  editButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E6F6F3', alignItems: 'center', justifyContent: 'center' },
  editName: { color: '#102A43', fontSize: 19, fontFamily: fonts.bold, borderBottomWidth: 1, borderBottomColor: '#0F766E', paddingVertical: 3 },
  editCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 18, padding: 16, marginBottom: 18 },
  editGroup: { marginBottom: 12 },
  editLabel: { color: '#102A43', fontSize: 12, fontFamily: fonts.bold, marginBottom: 6 },
  editInput: { minHeight: 44, borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#102A43', backgroundColor: '#F5F8FA', fontFamily: fonts.medium },
  geoHint: { fontSize: 11, lineHeight: 15, marginTop: 6, fontFamily: fonts.medium },
  geoPending: { color: '#5A7A91' },
  geoOk: { color: '#0F766E' },
  geoWarn: { color: '#DC2626' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelEditButton: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#D9E2EC', alignItems: 'center', justifyContent: 'center' },
  cancelEditText: { color: '#5A7A91', fontFamily: fonts.bold },
  saveEditButton: { flex: 2, minHeight: 46, borderRadius: 12, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  saveEditText: { color: '#FFFFFF', fontFamily: fonts.bold },
  name: { color: '#102A43', fontSize: 24, fontFamily: fonts.bold },
  role: { color: '#5A7A91', fontSize: 13, marginTop: 4, fontFamily: fonts.medium },
  badge: { color: '#0F766E', fontFamily: fonts.bold, marginTop: 6, fontSize: 12 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 18, padding: 18, marginBottom: 24, shadowColor: '#102A43', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  statValue: { color: '#0F766E', fontSize: 23, fontFamily: fonts.bold, textAlign: 'center' },
  statLabel: { color: '#5A7A91', fontSize: 11, marginTop: 6, fontFamily: fonts.semiBold, textAlign: 'center' },
  sectionTitle: { color: '#102A43', fontSize: 18, fontFamily: fonts.bold, marginTop: 8, marginBottom: 12 },
  portfolioHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 },
  portfolioIcon: { marginLeft: 'auto' },
  kicker: { color: '#0F766E', fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 4 },
  sectionCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 18, padding: 16, marginBottom: 18 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E6F6F3', borderWidth: 1, borderColor: '#B9E8E1', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  skillText: { color: '#075E59', fontSize: 12, fontFamily: fonts.bold, flexShrink: 1 },
  bodyText: { color: '#486581', lineHeight: 22, fontSize: 14, fontFamily: fonts.regular },
  muted: { color: '#5A7A91', fontStyle: 'italic', fontFamily: fonts.regular },
  review: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#102A43', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 7, elevation: 1 },
  reviewRating: { color: '#F59E0B', marginBottom: 8, fontSize: 18, fontFamily: fonts.extraBold },
  helper: { color: '#5A7A91', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  secondaryButton: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: '#D9E2EC', borderStyle: 'dashed' },
  secondaryButtonText: { color: '#0F766E', fontFamily: fonts.bold, fontSize: 14 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  photo: { width: '31%', aspectRatio: 1, borderRadius: 12 },
  button: { backgroundColor: '#0F766E', padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 16, shadowColor: '#0F766E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  buttonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 15 },
  logoutButton: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF5F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
  logoutText: { color: '#DC2626', fontSize: 14, fontFamily: fonts.bold },
});