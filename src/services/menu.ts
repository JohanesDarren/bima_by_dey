import { chatKroombox, extractJson, extractJsonArray } from './kroombox';
import type { FoodCategory, MenuItem, Recipe, RecipeRequest, Segment } from '../types';
import { isConditionAllowed } from '../constants';
import { menuKey } from '../utils/menuKey';
import { COMPACT_RAG_STANDARD, limitSentences } from '../utils/assistantText';
import { normalizeRecipeResponse } from './recipeNormalizer';

const CATEGORY_LABEL: Record<FoodCategory, string> = {
  main_course: 'main course (makanan utama)',
  soup: 'soup (berkuah)',
  dessert: 'dessert (hidangan penutup)',
  snack: 'snack (kudapan)',
  beverage: 'beverage (minuman)',
  other: 'lainnya',
};

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
    minuman: 'beverage',
    beverage: 'beverage',
    drink: 'beverage',
    dessert: 'dessert',
    penutup: 'dessert',
    manis: 'dessert',
    snack: 'snack',
    kudapan: 'snack',
    kue: 'snack',
    cookies: 'snack',
    bubur: 'soup',
  };
  for (const [k, v] of Object.entries(kw)) {
    if (s.includes(k)) return v;
  }
  return 'other';
}

/** Bersihkan/resapi item menu mentah dari LLM ke MenuItem yang aman. */
function normalizeMenu(item: Partial<MenuItem>): MenuItem {
  const nutrition =
    item.nutrition && typeof item.nutrition === 'object' && !Array.isArray(item.nutrition)
      ? Object.fromEntries(
          Object.entries(item.nutrition)
            .slice(0, 6)
            .map(([key, value]) => [key, limitSentences(String(value), 1)]),
        )
      : {};
  return {
    name: item.name ?? '(tanpa nama)',
    description: limitSentences(item.description ?? '', 1),
    nutrition,
    strengths: Array.isArray(item.strengths)
      ? item.strengths.slice(0, 2).map((value) => limitSentences(String(value), 1))
      : [],
    weaknesses: Array.isArray(item.weaknesses)
      ? item.weaknesses.slice(0, 2).map((value) => limitSentences(String(value), 1))
      : [],
    category: normalizeCategory(item.category),
  };
}

function normMenu(r: MenuItem[]): MenuItem[] {
  return r.map(normalizeMenu).filter((m) => m.name !== '(tanpa nama)');
}

function segmentLabel(seg: Segment): string {
  const age = seg.ageGroup ?? 'Umum';
  const cond = seg.condition ?? 'Umum';
  return `Target Umur: [${age}], Kondisi Khusus: [${cond}]`;
}

function validateSegment(seg: Segment): void {
  if (!seg.ageGroup || !seg.condition) {
    throw new Error('Pilih kelompok umur dan kondisi khusus.');
  }
  if (!isConditionAllowed(seg.ageGroup, seg.condition)) {
    throw new Error('Kombinasi kelompok umur dan kondisi khusus tidak valid.');
  }
}

function shouldRetryRequest(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const match = error.message.match(/HTTP (\d{3})/);
  if (!match) return true;
  const status = Number(match[1]);
  return status === 408 || status === 429 || status >= 500;
}

function promptRecipe(menuName: string, seg: Segment): string {
  return [
    `Buat resep ringkas tetapi lengkap untuk "${menuName}" yang sesuai:`,
    segmentLabel(seg),
    COMPACT_RAG_STANDARD,
    '',
    'Jawab HANYA JSON (tanpa teks lain, tanpa markdown fence):',
    '{"name": string, "servings": number, "ingredients": [string], "steps": [{"order": number, "title": string, "instruction": string, "durationMinutes": number|null}], "totalMinutes": number}',
    '',
    'Aturan:',
    '- Gunakan 4-7 langkah penting. Gabungkan tindakan kecil yang berurutan, tetapi jangan hilangkan tindakan keselamatan atau proses wajib.',
    '- Setiap bahan satu baris, dengan takaran. Setiap instruksi maksimal 2 kalimat pendek dan langsung berupa tindakan.',
    '- durationMinutes: isi angka menit bila langkah butuh waktu (misal merebus 10 menit, mengungkep 30 menit); null bila instan.',
    '- Sesuaikan porsi, tekstur, dan bumbu dengan segmentasi.',
    '- Jangan menambahkan fakta yang tidak didukung RAG. Jika resep tidak cukup didukung, jangan membuat resep palsu.',
  ].join('\n');
}

function promptSearchRecipe(seg: Segment, category: FoodCategory, excludedNames: string[]): string {
  return [
    'Buat TEPAT 3 rekomendasi menu olahan sorgum.',
    segmentLabel(seg),
    `Kategori WAJIB: ${CATEGORY_LABEL[category]}. Semua menu harus termasuk kategori ini.`,
    COMPACT_RAG_STANDARD,
    'WAJIB pertimbangkan kelompok umur DAN kondisi khusus secara bersamaan.',
    excludedNames.length
      ? `JANGAN ulangi menu berikut: ${excludedNames.map((name) => `"${name}"`).join(', ')}.`
      : '',
    'Ketiga nama menu harus berbeda satu sama lain.',
    'Deskripsi tepat 1 kalimat pendek. Maksimal 2 kelebihan dan 2 perhatian, masing-masing 1 kalimat pendek.',
    '',
    'Jawab HANYA JSON array (tanpa teks lain, tanpa markdown fence):',
    '[{"name": string, "description": string, "nutrition": {calories, protein, fiber, key_vitamins, minerals, notes}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
  ].join('\n');
}

/**
 * Ambil resep step-by-step untuk satu menu + segmentasi (RAG, non-streaming).
 */
export async function getRecipe(menuName: string, seg: Segment): Promise<Recipe> {
  validateSegment(seg);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await chatKroombox({
        message: promptRecipe(menuName, seg),
        useRag: true,
        stream: true,
        maxTokens: 900,
      });
      if (!r.trim() || /tidak ada teks|maaf/i.test(r.slice(0, 120))) continue;
      const parsed = extractJson<unknown>(r);
      const recipe = normalizeRecipeResponse(parsed, menuName);
      if (recipe) return recipe;
    } catch (error) {
      lastError = error;
      if (!shouldRetryRequest(error)) throw error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Resep dari RAG tidak dapat dibaca. Coba lagi.');
}

/**
 * Cari resep lain via AI sesuai kebutuhan + kategori (RAG, non-streaming).
 */
export async function searchRecipes(req: RecipeRequest): Promise<MenuItem[]> {
  validateSegment(req.segment);
  if (!req.category) throw new Error('Pilih jenis menu terlebih dahulu.');
  let lastError: unknown;
  const excluded = new Set((req.excludedNames ?? []).map(menuKey));
  const collected = new Map<string, MenuItem>();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatKroombox({
        maxTokens: 900,
        message: promptSearchRecipe(req.segment, req.category, [
          ...(req.excludedNames ?? []),
          ...[...collected.values()].map((menu) => menu.name),
        ]),
        useRag: true,
        stream: true,
      });
      if (!raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120))) continue;
      const parsed = extractJsonArray<MenuItem>(raw);
      if (!parsed) continue;
      for (const menu of normMenu(parsed)) {
        const key = menuKey(menu.name);
        if (menu.category === req.category && !excluded.has(key) && !collected.has(key)) {
          collected.set(key, menu);
        }
        if (collected.size === 3) return [...collected.values()];
      }
    } catch (error) {
      lastError = error;
      if (!shouldRetryRequest(error)) throw error;
    }
  }
  if (lastError instanceof Error && collected.size === 0) throw lastError;
  throw new Error('RAG belum menghasilkan 3 menu baru yang berbeda. Coba lagi.');
}
