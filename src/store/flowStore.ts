import { create } from 'zustand';
import type { FoodCategory, MenuItem, Recipe, Segment } from '../types';
import { getRecipe, searchRecipes } from '../services/menu';
import { MENU_COUNT, NO_NEW_MENU_MESSAGE } from '../constants';
import { menuKey } from '../utils/menuKey';

interface FlowState {
  segment: Segment;
  category: FoodCategory | null;
  menus: MenuItem[];
  loadingMenus: boolean;
  menusError: string | null;
  /**
   * Galat pengambilan RESEP, dipisah dari `menusError`. Dulu keduanya memakai satu
   * field, sehingga kegagalan membuka resep ikut muncul sebagai "menu gagal dimuat"
   * di layar Beranda — dua urusan berbeda yang saling mengotori.
   */
  recipeError: string | null;
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
  recipeError: null,
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
    set({ loadingMenus: true, menusError: null, ...(append ? {} : { menus: [] }) });
    try {
      const generated = await searchRecipes({
        segment,
        category,
        count: MENU_COUNT,
        excludedNames: previous.map((menu) => menu.name),
      });
      if (requestId !== menuRequestId) return;
      // Sebagian hasil tetap berguna: tampilkan yang ada, jangan dibuang.
      // (Server mengirim jawaban sekaligus di akhir, jadi tidak ada gunanya
      // menampilkan bertahap — semua menu muncul bersama di sini.)
      if (generated.length === 0) throw new Error(NO_NEW_MENU_MESSAGE);
      const seen = new Set(previous.map((menu) => menuKey(menu.name)));
      const unique = generated.filter((menu) => !seen.has(menuKey(menu.name)));
      if (unique.length === 0) throw new Error(NO_NEW_MENU_MESSAGE);
      set({ menus: [...previous, ...unique], loadingMenus: false, segment, category });
    } catch (e) {
      if (requestId !== menuRequestId) return;
      const message = (e as Error)?.message?.trim() || NO_NEW_MENU_MESSAGE;
      set({ loadingMenus: false, menusError: message });
    }
  },

  loadRecipe: async (menu, segment) => {
    // Penjaga balapan: dua menu dibuka cepat → yang menang harus yang terakhir
    // diminta, bukan yang terakhir selesai (jawaban RAG bisa datang tak berurutan).
    const requestId = ++recipeRequestId;
    set({ recipeError: null });
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
      if (requestId === recipeRequestId) set({ recipeError: message });
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
      recipeError: null,
      activeRecipe: null,
      activeMenu: null,
    });
  },
}));
