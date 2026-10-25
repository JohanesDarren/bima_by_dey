import type { FoodCategory, MenuItem } from '../types';
import { limitSentences } from '../utils/assistantText';

/**
 * Penorma item menu — fungsi MURNI: menerima objek mentah dari model, mengembalikan
 * MenuItem yang aman ditampilkan. Tidak menyentuh jaringan, cache, atau store, jadi
 * bisa diuji sebagai tabel (bentuk masuk → bentuk keluar).
 *
 * Dipisah dari orkestrasi (services/menu) yang mengurus permintaan ke server.
 */

/** Normalisasi kategori bebas dari LLM → enum FoodCategory yang aman. */
function normalizeCategory(raw: string | undefined | null): FoodCategory {
  const s = (raw ?? '').toLowerCase();
  const kw: Record<string, FoodCategory> = {
    main: 'main_course',
    'makanan utama': 'main_course',
    lauk: 'main_course',
    soup: 'soup',
    sop: 'soup',
    kuah: 'soup',
    dessert: 'dessert',
    penutup: 'dessert',
    manis: 'dessert',
    snack: 'snack',
    kudapan: 'snack',
    kue: 'snack',
    cookies: 'snack',
    bubur: 'soup',
    minuman: 'beverage',
    beverage: 'beverage',
    drink: 'beverage',
  };
  for (const [k, v] of Object.entries(kw)) {
    if (s.includes(k)) return v;
  }
  return 'other';
}

/** Bersihkan/resapi satu item menu mentah dari LLM ke MenuItem yang aman.
 *  Internal: pemanggil di luar module cukup memakai `normalizeMenuList`. */
function normalizeMenuItem(item: Partial<MenuItem>): MenuItem {
  const nutrition = item.nutrition && typeof item.nutrition === 'object' ? item.nutrition : {};
  const oneLine = (value: unknown): string => limitSentences(String(value ?? ''), 1);
  const fewBullets = (value: unknown): string[] =>
    Array.isArray(value) ? value.slice(0, 2).map((v) => limitSentences(String(v), 1)) : [];
  return {
    name: item.name ?? '(tanpa nama)',
    // Perapian dari versi upstream: deskripsi kartu cukup satu kalimat, kelebihan dan
    // perhatian maksimal dua butir (masing-masing satu kalimat). Sebelumnya setiap butir
    // boleh sampai 8 kata tanpa batas jumlah, sehingga kartu di beranda jadi panjang.
    description: oneLine(item.description ?? ''),
    nutrition: Object.fromEntries(
      Object.entries(nutrition).map(([key, value]) => [key, oneLine(value)]),
    ),
    strengths: fewBullets(item.strengths),
    weaknesses: fewBullets(item.weaknesses),
    category: normalizeCategory(item.category),
  };
}

/** Kata pada nama menu yang menempatkannya di luar kategori yang diminta. */
const DRINK_WORDS = 'smoothie|jus|juice|wedang|latte|milkshake|minuman';
const SAVORY_MAIN_WORDS = 'nasi|gulai|kari|curry|semur|rendang|soto|sup|soup|sop|tumis|bakso|pepes';
const CAKE_SNACK_WORDS = 'puding|pudding|kue|cookies|biskuit|brownies|keripik';
const wordsRe = (words: string) => new RegExp(`\\b(${words})\\b`, 'i');
const NAME_MISMATCH: Partial<Record<FoodCategory, RegExp>> = {
  main_course: wordsRe(`${DRINK_WORDS}|${CAKE_SNACK_WORDS}`),
  soup: wordsRe(`${DRINK_WORDS}|${CAKE_SNACK_WORDS}|goreng|panggang|bakar`),
  dessert: wordsRe(`${SAVORY_MAIN_WORDS}|ayam|daging|ikan`),
  snack: wordsRe(`${DRINK_WORDS}|${SAVORY_MAIN_WORDS}`),
  beverage: wordsRe(`${SAVORY_MAIN_WORDS}|bubur|porridge|goreng|mie|mi|kue|bolu|cake|cookies`),
};
/** Kategori jawaban model yang masih wajar untuk kategori yang diminta. */
const COMPATIBLE: Partial<Record<FoodCategory, FoodCategory[]>> = {
  main_course: ['main_course', 'soup'],
  soup: ['soup', 'main_course'],
  dessert: ['dessert', 'snack', 'beverage'],
  snack: ['snack', 'dessert'],
  beverage: ['beverage'],
};

/**
 * Apakah menu memang termasuk kategori yang diminta. Kategori pilihan pengguna dulu
 * langsung ditempel ke kartu, jadi sup dari model tampil berlabel "Minuman".
 * Dua tanda: kategori yang dilaporkan model sendiri ('other' dianggap tidak tahu),
 * dan kata pada nama menu.
 */
export function fitsCategory(menu: MenuItem, requested: FoodCategory): boolean {
  const allowed = COMPATIBLE[requested];
  if (allowed && menu.category !== 'other' && !allowed.includes(menu.category)) return false;
  return !NAME_MISMATCH[requested]?.test(menu.name);
}

/** Bersihkan daftar menu mentah; buang yang tidak punya nama sama sekali. */
export function normalizeMenuList(items: Partial<MenuItem>[]): MenuItem[] {
  return items.map(normalizeMenuItem).filter((m) => m.name !== '(tanpa nama)');
}
