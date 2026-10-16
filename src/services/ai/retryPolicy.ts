import { CircuitOpenError } from '../breaker';
import { KroomboxTimeoutError, ServerSideError } from './failures';

/**
 * Kebijakan "kapan berhenti mengulang saat server macet" — SATU tempat.
 *
 * Sebagian kegagalan tidak layak diulang: mengulangnya cuma menambah ~1 menit tunggu
 * per putaran tanpa menambah peluang berhasil (terukur: server yang macet tetap 0
 * token pada percobaan berikutnya). Yang termasuk:
 *   - ServerSideError        → model di sisi server sendiri tumbang.
 *   - KroomboxTimeoutError   → server diam terlalu lama (idle) / tidak kunjung lengkap.
 *   - CircuitOpenError       → pemutus arus sedang terbuka; permintaan ditahan sebelum dikirim.
 *
 * Dulu daftar ini ditulis langsung di dalam gelung percobaan layanan menu; sekarang
 * dipusatkan di sini supaya setiap call-site memakai pertanyaan yang sama, dan supaya
 * kebijakannya bisa diuji sebagai tabel (jenis galat masuk → boleh diulang? keluar).
 */
export function isFatalFailure(error: unknown): boolean {
  return (
    error instanceof ServerSideError ||
    error instanceof KroomboxTimeoutError ||
    error instanceof CircuitOpenError
  );
}
