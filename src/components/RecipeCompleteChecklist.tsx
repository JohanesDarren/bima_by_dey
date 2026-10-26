import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  /** Nama resep yang baru selesai dimasak. */
  recipeName: string;
  /** Jumlah langkah yang dikerjakan. */
  stepCount: number;
  /** Dipanggil setelah animasi selesai, untuk kembali ke beranda. */
  onDone: () => void;
}

/** Jeda antar butir checklist (ms). */
const TICK_MS = 420;
/** Lama animasi centang tiap butir (ms). */
const CHECK_MS = 260;
/** Jeda sebelum panel memudar keluar (ms). */
const HOLD_MS = 900;
/** Lama panel memudar keluar (ms). */
const FADE_MS = 380;

/**
 * Checklist penyelesaian resep.
 *
 * Muncul setelah langkah terakhir ditekan: tiap butir tercentang bergantian,
 * lalu panel memudar dan layar kembali ke beranda. Dipakai sebagai pengganti
 * navigasi langsung ke Riwayat supaya pengguna melihat bahwa seluruh langkah
 * benar-benar selesai.
 *
 * Animasi memakai `Animated` bawaan React Native — tidak menambah dependensi
 * native apa pun, jadi tidak berisiko pada build.
 */
export function RecipeCompleteChecklist({ recipeName, stepCount, onDone }: Props) {
  /** Butir checklist; jumlah langkah ditampilkan sebagai satu butir ringkas. */
  const items = useMemo(
    () => [
      `Semua ${stepCount} langkah dikerjakan`,
      'Bahan sudah dipakai sesuai resep',
      'Waktu memasak tercatat',
      `Resep ${recipeName} selesai`,
    ],
    [stepCount, recipeName],
  );

  // Satu nilai animasi per butir: 0 → belum, 1 → tercentang.
  const ticks = useRef(items.map(() => new Animated.Value(0))).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelScale = useRef(new Animated.Value(0.94)).current;
  const titleShift = useRef(new Animated.Value(10)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    const sequence: Animated.CompositeAnimation[] = [
      // Panel masuk.
      Animated.parallel([
        Animated.timing(panelOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(panelScale, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(titleShift, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Butir tercentang satu per satu.
      Animated.stagger(
        TICK_MS,
        ticks.map((value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: CHECK_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.delay(HOLD_MS),
      // Panel memudar, lalu kembali ke beranda.
      Animated.timing(panelOpacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
    ];

    const runner = Animated.sequence(sequence);
    runner.start(({ finished }) => {
      if (finished && !cancelled) onDone();
    });

    return () => {
      cancelled = true;
      runner.stop();
    };
    // Nilai Animated stabil; hanya bergantung pada jumlah butir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <Animated.View
      style={[styles.overlay, { opacity: panelOpacity }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Resep ${recipeName} selesai`}
    >
      <Animated.View style={[styles.panel, { transform: [{ scale: panelScale }] }]}>
        <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleShift }] }}>
          <Text style={styles.kicker}>Selesai</Text>
          <Text style={styles.title} numberOfLines={2}>
            {recipeName}
          </Text>
          <Text style={styles.subtitle}>Semua langkah sudah kamu kerjakan.</Text>
        </Animated.View>

        <View style={styles.list}>
          {items.map((label, index) => {
            const tick = ticks[index] ?? FALLBACK_TICK;
            // Cincin tumbuh sedikit saat tercentang.
            const ringScale = tick.interpolate({
              inputRange: [0, 0.6, 1],
              outputRange: [1, 1.14, 1],
            });
            return (
              <View key={label} style={styles.row}>
                <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }] }]}>
                  <Animated.View style={{ opacity: tick }}>
                    <MaterialIcons name="check" size={14} color={colors.white} />
                  </Animated.View>
                </Animated.View>
                <Animated.Text
                  style={[
                    styles.rowLabel,
                    {
                      opacity: tick.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.45, 1],
                      }),
                    },
                  ]}
                >
                  {label}
                </Animated.Text>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const RING = 24;

/** Nilai tetap untuk indeks yang (secara tipe) mungkin kosong; tidak pernah berubah. */
const FALLBACK_TICK = new Animated.Value(1);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  kicker: {
    ...typography.caption,
    color: colors.accentDark,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  list: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
