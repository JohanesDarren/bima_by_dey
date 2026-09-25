import type { ChatMessage } from '../types';
import type { HistoryEntry } from '../services/kroombox';
import { stripMarkdown } from './cleanText';

/**
 * Pembantu percakapan Chef.
 *
 * Kenapa terpisah: sebelumnya layar hanya mengirim "konteks + pertanyaan" tanpa
 * riwayat. Akibatnya pertanyaan lanjutan (mis. ditanya "bisa dipakai kalau tepung
 * tidak disangrai?") dijawab melebar ke sana-sini, karena AI tidak tahu apa yang
 * baru saja dibahas. API RAG memang menerima kolom `history` — selama ini kosong.
 *
 * Sejak basis pindah ke versi upstream, aturan upstream tetap dipakai APA ADANYA
 * (blok ATURAN DASAR) dan aturan kita ditambahkan sebagai blok yang menimpa.
 * Persona tetap wajib ada: tanpa persona, model berubah jadi tukang salin teks
 * basis pengetahuan — pernah kejadian, ditanya pengganti merica, jawabannya
 * tempelan bagian "Konsep Produk" dari dokumen RAG.
 */

/** Jumlah pesan riwayat terakhir yang ikut dikirim (3 tanya + 3 jawab). */
export const HISTORY_LIMIT = 6;

/** Sama, dipakai mode panggilan suara. */
export const VOICE_HISTORY_LIMIT = 6;

/** Baris persona: bikin jawaban tetap "ngobrol sebagai koki", bukan rangkuman dokumen. */
const CHEF_PERSONA = 'Anda adalah Chef Sorghum — koki pendamping di aplikasi sorgumcore.';

export const VOICE_PERSONA =
  'Anda adalah Chef Sorghum — koki pendamping yang menjawab lewat panggilan suara di aplikasi sorgumcore.';

/** Aturan bawaan versi upstream — jangan diubah, hanya ditambahi di bawah. */
const BASE_RULES = [
  'ATURAN DASAR:',
  'Jawab langsung ke inti berdasarkan RAG: awali dengan jawabannya, bukan penjelasan panjang.',
  'Gunakan paragraf biasa. Jangan gunakan emoji, logo, emblem, ikon, markdown, heading, atau simbol dekoratif.',
  'Hindari pembuka, pengulangan pertanyaan, dan penutup basa-basi yang tidak perlu.',
  'Kalau pertanyaan bisa dijawab ya/tidak: mulai dengan ya/tidak lalu satu alasan singkat. Kalau perlu langkah, tulis maksimal 3 poin pendek.',
];

/** Aturan tambahan kita — dinyatakan menimpa aturan dasar supaya tidak saling melemahkan. */
const STRICT_RULES = [
  'TAMBAHAN WAJIB (lebih ketat, menimpa kebiasaan di atas):',
  'Jawab langsung di 1-2 kalimat pertama, misal "Bisa." atau "Tidak, sebaiknya disangrai dulu." Lalu SELESAI.',
  'Jangan menyalin atau menempelkan teks basis pengetahuan (mis. bagian "Konsep Produk", "Catatan Verifikasi", atau analisis harga) — jawab pertanyaannya dengan kalimat sendiri.',
  'Kalau pengguna tidak punya suatu bahan, sebutkan 1-2 bahan pengganti yang lazim beserta jumlah kasarnya, lalu SELESAI.',
  'Maksimal 25 kata. DILARANG menulis ulang resep, daftar bahan, atau langkah-langkah, dan dilarang menawarkan versi resep baru.',
  'DILARANG menambah tips, variasi, saran gizi, atau informasi lain yang tidak ditanya.',
  'Hanya bahas resep ini dan langkah yang sedang dibuka; kalau ditanya di luar itu, tolak dengan satu kalimat singkat.',
  'Jangan membahas harga, biaya, Rupiah, alergen, analisis gizi panjang, verifikasi, atau skor.',
  'Bahasa Indonesia santai, teks polos, tanpa label seperti "Jawaban:", "Answer:", atau "Catatan:".',
  'Balas hanya isi jawabannya.',
];

/** Aturan mode suara: aturan dasar upstream apa adanya + tambahan kita. */
export const VOICE_RULES = [
  'ATURAN DASAR:',
  'Jawab berdasarkan RAG. Langsung jawab inti pertanyaan dalam maksimal 2 kalimat pendek.',
  'Tanpa pembuka, pengulangan pertanyaan, daftar, markdown, emoji, simbol dekoratif, atau penutup basa-basi.',
  'Bulatkan angka dan tulis dengan kata; hindari simbol yang janggal diucapkan mesin suara seperti %, /, dan ±.',
  'Jika RAG tidak mendukung jawaban, katakan singkat dan jujur.',
  'TAMBAHAN WAJIB (lebih ketat, menimpa kebiasaan di atas):',
  'Jawab langsung di 1-2 kalimat pertama (maksimal 20 kata), awali dengan jawabannya. Contoh: "Ya bisa, karena tepung sorgum tidak berperekat."',
  'Jangan menyalin teks basis pengetahuan; jawab dengan kalimat sendiri.',
  'Kalau pengguna tidak punya suatu bahan, sebutkan 1-2 bahan pengganti yang lazim, lalu SELESAI.',
  'DILARANG mengulang resep, bahan, atau langkah; jangan menawarkan versi resep baru, tips, variasi, atau informasi lain yang tidak ditanya.',
  'Hanya soal resep ini dan langkah yang sedang dibuka; di luar itu tolak satu kalimat singkat.',
  'Jangan menyebut harga, biaya, Rupiah, alergen, analisis gizi panjang, atau label seperti "Jawaban"/"Answer".',
];

/** Panjang maksimal satu pesan riwayat (biar permintaan tidak menggelembung). */
const HISTORY_ITEM_MAX = 320;

function clamp(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= HISTORY_ITEM_MAX ? s : `${s.slice(0, HISTORY_ITEM_MAX)}…`;
}

/** Susun satu pertanyaan ke API: persona + konteks + aturan + pertanyaan. */
export function buildChefMessage(context: string, question: string): string {
  return [
    CHEF_PERSONA,
    '',
    `Konteks: ${context.trim()}`,
    '',
    ...BASE_RULES,
    '',
    ...STRICT_RULES,
    '',
    `Pertanyaan user: ${question.trim()}`,
  ].join('\n');
}

/**
 * Riwayat percakapan untuk kolom `history` API (bukan dituliskan ulang di dalam
 * pesan). Dipangkas: hanya beberapa pesan terakhir, masing-masing dipotong.
 */
export function buildChefHistory(messages: ChatMessage[]): HistoryEntry[] {
  return messages
    .filter((m) => m.role !== 'system' && m.content.trim().length > 0)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: clamp(stripMarkdown(m.content)),
    }));
}
