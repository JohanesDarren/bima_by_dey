import { Platform } from 'react-native';

/**
 * Kroombox RAG API config (PRD §5.4).
 * Set EXPO_PUBLIC_KROOMBOX_URL to the public HTTPS base URL of the FastAPI server,
 * e.g. https://kroombox.example.com — NOT a bare LAN IP when running on a real device.
 */
export const KROOMBOX_BASE_URL =
  process.env.EXPO_PUBLIC_KROOMBOX_URL ?? 'https://kroombox.example.com';

export const KROOMBOX_CHAT_ENDPOINT = '/api/chat';

/** Android emulator reaches the host machine via 10.0.2.2. */
export const isAndroid = Platform.OS === 'android';
