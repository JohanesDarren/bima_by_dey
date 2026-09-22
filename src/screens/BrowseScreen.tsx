import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { SelectionChip } from '../components/SelectionChip';
import { MenuCard } from '../components/MenuCard';
import { AGE_GROUPS, isConditionAllowed, isUnder18, SPECIAL_CONDITIONS } from '../constants';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography } from '../theme';
import type { AgeGroup, FoodCategory, SpecialCondition } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Browse'>;

const CATEGORY_FILTERS: { label: string; value: FoodCategory | null }[] = [
  { label: 'Makanan utama', value: 'main_course' },
  { label: 'Sup', value: 'soup' },
  { label: 'Hidangan penutup', value: 'dessert' },
  { label: 'Minuman', value: 'beverage' },
];

const SHORT_CONDITION_LABEL: Record<SpecialCondition, string> = {
  Umum: 'Umum',
  Bumil: 'Ibu hamil',
  Busui: 'Ibu menyusui',
  ABK: 'ABK',
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
  const generateMenus = useFlowStore((s) => s.generateMenus);

  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(segment.ageGroup);
  const [condition, setCondition] = useState<SpecialCondition | null>(segment.condition);
  const segmentReady = ageGroup !== null && condition !== null;

  const chooseAge = (nextAge: AgeGroup) => {
    const nextCondition = condition && isConditionAllowed(nextAge, condition) ? condition : null;
    setAgeGroup(nextAge);
    setCondition(nextCondition);
    setSegment({ ageGroup: nextAge, condition: nextCondition });
  };

  const chooseCondition = (nextCondition: SpecialCondition) => {
    if (!isConditionAllowed(ageGroup, nextCondition)) return;
    setCondition(nextCondition);
    setSegment({ ageGroup, condition: nextCondition });
  };

  const generate = (append = false) => {
    if (!ageGroup || !condition || !category) return;
    generateMenus({ ageGroup, condition }, category, append);
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
        <Text style={styles.title}>Masak untuk siapa?</Text>
        <Text style={styles.subtitle}>Pilih umur dan kondisi untuk menyesuaikan menu.</Text>

        <Text style={styles.fieldLabel}>Kelompok umur</Text>
        <View style={styles.choiceGrid}>
          {AGE_GROUPS.map((item) => (
            <View key={item.value} style={styles.choiceCell}>
              <SelectionChip
                label={item.label}
                selected={ageGroup === item.value}
                onPress={() => chooseAge(item.value)}
                compact
              />
            </View>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Kondisi khusus</Text>
        <View style={styles.choiceGrid}>
          {SPECIAL_CONDITIONS.map((item) => {
            const disabled = !isConditionAllowed(ageGroup, item.value);
            return (
              <View key={item.value} style={styles.choiceCell}>
                <SelectionChip
                  label={SHORT_CONDITION_LABEL[item.value]}
                  selected={condition === item.value}
                  onPress={() => chooseCondition(item.value)}
                  disabled={disabled}
                  compact
                />
              </View>
            );
          })}
        </View>
        {isUnder18(ageGroup) ? (
          <Text style={styles.conditionHint}>
            Ibu hamil dan ibu menyusui hanya tersedia untuk kelompok usia dewasa.
          </Text>
        ) : ageGroup === 'Lansia' ? (
          <Text style={styles.conditionHint}>Ibu menyusui tidak tersedia untuk usia 60+.</Text>
        ) : null}

        <View style={styles.rule} />
        <Text style={styles.filterTitle}>Pilih jenis menu</Text>
        <View style={styles.filterGrid}>
          {CATEGORY_FILTERS.map((item) => {
            const selected = category === item.value;
            return (
              <Pressable
                key={item.label}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !segmentReady || loadingMenus }}
                disabled={!segmentReady || loadingMenus || item.value === null}
                onPress={() => item.value && setCategory(item.value)}
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
        </View>

        <Button
          title="Buat 3 menu"
          onPress={() => generate(false)}
          disabled={!segmentReady || !category || loadingMenus}
          loading={loadingMenus && menus.length === 0}
          style={styles.primaryAction}
        />

        {menus.length > 0 || loadingMenus || menusError ? (
          <View style={styles.resultDivider} />
        ) : null}

        {menus.length > 0 && segment.ageGroup && segment.condition ? (
          <View style={styles.resultProfile}>
            <MaterialIcons name="verified" size={17} color={colors.primary} />
            <Text style={styles.resultProfileText}>
              Hasil untuk {segment.ageGroup} · {SHORT_CONDITION_LABEL[segment.condition]}
            </Text>
          </View>
        ) : null}

        {loadingMenus && menus.length === 0 ? (
          <View style={styles.stateBox} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.stateTitle}>Menyiapkan 3 menu</Text>
            <Text style={styles.stateText}>Mengambil menu dari pengetahuan sorgum.</Text>
          </View>
        ) : menus.length > 0 ? (
          <View style={styles.menuList}>
            {menusError ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <MaterialIcons name="cloud-off" size={24} color={colors.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>Menu baru belum bisa dimuat</Text>
                  <Text style={styles.stateText}>{menusError}</Text>
                </View>
              </View>
            ) : null}
            {menus.map((menu, index) => (
              <MenuCard
                key={`${menu.name}-${index}`}
                menu={menu}
                featured={index === 0}
                onPress={() => navigation.navigate('RecipeDetail', { menu })}
              />
            ))}
            <Button
              title="Buat 3 menu lainnya"
              onPress={() => generate(true)}
              loading={loadingMenus}
              disabled={loadingMenus}
              variant="ghost"
              style={styles.moreButton}
            />
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
              onPress={() => generate(menus.length > 0)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Coba lagi</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <MaterialIcons name="menu-book" size={30} color={colors.accent} />
            <Text style={styles.stateTitle}>Belum ada menu</Text>
            <Text style={styles.stateText}>Pilih umur, kondisi, dan jenis menu.</Text>
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
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 52 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySm, color: colors.textMuted, marginTop: 3 },
  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  choiceCell: { width: '50%', paddingHorizontal: 4 },
  conditionHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  primaryAction: { marginTop: spacing.lg, backgroundColor: colors.primary },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xxl },
  filterTitle: { ...typography.h3, color: colors.text },
  resultDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  resultProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  resultProfileText: { ...typography.bodySm, color: colors.primary, fontWeight: '700' },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  category: {
    width: '48%',
    flexGrow: 1,
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
  moreButton: { marginTop: spacing.md },
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
