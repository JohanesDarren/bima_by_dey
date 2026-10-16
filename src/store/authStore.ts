import { create } from 'zustand';
import { localStore } from '../lib/storage';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  isGuest: boolean;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  signInAsGuest: () => void;
  signOut: () => Promise<void>;
}

/**
 * Auth store. Guest-only: every user runs as a guest, with state persisted
 * locally via MMKV. There is no remote auth provider.
 *
 * `bootstrap` runs once on the Splash screen and restores guest mode from disk.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  isGuest: false,
  bootstrapped: false,

  bootstrap: async () => {
    if (localStore.isGuestMode()) {
      set({ status: 'signedIn', isGuest: true, bootstrapped: true });
      return;
    }
    set({ status: 'signedOut', isGuest: false, bootstrapped: true });
  },

  signInAsGuest: () => {
    localStore.setGuestMode(true);
    set({ status: 'signedIn', isGuest: true });
  },

  signOut: async () => {
    localStore.setGuestMode(false);
    set({ status: 'signedOut', isGuest: false });
  },
}));
