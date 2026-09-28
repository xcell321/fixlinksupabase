// Shared trip-summary panel used by both tracking screens.
// MapTrackerScreen and TechnicianTrackerScreen previously copied this
// JSX + styles (~350 duplicated lines): tripRow/tripCell/tripDivider,
// destinationRow, primary "Navigate in Google Maps GPS" CTA,
// secondary "Center Route" CTA and the empty state.
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { themedStyles } from '../../../theme';

type TripPanelProps = {
  distanceKm: number | null;
  etaMinutes: number | null;
  destination: string;
  onNavigateExternal: () => void;
  onCenterRoute: () => void;
  onRefreshRoute?: () => void;
};

export const TripPanel = ({ distanceKm, etaMinutes, destination, onNavigateExternal, onCenterRoute, onRefreshRoute }: TripPanelProps): React.JSX.Element => (
  <View style={styles.panel}>
    <View style={styles.tripRow}>
      <View style={styles.tripCell}>
        <Text style={styles.tripLabel}>Distance</Text>
        <Text style={styles.tripValue}>{distanceKm == null ? '--' : `${distanceKm.toFixed(1)} km`}</Text>
      </View>
      <View style={styles.tripDivider} />
      <View style={styles.tripCell}>
        <Text style={styles.tripLabel}>ETA</Text>
        <Text style={styles.tripValue}>{etaMinutes == null ? '--' : `${Math.round(etaMinutes)} min`}</Text>
      </View>
    </View>
    <View style={styles.destinationRow}>
      <Text style={styles.destinationLabel}>Destination</Text>
      <Text style={styles.destinationValue} numberOfLines={2}>{destination || '--'}</Text>
    </View>
    <TouchableOpacity style={styles.primaryCta} onPress={onNavigateExternal}>
      <Text style={styles.primaryCtaText}>Navigate in Google Maps GPS</Text>
    </TouchableOpacity>
    <View style={styles.row}>
      <TouchableOpacity style={styles.secondaryCta} onPress={onCenterRoute}>
        <Text style={styles.secondaryCtaText}>Center Route</Text>
      </TouchableOpacity>
      {onRefreshRoute ? (
        <TouchableOpacity style={styles.quietCta} onPress={onRefreshRoute}>
          <Text style={styles.quietCtaText}>Refresh Route</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  </View>
);

export const TrackEmptyState = ({ message }: { message: string }): React.JSX.Element => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>{message}</Text>
  </View>
);

export const openExternalNavigation = (latitude: number, longitude: number): void => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  void import('expo-linking').then(({ default: Linking }) => Linking.openURL(url));
};

const styles = themedStyles({
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  tripRow: { flexDirection: 'row', alignItems: 'center' },
  tripCell: { flex: 1, alignItems: 'center' },
  tripLabel: { fontSize: 12, color: '#6b7280' },
  tripValue: { fontSize: 16, fontWeight: '700' },
  tripDivider: { width: 1, height: 32, backgroundColor: '#e5e7eb' },
  destinationRow: { gap: 2 },
  destinationLabel: { fontSize: 12, color: '#6b7280' },
  destinationValue: { fontSize: 14 },
  primaryCta: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center' },
  primaryCtaText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  secondaryCta: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, alignItems: 'center' },
  secondaryCtaText: { fontWeight: '600' },
  quietCta: { flex: 1, padding: 10, alignItems: 'center' },
  quietCtaText: { color: '#2563eb', fontWeight: '600' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#6b7280', textAlign: 'center' },
});
