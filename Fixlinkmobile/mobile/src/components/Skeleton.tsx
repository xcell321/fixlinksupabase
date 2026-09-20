import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';

export interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
}

export default function Skeleton({ style }: SkeletonProps): React.JSX.Element {
  return <View style={[styles.skeleton, style]} />;
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  } as ViewStyle,
});
