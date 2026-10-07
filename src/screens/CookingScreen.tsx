import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { AICompanion } from '../components/AICompanion';
import { VoicePane } from '../components/VoicePane';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography, elevation } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { RecipeStep } from '../types';
import { saveCookHistory } from '../services/history';

type Props = NativeStackScreenProps<RootStackParamList, 'Cooking'>;

/** Dua mode pada satu halaman masak. */
type CookingMode = 'chat' | 'voice';

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Mode masak: satu halaman, dua mode.
 *
 *  - Widget sticky di paling atas memuat paragraf pengantar langkah, hitungan
 *    waktu, dan tombol jeda/reset.
 *  - Di bawahnya ada tombol ganti mode (chat/suara) dan tombol lanjut langkah.
 *  - Isi halaman berganti sesuai mode: chat bergaya messenger, atau karakter
 *    mode suara (mikrofon dua arah) — widget dan tombol mode tetap di tempat.
 */
export function CookingScreen({ navigation, route }: Props) {
  const { recipe } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const isGuest = useAuthStore((s) => s.isGuest);
  const insets = useSafeAreaInsets();

  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [mode, setMode] = useState<CookingMode>('chat');
  const [notes, setNotes] = useState<string[]>([]);
  /** Pop-up pengantar langkah lengkap (dibuka dari widget ringkasan). */
  const [detailOpen, setDetailOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps: RecipeStep[] = recipe?.steps ?? [];
  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  // Start/reset timer ketika step berubah & step punya durasi.
  useEffect(() => {
    clearTimer();
    if (step?.durationMinutes && step.durationMinutes > 0) {
      setSecondsLeft(step.durationMinutes * 60);
      setTimerRunning(true);
    } else {
      setSecondsLeft(null);
      setTimerRunning(false);
    }
    setNotes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, recipe?.name]);

  // Tick timer.
  useEffect(() => {
    if (!timerRunning || secondsLeft === null) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((v) => {
        if (v === null || v <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

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
            notes: notes.slice(-5).map((n) => n.slice(0, 160)),
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

  const resetTimer = () => {
    if (step?.durationMinutes && step.durationMinutes > 0) {
      setSecondsLeft(step.durationMinutes * 60);
      setTimerRunning(true);
    }
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

  const hasTimer = secondsLeft !== null;
  const timerDone = secondsLeft === 0;
  const timerStatus = timerRunning
    ? 'Waktu berjalan'
    : timerDone
      ? 'Waktu selesai!'
      : 'Waktu dijeda';
  const timerIcon = timerRunning
    ? 'hourglass-bottom'
    : timerDone
      ? 'check-circle'
      : 'pause-circle-outline';

  const stepLabel = step
    ? `Langkah ${stepIdx + 1}/${steps.length}: ${step.title}. ${step.instruction}`
    : `Langkah ${stepIdx + 1} dari ${steps.length}`;

  return (
    <View style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }, elevation.sm]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Keluar dari panduan memasak"
        >
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

      {/* Widget ringkas: ketuk widget untuk membuka pop-up pengantar & detail langkah lengkap */}
      <View style={styles.widgetWrap}>
        <View style={[styles.widget, elevation.sm]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Ketuk untuk melihat detail pengantar langkah"
            activeOpacity={0.7}
            onPress={() => setDetailOpen(true)}
            style={styles.widgetTouchArea}
          >
            <View style={styles.widgetHead}>
              <View style={styles.stepChip}>
                <Text style={styles.stepChipText}>{step?.order ?? stepIdx + 1}</Text>
              </View>
              <Text style={styles.widgetTitle} numberOfLines={1}>
                {step?.title ?? 'Langkah memasak'}
              </Text>
              <Text style={[styles.widgetTime, timerDone && styles.widgetTimeDone]}>
                {hasTimer ? fmt(secondsLeft ?? 0) : '--:--'}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
            </View>

            <Text style={styles.widgetIntro} numberOfLines={1}>
              {step?.instruction ?? 'Ikuti langkah pada resep ini.'}
            </Text>
          </TouchableOpacity>

          <View style={styles.widgetActions}>
            {hasTimer && timerDone ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Ulangi waktu"
                style={styles.widgetBtn}
                onPress={resetTimer}
              >
                <MaterialIcons name="refresh" size={12} color={colors.text} />
                <Text style={styles.widgetBtnText}>Ulangi</Text>
              </TouchableOpacity>
            ) : null}
            {hasTimer && !timerDone ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={timerRunning ? 'Jeda waktu' : 'Lanjutkan waktu'}
                style={styles.widgetBtn}
                onPress={() => setTimerRunning((r) => !r)}
              >
                <MaterialIcons
                  name={timerRunning ? 'pause' : 'play-arrow'}
                  size={12}
                  color={colors.text}
                />
                <Text style={styles.widgetBtnText}>{timerRunning ? 'Jeda' : 'Lanjut'}</Text>
              </TouchableOpacity>
            ) : null}
            {hasTimer && !timerDone ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Setel ulang waktu"
                style={styles.widgetBtn}
                onPress={resetTimer}
              >
                <MaterialIcons name="restore" size={12} color={colors.text} />
                <Text style={styles.widgetBtnText}>{`Reset ${step?.durationMinutes ?? 0}m`}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.widgetStatus}>
              <MaterialIcons
                name={hasTimer ? timerIcon : 'hourglass-empty'}
                size={12}
                color={timerDone ? colors.success : colors.textMuted}
              />
              <Text style={styles.widgetStatusText} numberOfLines={1}>
                {hasTimer ? timerStatus : 'Tanpa waktu'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Ganti mode + lanjut langkah (mode button tanpa ikon) */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={mode === 'chat' ? 'Ganti ke mode suara' : 'Ganti ke mode chat'}
          onPress={() => setMode((current) => (current === 'chat' ? 'voice' : 'chat'))}
          style={styles.modeBtn}
        >
          <Text style={styles.modeBtnText}>{mode === 'chat' ? 'Mode Suara' : 'Mode Chat'}</Text>
        </TouchableOpacity>
        <Button
          title={isLast ? 'Selesai' : 'Lanjut'}
          onPress={goNext}
          style={styles.nextBtn}
        />
      </View>

      {isGuest ? <Text style={styles.guestNote}>Mode tamu — progres disimpan lokal.</Text> : null}

      {/* Isi halaman: chat messenger atau karakter mode suara */}
      <View style={styles.flex}>
        <View style={mode === 'chat' ? styles.flex : styles.hidden}>
          <AICompanion
            context={
              step
                ? `Saya sedang memasak "${recipe?.name}". Bahan resep ini: ${recipe?.ingredients?.length ? recipe.ingredients.join(', ') : 'belum tercatat'}. Langkah ${stepIdx + 1}/${steps.length}: ${step.title}. ${step.instruction}. Bantu & temani saya selama proses masak, jawab pertanyaan saat saya ragu.`
                : `Saya sedang memasak "${recipe?.name}". Bahan resep ini: ${recipe?.ingredients?.length ? recipe.ingredients.join(', ') : 'belum tercatat'}. Temani & bantu saya.`
            }
            recipeMeta={`Langkah ${stepIdx + 1} dari ${steps.length}`}
            placeholder={`Tanya soal langkah ${stepIdx + 1} / tanya bahan…`}
            onAssistantMessage={(t) => setNotes((n) => [...n, t])}
          />
        </View>
        {mode === 'voice' ? (
          <VoicePane
            segment={segment}
            recipeName={recipe.name}
            stepLabel={stepLabel}
            recipeIngredients={
              recipe.ingredients?.length ? recipe.ingredients.join(', ') : undefined
            }
          />
        ) : null}
      </View>

      {/* Pop-up detail introduction step — ditutup dengan tombol "X" */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOpen(false)}
      >
        <SafeAreaView style={styles.detailSafe} edges={['top', 'bottom']}>
          <View style={[styles.detailHeader, elevation.sm]}>
            <View style={styles.detailHeaderMid}>
              <Text style={styles.detailKicker} numberOfLines={1}>
                {recipe.name}
              </Text>
              <Text style={styles.detailHeaderSub}>
                Langkah {stepIdx + 1} dari {steps.length}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Tutup detail langkah"
              hitSlop={12}
              onPress={() => setDetailOpen(false)}
              style={styles.detailClose}
            >
              <MaterialIcons name="close" size={20} color={colors.textOnPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
            <View style={styles.detailStepRow}>
              <View style={styles.detailStepChip}>
                <Text style={styles.detailStepChipText}>{step?.order ?? stepIdx + 1}</Text>
              </View>
              <Text style={styles.detailTitle}>{step?.title ?? 'Langkah memasak'}</Text>
            </View>

            <View style={styles.detailIntroBox}>
              <Text style={styles.detailIntroLabel}>Instruksi Pengantar Langkah:</Text>
              <Text style={styles.detailIntro}>
                {step?.instruction ?? 'Ikuti langkah pada resep ini.'}
              </Text>
            </View>

            {hasTimer ? (
              <View style={styles.detailCard}>
                <View style={styles.detailCardRow}>
                  <MaterialIcons
                    name={hasTimer ? timerIcon : 'hourglass-empty'}
                    size={18}
                    color={timerDone ? colors.success : colors.primary}
                  />
                  <Text style={[styles.detailCardTime, timerDone && styles.widgetTimeDone]}>
                    {fmt(secondsLeft ?? 0)}
                  </Text>
                  <Text style={styles.detailCardDuration}>
                    {`perkiraan ${step?.durationMinutes ?? 0} menit`}
                  </Text>
                </View>
                <Text style={styles.detailCardStatus}>{timerStatus}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Tutup detail dan kembali memasak"
              onPress={() => setDetailOpen(false)}
              style={styles.detailBottomBtn}
            >
              <Text style={styles.detailBottomBtnText}>Tutup</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: spacing.sm,
    gap: 2,
  },
  backBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  headerMid: { flex: 1, paddingHorizontal: spacing.xs },
  headerTitle: { ...typography.body, color: colors.text, fontWeight: '800' },
  headerSub: { fontSize: 12, color: colors.textMuted },

  /** Widget ringkas sticky */
  widgetWrap: { paddingHorizontal: spacing.md, paddingTop: 6 },
  widget: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
  },
  widgetTouchArea: {
    paddingBottom: 4,
  },
  widgetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  stepChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepChipText: { color: colors.textOnPrimary, fontSize: 11, fontWeight: '800' },
  widgetTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.text },
  widgetTime: { fontSize: 15, fontWeight: '800', color: colors.primary },
  widgetTimeDone: { color: colors.success },
  widgetIntro: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 3,
    paddingLeft: 2,
  },
  widgetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  widgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  widgetBtnText: { color: colors.text, fontWeight: '700', fontSize: 11 },
  widgetStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  widgetStatusText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },

  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
    paddingBottom: 2,
  },
  modeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  modeBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  nextBtn: { flex: 1, height: 40 },
  guestNote: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    paddingTop: 2,
  },

  /** Pop-up pengantar langkah */
  detailSafe: { flex: 1, backgroundColor: colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailHeaderMid: { flex: 1, minWidth: 0 },
  detailKicker: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  detailHeaderSub: { ...typography.bodySm, color: colors.text, fontWeight: '800' },
  detailClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  detailStepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailStepChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailStepChipText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '800' },
  detailTitle: { flex: 1, ...typography.h3, color: colors.text },
  detailIntroBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailIntroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailIntro: { fontSize: 15, lineHeight: 24, color: colors.text },
  detailCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
    ...elevation.sm,
  },
  detailCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailCardTime: { fontSize: 24, fontWeight: '800', color: colors.primary },
  detailCardDuration: { fontSize: 13, color: colors.textMuted, fontWeight: '600', marginLeft: 'auto' },
  detailCardStatus: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  detailBottomBtn: {
    marginTop: spacing.sm,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBottomBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 14,
  },

  centerBox: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: spacing.xl },
  errorText: { color: colors.danger, fontWeight: '700' },
});
