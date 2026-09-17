import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';
import { useVoiceCall } from '../hooks/useVoiceCall';
import type { Segment } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  segment: Segment;
  recipeName?: string;
  stepLabel?: string;
}

export function VoiceCallModal({ visible, onClose, segment, recipeName, stepLabel }: Props) {
  const { state, transcript, aiResponse, errorMsg, startCall, stopCall } = useVoiceCall(segment);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setElapsed(0);
    startCall();
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => {
      clearInterval(timer);
      stopCall();
    };
  }, [visible, startCall, stopCall]);

  const close = () => {
    stopCall();
    onClose();
  };

  const toggleMute = () => {
    if (muted) startCall();
    else stopCall();
    setMuted((value) => !value);
  };

  const status = muted
    ? 'Mikrofon dimatikan'
    : state === 'listening'
      ? 'Sedang mendengarkan'
      : state === 'thinking'
        ? 'Sedang menyiapkan jawaban'
        : state === 'speaking'
          ? 'Sedang berbicara'
          : state === 'error'
            ? 'Panggilan terganggu'
            : 'Menghubungkan';

  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>PENDAMPING MEMASAK</Text>
            <Text style={styles.brand}>sorgumcore</Text>
          </View>
          <Pressable
            accessibilityLabel="Tutup panggilan"
            onPress={close}
            style={styles.closeButton}
          >
            <MaterialIcons name="keyboard-arrow-down" size={27} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.contextCard}>
          <View style={styles.contextIcon}>
            <MaterialIcons name="menu-book" size={21} color={colors.accent} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={styles.contextLabel}>RESEP AKTIF</Text>
            <Text style={styles.contextTitle} numberOfLines={2}>
              {recipeName || 'Pendamping resep sorgum'}
            </Text>
            {stepLabel ? <Text style={styles.contextMeta}>{stepLabel}</Text> : null}
          </View>
        </View>

        <View style={styles.callArea}>
          <View style={[styles.orbOuter, state === 'speaking' && styles.orbSpeaking]}>
            <View style={styles.orb}>
              {state === 'thinking' ? (
                <ActivityIndicator size="large" color={colors.primaryDark} />
              ) : (
                <MaterialIcons
                  name={state === 'speaking' ? 'graphic-eq' : 'mic'}
                  size={48}
                  color={colors.primaryDark}
                />
              )}
            </View>
          </View>
          <Text style={styles.name}>Chef sorgumcore</Text>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
          <Text
            style={styles.duration}
            accessibilityLabel={`Durasi panggilan ${minutes} menit ${seconds} detik`}
          >
            {minutes}:{seconds}
          </Text>

          <View style={styles.transcriptBox}>
            {state === 'error' ? (
              <>
                <Text style={styles.errorText}>{errorMsg || 'Fitur suara belum tersedia.'}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={startCall}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Coba lagi</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.transcript} numberOfLines={4}>
                {state === 'speaking'
                  ? aiResponse
                  : transcript || 'Bicara setelah indikator mendengarkan aktif.'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.controlGroup}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: muted }}
              accessibilityLabel={muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'}
              onPress={toggleMute}
              style={[styles.controlButton, muted && styles.controlSelected]}
            >
              <MaterialIcons name={muted ? 'mic-off' : 'mic'} size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.controlLabel}>{muted ? 'Bunyikan' : 'Bisukan'}</Text>
          </View>

          <View style={styles.controlGroup}>
            <Pressable
              accessibilityLabel="Akhiri panggilan"
              onPress={close}
              style={styles.endButton}
            >
              <MaterialIcons name="call-end" size={27} color={colors.white} />
            </Pressable>
            <Text style={styles.controlLabel}>Akhiri</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    minHeight: 76,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: { ...typography.label, fontSize: 9, color: colors.accentDark },
  brand: { ...typography.h3, fontSize: 22, color: colors.primary },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextCard: {
    margin: spacing.xl,
    marginBottom: 0,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.surfaceDarkAlt,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  contextIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceDarkAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextCopy: { flex: 1 },
  contextLabel: { ...typography.label, fontSize: 9, color: colors.accent },
  contextTitle: { ...typography.h3, fontSize: 16, color: colors.textOnPrimary, marginTop: 2 },
  contextMeta: { ...typography.caption, color: '#B8C5BB', marginTop: 2 },
  callArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  orbOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbSpeaking: { borderWidth: 8, borderColor: '#E6EFE7' },
  orb: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#BDE5CF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.h2, color: colors.text, marginTop: spacing.xl },
  status: { ...typography.bodySm, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  duration: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  transcriptBox: { minHeight: 96, width: '100%', marginTop: spacing.xl, alignItems: 'center' },
  transcript: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...typography.bodySm, color: colors.danger, textAlign: 'center' },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.primary, fontWeight: '800' },
  controls: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlGroup: { alignItems: 'center', gap: 5 },
  controlButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlSelected: { borderWidth: 2, borderColor: colors.accent },
  endButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
});
