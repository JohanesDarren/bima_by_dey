import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

/**
 * Error boundary sederhana: mencegah white-screen saat error JS tak tertangkap.
 * Menampilkan pesan ramah + tombol muat ulang.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.',
    };
  }

  componentDidCatch(error: unknown) {
    // Log terpusat bisa ditambahkan di sini (Sentry dsb).
    console.warn('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😵</Text>
          <Text style={styles.title}>Ups, ada yang salah</Text>
          <Text style={styles.message}>
            {this.state.message ?? 'Terjadi kesalahan tak terduga.'}
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.setState({ hasError: false, message: null })}
          >
            <Text style={styles.btnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  emoji: { fontSize: 56, marginBottom: spacing.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  btnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
});
