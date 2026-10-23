/**
 * Satu giliran percakapan AI — satu jalur untuk chat teks & panggilan suara.
 *
 * URUTAN YANG DIMILIKI MODULE INI (dulu disalin di dua tempat, lalu saling menyimpang):
 *   kirim pesan → kumpulkan token → baca balasan (deteksi kegagalan server,
 *   bersihkan teks, tangani jawaban kosong) → petakan galat → hasilkan giliran riwayat.
 *
 * Chat teks dan panggilan suara kini cuma adapter di atas fungsi ini: mereka mengurus
 * tampilan (balon chat / suara), sedangkan urutan percakapannya hidup di sini. Akibatnya
 * pesan galat untuk kegagalan yang sama otomatis identik di kedua jalur.
 *
 * Stream DISUNTIKKAN sebagai dependensi (lihat StreamStarter) — module ini tidak pernah
 * membuka jaringan sendiri, jadi seluruh perilakunya bisa diuji tanpa server.
 */
import type { HistoryEntry, StreamHandlers, StreamRequest } from './types';
import { describeError } from '../errors';
import { readAssistantReply } from '../assistantReply';

/**
 * Kalimat pengganti saat server menutup koneksi tanpa satu pun teks berguna.
 * SATU konstanta untuk chat & suara — kalau tiap adapter menyuplai kalimatnya sendiri,
 * kegagalan yang sama berbunyi beda dan sumber kebenarannya kembali terbelah.
 */
const EMPTY_REPLY_MESSAGE = 'Layanan tidak mengirim jawaban. Coba kirim lagi.';

/**
 * Berapa kali satu giliran boleh dicoba ulang saat server mengirim pesan
 * kegagalannya sendiri.
 *
 * Kenapa perlu: kegagalan model di sisi server BERSIFAT SEMENTARA. Diukur
 * 2026-10-23 — tiga permintaan berturut-turut sukses dalam 3–12 detik, lalu
 * rentetan panjang juga sukses, sementara pengguna masih melihat "Server AI gagal
 * merespons" karena satu percobaan kebetulan kena jendela gagal. Satu percobaan
 * saja membuat gangguan sesaat terasa seperti kerusakan permanen.
 *
 * Kenapa tetap dibatasi: kalau server benar-benar sedang tumbang, mengulang
 * berkali-kali hanya menambah waktu tunggu tanpa menambah peluang berhasil.
 * Dua percobaan tambahan menangkap gangguan sekejap tanpa membuat pengguna
 * menunggu lama saat layanan benar-benar mati.
 */
const MAX_ATTEMPTS = 3;

/** Jeda sebelum percobaan berikutnya; berjenjang agar tidak menambah beban server. */
const RETRY_DELAY_MS = [400, 900];

export interface TurnRequest {
  /** Prompt lengkap (persona + konteks + aturan + pertanyaan) yang dikirim ke API. */
  prompt: string;
  /** Pertanyaan mentah pengguna — dipakai untuk mengisi giliran riwayat. */
  question: string;
  /** Riwayat percakapan sebelumnya, untuk konteks lanjutan. */
  history?: HistoryEntry[];
  /** Batas token keluaran untuk giliran ini. */
  maxTokens?: number;
  /** Batas panjang jawaban tampil/baca (dalam kata). */
  maxWords?: number;
}

export type TurnStatus = 'ok' | 'empty' | 'failure' | 'error';

export interface TurnResult {
  /**
   * `ok`      — jawaban bersih siap tampil/dibaca.
   * `empty`   — server menutup tanpa teks berguna; `text` berisi kalimat pengganti.
   * `failure` — server mengirim pesan kegagalannya sendiri; `text` jujur apa adanya.
   * `error`   — stream gagal; `text` kalimat galat yang siap tampil.
   */
  status: TurnStatus;
  /** Teks siap tampil/dibaca. */
  text: string;
  /** Giliran riwayat yang dihasilkan (teks mentah dari server); kosong saat `error`. */
  turn: HistoryEntry[];
}

export interface TurnObserver {
  /**
   * Teks bersih sementara saat token mengalir — dipakai chat untuk mengisi balon
   * selagi jawaban datang, walau server menyisipkan pesan kegagalannya di tengah.
   */
  onPartial?: (text: string) => void;
  /**
   * Galat stream mentah, sebelum diterjemahkan jadi kalimat tampil. Dipakai adapter
   * suara untuk mencatat sebab teknisnya (aplikasi ini sering menghadapi server yang
   * macet) tanpa mengubah kalimat yang dilihat pengguna.
   */
  onStreamError?: (error: Error) => void;
}

/** Mulai satu stream. Disuntikkan supaya module ini bisa diuji tanpa jaringan. */
export type StreamStarter = (
  request: StreamRequest,
  handlers: StreamHandlers,
) => { close: () => void };

/** Jalankan satu giliran. Bentuk sama dengan `runConversationTurn` dengan stream tertutup. */
export type TurnRunner = (
  request: TurnRequest,
  observer: TurnObserver,
) => { result: Promise<TurnResult>; close: () => void };

/**
 * Jalankan satu giliran percakapan. Mengembalikan `result` (janji hasil giliran) dan
 * `close` (batalkan giliran — tombol berhenti / panggilan ditutup).
 */
export function runConversationTurn(
  request: TurnRequest,
  startStream: StreamStarter,
  observer: TurnObserver = {},
): { result: Promise<TurnResult>; close: () => void } {
  let stream: { close: () => void } | null = null;
  let settled = false;
  let closedByCaller = false;

  const result = new Promise<TurnResult>((resolve) => {
    let raw = '';
    let attempt = 0;

    const finish = (value: TurnResult) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    /**
     * Satu percobaan. Kegagalan yang datang sebagai PESAN (bukan galat jaringan)
     * layak diulang — server hanya sesaat kehabisan model. Galat transport tidak
     * diulang di sini karena lapisan transport sudah punya kebijakan sendiri.
     */
    const attemptStream = () => {
      raw = '';
      attempt += 1;

      const handlers: StreamHandlers = {
        onToken: (delta) => {
          raw += delta;
          if (observer.onPartial) {
            // Teks bersih sementara: chat menampilkan balon yang jujur walau server
            // menyisipkan pesan kegagalannya di tengah jawaban.
            observer.onPartial(readAssistantReply(raw, { maxWords: request.maxWords }).text);
          }
        },
        onDone: () => {
          if (settled || closedByCaller) return;

          const reply = readAssistantReply(raw, { maxWords: request.maxWords });

          // Server mengirim pesan kegagalannya sendiri → coba lagi selama tersisa
          // jatah. Pengguna tidak perlu melihat gangguan sekejap.
          if (reply.kind === 'failure' && attempt < MAX_ATTEMPTS) {
            const delay = RETRY_DELAY_MS[Math.min(attempt - 1, RETRY_DELAY_MS.length - 1)];
            setTimeout(() => {
              if (!settled && !closedByCaller) attemptStream();
            }, delay);
            return;
          }

          const settledReply = readAssistantReply(raw, {
            maxWords: request.maxWords,
            emptyMessage: EMPTY_REPLY_MESSAGE,
          });
          // Riwayat memakai teks MENTAH dari server (bukan versi bersih): itu yang
          // sebenarnya dikatakan model, jadi konteks lanjutan tetap utuh.
          const turn: HistoryEntry[] = [
            { role: 'user', content: request.question },
            { role: 'assistant', content: raw },
          ];
          // `reply.kind` = 'text' → status 'ok'; sisanya ('empty'/'failure') sama.
          const status: TurnStatus = settledReply.kind === 'text' ? 'ok' : settledReply.kind;
          finish({ status, text: settledReply.text, turn });
        },
        onError: (error) => {
          observer.onStreamError?.(error);
          finish({ status: 'error', text: describeError(error, 'chat'), turn: [] });
        },
      };

      // startStream bisa MELEMPAR sinkron (mis. pustaka SSE gagal dibuat). Tanpa penjaga
      // ini, promise `result` ditolak — dan pemanggil yang cuma `.then()` tanpa `.catch`
      // akan menggantung di status "mengirim" selamanya. Perlakukan sama seperti galat
      // asinkron: satu hasil `error` yang bisa ditampilkan.
      try {
        stream = startStream(
          {
            message: request.prompt,
            history: request.history ?? [],
            maxTokens: request.maxTokens,
          },
          handlers,
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        observer.onStreamError?.(err);
        finish({ status: 'error', text: describeError(err, 'chat'), turn: [] });
      }
    };

    attemptStream();
  });

  return {
    result,
    close: () => {
      closedByCaller = true;
      stream?.close();
    },
  };
}
