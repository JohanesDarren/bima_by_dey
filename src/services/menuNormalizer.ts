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

/** Bersihkan daftar menu mentah; buang yang tidak punya nama sama sekali. */
export function normalizeMenuList(items: Partial<MenuItem>[]): MenuItem[] {
  return items.map(normalizeMenuItem).filter((m) => m.name !== '(tanpa nama)');
}
