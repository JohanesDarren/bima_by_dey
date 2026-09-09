import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

/**
 * Speech-to-Text dua arah (voice chat mode masak & diskusi resep).
 * Dibangun di atas expo-speech-recognition (SDK 57, New Architecture friendly):
 * user bicara → hasil transkrip dikirim sebagai pesan chat ke AI.
 *
 * Catatan platform:
 * - Android: butuh izin RECORD_AUDIO (app.json sudah set) + Google Speech service.
 * - iOS: butuh NSSpeechRecognitionUsageDescription (skip — fokus Android).
 * - Web: expo-speech-recognition mendukung Web Speech API bila browser punya.
 */
export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const available = Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web';

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setTranscript('');
    setError(null);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    if (e.error !== 'aborted') {
      setError('Tidak bisa mendengar. Coba lagi.');
    }
  });
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results?.[0]?.transcript ?? '';
    setTranscript(text);
    if (e.isFinal) {
      setListening(false);
    }
  });

  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // abaikan
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!available) return;
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Izin mikrofon ditolak. Izinkan di pengaturan HP.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'id-ID',
        interimResults: true,
        continuous: false,
      });
    } catch {
      setError('Gagal mulai mikrofon. Pastikan izin mikrofon diberikan.');
    }
  }, [available]);

  const stopListening = useCallback(async () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // abaikan — sudah berhenti
    }
  }, []);

  const resetTranscript = useCallback(() => setTranscript(''), []);

  return {
    available,
    listening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
