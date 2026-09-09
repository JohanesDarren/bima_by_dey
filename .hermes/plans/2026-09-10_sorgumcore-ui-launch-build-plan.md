# sorgumcore — UI/UX Enhancement, Launch Readiness, & Cross-Platform Build Plan

> **For Hermes:** Execute task-by-task. UI/visual tasks do NOT follow TDD (see writing-plans skill: verification = typecheck + visual checklist). Functional tasks follow TDD where applicable.

**Goal:** (1) Make sorgumcore UI more interactive, responsive, and bug-free (no dead buttons/features), (2) determine launch readiness, (3) produce installable APK (Android) and IPA/TestFlight (iOS) builds.

**Architecture:** Expo SDK 57 managed workflow. Current UI stack: custom RN components + StyleSheet + Moti animations + Tamagui (installed, not yet used) + FlashList. Target: responsive-first layout (mobile + tablet + web), consistent tap targets, error-proof state handling, and a professional build pipeline (EAS Build for both platforms).

**Tech Stack:** React Native (Expo 57), TypeScript strict, Zustand, Moti, Tamagui, FlashList, expo-blur, react-native-svg, EAS Build.

---

## PART A — UI/UX Overhaul (Interaktif, Responsif, No Dead Buttons)

### A0. Audit & Baseline

**Task A0.1: Inventory all interactive elements & find dead/non-functional buttons**

**Files:**
- Read: `src/screens/*.tsx` (5 screens), `src/components/*.tsx` (7 components)

**Step 1:** Grep all `onPress`, `TouchableOpacity`, `Button`, `onTouchEnd`, `Pressable` handlers.
```bash
grep -rn "onPress\|TouchableOpacity\|Pressable\|Button" src/ --include="*.tsx"
```

**Step 2:** For each, verify the handler actually does something reachable:
- Settings "Edit Profil & Demografi" → navigate('ProfileSetup') — OK
- Settings wipeLocalData → Alert + localStore.clearAll — OK but Alert confirm is destructive w/o second confirm on web
- Login "Guest" button → signInAsGuest — OK
- ProfileSetup "Mulai Chat" disabled until chips — intentional, but add helper text
- Chat header ⚙️ → navigate Settings — OK; ＋ → createNewSession — OK
- Reasoning toggle → updateProfile — on web this hits guest branch — OK
- **KNOWN DEAD:** `LoadingScreen` in RootNavigator.tsx:22 is defined but never rendered (dead code). Remove.

**Step 3:** Output a checklist table of every button → action → reachable? → fix.

---

### A1. Shared UI Primitives (Tamagui adoption)

**Task A1.1: Create Tamagui config + provider**

**Files:**
- Create: `src/tamagui/config.ts` — `createTamagui` with brand tokens (warm orange from `src/theme/colors.ts`)
- Create: `src/tamagui/tamagui.config.ts`
- Modify: `App.tsx` — wrap root in `<TamaguiProvider config={tamaguiConfig}>`

**Step 1:** Create config file reusing existing `colors` palette:
```ts
// src/tamagui/config.ts
import { config as configBase } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';
export const tamaguiConfig = createTamagui(configBase);
```
(Adjust to the actual installed @tamagui/config export shape; v3 base config is the safe path.)

**Step 2:** Wrap App.tsx return in `<TamaguiProvider config={tamaguiConfig}>...</TamaguiProvider>`.

**Step 3:** Verify: `npm run typecheck` → 0 errors; web preview at :8082 renders splash without crash.

**Task A1.2: Build responsive layout hook `useResponsive`**

**Files:**
- Create: `src/hooks/useResponsive.ts`

**Step 1:** Implement hook using `useWindowDimensions` returning `{ isMobile, isTablet, isDesktop, width, height }` with breakpoints (mobile <768, tablet 768–1024, desktop >1024).

**Step 2:** Max content width container `src/components/Container.tsx` (center content ≤720px on desktop, full-bleed on mobile) — apply to Chat + ProfileSetup + Settings + Login.

---

### A2. Screen-by-Screen fixes

**Task A2.1: ChatScreen — fully interactive input & streaming UX**

**Files:**
- Modify: `src/screens/ChatScreen.tsx`

**Step 1:** Fix input `editable={!isStreaming}` → remove (allow typing while streaming; queue or disable send only).
**Step 2:** Ensure send button disabled state uses `isStreaming` correctly — show stop button while streaming (already done), re-enable send after done/error.
**Step 3:** Add `FlatList`/FlashList empty-state and error-retry: if streamError, show inline "Coba lagi" retry button that resends last user message.
**Step 4:** KeyboardAvoidingView `keyboardVerticalOffset` is hardcoded 90 → derive from header height or use `useHeaderHeight()`. On Android use `behavior={undefined}` + `android:windowSoftInputMode="adjustResize"` (manifest).

**Task A2.2: ProfileSetup — responsive chips grid**

**Files:**
- Modify: `src/screens/ProfileSetupScreen.tsx`
- Modify: `src/components/SelectionChip.tsx`

**Step 1:** SelectionChip: replace `View`+`onTouchEnd` (already fixed to TouchableOpacity onPress) — confirm accessible hit area ≥44px and add pressed-state scale (Moti).
**Step 2:** ProfileSetup: two-column chip grid on tablet/desktop via useResponsive; add helper text under disabled "Mulai Chat" button explaining what to select.

**Task A2.3: Settings — kill dead code & add confirmations**

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`

**Step 1:** Remove unused `LoadingScreen` + `ActivityIndicator` import from RootNavigator (dead code).
**Step 2:** Settings "Hapus Data Lokal" → use a real confirm dialog (Alert works native; on web use `window.confirm` fallback — add `confirmAsync` util in `src/utils/confirm.ts`).
**Step 3:** Add "Tentang" section showing version + RAG source count; add "edit profile" already wired.

**Task A2.4: LoginScreen — loading/disabled states & guest-mode clarity**

**Files:**
- Modify: `src/screens/LoginScreen.tsx`

**Step 1:** Disable both buttons + show spinner during submit (Button already has loading).
**Step 2:** Add email validation regex; inline error per field (FormField error prop exists).
**Step 3:** Clarify guest mode note: "Tanpa akun: data tersimpan lokal di perangkat".

**Task A2.5: SplashScreen — responsive + skip animation on reduced motion**

**Files:**
- Modify: `src/screens/SplashScreen.tsx`

**Step 1:** Respect `AccessibilityInfo.isReduceMotionEnabled` → skip Moti, render static instantly.
**Step 2:** Ensure gradient covers full screen on all sizes (AppGradient already flex:1 — verify on tablet).

---

### A3. Animations & micro-interactions (interactive feel)

**Task A3.1: Shared Moti presets**

**Files:**
- Create: `src/components/motiPresets.ts` — fadeInUp, fadeIn, scaleIn variants

**Task A3.2: Apply to cards, buttons, list items**

- Button press: scale 0.97 (already partly via activeOpacity — convert to Moti for feel)
- ChatBubble entrance (done) — add list item layout animation via `MotiView` `layout` prop when messages append
- Reasoning panel expand: animate height instead of conditional render (use `AnimatePresence` from moti)
- Toast/feedback for "disalin ke clipboard" (recipe copy) — add later w/ F-05

---

### A4. Responsive verification matrix

**Task A4.1: Visual QA on web (browser) + Android emulator**

**Step 1:** `CI=1 npx expo start --port 8082 --web` → check: splash → profile setup → chat at widths 375 / 768 / 1280 (use browser devtools emulation).
**Step 2:** Android: `npx expo run:android` on emulator or install APK — tap every button, confirm no dead.
**Step 3:** Checklist per screen: all buttons work, no overflow, text not clipped, keyboard doesn't cover input, safe-area respected.

---

## PART B — Launch Readiness Audit (Layak Launch?)

### B1. Functionality gaps vs PRD

**Task B1.1: Map PRD features → current state**

| PRD ID | Feature | Status | Notes |
|---|---|---|---|
| F-01 | Auth (Supabase) + Guest | ⚠️ Partial | Guest OK; Supabase URL is PLACEHOLDER — login/register cannot work until real Supabase project is set up |
| F-02 | Profile Management | ✅ Guest; ⚠️ Auth | Guest MMKV OK; auth row requires real Supabase + trigger migration |
| F-03 | Dapur Tanya Chat | ✅ Guest | SSE streaming verified against real api.llmsorgum.online |
| F-04 | AI Settings Toggle | ✅ | Persists to profile/MMKV |
| F-05 | Chat History | ⚠️ Guest-only in-memory | Guest has NO chat history persistence to disk — messages lost on restart; auth history needs Supabase |

**Conclusion:** App is **NOT launch-ready as-is** for real end users:
1. **Supabase placeholders** — no real auth, no cloud profile/chat-history persistence.
2. **Guest chat history not persisted** — MMKV storage exists but chatStore never writes guest messages to disk.
3. **iOS not buildable from Windows** — needs EAS (cloud) or macOS.

### B2. Fix list for launch

**Task B2.1: Real Supabase setup**
- Create project; run `supabase/migrations/0001_init.sql` in SQL editor; replace `.env` values.
- Verify: sign-up → profile row auto-created → login persists across restart.

**Task B2.2: Persist guest chat to MMKV**
- Modify `src/store/chatStore.ts`: on message append when `isGuest`, write `messages` (trimmed) to localStore key `guest_chat_history`.
- On bootstrap/guest hydration, load it back.
- Verify: restart app → history restored.

**Task B2.3: Error handling / empty states**
- Chat: API unreachable → friendly Indonesian error + retry (A2.1 Step 3).
- Profile fetch fails → show error card not infinite spinner.

**Task B2.4: Privacy & compliance check**
- PRD says never log raw passwords — audit code for console.log of credentials.
- Add `Privacy Policy` screen (placeholder) — required for store submission (iOS especially).
- `.env` not committed (already gitignored) — verify `git ls-files | grep .env` empty.

**Task B2.5: Performance & stability**
- Run `npx expo-doctor` → must be 21/21 (currently passing).
- Memory: FlashList already; add `removeClippedSubviews` if needed.
- Crash: add minimal error boundary component to avoid white-screen on JS error.

---

## PART C — Build & Distribution (Android APK + iOS)

### C1. Android release APK (local, signed with debug key — testable)

**Task C1.1: Rebuild release APK with current code**
```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk (~90MB universal)
```
- Verify with apksigner (debug cert OK for sideloading).
- Shrink: build per-ABI (`-PreactNativeArchitectures=arm64-v8a`) → ~35MB for modern phones.

**Task C1.2: (Recommended) Production signing for real distribution**
- Generate keystore: `keytool -genkey -v -keystore sorgumcore-release.keystore -alias sorgumcore -keyalg RSA -keysize 2048 -validity 10000`
- Store creds in `android/keystore.properties` (gitignored!) + wire `signingConfigs` in `android/app/build.gradle`.
- This makes APK installable & updatable by anyone (debug-signed APKs can't be uploaded to Play Console).

### C2. iOS build (requires Apple + EAS cloud since Windows)

**Task C2.1: Prepare EAS**
```bash
npm install -g eas-cli   # or npx eas-cli
npx eas-cli login
npx eas-cli init
```
- Needs: Apple Developer account ($99/yr), App ID, no local Xcode needed (cloud build).

**Task C2.2: Configure EAS Build**
- `eas.json`: `build.production.android` (apk/aab), `build.production.ios` (archive for TestFlight).
- `npx eas-cli build --platform android --profile production` → produces AAB for Play Store.
- `npx eas-cli build --platform ios --profile production` → produces IPA → TestFlight.

**Task C2.3: iOS-specific config**
- `app.json` ios.bundleIdentifier `com.dey.bimabydey` (set).
- Add `expo-dev-client`? Not required for release. Add privacy manifest fields (NSUserTrackingUsageDescription not needed — no tracking).
- App icon 1024x1024 required — verify `assets/icon.png` is 1024.

### C3. Distribution decision matrix

| Path | Who | Cost | Effort | Notes |
|---|---|---|---|---|
| Sideload APK (debug) | Testers/friends | Free | Low | Current state — fine for QA |
| Play Console (AAB, prod key) | Public Android | $25 one-time | Medium | Need prod keystore |
| TestFlight (EAS cloud) | Public iOS testers | $99/yr Apple | Medium | Need Apple account + EAS |
| App Store | Public iOS | included | High | Full review, privacy policy required |

---

## Files likely to change (full list)

- `src/components/`: SelectionChip.tsx, ChatBubble.tsx, Button.tsx, Container.tsx (new), motiPresets.ts (new), ErrorBoundary.tsx (new)
- `src/screens/`: ChatScreen.tsx, ProfileSetupScreen.tsx, SettingsScreen.tsx, LoginScreen.tsx, SplashScreen.tsx
- `src/navigation/RootNavigator.tsx` (dead code removal)
- `src/hooks/useResponsive.ts` (new)
- `src/store/chatStore.ts` (guest persistence)
- `src/utils/confirm.ts` (new)
- `src/tamagui/` config (new)
- `App.tsx` (TamaguiProvider)
- `.env` (real Supabase), `app.json`, `android/app/build.gradle`, `android/keystore.properties` (new, gitignored), `eas.json` (new)

## Tests / Validation

- `npm run typecheck` → 0 errors (gate after every task)
- `npm run lint` → 0 warnings (gate)
- `npx expo-doctor` → 21/21
- Web: manual click-through all buttons at 3 widths
- Android emulator/APK: tap-through all screens
- Guest persistence: kill app → relaunch → history present

## Risks / Tradeoffs / Open Questions

1. **Tamagui compiler not set up** — runtime mode works but larger bundle; decide whether to add babel plugin (`@tamagui/babel-plugin`) later.
2. **Supabase is placeholder** — who owns the real project? (Friend's team per PRD — Faisal/Shafnat.) Need real URL+key before auth works. Guest mode works without it.
3. **iOS from Windows** requires EAS cloud + Apple Developer $99/yr — confirm user has/gets an Apple account.
4. **Play Store** requires production keystore + $25 — confirm user wants public distribution or just sideload/TestFlight.
5. **Chat history for guests** — MMKV persistence is scoped to this app install; clearing app data wipes it (by design).
6. Privacy policy needed for App Store; who writes it (content owner = Darren/team)?
