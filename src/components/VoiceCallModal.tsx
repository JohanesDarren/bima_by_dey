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
  const { state, transcript, aiResponse, errorMsg, startCall, stopCall } = useVoiceCall(
    segment,
    recipeName,
    stepLabel,
  );
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
      ? 'Sedang mendengarkan…'
      : state === 'thinking'
        ? 'Mencari jawaban di RAG…'
        : state === 'speaking'
          ? 'Sedang berbicara…'
          : state === 'error'
            ? 'Layanan terganggu'
            : 'Menghubungkan…';

  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  const initials = (recipeName || 'Sorgum Core')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>sorgumcore</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup panggilan"
            onPress={close}
            style={styles.closeButton}
          >
            <MaterialIcons name="keyboard-arrow-down" size={27} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.contextCard}>
          <View style={styles.contextIcon}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={styles.contextCopy}>
            <Text style={styles.contextLabel}>RESEP AKTIF</Text>
            <Text style={styles.contextTitle} numberOfLines={1}>
              {recipeName || 'Pendamping resep sorgum'}
            </Text>
            {stepLabel ? <Text style={styles.contextMeta}>{stepLabel}</Text> : null}
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.accent} />
        </View>

        <View style={styles.modeToggle} accessibilityRole="tablist">
          <View
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.modeButton, styles.modeButtonActive]}
          >
            <MaterialIcons name="phone-in-talk" size={16} color={colors.accent} />
            <Text style={styles.modeTextActive}>Panggilan Suara</Text>
          </View>
          <Pressable accessibilityRole="tab" onPress={close} style={styles.modeButton}>
            <MaterialIcons name="chat-bubble-outline" size={16} color={colors.textMuted} />
            <Text style={styles.modeText}>Chat Teks</Text>
          </Pressable>
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
            <View style={styles.liveDot} />
          </View>
          <Text style={styles.name}>Chef Sorghum AI</Text>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
          <View style={styles.waveform} accessibilityElementsHidden>
            {[10, 20, 28, 17, 24, 12].map((height, index) => (
              <View key={index} style={[styles.waveBar, { height }]} />
            ))}
          </View>
          <Text
            style={styles.duration}
            accessibilityLabel={`Durasi panggilan ${minutes} menit ${seconds} detik`}
          >
            {minutes}:{seconds}
          </Text>

          <View style={styles.transcriptBox}>
            {state === 'error' ? (
              <>
                <Text style={styles.errorText}>{errorMsg || 'Layanan RAG belum tersedia.'}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={startCall}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Coba lagi</Text>
                </Pressable>
              </>
            ) : state === 'speaking' ? (
              <Text style={styles.transcript} numberOfLines={4}>
                {aiResponse}
              </Text>
            ) : transcript ? (
              <Text style={styles.transcript} numberOfLines={2}>
                {transcript}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: muted }}
            accessibilityLabel={muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'}
            onPress={toggleMute}
            style={[styles.controlButton, muted && styles.controlSelected]}
          >
            <MaterialIcons name={muted ? 'mic-off' : 'mic'} size={24} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Akhiri panggilan"
            onPress={close}
            style={styles.endButton}
          >
            <MaterialIcons name="call-end" size={27} color={colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    minHeight: 70,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { ...typography.h3, fontSize: 22, color: colors.primary },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
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
  initials: { ...typography.h3, fontSize: 16, color: colors.accent },
  contextCopy: { flex: 1, minWidth: 0 },
  contextLabel: { ...typography.label, fontSize: 9, color: colors.accent },
  contextTitle: {
    ...typography.bodySm,
    fontWeight: '800',
    color: colors.textOnPrimary,
    marginTop: 2,
  },
  contextMeta: { ...typography.caption, color: '#B8C5BB', marginTop: 2 },
  modeToggle: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeButtonActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  modeText: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  modeTextActive: { ...typography.caption, color: colors.primary, fontWeight: '800' },
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
  liveDot: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: colors.background,
  },
  name: { ...typography.h2, color: colors.text, marginTop: spacing.xl },
  status: { ...typography.bodySm, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  waveform: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: colors.success },
  duration: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  transcriptBox: { minHeight: 72, width: '100%', marginTop: spacing.lg, alignItems: 'center' },
  transcript: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center' },
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlSelected: { borderWidth: 2, borderColor: colors.accent },
  endButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
