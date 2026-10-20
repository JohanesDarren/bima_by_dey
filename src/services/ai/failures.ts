/**
 * Taksonomi kegagalan layanan AI — jenis error saja.
 *
 * Kenapa terpisah: dulu semua ini menumpang di satu berkas besar bersama jaringan
 * dan parsing JSON. Pemanggil yang cuma ingin tahu "apakah balasan ini kegagalan
 * server?" harus menyeret seluruh transport. Sekarang pertanyaan itu punya module
 * sendiri yang bisa diuji tanpa jaringan.
 *
 * Penerjemahan jenis galat menjadi kalimat siap tampil TIDAK di sini — semuanya
 * berkumpul di `services/errors` supaya cuma ada satu tempat yang memutuskan apa yang
 * dibaca pengguna.
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
