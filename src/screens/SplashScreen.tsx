import React from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { AppGradient } from '../components/AppGradient';
import { colors } from '../theme';

/** Checks Supabase session / local MMKV state before routing (PRD S-01). */
export function SplashScreen() {
  return (
    <AppGradient style={styles.container}>
      <Text style={styles.emoji}>🌾</Text>
      <Text style={styles.title}>Dapur Sorgum Ceria</Text>
      <Text style={styles.subtitle}>Sorghum AI Nutritionist</Text>
      <ActivityIndicator size="large" color={colors.textOnPrimary} style={styles.spinner} />
    </AppGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { color: colors.textOnPrimary, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textOnPrimary, fontSize: 16, marginTop: 6, opacity: 0.9 },
  spinner: { marginTop: 32 },
});
