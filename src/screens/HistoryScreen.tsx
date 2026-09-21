import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { listCookHistory } from '../services/history';
import type { HistorySession } from '../services/history';
import { useFlowStore } from '../store/flowStore';
import { ScreenHeader } from '../components/ScreenHeader';
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
      <ScreenHeader title="Riwayat Masak" onBack={() => navigation.goBack()} />

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
