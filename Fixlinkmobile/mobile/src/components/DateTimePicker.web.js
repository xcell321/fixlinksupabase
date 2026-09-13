import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

export default function DateTimePicker({ value, mode, onChange, minimumDate }) {
  const isDateMode = mode === 'date';
  const today = minimumDate && minimumDate instanceof Date
    ? minimumDate.toISOString().slice(0, 10)
    : undefined;

  const handleChange = (event) => {
    const rawValue = event.target.value;
    if (!rawValue) {
      onChange?.({ type: 'dismissed' }, undefined);
      return;
    }
    const parsed = isDateMode ? new Date(`${rawValue}T00:00:00`) : new Date(`1970-01-01T${rawValue}:00`);
    onChange?.({ type: 'set' }, parsed);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{isDateMode ? 'Select Date' : 'Select Time'}</Text>
      <input
        type={isDateMode ? 'date' : 'time'}
        value={isDateMode
          ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
          : `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`}
        min={isDateMode ? today : undefined}
        onChange={handleChange}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#102A43',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    backgroundColor: '#F5F8FA',
    fontSize: 14,
    color: '#102A43',
  },
});