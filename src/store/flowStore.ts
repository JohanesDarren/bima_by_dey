import { create } from 'zustand';
import type { FoodCategory, MenuItem, Recipe, Segment } from '../types';
import { getRecipe, searchRecipes } from '../services/menu';
import { menuKey } from '../utils/menuKey';

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
  generateMenus: (segment: Segment, category: FoodCategory, append?: boolean) => Promise<void>;
  loadRecipe: (menu: MenuItem, segment: Segment) => Promise<Recipe | null>;
  setActiveRecipe: (recipe: Recipe | null, menu: MenuItem | null) => void;
  reset: () => void;
}

const DEFAULT_SEGMENT: Segment = { ageGroup: null, condition: null };
let menuRequestId = 0;
let recipeRequestId = 0;

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

  setCategory: (category) => {
    menuRequestId += 1;
    set({ category, menus: [], loadingMenus: false, menusError: null });
  },

  generateMenus: async (segment, category, append = false) => {
    const requestId = ++menuRequestId;
    const previous = append ? get().menus : [];
    set({ loadingMenus: true, menusError: null });
    try {
      const generated = await searchRecipes({
        segment,
        category,
        excludedNames: previous.map((menu) => menu.name),
      });
      if (requestId !== menuRequestId) return;
      const seen = new Set(previous.map((menu) => menuKey(menu.name)));
      const unique = generated.filter((menu) => !seen.has(menuKey(menu.name))).slice(0, 3);
      if (unique.length !== 3) throw new Error('RAG belum menghasilkan 3 menu baru. Coba lagi.');
      set({ menus: [...previous, ...unique], loadingMenus: false, segment, category });
    } catch (e) {
      if (requestId !== menuRequestId) return;
      set({ loadingMenus: false, menusError: (e as Error).message });
    }
  },

  loadRecipe: async (menu, segment) => {
    // Penjaga balapan: dua menu dibuka cepat → yang menang harus yang terakhir
    // diminta, bukan yang terakhir selesai (jawaban RAG bisa datang tak berurutan).
    const requestId = ++recipeRequestId;
    try {
      const recipe = await getRecipe(menu.name, segment);
      if (requestId !== recipeRequestId) return recipe;
      set({ activeRecipe: recipe, activeMenu: menu });
      return recipe;
    } catch (e) {
      // Pesan kosong dulu membuat layar menampilkan kalimat generik ("Resep RAG
      // belum tersedia") dan sebab aslinya hilang.
      const message =
        (e as Error)?.message?.trim() || 'Koneksi ke layanan resep terputus. Coba lagi.';
      if (requestId === recipeRequestId) set({ menusError: message });
      return null;
    }
  },

  setActiveRecipe: (recipe, menu) => set({ activeRecipe: recipe, activeMenu: menu }),

  reset: () => {
    menuRequestId += 1;
    recipeRequestId += 1;
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
