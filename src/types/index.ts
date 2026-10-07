/** Domain types matching the Supabase schema in supabase/migrations/*.sql (snake_case). */

export type AgeGroup = 'Balita' | 'Anak SD' | 'Remaja' | 'Dewasa' | 'Lansia';
export type SpecialCondition = 'Bumil' | 'Busui' | 'ABK' | 'Umum';

export interface Profile {
  id: string; // = auth.users.id
  full_name: string | null;
  target_age_group: AgeGroup | null;
  special_condition: SpecialCondition | null;
  ai_reasoning_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Profile stripped of timestamps, used for editing/saving (camelCase in the form). */
export interface ProfileInput {
  fullName: string;
  targetAgeGroup: AgeGroup | null;
  specialCondition: SpecialCondition | null;
  aiReasoningEnabled: boolean;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id?: string;
  session_id?: string;
  role: MessageRole;
  content: string;
  reasoning_content: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Alur baru (discovery-first) — tipe hasil probe API RAG (2026-09-10)
// ---------------------------------------------------------------------------

/** Kategori sajian (dipilih user sebelum cari resep lain). */
export type FoodCategory = 'main_course' | 'soup' | 'dessert' | 'snack' | 'beverage' | 'other';

/** Segmentasi target: untuk siapa & kondisi khusus apa. */
export interface Segment {
  ageGroup: AgeGroup | null;
  condition: SpecialCondition | null;
}

/** Satu kartu menu andalan (dari RAG, format hasil probe). */
export interface MenuItem {
  name: string;
  description: string;
  /** Objek gizi: calories/protein/fiber/key_vitamins/minerals/notes. */
  nutrition: Record<string, string>;
  strengths: string[];
  weaknesses: string[];
  category: FoodCategory;
}

/** Satu langkah masak dengan durasi opsional. */
export interface RecipeStep {
  order: number;
  title: string;
  instruction: string;
  /** Menit; null = langkah tanpa timer. */
  durationMinutes: number | null;
}

/** Resep lengkap hasil RAG (format hasil probe). */
export interface Recipe {
  name: string;
  servings: number;
  ingredients: string[];
  steps: RecipeStep[];
  totalMinutes: number;
}

/** Segmen + kategori yang dipakai untuk request menu. */
export interface RecipeRequest {
  segment: Segment;
  category: FoodCategory | null;
  excludedNames?: string[];
  /** Berapa menu yang diminta (bawaan 2). Tiap menu = satu permintaan terpisah. */
  count?: number;
}
