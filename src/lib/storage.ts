import { MMKV } from 'react-native-mmkv';

/**
 * Synchronous local storage (PRD §5.1: react-native-mmkv 2.x).
 * Used for Guest Mode state, AI settings, and caching the last known profile
 * so the app is usable offline before login (PRD F-01).
 */
export const storage = new MMKV({ id: 'bima-by-dey' });

const KEYS = {
  guestMode: 'guest_mode',
  aiReasoningEnabled: 'ai_reasoning_enabled',
  cachedProfile: 'cached_profile', // JSON of the demographic profile for guests
  lastUserId: 'last_user_id',
} as const;

// --- Generic helpers -------------------------------------------------------

export function getString(key: string): string | undefined {
  return storage.getString(key);
}

export function getBoolean(key: string, fallback = false): boolean {
  const v = storage.getBoolean(key);
  return v === undefined ? fallback : v;
}

export function setBoolean(key: string, value: boolean): void {
  storage.set(key, value);
}

export function setString(key: string, value: string): void {
  storage.set(key, value);
}

export function removeKey(key: string): void {
  storage.delete(key);
}

// --- App-specific storage API ---------------------------------------------

export const localStore = {
  isGuestMode(): boolean {
    return getBoolean(KEYS.guestMode, false);
  },
  setGuestMode(value: boolean): void {
    setBoolean(KEYS.guestMode, value);
  },

  getAiReasoningEnabled(): boolean {
    return getBoolean(KEYS.aiReasoningEnabled, true);
  },
  setAiReasoningEnabled(value: boolean): void {
    setBoolean(KEYS.aiReasoningEnabled, value);
  },

  /** Guest demographic profile persisted locally (survives app restarts). */
  getCachedProfile<T>(): T | null {
    const raw = getString(KEYS.cachedProfile);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setCachedProfile(value: unknown): void {
    setString(KEYS.cachedProfile, JSON.stringify(value));
  },

  getLastUserId(): string | undefined {
    return getString(KEYS.lastUserId);
  },
  setLastUserId(id: string): void {
    setString(KEYS.lastUserId, id);
  },

  /** Wipe all guest/local state (Settings -> "Hapus Data Lokal"). */
  clearAll(): void {
    storage.clearAll();
  },
};

export { KEYS };
