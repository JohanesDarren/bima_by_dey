import type { HistoryEntry } from './ai/types';
import type { TurnResult } from './ai/conversationTurn';
import { HISTORY_LIMIT } from '../prompts/chefPrompt';

/**
 * State machine panggilan suara: SATU reducer murni yang menentukan semua transisi
 * (menganggur → mendengar → berpikir → bicara → galat) dan efek apa yang harus
 * dijalankan setelahnya.
 *
 * Kenapa begini: dulu siklus panggilan tersebar di belasan ref (`activeRef`,
 * `processingRef`, `callGenerationRef`, `streamRef`, timer mulai-ulang …) yang diubah
 * dari banyak callback mikrofon/TTS. Setiap callback harus ingat sendiri mengecek
 * "apakah panggilan ini masih berlaku" — dan satu yang lupa menghidupkan mikrofon lagi
 * sesudah panggilan ditutup. Kini setiap peristiwa membawa nomor GENERASI panggilan
 * asalnya, dan `isLive` di bawah menolak peristiwa dari generasi lama di SATU tempat.
 *
 * Reducer ini tidak menyentuh mikrofon, TTS, jaringan, maupun timer: ia hanya
 * mengembalikan daftar `VoiceCallEffect` yang dijalankan `services/voiceCall` lewat
 * sebuah port. Karena itu seluruh urutannya bisa diuji tanpa perangkat bersuara.
 */

export type VoiceCallPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceCallState {
  phase: VoiceCallPhase;
  /** Pesan galat untuk ditampilkan saat `phase === 'error'`. */
  errorMsg: string | null;
  /** Panggilan sedang berjalan (dari `start` sampai `stop`). */
  active: boolean;
  /** Ada kalimat yang sedang diproses/dibacakan; mikrofon tak boleh dinyalakan lagi. */
  processing: boolean;
  /**
   * Nomor panggilan. Naik setiap `start`/`stop`; peristiwa dari generasi lain dibuang.
   */
  generation: number;
  /** Riwayat percakapan suara (dikirim ke API supaya lanjutan nyambung). */
  history: HistoryEntry[];
}

/** Hasil menyiapkan mikrofon (memuat modul + meminta izin). */
export type MicPrepareOutcome = 'ready' | 'unavailable' | 'denied';

export type VoiceCallEvent =
  | { type: 'start' }
  /** `keepHistory`: tombol MATIKAN MIKROFON — mute lalu nyalakan lagi tidak boleh menghapus memori. */
  | { type: 'stop'; keepHistory?: boolean }
  | { type: 'mic-prepared'; generation: number; outcome: MicPrepareOutcome }
  | { type: 'mic-start-failed'; generation: number; message: string }
  | { type: 'heard'; generation: number; text: string; isFinal: boolean }
  | { type: 'mic-error'; generation: number; code: string; message: string }
  | { type: 'mic-ended'; generation: number }
  | { type: 'restart-due'; generation: number }
  | { type: 'turn-settled'; generation: number; result: TurnResult }
  | { type: 'turn-crashed'; generation: number; message: string }
  /** Pembacaan jawaban selesai (atau gagal) — saatnya mendengar lagi. */
  | { type: 'spoken'; generation: number };

export type VoiceCallEffect =
  | { type: 'prepare-mic'; generation: number }
  | { type: 'start-mic'; generation: number }
  /** Hentikan pendengar dengan hasil yang sudah ada (bukan membatalkan). */
  | { type: 'finish-mic' }
  | { type: 'abort-mic' }
  | { type: 'run-turn'; generation: number; question: string; history: HistoryEntry[] }
  | { type: 'close-turn' }
  | { type: 'speak'; generation: number; text: string }
  | { type: 'stop-speaking' }
  | { type: 'schedule-restart'; generation: number; delayMs: number }
  | { type: 'cancel-restart' };

export interface VoiceCallStep {
  state: VoiceCallState;
  effects: VoiceCallEffect[];
}

/** Jeda sebelum mendengar lagi setelah pendengar berakhir sendiri. */
const RESTART_DELAY_MS = 500;

/** Kode galat pengenal ucapan yang bukan kegagalan (diam / dibatalkan sendiri). */
const BENIGN_MIC_ERRORS = new Set(['aborted', 'speech-timeout', 'no-speech']);

export const MIC_UNAVAILABLE_MESSAGE = 'Fitur suara tidak tersedia di perangkat ini.';
export const MIC_DENIED_MESSAGE = 'Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP.';

export function initialVoiceCallState(): VoiceCallState {
  return {
    phase: 'idle',
    errorMsg: null,
    active: false,
    processing: false,
    generation: 0,
    history: [],
  };
}

/**
 * Peristiwa berlaku hanya bila panggilan masih aktif DAN berasal dari generasi sekarang.
 * Inilah satu-satunya kasus yang menutup kelas bug "pendengar lama menyalakan ulang
 * mikrofon sesudah panggilan ditutup".
 */
function isLive(state: VoiceCallState, generation: number): boolean {
  return state.active && generation === state.generation;
}

const unchanged = (state: VoiceCallState): VoiceCallStep => ({ state, effects: [] });

const fail = (state: VoiceCallState, errorMsg: string, patch?: Partial<VoiceCallState>) => ({
  state: { ...state, ...patch, phase: 'error' as const, errorMsg },
  effects: [] as VoiceCallEffect[],
});

export function reduceVoiceCall(state: VoiceCallState, event: VoiceCallEvent): VoiceCallStep {
  switch (event.type) {
    case 'start': {
      const generation = state.generation + 1;
      return {
        state: { ...state, active: true, processing: false, generation },
        effects: [
          { type: 'cancel-restart' },
          // Mulai lagi saat panggilan masih jalan: giliran/suara generasi lama sudah
          // tak berlaku, jadi buang — kalau tidak, panggilan tersangkut "berpikir".
          ...(state.active
            ? ([{ type: 'close-turn' }, { type: 'stop-speaking' }] as VoiceCallEffect[])
            : []),
          { type: 'prepare-mic', generation },
        ],
      };
    }

    case 'stop':
      return {
        state: {
          ...state,
          phase: 'idle',
          active: false,
          processing: false,
          generation: state.generation + 1,
          history: event.keepHistory ? state.history : [],
        },
        effects: [
          { type: 'cancel-restart' },
          { type: 'close-turn' },
          { type: 'stop-speaking' },
          { type: 'abort-mic' },
        ],
      };

    case 'mic-prepared': {
      if (!isLive(state, event.generation)) return unchanged(state);
      if (event.outcome === 'unavailable') return fail(state, MIC_UNAVAILABLE_MESSAGE);
      if (event.outcome === 'denied') return fail(state, MIC_DENIED_MESSAGE);
      return {
        state: { ...state, phase: 'listening', errorMsg: null },
        effects: [{ type: 'start-mic', generation: event.generation }],
      };
    }

    case 'mic-start-failed':
      if (!isLive(state, event.generation)) return unchanged(state);
      return fail(state, event.message);

    case 'heard': {
      if (!isLive(state, event.generation)) return unchanged(state);
      const question = event.text.trim();
      // `processing`: jangan memproses kalimat yang sama dua kali kalau hasil final
      // datang beruntun sebelum pengolahan pertama selesai.
      if (!event.isFinal || !question || state.processing) return unchanged(state);
      return {
        state: { ...state, processing: true, phase: 'thinking', errorMsg: null },
        effects: [
          { type: 'finish-mic' },
          { type: 'run-turn', generation: event.generation, question, history: state.history },
        ],
      };
    }

    case 'mic-error':
      if (!isLive(state, event.generation) || BENIGN_MIC_ERRORS.has(event.code)) {
        return unchanged(state);
      }
      return fail(state, `Mikrofon terganggu: ${event.message || event.code}`);

    case 'mic-ended':
      if (!isLive(state, event.generation)) return unchanged(state);
      return {
        state,
        effects: [
          { type: 'schedule-restart', generation: event.generation, delayMs: RESTART_DELAY_MS },
        ],
      };

    case 'restart-due':
      if (!isLive(state, event.generation) || state.processing) return unchanged(state);
      return { state, effects: [{ type: 'prepare-mic', generation: event.generation }] };

    case 'turn-settled': {
      if (!isLive(state, event.generation)) return unchanged(state);
      const { result } = event;
      if (result.status !== 'ok') {
        // `empty`/`failure` (jawaban tak berguna) dan `error` (stream gagal) sama-sama
        // tampil sebagai galat suara — jangan dibacakan seolah-olah jawaban masakan.
        return fail(state, result.text, { processing: false });
      }
      return {
        state: {
          ...state,
          phase: 'speaking',
          // Simpan giliran ini supaya pertanyaan berikutnya masih nyambung.
          history: [...state.history, ...result.turn].slice(-HISTORY_LIMIT),
        },
        effects: [{ type: 'speak', generation: event.generation, text: result.text }],
      };
    }

    case 'turn-crashed':
      if (!isLive(state, event.generation)) return unchanged(state);
      return fail(state, event.message, { processing: false });

    case 'spoken':
      if (!isLive(state, event.generation)) return unchanged(state);
      return {
        state: { ...state, processing: false },
        effects: [{ type: 'prepare-mic', generation: event.generation }],
      };
  }
}
