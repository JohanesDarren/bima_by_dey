import { create } from 'zustand';
import { localStore } from '../lib/storage';
import type { Profile, ProfileInput } from '../types';
import { AGE_GROUPS, SPECIAL_CONDITIONS } from '../constants';

interface ProfileState {
  profile: Profile | null;
  /** True once the first load completed, used to gate routing. */
  hydrated: boolean;
  fetchProfile: () => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<{ error: string | null }>;
  reset: () => void;
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
    created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
    updated_at: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
  };
}

/**
 * Profile (demographics) store. Guest-only: reads/writes the local MMKV cache
 * instead of a remote database.
 */
export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  hydrated: false,

  fetchProfile: async () => {
    // Nilai lama tetap diperiksa dulu — perangkat bisa menyimpan kondisi yang
    // sudah tidak ada di daftar, dan nilai itu ikut terkirim ke RAG tanpa
    // terlihat di layar.
    const cached = localStore.getCachedProfile<Profile>();
    set({
      profile: cached ? normalizeRow(cached as unknown as Record<string, unknown>) : null,
      hydrated: true,
    });
  },

  updateProfile: async (input) => {
    const existing = get().profile ?? {
      id: 'guest',
      created_at: new Date().toISOString(),
    };
    const next: Profile = {
      ...existing,
      full_name: input.fullName,
      target_age_group: input.targetAgeGroup,
      special_condition: input.specialCondition,
      updated_at: new Date().toISOString(),
    };
    localStore.setCachedProfile(next);
    set({ profile: next });
    return { error: null };
  },

  reset: () => set({ profile: null, hydrated: false }),
}));
