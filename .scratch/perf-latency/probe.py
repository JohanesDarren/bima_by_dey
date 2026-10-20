#!/usr/bin/env python3
"""
Decisive probe matrix: separates
  H1/H3 (upstream LLM/backend is the bottleneck)  from
  H2 (RAG context / prompt size is the bottleneck).

Runs, each with a hard cap:
  minimal_norag : tiny prompt, useRag=False   -> is the model itself responsive?
  minimal_rag   : tiny prompt, useRag=True    -> does RAG retrieval alone stall it?
  voice_norag   : real voice prompt, useRag=False
  menu_norag    : real menu prompt, useRag=False

Appends JSONL to results.jsonl.
"""
import json, os, sys, threading, time, urllib.request

BASE = os.environ.get("KROOMBOX_BASE_URL", "https://api.llmsorgum.online")
KEY = os.environ.get("KROOMBOX_API_KEY", "")
URL = BASE + "/api/chat"
MAX_S = float(os.environ.get("PROBE_MAX_S", "150"))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.jsonl")


def probe(name, message, use_rag, max_tokens=120):
    body = json.dumps({"message": message, "history": [], "model": None,
                       "useRag": use_rag, "stream": True, "max_tokens": max_tokens}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json", "X-API-Key": KEY,
        "Accept": "text/event-stream",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) bima-perf-probe"}, method="POST")
    t0 = time.time()
    st = {"ttfb": None, "first_delta": None, "done": None, "text": "", "chunks": 0,
          "status": None, "error": None, "capped": False, "sources": None}

    def reader():
        try:
            with urllib.request.urlopen(req, timeout=MAX_S + 20) as resp:
                st["status"] = resp.status
                for raw in resp:
                    if time.time() - t0 > MAX_S:
                        st["capped"] = True; break
                    if st["ttfb"] is None:
                        st["ttfb"] = time.time() - t0
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    p = line[5:].strip()
                    if p == "[DONE]":
                        st["done"] = time.time() - t0; break
                    try:
                        c = json.loads(p)
                    except Exception:
                        continue
                    if isinstance(c, dict) and c.get("delta"):
                        if st["first_delta"] is None:
                            st["first_delta"] = time.time() - t0
                        st["text"] += c["delta"]; st["chunks"] += 1
                    elif isinstance(c, dict) and c.get("sources") is not None and st["sources"] is None:
                        st["sources"] = len(c["sources"])
        except Exception as e:
            st["error"] = type(e).__name__ + ": " + str(e)

    th = threading.Thread(target=reader, daemon=True); th.start(); th.join(MAX_S)
    if th.is_alive():
        st["capped"] = True
    total = time.time() - t0
    rec = {"kind": name, "useRag": use_rag, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "status": st["status"], "ttfb": st["ttfb"], "first_json": st["first_delta"],
           "done": st["done"], "total": total, "capped": st["capped"], "chunks": st["chunks"],
           "chars": len(st["text"]), "sources": st["sources"], "error": st["error"],
           "head": st["text"][:150].replace("\n", " ")}
    with open(OUT, "a") as f:
        f.write(json.dumps(rec) + "\n")
    f = lambda v: f"{v:.1f}s" if isinstance(v, (int, float)) else "-"
    print(f"[{name}] rag={use_rag} status={st['status']} ttfb={f(st['ttfb'])} "
          f"first_delta={f(st['first_delta'])} done={f(st['done'])} total={f(total)} "
          f"capped={st['capped']} chunks={st['chunks']} chars={len(st['text'])} src={st['sources']}")
    if st["error"]:
        print("   error:", st["error"])
    if st["text"]:
        print("   head:", st["text"][:110])
    sys.stdout.flush()


if __name__ == "__main__":
    if not KEY:
        print("KROOMBOX_API_KEY not set", file=sys.stderr); sys.exit(2)
    probe("minimal_norag", "Balas tepat satu kata: halo", False)
    probe("minimal_rag", "Balas tepat satu kata: halo", True)
    probe("voice_norag", "Kamu adalah Chef Sorgum. Pertanyaan: Berapa lama menumis bumbu? Jawab singkat.", False)
