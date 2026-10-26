import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as Speech from 'expo-speech';
import { runTurnWithQualityRetry } from '../services/ai/qualityRetry';
import { createChatController } from '../services/chatController';
import type { ChatController, ChatState } from '../services/chatController';

interface Options {
  /** Konteks resep untuk prompt; dibaca saat kirim. */
  context: string;
  /** Mode sederhana: jawaban tidak dibacakan otomatis. Dibaca sekali saat panel dibuat. */
  simple: boolean;
  onAssistantMessage?: (text: string) => void;
}

/**
 * Pasang controller chat ke komponen. Satu controller per panel (state percakapan
 * tidak dibagi antar panel), dibuat sekali dan dilepas saat panel dicopot. Di SINI
 * stream & suara asli disuntikkan; module `services/chatController` sendiri tidak
 * tahu soal jaringan maupun expo-speech.
 */
export function useChatController({
  context,
  simple,
  onAssistantMessage,
}: Options): [ChatState, ChatController] {
  // Prop yang berubah antar render dibaca lewat ref, jadi controller tak perlu dibuat ulang.
  const latest = useRef({ context, onAssistantMessage });
  useEffect(() => {
    latest.current = { context, onAssistantMessage };
  });

  const [controller] = useState(() =>
    createChatController({
      // Dibungkus pemeriksa mutu: jawaban yang tidak menjawab pertanyaan diulang sekali.
      runTurn: runTurnWithQualityRetry,
      speech: {
        speak: (text) => Speech.speak(text, { language: 'id-ID', rate: 0.95 }),
        stop: () => Speech.stop(),
      },
      getContext: () => latest.current.context,
      onAssistantMessage: (text) => latest.current.onAssistantMessage?.(text),
      autoSpeak: !simple,
    }),
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return [state, controller];
}
