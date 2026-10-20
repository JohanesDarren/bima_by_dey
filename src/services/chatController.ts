import type { ChatMessage } from '../types';
import type { TurnRunner } from './ai/conversationTurn';
import { describeError } from './errors';
import { CHAT_MAX_WORDS } from '../utils/assistantText';
import { buildChefHistory, buildChefMessage } from '../prompts/chefPrompt';

/**
 * Controller panel chat: pemilik TUNGGAL percakapan teks — daftar pesan, kolom tulis,
 * status mengirim, pembacaan jawaban (TTS), dan pengelolaan riwayat.
 *
 * Kenapa jadi module sendiri: dulu semua ini bercampur dengan JSX di satu komponen
 * 560 baris, jadi alur kirim → terima balasan → bacakan hanya bisa diuji dengan
 * merender UI. Komponen `AICompanion` kini murni tampilan; ia hanya membaca state di
 * sini dan memanggil aksinya.
 *
 * Giliran percakapan (`runTurn`) dan pembaca suara (`speech`) DISUNTIKKAN — sama seperti
 * stream pada module giliran percakapan. Karena itu seluruh alur bisa diuji dengan
 * giliran palsu, tanpa jaringan dan tanpa merender apa pun. Hook
 * `hooks/useChatController` yang menyuntikkan yang asli.
 */

/** Kuota token keluaran (dari upstream). 250 ≈ 3x batas kata kita: longgar untuk jawaban
 *  benar, hanya memotong yang berlarut. */
const CHAT_MAX_TOKENS = 250;

export interface ChatState {
  messages: ChatMessage[];
  /** Isi kolom tulis. */
  input: string;
  /** Ada giliran yang sedang berjalan. */
  streaming: boolean;
  /** Jawaban dibacakan otomatis. */
  autoSpeak: boolean;
  /** Pertanyaan terakhir yang terkirim — untuk tombol "Ulangi". */
  lastQuestion: string;
}

export interface ChatSpeech {
  speak(text: string): void;
  stop(): void;
}

export interface ChatControllerDeps {
  runTurn: TurnRunner;
  speech: ChatSpeech;
  /** Konteks resep yang dibaca SAAT kirim (bisa berubah antar render). */
  getContext: () => string;
  /** Dipanggil dengan teks jawaban yang sukses (status `ok`). */
  onAssistantMessage?: (text: string) => void;
  autoSpeak: boolean;
}

export interface ChatController {
  getState(): ChatState;
  /** Langganan perubahan state; mengembalikan fungsi berhenti berlangganan. */
  subscribe(listener: () => void): () => void;
  setInput(text: string): void;
  /** Kirim `overrideText`, atau isi kolom tulis bila kosong. Diabaikan saat sedang mengirim. */
  send(overrideText?: string): void;
  /** Hentikan giliran yang berjalan (tombol berhenti). */
  stop(): void;
  toggleAutoSpeak(): void;
  /** Bersihkan saat panel dilepas: tutup giliran dan hentikan suara. */
  dispose(): void;
}

export function createChatController(deps: ChatControllerDeps): ChatController {
  let state: ChatState = {
    messages: [],
    input: '',
    streaming: false,
    autoSpeak: deps.autoSpeak,
    lastQuestion: '',
  };
  let current: { close: () => void } | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<ChatState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  /** Salinan pesan dengan isi balon asisten terakhir diganti (tanpa notifikasi). */
  const withLastAssistant = (content: string): ChatMessage[] => {
    const next = [...state.messages];
    const last = next[next.length - 1];
    if (last?.role === 'assistant') next[next.length - 1] = { ...last, content };
    return next;
  };

  const speak = (text: string) => {
    deps.speech.stop();
    deps.speech.speak(text.replace(/[*#_`]/g, ''));
  };

  const send = (overrideText?: string) => {
    const text = (overrideText ?? state.input).trim();
    if (!text || state.streaming) return;

    // Dibaca SAAT kirim, seperti dulu: mematikan suara di tengah jawaban tidak
    // membisukan jawaban yang sudah berjalan.
    const speakReply = state.autoSpeak;
    // Riwayat dibangun dari pesan SEBELUM giliran ini ditambahkan.
    const history = buildChefHistory(state.messages);
    set({
      lastQuestion: text,
      input: '',
      streaming: true,
      messages: [
        ...state.messages,
        { role: 'user', content: text },
        { role: 'assistant', content: '' },
      ],
    });

    // Urutan satu giliran (kirim → kumpulkan → baca balasan → galat → riwayat) hidup
    // di module giliran percakapan; controller ini hanya mengurus percakapannya.
    const turn = deps.runTurn(
      {
        // Susunan pesan (persona + konteks + aturan dasar + pertanyaan di ujung)
        // ada di chefPrompt.ts supaya aturannya satu tempat.
        prompt: buildChefMessage(deps.getContext(), text),
        question: text,
        // Riwayat percakapan ikut dikirim supaya pertanyaan lanjutan nyambung.
        history,
        maxTokens: CHAT_MAX_TOKENS,
        maxWords: CHAT_MAX_WORDS,
      },
      // Balon terisi selagi token mengalir. Module giliran sudah menyaring pesan
      // kegagalan server, jadi balon tidak pernah menampilkan teks teknis "Error code: 503 …".
      { onPartial: (text) => set({ messages: withLastAssistant(text) }) },
    );
    current = { close: turn.close };

    // Tiap hasil ditulis dengan SATU `set` (status mengirim + balon sekaligus), supaya
    // tampilan tak sempat merender status "selesai" dengan balon yang masih basi.
    turn.result.then(
      (out) => {
        current = null;
        if (out.status === 'error') {
          // Buang balon asisten yang masih kosong, lalu sisipkan kalimat galatnya.
          const next = [...state.messages];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && !last.content) next.pop();
          set({ streaming: false, messages: [...next, { role: 'assistant', content: out.text }] });
          return;
        }
        // `ok` / `empty` / `failure`: satu balon dengan teks siap tampil dari module.
        set({ streaming: false, messages: withLastAssistant(out.text) });
        if (out.status !== 'ok') return;
        if (speakReply) speak(out.text);
        deps.onAssistantMessage?.(out.text);
      },
      // Jaring pengaman: kalau janji giliran ditolak (mis. bug di module), jangan
      // biarkan panel tersangkut di status "mengirim" selamanya.
      (error: unknown) => {
        current = null;
        set({ streaming: false, messages: withLastAssistant(describeError(error, 'chat')) });
      },
    );
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setInput: (text) => set({ input: text }),
    send,
    stop: () => {
      current?.close();
      current = null;
      set({ streaming: false });
    },
    toggleAutoSpeak: () => {
      if (state.autoSpeak) deps.speech.stop();
      set({ autoSpeak: !state.autoSpeak });
    },
    dispose: () => {
      current?.close();
      current = null;
      deps.speech.stop();
    },
  };
}
