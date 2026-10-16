import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { useFlowStore } from '../store/flowStore';
import { recipeSession } from '../services/recipeSessionInstance';
import { useRecipeSession } from '../hooks/useRecipeSession';
import { colors, radius, spacing, typography } from '../theme';
import { cleanFoodText } from '../utils/cleanText';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;

/**
 * Detail resep lengkap: bahan + langkah + mulai masak (alur step-by-step).
 *
 * Layar ini pemakai PASIF dari module sesi resep: ia tidak lagi menyimpan salinan
 * loading/error sendiri (dulu ada `loading`/`error`/`loadedRecipe` lokal yang bisa
 * berbeda dari store) dan tidak lagi mengintip store lewat `getState()`. Seluruh
 * status membuka resep — memuat, siap, gagal — hidup di `services/recipeSession`.
 */
export function RecipeDetailScreen({ navigation, route }: Props) {
  const { menu } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const { status, recipe, error } = useRecipeSession();

  /**
   * Buka sesi resep untuk menu ini. Bila sesi untuk menu yang sama sudah siap/memuat,
   * module tidak mengambil ulang (membuka ulang resep yang sama tak membayar lama RAG
   * dua kali). Bila tidak ada menu (dibuka dari snapshot riwayat), sesi sudah diisi
   * lewat `openSnapshot`, jadi tak ada yang perlu diambil.
   */
  useEffect(() => {
    if (menu) recipeSession.open(menu.name, segment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.name, segment.ageGroup, segment.condition]);

  // Tidak ada menu & tidak ada resep aktif (mis. deep-link rusak) → fallback.
  if (!menu && !recipe) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.placeholder}>Tidak ada resep untuk ditampilkan.</Text>
      </SafeAreaView>
    );
  }

  /**
   * Saat dibuka dari menu Beranda, tanyakan status SESI UNTUK MENU INI ke module —
   * bukan membaca `status` mentah. Satu render pertama (sebelum effect di atas sempat
   * mengambilnya) sesi bisa saja masih memegang resep MENU LAIN; `statusFor` menjaga
   * agar resep yang salah tidak sempat berkedip. Saat dibuka dari snapshot (tanpa menu),
   * pakai status apa adanya.
   */
  const displayStatus = menu ? recipeSession.statusFor(menu.name) : status;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Resep</Text>
        <View style={{ width: 70 }} />
      </View>

      {displayStatus === 'loading' ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Menyusun resep langkah demi langkah…</Text>
        </View>
      ) : displayStatus === 'error' ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.centerText}>
            Jawaban hanya ditampilkan ketika layanan RAG tersedia.
          </Text>
          <Button title="Coba lagi" onPress={() => recipeSession.retry()} style={styles.retry} />
        </View>
      ) : recipe ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Container>
            <Text style={styles.title}>{recipe.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>🍽 {recipe.servings} porsi</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>⏱ ±{recipe.totalMinutes} menit</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>📋 {recipe.steps.length} langkah</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Bahan-bahan</Text>
            <View style={styles.card}>
              {recipe.ingredients.length === 0 ? (
                <Text style={styles.muted}>—</Text>
              ) : (
                recipe.ingredients.map((ing, i) => (
                  <Text key={i} style={styles.ingredient}>
                    {'• '}
                    {cleanFoodText(ing, { notes: 'all' })}
                  </Text>
                ))
              )}
            </View>

            <Text style={styles.sectionTitle}>Langkah</Text>
            <View style={styles.card}>
              {recipe.steps.map((s) => (
                <View key={s.order} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{s.order}</Text>
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={styles.stepTitle}>
                      {cleanFoodText(s.title, { maxLength: 60 })}
                      {s.durationMinutes ? (
                        <Text style={styles.stepTimer}> · ⏱ {s.durationMinutes} menit</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.stepInstr}>{cleanFoodText(s.instruction)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Button
              title="Lanjut ke Chef AI"
              onPress={() => navigation.navigate('Cooking', { recipe })}
              style={styles.cta}
            />
          </Container>
        </ScrollView>
      ) : (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Resep dari layanan belum bisa dibaca.</Text>
          <Text style={styles.centerText}>
            Layanan sedang tidak mengirim resep yang bisa dibaca. Coba lagi.
          </Text>
          <Button title="Coba lagi" onPress={() => recipeSession.retry()} style={styles.retry} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
  content: { paddingVertical: spacing.lg, paddingBottom: spacing.xxl },
  placeholder: { textAlign: 'center', marginTop: spacing.xxl, color: colors.textMuted },
  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  centerText: { color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  errorText: { color: colors.danger, fontWeight: '700' },
  title: { ...typography.h2, color: colors.text },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  metaChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  metaText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredient: { ...typography.body, color: colors.text, marginBottom: spacing.xs },
  stepRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: 14 },
  stepBody: { flex: 1 },
  stepTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  stepTimer: { color: colors.primary, fontWeight: '600' },
  stepInstr: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  cta: { marginTop: spacing.xl },
  retry: { marginTop: spacing.lg, alignSelf: 'stretch' },
  muted: { color: colors.textMuted },
});
