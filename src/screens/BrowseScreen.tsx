import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { SelectionChip } from '../components/SelectionChip';
import { MenuCard } from '../components/MenuCard';
import { AGE_GROUPS, SPECIAL_CONDITIONS } from '../constants';
import { useResponsive } from '../hooks/useResponsive';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography } from '../theme';
import type { AgeGroup, FoodCategory, SpecialCondition } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Browse'>;

const CATEGORY_FILTERS: { label: string; value: FoodCategory | null }[] = [
  { label: 'Semua', value: null },
  { label: 'Makanan Utama', value: 'main_course' },
  { label: 'Soup', value: 'soup' },
  { label: 'Dessert', value: 'dessert' },
  { label: 'Kudapan', value: 'snack' },
  { label: 'Minuman', value: 'beverage' },
];

/** Home baru (discovery-first): pilih segmentasi → menu andalan dari RAG. */
export function BrowseScreen({ navigation }: Props) {
  const { isDesktop } = useResponsive();
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

  const applySegmentAndLoad = () => {
    if (!ageGroup || !condition) return;
    setSegment({ ageGroup, condition });
    setSearchMode(false);
    loadRecommendedMenus({ ageGroup, condition });
  };

  const onSearch = () => {
    if (!segmentReady) return;
    const q = query.trim();
    if (!q && !searchMode) return;
    setSearchMode(true);
    doSearch(q || 'rekomendasi sesuai preferensi', { ageGroup, condition }, category);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>sorgumcore</Text>
          <Text style={styles.headerSubtitle}>🌾 Racik olahan sorgum untuk keluargamu</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('History')}>
            <Text style={styles.iconBtnText}>🕘</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Container>
          {/* Step 1 — segmentasi */}
          <Text style={styles.stepLabel}>1 · Untuk siapa produk ini?</Text>
          <Text style={styles.fieldLabel}>Kelompok umur</Text>
          <View style={[styles.chipGrid, isDesktop && styles.chipGridWide]}>
            {AGE_GROUPS.map((g) => (
              <View key={g.value} style={[styles.chipCell, isDesktop && styles.chipCellWide]}>
                <SelectionChip
                  label={g.label}
                  emoji={g.emoji}
                  selected={ageGroup === g.value}
                  onPress={() => setAgeGroup(g.value)}
                />
              </View>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Kondisi khusus</Text>
          <View style={[styles.chipGrid, isDesktop && styles.chipGridWide]}>
            {SPECIAL_CONDITIONS.map((c) => (
              <View key={c.value} style={[styles.chipCell, isDesktop && styles.chipCellWide]}>
                <SelectionChip
                  label={c.label}
                  emoji={c.emoji}
                  selected={condition === c.value}
                  onPress={() => setCondition(c.value)}
                />
              </View>
            ))}
          </View>

          <Button
            title="Tampilkan Menu Andalan"
            onPress={applySegmentAndLoad}
            disabled={!segmentReady}
            style={styles.ctaBtn}
          />

          {/* Step 2 — pencarian & filter */}
          <View style={styles.searchSection}>
            <Text style={styles.stepLabel}>2 · Cari menu lain / tanya AI</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="cth: bubur sorgum, kue kering…"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={onSearch}
              />
              <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
                <Text style={styles.searchBtnText}>🔍</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRow}
            >
              {CATEGORY_FILTERS.map((c) => {
                const active = category === c.value;
                return (
                  <TouchableOpacity
                    key={c.label}
                    style={[styles.catChip, active && styles.catChipActive]}
                    onPress={() => {
                      setCategory(c.value);
                      if (searchMode) onSearch();
                    }}
                  >
                    <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Hasil */}
          {loadingMenus ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>
                {searchMode ? 'Mencari resep…' : 'Meracik menu andalan…'}
              </Text>
            </View>
          ) : menusError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{menusError}</Text>
              <Text style={styles.errorHint}>
                Periksa koneksi & pastikan API BIMA aktif. Coba lagi sebentar.
              </Text>
            </View>
          ) : menus.length > 0 ? (
            <View style={styles.menuList}>
              <Text style={styles.menuHeader}>
                {searchMode ? 'Hasil pencarian' : 'Menu andalan untukmu'} · {menus.length}
              </Text>
              {menus.map((m, i) => (
                <MenuCard
                  key={`${m.name}-${i}`}
                  menu={m}
                  onPress={() => navigation.navigate('RecipeDetail', { menu: m })}
                />
              ))}
            </View>
          ) : segmentReady ? (
            <Text style={styles.emptyHint}>
              Tekan "Tampilkan Menu Andalan" untuk melihat rekomendasi.
            </Text>
          ) : null}

          {isGuest ? (
            <View style={styles.guestStrip}>
              <Text style={styles.guestStripText}>
                Mode tamu — riwayat tersimpan di perangkat ini.
              </Text>
            </View>
          ) : null}
        </Container>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitles: { flexShrink: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16 },
  content: { paddingBottom: spacing.xxl },
  stepLabel: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  chipCell: { width: '100%' },
  chipGridWide: { gap: spacing.sm },
  chipCellWide: { width: '48%', flexGrow: 1 },
  ctaBtn: { marginTop: spacing.lg },
  searchSection: { marginTop: spacing.xl },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchInput: {
    flex: 1,
    height: 46,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  searchBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 18 },
  catRow: { gap: spacing.sm, paddingVertical: spacing.md },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primaryDark },
  catChipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  catChipTextActive: { color: colors.textOnPrimary },
  menuList: { marginTop: spacing.md },
  menuHeader: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm },
  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  loadingText: { marginTop: spacing.md, color: colors.textMuted },
  errorBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: { color: colors.danger, fontWeight: '700' },
  errorHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  emptyHint: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  guestStrip: {
    marginTop: spacing.xl,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  guestStripText: { color: colors.surfaceDark, fontSize: 12 },
});
