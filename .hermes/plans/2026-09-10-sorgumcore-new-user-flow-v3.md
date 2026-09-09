# sorgumcore — New User-Flow Implementation Plan

> **For Hermes:** Execute task-by-task. Alur ini adalah refactor besar dari chat-first → discovery-first. Visual = typecheck + checklist; logika/storage = TDD.

**Goal:** Ubah alur aplikasi dari "chat-first" menjadi "discovery-first": user memilih segmentasi → melihat menu andalan dari RAG → bisa cari/tanya resep lain → dapat resep lengkap → AI menemani masak step-by-step (dengan timer + voice, dua arah) → riwayat masuk history (Supabase).

**Architecture (diputuskan bersama user):**
1. **Menu andalan** = direkomendasikan dari basis pengetahuan RAG (bukan statis di-bundle). KB = 19 dokumen / 2342 chunk (fokus gizi: AKG Permenkes, TKPI, resep & penanganan pangan sorgum).
2. **Voice chat** = mode masak SAJA, dua arah (STT user + TTS AI).
3. **Step-by-step** = AI pecah resep jadi langkah detail; user bisa langsung eksekusi atau diskusi dulu; "Lanjut" manual + timer (durasi dari resep) + tombol Reset.
4. **History** = Simpan ke Supabase (tidak ada endpoint API teman untuk jalur masuk data).

**Tech Stack:** Expo 57 RN, TypeScript strict, Zustand, Moti, FlashList, expo-speech (TTS), expo-av/periclash STT (diputuskan di Task B2), supabase-js, react-native-view-shot (opsional).

---

## BATASAN API (diverifikasi live via curl 2026-09-09)

- **`GET /api/knowledge/files`** → daftar dokumen; **tidak butuh X-API-Key** untuk read. Menampilkan 19 dokumen nutrisi/resep sorgum.
- **`POST /api/chat`** → butuh `X-API-Key`. Payload `{ message, history[], model, useRag, stream, settings }`. Stream: `data: {"delta":...}` + `data: [DONE]`. RAG aktif via `useRag: true`.
- Tidak ada endpoint untuk menyimpan history → **Supabase** untuk persistence auth + chat history.
- **Catatan keamanan:** `/api/knowledge` read tanpa key = bisa diakses publik. Bukan blocker sekarang, tapi layak diingat untuk produksi (minta teman segera set auth).

---

## VALIDASI LIVE (dieksekusi saat plan mode — read-only)

**Probe 1 — Menu andalan via RAG (BERHASIL, 2026-09-09):**
Prompt: minta 3 rekomendasi menu main course anak 8 tahun, format JSON, useRag:true, stream:false.
Hasil: JSON terstruktur valid — tiap item punya name/description/nutrition(calories,protein,fiber,vitamins,minerals)/strengths/weaknesses/category. Respons merujuk konten KB (proses pembekuan sorgum instan dari dokumen pengolahan pangan). → mekanisme "menu andalan dari RAG" TERBUKTI layak.

**Implikasi desain dari probe:**
1. nutrition berbentuk objek (calories/protein/fiber/key_vitamins/minerals/notes) — sesuaikan tipe MenuItem di Task 1.1: `nutrition: Record<string,string>` alih-alih `string[]`.
2. Output dibungkus markdown ```json ... ``` — parser harus strip fence dulu.
3. Perlu probe kedua (saat eksekusi): "pecah resep jadi steps + durasi JSON" — belum divalidasi; siapkan fallback parser manual teks.
4. Stream:false lebih mudah diparse (respons JSON utuh). Untuk menu → pakai stream:false; untuk chat masak → stream:true.

---

## PHASE 1 — Data model & API layer

### Task 1.1: Tipe data baru

**Files:** Modify `src/types/index.ts`

Tambahkan:
```ts
export type FoodCategory = 'main_course' | 'soup' | 'dessert' | 'snack' | 'beverage' | 'other';
export type Segment = { targetAgeGroup: AgeGroup|null; specialCondition: SpecialCondition|null };

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  nutrition: Record<string, string>; // calories/protein/fiber/key_vitamins/minerals/notes (dari probe)
  strengths: string[];       // keunggulan
  weaknesses: string[];      // kelemahan
  category: FoodCategory;
  suggestedFor: Segment;
  docSource: string;         // nama dokumen KB asal (untuk transparansi)
}

export interface RecipeStep {
  order: number;
  title: string;
  instruction: string;
  durationMinutes: number | null; // null = tak perlu timer
}

export interface Recipe {
  id: string;
  menuItemId: string;
  name: string;
  servings: number;
  ingredients: string[];
  steps: RecipeStep[];
  nutrition: string[];
  totalMinutes: number;
  category: FoodCategory;
}

export interface ChatHistoryEntry {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
```

### Task 1.2: Service RAG — fungsi baru untuk menu & resep

**Files:** Modify `src/services/kroombox.ts`, Create `src/services/menu.ts`

- `getRecommendedMenus(segment: Segment): Promise<MenuItem[]>` — panggil `/api/chat` dengan prompt RAG khusus (buat daftar menu andalan sesuai segmentasi, format JSON). Parse respons streaming → JSON.
- `getRecipe(menuItem, segment): Promise<Recipe>` — prompt: pecah resep jadi langkah detail dengan durasi per langkah (format JSON bila API mendukung; fallback tekstur manual parser langkah).
- `searchRecipe(query, segment): Promise<MenuItem[]>` — cari/minta resep lain sesuai kebutuhan + kategori makanan.
- **Fallback penting:** kalau parsing JSON gagal, tampilkan respons mentah sebagai resep "satu blok" + tombol "Pecah Jadi Step-by-Step".

### Task 1.3: Supabase schema untuk history baru

**Files:** Modify `supabase/migrations/0001_init.sql` (tambahkan) atau `0002_history.sql` (baru)

Lanjutkan schema `chat_sessions` + `chat_messages`, tambahkan kolom:
- `chat_messages.menu_item_name VARCHAR` (opsional) — sumber resep agar history bisa re-render sebagai kartu resep.
- Tabel baru `recipes` (cache resep utk request cepat).
RLS: user hanya bisa akses milik sendiri (utk non-guest).

---

## PHASE 2 — Navigasi & alur baru

### Task 2.1: Stack navigasi baru

**Files:** Modify `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`

```
Splash → Login/Guest
  → Browse (PILIH SEGMENTASI + lihat menu andalan)
      → RecipeDetail (menu dipilih → resep lengkap)
          → Cooking (step-by-step + timer + voice + diskusi)
  → Settings (dari header Browse)
```

Register `Browse`, `RecipeDetail`, `Cooking` sebagai screen baru.

### Task 2.2: Screen Browse (discovery-first)

**Files:** Create `src/screens/BrowseScreen.tsx`

Alur UI:
1. Pilih segmentasi (umur + kondisi) — reuse komponen chip dari ProfileSetup (pindahkan jadi flow "segment" bukan "profile").
2. Setelah segment dipilih → tampilkan "Menu Andalan" (dari getRecommendedMenus).
3. Tiap kartu menu: nama, deskripsi singkat, chip kandungan gizi, keunggulan + kelemahan (expandable/collapsible).
4. Input pencarian + filter kategori (main course/soup/dessert/snack/beverage) → searchRecipe.
5. Ketuk kartu → navigate RecipeDetail.
6. Toggle reasoning (F-04) dipertahankan di sini.

**Verifikasi (web :8082):** pilih segment → kartu menu muncul → klik chip kategori → pencarian bekerja.

### Task 2.3: Screen RecipeDetail

**Files:** Create `src/screens/RecipeDetailScreen.tsx`

- Tampilkan resep lengkap: nama, porsi, bahan, langkah (read-only), gizi.
- Tombol "Mulai Masak" → navigate Cooking.
- Tombol "Diskusi" → buka chat panel mini untuk tanya AI soal resep (voice+ketik optional).
- Header back ke Browse.

### Task 2.4: Screen Cooking (step-by-step + timer + voice)

**Files:** Create `src/screens/CookingScreen.tsx`, `src/components/TimerRing.tsx` (baru), `src/components/StepCard.tsx` (baru)

Fitur inti per spec:
- List langkah, step aktif ditandai.
- **Tombol "Lanjut"** → step berikutnya.
- **Timer** menampilkan durasi langkah (dari resep); saats step mulai, timer hitung mundur; tombol **Reset** + **Lanjut lebih awal**.
- **Voice mode**: dua arah — tombol mic (STT) untuk bertanya/persetujuan, TTS bacakan instruksi/langkah & jawaban AI. (Detail implementasi di Task B2.)
- **Diskusi**: chat inline saat langkah aktif; AI paham konteks step yang sedang dikerjakan.
- Saat selesai → simpan ke history Supabase (Task C2) → navigasi ke "Riwayat".

---

## PHASE 3 — Bug fixes kritis (dari aplikasi lama, dibawa + diperbaiki di alur baru)

### Task 3.1: Reasoning panel (F-04) — API tak kirim reasoning_content

**Keputusan arahan user:** panel "Proses Meracik Resep" TIDAK akan muncul karena API hanya `{delta}`. Di alur baru, alih-alih reasoning mentah, tampilkan **sumber dokumen KB** yang jadi referensi (transparansi grounded-RAG) — deskripsi & gizi diberi tag sumber dokumen.

**Files:** `src/components/MenuCard.tsx`, `src/services/menu.ts` (sertakan docSource), `src/utils/promptBuilder.ts`

### Task 3.2: Guest history di-kill saat streaming

**Fix:** persist incremental (debounce) selama streaming + saat abort, bukan hanya onDone. Berlaku di alur baru (Browse/receipt).

**Files:** `src/store/chatStore.ts` (atau store baru utk chat cooking)

### Task 3.3: Auto-scroll, empty state, keyboard offset, FlashList sizing

**Files:** `src/screens/BrowseScreen.tsx`, `src/screens/CookingScreen.tsx`, `src/screens/ChatScreen.tsx` (jika dipertahankan utk guest)

- Auto-scroll ke bawah saat buka sesi berisi history.
- Empty state: kartu "Mulai petualangan sorgum" dengan chip contoh pertanyaan.
- KeyboardAvoiding pakai `useHeaderHeight`; Android adjustResize.
- FlashList `estimatedItemSize`.

### Task 3.4: Race auth + dead props di Login

**Files:** `App.tsx`, `src/store/authStore.ts`, `src/screens/LoginScreen.tsx`.

---

## PHASE 4 — Voice (dua arah, mode masak saja)

### Task 4.1: TTS (AI bicara) — ekspor

**Files:** install `expo-speech` — sudah native-tersedia tidak perlu extra native build.

- `Speech.speak(instruksiStep)` saat step dimulai / pengguna minta.
- Tombol "Bacakan ulang".

### Task 4.2: STT (user bicara) — keputusan library

**Pilihan (tanya user / tentukan):**
- (a) `expo-speech-recognition` / `@react-native-voice/voice` — butuh izin mic native + rebuild APK (autolinking). 
- (b) react-native not-a 3rd-party: pakai Web Speech API di web preview dulu, native STT menyusul.
- Keputusan: (a) agar penuh dua arah di Android; tambah librari + izin RECORD_AUDIO di AndroidManifest + rebuild.

### Task 4.3: Integrasi di CookingScreen

- Mic button → STT → append ke diskusi.
- TTS → jawaban AI & instruksi.
- State: mic aktif hanya di Cooking (bukan di chat umum).

---

## PHASE 5 — History & Supabase

### Task 5.1: Simpan ke history

**Files:** `src/services/history.ts` (baru), `src/screens/SettingsScreen.tsx`, `src/screens/BrowseScreen.tsx`

- Setelah resep selesai (Cooking selesai / diskusi), simpan: session (segment, menu name, recipe) + messages (chat step).
- Guest: simpan ke MMKV (aktivasi guest history persist incremental).
- Auth: simpan ke Supabase (chat_sessions + chat_messages, sertakan menu_item_name).

### Task 5.2: Layar Riwayat

**Files:** `src/screens/HistoryScreen.tsx` (baru), navigasi.

- List riwayat sesi (judul = nama menu + segment).
- Ketuk → buka kembali dalam mode read-only / lanjut masak.

### Task 5.3: Settings update

- Pindahkan "Edit Profil & Demografi" → jadi "Segmentasi" (akses cepat).
- Tambah "Riwayat" & "Hapus Semua Riwayat".

---

## PHASE 6 — QA & Rilis

### Task 6.1: QA checklist (web + APK fisik)

1. Splash → Login/Guest.
2. Pilih segment (umur + kondisi).
3. Menu andalan muncul (dari RAG, dengan sumber dokumen).
4. Filter kategori + pencarian.
5. Pilih resep → detail (bahan/langkah/gizi/porsi).
6. Mulai mask → step-by-step → timer jalan → Reset → Lanjut.
7. Voice: mic → pertanyaan → AI jawab + bacakan.
8. Selesai → history tersimpan (Supabase kalau login, MMKV kalau tamu).
9. Buka history → lanjut/lihat.
10. Hapus data lokal → konfirmasi.

### Task 6.2: Quality gates

- `npm run typecheck` → 0 error
- `npm run lint` → 0 warning
- `npx expo-doctor` → 21/21
- `npx expo export --platform android` → bundle sukses
- AndroidManifest: izin RECORD_AUDIO ditambahkan (utk STT) — ditandai di Task 4.2(a).

### Task 6.3: Rebuild APK + kirim ke user

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```
Output: `sorgumcore-arm64.apk`.

---

## File berubah (ringkasan)

- `src/types/index.ts` (data model baru)
- `src/services/kroombox.ts`, `src/services/menu.ts` (baru), `src/services/history.ts` (baru)
- `src/utils/promptBuilder.ts`, `src/constants/index.ts` (FoodCategory options)
- `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`
- **Baru:** `BrowseScreen`, `RecipeDetailScreen`, `CookingScreen`, `HistoryScreen` 
- **Baru:** `MenuCard.tsx`, `TimerRing.tsx`, `StepCard.tsx`, `ReasoningSourceTag.tsx`
- `src/screens/ProfileSetupScreen.tsx` → diadaptasi jadi flow segmentasi
- `src/screens/SettingsScreen.tsx`, `src/screens/LoginScreen.tsx`, `src/screens/SplashScreen.tsx`, `src/screens/ChatScreen.tsx` (dipertahankan untuk guest/dural)
- `src/store/chatStore.ts`, `src/store/authStore.ts`
- `App.tsx`
- `supabase/migrations/0002_history.sql` (baru)
- `android/app/src/main/AndroidManifest.xml` (izin RECORD_AUDIO u/ STT)
- `package.json` (expo-speech + lib STT)

---

## Risiko & Open Questions

1. **Parsing resep & langkah dari RAG:** belum pasti format output prompt "pecah jadi JSON steps+durasi" konsisten. Fallback: parse manual teks. Perlu pengujian langsung dengan prompt nyata + verifikasi di web.
2. **STT library** — pilih (a) native dua arah penuh (butuh izin + rebuild) atau (b) mulai Web Speech di web lalu native menyusul. REKOMENDASI: (a) expo-av + lib native untuk Android dua arah, karena voice adalah inti mode masak.
3. **`/api/knowledge` publik (read tanpa key)** — keamanan produksi, minta teman set auth.
4. **Menu andalan tanpa API menu khusus** — bergantung output chat RAG; siapkan fallback teks lengkap bila JSON parse gagal.
5. **Supabase placeholder** — history auth tidak jalan sampai project asli tersedia (keputusan user: nanti; guest tetap jalan full).
6. **Perf:** MenuCard dengan sumber dokumen — pastikan FlashList performance untuk daftar 20+ menu.