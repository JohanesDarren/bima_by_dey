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
import { AICompanion } from '../components/AICompanion';
import { VoiceCallModal } from '../components/VoiceCallModal';
import { useAuthStore } from '../store/authStore';
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
  const isGuest = useAuthStore((s) => s.isGuest);

  const [loading, setLoading] = useState(() =>
    Boolean(menu && (!activeRecipe || activeRecipe.name !== menu.name)),
  );
  const [error, setError] = useState<string | null>(null);
  const [voiceCallVisible, setVoiceCallVisible] = useState(false);
  const recipe = activeRecipe;

  useEffect(() => {
    // Dari Browse: menu diberikan → ambil resep (bila belum cocok dgn aktif).
    if (!menu) return;
    if (!recipe || recipe.name !== menu.name) {
      setLoading(true);
      setError(null);
      loadRecipe(menu, segment)
        .then((loaded) => {
          if (!loaded) setError(useFlowStore.getState().menusError || 'Resep RAG belum tersedia.');
        })
        .finally(() => setLoading(false));
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
          <Text style={styles.centerText}>Menyusun resep langkah demi langkah…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.centerText}>
            Jawaban hanya ditampilkan ketika layanan RAG tersedia.
          </Text>
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
                        <Text style={styles.stepTimer}> · ⏱ {s.durationMinutes} menit</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.stepInstr}>{s.instruction}</Text>
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
  muted: { color: colors.textMuted },
  mutedCenter: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
