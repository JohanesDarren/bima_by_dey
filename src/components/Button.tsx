import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  style?: ViewStyle | ViewStyle[];
}

/** Primary action button with loading + disabled states. */
export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}: Props) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.8}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: bg, borderWidth: variant === 'ghost' ? 1.5 : 0 },
        variant === 'ghost' && { borderColor: colors.primary },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.primary : colors.textOnPrimary} />
      ) : (
        <Text style={[styles.text, variant === 'ghost' && { color: colors.primary }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  text: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.55 },
});
