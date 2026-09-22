import EventSource from 'react-native-sse';
import {
  KROOMBOX_API_KEY,
  KROOMBOX_BASE_URL,
  KROOMBOX_CHAT_ENDPOINT,
  KROOMBOX_CHAT_STREAM_ENDPOINT,
} from '../lib/kroomboxConfig';

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
  stream?: boolean;
  /** batas token respons (header X-Max-Tokens, opsional) */
  maxTokens?: number | null;
  /** id dokumen RAG spesifik (header X-Target-Doc, opsional) */
  targetDocId?: string | null;
}

interface StreamChunk {
  delta?: string;
  sources?: unknown[];
  response?: string;
  error?: string;
}

/** Default budget token per respons (disamakan dengan client referensi). */
const DEFAULT_MAX_TOKENS = 8192;

function isDoneLine(raw: string): boolean {
  return raw.trim() === '[DONE]';
}

/** Header auth + header opsional sesuai daftar CORS server (X-Max-Tokens, X-Target-Doc). */
function buildKroomboxHeaders(req: StreamRequest, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': KROOMBOX_API_KEY,
    'X-Use-RAG': (req.useRag ?? true) ? 'true' : 'false',
    'X-Stream': stream ? 'true' : 'false',
    'X-Max-Tokens': String(req.maxTokens ?? DEFAULT_MAX_TOKENS),
  };
  if (req.targetDocId) headers['X-Target-Doc'] = req.targetDocId;
  return headers;
}

/**
 * Streams the RAG answer over SSE via POST /api/chat/stream.
 *
 * Format chunk (observasi terhadap api.llmsorgum.online):
 *   data: {"sources": []}
 *   data: {"delta": "teks..."}
 *   data: [DONE]
 *
 * Autentikasi via header X-API-Key (bukan bearer).
 */
export function streamKroomboxChat(req: StreamRequest, handlers: StreamHandlers) {
  const url = `${KROOMBOX_BASE_URL}${KROOMBOX_CHAT_STREAM_ENDPOINT}`;
  const stream = req.stream ?? true;
  const es = new EventSource(url, {
    method: 'POST',
    headers: buildKroomboxHeaders(req, stream),
    body: JSON.stringify({
      message: req.message,
      history: req.history ?? [],
      model: req.model ?? null,
      useRag: req.useRag ?? true,
      stream,
    }),
    pollingInterval: 0,
  });

  es.addEventListener('message', (event) => {
    if (!event.data) return;
    const raw = event.data;

    // Penanda selesai: data: [DONE]
    if (isDoneLine(raw)) {
      handlers.onDone();
      es.close();
      return;
    }

    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(raw);
    } catch {
      return; // abaikan noise non-JSON
    }

    if (chunk.error) {
      handlers.onError(new Error(chunk.error));
      es.close();
      return;
    }

    if (chunk.delta) {
      handlers.onToken(chunk.delta);
      return;
    }

    // Fallback: beberapa deploy kirim {"response": ...} sekaligus walau stream=true
    if (chunk.response) {
      handlers.onToken(chunk.response);
      handlers.onDone();
      es.close();
      return;
    }

    if (chunk.sources && handlers.onSources) {
      handlers.onSources(chunk.sources);
    }
  });

  es.addEventListener('error', (event) => {
    // react-native-sse tidak selalu menyertakan pesan error yang terbaca.
    const reason =
      'message' in event && typeof (event as { message?: unknown }).message === 'string'
        ? ((event as { message: string }).message as string)
        : event.type === 'timeout'
          ? 'Timeout menunggu respons BIMA.'
          : 'Koneksi ke BIMA terputus.';
    // Pertahankan teks parsial (PRD QA scenario 1) + surface error state.
    handlers.onError(new Error(reason));
    es.close();
  });

  es.addEventListener('open', () => {
    // Koneksi terbuka — siap menerima delta.
  });

  return es;
}

/** Klasifikasi error sederhana untuk chat store. */
export class KroomboxError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KroomboxError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Non-streaming call (untuk data terstruktur: menu, resep, dsb)
// ---------------------------------------------------------------------------

export interface ChatResponse {
  response: string;
}

/**
 * Panggil /api/chat NON-streaming (fetch biasa). Dipakai saat butuh respons
 * utuh yang mudah diparse (menu andalan, resep step-by-step).
 */
export async function chatKroombox(req: StreamRequest): Promise<string> {
  const url = `${KROOMBOX_BASE_URL}${KROOMBOX_CHAT_ENDPOINT}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildKroomboxHeaders(req, false),
      body: JSON.stringify({
        message: req.message,
        history: req.history ?? [],
        model: req.model ?? null,
        useRag: req.useRag ?? true,
        stream: false,
      }),
    });
    if (!res.ok) throw await toKroomboxError(res);
    const data = (await res.json()) as ChatResponse;
    if (typeof data.response !== 'string' || !data.response.trim()) {
      throw new KroomboxError('Layanan RAG mengembalikan jawaban kosong. Coba lagi.');
    }
    return data.response;
  } catch (error) {
    if (error instanceof KroomboxError) throw error;
    throw new KroomboxError('Layanan RAG tidak dapat dihubungi. Coba lagi nanti.');
  }
}

/** Ambil pesan validasi pertama dari body HTTPValidationError ala FastAPI. */
function firstValidationMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const msg = (detail[0] as { msg?: unknown } | undefined)?.msg;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return null;
}

/** Ubah respons non-OK menjadi KroomboxError yang pesannya berguna di UI. */
async function toKroomboxError(res: Response): Promise<KroomboxError> {
  if (res.status === 429) {
    return new KroomboxError(
      'Terlalu banyak permintaan ke layanan RAG. Tunggu sebentar lalu coba lagi.',
      429,
    );
  }
  let detail: unknown;
  try {
    detail = ((await res.json()) as { detail?: unknown }).detail;
  } catch {
    detail = null;
  }
  const msg = firstValidationMessage(detail);
  if (res.status === 422 && msg) {
    return new KroomboxError(`Permintaan ditolak layanan RAG: ${msg}`, 422);
  }
  return new KroomboxError(`Layanan RAG sedang bermasalah (HTTP ${res.status}).`, res.status);
}

/**
 * Ekstrak JSON array dari respons (strip fence) → T[] | null.
 * Respons menu & pencarian berbentuk array — extractJson (objek) tak cukup.
 */
export function extractJsonArray<T>(raw: string): T[] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const v = JSON.parse(candidate.slice(start, end + 1)) as T[];
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Ekstrak JSON dari respons yang mungkin dibungkus markdown fence
 * (```json ... ```) atau ada teks pengantar. Return null jika tidak ketemu.
 */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Strip ```json ... ``` fence
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  // Kalau masih ada teks sebelum { atau setelah }, potong di kurung pertama/terakhir
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Jalur mengalir untuk permintaan terstruktur (menu, resep, pencarian)
// ---------------------------------------------------------------------------
//
// Kenapa: jalur non-streaming menunggu satu jawaban utuh. Cloudflare memutus
// koneksi yang tidak mengirim data selama 125 detik (error 524 = "a timeout
// occurred", Proxy Read Timeout), dan permintaan menu memang lewat batas itu
// (±125 detik pada pengukuran langsung). Jalur mengalir mengirim potongan tiap
// detik, jadi batas "diam" itu tidak pernah tercapai.
//
// Catatan (belum dikerjakan): panggilan suara di hooks/useVoiceCall.ts masih
// memakai chatKroombox (non-streaming). Promptnya pendek (maksimal 3 kalimat)
// sehingga jarang menyentuh 125 detik, tapi jalurnya tetap bisa kena 524.

/**
 * Batas "diam" saat menunggu potongan jawaban (ms). Sengaja di bawah 125 detik
 * milik Cloudflare supaya user dapat pesan yang jelas, bukan HTTP 524 mentah.
 */
export const KROOMBOX_IDLE_TIMEOUT_MS = 90_000;

/**
 * Jalankan permintaan lewat POST /api/chat/stream, lalu rangkai potongan
 * jawaban menjadi teks utuh.
 *
 * onText dipanggil setiap teks bertambah → pemanggil bisa menampilkan hasil
 * sebagian selagi jawaban penuh menyusul (baca sambil jalan).
 */
export function collectKroomboxStream(
  req: StreamRequest,
  opts: { idleTimeoutMs?: number; onText?: (full: string) => void } = {},
): Promise<string> {
  const idleTimeoutMs = opts.idleTimeoutMs ?? KROOMBOX_IDLE_TIMEOUT_MS;

  return new Promise<string>((resolve, reject) => {
    let full = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    // Tutup sambungan + selesaikan promise sekali saja.
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimer();
      es?.close();
      finish();
    };

    const armIdleTimer = () => {
      clearTimer();
      timer = setTimeout(() => {
        settle(() =>
          reject(
            new KroomboxError(
              `Layanan RAG berhenti mengirim jawaban (diam ${Math.round(idleTimeoutMs / 1000)} detik). Coba lagi.`,
            ),
          ),
        );
      }, idleTimeoutMs);
    };

    armIdleTimer();

    es = streamKroomboxChat(req, {
      onToken: (delta) => {
        full += delta;
        armIdleTimer();
        opts.onText?.(full);
      },
      onSources: () => armIdleTimer(),
      onDone: () => {
        if (!full.trim()) {
          settle(() =>
            reject(new KroomboxError('Layanan RAG menutup jawaban tanpa isi. Coba lagi.')),
          );
          return;
        }
        settle(() => resolve(full));
      },
      onError: (err) => {
        settle(() =>
          reject(
            err instanceof KroomboxError
              ? err
              : new KroomboxError(err.message || 'Koneksi ke layanan RAG terputus.'),
          ),
        );
      },
    });
  });
}

/**
 * Ambil objek JSON yang SUDAH lengkap (kurung tutupnya sudah tiba) dari teks
 * yang masih mengalir — dipakai menampilkan menu satu per satu sebelum jawaban
 * penuh selesai. Juga jadi cadangan saat parse jalur lama gagal.
 */
export function extractCompleteObjects<T>(raw: string): T[] {
  const items: T[] = [];
  if (!raw) return items;

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const parsed = JSON.parse(raw.slice(start, i + 1)) as T;
          if (parsed && typeof parsed === 'object') items.push(parsed);
        } catch {
          // Objek terpotong/rusak → lewati; sisa potongan menyusul.
        }
        start = -1;
      }
    }
  }
  return items;
}
