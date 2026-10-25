import { chatKroombox } from './ai/transport';
import { ServerSideError } from './ai/failures';
import { UserFacingError } from './errors';
import { isFatalFailure } from './ai/retryPolicy';
import { readMenuReply, readRecipeReply } from './menuReply';
import { fitsCategory } from './menuNormalizer';
import { getCachedMenus, getCachedRecipe, setCachedMenus, setCachedRecipe } from './cache';
import type { MenuItem, Recipe, RecipeRequest, Segment } from '../types';
import { isConditionAllowed, NO_NEW_MENU_MESSAGE } from '../constants';
import { menuKey } from '../utils/menuKey';
import {
  buildMenuPrompt,
  buildRecipePrompt,
  MENU_MAX_TOKENS,
  RECIPE_MAX_TOKENS,
} from '../prompts/menuPrompts';

/**
 * Orkestrasi pencarian menu & resep: menyusun permintaan ke server, menjalankannya
 * (sebagian bersamaan), memakai cache perangkat, dan menerapkan kebijakan berhenti
 * mengulang saat server macet.
 *
 * Isi dipecah ke module yang lebih sempit dengan satu tanggung jawab:
 *   - prompts/menuPrompts   → teks prompt (murni).
 *   - services/menuReply    → membaca balasan server jadi menu/resep (fungsi murni).
 *   - services/menuNormalizer → perapian item menu (fungsi murni).
 *   - services/recipeNormalizer → validasi bentuk resep (fungsi murni).
 *   - services/cache        → simpanan di perangkat.
 *   - ai/retryPolicy        → kapan berhenti mengulang.
 */

function validateSegment(seg: Segment): void {
  if (!seg.ageGroup || !seg.condition) {
    throw new UserFacingError('Pilih kelompok umur dan kondisi khusus.');
  }
  if (!isConditionAllowed(seg.ageGroup, seg.condition)) {
    throw new UserFacingError('Kombinasi kelompok umur dan kondisi khusus tidak valid.');
  }
}

/**
 * Percobaan resep total bila jawabannya TIDAK TERBACA (JSON rusak/terpotong, atau
 * model menjawab prosa). Satu ulangan diam-diam: terukur 2026-10-22, satu permintaan
 * resep selesai 10-40 detik dan jawaban rusak itu acak (server kadang jatuh ke model
 * cadangan yang berhasil), jadi ulangan kedua sering berhasil tanpa pengguna perlu
 * menekan "Coba lagi". Kegagalan server/timeout TIDAK diulang (lihat ai/retryPolicy).
 */
const RECIPE_ATTEMPTS = 2;

/**
 * Ambil resep step-by-step untuk satu menu + segmentasi (RAG).
 *
 * Hasil yang berhasil disimpan di perangkat (services/cache) supaya membuka resep
 * yang sama lagi tidak perlu menunggu server untuk kedua kalinya.
 */
export async function getRecipe(menuName: string, seg: Segment): Promise<Recipe> {
  validateSegment(seg);

  const cached = getCachedRecipe(menuName, seg);
  if (cached) return cached;

  for (let attempt = 0; attempt < RECIPE_ATTEMPTS; attempt += 1) {
    const r = await chatKroombox({
      message: buildRecipePrompt(menuName, seg),
      maxTokens: RECIPE_MAX_TOKENS,
    });
    // Model di sisi server tumbang → readRecipeReply melempar pesan jujur (berhenti).
    const recipe = readRecipeReply(r, menuName);
    if (recipe) {
      setCachedRecipe(menuName, seg, recipe);
      return recipe;
    }
  }
  throw new UserFacingError('Resep dari RAG tidak dapat dibaca. Coba lagi.');
}

/**
 * Cari menu via AI sesuai kebutuhan + kategori (RAG).
 *
 * Dipecah jadi BEBERAPA permintaan kecil (satu menu per permintaan), bukan satu
 * permintaan besar berisi beberapa menu: satu permintaan besar yang gagal menjatuhkan
 * SEMUA menu, dan minta satu menu lebih ringan sehingga lebih jarang gagal bentuk.
 *
 * Permintaan dijalankan BERURUTAN, bukan berbarengan. Terukur 2026-10-22: dua
 * permintaan bersamaan ke server membuat provider model kewalahan — salah satunya
 * hampir selalu dibalas "model AI dari provider … timeout" / 503. Berurutan memang
 * menjumlahkan waktunya, tapi tiap menu kini hanya ±6-25 detik.
 *
 * Hasil yang berhasil disimpan di perangkat supaya permintaan berikutnya dengan
 * segmentasi + kategori sama bisa tampil seketika.
 */
export async function searchRecipes(req: RecipeRequest): Promise<MenuItem[]> {
  validateSegment(req.segment);
  if (!req.category) throw new UserFacingError('Pilih jenis menu terlebih dahulu.');
  const segment = req.segment;
  const category = req.category;
  const target = Math.max(1, req.count ?? 2);
  const excluded = new Set((req.excludedNames ?? []).map(menuKey));
  const collected = new Map<string, MenuItem>();
  const errors: unknown[] = [];
  const rejected: string[] = [];

  // Hasil segar yang pernah tersimpan (hanya untuk permintaan TANPA pengecualian;
  // kalau pengguna minta "menu lainnya", simpanan lama justru berisi menu yang sama).
  if (excluded.size === 0) {
    const cached = getCachedMenus(segment, category);
    // Simpanan dari versi lama bisa berisi menu salah kategori (label kategori dulu
    // ditimpa); kalau tak ada yang lolos, minta ulang ke server.
    const fit = cached?.filter((menu) => fitsCategory(menu, category));
    if (fit && fit.length > 0) return fit.slice(0, target);
  }

  const mintaSatu = async (): Promise<void> => {
    try {
      const raw = await chatKroombox({
        message: buildMenuPrompt(segment, category, [
          ...excluded,
          ...[...collected.values()].map((menu) => menu.name),
          ...rejected,
        ]),
        maxTokens: MENU_MAX_TOKENS,
      });
      // Model di sisi server tumbang → readMenuReply melempar; berhenti, jangan ulang.
      for (const menu of readMenuReply(raw)) {
        const key = menuKey(menu.name);
        if (excluded.has(key) || collected.has(key)) continue;
        // Salah kategori (mis. sup untuk "Minuman") → buang; percobaan berikutnya
        // melarang nama itu sehingga model terdorong ke bentuk hidangan lain.
        if (!fitsCategory(menu, category)) {
          rejected.push(menu.name);
          continue;
        }
        collected.set(key, { ...menu, category });
        return; // satu permintaan = satu menu
      }
    } catch (error) {
      errors.push(error);
    }
  };

  // Satu per satu sampai target terpenuhi. Kekurangan (jawaban kembar atau satu
  // permintaan gagal) diberi sampai 2 percobaan tambahan — kembar itu kejadian biasa,
  // model kadang mengulang menu yang sama walau sudah dilarang. TAPI berhenti segera
  // bila kegagalannya tidak layak diulang (server macet / waktu habis / pemutus
  // terbuka): kebijakan itu hidup di ai/retryPolicy.
  for (let attempt = 0; attempt < target + 2 && collected.size < target; attempt += 1) {
    if (errors.some(isFatalFailure)) break;
    await mintaSatu();
  }

  if (collected.size === 0) {
    const first = errors.find((error) => error instanceof ServerSideError) ?? errors[0];
    if (first instanceof Error) throw first;
    throw new UserFacingError(NO_NEW_MENU_MESSAGE);
  }
  const hasil = [...collected.values()];
  if (excluded.size === 0) setCachedMenus(segment, category, hasil);
  return hasil;
}
