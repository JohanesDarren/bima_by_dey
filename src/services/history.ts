import { localStore } from '../lib/storage';
import type { Recipe, Segment } from '../types';

export interface HistorySession {
  id: string;
  recipeName: string;
  segment: Segment;
  finishedAt: string;
  /** Snapshot resep agar bisa dibuka lagi tanpa RAG. */
  recipe: Recipe;
  /** Catatan tanya-jawab singkat selama masak. */
  notes: string[];
}

export function saveCookHistory(session: HistorySession): HistorySession[] {
  const all = listCookHistory();
  all.unshift(session);
  const trimmed = all.slice(0, 50); // batasi 50 sesi
  localStore.setCookHistory(trimmed);
  return trimmed;
}

export function listCookHistory(): HistorySession[] {
  return localStore.getCookHistory<HistorySession>();
}

export function clearCookHistory(): void {
  localStore.setCookHistory([]);
}
