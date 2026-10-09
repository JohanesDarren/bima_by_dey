import EventSource from 'react-native-sse';
import {
  KROOMBOX_API_KEY,
  KROOMBOX_BASE_URL,
  KROOMBOX_CHAT_ENDPOINT,
  KROOMBOX_HEALTH_ENDPOINT,
} from '../lib/kroomboxConfig';

/**
 * Pengatur waktu permintaan RAG (ms).
 *
 * IDLE: jeda tanpa data sama sekali sebelum menyerah. DIHITUNG ULANG tiap ada data
 *   masuk — bukan satu dinding datar dari awal. 400s dipilih dari pengukuran: permintaan
 *   resep TERUKUR pernah memakan 195-234 detik, jadi batas ini hanya terpakai saat
 *   server benar-benar lambat/sepi.
 * TOTAL: jaring pengaman agar permintaan tak menggantung selamanya walau data menetes
 *   terus tanpa pernah lengkap.
 * HEARTBEAT: jeda antar-denyut ke /api/health selagi menunggu (sesi server tetap aktif).
 */
const IDLE_TIMEOUT_MS = 400_000;
const TOTAL_TIMEOUT_MS = 900_000;
const HEARTBEAT_INTERVAL_MS = 25_000;

export interface StreamHandlers {
  /** text chunk dari delta stream */
  onToken: (text: string) => void;
  /** selesai stream */
  onDone: (finishReason?: string) => void;
  /** error jaringan/API */
  onError: (err: Error) => void;
  /** sumber RAG (kalau dikirim event pertama {"sources": [...]}) */
  onSources?: (sources: unknown[]) => void;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamRequest {
  /** pesan terbaru user */
  message: string;
  /** riwayat chat (role: user/assistant) untuk konteks */
  history?: HistoryEntry[];
  model?: string | null;
  useRag?: boolean;
  /**
   * Batas token keluaran (dipungut dari versi upstream). Berguna sebagai jaring terhadap
   * jawaban yang berlarut-larut: panjang keluaran ≈ lama proses. Nilainya sengaja
   * longgar — dipasang ketat, JSON resep bisa terpotong dan malah minta ulang.
   */
  maxTokens?: number;
}

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
export function streamKroomboxChat(req: StreamRequest, handlers: StreamHandlers) {
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
      model: req.model ?? null,
      useRag: req.useRag ?? true,
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
  const done = () => {
    if (settled) return;
    settled = true;
    handlers.onDone();
    es.close();
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    handlers.onError(error);
    es.close();
  };

  es.addEventListener('message', (event) => {
    if (settled || !event.data) return;
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
        ? `Layanan RAG sedang bermasalah (HTTP ${status}).`
        : 'message' in event && typeof (event as { message?: unknown }).message === 'string'
          ? ((event as { message: string }).message as string)
          : event.type === 'timeout'
            ? 'Timeout menunggu respons BIMA.'
            : 'Koneksi ke BIMA terputus.';
    // Pesan bisa KOSONG (server menutup koneksi tanpa keterangan). Dulu pesan kosong
    // diteruskan apa adanya, sehingga layar kehilangan sebabnya dan menampilkan
    // kalimat generik — sebab aslinya jadi tak pernah terlihat.
    const reason =
      humanizeTransportReason(rawReason.trim()) || 'Koneksi ke layanan RAG terputus. Coba lagi.';
    // Pertahankan teks parsial (PRD QA scenario 1) + surface error state.
    fail(new KroomboxError(reason));
  });

  return es;
}

/** Klasifikasi error sederhana untuk chat store. */
export class KroomboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KroomboxError';
  }
}

/**
 * Kegagalan yang datang dari SISI SERVER: model AI milik server sendiri tumbang.
 *
 * Terverifikasi langsung dari stream (dicatat 2026-09-22): server mengirim
 *   {"delta": "Server AI gagal merespons: Error code: 503 - {'error': {'message':
 *   '[commandcode/xiaomi/mimo-v2.6-flash] [502]: fetch failed (cause: ETIMEDOUT)'}}"}
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
function humanizeTransportReason(reason: string): string {
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

// ---------------------------------------------------------------------------
// Streaming call (semua permintaan: menu, resep, chat)
// ---------------------------------------------------------------------------

/**
 * Potongan JSON pertama yang SUDAH utuh di dalam teks (kurung seimbang, sadar
 * string), atau null bila belum lengkap.
 *
 * Dipakai untuk berhenti lebih awal. Server sering terus menulis prosa setelah
 * JSON-nya selesai (analisis harga per kg, alergen, "Catatan Verifikasi … skor
 * kelayakan") selama puluhan detik. Dulu kita menunggu sampai server bilang
 * selesai: hasilnya lambat, dan permintaan yang lewat batas waktu dibunuh
 * padahal datanya sudah lengkap. Potongan ini baru dianggap utuh bila benar-benar
 * bisa diparse, jadi tidak ada risiko memotong data separuh.
 */
function completeJsonSlice(text: string): string | null {
  const first = [text.indexOf('{'), text.indexOf('[')]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  if (first === undefined) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        // Model kadang menulis beberapa array terpisah; jangan berhenti kalau
        // masih ada array berikutnya (hasilnya nanti cuma sebagian).
        if (
          text
            .slice(i + 1)
            .trimStart()
            .startsWith('[')
        )
          return null;
        const slice = text.slice(first, i + 1);
        try {
          JSON.parse(slice);
          return slice;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
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
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const stopTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (totalTimer) clearTimeout(totalTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      stopTimers();
      stream?.close();
      callback();
    };

    const fail = (message: string) => finish(() => reject(new KroomboxError(message)));

    // Pengatur waktu "tidak ada data": DIHITUNG ULANG setiap ada data masuk, jadi
    // tidak lagi satu dinding datar dari awal. Selama server masih mengirim, permintaan
    // tidak dibunuh — kasus "data hampir lengkap lalu keburu diputus" hilang.
    const armIdle = () => {
      if (settled) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => fail('Layanan RAG terlalu lama tidak mengirim data. Coba lagi.'),
        IDLE_TIMEOUT_MS,
      );
    };

    // Jaring pengaman: batas total walau data menetes terus tanpa pernah lengkap.
    totalTimer = setTimeout(
      () => fail('Jawaban RAG tidak kunjung lengkap. Coba lagi.'),
      TOTAL_TIMEOUT_MS,
    );

    // Denyut: panggil /api/health berkala supaya sesi di sisi server tetap dianggap
    // aktif selagi menunggu jawaban panjang. Jalur terpisah dari aliran jawaban, jadi
    // tidak menyentuh isinya; kegagalan denyut diabaikan dan tidak menjatuhkan permintaan.
    heartbeatTimer = setInterval(() => {
      if (settled) return;
      fetch(`${KROOMBOX_BASE_URL}${KROOMBOX_HEALTH_ENDPOINT}`, {
        headers: { 'X-API-Key': KROOMBOX_API_KEY },
      }).catch(() => {
        /* denyut gagal ≠ permintaan gagal */
      });
    }, HEARTBEAT_INTERVAL_MS);

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
            // server selesai menulis prosa tambahan.
            const ready = completeJsonSlice(text);
            if (ready) finish(() => resolve(ready));
          },
          onSources: () => armIdle(),
          onDone: () =>
            finish(() => {
              if (!text.trim()) {
                reject(new KroomboxError('Layanan RAG mengembalikan jawaban kosong. Coba lagi.'));
                return;
              }
              resolve(text);
            }),
          onError: (error) => finish(() => reject(error)),
        },
      );
      if (settled) stream.close();
    } catch (error) {
      finish(() =>
        reject(error instanceof Error ? error : new KroomboxError('Layanan RAG gagal dimulai.')),
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

/**
 * Beberapa balasan memakai kunci tanpa tanda kutip (mis. `"nutrition": {calories: 480}`)
 * — itu bukan JSON sah, tapi isinya utuh. Contohnya muncul saat template prompt
 * menuliskan contoh kunci tanpa kutip dan model menyalinnya apa adanya. Kutip
 * kuncinya dulu sebelum menyerah: jauh lebih murah daripada mengulang permintaan
 * yang butuh 1-4 menit.
 *
 * PENTING — hanya menambal kunci di LUAR tanda kutip. Versi polos `([{,]\s*)(\w+)(\s*:)`
 * juga cocok di dalam teks biasa, sehingga kalimat seperti `"Bahan, lalu: masukkan"`
 * berubah jadi `"Bahan, "lalu": masukkan"` dan JSON-nya MALAH rusak. Jadi kita
 * telusuri teksnya sambil melacak apakah sedang berada di dalam string.
 */
function quoteBareKeys(value: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  let expectKey = false; // barusan lewat `{` atau `,` di luar string → kunci menyusul
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      expectKey = false;
      out += char;
      continue;
    }
    if (char === '{' || char === ',') {
      expectKey = true;
      out += char;
      continue;
    }
    if (char === ':' || char === '}' || char === ']') {
      expectKey = false;
      out += char;
      continue;
    }
    if (expectKey && /[A-Za-z_$]/.test(char)) {
      // Awal kunci telanjang: kutip sampai sebelum titik dua.
      let end = i;
      while (end < value.length && /[A-Za-z0-9_$]/.test(value[end]!)) end += 1;
      const rest = value.slice(end).match(/^\s*:/);
      if (rest) {
        out += `"${value.slice(i, end)}"`;
        i = end - 1;
        expectKey = false;
        continue;
      }
    }
    if (/\s/.test(char)) {
      out += char;
      continue;
    }
    expectKey = false;
    out += char;
  }
  return out;
}

/**
 * Inti bersama extractJson / extractJsonArray: buang pagar markdown, ambil potongan
 * dari tanda buka pertama sampai tanda tutup terakhir, lalu parse — dengan satu kali
 * percobaan menambal kunci telanjang sebelum menyerah.
 */
function parseJsonSlice<T>(raw: string, open: string, close: string): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  const start = candidate.indexOf(open);
  const end = candidate.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    try {
      return JSON.parse(quoteBareKeys(slice)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Ekstrak JSON array dari respons (strip fence) → T[] | null.
 * Respons menu & pencarian berbentuk array — extractJson (objek) tak cukup.
 */
export function extractJsonArray<T>(raw: string): T[] | null {
  const value = parseJsonSlice<T[]>(raw, '[', ']');
  return Array.isArray(value) ? value : null;
}

/**
 * Ekstrak JSON dari respons yang mungkin dibungkus markdown fence
 * (```json ... ```) atau ada teks pengantar. Return null jika tidak ketemu.
 */
export function extractJson<T>(raw: string): T | null {
  return parseJsonSlice<T>(raw, '{', '}');
}
