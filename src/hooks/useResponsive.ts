import { useWindowDimensions } from 'react-native';

export interface ResponsiveInfo {
  isDesktop: boolean;
  /** Konten tengah dibatasi ≤720px di layar lebar; full-bleed di mobile. */
  contentMaxWidth: number;
}

const MOBILE_MAX = 768;
const TABLET_MAX = 1024;

/**
 * Hook responsif berbasis window dimensions.
 * Dipakai untuk: grid chip 2 kolom di desktop, dan container konten terpusat di
 * layar lebar. Hanya dua nilai yang benar-benar dipakai aplikasi; field lain
 * (tier/isMobile/isTablet/width/height) dibuang supaya tidak jadi muatan mati.
 */
export function useResponsive(): ResponsiveInfo {
  const { width } = useWindowDimensions();
  const isTablet = width >= MOBILE_MAX && width < TABLET_MAX;
  const isDesktop = width >= TABLET_MAX;
  return {
    isDesktop,
    contentMaxWidth: isDesktop ? 720 : isTablet ? 640 : 9999,
  };
}
