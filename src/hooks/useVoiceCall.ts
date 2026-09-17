import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { chatKroombox } from '../services/kroombox';
import type { Segment } from '../types';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechModule = (typeof import('expo-speech-recognition'))['ExpoSpeechRecognitionModule'];
type EventSubscription = { remove: () => void };

export type VoiceCallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export function useVoiceCall(segment: Segment) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const listenersRef = useRef<EventSubscription[]>([]);
  const moduleRef = useRef<SpeechModule | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const segmentRef = useRef(segment);
  const listenRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    segmentRef.current = segment;
  }, [segment]);

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
    setState('idle');
    Speech.stop();
    try {
      moduleRef.current?.abort();
    } catch {
      // Recognizer may already be stopped.
    }
    cleanupListeners();
  }, [cleanupListeners]);

  const processUtterance = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    processingRef.current = true;
    setState('thinking');
    setAiResponse('');

    try {
      const response = await chatKroombox({
        message: `Konteks Segment: ${JSON.stringify(segmentRef.current)}. Pengguna berkata: "${text}". Jawablah HANYA berdasarkan pengetahuan RAG/resep yang tersedia dengan singkat, ramah, dan ringkas layaknya obrolan telepon (Voice Call). Jangan gunakan list, bullet point, atau format markdown. Maksimal 3 kalimat.`,
        useRag: true,
        stream: false,
      });
      if (!activeRef.current) return;

      setAiResponse(response);
      setState('speaking');
      Speech.speak(response, {
        language: 'id-ID',
        rate: 1,
        pitch: 1.05,
        onDone: () => {
          processingRef.current = false;
          if (activeRef.current) listenRef.current().catch(() => undefined);
        },
        onError: () => {
          processingRef.current = false;
          if (activeRef.current) listenRef.current().catch(() => undefined);
        },
      });
    } catch (error: unknown) {
      console.warn('[useVoiceCall] AI request failed', error);
      if (!activeRef.current) return;
      processingRef.current = false;
      setAiResponse('Maaf, koneksi ke pendamping resep sedang terganggu.');
      setState('error');
      setErrorMsg('Koneksi ke pendamping resep sedang terganggu. Coba lagi.');
    }
  }, []);

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
      if (!permission.granted) {
        setErrorMsg('Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP.');
        setState('error');
        return;
      }

      setErrorMsg(null);
      setTranscript('');
      setState('listening');

      const resultSubscription = speechModule.addListener(
        'result',
        (event: ExpoSpeechRecognitionResultEvent) => {
          if (!activeRef.current) return;
          const text = event.results[0]?.transcript ?? '';
          setTranscript(text);
          if (event.isFinal && text.trim()) {
            speechModule.stop();
            processUtterance(text.trim()).catch(() => undefined);
          }
        },
      );
      const errorSubscription = speechModule.addListener(
        'error',
        (event: ExpoSpeechRecognitionErrorEvent) => {
          if (!activeRef.current || event.error === 'aborted') return;
          if (event.error === 'speech-timeout' || event.error === 'no-speech') {
            return;
          }
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
      speechModule.start({ lang: 'id-ID', interimResults: true, continuous: false });
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

  return { state, transcript, aiResponse, errorMsg, startCall, stopCall };
}
