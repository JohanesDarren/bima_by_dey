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

  setSegment: (segment) => set({ segment }),

  setCategory: (category) => set({ category }),

  loadRecommendedMenus: async (segment) => {
    set({ loadingMenus: true, menusError: null });
    try {
      // Baca sambil jalan: kartu muncul begitu ada menu yang sudah lengkap.
      const menus = await getRecommendedMenus(segment, {
        onPartial: (partial) => set({ menus: partial, loadingMenus: false }),
      });
      set({ menus, loadingMenus: false, segment });
    } catch (e) {
      // Sebagian menu sudah tampil → jangan diganti kotak error.
      if (get().menus.length > 0) set({ loadingMenus: false });
      else {
        set({
          loadingMenus: false,
          menusError: (e as Error).message,
        });
      }
    }
  },

  doSearch: async (query, segment, category) => {
    set({ loadingMenus: true, menusError: null });
    try {
      const menus = await searchRecipes(
        { query, segment, category },
        { onPartial: (partial) => set({ menus: partial, loadingMenus: false }) },
      );
      set({ menus, loadingMenus: false, segment, category });
    } catch (e) {
      if (get().menus.length > 0) set({ loadingMenus: false });
      else set({ loadingMenus: false, menusError: (e as Error).message });
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

  reset: () =>
    set({
      segment: DEFAULT_SEGMENT,
      category: null,
      menus: [],
      loadingMenus: false,
      menusError: null,
      activeRecipe: null,
      activeMenu: null,
    }),
}));
