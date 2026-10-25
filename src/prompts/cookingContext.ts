import type { Recipe } from '../types';

/**
 * Teks konteks yang dikirim ke Chef AI selama mode masak — MURNI, jadi bentuknya
 * bisa diuji tanpa merender layar. Dulu disusun inline di CookingScreen.
 */

/** Daftar bahan dipisah koma, atau `null` bila resep tidak mencatat bahan. */
export function ingredientList(recipe: Recipe): string | null {
  return recipe.ingredients?.length ? recipe.ingredients.join(', ') : null;
}

/** Konteks panel chat untuk langkah `stepIdx` (0-based). */
export function buildCookingChatContext(recipe: Recipe, stepIdx: number): string {
  const ingredients = ingredientList(recipe) ?? 'belum tercatat';
  const step = recipe.steps[stepIdx];
  return step
    ? `Saya sedang memasak "${recipe.name}". Bahan resep ini: ${ingredients}. Langkah ${stepIdx + 1}/${recipe.steps.length}: ${step.title}. ${step.instruction}. Bantu & temani saya selama proses masak, jawab pertanyaan saat saya ragu.`
    : `Saya sedang memasak "${recipe.name}". Bahan resep ini: ${ingredients}. Temani & bantu saya.`;
}

/** Label langkah untuk panggilan suara. */
export function buildCookingStepLabel(recipe: Recipe, stepIdx: number): string {
  const step = recipe.steps[stepIdx];
  return step
    ? `Langkah ${stepIdx + 1}/${recipe.steps.length}: ${step.title}. ${step.instruction}`
    : `Langkah ${stepIdx + 1} dari ${recipe.steps.length}`;
}
