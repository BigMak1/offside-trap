#!/usr/bin/env python3
"""Offside Trap — sprite generation via the PixelLab API (https://api.pixellab.ai/v2).

The API secret is NEVER stored in the repo. It is resolved at runtime from, in order:
  1. env  PIXELLAB_SECRET / PIXELLAB_API_KEY
  2. ~/.claude.json  (where `claude mcp add pixellab ... -H "Authorization: Bearer <key>"`
     stored it) — we read the pixellab MCP server's Authorization header.

Usage:
  python3 assets/_build/pixellab_gen.py balance
  python3 assets/_build/pixellab_gen.py one  <out.png> <W> <H> "<description>"
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

API = "https://api.pixellab.ai/v2"


def get_secret():
    s = os.environ.get("PIXELLAB_SECRET") or os.environ.get("PIXELLAB_API_KEY")
    if s:
        return s.strip()
    cfg = os.path.expanduser("~/.claude.json")
    try:
        data = json.load(open(cfg))
    except Exception as e:
        raise SystemExit("no PIXELLAB_SECRET env and can't read ~/.claude.json: %s" % e)

    def walk(obj):
        if isinstance(obj, dict):
            srv = obj.get("mcpServers")
            if isinstance(srv, dict) and "pixellab" in srv:
                hdr = (srv["pixellab"].get("headers") or {}).get("Authorization", "")
                if hdr:
                    return hdr
            for v in obj.values():
                r = walk(v)
                if r:
                    return r
        return None

    hdr = walk(data)
    if not hdr:
        raise SystemExit("pixellab key not found in env or ~/.claude.json")
    return hdr.replace("Bearer", "").strip()


def post(path, body):
    key = get_secret()
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit("HTTP %s on %s:\n%s" % (e.code, path, e.read().decode(errors="replace")))


def get(path):
    key = get_secret()
    req = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit("HTTP %s on %s:\n%s" % (e.code, path, e.read().decode(errors="replace")))


def save_b64(image_obj, out_path):
    b64 = image_obj["base64"] if isinstance(image_obj, dict) else image_obj
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(b64))


def gen_pixflux(out_path, w, h, description, no_background=True, forced_palette=None):
    body = {"description": description, "image_size": {"width": w, "height": h},
            "no_background": no_background}
    if forced_palette:
        body["forced_palette"] = [{"color": c} for c in forced_palette]
    res = post("/create-image-pixflux", body)
    save_b64(res["image"], out_path)
    usd = (res.get("usage") or {}).get("usd")
    print("ok  %s  %dx%d  $%s" % (out_path, w, h, usd))
    return res


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    if cmd == "balance":
        print(json.dumps(get("/balance"), indent=2))
    elif cmd == "one":
        _, _, out, w, h, desc = sys.argv[:6]
        gen_pixflux(out, int(w), int(h), desc)
    else:
        raise SystemExit("unknown cmd %r" % cmd)


if __name__ == "__main__":
    main()
