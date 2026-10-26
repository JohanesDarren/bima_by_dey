import type { Segment } from '../types';
import type { TurnRunner } from './ai/conversationTurn';
import { describeError } from './errors';
import { VOICE_MAX_WORDS } from '../utils/assistantText';
import { VOICE_PERSONA, VOICE_RULES } from '../prompts/chefPrompt';
import { judgeTranscript } from '../utils/voiceGate';
import { reduceVoiceCall, initialVoiceCallState } from './voiceCallMachine';
import type {
  MicPrepareOutcome,
  VoiceCallEffect,
  VoiceCallEvent,
  VoiceCallMode,
  VoiceCallState,
} from './voiceCallMachine';

/**
 * Pelaksana panggilan suara: memegang state dari reducer (`voiceCallMachine`) dan
 * menjalankan efek yang diminta reducer lewat sebuah PORT suara. Tidak ada keputusan
 * transisi di sini — setiap callback mikrofon/TTS/timer cuma mengubah dirinya jadi
 * peristiwa bernomor generasi lalu menyerahkannya ke reducer.
 *
 * Port (mikrofon + TTS), giliran percakapan, dan timer DISUNTIKKAN, jadi seluruh alur
 * bisa diuji tanpa perangkat bersuara. `hooks/useVoiceCall` menyuntikkan yang asli
 * (`voiceDevicePort`).
 */

/** Penerima peristiwa dari pendengar mikrofon yang sedang menyala. */
export interface MicSink {
  onResult(result: { text: string; isFinal: boolean; confidence?: number }): void;
  onError(error: { code: string; message: string }): void;
  /** Pendengar berhenti sendiri (diam terlalu lama, selesai satu kalimat, dll). */
  onEnd(): void;
}

/**
 * Satu-satunya jalan ke perangkat bersuara. Penyiapan dan penyalaan mikrofon sengaja
 * dipisah: di antara keduanya reducer memutuskan apakah panggilan MASIH berlaku, jadi
 * adapter tak perlu tahu soal generasi — dan mikrofon tak pernah menyala untuk panggilan
 * yang sudah ditutup.
 */
export interface VoicePort {
  /** Muat modul pengenal ucapan + minta izin. Menyingkirkan pendengar lama. Boleh melempar. */
  prepareMic(): Promise<MicPrepareOutcome>;
  /** Pasang pendengar ke `sink` dan nyalakan mikrofon. Boleh melempar. */
  startMic(sink: MicSink): void;
  /** Hentikan mikrofon dengan hasil yang sudah ada. */
  finishMic(): void;
  /** Batalkan mikrofon dan lepas pendengarnya. Tidak boleh melempar. */
  abortMic(): void;
  /** Bacakan `text`; panggil `onSettled` saat selesai ATAU gagal. */
  speak(text: string, onSettled: () => void): void;
  stopSpeaking(): void;
}

export interface VoiceCallContext {
  segment: Segment;
  recipeName?: string;
  stepLabel?: string;
  recipeIngredients?: string;
  /** Daftar SEMUA langkah bernomor; dipakai menjawab "langkah nomor N apa?". */
  stepsDigest?: string;
}

export interface VoiceCallDeps {
  port: VoicePort;
  runTurn: TurnRunner;
  /** Konteks resep yang dibaca SAAT bertanya (bisa berubah antar render). */
  getContext: () => VoiceCallContext;
  /** Jadwalkan `fn` setelah `delayMs`; mengembalikan fungsi pembatal. Bawaan: setTimeout. */
  schedule?: (fn: () => void, delayMs: number) => () => void;
  /** Catatan teknis (bukan untuk pengguna). Bawaan: console.warn. */
  warn?: (message: string, error?: unknown) => void;
  /** Cara mikrofon dikendalikan. Bawaan: 'auto' (mikrofon menyala terus). */
  mode?: VoiceCallMode;
}

export interface VoiceCall {
  getState(): VoiceCallState;
  /** Langganan perubahan state; mengembalikan fungsi berhenti berlangganan. */
  subscribe(listener: () => void): () => void;
  /** Mulai (atau mulai ulang) panggilan: nyalakan mikrofon. */
  start(): void;
  /** Mode push: tombol DITEKAN — mulai merekam. Diabaikan pada mode auto. */
  pressStart(): void;
  /** Mode push: tombol DILEPAS — akhiri rekaman dan proses pertanyaannya. */
  pressEnd(): void;
  /**
   * Akhiri panggilan. `keepHistory` dipakai tombol MATIKAN MIKROFON: mute lalu
   * nyalakan lagi tidak boleh menghapus memori percakapan.
   */
  stop(options?: { keepHistory?: boolean }): void;
  /** Tutup panggilan saat komponen dilepas: matikan mikrofon, suara, dan giliran. */
  dispose(): void;
}

/** Kuota token keluaran (dari upstream); 150 ≈ 3x batas 25 kata. */
const VOICE_MAX_TOKENS = 150;

const defaultSchedule = (fn: () => void, delayMs: number) => {
  const timer = setTimeout(fn, delayMs);
  return () => clearTimeout(timer);
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Gagal memulai mikrofon.';

function buildPrompt(context: VoiceCallContext, question: string): string {
  return [
    VOICE_PERSONA,
    `Resep: ${context.recipeName || 'belum dipilih'}.`,
    `Bahan seluruh resep (bukan bahan satu langkah tertentu): ${context.recipeIngredients || 'belum tercatat'}.`,
    // Semua langkah dikirim bernomor: pengguna sering menyebut nomor langkah, dan
    // tanpa daftar ini jawaban hanya bisa diambil dari langkah yang sedang terbuka.
    context.stepsDigest ? `Daftar langkah:\n${context.stepsDigest}` : '',
    // Dikutip dan ditandai tegas supaya model tidak mengganti bahannya dengan bahan
    // lain dari daftar di atas (penyebab jawaban "rebus dada ayam" untuk langkah
    // yang sebenarnya berbunyi "rebus beras sorgum").
    `Isi langkah aktif (KUTIPAN RESEP, jangan diubah atau diganti bahannya): "${context.stepLabel || 'tidak ada'}"`,
    `Profil: ${context.segment.ageGroup || 'umum'}, ${context.segment.condition || 'umum'}.`,
    // Aturan dasar versi upstream apa adanya + tambahan kita, disimpan di
    // chefPrompt.ts supaya bentuk jawaban Chef dan suara tidak berkelahi.
    ...VOICE_RULES,
    // Pertanyaan di ujung (bukan di tengah): aturan yang menumpuk SETELAH
    // pertanyaan membuat jawaban suara melenceng dari yang ditanya.
    `Pertanyaan: ${question}`,
  ].join('\n');
}

export function createVoiceCall(deps: VoiceCallDeps): VoiceCall {
  const { port } = deps;
  const schedule = deps.schedule ?? defaultSchedule;
  const warn = deps.warn ?? ((message, error) => console.warn(message, error));

  let state = initialVoiceCallState(deps.mode ?? 'auto');
  let turn: { close: () => void } | null = null;
  let cancelRestart: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const dispatch = (event: VoiceCallEvent) => {
    const step = reduceVoiceCall(state, event);
    if (step.state !== state) {
      state = step.state;
      listeners.forEach((listener) => listener());
    }
    step.effects.forEach(run);
  };

  const run = (effect: VoiceCallEffect) => {
    switch (effect.type) {
      case 'prepare-mic':
        port.prepareMic().then(
          (outcome) => dispatch({ type: 'mic-prepared', generation: effect.generation, outcome }),
          (error: unknown) => {
            warn('[voiceCall] Could not prepare microphone', error);
            dispatch({
              type: 'mic-start-failed',
              generation: effect.generation,
              message: messageOf(error),
            });
          },
        );
        return;

      case 'start-mic':
        try {
          port.startMic({
            onResult: ({ text, isFinal, confidence }) => {
              // Mode bebas-tangan: mikrofon menyala sendiri, jadi hasil pengenal
              // disaring dulu. Kebisingan dapur ("eh", "ya", salah dengar pendek)
              // dibuang tanpa suara supaya tidak memicu jawaban yang tidak diminta.
              if (isFinal && state.mode === 'handsfree') {
                const verdict = judgeTranscript(text, confidence ?? -1);
                if (!verdict.accept) return;
              }
              dispatch({ type: 'heard', generation: effect.generation, text, isFinal });
            },
            onError: ({ code, message }) =>
              dispatch({ type: 'mic-error', generation: effect.generation, code, message }),
            onEnd: () => dispatch({ type: 'mic-ended', generation: effect.generation }),
          });
        } catch (error: unknown) {
          warn('[voiceCall] Could not start microphone', error);
          dispatch({
            type: 'mic-start-failed',
            generation: effect.generation,
            message: messageOf(error),
          });
        }
        return;

      case 'finish-mic':
        port.finishMic();
        return;

      case 'abort-mic':
        port.abortMic();
        return;

      case 'run-turn': {
        const { generation } = effect;
        // Urutan satu giliran hidup di module giliran percakapan; di sini hanya
        // menyusun permintaan dan meneruskan hasilnya ke reducer.
        const running = deps.runTurn(
          {
            prompt: buildPrompt(deps.getContext(), effect.question),
            question: effect.question,
            // Riwayat percakapan ikut dikirim supaya pertanyaan lanjutan nyambung.
            history: effect.history,
            maxTokens: VOICE_MAX_TOKENS,
            maxWords: VOICE_MAX_WORDS,
          },
          {
            // Catat sebab teknisnya (server ini sering macet) tanpa mengubah kalimat
            // yang dilihat pengguna.
            onStreamError: (error) => warn('[voiceCall] AI stream failed', error),
          },
        );
        turn = running;
        const settle = () => {
          if (turn === running) turn = null;
        };
        running.result.then(
          (result) => {
            settle();
            dispatch({ type: 'turn-settled', generation, result });
          },
          // Jaring pengaman: jangan biarkan panggilan tersangkut di status "berpikir".
          (error: unknown) => {
            settle();
            dispatch({ type: 'turn-crashed', generation, message: describeError(error, 'voice') });
          },
        );
        return;
      }

      case 'close-turn':
        turn?.close();
        turn = null;
        return;

      case 'speak':
        port.speak(effect.text, () => dispatch({ type: 'spoken', generation: effect.generation }));
        return;

      case 'stop-speaking':
        port.stopSpeaking();
        return;

      case 'schedule-restart':
        cancelRestart?.();
        cancelRestart = schedule(() => {
          cancelRestart = null;
          dispatch({ type: 'restart-due', generation: effect.generation });
        }, effect.delayMs);
        return;

      case 'cancel-restart':
        cancelRestart?.();
        cancelRestart = null;
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => dispatch({ type: 'start' }),
    pressStart: () => dispatch({ type: 'press-start', generation: state.generation }),
    pressEnd: () => dispatch({ type: 'press-end', generation: state.generation }),
    stop: (options) => dispatch({ type: 'stop', keepHistory: options?.keepHistory }),
    // Sengaja tak mematikan controller selamanya: React StrictMode (dev) menjalankan
    // cleanup lalu memasang ulang efek pada instance yang sama.
    dispose: () => dispatch({ type: 'stop', keepHistory: true }),
  };
}
