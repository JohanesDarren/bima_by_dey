import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { useVoiceCall, VoiceCallState } from '../hooks/useVoiceCall';
import type { Segment } from '../types';

let MotiViewSafe: React.ComponentType<any>;
try {
  MotiViewSafe = require('moti').MotiView;
} catch {
  MotiViewSafe = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  segment: Segment;
}

export function VoiceCallModal({ visible, onClose, segment }: Props) {
  const { state, transcript, aiResponse, errorMsg, startCall, stopCall } = useVoiceCall(segment);

  useEffect(() => {
    if (visible) {
      startCall();
    } else {
      stopCall();
    }
  }, [visible, startCall, stopCall]);

  const handleClose = () => {
    stopCall();
    onClose();
  };

  const renderOrb = () => {
    if (state === 'error') {
      return (
        <View style={[styles.orb, { backgroundColor: colors.error + '20' }]}>
          <Feather name="alert-circle" color={colors.error} size={48} />
        </View>
      );
    }

    if (state === 'idle') {
      return (
        <View style={[styles.orb, { backgroundColor: colors.disabled }]}>
          <Feather name="mic" color={colors.textLight} size={48} />
        </View>
      );
    }

    // Dynamic orb animation based on state
    return (
      <MotiViewSafe
        from={{ scale: 1, opacity: 0.8 }}
        animate={{
          scale: state === 'listening' ? [1, 1.2, 1] : state === 'speaking' ? [1, 1.3, 1] : 1,
          opacity: state === 'thinking' ? [0.8, 0.4, 0.8] : 1,
        }}
        transition={{
          type: 'timing',
          duration: state === 'listening' ? 1000 : state === 'speaking' ? 500 : 800,
          loop: true,
        }}
        style={[
          styles.orb,
          {
            backgroundColor:
              state === 'speaking'
                ? colors.primary
                : state === 'listening'
                  ? colors.secondary
                  : colors.accent,
          },
        ]}
      >
        {state === 'thinking' ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : state === 'speaking' ? (
          <Feather name="volume-2" color="#fff" size={48} />
        ) : (
          <Feather name="mic" color="#fff" size={48} />
        )}
      </MotiViewSafe>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <BlurView intensity={80} tint="dark" style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Feather name="x" color="#fff" size={24} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.stateTitle}>
            {state === 'listening' && 'Mendengarkan...'}
            {state === 'thinking' && 'Memproses...'}
            {state === 'speaking' && 'BIMA Berbicara...'}
            {state === 'error' && 'Terjadi Kesalahan'}
            {state === 'idle' && 'Voice Call Jeda'}
          </Text>

          <View style={styles.orbContainer}>{renderOrb()}</View>

          <View style={styles.transcriptContainer}>
            {state === 'error' ? (
              <Text style={styles.errorText}>{errorMsg}</Text>
            ) : state === 'listening' ? (
              <Text style={styles.transcriptText}>{transcript || 'Bicara sekarang...'}</Text>
            ) : state === 'speaking' ? (
              <Text style={styles.aiResponseText}>{aiResponse}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerHint}>Voice mode mirip panggilan telepon. Lanjutkan memasak tanpa menyentuh layar.</Text>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  stateTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 60,
    opacity: 0.8,
  },
  orbContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  transcriptContainer: {
    marginTop: 60,
    minHeight: 100,
    width: '100%',
    alignItems: 'center',
  },
  transcriptText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
    opacity: 0.9,
  },
  aiResponseText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 18,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: 40,
    paddingHorizontal: 40,
  },
  footerHint: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
});
