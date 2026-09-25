import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { clearCookHistory, listCookHistory } from '../services/history';
import type { HistorySession } from '../services/history';
import { useFlowStore } from '../store/flowStore';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

/** Riwayat sesi masak yang terselesaikan (guest: MMKV lokal). */
export function HistoryScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const setActiveRecipe = useFlowStore((s) => s.setActiveRecipe);

  useFocusEffect(
    useCallback(() => {
      setSessions(listCookHistory());
    }, []),
  );

  /**
   * Hapus seluruh riwayat masak. `clearCookHistory()` sudah ada sejak awal tetapi tidak
   * pernah dipanggil layar mana pun — akibatnya riwayat menumpuk dan tak bisa
   * dibersihkan pengguna. Konfirmasi dulu supaya tidak terhapus karena salah tekan.
   */
  const clearAll = () => {
    Alert.alert(
      'Hapus semua riwayat?',
      'Semua sesi masak yang tersimpan di HP ini akan dihapus permanen.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            clearCookHistory();
            setSessions([]);
          },
        },
      ],
    );
  };

  const openSession = (s: HistorySession) => {
    // Buka ulang resep tanpa RAG (pakai snapshot).
    setActiveRecipe(s.recipe, {
      name: s.recipeName,
      description: '',
      nutrition: {},
      strengths: [],
      weaknesses: [],
      category: 'other',
    });
    navigation.navigate('RecipeDetail', { menu: undefined });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Riwayat Masak</Text>
        {sessions.length > 0 ? (
          <TouchableOpacity
            onPress={clearAll}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Hapus semua riwayat"
          >
            <Text style={styles.clearBtnText}>Hapus</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.clearBtn} />
        )}
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🍲</Text>
            <Text style={styles.emptyTitle}>Belum ada riwayat</Text>
            <Text style={styles.emptyDesc}>
              Selesaikan satu resep dari "Beranda" — sesi masakmu akan tersimpan di sini.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const d = new Date(item.finishedAt);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => openSession(item)}
            >
              <Text style={styles.cardTitle}>{item.recipeName}</Text>
              <Text style={styles.cardMeta}>
                {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ·{' '}
                {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                {item.segment.ageGroup ?? 'Umum'}
                {item.segment.condition && item.segment.condition !== 'Umum'
                  ? ` · ${item.segment.condition}`
                  : ''}
              </Text>
              <Text style={styles.cardSub}>
                {item.recipe.steps.length} langkah · ±{item.recipe.totalMinutes} menit · Buka lagi →
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.md, minWidth: 70 },
  backBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  clearBtn: { minWidth: 70, alignItems: 'flex-end', paddingVertical: spacing.sm },
  clearBtnText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  headerTitle: { ...typography.h3, color: colors.text },
  list: { padding: spacing.lg, flexGrow: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.h3, color: colors.text },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  cardSub: { color: colors.primary, fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  emptyBox: { alignItems: 'center', paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md },
  emptyDesc: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
