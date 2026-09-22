import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { streamKroomboxChat } from '../services/kroombox';
import { cleanAssistantText } from '../utils/assistantText';
import type { Segment } from '../types';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechModule = (typeof import('expo-speech-recognition'))['ExpoSpeechRecognitionModule'];
type EventSubscription = { remove: () => void };
type ActiveStream = { close: () => void };

export type VoiceCallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export function useVoiceCall(segment: Segment, recipeName?: string, stepLabel?: string) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const listenersRef = useRef<EventSubscription[]>([]);
  const moduleRef = useRef<SpeechModule | null>(null);
  const streamRef = useRef<ActiveStream | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const segmentRef = useRef(segment);
  const recipeRef = useRef({ recipeName, stepLabel });
  const listenRef = useRef<() => Promise<void>>(async () => undefined);
  const voiceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    segmentRef.current = segment;
    recipeRef.current = { recipeName, stepLabel };
  }, [segment, recipeName, stepLabel]);

  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const indonesian = voices.filter((voice) => /^id(?:-|_)/i.test(voice.language));
        voiceRef.current =
          indonesian.find((voice) => voice.quality === Speech.VoiceQuality.Enhanced)?.identifier ??
          indonesian[0]?.identifier;
      })
      .catch(() => undefined);
  }, []);

  const cleanupListeners = useCallback(() => {
    listenersRef.current.forEach((subscription) => subscription.remove());
    listenersRef.current = [];
  }, []);

  const loadModule = useCallback(async (): Promise<SpeechModule | null> => {
    if (moduleRef.current) return moduleRef.current;
    try {
      const imported = await import('expo-speech-recognition');
      moduleRef.current = imported.ExpoSpeechRecognitionModule;
      return moduleRef.current;
    } catch (error: unknown) {
      console.warn('[useVoiceCall] Speech recognition unavailable', error);
      return null;
    }
  }, []);

  const stopCall = useCallback(async () => {
    activeRef.current = false;
    processingRef.current = false;
    streamRef.current?.close();
    streamRef.current = null;
    setState('idle');
    Speech.stop();
    try {
      moduleRef.current?.abort();
    } catch {
      // Recognizer may already be stopped.
    }
    cleanupListeners();
  }, [cleanupListeners]);

  const resumeListening = useCallback(() => {
    processingRef.current = false;
    if (activeRef.current) listenRef.current().catch(() => undefined);
  }, []);

  const processUtterance = useCallback(
    (text: string) => {
      if (!activeRef.current) return;
      processingRef.current = true;
      setState('thinking');
      setErrorMsg(null);
      let response = '';

      streamRef.current = streamKroomboxChat(
        {
          message: [
            `Resep: ${recipeRef.current.recipeName || 'belum dipilih'}.`,
            `Langkah aktif: ${recipeRef.current.stepLabel || 'tidak ada'}.`,
            `Profil: ${segmentRef.current.ageGroup || 'umum'}, ${segmentRef.current.condition || 'umum'}.`,
            `Pertanyaan: ${text}`,
            'Jawab berdasarkan RAG. Langsung jawab inti pertanyaan dalam maksimal 2 kalimat pendek.',
            'Tanpa pembuka, pengulangan pertanyaan, daftar, markdown, emoji, simbol dekoratif, atau penutup basa-basi.',
            'Jika RAG tidak mendukung jawaban, katakan singkat dan jujur.',
          ].join('\n'),
          useRag: true,
          stream: true,
        },
        {
          onToken: (token) => {
            response += token;
          },
          onDone: () => {
            streamRef.current = null;
            if (!activeRef.current) return;
            const spoken = cleanAssistantText(response);
            if (!spoken) {
              processingRef.current = false;
              setState('error');
              setErrorMsg('Jawaban suara belum tersedia. Coba lagi.');
              return;
            }
            setState('speaking');
            Speech.speak(spoken, {
              language: 'id-ID',
              voice: voiceRef.current,
              rate: 0.94,
              pitch: 1,
              onDone: resumeListening,
              onError: resumeListening,
            });
          },
          onError: (error) => {
            console.warn('[useVoiceCall] AI stream failed', error);
            streamRef.current = null;
            if (!activeRef.current) return;
            processingRef.current = false;
            setState('error');
            setErrorMsg('Koneksi ke pendamping resep terganggu. Coba lagi.');
          },
        },
      );
    },
    [resumeListening],
  );

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    cleanupListeners();
    const speechModule = await loadModule();
    if (!speechModule || !activeRef.current) {
      if (activeRef.current) {
        setErrorMsg('Fitur suara tidak tersedia di perangkat ini.');
        setState('error');
      }
      return;
    }

    try {
      const permission = await speechModule.requestPermissionsAsync();
      if (!activeRef.current) {
        try {
          speechModule.abort();
        } catch {
          // Recognizer may not have started yet.
        }
        return;
      }
      if (!permission.granted) {
        setErrorMsg('Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP.');
        setState('error');
        return;
      }

      setErrorMsg(null);
      setState('listening');

      const resultSubscription = speechModule.addListener(
        'result',
        (event: ExpoSpeechRecognitionResultEvent) => {
          if (!activeRef.current) return;
          const text = event.results[0]?.transcript ?? '';
          if (event.isFinal && text.trim()) {
            processingRef.current = true;
            speechModule.stop();
            processUtterance(text.trim());
          }
        },
      );
      const errorSubscription = speechModule.addListener(
        'error',
        (event: ExpoSpeechRecognitionErrorEvent) => {
          if (!activeRef.current || event.error === 'aborted') return;
          if (event.error === 'speech-timeout' || event.error === 'no-speech') return;
          setErrorMsg(`Mikrofon terganggu: ${event.message || event.error}`);
          setState('error');
        },
      );
      const endSubscription = speechModule.addListener('end', () => {
        setTimeout(() => {
          if (activeRef.current && !processingRef.current) {
            listenRef.current().catch(() => undefined);
          }
        }, 500);
      });

      listenersRef.current = [resultSubscription, errorSubscription, endSubscription];
      speechModule.start({ lang: 'id-ID', interimResults: false, continuous: false });
    } catch (error: unknown) {
      console.warn('[useVoiceCall] Could not start microphone', error);
      setErrorMsg(error instanceof Error ? error.message : 'Gagal memulai mikrofon.');
      setState('error');
    }
  }, [cleanupListeners, loadModule, processUtterance]);

  useEffect(() => {
    listenRef.current = startListening;
  }, [startListening]);

  const startCall = useCallback(async () => {
    activeRef.current = true;
    await startListening();
  }, [startListening]);

  useEffect(
    () => () => {
      activeRef.current = false;
      processingRef.current = false;
      streamRef.current?.close();
      Speech.stop();
      cleanupListeners();
      try {
        moduleRef.current?.abort();
      } catch {
        // Recognizer may already be stopped.
      }
    },
    [cleanupListeners],
  );

  return { state, errorMsg, startCall, stopCall };
}
