import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RootNavigator } from './navigation/RootNavigator';
import { pruneExpiredCache } from './services/cache';

export default function App() {
  // Bersihkan simpanan resep/menu yang sudah basi (sekali, setelah tampilan pertama).
  useEffect(() => {
    pruneExpiredCache();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <RootNavigator />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
