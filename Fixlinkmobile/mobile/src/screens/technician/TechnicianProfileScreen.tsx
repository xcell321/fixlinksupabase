import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetchTechnicianProfile, fetchTechnicianSchedule, updateTechnicianProfile, uploadPortfolioPhotos } from '../services/api';
import { geocodeAddressStrict } from '../services/locationIq';
import Skeleton from '../../components/Skeleton';
import { colors, fonts, shadows } from '../../theme';
import type { TechnicianScheduleItem, TechnicianScheduleResponse } from '../../types/schedule';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type GeoStatus = 'idle' | 'detecting' | 'found' | 'not-found';

interface TechnicianRef {
  uid: string;
  name?: string;
}

interface Review {
  rating: number;
  comment?: string;
}

interface PortfolioPhoto {
  url: string;
}

interface TechnicianProfile {
  name?: string;
  phone?: string;
  address?: string;
  bio?: string;
  skills?: string[] | string;
  yearsExperience?: number | string;
  verified?: boolean;
  completedJobs?: number;
  averageRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  reviews?: Review[];
  portfolio?: PortfolioPhoto[];
}

interface Draft {
  name: string;
  phone: string;
  address: string;
  bio: string;
  skills: string;
  yearsExperience: string;
}

interface Coords {
  latitude: number;
  longitude: number;
}

interface SelectedPhoto {
  uri: string;
  fileName?: string;
  name?: string;
  mimeType?: string;
  type?: string;
}

interface TechnicianProfileScreenProps {
  technician: TechnicianRef;
  onLogout?: () => void;
  readOnly?: boolean;
  onBack?: () => void;
}

const EMPTY_DRAFT: Draft = { name: '', phone: '', address: '', bio: '', skills: '', yearsExperience: '' };

const draftFromProfile = (result: TechnicianProfile): Draft => ({
  name: result.name ?? '',
  phone: result.phone ?? '',
  address: result.address ?? '',
  bio: result.bio ?? '',
  skills: Array.isArray(result.skills) ? result.skills.join(', ') : String(result.skills ?? ''),
  yearsExperience: String(result.yearsExperience ?? ''),
});

const skillListOf = (profile: TechnicianProfile): string[] => {
  if (Array.isArray(profile.skills)) return profile.skills.map((s) => String(s).trim()).filter(Boolean);
  return String(profile.skills ?? '').split(',').map((skill) => skill.trim()).filter(Boolean);
};

function StarRow({ value, size = 14 }: { value: number; size?: number }): React.JSX.Element {
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const name: IconName = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline';
    return <Ionicons key={i} name={name} size={size} color={colors.gold} />;
  });
  return <View style={styles.starRow}>{stars}</View>;
}

function SectionHeader({ kicker, title, icon }: { kicker: string; title: string; icon: IconName }): React.JSX.Element {
  return (
    <View style={styles.sectionHeadingRow}>
      <View style={styles.sectionHeadingText}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={20} color={colors.teal} />
      </View>
    </View>
  );
}

export default function TechnicianProfileScreen({ technician, onLogout, readOnly = false, onBack }: TechnicianProfileScreenProps): React.JSX.Element {
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [detectedCoords, setDetectedCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [schedule, setSchedule] = useState<TechnicianScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);

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
        setDetectedCoords(coords ?? null);
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

  const loadProfile = async (): Promise<void> => {
    setLoadError(null);
    setLoading(true);
    try {
      const result = await fetchTechnicianProfile(technician.uid) as TechnicianProfile;
      setProfile(result);
      setDraft(draftFromProfile(result));
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error
        || (error as Error).message
        || 'Unable to load this profile.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (): Promise<void> => {
    if (!draft.name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTechnicianProfile(technician.uid, {
        ...draft,
        ...(detectedCoords ? { latitude: detectedCoords.latitude, longitude: detectedCoords.longitude } : {}),
      }) as TechnicianProfile;
      setProfile((current) => ({ ...(current ?? {}), ...updated }));
      setDraft(draftFromProfile(updated));
      setEditing(false);
      Alert.alert('Success', 'Technician profile updated.');
    } catch (error) {
      Alert.alert(
        'Update failed',
        (error as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error
          || (error as Error).message
          || 'Unable to update profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  // Customer-visible upcoming schedule (read-only view only). Safe fields
  // only, served by the backend; silent failure falls back to empty state.
  useEffect(() => {
    if (!readOnly || !technician.uid) return;
    let cancelled = false;
    setScheduleLoading(true);
    fetchTechnicianSchedule(technician.uid)
      .then((data) => {
        if (cancelled) return;
        const res = data as TechnicianScheduleResponse;
        setSchedule(Array.isArray(res?.jobs) ? res.jobs : []);
      })
      .catch(() => { if (!cancelled) setSchedule([]); })
      .finally(() => { if (!cancelled) setScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [readOnly, technician.uid]);

  const choosePortfolioPhotos = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Photo permission needed', 'Allow photo access to add completed repair photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.75,
    });
    if (!result.canceled) {
      setSelectedPhotos(result.assets.map((asset) => ({
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      })));
    }
  };

  const savePortfolio = async (): Promise<void> => {
    if (selectedPhotos.length === 0) return;
    setUploading(true);
    try {
      const result = await uploadPortfolioPhotos(technician.uid, selectedPhotos) as { portfolio: PortfolioPhoto[] };
      setProfile((current) => ({ ...(current ?? {}), portfolio: result.portfolio ?? [] }));
      setSelectedPhotos([]);
      Alert.alert('Portfolio updated', 'Your completed repair photos are now in your portfolio.');
    } catch (error) {
      Alert.alert(
        'Upload failed',
        (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Unable to upload portfolio photos.',
      );
    } finally {
      setUploading(false);
    }
  };

  const formatScheduleDate = (item: TechnicianScheduleItem): string => {
    if (item.scheduledDate) {
      const time = new Date(item.scheduledDate).getTime();
      if (!Number.isNaN(time)) {
        return new Date(item.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    return item.preferredDate || 'Date to confirm';
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.heroCard}>
          <Skeleton style={styles.skeletonAvatar} />
          <View style={styles.heroIdentity}>
            <Skeleton style={{ width: '80%', height: 24, marginBottom: 8 }} />
            <Skeleton style={{ width: '45%', height: 14 }} />
          </View>
        </View>
        <View style={styles.statRow}>
          {[1, 2, 3].map((i) => <Skeleton key={i} style={styles.statSkeleton} />)}
        </View>
        <Skeleton style={{ width: '100%', height: 120, borderRadius: 20, marginBottom: 12 }} />
        <Skeleton style={{ width: '100%', height: 96, borderRadius: 20 }} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerScreen}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="person-circle-outline" size={30} color={colors.teal} />
        </View>
        <Text style={styles.emptyTitle}>Profile unavailable</Text>
        <Text style={styles.emptyText}>{loadError ?? 'This profile could not be loaded.'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          onPress={loadProfile}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.white} />
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const skills = skillListOf(profile);
  const reviews = Array.isArray(profile.reviews) ? profile.reviews : [];
  const portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  const rating = typeof profile.averageRating === 'number' ? profile.averageRating : 0;
  const setField = (key: keyof Draft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      {readOnly && onBack && (
        <View style={styles.readOnlyNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to previous screen"
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.ink} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.readOnlyNavTitle}>TECHNICIAN PROFILE</Text>
        </View>
      )}

      {/* 1. Identity hero */}
      <View style={styles.heroCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile.name || 'T').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.heroIdentity}>
          <Text style={styles.name} numberOfLines={2}>{profile.name || 'Technician'}</Text>
          <View style={styles.heroMetaRow}>
            {profile.verified ? (
              <View style={styles.verifiedPill}>
                <Ionicons name="shield-checkmark" size={12} color={colors.green} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
            <Text style={styles.roleText}>Technician</Text>
          </View>
          {rating > 0 ? (
            <View style={styles.heroRatingRow}>
              <StarRow value={rating} size={13} />
              <Text style={styles.heroRatingText}>{rating.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}</Text>
            </View>
          ) : null}
        </View>
        {!editing && !readOnly && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            accessibilityHint="Open the profile editor"
            hitSlop={8}
            onPress={() => setEditing(true)}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="pencil-outline" size={18} color={colors.teal} />
          </Pressable>
        )}
      </View>

      {/* Contact rows: visible without entering edit mode */}
      {profile.phone || profile.address ? (
        <View style={styles.contactCard}>
          {profile.phone ? (
            <View style={styles.contactRow}>
              <View style={styles.contactIconWrap}>
                <Ionicons name="call-outline" size={15} color={colors.teal} />
              </View>
              <Text style={styles.contactText} selectable>{profile.phone}</Text>
            </View>
          ) : null}
          {profile.address ? (
            <View style={[styles.contactRow, styles.contactRowLast]}>
              <View style={styles.contactIconWrap}>
                <Ionicons name="location-outline" size={15} color={colors.teal} />
              </View>
              <Text style={styles.contactText} numberOfLines={2}>{profile.address}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* 2. Stats HUD */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.completedJobs ?? 0}</Text>
          <Text style={styles.statLabel}>Completed jobs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.averageRating != null ? Number(profile.averageRating).toFixed(1) : '—'}</Text>
          <Text style={styles.statLabel}>Average rating</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.yearsExperience ?? 0}</Text>
          <Text style={styles.statLabel}>Years experience</Text>
        </View>
      </View>

      {/* 3. Editor */}
      {editing && (
        <View style={styles.editCard}>
          <SectionHeader kicker="EDIT PROFILE" title="Update your details" icon="create-outline" />
          <Text style={styles.groupLabel}>Contact</Text>
          <View style={styles.editGroup}>
            <Text style={styles.editLabel}>Full name</Text>
            <TextInput
              style={styles.editInput}
              value={draft.name}
              onChangeText={setField('name')}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Full name"
            />
          </View>
          <View style={styles.editGroup}>
            <Text style={styles.editLabel}>Phone</Text>
            <TextInput
              style={styles.editInput}
              value={draft.phone}
              onChangeText={setField('phone')}
              placeholder="Phone number"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              accessibilityLabel="Phone number"
            />
          </View>
          <View style={styles.editGroup}>
            <Text style={styles.editLabel}>Address</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMulti]}
              value={draft.address}
              onChangeText={setField('address')}
              placeholder="Service address"
              placeholderTextColor={colors.muted}
              multiline
              accessibilityLabel="Service address"
            />
            {geoStatus === 'detecting' && (
              <View style={styles.geoRow}>
                <ActivityIndicator size="small" color={colors.teal} />
                <Text style={[styles.geoHint, styles.geoPending]}>Detecting location…</Text>
              </View>
            )}
            {geoStatus === 'found' && detectedCoords && (
              <View style={styles.geoRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                <Text style={[styles.geoHint, styles.geoOk]}>
                  {detectedCoords.latitude.toFixed(4)} · {detectedCoords.longitude.toFixed(4)}
                </Text>
              </View>
            )}
            {geoStatus === 'not-found' && (
              <View style={styles.geoRow}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
                <Text style={[styles.geoHint, styles.geoWarn]}>Location not recognized — coords stay unchanged</Text>
              </View>
            )}
          </View>
          <Text style={styles.groupLabel}>Professional</Text>
          <View style={styles.editGroup}>
            <Text style={styles.editLabel}>Bio</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMulti]}
              value={draft.bio}
              onChangeText={setField('bio')}
              placeholder="Short professional bio"
              placeholderTextColor={colors.muted}
              multiline
              accessibilityLabel="Professional bio"
            />
          </View>
          <View style={styles.editGroup}>
            <Text style={styles.editLabel}>Skills (comma-separated)</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMulti]}
              value={draft.skills}
              onChangeText={setField('skills')}
              placeholder="Refrigerator, Washing Machine"
              placeholderTextColor={colors.muted}
              multiline
              accessibilityLabel="Skills, comma separated"
            />
          </View>
          <View style={styles.editGroupLast}>
            <Text style={styles.editLabel}>Years of experience</Text>
            <TextInput
              style={styles.editInput}
              value={draft.yearsExperience}
              onChangeText={setField('yearsExperience')}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              accessibilityLabel="Years of experience"
            />
          </View>
          <View style={styles.editActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
              onPress={() => setEditing(false)}
              disabled={saving}
              style={({ pressed }) => [styles.cancelButton, pressed && !saving && styles.pressedSoft]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save profile changes"
              accessibilityState={{ disabled: saving }}
              onPress={saveProfile}
              disabled={saving}
              style={({ pressed }) => [styles.saveButton, pressed && !saving && styles.pressed]}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.saveButtonText}>Save changes</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {/* 4. About */}
      <View style={styles.sectionCard}>
        <SectionHeader kicker="ABOUT" title="Professional bio" icon="person-outline" />
        {profile.bio
          ? <Text style={styles.bodyText}>{profile.bio}</Text>
          : <Text style={styles.muted}>{readOnly ? 'No bio added yet.' : 'Add a short bio so customers know your background.'}</Text>}
      </View>

      {/* 5. Service location */}
      <View style={styles.sectionCard}>
        <SectionHeader kicker="SERVICE LOCATION" title="Where you operate" icon="location-outline" />
        {profile.latitude != null && profile.longitude != null
          ? (
            <View style={styles.coordRow}>
              <Ionicons name="navigate-outline" size={15} color={colors.teal} />
              <Text style={styles.coordText}>
                {Number(profile.latitude).toFixed(4)} · {Number(profile.longitude).toFixed(4)}
              </Text>
            </View>
          )
          : <Text style={styles.muted}>No location detected yet — edit the address above to auto-detect coordinates.</Text>}
      </View>

      {/* 6. Skills */}
      <View style={styles.sectionCard}>
        <SectionHeader kicker="EXPERTISE" title={`Skills and specializations${skills.length > 0 ? ` (${skills.length})` : ''}`} icon="construct-outline" />
        {skills.length > 0
          ? (
            <View style={styles.skillGrid}>
              {skills.map((skill) => (
                <View key={skill} style={styles.skillChip}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.teal} />
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
            </View>
          )
          : <Text style={styles.muted}>No skills listed.</Text>}
      </View>

      {/* 7. Upcoming Schedule (customer read-only view) */}
      {readOnly && (
        <View style={styles.sectionCard}>
          <SectionHeader
            kicker={schedule.length > 0 ? `UPCOMING SCHEDULE (${schedule.length})` : 'UPCOMING SCHEDULE'}
            title="Current and upcoming jobs"
            icon="calendar-outline"
          />
          {scheduleLoading ? (
            <View style={styles.inlineEmpty}>
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={styles.muted}>Loading schedule…</Text>
            </View>
          ) : schedule.length > 0 ? (
            <View>
              {schedule.map((item, i) => (
                <View key={`${item.status}-${i}`} style={[styles.schedItem, i === schedule.length - 1 && styles.schedItemLast]}>
                  <View style={styles.schedLine}>
                    <Ionicons name="calendar-outline" size={14} color={colors.teal} accessible={false} />
                    <Text style={styles.schedDate} numberOfLines={1}>{formatScheduleDate(item)}</Text>
                    <Text style={styles.schedStatus} numberOfLines={1}>{item.status}</Text>
                  </View>
                  <View style={styles.schedLine}>
                    <Ionicons name="time-outline" size={14} color={colors.teal} accessible={false} />
                    <Text style={styles.schedTime} numberOfLines={1}>
                      {item.preferredTime || 'Time to confirm'} • {item.applianceType}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.inlineEmpty}>
              <Ionicons name="calendar-outline" size={20} color={colors.muted} accessible={false} />
              <Text style={styles.muted}>No upcoming scheduled jobs</Text>
            </View>
          )}
        </View>
      )}

      {/* 8. Reviews */}
      <View style={styles.sectionCard}>
        <SectionHeader
          kicker={reviews.length > 0 ? `REVIEWS (${reviews.length})` : 'REVIEWS'}
          title={reviews.length > 0 && rating > 0 ? `${rating.toFixed(1)} average rating` : 'Customer reviews'}
          icon="chatbox-ellipses-outline"
        />
        {reviews.length > 0 ? (
          <View style={styles.reviewList}>
            {reviews.map((r, i) => (
              <View key={`${r.rating}-${i}`} style={[styles.review, i === reviews.length - 1 && styles.reviewLast]}>
                <View style={styles.reviewTopRow}>
                  <StarRow value={Number(r.rating) || 0} />
                  <Text style={styles.reviewRatingText}>{Number(r.rating) || 0}/5</Text>
                </View>
                {r.comment ? <Text style={styles.bodyText}>{r.comment}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.inlineEmpty}>
            <Ionicons name="chatbubbles-outline" size={20} color={colors.muted} />
            <Text style={styles.muted}>No reviews yet — completed jobs will appear here.</Text>
          </View>
        )}
      </View>

      {/* 9. Portfolio */}
      <View style={styles.sectionCard}>
        <SectionHeader
          kicker={portfolio.length > 0 ? `WORK SHOWCASE (${portfolio.length})` : 'WORK SHOWCASE'}
          title="Portfolio"
          icon="images-outline"
        />
        {!readOnly && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={selectedPhotos.length > 0 ? `${selectedPhotos.length} photos selected, tap to change` : 'Choose portfolio photos'}
            accessibilityHint="Open the photo library"
            disabled={uploading}
            onPress={choosePortfolioPhotos}
            style={({ pressed }) => [styles.dashedButton, pressed && !uploading && styles.pressedSoft]}
          >
            <Ionicons name="image-outline" size={18} color={colors.teal} />
            <Text style={styles.dashedButtonText}>
              {selectedPhotos.length > 0 ? `${selectedPhotos.length} photo${selectedPhotos.length === 1 ? '' : 's'} selected` : 'Upload your portfolio'}
            </Text>
          </Pressable>
        )}
        {!readOnly && selectedPhotos.length > 0 && (
          <View>
            <View style={styles.photoGrid}>
              {selectedPhotos.map((photo) => (
                <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.photo} />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload selected portfolio photos"
              accessibilityState={{ disabled: uploading }}
              onPress={savePortfolio}
              disabled={uploading}
              style={({ pressed }) => [styles.primaryButton, styles.uploadButton, pressed && !uploading && styles.pressed]}
            >
              {uploading
                ? <ActivityIndicator size="small" color={colors.white} />
                : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
                    <Text style={styles.primaryButtonText}>Upload portfolio photos</Text>
                  </>
                )}
            </Pressable>
          </View>
        )}
        {portfolio.length > 0 ? (
          <View style={[styles.photoGrid, !readOnly && styles.photoGridSpaced]}>
            {portfolio.map((photo) => (
              <Image key={photo.url} source={{ uri: photo.url }} style={styles.photo} />
            ))}
          </View>
        ) : (
          <View style={styles.inlineEmpty}>
            <Ionicons name="images-outline" size={20} color={colors.muted} />
            <Text style={styles.muted}>No completed-repair photos yet.</Text>
          </View>
        )}
      </View>

      {!readOnly && onLogout && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={onLogout}
          style={({ pressed }) => [styles.logoutButton, pressed && styles.pressedSoft]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 32, backgroundColor: colors.canvas, flexGrow: 1 },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, padding: 32, gap: 10 },

  // Shared anti-slop press states: transform + opacity only (GPU path).
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  readOnlyNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 44, paddingHorizontal: 8, borderRadius: 12, justifyContent: 'center' },
  backButtonText: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold },
  readOnlyNavTitle: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.bold },

  // 1. Hero
  heroCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 12, ...shadows.card },
  avatar: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { color: colors.white, fontSize: 30, fontFamily: fonts.bold },
  heroIdentity: { flex: 1 },
  name: { color: colors.ink, fontSize: 22, fontFamily: fonts.bold, lineHeight: 26 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { color: colors.green, fontSize: 11, fontFamily: fonts.bold },
  roleText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  heroRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  heroRatingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  // Contact rows
  contactCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 12, ...shadows.card },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  contactRowLast: { borderBottomWidth: 0 },
  contactIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  contactText: { flex: 1, color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },

  // 2. Stats HUD
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', ...shadows.card },
  statValue: { color: colors.teal, fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 4, fontFamily: fonts.semiBold, textAlign: 'center' },
  statSkeleton: { flex: 1, height: 76, borderRadius: 20 },

  // Shared section chrome
  sectionCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 16, marginBottom: 12, ...shadows.card },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionHeadingText: { flex: 1 },
  kicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  sectionIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  groupLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 0.4, marginTop: 4, marginBottom: 10 },
  bodyText: { color: colors.ink, lineHeight: 22, fontSize: 14, fontFamily: fonts.regular },
  muted: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, fontStyle: 'italic', flexShrink: 1 },
  inlineEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // 3. Editor
  editCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.teal, borderRadius: 20, padding: 16, marginBottom: 12, ...shadows.cardStrong },
  editGroup: { marginBottom: 12 },
  editGroupLast: { marginBottom: 4 },
  editLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold, marginBottom: 6 },
  editInput: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, backgroundColor: colors.canvas, fontSize: 14, fontFamily: fonts.medium },
  editInputMulti: { minHeight: 72, textAlignVertical: 'top' },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  geoHint: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], flexShrink: 1 },
  geoPending: { color: colors.muted },
  geoOk: { color: colors.tealDark },
  geoWarn: { color: colors.error },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bold },
  saveButton: { flex: 2, minHeight: 48, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  saveButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // Location
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coordText: { color: colors.tealDark, fontSize: 13, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },

  // Skills
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  skillText: { color: colors.tealDark, fontSize: 12, fontFamily: fonts.bold, flexShrink: 1 },

  // Upcoming schedule (customer read-only view)
  schedItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 5 },
  schedItemLast: { borderBottomWidth: 0, paddingBottom: 0 },
  schedLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  schedDate: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'], flexShrink: 1 },
  schedStatus: { color: colors.teal, fontSize: 11, fontFamily: fonts.bold, marginLeft: 'auto', flexShrink: 0 },
  schedTime: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, flexShrink: 1 },

  // Reviews
  reviewList: { gap: 0 },
  review: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  reviewLast: { borderBottomWidth: 0, paddingBottom: 0 },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reviewRatingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },

  // Portfolio
  dashedButton: { backgroundColor: colors.white, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: colors.teal, borderStyle: 'dashed', marginBottom: 4, minHeight: 48 },
  dashedButtonText: { color: colors.teal, fontFamily: fonts.bold, fontSize: 14 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  photoGridSpaced: { marginTop: 12 },
  photo: { width: '31%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.lineSoft },
  uploadButton: { marginTop: 12 },

  // Shared buttons
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.teal, borderRadius: 14, paddingHorizontal: 18, minHeight: 48, ...shadows.card },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },
  logoutButton: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF5F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  logoutText: { color: colors.error, fontSize: 14, fontFamily: fonts.bold },

  // Loading / error
  skeletonAvatar: { width: 72, height: 72, borderRadius: 20, marginRight: 16 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
});
