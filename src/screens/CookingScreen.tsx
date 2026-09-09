import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import * as Speech from 'expo-speech';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { ChatMessage, RecipeStep } from '../types';
import { streamKroomboxChat } from '../services/kroombox';
import { saveCookHistory } from '../services/history';
import { buildSystemPrompt } from '../utils/promptBuilder';

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
  const profile = useFlowStore((s) => s.activeMenu);
  const isGuest = useAuthStore((s) => s.isGuest);

  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
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
    setMsgs([]);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, recipe?.name]);

  // Bacakan instruksi bila voice aktif.
  useEffect(() => {
    if (voiceOn && step) {
      const dur = step.durationMinutes ? `Langkah ini sekitar ${step.durationMinutes} menit. ` : '';
      Speech.speak(`${step.title}. ${dur}${step.instruction}`, { language: 'id-ID' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, voiceOn]);

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

  const toggleVoice = () => {
    setVoiceOn((v) => {
      if (v) Speech.stop();
      return !v;
    });
  };

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
            notes: msgs
              .filter((m) => m.role === 'assistant' && m.content.trim())
              .slice(-5)
              .map((m) => m.content.slice(0, 160)),
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

  // Diskusi dengan AI — konteks step aktif disuntikkan.
  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || streaming) return;
    setChatInput('');
    const userMsg: ChatMessage = { role: 'user', content: text, reasoning_content: null };
    const asstMsg: ChatMessage = { role: 'assistant', content: '', reasoning_content: null };
    setMsgs((m) => [...m, userMsg, asstMsg]);
    setStreaming(true);

    const stepCtx = step
      ? `Saya sedang memasak "${recipe?.name}". Langkah ${stepIdx + 1}/${steps.length}: ${step.title}. ${step.instruction}`
      : 'Saya sedang memasak.';
    const sysHint = profile
      ? `${buildSystemPrompt({
          id: 'guest',
          full_name: null,
          target_age_group: segment.ageGroup,
          special_condition: segment.condition,
          ai_reasoning_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })}\n\n`
      : '';

    const es = streamKroomboxChat(
      { message: `${sysHint}${stepCtx}\n\nPertanyaan user: ${text}`, useRag: true, stream: true },
      {
        onToken: (delta) => {
          setMsgs((cur) => {
            const copy = [...cur];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + delta };
            }
            return copy;
          });
        },
        onDone: () => setStreaming(false),
        onError: (e) => {
          setMsgs((cur) => [
            ...cur,
            { role: 'assistant', content: `⚠️ ${e.message}`, reasoning_content: null },
          ]);
          setStreaming(false);
        },
      },
    );
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatInput, streaming, step, stepIdx, recipe?.name, segment, profile]);

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Keluar</Text>
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
          onPress={() => setChatOpen((v) => !v)}
          style={[styles.chatBtn, chatOpen && styles.chatBtnActive]}
        >
          <Text style={styles.chatBtnText}>💬</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.content}>
        {/* Step aktif */}
        {step ? (
          <View style={styles.stepCard}>
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
                <Text style={styles.timerLabel}>
                  {timerRunning
                    ? '⏳ Waktu berjalan…'
                    : secondsLeft === 0
                      ? '✅ Waktu selesai!'
                      : 'Waktu dijeda'}
                </Text>
                <Text style={[styles.timerValue, secondsLeft === 0 && styles.timerDone]}>
                  {fmt(secondsLeft)}
                </Text>
                <View style={styles.timerActions}>
                  {secondsLeft === 0 ? (
                    <TouchableOpacity style={styles.resetBtn} onPress={resetTimer}>
                      <Text style={styles.resetBtnText}>↻ Ulangi</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.resetBtn}
                      onPress={() => setTimerRunning((r) => !r)}
                    >
                      <Text style={styles.resetBtnText}>
                        {timerRunning ? '⏸ Jeda' : '▶ Lanjut'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.resetBtn} onPress={resetTimer}>
                    <Text style={styles.resetBtnText}>↻ Reset {step.durationMinutes}m</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Aksi */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.voiceBtn} onPress={speakNow}>
                <Text style={styles.voiceBtnText}>🔊 Bacakan</Text>
              </TouchableOpacity>
              <Button
                title={isLast ? 'Selesai 🎉' : 'Selesai — Lanjut ›'}
                onPress={goNext}
                style={styles.nextBtn}
              />
            </View>
            <TouchableOpacity onPress={toggleVoice} style={styles.voiceToggleRow}>
              <Text style={[styles.voiceToggleText, voiceOn && styles.voiceToggleOn]}>
                {voiceOn
                  ? '🔊 Voice assistant: NYALA (bacakan tiap langkah)'
                  : '🔇 Voice assistant: mati'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Chat AI menemani */}
        {chatOpen ? (
          <View style={styles.chatPanel}>
            <Text style={styles.chatPanelTitle}>
              Tanya AI — "ragu dengan langkah ini? tanyakan dulu"
            </Text>
            <ScrollView style={styles.chatMsgs} nestedScrollEnabled>
              {msgs.length === 0 ? (
                <Text style={styles.chatHint}>
                  Contoh: "Berapa lama ayam harus diungkep?" / "Bisa ganti santan dengan susu?"
                </Text>
              ) : (
                msgs.map((m, i) => (
                  <View
                    key={i}
                    style={[
                      styles.chatBubble,
                      m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chatBubbleText,
                        m.role === 'user' && styles.chatBubbleTextUser,
                      ]}
                    >
                      {m.content}
                    </Text>
                  </View>
                ))
              )}
              {streaming ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Tanya soal langkah ini…"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={sendChat}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={sendChat} disabled={streaming}>
                <Text style={styles.chatSendText}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {isGuest ? <Text style={styles.guestNote}>Mode tamu — progres disimpan lokal.</Text> : null}
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
  voiceToggleRow: { marginTop: spacing.md, alignSelf: 'center' },
  voiceToggleText: { color: colors.textMuted, fontSize: 12 },
  voiceToggleOn: { color: colors.success, fontWeight: '700' },
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
