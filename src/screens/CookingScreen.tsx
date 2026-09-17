import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Speech from 'expo-speech';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { AICompanion } from '../components/AICompanion';
import { VoiceCallModal } from '../components/VoiceCallModal';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography, elevation } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { RecipeStep } from '../types';
import { saveCookHistory } from '../services/history';

type Props = NativeStackScreenProps<RootStackParamList, 'Cooking'>;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Mode masak: step-by-step terstruktur + timer tiap langkah + AI menemani
 * (diskusi via chat + TTS membaca instruksi).
 */
export function CookingScreen({ navigation, route }: Props) {
  const { recipe } = route.params ?? {};
  const segment = useFlowStore((s) => s.segment);
  const isGuest = useAuthStore((s) => s.isGuest);

  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [voiceCallVisible, setVoiceCallVisible] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
    scrollRef.current?.scrollTo({ y: 0, animated: true });
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

  const speakNow = () => {
    if (!step) return;
    Speech.speak(`${step.title}. ${step.instruction}`, { language: 'id-ID' });
  };

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
        <TouchableOpacity
          style={styles.voiceCallHeaderBtn}
          onPress={() => setVoiceCallVisible(true)}
        >
          <MaterialIcons name="phone-in-talk" size={16} color={colors.textOnPrimary} />
          <Text style={styles.voiceCallHeaderBtnText}>Voice Call</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.content}>
        {/* Step aktif */}
        {step ? (
          <View style={[styles.stepCard, elevation.sm]}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNumBig}>
                <Text style={styles.stepNumBigText}>{step.order}</Text>
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
            <Text style={styles.stepInstr}>{step.instruction}</Text>

            {/* Timer */}
            {secondsLeft !== null ? (
              <View style={styles.timerBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons
                    name={
                      timerRunning
                        ? 'hourglass-bottom'
                        : secondsLeft === 0
                          ? 'check-circle'
                          : 'pause-circle-outline'
                    }
                    size={16}
                    color={secondsLeft === 0 ? colors.success : colors.textMuted}
                  />
                  <Text style={styles.timerLabel}>
                    {timerRunning
                      ? 'Waktu berjalan…'
                      : secondsLeft === 0
                        ? 'Waktu selesai!'
                        : 'Waktu dijeda'}
                  </Text>
                </View>
                <Text style={[styles.timerValue, secondsLeft === 0 && styles.timerDone]}>
                  {fmt(secondsLeft)}
                </Text>
                <View style={styles.timerActions}>
                  {secondsLeft === 0 ? (
                    <TouchableOpacity style={styles.resetBtn} onPress={resetTimer}>
                      <MaterialIcons name="refresh" size={14} color={colors.text} />
                      <Text style={styles.resetBtnText}>Ulangi</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.resetBtn}
                      onPress={() => setTimerRunning((r) => !r)}
                    >
                      <MaterialIcons
                        name={timerRunning ? 'pause' : 'play-arrow'}
                        size={14}
                        color={colors.text}
                      />
                      <Text style={styles.resetBtnText}>{timerRunning ? 'Jeda' : 'Lanjut'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.resetBtn} onPress={resetTimer}>
                    <MaterialIcons name="restore" size={14} color={colors.text} />
                    <Text style={styles.resetBtnText}>Reset {step.durationMinutes}m</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Aksi */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.voiceBtn} onPress={speakNow}>
                <MaterialIcons name="volume-up" size={18} color={colors.text} />
                <Text style={styles.voiceBtnText}>Bacakan</Text>
              </TouchableOpacity>
              <Button
                title={isLast ? 'Selesai' : 'Selesai — Lanjut'}
                onPress={goNext}
                style={styles.nextBtn}
              />
            </View>
            <TouchableOpacity
              onPress={() => setVoiceCallVisible(true)}
              style={styles.voiceToggleRow}
            >
              <View style={styles.voiceCallBanner}>
                <MaterialIcons name="headset-mic" size={18} color={colors.primary} />
                <Text style={styles.voiceCallBannerText}>Mode Voice Call (Hands-free)</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* AI menemani — diskusi saat masak (teks + voice dua arah) */}
        <AICompanion
          context={
            step
              ? `Saya sedang memasak "${recipe?.name}". Langkah ${stepIdx + 1}/${steps.length}: ${step.title}. ${step.instruction}. Bantu & temani saya selama proses masak, jawab pertanyaan saat saya ragu.`
              : `Saya sedang memasak "${recipe?.name}". Temani & bantu saya.`
          }
          placeholder={`Tanya soal langkah ${stepIdx + 1} / tanya bahan…`}
          onAssistantMessage={(t) => setNotes((n) => [...n, t])}
        />

        {isGuest ? <Text style={styles.guestNote}>Mode tamu — progres disimpan lokal.</Text> : null}
      </ScrollView>

      {voiceCallVisible ? (
        <VoiceCallModal
          visible={voiceCallVisible}
          onClose={() => setVoiceCallVisible(false)}
          segment={segment}
          recipeName={recipe.name}
          stepLabel={`Langkah ${stepIdx + 1} dari ${steps.length}`}
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
  voiceCallHeaderBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  voiceCallHeaderBtnText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: '700' },
  chatBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  chatBtnActive: { backgroundColor: colors.primaryLight },
  chatBtnText: { fontSize: 17 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
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
  timerBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  timerLabel: { color: colors.textMuted, fontSize: 13 },
  timerValue: { ...typography.h1, fontSize: 44, color: colors.primary, marginVertical: spacing.sm },
  timerDone: { color: colors.success },
  timerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  resetBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resetBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  voiceBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  voiceBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  nextBtn: { flex: 1 },
  voiceToggleRow: { marginTop: spacing.md, alignSelf: 'stretch' },
  voiceCallBanner: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary + '40',
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  voiceCallBannerText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  chatPanel: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    maxHeight: 380,
  },
  chatPanelTitle: { ...typography.label, color: colors.text, marginBottom: spacing.md },
  chatMsgs: { maxHeight: 220, marginBottom: spacing.sm },
  chatHint: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  chatBubble: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    maxWidth: '90%',
  },
  chatBubbleUser: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  chatBubbleAI: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  chatBubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  chatBubbleTextUser: { color: colors.textOnPrimary },
  chatInputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  chatInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendText: { color: colors.textOnPrimary, fontSize: 16 },
  centerBox: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: spacing.xl },
  errorText: { color: colors.danger, fontWeight: '700' },
  guestNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
});
