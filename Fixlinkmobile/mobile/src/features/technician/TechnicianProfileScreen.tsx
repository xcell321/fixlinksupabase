import React, { useEffect, useRef, useState } from 'react';
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
import { fetchTechnicianProfile, fetchTechnicianSchedule, updateTechnicianProfile } from '../../services/api';
import { geocodeAddressStrict } from '../../services/locationIq';
import Skeleton from '../../components/Skeleton';
import ConfirmDialog from '../../components/ConfirmDialog';
import PortfolioPhotoSheet, { type PortfolioPhotoItem } from '../../components/PortfolioPhotoSheet';
import { PhotoLightbox } from '../../components/RequestPhoto';
import { colors, fonts, themedStyles } from '../../theme';
import type { TechnicianScheduleItem, TechnicianScheduleResponse } from '../../types/schedule';
import {
  draftFromProfile,
  formatExperience,
  formatMonthYear,
  formatRating,
  formatReviewDate,
  formatSkillList,
  formatUploadTimestamp,
  getSkillLevel,
  getVerificationBadge,
  EMPTY_DRAFT,
  type TechnicianDraft,
} from './technicianProfileHelpers';

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
  // The reviewer's current profile picture, resolved server-side. Null when the
  // customer has none yet, in which case we fall back to their initials.
  customerImage?: string | null;
  name?: string;
  customer?: string;
}

interface PortfolioPhoto {
  url: string;
  // Stored with the upload: original file name + when it was added.
  name?: string;
  uploadedAt?: string;
  // Described by the technician when they add the photo.
  repairType?: string;
  model?: string;
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
  createdAt?: string | null;
  skillStats?: Array<{ name?: string; completedJobs?: number }>;
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
  // Lets the navigator merge the saved profile into the session, so screens
  // that read it (for example the Jobs header's service area) stay current.
  onProfileUpdate?: (user: unknown) => void;
}

// Portfolio photos are stored under their original file name, so a meaningful
// name becomes the card title while a camera default (IMG_1234, Screenshot...)
// falls back to a plain label instead of leaking the raw file name into the UI.
const PORTFOLIO_FALLBACK_TITLE = 'Completed Repair';
const PHOTO_NAME_NOISE = /^(img|image|photo|picture|screenshot|screen shot|dsc|pxl|untitled|received|download|whatsapp|signal|telegram|copy|edited)\b/i;

function portfolioTitle(name?: string): string {
  const base = String(name || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || base.length > 60 || PHOTO_NAME_NOISE.test(base)) return PORTFOLIO_FALLBACK_TITLE;
  return base
    .split(' ')
    .map((word) => (/^[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function StarRow({ value, size = 14 }: { value: number; size?: number }): React.JSX.Element {
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const name: IconName = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline';
    return <Ionicons key={i} name={name} size={size} color={colors.gold} />;
  });
  return <View style={styles.starRow}>{stars}</View>;
}

export default function TechnicianProfileScreen({ technician, onLogout, readOnly = false, onBack, onProfileUpdate }: TechnicianProfileScreenProps): React.JSX.Element {
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  // Add-photo sheet: one described photo per upload.
  const [addPhotoVisible, setAddPhotoVisible] = useState<boolean>(false);
  // Avatar picked in the edit form, still to be uploaded on save.
  const [avatarAsset, setAvatarAsset] = useState<SelectedPhoto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<TechnicianDraft>(EMPTY_DRAFT);
  const [detectedCoords, setDetectedCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [schedule, setSchedule] = useState<TechnicianScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);
  const [showAllReviews, setShowAllReviews] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState<boolean>(false);
  const [ptab, setPtab] = useState<'info' | 'skills' | 'reviews' | 'portfolio'>('info');
  const profileBusyRef = useRef<boolean>(false);

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

  const loadProfile = async (silent = false): Promise<void> => {
    if (profileBusyRef.current) return;
    profileBusyRef.current = true;
    if (!silent) {
      setLoadError(null);
      setLoading(true);
    }
    try {
      const result = await fetchTechnicianProfile(technician.uid) as TechnicianProfile;
      // Never clobber in-progress edits with a background refresh.
      setProfile(result);
      if (!silent) setDraft(draftFromProfile(result));
    } catch (error) {
      if (!silent) {
        const message = (error as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error
          || (error as Error).message
          || 'Unable to load this profile.';
        setLoadError(message);
      }
    } finally {
      if (!silent) setLoading(false);
      profileBusyRef.current = false;
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
        ...(avatarAsset ? { profileImage: avatarAsset } : {}),
      }) as TechnicianProfile;
      setProfile((current) => ({ ...(current ?? {}), ...updated }));
      setDraft(draftFromProfile(updated));
      setAvatarAsset(null);
      setEditing(false);
      onProfileUpdate?.(updated);
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

  useEffect(() => {
    loadProfile();
    // Silent 15s refresh. New reviews, ratings, and completed counts appear
    // without manual reload. Silent sync never touches the edit draft.
    const interval = setInterval(() => { void loadProfile(true); }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const chooseAvatar = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Photo permission needed', 'Allow photo access to add a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets?.[0];
      if (asset) {
        setAvatarAsset({
          uri: asset.uri,
          fileName: asset.fileName ?? undefined,
          mimeType: asset.mimeType ?? undefined,
        });
      }
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
          onPress={() => loadProfile()}
          style={({ pressed }) => [styles.primaryButtonSolid, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.onAccent} />
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
  // While editing, preview the freshly picked photo before it is uploaded.
  const avatarPreview = avatarAsset?.uri || profile.profileImage || null;
  const verification = getVerificationBadge(profile.verified, profile.createdAt ?? null);
  const verifiedSince = verification.isVerified
    ? (formatMonthYear(verification.verifiedSince ?? null) ?? 'Verified')
    : 'Pending verification';

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
            {avatarPreview ? (
              <Image source={{ uri: avatarPreview }} style={styles.avatarImageLarge} />
            ) : (
              <View style={styles.avatarTechLarge}>
                <Text style={styles.avatarTextLarge}>{(profile.name || 'T').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {verification.isVerified && (
              <View style={styles.avatarVerifiedBadge}>
                <Ionicons name="checkmark" size={10} color={colors.onAccent} />
              </View>
            )}
          </View>
          <Text style={styles.headerNameCentered} numberOfLines={1}>{profile.name || 'Technician'}</Text>
          <Text style={styles.headerSubCentered} numberOfLines={1}>
            Verified Technician · {formatExperience(profile.yearsExperience)} exp.
          </Text>
          <View style={styles.headerStatsRowCentered}>
            <View style={styles.headerStatCentered}>
              <Text style={styles.headerStatValue}>{profile.completedJobs ?? 0}</Text>
              <Text style={styles.headerStatLabel}>Completed</Text>
            </View>
            <View style={styles.headerStatDivider} />
            <View style={styles.headerStatCentered}>
              <Text style={styles.headerStatValue}>{rating > 0 ? rating.toFixed(1) : '0.0'}</Text>
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
              <Ionicons name="pencil-outline" size={12} color={colors.onAccent} />
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

            <View style={styles.avatarEditRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
                onPress={chooseAvatar}
                style={({ pressed }) => [pressed && styles.pressedSoft]}
              >
                {avatarPreview ? (
                  <Image source={{ uri: avatarPreview }} style={styles.avatarEditImage} />
                ) : (
                  <View style={styles.avatarEditPlaceholder}>
                    <Text style={styles.avatarEditInitial}>{(draft.name || profile.name || 'T').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera" size={12} color={colors.onAccent} />
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.avatarEditTitle}>Profile photo</Text>
                <Text style={styles.avatarEditHint}>
                  {avatarAsset ? 'New photo ready. Tap Save Changes to upload it.' : 'Tap the photo to pick one from your gallery.'}
                </Text>
              </View>
            </View>

            <Text style={styles.groupLabel}>Contact Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputContainer}>
                <View style={styles.editInputIconBox}>
                  <Ionicons name="person-outline" size={16} color={colors.tech} />
                </View>
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
                <View style={styles.editInputIconBox}>
                  <Ionicons name="call-outline" size={16} color={colors.tech} />
                </View>
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
                <View style={styles.editInputIconBoxMulti}>
                  <Ionicons name="location-outline" size={16} color={colors.tech} />
                </View>
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
                <View style={styles.editInputIconBoxMulti}>
                  <Ionicons name="document-text-outline" size={16} color={colors.tech} />
                </View>
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
                <View style={styles.editInputIconBox}>
                  <Ionicons name="construct-outline" size={16} color={colors.tech} />
                </View>
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
                <View style={styles.editInputIconBox}>
                  <Ionicons name="time-outline" size={16} color={colors.tech} />
                </View>
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
                  <ActivityIndicator size="small" color={colors.onAccent} />
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
                <Ionicons name="mail-outline" size={16} color={colors.tech} />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Email</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>{profile.email || 'Not provided'}</Text>
              </View>
            </View>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="call-outline" size={16} color={colors.tech} />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Phone</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>{profile.phone || 'Not provided'}</Text>
              </View>
            </View>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="location-outline" size={16} color={colors.tech} />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Service Area</Text>
                <Text style={styles.infoCardValue} numberOfLines={2}>{profile.address || 'Not provided'}</Text>
              </View>
            </View>
            <View style={styles.infoCardWhite}>
              <View style={styles.infoCardIconBox}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.tech} />
              </View>
              <View style={styles.infoCardTextWrap}>
                <Text style={styles.infoCardLabel}>Verified Since</Text>
                <Text style={styles.infoCardValue} numberOfLines={1}>{verifiedSince}</Text>
              </View>
            </View>
          </View>
        )}



        {/* 5. REVIEWS - real reviews only. New technicians show zero. */}
        {ptab === 'reviews' && (
          <View style={{ gap: 12 }}>
            {reviews.length === 0 ? (
              <View style={styles.emptyTabBox}>
                <Text style={styles.emptyTabText}>No reviews yet.</Text>
                <Text style={styles.emptyTabSub}>Ratings appear after completed jobs.</Text>
              </View>
            ) : (
              visibleReviews.map((r: any, i: number) => {
                const customerName = r.customerName || r.name || r.customer || `Customer ${i + 1}`;
                const initials = customerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'CU';
                const date = r.createdAt ? formatReviewDate(r.createdAt) : '';
                const value = Number(r.rating) || 0;
                return (
                  <View key={`${customerName}-${date}-${i}`} style={styles.reviewCardWhite}>
                    <View style={styles.reviewCardHeader}>
                      {r.customerImage ? (
                        <Image source={{ uri: r.customerImage }} style={styles.reviewAvatarImage} />
                      ) : (
                        <View style={styles.reviewAvatarOrange}>
                          <Text style={styles.reviewAvatarText}>{initials}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewName}>{customerName}</Text>
                        <StarRow value={value} size={12} />
                      </View>
                      {date ? <Text style={styles.reviewDate}>{date}</Text> : null}
                    </View>
                    {r.comment ? <Text style={styles.reviewText}>{r.comment}</Text> : null}
                  </View>
                );
              })
            )}
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

        {/* 6. SKILLS - badge plus bar derive from real completed jobs per category. */}
        {ptab === 'skills' && (
          <View style={{ gap: 12 }}>
            {skills.length > 0 ? (
              skills.map((s) => {
                const stat = (profile.skillStats ?? []).find((entry) => entry.name === s);
                const { badge, level } = getSkillLevel(stat?.completedJobs);
                const count = stat?.completedJobs ?? 0;
                return (
                  <View key={s} style={styles.skillProgressCard}>
                    <View style={styles.skillProgressHeader}>
                      <Text style={styles.skillProgressName} numberOfLines={1}>{s}</Text>
                      <View style={[styles.skillBadge, badge === 'Expert' ? styles.skillBadgeExpert : badge === 'Advanced' ? styles.skillBadgeAdvanced : badge === 'Proficient' || badge === 'Beginner' ? styles.skillBadgeProficient : styles.skillBadgeNew]}>
                        <Text style={[styles.skillBadgeText, badge === 'Expert' ? styles.skillBadgeTextExpert : badge === 'Advanced' ? styles.skillBadgeTextAdvanced : badge === 'Proficient' || badge === 'Beginner' ? styles.skillBadgeTextProficient : styles.skillBadgeTextNew]}>{badge}</Text>
                      </View>
                    </View>
                    <View style={styles.skillProgressTrack}>
                      <View style={[styles.skillProgressFill, { width: `${level}%` }]} />
                    </View>
                    <Text style={styles.skillProgressCount}>{count} completed job{count === 1 ? '' : 's'}</Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyTabBox}>
                <Text style={styles.emptyTabText}>No skills listed yet.</Text>
              </View>
            )}
          </View>
        )}



        {/* 8. SCHEDULE - technician view (read-only customer view kept too) */}
        {ptab === 'info' && (
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

        {/* 9. PORTFOLIO - one described photo per card */}
        {ptab === 'portfolio' && (
          <View style={{ gap: 12 }}>
            {!readOnly && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add portfolio photo"
                onPress={() => setAddPhotoVisible(true)}
                style={({ pressed }) => [styles.addPhotoButton, pressed && styles.pressedSoft]}
              >
                <Ionicons name="add" size={18} color={colors.onAccent} />
                <Text style={styles.addPhotoText}>Add photo</Text>
              </Pressable>
            )}
            {portfolio.length > 0 ? (
              <View style={{ gap: 12 }}>
                {portfolio.map((photo) => {
                  // Prefer the repair the technician described; fall back to a
                  // cleaned-up file name only for older uploads that have none.
                  const title = photo.repairType?.trim() || portfolioTitle(photo.name);
                  const uploaded = formatUploadTimestamp(photo.uploadedAt);
                  return (
                    <Pressable
                      key={photo.url}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${title} photo`}
                      onPress={() => setPreviewUrl(photo.url)}
                      style={({ pressed }) => [styles.portfolioCard, pressed && styles.pressedSoft]}
                    >
                      <Image source={{ uri: photo.url }} style={styles.portfolioThumb} resizeMode="cover" />
                      <View style={styles.portfolioBody}>
                        <Text style={styles.portfolioTitle} numberOfLines={2}>{title}</Text>
                        {photo.model?.trim() ? (
                          <Text style={styles.portfolioModel} numberOfLines={1}>{photo.model}</Text>
                        ) : null}
                        <View style={styles.portfolioDateRow}>
                          <Ionicons name="time-outline" size={12} color={colors.muted} />
                          <Text style={styles.portfolioDate} numberOfLines={1}>
                            {uploaded ? `Uploaded ${uploaded}` : 'Upload date unavailable'}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyTabBox}>
                <Text style={styles.emptyTabText}>No portfolio photos yet.</Text>
                <Text style={styles.emptyTabSub}>Add a photo of a completed repair and describe what you fixed.</Text>
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
              accessibilityLabel="Sign out"
              hitSlop={6}
              onPress={() => setLogoutConfirmVisible(true)}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressedSoft]}
            >
              <View style={styles.logoutIcon}>
                <Ionicons name="log-out-outline" size={18} color={colors.dangerBright} />
              </View>
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </Pressable>
          )}
        </View>

        <ConfirmDialog
          visible={logoutConfirmVisible}
          title="Log out?"
          message="Are you sure you want to log out?"
          confirmLabel="Log Out"
          danger
          onCancel={() => setLogoutConfirmVisible(false)}
          onConfirm={() => { setLogoutConfirmVisible(false); onLogout?.(); }}
        />
        <PhotoLightbox visible={!!previewUrl} photoUrl={previewUrl} title="Portfolio photo" subtitle="Completed work showcase" onClose={() => setPreviewUrl(null)} />
        <PortfolioPhotoSheet
          visible={addPhotoVisible}
          technicianUid={technician.uid}
          onClose={() => setAddPhotoVisible(false)}
          onUploaded={(next: PortfolioPhotoItem[]) => setProfile((current) => ({ ...(current ?? {}), portfolio: next as PortfolioPhoto[] }))}
        />
      </View>
    </ScrollView>
  );
}

const styles = themedStyles({
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
elevation: 0 },
  // Prototype dark identity header
  coverCardDark: { backgroundColor: colors.dark, borderRadius: 22, padding: 18, marginBottom: 14 },
  avatarTech: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center' },
  coverNameDark: { color: colors.onAccent, fontSize: 19, fontFamily: fonts.extraBold, letterSpacing: -0.2 },
  coverRatingTextDark: { color: colors.gray300, fontSize: 12, fontFamily: fonts.medium },
  coverRatingTextMutedDark: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  editProfileButtonDark: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tech, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, alignSelf: 'flex-start' },
  editProfileButtonTextDark: { color: colors.onAccent, fontSize: 12, fontFamily: fonts.bold },
  coverDividerDark: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 14 },
  coverContactIconDark: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  coverContactMetaDark: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1 },
  coverContactTextDark: { color: colors.onAccent, fontSize: 13, fontFamily: fonts.semiBold, marginTop: 2 },
  // Prototype tab bar: info / skills / reviews / portfolio
  // -16 / 16 matches the screen's 16px gutter: a -20 bleed used to push the
  // strip 4px past the viewport on phones, clipping the last tab.
  protoTabs: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 16, paddingTop: 8, gap: 8, marginBottom: 16, marginHorizontal: -16, paddingBottom: 0 },
  protoTab: { paddingBottom: 10, paddingHorizontal: 8, alignItems: 'center', minHeight: 44 },
  protoTabText: { color: colors.muted, fontSize: 12, fontFamily: fonts.semiBold },
  protoTabTextActive: { color: colors.tech },
  protoTabUnderline: { height: 2, backgroundColor: colors.tech, alignSelf: 'stretch', marginTop: 6, borderRadius: 1 },
  coverTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: colors.tech, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarImage: { width: 68, height: 68, borderRadius: 20, flexShrink: 0 },
  avatarText: { color: colors.onAccent, fontSize: 28, fontFamily: fonts.bold },
  coverIdentity: { flex: 1, gap: 6, minWidth: 0 },
  coverNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coverName: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold, lineHeight: 24, letterSpacing: -0.3 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  verifiedBadgeText: { color: colors.tech, fontSize: 11, fontFamily: fonts.bold },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningBorder, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
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
  coverCardDarkCentered: { backgroundColor: colors.dark, borderRadius: 22, padding: 20, marginBottom: 14, alignItems: 'center' },
  headerAvatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImageLarge: { width: 72, height: 72, borderRadius: 36 },
  avatarTechLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center' },
  avatarTextLarge: { color: colors.onAccent, fontSize: 28, fontFamily: fonts.extraBold },
  avatarVerifiedBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.tech, borderWidth: 2, borderColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  headerNameCentered: { color: colors.onAccent, fontSize: 18, fontFamily: fonts.extraBold, letterSpacing: -0.2, textAlign: 'center' },
  headerSubCentered: { color: colors.subtle, fontSize: 12, fontFamily: fonts.medium, marginTop: 2, textAlign: 'center' },
  headerStatsRowCentered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 14 },
  headerStatCentered: { alignItems: 'center', minWidth: 60 },
  headerStatValue: { color: colors.onAccent, fontSize: 18, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  headerStatLabel: { color: colors.subtle, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  headerStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },
  editProfileButtonDarkCentered: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.tech, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 },
  infoCardsContainer: { gap: 12, marginBottom: 16 },
  infoCardWhite: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14, elevation: 0 },
  infoCardIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoCardTextWrap: { flex: 1, minWidth: 0 },
  infoCardLabel: { color: colors.gray500, fontSize: 11, fontFamily: fonts.medium },
  infoCardValue: { color: colors.gray900, fontSize: 13, fontFamily: fonts.semiBold, marginTop: 1 },

  // 2. REPUTATION METRICS: 3-Up Telemetry Card
  statsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 18, elevation: 0 },
  statCol: { flex: 1, alignItems: 'center', gap: 3 },
  statIconBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statNum: { color: colors.ink, fontSize: 17, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  statLabel: { color: colors.muted, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.8 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.lineSoft },

  // 3. EDIT PROFILE CARD
  editCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 22, padding: 18, marginBottom: 24, elevation: 0 },
  editHeader: { marginBottom: 16, gap: 3 },
  avatarEditRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  avatarEditImage: { width: 64, height: 64, borderRadius: 32 },
  avatarEditPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center' },
  avatarEditInitial: { color: colors.onAccent, fontSize: 24, fontFamily: fonts.extraBold },
  avatarEditBadge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tech, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  avatarEditTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  avatarEditHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginTop: 2, lineHeight: 15 },
  editKicker: { color: colors.tech, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold },
  editTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold },
  groupLabel: { color: colors.ink, fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 0.8, marginBottom: 12, marginTop: 8, textTransform: 'uppercase' },
  inputGroup: { gap: 6, marginBottom: 14 },
  inputLabel: { color: colors.ink, fontSize: 12, fontFamily: fonts.semiBold },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 52 },
  inputContainerMulti: { minHeight: 80, alignItems: 'flex-start', paddingVertical: 10 },
  inputIcon: { marginRight: 10, flexShrink: 0 },
  inputIconMulti: { marginTop: 4 },
  editInputIconBox: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  editInputIconBoxMulti: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0, marginTop: 2 },
  textInput: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 10 },
  textInputMulti: { minHeight: 60, textAlignVertical: 'top' },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 4 },
  geoHint: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], flexShrink: 1 },
  geoPending: { color: colors.muted },
  geoOk: { color: colors.tech },
  geoWarn: { color: colors.error },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bold },
  saveButton: { flex: 2, minHeight: 48, borderRadius: 14, backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center', elevation: 0 },
  saveButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },

  // Shared Card Surface (About, Skills, Service Area, Schedule)
  cardSurface: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14, marginBottom: 18, elevation: 0 },
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
  skillProgressCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14 },
  skillProgressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  skillProgressName: { color: colors.gray900, fontSize: 13, fontFamily: fonts.semiBold, flex: 1 },
  skillBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  skillBadgeExpert: { backgroundColor: colors.techSoft, borderColor: colors.badgeBlueBorder },
  skillBadgeAdvanced: { backgroundColor: colors.badgeGreenBg, borderColor: colors.badgeGreenBorder },
  skillBadgeProficient: { backgroundColor: colors.badgeAmberBg, borderColor: colors.warningBorder },
  skillBadgeNew: { backgroundColor: colors.cardBorder, borderColor: colors.gray200 },
  skillBadgeText: { fontSize: 10, fontFamily: fonts.bold },
  skillBadgeTextExpert: { color: colors.tech },
  skillBadgeTextAdvanced: { color: colors.green },
  skillBadgeTextProficient: { color: colors.gold },
  skillBadgeTextNew: { color: colors.gray500 },
  skillProgressCount: { color: colors.subtle, fontSize: 11, fontFamily: fonts.regular, marginTop: 6 },
  skillProgressTrack: { height: 6, backgroundColor: colors.cardBorder, borderRadius: 999, overflow: 'hidden' },
  skillProgressFill: { height: 6, backgroundColor: colors.tech, borderRadius: 999 },
  reviewCardWhite: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 14 },
  reviewCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  reviewAvatarOrange: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.customer, alignItems: 'center', justifyContent: 'center' },
  // Same footprint as the initials avatar so the header height never shifts.
  reviewAvatarImage: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardBorder },
  reviewAvatarText: { color: colors.onAccent, fontSize: 11, fontFamily: fonts.bold },
  reviewName: { color: colors.gray900, fontSize: 13, fontFamily: fonts.semiBold },
  reviewDate: { color: colors.subtle, fontSize: 11, fontFamily: fonts.regular, marginLeft: 'auto' },
  reviewText: { color: colors.gray600, fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
  emptyTabBox: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, padding: 18, alignItems: 'center', gap: 4 },
  emptyTabText: { color: colors.gray900, fontSize: 13, fontFamily: fonts.semiBold, textAlign: 'center' },
  emptyTabSub: { color: colors.gray500, fontSize: 12, fontFamily: fonts.regular, textAlign: 'center' },
  // Photo left, copy right: the image fills the card's full height and the
  // left corners come from the card's own rounding + overflow hidden.
  portfolioCard: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 16, overflow: 'hidden', minHeight: 108 },
  portfolioThumb: { width: 112, backgroundColor: colors.cardBorder },
  portfolioBody: { flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  portfolioTitle: { color: colors.gray900, fontSize: 14, fontFamily: fonts.bold, lineHeight: 19 },
  portfolioSubtitle: { color: colors.gray500, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
  addPhotoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tech, borderRadius: 14, minHeight: 48, paddingHorizontal: 16 },
  addPhotoText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },

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
  boundedCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 18, marginBottom: 18, elevation: 0 },
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
  addPhotosButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.tech, elevation: 0, flexShrink: 0 },
  addPhotosText: { color: colors.onAccent, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.1 },
  portfolioModel: { color: colors.ink, fontSize: 12.5, fontFamily: fonts.semiBold, lineHeight: 17 },
  portfolioDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  portfolioDate: { flex: 1, color: colors.muted, fontSize: 11.5, fontFamily: fonts.regular },
  portfolioHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, lineHeight: 15, marginTop: 10, fontStyle: 'italic' },

  // Shared buttons
  primaryButtonSolid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tech, borderRadius: 14, paddingHorizontal: 18, minHeight: 48, elevation: 0 },
  primaryButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },

  // Footer: Help + Logout
  footerBreak: { marginTop: 8, gap: 12, paddingBottom: 12 },
  footerDivider: { height: 1, backgroundColor: colors.lineSoft, marginBottom: 8 },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 16, minHeight: 56, elevation: 0 },
  helpIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0, minHeight: 44, minWidth: 44 },
  helpCopy: { flex: 1, minWidth: 0 },
  helpTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  helpSub: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
  // Matches the customer profile's sign-out row exactly, and the neutral rows
  // elsewhere in this screen: no red fill, no red outline.
  logoutButton: { backgroundColor: colors.white, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.cardBorder },
  logoutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  logoutButtonText: { color: colors.dangerBright, fontSize: 14, fontFamily: fonts.semiBold },

  // Loading / Error
  skeletonAvatar: { width: 68, height: 68, borderRadius: 20 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
});
