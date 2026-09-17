import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { SelectionChip } from '../components/SelectionChip';
import { MenuCard } from '../components/MenuCard';
import { AGE_GROUPS, SPECIAL_CONDITIONS } from '../constants';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography } from '../theme';
import type { AgeGroup, FoodCategory, SpecialCondition } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Browse'>;

const CATEGORY_FILTERS: { label: string; value: FoodCategory | null }[] = [
  { label: 'Semua', value: null },
  { label: 'Makanan utama', value: 'main_course' },
  { label: 'Berkuah', value: 'soup' },
  { label: 'Kudapan', value: 'snack' },
  { label: 'Minuman', value: 'beverage' },
];

const SHORT_CONDITION_LABEL: Record<SpecialCondition, string> = {
  Umum: 'Umum',
  Bumil: 'Ibu hamil',
  Busui: 'Ibu menyusui',
  ABK: 'ABK',
  'Non-ABK': 'Non-ABK',
};

export function BrowseScreen({ navigation }: Props) {
  const isGuest = useAuthStore((s) => s.isGuest);
  const segment = useFlowStore((s) => s.segment);
  const menus = useFlowStore((s) => s.menus);
  const loadingMenus = useFlowStore((s) => s.loadingMenus);
  const menusError = useFlowStore((s) => s.menusError);
  const category = useFlowStore((s) => s.category);
  const setSegment = useFlowStore((s) => s.setSegment);
  const setCategory = useFlowStore((s) => s.setCategory);
  const loadRecommendedMenus = useFlowStore((s) => s.loadRecommendedMenus);
  const doSearch = useFlowStore((s) => s.doSearch);

  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(segment.ageGroup);
  const [condition, setCondition] = useState<SpecialCondition | null>(segment.condition);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const segmentReady = ageGroup !== null && condition !== null;

  const loadMenus = () => {
    if (!ageGroup || !condition) return;
    setSegment({ ageGroup, condition });
    setSearchMode(false);
    loadRecommendedMenus({ ageGroup, condition });
  };

  const search = (nextCategory = category) => {
    if (!ageGroup || !condition) return;
    const value = query.trim();
    setSearchMode(true);
    doSearch(value || 'rekomendasi sesuai preferensi', { ageGroup, condition }, nextCategory);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>sorgumcore</Text>
          <Text style={styles.tagline}>Dapur sorgum untuk keluargamu</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Riwayat masak"
            onPress={() => navigation.navigate('History')}
            style={styles.headerButton}
          >
            <MaterialIcons name="history" size={21} color={colors.accent} />
          </Pressable>
          <Pressable
            accessibilityLabel="Pengaturan"
            onPress={() => navigation.navigate('Settings')}
            style={styles.headerButton}
          >
            <MaterialIcons name="person-outline" size={21} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.introRow}>
          <View style={styles.grainMark}>
            <MaterialIcons name="grain" size={28} color={colors.accent} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.title}>Hari ini masak untuk siapa?</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Kelompok umur</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {AGE_GROUPS.map((item) => (
            <View key={item.value} style={styles.ageChoice}>
              <SelectionChip
                label={item.label}
                selected={ageGroup === item.value}
                onPress={() => setAgeGroup(item.value)}
                compact
              />
            </View>
          ))}
        </ScrollView>

        <Text style={styles.fieldLabel}>Kondisi khusus</Text>
        <View style={styles.conditionGrid}>
          {SPECIAL_CONDITIONS.map((item) => (
            <View key={item.value} style={styles.conditionChoice}>
              <SelectionChip
                label={SHORT_CONDITION_LABEL[item.value]}
                selected={condition === item.value}
                onPress={() => setCondition(item.value)}
                compact
              />
            </View>
          ))}
        </View>

        <Button
          title="Tampilkan resep"
          onPress={loadMenus}
          disabled={!segmentReady}
          style={styles.primaryAction}
        />

        <View style={styles.rule} />
        <Text style={styles.sectionTitle}>Cari resep</Text>
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Cari resep"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Cari bubur, kudapan, minuman…"
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
            onSubmitEditing={() => search()}
          />
          <Pressable
            accessibilityLabel="Mulai pencarian"
            disabled={!segmentReady}
            onPress={() => search()}
            style={styles.searchButton}
          >
            <MaterialIcons name="arrow-forward" size={19} color={colors.primaryDark} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
        >
          {CATEGORY_FILTERS.map((item) => {
            const selected = category === item.value;
            return (
              <Pressable
                key={item.label}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  setCategory(item.value);
                  if (searchMode) search(item.value);
                }}
                style={({ pressed }) => [
                  styles.category,
                  selected && styles.categorySelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {menus.length > 0 || loadingMenus || menusError ? (
          <View style={styles.resultDivider} />
        ) : null}

        {loadingMenus ? (
          <View style={styles.stateBox} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.stateTitle}>
              {searchMode ? 'Mencari resep' : 'Menyiapkan pilihan'}
            </Text>
            <Text style={styles.stateText}>Mengambil menu dari pengetahuan sorgum.</Text>
          </View>
        ) : menusError ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <MaterialIcons name="cloud-off" size={24} color={colors.danger} />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Menu belum bisa dimuat</Text>
              <Text style={styles.stateText}>{menusError}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={searchMode ? () => search() : loadMenus}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Coba lagi</Text>
            </Pressable>
          </View>
        ) : menus.length > 0 ? (
          <View style={styles.menuList}>
            {menus.map((menu, index) => (
              <MenuCard
                key={`${menu.name}-${index}`}
                menu={menu}
                featured={index === 0}
                onPress={() => navigation.navigate('RecipeDetail', { menu })}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <MaterialIcons name="menu-book" size={30} color={colors.accent} />
            <Text style={styles.stateTitle}>Belum ada menu</Text>
            <Text style={styles.stateText}>Pilih kebutuhan, lalu tampilkan resep.</Text>
          </View>
        )}

        {isGuest ? (
          <View style={styles.guestNote}>
            <MaterialIcons name="phone-android" size={16} color={colors.primary} />
            <Text style={styles.guestText}>Mode tamu · Riwayat tersimpan di perangkat ini</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 76,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { ...typography.h3, fontSize: 22, color: colors.primary },
  tagline: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 52 },
  introRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  grainMark: {
    width: 52,
    height: 64,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introCopy: { flex: 1 },
  eyebrow: {
    ...typography.label,
    fontSize: 10,
    color: colors.accentDark,
    textTransform: 'uppercase',
  },
  title: { ...typography.h1, color: colors.text, marginTop: 4 },
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  horizontalList: { gap: spacing.sm, paddingRight: spacing.xl },
  ageChoice: { width: 148 },
  conditionGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  conditionChoice: { width: '50%', paddingHorizontal: 4 },
  primaryAction: { marginTop: spacing.lg, backgroundColor: colors.primary },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xxl },
  sectionTitle: { ...typography.h2, color: colors.text, marginTop: 4 },
  resultDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  searchRow: {
    minHeight: 54,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingLeft: spacing.md,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categories: { gap: spacing.sm, paddingVertical: spacing.md, paddingRight: spacing.xl },
  category: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySelected: { backgroundColor: colors.primary, borderBottomColor: colors.accent },
  categoryText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  categoryTextSelected: { color: colors.textOnPrimary },
  pressed: { opacity: 0.7 },

  menuList: { marginTop: spacing.sm },
  stateBox: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  stateTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  stateText: { ...typography.bodySm, color: colors.textMuted, marginTop: 3, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.danger,
  },
  errorCopy: { flex: 1 },
  errorTitle: { fontSize: 15, fontWeight: '800', color: colors.danger },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryText: { color: colors.primary, fontWeight: '800' },
  guestNote: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  guestText: { ...typography.caption, color: colors.textMuted },
});
