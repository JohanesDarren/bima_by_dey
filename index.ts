import React from 'react';
import { registerRootComponent } from 'expo';
import 'react-native-gesture-handler';

interface ErrorUtilsLike {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

const runtime = globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike };
if (runtime.ErrorUtils) {
  const originalHandler = runtime.ErrorUtils.getGlobalHandler?.();
  runtime.ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const message = error instanceof Error ? error.message : error;
    console.error('[FATAL]', isFatal ? 'FATAL' : 'NON-FATAL', message);
    if (originalHandler) {
      try {
        originalHandler(error, isFatal);
      } catch {
        // Keep the fallback renderer alive if the native handler itself fails.
      }
    }
  });
}

let App: React.ComponentType;
try {
  App = (require('./App') as { default: React.ComponentType }).default;
} catch (error: unknown) {
  console.error('[index.ts] Failed to import App:', error);
  const { Text, View } = require('react-native') as typeof import('react-native');
  const message = error instanceof Error ? error.message : String(error);
  App = function FallbackApp() {
    return React.createElement(
      View,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 } },
      React.createElement(
        Text,
        { style: { color: 'red', textAlign: 'center', marginBottom: 10 } },
        'App gagal dimuat:',
      ),
      React.createElement(Text, { style: { textAlign: 'center' } }, message),
    );
  };
}

registerRootComponent(App);
