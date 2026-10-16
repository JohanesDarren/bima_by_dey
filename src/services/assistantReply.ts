import { serverFailureText } from './ai/failures';
import { cleanAssistantText } from '../utils/assistantText';

/**
 * Terjemahan sebuah balasan asisten mentah menjadi bentuk siap pakai. Ketiga varian
 * punya `text` yang sama-sama boleh ditampilkan; `kind` hanya dipakai saat perilaku
 * pemanggil memang harus berbeda (membacakan suara, menandai galat, menandai kosong).
 *
 *   - `failure` — server mengirim pesan kegagalannya sendiri; tampilkan apa adanya,
 *                 jangan dibacakan sebagai jawaban masakan.
 *   - `empty`   — tidak ada teks berguna; `text` berisi kalimat pengganti dari pemanggil.
 *   - `text`    — teks bersih siap ditampilkan (chat) atau dibacakan (suara).
 */
export type AssistantReply =
  | { kind: 'failure'; text: string }
  | { kind: 'empty'; text: string }
  | { kind: 'text'; text: string };

/**
 * Membaca balasan asisten dan mengembalikan bentuknya yang sudah siap pakai.
 *
 * Ini SATU-SATUNYA tempat urutan "cek kegagalan server → bersihkan → tangani kosong"
 * hidup. Sebelumnya urutan itu disalin di tiap pemanggil (chat dan suara), sehingga
 * perbaikan di satu tempat tidak ikut terbawa ke tempat lain. Pemanggil cukup tahu
 * satu fungsi ini, bukan urutan langkah di dalamnya.
 *
 * `maxWords` membatasi panjang jawaban tampil/baca. `emptyMessage` (opsional) diisi
 * pemanggil supaya kalimat pengganti saat jawaban kosong sesuai konteksnya; bila
 * tidak diisi, jawaban kosong dikembalikan sebagai `kind: 'text'` dengan teks kosong
 * (berguna saat streaming, ketika kekosongan sementara itu wajar).
 */
export function readAssistantReply(
  raw: string,
  options?: { maxWords?: number; emptyMessage?: string },
): AssistantReply {
  // Model di sisi server kadang mengirim kegagalannya sendiri sebagai "jawaban"
  // (mis. "Server AI gagal merespons: Error code: 503 …"). Jangan pernah biarkan itu
  // lolos jadi balon jawaban atau dibacakan sebagai resep.
  const failure = serverFailureText(raw);
  if (failure) return { kind: 'failure', text: failure };

  const text = cleanAssistantText(raw, { maxWords: options?.maxWords });
  if (!text.trim() && options?.emptyMessage) {
    return { kind: 'empty', text: options.emptyMessage };
  }
  return { kind: 'text', text };
}
