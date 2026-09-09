import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { localStore } from '../lib/storage';
import type { User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  isGuest: boolean;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInAsGuest: () => void;
  signOut: () => Promise<void>;
}

/**
 * Auth store. Supports:
 *  - Supabase email/password auth (persisted session, PRD F-01)
 *  - Guest mode backed by MMKV (PRD F-01)
 *  - Splash screen bootstrap restores either session.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  isGuest: false,
  bootstrapped: false,

  bootstrap: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      localStore.setLastUserId(session.user.id);
      set({ status: 'signedIn', user: session.user, isGuest: false, bootstrapped: true });
      return;
    }

    if (localStore.isGuestMode()) {
      set({ status: 'signedIn', user: null, isGuest: true, bootstrapped: true });
      return;
    }

    set({ status: 'signedOut', user: null, isGuest: false, bootstrapped: true });
  },

  signInWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    localStore.setLastUserId(user?.id ?? '');
    set({ status: 'signedIn', user, isGuest: false });
    return { error: null };
  },

  signUpWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  },

  signInAsGuest: () => {
    localStore.setGuestMode(true);
    set({ status: 'signedIn', user: null, isGuest: true });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    localStore.setGuestMode(false);
    set({ status: 'signedOut', user: null, isGuest: false });
  },
}));
