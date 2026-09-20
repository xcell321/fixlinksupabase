import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Platform, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

const useNative: boolean = Platform.OS !== 'web';

export interface Banner {
  id: string;
  senderName: string;
  text: string;
}

export interface MessageBannerProps {
  banner: Banner | null;
  onDismiss: () => void;
  onPress?: () => void;
}

export default function MessageBanner({ banner, onDismiss, onPress }: MessageBannerProps): React.JSX.Element | null {
  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const shownIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!banner) {
      (translateY as unknown as { setValue: (v: number) => void }).setValue(-140);
      (opacity as unknown as { setValue: (v: number) => void }).setValue(0);
      shownIdRef.current = null;
      return;
    }
    if (shownIdRef.current === banner.id) return;

    shownIdRef.current = banner.id;
    if (Platform.OS !== 'web') Vibration.vibrate(60);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: useNative }),
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: useNative }),
    ]).start();

    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      Animated.timing(translateY, { toValue: -140, duration: 200, useNativeDriver: useNative }).start(onDismiss as never);
    }, 4500);
    return () => clearTimeout(timer);
  }, [banner?.id, banner?.text, onDismiss, opacity, translateY]);

  if (!banner) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View style={[styles.banner, { transform: [{ translateY }], opacity }]}>
        <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.bannerBody}>
          <View style={styles.iconWrap}>
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.white} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>{banner.senderName}</Text>
            <Text style={styles.text} numberOfLines={2}>{banner.text}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.close} onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={16} color={colors.muted} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    boxShadow: '0 8px 16px rgba(16,42,67,0.25)',
    elevation: 8,
  },
  bannerBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: { flex: 1 },
  title: { color: colors.white, fontSize: 13, fontFamily: fonts.bold, marginBottom: 2 },
  text: { color: '#BCCCDC', fontSize: 12, fontFamily: fonts.medium, lineHeight: 16 },
  close: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
