import type { ChatMessage } from '../types';
import type { HistoryEntry } from '../services/kroombox';
import { stripMarkdown } from './cleanText';

/**
 * Prompt Chef Sorghum.
 *
 * Kenapa dipisah ke berkas sendiri: dulu layar hanya mengirim "konteks +
 * pertanyaan" tanpa aturan apa pun, sehingga AI menjawab melebar (misal ditanya
 * "bisa dipakai kalau tepung tidak disangrai?" dijawab dengan cerita panjang ke
 * sana-sini). Dua hal yang diperbaiki di sini:
 *
 * 1. ATURAN JAWABAN yang tegas (langsung, maksimal ±60 kata, hanya yang ditanya).
 *    API RAG tidak menerima batas token, jadi panjang jawaban hanya bisa ditekan
 *    lewat aturan ini.
 * 2. RIWAYAT percakapan ikut dikirim, supaya pertanyaan lanjutan ("kalau tidak
 *    disangrai?") masih nyambung dengan pertanyaan sebelumnya.
 */

/** Jumlah pesan terakhir yang ikut dikirim sebagai acuan. */
const HISTORY_LIMIT = 6;

/** Panjang maksimal satu pesan riwayat (biar permintaan tidak menggelembung). */
const HISTORY_ITEM_MAX = 320;

const CHEF_RULES = [
  'ATURAN JAWABAN (wajib dipatuhi):',
  '1. Jawab langsung di 1-2 kalimat pertama, misal "Bisa." atau "Tidak, sebaiknya disangrai dulu."',
  '2. Maksimal 60 kata. Tanpa salam, tanpa pendahuluan, tanpa mengulang resep/bahan yang sudah dibahas.',
  '3. Hanya bahas yang ditanya. Jangan menambah saran gizi, tips, atau topik lain yang tidak diminta.',
  '4. Kalau pertanyaannya bisa dijawab ya/tidak: mulai dengan ya/tidak + satu alasan singkat.',
  '5. Kalau memang perlu langkah, tulis maksimal 3 poin pendek.',
  '6. Bahasa Indonesia santai, teks polos: tanpa markdown, tanpa tanda bintang atau pagar.',
  'Balas hanya isi jawabannya.',
];

function clamp(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= HISTORY_ITEM_MAX ? s : `${s.slice(0, HISTORY_ITEM_MAX)}…`;
}

/** Susun satu pertanyaan ke API: konteks + aturan + pertanyaan. */
export function buildChefMessage(context: string, question: string): string {
  return [
    'Anda adalah Chef Sorghum — koki pendamping di aplikasi sorgumcore.',
    '',
    `Konteks: ${context.trim()}`,
    '',
    ...CHEF_RULES,
    '',
    `Pertanyaan user: ${question.trim()}`,
  ].join('\n');
}

/**
 * Riwayat percakapan untuk kolom `history` API (bukan dituliskan ulang di dalam
 * pesan — API-nya memang menerima kolom ini). Dipangkas supaya permintaan tidak
 * menggelembung: hanya beberapa pesan terakhir, masing-masing dipotong.
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
