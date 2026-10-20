import { chatKroombox } from './ai/transport';
import { extractJson, extractJsonArray } from './ai/json';
import { ServerSideError } from './ai/failures';
import { serverFailureText, UserFacingError } from './errors';
import { isFatalFailure } from './ai/retryPolicy';
import { normalizeRecipeResponse } from './recipeNormalizer';
import { normalizeMenuList } from './menuNormalizer';
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
 * Ambil resep step-by-step untuk satu menu + segmentasi (RAG).
 *
 * SATU percobaan saja, sengaja. Satu permintaan resep terukur 75-234 detik; kalau
 * jawabannya rusak dan kita mengulang otomatis, pengguna menunggu tambahan selama itu
 * sebelum akhirnya tetap gagal — itulah yang membuat "gagal" terasa sangat lama.
 * Lebih baik gagal cepat lalu pengguna menekan "Coba lagi" di layar resep (sudah ada).
 *
 * Hasil yang berhasil disimpan di perangkat (services/cache) supaya membuka resep
 * yang sama lagi tidak perlu menunggu 75-234 detik untuk kedua kalinya.
 */
export async function getRecipe(menuName: string, seg: Segment): Promise<Recipe> {
  validateSegment(seg);

  const cached = getCachedRecipe(menuName, seg);
  if (cached) return cached;

  const r = await chatKroombox({
    message: buildRecipePrompt(menuName, seg),
    maxTokens: RECIPE_MAX_TOKENS,
  });
  // Model di sisi server tumbang → berhenti dengan pesan jujur.
  const serverFailure = serverFailureText(r);
  if (serverFailure) throw new ServerSideError(serverFailure);
  // Penorma dari upstream: validasi bentuk + paksa nama resep = nama menu yang
  // diminta (menutup akar masalah "nama resep beda dari nama menu").
  const parsed = extractJson<unknown>(r);
  const recipe = normalizeRecipeResponse(parsed, menuName);
  if (recipe) {
    setCachedRecipe(menuName, seg, recipe);
    return recipe;
  }
  throw new UserFacingError('Resep dari RAG tidak dapat dibaca. Coba lagi.');
}

/**
 * Cari menu via AI sesuai kebutuhan + kategori (RAG).
 *
 * Dipecah jadi BEBERAPA permintaan kecil (satu menu per permintaan) yang dijalankan
 * BERBARENGAN, bukan satu permintaan besar berisi beberapa menu. Alasannya terukur:
 *   1. Satu permintaan besar yang gagal menjatuhkan SEMUA menu. Dengan permintaan
 *      terpisah, satu yang gagal tidak menghapus menu yang sudah berhasil.
 *   2. Minta satu menu lebih ringan, jadi lebih jarang gagal bentuk.
 * Permintaan berjalan bersamaan, jadi total waktunya = yang paling lambat, bukan
 * jumlah waktunya. Hasil dikembalikan SEKALIGUS setelah semuanya selesai (server
 * mengirim jawaban sekaligus di akhir, jadi tidak ada gunanya menampilkan bertahap).
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

  // Hasil segar yang pernah tersimpan (hanya untuk permintaan TANPA pengecualian;
  // kalau pengguna minta "menu lainnya", simpanan lama justru berisi menu yang sama).
  if (excluded.size === 0) {
    const cached = getCachedMenus(segment, category);
    if (cached) {
      return cached.filter((menu) => !excluded.has(menuKey(menu.name))).slice(0, target);
    }
  }

  const mintaSatu = async (): Promise<void> => {
    try {
      const raw = await chatKroombox({
        message: buildMenuPrompt(segment, category, [
          ...excluded,
          ...[...collected.values()].map((menu) => menu.name),
        ]),
        maxTokens: MENU_MAX_TOKENS,
      });
      // Model di sisi server tumbang → berhenti sekarang, jangan ulang.
      const serverFailure = serverFailureText(raw);
      if (serverFailure) throw new ServerSideError(serverFailure);
      if (!raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120))) return;
      const parsed = extractJsonArray<MenuItem>(raw);
      if (!parsed) return;
      for (const menu of normalizeMenuList(parsed)) {
        const key = menuKey(menu.name);
        if (excluded.has(key) || collected.has(key)) continue;
        collected.set(key, { ...menu, category });
        return; // satu permintaan = satu menu
      }
    } catch (error) {
      errors.push(error);
    }
  };

  await Promise.all(Array.from({ length: target }, () => mintaSatu()));

  // Masih kurang dari target (jawaban kembar atau satu permintaan gagal): isi lagi.
  // Kembar itu kejadian biasa — model kadang mengulang menu yang sama walau sudah
  // dilarang. Jadi beri sampai 2 putaran percobaan, TAPI berhenti segera bila
  // kegagalannya tidak layak diulang (server macet / waktu habis / pemutus terbuka):
  // mengulang saat server macet cuma menambah ~1 menit tunggu per putaran tanpa
  // menambah peluang berhasil (terukur: server yang macet tetap 0 token pada
  // percobaan berikutnya). Kebijakan itu hidup di ai/retryPolicy.
  for (let putaran = 0; putaran < 2 && collected.size < target; putaran += 1) {
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
