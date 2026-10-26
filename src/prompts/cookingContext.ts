import type { Recipe } from '../types';

/**
 * Teks konteks yang dikirim ke Chef AI selama mode masak — MURNI, jadi bentuknya
 * bisa diuji tanpa merender layar. Dulu disusun inline di CookingScreen.
 *
 * Kenapa bentuknya begini (diukur 2026-10-24):
 * versi lama hanya mengirim SATU langkah dan mendahuluinya dengan daftar seluruh
 * bahan. Model lalu mencampur keduanya — ditanya "langkah nomor 2 apa?", ia
 * menjawab "rebus dada ayam" padahal langkah 2 berisi "rebus beras sorgum",
 * karena "ayam" muncul lebih dulu di daftar bahan. Perbaikannya:
 *   1. daftar bahan ditandai sebagai bahan SELURUH resep, bukan bahan langkah ini;
 *   2. seluruh langkah dikirim bernomor, jadi pertanyaan "langkah nomor N" tetap
 *      bisa dijawab walau pengguna sedang membuka langkah lain;
 *   3. langkah yang sedang dibuka ditandai tegas dan dikutip apa adanya.
 */

/** Daftar bahan dipisah koma, atau `null` bila resep tidak mencatat bahan. */
export function ingredientList(recipe: Recipe): string | null {
  return recipe.ingredients?.length ? recipe.ingredients.join(', ') : null;
}

/** Satu baris langkah bernomor: `3. Tumis bumbu. Panaskan minyak...` */
function stepLine(recipe: Recipe, index: number): string {
  const step = recipe.steps[index];
  if (!step) return '';
  return `${index + 1}. ${step.title}. ${step.instruction}`;
}

/** Konteks panel chat untuk langkah `stepIdx` (0-based). */
export function buildCookingChatContext(recipe: Recipe, stepIdx: number): string {
  const ingredients = ingredientList(recipe) ?? 'belum tercatat';
  const step = recipe.steps[stepIdx];
  const total = recipe.steps.length;

  const allSteps = recipe.steps
    .map((_, index) => {
      const line = stepLine(recipe, index);
      return index === stepIdx ? `${line}   <-- SEDANG DIKERJAKAN` : line;
    })
    .join('\n');

  if (!step) {
    return [
      `Saya sedang memasak "${recipe.name}".`,
      `Bahan seluruh resep (bukan bahan satu langkah tertentu): ${ingredients}.`,
      `Daftar langkah:\n${allSteps}`,
      'Temani & bantu saya.',
    ].join('\n');
  }

  return [
    `Saya sedang memasak "${recipe.name}".`,
    `Bahan seluruh resep (bukan bahan satu langkah tertentu): ${ingredients}.`,
    `Daftar langkah:\n${allSteps}`,
    `Langkah aktif: ${stepIdx + 1} dari ${total}.`,
    // Dikutip dan ditandai tegas: inilah isi langkah yang sebenarnya, dan model
    // diminta tidak menggantinya dengan bahan lain dari daftar di atas.
    `Isi langkah aktif (KUTIPAN RESEP, jangan diubah atau diganti bahannya): "${step.title}. ${step.instruction}"`,
    'Bantu & temani saya selama proses masak, jawab pertanyaan saat saya ragu.',
  ].join('\n');
}

/** Label langkah untuk panggilan suara. */
export function buildCookingStepLabel(recipe: Recipe, stepIdx: number): string {
  const step = recipe.steps[stepIdx];
  return step
    ? `Langkah ${stepIdx + 1}/${recipe.steps.length}: ${step.title}. ${step.instruction}`
    : `Langkah ${stepIdx + 1} dari ${recipe.steps.length}`;
}

/**
 * Daftar langkah bernomor untuk mode suara.
 *
 * Panggilan suara tidak punya layar, jadi pengguna sering menyebut nomor langkah
 * ("langkah dua apa?"). Tanpa daftar ini, pertanyaan seperti itu hanya bisa
 * dijawab dari langkah yang kebetulan sedang terbuka.
 */
export function buildCookingStepsDigest(recipe: Recipe, activeIdx: number): string {
  return recipe.steps
    .map((_, index) => {
      const line = stepLine(recipe, index);
      return index === activeIdx ? `${line}   <-- SEDANG DIKERJAKAN` : line;
    })
    .join('\n');
}
