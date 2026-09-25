import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { serverFailureText, streamKroomboxChat, type HistoryEntry } from '../services/kroombox';
import { VOICE_MAX_WORDS, cleanAssistantText } from '../utils/assistantText';
import { VOICE_HISTORY_LIMIT, VOICE_PERSONA, VOICE_RULES } from '../utils/chefPrompt';
import type { Segment } from '../types';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechModule = (typeof import('expo-speech-recognition'))['ExpoSpeechRecognitionModule'];
type EventSubscription = { remove: () => void };
type ActiveStream = { close: () => void };

export type VoiceCallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export function useVoiceCall(
  segment: Segment,
  recipeName?: string,
  stepLabel?: string,
  recipeIngredients?: string,
) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const listenersRef = useRef<EventSubscription[]>([]);
  const moduleRef = useRef<SpeechModule | null>(null);
  const streamRef = useRef<ActiveStream | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const segmentRef = useRef(segment);
  const recipeRef = useRef({ recipeName, stepLabel, recipeIngredients });
  const listenRef = useRef<() => Promise<void>>(async () => undefined);
  /** Riwayat percakapan suara (dikirim ke API supaya lanjutan nyambung). */
  const historyRef = useRef<HistoryEntry[]>([]);
  const voiceRef = useRef<string | undefined>(undefined);
  /**
   * Nomor "generasi" panggilan. Setiap panggilan baru / akhir panggilan menaikkannya.
   * Callback yang tertinggal dari panggilan lama (jawaban TTS selesai, pendengar mikrofon
   * berakhir) membandingkan nomornya dan berhenti sendiri — dulu callback lama ini masih
   * menyalakan ulang pendengar sesudah panggilan ditutup, sehingga panggilan "hidup lagi"
   * sendiri (mikrofon tampak menyala tanpa alasan).
   */
  const callGenerationRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    segmentRef.current = segment;
    recipeRef.current = { recipeName, stepLabel, recipeIngredients };
  }, [segment, recipeName, stepLabel, recipeIngredients]);

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

  /**
   * Akhiri panggilan. `keepHistory` dipakai tombol MATIKAN MIKROFON: mute lalu
   * nyalakan lagi tidak boleh menghapus memori percakapan. (Dulu pengosongan
   * riwayat ditaruh langsung di sini tanpa melihat siapa saja yang memanggilnya,
   * sehingga mute terasa seperti mengulang panggilan dari nol.)
   */
  const stopCall = useCallback(
    async (options?: { keepHistory?: boolean }) => {
      callGenerationRef.current += 1;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      activeRef.current = false;
      processingRef.current = false;
      if (!options?.keepHistory) historyRef.current = [];
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
    },
    [cleanupListeners],
  );

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
            VOICE_PERSONA,
            `Resep: ${recipeRef.current.recipeName || 'belum dipilih'}.`,
            `Langkah aktif: ${recipeRef.current.stepLabel || 'tidak ada'}.`,
            `Bahan resep ini: ${recipeRef.current.recipeIngredients || 'belum tercatat'}.`,
            `Profil: ${segmentRef.current.ageGroup || 'umum'}, ${segmentRef.current.condition || 'umum'}.`,
            // Aturan dasar versi upstream apa adanya + tambahan kita, disimpan di
            // chefPrompt.ts supaya bentuk jawaban Chef dan suara tidak berkelahi.
            ...VOICE_RULES,
            // Pertanyaan di ujung (bukan di tengah): aturan yang menumpuk SETELAH
            // pertanyaan membuat jawaban suara melenceng dari yang ditanya.
            `Pertanyaan: ${text}`,
          ].join('\n'),
          // Riwayat percakapan ikut dikirim supaya pertanyaan lanjutan nyambung.
          history: historyRef.current,
          useRag: true,
          stream: true,
          // Kuota token keluaran (dipungut dari versi upstream); 150 ≈ 3x batas 25 kata.
          maxTokens: 150,
        },
        {
          onToken: (token) => {
            response += token;
          },
          onDone: () => {
            streamRef.current = null;
            if (!activeRef.current) return;
            // Server kadang mengirim pesan kegagalannya sendiri sebagai "jawaban"
            // (mis. "Server AI gagal merespons: Error code: 503 …"). Jangan dibacakan
            // seolah-olah itu jawaban masakan.
            const failure = serverFailureText(response);
            if (failure) {
              processingRef.current = false;
              setState('error');
              setErrorMsg(failure);
              return;
            }
            const spoken = cleanAssistantText(response, { maxWords: VOICE_MAX_WORDS });
            if (!spoken) {
              processingRef.current = false;
              setState('error');
              setErrorMsg('Jawaban suara belum tersedia. Coba lagi.');
              return;
            }
            // Simpan giliran ini supaya pertanyaan berikutnya masih nyambung.
            const turns: HistoryEntry[] = [
              { role: 'user', content: text },
              { role: 'assistant', content: response },
            ];
            historyRef.current = [...historyRef.current, ...turns].slice(-VOICE_HISTORY_LIMIT);
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
          // `!processingRef.current`: jangan memproses kalimat yang sama dua kali kalau
          // hasil final datang beruntun sebelum pengolahan pertama selesai.
          if (event.isFinal && text.trim() && !processingRef.current) {
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
        const generation = callGenerationRef.current;
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (
            generation === callGenerationRef.current &&
            activeRef.current &&
            !processingRef.current
          ) {
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
    callGenerationRef.current += 1;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    activeRef.current = true;
    await startListening();
  }, [startListening]);

  useEffect(
    () => () => {
      activeRef.current = false;
      callGenerationRef.current += 1;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
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
