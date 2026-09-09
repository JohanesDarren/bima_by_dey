import { useWindowDimensions } from 'react-native';

export type DeviceTier = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveInfo {
  /** 'mobile' < 768, 'tablet' 768–1024, 'desktop' > 1024 */
  tier: DeviceTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  /** Konten tengah dibatasi ≤720px di layar lebar; full-bleed di mobile. */
  contentMaxWidth: number;
}

const MOBILE_MAX = 768;
const TABLET_MAX = 1024;

/**
 * Hook responsif berbasis window dimensions.
 * Dipakai untuk: grid chip 2 kolom di tablet/desktop, container konten
 * terpusat di layar lebar, dan penyesuaian layout per tier.
 */
export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  const isMobile = width < MOBILE_MAX;
  const isTablet = width >= MOBILE_MAX && width < TABLET_MAX;
  const isDesktop = width >= TABLET_MAX;
  const tier: DeviceTier = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
  return {
    tier,
    isMobile,
    isTablet,
    isDesktop,
    width,
    height,
    contentMaxWidth: isDesktop ? 720 : isTablet ? 640 : 9999,
  };
}
