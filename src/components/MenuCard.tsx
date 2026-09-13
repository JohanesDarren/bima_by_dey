import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { MenuItem } from '../types';
import { colors, radius, spacing, typography, elevation } from '../theme';

const CATEGORY_LABEL: Record<string, string> = {
  main_course: 'Makanan Utama',
  soup: 'Soup',
  dessert: 'Dessert',
  snack: 'Kudapan',
  beverage: 'Minuman',
  other: 'Lainnya',
};

const CATEGORY_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  main_course: 'restaurant',
  soup: 'local-dining',
  dessert: 'cake',
  snack: 'fastfood',
  beverage: 'local-cafe',
  other: 'star',
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
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, elevation.sm]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{menu.name}</Text>
        <View style={styles.catContainer}>
          <MaterialIcons 
            name={CATEGORY_ICON[menu.category] || 'star'} 
            size={14} 
            color={colors.primary} 
          />
          <Text style={styles.cat}>{CATEGORY_LABEL[menu.category] ?? menu.category}</Text>
        </View>
      </View>
      <Text style={styles.desc}>{menu.description}</Text>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.toggleContainer}>
          <MaterialIcons 
            name={open ? 'expand-less' : 'expand-more'} 
            size={16} 
            color={colors.primary} 
          />
          <Text style={styles.toggleText}>
            {open ? 'Sembunyikan detail' : 'Nutrisi, keunggulan & kelemahan'}
          </Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.detail}>
          {nutritionEntries.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Kandungan gizi</Text>
              {nutritionEntries.map(([k, v]) => (
                <View key={k} style={styles.bulletRow}>
                  <MaterialIcons name="fiber-manual-record" size={8} color={colors.textMuted} />
                  <Text style={styles.bullet}>
                    {k.replaceAll('_', ' ')}: {v}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {menu.strengths?.length ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.success }]}>Keunggulan</Text>
              {menu.strengths.map((s, i) => (
                <View key={i} style={styles.bulletRow}>
                  <MaterialIcons name="check-circle" size={14} color={colors.success} />
                  <Text style={styles.bullet}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {menu.weaknesses?.length ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.warning }]}>
                Perlu diperhatikan
              </Text>
              {menu.weaknesses.map((w, i) => (
                <View key={i} style={styles.bulletRow}>
                  <MaterialIcons name="warning" size={14} color={colors.warning} />
                  <Text style={styles.bullet}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable onPress={onPress} style={styles.openBtn} accessibilityRole="button">
            <Text style={styles.openBtnText}>Lihat resep lengkap</Text>
            <MaterialIcons name="arrow-forward" size={16} color={colors.textOnPrimary} />
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
    borderWidth: 0,
  },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  header: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  title: { ...typography.h3, color: colors.text, flexShrink: 1 },
  catContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cat: { fontSize: 11, color: colors.primary, fontWeight: '700', textTransform: 'uppercase' },
  desc: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.sm },
  toggle: { marginTop: spacing.md },
  toggleContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  detail: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  section: { marginBottom: spacing.md },
  sectionTitle: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4, marginTop: 2 },
  bullet: { ...typography.bodySm, color: colors.text, flex: 1 },
  openBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...elevation.sm,
  },
  openBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
});
