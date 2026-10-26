import * as Speech from 'expo-speech';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { MIC_UNAVAILABLE_MESSAGE } from './voiceCallMachine';
import type { VoicePort } from './voiceCall';

type SpeechModule = (typeof import('expo-speech-recognition'))['ExpoSpeechRecognitionModule'];
type EventSubscription = { remove: () => void };

/**
 * Port suara untuk perangkat sungguhan: expo-speech-recognition (mikrofon) + expo-speech
 * (TTS). Hanya menerjemahkan API perangkat ke bentuk `VoicePort`; tidak ada keputusan
 * panggilan di sini (itu milik `voiceCallMachine`).
 */
export function createDeviceVoicePort(): VoicePort {
  let recognizer: SpeechModule | null = null;
  let subscriptions: EventSubscription[] = [];
  let voice: string | undefined;

  let voiceLookupStarted = false;
  /** Dipanggil dari `prepareMic` (bukan saat port dibuat, yang terjadi saat render). */
  const lookUpVoice = () => {
    if (voiceLookupStarted) return;
    voiceLookupStarted = true;
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const indonesian = voices.filter((candidate) => /^id(?:-|_)/i.test(candidate.language));
        voice =
          indonesian.find((candidate) => candidate.quality === Speech.VoiceQuality.Enhanced)
            ?.identifier ?? indonesian[0]?.identifier;
      })
      .catch(() => undefined);
  };

  const detach = () => {
    subscriptions.forEach((subscription) => subscription.remove());
    subscriptions = [];
  };

  const load = async (): Promise<SpeechModule | null> => {
    if (recognizer) return recognizer;
    try {
      const imported = await import('expo-speech-recognition');
      recognizer = imported.ExpoSpeechRecognitionModule;
      return recognizer;
    } catch (error: unknown) {
      console.warn('[voiceCall] Speech recognition unavailable', error);
      return null;
    }
  };

  return {
    async prepareMic() {
      lookUpVoice();
      detach();
      const loaded = await load();
      if (!loaded) return 'unavailable';
      const permission = await loaded.requestPermissionsAsync();
      return permission.granted ? 'ready' : 'denied';
    },

    startMic(sink) {
      if (!recognizer) throw new Error(MIC_UNAVAILABLE_MESSAGE);
      const active = recognizer;
      detach();
      subscriptions = [
        active.addListener('result', (event: ExpoSpeechRecognitionResultEvent) =>
          sink.onResult({
            text: event.results[0]?.transcript ?? '',
            isFinal: event.isFinal,
            // Keyakinan pengenal dipakai penyaring mode bebas-tangan; -1 berarti
            // perangkat tidak melaporkannya.
            confidence: event.results[0]?.confidence ?? -1,
          }),
        ),
        active.addListener('error', (event: ExpoSpeechRecognitionErrorEvent) =>
          sink.onError({ code: event.error, message: event.message }),
        ),
        active.addListener('end', () => sink.onEnd()),
      ];
      active.start({ lang: 'id-ID', interimResults: false, continuous: false });
    },

    finishMic() {
      recognizer?.stop();
    },

    abortMic() {
      try {
        recognizer?.abort();
      } catch {
        // Pengenal bisa saja sudah berhenti.
      }
      detach();
    },

    speak(text, onSettled) {
      Speech.speak(text, {
        language: 'id-ID',
        voice,
        rate: 0.94,
        pitch: 1,
        onDone: onSettled,
        onError: onSettled,
      });
    },

    stopSpeaking() {
      Speech.stop();
    },
  };
}
