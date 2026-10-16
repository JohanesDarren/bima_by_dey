/**
 * Taksonomi kegagalan layanan AI — jenis error + cara menerjemahkan balasan
 * mentah yang ternyata pesan kegagalan model di sisi server.
 *
 * Kenapa terpisah: dulu semua ini menumpang di satu berkas besar bersama jaringan
 * dan parsing JSON. Pemanggil yang cuma ingin tahu "apakah balasan ini kegagalan
 * server?" harus menyeret seluruh transport. Sekarang pertanyaan itu punya module
 * sendiri yang bisa diuji tanpa jaringan.
 */

/** Klasifikasi error sederhana untuk chat store. */
export class KroomboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KroomboxError';
  }
}

/**
 * Permintaan berhenti karena server tidak mengirim data (idle) atau tidak kunjung
 * lengkap (total). Dipisahkan dari KroomboxError biasa supaya pemanggil bisa
 * memutus rantai percobaan otomatis: mengulang saat server macet cuma membuang waktu
 * pengguna, bukan menambah peluang berhasil.
 */
export class KroomboxTimeoutError extends KroomboxError {
  constructor(message: string) {
    super(message);
    this.name = 'KroomboxTimeoutError';
  }
}

/**
 * Kegagalan yang datang dari SISI SERVER: model AI milik server sendiri tumbang.
 *
 * Terverifikasi langsung dari stream (dicatat 2026-09-22): server mengirim
 *   {"delta": "Server AI gagal merespons: Error code: 503 - {'error': {'message':
 *   '[commandcode/xiaomi/mimo-v2.6-flash] [502]: fetch failed (cause: ETIMEDOUT)'}}
 * lalu langsung [DONE]. Mengulang permintaan saat ini tidak menolong dan hanya
 * membuat pengguna menunggu percobaan kedua yang juga gagal.
 */
export class ServerSideError extends KroomboxError {
  constructor(message: string) {
    super(message);
    this.name = 'ServerSideError';
  }
}

const SERVER_FAILURE =
  /(Server AI gagal merespons|Error code:\s*5\d\d|fetch failed|ETIMEDOUT|\b50[234]\b|timed out)/i;

/**
 * Mesin JS/HTTP kadang memberi pesan teknis berbahasa Inggris ("fetch failed",
 * "terminated", "ECONNRESET"). Bagi pengguna itu tidak berarti apa-apa — ganti dengan
 * kalimat Indonesia yang sama artinya. Pesan yang sudah berbahasa Indonesia dibiarkan.
 */
export function humanizeTransportReason(reason: string): string {
  if (/menunggu respons BIMA|BIMA terputus|layanan RAG/i.test(reason)) return reason;
  if (
    /fetch failed|terminated|socket|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timed out|timeout/i.test(
      reason,
    )
  ) {
    return 'Koneksi ke layanan RAG terputus di tengah jalan. Coba lagi.';
  }
  return reason;
}

/**
 * Kalau balasan server sebenarnya pesan kegagalan modelnya sendiri, kembalikan kalimat
 * yang bisa ditampilkan ke pengguna (dengan kode kesalahan). Selain itu null.
 */
export function serverFailureText(raw: string): string | null {
  if (!SERVER_FAILURE.test(raw)) return null;
  const code = raw.match(/\b(50[234])\b/)?.[1];
  return code
    ? `Server AI gagal merespons (kode ${code} dari model di sisi server). Coba lagi beberapa menit lagi.`
    : 'Server AI gagal merespons. Coba lagi beberapa menit lagi.';
}
