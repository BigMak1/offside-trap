#!/usr/bin/env python3
"""Offside Trap — Stage 4 (Dragonsweeper) sprites: keeper boss, power-4 defender,
medkit, and a compact 5x7 numeral set (0-9) for multi-digit pressure / keeper HP.

Run:  python3 assets/_build/build_dragon.py
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
ROOT = os.path.dirname(ASSETS)
JSON_DIR = os.path.join(HERE, "json")
RENDER = os.path.join(ROOT, ".claude", "skills", "pixel-art-gen", "skills",
                      "pixel-art-gen", "scripts", "render_pixel_art.py")

PAL = {
    ".": None,
    "K": "#0B1322", "N": "#15233B", "B": "#243B59", "S": "#3E5C7E",
    "p": "#123A24", "g": "#1C5C34", "G": "#2E8F4E", "L": "#4FBE6C",
    "C": "#AEBFCF", "W": "#F3F1E2", "R": "#E5484D", "O": "#FF8C2B", "Y": "#FFE14D",
}

# Goalkeeper boss — distinct slate kit + gold gloves in a "save" pose (arms out).
KEEPER = [
    "................",
    "......KCCK......",
    "......CCCC......",
    ".....KSSSSK.....",
    ".KYKSSSSSSSSKYK.",
    ".KYKSSSSSSSSKYK.",
    "...KSSSSSSSSK...",
    "...KSSYYYYSSK...",
    "...KSSSSSSSSK...",
    "...KWWWWWWWWK...",
    "...KWWW..WWWK...",
    "...KCC....CCK...",
    "...KCC....CCK...",
    "..KKKKK..KKKKK..",
    "................",
    "................",
]

# Power-4 "last man" — broadest red kit, white shoulder armour, bold gold chest band.
DEFENDER_4 = [
    "................",
    "......KKKK......",
    ".....KNNNNK.....",
    ".....KCCCCK.....",
    "......CCCC......",
    "..KWRRRRRRRRWK..",
    ".KRRRRRRRRRRRRK.",
    ".KRRYYYYYYYYRRK.",
    ".KRRRRRRRRRRRRK.",
    ".KRRRRRRRRRRRRK.",
    ".KWWWWWWWWWWWWK.",
    ".KWWWWW..WWWWWK.",
    ".KCCCC....CCCCK.",
    ".KCCCC....CCCCK.",
    ".KKKKKK..KKKKKK.",
    "................",
]

# Medkit / substitution — white box, red cross.
MEDKIT = [
    "................",
    "..KKKKKKKKKKKK..",
    "..KWWWWWWWWWWK..",
    "..KWWWWWWWWWWK..",
    "..KWWWWRRWWWWK..",
    "..KWWRRRRRRWWK..",
    "..KWWRRRRRRWWK..",
    "..KWWWWRRWWWWK..",
    "..KWWWWWWWWWWK..",
    "..KWWWWWWWWWWK..",
    "..KKKKKKKKKKKK..",
    "................",
    "................",
    "................",
    "................",
    "................",
]

# Compact 5x7 numerals, white. The renderer packs them for multi-digit numbers.
NUMS = {
    0: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
    1: ["..X..", ".XX..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
    2: [".XXX.", "X...X", "....X", "..XX.", ".X...", "X....", "XXXXX"],
    3: ["XXXX.", "....X", "...X.", "..XX.", "....X", "X...X", ".XXX."],
    4: ["...X.", "..XX.", ".X.X.", "X..X.", "XXXXX", "...X.", "...X."],
    5: ["XXXXX", "X....", "XXXX.", "....X", "....X", "X...X", ".XXX."],
    6: [".XXX.", "X....", "X....", "XXXX.", "X...X", "X...X", ".XXX."],
    7: ["XXXXX", "....X", "...X.", "..X..", ".X...", ".X...", ".X..."],
    8: [".XXX.", "X...X", "X...X", ".XXX.", "X...X", "X...X", ".XXX."],
    9: [".XXX.", "X...X", "X...X", ".XXXX", "....X", "....X", ".XXX."],
}


def grid_to_json(rows, color_of):
    h, w = len(rows), len(rows[0])
    pixels = []
    for y, row in enumerate(rows):
        if len(row) != w:
            raise ValueError("bad width row %d: %r" % (y, row))
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            col = color_of(ch)
            if col is None:
                raise ValueError("bad char %r" % ch)
            pixels.append({"x": x, "y": y, "color": col})
    return {"width": w, "height": h, "background": "transparent",
            "grid_lines": False, "pixel_size": 1, "pixels": pixels}


def main():
    os.makedirs(JSON_DIR, exist_ok=True)
    items = {"keeper": KEEPER, "defender-4": DEFENDER_4, "medkit": MEDKIT}
    palette_of = lambda ch: PAL.get(ch)
    num_of = lambda ch: "#F3F1E2" if ch == "X" else None

    jobs = [(name, rows, palette_of) for name, rows in items.items()]
    for n, rows in NUMS.items():
        jobs.append(("num-%d" % n, rows, num_of))

    for name, rows, color_of in jobs:
        data = grid_to_json(rows, color_of)
        jpath = os.path.join(JSON_DIR, name + ".json")
        ppath = os.path.join(ASSETS, name + ".png")
        with open(jpath, "w") as f:
            json.dump(data, f)
        r = subprocess.run([sys.executable, RENDER, jpath, "-o", ppath, "-p", "1"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("FAIL", name, r.stderr); sys.exit(1)
        print("ok ", name, "%dx%d" % (data["width"], data["height"]), len(data["pixels"]), "px")


if __name__ == "__main__":
    main()
