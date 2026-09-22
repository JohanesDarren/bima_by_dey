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
 */

/** Jumlah pesan riwayat terakhir yang ikut dikirim (3 tanya + 3 jawab). */
export const HISTORY_LIMIT = 6;

/** Sama, dipakai mode panggilan suara. */
export const VOICE_HISTORY_LIMIT = 6;

/** Panjang maksimal satu pesan riwayat (biar permintaan tidak menggelembung). */
const HISTORY_ITEM_MAX = 320;

function clamp(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= HISTORY_ITEM_MAX ? s : `${s.slice(0, HISTORY_ITEM_MAX)}…`;
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
