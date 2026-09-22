import type { AgeGroup, SpecialCondition } from '../types';

/** Options for the Age Group picker (PRD F-02 / S-03). */
export const AGE_GROUPS: { label: string; value: AgeGroup; emoji: string }[] = [
  { label: 'Balita (0-5 th)', value: 'Balita', emoji: '👶' },
  { label: 'Anak SD (6-12 th)', value: 'Anak SD', emoji: '🧒' },
  { label: 'Remaja (13-17 th)', value: 'Remaja', emoji: '🧑' },
  { label: 'Dewasa (18-59 th)', value: 'Dewasa', emoji: '🧑‍🍳' },
  { label: 'Lansia (60+ th)', value: 'Lansia', emoji: '👵' },
];

/** Options for the Special Condition picker (PRD F-02 / S-03). */
export const SPECIAL_CONDITIONS: { label: string; value: SpecialCondition; emoji: string }[] = [
  { label: 'Umum / Tidak Ada', value: 'Umum', emoji: '✨' },
  { label: 'Ibu Hamil (Bumil)', value: 'Bumil', emoji: '🤰' },
  { label: 'Ibu Menyusui (Busui)', value: 'Busui', emoji: '🍼' },
  { label: 'Anak Berkebutuhan Khusus (ABK)', value: 'ABK', emoji: '🧩' },
];

export const isUnder18 = (ageGroup: AgeGroup | null): boolean =>
  ageGroup === 'Balita' || ageGroup === 'Anak SD' || ageGroup === 'Remaja';

export const isConditionAllowed = (
  ageGroup: AgeGroup | null,
  condition: SpecialCondition,
): boolean => {
  if (isUnder18(ageGroup) && (condition === 'Bumil' || condition === 'Busui')) return false;
  if (ageGroup === 'Lansia' && condition === 'Busui') return false;
  return true;
};

/** Stable order used by the kebab menu in Settings — never delete entries. */
export const SUPPORTED_AGE_GROUP_VALUES: AgeGroup[] = AGE_GROUPS.map((a) => a.value);
export const SUPPORTED_CONDITION_VALUES: SpecialCondition[] = SPECIAL_CONDITIONS.map(
  (c) => c.value,
);
