#!/usr/bin/env python3
"""
Bounded feedback loop for the "menu / detail menu / chef sorgum lambat" bug.

Replays the EXACT prompts the app sends to POST /api/chat over SSE and measures,
per request, with a HARD per-request wall cap so the loop can never hang:

  ttfb        : time to first streamed byte (server accepted + started responding)
  first_json  : time until a COMPLETE JSON payload is visible in the delta stream
                (this is what the app's completeJsonSlice() early-exit keys on,
                 so it is the number the user actually experiences)
  done        : time until the server's [DONE] line (if it ever arrives)
  total       : time until cap / stream close

Results are appended as JSON lines to .scratch/perf-latency/results.jsonl so a
batch that times out still leaves data behind.

Usage:
  KROOMBOX_API_KEY=... python3 measure_chat.py menu voice recipe
  MEASURE_MAX_S=240 python3 measure_chat.py menu     # override cap
"""
import json
import os
import sys
import threading
import time
import urllib.request

BASE = os.environ.get("KROOMBOX_BASE_URL", "https://api.llmsorgum.online")
KEY = os.environ.get("KROOMBOX_API_KEY", "")
URL = BASE + "/api/chat"
MAX_S = float(os.environ.get("MEASURE_MAX_S", "240"))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.jsonl")

SEG = "Target Umur: [Remaja], Kondisi Khusus: [Diabetes]"

MENU_PROMPT = "\n".join([
    "Buat 1 rekomendasi menu olahan sorgum.",
    SEG,
    "Kategori WAJIB: main course (makanan utama). Menu harus termasuk kategori ini.",
    "WAJIB pertimbangkan kelompok umur DAN kondisi khusus secara bersamaan.",
    "description: maksimal 2 kalimat pendek (sekitar 25 kata), tanpa tanda kurung dan tanpa angka persen.",
    "strengths dan weaknesses: maksimal 8 kata per butir.",
    'nutrition cukup {"calories": number, "protein": number, "fiber": number} — jangan tambah field lain.',
    "Setiap kunci JSON WAJIB diapit tanda kutip ganda. Jangan menulis analisis harga, alergen, catatan verifikasi, atau skor kelayakan.",
    "",
    "Jawab HANYA JSON array berisi TEPAT 1 objek (tanpa teks lain, tanpa markdown fence, tanpa penjelasan sesudah JSON):",
    '[{"name": string, "description": string, "nutrition": {"calories": number, "protein": number, "fiber": number}, "strengths": [string], "weaknesses": [string], "category": "main_course|soup|dessert|snack|beverage|other"}]',
    'JANGAN menyalin atau merangkum isi dokumen basis pengetahuan, dan JANGAN menulis judul seperti "Konsep Produk" atau "Catatan Verifikasi". Jangan menyebut harga.',
])

RECIPE_PROMPT = "\n".join([
    'Buatkan resep lengkap dan detail untuk "Nasi Goreng Sorgum" yang sesuai:',
    SEG,
    "",
    "Aturan:",
    "- Pecah resep menjadi langkah detail (5-10 langkah) yang bisa diikuti selangkah demi selangkah.",
    "- durationMinutes: isi angka menit bila langkah butuh waktu; null bila instan.",
    "- Sesuaikan porsi, tekstur, dan bumbu dengan segmentasi.",
    "- Bahan: SATU baris = nama bahan + jumlah + satuan.",
    "",
    "Jawab HANYA JSON ini — mulai langsung dengan { dan akhiri dengan }, tanpa kalimat pembuka, tanpa markdown, tanpa penjelasan sesudahnya:",
    '{"name": string, "servings": number, "ingredients": [string], "steps": [{"order": number, "title": string, "instruction": string, "durationMinutes": number|null}], "totalMinutes": number}',
])

VOICE_PROMPT = "\n".join([
    "Kamu adalah Chef Sorgum, pendamping memasak.",
    "Resep: Nasi Goreng Sorgum.",
    "Langkah aktif: Menumis bumbu.",
    "Profil: Remaja, Diabetes.",
    "Pertanyaan: Berapa lama menumis bumbunya?",
])

PROMPTS = {"menu": (MENU_PROMPT, 900), "recipe": (RECIPE_PROMPT, 1800), "voice": (VOICE_PROMPT, 150)}


def _balanced_json_len(text):
    """Index just past the first COMPLETE balanced JSON value, or None. Mirrors the
    app's completeJsonSlice() intent (which is what ends the user's wait early)."""
    start = None
    for i, ch in enumerate(text):
        if ch in "{[":
            start = i
            break
    if start is None:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c in "{[":
            depth += 1
        elif c in "}]":
            depth -= 1
            if depth == 0:
                return i + 1
    return None


def measure(kind):
    message, max_tokens = PROMPTS[kind]
    body = json.dumps({
        "message": message, "history": [], "model": None,
        "useRag": True, "stream": True, "max_tokens": max_tokens,
    }).encode()
    req = urllib.request.Request(
        URL, data=body,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": KEY,
            "Accept": "text/event-stream",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) bima-perf-probe",
        },
        method="POST",
    )
    t0 = time.time()
    state = {"ttfb": None, "first_json": None, "done": None, "sources": None,
             "text": "", "chunks": 0, "status": None, "error": None, "capped": False}
    lock = threading.Lock()

    def reader():
        try:
            with urllib.request.urlopen(req, timeout=MAX_S + 30) as resp:
                state["status"] = resp.status
                for raw_line in resp:
                    if time.time() - t0 > MAX_S:
                        state["capped"] = True
                        break
                    if state["ttfb"] is None:
                        state["ttfb"] = time.time() - t0
                    line = raw_line.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        state["done"] = time.time() - t0
                        break
                    try:
                        chunk = json.loads(payload)
                    except Exception:
                        continue
                    if isinstance(chunk, dict) and chunk.get("delta"):
                        state["text"] += chunk["delta"]
                        state["chunks"] += 1
                        if state["first_json"] is None:
                            n = _balanced_json_len(state["text"])
                            if n:
                                state["first_json"] = time.time() - t0
                    elif isinstance(chunk, dict) and chunk.get("sources") is not None:
                        if state["sources"] is None:
                            state["sources"] = len(chunk["sources"])
        except Exception as e:
            state["error"] = type(e).__name__ + ": " + str(e)

    th = threading.Thread(target=reader, daemon=True)
    th.start()
    th.join(MAX_S)
    if th.is_alive():
        state["capped"] = True
    total = time.time() - t0
    return {
        "kind": kind, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "status": state["status"], "ttfb": state["ttfb"], "first_json": state["first_json"],
        "done": state["done"], "total": total, "capped": state["capped"],
        "chunks": state["chunks"], "chars": len(state["text"]), "sources": state["sources"],
        "error": state["error"], "head": state["text"][:150].replace("\n", " "),
    }


def fmt(v):
    return f"{v:.1f}s" if isinstance(v, (int, float)) else "-"


if __name__ == "__main__":
    kinds = sys.argv[1:] or ["menu"]
    if not KEY:
        print("KROOMBOX_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    for kind in kinds:
        r = measure(kind)
        with open(OUT, "a") as f:
            f.write(json.dumps(r) + "\n")
        print(f"[{kind}] status={r['status']} ttfb={fmt(r['ttfb'])} first_json={fmt(r['first_json'])} "
              f"done={fmt(r['done'])} total={fmt(r['total'])} capped={r['capped']} "
              f"chunks={r['chunks']} chars={r['chars']} sources={r['sources']}")
        if r["error"]:
            print("   error:", r["error"])
        if r["head"]:
            print("   head:", r["head"][:110])
        sys.stdout.flush()
