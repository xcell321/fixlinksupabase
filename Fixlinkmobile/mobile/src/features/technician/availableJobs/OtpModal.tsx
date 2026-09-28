// 4-digit OTP completion handshake sheet.
// Follows the compact reference layout: title, one instruction line, then the
// dot field and the verify button on a single row. The dot field is the only
// visible affordance — an invisible input sits on top of it so tapping
// anywhere in the field opens the number pad.
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { styles } from './availableJobsStyles';

const CODE_LENGTH = 4;

interface OtpModalProps {
  visible: boolean;
  otpCode: string;
  verifying: boolean;
  // Inline failure copy from the last verify attempt; null when there is none.
  error?: string | null;
  onChangeCode: (code: string) => void;
  onClose: () => void;
  onVerify: () => void;
}

export const OtpModal = ({
  visible,
  otpCode,
  verifying,
  error = null,
  onChangeCode,
  onClose,
  onVerify
}: OtpModalProps): React.JSX.Element => {
  const otpInputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => otpInputRef.current?.focus?.(), 300);
      return () => clearTimeout(t);
    }
    setFocused(false);
  }, [visible]);

  const isComplete = otpCode.length === CODE_LENGTH;
  const isVerifyDisabled = verifying || !isComplete;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>Verify completion OTP</Text>
              <Text style={styles.modalSubtitle}>Ask the customer for their 4-digit code.</Text>
            </View>
            <Pressable
              hitSlop={12}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close OTP verification"
              style={styles.modalCloseTarget}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.otpRow}>
            <View
              style={[
                styles.otpField,
                focused && styles.otpFieldFocused,
                error ? styles.otpFieldError : null
              ]}
            >
              <View style={styles.otpDots} pointerEvents="none">
                {[0, 1, 2, 3].map((idx) => (
                  <View
                    key={idx}
                    style={[styles.otpDot, idx < otpCode.length && styles.otpDotFilled]}
                  />
                ))}
              </View>
              <TextInput
                ref={otpInputRef}
                style={styles.otpCaptureInput}
                value={otpCode}
                onChangeText={(text) => onChangeCode(text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                autoFocus={true}
                caretHidden={true}
                contextMenuHidden={true}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                accessibilityLabel="4-digit completion code"
                accessibilityHint="Type the code shown on the customer's FixLink screen, then verify"
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.otpVerifyBtn,
                isVerifyDisabled && styles.otpVerifyBtnDisabled,
                pressed && !isVerifyDisabled && styles.pressedSoft
              ]}
              onPress={onVerify}
              disabled={isVerifyDisabled}
              accessibilityRole="button"
              accessibilityLabel="Verify OTP"
              accessibilityState={{ disabled: isVerifyDisabled, busy: verifying }}
            >
              {verifying ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text
                  style={[styles.otpVerifyBtnText, isVerifyDisabled && styles.otpVerifyBtnTextDisabled]}
                >
                  Verify OTP
                </Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.otpErrorRow} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.otpErrorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
