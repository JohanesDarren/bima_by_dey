import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
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
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
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
    minHeight: 44,
    minWidth: 44,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: colors.surfaceAlt,
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  emoji: { fontSize: 18 },
  label: { fontSize: 15, color: colors.text, fontWeight: '600' },
  labelSelected: { color: colors.textOnPrimary },
});
