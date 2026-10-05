import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, themedStyles } from '../theme';

interface BackCameraSheetProps {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
}

/**
 * Back-camera-only capture sheet for the repair problem photo.
 *
 * Unlike the OS image picker (which lets the user flip to the front camera),
 * this renders an in-app CameraView locked to `facing="back"` with no flip
 * control, so the problem photo always comes from the rear camera. Mirrors
 * the face-login CameraView pattern in LoginScreen, reversed.
 */
export default function BackCameraSheet({ visible, onClose, onCaptured }: BackCameraSheetProps): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const handleCapture = async (): Promise<void> => {
    if (capturing) return;
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setCaptureError('Allow camera access to take a picture of the problem.');
        return;
      }
    }
    setCapturing(true);
    setCaptureError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 }) ?? null;
      if (!photo?.uri) {
        setCaptureError('Could not capture the photo. Try again.');
        return;
      }
      onCaptured(photo.uri);
    } catch {
      setCaptureError('Could not capture the photo. Try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleClose = (): void => {
    setCaptureError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Take a live photo</Text>
              <Text style={styles.subtitle}>Back camera only</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close camera"
              hitSlop={8}
              onPress={handleClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.previewWrap}>
            <CameraView ref={cameraRef} style={styles.preview} facing="back" />
          </View>

          {captureError ? (
            <Text style={styles.errorText} accessibilityRole="alert">{captureError}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture problem photo"
            onPress={() => { void handleCapture(); }}
            disabled={capturing}
            style={({ pressed }) => [styles.captureButton, pressed && !capturing && styles.pressedSoft]}
          >
            {capturing ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Ionicons name="camera" size={18} color={colors.onAccent} />
                <Text style={styles.captureText}>Capture</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerSpacer: { width: 32 },
  headerCopy: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 3 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center' },
  previewWrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.line },
  preview: { width: '100%', height: 320 },
  errorText: { color: colors.danger, fontSize: 12, fontFamily: fonts.medium, marginTop: 10, textAlign: 'center' },
  captureButton: { marginTop: 14, minHeight: 52, borderRadius: 14, backgroundColor: colors.customer, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  captureText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
});
