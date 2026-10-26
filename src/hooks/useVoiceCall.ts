import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { streamKroomboxChat } from '../services/ai/transport';
import { runConversationTurn } from '../services/ai/conversationTurn';
import { createVoiceCall } from '../services/voiceCall';
import type { VoiceCallContext } from '../services/voiceCall';
import { createDeviceVoicePort } from '../services/voiceDevicePort';
import type { VoiceCallMode } from '../services/voiceCallMachine';
import type { Segment } from '../types';

/**
 * Pasang panggilan suara ke komponen. Siklus panggilan (state machine) hidup di
 * `services/voiceCall`; di SINI hanya port perangkat dan stream asli yang disuntikkan.
 *
 * `mode` menentukan cara mikrofon dikendalikan:
 * - `auto`: mikrofon menyala terus (bawaan).
 * - `push`: mikrofon hanya menyala selama tombol ditekan — dipakai pada perangkat
 *   yang deteksi suaranya terlalu lebar sehingga merekam terus tanpa diminta.
 */
export function useVoiceCall(
  segment: Segment,
  recipeName?: string,
  stepLabel?: string,
  recipeIngredients?: string,
  mode: VoiceCallMode = 'auto',
  stepsDigest?: string,
) {
  // Konteks yang berubah antar render dibaca lewat ref, jadi panggilan tak perlu dibuat ulang.
  const latest = useRef<VoiceCallContext>({
    segment,
    recipeName,
    stepLabel,
    recipeIngredients,
    stepsDigest,
  });
  useEffect(() => {
    latest.current = { segment, recipeName, stepLabel, recipeIngredients, stepsDigest };
  }, [segment, recipeName, stepLabel, recipeIngredients, stepsDigest]);

  // Mode dibaca sekali saat panggilan dibuat: mengganti mode di tengah panggilan
  // akan membuat state mikrofon dan state machine tidak sinkron. Pemanggil
  // me-remount komponen (atau memanggil stop/start) bila mode berubah.
  const initialMode = useRef(mode);
  const [call] = useState(() =>
    createVoiceCall({
      port: createDeviceVoicePort(),
      runTurn: (request, observer) => runConversationTurn(request, streamKroomboxChat, observer),
      getContext: () => latest.current,
      mode: initialMode.current,
    }),
  );

  useEffect(() => () => call.dispose(), [call]);

  const { phase, errorMsg } = useSyncExternalStore(call.subscribe, call.getState, call.getState);
  return {
    state: phase,
    errorMsg,
    startCall: call.start,
    stopCall: call.stop,
    pressStart: call.pressStart,
    pressEnd: call.pressEnd,
  };
}
