import { Platform } from 'react-native';

/**
 * Kroombox RAG API config (PRD §5.4).
 *
 * Base URL + API key. Override via EXPO_PUBLIC_ env vars if needed; defaults
 * point at the live BIMA deployment.
 */
export const KROOMBOX_BASE_URL =
  process.env.EXPO_PUBLIC_KROOMBOX_URL ?? 'https://api.llmsorgum.online';

/** API key untuk autentikasi (header X-API-Key). Wajib diisi via env untuk build rilis. */
export const KROOMBOX_API_KEY =
  process.env.EXPO_PUBLIC_KROOMBOX_API_KEY ?? 'bima_live_e0e002922c91d658393aae59189a2e43';

if (!process.env.EXPO_PUBLIC_KROOMBOX_API_KEY) {
  console.warn(
    '[bima] EXPO_PUBLIC_KROOMBOX_API_KEY tidak diset — memakai kunci bawaan. Isi di .env sebelum build rilis.',
  );
}

/** Endpoint non-streaming (respons JSON utuh). */
export const KROOMBOX_CHAT_ENDPOINT = '/api/chat';

/** Endpoint streaming (SSE) — rute khusus sesuai OpenAPI. */
export const KROOMBOX_CHAT_STREAM_ENDPOINT = '/api/chat/stream';

/** Android emulator reaches the host machine via 10.0.2.2. */
export const isAndroid = Platform.OS === 'android';
