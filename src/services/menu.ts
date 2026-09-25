import {
  chatKroombox,
  extractJson,
  extractJsonArray,
  serverFailureText,
  ServerSideError,
} from './kroombox';
import type { FoodCategory, MenuItem, Recipe, RecipeRequest, Segment } from '../types';
import { isConditionAllowed } from '../constants';
import { menuKey } from '../utils/menuKey';

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
    throw new Error('Kombinasi kelompok umur dan kondisi khusus tidak valid.');
  }
}

function promptRecipe(menuName: string, seg: Segment, ulangi = false): string {
  // Bentuk keluaran ditaruh di UJUNG pesan. Terukur di lapangan: kalau permintaan JSON
  // ditulis di awal lalu disusul deretan aturan, model justru menyalin dokumen basis
  // pengetahuan ("## Konsep Produk …") dan JSON-nya tidak pernah keluar.
  const bentuk =
    '{"name": string, "servings": number, "ingredients": [string], "steps": [{"order": number, "title": string, "instruction": string detail, "durationMinutes": number|null}], "totalMinutes": number}';
  return [
    ulangi
      ? `Balasan sebelumnya SALAH BENTUK (bukan JSON). Tulis ulang resep "${menuName}" sekarang.`
      : `Buatkan resep lengkap dan detail untuk "${menuName}" yang sesuai:`,
    segmentLabel(seg),
    '',
    'Aturan:',
    '- Pecah resep menjadi langkah detail (5-10 langkah) yang bisa diikuti selangkah demi selangkah.',
    '- durationMinutes: isi angka menit bila langkah butuh waktu (misal merebus 10 menit, mengungkep 30 menit); null bila instan.',
    '- Sesuaikan porsi, tekstur, dan bumbu dengan segmentasi.',
    '- Bahan: SATU baris = nama bahan + jumlah + satuan. DILARANG menulis tanda kurung, angka persen, atau keterangan di belakang bahan. Contoh benar: "150 g tepung sorgum". Contoh salah: "150 g tepung sorgum (±55% dari tepung)".',
    '- Pakai nama bahan yang lazim di dapur, bukan nama ilmiah atau kode.',
    '- instruction: satu sampai dua kalimat praktis; sebutkan api, alat, atau tingkat kematangan bila perlu.',
    '- Setiap langkah WAJIB menyambung hasil langkah sebelumnya dan menyebutkan tindakannya pada hasil itu (mis. "masukkan tumisan bumbu tadi"). DILARANG meninggalkan langkah menggantung tanpa kelanjutan.',
    '- DILARANG menyebut bahan atau alat yang belum disiapkan di daftar bahan maupun langkah sebelumnya.',
    '- Semua bahan pada daftar ingredients WAJIB dipakai di langkah; dan setiap bahan yang dipakai di langkah WAJIB ada di daftar ingredients.',
    '- Setiap kunci JSON WAJIB diapit tanda kutip ganda.',
    '',
    'Jawab HANYA JSON ini — mulai langsung dengan { dan akhiri dengan }, tanpa kalimat pembuka, tanpa markdown, tanpa penjelasan sesudahnya:',
    bentuk,
    'JANGAN menyalin atau merangkum isi dokumen basis pengetahuan, dan JANGAN menulis judul seperti "Konsep Produk" atau "Catatan Verifikasi". Jangan menyebut harga.',
  ].join('\n');
}

function promptSearchRecipe(
  seg: Segment,
  category: FoodCategory,
  excludedNames: string[],
  ulangi = false,
): string {
  return [
    ulangi
      ? 'Balasan sebelumnya SALAH BENTUK (bukan JSON array). Tulis ulang sekarang.'
      : 'Buat TEPAT 3 rekomendasi menu olahan sorgum.',
    segmentLabel(seg),
    `Kategori WAJIB: ${CATEGORY_LABEL[category]}. Semua menu harus termasuk kategori ini.`,
    'WAJIB pertimbangkan kelompok umur DAN kondisi khusus secara bersamaan.',
    excludedNames.length
      ? `JANGAN ulangi menu berikut: ${excludedNames.map((name) => `"${name}"`).join(', ')}.`
      : '',
    'Ketiga nama menu harus berbeda satu sama lain.',
    'description: maksimal 2 kalimat pendek (sekitar 25 kata), tanpa tanda kurung dan tanpa angka persen.',
    'strengths dan weaknesses: maksimal 8 kata per butir.',
    'nutrition cukup {"calories": number, "protein": number, "fiber": number} — jangan tambah field lain.',
    'Setiap kunci JSON WAJIB diapit tanda kutip ganda. Jangan menulis analisis harga, alergen, catatan verifikasi, atau skor kelayakan.',
    '',
    'Jawab HANYA JSON array (tanpa teks lain, tanpa markdown fence, tanpa penjelasan sesudah JSON):',
    '[{"name": string, "description": string, "nutrition": {"calories": number, "protein": number, "fiber": number}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
    'JANGAN menyalin atau merangkum isi dokumen basis pengetahuan, dan JANGAN menulis judul seperti "Konsep Produk" atau "Catatan Verifikasi". Jangan menyebut harga.',
  ].join('\n');
}

/**
 * Ambil resep step-by-step untuk satu menu + segmentasi (RAG, non-streaming).
 */
export async function getRecipe(menuName: string, seg: Segment): Promise<Recipe> {
  validateSegment(seg);
  let lastError: unknown;
  // Dua percobaan saja (bukan tiga): satu permintaan ke RAG terukur 75-225 detik,
  // jadi percobaan ketiga hanya menambah lamanya menunggu ketika layanan lambat.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await chatKroombox({
        message: promptRecipe(menuName, seg, attempt > 0),
        useRag: true,
        stream: true,
      });
      // Model di sisi server tumbang → berhenti sekarang, jangan ulang.
      const serverFailure = serverFailureText(r);
      if (serverFailure) throw new ServerSideError(serverFailure);
      if (!r.trim() || /tidak ada teks|maaf/i.test(r.slice(0, 120))) continue;
      const parsed = extractJson<Recipe>(r);
      if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) return parsed;
    } catch (error) {
      if (error instanceof ServerSideError) throw error;
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
  if (!req.category) throw new Error('Pilih jenis menu terlebih dahulu.');
  let lastError: unknown;
  const excluded = new Set((req.excludedNames ?? []).map(menuKey));
  const collected = new Map<string, MenuItem>();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatKroombox({
        message: promptSearchRecipe(
          req.segment,
          req.category,
          [...(req.excludedNames ?? []), ...[...collected.values()].map((menu) => menu.name)],
          attempt > 0,
        ),
        useRag: true,
        stream: true,
      });
      // Model di sisi server tumbang → berhenti sekarang, jangan ulang.
      const serverFailure = serverFailureText(raw);
      if (serverFailure) throw new ServerSideError(serverFailure);
      if (!raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120))) continue;
      const parsed = extractJsonArray<MenuItem>(raw);
      if (!parsed) continue;
      for (const menu of normMenu(parsed)) {
        const key = menuKey(menu.name);
        if (!excluded.has(key) && !collected.has(key)) {
          collected.set(key, { ...menu, category: req.category });
        }
        if (collected.size === 3) return [...collected.values()];
      }
    } catch (error) {
      if (error instanceof ServerSideError) throw error;
      lastError = error;
    }
  }
  if (lastError instanceof Error && collected.size === 0) throw lastError;
  throw new Error('RAG belum menghasilkan 3 menu baru yang berbeda. Coba lagi.');
}
