# Diagnosis: menu / detail menu / chef sorgum lambat

Status: **root cause found (server-side), no client fix available**
Tanggal: 2026-10-15
Feedback loop: `.scratch/perf-latency/measure_chat.py` (+ `probe.py`)

## Symptom (user)

"kalau saya request minta menu, detail menu, chef sorgum, itu lama bgt."

## Feedback loop (Phase 1)

`measure_chat.py` replays the **exact prompts the app sends** to
`POST https://api.llmsorgum.online/api/chat` over SSE and measures, per request:

- `ttfb` — time to first streamed byte (server accepted + RAG retrieval done)
- `first_json` — time until a complete JSON payload is visible (what the app's
  `completeJsonSlice()` early-exit keys on — the number the user actually feels)
- `done` / `total` — until `[DONE]` / hard cap

Run: `KROOMBOX_API_KEY=… python3 .scratch/perf-latency/measure_chat.py menu voice recipe`

Tight? yes (seconds-scale control, hard 200 s cap). Deterministic? yes — every run
reproduces. Red-capable? yes — it goes red on exactly the user's symptom (no answer
arrives) and would go green when the upstream answers promptly.

## Measurements

| kind | HTTP | ttfb (first byte = sources) | first delta token | total |
|---|---|---|---|---|
| menu (real prompt, RAG) | 200 | 13.0 s (8 sources) | **never** | capped 200 s |
| voice (real prompt, RAG) | 200 | 9.7 s (8 sources) | **never** | capped 200 s |
| recipe (real prompt, RAG) | 200 | 11.6 s (8 sources) | **never** | capped 200 s |
| minimal, `useRag=false` | 200 | 4.1 s (4 sources) | **never** | capped 120 s |
| minimal, `useRag=true` | 200 | 3.8 s (4 sources) | **never** | capped 120 s |
| voice, `useRag=false` | 200 | 3.0 s (4 sources) | **never** | capped 120 s |
| voice (real prompt, RAG), longer cap | 200 | 9.5 s (8 sources) | **never** | capped **360 s** |
| `GET /api/health` | 200 | 1.0 s | n/a | 1.0 s |

The 360 s run settles "slow vs hung": **hung**. Six minutes, still not one token.

## Hypothesis ranking (Phase 3) and verdicts

1. **H1 — upstream LLM generation is the bottleneck.** → **CONFIRMED (root cause).**
   A 4-word prompt with `useRag=false` still yields **zero tokens in 120 s**. Prompt
   size, RAG, and the client are all ruled out; only the model step remains.
2. **H2 — RAG retrieval / context size.** → **REJECTED.** `useRag=false` behaves the
   same; retrieval itself completes in 3–13 s and returns sources.
3. **H3 — client-side timeout/retry/streaming logic.** → **REJECTED as cause**, but it
   *amplifies* the symptom: the app's idle timeout is **400 s** (`IDLE_TIMEOUT_MS`),
   so a stalled upstream makes the user wait ~6.5 minutes before any error appears.
4. **H4 — network to the host.** → **REJECTED.** `/api/health` = 1.0 s; ttfb (headers
   + RAG) = 3–13 s.
5. **H5 — irrelevant retrieval corpus degrades the model.** → **CONTRIBUTING.** The
   returned sources are off-topic (a sorghum *cultivation* manual, a child-nutrition
   PDF; scores ≈ 0.005), so the model has poor grounding — but that does not explain
   the stall (H2/H1 already separate those).

## Root cause

The upstream BIMA RAG service (`api.llmsorgum.online`) **retrieves context quickly
but its LLM generation step does not stream any tokens** — for every prompt, RAG on
or off. The client is doing the right thing (SSE, early-exit on complete JSON); there
is nothing to fix client-side that makes the model faster.

## Secondary finding (real, but not the root cause)

`IDLE_TIMEOUT_MS = 400_000` in `src/services/kroombox.ts` means a stalled upstream
surfaces as a ~6.5-minute silent wait. The code comments even acknowledge this:
"permintaan resep TERUKUR pernah memakan 195-234 detik". Lowering the idle timeout
turns a 6-minute hang into a fast, honest failure the user can retry.

## Phase 5 — is there a correct seam?

- **Server latency**: no client seam can fix it; it is an upstream dependency.
- **Timeout behaviour**: yes — `collectKroomboxStream()` in `src/services/kroombox.ts`
  is the seam. A regression test can assert that a stream that produces no tokens
  fails within the intended bound instead of hanging.

## Recommended actions

1. **Escalate to whoever owns `api.llmsorgum.online`** (the BIMA API). Evidence: a
   one-word, RAG-off request returns no tokens for 2 minutes. Nothing on the client
   can work around this. Reproduce with the loop above.
2. **Reduce `IDLE_TIMEOUT_MS`** (e.g. 400 s → 45–60 s) so a stalled upstream fails
   fast with a retry affordance, instead of a 6.5-minute silent hang.
3. **Fix retrieval relevance** (H5): the corpus returns sorghum *cultivation* docs for
   a *cooking* question, which will keep answers poor even when generation recovers.
