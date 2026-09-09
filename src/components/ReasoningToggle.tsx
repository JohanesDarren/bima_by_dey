import React from 'react';
import { StyleSheet, Switch, View, Text } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  enabled: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Toggle controlling the AI Reasoning ("Proses Meracik Resep") display.
 * Mirrors the web version's transparency control (PRD F-04 / §8.2).
 */
export function ReasoningToggle({ enabled, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <View style={styles.dot} />
        <View>
          <Text style={styles.title}>Tampilkan Proses Meracik</Text>
          <Text style={styles.subtitle}>
            {enabled ? 'AI reasoning terlihat di setiap balasan.' : 'Reasoning disembunyikan.'}
          </Text>
        </View>
      </View>
      <Switch
        value={enabled}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.primaryLight }}
        thumbColor={enabled ? colors.primaryDark : colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  copy: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: 10,
  },
  title: { ...typography.body, fontWeight: '700', color: colors.text },
  subtitle: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
});
