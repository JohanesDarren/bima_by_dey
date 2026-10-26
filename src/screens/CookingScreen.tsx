import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { AICompanion } from '../components/AICompanion';
import { StepTimerCard } from '../components/StepTimerCard';
import { VoicePane } from '../components/VoicePane';
import { RecipeCompleteChecklist } from '../components/RecipeCompleteChecklist';
import { useKeyboardInset, useKeyboardVisible } from '../hooks/useKeyboardVisible';
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
  buildCookingStepsDigest,
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
  const clearMenus = useFlowStore((s) => s.setCategory);
  const isGuest = useAuthStore((s) => s.isGuest);

  const [stepIdx, setStepIdx] = useState(0);
  /** Mode tampilan: obrolan teks atau karakter suara (bukan modal layar penuh). */
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  /** Tinggi keyboard: edge-to-edge membuat adjustResize tidak bekerja. */
  const keyboardInset = useKeyboardInset();
  const { height: windowHeight } = useWindowDimensions();
  /**
   * Tinggi maksimum wadah chat. Tanpa batas, daftar pesan yang `flex:1` di dalam
   * induk tanpa tinggi akan menciut jadi nol. Batas ini juga menyisakan ruang
   * untuk kartu langkah di atasnya.
   */
  /**
   * Tinggi panel chat. Harus NILAI TETAP, bukan hanya maxHeight: di dalamnya
   * daftar pesan memakai `flex:1`, dan `flex:1` di dalam induk tanpa tinggi pasti
   * akan menciut jadi nol — itulah yang membuat panel chat hilang sama sekali.
   */
  const dockHeight = Math.max(240, Math.min(380, (windowHeight - keyboardInset) * 0.52));
  /** Checklist penyelesaian tampil → animasi jalan → kembali ke beranda. */
  const [completing, setCompleting] = useState(false);
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
      // Tampilkan checklist penyelesaian lebih dulu; setelah animasi selesai
      // pengguna dikembalikan ke beranda untuk memilih kategori menu lagi.
      setCompleting(true);
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

      {/*
        PEMILIH MODE — selalu terlihat.
        Sebelumnya tombol ini berada di dalam kartu langkah, yang bisa tergulir
        keluar layar; di mode suara tombolnya hilang sama sekali sehingga pengguna
        tidak bisa kembali ke mode chat. Sekarang letaknya tetap di bawah header.
      */}
      <View style={styles.modeBar}>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'chat' }}
          accessibilityLabel="Mode chat"
          onPress={() => setMode('chat')}
          style={[styles.modeTab, mode === 'chat' && styles.modeTabActive]}
        >
          <MaterialIcons
            name="chat-bubble-outline"
            size={15}
            color={mode === 'chat' ? colors.textOnPrimary : colors.primary}
          />
          <Text style={[styles.modeTabText, mode === 'chat' && styles.modeTabTextActive]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'voice' }}
          accessibilityLabel="Mode suara"
          onPress={() => setMode('voice')}
          style={[styles.modeTab, mode === 'voice' && styles.modeTabActive]}
        >
          <MaterialIcons
            name="mic"
            size={15}
            color={mode === 'voice' ? colors.textOnPrimary : colors.primary}
          />
          <Text style={[styles.modeTabText, mode === 'voice' && styles.modeTabTextActive]}>
            Suara
          </Text>
        </TouchableOpacity>
      </View>

      {/*
        AREA ISI: `flex:1` dan boleh menyusut. ScrollView di dalamnya memakai
        `flexShrink:1` supaya kartu langkah MENGALAH ke panel chat / karakter suara,
        bukan mendorongnya keluar layar.
      */}
      <View style={styles.contentArea}>
        <ScrollView
          ref={scrollRef}
          style={styles.stepScroll}
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

              {/*
                Hanya tombol lanjut. Pemilih mode sudah dipindah ke bilah tetap di
                bawah header — dulu di sini, sehingga ikut tergulir hilang dan
                pengguna tidak bisa kembali dari mode suara ke mode chat.
              */}
              <View style={styles.actionRow}>
                <Button
                  title={isLast ? 'Selesai' : 'Selesai — Lanjut'}
                  onPress={goNext}
                  style={styles.nextBtn}
                />
              </View>
            </View>
          ) : null}

          {isGuest && !keyboardUp ? (
            <Text style={styles.guestNote}>Mode tamu — progres disimpan lokal.</Text>
          ) : null}
        </ScrollView>

        {/*
        Panel chat DIPINDAH KE LUAR ScrollView.
        Sebelumnya ia berada di dalam ScrollView, sehingga kolom tulisnya bisa
        tergulir ke bawah keyboard dan tidak terlihat sama sekali. Di luar
        ScrollView, panel ini menempel di dasar layar, dan `paddingBottom` sebesar
        tinggi keyboard membuatnya selalu berada TEPAT DI ATAS keyboard — di HP
        edge-to-edge sekalipun, karena tinggi keyboard dibaca langsung dari
        peristiwa native.
      */}
        <View
          style={[
            styles.chatDock,
            mode === 'chat' ? null : styles.hidden,
            { height: dockHeight, paddingBottom: keyboardInset },
          ]}
        >
          <AICompanion
            context={buildCookingChatContext(recipe, stepIdx)}
            recipeName={recipe.name}
            recipeMeta={`Langkah ${stepIdx + 1} dari ${steps.length}`}
            simple
            placeholder={`Tanya soal langkah ${stepIdx + 1} / tanya bahan…`}
            // Hanya catatan terakhir yang disimpan ke riwayat — jangan menumpuk di memori.
            onAssistantMessage={(t) => setNotes((n) => [...n, t].slice(-MAX_NOTES))}
          />
        </View>

        {/* Mode suara tampil sebaris di halaman ini, bukan modal layar penuh. */}
        {mode === 'voice' ? (
          <VoicePane
            segment={segment}
            recipeName={recipe.name}
            stepLabel={buildCookingStepLabel(recipe, stepIdx)}
            recipeIngredients={ingredientList(recipe) ?? undefined}
            stepsDigest={buildCookingStepsDigest(recipe, stepIdx)}
          />
        ) : null}
      </View>

      {/*
        Checklist penyelesaian. Setelah animasi selesai, kembali ke beranda
        (Browse) supaya pengguna bisa memilih kategori dan membuat menu lagi.
        `popToTop` dipakai agar tumpukan Cooking/RecipeDetail tidak menumpuk,
        dan kategori direset supaya pilihan menu dimulai dari awal.
      */}
      {completing ? (
        <RecipeCompleteChecklist
          recipeName={recipe.name}
          stepCount={steps.length}
          onDone={() => {
            setCompleting(false);
            // Kosongkan daftar menu lama: setelah selesai memasak, beranda
            // kembali menampilkan pilihan kategori, bukan menu yang sudah lewat.
            clearMenus(null);
            navigation.popToTop();
          }}
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
  /** Pemilih mode: selalu terlihat, tidak ikut tergulir. */
  modeBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  modeTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeTabText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  modeTabTextActive: { color: colors.textOnPrimary },
  /** Area isi: kartu langkah + panel chat/karakter suara. */
  contentArea: { flex: 1 },
  /** Kartu langkah MENGALAH ke panel chat, bukan mendorongnya keluar layar. */
  stepScroll: { flexShrink: 1 },
  /** Wadah panel chat: menempel di dasar layar, di luar ScrollView. */
  chatDock: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hidden: { display: 'none' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  nextBtn: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: spacing.xl },
  errorText: { color: colors.danger, fontWeight: '700' },
  guestNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
});
