import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { MenuItem } from '../types';
import { colors, radius, spacing, typography, elevation } from '../theme';

const CATEGORY_LABEL: Record<string, string> = {
  main_course: 'Makanan utama',
  soup: 'Berkuah',
  dessert: 'Hidangan manis',
  snack: 'Kudapan',
  beverage: 'Minuman',
  other: 'Olahan sorgum',
};
const CATEGORY_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  main_course: 'restaurant',
  soup: 'soup-kitchen',
  dessert: 'cake',
  snack: 'bakery-dining',
  beverage: 'local-cafe',
  other: 'grain',
};

interface Props {
  menu: MenuItem;
  onPress: () => void;
  featured?: boolean;
}

export function MenuCard({ menu, onPress, featured = false }: Props) {
  const [open, setOpen] = useState(false);
  const nutritionEntries = Object.entries(menu.nutrition ?? {}).slice(0, 3);
  const icon = CATEGORY_ICON[menu.category] ?? 'grain';

  return (
    <View style={[styles.card, featured && styles.featured, elevation.sm]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buka resep ${menu.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
      >
        <View style={[styles.art, featured && styles.artFeatured]}>
          <MaterialIcons name={icon} size={featured ? 38 : 30} color={colors.accent} />
        </View>
        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Text style={styles.category}>{CATEGORY_LABEL[menu.category] ?? 'Olahan sorgum'}</Text>
            <MaterialIcons
              name="arrow-forward"
              size={17}
              color={featured ? colors.accent : colors.primary}
            />
          </View>
          <Text style={[styles.title, featured && styles.titleFeatured]} numberOfLines={2}>
            {menu.name}
          </Text>
          <Text style={[styles.desc, featured && styles.descFeatured]} numberOfLines={2}>
            {menu.description}
          </Text>
        </View>
      </Pressable>

      {nutritionEntries.length > 0 ? (
        <View style={[styles.nutritionRow, featured && styles.darkDivider]}>
          {nutritionEntries.map(([k, v]) => (
            <View key={k} style={styles.nutritionCell}>
              <Text
                style={[styles.nutritionLabel, featured && styles.mutedOnDark]}
                numberOfLines={1}
              >
                {k.replaceAll('_', ' ')}
              </Text>
              <Text
                style={[styles.nutritionValue, featured && styles.lightOnDark]}
                numberOfLines={1}
              >
                {String(v)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.detailToggle, pressed && styles.pressed]}
      >
        <Text style={[styles.detailToggleText, featured && styles.accentText]}>
          {open ? 'Tutup catatan' : 'Kelebihan & perhatian'}
        </Text>
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={19}
          color={featured ? colors.accent : colors.primary}
        />
      </Pressable>

      {open ? (
        <View style={[styles.details, featured && styles.darkDivider]}>
          {menu.strengths.slice(0, 2).map((item, index) => (
            <View key={`s-${index}`} style={styles.noteRow}>
              <MaterialIcons name="check-circle" size={16} color={colors.success} />
              <Text style={[styles.note, featured && styles.lightOnDark]}>{item}</Text>
            </View>
          ))}
          {menu.weaknesses.slice(0, 2).map((item, index) => (
            <View key={`w-${index}`} style={styles.noteRow}>
              <MaterialIcons name="info-outline" size={16} color={colors.accent} />
              <Text style={[styles.note, featured && styles.lightOnDark]}>{item}</Text>
            </View>
          ))}
          <Pressable onPress={onPress} style={styles.openButton} accessibilityRole="button">
            <Text style={styles.openButtonText}>Lihat resep</Text>
            <MaterialIcons name="arrow-forward" size={17} color={colors.primaryDark} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  featured: { backgroundColor: colors.surfaceDark, borderColor: colors.surfaceDarkAlt },
  summary: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, minHeight: 112 },
  pressed: { opacity: 0.72 },
  art: {
    width: 78,
    minHeight: 82,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artFeatured: { width: 92, backgroundColor: colors.primaryDark },
  body: { flex: 1, minWidth: 0 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  category: {
    ...typography.label,
    color: colors.accentDark,
    textTransform: 'uppercase',
    fontSize: 10,
  },
  title: { ...typography.h3, color: colors.text, marginTop: 5 },
  titleFeatured: { color: colors.textOnPrimary },
  desc: { ...typography.caption, color: colors.textMuted, marginTop: 5 },
  descFeatured: { color: '#B8C5BB' },
  nutritionRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  darkDivider: { borderTopColor: colors.surfaceDarkAlt },
  nutritionCell: { flex: 1, minWidth: 0 },
  nutritionLabel: { fontSize: 9, color: colors.textMuted, textTransform: 'capitalize' },
  nutritionValue: { fontSize: 11, color: colors.text, fontWeight: '800', marginTop: 2 },
  mutedOnDark: { color: '#AAB9AE' },
  lightOnDark: { color: colors.textOnPrimary },
  detailToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  detailToggleText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  accentText: { color: colors.accent },
  details: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  noteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: 7 },
  note: { ...typography.bodySm, flex: 1, color: colors.text },
  openButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  openButtonText: { color: colors.primaryDark, fontWeight: '800' },
});
