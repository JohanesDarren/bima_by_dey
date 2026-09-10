import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Speech-to-Text dua arah (voice chat mode masak & diskusi resep).
 *
 * CRITICAL: expo-speech-recognition native module TIDAK boleh di-import di
 * top-level. Jika module gagal load (TurboModule registration failure di
 * New Architecture, device tanpa Google Speech service, dll), app akan
 * crash SEBELUM ErrorBoundary sempat mount → APK force close saat dibuka.
 *
 * Solusi: lazy import di dalam try-catch, fallback gracefully bila module
 * tidak tersedia.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechEventHook = (event: string, handler: (e: any) => void) => void;

let _speechModule: SpeechModule | null | undefined;
let _useSpeechEvent: SpeechEventHook | null | undefined;

async function loadSpeechModule(): Promise<{
  module: SpeechModule | null;
  useEvent: SpeechEventHook | null;
}> {
  if (_speechModule !== undefined) {
    return { module: _speechModule!, useEvent: _useSpeechEvent! };
  }
  try {
    const mod = await import('expo-speech-recognition');
    _speechModule = mod.ExpoSpeechRecognitionModule ?? null;
    _useSpeechEvent = mod.useSpeechRecognitionEvent ?? null;
  } catch (e) {
    console.warn('[useVoiceInput] Failed to load speech module:', e);
    _speechModule = null;
    _useSpeechEvent = null;
  }
  return { module: _speechModule!, useEvent: _useSpeechEvent! };
}

export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [moduleReady, setModuleReady] = useState(false);

  const available = Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web';

  // Lazy load module on mount
  useEffect(() => {
    let mounted = true;
    loadSpeechModule().then(({ module, useEvent }) => {
      if (!mounted) return;
      if (!module || !useEvent) {
        console.warn('[useVoiceInput] Speech module not available, voice disabled');
        setModuleReady(false);
        return;
      }
      setModuleReady(true);

      useEvent('start', () => {
        setListening(true);
        setTranscript('');
        setError(null);
      });
      useEvent('end', () => setListening(false));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useEvent('error', (e: any) => {
        setListening(false);
        if (e.error !== 'aborted') {
          setError('Tidak bisa mendengar. Coba lagi.');
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useEvent('result', (e: any) => {
        const text = e.results?.[0]?.transcript ?? '';
        setTranscript(text);
        if (e.isFinal) {
          setListening(false);
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!available) return;
    setError(null);
    const { module } = await loadSpeechModule();
    if (!module) {
      setError('Fitur suara tidak tersedia di perangkat ini.');
      return;
    }
    try {
      const perm = await module.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Izin mikrofon ditolak. Izinkan di pengaturan HP.');
        return;
      }
      module.start({ lang: 'id-ID', interimResults: true, continuous: false });
    } catch (e) {
      console.warn('[useVoiceInput] start failed:', e);
      setError('Gagal mulai mikrofon. Pastikan izin mikrofon diberikan.');
    }
  }, [available]);

  const stopListening = useCallback(async () => {
    const { module } = await loadSpeechModule();
    if (!module) return;
    try {
      module.stop();
    } catch {
      // abaikan — sudah berhenti
    }
  }, []);

  const resetTranscript = useCallback(() => setTranscript(''), []);

  return {
    available: available && moduleReady,
    listening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
