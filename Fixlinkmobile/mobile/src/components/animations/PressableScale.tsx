import React, { useRef } from 'react';
import { Animated, Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

export interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'menuitem';
  disabled?: boolean;
  // Scale applied while pressed. 0.97 keeps feedback visible without jitter.
  pressedScale?: number;
}

// Press feedback using only transform scale and opacity, both native-driver
// safe. Replaces instant style swaps with a short spring back so taps settle
// instead of snapping. Renders final state instantly when reduced motion is on.
export default function PressableScale({
  children,
  onPress,
  style,
  pressedStyle,
  accessibilityLabel,
  accessibilityRole = 'button',
  disabled = false,
  pressedScale = 0.97,
}: PressableScaleProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number): void => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue,
      speed: 28,
      bounciness: 4,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => animateTo(pressedScale)}
      onPressOut={() => animateTo(1)}
      style={({ pressed }) => [
        pressed && !reduced ? pressedStyle : null,
      ]}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
