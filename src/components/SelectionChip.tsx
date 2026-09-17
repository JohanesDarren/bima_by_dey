import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { radius, colors, spacing } from '../theme';

interface Props {
  label: string;
  selected: boolean;
  emoji?: string;
  onPress: () => void;
  compact?: boolean;
}

const iconFor = (label: string): keyof typeof MaterialIcons.glyphMap => {
  if (/balita/i.test(label)) return 'child-care';
  if (/anak|ABK/i.test(label)) return 'school';
  if (/remaja/i.test(label)) return 'face';
  if (/lansia/i.test(label)) return 'elderly';
  if (/hamil|menyusui|busui|bumil/i.test(label)) return 'favorite-border';
  if (/umum|dewasa|non/i.test(label)) return 'person-outline';
  return 'restaurant';
};

export function SelectionChip({ label, selected, onPress, compact = false }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.compact,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <MaterialIcons
          name={selected ? 'check' : iconFor(label)}
          size={17}
          color={selected ? colors.primaryDark : colors.primary}
        />
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  compact: { height: 52, paddingVertical: 7 },
  selected: { backgroundColor: colors.primary, borderColor: colors.accent },
  pressed: { opacity: 0.78 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: colors.accent },
  label: { flexShrink: 1, fontSize: 14, color: colors.text, fontWeight: '700' },
  labelSelected: { color: colors.textOnPrimary },
});
