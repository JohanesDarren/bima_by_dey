import { create } from 'zustand';
import type { FoodCategory, MenuItem, Segment } from '../types';
import { searchRecipes } from '../services/menu';
import { describeError, UserFacingError } from '../services/errors';
import { MENU_COUNT, NO_NEW_MENU_MESSAGE } from '../constants';
import { menuKey } from '../utils/menuKey';

/**
 * Store alur menu (discovery-first): segmentasi terpilih, hasil menu, dan status
 * memuat/gagalnya.
 *
 * Catatan: state RESEP (resep aktif, memuat, galat) TIDAK lagi di sini. Dulu ia
 * hidup di store ini sekaligus disalin di layar detail resep, dan dua salinan itu
 * bisa berbeda. Sekarang pemilik tunggalnya adalah module `services/recipeSession`
 * (lihat hooks/useRecipeSession). Store ini hanya mengurus menu.
 */
interface FlowState {
  segment: Segment;
  category: FoodCategory | null;
  menus: MenuItem[];
  loadingMenus: boolean;
  menusError: string | null;

  setSegment: (segment: Segment) => void;
  setCategory: (category: FoodCategory | null) => void;
  generateMenus: (segment: Segment, category: FoodCategory, append?: boolean) => Promise<void>;
  reset: () => void;
}

const DEFAULT_SEGMENT: Segment = { ageGroup: null, condition: null };
let menuRequestId = 0;

export const useFlowStore = create<FlowState>((set, get) => ({
  segment: DEFAULT_SEGMENT,
  category: null,
  menus: [],
  loadingMenus: false,
  menusError: null,

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
    // PENTING: menu lama TIDAK dikosongkan di awal. Dulu `menus: []` dipasang di sini,
    // jadi ketika permintaan baru gagal, menu yang tadinya sudah tampil ikut hilang dan
    // pengguna melihat "Menu belum bisa dimuat" padahal sebelumnya baik-baik saja.
    // Sekarang daftar baru dipasang hanya setelah hasilnya benar-benar berhasil.
    set({ loadingMenus: true, menusError: null });
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
      if (generated.length === 0) throw new UserFacingError(NO_NEW_MENU_MESSAGE);
      const seen = new Set(previous.map((menu) => menuKey(menu.name)));
      const unique = generated.filter((menu) => !seen.has(menuKey(menu.name)));
      if (unique.length === 0) throw new UserFacingError(NO_NEW_MENU_MESSAGE);
      set({ menus: [...previous, ...unique], loadingMenus: false, segment, category });
    } catch (e) {
      if (requestId !== menuRequestId) return;
      // Kalimat galat dari satu module (`services/errors`): kegagalan berkelas membawa
      // sebabnya sendiri, galat lain jatuh ke kalimat pengganti konteks menu.
      // Menu lama dibiarkan utuh: yang gagal cuma permintaan barunya.
      set({ loadingMenus: false, menusError: describeError(e, 'menu') });
    }
  },

  reset: () => {
    menuRequestId += 1;
    set({
      segment: DEFAULT_SEGMENT,
      category: null,
      menus: [],
      loadingMenus: false,
      menusError: null,
    });
  },
}));
