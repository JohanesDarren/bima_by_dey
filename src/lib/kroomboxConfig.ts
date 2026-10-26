/**
 * Kroombox RAG API config (PRD §5.4).
 *
 * Base URL + API key. Override via EXPO_PUBLIC_ env vars if needed; defaults
 * point at the live BIMA deployment.
 */
export const KROOMBOX_BASE_URL =
  process.env.EXPO_PUBLIC_KROOMBOX_URL ?? 'https://api.llmsorgum.online';

/** API key untuk autentikasi (header X-API-Key). */
export const KROOMBOX_API_KEY =
  process.env.EXPO_PUBLIC_KROOMBOX_API_KEY ?? 'bima_live_e0e002922c91d658393aae59189a2e43';

/** Endpoint streaming chat. */
export const KROOMBOX_CHAT_ENDPOINT = '/api/chat';

/**
 * Model yang dipakai server RAG (diteruskan ke 9router).
 *
 * Kenapa dipatok, bukan dibiarkan `null`: diukur 2026-10-24, dengan `model: null`
 * server memilih model yang sedang tidak tersedia — 9router membalas 503, atau
 * tidak ada balasan sama sekali (120 detik, 0 byte, sumber RAG sudah terkirim).
 * Yang terbukti menghasilkan JSON valid lewat RAG:
 *   kc/nvidia/nemotron-3-ultra-550b-a55b:free  (3/3 sukses: 33s, 28s, 13s)
 *   kc/dots-studio/dots-3-note-preview:free    (36s)
 * Yang gagal: poolside (menulis prosa, bukan JSON), groq & thinkingmachines (503).
 */
export const KROOMBOX_MODEL =
  process.env.EXPO_PUBLIC_KROOMBOX_MODEL ?? 'kc/nvidia/nemotron-3-ultra-550b-a55b:free';
