// Prototype TechVerifyPending: blue shield, pending copy, next-steps card.
// The applicant cannot sign in yet, so "Check Status" looks their application up
// by email and reports whether the admin has approved it.
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, themedStyles } from '../../theme';
import { checkTechnicianStatus } from '../../services/api';

const BLUE = colors.tech;

type ApplicationStatus = 'active' | 'pending_verification' | 'rejected' | 'none';

type StatusResult = {
  status?: ApplicationStatus;
  name?: string | null;
  rejectionReason?: string;
};

interface VerifyPendingScreenProps {
  onBackToLogin: () => void;
  // Email used at registration, so the status check is one tap.
  email?: string | null;
}

// Copy per state, so the screen never shows a raw backend value.
const describe = (result: StatusResult | null, email: string): { tone: 'info' | 'ok' | 'bad'; title: string; body: string } | null => {
  if (!result) return null;
  switch (result.status) {
    case 'active':
      return {
        tone: 'ok',
        title: 'Approved',
        body: `Your application is approved. Sign in as Technician with ${email} to start accepting repair jobs.`,
      };
    case 'rejected':
      return {
        tone: 'bad',
        title: 'Not approved',
        body: result.rejectionReason || 'Your application was not approved.',
      };
    case 'pending_verification':
      return {
        tone: 'info',
        title: 'Still under review',
        body: "An admin has not approved this application yet. We'll email you as soon as it is.",
      };
    default:
      return {
        tone: 'info',
        title: 'No application found',
        body: 'We could not find a technician application for that email. Check the spelling of the address you registered with.',
      };
  }
};

export default function VerifyPendingScreen({ onBackToLogin, email }: VerifyPendingScreenProps): React.JSX.Element {
  const registeredEmail = String(email || '').trim().toLowerCase();
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState(registeredEmail);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async (): Promise<void> => {
    const target = query.trim().toLowerCase();
    if (!target) {
      setError('Enter the email you registered with.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const data = (await checkTechnicianStatus(target)) as StatusResult;
      setResult(data ?? null);
    } catch (failure) {
      const message = (failure as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (failure as Error)?.message
        || 'Unable to check the status right now.';
      setError(message);
      setResult(null);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckPress = (): void => {
    setFormOpen(true);
    if (query.trim()) void runCheck();
  };

  const summary = describe(result, query.trim().toLowerCase() || registeredEmail);
  const approved = result?.status === 'active';

  return (
    <View style={styles.screen}>
      <View style={styles.iconWrap}>
        <Ionicons name="shield-checkmark-outline" size={36} color={BLUE} />
      </View>
      <Text style={styles.title}>Verification Pending</Text>
      <Text style={styles.copy}>We&apos;re reviewing your application. You&apos;ll receive an email within 24–48 hours.</Text>
      <View style={styles.nextCard}>
        <Text style={styles.nextTitle}>What happens next?</Text>
        <Text style={styles.nextItem}>1. Background check initiated</Text>
        <Text style={styles.nextItem}>2. Skills verification</Text>
        <Text style={styles.nextItem}>3. Account activation</Text>
      </View>

      {formOpen && (
        <View style={styles.checkCard}>
          <Text style={styles.nextTitle}>Check your status</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="you@email.com"
            placeholderTextColor={colors.subtle}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email used at registration"
            onSubmitEditing={() => void runCheck()}
          />
          <TouchableOpacity
            style={[styles.checkButton, checking && styles.checkButtonBusy]}
            onPress={() => void runCheck()}
            disabled={checking}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Check application status"
            accessibilityState={{ disabled: checking }}
          >
            {checking
              ? <ActivityIndicator size="small" color={colors.onAccent} />
              : <Text style={styles.checkButtonText}>Check Status</Text>}
          </TouchableOpacity>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {summary ? (
            <View style={[
              styles.resultCard,
              summary.tone === 'ok' ? styles.resultOk : summary.tone === 'bad' ? styles.resultBad : styles.resultInfo,
            ]}>
              <Text style={styles.resultTitle}>{summary.title}</Text>
              <Text style={styles.resultBody}>{summary.body}</Text>
            </View>
          ) : null}
        </View>
      )}

      {approved ? (
        <TouchableOpacity onPress={onBackToLogin} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go to sign in">
          <Text style={styles.link}>Sign In →</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            onPress={handleCheckPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Check application status"
            style={styles.checkLinkRow}
          >
            <Text style={styles.link}>Check Status</Text>
            <Ionicons name="arrow-forward" size={15} color={BLUE} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onBackToLogin} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Back to sign in">
            <Text style={styles.linkMuted}>Back to Sign In</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = themedStyles({
  screen: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24, gap: 4 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.techMist, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: colors.gray900, fontSize: 24, fontFamily: fonts.extraBold, marginBottom: 8, textAlign: 'center' },
  copy: { color: colors.gray500, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  nextCard: { alignSelf: 'stretch', backgroundColor: colors.techSoft, borderWidth: 1, borderColor: colors.badgeBlueBorder, borderRadius: 16, padding: 16, marginBottom: 20 },
  nextTitle: { color: colors.deepBlue, fontSize: 14, fontFamily: fonts.bold, marginBottom: 8 },
  nextItem: { color: colors.tech, fontSize: 13, fontFamily: fonts.regular, lineHeight: 22 },
  checkCard: { alignSelf: 'stretch', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray200, borderRadius: 16, padding: 16, marginBottom: 16, gap: 10 },
  input: { borderWidth: 1, borderColor: colors.gray200, backgroundColor: colors.appBg, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 14, fontFamily: fonts.regular, color: colors.gray900 },
  checkButton: { backgroundColor: BLUE, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  checkButtonBusy: { opacity: 0.7 },
  checkButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  errorText: { color: colors.error, fontSize: 12, fontFamily: fonts.medium, lineHeight: 16 },
  resultCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  resultOk: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  resultBad: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  resultInfo: { backgroundColor: colors.techSoft, borderColor: colors.badgeBlueBorder },
  resultTitle: { color: colors.gray900, fontSize: 13, fontFamily: fonts.bold },
  resultBody: { color: colors.gray600, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
  link: { color: BLUE, fontSize: 14, fontFamily: fonts.semiBold },
  linkMuted: { color: colors.gray500, fontSize: 13, fontFamily: fonts.semiBold, marginTop: 14 },
  checkLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
