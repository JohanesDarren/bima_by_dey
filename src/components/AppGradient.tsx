import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import type { ColorValue } from 'react-native';

interface Props {
  children?: React.ReactNode;
  style?: object;
}

const GRADIENT_COLORS: readonly [ColorValue, ColorValue, ...ColorValue[]] = [
  colors.gradient[0],
  colors.gradient[1],
  colors.gradient[2],
];

/** Warm orange gradient backdrop used across auth + header surfaces. */
export function AppGradient({ children, style }: Props) {
  return (
    <LinearGradient
      colors={GRADIENT_COLORS}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
