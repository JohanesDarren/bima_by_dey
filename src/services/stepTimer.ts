/**
 * Timer hitung mundur satu langkah masak — MURNI (tanpa React, tanpa setInterval),
 * jadi seluruh perilakunya bisa diuji sebagai tabel (state + aksi → state).
 *
 * Kenapa reducer: dulu timer diatur dua efek yang saling bergantung. Pindah ke
 * langkah berikutnya mematikan interval lalu menyetel `running = true` — tapi kalau
 * timer sudah berjalan, nilainya tidak berubah, efek penggerak tidak jalan ulang,
 * dan hitung mundur langkah baru MACET. Di sini interval cukup menembak `tick`;
 * ganti langkah hanya mengganti angka, interval yang sama tetap berdetak.
 */

export interface StepTimerState {
  /** Sisa detik; `null` = langkah tanpa timer. */
  secondsLeft: number | null;
  running: boolean;
  /** Durasi penuh langkah ini (detik), untuk tombol ulang/reset. */
  durationSeconds: number | null;
}

export type StepTimerAction =
  /** Mulai langkah baru: timer langsung berjalan bila langkahnya punya durasi. */
  | { type: 'reset'; durationSeconds: number | null }
  /** Ulangi hitungan langkah ini dari awal. */
  | { type: 'restart' }
  /** Satu detik berlalu. */
  | { type: 'tick' }
  /** Jeda ↔ lanjut. */
  | { type: 'toggle' };

/** State awal untuk durasi langkah (menit; `null`/0 = tanpa timer). */
export function initialStepTimer(durationMinutes: number | null | undefined): StepTimerState {
  return startTimer(durationMinutes && durationMinutes > 0 ? durationMinutes * 60 : null);
}

function startTimer(durationSeconds: number | null): StepTimerState {
  if (durationSeconds === null || durationSeconds <= 0) {
    return { secondsLeft: null, running: false, durationSeconds: null };
  }
  return { secondsLeft: durationSeconds, running: true, durationSeconds };
}

export function stepTimerReducer(state: StepTimerState, action: StepTimerAction): StepTimerState {
  switch (action.type) {
    case 'reset':
      return startTimer(action.durationSeconds);
    case 'restart':
      // Langkah tanpa timer: tombolnya memang tidak tampil, abaikan saja.
      return state.durationSeconds === null ? state : startTimer(state.durationSeconds);
    case 'tick':
      if (!state.running || state.secondsLeft === null) return state;
      if (state.secondsLeft <= 1) return { ...state, secondsLeft: 0, running: false };
      return { ...state, secondsLeft: state.secondsLeft - 1 };
    case 'toggle':
      // Waktu habis / tanpa timer: tidak ada yang bisa dijeda atau dilanjutkan.
      if (state.secondsLeft === null || state.secondsLeft === 0) return state;
      return { ...state, running: !state.running };
    default:
      return state;
  }
}

/** "MM:SS" untuk tampilan timer. */
export function formatTimer(seconds: number): string {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${minutes}:${rest}`;
}
