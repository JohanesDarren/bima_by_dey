import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useChatStore } from '../store/chatStore';
import { useFlowStore } from '../store/flowStore';
import { localStore } from '../lib/storage';
import { confirmAsync } from '../utils/confirm';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/** Settings — logout, segmentasi, riwayat, wipe local data. */
export function SettingsScreen({ navigation }: Props) {
  const profile = useProfileStore((s) => s.profile);
  const isGuest = useAuthStore((s) => s.isGuest);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const resetProfile = useProfileStore((s) => s.reset);
  const resetChat = useChatStore((s) => s.resetChat);
  const resetFlow = useFlowStore((s) => s.reset);

  const wipeLocalData = async () => {
    const ok = await confirmAsync(
      'Hapus Data Lokal?',
      'Semua data tamu, riwayat, dan pengaturan akan dihapus dari perangkat ini. Tindakan ini tidak bisa dibatalkan.',
      'Hapus',
      'Batal',
    );
    if (!ok) return;
    if (isGuest) await signOut();
    localStore.clearAll();
    resetProfile();
    resetChat();
    resetFlow();
  };

  const handleLogout = async () => {
    const ok = await confirmAsync('Keluar', 'Yakin ingin keluar dari akun ini?', 'Keluar', 'Batal');
    if (ok) await signOut();
  };

  const displayName =
    profile?.full_name?.trim() || (isGuest ? 'Tamu' : (user?.email ?? 'Pengguna'));
  const displayMeta = isGuest
    ? 'Mode tamu (data lokal)'
    : `${profile?.target_age_group ?? 'Belum diatur'} · ${profile?.special_condition ?? 'Belum diatur'}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Pengaturan</Text>

        <View style={styles.card}>
          <Text style={styles.profileEmoji}>👤</Text>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileMeta}>{displayMeta}</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Browse')}>
            <Text style={styles.rowText}>🏠 Beranda (Pilih Menu)</Text>
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ProfileSetup')}>
            <Text style={styles.rowText}>👤 Profil & Segmentasi</Text>
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('History')}>
            <Text style={styles.rowText}>🕘 Riwayat Masak</Text>
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.row} onPress={wipeLocalData}>
            <Text style={[styles.rowText, styles.dangerText]}>Hapus Data Lokal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.infoText}>sorgumcore v1.0.0</Text>
          <Text style={styles.infoSub}>Sorghum AI Nutritionist — prototype akademik</Text>
        </View>

        {!isGuest ? <Button title="Keluar" variant="danger" onPress={handleLogout} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  pageTitle: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileEmoji: { fontSize: 44, textAlign: 'center' },
  profileName: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  profileMeta: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  row: { paddingVertical: spacing.md },
  rowText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  dangerText: { color: colors.danger },
  sep: { height: 1, backgroundColor: colors.border },
  infoText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  infoSub: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
});
