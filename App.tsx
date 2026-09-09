import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { supabase } from './src/lib/supabase';
import { useAuthStore } from './src/store/authStore';

export default function App() {
  // Keep the auth store in sync with Supabase session lifecycle
  // (restore, token refresh, sign-out elsewhere).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const store = useAuthStore.getState();
      if (event === 'SIGNED_OUT') {
        store.signOut();
      } else if (session?.user) {
        useAuthStore.setState({ status: 'signedIn', user: session.user, isGuest: false });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
