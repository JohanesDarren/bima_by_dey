import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
import { spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** padding horizontal — default spacing.lg */
  padding?: number;
}

/**
 * Pembungkus konten responsif: full-bleed di mobile/tablet, konten
 * terpusat (maxWidth 720) di desktop/web agar tidak melebar tidak karuan.
 */
export function Container({ children, style, padding = spacing.lg }: Props) {
  const { contentMaxWidth, isDesktop } = useResponsive();
  return (
    <View
      style={[
        styles.base,
        isDesktop && { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' },
        { paddingHorizontal: isDesktop ? spacing.xl : padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexGrow: 1 },
});
