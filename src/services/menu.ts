import { chatKroombox, extractJson, extractJsonArray } from './kroombox';
import type { FoodCategory, MenuItem, Recipe, RecipeRequest, Segment } from '../types';
import { isConditionAllowed } from '../constants';

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

/** Bersihkan/resapi item menu mentah dari LLM ke MenuItem yang aman. */
function normalizeMenu(item: Partial<MenuItem>): MenuItem {
  return {
    name: item.name ?? '(tanpa nama)',
    description: item.description ?? '',
    nutrition: item.nutrition && typeof item.nutrition === 'object' ? item.nutrition : {},
    strengths: Array.isArray(item.strengths) ? item.strengths : [],
    weaknesses: Array.isArray(item.weaknesses) ? item.weaknesses : [],
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
    throw new Error('Kondisi ibu hamil atau menyusui hanya tersedia untuk usia dewasa.');
  }
}

function promptRecommendedMenus(seg: Segment, count = 5): string {
  return [
    `Anda adalah ahli gizi dan koki sorgum. Rekomendasikan ${count} menu andalan produk olahan sorgum yang TEPAT untuk:`,
    segmentLabel(seg),
    'WAJIB pertimbangkan kelompok umur DAN kondisi khusus secara bersamaan. Jangan abaikan atau mengganti salah satunya.',
    'Setiap menu harus sesuai kebutuhan gizi, keamanan bahan, tekstur, dan kemampuan mengunyah kombinasi tersebut.',
    '',
    'Jawab HANYA JSON array (tanpa teks lain, tanpa markdown fence):',
    '[{"name": string, "description": string singkat 1-2 kalimat, "nutrition": {calories, protein, fiber, key_vitamins, minerals, notes}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
  ].join('\n');
}

function promptRecipe(menuName: string, seg: Segment): string {
  return [
    `Buatkan resep lengkap dan detail untuk "${menuName}" yang sesuai:`,
    segmentLabel(seg),
    '',
    'Jawab HANYA JSON (tanpa teks lain, tanpa markdown fence):',
    '{"name": string, "servings": number, "ingredients": [string], "steps": [{"order": number, "title": string, "instruction": string detail, "durationMinutes": number|null}], "totalMinutes": number}',
    '',
    'Aturan:',
    '- Pecah resep menjadi langkah detail (5-10 langkah) yang bisa diikuti selangkah demi selangkah.',
    '- durationMinutes: isi angka menit bila langkah butuh waktu (misal merebus 10 menit, mengungkep 30 menit); null bila instan.',
    '- Sesuaikan porsi, tekstur, dan bumbu dengan segmentasi.',
  ].join('\n');
}

function promptSearchRecipe(query: string, seg: Segment, category: FoodCategory | null): string {
  return [
    `Cari resep olahan sorgum dengan kriteria: "${query}".`,
    segmentLabel(seg),
    category ? `Kategori makanan: ${CATEGORY_LABEL[category]}.` : '',
    'Jika cocok, berikan 3-5 menu kandidat.',
    '',
    'Jawab HANYA JSON array (tanpa teks lain, tanpa markdown fence):',
    '[{"name": string, "description": string, "nutrition": {calories, protein, fiber, key_vitamins, minerals, notes}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
  ].join('\n');
}

/**
 * Ambil daftar menu andalan untuk satu segmentasi (RAG, non-streaming).
 */
export async function getRecommendedMenus(seg: Segment, count = 5): Promise<MenuItem[]> {
  validateSegment(seg);
  let lastError: unknown;
  // API flaky (bypass cuota kadang balas "Maaf, tidak ada teks…") → retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatKroombox({
        message: promptRecommendedMenus(seg, count),
        useRag: true,
        stream: true,
      });
      if (!raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120))) continue;
      const parsed = extractJsonArray<MenuItem>(raw);
      if (parsed) return normMenu(parsed);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Respons RAG tidak dapat dibaca. Coba lagi.');
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
      });
      if (!r.trim() || /tidak ada teks|maaf/i.test(r.slice(0, 120))) continue;
      const parsed = extractJson<Recipe>(r);
      if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) return parsed;
    } catch (error) {
      lastError = error;
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatKroombox({
        message: promptSearchRecipe(req.query ?? '', req.segment, req.category),
        useRag: true,
        stream: true,
      });
      if (!raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120))) continue;
      const parsed = extractJsonArray<MenuItem>(raw);
      if (parsed) return normMenu(parsed);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Hasil RAG tidak dapat dibaca. Coba lagi.');
}
