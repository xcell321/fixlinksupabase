// Prototype RateTechnician: green check, tech avatar, tappable stars, review, submit.
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { submitTechnicianReview } from '../../services/api';
import { colors, fonts } from '../../theme';

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
          <Ionicons name="arrow-back" size={18} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.backTitle}>Rate Technician</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.checkWrap}>
          <Ionicons name="checkmark" size={30} color="#10B981" />
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
              <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={32} color={i <= rating ? ORANGE : '#D1D5DB'} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>LEAVE A REVIEW</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Share your experience..."
          placeholderTextColor="#9CA3AF"
          value={comment}
          onChangeText={setComment}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={submitting} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Submit rating">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Submit Rating</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backTitle: { color: '#111827', fontSize: 15, fontFamily: fonts.semiBold },
  body: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, alignItems: 'center' },
  checkWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: '#111827', fontSize: 20, fontFamily: fonts.extraBold, marginBottom: 6 },
  copy: { color: '#6B7280', fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  techName: { color: '#374151', fontSize: 14, fontFamily: fonts.semiBold, marginTop: 2, marginBottom: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontFamily: fonts.extraBold },
  prompt: { color: '#4B5563', fontSize: 14, fontFamily: fonts.regular, marginBottom: 12 },
  stars: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  label: { alignSelf: 'stretch', color: '#6B7280', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, marginBottom: 6 },
  textArea: { alignSelf: 'stretch', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 88, fontSize: 14, fontFamily: fonts.regular, color: colors.ink, backgroundColor: '#F9FAFB', marginBottom: 16 },
  primary: { alignSelf: 'stretch', backgroundColor: ORANGE, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
