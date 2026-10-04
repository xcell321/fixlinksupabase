import React, { useEffect, useRef } from 'react';
import { Animated, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

export interface FadeInViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  // Distance in pixels the view slides up while fading in. Keep small so the
  // motion reads as a settle, not a travel. 0 disables the slide.
  slideUp?: number;
  duration?: number;
  delay?: number;
}

// Mount entrance: opacity 0 to 1 plus an optional small translateY settle.
// Uses only transform and opacity (never layout props) so it stays on the
// native driver on iOS and Android and never triggers a layout pass.
export default function FadeInView({
  children,
  style,
  slideUp = 12,
  duration = 260,
  delay = 0,
}: FadeInViewProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduced ? 0 : slideUp)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      translateY.setValue(0);
      return undefined;
    }
    opacity.setValue(0);
    translateY.setValue(slideUp);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, duration, opacity, reduced, slideUp, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
