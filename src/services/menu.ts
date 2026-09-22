import {
  KroomboxError,
  collectKroomboxStream,
  extractCompleteObjects,
  extractJson,
  extractJsonArray,
} from './kroombox';
import type { FoodCategory, MenuItem, Recipe, RecipeRequest, Segment } from '../types';

/** Jumlah menu andalan yang diminta ke RAG (3, bukan 5 → jawaban lebih cepat). */
const RECOMMENDED_MENU_COUNT = 3;

/** Total percobaan satu permintaan: 1 kali + 1 kali ulang. */
const MAX_ATTEMPTS = 2;

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

/**
 * Jawaban yang tidak berguna → coba lagi. API flaky: bypass kuota kadang balas
 * "Maaf, tidak ada teks…" dan itu tidak boleh dianggap hasil.
 */
function isUnusableAnswer(raw: string): boolean {
  return !raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120));
}

/** Hasil parse pertama yang tidak kosong (jalur lama dulu, lalu cadangan). */
function firstNonEmpty<T>(...lists: (T[] | null)[]): T[] {
  for (const list of lists) {
    if (list && list.length > 0) return list;
  }
  return [];
}

/** Parse daftar menu: jalur lama dulu, lalu objek JSON yang sudah lengkap. */
function parseMenuList(raw: string): MenuItem[] {
  return normMenu(
    firstNonEmpty(extractJsonArray<MenuItem>(raw), extractCompleteObjects<MenuItem>(raw)),
  );
}

function segmentLabel(seg: Segment): string {
  const age = seg.ageGroup ?? 'Umum';
  const cond = seg.condition ?? 'Umum';
  return `Target Umur: [${age}], Kondisi Khusus: [${cond}]`;
}

/**
 * Aturan isi untuk kolom pendek (deskripsi, kelebihan, perhatian, bahan).
 * Ini yang menahan AI bercerita: dulu bahan bisa keluar sebagai
 * "150 g tepung sorgum (55% dari tepung)" dan deskripsi jadi bertele-tele.
 */
const CONTENT_RULES = [
  'Aturan isi (wajib):',
  '- Kalimat pendek dan langsung. TANPA angka persentase, perhitungan, atau istilah teknis yang tidak diminta.',
  '- Teks polos: tanpa markdown, tanpa tanda bintang, tanpa tanda kurung penjelasan.',
];

function promptRecommendedMenus(seg: Segment, count = RECOMMENDED_MENU_COUNT): string {
  return [
    `Anda adalah ahli gizi dan koki sorgum. Rekomendasikan ${count} menu andalan produk olahan sorgum yang TEPAT untuk:`,
    segmentLabel(seg),
    'Setiap menu harus sesuai kebutuhan gizi dan kemampuan mengunyah segmen tersebut.',
    '',
    'Jawab HANYA JSON array (tanpa teks lain, tanpa markdown fence):',
    '[{"name": string, "description": string singkat 1-2 kalimat, "nutrition": {calories, protein, fiber}, "strengths": [2 string], "weaknesses": [2 string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
    '',
    '- description: maksimal 2 kalimat (±25 kata), langsung ke intinya.',
    '- strengths & weaknesses: masing-masing maksimal 8 kata.',
    ...CONTENT_RULES,
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
    '- ingredients: SATU baris = nama bahan + jumlah + satuan. DILARANG tanda kurung, angka persen (contoh yang SALAH: "150 g tepung sorgum (55% dari tepung)"), alasan pemakaian, catatan gizi, kata "opsional", dan nama merek.',
    '- title langkah: 2-5 kata. instruction: maksimal 2 kalimat (±25 kata); jangan mengulang alasan gizi atau menyebut ulang seluruh daftar bahan.',
    ...CONTENT_RULES,
  ].join('\n');
}

function promptSearchRecipe(query: string, seg: Segment, category: FoodCategory | null): string {
  return [
    `Cari resep olahan sorgum dengan kriteria: "${query}".`,
    segmentLabel(seg),
    category ? `Kategori makanan: ${CATEGORY_LABEL[category]}.` : '',
    'Jika cocok, berikan 3 menu kandidat.',
    '',
    'Jawab HANYA JSON array (tanpa teks lain, tanpa markdown fence):',
    '[{"name": string, "description": string, "nutrition": {calories, protein, fiber}, "strengths": [2 string], "weaknesses": [2 string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
    '',
    '- description: maksimal 2 kalimat (±25 kata), langsung ke intinya.',
    '- strengths & weaknesses: masing-masing maksimal 8 kata.',
    ...CONTENT_RULES,
  ].join('\n');
}

/**
 * Ambil daftar menu andalan untuk satu segmentasi lewat jalur mengalir.
 *
 * onPartial dipanggil setiap ada menu baru yang sudah lengkap → UI bisa
 * menampilkan kartu satu per satu (baca sambil jalan) sebelum jawaban penuh.
 */
export async function getRecommendedMenus(
  seg: Segment,
  opts: { count?: number; onPartial?: (menus: MenuItem[]) => void } = {},
): Promise<MenuItem[]> {
  const count = opts.count ?? RECOMMENDED_MENU_COUNT;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let reported = 0;
    try {
      const raw = await collectKroomboxStream(
        { message: promptRecommendedMenus(seg, count), useRag: true, stream: true },
        {
          onText: opts.onPartial
            ? (full) => {
                const items = normMenu(extractCompleteObjects<MenuItem>(full));
                if (items.length > reported) {
                  reported = items.length;
                  opts.onPartial?.(items);
                }
              }
            : undefined,
        },
      );
      if (isUnusableAnswer(raw)) continue;
      const parsed = parseMenuList(raw);
      if (parsed.length > 0) return parsed;
    } catch (error) {
      lastError = error;
      if (error instanceof KroomboxError && error.status === 429) break;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Respons RAG tidak dapat dibaca. Coba lagi.');
}

/**
 * Ambil resep step-by-step untuk satu menu + segmentasi lewat jalur mengalir
 * (jawaban resep panjang, jadi jalur ini yang aman dari batas diam Cloudflare).
 */
export async function getRecipe(menuName: string, seg: Segment): Promise<Recipe> {
  let raw = '';
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const r = await collectKroomboxStream({
        message: promptRecipe(menuName, seg),
        useRag: true,
        stream: true,
      });
      if (!isUnusableAnswer(r)) {
        raw = r;
        break;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof KroomboxError && error.status === 429) break;
    }
  }
  const parsed = extractJson<Recipe>(raw) ?? extractCompleteObjects<Recipe>(raw)[0] ?? null;
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    if (lastError instanceof Error) throw lastError;
    throw new Error('Resep dari RAG tidak dapat dibaca. Coba lagi.');
  }
  return parsed;
}

/**
 * Cari resep lain via AI sesuai kebutuhan + kategori, lewat jalur mengalir.
 * onPartial sama seperti getRecommendedMenus.
 */
export async function searchRecipes(
  req: RecipeRequest,
  opts: { onPartial?: (menus: MenuItem[]) => void } = {},
): Promise<MenuItem[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let reported = 0;
    try {
      const raw = await collectKroomboxStream(
        {
          message: promptSearchRecipe(req.query ?? '', req.segment, req.category),
          useRag: true,
          stream: true,
        },
        {
          onText: opts.onPartial
            ? (full) => {
                const items = normMenu(extractCompleteObjects<MenuItem>(full));
                if (items.length > reported) {
                  reported = items.length;
                  opts.onPartial?.(items);
                }
              }
            : undefined,
        },
      );
      if (isUnusableAnswer(raw)) continue;
      const parsed = parseMenuList(raw);
      if (parsed.length > 0) return parsed;
    } catch (error) {
      lastError = error;
      if (error instanceof KroomboxError && error.status === 429) break;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Hasil RAG tidak dapat dibaca. Coba lagi.');
}
