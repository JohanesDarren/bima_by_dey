import type { AgeGroup, SpecialCondition } from '../types';

/** Options for the Age Group picker (PRD F-02 / S-03). */
export const AGE_GROUPS: { label: string; value: AgeGroup; emoji: string }[] = [
  { label: 'Balita (0-5 th)', value: 'Balita', emoji: '👶' },
  { label: 'Anak SD (6-12 th)', value: 'Anak SD', emoji: '🧒' },
  { label: 'Remaja (13-17 th)', value: 'Remaja', emoji: '🧑' },
  { label: 'Dewasa (18-59 th)', value: 'Dewasa', emoji: '🧑‍🍳' },
  { label: 'Lansia (60+ th)', value: 'Lansia', emoji: '👵' },
];

/** Options for the Special Condition picker (PRD F-02 / S-03). */
export const SPECIAL_CONDITIONS: { label: string; value: SpecialCondition; emoji: string }[] = [
  { label: 'Umum / Tidak Ada', value: 'Umum', emoji: '✨' },
  { label: 'Ibu Hamil (Bumil)', value: 'Bumil', emoji: '🤰' },
  { label: 'Ibu Menyusui (Busui)', value: 'Busui', emoji: '🍼' },
  { label: 'Anak Berkebutuhan Khusus (ABK)', value: 'ABK', emoji: '🧩' },
];

export const isUnder18 = (ageGroup: AgeGroup | null): boolean =>
  ageGroup === 'Balita' || ageGroup === 'Anak SD' || ageGroup === 'Remaja';

/**
 * Berapa menu yang diminta sekali jalan. Tiap menu = SATU permintaan RAG terpisah
 * yang dijalankan bersamaan.
 * Dipakai oleh store (jumlah permintaan) DAN layar (teks tombol) supaya tidak
 * terpisah-pisah dan lupa disamakan saat diubah.
 *
 * Diset 1: satu permintaan = satu menu. Kalau diminta lebih dari satu, permintaan
 * berangkat BERSAMAAN dengan daftar larangan yang masih kosong, jadi promptnya
 * identik — model sering mengembalikan menu yang sama dan penyaring kembar
 * menyisakannya jadi satu saja. Ingin menu lain? Tekan "Buat menu lainnya".
 */
export const MENU_COUNT: number = 1;

/**
 * Teks tombol, menyesuaikan jumlah menu. Dipisah supaya saat jumlahnya 1 tidak
 * terbaca janggal ("Buat 1 menu") dan saat diubah lagi labelnya ikut menyesuaikan.
 */
export const MENU_BUTTON_LABEL = MENU_COUNT === 1 ? 'Buat menu' : `Buat ${MENU_COUNT} menu`;
export const MENU_MORE_BUTTON_LABEL =
  MENU_COUNT === 1 ? 'Buat menu lainnya' : `Buat ${MENU_COUNT} menu lainnya`;

/** Pesan saat RAG tidak menghasilkan menu baru. Satu sumber, dipakai layanan & store. */
export const NO_NEW_MENU_MESSAGE = 'RAG belum menghasilkan menu baru. Coba lagi.';

export const isConditionAllowed = (
  ageGroup: AgeGroup | null,
  condition: SpecialCondition,
): boolean => {
  if (isUnder18(ageGroup) && (condition === 'Bumil' || condition === 'Busui')) return false;
  if (ageGroup === 'Lansia' && condition === 'Busui') return false;
  return true;
};
