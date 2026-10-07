import {
  chatKroombox,
  extractJson,
  extractJsonArray,
  serverFailureText,
  ServerSideError,
} from './kroombox';
import { normalizeRecipeResponse } from './recipeNormalizer';
import { getCachedMenus, getCachedRecipe, setCachedMenus, setCachedRecipe } from './cache';
import type { FoodCategory, MenuItem, Recipe, RecipeRequest, Segment } from '../types';
import { isConditionAllowed, NO_NEW_MENU_MESSAGE } from '../constants';
import { menuKey } from '../utils/menuKey';
import { limitSentences } from '../utils/assistantText';

/**
 * Batas token keluaran per jenis permintaan (dipungut dari versi upstream, nilainya
 * dilebarkan). Dipasang longgar dengan sengaja: keluaran resep kita ±2.600 karakter
 * (±800 token), jadi 1.800 memberi ruang lega — kalau dipatok ketat, JSON-nya
 * terpotong dan resepnya malah ditolak lalu minta ulang (menambah waktu tunggu).
 */
const RECIPE_MAX_TOKENS = 1800;
const MENU_MAX_TOKENS = 900;

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

function promptRecipe(menuName: string, seg: Segment): string {
  // Bentuk keluaran ditaruh di UJUNG pesan. Terukur di lapangan: kalau permintaan JSON
  // ditulis di awal lalu disusul deretan aturan, model justru menyalin dokumen basis
  // pengetahuan ("## Konsep Produk …") dan JSON-nya tidak pernah keluar.
  const bentuk =
    '{"name": string, "servings": number, "ingredients": [string], "steps": [{"order": number, "title": string, "instruction": string detail, "durationMinutes": number|null}], "totalMinutes": number}';
  return [
    `Buatkan resep lengkap dan detail untuk "${menuName}" yang sesuai:`,
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

function promptSearchRecipe(seg: Segment, category: FoodCategory, excludedNames: string[]): string {
  return [
    'Buat 1 rekomendasi menu olahan sorgum.',
    segmentLabel(seg),
    `Kategori WAJIB: ${CATEGORY_LABEL[category]}. Menu harus termasuk kategori ini.`,
    'WAJIB pertimbangkan kelompok umur DAN kondisi khusus secara bersamaan.',
    excludedNames.length
      ? `JANGAN memakai menu berikut: ${excludedNames.map((name) => `"${name}"`).join(', ')}.`
      : '',
    'description: maksimal 2 kalimat pendek (sekitar 25 kata), tanpa tanda kurung dan tanpa angka persen.',
    'strengths dan weaknesses: maksimal 8 kata per butir.',
    'nutrition cukup {"calories": number, "protein": number, "fiber": number} — jangan tambah field lain.',
    'Setiap kunci JSON WAJIB diapit tanda kutip ganda. Jangan menulis analisis harga, alergen, catatan verifikasi, atau skor kelayakan.',
    '',
    'Jawab HANYA JSON array berisi TEPAT 1 objek (tanpa teks lain, tanpa markdown fence, tanpa penjelasan sesudah JSON):',
    '[{"name": string, "description": string, "nutrition": {"calories": number, "protein": number, "fiber": number}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
    'JANGAN menyalin atau merangkum isi dokumen basis pengetahuan, dan JANGAN menulis judul seperti "Konsep Produk" atau "Catatan Verifikasi". Jangan menyebut harga.',
  ].join('\n');
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
    message: promptRecipe(menuName, seg),
    useRag: true,
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
  throw new Error('Resep dari RAG tidak dapat dibaca. Coba lagi.');
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
  if (!req.category) throw new Error('Pilih jenis menu terlebih dahulu.');
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
        message: promptSearchRecipe(segment, category, [
          ...excluded,
          ...[...collected.values()].map((menu) => menu.name),
        ]),
        useRag: true,
        maxTokens: MENU_MAX_TOKENS,
      });
      // Model di sisi server tumbang → berhenti sekarang, jangan ulang.
      const serverFailure = serverFailureText(raw);
      if (serverFailure) throw new ServerSideError(serverFailure);
      if (!raw.trim() || /tidak ada teks|maaf/i.test(raw.slice(0, 120))) return;
      const parsed = extractJsonArray<MenuItem>(raw);
      if (!parsed) return;
      for (const menu of normMenu(parsed)) {
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

  // Masih kurang dari target (jawaban kembar atau satu permintaan gagal): isi
  // sekali lagi — kecuali kegagalannya dari model di sisi server, karena mengulang
  // saat itu hanya membuang waktu pengguna.
  const adaKegagalanServer = errors.some((error) => error instanceof ServerSideError);
  if (collected.size < target && !adaKegagalanServer) await mintaSatu();

  if (collected.size === 0) {
    const first = errors.find((error) => error instanceof ServerSideError) ?? errors[0];
    if (first instanceof Error) throw first;
    throw new Error(NO_NEW_MENU_MESSAGE);
  }
  const hasil = [...collected.values()];
  if (excluded.size === 0) setCachedMenus(segment, category, hasil);
  return hasil;
}
