# Dapur Sorgum Ceria — Sorghum AI Nutritionist

Personalized RAG-based recipe assistant for caregivers and housewives who want to
prepare healthy sorghum meals for specific demographics. Built per the BIMA PRD
(`D:\1. ASET JAGOAI\1.PRD\PRD BIMA.md`).

## Tech stack

- React Native (Expo SDK 57, TypeScript strict)
- Hermes JS engine
- Zustand 4 + react-native-mmkv (guest-only: profile, history & settings on device)
- Kroombox FastAPI RAG API, consumed over Server-Sent Events (SSE)

## Screens

| Id | Screen | Notes |
|----|--------|-------|
| S-01 | Splash | Bootstraps local (MMKV) guest state |
| S-02 | Login | "Continue as Guest" — no account required |
| S-03 | Profile Setup | Age-group + special-condition pickers |
| S-04 | Dapur Tanya | Chat with SSE streaming + reasoning toggle |
| S-05 | Settings | Edit profile, wipe local data |

## Getting started

```bash
npm install
cp .env.example .env        # fill in the Kroombox URL
npm start                   # then press 'a' for Android / 'i' for iOS
```

### Env vars

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_KROOMBOX_URL` | Public HTTPS base URL of the RAG FastAPI |

## Data

The app is guest-only: there is no account system and no remote database. The
demographic profile, cooking history and settings are persisted on the device
via `react-native-mmkv` (with a `localStorage` fallback on web).

## Architecture

- App → Kroombox `/api/chat` for streaming RAG recipe generation
- Profile demographics are injected into the system prompt under the hood (PRD F-03)

## Scripts

- `npm run android` / `npm run ios` / `npm run web` — start dev servers
- `npx expo export --platform android` — produce a production JS bundle
- `npx tsc --noEmit` — type check
- `npx expo-doctor` — validate project health
