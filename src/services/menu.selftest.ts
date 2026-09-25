import { normalizeRecipeResponse } from './recipeNormalizer';

const recipe = normalizeRecipeResponse(
  {
    name: 'Nama RAG sedikit berbeda',
    servings: '2',
    ingredients: ['100 g sorgum', '200 ml air'],
    steps: [
      { order: '1', title: 'Cuci', instruction: 'Cuci sorgum.', durationMinutes: null },
      { order: '2', title: 'Masak', instruction: 'Masak hingga matang.', durationMinutes: '20' },
    ],
    totalMinutes: '25',
  },
  'Nama menu yang dipilih',
);

if (
  !recipe ||
  recipe.name !== 'Nama menu yang dipilih' ||
  recipe.steps[1]?.durationMinutes !== 20
) {
  throw new Error('Recipe normalization failed.');
}

console.log('menu recipe self-test passed');
