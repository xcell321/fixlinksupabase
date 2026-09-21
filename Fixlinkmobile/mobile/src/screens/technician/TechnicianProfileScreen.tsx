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
  const [helpVisible, setHelpVisible] = useState<boolean>(false);
  const [showAllReviews, setShowAllReviews] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
          <Skeleton style={{ width: '100%', height: 18, borderRadius: 8 }} />
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
          <Ionicons name="person-circle-outline" size={30} color={colors.teal} />
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

  const skills = skillListOf(profile);
  const reviews = Array.isArray(profile.reviews) ? profile.reviews : [];
  const portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  const rating = typeof profile.averageRating === 'number' ? profile.averageRating : 0;
  const setField = (key: keyof Draft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 2);
  const hasMoreReviews = reviews.length > 2;

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

        {/* 1. IDENTITY + CONTACT — ONE primary white cover */}
        <View style={styles.coverCard}>
          <View style={styles.coverTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(profile.name || 'T').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.coverIdentity}>
              <Text style={styles.coverName} numberOfLines={2}>{profile.name || 'Technician'}</Text>
              <View style={styles.coverVerifiedRow}>
                {profile.verified ? (
                  <View style={styles.verifiedInline}>
                    <Ionicons name="shield-checkmark" size={13} color={colors.teal} />
                    <Text style={styles.verifiedInlineText}>Verified Technician</Text>
                  </View>
                ) : (
                  <Text style={styles.roleTextMuted}>Technician</Text>
                )}
              </View>
              <View style={styles.coverRatingRow}>
                {rating > 0 ? (
                  <>
                    <StarRow value={rating} size={13} />
                    <Text style={styles.coverRatingText}>{rating.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}</Text>
                  </>
                ) : (
                  <Text style={styles.coverRatingTextMuted}>No reviews yet</Text>
                )}
              </View>
              {!readOnly && !editing && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                  accessibilityHint="Open the profile editor"
                  hitSlop={8}
                  onPress={() => setEditing(true)}
                  style={({ pressed }) => [styles.editProfilePill, pressed && styles.pressedSoft]}
                >
                  <Ionicons name="pencil-outline" size={13} color={colors.teal} />
                  <Text style={styles.editProfilePillText}>Edit Profile</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Contact rows inside same cover */}
          {(profile.phone || profile.address) && (
            <>
              <View style={styles.coverDivider} />
              <View style={styles.coverContactList}>
                {profile.phone ? (
                  <View style={styles.coverContactRow}>
                    <View style={styles.coverContactIcon}>
                      <Ionicons name="call-outline" size={13} color={colors.teal} />
                    </View>
                    <Text style={styles.coverContactText} selectable>{profile.phone}</Text>
                  </View>
                ) : null}
                {profile.address ? (
                  <View style={styles.coverContactRow}>
                    <View style={styles.coverContactIcon}>
                      <Ionicons name="location-outline" size={13} color={colors.teal} />
                    </View>
                    <Text style={styles.coverContactText} numberOfLines={2}>{profile.address}</Text>
                  </View>
                ) : null}
              </View>
            </>
          )}
          {/* If neither phone nor address, still show subtle placeholder so cover doesn't look truncated */}
          {!profile.phone && !profile.address && !readOnly && (
            <>
              <View style={styles.coverDivider} />
              <Text style={styles.coverEmptyContact}>Add your phone and service address to help customers reach you.</Text>
            </>
          )}
        </View>

        {/* 2. REPUTATION BAND — single inline on canvas, not cards */}
        <View style={styles.reputationBand}>
          <View style={styles.repItem}>
            <Text style={styles.repValue}>{profile.completedJobs ?? 0}</Text>
            <Text style={styles.repLabel}> Completed Jobs</Text>
          </View>
          <Text style={styles.repDot}>·</Text>
          <View style={styles.repItem}>
            <Text style={styles.repValue}>{profile.averageRating != null ? Number(profile.averageRating).toFixed(1) : '—'}</Text>
            <View style={styles.repStarInline}>
              <Ionicons name="star" size={11} color={colors.gold} />
            </View>
            <Text style={styles.repLabel}> Rating</Text>
          </View>
          <Text style={styles.repDot}>·</Text>
          <View style={styles.repItem}>
            <Text style={styles.repValue}>{profile.yearsExperience ? String(profile.yearsExperience) : '0'}</Text>
            <Text style={styles.repLabel}> Years Experience</Text>
          </View>
        </View>

        {/* 3. EDITOR — when editing, appears directly below cover */}
        {editing && (
          <View style={styles.editCard}>
            <View style={styles.editHeader}>
              <Text style={styles.editKicker}>EDIT PROFILE</Text>
              <Text style={styles.editTitle}>Update your details</Text>
            </View>
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

        {/* 4. PROFESSIONAL SUMMARY — quiet canvas section */}
        <View style={styles.sectionCanvas}>
          <Text style={styles.sectionEyebrow}>PROFESSIONAL SUMMARY</Text>
          {profile.bio ? (
            <Text style={styles.summaryBody}>{profile.bio}</Text>
          ) : (
            <Text style={styles.mutedBody}>{readOnly ? 'No bio added yet.' : 'Add a short bio so customers know your background.'}</Text>
          )}
        </View>

        {/* 5. REVIEWS — professional reputation preview (second bounded surface) */}
        <View style={styles.boundedCard}>
          <View style={styles.boundedHeader}>
            <View>
              <Text style={styles.boundedEyebrow}>REPUTATION</Text>
              <Text style={styles.boundedTitle}>Reviews</Text>
            </View>
            <Text style={styles.boundedMeta}>{reviews.length} review{reviews.length === 1 ? '' : 's'}</Text>
          </View>

          {reviews.length > 0 && rating > 0 ? (
            <View style={styles.reviewSummary}>
              <Text style={styles.reviewAvgValue}>{rating.toFixed(1)}</Text>
              <StarRow value={rating} size={14} />
              <Text style={styles.reviewAvgLabel}>average</Text>
            </View>
          ) : null}

          {reviews.length > 0 ? (
            <>
              <View style={styles.reviewList}>
                {visibleReviews.map((r, i) => (
                  <View key={`${r.rating}-${i}`} style={[styles.reviewItem, i === visibleReviews.length - 1 && styles.reviewItemLast]}>
                    <View style={styles.reviewTopRow}>
                      <StarRow value={Number(r.rating) || 0} size={12} />
                      <Text style={styles.reviewRatingText}>{Number(r.rating) || 0}/5</Text>
                    </View>
                    {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : <Text style={styles.reviewNoComment}>No comment</Text>}
                  </View>
                ))}
              </View>
              {hasMoreReviews && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAllReviews ? 'Show fewer reviews' : `View all ${reviews.length} reviews`}
                  onPress={() => setShowAllReviews((v) => !v)}
                  style={({ pressed }) => [styles.viewAllButton, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.viewAllText}>{showAllReviews ? 'Show less' : `View all ${reviews.length} reviews`}</Text>
                  <Ionicons name={showAllReviews ? 'chevron-up' : 'chevron-forward'} size={14} color={colors.teal} />
                </Pressable>
              )}
            </>
          ) : (
            <View style={styles.emptyRow}>
              <Ionicons name="chatbubbles-outline" size={18} color={colors.muted} />
              <Text style={styles.mutedSmall}>No reviews yet — completed jobs will appear here.</Text>
            </View>
          )}
        </View>

        {/* 6. SKILLS — quieter canvas, no checkmarks, wrapping chips */}
        <View style={styles.sectionCanvas}>
          <Text style={styles.sectionEyebrow}>SKILLS</Text>
          <Text style={styles.sectionSubtle}>Specializations</Text>
          {skills.length > 0 ? (
            <View style={styles.skillWrap}>
              {skills.map((skill) => (
                <View key={skill} style={styles.skillChipQuiet}>
                  <Text style={styles.skillQuietText} numberOfLines={1}>{skill}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedBody}>No skills listed.</Text>
          )}
        </View>

        {/* 7. SERVICE AREA — human-readable primary, coordinates secondary */}
        <View style={styles.sectionCanvas}>
          <Text style={styles.sectionEyebrow}>SERVICE AREA</Text>
          <Text style={styles.serviceLabel}>Where you operate</Text>
          <Text style={styles.serviceAddress} numberOfLines={3}>
            {profile.address ? profile.address : 'No service address added yet.'}
          </Text>
          {profile.latitude != null && profile.longitude != null ? (
            <Text style={styles.serviceCoords}>
              {Number(profile.latitude).toFixed(4)} · {Number(profile.longitude).toFixed(4)}
            </Text>
          ) : (
            <Text style={styles.mutedSmall}>No coordinates yet — edit the address above to auto-detect.</Text>
          )}
        </View>

        {/* 8. SCHEDULE — customer read-only view (canvas, not a dashboard card) */}
        {readOnly && (
          <View style={styles.sectionCanvas}>
            <Text style={styles.sectionEyebrow}>SCHEDULE</Text>
            <Text style={styles.sectionSubtle}>Current and upcoming jobs</Text>
            {scheduleLoading ? (
              <View style={styles.emptyRow}>
                <ActivityIndicator size="small" color={colors.teal} />
                <Text style={styles.mutedSmall}>Loading schedule…</Text>
              </View>
            ) : schedule.length > 0 ? (
              <View style={styles.scheduleList}>
                {schedule.map((item, i) => (
                  <View key={`${item.status}-${i}`} style={[styles.schedItem, i === schedule.length - 1 && styles.schedItemLast]}>
                    <View style={styles.schedLine}>
                      <Ionicons name="calendar-outline" size={13} color={colors.teal} accessible={false} />
                      <Text style={styles.schedDate} numberOfLines={1}>{formatScheduleDate(item)}</Text>
                      <Text style={styles.schedStatus} numberOfLines={1}>{item.status}</Text>
                    </View>
                    <View style={styles.schedLine}>
                      <Ionicons name="time-outline" size={13} color={colors.teal} accessible={false} />
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

        {/* 9. PORTFOLIO / WORK SHOWCASE — professional showcase (third bounded surface) */}
        <View style={styles.boundedCard}>
          <View style={styles.portfolioHeader}>
            <View style={styles.portfolioHeaderCopy}>
              <Text style={styles.boundedEyebrow}>WORK SHOWCASE</Text>
              <Text style={styles.boundedTitle}>Portfolio</Text>
            </View>
            {!readOnly && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add portfolio photos"
                accessibilityHint="Open the photo library"
                disabled={uploading}
                hitSlop={6}
                onPress={choosePortfolioPhotos}
                style={({ pressed }) => [styles.addPhotosButton, pressed && !uploading && styles.pressedSoft]}
              >
                <Ionicons name="add" size={14} color={colors.white} />
                <Text style={styles.addPhotosText}>Add photos</Text>
              </Pressable>
            )}
          </View>

          {/* Selected photos preview + upload action */}
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
              {selectedPhotos.length > 0 && (
                <Text style={styles.selectionHint}>{selectedPhotos.length} photo{selectedPhotos.length === 1 ? '' : 's'} ready to upload</Text>
              )}
            </View>
          )}

          {portfolio.length > 0 ? (
            <View style={styles.photoGrid}>
              {portfolio.map((photo) => (
                <Pressable key={photo.url} onPress={() => setPreviewUrl(photo.url)} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                  <Image source={{ uri: photo.url }} style={styles.photo} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyRow}>
              <Ionicons name="images-outline" size={18} color={colors.muted} />
              <Text style={styles.mutedSmall}>No completed-repair photos yet.</Text>
            </View>
          )}
          {portfolio.length === 0 && !readOnly && selectedPhotos.length === 0 && (
            <Text style={styles.portfolioHint}>Show your best work — completed repairs build trust faster than any description.</Text>
          )}
        </View>

        {/* 10. HELP + LOGOUT — separated with visual break */}
        <View style={styles.footerBreak}>
          <View style={styles.footerDivider} />
          {!readOnly && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Help and how it works"
              hitSlop={6}
              onPress={() => setHelpVisible(true)}
              style={({ pressed }) => [styles.helpRow, pressed && styles.pressedSoft]}
            >
              <View style={styles.helpIconWrap}>
                <Ionicons name="help-circle-outline" size={16} color={colors.teal} />
              </View>
              <View style={styles.helpCopy}>
                <Text style={styles.helpTitle}>Help & How It Works</Text>
                <Text style={styles.helpSub}>Finding work, tracking, OTP and workload</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          )}
          {!readOnly && onLogout && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              hitSlop={6}
              onPress={onLogout}
              style={({ pressed }) => [styles.logoutQuiet, pressed && styles.pressedSoft]}
            >
              <Ionicons name="log-out-outline" size={16} color={colors.error} />
              <Text style={styles.logoutQuietText}>Log Out</Text>
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
  screen: { padding: 16, paddingBottom: 32, backgroundColor: colors.canvas, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  screenLoading: { flex: 1, backgroundColor: colors.canvas, padding: 16, paddingTop: 20 },
  loadingInner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12 },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, padding: 32, gap: 10 },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  readOnlyNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, minHeight: 32 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  backButtonText: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  readOnlyNavTitle: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' },

  // 1. COVER — ONE primary white surface
  coverCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 16, marginBottom: 14, ...shadows.card },
  coverTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: colors.white, fontSize: 26, fontFamily: fonts.bold },
  coverIdentity: { flex: 1, gap: 5, minWidth: 0 },
  coverName: { color: colors.ink, fontSize: 20, fontFamily: fonts.bold, lineHeight: 24, letterSpacing: -0.3 },
  coverVerifiedRow: { flexDirection: 'row', alignItems: 'center' },
  verifiedInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedInlineText: { color: colors.teal, fontSize: 12, fontFamily: fonts.semiBold },
  roleTextMuted: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  coverRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  coverRatingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'] },
  coverRatingTextMuted: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontStyle: 'italic' },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  editProfilePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder },
  editProfilePillText: { color: colors.teal, fontSize: 12, fontFamily: fonts.bold },
  coverDivider: { height: 1, backgroundColor: colors.lineSoft, marginTop: 14, marginBottom: 12 },
  coverContactList: { gap: 8 },
  coverContactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  coverContactIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  coverContactText: { flex: 1, color: colors.ink, fontSize: 13, fontFamily: fonts.medium, lineHeight: 18, flexShrink: 1 },
  coverEmptyContact: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic', lineHeight: 16 },

  // 2. REPUTATION BAND — canvas inline, compact
  reputationBand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 28, paddingHorizontal: 2 },
  repItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  repValue: { color: colors.ink, fontSize: 14, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  repLabel: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  repDot: { color: colors.line, fontSize: 12, marginHorizontal: 1, fontFamily: fonts.regular },
  repStarInline: { marginLeft: 1 },

  // Shared canvas section
  sectionCanvas: { marginBottom: 30, paddingHorizontal: 2 },
  sectionEyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 10 },
  sectionSubtle: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium, marginTop: -6, marginBottom: 10 },
  summaryBody: { color: colors.ink, fontSize: 15, lineHeight: 24, fontFamily: fonts.regular },
  mutedBody: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, fontStyle: 'italic', lineHeight: 19 },
  mutedSmall: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic', flexShrink: 1, lineHeight: 16 },

  // Bounded cards (2 surfaces: reviews + portfolio)
  boundedCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 16, marginBottom: 30, ...shadows.card },
  boundedHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 },
  boundedEyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.4, fontFamily: fonts.bold, marginBottom: 2 },
  boundedTitle: { color: colors.ink, fontSize: 17, fontFamily: fonts.bold, letterSpacing: -0.2 },
  boundedMeta: { color: colors.muted, fontSize: 11, fontFamily: fonts.semiBold, marginTop: 4, flexShrink: 0 },

  // Editor
  editCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 20, padding: 16, marginBottom: 30, ...shadows.cardStrong },
  editHeader: { marginBottom: 14, gap: 2 },
  editKicker: { color: colors.teal, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.bold },
  editTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  groupLabel: { color: colors.ink, fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 0.5, marginBottom: 10, marginTop: 6, textTransform: 'uppercase' },
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
  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bold },
  saveButton: { flex: 2, minHeight: 48, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  saveButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // Reviews
  reviewSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  reviewAvgValue: { color: colors.ink, fontSize: 19, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  reviewAvgLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginLeft: 2 },
  reviewList: { gap: 0 },
  reviewItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  reviewItemLast: { borderBottomWidth: 0, paddingBottom: 0 },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reviewRatingText: { color: colors.muted, fontSize: 11, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  reviewComment: { color: colors.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  reviewNoComment: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic' },
  viewAllButton: { marginTop: 14, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewAllText: { color: colors.teal, fontSize: 13, fontFamily: fonts.bold },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },

  // Skills — quiet chips, wrapping
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  skillChipQuiet: { maxWidth: '100%', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  skillQuietText: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, flexShrink: 1 },

  // Service area
  serviceLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginBottom: 4, letterSpacing: 0.2 },
  serviceAddress: { color: colors.ink, fontSize: 15, fontFamily: fonts.semiBold, lineHeight: 21 },
  serviceCoords: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], marginTop: 8, letterSpacing: 0.2 },

  // Schedule
  scheduleList: { gap: 0, marginTop: 2 },
  schedItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 5 },
  schedItemLast: { borderBottomWidth: 0, paddingBottom: 0 },
  schedLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  schedDate: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold, fontVariant: ['tabular-nums'], flexShrink: 1 },
  schedStatus: { color: colors.teal, fontSize: 11, fontFamily: fonts.bold, marginLeft: 'auto', flexShrink: 0 },
  schedTime: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, flexShrink: 1 },

  // Portfolio
  portfolioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  portfolioHeaderCopy: { flex: 1, minWidth: 0 },
  addPhotosButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.teal, ...shadows.card, flexShrink: 0 },
  addPhotosText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.1 },
  selectedPreview: { marginBottom: 14, gap: 10 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: '31%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.lineSoft, borderWidth: 1, borderColor: colors.lineSoft },
  selectionHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, fontStyle: 'italic' },
  portfolioHint: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, lineHeight: 15, marginTop: 10, fontStyle: 'italic' },
  uploadAction: { marginTop: 2 },

  // Shared buttons
  primaryButtonSolid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.teal, borderRadius: 14, paddingHorizontal: 18, minHeight: 48, ...shadows.card },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },

  // Footer — Help + Logout separated
  footerBreak: { marginTop: 4, gap: 10, paddingBottom: 8 },
  footerDivider: { height: 1, backgroundColor: colors.lineSoft, marginBottom: 14 },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 52 },
  helpIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.tealLight, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  helpCopy: { flex: 1, minWidth: 0 },
  helpTitle: { color: colors.ink, fontSize: 13, fontFamily: fonts.bold },
  helpSub: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
  logoutQuiet: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FECACA' },
  logoutQuietText: { color: colors.error, fontSize: 13, fontFamily: fonts.semiBold },

  // Loading / error
  skeletonAvatar: { width: 64, height: 64, borderRadius: 16 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
});
