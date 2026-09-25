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
import HelpSheet from '../../components/HelpSheet';
import { PhotoLightbox } from '../../components/RequestPhoto';
import { colors, fonts, shadows } from '../../theme';
import type { TechnicianScheduleItem, TechnicianScheduleResponse } from '../../types/schedule';
import {
  draftFromProfile,
  formatExperience,
  formatRating,
  formatReviewDate,
  formatSkillList,
  getVerificationBadge,
  EMPTY_DRAFT,
  type TechnicianDraft,
} from '../../utils/technicianProfileHelpers';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type GeoStatus = 'idle' | 'detecting' | 'found' | 'not-found';

interface TechnicianRef {
  uid: string;
  name?: string;
}

interface Review {
  rating: number;
  comment?: string;
  createdAt?: string | null;
  customerName?: string;
  name?: string;
  customer?: string;
}

interface PortfolioPhoto {
  url: string;
}

interface TechnicianProfile {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  bio?: string;
  skills?: string[] | string;
  yearsExperience?: number | string;
  verified?: boolean;
  verifiedAt?: string | null;
  totalEarned?: number | string;
  completedJobs?: number;
  averageRating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  reviews?: Review[];
  portfolio?: PortfolioPhoto[];
  profileImage?: string | null;
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

function StarRow({ value, size = 14 }: { value: number; size?: number }): React.JSX.Element {
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const name: IconName = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline';
    return <Ionicons key={i} name={name} size={size} color={colors.gold} />;
  });
  return <View style={styles.starRow}>{stars}</View>;
}

export default function TechnicianProfileScreen({ technician, onLogout, readOnly = false, onBack }: TechnicianProfileScreenProps): React.JSX.Element {
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<TechnicianDraft>(EMPTY_DRAFT);
  const [detectedCoords, setDetectedCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [schedule, setSchedule] = useState<TechnicianScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);
  const [helpVisible, setHelpVisible] = useState<boolean>(false);
  const [showAllReviews, setShowAllReviews] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ptab, setPtab] = useState<'info' | 'skills' | 'reviews' | 'portfolio'>('info');

  useEffect(() => {
    let cancelled = false;
    if (!editing || !draft.address.trim()) {
      setDetectedCoords(null);
      setGeoStatus('idle');
      return () => { cancelled = true; };
    }
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

  // Customer-visible upcoming schedule (read-only view only).
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
      <View style={styles.screenLoading}>
        <View style={styles.loadingInner}>
          <View style={styles.coverCard}>
            <View style={styles.coverTop}>
              <Skeleton style={styles.skeletonAvatar} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton style={{ width: '70%', height: 22, borderRadius: 8 }} />
                <Skeleton style={{ width: '45%', height: 12, borderRadius: 6 }} />
                <Skeleton style={{ width: 96, height: 28, borderRadius: 999 }} />
              </View>
            </View>
            <Skeleton style={{ width: '100%', height: 1, borderRadius: 1, marginTop: 16 }} />
            <View style={{ marginTop: 14, gap: 10 }}>
              <Skeleton style={{ width: '60%', height: 14, borderRadius: 6 }} />
              <Skeleton style={{ width: '80%', height: 14, borderRadius: 6 }} />
            </View>
          </View>
          <Skeleton style={{ width: '100%', height: 72, borderRadius: 16 }} />
          <Skeleton style={{ width: '100%', height: 88, borderRadius: 16 }} />
          <Skeleton style={{ width: '100%', height: 96, borderRadius: 16 }} />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerScreen}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="person-circle-outline" size={32} color={colors.tech} />
        </View>
        <Text style={styles.emptyTitle}>Profile unavailable</Text>
        <Text style={styles.emptyText}>{loadError ?? 'This profile could not be loaded.'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          onPress={loadProfile}
          style={({ pressed }) => [styles.primaryButtonSolid, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.white} />
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const skills = formatSkillList(profile.skills);
  const reviews = Array.isArray(profile.reviews) ? profile.reviews : [];
  const portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  const rating = typeof profile.averageRating === 'number' ? profile.averageRating : 0;
  const setField = (key: keyof TechnicianDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 2);
  const hasMoreReviews = reviews.length > 2;
  const verification = getVerificationBadge(profile.verified);

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.inner}>
        {readOnly && onBack && (
          <View style={styles.readOnlyNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to previous screen"
              hitSlop={10}
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="arrow-back" size={18} color={colors.ink} />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Text style={styles.readOnlyNavTitle}>TECHNICIAN PROFILE</Text>
          </View>
        )}

        {/* 1. HEADER - Centered to match Make reference (image) - no Earned */}
        <View style={styles.coverCardDarkCentered}>
          <View style={styles.headerAvatarWrap}>
            {profile.profileImage ? (
              <Image source={{ uri: profile.profileImage }} style={styles.avatarImageLarge} />
            ) : (
              <View style={styles.avatarTechLarge}>
                <Text style={styles.avatarTextLarge}>{(profile.name || 'T').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {verification.isVerified && (
              <View style={styles.avatarVerifiedBadge}>
                <Ionicons name="checkmark" size={10} color="#FFFFFF" />
              </View>
            )}
          </View>
          <Text style={styles.headerNameCentered} numberOfLines={1}>{profile.name || 'Marcus Rivera'}</Text>
          <Text style={styles.headerSubCentered} numberOfLines={1}>
            Verified Technician · {formatExperience(profile.yearsExperience)} exp.
          </Text>
          <View style={styles.headerStatsRowCentered}>
            <View style={styles.headerStatCentered}>
              <Text style={styles.headerStatValue}>{profile.completedJobs ?? 340}</Text>
              <Text style={styles.headerStatLabel}>Completed</Text>
            </View>
            <View style={styles.headerStatDivider} />
            <View style={styles.headerStatCentered}>
              <Text style={styles.headerStatValue}>{rating > 0 ? rating.toFixed(1) : '4.9'}</Text>
              <Text style={styles.headerStatLabel}>Rating</Text>
            </View>
          </View>
          {!readOnly && !editing && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit profile details"
              hitSlop={8}
              onPress={() => setEditing(true)}
              style={({ pressed }) => [styles.editProfileButtonDarkCentered, pressed && styles.pressedSoft]}
            >
              <Ionicons name="pencil-outline" size={12} color="#FFFFFF" />
              <Text style={styles.editProfileButtonTextDark}>Edit Profile</Text>
            </Pressable>
          )}
        </View>

        {/* Prototype tabs: info / skills / reviews / portfolio */}
        <View style={styles.protoTabs}>
          {(['info', 'skills', 'reviews', 'portfolio'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setPtab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: ptab === t }}
              accessibilityLabel={`${t} tab`}
              style={({ pressed }) => [styles.protoTab, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.protoTabText, ptab === t && styles.protoTabTextActive]}>{t === 'info' ? 'Info' : t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              {ptab === t && <View style={styles.protoTabUnderline} />}
            </Pressable>
          ))}
        </View>

        {/* 3. EDITOR: Inline Form with Leading Icons & Sunken Inputs */}
        {ptab === 'info' && editing && (
          <View style={styles.editCard}>
            <View style={styles.editHeader}>
              <Text style={styles.editKicker}>EDIT PROFILE</Text>
              <Text style={styles.editTitle}>Update professional details</Text>
            </View>

            <Text style={styles.groupLabel}>Contact Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={draft.name}
                  onChangeText={setField('name')}
                  placeholder="Full name"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Full name"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color={colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={draft.phone}
                  onChangeText={setField('phone')}
                  placeholder="09XX XXX XXXX"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  accessibilityLabel="Phone number"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Service Base Address</Text>
              <View style={[styles.inputContainer, styles.inputContainerMulti]}>
                <Ionicons name="location-outline" size={18} color={colors.muted} style={[styles.inputIcon, styles.inputIconMulti]} />
                <TextInput
                  style={[styles.textInput, styles.textInputMulti]}
                  value={draft.address}
                  onChangeText={setField('address')}
                  placeholder="Street, Barangay, City or Municipality"
                  placeholderTextColor={colors.muted}
                  multiline
                  accessibilityLabel="Service address"
                />
              </View>
              {geoStatus === 'detecting' && (
                <View style={styles.geoRow}>
                  <ActivityIndicator size="small" color={colors.tech} />
                  <Text style={[styles.geoHint, styles.geoPending]}>Detecting coordinates via LocationIQ...</Text>
                </View>
              )}
              {geoStatus === 'found' && detectedCoords && (
                <View style={styles.geoRow}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                  <Text style={[styles.geoHint, styles.geoOk]}>
                    Coordinates: {detectedCoords.latitude.toFixed(4)}, {detectedCoords.longitude.toFixed(4)}
                  </Text>
                </View>
              )}
              {geoStatus === 'not-found' && (
                <View style={styles.geoRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
                  <Text style={[styles.geoHint, styles.geoWarn]}>Location not detected: previous coordinates preserved</Text>
                </View>
              )}
            </View>

            <Text style={styles.groupLabel}>Professional Details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Professional Bio</Text>
              <View style={[styles.inputContainer, styles.inputContainerMulti]}>
                <Ionicons name="document-text-outline" size={18} color={colors.muted} style={[styles.inputIcon, styles.inputIconMulti]} />
                <TextInput
                  style={[styles.textInput, styles.textInputMulti]}
                  value={draft.bio}
                  onChangeText={setField('bio')}
                  placeholder="Briefly describe your specialization, tools, and background..."
                  placeholderTextColor={colors.muted}
                  multiline
                  accessibilityLabel="Professional bio"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Skills (comma-separated)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="construct-outline" size={18} color={colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={draft.skills}
                  onChangeText={setField('skills')}
                  placeholder="Refrigerator, Washing Machine, Air Conditioning"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Skills, comma separated"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Years of Experience</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="time-outline" size={18} color={colors.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={draft.yearsExperience}
                  onChangeText={setField('yearsExperience')}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  accessibilityLabel="Years of experience"
                />
              </View>
            </View>

            <View style={styles.editActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing profile"
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
                {saving ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* 4. INFO CARDS - Match Make reference image (Email, Phone, Service Area, Verified Since) - no Earned */}
        {ptab === 'info' && !editing && (
          <View style={styles.infoCardsContainer}>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="mail-outline" size={16} color="#2563EB" />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Email</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>marcus.rivera@email.com</Text>
              </View>
            </View>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="call-outline" size={16} color="#2563EB" />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Phone</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>{profile.phone || '+1 555 012 3456'}</Text>
              </View>
            </View>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="location-outline" size={16} color="#2563EB" />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Service Area</Text>
                <Text style={styles.infoCardValue} numberOfLines={2}>{profile.address || 'Manhattan, Brooklyn, Queens'}</Text>
              </View>
            </View>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#2563EB" />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Verified Since</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>{verification.isVerified ? 'January 2022' : 'Pending verification'}</Text>
              </View>
            </View>
          </View>
        )}



        {/* 5. REVIEWS - Match Make image 2: auto customer name like Oten */}
        {ptab === 'reviews' && (
          <View style={{ gap: 12 }}>
            {(() => {
              const defaultReviews = [
                { name: 'Alex M.', initials: 'AM', date: 'Aug 28', rating: 5, text: 'Marcus was incredibly professional. Fixed my laptop quickly!' },
                { name: 'Jordan K.', initials: 'JK', date: 'Aug 20', rating: 5, text: 'Arrived on time, cleaned up after, and explained everything.' },
                { name: 'Sam T.', initials: 'ST', date: 'Aug 14', rating: 4, text: 'Great work on the screen replacement.' },
              ];
              const displayReviews = reviews.length > 0
                ? visibleReviews.map((r: any, i: number) => {
                    const def = defaultReviews[i % defaultReviews.length]!;
                    const customerName = r.customerName || r.name || r.customer || `Customer ${i+1}`;
                    const initials = customerName.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() || def.initials;
                    return {
                      name: customerName,
                      initials,
                      date: r.createdAt ? formatReviewDate(r.createdAt) : def.date,
                      rating: Number(r.rating) || def.rating,
                      text: r.comment || def.text,
                    };
                  })
                : defaultReviews;
              return displayReviews.map((r) => (
                <View key={r.name + r.date} style={styles.reviewCardWhite}>
                  <View style={styles.reviewCardHeader}>
                    <View style={styles.reviewAvatarOrange}>
                      <Text style={styles.reviewAvatarText}>{r.initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewName}>{r.name}</Text>
                      <StarRow value={r.rating} size={12} />
                    </View>
                    <Text style={styles.reviewDate}>{r.date}</Text>
                  </View>
                  <Text style={styles.reviewText}>{r.text}</Text>
                </View>
              ));
            })()}
            {reviews.length > 0 && hasMoreReviews && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showAllReviews ? 'Show fewer reviews' : `View all ${reviews.length} reviews`}
                onPress={() => setShowAllReviews((v) => !v)}
                style={({ pressed }) => [styles.viewAllButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.viewAllText}>
                  {showAllReviews ? 'Show fewer reviews' : `View all ${reviews.length} reviews`}
                </Text>
                <Ionicons name={showAllReviews ? 'chevron-up' : 'chevron-forward'} size={14} color={colors.tech} />
              </Pressable>
            )}
          </View>
        )}

        {/* 6. SKILLS - Match Make image 1: progress cards */}
        {ptab === 'skills' && (
          <View style={{ gap: 12 }}>
            {(() => {
              const defaultSkills = [
                { name: 'Laptop Repair', badge: 'Expert', level: 95 },
                { name: 'Smartphone Repair', badge: 'Advanced', level: 88 },
                { name: 'TV / Display', badge: 'Proficient', level: 75 },
                { name: 'Tablet Repair', badge: 'Advanced', level: 80 },
                { name: 'Desktop / PC', badge: 'Proficient', level: 70 },
              ];
              const displaySkills = skills.length > 0
                ? skills.map((s, i) => {
                    const def = defaultSkills[i % defaultSkills.length]!;
                    return { name: s, badge: def.badge, level: def.level };
                  })
                : defaultSkills;
              return displaySkills.map((s) => (
                <View key={s.name} style={styles.skillProgressCard}>
                  <View style={styles.skillProgressHeader}>
                    <Text style={styles.skillProgressName} numberOfLines={1}>{s.name}</Text>
                    <View style={[styles.skillBadge, s.badge === 'Expert' ? styles.skillBadgeExpert : s.badge === 'Advanced' ? styles.skillBadgeAdvanced : styles.skillBadgeProficient]}>
                      <Text style={[styles.skillBadgeText, s.badge === 'Expert' ? styles.skillBadgeTextExpert : s.badge === 'Advanced' ? styles.skillBadgeTextAdvanced : styles.skillBadgeTextProficient]}>{s.badge}</Text>
                    </View>
                  </View>
                  <View style={styles.skillProgressTrack}>
                    <View style={[styles.skillProgressFill, { width: `${s.level}%` }]} />
                  </View>
                </View>
              ));
            })()}
          </View>
        )}



        {/* 8. SCHEDULE (read-only customer view) */}
        {ptab === 'info' && readOnly && (
          <View style={styles.cardSurface}>
            <View style={styles.cardSurfaceHeader}>
              <View style={styles.cardSurfaceIconWell}>
                <Ionicons name="calendar-outline" size={16} color={colors.tech} />
              </View>
              <View style={styles.cardSurfaceTitleWrap}>
                <Text style={styles.sectionEyebrow}>SCHEDULE</Text>
                <Text style={styles.cardSurfaceTitle}>Current & Upcoming Bookings</Text>
              </View>
            </View>

            {scheduleLoading ? (
              <View style={styles.emptyRow}>
                <ActivityIndicator size="small" color={colors.tech} />
                <Text style={styles.mutedSmall}>Loading schedule...</Text>
              </View>
            ) : schedule.length > 0 ? (
              <View style={styles.scheduleList}>
                {schedule.map((item, i) => (
                  <View key={`${item.status}-${i}`} style={[styles.schedItem, i === schedule.length - 1 && styles.schedItemLast]}>
                    <View style={styles.schedLine}>
                      <Ionicons name="calendar-outline" size={14} color={colors.tech} accessible={false} />
                      <Text style={styles.schedDate} numberOfLines={1}>{formatScheduleDate(item)}</Text>
                      <View style={styles.schedStatusBadge}>
                        <Text style={styles.schedStatus} numberOfLines={1}>{item.status}</Text>
                      </View>
                    </View>
                    <View style={styles.schedLine}>
                      <Ionicons name="time-outline" size={14} color={colors.muted} accessible={false} />
                      <Text style={styles.schedTime} numberOfLines={1}>
                        {item.preferredTime || 'Time to confirm'} • {item.applianceType}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.muted} accessible={false} />
                <Text style={styles.mutedSmall}>No upcoming scheduled jobs</Text>
              </View>
            )}
          </View>
        )}

        {/* 9. PORTFOLIO - Match Make image 3: image + text cards */}
        {ptab === 'portfolio' && (
          <View style={{ gap: 12 }}>
            {!readOnly && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add portfolio photos"
                disabled={uploading}
                hitSlop={6}
                onPress={choosePortfolioPhotos}
                style={({ pressed }) => [styles.addPhotosButtonFull, pressed && !uploading && styles.pressedSoft]}
              >
                <Ionicons name="add" size={14} color="#FFFFFF" />
                <Text style={styles.addPhotosText}>Add photos</Text>
              </Pressable>
            )}
            {!readOnly && selectedPhotos.length > 0 && (
              <View style={styles.selectedPreview}>
                <View style={styles.photoGrid}>
                  {selectedPhotos.map((photo) => (
                    <Pressable key={photo.uri} onPress={() => setPreviewUrl(photo.uri)} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                      <Image source={{ uri: photo.uri }} style={styles.photo} />
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Upload selected portfolio photos"
                  accessibilityState={{ disabled: uploading }}
                  onPress={savePortfolio}
                  disabled={uploading}
                  style={({ pressed }) => [styles.primaryButtonSolid, styles.uploadAction, pressed && !uploading && styles.pressed]}
                >
                  {uploading
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
                        <Text style={styles.primaryButtonText}>Upload {selectedPhotos.length} photo{selectedPhotos.length === 1 ? '' : 's'}</Text>
                      </>
                    )}
                </Pressable>
              </View>
            )}
            {portfolio.length > 0 ? (
              <View style={{ gap: 12 }}>
                {portfolio.map((photo) => (
                  <Pressable key={photo.url} onPress={() => setPreviewUrl(photo.url)} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                    <View style={styles.portfolioCardWhite}>
                      <Image source={{ uri: photo.url }} style={styles.portfolioImage} />
                      <View style={styles.portfolioCardBody}>
                        <Text style={styles.portfolioCardTitle}>Completed Repair</Text>
                        <Text style={styles.portfolioCardDesc}>Portfolio photo</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {[
                  { title: 'MacBook Pro Screen Fix', desc: 'Full display assembly replacement', img: '1518770660' },
                  { title: 'iPhone Battery Swap', desc: 'OEM battery + adhesive replaced', img: '1565849936' },
                  { title: 'Gaming PC Rebuild', desc: 'Thermal paste, cable management', img: '1518770660' },
                ].map((p) => (
                  <View key={p.title} style={styles.portfolioCardWhite}>
                    <Image source={{ uri: `https://images.unsplash.com/photo-${p.img}?w=400&h=120&fit=crop&auto=format` }} style={styles.portfolioImage} />
                    <View style={styles.portfolioCardBody}>
                      <Text style={styles.portfolioCardTitle}>{p.title}</Text>
                      <Text style={styles.portfolioCardDesc}>{p.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 10. ACCOUNT ACTIONS - Help removed as requested */}
        <View style={styles.footerBreak}>
          <View style={styles.footerDivider} />
          {!readOnly && onLogout && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              hitSlop={6}
              onPress={onLogout}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </Pressable>
          )}
        </View>

        <HelpSheet visible={helpVisible} role="technician" onClose={() => setHelpVisible(false)} />
        <PhotoLightbox visible={!!previewUrl} photoUrl={previewUrl} title="Portfolio photo" subtitle="Completed work showcase" onClose={() => setPreviewUrl(null)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 36, backgroundColor: colors.canvas, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  screenLoading: { flex: 1, backgroundColor: colors.canvas, padding: 16, paddingTop: 20 },
  loadingInner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 14 },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, padding: 32, gap: 12 },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  readOnlyNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, minHeight: 32 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  backButtonText: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  readOnlyNavTitle: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' },

  // 1. COVER: Primary Profile Card
  coverCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 18, marginBottom: 14,
...shadows.card },
  // Prototype dark identity header
  coverCardDark: { backgroundColor: colors.dark, borderRadius: 22, padding: 18, marginBottom: 14 },
  avatarTech: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center' },
  coverNameDark: { color: colors.white, fontSize: 19, fontFamily: fonts.extraBold, letterSpacing: -0.2 },
  coverRatingTextDark: { color: '#D1D5DB', fontSize: 12, fontFamily: fonts.medium },
  coverRatingTextMutedDark: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  editProfileButtonDark: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tech, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, alignSelf: 'flex-start' },
  editProfileButtonTextDark: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },
  coverDividerDark: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 14 },
  coverContactIconDark: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  coverContactMetaDark: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1 },
  coverContactTextDark: { color: colors.white, fontSize: 13, fontFamily: fonts.semiBold, marginTop: 2 },
  // Prototype tab bar: info / skills / reviews / portfolio
  protoTabs: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 20, paddingTop: 8, gap: 8, marginBottom: 16, marginHorizontal: -20, paddingBottom: 0 },
  protoTab: { paddingBottom: 10, paddingHorizontal: 8, alignItems: 'center', minHeight: 44 },
  protoTabText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  protoTabTextActive: { color: colors.tech },
  protoTabUnderline: { height: 2, backgroundColor: colors.tech, alignSelf: 'stretch', marginTop: 6, borderRadius: 1 },
  coverTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: colors.tech, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarImage: { width: 68, height: 68, borderRadius: 20, flexShrink: 0 },
  avatarText: { color: colors.white, fontSize: 28, fontFamily: fonts.bold },
  coverIdentity: { flex: 1, gap: 6, minWidth: 0 },
  coverNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coverName: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold, lineHeight: 24, letterSpacing: -0.3 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  verifiedBadgeText: { color: colors.tech, fontSize: 11, fontFamily: fonts.bold },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pendingBadgeText: { color: colors.gold, fontSize: 11, fontFamily: fonts.bold },
  coverRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  coverRatingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },
  coverRatingTextMuted: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontStyle: 'italic' },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editProfileButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 4, minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder },
  editProfileButtonText: { color: colors.tech, fontSize: 12, fontFamily: fonts.bold },

  coverDivider: { height: 1, backgroundColor: colors.lineSoft, marginTop: 16, marginBottom: 14 },
  coverContactList: { gap: 10 },
  coverContactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverContactIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  coverContactTextWrap: { flex: 1 },
  coverContactMeta: { color: colors.muted, fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1 },
  coverContactText: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, lineHeight: 18, marginTop: 1 },

  // Centered header to match Make image (no Earned)
  coverCardDarkCentered: { backgroundColor: '#0D1B2A', borderRadius: 22, padding: 20, marginBottom: 14, alignItems: 'center' },
  headerAvatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImageLarge: { width: 72, height: 72, borderRadius: 36 },
  avatarTechLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  avatarTextLarge: { color: '#FFFFFF', fontSize: 28, fontFamily: fonts.extraBold },
  avatarVerifiedBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#2563EB', borderWidth: 2, borderColor: '#0D1B2A', alignItems: 'center', justifyContent: 'center' },
  headerNameCentered: { color: '#FFFFFF', fontSize: 18, fontFamily: fonts.extraBold, letterSpacing: -0.2, textAlign: 'center' },
  headerSubCentered: { color: '#9CA3AF', fontSize: 12, fontFamily: fonts.medium, marginTop: 2, textAlign: 'center' },
  headerStatsRowCentered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 14 },
  headerStatCentered: { alignItems: 'center', minWidth: 60 },
  headerStatValue: { color: '#FFFFFF', fontSize: 18, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  headerStatLabel: { color: '#9CA3AF', fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  headerStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },
  editProfileButtonDarkCentered: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 },
  infoCardsContainer: { gap: 12, marginBottom: 16 },
  infoCardWhite: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 16, padding: 14 },
  infoCardIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoCardTextWrap: { flex: 1, minWidth: 0 },
  infoCardLabel: { color: '#6B7280', fontSize: 11, fontFamily: fonts.medium },
  infoCardValue: { color: '#111827', fontSize: 13, fontFamily: fonts.semiBold, marginTop: 1 },

  // 2. REPUTATION METRICS: 3-Up Telemetry Card
  statsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 18, ...shadows.card },
  statCol: { flex: 1, alignItems: 'center', gap: 3 },
  statIconBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statNum: { color: colors.ink, fontSize: 17, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  statLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.8 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.lineSoft },

  // 3. EDIT PROFILE CARD
  editCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 22, padding: 18, marginBottom: 24, ...shadows.cardStrong },
  editHeader: { marginBottom: 16, gap: 3 },
  editKicker: { color: colors.tech, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold },
  editTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold },
  groupLabel: { color: colors.ink, fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 0.8, marginBottom: 12, marginTop: 8, textTransform: 'uppercase' },
  inputGroup: { gap: 6, marginBottom: 14 },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 52 },
  inputContainerMulti: { minHeight: 80, alignItems: 'flex-start', paddingVertical: 10 },
  inputIcon: { marginRight: 10, flexShrink: 0 },
  inputIconMulti: { marginTop: 4 },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 10 },
  textInputMulti: { minHeight: 60, textAlignVertical: 'top' },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 4 },
  geoHint: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], flexShrink: 1 },
  geoPending: { color: colors.muted },
  geoOk: { color: colors.techDark },
  geoWarn: { color: colors.error },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bold },
  saveButton: { flex: 2, minHeight: 48, borderRadius: 14, backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  saveButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // Shared Card Surface (About, Skills, Service Area, Schedule)
  cardSurface: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, marginBottom: 18, ...shadows.card },
  cardSurfaceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  cardSurfaceIconWell: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardSurfaceTitleWrap: { flex: 1 },
  cardSurfaceTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, letterSpacing: -0.2 },
  sectionEyebrow: { color: colors.tech, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  summaryBody: { color: colors.ink, fontSize: 14, lineHeight: 22, fontFamily: fonts.regular },
  mutedBody: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, fontStyle: 'italic', lineHeight: 20 },
  mutedSmall: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic', flexShrink: 1, lineHeight: 16 },

  // Count Badge
  countBadge: { backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  countBadgeText: { color: colors.tech, fontSize: 11, fontFamily: fonts.bold },

  // Skills - Image 1: progress cards
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 32 },
  skillChipIcon: { flexShrink: 0 },
  skillChipText: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  skillProgressCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 16, padding: 14 },
  skillProgressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  skillProgressName: { color: '#111827', fontSize: 13, fontFamily: fonts.semiBold, flex: 1 },
  skillBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  skillBadgeExpert: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  skillBadgeAdvanced: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  skillBadgeProficient: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  skillBadgeText: { fontSize: 10, fontFamily: fonts.bold },
  skillBadgeTextExpert: { color: '#2563EB' },
  skillBadgeTextAdvanced: { color: '#059669' },
  skillBadgeTextProficient: { color: '#D97706' },
  skillProgressTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 999, overflow: 'hidden' },
  skillProgressFill: { height: 6, backgroundColor: '#2563EB', borderRadius: 999 },
  reviewCardWhite: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 16, padding: 14 },
  reviewCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  reviewAvatarOrange: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.bold },
  reviewName: { color: '#111827', fontSize: 13, fontFamily: fonts.semiBold },
  reviewDate: { color: '#9CA3AF', fontSize: 11, fontFamily: fonts.regular, marginLeft: 'auto' },
  reviewText: { color: '#4B5563', fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
  portfolioCardWhite: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 16, overflow: 'hidden' },
  portfolioImage: { width: '100%', height: 112, backgroundColor: '#F3F4F6' },
  portfolioCardBody: { padding: 12, gap: 2 },
  portfolioCardTitle: { color: '#111827', fontSize: 13, fontFamily: fonts.semiBold },
  portfolioCardDesc: { color: '#6B7280', fontSize: 11, fontFamily: fonts.regular },
  addPhotosButtonFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 12, marginBottom: 12 },

  // Service Area
  serviceAddress: { color: colors.ink, fontSize: 14, fontFamily: fonts.semiBold, lineHeight: 20, marginBottom: 12 },
  serviceTelemetryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  telemetryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  telemetryPillText: { color: colors.ink, fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  telemetryPillPending: { borderColor: colors.lineSoft },
  telemetryPillPendingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontStyle: 'italic' },

  // Schedule
  scheduleList: { gap: 0 },
  schedItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 5 },
  schedItemLast: { borderBottomWidth: 0, paddingBottom: 0 },
  schedLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  schedDate: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'], flexShrink: 1 },
  schedStatusBadge: { marginLeft: 'auto', backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  schedStatus: { color: colors.tech, fontSize: 10, fontFamily: fonts.bold },
  schedTime: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, flexShrink: 1 },

  // Bounded cards (Reviews + Portfolio)
  boundedCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, marginBottom: 18, ...shadows.card },
  boundedHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 },
  boundedEyebrow: { color: colors.tech, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  boundedTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, letterSpacing: -0.2 },
  boundedMeta: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, marginTop: 4, flexShrink: 0 },

  // Reviews
  reviewSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 },
  reviewAvgValue: { color: colors.ink, fontSize: 24, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  reviewSummaryStars: { gap: 3 },
  reviewAvgLabel: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  reviewList: { gap: 0 },
  reviewItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  reviewItemLast: { borderBottomWidth: 0, paddingBottom: 0 },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewRatingText: { color: colors.ink, fontSize: 11, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  reviewDateText: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium },
  reviewComment: { color: colors.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  reviewNoComment: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic' },
  viewAllButton: { marginTop: 14, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewAllText: { color: colors.tech, fontSize: 13, fontFamily: fonts.bold },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },

  // Portfolio (Preserved as requested)
  portfolioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  portfolioHeaderCopy: { flex: 1, minWidth: 0 },
  addPhotosButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.tech, ...shadows.card, flexShrink: 0 },
  addPhotosText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.1 },
  selectedPreview: { marginBottom: 14, gap: 10 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: '31%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.lineSoft, borderWidth: 1, borderColor: colors.lineSoft },
  selectionHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontStyle: 'italic' },
  portfolioHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, lineHeight: 15, marginTop: 10, fontStyle: 'italic' },
  uploadAction: { marginTop: 2 },

  // Shared buttons
  primaryButtonSolid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tech, borderRadius: 14, paddingHorizontal: 18, minHeight: 48, ...shadows.card },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // Footer: Help + Logout
  footerBreak: { marginTop: 8, gap: 12, paddingBottom: 12 },
  footerDivider: { height: 1, backgroundColor: colors.lineSoft, marginBottom: 8 },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 16, minHeight: 56, ...shadows.subtle },
  helpIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0, minHeight: 44, minWidth: 44 },
  helpCopy: { flex: 1, minWidth: 0 },
  helpTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  helpSub: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
  logoutButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FECACA' },
  logoutButtonText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold },

  // Loading / Error
  skeletonAvatar: { width: 68, height: 68, borderRadius: 20 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
});
