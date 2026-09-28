import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, Modal, FlatList, ActivityIndicator, Image, Platform, Animated, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from "../../components/DateTimePicker";
import { PhotoLightbox } from "../../components/RequestPhoto";
import { submitRepairRequest, fetchPlatformCategories } from "../../services/api";
import { geocodeAddress, geocodeAddressPrecise, geocodeAddressStructured, reverseGeocodePrecise } from "../../services/locationIq";
import { collectBestFix, distanceInMeters } from "./locationFix";
import CustomerLocationMap from "../../components/CustomerLocationMap";
import { colors, fonts, shadows, themedStyles } from '../../theme';
import { getApplianceIcon, type IconName } from '../../utils/applianceIcons';

type CurrentUserRef = {
  uid?: string;
  name?: string;
  role?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

// A category (and its optional device list) from the platform categories feed.
type CategoryOption = {
  name?: string;
  category?: string;
  devices?: unknown[];
};

type Coords = { latitude: number; longitude: number };

type LocateStage = 'permission' | 'gps' | 'address' | 'pin';

type LocateNote = { kind: 'error' | 'info' | 'ok'; text: string };

type PhotoAsset = {
  uri: string;
  fileName?: string;
  name?: string;
  mimeType?: string;
  type?: string;
};

type SubmitRequestScreenProps = {
  currentUser?: CurrentUserRef | null;
  customerName?: string;
  onNavigateToProgress?: () => void;
  onClose?: () => void;
};

// Place types that read as "business/store/landmark" so we can pick a fitting icon
const STORE_LIKE_TYPES = ['mall', 'department_store', 'shop', 'supermarket', 'bank', 'hospital', 'university', 'school', 'pharmacy', 'hotel', 'restaurant', 'fast_food', 'cafe', 'travel_agency', 'doctors', 'clinic'];

const suggestionIconFor = (type: string): IconName =>
  (STORE_LIKE_TYPES.includes(type) ? 'business-outline' : 'location-outline');

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

// Web fallback for the native date/time picker, which renders nothing on
// browsers. Auto-opens the browser picker right after the row is tapped so
// the user never has to find and click this input manually.
const WebDateTimeInput = ({ mode, date, onPick, onDismiss, openToken = 0 }: { mode: string; date: Date; onPick: (picked: Date | undefined) => void; onDismiss?: () => void; openToken?: number }) => {
  if (Platform.OS !== 'web') return null;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickedRef = useRef(false);
  const [manualPick, setManualPick] = useState(false);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const value = mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  // Open the native browser picker automatically. Runs after render so the
  // input (with the freshly switched date/time type) exists in the DOM; the
  // tap that triggered it still counts as user activation in Chrome/Edge.
  useEffect(() => {
    pickedRef.current = false;
    const el = inputRef.current as HTMLInputElement | null;
    if (!el) return;
    const timer = setTimeout(() => {
      try {
        const anyEl = el as HTMLInputElement & { showPicker?: () => void };
        if (typeof anyEl.showPicker === 'function') anyEl.showPicker();
        else el.click();
      } catch {
        // Browser refused auto-open (no user activation). Reveal the input so
        // the user can tap it directly instead of nothing happening.
        setManualPick(true);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [mode, openToken]);

  const baseStyle: Record<string, any> = manualPick
    ? {
        width: '100%',
        minHeight: 48,
        fontSize: 14,
        paddingLeft: 14,
        paddingRight: 14,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#E5E7EB',
        borderRadius: 14,
        backgroundColor: '#F9FAFB',
        color: '#102A43',
        marginTop: 8,
        fontFamily: fonts.regular,
      }
    : { position: 'absolute' as const, opacity: 0, width: 1, height: 1, left: 0, bottom: 0, pointerEvents: 'none' as const };

  return React.createElement('input', {
    ref: inputRef,
    type: mode === 'date' ? 'date' : 'time',
    value,
    min: mode === 'date' ? todayStr : undefined,
    onChange: (event: any) => {
      pickedRef.current = true;
      const raw = String(event?.target?.value || '');
      if (!raw) return;
      if (mode === 'date') {
        const [year, month, day] = raw.split('-').map(Number);
        if (year == null || month == null || day == null) return;
        if (![year, month, day].every(Number.isFinite)) return;
        onPick(new Date(year, month - 1, day, date.getHours(), date.getMinutes()));
      } else {
        const [hours, minutes] = raw.split(':').map(Number);
        if (hours == null || minutes == null) return;
        if (![hours, minutes].every(Number.isFinite)) return;
        const picked = new Date(date);
        picked.setHours(hours, minutes, 0, 0);
        onPick(picked);
      }
    },
    onBlur: () => {
      // Picker closed without a selection (cancel/Esc/outside tap): hide the
      // input so a stale hidden field doesn't linger.
      setTimeout(() => { if (!pickedRef.current) onDismiss?.(); }, 150);
    },
    style: baseStyle,
  }) as unknown as React.JSX.Element;
};

const STEPS = [
  { key: 'appliance', label: 'Appliance', title: 'Select Device Type', subtitle: 'What needs fixing?' },
  { key: 'problem', label: 'Problem', title: 'Describe the Issue', subtitle: '' },
  { key: 'schedule', label: 'Schedule', title: 'Choose a Time Slot', subtitle: '' },
  { key: 'location', label: 'Location', title: 'Repair Location', subtitle: '' },
] as const;

const TOTAL_STEPS = 4;

// Per-stage copy for the live location lookup. The short label sits in the
// locate row, the long one in the map overlay, so the user always knows what
// the app is doing while the fix is still resolving.
const LOCATE_STAGES = {
  permission: { short: 'Checking permission...', long: 'Checking location permission' },
  gps: { short: 'Getting GPS fix...', long: 'Acquiring your GPS position' },
  address: { short: 'Finding address...', long: 'Matching your coordinates to a street address' },
  pin: { short: 'Confirming pin...', long: 'Confirming the pin on the map' },
};

function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  color = '#E1E6EB',
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  radius?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: color, opacity }, style]} />;
}

export default function SubmitRequestScreen({ currentUser, customerName, onNavigateToProgress, onClose }: SubmitRequestScreenProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepErrors, setStepErrors] = useState<Record<string, string | boolean | undefined>>({});
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [brandModel, setBrandModel] = useState("");
  const [drillCategory, setDrillCategory] = useState<CategoryOption | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  // Smart opacity: manual text = 50%, address derived from the pin = 100%
  // (medium weight, never bold).
  // `addressFromPin` means the fields were filled FROM the pin (a GPS fix or a
  // pin the customer dragged), not typed. While true the auto-geocode effect
  // must not overwrite the pin from a typed-address lookup. Editing any field
  // clears it, so manual edits still re-sync the map.
  const [addressFromPin, setAddressFromPin] = useState(false);
  const locTextStyle = [styles.textInputSingle, { opacity: addressFromPin ? 1 : 0.5 }];
  // Consistent focus ring for all step 4 boxes (orange when focused)
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [date, setDate] = useState(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('Afternoon (1PM-5PM)');
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Bumped on every picker open so the web input re-runs its auto-open effect
  // even when the same mode is picked twice in a row.
  const [pickerToken, setPickerToken] = useState(0);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  // While locating and still empty, the address fields render as skeletons so
  // the form looks like it is filling itself in rather than sitting blank.
  const addressFieldsEmpty = !street.trim() && !city.trim() && !zipCode.trim();
  const [locateAccuracy, setLocateAccuracy] = useState<number | null>(null);
  const [locateStage, setLocateStage] = useState<LocateStage | null>(null);
  const [locateNote, setLocateNote] = useState<LocateNote | null>(null);
  const [photo, setPhoto] = useState<PhotoAsset | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const composedLocation = [street.trim(), city.trim(), zipCode.trim()].filter(Boolean).join(', ');

  useEffect(() => {
    fetchPlatformCategories()
      .then((data) => setCategoryOptions(data as CategoryOption[]))
      .catch(() => setCategoryOptions([]));
  }, []);

  const applianceOptions = categoryOptions.length
    ? categoryOptions.map((category) => String(category.name || '').trim()).filter(Boolean)
    : APPLIANCE_OPTIONS;

  const displayAppliance = selectedDevice
    ? `${selectedCategoryName} - ${selectedDevice}`
    : selectedCategoryName || "Select appliance type";

  const selectedCategoryObj = categoryOptions.find((c) => String(c.name || '').trim() === selectedCategoryName) || null;
  const selectedHasDevices = selectedCategoryObj && Array.isArray(selectedCategoryObj.devices) && selectedCategoryObj.devices.filter(Boolean).length > 0;

  const pickCategory = (category: CategoryOption) => {
    const devices = Array.isArray(category.devices) ? category.devices.map((device) => String(device).trim()).filter(Boolean) : [];
    if (devices.length === 0) {
      setSelectedCategoryName(category.name || '');
      setSelectedDevice("");
      setModalVisible(false);
      if (stepErrors.category) setStepErrors((p) => { const n = { ...p }; delete n.category; return n; });
      return;
    }
    setDrillCategory({ ...category, devices });
  };

  const handleLocate = async () => {
    if (locating) return;
    setLocating(true);
    setLocateStage('permission');
    setLocateAccuracy(null);
    // Inline status, never Alert alone. Web popups can stay invisible, which
    // looked like loading-then-nothing with zero explanation.
    setLocateNote(null);
    // Every external call raced with a timeout. An unanswered permission
    // prompt or a hanging geocode service must never stick the spinner on.
    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      });
      return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
    };
    try {
      // Read status first without prompting. A denied status never shows a
      // phone prompt again, so say exactly where to re-enable instead.
      let permission;
      try {
        permission = await withTimeout(Location.getForegroundPermissionsAsync(), 10000, 'Location check timed out.');
      } catch {
        permission = { status: 'undetermined' };
      }
      if (permission.status === 'denied') {
        const howTo = Platform.OS === 'web'
          ? 'Location is blocked for this site. Tap the lock icon in the address bar, set Location to Allow, reload, then retry.'
          : 'Location is blocked for FixLink. Open phone Settings, allow Location for this app, then retry.';
        setLocateNote({ kind: 'error', text: `${howTo} Or type the address manually.` });
        return;
      }
      if (permission.status !== 'granted') {
        // Undetermined status triggers the phone prompt here. Allow = accurate
        // GPS fix. Dismiss or Block = manual address instead.
        try {
          permission = await withTimeout(Location.requestForegroundPermissionsAsync(), 30000, 'Answer the location prompt, or type the address manually.');
        } catch {
          permission = { status: 'denied' };
        }
      }
      if (permission.status !== 'granted') {
        setLocateNote({ kind: 'error', text: 'Location permission denied. Allow access or type the address manually.' });
        Alert.alert('Permission Denied', 'Permission to access location was denied');
        return;
      }
      // Highest-accuracy mode with best-of-N sampling, still bounded by a hard
      // timeout so a slow fix can never hang the spinner.
      setLocateStage('gps');
      const pos = await withTimeout(
        collectBestFix(12000),
        14000,
        'Location request timed out. Try again outside or type the address manually.'
      );
      const acc = Number(pos?.coords?.accuracy) || 9999;
      const lat = Number(pos?.coords?.latitude);
      const lon = Number(pos?.coords?.longitude);
      setCoords({ latitude: lat, longitude: lon });
      setLocateAccuracy(acc);
      if (stepErrors.location) setStepErrors((p) => { const n = { ...p }; delete n.location; return n; });
      setLocateStage('address');
      let resolvedStreet = '';
      let resolvedCity = '';
      let resolvedZip = '';
      let resolvedState = '';
      try {
        const geocode = await withTimeout(Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }), 8000, 'Reverse geocode timed out.');
        if (geocode && geocode.length > 0) {
          // Guarded by the length check above.
          const a = geocode[0]!;
          // Use fresh reverseGeocode only - do not geocode the string "Gairan" again
          resolvedStreet = a.street || a.name || '';
          resolvedCity = a.city || a.subregion || '';
          resolvedZip = a.postalCode || '';
          resolvedState = a.region || '';
        }
      } catch {
        // Precise fallback below fills the parts.
      }
      // LocationIQ precise reverse fills street, city, state, postal code and
      // overrides weak expo fields so all four parts stay accurate.
      try {
        const precise = await reverseGeocodePrecise(lat, lon);
        if (precise) {
          if (precise.street) resolvedStreet = precise.street;
          if (precise.city) resolvedCity = precise.city;
          if (precise.postalCode) resolvedZip = precise.postalCode;
          if (precise.state) resolvedState = precise.state;
        }
      } catch {}
      if (resolvedStreet) setStreet(resolvedStreet);
      if (resolvedCity) setCity(resolvedCity);
      if (resolvedZip) setZipCode(resolvedZip);
      else setZipCode('');
      // Indoor snap: weak GPS (>30m, typical inside a house) gets snapped to the
      // rooftop of the resolved street address via API-only forward geocode.
      // Good GPS (<=30m) is kept as-is since it is already best. The coarse
      // dict is never used here so it cannot drag the pin offshore again.
      setLocateStage('pin');
      let finalLat = lat;
      let finalLon = lon;
      const fullAddr = [resolvedStreet, resolvedCity, resolvedState, resolvedZip].filter(Boolean).join(', ');
      if (acc > 30 && fullAddr.length > 5) {
        try {
          const snap = await geocodeAddressPrecise(fullAddr);
          // Only accept the snap when it lands near the raw fix. A geocode that
          // jumps further means the address matched the wrong place, and the raw
          // GPS reading is the safer answer.
          const snapOk = snap
            && Number.isFinite(snap.latitude)
            && Number.isFinite(snap.longitude)
            && distanceInMeters(lat, lon, snap.latitude, snap.longitude) <= 400;
          if (snapOk) {
            finalLat = snap.latitude;
            finalLon = snap.longitude;
          }
        } catch {}
      }
      setCoords({ latitude: finalLat, longitude: finalLon });
      // GPS autofill done - full 100% opacity text (medium, not bold)
      setAddressFromPin(true);
      setLocateNote({ kind: 'ok', text: 'Location found. Check the pin, then adjust the address if needed.' });
    } catch (e: any) {
      const message = e?.message || 'Failed to fetch location details.';
      setLocateNote({ kind: 'error', text: `${message} Type the address manually instead.` });
      Alert.alert('Error', message);
    } finally {
      setLocating(false);
      setLocateStage(null);
    }
  };

  // The customer dragged the pin onto their exact house/unit. The pin becomes
  // the source of truth, so re-derive the address fields from it and keep the
  // auto-geocode effect from geocoding back over it. No `locating` toggle here:
  // that would swap the map out for the skeleton the customer just interacted
  // with.
  const handlePinDrag = async ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    setCoords({ latitude, longitude });
    setAddressFromPin(true);
    setLocateNote({ kind: 'ok', text: 'Pin moved - updating the address...' });
    let parts = null;
    try {
      parts = await reverseGeocodePrecise(latitude, longitude);
    } catch {}
    if (!parts) {
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo && geo.length > 0) {
          // Guarded by the length check above.
          const a = geo[0]!;
          parts = {
            street: a.street || a.name || '',
            city: a.city || a.subregion || '',
            state: a.region || '',
            postalCode: a.postalCode || '',
          };
        }
      } catch {}
    }
    if (parts?.street) setStreet(parts.street);
    if (parts?.city) setCity(parts.city);
    if (parts?.postalCode) setZipCode(parts.postalCode);
    setLocateNote({
      kind: 'ok',
      text: parts?.street
        ? 'Pin set. Address updated to match - adjust it below if needed.'
        : 'Pin set. Check the address below and adjust it if needed.',
    });
  };

  // Auto-detect all location inputs when entering Step 4
  useEffect(() => {
    if (currentStep === 4 && !street.trim() && !city.trim()) {
      handleLocate();
    }
  }, [currentStep]);

  // Auto-geocode as user types street/city/zip to keep map in sync. Uses the
  // structured endpoint when parts exist (rooftop accuracy); free-text otherwise.
  useEffect(() => {
    if (currentStep !== 4) return;
    // Do NOT geocode over a pin the device or the customer placed. The
    // structured lookup with no house number returns a street/area centroid,
    // and this effect used to fire right after the GPS autofill and silently
    // drag the accurate pin to the middle of the road. Editing any address
    // field clears addressFromPin (and for street/city also coords), so manual
    // edits still re-sync the map.
    if (addressFromPin) return;
    const hasParts = street.trim().length >= 3 || city.trim().length >= 3 || zipCode.trim().length >= 3;
    const q = composedLocation;
    if (!hasParts && (!q || q.length < 5)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await geocodeAddressStructured({
          street: street.trim() || undefined,
          city: city.trim() || undefined,
          postalCode: zipCode.trim() || undefined,
          context: 'Philippines',
        });
        if (!cancelled && res) {
          setCoords({ latitude: res.latitude, longitude: res.longitude });
          return;
        }
        if (!cancelled && q && q.length >= 5) {
          const fallbackRes = await geocodeAddress(q);
          if (!cancelled && fallbackRes) setCoords({ latitude: fallbackRes.latitude, longitude: fallbackRes.longitude });
        }
      } catch {}
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [composedLocation, currentStep, street, city, zipCode, addressFromPin]);

  // Optional problem photo: helps the technician see the issue before
  // accepting. Kept local until submit; uploaded as multipart `photo`.
  const normalizePhotoAsset = (asset?: ImagePicker.ImagePickerAsset | null) => {
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
        const normalized = normalizePhotoAsset(result.assets?.[0]);
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
        const normalized = normalizePhotoAsset(result.assets?.[0]);
        if (normalized) setPhoto(normalized);
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoAction = () => {
    if (photoBusy) return;
    setPhotoMenuVisible(true);
  };

  const handleTakePhoto = async () => {
    setPhotoMenuVisible(false);
    await takePhoto();
  };

  const handlePickFromLibrary = async () => {
    setPhotoMenuVisible(false);
    await pickFromLibrary();
  };

  const handleDateValue = (selectedDate?: Date | null) => {
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

  const validateStep = (step: number) => {
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
      if (!brandModel.trim()) {
        next.brand = 'Enter the device brand and model.';
        valid = false;
      } else {
        delete next.brand;
      }
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

  const canContinueForStep = (step: number) => {
    if (step === 1) return !!selectedCategoryName.trim();
    if (step === 2) return !!description.trim() && !!brandModel.trim();
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
    const step2Ok = !!description.trim() && !!brandModel.trim();
    const allValid = [1,2,3,4].every((s) => {
      if (s === 1 && !selectedCategoryName.trim()) return false;
      if (s === 2 && !step2Ok) return false;
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
      const next: Record<string, string | boolean | undefined> = {};
      if (!selectedCategoryName.trim()) next.category = 'Choose the appliance that needs repair.';
      if (!brandModel.trim()) next.brand = 'Enter the device brand and model.';
      if (!description.trim()) next.description = 'Add a short description so the technician can prepare.';
      const today = new Date(); today.setHours(0,0,0,0);
      const d = new Date(date); d.setHours(0,0,0,0);
      if (d < today) next.date = 'Choose today or a future date.';
      if (!street.trim()) next.location = 'Enter the street address.';
      setStepErrors(next);
      if (!selectedCategoryName.trim()) setCurrentStep(1);
      else if (!step2Ok) setCurrentStep(2);
      else if (d < today) setCurrentStep(3);
      else setCurrentStep(4);
      return;
    }

    if (!selectedCategoryName || !description.trim() || !brandModel.trim() || !street.trim()) {
      // fallback generic alert for any edge path, but inline is primary
      const missing = !selectedCategoryName ? 'appliance' : (!brandModel.trim() ? 'brand' : (!description.trim() ? 'description' : 'location'));
      setStepErrors((p) => ({ ...p, [missing]: 'This field is required.' }));
      return;
    }
    setLoading(true);
    try {
      let finalCoords = coords;
      // Geocode the typed address so the technician can navigate to it.
      // Structured parts first (most accurate), then free-text fallback.
      if (!finalCoords && composedLocation) {
        try {
          const structured = await geocodeAddressStructured({
            street: street.trim() || undefined,
            city: city.trim() || undefined,
            postalCode: zipCode.trim() || undefined,
            context: 'Philippines',
          });
          if (structured) {
            finalCoords = { latitude: structured.latitude, longitude: structured.longitude };
          } else {
            const geocoded = await geocodeAddress(composedLocation);
            if (geocoded) {
              finalCoords = { latitude: geocoded.latitude, longitude: geocoded.longitude };
            }
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
                      const devices = cat && Array.isArray(cat.devices) ? cat.devices.map((d) => String(d).trim()).filter(Boolean) : [];
                      // Auto-select instantly (orange highlight); if it has devices, open picker to choose one.
                      setSelectedCategoryName(cat?.name || name);
                      setSelectedDevice('');
                      if (devices.length > 0) {
                        setDrillCategory({ ...cat, devices });
                        setModalVisible(true);
                      } else {
                        setModalVisible(false);
                      }
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
              <Text style={styles.requiredMark}> *</Text>
            </View>
            <View style={[styles.textInputContainer, !!stepErrors.brand && styles.inputError]}>
              <TextInput
                style={styles.textInputSingle}
                placeholder="e.g. Dell XPS 15 9530"
                placeholderTextColor={colors.muted}
                value={brandModel}
                onChangeText={(t) => {
                  setBrandModel(t);
                  if (stepErrors.brand && t.trim()) setStepErrors((p) => { const n = { ...p }; delete n.brand; return n; });
                }}
                accessibilityLabel="Device brand and model"
                maxLength={80}
              />
            </View>
            {!!stepErrors.brand && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">{stepErrors.brand}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Problem description</Text>
                <Text style={styles.requiredMark}> *</Text>
              </View>
            <View style={[styles.textAreaContainer, !!stepErrors.description && styles.inputError]}>
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
              onPress={() => { setMode('date'); setShowDatePicker(true); setPickerToken((t) => t + 1); }} 
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
                      {isActive ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : <Ionicons name="calendar-outline" size={14} color={colors.subtle} />}
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
                  setPickerToken((t) => t + 1);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Choose exact time"
                hitSlop={8}
              >
                <View style={[styles.slotRadio, isCustomTime && styles.slotRadioActive]}>
                  {isCustomTime ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : <Ionicons name="time-outline" size={14} color={colors.subtle} />}
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
            Platform.OS === 'web' ? (
              <WebDateTimeInput mode={mode} date={date} onPick={handleDateValue} onDismiss={handleDateDismiss} openToken={pickerToken} />
            ) : (
              <DateTimePicker
                value={date}
                mode={mode}
                minimumDate={mode === 'date' ? new Date() : undefined}
                display="default"
                onValueChange={(_event, selectedDate) => handleDateValue(selectedDate)}
                onDismiss={handleDateDismiss}
                onNeutralButtonPress={handleDateDismiss}
              />
            )
          )}
        </View>
      );
    }

    // Step 4 — reference Repair Location: map preview + street + city/ZIP + notes
    const clearLocationError = () => { if (stepErrors.location) setStepErrors((p) => { const n = { ...p }; delete n.location; return n; }); };
    return (
      <View style={styles.stepBody}>
        <View style={styles.mapBox}>
          {locating ? (
            <View style={styles.mapSkeleton} accessibilityRole="progressbar" accessibilityLabel="Getting your location">
              <Skeleton width="100%" height={144} radius={16} />
              <View style={styles.mapSkeletonBody}>
                <View style={styles.mapPin}>
                  <Ionicons name="locate" size={20} color={colors.onAccent} />
                </View>
                <View style={styles.mapSkeletonStatus}>
                  <ActivityIndicator size="small" color={colors.customer} />
                  <Text style={styles.mapSkeletonText} accessibilityLiveRegion="polite" numberOfLines={2}>
                    {LOCATE_STAGES[locateStage as LocateStage]?.long || 'Getting your location...'}
                  </Text>
                </View>
              </View>
            </View>
          ) : coords ? (
            <CustomerLocationMap
              customerCoords={{ latitude: coords.latitude, longitude: coords.longitude, name: 'Service location' }}
              isAccepted={false}
              style={{ height: 144 }}
              onCustomerPinDrag={handlePinDrag}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapPin}>
                <Ionicons name="location" size={20} color={colors.onAccent} />
              </View>
              <Text style={styles.mapPlaceholderText}>Tap "Use my current location" to drop your pin</Text>
            </View>
          )}
        </View>
        {coords && !locating ? (
          <View style={styles.mapHintRow}>
            <Ionicons name="hand-left-outline" size={13} color={colors.customer} />
            <Text style={styles.mapHintText}>Drag the pin to your exact house - the address updates automatically.</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.locateRow} onPress={handleLocate} disabled={locating} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Use my current location">
          {locating ? (
            <ActivityIndicator size="small" color={colors.customer} />
          ) : (
            <Ionicons name="locate-outline" size={15} color={colors.customer} />
          )}
          <Text style={styles.locateRowText} numberOfLines={1}>{locating ? (LOCATE_STAGES[locateStage as LocateStage]?.short || 'Locating...') : 'Use my current location'}</Text>
        </TouchableOpacity>
        {locateNote ? (
          <Text style={locateNote.kind === 'ok' ? styles.locateOkText : styles.locateErrorText}>{locateNote.text}</Text>
        ) : null}
        {locating && addressFieldsEmpty ? (
          <View style={styles.addressSkeletonGroup} accessibilityLabel="Loading your address" accessibilityRole="progressbar">
            <View>
              <Text style={styles.refLabel}>Street Address</Text>
              <Skeleton width="100%" height={52} radius={14} />
            </View>
            <View style={styles.twoColGrid}>
              <View style={styles.twoColCell}>
                <Text style={styles.refLabel}>City</Text>
                <Skeleton width="100%" height={52} radius={14} />
              </View>
              <View style={styles.twoColCell}>
                <Text style={styles.refLabel}>ZIP Code</Text>
                <Skeleton width="100%" height={52} radius={14} />
              </View>
            </View>
          </View>
        ) : (
        <>
        <View style={styles.inputGroup}>
          <Text style={styles.refLabel}>Street Address</Text>
          <View style={[styles.textInputContainer, focusedField === 'street' && styles.inputFocused, !!stepErrors.location && styles.inputError]}>
            <TextInput
              style={locTextStyle}
              placeholder="142 Oak Street, Apt 3B"
              placeholderTextColor={colors.muted}
              value={street}
              onChangeText={(t) => { setStreet(t); setCoords(null); setAddressFromPin(false); clearLocationError(); }}
              onFocus={() => setFocusedField('street')}
              onBlur={() => setFocusedField(null)}
              accessibilityLabel="Street address"
              autoCorrect={false}
            />
          </View>
          {!!stepErrors.location && <Text style={styles.errorText}>{stepErrors.location}</Text>}
        </View>
        <View style={styles.twoColGrid}>
          <View style={[styles.inputGroup, styles.twoColCell]}>
            <Text style={styles.refLabel}>City</Text>
            <View style={[styles.textInputContainer, focusedField === 'city' && styles.inputFocused]}>
              <TextInput
                style={locTextStyle}
                placeholder="Bogo City"
                placeholderTextColor={colors.muted}
                value={city}
                onChangeText={(t) => { setCity(t); setCoords(null); setAddressFromPin(false); }}
                onFocus={() => setFocusedField('city')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="City"
                autoCorrect={false}
              />
            </View>
          </View>
          <View style={[styles.inputGroup, styles.twoColCell]}>
            <Text style={styles.refLabel}>ZIP Code</Text>
            <View style={[styles.textInputContainer, focusedField === 'zip' && styles.inputFocused]}>
              <TextInput
                style={locTextStyle}
                placeholder="6010"
                placeholderTextColor={colors.muted}
                value={zipCode}
                onChangeText={(t) => { setZipCode(t); setAddressFromPin(false); }}
                onFocus={() => setFocusedField('zip')}
                onBlur={() => setFocusedField(null)}
                accessibilityLabel="ZIP code"
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>
        </View>
        </>
        )}
        <View style={styles.inputGroup}>
          <Text style={styles.refLabel}>Additional Notes</Text>
          <View style={[styles.textInputContainer, focusedField === 'notes' && styles.inputFocused]}>
            <TextInput
              style={styles.textInputSingle}
              placeholder="Landmark, gate code, leave at door, etc."
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocusedField('notes')}
              onBlur={() => setFocusedField(null)}
              accessibilityLabel="Additional notes"
            />
          </View>
        </View>
      </View>
    );
  };

  // Rendered step definition. The `?? STEPS[0]` keeps the header from ever
  // reading past the end if currentStep were ever out of range.
  const stepDef = STEPS[currentStep - 1] ?? STEPS[0];

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
                      <Ionicons name="checkmark" size={12} color={colors.onAccent} />
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
          <Text style={styles.stepHeadTitle}>{stepDef.title}</Text>
          {!!stepDef.subtitle && (
            <Text style={styles.stepHeadSub}>{stepDef.subtitle}</Text>
          )}
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
                <ActivityIndicator color={colors.onAccent} />
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
                data={(drillCategory.devices || []) as string[]}
                keyExtractor={(item: string) => item}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isSelected = selectedCategoryName === drillCategory.name && selectedDevice === item;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                      onPress={() => { setSelectedCategoryName(drillCategory.name || ''); setSelectedDevice(item); setDrillCategory(null); setModalVisible(false); if (stepErrors.category) setStepErrors((p) => { const n={...p}; delete n.category; return n; }); }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={item}
                      hitSlop={4}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={[styles.modalItemIcon, isSelected && styles.modalItemIconSelected]}>
                          <Ionicons name={getApplianceIcon(item)} size={15} color={isSelected ? colors.customer : colors.muted} />
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

      <Modal visible={photoMenuVisible} transparent animationType="fade" onRequestClose={() => setPhotoMenuVisible(false)}>
        <View style={styles.photoMenuBackdrop}>
          <View style={styles.photoMenuCard}>
            <Text style={styles.photoMenuTitle}>Add a photo</Text>
            <Text style={styles.photoMenuSub}>Show the technician what needs fixing.</Text>
            <TouchableOpacity style={styles.photoMenuButton} onPress={handleTakePhoto} accessibilityRole="button" accessibilityLabel="Take photo">
              <Ionicons name="camera-outline" size={18} color={colors.customer} />
              <Text style={styles.photoMenuButtonText}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoMenuButton} onPress={handlePickFromLibrary} accessibilityRole="button" accessibilityLabel="Choose from gallery">
              <Ionicons name="image-outline" size={18} color={colors.customer} />
              <Text style={styles.photoMenuButtonText}>Choose from gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoMenuCancel} onPress={() => setPhotoMenuVisible(false)} accessibilityRole="button" accessibilityLabel="Cancel photo picker">
              <Text style={styles.photoMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </View>
    </ScrollView>
  );
}

const styles = themedStyles({
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 36, backgroundColor: colors.white, alignItems: 'center' as const },
  centerWrap: { width: '100%' as const, maxWidth: 480, alignSelf: 'center' as const },
  sectionHeaderContainer: { marginBottom: 20, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  refHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 20 },
  refBackBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  refHeaderTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold },
  // These labels are styled with `styles.refLabel` in the markup but the key was
  // never defined, so they have always rendered unstyled. Kept as an empty
  // entry so the rendering stays byte-for-byte the same.
  refLabel: {},
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
  dotTextActive: { color: colors.onAccent },
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
  inputLabel: { fontSize: 12, fontFamily: fonts.bold, color: colors.ink },
  requiredMark: { color: colors.danger, fontSize: 12, fontFamily: fonts.bold },
  optionalLabel: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  helperText: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, lineHeight: 17, marginTop: 8 },
  errorText: { fontSize: 13, fontFamily: fonts.medium, color: colors.danger, lineHeight: 17, marginTop: 8 },
  inputError: { borderColor: colors.danger, borderWidth: 2 },

  inputIconTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  inputIconTileActive: { backgroundColor: colors.customerSoft, borderColor: colors.hudBorder },

  // quick picks - grouped tight (8) within, generous (16) from next input
  // Prototype 2x2 device grid
  quickPickWrap: { gap: 14, marginTop: 12 },
  // A fixed percentage plus a px gap overflowed on narrow phones and dropped the
  // cards to one per row. Percent widths + space-between keep a strict 2-up grid
  // with a small, consistent gutter at any screen width.
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, width: '100%' },
  deviceCard: { width: '48%', borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, padding: 16, alignItems: 'center', gap: 12, minHeight: 130, justifyContent: 'center', elevation: 0 },
  deviceCardActive: { borderColor: colors.customer, borderWidth: 1.5, backgroundColor: colors.customerSoft, elevation: 0 },
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
  photoPickerTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  photoPickerSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
  photoPreview: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 14, alignItems: 'center', ...shadows.subtle },
  photoPreviewImage: { width: 90, height: 90, borderRadius: 12, backgroundColor: colors.line },
  photoPreviewCopy: { flex: 1, gap: 6 },
  photoReadyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoReadyText: { fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  photoHint: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, lineHeight: 16 },
  photoPreviewActions: { flexDirection: 'row', flexWrap: 'wrap' as const, gap: 10, marginTop: 8 },
  photoSecondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, minHeight: 44 },
  photoSecondaryText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.customer },
  photoBadge: { marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.customerSoft, borderWidth: 1, borderColor: colors.hudBorder },
  photoBadgeText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.customer, letterSpacing: 0.2 },
  photoMenuBackdrop: { flex: 1, backgroundColor: 'rgba(13,27,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  photoMenuCard: { width: '100%', maxWidth: 340, backgroundColor: colors.white, borderRadius: 18, padding: 20 },
  photoMenuTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  photoMenuSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 4, marginBottom: 14 },
  photoMenuButton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 10, minHeight: 52 },
  photoMenuButtonText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.ink },
  photoMenuCancel: { alignItems: 'center', paddingVertical: 12, minHeight: 44 },
  photoMenuCancelText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.muted },
  
  selectInput: { height: 52, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectInputText: { fontSize: 13, fontFamily: fonts.medium, color: colors.ink, flex: 1 },
  
  textAreaContainer: { backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 10, minHeight: 120, ...shadows.subtle },
  textArea: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.ink, textAlignVertical: 'top', paddingTop: 0, lineHeight: 18 },
  charRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  charCount: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted, fontVariant: ['tabular-nums'] as const },

  // Prototype slot rows with radio circles
  textInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.surfaceSunken, gap: 10, minHeight: 52, elevation: 0 },
  inputFocused: { borderColor: colors.customer, borderWidth: 1.5 },
  textInputSingle: { flex: 1, color: colors.ink, fontSize: 13, fontFamily: fonts.medium, paddingVertical: 12 },
  slotList: { gap: 10, marginTop: 4 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, elevation: 0 },
  slotRowActive: { borderColor: colors.customer, backgroundColor: colors.customerSoft },
  slotRadio: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  slotRadioActive: { backgroundColor: colors.customer, borderColor: colors.customer },
  slotRowText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.ink },
  slotChip: { flex: 1, minWidth: 140, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  slotChipActive: { backgroundColor: colors.customerSoft, borderColor: colors.customer },
  slotChipText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.muted, textAlign: 'center' as const, lineHeight: 16 },
  slotChipTextActive: { color: colors.customer },
  slotExactInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  timeHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  timeHintText: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, flex: 1, lineHeight: 14 },
  
  locationContainer: { flexDirection: 'row', flexWrap: 'wrap' as const, alignItems: 'center', gap: 10 },
  locationFieldWrap: { position: 'relative', zIndex: 20 },
  locateButton: { backgroundColor: colors.customer, height: 52, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '0 4px 10px rgba(15,118,110,0.18)', minWidth: 92, flex: 1, justifyContent: 'center' },
  locateButtonText: { color: colors.onAccent, fontSize: 13, fontFamily: fonts.bold },
  locateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.customer, backgroundColor: colors.customerSoft, paddingHorizontal: 16, elevation: 0 },
  locateRowText: { color: colors.customer, fontSize: 13, fontFamily: fonts.semiBold },
  locateErrorText: { color: '#B91C1C', fontSize: 12, fontFamily: fonts.semiBold, marginTop: 8, lineHeight: 17 },
  locateOkText: { color: colors.customer, fontSize: 12, fontFamily: fonts.semiBold, marginTop: 8 },

  // Live-location panel. Previously these were referenced in the step-4 JSX but
  // never defined, so the empty map area collapsed and the pin lost its tile.
  mapBox: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, minHeight: 144 },
  mapPlaceholder: { height: 144, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24, backgroundColor: colors.surfaceSunken },
  mapPlaceholderText: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted, textAlign: 'center', lineHeight: 16 },
  mapHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  mapHintText: { flex: 1, fontSize: 11, fontFamily: fonts.medium, color: colors.muted, lineHeight: 15 },
  mapPin: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.customer, alignItems: 'center', justifyContent: 'center', ...shadows.subtle },
  mapSkeleton: { height: 144, position: 'relative' as const, alignItems: 'center', justifyContent: 'center' },
  mapSkeletonBody: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  mapSkeletonStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: colors.line, maxWidth: '100%' },
  mapSkeletonText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.ink, flexShrink: 1 },
  addressSkeletonGroup: { gap: 20 },
  twoColGrid: { flexDirection: 'row', gap: 12 },
  twoColCell: { flex: 1, minWidth: 0 },
  accuracyText: { fontSize: 11, fontFamily: fonts.medium, textAlign: 'center', marginTop: 6 },
  accuracyGood: { color: colors.green },
  accuracyOk: { color: colors.gold },
  accuracyPoor: { color: colors.danger },

  suggestionsPanel: { position: 'absolute', top: 58, left: 0, right: 0, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, zIndex: 30, boxShadow: '0 6px 12px rgba(16,42,67,0.15)', overflow: 'hidden' },
  suggestionsModalView: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 12, paddingBottom: 10, maxHeight: '78%', boxShadow: '0 -4px 12px rgba(0,0,0,0.1)' },
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
  primaryButtonText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold, letterSpacing: 0.4 },
  primaryButtonTextMuted: { opacity: 0.85 },
  navHint: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(16, 42, 67, 0.4)', justifyContent: 'flex-end' },
  modalView: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '80%', boxShadow: '0 -4px 12px rgba(0,0,0,0.1)' },
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
