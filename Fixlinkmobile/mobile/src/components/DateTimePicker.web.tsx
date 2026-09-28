import React from 'react';
import { View, Text } from 'react-native';
import { fonts, themedStyles } from '../theme';

export interface DateTimePickerWebProps {
  value: Date;
  mode: 'date' | 'time';
  onChange?: (event: { type: string }, date: Date | undefined) => void;
  minimumDate?: Date;
}

export default function DateTimePicker({ value, mode, onChange, minimumDate }: DateTimePickerWebProps): React.JSX.Element {
  const isDateMode: boolean = mode === 'date';
  const today: string | undefined =
    minimumDate && minimumDate instanceof Date ? minimumDate.toISOString().slice(0, 10) : undefined;

  const handleChange = (event: { target: { value: string } }): void => {
    const rawValue: string = event.target.value;
    if (!rawValue) {
      onChange?.({ type: 'dismissed' }, undefined);
      return;
    }
    const parsed: Date = isDateMode ? new Date(`${rawValue}T00:00:00`) : new Date(`1970-01-01T${rawValue}:00`);
    onChange?.({ type: 'set' }, parsed);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{isDateMode ? 'Select Date' : 'Select Time'}</Text>
      {/* web-only input; allow dom element */}
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore - input is web-only */}
      <input
        type={isDateMode ? 'date' : 'time'}
        value={
          isDateMode
            ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
            : `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
        }
        min={isDateMode ? today : undefined}
        onChange={handleChange as unknown as React.ChangeEventHandler<HTMLInputElement>}
        style={styles.input as unknown as React.CSSProperties}
      />
    </View>
  );
}

const styles = themedStyles({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
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
    fontFamily: fonts.regular,
  } as never,
});
