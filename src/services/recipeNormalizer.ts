import type { Recipe } from '../types';
import { cleanAssistantText, limitSentences } from '../utils/assistantText';

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeRecipeResponse(value: unknown, requestedName: string): Recipe | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Recipe> & Record<string, unknown>;
  const servings = finiteNumber(raw.servings);
  const totalMinutes = finiteNumber(raw.totalMinutes);
  if (
    servings === null ||
    servings <= 0 ||
    totalMinutes === null ||
    totalMinutes < 0 ||
    !Array.isArray(raw.ingredients) ||
    raw.ingredients.length === 0 ||
    !Array.isArray(raw.steps) ||
    raw.steps.length === 0
  ) {
    return null;
  }

  const ingredients = raw.ingredients
    .map((item) => cleanAssistantText(String(item)))
    .filter(Boolean);
  const steps = raw.steps.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const step = value as unknown as Record<string, unknown>;
    const title = limitSentences(String(step.title ?? ''), 1);
    const instruction = limitSentences(String(step.instruction ?? ''), 2);
    if (!title || !instruction) return [];
    const duration = finiteNumber(step.durationMinutes);
    return [
      {
        order: index + 1,
        title,
        instruction,
        durationMinutes: duration !== null && duration > 0 ? duration : null,
      },
    ];
  });
  if (ingredients.length === 0 || steps.length !== raw.steps.length) return null;

  return {
    name: requestedName,
    servings,
    ingredients,
    steps,
    totalMinutes,
  };
}
