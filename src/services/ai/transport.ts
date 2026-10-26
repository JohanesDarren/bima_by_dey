import EventSource from 'react-native-sse';
import {
  KROOMBOX_API_KEY,
  KROOMBOX_BASE_URL,
  KROOMBOX_CHAT_ENDPOINT,
  KROOMBOX_MODEL,
} from '../../lib/kroomboxConfig';
import { CircuitBreaker, CircuitOpenError } from '../breaker';
import { completeJsonSlice } from './json';
import { KroomboxError, KroomboxTimeoutError } from './failures';
import {
  BIMA_DROP_SENTENCE,
  BIMA_TIMEOUT_SENTENCE,
  CIRCUIT_SENTENCE,
  EMPTY_REPLY_SENTENCE,
  httpFailureText,
  humanizeTransportReason,
  NETWORK_DROP_SENTENCE,
  START_FAILED_SENTENCE,
  TIMEOUT_SENTENCE,
} from '../errors';
import type { StreamHandlers, StreamRequest } from './types';

// Bentuk data AI hidup di ./types supaya module murni (giliran percakapan) bisa
// bergantung padanya tanpa menyeret react-native-sse. StreamRequest & StreamHandlers
// ikut diekspor ulang di sini karena keduanya bagian dari tanda tangan fungsi publik
// transport ini; HistoryEntry tidak (pemakainya mengimpor langsung dari ./types).
export type { StreamHandlers, StreamRequest } from './types';

/**
 * Pengatur waktu permintaan RAG (ms).
 *
 * IDLE: jeda tanpa data sama sekali sebelum menyerah. DIHITUNG ULANG tiap ada data
 *   masuk — bukan satu dinding datar dari awal. 60s dipilih supaya kegagalan terasa
 *   cepat: server yang benar-benar macet (terukur: 0 token selama >6 menit) tidak lagi
 *   menahan pengguna berjam-jam. Server yang lambat TAPI mengalir tetap aman karena
 *   timer ini di-reset setiap ada data masuk.
 * TOTAL: jaring pengaman agar permintaan tak menggantung selamanya walau data menetes
 *   terus tanpa pernah lengkap.
 *
 * CATATAN: denyut /api/health berkala (dulu 25s) sudah DIHAPUS. Terukur bahwa server
 * yang macet berhenti di tahap pembangkitan LLM, dan denyut ke /api/health tidak
 * menghidupkannya kembali — jadi itu hanya menambah beban ke server mitra tanpa manfaat.
 */
const IDLE_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = 300_000;

/**
 * Batas idle untuk jalur streaming MENTAH (chat teks & panggilan suara), yang tidak
 * lewat collectKroomboxStream. Tanpa ini, kedua jalur itu menunggu selamanya saat
 * server berhenti mengirim data.
 */
const CHAT_IDLE_TIMEOUT_MS = 60_000;

/**
 * Pemutus arus bersama untuk SELURUH permintaan AI (menu, resep, chat, suara) —
 * semuanya bermuara ke satu endpoint /api/chat, jadi satu pemutus cukup.
 *
 * Ketika server sedang macet (terukur: 0 token selama >6 menit), tiga kegagalan
 * berturut-turut membuka pemutus selama 60 detik: permintaan berikutnya gagal
 * SEKETIKA tanpa menunggu timeout penuh dan tanpa menambah beban ke server yang
 * sedang tumbang. Setelah 60 detik, satu permintaan percobaan dikirim untuk
 * menguji apakah server sudah pulih.
 */
export const chatBreaker = new CircuitBreaker({ failureThreshold: 3, openMs: 60_000 });

interface StreamChunk {
  delta?: string;
  sources?: unknown[];
  response?: string;
  error?: string;
}

function isDoneLine(raw: string): boolean {
  return raw.trim() === '[DONE]';
}

/**
 * Streams the RAG answer from the BIMA API POST /api/chat over SSE.
 *
 * Format nyata (diverifikasi terhadap api.llmsorgum.online):
 *   data: {"sources": []}
 *   data: {"delta": "teks..."}
 *   data: [DONE]
 *
 * Autentikasi via header X-API-Key (bukan bearer).
 */
export function streamKroomboxChat(
  req: StreamRequest,
  handlers: StreamHandlers,
): { close: () => void } {
  // Pemutus arus: kalau server sedang macet (OPEN), JANGAN kirim sama sekali —
  // gagalkan seketika supaya pengguna tidak menunggu 60 detik untuk hal yang pasti
  // gagal, dan server yang sudah tumbang tidak ditambah beban.
  if (!chatBreaker.canPass()) {
    const denied = new CircuitOpenError(CIRCUIT_SENTENCE);
    setTimeout(() => handlers.onError(denied), 0);
    return { close: () => undefined };
  }

  const url = `${KROOMBOX_BASE_URL}${KROOMBOX_CHAT_ENDPOINT}`;
  const es = new EventSource(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': KROOMBOX_API_KEY,
    },
    body: JSON.stringify({
      message: req.message,
      history: req.history ?? [],
      // Model DIPATOK. Diukur 2026-10-26 dengan prompt yang sama:
      //   model null                                  → 60 detik tanpa satu byte
      //   kc/nvidia/nemotron-3-ultra-550b-a55b:free   → 1,5 detik, jawaban benar
      // Rute default server sudah tidak melayani; tanpa patokan ini menu gagal dimuat.
      model: req.model ?? KROOMBOX_MODEL,
      // Default MATI: retrieval di sisi server terbukti tidak relevan untuk app ini
      // (sumber terukur skor ≈0.005, +3-13 detik per permintaan). Nyalakan hanya bila
      // pemanggil memang memintanya secara eksplisit.
      //
      // Terukur ulang 2026-10-26 dengan prompt menu yang sama:
      //   useRag true  → 180 detik tanpa satu byte (habis waktu)
      //   useRag false → 8,5 detik, JSON valid
      // Jangan diubah tanpa mengukur ulang; ini yang membuat menu gagal dimuat.
      useRag: req.useRag ?? false,
      // Selalu streaming: jawaban RAG terstruktur bisa makan 1-4 menit, dan
      // sambungan SSE menjaga proxy tetap hidup (menghindari 502 gateway).
      stream: true,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    }),
    pollingInterval: 0,
  });

  // Satu jalur selesai/gagal saja per permintaan. Tanpa penjaga ini, respons yang tiba
  // sesudah kita menutup koneksi masih diproses (jawaban bisa dobel), dan "close" yang
  // datang sesudah [DONE] terbaca sebagai kegagalan palsu.
  let settled = false;
  let receivedDelta = false;
  // Pengawas "tidak ada data": jalur ini (chat teks & panggilan suara) dulu menunggu
  // selamanya saat server berhenti mengirim. Timer DIHITUNG ULANG tiap ada pesan masuk,
  // jadi jawaban yang mengalir lambat tetap aman; hanya kesepian >60s yang diputus.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
  const armIdle = () => {
    clearIdle();
    if (settled) return;
    idleTimer = setTimeout(
      () => fail(new KroomboxTimeoutError(TIMEOUT_SENTENCE)),
      CHAT_IDLE_TIMEOUT_MS,
    );
  };
  const done = () => {
    if (settled) return;
    settled = true;
    clearIdle();
    // Jawaban lengkap → server sehat; pemutus kembali normal.
    chatBreaker.onSuccess();
    handlers.onDone();
    es.close();
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    clearIdle();
    // Server tak menjawab / error → hitung sebagai kegagalan layanan.
    chatBreaker.onFailure();
    handlers.onError(error);
    es.close();
  };

  armIdle();

  es.addEventListener('message', (event) => {
    if (settled || !event.data) return;
    armIdle();
    const raw = event.data;

    // Penanda selesai: data: [DONE]
    if (isDoneLine(raw)) {
      done();
      return;
    }

    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(raw);
    } catch {
      return; // abaikan noise non-JSON
    }

    if (chunk.error) {
      fail(new KroomboxError(chunk.error));
      return;
    }

    if (chunk.delta) {
      receivedDelta = true;
      handlers.onToken(chunk.delta);
      return;
    }

    // Fallback: beberapa deploy kirim {"response": ...} sekaligus walau stream=true.
    // Kalau delta sudah pernah masuk, jangan ditambahkan lagi (dulu teksnya dobel).
    if (chunk.response) {
      if (!receivedDelta) handlers.onToken(chunk.response);
      done();
      return;
    }

    if (chunk.sources && handlers.onSources) {
      handlers.onSources(chunk.sources);
    }
  });

  es.addEventListener('error', (event) => {
    // react-native-sse tidak selalu menyertakan pesan error yang terbaca; kalau ada
    // kode status, sebutkan angkanya supaya sebabnya kelihatan.
    const status = 'xhrStatus' in event ? (event as { xhrStatus?: number }).xhrStatus : 0;
    const rawReason =
      status && status > 0
        ? httpFailureText(status)
        : 'message' in event && typeof (event as { message?: unknown }).message === 'string'
          ? ((event as { message: string }).message as string)
          : event.type === 'timeout'
            ? BIMA_TIMEOUT_SENTENCE
            : BIMA_DROP_SENTENCE;
    // Pesan bisa KOSONG (server menutup koneksi tanpa keterangan). Dulu pesan kosong
    // diteruskan apa adanya, sehingga layar kehilangan sebabnya dan menampilkan
    // kalimat generik — sebab aslinya jadi tak pernah terlihat.
    const reason = humanizeTransportReason(rawReason.trim()) || NETWORK_DROP_SENTENCE;
    // Pertahankan teks parsial (PRD QA scenario 1) + surface error state.
    fail(new KroomboxError(reason));
  });

  // Pembungkus: menutup koneksi atas permintaan pengguna (tombol berhenti / panggilan
  // ditutup) BUKAN kegagalan layanan — lepaskan slot uji half-open supaya pemutus
  // tidak macet selamanya.
  return {
    close: () => {
      if (!settled) chatBreaker.onAbort();
      es.close();
    },
  };
}

/**
 * Collect an SSE response into one string. Structured RAG generations can take
 * over a minute; streaming keeps the proxy connection active and avoids a
 * gateway 502 while still returning one parseable payload to callers.
 */
function collectKroomboxStream(req: StreamRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    let settled = false;
    let stream: ReturnType<typeof streamKroomboxChat> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let totalTimer: ReturnType<typeof setTimeout> | null = null;

    const stopTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (totalTimer) clearTimeout(totalTimer);
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      stopTimers();
      stream?.close();
      callback();
    };

    const fail = (message: string, TimeoutError = false) => {
      // Waktu habis = layanan gagal. Catat ke pemutus SEBELUM menutup stream: jalur
      // penutupan lewat close() hanya melepas slot uji half-open, bukan menghitung gagal.
      if (TimeoutError) chatBreaker.onFailure();
      finish(() =>
        reject(TimeoutError ? new KroomboxTimeoutError(message) : new KroomboxError(message)),
      );
    };

    // Pengatur waktu "tidak ada data": DIHITUNG ULANG setiap ada data masuk, jadi
    // tidak lagi satu dinding datar dari awal. Selama server masih mengirim, permintaan
    // tidak dibunuh — kasus "data hampir lengkap lalu keburu diputus" hilang.
    const armIdle = () => {
      if (settled) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail(TIMEOUT_SENTENCE, true), IDLE_TIMEOUT_MS);
    };

    // Jaring pengaman: batas total walau data menetes terus tanpa pernah lengkap.
    totalTimer = setTimeout(() => fail(TIMEOUT_SENTENCE, true), TOTAL_TIMEOUT_MS);

    armIdle();

    try {
      stream = streamKroomboxChat(
        { ...req },
        {
          onToken: (token) => {
            text += token;
            if (settled) return;
            armIdle();
            // Data yang kita butuhkan sudah lengkap → tutup sekarang, jangan tunggu
            // server selesai menulis prosa tambahan. JSON hanya bisa menjadi utuh pada
            // token yang membawa kurung tutup, jadi token lain tidak perlu memindai
            // ulang seluruh teks (dulu dipindai tiap token: makin panjang makin lambat).
            const ready = /[}\]]/.test(token) ? completeJsonSlice(text) : null;
            if (ready) {
              // Data lengkap = server sehat; pastikan pemutus ikut kembali normal.
              chatBreaker.onSuccess();
              finish(() => resolve(ready));
            }
          },
          onSources: () => armIdle(),
          onDone: () =>
            finish(() => {
              if (!text.trim()) {
                reject(new KroomboxError(EMPTY_REPLY_SENTENCE));
                return;
              }
              resolve(text);
            }),
          onError: (error) => finish(() => reject(error)),
        },
      );
      if (settled) stream.close();
    } catch (error) {
      // Gagal MEMULAI stream (bukan timeout) juga berarti layanan tidak melayani —
      // hitung sebagai kegagalan supaya pemutus tetap belajar dari kasus ini.
      chatBreaker.onFailure();
      finish(() =>
        reject(error instanceof Error ? error : new KroomboxError(START_FAILED_SENTENCE)),
      );
    }
  });
}

/**
 * Panggil /api/chat dan kembalikan jawaban utuh sebagai satu string.
 *
 * Selalu lewat streaming lalu dikumpulkan kembali: itu satu-satunya bentuk yang
 * terbukti bertahan pada jawaban RAG terstruktur (menu andalan, resep
 * step-by-step) yang bisa makan 1-4 menit. Jalur fetch non-streaming lama sudah
 * dibuang — tidak ada pemanggil yang memakainya dan justru rawan 502 dari proxy.
 */
export async function chatKroombox(req: StreamRequest): Promise<string> {
  return collectKroomboxStream(req);
}
