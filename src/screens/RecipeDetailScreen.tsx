import React, { useEffect, useState } from 'react';
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
import { colors, radius, spacing, typography } from '../theme';
import { menuKey } from '../utils/menuKey';
import { cleanFoodText } from '../utils/cleanText';
import type { Recipe } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;

/**
 * Resep dianggap cocok dengan menu yang dibuka bila KUNCINYA sama — spasi, tanda
 * baca, dan besar-kecil huruf diabaikan (utils/menuKey.ts).
 *
 * Kenapa tidak membandingkan nama secara persis: nama pada jawaban AI bisa
 * berbeda tipis dari nama menu (tambah kata, tanda hubung, spasi ganda). Dulu itu
 * membuat resep yang SUDAH berhasil dimuat dibuang, dan layar menampilkan
 * "Resep RAG belum tersedia." tanpa sebab yang jelas.
 */
function sameMenu(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return menuKey(a) === menuKey(b);
}

/** Detail resep lengkap: bahan + langkah + mulai masak (alur step-by-step). */
export function RecipeDetailScreen({ navigation, route }: Props) {
  const { menu } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const activeRecipe = useFlowStore((s) => s.activeRecipe);
  const activeMenu = useFlowStore((s) => s.activeMenu);
  const loadRecipe = useFlowStore((s) => s.loadRecipe);

  /**
   * Resep yang BARU SAJA dimuat untuk menu ini. Ditampilkan langsung tanpa
   * membandingkan nama: nama resep dari AI sering menambah/mengurangi kata dari
   * nama menu ("Bubur Sorgum Ayam" vs "Bubur Sorgum Ayam Sayur"), dan dulu
   * perbandingan nama itu membuang resep yang sudah berhasil dimuat — layar
   * menampilkan "Resep RAG belum tersedia" padahal datanya ada.
   */
  const [loadedRecipe, setLoadedRecipe] = useState<Recipe | null>(null);
  /** Resep di store memang milik menu ini, diketahui dari menu yang diminta. */
  const storeRecipeIsThisMenu = Boolean(menu && activeMenu && sameMenu(activeMenu.name, menu.name));
  const [loading, setLoading] = useState(() => Boolean(menu && !storeRecipeIsThisMenu));
  const [error, setError] = useState<string | null>(null);
  /** Dinaikkan saat pengguna menekan "Coba lagi" → memicu pengambilan ulang. */
  const [retryKey, setRetryKey] = useState(0);
  const recipe = activeRecipe;

  useEffect(() => {
    // Dari Browse: menu diberikan → ambil resep (bila store belum punya resep menu ini).
    if (!menu) return;
    // Penjaga: hasil permintaan yang sudah tidak relevan (pengguna pindah menu atau
    // menekan "Coba lagi") tidak boleh lagi menimpa layar.
    let cancelled = false;
    if (!storeRecipeIsThisMenu || retryKey > 0) {
      setLoading(true);
      setError(null);
      loadRecipe(menu, segment)
        .then((loaded) => {
          if (cancelled) return;
          if (loaded) {
            setLoadedRecipe(loaded);
            return;
          }
          setError(
            useFlowStore.getState().menusError ||
              'Layanan resep tidak merespons. Coba lagi sebentar lagi.',
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.name, retryKey]);

  // Tidak ada menu & tidak ada resep aktif (mis. deep-link rusak) → fallback.
  if (!menu && !recipe) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.placeholder}>Tidak ada resep untuk ditampilkan.</Text>
      </SafeAreaView>
    );
  }

  const displayRecipe = menu ? (loadedRecipe ?? (storeRecipeIsThisMenu ? recipe : null)) : recipe;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Resep</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>Menyusun resep langkah demi langkah…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.centerText}>
            Jawaban hanya ditampilkan ketika layanan RAG tersedia.
          </Text>
          <Button
            title="Coba lagi"
            onPress={() => {
              setError(null);
              setRetryKey((value) => value + 1);
            }}
            style={styles.retry}
          />
        </View>
      ) : displayRecipe ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <Container>
            <Text style={styles.title}>{displayRecipe.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>🍽 {displayRecipe.servings} porsi</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>⏱ ±{displayRecipe.totalMinutes} menit</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>📋 {displayRecipe.steps.length} langkah</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Bahan-bahan</Text>
            <View style={styles.card}>
              {displayRecipe.ingredients.length === 0 ? (
                <Text style={styles.muted}>—</Text>
              ) : (
                displayRecipe.ingredients.map((ing, i) => (
                  <Text key={i} style={styles.ingredient}>
                    {'• '}
                    {cleanFoodText(ing, { notes: 'all' })}
                  </Text>
                ))
              )}
            </View>

            <Text style={styles.sectionTitle}>Langkah</Text>
            <View style={styles.card}>
              {displayRecipe.steps.map((s) => (
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
              onPress={() => navigation.navigate('Cooking', { recipe: displayRecipe })}
              style={styles.cta}
            />
          </Container>
        </ScrollView>
      ) : (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Resep dari layanan belum bisa dibaca.</Text>
          <Text style={styles.centerText}>Kembali dan coba lagi setelah layanan pulih.</Text>
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
