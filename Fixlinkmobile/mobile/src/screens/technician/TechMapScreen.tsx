// Prototype TechMap: dark Nearby Jobs header, live map with pay pins, job list.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import LocationIQMap from '../../components/LocationIQMap';
import { fetchRepairRequests } from '../services/api';
import { colors, fonts } from '../../theme';
import { type JobItem } from '../../utils/availableJobsHelpers';
import { getApplianceIcon } from '../../utils/applianceIcons';

const DARK = '#0D1B2A';
const BLUE = '#2563EB';

interface TechMapScreenProps {
  technician: { uid: string; name?: string };
  onOpenJob: (job: JobItem) => void;
}

export default function TechMapScreen({ technician, onOpenJob }: TechMapScreenProps): React.JSX.Element {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [techCoords, setTechCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let coords: { latitude: number; longitude: number } | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setTechCoords(coords);
        }
      } catch {}
      const result = await fetchRepairRequests(technician?.uid, coords);
      setJobs(Array.isArray(result) ? (result as JobItem[]) : []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [technician?.uid]);

  useEffect(() => { load(); }, [load]);

  const pins = jobs
    .filter((j) => Number.isFinite(Number(j.latitude)) && Number.isFinite(Number(j.longitude)))
    .map((j) => ({ latitude: Number(j.latitude), longitude: Number(j.longitude), label: j.applianceType || 'Job' }));
  const nearbyCount = jobs.filter((j) => j.distanceKm == null || Number(j.distanceKm) <= 5).length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={BLUE} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Jobs</Text>
        <Text style={styles.subtitle}>{nearbyCount} job{nearbyCount === 1 ? '' : 's'} within 5 miles</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.mapCard}>
          {loading ? (
            <View style={styles.mapLoading}><ActivityIndicator color={BLUE} /></View>
          ) : (
            <LocationIQMap
              technicianCoords={techCoords ? { ...techCoords, name: 'You' } : undefined}
              currentUserRole="technician"
              isAccepted={false}
              jobPins={pins}
              style={{ height: 220 }}
            />
          )}
        </View>
        <View style={{ gap: 8 }}>
          {jobs.map((j) => (
            <Pressable
              key={j.id}
              onPress={() => onOpenJob(j)}
              style={({ pressed }) => [styles.jobRow, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${j.applianceType || 'job'}`}
            >
              <View style={styles.jobIcon}>
                <Ionicons name={getApplianceIcon(j.applianceType) as never} size={18} color={BLUE} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.jobTitle} numberOfLines={1}>{j.applianceType || 'Repair Request'}</Text>
                <Text style={styles.jobMeta} numberOfLines={1}>
                  {j.distanceKm != null ? `${Number(j.distanceKm).toFixed(1)} mi · ` : ''}{j.location || 'Nearby'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </Pressable>
          ))}
          {!loading && jobs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No nearby jobs</Text>
              <Text style={styles.emptyCopy}>New repair requests in your area will appear here.</Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { paddingBottom: 28 },
  header: { backgroundColor: DARK, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  title: { color: '#FFFFFF', fontSize: 21, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  subtitle: { color: '#9CA3AF', fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  mapCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', height: 220 },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  jobRow: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  jobIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  jobTitle: { color: '#111827', fontSize: 14, fontFamily: fonts.semiBold },
  jobMeta: { color: '#9CA3AF', fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  emptyTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.bold },
  emptyCopy: { color: '#6B7280', fontSize: 13, fontFamily: fonts.regular, marginTop: 4, textAlign: 'center' },
});
