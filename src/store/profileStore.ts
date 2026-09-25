import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { localStore } from '../lib/storage';
import type { Profile, ProfileInput } from '../types';
import { AGE_GROUPS, SPECIAL_CONDITIONS } from '../constants';

interface ProfileState {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** True once the first fetch completed (auth or guest), used to gate routing. */
  hydrated: boolean;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (userId: string, input: ProfileInput) => Promise<{ error: string | null }>;
  reset: () => void;
}

/** Maps a ProfileInput (camelCase form) to the snake_case DB row. */
function toDbRow(input: ProfileInput) {
  return {
    full_name: input.fullName,
    target_age_group: input.targetAgeGroup,
    special_condition: input.specialCondition,
    ai_reasoning_enabled: input.aiReasoningEnabled,
    updated_at: new Date().toISOString(),
  };
}

function normalizeRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id ?? ''),
    full_name: row.full_name ? String(row.full_name) : null,
    target_age_group: AGE_GROUPS.some((g) => g.value === row.target_age_group)
      ? (row.target_age_group as Profile['target_age_group'])
      : null,
    special_condition: SPECIAL_CONDITIONS.some((c) => c.value === row.special_condition)
      ? (row.special_condition as Profile['special_condition'])
      : null,
    ai_reasoning_enabled: row.ai_reasoning_enabled !== false,
    created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updated_at: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
  };
}

/**
 * Profile (demographics) store backed by the Supabase `profiles` table.
 * Guests read/write a local cache instead of the DB (PRD F-01).
 */
export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  hydrated: false,

  fetchProfile: async (userId) => {
    set({ loading: true, error: null });
    // Guest: serve from MMKV cache immediately (nilai lama tetap diperiksa dulu —
    // perangkat bisa menyimpan kondisi yang sudah tidak ada di daftar, dan nilai
    // itu ikut terkirim ke RAG tanpa terlihat di layar).
    if (localStore.isGuestMode()) {
      const cached = localStore.getCachedProfile<Profile>();
      set({
        loading: false,
        profile: cached ? normalizeRow(cached as unknown as Record<string, unknown>) : null,
        hydrated: true,
      });
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      set({ loading: false, error: error.message, hydrated: true });
      return;
    }
    set({ loading: false, profile: data ? normalizeRow(data) : null, hydrated: true });
  },

  updateProfile: async (userId, input) => {
    // Guest: persist locally.
    if (localStore.isGuestMode()) {
      const existing = get().profile ?? {
        id: 'guest',
        created_at: new Date().toISOString(),
      };
      const next: Profile = {
        ...existing,
        full_name: input.fullName,
        target_age_group: input.targetAgeGroup,
        special_condition: input.specialCondition,
        ai_reasoning_enabled: input.aiReasoningEnabled,
        updated_at: new Date().toISOString(),
      };
      localStore.setCachedProfile(next);
      localStore.setAiReasoningEnabled(input.aiReasoningEnabled);
      set({ profile: next, error: null });
      return { error: null };
    }

    const { error } = await supabase.from('profiles').upsert({ id: userId, ...toDbRow(input) });

    if (error) return { error: error.message };

    // Reflect optimistic local state without a round-trip.
    const existing = get().profile;
    const next: Profile = {
      ...(existing ?? { id: userId, created_at: new Date().toISOString() }),
      ...toDbRow(input),
      id: userId,
    };
    set({ profile: next, error: null });
    return { error: null };
  },

  reset: () => set({ profile: null, loading: false, error: null, hydrated: false }),
}));
