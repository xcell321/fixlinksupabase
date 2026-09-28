// Add a portfolio photo — ONE photo at a time, described first.
//
// The technician picks a single completed-repair photo, then fills in what the
// repair was and which model it was, so the portfolio card can show real
// information instead of a raw file name. The upload timestamp is captured
// automatically at upload; the form never asks for a date.
//
// Same sheet grammar as the other sheets: ink scrim, white sheet with a 28px
// top radius, 4px-grid spacing, accent-tinted icon tiles, 44px+ touch targets.
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadPortfolioPhoto } from '../services/api';
import { colors, fonts, themedStyles } from '../theme';

export interface PortfolioPhotoItem {
  url: string;
  name?: string;
  uploadedAt?: string;
  // Described by the technician on upload.
  repairType?: string;
  model?: string;
}

interface PortfolioPhotoSheetProps {
  visible: boolean;
  technicianUid: string;
  onClose: () => void;
  onUploaded: (portfolio: PortfolioPhotoItem[]) => void;
}

type PickedPhoto = { uri: string; fileName?: string; mimeType?: string };

export default function PortfolioPhotoSheet({ visible, technicianUid, onClose, onUploaded }: PortfolioPhotoSheetProps): React.JSX.Element {

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [repairType, setRepairType] = useState('');
  const [model, setModel] = useState('');
  const [errors, setErrors] = useState<{ photo?: string; repairType?: string; model?: string }>({});
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setPhoto(null);
    setRepairType('');
    setModel('');
    setErrors({});
    setUploading(false);
  };

  const close = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const choosePhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setErrors((current) => ({ ...current, photo: 'Allow photo access to add a repair photo.' }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets?.[0];
      if (asset) {
        setPhoto({ uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType ?? undefined });
        setErrors((current) => ({ ...current, photo: undefined }));
      }
    }
  };

  const validate = (): boolean => {
    const next: { photo?: string; repairType?: string; model?: string } = {};
    if (!photo) next.photo = 'Choose a photo of the completed repair.';
    if (repairType.trim().length < 2) next.repairType = 'Tell us what repair this was.';
    if (model.trim().length < 2) next.model = 'Add the brand and model.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (): Promise<void> => {
    if (uploading || !validate() || !photo) return;
    setUploading(true);
    try {
      const result = await uploadPortfolioPhoto(
        technicianUid,
        photo,
        { repairType: repairType.trim(), model: model.trim() },
      ) as { portfolio?: PortfolioPhotoItem[] };
      onUploaded(Array.isArray(result?.portfolio) ? result.portfolio : []);
      reset();
      onClose();
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'We could not upload the photo. Please try again.';
      setErrors((current) => ({ ...current, photo: message }));
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="images-outline" size={18} color={colors.tech} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title} accessibilityRole="header">Add portfolio photo</Text>
              <Text style={styles.subtitle}>One photo, with what you fixed</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close add photo"
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressedSoft]}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Photo */}
            <Text style={styles.label}>PHOTO</Text>
            {photo ? (
              <View>
                <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" accessibilityLabel="Selected repair photo" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change photo"
                  onPress={choosePhoto}
                  style={({ pressed }) => [styles.changeButton, pressed && styles.pressedSoft]}
                >
                  <Ionicons name="refresh-outline" size={14} color={colors.tech} />
                  <Text style={styles.changeText}>Change photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a photo"
                onPress={choosePhoto}
                style={({ pressed }) => [styles.picker, pressed && styles.pressedSoft]}
              >
                <Ionicons name="camera-outline" size={26} color={colors.tech} />
                <Text style={styles.pickerTitle}>Choose a photo</Text>
                <Text style={styles.pickerHint}>One completed repair photo</Text>
              </Pressable>
            )}
            {errors.photo ? <Text style={styles.errorText}>{errors.photo}</Text> : null}

            {/* Repair type */}
            <Text style={styles.label}>WHAT REPAIR</Text>
            <TextInput
              style={[styles.input, errors.repairType && styles.inputError]}
              value={repairType}
              onChangeText={(text) => { setRepairType(text); if (errors.repairType) setErrors((c) => ({ ...c, repairType: undefined })); }}
              placeholder="e.g. Refrigerator not cooling"
              placeholderTextColor={colors.subtle}
              maxLength={80}
              accessibilityLabel="What repair"
            />
            {errors.repairType ? <Text style={styles.errorText}>{errors.repairType}</Text> : null}

            {/* Model */}
            <Text style={styles.label}>BRAND &amp; MODEL</Text>
            <TextInput
              style={[styles.input, errors.model && styles.inputError]}
              value={model}
              onChangeText={(text) => { setModel(text); if (errors.model) setErrors((c) => ({ ...c, model: undefined })); }}
              placeholder="e.g. Samsung RB27"
              placeholderTextColor={colors.subtle}
              maxLength={80}
              accessibilityLabel="Brand and model"
            />
            {errors.model ? <Text style={styles.errorText}>{errors.model}</Text> : null}

            <View style={styles.noteRow}>
              <Ionicons name="time-outline" size={13} color={colors.muted} />
              <Text style={styles.noteText}>The upload date is added automatically when you save.</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload photo"
              accessibilityState={{ disabled: uploading }}
              disabled={uploading}
              onPress={submit}
              style={({ pressed }) => [styles.primaryButton, pressed && !uploading && styles.pressed]}
            >
              {uploading
                ? <ActivityIndicator size="small" color={colors.onAccent} />
                : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.onAccent} />
                    <Text style={styles.primaryButtonText}>Upload photo</Text>
                  </>
                )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={uploading}
              onPress={close}
              style={({ pressed }) => [styles.secondaryButton, pressed && !uploading && styles.pressedSoft]}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles({
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 },
  pressedSoft: { transform: [{ scale: 0.97 }], opacity: 0.94 },

  overlay: { flex: 1, backgroundColor: 'rgba(16, 42, 67, 0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24, maxHeight: '90%' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.techSoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },

  body: { paddingTop: 16, paddingBottom: 8 },
  label: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.bold, marginBottom: 6, marginTop: 16 },

  picker: { minHeight: 148, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pickerTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold, marginTop: 4 },
  pickerHint: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular },

  preview: { width: '100%', height: 180, borderRadius: 16, backgroundColor: colors.lineSoft },
  changeButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, marginTop: 8, borderRadius: 12, backgroundColor: colors.techSoft },
  changeText: { color: colors.tech, fontSize: 13, fontFamily: fonts.bold },

  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 52, fontSize: 14, fontFamily: fonts.medium, color: colors.ink, backgroundColor: colors.appBg },
  inputError: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.dangerText, fontSize: 12, fontFamily: fonts.semiBold, marginTop: 6, lineHeight: 16 },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 20 },
  noteText: { flex: 1, color: colors.muted, fontSize: 11.5, lineHeight: 16, fontFamily: fonts.regular },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  primaryButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.tech, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  secondaryButton: { minWidth: 88, minHeight: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.muted, fontSize: 14, fontFamily: fonts.semiBold },
});
