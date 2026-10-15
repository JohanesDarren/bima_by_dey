/**
 * Pemutus arus (circuit breaker) untuk layanan AI di sisi server.
 *
 * MASALAH YANG DIPECAHKAN
 * Setelah timeout & retry dirapikan, satu permintaan gagal cepat (60 detik). Tapi
 * kalau server sedang macet, SETIAP permintaan berikutnya tetap ikut menunggu 60
 * detik penuh lalu gagal — dan tetap menghajar server yang sudah kepayahan. Lima
 * tap = 5 × 60 detik terbuang + 5 beban tambahan ke server yang sedang tumbang.
 *
 * CARA KERJA (mirip MCB di rumah)
 *   CLOSED    → normal, semua permintaan lewat sambil dihitung.
 *   OPEN      → pemutus melompat: permintaan TIDAK dikirim sama sekali, langsung
 *               gagal dalam milidetik. Ditahan selama `openMs`.
 *   HALF-OPEN → masa tes: HANYA SATU permintaan percobaan diizinkan lewat.
 *               Berhasil → kembali CLOSED. Gagal → OPEN lagi.
 *
 * Kelas ini sengaja TIDAK tahu soal jaringan maupun AI — ia cuma menghitung
 * hasil. Itu membuatnya mudah diuji dan dipakai ulang.
 */

/** Dilempar saat pemutus sedang OPEN: permintaan ditahan sebelum dikirim. */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export interface BreakerOptions {
  /** Jumlah gagal BERTURUT-TURUT sebelum melompat. Default 3. */
  failureThreshold?: number;
  /** Lama pemutus bertahan terbuka sebelum mencoba lagi (ms). Default 60 detik. */
  openMs?: number;
  /** Sumber waktu (bisa disuntik saat pengujian). Default Date.now. */
  now?: () => number;
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  /** true = satu permintaan percobaan (half-open) sedang berjalan. */
  private probeInFlight = false;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(options: BreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  getState(): BreakerState {
    return this.state;
  }

  /**
   * Bolehkah permintaan ini lewat?
   * Saat HALF-OPEN hanya SATU percobaan yang diizinkan — sisanya ditahan, supaya
   * masa tes tidak berubah jadi badai permintaan baru.
   */
  canPass(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.openMs) {
        this.state = 'half-open';
        this.probeInFlight = true;
        return true;
      }
      return false;
    }

    // half-open
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  /** Permintaan berhasil → kembali normal. */
  onSuccess(): void {
    this.state = 'closed';
    this.failures = 0;
    this.probeInFlight = false;
  }

  /** Permintaan gagal → tambah hitungan; lompat bila sudah cukup. */
  onFailure(): void {
    if (this.state === 'half-open') {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.trip();
  }

  /**
   * Permintaan dibatalkan oleh pengguna (tombol berhenti / panggilan ditutup) —
   * BUKAN kegagalan layanan. Lepaskan slot percobaan half-open supaya masa tes
   * tidak macet selamanya (kalau tidak, pemutus tak pernah bisa kembali CLOSED).
   */
  onAbort(): void {
    this.probeInFlight = false;
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = this.now();
    this.failures = 0;
    this.probeInFlight = false;
  }
}
