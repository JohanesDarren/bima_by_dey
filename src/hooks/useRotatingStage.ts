import { useEffect, useState } from 'react';

/** Jeda pergantian teks tahapan menunggu. */
const STAGE_INTERVAL_MS = 2500;

/**
 * Teks tahapan menunggu yang bergantian selama `active` (mis. "Membaca resep…" →
 * "Menyusun jawaban…"). Kembali ke tahap pertama begitu tidak aktif lagi.
 * Dipakai panel chat (CHAT_LOADING_STAGES) & panggilan suara (VOICE_LOADING_STAGES).
 */
export function useRotatingStage(active: boolean, stages: readonly string[]): string {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }
    const timer = setInterval(() => setStage((value) => value + 1), STAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  return stages[stage % stages.length] ?? '';
}
