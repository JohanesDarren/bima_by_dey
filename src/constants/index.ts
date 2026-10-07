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
 * yang dijalankan bersamaan (server mengirim jawaban sekaligus di akhir, jadi satu
 * permintaan besar tidak bisa menampilkan hasil bertahap dan lebih rapuh).
 * Dipakai oleh store (jumlah permintaan) DAN layar (teks tombol) supaya tidak
 * terpisah-pisah dan lupa disamakan saat diubah.
 */
export const MENU_COUNT = 2;

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
