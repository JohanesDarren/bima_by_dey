import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { radius, colors, spacing } from '../theme';

interface Props {
  label: string;
  selected: boolean;
  emoji: string;
  onPress: () => void;
}

/** Selectable chip/radio card for Age Group & Special Condition pickers. */
export function SelectionChip({ label, selected, emoji, onPress }: Props) {
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  emoji: { fontSize: 18 },
  label: { fontSize: 15, color: colors.text, fontWeight: '600' },
  labelSelected: { color: colors.textOnPrimary },
});
