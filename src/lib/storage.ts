import { Platform } from 'react-native';

const KEYS = {
  guestMode: 'guest_mode',
  aiReasoningEnabled: 'ai_reasoning_enabled',
  cachedProfile: 'cached_profile', // JSON of the demographic profile for guests
  lastUserId: 'last_user_id',
  guestHistory: 'guest_chat_history',
  cookHistory: 'cook_history',
} as const;

// ---------------------------------------------------------------------------
// Backend adapters: MMKV on native (sync + fast), localStorage on web (SSR-safe).
// react-native-mmkv is a native module — it cannot run in a browser, so the web
// platform drops back to window.localStorage so the chat UI still works in Expo Go
// web / browser previews.
// ---------------------------------------------------------------------------

interface StorageBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string | boolean): void;
  delete(key: string): void;
  clearAll(): void;
}

const isWeb = Platform.OS === 'web';

function createWebBackend(): StorageBackend {
  const mem = new Map<string, string>();
  return {
    getString(key) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? undefined : v;
      } catch {
        return mem.get(key);
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        mem.set(key, String(value));
      }
    },
    delete(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        mem.delete(key);
      }
    },
    clearAll() {
      try {
        localStorage.clear();
      } catch {
        mem.clear();
      }
    },
  };
}

function createNativeBackend(): StorageBackend {
  // Lazy require so bundling on web never pulls in the native MMKV module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const storage = new MMKV({ id: 'bima-by-dey' });
  return {
    getString: (key) => storage.getString(key),
    set: (key, value) => storage.set(key, value),
    delete: (key) => storage.delete(key),
    clearAll: () => storage.clearAll(),
  };
}

const backend: StorageBackend = isWeb ? createWebBackend() : createNativeBackend();

// --- Generic helpers -------------------------------------------------------

export function getString(key: string): string | undefined {
  return backend.getString(key);
}

export function getBoolean(key: string, fallback = false): boolean {
  const v = backend.getString(key);
  // MMKV stores booleans as real bools; web stores strings. Normalize both.
  if (v === undefined) return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return !!v;
}

export function setBoolean(key: string, value: boolean): void {
  backend.set(key, value);
}

export function setString(key: string, value: string): void {
  backend.set(key, value);
}

export function removeKey(key: string): void {
  backend.delete(key);
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

  /** Riwayat chat tamu (guest) — disimpan sinkron ke MMKV/localStorage. */
  getGuestHistory(): string | undefined {
    return getString(KEYS.guestHistory);
  },
  setGuestHistory(value: string): void {
    setString(KEYS.guestHistory, value);
  },

  /** Riwayat sesi masak tamu (list sesi terselesaikan). */
  getCookHistory<T>(): T[] {
    const raw = getString(KEYS.cookHistory);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as T[];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },
  setCookHistory<T>(value: T[]): void {
    setString(KEYS.cookHistory, JSON.stringify(value));
  },

  /** Wipe all guest/local state (Settings -> "Hapus Data Lokal"). */
  clearAll(): void {
    backend.clearAll();
  },
};

export { KEYS };
