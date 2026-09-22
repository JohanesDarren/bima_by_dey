import { create } from 'zustand';
import type { FoodCategory, MenuItem, Recipe, Segment } from '../types';
import { getRecipe, getRecommendedMenus, searchRecipes } from '../services/menu';

interface FlowState {
  segment: Segment;
  category: FoodCategory | null;
  menus: MenuItem[];
  loadingMenus: boolean;
  menusError: string | null;
  /** Resep terpilih utk layar Cooking (fallback bila nav param tak ada). */
  activeRecipe: Recipe | null;
  activeMenu: MenuItem | null;

  setSegment: (segment: Segment) => void;
  setCategory: (category: FoodCategory | null) => void;
  loadRecommendedMenus: (segment: Segment) => Promise<void>;
  doSearch: (query: string, segment: Segment, category: FoodCategory | null) => Promise<void>;
  loadRecipe: (menu: MenuItem, segment: Segment) => Promise<Recipe | null>;
  setActiveRecipe: (recipe: Recipe | null, menu: MenuItem | null) => void;
  reset: () => void;
}

const DEFAULT_SEGMENT: Segment = { ageGroup: null, condition: null };
let menuRequestId = 0;

/**
 * Store untuk alur discovery-first: menahan segmentasi terpilih, hasil menu
 * RAG, dan resep aktif — dibagi antar Browse/RecipeDetail/Cooking/History.
 */
export const useFlowStore = create<FlowState>((set, get) => ({
  segment: DEFAULT_SEGMENT,
  category: null,
  menus: [],
  loadingMenus: false,
  menusError: null,
  activeRecipe: null,
  activeMenu: null,

  setSegment: (segment) => {
    menuRequestId += 1;
    set({ segment, menus: [], loadingMenus: false, menusError: null });
  },

  setCategory: (category) => set({ category }),

  loadRecommendedMenus: async (segment) => {
    const requestId = ++menuRequestId;
    set({ loadingMenus: true, menusError: null });
    try {
      const menus = await getRecommendedMenus(segment, 3);
      if (requestId !== menuRequestId) return;
      set({ menus, loadingMenus: false, segment });
    } catch (e) {
      if (requestId !== menuRequestId) return;
      set({
        loadingMenus: false,
        menusError: (e as Error).message,
      });
    }
  },

  doSearch: async (query, segment, category) => {
    const requestId = ++menuRequestId;
    set({ loadingMenus: true, menusError: null });
    try {
      const menus = await searchRecipes({ query, segment, category });
      if (requestId !== menuRequestId) return;
      set({ menus, loadingMenus: false, segment, category });
    } catch (e) {
      if (requestId !== menuRequestId) return;
      set({ loadingMenus: false, menusError: (e as Error).message });
    }
  },

  loadRecipe: async (menu, segment) => {
    try {
      const recipe = await getRecipe(menu.name, segment);
      set({ activeRecipe: recipe, activeMenu: menu });
      return recipe;
    } catch (e) {
      set({ menusError: (e as Error).message });
      return null;
    }
  },

  setActiveRecipe: (recipe, menu) => set({ activeRecipe: recipe, activeMenu: menu }),

  reset: () => {
    menuRequestId += 1;
    set({
      segment: DEFAULT_SEGMENT,
      category: null,
      menus: [],
      loadingMenus: false,
      menusError: null,
      activeRecipe: null,
      activeMenu: null,
    });
  },
}));
