// Prototype TechJobDetail: pay card, customer card, live mini map, action rows.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PhotoThumb } from '../../components/RequestPhoto';
import LocationIQMap from '../../components/LocationIQMap';
import { colors, fonts } from '../../theme';
import { formatJobSchedule, canMarkArrival, canStartRepair, type JobItem } from '../../utils/availableJobsHelpers';

const BLUE = '#2563EB';

interface TechJobDetailScreenProps {
  job: JobItem;
  techCoords?: { latitude: number; longitude: number } | null;
  isQueue: boolean;
  acceptingJobId: string | null;
  actionLoadingId: string | null;
  onBack: () => void;
  onAccept: (job: JobItem) => void;
  onDecline: (job: JobItem) => void;
  onArrival: (job: JobItem) => void;
  onNoShow: (job: JobItem) => void;
  onStart: (job: JobItem) => void;
  onComplete: (job: JobItem) => void;
  onMessage: (job: JobItem) => void;
  onPreviewPhoto: (url: string) => void;
}

export default function TechJobDetailScreen({
  job, techCoords, isQueue, acceptingJobId, actionLoadingId,
  onBack, onAccept, onDecline, onArrival, onNoShow, onStart, onComplete, onMessage, onPreviewPhoto,
}: TechJobDetailScreenProps): React.JSX.Element {
  const lat = job.latitude != null ? Number(job.latitude) : NaN;
  const lng = job.longitude != null ? Number(job.longitude) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const customerInitial = String(job.customerName || 'C').trim().charAt(0).toUpperCase() || 'C';
  const arrivalEligible = canMarkArrival(job);
  const startEligible = canStartRepair(job);
  const isInProgress = job.status === 'In Progress';
  const busy = actionLoadingId === job.id || acceptingJobId === job.id;

  return (
    <View style={styles.screen}>
      <View style={styles.backHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back to jobs" hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color="#374151" />
        </Pressable>
        <Text style={styles.backTitle}>Job Details</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.payRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.jobTitle} numberOfLines={1}>{job.applianceType || 'Repair Request'}</Text>
              <Text style={styles.jobIssue} numberOfLines={2}>{job.description ? job.description.split('.')[0] : (job.applianceType || 'Repair request')}</Text>
            </View>
          </View>
          {job.description ? (
            <View style={styles.descBox}>
              <Text style={styles.descText}>{job.description}</Text>
            </View>
          ) : null}
          {job.photoUrl ? (
            <View style={{ marginTop: 12 }}>
              <PhotoThumb photoUrl={job.photoUrl} onPress={() => onPreviewPhoto(job.photoUrl as string)} />
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{customerInitial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.customerName} numberOfLines={1}>{job.customerName || 'Verified Homeowner'}</Text>
              <Text style={styles.customerMeta} numberOfLines={1}>Verified customer</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={14} color="#9CA3AF" />
            <Text style={styles.infoText} numberOfLines={2}>{job.location || 'Local service area'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color="#9CA3AF" />
            <Text style={styles.infoText} numberOfLines={1}>{formatJobSchedule(job)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Map</Text>
          {hasCoords ? (
            <LocationIQMap
              technicianCoords={techCoords?.latitude != null ? { latitude: techCoords.latitude, longitude: techCoords.longitude, name: 'You' } : undefined}
              customerCoords={{ latitude: lat, longitude: lng, name: job.customerName || 'Customer', address: job.location || '' }}
              currentUserRole="technician"
              isAccepted={!isQueue}
              style={{ height: 140, borderRadius: 12, overflow: 'hidden' }}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="location" size={20} color={BLUE} />
              <Text style={styles.mapPlaceholderText}>
                {job.distanceKm != null ? `${Number(job.distanceKm).toFixed(1)} km away` : 'Map unlocks after accept'}
              </Text>
            </View>
          )}
        </View>

        {isQueue ? (
          <View style={styles.btnRow}>
            <Pressable onPress={() => onDecline(job)} disabled={busy} style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Decline job">
              <Ionicons name="close" size={16} color="#EF4444" />
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable onPress={() => onAccept(job)} disabled={busy} style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Accept job">
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (<><Ionicons name="checkmark" size={16} color="#FFFFFF" /><Text style={styles.acceptText}>Accept</Text></>)}
            </Pressable>
          </View>
        ) : null}

        {!isQueue ? (
          <View style={{ gap: 8 }}>
            {arrivalEligible ? (
              <View style={styles.btnRow}>
                <Pressable onPress={() => onArrival(job)} disabled={busy} style={({ pressed }) => [styles.primaryBlue, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Mark arrival">
                  {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (<><Ionicons name="location" size={15} color="#FFFFFF" /><Text style={styles.primaryBlueText}>Mark Arrival</Text></>)}
                </Pressable>
                <Pressable onPress={() => onNoShow(job)} disabled={busy} style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Report no-show">
                  <Text style={styles.declineText}>No-Show</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.btnRow}>
              <Pressable onPress={() => onMessage(job)} style={({ pressed }) => [styles.messageBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Message customer">
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#374151" />
                <Text style={styles.messageText}>Message</Text>
              </Pressable>
              {startEligible ? (
                <Pressable onPress={() => onStart(job)} disabled={busy} style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Start repair">
                  {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (<><Ionicons name="flash-outline" size={16} color="#FFFFFF" /><Text style={styles.startText}>Start Repair</Text></>)}
                </Pressable>
              ) : null}
            </View>
            {isInProgress ? (
              <Pressable onPress={() => onComplete(job)} style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel="Mark as completed">
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.completeText}>Mark as Completed</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.semiBold },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  cardTitle: { color: '#111827', fontSize: 14, fontFamily: fonts.bold, marginBottom: 12 },
  payRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  jobTitle: { color: '#111827', fontSize: 16, fontFamily: fonts.bold },
  jobIssue: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  descBox: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 12, padding: 12, marginTop: 12 },
  descText: { color: '#4B5563', fontSize: 13, fontFamily: fonts.regular, lineHeight: 19 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.extraBold },
  customerName: { color: '#111827', fontSize: 14, fontFamily: fonts.semiBold },
  customerMeta: { color: '#6B7280', fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  infoText: { flex: 1, color: '#6B7280', fontSize: 12, fontFamily: fonts.regular },
  mapPlaceholder: { backgroundColor: '#F3F4F6', borderRadius: 12, height: 112, alignItems: 'center', justifyContent: 'center', gap: 6 },
  mapPlaceholderText: { color: '#6B7280', fontSize: 12, fontFamily: fonts.medium },
  btnRow: { flexDirection: 'row', gap: 8 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 2, borderColor: '#FECACA', borderRadius: 12, minHeight: 52, backgroundColor: '#FFFFFF' },
  declineText: { color: '#EF4444', fontSize: 14, fontFamily: fonts.semiBold },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 12, minHeight: 52 },
  acceptText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.semiBold },
  messageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F3F4F6', borderRadius: 12, minHeight: 52 },
  messageText: { color: '#374151', fontSize: 14, fontFamily: fonts.semiBold },
  startBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#D1FAE5', borderRadius: 12, minHeight: 52 },
  startText: { color: '#047857', fontSize: 14, fontFamily: fonts.semiBold },
  primaryBlue: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: BLUE, borderRadius: 12, minHeight: 52 },
  primaryBlueText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.semiBold },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 12, minHeight: 52 },
  completeText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.semiBold },
});
