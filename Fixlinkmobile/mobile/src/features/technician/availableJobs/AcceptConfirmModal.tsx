// Accept-job confirm modal (in-app modal because Alert buttons do not fire
// reliably on web). Moved verbatim from AvailableJobsScreen.tsx.
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { colors } from '../../../theme';
import type { JobItem } from '../availableJobsHelpers';
import { styles } from './availableJobsStyles';

interface AcceptConfirmModalProps {
  job: JobItem | null;
  accepting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const AcceptConfirmModal = ({ job, accepting, onCancel, onConfirm }: AcceptConfirmModalProps): React.JSX.Element => (
  <Modal visible={job !== null} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.confirmBackdrop}>
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>Accept this repair request?</Text>
        <Text style={styles.confirmCopy} numberOfLines={2}>
          {job?.applianceType || 'Repair request'}
        </Text>
        <Text style={styles.confirmSub} numberOfLines={1}>
          Location: {job?.location || 'Local Catchment'}
        </Text>
        <Text style={styles.confirmNote}>
          The customer is notified immediately and live GPS navigation unlocks.
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel accept"
            onPress={onCancel}
            disabled={accepting}
            style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressedSoft]}
          >
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm accept job"
            onPress={onConfirm}
            disabled={accepting}
            style={({ pressed }) => [styles.primaryBtn, styles.confirmAccept, pressed && styles.pressedSoft]}
          >
            {accepting ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Accept Job</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);
