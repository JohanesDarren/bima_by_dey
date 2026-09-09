import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';

/**
 * Composes the auth + profile stores so Profile Setup / Chat screens get one
 * stable hook. Bootstraps the Supabase session + guest state once on mount.
 */
export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  const profile = useProfileStore((s) => s.profile);

  useEffect(() => {
    if (!bootstrapped) {
      bootstrap();
    }
  }, [bootstrapped, bootstrap]);

  return { status, user, isGuest, bootstrapped, profile };
}
