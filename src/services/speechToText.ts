/**
 * Ucapan → teks lewat 9router (`POST {base}/audio/transcriptions`).
 *
 * Kenapa modul terpisah: panggilan suara butuh transkrip SEBELUM bisa menjalankan
 * giliran percakapan, dan transkrip itu datang dari penyedia yang berbeda dari mesin
 * RAG. Menaruhnya di sini menjaga satu hal: transport RAG tidak perlu tahu apa pun
 * tentang audio.
 *
 * Hasil pemeriksaan langsung (2026-10-23) terhadap seluruh provider di 9router:
 * hanya `groq` yang melayani STT; provider lain menjawab
 * "Provider '<x>' does not support STT", dan tanpa prefiks provider server menjawab
 * "No credentials for provider: openai". Karena itu model ditulis LENGKAP dengan
 * prefiks provider (`groq/whisper-large-v3`), bukan nama polos.
 */

/**
 * Model bawaan: satu-satunya kombinasi provider+model yang terbukti melayani STT.
 * Dapat ditimpa lewat `EXPO_PUBLIC_9ROUTER_STT_MODEL` tanpa menyentuh kode.
 */
export const DEFAULT_STT_MODEL = 'groq/whisper-large-v3';

function sttModel(): string {
  return process.env.EXPO_PUBLIC_9ROUTER_STT_MODEL?.trim() || DEFAULT_STT_MODEL;
}

export interface TranscriptionRequest {
  /** URI berkas rekaman (file://… dari expo-audio). */
  uri: string;
  /** Nama berkas + ekstensi; menentukan MIME yang dikirim. */
  fileName?: string;
  mimeType?: string;
  /** Bahasa yang diharapkan; membantu akurasi, bukan pembatas. */
  language?: string;
  model?: string;
  /** Batas waktu (ms). Rekaman pendek; jangan menunggu selamanya. */
  timeoutMs?: number;
}

export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/** Kalimat siap tampil untuk tiap kegagalan transkripsi. */
export const TRANSCRIPTION_MESSAGES = {
  missingConfig: 'Pengenalan suara belum dikonfigurasi. Isi 9ROUTER_BASE_URL dan 9ROUTER_API_KEY.',
  emptyAudio: 'Rekaman kosong. Coba bicara lebih jelas.',
  noSpeech: 'Tidak ada suara yang terdengar. Coba lagi.',
  failed: 'Suara tidak bisa diubah menjadi teks. Coba lagi.',
} as const;

function baseUrl(): string {
  return (process.env.EXPO_PUBLIC_9ROUTER_BASE_URL ?? '').replace(/\/+$/, '');
}

function apiKey(): string {
  return process.env.EXPO_PUBLIC_9ROUTER_API_KEY ?? '';
}

export function isTranscriptionConfigured(): boolean {
  return Boolean(baseUrl() && apiKey());
}

/**
 * Ambil teks dari satu balasan JSON 9router. Toleran terhadap dua bentuk yang
 * terlihat di lapangan: `{ text }` (OpenAI-compatible) dan `{ choices:[…] }`
 * (beberapa route meneruskan bentuk chat).
 */
export function readTranscript(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text.trim();
  if (typeof obj.transcript === 'string') return obj.transcript.trim();
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') return message.content.trim();
    if (typeof first?.text === 'string') return (first.text as string).trim();
  }
  return '';
}

/**
 * Ubah satu berkas rekaman menjadi teks.
 *
 * Melempar `TranscriptionError` dengan kalimat siap tampil — tidak pernah
 * mengembalikan teks palsu saat gagal.
 */
export async function transcribeAudio(request: TranscriptionRequest): Promise<string> {
  if (!isTranscriptionConfigured())
    throw new TranscriptionError(TRANSCRIPTION_MESSAGES.missingConfig);
  if (!request.uri) throw new TranscriptionError(TRANSCRIPTION_MESSAGES.emptyAudio);

  const fileName = request.fileName ?? 'rekaman.m4a';
  const mimeType = request.mimeType ?? 'audio/m4a';
  const model = request.model ?? sttModel();
  const timeoutMs = request.timeoutMs ?? 45_000;

  const form = new FormData();
  // React Native menerima objek {uri,name,type} sebagai bagian berkas multipart.
  form.append('file', {
    uri: request.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
  form.append('model', model);
  if (request.language) form.append('language', request.language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}` },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new TranscriptionError(TRANSCRIPTION_MESSAGES.failed);
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw new TranscriptionError(TRANSCRIPTION_MESSAGES.failed);
    }

    const text = readTranscript(payload);
    if (!text) throw new TranscriptionError(TRANSCRIPTION_MESSAGES.noSpeech);
    return text;
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError(TRANSCRIPTION_MESSAGES.failed);
  } finally {
    clearTimeout(timer);
  }
}
