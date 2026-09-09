import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MenuItem } from '../types';
import { colors, radius, spacing, typography } from '../theme';

const CATEGORY_LABEL: Record<string, string> = {
  main_course: '🍽 Makanan Utama',
  soup: '🍲 Soup',
  dessert: '🍰 Dessert',
  snack: '🍪 Kudapan',
  beverage: '🥤 Minuman',
  other: '✨ Lainnya',
};

interface Props {
  menu: MenuItem;
  onPress: () => void;
}

/** Kartu menu andalan: deskripsi + gizi + keunggulan/kelemahan (expandable). */
export function MenuCard({ menu, onPress }: Props) {
  const [open, setOpen] = useState(false);
  const nutritionEntries = Object.entries(menu.nutrition ?? {});

  return (
    <Pressable
      onPress={() => {
        onPress();
        setOpen(false);
      }}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{menu.name}</Text>
        <Text style={styles.cat}>{CATEGORY_LABEL[menu.category] ?? menu.category}</Text>
      </View>
      <Text style={styles.desc}>{menu.description}</Text>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleText}>
          {open ? '▲ Sembunyikan detail' : '▼ Nutrisi, keunggulan & kelemahan'}
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.detail}>
          {nutritionEntries.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Kandungan gizi</Text>
              {nutritionEntries.map(([k, v]) => (
                <Text key={k} style={styles.bullet}>
                  {'• '}
                  {k.replaceAll('_', ' ')}: {v}
                </Text>
              ))}
            </View>
          ) : null}
          {menu.strengths?.length ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.success }]}>Keunggulan</Text>
              {menu.strengths.map((s, i) => (
                <Text key={i} style={styles.bullet}>
                  {'✅ '}
                  {s}
                </Text>
              ))}
            </View>
          ) : null}
          {menu.weaknesses?.length ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.warning }]}>
                Perlu diperhatikan
              </Text>
              {menu.weaknesses.map((w, i) => (
                <Text key={i} style={styles.bullet}>
                  {'⚠️ '}
                  {w}
                </Text>
              ))}
            </View>
          ) : null}
          <Pressable onPress={onPress} style={styles.openBtn} accessibilityRole="button">
            <Text style={styles.openBtnText}>Lihat resep lengkap →</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: { ...typography.h3, color: colors.text, flexShrink: 1 },
  cat: { fontSize: 11, color: colors.primary, fontWeight: '700', textTransform: 'uppercase' },
  desc: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.sm },
  toggle: { marginTop: spacing.md },
  toggleText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  detail: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  section: { marginBottom: spacing.md },
  sectionTitle: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  bullet: { ...typography.bodySm, color: colors.text, marginBottom: 2 },
  openBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  openBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
});
