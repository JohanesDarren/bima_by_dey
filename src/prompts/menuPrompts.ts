import type { FoodCategory, Segment } from '../types';

/**
 * Pembangun prompt untuk membuat menu & resep.
 *
 * Murni soal teks: tidak menyentuh jaringan, cache, atau penyaringan hasil — semua
 * itu urusan orkestrasi (services/menu). Dipisah supaya bentuk permintaan ke model
 * bisa dibaca dan diuji sebagai teks biasa, dan supaya penyusunan prompt (menu,
 * resep, chat, suara) berkumpul di satu tempat.
 *
 * Tiap prompt juga mendeklarasikan anggaran token keluarnya di sini: itu bagian dari
 * kontrak "bentuk jawaban yang diharapkan" untuk prompt tersebut, bukan setelan
 * jaringan — jadi ia tinggal bersama prompt-nya, bukan di orkestrasi.
 */

/**
 * Batas token keluaran per jenis permintaan. `undefined` = jangan kirim `max_tokens`,
 * biarkan server memakai batas bawaannya.
 *
 * Sengaja TIDAK dipatok. Model utama di server adalah model penalaran: token
 * "berpikir"-nya ikut memakan batas ini sebelum satu karakter JSON pun ditulis.
 * Terukur 2026-10-22 lewat log server: dengan 1.800 (resep) / 900 (menu) model
 * berhenti `finish_reason=length` — kadang tanpa teks sama sekali (server lalu pindah
 * ke model cadangan), kadang JSON terpotong di tengah (langsung dikirim → "Resep
 * tidak dapat dibaca"). Tanpa batas: resep & menu terbaca utuh di semua percobaan.
 */
export const RECIPE_MAX_TOKENS: number | undefined = undefined;
export const MENU_MAX_TOKENS: number | undefined = undefined;

/**
 * Arti tiap kategori, bukan sekadar namanya. Terukur 2026-10-25 (di website, prompt
 * yang sama): kategori minuman dengan ayam di bahan keluar sebagai "Velvet Soup" —
 * label "beverage (minuman)" saja membuat model bebas memilih bentuk hidangan.
 */
const CATEGORY_LABEL: Record<FoodCategory, string> = {
  main_course:
    'main course (makanan utama) — hidangan utama yang mengenyangkan (nasi, bubur, mi, lauk). BUKAN minuman, kue, atau camilan.',
  soup: 'soup (berkuah) — hidangan berkuah (sup, soto, sayur bening). BUKAN minuman, gorengan, atau kue.',
  dessert:
    'dessert (hidangan penutup) — manis (puding, kue, es, bubur manis). BUKAN masakan gurih seperti sup ayam atau tumis.',
  snack: 'snack (kudapan) — camilan ringan porsi kecil (kue, keripik, bola-bola, biskuit). BUKAN hidangan utama atau minuman.',
  beverage:
    'beverage (minuman) — WAJIB minuman yang diminum (smoothie, jus, susu/sari sorgum, wedang). BUKAN sup, bubur, atau makanan berkuah.',
  other: 'lainnya',
};

function segmentLabel(seg: Segment): string {
  const age = seg.ageGroup ?? 'Umum';
  const cond = seg.condition ?? 'Umum';
  return `Target Umur: [${age}], Kondisi Khusus: [${cond}]`;
}

/** Penjaga anti-salin yang WAJIB ada di tiap prompt menu/resep — satu salinan saja. */
const NO_DOCUMENT_COPY =
  'JANGAN menyalin atau merangkum isi dokumen basis pengetahuan, dan JANGAN menulis judul seperti "Konsep Produk" atau "Catatan Verifikasi". Jangan menyebut harga.';

/** Prompt minta satu resep lengkap step-by-step untuk sebuah menu. */
export function buildRecipePrompt(menuName: string, seg: Segment): string {
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
    NO_DOCUMENT_COPY,
  ].join('\n');
}

/** Prompt minta satu rekomendasi menu untuk segmentasi + kategori tertentu. */
export function buildMenuPrompt(
  seg: Segment,
  category: FoodCategory,
  excludedNames: string[],
): string {
  return [
    'Buat 1 rekomendasi menu olahan sorgum.',
    segmentLabel(seg),
    `Kategori WAJIB: ${CATEGORY_LABEL[category]} Menu harus termasuk kategori ini; bahan yang tidak cocok untuk kategori itu (mis. ayam untuk minuman) jangan dipakai.`,
    'WAJIB pertimbangkan kelompok umur DAN kondisi khusus secara bersamaan.',
    excludedNames.length
      ? `JANGAN memakai menu berikut: ${excludedNames.map((name) => `"${name}"`).join(', ')}. Menu baru WAJIB beda — ganti bahan utama atau jenis sajiannya, jangan hanya ubah nama.`
      : '',
    'description: maksimal 2 kalimat pendek (sekitar 25 kata), tanpa tanda kurung dan tanpa angka persen.',
    'strengths dan weaknesses: maksimal 8 kata per butir.',
    'nutrition cukup {"calories": number, "protein": number, "fiber": number} — jangan tambah field lain.',
    'Setiap kunci JSON WAJIB diapit tanda kutip ganda. Jangan menulis analisis harga, alergen, catatan verifikasi, atau skor kelayakan.',
    '',
    'Jawab HANYA JSON array berisi TEPAT 1 objek (tanpa teks lain, tanpa markdown fence, tanpa penjelasan sesudah JSON):',
    '[{"name": string, "description": string, "nutrition": {"calories": number, "protein": number, "fiber": number}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
    NO_DOCUMENT_COPY,
  ].join('\n');
}
