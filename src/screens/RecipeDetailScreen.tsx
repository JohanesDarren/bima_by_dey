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
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;

/** Detail resep lengkap: bahan + langkah + mulai masak (alur step-by-step). */
export function RecipeDetailScreen({ navigation, route }: Props) {
  const { menu } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const activeRecipe = useFlowStore((s) => s.activeRecipe);
  const loadRecipe = useFlowStore((s) => s.loadRecipe);

  const [loading, setLoading] = useState(() =>
    Boolean(menu && (!activeRecipe || activeRecipe.name !== menu.name)),
  );
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const recipe = activeRecipe;

  useEffect(() => {
    // Dari Browse: menu diberikan → ambil resep (bila belum cocok dgn aktif).
    if (!menu) return;
    let cancelled = false;
    if (!recipe || recipe.name !== menu.name) {
      setLoading(true);
      setError(null);
      loadRecipe(menu, segment)
        .then((loaded) => {
          if (!cancelled && !loaded) {
            setError(useFlowStore.getState().menusError || 'Resep RAG belum tersedia.');
          }
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

  const displayRecipe = menu ? (recipe?.name === menu.name ? recipe : null) : recipe;

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
          <Text style={styles.centerText}>Menyiapkan resep…</Text>
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
            <Text style={styles.metaText}>
              {displayRecipe.servings} porsi · ±{displayRecipe.totalMinutes} menit ·{' '}
              {displayRecipe.steps.length} langkah
            </Text>

            <Text style={styles.sectionTitle}>Bahan-bahan</Text>
            <View style={styles.card}>
              {displayRecipe.ingredients.length === 0 ? (
                <Text style={styles.muted}>—</Text>
              ) : (
                displayRecipe.ingredients.map((ing, i) => (
                  <Text key={i} style={styles.ingredient}>
                    {ing}
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
                      {s.title}
                      {s.durationMinutes ? (
                        <Text style={styles.stepTimer}> · {s.durationMinutes} menit</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.stepInstr}>{s.instruction}</Text>
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
          <Text style={styles.errorText}>Resep RAG belum tersedia.</Text>
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
  metaText: { ...typography.bodySm, color: colors.textMuted, marginTop: spacing.xs },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ingredient: { ...typography.bodySm, color: colors.text, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
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
  cta: { marginTop: spacing.lg },
  retry: { marginTop: spacing.lg, alignSelf: 'stretch' },
  muted: { color: colors.textMuted },
});
