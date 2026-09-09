import { Platform } from 'react-native';

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

/** Android emulator reaches the host machine via 10.0.2.2. */
export const isAndroid = Platform.OS === 'android';
