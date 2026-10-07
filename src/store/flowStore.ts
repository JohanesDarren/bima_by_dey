import { create } from 'zustand';
import type { FoodCategory, MenuItem, MenuLoadingPhase, Recipe, Segment } from '../types';
import { getRecipe, searchRecipes } from '../services/menu';
import { menuKey } from '../utils/menuKey';

interface FlowState {
  segment: Segment;
  category: FoodCategory | null;
  menus: MenuItem[];
  loadingMenus: boolean;
  /** Tahap memuat berjalan: `menus` (menyusun daftar) atau `recipes` (prefetch resep). */
  loadingPhase: MenuLoadingPhase;
  menusError: string | null;
  /** Resep terpilih utk layar Cooking (fallback bila nav param tak ada). */
  activeRecipe: Recipe | null;
  activeMenu: MenuItem | null;
  /**
   * Detail resep hasil prefetch, keyed by menuKey(nama menu). Diisi begitu 3 menu
   * dibuat, supaya halaman detail tampil langsung tanpa layar muat susulan.
   */
  recipeCache: Record<string, Recipe>;

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
 * Semua permintaan resep yang sedang berjalan. Prefetch dan pembukaan detail
 * berbagi satu promise per menu, jadi RAG tidak ditembak dua kali.
 */
const recipeInflight = new Map<string, Promise<Recipe>>();
/** Ditambah saat segment/kategori/state direset agar hasil prefetch basi dibuang. */
let recipeEpoch = 0;

/**
 * Store untuk alur discovery-first: menahan segmentasi terpilih, hasil menu
 * RAG, dan resep aktif — dibagi antar Browse/RecipeDetail/Cooking/History.
 */
export const useFlowStore = create<FlowState>((set, get) => {
  /**
   * Ambil resep sekali saja: pakai cache bila ada; satukan permintaan yang
   * sedang berjalan; simpan hasilnya ke cache agar pemanggil berikutnya instan.
   */
  const ensureRecipe = (menu: MenuItem, segment: Segment): Promise<Recipe> => {
    const key = menuKey(menu.name);
    const cached = get().recipeCache[key];
    if (cached) return Promise.resolve(cached);
    const existing = recipeInflight.get(key);
    if (existing) return existing;
    const epoch = recipeEpoch;
    const request = getRecipe(menu.name, segment)
      .then((recipe) => {
        if (epoch === recipeEpoch) {
          set((state) => ({ recipeCache: { ...state.recipeCache, [key]: recipe } }));
        }
        return recipe;
      })
      .finally(() => {
        if (recipeInflight.get(key) === request) recipeInflight.delete(key);
      });
    recipeInflight.set(key, request);
    return request;
  };

  return {
    segment: DEFAULT_SEGMENT,
    category: null,
    menus: [],
    loadingMenus: false,
    loadingPhase: null,
    menusError: null,
    activeRecipe: null,
    activeMenu: null,
    recipeCache: {},

    setSegment: (segment) => {
      menuRequestId += 1;
      recipeEpoch += 1;
      recipeInflight.clear();
      set({
        segment,
        menus: [],
        loadingMenus: false,
        loadingPhase: null,
        menusError: null,
        recipeCache: {},
      });
    },

    setCategory: (category) => {
      menuRequestId += 1;
      recipeEpoch += 1;
      recipeInflight.clear();
      set({
        category,
        menus: [],
        loadingMenus: false,
        loadingPhase: null,
        menusError: null,
        recipeCache: {},
      });
    },

    generateMenus: async (segment, category, append = false) => {
      const requestId = ++menuRequestId;
      const previous = append ? get().menus : [];
      set({ loadingMenus: true, loadingPhase: 'menus', menusError: null });
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
        // Prefetch detail resep tiap menu sebelum menu ditampilkan. Pengguna
        // menunggu sekali di sini, lalu halaman detail terbuka penuh seketika.
        // Satu resep gagal tidak menggagalkan daftar menu — menu itu dimuat
        // on-demand dari layar detail.
        // Daftar sudah didapat; sisanya menyiapkan detail resep tiap menu.
        set({ loadingPhase: 'recipes' });
        await Promise.all(unique.map((menu) => ensureRecipe(menu, segment).catch(() => null)));
        if (requestId !== menuRequestId) return;
        set({
          menus: [...previous, ...unique],
          loadingMenus: false,
          loadingPhase: null,
          segment,
          category,
        });
      } catch (e) {
        if (requestId !== menuRequestId) return;
        set({ loadingMenus: false, loadingPhase: null, menusError: (e as Error).message });
      }
    },

    loadRecipe: async (menu, segment) => {
      const requestId = ++recipeRequestId;
      const cached = get().recipeCache[menuKey(menu.name)];
      if (cached) {
        set({ activeRecipe: cached, activeMenu: menu, menusError: null });
        return cached;
      }
      set({ activeRecipe: null, activeMenu: menu, menusError: null });
      try {
        const recipe = await ensureRecipe(menu, segment);
        if (requestId !== recipeRequestId) return null;
        set({ activeRecipe: recipe, activeMenu: menu });
        return recipe;
      } catch (e) {
        if (requestId !== recipeRequestId) return null;
        set({ menusError: (e as Error).message });
        return null;
      }
    },

    setActiveRecipe: (recipe, menu) => set({ activeRecipe: recipe, activeMenu: menu }),

    reset: () => {
      menuRequestId += 1;
      recipeRequestId += 1;
      recipeEpoch += 1;
      recipeInflight.clear();
      set({
        segment: DEFAULT_SEGMENT,
        category: null,
        menus: [],
        loadingMenus: false,
        loadingPhase: null,
        menusError: null,
        activeRecipe: null,
        activeMenu: null,
        recipeCache: {},
      });
    },
  };
});
