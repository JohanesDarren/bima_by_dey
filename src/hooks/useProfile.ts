import { useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';

/**
 * Loads the user's demographic profile (auth) or the cached guest profile.
 * Exposes save + reset actions and a normalized `dirty` formatting helper.
 */
export function useProfile() {
  const userId = useAuthStore((s) => s.user?.id);
  const isGuest = useAuthStore((s) => s.isGuest);

  const profile = useProfileStore((s) => s.profile);
  const loading = useProfileStore((s) => s.loading);
  const error = useProfileStore((s) => s.error);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const reset = useProfileStore((s) => s.reset);

  useEffect(() => {
    if (userId || isGuest) {
      fetchProfile(userId ?? 'guest');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isGuest]);

  const actions = useMemo(
    () => ({
      save(input: Parameters<typeof updateProfile>[1]) {
        return updateProfile(userId ?? 'guest', input);
      },
      reset,
    }),
    [userId, updateProfile, reset],
  );

  return { profile, loading, error, ...actions };
}
