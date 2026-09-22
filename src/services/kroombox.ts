import EventSource from 'react-native-sse';
import { KROOMBOX_API_KEY, KROOMBOX_BASE_URL, KROOMBOX_CHAT_ENDPOINT } from '../lib/kroomboxConfig';

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
      stream: req.stream ?? true,
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
  constructor(message: string) {
    super(message);
    this.name = 'KroomboxError';
  }
}

// ---------------------------------------------------------------------------
// Non-streaming call (untuk data terstruktur: menu, resep, dsb)
// ---------------------------------------------------------------------------

export interface ChatResponse {
  response: string;
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
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stream?.close();
      callback();
    };
    const timeout = setTimeout(
      () =>
        finish(() => reject(new KroomboxError('Layanan RAG terlalu lama merespons. Coba lagi.'))),
      180_000,
    );

    try {
      stream = streamKroomboxChat(
        { ...req, stream: true },
        {
          onToken: (token) => {
            text += token;
          },
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
 * Panggil /api/chat NON-streaming (fetch biasa). Dipakai saat butuh respons
 * utuh yang mudah diparse (menu andalan, resep step-by-step).
 */
export async function chatKroombox(req: StreamRequest): Promise<string> {
  if (req.stream) return collectKroomboxStream(req);
  const url = `${KROOMBOX_BASE_URL}${KROOMBOX_CHAT_ENDPOINT}`;
  try {
    const res = await fetch(url, {
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
        stream: false,
      }),
    });
    if (!res.ok) throw new KroomboxError(`Layanan RAG sedang bermasalah (HTTP ${res.status}).`);
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
