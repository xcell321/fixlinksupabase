import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

export interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
  // Placeholders on a dark surface pulse so the surface reads as "loading"
  // instead of as a finished block. Off by default so existing light-mode
  // skeletons keep their exact current look.
  pulse?: boolean;
}

export default function Skeleton({ style, pulse = false }: SkeletonProps): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, pulse]);

  return <Animated.View style={[styles.skeleton, style, pulse && { opacity }]} />;
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  } as ViewStyle,
});
