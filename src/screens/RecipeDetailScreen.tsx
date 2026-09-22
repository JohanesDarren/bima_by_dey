import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { ScreenHeader } from '../components/ScreenHeader';
import { AICompanion } from '../components/AICompanion';
import { VoiceCallModal } from '../components/VoiceCallModal';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { MenuItem } from '../types';
import { cleanFoodText } from '../utils/cleanText';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;

/**
 * Menu dianggap sama bila objeknya sama, atau namanya sama setelah spasi dan
 * besar-kecil huruf diabaikan.
 *
 * Kenapa tidak membandingkan `recipe.name === menu.name` secara persis: nama pada
 * jawaban AI bisa berbeda tipis dari nama menu (tambah kata, spasi tersembunyi,
 * huruf besar/kecil). Dulu itu membuat resep yang SUDAH berhasil dimuat dibuang,
 * dan layar menampilkan "Resep RAG belum tersedia." tanpa sebab yang jelas.
 */
function isSameMenu(a: MenuItem | null, b: MenuItem | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

/** Detail resep lengkap: bahan + langkah + mulai masak (alur step-by-step). */
export function RecipeDetailScreen({ navigation, route }: Props) {
  const { menu } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const activeRecipe = useFlowStore((s) => s.activeRecipe);
  const activeMenu = useFlowStore((s) => s.activeMenu);
  const loadRecipe = useFlowStore((s) => s.loadRecipe);
  const isGuest = useAuthStore((s) => s.isGuest);

  // Resep aktif dipakai hanya kalau memang dimuat untuk menu yang dibuka ini.
  const recipeFitsMenu = isSameMenu(activeMenu, menu);

  const [loading, setLoading] = useState(() => Boolean(menu && !recipeFitsMenu));
  const [error, setError] = useState<string | null>(null);
  const [voiceCallVisible, setVoiceCallVisible] = useState(false);
  const recipe = activeRecipe;

  const reload = React.useCallback(() => {
    if (!menu) return;
    setLoading(true);
    setError(null);
    loadRecipe(menu, useFlowStore.getState().segment)
      .then((loaded) => {
        if (!loaded) setError(useFlowStore.getState().menusError || 'Resep RAG belum tersedia.');
      })
      .finally(() => setLoading(false));
  }, [menu, loadRecipe]);

  useEffect(() => {
    // Dari Browse: ambil resep bila resep aktif bukan untuk menu ini.
    if (!menu) return;
    const { activeRecipe: nowRecipe, activeMenu: nowMenu } = useFlowStore.getState();
    if (!nowRecipe || !isSameMenu(nowMenu, menu)) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.name]);

  // Tidak ada menu & tidak ada resep aktif (mis. deep-link rusak) → fallback.
  if (!menu && !recipe) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.placeholder}>Tidak ada resep untuk ditampilkan.</Text>
      </SafeAreaView>
    );
  }

  const displayRecipe = menu ? (recipeFitsMenu ? recipe : null) : recipe;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Resep" onBack={() => navigation.goBack()} />

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
          <Button title="Coba lagi" onPress={reload} style={styles.retryBtn} />
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

            {/* AI menemani — diskusi resep SEBELUM mulai masak (teks + voice dua arah) */}
            <Text style={styles.sectionTitle}>Diskusi Resep</Text>
            <AICompanion
              context={`Kita sedang membahas resep "${displayRecipe.name}" (${displayRecipe.servings} porsi, ±${displayRecipe.totalMinutes} menit). Bahan: ${displayRecipe.ingredients.join(', ')}. Langkah: ${displayRecipe.steps.map((s) => `${s.order}. ${s.title}`).join(' | ')}. Jawab pertanyaan user seputar resep ini dengan ramah.`}
              recipeName={displayRecipe.name}
              recipeMeta={`${displayRecipe.totalMinutes} mnt • ${displayRecipe.steps.length} langkah`}
              onVoiceCall={() => setVoiceCallVisible(true)}
              placeholder="Tanya soal resep / ganti bahan / porsi…"
            />

            <Button
              title="Mulai Masak — AI Menemanimu 👨‍🍳"
              onPress={() => navigation.navigate('Cooking', { recipe: displayRecipe })}
              style={styles.cta}
            />
            {isGuest ? (
              <Text style={styles.mutedCenter}>
                Mode tamu: progres masak & diskusi disimpan di perangkat ini.
              </Text>
            ) : null}
          </Container>
        </ScrollView>
      ) : (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Resep RAG belum tersedia.</Text>
          <Text style={styles.centerText}>Kembali dan coba lagi setelah layanan pulih.</Text>
        </View>
      )}
      {voiceCallVisible && displayRecipe ? (
        <VoiceCallModal
          visible={voiceCallVisible}
          onClose={() => setVoiceCallVisible(false)}
          segment={segment}
          recipeName={displayRecipe.name}
          stepLabel={`${displayRecipe.totalMinutes} mnt • ${displayRecipe.steps.length} langkah`}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
  retryBtn: { marginTop: spacing.lg, minWidth: 180 },
  muted: { color: colors.textMuted },
  mutedCenter: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
