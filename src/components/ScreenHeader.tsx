import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, onBack, backLabel = '← Kembali', right }: Props) {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backBtnText}>{backLabel}</Text>
      </TouchableOpacity>
      <Text style={styles.navTitle}>{title}</Text>
      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.md, minWidth: 70 },
  backBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  navTitle: { ...typography.h3, color: colors.text },
  spacer: { width: 70 },
});
