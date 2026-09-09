import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppGradient } from '../components/AppGradient';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { FormField } from '../components/FormField';
import { SelectionChip } from '../components/SelectionChip';
import { AGE_GROUPS, SPECIAL_CONDITIONS } from '../constants';
import { useResponsive } from '../hooks/useResponsive';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { colors, radius, spacing, typography } from '../theme';
import type { AgeGroup, SpecialCondition } from '../types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileSetup'>;

/** Profile Setup — the core differentiation screen (PRD F-02 / S-03). */
export function ProfileSetupScreen({ navigation }: Props) {
  const { isDesktop } = useResponsive();
  const userId = useAuthStore((s) => s.user?.id);
  const isGuest = useAuthStore((s) => s.isGuest);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const profile = useProfileStore((s) => s.profile);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(profile?.target_age_group ?? null);
  const [condition, setCondition] = useState<SpecialCondition | null>(
    profile?.special_condition ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = ageGroup !== null && condition !== null;

  const onSave = async () => {
    if (!canSave) {
      setError('Pilih target umur dan kondisi khusus dulu ya.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateProfile(userId ?? 'guest', {
      fullName: fullName.trim(),
      targetAgeGroup: ageGroup,
      specialCondition: condition,
      aiReasoningEnabled: profile?.ai_reasoning_enabled ?? true,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  return (
    <AppGradient style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.emoji}>👩‍🍳</Text>
          <Text style={styles.heading}>Profil Resep Kamu</Text>
          <Text style={styles.subheading}>
            {isGuest
              ? 'Data ini disimpan di perangkat (mode tamu).'
              : 'Kami pakai data ini untuk menyesuaikan setiap resep yang diracik.'}
          </Text>

          <Container>
            <View style={styles.card}>
              <FormField
                label="Nama (opsional)"
                value={fullName}
                onChangeText={setFullName}
                placeholder="cth: Ibu Rina"
              />

              <Text style={styles.sectionLabel}>Target Umur</Text>
              <View style={[styles.chipGrid, isDesktop && styles.chipGridWide]}>
                {AGE_GROUPS.map((g) => (
                  <View key={g.value} style={[styles.chipCell, isDesktop && styles.chipCellWide]}>
                    <SelectionChip
                      label={g.label}
                      emoji={g.emoji}
                      selected={ageGroup === g.value}
                      onPress={() => setAgeGroup(g.value)}
                    />
                  </View>
                ))}
              </View>

              <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Kondisi Khusus</Text>
              <View style={[styles.chipGrid, isDesktop && styles.chipGridWide]}>
                {SPECIAL_CONDITIONS.map((c) => (
                  <View key={c.value} style={[styles.chipCell, isDesktop && styles.chipCellWide]}>
                    <SelectionChip
                      label={c.label}
                      emoji={c.emoji}
                      selected={condition === c.value}
                      onPress={() => setCondition(c.value)}
                    />
                  </View>
                ))}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {!canSave && !error ? (
                <Text style={styles.hint}>
                  Pilih satu target umur dan satu kondisi khusus untuk melanjutkan.
                </Text>
              ) : null}

              <Button
                title={profile ? 'Simpan Perubahan' : 'Mulai Chat'}
                onPress={onSave}
                loading={saving}
                disabled={!canSave}
                style={styles.saveBtn}
              />
            </View>
          </Container>
        </ScrollView>
      </SafeAreaView>
    </AppGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 40 },
  emoji: { fontSize: 48, textAlign: 'center' },
  heading: {
    ...typography.h1,
    color: colors.textOnPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subheading: {
    color: colors.textOnPrimary,
    textAlign: 'center',
    opacity: 0.9,
    fontSize: 14,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionSpacing: { marginTop: spacing.lg },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  chipCell: { width: '100%' },
  chipGridWide: { gap: spacing.sm },
  chipCellWide: { width: '48%', flexGrow: 1 },
  error: { color: colors.danger, marginTop: spacing.md, fontSize: 13 },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  saveBtn: { marginTop: spacing.lg },
});
