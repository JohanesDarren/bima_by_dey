import { getString, setString } from '../lib/storage';
import { menuKey } from '../utils/menuKey';
import type { FoodCategory, MenuItem, Recipe, Segment } from '../types';

/**
 * Simpanan hasil RAG di perangkat (MMKV di HP, localStorage di web).
 *
 * Kenapa perlu: satu permintaan resep ke RAG terukur 75-234 detik, dan menu 78-157
 * detik. Tanpa simpanan, membuka resep yang SAMA dua kali berarti membayar lamanya
 * dua kali — dan membebani server mitra dua kali. Dengan simpanan, hasil yang pernah
 * berhasil tampil seketika.
 *
 * Yang disimpan hanya hasil yang SUDAH lolos validasi aplikasi (penorma resep /
 * penyaring menu), jadi tidak ada risiko menyimpan jawaban rusak.
 */
const PREFIX = 'rag_cache_v1';

/** Umur simpanan: 3 hari. Setelah itu dianggap basi dan diambil ulang. */
const TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface Envelope<T> {
  savedAt: number;
  value: T;
}

/** Kunci segmentasi yang stabil: "dewasa_umum". */
function segmentKey(seg: Segment): string {
  const age = (seg.ageGroup ?? '-').toLowerCase().replace(/\s+/g, '');
  const cond = (seg.condition ?? '-').toLowerCase().replace(/\s+/g, '');
  return `${age}_${cond}`;
}

function read<T>(key: string): T | null {
  const raw = getString(key);
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.savedAt !== 'number') return null;
    if (Date.now() - env.savedAt > TTL_MS) return null;
    return env.value ?? null;
  } catch {
    return null; // data rusak/versi lama → anggap tidak ada
  }
}

function write<T>(key: string, value: T): void {
  try {
    setString(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Penyimpanan penuh/tidak tersedia: abaikan, aplikasi tetap jalan tanpa simpanan.
  }
}

/** Resep yang pernah berhasil untuk menu + segmentasi ini. */
export function getCachedRecipe(menuName: string, seg: Segment): Recipe | null {
  return read<Recipe>(`${PREFIX}:recipe:${menuKey(menuName)}:${segmentKey(seg)}`);
}

export function setCachedRecipe(menuName: string, seg: Segment, recipe: Recipe): void {
  write(`${PREFIX}:recipe:${menuKey(menuName)}:${segmentKey(seg)}`, recipe);
}

/** Daftar menu segar (tanpa pengecualian) untuk segmentasi + kategori ini. */
export function getCachedMenus(seg: Segment, category: FoodCategory): MenuItem[] | null {
  const value = read<MenuItem[]>(`${PREFIX}:menus:${segmentKey(seg)}:${category}`);
  return Array.isArray(value) && value.length > 0 ? value : null;
}

export function setCachedMenus(seg: Segment, category: FoodCategory, menus: MenuItem[]): void {
  write(`${PREFIX}:menus:${segmentKey(seg)}:${category}`, menus);
}
