# sorgumcore UI Polish + Bug Fix — Implementation Plan v2

> **For Hermes:** Execute task-by-task. Visual work = typecheck + visual checklist (writing-plans skill). Functional fixes = TDD where applicable.

**Goal:** Bawa UI sorgumcore dari "dasar" ke level modern-profesional dengan tetap mempertahankan tema oranye hangat, dan eliminasi bug-bug yang membuat pengalaman tidak nyaman — sebelum APK layak di-download publik.

**Arah desain (diputuskan user):** Polish tema oranye hangat → modern (glassmorphism, icon set konsisten, spacing & tipografi lebih baik, micro-interaction). BUKAN redesign total.

**Architecture:** Expo 57 RN. Stack UI tersedia: Moti, expo-blur, expo-linear-gradient, @expo/vector-icons (Ionicons/MaterialCommunityIcons), FlashList, reanimated 4, Tamagui (dipakai parsial atau skip — keputusan di bawah).

---

## PHASE 1 — Design System (fondasi, dikerjakan pertama)

### Task 1.1: Perluas design tokens

**Files:**
- Modify: `src/theme/colors.ts`
- Modify: `src/theme/index.ts`

**Isi:**
- Tambah skala shadow (shadowSm/md/lg dengan spread+opacity), blur tint, spacing scale baru (xs→xxl konsisten 4-48), radius scale konsisten.
- Tambah semantic tokens: `primarySoft` (bg oranye 8%), `surfaceGlass` (rgba putih 0.7), `textOnSoft`.
- Perluas typography: tambah `display` (splash/hero), `title` (screen header), `subtitle`, `overline` (label kecil uppercase).

**Verifikasi:** `npx tsc --noEmit` hijau; tidak ada screen yang patah visual (cek web :8082).

### Task 1.2: Design-token audit — ganti hardcode di semua screen

**Files:** semua `src/screens/*.tsx` + `src/components/*.tsx`

- Ganti semua `#hex` / angka hardcode dengan token dari theme.
- Buat konsistensi: semua shadow pakai token, semua radius pakai scale.

---

## PHASE 2 — Komponen Modern (shared primitives)

### Task 2.1: Icon system — ganti emoji dengan icon vector

**Keputusan:** pakai `@expo/vector-icons` (Ionicons/MaterialCommunityIcons) — sudah terpasang, ringan, konsisten; TIDAK perlu lucide/tamagui icons (duplikasi).

**Files:**
- Create: `src/components/Icon.tsx` (wrapper tiped: nama icon + size + color, dengan fallback emoji untuk icon yang tak ada)
- Modify: `ChatScreen` (header +/⚙️/stop/send), `SettingsScreen` (ikon row), `LoginScreen` (email/lock), `SplashScreen` (logo sorgum custom?) — pertahankan emoji hanya untuk konten chat (bahan makanan) yang tidak punya icon vector bagus.

**Verifikasi:** web :8082 — semua ikon tampil konsisten, tidak ada kotak kosong (missing glyph).

### Task 2.2: Glassmorphism & surface modern

**Files:**
- Create: `src/components/GlassCard.tsx` (BlurView + border rgba putih + shadow) — dipakai untuk kartu Login, Settings, card profile.
- Modify: `src/components/Button.tsx` — tambah variant `soft` (bg primarySoft), pressed state sudah ada.
- Modify: `src/components/FormField.tsx` — focus state (border primary + ring), icon prefix support.
- Modify: `src/components/SelectionChip.tsx` — selected state pakai icon check (bukan hanya warna).

### Task 2.3: Spacing & layout pass per screen

**Files:** `src/screens/*.tsx`

- ChatScreen: header lebih tinggi & bernapas, controls (reasoning toggle) di-pindah ke dalam header menu/chevron, input bar dengan glass + shadow mengambang.
- ProfileSetup: section header dengan ikon, chip diberi jarak konsisten (gap), card padding diperbesar.
- Settings: group card dengan section title, row icon + label + chevron.
- Login: card glass di atas gradient, tombol guest full-width dengan divider.

---

## PHASE 3 — Bug Fixes Fungsional (prioritas tinggi)

### Task 3.1: Reasoning panel tidak pernah muncul (BUG #6)

**Problem:** API BIMA kirim `data: {"delta": ...}` saja — tidak ada `reasoning_content`. Panel "Proses Meracik Resep" (F-04) tidak akan pernah tampil → fitur transparansi reasoning mati secara visual.

**Keputusan:** Tanya user — (a) apakah API punya channel reasoning terpisah yang belum diketahui, atau (b) ubah panel jadi "Ringkasan alasan" yang dihasilkan dari delta penuh (parsing kalimat alasan), atau (c) sembunyikan toggle & panel sampai API dukung.

**Files:** `src/services/kroombox.ts`, `src/components/ChatBubble.tsx`, `src/components/ReasoningToggle.tsx`

### Task 3.2: Guest history hilang saat app di-kill saat streaming (BUG #10)

**Fix:** Simpan guest history TIDAK hanya di `onDone`, tapi juga incremental (setiap N token / debounce 2s) selama streaming; juga saat `abortStream`.

**Files:** `src/store/chatStore.ts`

### Task 3.3: Auto-scroll & empty states chat

**Fix:**
- Auto-scroll ke bawah saat buka sesi dengan riwayat (bukan hanya saat pesan baru).
- Empty state: kalau history guest kosong & belum pernah chat, tampilkan saran pertanyaan (chip "Saya punya ayam & sorgum") — meningkatkan kenyamanan user baru.

**Files:** `src/screens/ChatScreen.tsx`

### Task 3.4: KeyboardAvoiding offset hardcode

**Fix:** Pakai `useHeaderHeight()` dari @react-navigation/elements atau ukur header aktual; pastikan di Android `adjustResize` via manifest & behavior undefined.

**Files:** `src/screens/ChatScreen.tsx`, `android/app/src/main/AndroidManifest.xml`

### Task 3.5: FlashList estimatedItemSize & render stabil

**Fix:** Set `estimatedItemSize={110}` (bubble rata-rata) + `keyExtractor` stabil berbasis konten hash agar list tidak lompat saat streaming.

**Files:** `src/screens/ChatScreen.tsx`

### Task 3.6: Race condition auth state (BUG #9)

**Fix:** `App.tsx` onAuthStateChange — jangan panggil `store.signOut()` langsung (async tanpa await & set state dua kali); delegasikan ke helper store yang idempoten.

**Files:** `App.tsx`, `src/store/authStore.ts`

### Task 3.7: LoginScreen dead prop + web preview auth

**Fix:** Hapus prop `navigation` jika tak dipakai. Web preview auto-guest: tambahkan banner kecil "Mode pratinjau — login tersedia di aplikasi mobile" agar tidak membingungkan tester.

**Files:** `src/screens/LoginScreen.tsx`

---

## PHASE 4 — Micro-interaction & Animasi

### Task 4.1: Screen transition & element entrance

- Stack screen: fade/slide halus (native-stack `animation`).
- Button press scale (sudah ada) → konsisten semua tombol.
- ReasoningToggle switch → animasi thumb (reanimated).

### Task 4.2: Chat feel

- Typing indicator sudah ada → pastikan muncul juga saat retry.
- Pesan baru: bubble slide-in (sudah ada via Moti) → tambah layout animation saat list berubah (bukan hanya mount).

---

## PHASE 5 — Verifikasi Menyeluruh

### Task 5.1: QA checklist fungsional (web + APK)

**Web** (`CI=1 npx expo start --port 8082 --web`):
1. Splash → Profile Setup → pilih umur/kondisi → chat
2. Kirim pesan → stream muncul → typing indicator → selesai
3. Matikan WiFi → kirim → error banner muncul → "Coba Lagi"
4. Restart app → history guest masih ada
5. Toggle reasoning → panel muncul/sembunyi (setelah Task 3.1)
6. Hapus data lokal → konfirmasi → kembali ke splash/login
7. Lebar layar 375/768/1280 → tidak ada elemen terpotong

**APK (sideload arm64):** ulangi 1-6 di device fisik.

### Task 5.2: Quality gates

- `npm run typecheck` → 0 error
- `npm run lint` → 0 error/warning
- `npx expo-doctor` → 21/21
- `npx expo export --platform android` → bundle sukses

### Task 5.3: Rebuild APK + kirim ke user

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```
Output: `sorgumcore-arm64.apk` (target <40MB). User test di HP → feedback.

---

## File yang berubah (ringkasan)

- `src/theme/colors.ts` + `src/theme/index.ts` — tokens baru
- `src/components/` — Icon.tsx (baru), GlassCard.tsx (baru), Button, FormField, SelectionChip, ChatBubble, ReasoningToggle, TypingIndicator
- `src/screens/` — ChatScreen (besar), LoginScreen, ProfileSetupScreen, SettingsScreen, SplashScreen
- `src/store/chatStore.ts` (guest persist incremental), `src/store/authStore.ts`
- `src/services/kroombox.ts` (jika Task 3.1 pilih (b)/(c))
- `App.tsx`, `src/navigation/types.ts`
- `android/.../AndroidManifest.xml`

## Risiko & Open Questions

1. **Task 3.1 (reasoning):** apakah API BIMA punya channel reasoning? Perlu konfirmasi ke Faisal/pemilik API — atau user pilih opsi (b)/(c). INI PALING PENTING untuk F-04.
2. **Tamagui:** sudah terpasang tapi belum dipakai. Untuk polish ini, lebih aman konsisten pakai StyleSheet + vector-icons + Moti (lebih ringan, bundle kecil). Tamagui = opsi jika ingin komponen siap-pakai cepat, tapi menambah risiko konfigurasi. Keputusan: SKIP Tamagui di fase ini (ponytail), kecuali user minta.
3. **Splash logo:** mau custom ilustrasi sorgum (butuh aset SVG/PNG) atau cukup emoji + tipografi display yang kuat? — tanya user saat Task 2.1.
4. Estimasi effort: Phase 1-2 (design system + komponen) = fondasi, Phase 3 (bug) = kritis sebelum rilis, Phase 4 (animasi) = bonus polish. Prioritas: Phase 3 > Phase 1-2 > Phase 4.
