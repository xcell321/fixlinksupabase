// Prototype RateTechnician: green check, tech avatar, tappable stars, review, submit.
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { submitTechnicianReview } from '../../services/api';
import { colors, fonts, themedStyles } from '../../theme';

const ORANGE = colors.customer;

interface RateTechnicianScreenProps {
  job: { id: string; applianceType?: string; technicianName?: string };
  customerName: string;
  onBack: () => void;
  onSubmitted: () => void;
}

export default function RateTechnicianScreen({ job, customerName, onBack, onSubmitted }: RateTechnicianScreenProps): React.JSX.Element {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const techName = job.technicianName || 'your technician';
  const initials = String(techName).trim().charAt(0).toUpperCase();

  const handleSubmit = async () => {
    if (!rating) {
      Alert.alert('Error', 'Please select a star rating before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await submitTechnicianReview(job.id, { customerName, rating, comment });
      Alert.alert('Success', 'Thanks! Your rating was submitted.');
      onSubmitted();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.backHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={18} color={colors.gray700} />
        </TouchableOpacity>
        <Text style={styles.backTitle}>Rate Technician</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.checkWrap}>
          <Ionicons name="checkmark" size={30} color={colors.success} />
        </View>
        <Text style={styles.title}>Repair Completed!</Text>
        <Text style={styles.copy}>
          Your {job.applianceType || 'device'} has been repaired by
        </Text>
        <Text style={styles.techName}>{techName}</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.prompt}>How was the service?</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((i) => (
            <TouchableOpacity key={i} onPress={() => setRating(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Rate ${i} stars`}>
              <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={32} color={i <= rating ? ORANGE : colors.gray300} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>LEAVE A REVIEW</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Share your experience..."
          placeholderTextColor={colors.subtle}
          value={comment}
          onChangeText={setComment}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={submitting} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Submit rating">
          {submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Submit Rating</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles({
  screen: { flex: 1, backgroundColor: colors.white },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backTitle: { color: colors.gray900, fontSize: 15, fontFamily: fonts.semiBold },
  body: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, alignItems: 'center' },
  checkWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.donePill, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: colors.gray900, fontSize: 20, fontFamily: fonts.extraBold, marginBottom: 6 },
  copy: { color: colors.gray500, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  techName: { color: colors.gray700, fontSize: 14, fontFamily: fonts.semiBold, marginTop: 2, marginBottom: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brightBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  avatarText: { color: colors.onAccent, fontSize: 20, fontFamily: fonts.extraBold },
  prompt: { color: colors.gray600, fontSize: 14, fontFamily: fonts.regular, marginBottom: 12 },
  stars: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  label: { alignSelf: 'stretch', color: colors.gray500, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginBottom: 6 },
  textArea: { alignSelf: 'stretch', borderWidth: 1, borderColor: colors.gray200, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 88, fontSize: 14, fontFamily: fonts.regular, color: colors.ink, backgroundColor: colors.appBg, marginBottom: 16 },
  primary: { alignSelf: 'stretch', backgroundColor: ORANGE, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
});
