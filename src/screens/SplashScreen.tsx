import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { MotiView } from 'moti';
import { AppGradient } from '../components/AppGradient';
import { colors } from '../theme';

/** Checks Supabase session / local MMKV state before routing (PRD S-01). */
export function SplashScreen() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  // Reduced motion: tampil statis tanpa animasi (aksesibilitas).
  if (reduceMotion) {
    return (
      <AppGradient style={styles.container}>
        <Text style={styles.emoji}>🌾</Text>
        <Text style={styles.title}>sorgumcore</Text>
        <Text style={styles.subtitle}>AI Racik Resep Sorgum · RAG-powered</Text>
      </AppGradient>
    );
  }

  return (
    <AppGradient style={styles.container}>
      <MotiView
        from={{ scale: 0.6, opacity: 0, translateY: 20 }}
        animate={{ scale: 1, opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 600 }}
      >
        <Text style={styles.emoji}>🌾</Text>
      </MotiView>

      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 500, delay: 250 }}
      >
        <Text style={styles.title}>sorgumcore</Text>
      </MotiView>

      <MotiView
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: 500, delay: 500 }}
      >
        <Text style={styles.subtitle}>AI Racik Resep Sorgum · RAG-powered</Text>
      </MotiView>
    </AppGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { color: colors.textOnPrimary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: {
    color: colors.textOnPrimary,
    fontSize: 15,
    marginTop: 8,
    opacity: 0.9,
    fontWeight: '600',
  },
});
