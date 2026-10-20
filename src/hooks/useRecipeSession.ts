import { useSyncExternalStore } from 'react';
import type { RecipeSessionState } from '../services/recipeSession';
import { recipeSession } from '../services/recipeSessionInstance';

/**
 * Langganan stabil di tingkat module. Bila ditulis sebagai arrow inline di dalam
 * `useRecipeSession`, referensinya berubah tiap render dan React akan berhenti
 * berlangganan lalu berlangganan ulang terus-menerus.
 */
const subscribe = (onChange: () => void) => recipeSession.subscribe(onChange);
const getSnapshot = () => recipeSession.getState();

/**
 * Berlangganan state sesi resep dari komponen. Layar cukup membaca hasilnya —
 * tidak lagi menyimpan salinan loading/error sendiri, dan tidak lagi mengintip
 * store lewat `getState()`. Aksi (open/retry/reset) dipanggil lewat instance
 * `recipeSession` dari `services/recipeSessionInstance`.
 */
export function useRecipeSession(): RecipeSessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
