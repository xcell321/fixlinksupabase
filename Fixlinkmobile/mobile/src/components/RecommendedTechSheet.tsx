// AI technician match sheet — opened from the floating robot on Request Details.
//
// Shows the top-ranked technicians for ONE job (GET /api/ai/recommend?jobId=):
// rank, match %, the AI reason, verified stats, workload, availability and the
// skills that earned the rank. Read-only suggestions — View Profile is the only
// action, since a customer has no chat thread with an unassigned technician.
//
// Same sheet grammar as ConversationInfoSheet / HelpSheet: ink scrim, white
// sheet with a 28px top radius, 4px-grid spacing, accent-tinted icon tiles, and
// skeleton placeholders shaped like the real rows so nothing jumps on load.
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Skeleton from './Skeleton';
import { fetchTechnicianRecommendations } from '../services/api';
import { colors, fonts, shadows, themedStyles } from '../theme';
import type { ScheduleAvailability, TechnicianScheduleItem } from '../types/schedule';

const ASSISTANT_IMAGE = require('../../assets/ai-assistant.png');

export interface RecommendedTechnician {
  uid: string;
  name?: string;
  matchScore?: number;
  confidence?: number;
  reason?: string;
  rating?: number;
  totalReviews?: number;
  yearsExperience?: number;
  distanceKm?: number | null;
  skills?: string[];
  profileImage?: string | null;
  availability?: ScheduleAvailability;
  upcomingSchedule?: TechnicianScheduleItem[];
  activeJobs?: number;
  workloadStatus?: string;
}

type LoadState = 'loading' | 'loaded' | 'empty' | 'error' | 'unavailable';

interface RecommendedTechSheetProps {
  visible: boolean;
  // The repair request to rank against. Nothing loads until this is set.
  jobId?: string | null;
  applianceType?: string | null;
  onClose: () => void;
  onViewProfile?: (technician: { uid: string; name?: string }) => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function Stat({ icon, text, highlight = false }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; highlight?: boolean }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={highlight ? colors.customer : colors.muted} />
      <Text style={[styles.statText, highlight && styles.statTextHighlight]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export default function RecommendedTechSheet({ visible, jobId, applianceType, onClose, onViewProfile }: RecommendedTechSheetProps): React.JSX.Element {
  const [state, setState] = useState<LoadState>('loading');
  const [techs, setTechs] = useState<RecommendedTechnician[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!visible || !jobId) return undefined;
    let active = true;
    setState('loading');
    fetchTechnicianRecommendations(jobId)
      .then((data) => {
        if (!active) return;
        const res = data as { recommendations?: RecommendedTechnician[]; ai?: string; note?: string } | null;
        const aiOn = res?.ai === 'ai';
        setNote(res?.note ?? null);
        setAiAssisted(aiOn);
        // AI gateway off or unreachable: the backend falls back to a plain
        // deterministic list, but the sheet must not present that as an AI
        // ranking. Show the unavailable state instead.
        if (!aiOn) {
          setTechs([]);
          setState('unavailable');
          return;
        }
        const list = Array.isArray(res?.recommendations) ? res.recommendations : [];
        setTechs(list);
        setState(list.length > 0 ? 'loaded' : 'empty');
      })
      .catch(() => {
        if (!active) return;
        setTechs([]);
        setState('error');
      });
    return () => { active = false; };
  }, [visible, jobId, reloadKey]);

  const renderCard = (tech: RecommendedTechnician, index: number): React.JSX.Element => {
    const rank = index + 1;
    const best = rank === 1;
    const matchPct = Math.round((Number(tech.matchScore) || 0) * 100);
    const confidencePct = Math.round((Number(tech.confidence) || 0) * 100);
    const initial = String(tech.name || 'T').trim().charAt(0).toUpperCase() || 'T';
    const skills = Array.isArray(tech.skills) ? tech.skills.slice(0, 4) : [];
    const activeJobs = Number(tech.activeJobs) || 0;
    const busy = tech.availability === 'busy';
    // Only the first upcoming job is surfaced — the sheet is a shortlist, not a calendar.
    const nextJob = Array.isArray(tech.upcomingSchedule) ? tech.upcomingSchedule[0] : undefined;

    return (
      <View key={tech.uid} style={[styles.card, best && styles.cardBest]}>
        {best ? (
          <View style={styles.bestRow}>
            <View style={styles.bestBadge}>
              <Ionicons name="sparkles" size={11} color={colors.customerDark} />
              <Text style={styles.bestBadgeText}>Best match</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.cardTop}>
          <View style={[styles.rankBadge, best && styles.rankBadgeBest]}>
            <Text style={[styles.rankText, best && styles.rankTextBest]}>{rank}</Text>
          </View>
          {tech.profileImage ? (
            <Image source={{ uri: tech.profileImage }} style={styles.avatar} accessibilityLabel={`${tech.name ?? 'Technician'} photo`} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.cardCopy}>
            <Text style={styles.name} numberOfLines={1}>{tech.name || 'Technician'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.gold} />
              <Text style={styles.ratingText}>{tech.rating ? Number(tech.rating).toFixed(1) : 'New'}</Text>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.ratingMeta} numberOfLines={1}>{plural(Number(tech.totalReviews) || 0, 'review', 'reviews')}</Text>
            </View>
          </View>
          <View
            style={[styles.matchPill, best && styles.matchPillBest]}
            accessibilityRole="text"
            accessibilityLabel={`${matchPct} percent match`}
          >
            <Text style={[styles.matchValue, best && styles.matchValueBest]}>{matchPct}%</Text>
            <Text style={[styles.matchLabel, best && styles.matchLabelBest]}>match</Text>
          </View>
        </View>

        {tech.reason ? <Text style={styles.reason}>{tech.reason}</Text> : null}

        <View style={styles.statsRow}>
          <Stat icon="briefcase-outline" text={`${plural(Number(tech.yearsExperience) || 0, 'yr', 'yrs')} exp`} />
          {tech.distanceKm != null ? <Stat icon="location-outline" text={`${tech.distanceKm} km away`} /> : null}
          {confidencePct > 0 ? <Stat icon="flash" text={`${confidencePct}% AI`} highlight /> : null}
        </View>

        <View style={[styles.availRow, busy ? styles.availBusy : styles.availOk]}>
          <Ionicons name={busy ? 'time-outline' : 'checkmark-circle-outline'} size={13} color={busy ? colors.gold : colors.green} />
          <Text style={[styles.availText, busy ? styles.availTextBusy : styles.availTextOk]} numberOfLines={2}>
            {busy
              ? `Busy on this date · ${plural(activeJobs, 'active job', 'active jobs')}`
              : `Available for this schedule · ${plural(activeJobs, 'active job', 'active jobs')}`}
          </Text>
        </View>

        {nextJob ? (
          <View style={styles.nextJob}>
            <Ionicons name="calendar-outline" size={13} color={colors.customer} />
            <Text style={styles.nextJobText} numberOfLines={1}>
              Next: {nextJob.applianceType}{nextJob.preferredDate ? ` · ${nextJob.preferredDate}` : ''}{nextJob.preferredTime ? ` · ${nextJob.preferredTime}` : ''}
            </Text>
          </View>
        ) : null}

        {skills.length > 0 ? (
          <View style={styles.skillsRow}>
            {skills.map((skill) => (
              <View key={skill} style={styles.skillChip}>
                <Text style={styles.skillText} numberOfLines={1}>{skill}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${tech.name ?? 'technician'} profile`}
          onPress={() => onViewProfile?.({ uid: tech.uid, name: tech.name })}
          style={({ pressed }) => [styles.profileBtn, best && styles.profileBtnBest, pressed && styles.pressed]}
        >
          <Ionicons name="person-outline" size={14} color={best ? colors.white : colors.customerDark} />
          <Text style={[styles.profileBtnText, best && styles.profileBtnTextBest]}>View Profile</Text>
        </Pressable>
      </View>
    );
  };

  const renderBody = (): React.JSX.Element => {
    if (state === 'loading') {
      return (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardTop}>
                <Skeleton style={{ width: 24, height: 24, borderRadius: 8 }} />
                <Skeleton style={{ width: 52, height: 52, borderRadius: 16 }} />
                <View style={styles.cardCopy}>
                  <Skeleton style={{ width: '58%', height: 14, marginBottom: 8 }} />
                  <Skeleton style={{ width: '40%', height: 11 }} />
                </View>
                <Skeleton style={{ width: 54, height: 34, borderRadius: 12 }} />
              </View>
              <Skeleton style={{ width: '88%', height: 12, marginTop: 4 }} />
            </View>
          ))}
        </View>
      );
    }

    if (state === 'error') {
      return (
        <View style={styles.stateBox}>
          <View style={styles.stateIcon}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.muted} />
          </View>
          <Text style={styles.stateTitle}>Couldn&apos;t load matches</Text>
          <Text style={styles.stateText}>Check your connection and try again. Your request is safe.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading matches"
            onPress={() => setReloadKey((k) => k + 1)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.onAccent} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (state === 'unavailable') {
      return (
        <View style={styles.stateBox}>
          <View style={styles.stateIcon}>
            <Ionicons name="sparkles-outline" size={24} color={colors.muted} />
          </View>
          <Text style={styles.stateTitle}>AI Service Unavailable</Text>
          <Text style={styles.stateText}>AI matching is temporarily unavailable. Your request is still visible to qualified technicians in the jobs feed.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh matches"
            onPress={() => setReloadKey((k) => k + 1)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.onAccent} />
            <Text style={styles.retryBtnText}>Refresh</Text>
          </Pressable>
        </View>
      );
    }

    if (state === 'empty') {
      return (
        <View style={styles.stateBox}>
          <View style={[styles.stateIcon, styles.stateIconAccent]}>
            <Ionicons name="search-outline" size={24} color={colors.customer} />
          </View>
          <Text style={styles.stateTitle}>No matches yet</Text>
          <Text style={styles.stateText}>{note || 'No eligible technicians match this request right now.'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh matches"
            onPress={() => setReloadKey((k) => k + 1)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.onAccent} />
            <Text style={styles.retryBtnText}>Refresh matches</Text>
          </Pressable>
        </View>
      );
    }

    return <View style={{ gap: 12 }}>{techs.map(renderCard)}</View>;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Image source={ASSISTANT_IMAGE} style={styles.headerImage} accessibilityLabel="FixLink AI" />
            <View style={styles.headerCopy}>
              <Text style={styles.title} accessibilityRole="header">AI Technician Match</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {state === 'unavailable'
                  ? 'AI matching paused'
                  : (applianceType ? `Top ranked for ${applianceType}` : 'Top ranked for this request')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close recommended technicians"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} accessibilityLiveRegion="polite">
            {state === 'loaded' ? (
              <View style={styles.insight}>
                <Ionicons name={aiAssisted ? 'sparkles' : 'analytics-outline'} size={13} color={colors.customerDark} />
                <Text style={styles.insightText}>
                  {note || (aiAssisted
                    ? 'Ranked by AI using verified FixLink data.'
                    : 'Ranked from verified FixLink data.')}
                </Text>
              </View>
            ) : null}

            {renderBody()}

            {state === 'loaded' ? (
              <View style={styles.footerNote}>
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.muted} />
                <Text style={styles.footerNoteText}>
                  Rankings use real ratings, distance and workload. Tap a technician to review their full profile before booking.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: '90%',
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerImage: { width: 40, height: 40, borderRadius: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },

  body: { paddingTop: 16, paddingBottom: 4, gap: 12 },

  insight: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.customerMist, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  insightText: { flex: 1, color: colors.customerDark, fontSize: 11.5, lineHeight: 16, fontFamily: fonts.semiBold },

  // Card — same footprint as the other white cards, best match gets the accent edge.
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, gap: 10, ...shadows.card },
  cardBest: { borderColor: colors.customer, borderWidth: 1.5 },
  bestRow: { flexDirection: 'row' },
  bestBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.customerMist, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  bestBadgeText: { color: colors.customerDark, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.3 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  rankBadgeBest: { backgroundColor: colors.customer, borderColor: colors.customerDark },
  rankText: { color: colors.muted, fontSize: 12, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  rankTextBest: { color: colors.onAccent },
  avatar: { width: 52, height: 52, borderRadius: 16 },
  avatarFallback: { backgroundColor: colors.customer, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onAccent, fontSize: 20, fontFamily: fonts.extraBold },
  cardCopy: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingText: { color: colors.ink, fontSize: 12, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  dot: { color: colors.line, fontSize: 12, fontFamily: fonts.regular },
  ratingMeta: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, flexShrink: 1 },
  matchPill: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.customerMist, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, minWidth: 56 },
  matchPillBest: { backgroundColor: colors.customer, borderColor: colors.customerDark },
  matchValue: { color: colors.customerDark, fontSize: 14, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  matchValueBest: { color: colors.onAccent },
  matchLabel: { color: colors.customerDark, fontSize: 9, fontFamily: fonts.bold, letterSpacing: 0.4, marginTop: 1 },
  matchLabelBest: { color: colors.customerSoft },

  reason: { color: colors.ink, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.regular },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: colors.muted, fontSize: 11.5, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  statTextHighlight: { color: colors.customer, fontFamily: fonts.bold },

  availRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  availOk: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  availBusy: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  availText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontFamily: fonts.semiBold },
  // AA-safe on their tinted fills: successText on successSoft, warningStrong on warningSoft.
  availTextOk: { color: colors.successText },
  availTextBusy: { color: colors.warningStrong },

  nextJob: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  nextJobText: { flex: 1, color: colors.ink, fontSize: 11.5, fontFamily: fonts.medium },

  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: { backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.customerMist, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  skillText: { color: colors.customerDark, fontSize: 11, fontFamily: fonts.bold },

  profileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 14, backgroundColor: colors.customerSoft, marginTop: 2 },
  profileBtnBest: { backgroundColor: colors.customer, ...shadows.card },
  profileBtnText: { color: colors.customerDark, fontSize: 13, fontFamily: fonts.bold },
  profileBtnTextBest: { color: colors.onAccent },

  stateBox: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 16 },
  stateIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  stateIconAccent: { backgroundColor: colors.customerSoft },
  stateTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.customer, borderRadius: 14, paddingHorizontal: 22, minHeight: 48, marginTop: 4, ...shadows.card },
  retryBtnText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },

  footerNote: { flexDirection: 'row', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 14, padding: 12, marginTop: 4, alignItems: 'flex-start' },
  footerNoteText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16, fontFamily: fonts.regular },
});
