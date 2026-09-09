import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppGradient } from '../components/AppGradient';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { useAuthStore } from '../store/authStore';
import { colors, radius, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const signIn = useAuthStore((s) => s.signInWithEmail);
  const signUp = useAuthStore((s) => s.signUpWithEmail);
  const signInAsGuest = useAuthStore((s) => s.signInAsGuest);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = (): boolean => {
    const fe: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) fe.email = 'Format email tidak valid.';
    if (password.length < 6) fe.password = 'Kata sandi minimal 6 karakter.';
    setFieldError(fe);
    return Object.keys(fe).length === 0;
  };

  const submit = async () => {
    if (loading) return;
    setError(null);
    if (!validate()) return;
    setLoading(true);
    const fn = mode === 'login' ? signIn : signUp;
    const res = await fn(email.trim(), password);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    }
    // If registered for the first time, Supabase may require email confirmation
    // before the session exists — direct to Profile Setup next via auth state.
  };

  return (
    <AppGradient style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.emoji}>🌾</Text>
            <Text style={styles.heading}>{mode === 'login' ? 'Selamat Datang!' : 'Buat Akun'}</Text>
            <Text style={styles.subheading}>
              {mode === 'login'
                ? 'Masuk untuk menyimpan profil dan riwayat chat kamu.'
                : 'Daftar untuk mulai meracik resep sorgum sehat.'}
            </Text>

            <View style={styles.card}>
              <FormField
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setFieldError((f) => ({ ...f, email: undefined }));
                }}
                placeholder="nama@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                error={fieldError.email}
              />
              <FormField
                label="Kata Sandi"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setFieldError((f) => ({ ...f, password: undefined }));
                }}
                placeholder="••••••••"
                secureTextEntry
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                error={fieldError.password}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                title={mode === 'login' ? 'Masuk' : 'Daftar'}
                onPress={submit}
                loading={loading}
              />

              <TouchableOpacity
                style={styles.switchRow}
                onPress={() => {
                  setMode((m) => (m === 'login' ? 'register' : 'login'));
                  setError(null);
                  setFieldError({});
                }}
              >
                <Text style={styles.switchText}>
                  {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
                  <Text style={styles.switchLink}>{mode === 'login' ? 'Daftar' : 'Masuk'}</Text>
                </Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>atau</Text>
                <View style={styles.divider} />
              </View>

              <Button
                title="Lanjut sebagai Tamu"
                variant="ghost"
                onPress={signInAsGuest}
                disabled={loading}
                style={styles.guestBtn}
              />
              <Text style={styles.guestNote}>
                Mode tamu menyimpan data lokal di perangkat (MMKV) tanpa akun.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: spacing.sm },
  heading: {
    color: colors.textOnPrimary,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subheading: {
    color: colors.textOnPrimary,
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.9,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  error: { color: colors.danger, marginBottom: spacing.md, fontSize: 13 },
  switchRow: { marginTop: spacing.lg, alignItems: 'center' },
  switchText: { color: colors.textMuted, fontSize: 14 },
  switchLink: { color: colors.primary, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: spacing.md, color: colors.textMuted, fontSize: 13 },
  guestBtn: { borderColor: colors.primary },
  guestNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
});
