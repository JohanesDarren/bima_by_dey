import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client (PRD §5.3).
 * Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
 * in a local `.env` file (see `.env.example`).
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[bima] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your project credentials.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Keep the JS client alive so sessions persist across cold starts.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
