// 4-digit OTP completion handshake modal.
// Moved verbatim from AvailableJobsScreen.tsx, including the input
// auto-focus effect. No visual or behavior change.
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { styles } from './availableJobsStyles';

interface OtpModalProps {
  visible: boolean;
  otpCode: string;
  verifying: boolean;
  onChangeCode: (code: string) => void;
  onClose: () => void;
  onVerify: () => void;
}

export const OtpModal = ({ visible, otpCode, verifying, onChangeCode, onClose, onVerify }: OtpModalProps): React.JSX.Element => {
  const otpInputRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => otpInputRef.current?.focus?.(), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalKicker}>COMPLETION HANDSHAKE</Text>
              <Text style={styles.modalTitle}>Enter 4-Digit Code</Text>
            </View>
            <Pressable
              hitSlop={12}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close OTP modal"
              style={styles.modalCloseTarget}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <Text style={styles.modalDesc}>
            Ask the customer to display their 4-digit completion code on their FixLink phone screen to confirm repair closeout.
          </Text>

          {/* Tappable 4-Box PIN Display - tap to focus keyboard */}
          <Pressable
            onPress={() => otpInputRef.current?.focus?.()}
            accessibilityRole="button"
            accessibilityLabel="Enter 4-digit code"
          >
            <View style={styles.pinBoxesContainer}>
              {[0, 1, 2, 3].map((idx) => {
                const digit = otpCode[idx] ?? '';
                const isFocused = otpCode.length === idx;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinBox,
                      digit !== '' && styles.pinBoxFilled,
                      isFocused && styles.pinBoxActive
                    ]}
                  >
                    <Text style={styles.pinDigit}>{digit}</Text>
                  </View>
                );
              })}
            </View>
          </Pressable>

          {/* Visible numeric input - drives the 4-box display */}
          <TextInput
            ref={otpInputRef}
            style={styles.otpVisibleInput}
            value={otpCode}
            onChangeText={(text) => onChangeCode(text.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus={true}
            placeholder="Type 4-digit code here"
            placeholderTextColor={colors.muted}
            textAlign="center"
          />

          <Pressable
            style={[styles.primaryBtn, { width: '100%', marginTop: 8 }]}
            onPress={onVerify}
            disabled={verifying}
            accessibilityRole="button"
            accessibilityLabel="Verify and finalize job"
          >
            {verifying ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.primaryBtnText}>Verify and Complete Job</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};
