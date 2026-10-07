import { useEffect, useState } from 'react';
import type { MenuLoadingPhase } from '../types';

/** Fase memuat yang punya narasi sendiri. */
export type LoadingNarrationPhase = Exclude<MenuLoadingPhase, null> | 'detail' | 'voice' | 'chat';

/**
 * Narasi status per fase. Dipakai bergantian agar layar memuat menjelaskan apa
 * yang sedang dikerjakan, bukan sekadar berputar tanpa keterangan.
 */
const NARRATION: Record<LoadingNarrationPhase, string[]> = {
  menus: [
    'Menggiling pengetahuan sorgum…',
    'Merenung sejenak…',
    'Memikirkan menu…',
    'Menimbang gizi dan porsi…',
    'Mencocokkan dengan targetmu…',
    'Menyaring 3 pilihan terbaik…',
  ],
  recipes: [
    'Menyiapkan resep…',
    'Menakar bahan…',
    'Menyusun langkah memasak…',
    'Mencatat waktu tiap langkah…',
    'Merapikan detail resep…',
  ],
  detail: [
    'Menggiling pengetahuan…',
    'Mencari resep di catatan sorgum…',
    'Menyusun bahan dan langkah…',
  ],
  // Mode suara: status berputar selama Chef AI menyusun jawaban.
  voice: [
    'Menghubungkan ke RAG…',
    'Mencari pengetahuan yang relevan…',
    'Memeriksa konteks langkah…',
    'Merangkum jawaban singkat…',
    'Menyiapkan suara jawaban…',
  ],
  // Chat pendamping: status saat balasan disusun.
  chat: [
    'Menghubungkan ke pengetahuan sorgum…',
    'Mencari konteks yang relevan…',
    'Memeriksa kecocokan dengan resep…',
    'Merangkum jawaban terbaik…',
  ],
};

/** Lama tiap pesan tampil sebelum diganti (ms). */
const DEFAULT_INTERVAL_MS = 1800;

/**
 * Kembalikan pesan bergantian untuk `phase`. Timer hanya berjalan saat `active`
 * agar layar yang tidak memuat tidak ikut re-render.
 */
export function useLoadingNarration(
  phase: LoadingNarrationPhase,
  active = true,
  intervalMs = DEFAULT_INTERVAL_MS,
): string {
  const messages = NARRATION[phase];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active || messages.length <= 1) return;
    setIndex(0);
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % messages.length),
      intervalMs,
    );
    return () => clearInterval(timer);
  }, [active, messages, intervalMs]);

  return messages[index % messages.length] ?? messages[0] ?? '';
}
