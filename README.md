# Dapur Sorgum Ceria — Sorghum AI Nutritionist

Personalized RAG-based recipe assistant for caregivers and housewives who want to
prepare healthy sorghum meals for specific demographics. Built per the BIMA PRD
(`D:\1. ASET JAGOAI\1.PRD\PRD BIMA.md`).

## Tech stack

- React Native (Expo SDK 57, TypeScript strict)
- Hermes JS engine
- Zustand 4 + react-native-mmkv (guest mode & local settings)
- Supabase (PostgreSQL + Auth + RLS) for user profiles & chat history
- Kroombox FastAPI RAG API, consumed over Server-Sent Events (SSE)

## Screens

| Id | Screen | Notes |
|----|--------|-------|
| S-01 | Splash | Bootstraps Supabase session / MMKV state |
| S-02 | Login / Register | Supabase email auth + "Continue as Guest" |
| S-03 | Profile Setup | Age-group + special-condition pickers |
| S-04 | Dapur Tanya | Chat with SSE streaming + reasoning toggle |
| S-05 | Settings | Logout, edit profile, wipe local data |

## Getting started

```bash
npm install
cp .env.example .env        # fill in Supabase + Kroombox URLs
npm start                   # then press 'a' for Android / 'i' for iOS
```

### Env vars

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL (https://xxx.supabase.co) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anonymous public key |
| `EXPO_PUBLIC_KROOMBOX_URL` | Public HTTPS base URL of the RAG FastAPI |

## Database

Apply `supabase/migrations/0001_init.sql` in the Supabase SQL editor — it creates
`profiles`, `chat_sessions`, `chat_messages`, the `handle_new_user()` trigger, and
all Row Level Security policies.

## Architecture

- App (RN client) → Supabase for auth + persistence
- App → Kroombox `/api/chat` for streaming RAG recipe generation
- Profile demographics are injected into the system prompt under the hood (PRD F-03)

## Scripts

- `npm run android` / `npm run ios` / `npm run web` — start dev servers
- `npx expo export --platform android` — produce a production JS bundle
- `npx tsc --noEmit` — type check
- `npx expo-doctor` — validate project health