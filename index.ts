import React from 'react';
import { registerRootComponent } from 'expo';
import 'react-native-gesture-handler';

// Global error handler — tangkap unhandled native/JS errors SEBELUM app crash.
const g = globalThis as any;
if (g.ErrorUtils) {
  const originalHandler = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
    console.error('[FATAL]', isFatal ? 'FATAL' : 'NON-FATAL', err?.message ?? err);
    if (originalHandler) {
      try { originalHandler(err, isFatal); } catch { /* swallow */ }
    }
  });
}

// Wrap App import di try-catch — kalau ada import yang throw, fallback ke
// plain View biar tidak crash langsung.
let App: any;
try {
  App = require('./App').default;
} catch (e) {
  console.error('[index.ts] Failed to import App:', e);
  const { Text, View } = require('react-native');
  App = function FallbackApp() {
    return React.createElement(View,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
      React.createElement(Text, null, 'App gagal dimuat. Restart aplikasi.')
    );
  };
}

registerRootComponent(App);
