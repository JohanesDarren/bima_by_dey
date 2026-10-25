import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { AICompanion } from '../components/AICompanion';
import { StepTimerCard } from '../components/StepTimerCard';
import { VoiceCallModal } from '../components/VoiceCallModal';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { useStepTimer } from '../hooks/useStepTimer';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography, elevation } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { RecipeStep } from '../types';
import { saveCookHistory } from '../services/history';
import {
  buildCookingChatContext,
  buildCookingStepLabel,
  ingredientList,
} from '../prompts/cookingContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Cooking'>;

/** Catatan jawaban AI yang disimpan ke riwayat (hanya yang terakhir). */
const MAX_NOTES = 5;
const MAX_NOTE_LENGTH = 160;

/**
 * Mode masak: step-by-step terstruktur + timer tiap langkah + AI menemani
 * (diskusi via chat + TTS membaca instruksi).
 */
export function CookingScreen({ navigation, route }: Props) {
  const { recipe } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const isGuest = useAuthStore((s) => s.isGuest);

  const [stepIdx, setStepIdx] = useState(0);
  const [voiceCallVisible, setVoiceCallVisible] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  /**
   * Keyboard terbuka → langkah & catatan disembunyikan sementara, guliran layar
   * dimatikan, dan panel chat diberi seluruh tinggi yang tersisa. Dengan begitu
   * kolom tulis + tombol kirim selalu berada tepat di atas keyboard — tidak
   * bergantung pada waktu gulir-otomatis (pendekatan lama: kadang masih terpotong
   * karena jendela berubah ukuran setelah guliran terjadi).
   */
  const keyboardUp = useKeyboardVisible();

  const steps: RecipeStep[] = recipe?.steps ?? [];
  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const stepKey = `${recipe?.name ?? ''}#${stepIdx}`;
  const timer = useStepTimer(step?.durationMinutes, stepKey);

  // Langkah berganti → catatan langkah sebelumnya dibuang & layar kembali ke atas.
  useEffect(() => {
    setNotes([]);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [stepKey]);

  const goNext = () => {
    if (isLast) {
      // Selesai semua step — simpan ke riwayat (guest: MMKV).
      if (recipe) {
        try {
          saveCookHistory({
            id: `${Date.now()}`,
            recipeName: recipe.name,
            segment,
            finishedAt: new Date().toISOString(),
            recipe,
            notes: notes.map((n) => n.slice(0, MAX_NOTE_LENGTH)),
          });
        } catch {
          // gagal simpan — jangan blokir navigasi
        }
      }
      navigation.navigate('History');
      return;
    }
    setStepIdx((i) => i + 1);
  };

  if (!recipe || steps.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Resep tidak tersedia.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, elevation.sm]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backBtnText}>Keluar</Text>
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text style={styles.headerSub}>
            Langkah {stepIdx + 1} dari {steps.length}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        scrollEnabled={!keyboardUp}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, keyboardUp && styles.contentKeyboard]}
      >
        {/* Step aktif */}
        {step && !keyboardUp ? (
          <View style={[styles.stepCard, elevation.sm]}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNumBig}>
                <Text style={styles.stepNumBigText}>{step.order}</Text>
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
            <Text style={styles.stepInstr}>{step.instruction}</Text>

            {timer.secondsLeft !== null ? (
              <StepTimerCard
                secondsLeft={timer.secondsLeft}
                running={timer.running}
                durationMinutes={step.durationMinutes}
                onToggle={timer.toggle}
                onRestart={timer.restart}
              />
            ) : null}

            {/* Aksi */}
            <View style={styles.actionRow}>
              <Button
                title={isLast ? 'Selesai' : 'Selesai — Lanjut'}
                onPress={goNext}
                style={styles.nextBtn}
              />
            </View>
          </View>
        ) : null}

        {/* AI menemani — diskusi saat masak (teks + voice dua arah) */}
        <AICompanion
          context={buildCookingChatContext(recipe, stepIdx)}
          recipeName={recipe.name}
          recipeMeta={`Langkah ${stepIdx + 1} dari ${steps.length}`}
          simple
          onVoiceCall={() => setVoiceCallVisible(true)}
          placeholder={`Tanya soal langkah ${stepIdx + 1} / tanya bahan…`}
          // Hanya catatan terakhir yang disimpan ke riwayat — jangan menumpuk di memori.
          onAssistantMessage={(t) => setNotes((n) => [...n, t].slice(-MAX_NOTES))}
        />

        {isGuest && !keyboardUp ? (
          <Text style={styles.guestNote}>Mode tamu — progres disimpan lokal.</Text>
        ) : null}
      </ScrollView>

      {voiceCallVisible ? (
        <VoiceCallModal
          visible={voiceCallVisible}
          onClose={() => setVoiceCallVisible(false)}
          segment={segment}
          recipeName={recipe.name}
          stepLabel={buildCookingStepLabel(recipe, stepIdx)}
          recipeIngredients={ingredientList(recipe) ?? undefined}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.sm },
  backBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  headerMid: { flex: 1, paddingHorizontal: spacing.xs },
  headerTitle: { ...typography.body, color: colors.text, fontWeight: '800' },
  headerSub: { fontSize: 12, color: colors.textMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  /** Saat keyboard terbuka: isi pas setinggi ruang sisa, jadi panel chat dapat flex:1. */
  contentKeyboard: { flex: 1, padding: spacing.md, paddingBottom: spacing.md },
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNumBig: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumBigText: { color: colors.textOnPrimary, fontSize: 18, fontWeight: '800' },
  stepTitle: { ...typography.h3, color: colors.text, flex: 1 },
  stepInstr: { ...typography.body, color: colors.text, marginTop: spacing.md, lineHeight: 24 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  nextBtn: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: spacing.xl },
  errorText: { color: colors.danger, fontWeight: '700' },
  guestNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
});
