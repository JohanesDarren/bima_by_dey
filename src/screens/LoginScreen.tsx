import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { AppGradient } from '../components/AppGradient';
import { useAuthStore } from '../store/authStore';
import { colors, radius, spacing, typography } from '../theme';

export function LoginScreen() {
  const signInAsGuest = useAuthStore((state) => state.signInAsGuest);

  return (
    <AppGradient style={styles.flex}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <MaterialIcons name="grain" size={18} color={colors.primaryDark} />
          </View>
          <Text style={styles.brand}>sorgumcore</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.visual} accessibilityElementsHidden>
            <View style={styles.haloLarge} />
            <View style={styles.haloSmall} />
            <View style={styles.heroMark}>
              <MaterialIcons name="restaurant" size={54} color={colors.primaryDark} />
            </View>
            <View style={[styles.seed, styles.seedTop]}>
              <MaterialIcons name="eco" size={20} color={colors.primaryDark} />
            </View>
            <View style={[styles.seed, styles.seedBottom]}>
              <MaterialIcons name="grain" size={19} color={colors.primaryDark} />
            </View>
          </View>

          <Text style={styles.eyebrow}>SELAMAT DATANG</Text>
          <Text style={styles.title}>Masak sorgum,{`\n`}lebih yakin.</Text>
          <Text style={styles.description}>
            Temukan resep sesuai usia dan kebutuhan, lalu masak selangkah demi selangkah bersama
            Chef AI.
          </Text>
        </View>

        <View style={styles.bottom}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mulai sebagai tamu"
            onPress={signInAsGuest}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Mulai sebagai tamu</Text>
            <View style={styles.ctaIcon}>
              <MaterialIcons name="arrow-forward" size={20} color={colors.primaryDark} />
            </View>
          </Pressable>
          <View style={styles.privacyRow}>
            <MaterialIcons name="phone-android" size={15} color="#D8E2DA" />
            <Text style={styles.privacy}>Tanpa akun · Pilihan tersimpan di perangkat</Text>
          </View>
        </View>
      </SafeAreaView>
    </AppGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  brand: { ...typography.h3, color: colors.textOnPrimary, fontSize: 20 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: spacing.xl },
  visual: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  haloLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(250,246,240,0.16)',
  },
  haloSmall: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(250,246,240,0.08)',
  },
  heroMark: {
    width: 126,
    height: 126,
    borderRadius: 63,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BDE5CF',
    borderWidth: 7,
    borderColor: 'rgba(250,246,240,0.28)',
  },
  seed: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  seedTop: { right: 17, top: 27 },
  seedBottom: { left: 17, bottom: 29 },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    fontSize: 38,
    lineHeight: 43,
    color: colors.textOnPrimary,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: '#D8E2DA',
    textAlign: 'center',
    maxWidth: 330,
    marginTop: spacing.lg,
  },
  bottom: { paddingBottom: spacing.xl },
  cta: {
    minHeight: 60,
    borderRadius: radius.lg,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  ctaText: { fontSize: 16, fontWeight: '800', color: colors.primaryDark },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  privacyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  privacy: { ...typography.caption, color: '#D8E2DA' },
});
