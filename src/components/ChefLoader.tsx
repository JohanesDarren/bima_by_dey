import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme';

// Warm "Terra" palette taken from the theme, plus skin tones the palette lacks.
const SKIN = '#EFC8A0';
const SKIN_SHADOW = '#D9A87C';
const SKIN_LINE = '#7A4A2B';
const HAT = '#FFFDF9';
const HAT_SHADOW = '#E4E0D8';
const GLOW = 'rgba(200, 150, 62, 0.18)';

interface Props {
  /** Rendered square size in px. */
  size?: number;
  accessibilityLabel?: string;
}

/** Sparkle that drifts upward and fades; each one is delayed so they never sync. */
function useSpark(delayMs: number, distance: number) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [delayMs, progress]);
  return useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15, 0.8, 1], [0, 0.9, 0.5, 0]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -distance]) }],
  }));
}

/**
 * Chef mascot used as the looping loader. Built from layered SVG shapes with a
 * soft 3D read (radial highlight, cheek shading, drop shadow) and animated with
 * Reanimated: the chef bobs and tilts, the eyes blink, the spoon stirs and the
 * halo/sparkles breathe. Runs on Android/iOS/web with no native 3D dependency.
 */
export function ChefLoader({ size = 96, accessibilityLabel = 'Sedang memuat' }: Props) {
  const bob = useSharedValue(0);
  const glow = useSharedValue(0);
  const stir = useSharedValue(0);
  const blink = useSharedValue(1);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    glow.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    stir.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    blink.value = withRepeat(
      withSequence(
        withDelay(2400, withTiming(0.12, { duration: 90 })),
        withTiming(1, { duration: 110 }),
        withDelay(900, withTiming(1, { duration: 1 })),
      ),
      -1,
      false,
    );
  }, [blink, bob, glow, stir]);

  const chefStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -size * 0.05]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-1.8, 1.8])}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.35, 0.75]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.9, 1.08]) }],
  }));

  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: blink.value }],
  }));

  const spoonStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(stir.value, [0, 1], [-14, 16])}deg` }],
  }));

  const sparkA = useSpark(0, size * 0.22);
  const sparkB = useSpark(700, size * 0.18);
  const sparkC = useSpark(1300, size * 0.16);

  const sparkSize = size * 0.085;
  const sparkSmall = size * 0.065;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, { width: size, height: size }]}
    >
      {/* Pulsing 3D halo behind the character */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            width: size * 0.92,
            height: size * 0.92,
            borderRadius: size * 0.46,
            backgroundColor: GLOW,
          },
          glowStyle,
        ]}
      />

      {/* Ground shadow (static, so the chef appears to float above it) */}
      <Svg pointerEvents="none" width={size} height={size} viewBox="0 0 100 100" style={styles.abs}>
        <Ellipse cx={50} cy={93} rx={24} ry={4.5} fill="rgba(31, 51, 35, 0.13)" />
        <Circle
          cx={50}
          cy={50}
          r={46}
          stroke="rgba(200, 150, 62, 0.22)"
          strokeWidth={1.4}
          strokeDasharray="4 7"
          fill="none"
        />
      </Svg>

      {/* Chef character */}
      <Animated.View pointerEvents="none" style={[styles.abs, chefStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {/* body + apron */}
          <Path d="M30 72 Q50 64 70 72 L73 95 Q50 99 27 95 Z" fill={colors.primary} />
          <Path d="M42 70 h16 l2 15 q-10 5 -20 0 Z" fill={colors.accent} />
          <Path
            d="M42 70 L50 77 L58 70"
            stroke={colors.primaryDark}
            strokeWidth={1.4}
            fill="none"
          />

          {/* arms */}
          <Path
            d="M29 74 Q22 82 26 91"
            stroke={SKIN}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M71 74 Q78 82 74 91"
            stroke={SKIN}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
          />

          {/* neck */}
          <Rect x={45} y={60} width={10} height={8} rx={3} fill={SKIN_SHADOW} />

          {/* head with cheek shading for depth */}
          <Circle cx={50} cy={46} r={20} fill={SKIN} />
          <Ellipse cx={59} cy={50} rx={8} ry={13} fill={SKIN_SHADOW} opacity={0.35} />
          <Circle cx={39} cy={53} r={3.6} fill={colors.clay} opacity={0.32} />
          <Circle cx={61} cy={53} r={3.6} fill={colors.clay} opacity={0.32} />
          <Circle cx={50} cy={50} r={1.8} fill={SKIN_SHADOW} />
          <Path
            d="M44 55 Q50 60 56 55"
            stroke={SKIN_LINE}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />

          {/* chef toque */}
          <Circle cx={35} cy={17} r={12} fill={HAT} />
          <Circle cx={50} cy={12} r={14} fill={HAT} />
          <Circle cx={65} cy={17} r={12} fill={HAT} />
          <Rect x={30} y={25} width={40} height={7} rx={3} fill={HAT} />
          <Rect x={30} y={28} width={40} height={4} rx={2} fill={HAT_SHADOW} />
        </Svg>
      </Animated.View>

      {/* Eyes as a separate layer so they can blink on their own */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          { left: size * 0.3, top: size * 0.4, width: size * 0.4, height: size * 0.15 },
          eyeStyle,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 40 15">
          <Ellipse cx={13} cy={7.5} rx={3.2} ry={4} fill={colors.text} />
          <Ellipse cx={27} cy={7.5} rx={3.2} ry={4} fill={colors.text} />
        </Svg>
      </Animated.View>

      {/* Stirring spoon */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          { left: size * 0.6, top: size * 0.3, width: size * 0.52, height: size * 0.52 },
          spoonStyle,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 60 60">
          <Path
            d="M30 24 L30 54"
            stroke={colors.accentDark}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <Ellipse cx={30} cy={14} rx={10} ry={12} fill={colors.accent} />
          <Ellipse cx={26} cy={10} rx={4} ry={5} fill="#E8CE97" opacity={0.85} />
        </Svg>
      </Animated.View>

      {/* Drifting sparkles */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: size * 0.13,
            top: size * 0.24,
            width: sparkSize,
            height: sparkSize,
            borderRadius: sparkSize / 2,
            backgroundColor: colors.accent,
          },
          sparkA,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: size * 0.78,
            top: size * 0.16,
            width: sparkSmall,
            height: sparkSmall,
            borderRadius: sparkSmall / 2,
            backgroundColor: colors.accent,
          },
          sparkB,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: size * 0.07,
            top: size * 0.62,
            width: sparkSmall,
            height: sparkSmall,
            borderRadius: sparkSmall / 2,
            backgroundColor: colors.clay,
          },
          sparkC,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
});
