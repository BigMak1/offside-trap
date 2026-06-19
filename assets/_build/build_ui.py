#!/usr/bin/env python3
"""Offside Trap — UI pixel assets (title backdrop). Same palette + render path as sprites.

Run:  python3 assets/_build/build_ui.py
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
ROOT = os.path.dirname(ASSETS)
JSON_DIR = os.path.join(HERE, "json")
RENDER = os.path.join(ROOT, ".claude", "skills", "pixel-art-gen", "skills",
                      "pixel-art-gen", "scripts", "render_pixel_art.py")

PAL = {
    "K": "#0B1322", "N": "#15233B", "B": "#243B59", "S": "#3E5C7E",
    "p": "#123A24", "g": "#1C5C34", "G": "#2E8F4E", "L": "#4FBE6C",
    "C": "#AEBFCF", "W": "#F3F1E2", "R": "#E5484D", "O": "#FF8C2B", "Y": "#FFE14D",
}


class Grid:
    def __init__(self, w, h, fill="K"):
        self.w, self.h = w, h
        self.px = [[fill] * w for _ in range(h)]
    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c
    def rows(self):
        return ["".join(r) for r in self.px]


def stadium(w=160, h=72):
    g = Grid(w, h, "K")
    horizon = 46

    # --- sky: dithered vertical gradient K -> N -> B toward the horizon ---
    for y in range(horizon):
        for x in range(w):
            t = y / horizon
            d = (x * 7 + y * 13) % 6
            if t > 0.78:
                c = "B" if d < 3 else "N"
            elif t > 0.55:
                c = "N" if d < 4 else "B"
            elif t > 0.30:
                c = "N" if d < 2 else "K"
            else:
                c = "N" if d < 1 else "K"
            g.set(x, y, c)

    # stars
    for (sx, sy) in [(14, 6), (39, 4), (66, 9), (92, 5), (118, 7), (146, 4),
                     (52, 13), (104, 15), (28, 17), (133, 16), (80, 8), (9, 12)]:
        g.set(sx, sy, "W")

    # --- stands silhouette just above the pitch, with crowd speckle ---
    for y in range(horizon - 8, horizon):
        for x in range(w):
            c = "N"
            if (x * 5 + y * 3) % 4 == 0:
                c = "B"
            if (x * 3 + y * 7) % 11 == 0:
                c = "C"
            g.set(x, y, c)

    # --- floodlight masts with glowing heads ---
    def floodlight(cx):
        for y in range(8, horizon - 6):          # pole
            g.set(cx, y, "S"); g.set(cx + 1, y, "N")
        for yy in range(3, 8):                    # head bank
            for xx in range(cx - 4, cx + 5):
                g.set(xx, yy, "S")
        for xx in range(cx - 3, cx + 4):          # lamps
            g.set(xx, 4, "Y"); g.set(xx, 6, "Y")
        for (gx, gy) in [(cx - 5, 4), (cx + 5, 5), (cx - 4, 8), (cx + 4, 8),
                         (cx, 2), (cx - 6, 6), (cx + 6, 6)]:
            g.set(gx, gy, "O")                    # soft glow flecks
    floodlight(26)
    floodlight(133)

    # --- pitch: grass ramp + markings ---
    for y in range(horizon, h):
        for x in range(w):
            band = ((y - horizon) // 3) % 2
            c = "G" if band == 0 else "g"
            if (x * 3 + y * 5) % 9 == 0:
                c = "L" if band == 0 else "G"
            g.set(x, y, c)
    # halfway line + centre circle + spot
    cy = horizon + 13
    for x in range(w):
        g.set(x, horizon + 6, "W") if x % 1 == 0 else None
    for x in range(w):
        g.set(x, horizon + 6, "W")
    cxp = w // 2
    pts = [(-6, -2), (-7, -1), (-7, 0), (-6, 1), (-4, 2), (-2, 3), (0, 3), (2, 3),
           (4, 2), (6, 1), (7, 0), (7, -1), (6, -2), (4, -3), (2, -4), (0, -4),
           (-2, -4), (-4, -3)]
    for (dx, dy) in pts:
        g.set(cxp + dx, cy + dy, "W")
    g.set(cxp, cy, "W")
    return g.rows()


def grid_to_json(rows):
    h, w = len(rows), len(rows[0])
    pixels = []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "." or ch not in PAL:
                continue
            pixels.append({"x": x, "y": y, "color": PAL[ch]})
    return {"width": w, "height": h, "background": "#0B1322",
            "grid_lines": False, "pixel_size": 1, "pixels": pixels}


def main():
    os.makedirs(JSON_DIR, exist_ok=True)
    items = {"bg-stadium": stadium()}
    for name, rows in items.items():
        data = grid_to_json(rows)
        jpath = os.path.join(JSON_DIR, name + ".json")
        ppath = os.path.join(ASSETS, name + ".png")
        with open(jpath, "w") as f:
            json.dump(data, f)
        r = subprocess.run([sys.executable, RENDER, jpath, "-o", ppath, "-p", "1"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("FAIL", name, r.stderr); sys.exit(1)
        print("ok ", name, data["width"], "x", data["height"])


if __name__ == "__main__":
    main()
