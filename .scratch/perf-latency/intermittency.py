#!/usr/bin/env python3
"""
Intermittency check: fire N short requests, report success/fail per attempt.

Answers the user's "kenapa kadang aman tapi req sering gagal?" question:
if some attempts succeed and some hang, the upstream is OVERLOADED/queueing,
not fully down. Each attempt is bounded by CAP seconds.
"""
import json, os, sys, time, urllib.request

BASE = os.environ.get("KROOMBOX_BASE_URL", "https://api.llmsorgum.online")
KEY = os.environ.get("KROOMBOX_API_KEY", "")
URL = BASE + "/api/chat"
N = int(os.environ.get("N", "4"))
CAP = float(os.environ.get("CAP", "45"))


def attempt(i):
    body = json.dumps({
        "message": "Balas satu kata: halo", "history": [],
        "useRag": False, "stream": True, "max_tokens": 20,
    }).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json", "X-API-Key": KEY,
        "Accept": "text/event-stream",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) bima-perf-probe"}, method="POST")
    t0 = time.time()
    ttfb = first = done = None
    text = ""
    try:
        with urllib.request.urlopen(req, timeout=CAP + 10) as resp:
            for raw in resp:
                if time.time() - t0 > CAP:
                    break
                if ttfb is None:
                    ttfb = time.time() - t0
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                p = line[5:].strip()
                if p == "[DONE]":
                    done = time.time() - t0
                    break
                try:
                    c = json.loads(p)
                except Exception:
                    continue
                if isinstance(c, dict) and c.get("delta"):
                    if first is None:
                        first = time.time() - t0
                    text += c["delta"]
    except Exception as e:
        return (i, "ERROR", f"{type(e).__name__}: {e}")
    status = "OK" if first is not None else ("BYTES_ONLY" if ttfb is not None else "NO_BYTE")
    f = (lambda v: "-" if v is None else f"{v:.1f}s")
    return (i, status, f"ttfb={f(ttfb)} first_token={f(first)} done={f(done)} chars={len(text)}")


if __name__ == "__main__":
    if not KEY:
        print("KROOMBOX_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    print(f"firing {N} short attempts, cap {CAP:.0f}s each")
    for i in range(1, N + 1):
        i, status, info = attempt(i)
        print(f"attempt {i}: {status:10s} {info}")
        sys.stdout.flush()
