import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { streamKroomboxChat } from '../services/ai/transport';
import { runConversationTurn } from '../services/ai/conversationTurn';
import { createVoiceCall } from '../services/voiceCall';
import type { VoiceCallContext } from '../services/voiceCall';
import { createDeviceVoicePort } from '../services/voiceDevicePort';
import type { Segment } from '../types';

/**
 * Pasang panggilan suara ke komponen. Siklus panggilan (state machine) hidup di
 * `services/voiceCall`; di SINI hanya port perangkat dan stream asli yang disuntikkan.
 */
export function useVoiceCall(
  segment: Segment,
  recipeName?: string,
  stepLabel?: string,
  recipeIngredients?: string,
) {
  // Konteks yang berubah antar render dibaca lewat ref, jadi panggilan tak perlu dibuat ulang.
  const latest = useRef<VoiceCallContext>({ segment, recipeName, stepLabel, recipeIngredients });
  useEffect(() => {
    latest.current = { segment, recipeName, stepLabel, recipeIngredients };
  }, [segment, recipeName, stepLabel, recipeIngredients]);

  const [call] = useState(() =>
    createVoiceCall({
      port: createDeviceVoicePort(),
      runTurn: (request, observer) => runConversationTurn(request, streamKroomboxChat, observer),
      getContext: () => latest.current,
    }),
  );

  useEffect(() => () => call.dispose(), [call]);

  const { phase, errorMsg } = useSyncExternalStore(call.subscribe, call.getState, call.getState);
  return { state: phase, errorMsg, startCall: call.start, stopCall: call.stop };
}
