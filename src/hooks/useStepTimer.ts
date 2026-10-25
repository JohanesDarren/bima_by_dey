import { useEffect, useReducer, useRef } from 'react';
import { initialStepTimer, stepTimerReducer } from '../services/stepTimer';
import type { StepTimerState } from '../services/stepTimer';

export interface StepTimer extends StepTimerState {
  toggle: () => void;
  restart: () => void;
}

/**
 * Timer hitung mundur untuk langkah masak yang sedang aktif.
 *
 * `stepKey` menandai langkahnya (mis. nama resep + nomor langkah): tiap kali berubah,
 * timer diisi ulang dengan durasi langkah itu dan langsung berjalan. Logika state-nya
 * hidup di `services/stepTimer` (murni & teruji); hook ini hanya memasang interval.
 */
export function useStepTimer(
  durationMinutes: number | null | undefined,
  stepKey: string,
): StepTimer {
  const [state, dispatch] = useReducer(stepTimerReducer, durationMinutes, initialStepTimer);

  // Durasi dibaca lewat ref: yang memicu pengisian ulang hanya pergantian langkah.
  const durationRef = useRef(durationMinutes);
  durationRef.current = durationMinutes;
  const firstRun = useRef(true);
  useEffect(() => {
    // Render pertama sudah diisi oleh initialStepTimer.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    dispatch({
      type: 'reset',
      durationSeconds: initialStepTimer(durationRef.current).durationSeconds,
    });
  }, [stepKey]);

  // Penggerak: satu interval selama timer berjalan. Ganti langkah TIDAK mematikannya,
  // jadi hitung mundur langkah berikutnya tetap jalan.
  useEffect(() => {
    if (!state.running) return;
    const timer = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(timer);
  }, [state.running]);

  return {
    ...state,
    toggle: () => dispatch({ type: 'toggle' }),
    restart: () => dispatch({ type: 'restart' }),
  };
}
