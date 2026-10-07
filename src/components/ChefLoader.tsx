import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  CHEF_SPOON_BOX,
  CHEF_SPOON_SVG,
  CHEF_STILL_SVG,
  CHEF_TOQUE_SVG,
  CHEF_VIEWBOX,
} from '../brand/chefMark';

interface Props {
  /** Rendered square size in px. */
  size?: number;
  accessibilityLabel?: string;
}

/**
 * How far the toque drifts down, in character units, at the end of each cycle.
 * It only ever moves down: the hat sits 1 unit below the top of the frame, so an
 * upward drift would clip its crown.
 */
const TOQUE_DRIFT = 1.6;

/** Peak sideways rock of the toque, in degrees. */
const TOQUE_TILT = 2.6;

/** Peak stir of the spoon around the grip, in degrees. */
const SPOON_STIR = 10;

const TOQUE_MS = 1600;
const SPOON_MS = 1500;

/**
 * Looping chef mascot used as the loading indicator.
 *
 * The body and head are drawn once and never move — the character stays solid
 * while the toque drifts and rocks and the spoon stirs in the raised hand. That
 * keeps the motion readable instead of having the whole figure wobble at once.
 */
export function ChefLoader({ size = 96, accessibilityLabel = 'Sedang memuat' }: Props) {
  const toque = useSharedValue(0);
  const stir = useSharedValue(0);

  useEffect(() => {
    toque.value = withRepeat(
      withTiming(1, { duration: TOQUE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    stir.value = withRepeat(
      withTiming(1, { duration: SPOON_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [stir, toque]);

  /** One character unit in px, so shared animations scale with `size`. */
  const unit = size / 100;

  const toqueStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(toque.value, [0, 1], [0, TOQUE_DRIFT * unit]) },
      { rotate: `${interpolate(toque.value, [0, 1], [-TOQUE_TILT, TOQUE_TILT])}deg` },
    ],
  }));

  const spoonStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(stir.value, [0, 1], [-SPOON_STIR, SPOON_STIR])}deg` }],
  }));

  const spoonSize = CHEF_SPOON_BOX.size * unit;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, { width: size, height: size }]}
    >
      {/* Backdrop, body and head: drawn once, never animated. */}
      <SvgXml xml={CHEF_STILL_SVG} viewBox={CHEF_VIEWBOX} width={size} height={size} />

      {/* Toque: drifts down and rocks. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.abs, { left: 0, top: 0, width: size, height: size }, toqueStyle]}
      >
        <SvgXml xml={CHEF_TOQUE_SVG} viewBox={CHEF_VIEWBOX} width={size} height={size} />
      </Animated.View>

      {/* Spoon: stirs around its grip, which is the centre of this box. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: CHEF_SPOON_BOX.x * unit,
            top: CHEF_SPOON_BOX.y * unit,
            width: spoonSize,
            height: spoonSize,
          },
          spoonStyle,
        ]}
      >
        <SvgXml xml={CHEF_SPOON_SVG} viewBox={CHEF_VIEWBOX} width={spoonSize} height={spoonSize} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
});
