import React from 'react';
import { View, StyleSheet } from 'react-native';

const Skeleton = ({ style }) => {
  return <View style={[styles.skeleton, style]} />;
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
});

export default Skeleton;
