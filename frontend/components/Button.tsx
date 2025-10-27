import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../styles/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button = ({ title, onPress, variant = 'primary' }: ButtonProps) => {
  return (
    <TouchableOpacity
      style={[styles.button, variant === 'primary' ? styles.primary : styles.secondary]}
      onPress={onPress}
    >
      <Text style={[styles.text, variant === 'secondary' && { color: COLORS.secondary }]}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: { padding: SIZES.padding, borderRadius: SIZES.borderRadius, alignItems: 'center' },
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.secondary },
  text: { color: COLORS.white, fontWeight: '600' },
});
