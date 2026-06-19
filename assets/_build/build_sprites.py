#!/usr/bin/env python3
"""Offside Trap — sprite builder.

Designs every sprite as an ASCII grid (one char = one palette color),
converts it to the pixel-art-gen JSON format and renders native PNGs
(transparent background, pixel_size=1) into assets/.

Run:  python3 assets/_build/build_sprites.py
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)                       # .../assets
ROOT = os.path.dirname(ASSETS)                       # project root
JSON_DIR = os.path.join(HERE, "json")
RENDER = os.path.join(
    ROOT, ".claude", "skills", "pixel-art-gen", "skills",
    "pixel-art-gen", "scripts", "render_pixel_art.py",
)

# ── Palette: "stadium evening under floodlights" ────────────────────────────
PAL = {
    ".": None,            # transparent
    "K": "#0B1322",       # Midnight   — outline / darkest
    "N": "#15233B",       # Deep Navy
    "B": "#243B59",       # Steel Blue
    "S": "#3E5C7E",       # Slate
    "p": "#123A24",       # Pitch Shadow
    "g": "#1C5C34",       # Deep Grass
    "G": "#2E8F4E",       # Grass
    "L": "#4FBE6C",       # Grass Light
    "C": "#AEBFCF",       # Cool Grey
    "W": "#F3F1E2",       # Floodlight White
    "R": "#E5484D",       # Threat Red
    "O": "#FF8C2B",       # Cone Orange
    "Y": "#FFE14D",       # Floodlight Gold (signature accent)
}


# ── tiny grid helper ────────────────────────────────────────────────────────
class Grid:
    def __init__(self, w=16, h=16, fill="."):
        self.w, self.h = w, h
        self.px = [[fill] * w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return "."

    def rows(self):
        return ["".join(r) for r in self.px]


# ── procedural sprites ──────────────────────────────────────────────────────
def tile_hidden():
    """Raised, covered turf — light top/left bevel, dark bottom/right, dithered."""
    g = Grid()
    for y in range(16):
        for x in range(16):
            if y == 0 or x == 0:
                c = "S"
            elif y == 15 or x == 15:
                c = "K"
            else:
                c = "B" if (x + y) % 2 == 0 else "N"
            g.set(x, y, c)
    return g.rows()


def tile_revealed():
    """Open mown grass — recessed (dark top/left), bright bottom/right, stripes."""
    g = Grid()
    for y in range(16):
        for x in range(16):
            if y == 0 or x == 0:
                c = "p"
            elif y == 15 or x == 15:
                c = "G"
            else:
                band = (y // 4) % 2
                c = "G" if band == 0 else "g"
                if (x * 3 + y * 5) % 7 == 0:
                    c = "L" if band == 0 else "G"
            g.set(x, y, c)
    return g.rows()


def ball():
    g = Grid()
    spans = {2: (6, 9), 3: (5, 10), 4: (4, 11), 5: (4, 11), 6: (3, 12),
             7: (3, 12), 8: (3, 12), 9: (3, 12), 10: (4, 11), 11: (4, 11),
             12: (5, 10), 13: (6, 9)}
    for y, (a, b) in spans.items():
        for x in range(a, b + 1):
            g.set(x, y, "W")
    # 1px dark outline
    for y in range(16):
        for x in range(16):
            if g.get(x, y) == "W" and any(
                g.get(x + dx, y + dy) == "." for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                g.set(x, y, "K")
    # central pentagon
    for (x, y) in [(7, 6), (8, 6), (6, 7), (7, 7), (8, 7), (9, 7),
                   (6, 8), (7, 8), (8, 8), (9, 8), (7, 9), (8, 9)]:
        g.set(x, y, "K")
    # seams toward the edges
    for (x, y) in [(5, 5), (10, 5), (5, 10), (10, 10)]:
        if g.get(x, y) == "W":
            g.set(x, y, "N")
    # floodlight glint (top-left) + soft shadow (bottom-right)
    for (x, y) in [(5, 4), (4, 5)]:
        if g.get(x, y) == "W":
            g.set(x, y, "Y")
    for (x, y) in [(11, 10), (10, 11)]:
        if g.get(x, y) == "W":
            g.set(x, y, "C")
    return g.rows()


def goal_segment(kind):
    g = Grid()
    for x in range(16):
        g.set(x, 0, "W")   # crossbar
        g.set(x, 1, "C")   # bar shadow
    for y in range(2, 11):
        for x in range(16):
            if y < 6:
                if (x + y) % 2 == 0:
                    g.set(x, y, "C")
            elif (x + y) % 3 == 0:
                g.set(x, y, "C")
    if kind == "left":
        for y in range(16):
            g.set(0, y, "W")
            g.set(1, y, "C")
    if kind == "right":
        for y in range(16):
            g.set(15, y, "W")
            g.set(14, y, "C")
    return g.rows()


# ── digit glyphs (8 wide x 12 tall, 'X' = stroke) ───────────────────────────
DIGITS = {
    0: ["." + "XXXXXX" + ".", "XX....XX", "XX....XX", "XX...XXX", "XX..XXXX",
        "XX.XX.XX", "XXXX..XX", "XXX...XX", "XX....XX", "XX....XX", "XX....XX",
        "." + "XXXXXX" + "."],
    1: ["...XX...", "..XXX...", ".XXXX...", "...XX...", "...XX...", "...XX...",
        "...XX...", "...XX...", "...XX...", "...XX...", ".XXXXXX.", ".XXXXXX."],
    2: [".XXXXX..", "XX...XX.", ".....XX.", "....XX..", "...XX...", "..XX....",
        ".XX.....", "XX......", "XX......", "XX...XX.", "XXXXXXX.", "XXXXXXX."],
    3: [".XXXXX..", "XX...XX.", ".....XX.", "....XX..", "..XXX...", "....XX..",
        ".....XX.", ".....XX.", "XX...XX.", "XX...XX.", ".XXXXX..", ".XXXXX.."],
    4: ["....XX..", "...XXX..", "..XXXX..", ".XX.XX..", "XX..XX..", "XX..XX..",
        "XXXXXXX.", "XXXXXXX.", "....XX..", "....XX..", "....XX..", "....XX.."],
    5: ["XXXXXXX.", "XXXXXXX.", "XX......", "XX......", "XXXXXX..", "XX...XX.",
        ".....XX.", ".....XX.", "XX...XX.", "XX...XX.", ".XXXXX..", ".XXXXX.."],
    6: ["..XXXX..", ".XX.....", "XX......", "XX......", "XXXXXX..", "XXX..XX.",
        "XX...XX.", "XX...XX.", "XX...XX.", "XX...XX.", ".XXXXX..", ".XXXXX.."],
}
# danger ramp colour per digit (shape already differs)
DIGIT_COLOR = {0: "C", 1: "L", 2: "W", 3: "Y", 4: "O", 5: "R", 6: "R"}


def digit(n):
    """Render a numeral centred in 16x16 with a 1px dark drop-shadow."""
    g = Grid()
    glyph = DIGITS[n]
    fill = DIGIT_COLOR[n]
    ox, oy = 3, 2
    # shadow first
    for gy, row in enumerate(glyph):
        for gx, ch in enumerate(row):
            if ch == "X":
                g.set(ox + gx + 1, oy + gy + 1, "K")
    # stroke on top
    for gy, row in enumerate(glyph):
        for gx, ch in enumerate(row):
            if ch == "X":
                g.set(ox + gx, oy + gy, fill)
    return g.rows()


# ── literal ASCII sprites ───────────────────────────────────────────────────
DEFENDER_1 = [
    "................",
    "......KKKK......",
    ".....KNNNNK.....",
    ".....KCCCCK.....",
    ".....KCCCCK.....",
    "......CCCC......",
    "...KRRRRRRRRK...",
    "...KRRRRRRRRK...",
    "...KRRRYRRRRK...",
    "...KRRRRRRRRK...",
    "...KRRRRRRRRK...",
    "...KWWWWWWWWK...",
    "...KWWW..WWWK...",
    "...KCC....CCK...",
    "...KCC....CCK...",
    "..KKKKK..KKKKK..",
]

DEFENDER_2 = [
    "................",
    "......KKKK......",
    ".....KNNNNK.....",
    ".....KCCCCK.....",
    ".....KCCCCK.....",
    "......CCCC......",
    "..KRRRRRRRRRRK..",
    "..KWRRRRRRRRWK..",
    "..KRRYRRRRYRRK..",
    "..KRRRRRRRRRRK..",
    "..KRRRRRRRRRRK..",
    "..KWWWWWWWWWWK..",
    "..KWWWW..WWWWK..",
    "..KCCCC..CCCCK..",
    "..KCCCC..CCCCK..",
    "..KKKKK..KKKKK..",
]

DEFENDER_3 = [
    "....Y.Y.Y.Y.....",
    "....YYYYYYY.....",
    ".....KNNNNK.....",
    ".....KCCCCK.....",
    "......CCCC......",
    "..KYRRRRRRRRYK..",
    "..KRRRRRRRRRRK..",
    "..KRRRRYYRRRRK..",
    "..KRRRYYYYRRRK..",
    "..KRRRRYYRRRRK..",
    "..KRRRRRRRRRRK..",
    "..KWWWWWWWWWWK..",
    "..KWWWW..WWWWK..",
    "..KCCCC..CCCCK..",
    "..KCCCC..CCCCK..",
    "..KKKKK..KKKKK..",
]

MARKER_CONE = [
    ".......K........",
    ".......KYYY.....",
    ".......KYYYY....",
    ".......KYY......",
    ".......K........",
    ".......K........",
    "......KOK.......",
    "......KOOK......",
    ".....KOOOOK.....",
    ".....KWWWWK.....",
    "....KOOOOOOK....",
    "....KOOOOOOK....",
    "...KWWWWWWWWK...",
    "...KOOOOOOOOK...",
    "..KOOOOOOOOOOK..",
    "..KKKKKKKKKKKK..",
]

# stamina = green energy bolt
ICON_STAMINA = [
    ".........KK.....",
    "........KLK.....",
    ".......KLLK.....",
    "......KLLK......",
    ".....KLLK.......",
    "....KLLKKKKK....",
    "...KLLLLLLLK....",
    "...KKKKKLLLK....",
    "......KKLLK.....",
    ".......KLLK.....",
    "......KLLK......",
    ".....KLLK.......",
    "....KLLK........",
    "....KLK.........",
    "....KK..........",
    "................",
]

# skill = gold sparkle (4-point star)
ICON_SKILL = [
    ".......KK.......",
    ".......YY.......",
    "......KYYK......",
    ".....KYYYYK.....",
    "...KKYYYYYYKK...",
    "..KYYYYYYYYYYK..",
    "...KKYYYYYYKK...",
    ".....KYYYYK.....",
    "......KYYK......",
    ".......YY.......",
    ".......KK.......",
    "................",
    "................",
    "................",
    "................",
    "................",
]

# ── 8x8 particles ───────────────────────────────────────────────────────────
PART_SPARK = [
    "...Y....",
    "...Y....",
    "...Y....",
    "YYYWYYY.",
    "...Y....",
    "...Y....",
    "...Y....",
    "........",
]

PART_CONFETTI = [
    "........",
    "...YY...",
    "..YYWW..",
    "..WWOO..",
    "...OO...",
    "........",
    "........",
    "........",
]

PART_RING = [
    "..YYYY..",
    ".Y....Y.",
    "Y......Y",
    "Y......Y",
    "Y......Y",
    ".Y....Y.",
    "..YYYY..",
    "........",
]


# ── build registry ──────────────────────────────────────────────────────────
def build():
    sprites = {
        "tile-hidden": tile_hidden(),
        "tile-revealed-empty": tile_revealed(),
        "ball": ball(),
        "goal-left": goal_segment("left"),
        "goal-mid": goal_segment("mid"),
        "goal-right": goal_segment("right"),
        "defender-1": DEFENDER_1,
        "defender-2": DEFENDER_2,
        "defender-3": DEFENDER_3,
        "marker-cone": MARKER_CONE,
        "icon-stamina": ICON_STAMINA,
        "icon-skill": ICON_SKILL,
        "particle-spark": PART_SPARK,
        "particle-confetti": PART_CONFETTI,
        "particle-ring": PART_RING,
    }
    for n in range(7):
        sprites[f"digit-{n}"] = digit(n)
    return sprites


def grid_to_json(rows):
    h = len(rows)
    w = len(rows[0])
    pixels = []
    for y, row in enumerate(rows):
        if len(row) != w:
            raise ValueError(f"row {y} has width {len(row)}, expected {w}: {row!r}")
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if ch not in PAL or PAL[ch] is None:
                raise ValueError(f"unknown palette char {ch!r} at ({x},{y})")
            pixels.append({"x": x, "y": y, "color": PAL[ch]})
    return {"width": w, "height": h, "background": "transparent",
            "grid_lines": False, "pixel_size": 1, "pixels": pixels}


def main():
    os.makedirs(JSON_DIR, exist_ok=True)
    os.makedirs(ASSETS, exist_ok=True)
    sprites = build()
    manifest = {
        "tileSize": 16,
        "note": "Native-resolution sprites; scale only by integer factors.",
        "palette": {k: v for k, v in PAL.items() if v},
        "sprites": {},
    }
    for name, rows in sorted(sprites.items()):
        data = grid_to_json(rows)
        jpath = os.path.join(JSON_DIR, f"{name}.json")
        ppath = os.path.join(ASSETS, f"{name}.png")
        with open(jpath, "w") as f:
            json.dump(data, f)
        r = subprocess.run(
            [sys.executable, RENDER, jpath, "-o", ppath, "-p", "1"],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            print(f"FAIL {name}:\n{r.stdout}\n{r.stderr}")
            sys.exit(1)
        manifest["sprites"][name] = {
            "file": f"assets/{name}.png",
            "w": data["width"], "h": data["height"],
        }
        print(f"ok  {name}  {data['width']}x{data['height']}  ({len(data['pixels'])} px)")

    with open(os.path.join(ASSETS, "sprites.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nWrote {len(sprites)} sprites + sprites.json")


if __name__ == "__main__":
    main()
