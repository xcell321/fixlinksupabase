// @ts-nocheck - migrated from .js, preserve working state; types to be refined incrementally
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, Modal, FlatList, ActivityIndicator, Image } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from "../../components/DateTimePicker";
import { PhotoLightbox } from "../../components/RequestPhoto";
import { submitRepairRequest, fetchPlatformCategories } from "../services/api";
import { geocodeAddress } from "../services/locationIq";
import CustomerLocationMap from "../../components/CustomerLocationMap";
import { colors, fonts, shadows } from '../../theme';
import { getApplianceIcon } from '../../utils/applianceIcons';

// Place types that read as "business/store/landmark" so we can pick a fitting icon
const STORE_LIKE_TYPES = ['mall', 'department_store', 'shop', 'supermarket', 'bank', 'hospital', 'university', 'school', 'pharmacy', 'hotel', 'restaurant', 'fast_food', 'cafe', 'travel_agency', 'doctors', 'clinic'];

const suggestionIconFor = (type) => (STORE_LIKE_TYPES.includes(type) ? 'business-outline' : 'location-outline');

const APPLIANCE_OPTIONS = [
  'Home Appliances',
  'Mobile Devices',
  'Networking & Internet Devices',
  'Television & Entertainment',
  'Computer & Laptop',
  'Personal & Beauty Electronics',
  'Air Conditioning & Cooling',
  'Office & Business Equipment',
  'Other Electronic Devices',
  'CCTV & Security Devices'
];

const TIME_SLOTS = [
  'Morning (8AM-12PM)',
  'Afternoon (1PM-5PM)',
  'Evening (5PM-8PM)'
];

const STEPS = [
  { key: 'appliance', label: 'Appliance', title: 'Select Device Type', subtitle: 'What needs fixing?' },
  { key: 'problem', label: 'Problem', title: "What's wrong?", subtitle: 'Describe the issue and add a photo if it helps.' },
  { key: 'schedule', label: 'Schedule', title: 'When should we come?', subtitle: 'Pick a preferred date and time window.' },
  { key: 'location', label: 'Location', title: 'Where is the service?', subtitle: 'Pin the address so the technician can find you.' },
];

const TOTAL_STEPS = 4;

export default function SubmitRequestScreen({ currentUser, customerName, onNavigateToProgress, onClose }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepErrors, setStepErrors] = useState({});
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [brandModel, setBrandModel] = useState("");
  const [drillCategory, setDrillCategory] = useState(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState(null);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [date, setDate] = useState(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('Afternoon (1PM-5PM)');
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mode, setMode] = useState('date');
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const scrollRef = useRef(null);

  const composedLocation = [street.trim(), city.trim(), zipCode.trim()].filter(Boolean).join(', ');

  useEffect(() => {
    fetchPlatformCategories().then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  const applianceOptions = categoryOptions.length
    ? categoryOptions.map((category) => String(category.name || '').trim()).filter(Boolean)
    : APPLIANCE_OPTIONS;

  const displayAppliance = selectedDevice
    ? `${selectedCategoryName} - ${selectedDevice}`
    : selectedCategoryName || "Select appliance type";

  const selectedCategoryObj = categoryOptions.find((c) => String(c.name || '').trim() === selectedCategoryName) || null;
  const selectedHasDevices = selectedCategoryObj && Array.isArray(selectedCategoryObj.devices) && selectedCategoryObj.devices.filter(Boolean).length > 0;

  const pickCategory = (category) => {
    const devices = Array.isArray(category.devices) ? category.devices.map((device) => String(device).trim()).filter(Boolean) : [];
    if (devices.length === 0) {
      setSelectedCategoryName(category.name);
      setSelectedDevice("");
      setModalVisible(false);
      if (stepErrors.category) setStepErrors((p) => { const n = { ...p }; delete n.category; return n; });
      return;
    }
    setDrillCategory({ ...category, devices });
  };

  const handleLocate = async () => {
    setLocating(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocating(false);
      Alert.alert('Permission Denied', 'Permission to access location was denied');
      return;
    }
    try {
      // Always fresh GPS - never cached, High accuracy for Medellin/Dakit etc
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      // Set coords immediately from GPS - never from old cache or Gairan fallback
      setCoords({ latitude: lat, longitude: lon });
      if (stepErrors.location) setStepErrors((p) => { const n = { ...p }; delete n.location; return n; });
      const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (geocode && geocode.length > 0) {
        const a = geocode[0];
        // Use fresh reverseGeocode only - do not geocode the string "Gairan" again
        if (a.street) setStreet(a.street);
        else if (a.name) setStreet(a.name);
        if (a.city) setCity(a.city);
        else if (a.subregion) setCity(a.subregion);
        if (a.postalCode) setZipCode(a.postalCode);
        else if (a.postalCode === null && a.region) setZipCode('');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to fetch location details.');
    } finally {
      setLocating(false);
    }
  };

  // Auto-detect all location inputs when entering Step 4
  useEffect(() => {
    if (currentStep === 4 && !street.trim() && !city.trim()) {
      handleLocate();
    }
  }, [currentStep]);

  // Auto-geocode as user types street/city/zip to keep map in sync
  useEffect(() => {
    if (currentStep !== 4) return;
    const q = composedLocation;
    if (!q || q.length < 5) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await geocodeAddress(q);
        if (!cancelled && res) setCoords({ latitude: res.latitude, longitude: res.longitude });
      } catch {}
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [composedLocation, currentStep]);

  // Optional problem photo: helps the technician see the issue before
  // accepting. Kept local until submit; uploaded as multipart `photo`.
  const normalizePhotoAsset = (asset) => {
    if (!asset?.uri) return null;
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert('Photo too large', 'Please choose a photo under 5MB.');
      return null;
    }
    return {
      uri: asset.uri,
      fileName: asset.fileName || 'repair-photo.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
    };
  };

  const pickFromLibrary = async () => {
    setPhotoBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Photo permission needed', 'Allow photo access to attach a picture of the problem.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const normalized = normalizePhotoAsset(result.assets[0]);
        if (normalized) setPhoto(normalized);
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const takePhoto = async () => {
    setPhotoBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Camera permission needed', 'Allow camera access to take a picture of the problem.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
      if (!result.canceled && result.assets?.length > 0) {
        const normalized = normalizePhotoAsset(result.assets[0]);
        if (normalized) setPhoto(normalized);
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoAction = () => {
    if (photoBusy) return;
    Alert.alert('Add a photo', 'Show the technician what needs fixing.', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from gallery', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleDateValue = (selectedDate) => {
    setShowDatePicker(false);
    if (!selectedDate) return;

    if (mode === 'date') {
      const updated = new Date(date);
      updated.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setDate(updated);
      if (stepErrors.date) setStepErrors((p) => { const n = { ...p }; delete n.date; return n; });
    } else {
      const updated = new Date(date);
      updated.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      setDate(updated);
      const formattedTime = selectedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      setSelectedTimeSlot(formattedTime);
      setIsCustomTime(true);
    }
  };

  const handleDateDismiss = () => {
    setShowDatePicker(false);
  };

  const validateStep = (step) => {
    const next = { ...stepErrors };
    let valid = true;
    if (step === 1) {
      if (!selectedCategoryName.trim()) {
        next.category = 'Choose the appliance that needs repair.';
        valid = false;
      } else {
        delete next.category;
      }
    }
    if (step === 2) {
      if (!description.trim()) {
        next.description = 'Add a short description so the technician can prepare.';
        valid = false;
      } else {
        delete next.description;
      }
    }
    if (step === 3) {
      const today = new Date(); today.setHours(0,0,0,0);
      const d = new Date(date); d.setHours(0,0,0,0);
      if (d < today) {
        next.date = 'Choose today or a future date.';
        valid = false;
      } else {
        delete next.date;
      }
    }
    if (step === 4) {
      if (!street.trim()) {
        next.location = 'Enter the street address.';
        valid = false;
      } else {
        delete next.location;
      }
    }
    setStepErrors(next);
    return valid;
  };

  const canContinueForStep = (step) => {
    if (step === 1) return !!selectedCategoryName.trim();
    if (step === 2) return !!description.trim();
    if (step === 3) {
      const today = new Date(); today.setHours(0,0,0,0);
      const d = new Date(date); d.setHours(0,0,0,0);
      return d >= today;
    }
    if (step === 4) return !!street.trim();
    return true;
  };

  const handleContinue = () => {
    const ok = validateStep(currentStep);
    if (!ok) return;
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => Math.min(TOTAL_STEPS, s + 1));
      // scroll to top for next step
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => Math.max(1, s - 1));
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    }
  };

  const handleSubmit = async () => {
    const fullLocation = composedLocation + (notes.trim() ? ` (${notes.trim()})` : '');
    // Final guard: validate all steps inline before network call
    const allValid = [1,2,3,4].every((s) => {
      if (s === 1 && !selectedCategoryName.trim()) return false;
      if (s === 2 && !description.trim()) return false;
      if (s === 3) {
        const today = new Date(); today.setHours(0,0,0,0);
        const d = new Date(date); d.setHours(0,0,0,0);
        if (d < today) return false;
      }
      if (s === 4 && !street.trim()) return false;
      return true;
    });
    if (!allValid) {
      // surface inline errors and jump to first failing step
      const next = {};
      if (!selectedCategoryName.trim()) next.category = 'Choose the appliance that needs repair.';
      if (!description.trim()) next.description = 'Add a short description so the technician can prepare.';
      const today = new Date(); today.setHours(0,0,0,0);
      const d = new Date(date); d.setHours(0,0,0,0);
      if (d < today) next.date = 'Choose today or a future date.';
      if (!street.trim()) next.location = 'Enter the street address.';
      setStepErrors(next);
      if (!selectedCategoryName.trim()) setCurrentStep(1);
      else if (!description.trim()) setCurrentStep(2);
      else if (d < today) setCurrentStep(3);
      else setCurrentStep(4);
      return;
    }

    if (!selectedCategoryName || !description || !street.trim()) {
      // fallback generic alert for any edge path, but inline is primary
      const missing = !selectedCategoryName ? 'appliance' : !description ? 'description' : 'location';
      setStepErrors((p) => ({ ...p, [missing]: 'This field is required.' }));
      return;
    }
    setLoading(true);
    try {
      let finalCoords = coords;
      // Geocode the typed address so the technician can navigate to it
      if (!finalCoords && composedLocation) {
        try {
          const geocoded = await geocodeAddress(composedLocation);
          if (geocoded) {
            finalCoords = { latitude: geocoded.latitude, longitude: geocoded.longitude };
          }
        } catch (geoErr) {
          console.warn('Geocoding fallback failed:', geoErr);
        }
      }

      const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const finalPreferredTime = selectedTimeSlot || date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

      const finalApplianceType = selectedDevice || selectedCategoryName;
      const finalDescription = brandModel.trim() ? `[${brandModel.trim()}] ${description}` : description;

      await submitRepairRequest({
        customerName: currentUser?.name || customerName,
        customerUid: currentUser?.uid,
        applianceType: finalApplianceType,
        category: selectedCategoryName,
        description: finalDescription,
        location: fullLocation,
        ...(finalCoords?.latitude && { latitude: finalCoords.latitude }),
        ...(finalCoords?.longitude && { longitude: finalCoords.longitude }),
        preferredDate: formattedDate,
        preferredTime: finalPreferredTime,
        scheduledDate: date.toISOString(),
        ...(photo?.uri ? { photo } : {}),
      });
      
      Alert.alert(
        "Request Submitted!",
        "We're finding a technician that matches your request.",
        [
          { text: "View Progress", onPress: onNavigateToProgress }
        ]
      );

      setSelectedCategoryName("");
      setSelectedDevice("");
      setBrandModel("");
      setDrillCategory(null);
      setDescription("");
      setPhoto(null);
      setPhotoViewerVisible(false);
      setLocation("");
      setStreet("");
      setCity("");
      setZipCode("");
      setNotes("");
      setCoords(null);
      setDate(new Date());
      setSelectedTimeSlot('Afternoon (1PM-5PM)');
      setIsCustomTime(false);
      setCurrentStep(1);
      setStepErrors({});
    } catch (error: any) {
      const msg = error?.error || error?.message || (typeof error === 'string' ? error : JSON.stringify(error)) || 'Network Error - check backend 5050';
      console.log('Submit failed:', msg, error);
      Alert.alert("Submit Error", String(msg));
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    if (currentStep === 1) {
      return (
        <View style={styles.stepBody}>
          {!!selectedDevice && (
            <View style={styles.selectedMetaRow}>
              <View style={styles.miniPill}>
                <Ionicons name="checkmark-circle" size={12} color={colors.customer} />
                <Text style={styles.miniPillText} numberOfLines={1}>{selectedCategoryName}</Text>
              </View>
              <View style={[styles.miniPill, styles.miniPillDevice]}>
                <Ionicons name="construct-outline" size={11} color={colors.ink} />
                <Text style={[styles.miniPillText, { color: colors.ink }]} numberOfLines={1}>{selectedDevice}</Text>
              </View>
            </View>
          )}

          {/* 2x2 device grid - 4 cards only, like Figma design */}
          <View style={styles.quickPickWrap}>
            <View style={styles.deviceGrid}>
              {applianceOptions.slice(0, 4).map((name) => {
                const isActive = selectedCategoryName === name;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.deviceCard, isActive && styles.deviceCardActive]}
                    onPress={() => {
                      const cat = categoryOptions.find((c) => String(c.name || '').trim() === name);
                      if (cat) pickCategory(cat);
                      else { setSelectedCategoryName(name); setSelectedDevice(''); }
                      if (stepErrors.category) setStepErrors((p) => { const n = { ...p }; delete n.category; return n; });
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${name}`}
                    hitSlop={8}
                  >
                    <View style={[styles.deviceIconTile, isActive && styles.deviceIconTileActive]}>
                      <Ionicons name={getApplianceIcon(name) as never} size={32} color={isActive ? colors.customer : colors.muted} />
                    </View>
                    <Text style={styles.deviceCardText} numberOfLines={2}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!stepErrors.category && <Text style={styles.errorText} accessibilityLiveRegion="polite">{stepErrors.category}</Text>}
            <TouchableOpacity style={styles.viewAllCategoriesRow} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
              <Text style={styles.viewAllCategoriesText}>Browse all {applianceOptions.length} categories</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.customer} />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (currentStep === 2) {
      return (
        <View style={styles.stepBody}>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Device brand & model</Text>
            </View>
            <View style={styles.textInputContainer}>
              <Ionicons name="hardware-chip-outline" size={18} color={colors.muted} />
              <TextInput
                style={styles.textInputSingle}
                placeholder="e.g. Dell XPS 15 9530"
                placeholderTextColor={colors.muted}
                value={brandModel}
                onChangeText={setBrandModel}
                accessibilityLabel="Device brand and model"
                maxLength={80}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Problem description</Text>
              <Text style={styles.requiredMark}> *</Text>
            </View>
            <View style={[styles.textAreaContainer, !!stepErrors.description && styles.inputError]}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color={!!stepErrors.description ? colors.danger : colors.muted} style={{ marginTop: 2 }} />
              <TextInput
                style={styles.textArea}
                placeholder="Example: Refrigerator not cooling, makes a humming noise. Started yesterday..."
                placeholderTextColor={colors.muted}
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  if (stepErrors.description && t.trim()) setStepErrors((p) => { const n = { ...p }; delete n.description; return n; });
                }}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Problem description"
                maxLength={600}
              />
            </View>
            <View style={styles.charRow}>
              {!!stepErrors.description && (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">{stepErrors.description}</Text>
              )}
              <Text style={styles.charCount}>{description.length}/600</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Problem photo <Text style={styles.optionalLabel}>(optional)</Text></Text>
              <View style={styles.photoBadge}>
                <Ionicons name="shield-checkmark-outline" size={10} color={colors.customer} />
                <Text style={styles.photoBadgeText}>Seen before accept</Text>
              </View>
            </View>
            {photo?.uri ? (
              <View style={styles.photoPreview}>
                <TouchableOpacity onPress={() => setPhotoViewerVisible(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Preview attached photo">
                  <Image source={{ uri: photo.uri }} style={styles.photoPreviewImage} />
                </TouchableOpacity>
                <View style={styles.photoPreviewCopy}>
                  <View style={styles.photoReadyRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.customer} />
                    <Text style={styles.photoReadyText}>Photo ready</Text>
                  </View>
                  <View style={styles.photoPreviewActions}>
                    <TouchableOpacity style={styles.photoSecondaryButton} onPress={handlePhotoAction} activeOpacity={0.7} disabled={photoBusy} accessibilityRole="button" accessibilityLabel="Replace photo" hitSlop={6}>
                      <Ionicons name="refresh-outline" size={14} color={colors.customer} />
                      <Text style={styles.photoSecondaryText}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoSecondaryButton} onPress={() => setPhoto(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6}>
                      <Ionicons name="trash-outline" size={14} color={colors.muted} />
                      <Text style={[styles.photoSecondaryText, { color: colors.muted }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoPicker} onPress={handlePhotoAction} activeOpacity={0.7} disabled={photoBusy} accessibilityRole="button" accessibilityLabel="Add a photo of the problem" hitSlop={8}>
                {photoBusy ? (
                  <ActivityIndicator size="small" color={colors.customer} />
                ) : (
                  <>
                    <View style={styles.photoPickerIcon}>
                      <Ionicons name="camera-outline" size={20} color={colors.customer} />
                    </View>
                    <View style={styles.photoPickerCopy}>
                      <Text style={styles.photoPickerTitle}>Add a photo of the problem</Text>
                      <Text style={styles.photoPickerSub}>Camera or gallery - JPG / PNG up to 5MB</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    if (currentStep === 3) {
      return (
        <View style={styles.stepBody}>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Preferred date</Text>
              <Text style={styles.requiredMark}> *</Text>
            </View>
            <TouchableOpacity 
              style={[styles.selectInput, !!stepErrors.date && styles.inputError]} 
              onPress={() => { setMode('date'); setShowDatePicker(true); }} 
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Select preferred date"
              hitSlop={8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={[styles.inputIconTile, styles.inputIconTileActive]}>
                  <Ionicons name="calendar-outline" size={16} color={colors.customer} />
                </View>
                <Text style={styles.selectInputText} numberOfLines={1}>
                  {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </TouchableOpacity>
            {!!stepErrors.date && (
              <Text style={styles.errorText}>{stepErrors.date}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Preferred time window</Text>
            </View>
            {/* Prototype slot rows with radio circles */}
            <View style={styles.slotList}>
              {TIME_SLOTS.map((slot) => {
                const isActive = selectedTimeSlot === slot && !isCustomTime;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.slotRow, isActive && styles.slotRowActive]}
                    onPress={() => {
                      setSelectedTimeSlot(slot);
                      setIsCustomTime(false);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={slot}
                    accessibilityState={{ selected: isActive }}
                    hitSlop={8}
                  >
                    <View style={[styles.slotRadio, isActive && styles.slotRadioActive]}>
                      {isActive ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />}
                    </View>
                    <Text style={styles.slotRowText}>{slot}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.slotRow, isCustomTime && styles.slotRowActive]}
                onPress={() => {
                  setMode('time');
                  setShowDatePicker(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Choose exact time"
                hitSlop={8}
              >
                <View style={[styles.slotRadio, isCustomTime && styles.slotRadioActive]}>
                  {isCustomTime ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : <Ionicons name="time-outline" size={14} color="#9CA3AF" />}
                </View>
                <Text style={styles.slotRowText}>
                  {isCustomTime ? selectedTimeSlot : 'Exact Time...'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.locationConfirmCard}>
            <View style={styles.locationConfirmIcon}>
              <Ionicons name="calendar-outline" size={16} color={colors.customer} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationConfirmTitle}>Appointment set</Text>
              <Text style={styles.locationConfirmSub} numberOfLines={2}>
                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} - {selectedTimeSlot}
              </Text>
            </View>
            <Ionicons name="shield-checkmark" size={16} color={colors.customer} />
          </View>
          <Text style={styles.helperText}>The technician confirms the exact arrival window after accepting.</Text>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode={mode}
              minimumDate={mode === 'date' ? new Date() : undefined}
              display="default"
              onValueChange={(_event, selectedDate) => handleDateValue(selectedDate)}
              onDismiss={handleDateDismiss}
              onNeutralButtonPress={handleDateDismiss}
            />
          )}
        </View>
      );
    }

    // Step 4 — reference Repair Location: map preview + street + city/ZIP + notes
    const clearLocationError = () => { if (stepErrors.location) setStepErrors((p) => { const n = { ...p }; delete n.location; return n; }); };
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepSectionTitle}>Repair Location</Text>
        <View style={styles.mapBox}>
          {coords ? (
            <CustomerLocationMap
              customerCoords={{ latitude: coords.latitude, longitude: coords.longitude, name: 'Service location' }}
              isAccepted={false}
              style={{ height: 144 }}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapPin}>
                <Ionicons name="location" size={20} color="#FFFFFF" />
              </View>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.locateRow} onPress={handleLocate} disabled={locating} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Use my current location">
          {locating ? (
            <ActivityIndicator size="small" color={colors.customer} />
          ) : (
            <Ionicons name="locate-outline" size={15} color={colors.customer} />
          )}
          <Text style={styles.locateRowText}>{locating ? 'Locating...' : 'Use my current location'}</Text>
        </TouchableOpacity>
        <View style={styles.inputGroup}>
          <Text style={styles.refLabel}>Street Address</Text>
          <View style={[styles.textInputContainer, !!stepErrors.location && styles.inputError]}>
            <TextInput
              style={styles.textInputSingle}
              placeholder="142 Oak Street, Apt 3B"
              placeholderTextColor={colors.muted}
              value={street}
              onChangeText={(t) => { setStreet(t); setCoords(null); clearLocationError(); }}
              accessibilityLabel="Street address"
              autoCorrect={false}
            />
          </View>
          {!!stepErrors.location && <Text style={styles.errorText}>{stepErrors.location}</Text>}
        </View>
        <View style={styles.twoColGrid}>
          <View style={[styles.inputGroup, styles.twoColCell]}>
            <Text style={styles.refLabel}>City</Text>
            <View style={styles.textInputContainer}>
              <TextInput
                style={styles.textInputSingle}
                placeholder="Bogo City"
                placeholderTextColor={colors.muted}
                value={city}
                onChangeText={(t) => { setCity(t); setCoords(null); }}
                accessibilityLabel="City"
                autoCorrect={false}
              />
            </View>
          </View>
          <View style={[styles.inputGroup, styles.twoColCell]}>
            <Text style={styles.refLabel}>ZIP Code</Text>
            <View style={styles.textInputContainer}>
              <TextInput
                style={styles.textInputSingle}
                placeholder="6005"
                placeholderTextColor={colors.muted}
                value={zipCode}
                onChangeText={setZipCode}
                accessibilityLabel="ZIP code"
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.refLabel}>Additional Notes</Text>
          <View style={styles.textInputContainer}>
            <TextInput
              style={styles.textInputSingle}
              placeholder="Landmark, gate code, leave at door, etc."
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              accessibilityLabel="Additional notes"
            />
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.centerWrap}>
      <View style={styles.refHeader}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.refBackBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.refHeaderTitle}>Repair Request</Text>
      </View>

      <View style={styles.card}>
        {/* Compact stepper only (dots + labels) - matches reference, big header removed */}
        <View style={styles.stepperHeader}>
          <View style={styles.stepDotsRow} accessibilityRole="progressbar" accessibilityValue={{ now: currentStep, min: 1, max: TOTAL_STEPS }}>
            {STEPS.map((s, idx) => {
              const stepNum = idx + 1;
              const isCompleted = stepNum < currentStep;
              const isActive = stepNum === currentStep;
              const isUpcoming = stepNum > currentStep;
              return (
                <View key={s.key} style={styles.dotCell}>
                  <View style={[styles.dot, isCompleted && styles.dotCompleted, isActive && styles.dotActive, isUpcoming && styles.dotUpcoming]}>
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={12} color={colors.white} />
                    ) : (
                      <Text style={[styles.dotText, isActive && styles.dotTextActive, isUpcoming && styles.dotTextUpcoming]}>{stepNum}</Text>
                    )}
                  </View>
                  <Text style={[styles.dotLabel, isActive && styles.dotLabelActive]} numberOfLines={1}>{s.label}</Text>
                  {idx < STEPS.length - 1 && (
                    <View style={[styles.dotConnector, stepNum < currentStep && styles.dotConnectorCompleted]} />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.stepHeadBlock}>
          <Text style={styles.stepHeadTitle}>{STEPS[currentStep - 1].title}</Text>
          <Text style={styles.stepHeadSub}>{STEPS[currentStep - 1].subtitle}</Text>
        </View>

        {renderStepContent()}

        {/* Nav row */}
        <View style={styles.navRow}>
          {currentStep > 1 ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleBack}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={16} color={colors.ink} />
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          ) : null}

          {currentStep < TOTAL_STEPS ? (
            <TouchableOpacity
              style={[styles.primaryButton, styles.primaryButtonFlex, !canContinueForStep(currentStep) && styles.primaryButtonMuted]}
              onPress={handleContinue}
              disabled={!canContinueForStep(currentStep)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Continue to next step"
              accessibilityState={{ disabled: !canContinueForStep(currentStep) }}
              hitSlop={8}
            >
              <Text style={[styles.primaryButtonText, !canContinueForStep(currentStep) && styles.primaryButtonTextMuted]}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, styles.primaryButtonFlex, loading && styles.primaryButtonMuted]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Submit repair request"
              hitSlop={8}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Submit Request</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {currentStep < TOTAL_STEPS && !canContinueForStep(currentStep) && (
          <Text style={styles.navHint}>Complete this step to continue.</Text>
        )}
      </View>

      {/* Selection Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => { setModalVisible(false); setDrillCategory(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalView}>
            <View style={styles.modalHeader}>
              {drillCategory ? (
                <TouchableOpacity style={styles.modalBackIcon} onPress={() => setDrillCategory(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back to categories" hitSlop={8}>
                  <Ionicons name="arrow-back" size={20} color={colors.ink} />
                </TouchableOpacity>
              ) : <View style={styles.modalBackIcon} />}

              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>{drillCategory ? 'Select Device' : 'Select Appliance'}</Text>
                {drillCategory ? (
                  <Text style={styles.modalSubtitle}>{drillCategory.name}</Text>
                ) : (
                  <Text style={styles.modalSubtitle}>Choose a category then pick your device</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setModalVisible(false); setDrillCategory(null); }} style={styles.modalCloseIcon} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.ink} />
              </TouchableOpacity>
            </View>

            {drillCategory ? (
              <FlatList
                data={drillCategory.devices}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isSelected = selectedCategoryName === drillCategory.name && selectedDevice === item;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                      onPress={() => { setSelectedCategoryName(drillCategory.name); setSelectedDevice(item); setDrillCategory(null); setModalVisible(false); if (stepErrors.category) setStepErrors((p) => { const n={...p}; delete n.category; return n; }); }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={item}
                      hitSlop={4}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={[styles.modalItemIcon, isSelected && styles.modalItemIconSelected]}>
                          <Ionicons name={getApplianceIcon(item) as never} size={15} color={isSelected ? colors.customer : colors.muted} />
                        </View>
                        <Text style={[styles.modalItemText, isSelected && styles.modalItemTextSelected]}>{item}</Text>
                      </View>
                      {isSelected ? <Ionicons name="checkmark-circle" size={18} color={colors.customer} /> : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <FlatList
                data={applianceOptions}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const category = categoryOptions.find((c) => String(c.name || '').trim() === item);
                  const deviceCount = category && Array.isArray(category.devices) ? category.devices.filter(Boolean).length : 0;
                  const isSelected = selectedCategoryName === item;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                      onPress={() => pickCategory(category || { name: item, devices: [] })}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={item}
                      hitSlop={4}
                    >
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.modalItemIcon, isSelected && styles.modalItemIconSelected]}>
                          <Ionicons name={getApplianceIcon(item) as never} size={16} color={isSelected ? colors.customer : colors.muted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.modalItemText, isSelected && styles.modalItemTextSelected]}>{item}</Text>
                          {deviceCount > 0 ? <Text style={styles.modalItemHint}>{deviceCount} device{deviceCount !== 1 ? 's' : ''} - tap to choose</Text> : null}
                        </View>
                      </View>
                      {isSelected ? <Ionicons name="checkmark-circle" size={18} color={colors.customer} /> : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>


      <PhotoLightbox
        visible={photoViewerVisible}
        photoUrl={photo?.uri}
        title="Problem photo"
        subtitle="Preview before submitting"
        onClose={() => setPhotoViewerVisible(false)}
      />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 36, backgroundColor: colors.white, alignItems: 'center' as const },
  centerWrap: { width: '100%' as const, maxWidth: 480, alignSelf: 'center' as const },
  sectionHeaderContainer: { marginBottom: 20, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  refHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 20 },
  refBackBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  refHeaderTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  kicker: { color: colors.customer, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.extraBold, marginBottom: 2, textTransform: 'uppercase' as const },
  screenKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.extraBold, textTransform: 'uppercase' as const },
  sectionTitle: { fontSize: 22, fontFamily: fonts.extraBold, color: colors.ink, letterSpacing: -0.3, lineHeight: 28 },
  sectionSubtitle: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted, lineHeight: 20, marginTop: 6 },

  card: { backgroundColor: colors.white, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.line, ...shadows.card, gap: 0 },

  // Stepper - tight within, generous separation between sections (spacing thesis)
  stepperHeader: { gap: 18, paddingBottom: 8 },
  stepperTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  stepKicker: { color: colors.customer, fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.extraBold, textTransform: 'uppercase' as const },
  stepTitle: { fontSize: 20, fontFamily: fonts.extraBold, color: colors.ink, letterSpacing: -0.3, marginTop: 6, lineHeight: 25 },
  stepSubtitle: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted, lineHeight: 20, marginTop: 2 },
  stepCountBadge: { minWidth: 44, height: 28, borderRadius: 14, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  stepCountText: { fontSize: 12, fontFamily: fonts.bold, color: colors.ink, fontVariant: ['tabular-nums'] as const },
  progressTrack: { flexDirection: 'row', gap: 6, marginTop: 2 },
  progressSegment: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.lineSoft, borderWidth: 1, borderColor: colors.line },
  progressSegmentActive: { backgroundColor: colors.customer, borderColor: colors.customer },
  progressSegmentCompleted: { backgroundColor: colors.customer, borderColor: colors.customer, opacity: 0.85 },
  stepDotsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 0, marginTop: 12, paddingHorizontal: 4, overflow: 'visible' as const },
  dotCell: { flex: 1, alignItems: 'center', position: 'relative' as const, gap: 6, minWidth: 0, overflow: 'visible' as const },
  dot: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  dotActive: { backgroundColor: colors.customer, borderColor: colors.customer },
  dotCompleted: { backgroundColor: colors.customer, borderColor: colors.customer },
  dotUpcoming: { backgroundColor: colors.white, borderColor: colors.line },
  dotText: { fontSize: 16, fontFamily: fonts.bold, color: colors.muted, fontVariant: ['tabular-nums'] as const },
  dotTextActive: { color: colors.white },
  dotTextUpcoming: { color: colors.muted },
  dotLabel: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.muted, letterSpacing: 0.3, textAlign: 'center' as const, lineHeight: 16, marginTop: 2 },
  dotLabelActive: { color: colors.customer, fontFamily: fonts.bold },
  dotConnector: { position: 'absolute' as const, top: 20, left: '62%', right: '-38%', height: 2, backgroundColor: colors.line, zIndex: 0 },
  dotConnectorCompleted: { backgroundColor: colors.customer, opacity: 0.9 },
  divider: { height: 1, backgroundColor: colors.lineSoft, marginTop: 18, marginBottom: 18 },
  stepHeadBlock: { marginBottom: 4 },
  stepHeadTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.2 },
  stepHeadSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },

  stepBody: { gap: 20, marginTop: 8 },
  stepIntroBlock: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 6, ...shadows.subtle },
  stepIntroTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.2 },
  stepIntroCopy: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, lineHeight: 18 },

  inputGroup: { gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  inputLabel: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  requiredMark: { color: colors.danger, fontSize: 14, fontFamily: fonts.bold },
  optionalLabel: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted },
  helperText: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, lineHeight: 17, marginTop: 8 },
  errorText: { fontSize: 13, fontFamily: fonts.medium, color: colors.danger, lineHeight: 17, marginTop: 8 },
  inputError: { borderColor: colors.danger, borderWidth: 2 },

  inputIconTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  inputIconTileActive: { backgroundColor: colors.customerSoft, borderColor: colors.hudBorder },

  // quick picks - grouped tight (8) within, generous (16) from next input
  // Prototype 2x2 device grid
  quickPickWrap: { gap: 14, marginTop: 12 },
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  deviceCard: { width: '48%', borderRadius: 14, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.canvas, padding: 16, alignItems: 'center', gap: 12, minHeight: 130, justifyContent: 'center', ...shadows.subtle },
  deviceCardActive: { borderColor: colors.customer, backgroundColor: colors.customerSoft, ...shadows.card },
  deviceIconTile: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.lineSoft },
  deviceIconTileActive: { backgroundColor: colors.customerMist, borderColor: colors.customer },
  deviceCardText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.ink, textAlign: 'center', lineHeight: 17 },
  quickPickLabel: { fontSize: 10, fontFamily: fonts.extraBold, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' as const },
  quickChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, maxWidth: '48%', minHeight: 48 },
  quickChipActive: { backgroundColor: colors.customerSoft, borderColor: colors.customer },
  quickChipText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.muted, flexShrink: 1 },
  quickChipTextActive: { color: colors.customer },
  viewAllCategoriesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 4 },
  viewAllCategoriesText: { fontSize: 13, fontFamily: fonts.bold, color: colors.customer },

  // selected meta
  selectedMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  miniPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.hudBorder, backgroundColor: colors.customerSoft },
  miniPillDevice: { backgroundColor: colors.white, borderColor: colors.line },
  miniPillText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.customer },

  photoPicker: { minHeight: 80, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.customer, borderStyle: 'dashed', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14, ...shadows.subtle },
  photoPickerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.customerSoft, alignItems: 'center', justifyContent: 'center' },
  photoPickerCopy: { flex: 1 },
  photoPickerTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  photoPickerSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
  photoPreview: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 14, alignItems: 'center', ...shadows.subtle },
  photoPreviewImage: { width: 90, height: 90, borderRadius: 12, backgroundColor: colors.line },
  photoPreviewCopy: { flex: 1, gap: 6 },
  photoReadyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoReadyText: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  photoHint: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, lineHeight: 16 },
  photoPreviewActions: { flexDirection: 'row', flexWrap: 'wrap' as const, gap: 10, marginTop: 8 },
  photoSecondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, minHeight: 44 },
  photoSecondaryText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.customer },
  photoBadge: { marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.hudBorder },
  photoBadgeText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.customer, letterSpacing: 0.2 },
  
  selectInput: { height: 52, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectInputText: { fontSize: 14, fontFamily: fonts.medium, color: colors.ink, flex: 1 },
  
  textAreaContainer: { backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 10, minHeight: 120, ...shadows.subtle },
  textArea: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.ink, textAlignVertical: 'top', paddingTop: 0, lineHeight: 19 },
  charRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  charCount: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted, fontVariant: ['tabular-nums'] as const },

  // Prototype slot rows with radio circles
  textInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.surfaceSunken, gap: 10, minHeight: 52, ...shadows.subtle },
  textInputSingle: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.medium, paddingVertical: 12 },
  slotList: { gap: 10, marginTop: 4 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.canvas, ...shadows.subtle },
  slotRowActive: { borderColor: colors.customer, backgroundColor: colors.customerSoft, ...shadows.card },
  slotRadio: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  slotRadioActive: { backgroundColor: colors.customer, borderColor: colors.customer },
  slotRowText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.ink },
  slotChip: { flex: 1, minWidth: 140, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  slotChipActive: { backgroundColor: colors.customerSoft, borderColor: colors.customer },
  slotChipText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.muted, textAlign: 'center' as const, lineHeight: 16 },
  slotChipTextActive: { color: colors.customer },
  slotExactInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  timeHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  timeHintText: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, flex: 1, lineHeight: 14 },
  
  locationContainer: { flexDirection: 'row', flexWrap: 'wrap' as const, alignItems: 'center', gap: 10 },
  locationFieldWrap: { position: 'relative', zIndex: 20 },
  locateButton: { backgroundColor: colors.customer, height: 52, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '0 4px 10px rgba(15,118,110,0.18)', elevation: 3, minWidth: 92, flex: 1, justifyContent: 'center' },
  locateButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.bold },

  suggestionsPanel: { position: 'absolute', top: 58, left: 0, right: 0, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, zIndex: 30, elevation: 8, boxShadow: '0 6px 12px rgba(16,42,67,0.15)', overflow: 'hidden' },
  suggestionsModalView: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 12, paddingBottom: 10, maxHeight: '78%', boxShadow: '0 -4px 12px rgba(0,0,0,0.1)', elevation: 10 },
  suggestionsList: { maxHeight: 360, flexGrow: 0 },
  suggestionStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 14 },
  suggestionStatusText: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  suggestionIconWrap: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.customerSoft, alignItems: 'center', justifyContent: 'center' },
  suggestionCopy: { flex: 1 },
  suggestionLabel: { color: colors.ink, fontSize: 13, fontFamily: fonts.semiBold },
  suggestionSub: { color: colors.muted, fontSize: 11, marginTop: 2, fontFamily: fonts.regular, paddingBottom: 1 },
  suggestionFooter: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.line },
  suggestionFooterText: { color: colors.muted, fontSize: 11, fontFamily: fonts.regular, textAlign: 'center' },

  locationConfirmCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.hudBorder, borderRadius: 12, padding: 12, marginTop: 10 },
  locationConfirmIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hudBorder, alignItems: 'center', justifyContent: 'center' },
  locationConfirmTitle: { fontSize: 12, fontFamily: fonts.bold, color: colors.ink },
  locationConfirmSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 2, lineHeight: 14 },
  privacyNote: { flexDirection: 'row', gap: 8, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10, alignItems: 'flex-start' },
  privacyNoteText: { flex: 1, fontSize: 11, fontFamily: fonts.regular, color: colors.muted, lineHeight: 15 },

  navRow: { flexDirection: 'row', gap: 12, marginTop: 24, alignItems: 'center' },
  secondaryButton: { flex: 1, minWidth: 0, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryButtonText: { color: colors.ink, fontSize: 15, fontFamily: fonts.bold, letterSpacing: 0.2 },
  primaryButton: { backgroundColor: colors.customer, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadows.card, paddingHorizontal: 20 },
  primaryButtonFlex: { flex: 1, minWidth: 0 },
  primaryButtonMuted: { opacity: 0.55 },
  primaryButtonText: { color: colors.white, fontSize: 15, fontFamily: fonts.bold, letterSpacing: 0.4 },
  primaryButtonTextMuted: { opacity: 0.85 },
  navHint: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(16, 42, 67, 0.4)', justifyContent: 'flex-end' },
  modalView: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '80%', boxShadow: '0 -4px 12px rgba(0,0,0,0.1)', elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalBackIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  modalCloseIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  modalSubtitle: { color: colors.muted, fontSize: 11, fontFamily: fonts.medium, marginTop: 3, textAlign: 'center' as const },
  modalItem: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, marginBottom: 2 },
  modalItemSelected: { backgroundColor: colors.customerSoft, paddingHorizontal: 10, borderBottomColor: 'transparent', borderWidth: 1, borderColor: colors.hudBorder },
  modalItemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  modalItemIconSelected: { backgroundColor: colors.white, borderColor: colors.hudBorder },
  modalItemText: { fontSize: 14, fontFamily: fonts.medium, color: colors.ink },
  modalItemTextSelected: { color: colors.customer, fontFamily: fonts.bold },
  modalItemHint: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  modalItemCount: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.muted, marginRight: 8 }
});
