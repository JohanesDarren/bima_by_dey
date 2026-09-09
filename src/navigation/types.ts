import type { FoodCategory, MenuItem, Recipe, Segment } from '../types';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  ProfileSetup: undefined;
  Settings: undefined;
  /** Alur baru (discovery-first) */
  Browse: undefined;
  RecipeDetail: { menu?: MenuItem } | undefined;
  Cooking: { recipe: Recipe } | undefined;
  History: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

/** State berbagi antar screen alur masak (segment terpilih, dll). */
export interface FlowContext {
  segment: Segment;
  category: FoodCategory | null;
}

export type { FoodCategory, MenuItem, Recipe, Segment };
