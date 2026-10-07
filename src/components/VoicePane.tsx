import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ChefLoader } from './ChefLoader';
import { useLoadingNarration } from '../hooks/useLoadingNarration';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { colors, radius, spacing, typography } from '../theme';
import type { Segment } from '../types';

interface Props {
  segment: Segment;
  recipeName?: string;
  stepLabel?: string;
  recipeIngredients?: string;
}

/**
 * Mode suara di dalam halaman masak (bukan lagi modal layar penuh).
 *
 * Karakter Chef AI tampil di tengah; status mikrofon menjadi lencana kecil di
 * sudut karakter supaya karakternya tidak pernah tersembunyi. Panggilan hidup
 * selama panel ini terpasang: pindah ke mode Chat (atau keluar dari layar)
 * otomatis mengakhirinya — jadi tidak perlu tombol akhiri panggilan.
 */
export function VoicePane({ segment, recipeName, stepLabel, recipeIngredients }: Props) {
  const { state, errorMsg, startCall, stopCall } = useVoiceCall(
    segment,
    recipeName,
    stepLabel,
    recipeIngredients,
  );
  // Status berputar selama Chef AI menyusun jawaban (selaras dengan layar memuat lain).
  const thinkingText = useLoadingNarration('voice', state === 'thinking', 1600);

  useEffect(() => {
    startCall();
    return () => {
      stopCall();
    };
  }, [startCall, stopCall]);

  const status =
    state === 'listening'
      ? 'Silakan bicara'
      : state === 'thinking'
        ? thinkingText
        : state === 'speaking'
          ? 'Chef AI sedang menjawab'
          : state === 'error'
            ? 'Panggilan terganggu'
            : 'Menghubungkan';

  const badgeIcon =
    state === 'thinking' ? 'hourglass-bottom' : state === 'speaking' ? 'graphic-eq' : 'mic';

  return (
    <View style={styles.pane}>
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
      <Text style={styles.hint}>Pindah ke mode Chat untuk mengakhiri.</Text>

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
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
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
