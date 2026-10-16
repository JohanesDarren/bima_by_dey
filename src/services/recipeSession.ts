import type { Recipe, Segment } from '../types';
import { menuKey } from '../utils/menuKey';

/**
 * Module "sesi resep": pemilik TUNGGAL siklus hidup membuka satu resep —
 * ambil (dari cache perangkat atau RAG), status memuat / gagal / siap, coba lagi,
 * dan resep aktif.
 *
 * Kenapa jadi module sendiri: dulu state ini hidup di DUA tempat sekaligus —
 * sebagian di flowStore (`activeRecipe` / `activeMenu` / `recipeError`) dan
 * sebagian lagi disalin di dalam layar detail (`loading` / `error` / `loadedRecipe`),
 * yang bahkan mengintip store lewat `getState()` untuk membaca galatnya. Dua salinan
 * itu bisa berbeda: layar menampilkan "sedang memuat" padahal store sudah gagal, atau
 * sebaliknya.
 *
 * Pengambil resep DISUNTIKKAN (`fetchRecipe`), sama seperti stream pada module
 * giliran percakapan. Karena itu module ini tak pernah membuka jaringan sendiri dan
 * seluruh transisi statusnya bisa diuji tanpa merender layar.
 */
export type RecipeSessionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RecipeSessionState {
  status: RecipeSessionStatus;
  /** Resep aktif; hanya terisi saat status `ready`. */
  recipe: Recipe | null;
  /** Kalimat galat siap-tampil; hanya terisi saat status `error`. */
  error: string | null;
  /**
   * Menu yang sesinya sedang dibuka, atau `null` saat kosong / dibuka dari snapshot
   * riwayat (yang tidak punya menu). Jangan dibaca mentah oleh pemanggil untuk
   * memutuskan tampilan — pakai `statusFor`, yang sudah menangani kasus "sesi masih
   * memegang menu lain".
   */
  menuName: string | null;
}

/** Ambil resep untuk sebuah menu (dari cache perangkat atau RAG). */
export type RecipeFetcher = (menuName: string, segment: Segment) => Promise<Recipe>;

export interface RecipeSession {
  getState(): RecipeSessionState;
  /** Langganan perubahan state; mengembalikan fungsi berhenti berlangganan. */
  subscribe(listener: () => void): () => void;
  /**
   * Status yang relevan untuk sebuah menu. Bila sesi ini belum menyiapkan resep menu
   * itu (mis. effect `open` belum sempat jalan), kembalikan `'loading'` — jangan
   * menyodorkan resep MENU LAIN yang kebetulan masih tertinggal di sesi.
   */
  statusFor(menuName: string): RecipeSessionStatus;
  /** Buka resep sebuah menu. Bila sesi untuk menu itu sudah ada, tidak diulang. */
  open(menuName: string, segment: Segment): Promise<void>;
  /** Buka resep dari snapshot (riwayat) — tanpa jaringan, tanpa menu palsu. */
  openSnapshot(recipe: Recipe): void;
  /** Ulangi permintaan terakhir yang gagal. */
  retry(): Promise<void>;
  /** Kosongkan sesi (mis. saat menghapus data lokal). */
  reset(): void;
}

const IDLE: RecipeSessionState = { status: 'idle', recipe: null, error: null, menuName: null };

/** Dipakai bila galat tak membawa pesan yang bisa ditampilkan. */
const GENERIC_ERROR = 'Layanan resep tidak merespons. Coba lagi sebentar lagi.';

/**
 * Nama menu dibandingkan lewat `menuKey` (spasi, tanda baca, besar-kecil huruf
 * diabaikan) — konvensi yang sama dipakai cache, penyaring menu, dan store.
 * Membandingkan nama mentah-mentah pernah membuat resep yang SUDAH dimuat dibuang
 * karena namanya beda tipis dari nama menu.
 */
const sameMenu = (a: string | null, b: string): boolean => a !== null && menuKey(a) === menuKey(b);

export function createRecipeSession(fetchRecipe: RecipeFetcher): RecipeSession {
  let state: RecipeSessionState = IDLE;
  let lastRequest: { menuName: string; segment: Segment } | null = null;
  /** Penjaga balapan: permintaan yang lebih baru menang, bukan yang terakhir selesai. */
  let requestId = 0;
  const listeners = new Set<() => void>();

  function set(next: RecipeSessionState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  async function load(menuName: string, segment: Segment): Promise<void> {
    const id = ++requestId;
    lastRequest = { menuName, segment };
    set({ status: 'loading', recipe: null, error: null, menuName });
    try {
      const recipe = await fetchRecipe(menuName, segment);
      if (id !== requestId) return;
      set({ status: 'ready', recipe, error: null, menuName });
    } catch (error) {
      if (id !== requestId) return;
      // Pesan kosong dulu membuat layar menampilkan kalimat generik dan sebab
      // aslinya hilang; kalimat penggantinya kini dimiliki module ini.
      const message = (error as Error)?.message?.trim() || GENERIC_ERROR;
      set({ status: 'error', recipe: null, error: message, menuName });
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    statusFor(menuName) {
      if (!sameMenu(state.menuName, menuName)) return 'loading';
      return state.status === 'idle' ? 'loading' : state.status;
    },

    open(menuName, segment) {
      // Sudah punya sesi AKTIF untuk menu ini (sedang memuat atau sudah siap) → jangan
      // ambil ulang: inilah yang membuat membuka ulang resep yang sama tidak membayar
      // lama permintaan RAG dua kali. Sesi yang GAGAL justru diulang (seperti perilaku
      // lama: layar yang dipasang kembali mencoba lagi, bukan menyodorkan galat lama).
      const active =
        sameMenu(state.menuName, menuName) &&
        (state.status === 'loading' || state.status === 'ready');
      if (active) return Promise.resolve();
      return load(menuName, segment);
    },

    openSnapshot(recipe) {
      requestId += 1; // batalkan pengambilan yang sedang berjalan
      lastRequest = null;
      // menuName `null`: snapshot riwayat tidak terikat menu mana pun.
      set({ status: 'ready', recipe, error: null, menuName: null });
    },

    retry() {
      return lastRequest ? load(lastRequest.menuName, lastRequest.segment) : Promise.resolve();
    },

    reset() {
      requestId += 1;
      lastRequest = null;
      set(IDLE);
    },
  };
}
