import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ChefLoader } from './ChefLoader';
import { useRotatingStage } from '../hooks/useRotatingStage';
import { VOICE_LOADING_STAGES } from '../utils/assistantText';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { colors, radius, spacing, typography } from '../theme';
import type { Segment } from '../types';

interface Props {
  segment: Segment;
  recipeName?: string;
  stepLabel?: string;
  recipeIngredients?: string;
  /** Semua langkah bernomor, agar "langkah nomor N" bisa dijawab. */
  stepsDigest?: string;
}

/**
 * Mode suara di dalam halaman masak (bukan lagi modal layar penuh).
 *
 * Karakter Chef AI tampil di tengah; status mikrofon menjadi lencana kecil di
 * sudut karakter supaya karakternya tidak pernah tersembunyi. Panggilan hidup
 * selama panel ini terpasang: pindah ke mode Chat (atau keluar dari layar)
 * otomatis mengakhirinya — jadi tidak perlu tombol akhiri panggilan.
 */
export function VoicePane({
  segment,
  recipeName,
  stepLabel,
  recipeIngredients,
  stepsDigest,
}: Props) {
  /**
   * MODE BEBAS-TANGAN.
   *
   * Tekan-dan-tahan tidak masuk akal saat memasak: tangan sedang memegang pisau,
   * mengaduk, atau berlumur tepung. Jadi mikrofon menyala sendiri seperti `auto`,
   * tetapi setiap kalimat disaring dulu (utils/voiceGate) — gumaman dan salah
   * dengar dibuang tanpa suara, sehingga HP berambang lebar tidak lagi memicu
   * jawaban yang tidak diminta.
   */
  const { state, errorMsg, startCall, stopCall, pressStart, pressEnd } = useVoiceCall(
    segment,
    recipeName,
    stepLabel,
    recipeIngredients,
    'handsfree',
    stepsDigest,
  );
  // Status berputar selama Chef AI menyusun jawaban (selaras dengan layar memuat lain).
  const thinkingText = useRotatingStage(state === 'thinking', VOICE_LOADING_STAGES);

  useEffect(() => {
    startCall();
    return () => {
      stopCall();
    };
  }, [startCall, stopCall]);

  const status =
    state === 'listening'
      ? 'Silakan bicara sekarang'
      : state === 'thinking'
        ? thinkingText
        : state === 'speaking'
          ? 'Chef AI sedang menjawab'
          : state === 'error'
            ? 'Panggilan terganggu'
            : 'Menghubungkan';

  /** Chef sedang menyusun atau membacakan jawaban — tombol ditahan mati. */
  const busy = state === 'thinking' || state === 'speaking';

  const badgeIcon =
    state === 'thinking' ? 'hourglass-bottom' : state === 'speaking' ? 'graphic-eq' : 'mic';

  return (
    <View style={styles.pane}>
      {/*
        Penanda bahwa mikrofon benar-benar hidup. Tanpa ini pengguna tidak tahu
        apakah panggilan sudah tersambung atau masih menyiapkan.
      */}
      {state === 'listening' ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Mikrofon aktif</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.orbOuter,
          state === 'listening' && styles.orbListening,
          state === 'speaking' && styles.orbSpeaking,
        ]}
      >
        <View style={styles.orb}>
          <ChefLoader size={108} accessibilityLabel="Karakter Chef AI" />
        </View>
        <View style={styles.badge} accessibilityElementsHidden>
          <MaterialIcons
            name={badgeIcon}
            size={18}
            color={state === 'error' ? colors.danger : colors.primaryDark}
          />
        </View>
      </View>

      <Text style={styles.status} accessibilityLiveRegion="polite">
        {status}
      </Text>

      {/*
        Petunjuk pemakaian. Sebelumnya layar ini hanya menampilkan status, sehingga
        pengguna baru tidak tahu apakah harus bicara, menunggu, atau menekan sesuatu.
      */}
      <Text style={styles.hint}>
        {state === 'listening'
          ? 'Bicara seperti biasa. Tidak perlu menekan apa pun.'
          : state === 'thinking'
            ? 'Tunggu sebentar, jawaban sedang disusun.'
            : state === 'speaking'
              ? 'Chef AI sedang berbicara. Tunggu sampai selesai.'
              : state === 'error'
                ? 'Tekan Coba lagi, atau pindah ke mode Chat.'
                : 'Menyiapkan mikrofon dan suara.'}
      </Text>

      {/*
        MODE BEBAS-TANGAN: tidak ada tombol yang harus ditahan. Pengguna cukup
        bicara. Lencana di bawah menegaskan bahwa mikrofon memang sedang hidup,
        supaya tidak terasa seperti aplikasi yang diam saja.

        Tombol "Bicara sekarang" BUKAN syarat — hanya jalan keluar kalau penyaring
        kebisingan ternyata membuang kalimat yang sah (mis. suara pengguna pelan).
        Karena itu tombolnya kecil dan tidak menonjol.
      */}
      {state !== 'error' ? (
        <View style={styles.handsfreeRow}>
          <View style={[styles.handsfreePill, state === 'listening' && styles.handsfreePillOn]}>
            <View style={[styles.handsfreeDot, state === 'listening' && styles.handsfreeDotOn]} />
            <Text style={[styles.handsfreeText, state === 'listening' && styles.handsfreeTextOn]}>
              {state === 'listening' ? 'Mikrofon aktif — silakan bicara' : 'Menunggu Chef AI'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bicara sekarang"
            accessibilityHint="Pakai ini kalau kalimatmu tidak tertangkap"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPressIn={pressStart}
            onPressOut={pressEnd}
            style={[styles.sayNowButton, busy && styles.talkButtonDisabled]}
          >
            <MaterialIcons name="mic" size={16} color={colors.primary} />
            <Text style={styles.sayNowText}>Bicara sekarang</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg || 'Layanan suara belum tersedia.'}</Text>
          <Pressable accessibilityRole="button" onPress={startCall} style={styles.retryButton}>
            <MaterialIcons name="refresh" size={16} color={colors.primary} />
            <Text style={styles.retryText}>Coba lagi</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  orbOuter: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: colors.background,
  },
  orbListening: { borderColor: '#DDEBE1' },
  orbSpeaking: { borderColor: '#F1DFC0' },
  orb: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: '#BDE5CF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '800',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  handsfreeRow: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  handsfreePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  handsfreePillOn: { backgroundColor: colors.primaryLight },
  handsfreeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSubtle },
  handsfreeDotOn: { backgroundColor: colors.primary },
  handsfreeText: { ...typography.caption, color: colors.textMuted },
  handsfreeTextOn: { color: colors.primaryDark, fontWeight: '700' },
  sayNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  sayNowText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  talkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  talkButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  talkButtonDisabled: { opacity: 0.42 },
  talkLabel: { ...typography.bodySm, color: colors.primary, fontWeight: '700' },
  talkLabelActive: { color: colors.textOnPrimary },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  liveText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  errorBox: { alignItems: 'center', marginTop: spacing.md },
  errorText: { ...typography.bodySm, color: colors.danger, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  retryText: { color: colors.primary, fontWeight: '800' },
});
