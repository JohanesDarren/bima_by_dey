/**
 * Satu penerjemah galat: SETIAP jenis kegagalan layanan → satu kalimat Indonesia
 * yang siap ditampilkan.
 *
 * Dulu kalimat galat ditulis di banyak tempat sekaligus — module giliran percakapan,
 * sesi resep, store menu, layar chat, dan hook suara masing-masing menyusun teksnya
 * sendiri. Akibatnya kegagalan yang sama berbunyi beda tergantung di mana ia muncul,
 * dan memperbaiki satu kalimat tidak ikut terbawa ke tempat lain. Sekarang pemetaannya
 * hidup di sini SATU kali; tiap pemanggil cukup menyebut konteksnya (chat/suara/
 * menu/resep) untuk memilih kalimat pengganti saat jenis galatnya tak dikenali.
 *
 * Module ini murni: tidak menyentuh jaringan. Ia hanya membaca jenis error dan
 * mengembalikan teks, jadi seluruh tabel pemetaannya bisa diuji tanpa server.
 */
import { CircuitOpenError } from './breaker';
import { KroomboxError, KroomboxTimeoutError, ServerSideError } from './ai/failures';
import { NO_NEW_MENU_MESSAGE } from '../constants';

/** Konteks tampilan; menentukan kalimat pengganti saat jenis galat tak dikenali. */
export type ErrorContext = 'chat' | 'voice' | 'menu' | 'recipe';

/**
 * Galat yang pesannya SUDAH ditulis untuk pengguna (mis. panduan validasi, atau
 * hasil domain seperti "resep tidak terbaca"). Ditandai eksplisit — bukan ditebak
 * dari isi teksnya — supaya `describeError` tahu pesan ini tak perlu diganti.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** Kalimat tetap untuk tiap jenis kegagalan layanan yang dikenali. */
export const TIMEOUT_SENTENCE = 'Layanan tidak mengirim data terlalu lama. Coba lagi.';
export const CIRCUIT_SENTENCE = 'Layanan AI sedang bermasalah. Tunggu sebentar, lalu coba lagi.';
export const NETWORK_SENTENCE = 'Koneksi terputus. Coba lagi.';
export const SERVER_SENTENCE = 'Server AI gagal merespons. Coba lagi beberapa menit lagi.';

/**
 * Kalimat yang dipilih lapisan transport dari fakta runtime (kode HTTP, alasan
 * koneksi ditutup). Tetap tinggal di sini supaya SETIAP kalimat yang dibaca pengguna
 * punya satu sumber — transport cuma memilih, bukan mengarang teksnya.
 */
export const TRANSPORT_DROP_SENTENCE =
  'Koneksi ke layanan RAG terputus di tengah jalan. Coba lagi.';
export const NETWORK_DROP_SENTENCE = 'Koneksi ke layanan RAG terputus. Coba lagi.';
export const BIMA_DROP_SENTENCE = 'Koneksi ke BIMA terputus.';
export const BIMA_TIMEOUT_SENTENCE = 'Timeout menunggu respons BIMA.';
export const EMPTY_REPLY_SENTENCE = 'Layanan RAG mengembalikan jawaban kosong. Coba lagi.';
export const START_FAILED_SENTENCE = 'Layanan RAG gagal dimulai.';
/** Ditampilkan layar resep saat tak ada resep yang bisa dibaca (bukan galat berkelas). */
export const RECIPE_UNAVAILABLE_SENTENCE =
  'Layanan sedang tidak mengirim resep yang bisa dibaca. Coba lagi.';

/** Kalimat kegagalan HTTP dari server (kode status disebut supaya sebabnya terlihat). */
export function httpFailureText(status: number): string {
  return `Layanan RAG sedang bermasalah (HTTP ${status}).`;
}

/**
 * Kalimat pengganti saat galat tidak masuk jenis yang dikenali. Sengaja BEDA per
 * konteks: pengguna chat menunggu balon jawaban, pengguna menu menunggu daftar, dst.
 */
const CONTEXT_FALLBACK: Record<ErrorContext, string> = {
  chat: NETWORK_SENTENCE,
  voice: NETWORK_SENTENCE,
  menu: NO_NEW_MENU_MESSAGE,
  recipe: 'Layanan resep tidak merespons. Coba lagi sebentar lagi.',
};

/**
 * Kalimat tetap untuk galat berkelas kita, atau `null` bila jenisnya tak dikenali.
 * Urutan penting: turunan KroomboxError diperiksa sebelum induknya.
 */
function fixedSentence(error: Error): string | null {
  if (error instanceof UserFacingError) return error.message.trim() || null;
  if (error instanceof CircuitOpenError) return CIRCUIT_SENTENCE;
  if (error instanceof KroomboxTimeoutError) return TIMEOUT_SENTENCE;
  if (error instanceof ServerSideError) return SERVER_SENTENCE;
  if (error instanceof KroomboxError) return NETWORK_SENTENCE;
  return null;
}

/**
 * Terjemahkan sebuah galat menjadi kalimat siap tampil untuk sebuah konteks.
 *
 * Galat berkelas kita sudah membawa kalimat Indonesia yang jujur (kadang lebih
 * spesifik, mis. \"(HTTP 502)\") — pakai pesannya apa adanya; kalau pesannya kosong,
 * pakai kalimat tetap jenisnya. Galat asing (termasuk bukan Error) tak punya kalimat
 * yang layak dibaca pengguna, jadi jatuh ke kalimat pengganti konteksnya.
 */
export function describeError(error: unknown, context: ErrorContext): string {
  const fallback = CONTEXT_FALLBACK[context];
  if (!(error instanceof Error)) return fallback;
  const fixed = fixedSentence(error);
  if (!fixed) return fallback;
  return error.message.trim() || fixed;
}

const SERVER_FAILURE =
  /(Server AI gagal merespons|Error code:\s*5\d\d|fetch failed|ETIMEDOUT|\b50[234]\b|timed out)/i;

/**
 * Kalau balasan server sebenarnya pesan kegagalan modelnya sendiri, kembalikan kalimat
 * yang bisa ditampilkan ke pengguna (dengan kode kesalahan). Selain itu `null`.
 *
 * Terverifikasi langsung dari stream (dicatat 2026-09-22): server mengirim
 *   {\"delta\": \"Server AI gagal merespons: Error code: 503 - {'error': {'message':
 *   '[commandcode/xiaomi/mimo-v2.6-flash] [502]: fetch failed (cause: ETIMEDOUT)'}}\"}
 * lalu langsung [DONE].
 */
export function serverFailureText(raw: string): string | null {
  if (!SERVER_FAILURE.test(raw)) return null;
  const code = raw.match(/\b(50[234])\b/)?.[1];
  return code
    ? `Server AI gagal merespons (kode ${code} dari model di sisi server). Coba lagi beberapa menit lagi.`
    : SERVER_SENTENCE;
}

/**
 * Mesin JS/HTTP kadang memberi pesan teknis berbahasa Inggris (\"fetch failed\",
 * \"terminated\", \"ECONNRESET\"). Bagi pengguna itu tidak berarti apa-apa — ganti dengan
 * kalimat Indonesia yang sama artinya. Pesan yang sudah berbahasa Indonesia dibiarkan.
 */
export function humanizeTransportReason(reason: string): string {
  if (/menunggu respons BIMA|BIMA terputus|layanan RAG/i.test(reason)) return reason;
  if (
    /fetch failed|terminated|socket|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timed out|timeout/i.test(
      reason,
    )
  ) {
    return TRANSPORT_DROP_SENTENCE;
  }
  return reason;
}
