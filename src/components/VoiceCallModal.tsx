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
  const { state, errorMsg, startCall, stopCall } = useVoiceCall(segment, recipeName, stepLabel);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMuted(false);
    startCall();
    return () => {
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
    ? 'Mikrofon mati'
    : state === 'listening'
      ? 'Silakan bicara'
      : state === 'thinking'
        ? 'Menyiapkan jawaban'
        : state === 'speaking'
          ? 'Chef AI sedang menjawab'
          : state === 'error'
            ? 'Panggilan terganggu'
            : 'Menghubungkan';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Chef AI</Text>
            <Text style={styles.recipe} numberOfLines={1}>
              {recipeName || 'Pendamping memasak'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            onPress={close}
            style={styles.close}
          >
            <MaterialIcons name="close" size={23} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.callArea}>
          <View
            style={[
              styles.orbOuter,
              state === 'listening' && styles.orbListening,
              state === 'speaking' && styles.orbSpeaking,
            ]}
          >
            <View style={styles.orb}>
              {state === 'thinking' ? (
                <ActivityIndicator size="large" color={colors.primaryDark} />
              ) : (
                <MaterialIcons
                  name={state === 'speaking' ? 'graphic-eq' : muted ? 'mic-off' : 'mic'}
                  size={48}
                  color={colors.primaryDark}
                />
              )}
            </View>
          </View>

          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
          {state === 'error' ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg || 'Layanan suara belum tersedia.'}</Text>
              <Pressable accessibilityRole="button" onPress={startCall} style={styles.retryButton}>
                <Text style={styles.retryText}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: muted }}
            accessibilityLabel={muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'}
            onPress={toggleMute}
            style={[styles.controlButton, muted && styles.controlSelected]}
          >
            <MaterialIcons name={muted ? 'mic-off' : 'mic'} size={25} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Akhiri panggilan"
            onPress={close}
            style={styles.endButton}
          >
            <MaterialIcons name="call-end" size={28} color={colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 76,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { ...typography.h3, color: colors.primary },
  recipe: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  callArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
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
  },
  status: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '800',
    marginTop: spacing.xl,
  },
  errorBox: { alignItems: 'center', marginTop: spacing.md },
  errorText: { ...typography.bodySm, color: colors.danger, textAlign: 'center' },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.primary, fontWeight: '800' },
  controls: {
    paddingBottom: spacing.xxl,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  controlButton: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlSelected: { borderColor: colors.accent, borderWidth: 2 },
  endButton: {
    width: 66,
    height: 66,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
