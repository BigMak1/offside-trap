#!/usr/bin/env python3
"""Offside Trap — Stage 5 restyle: defenders colour-coded by power (tier ramp) +
a brighter violet keeper boss. Power numbers are drawn at runtime by the renderer,
so sprites stay clean. Overwrites defender-1..4 and keeper.

Run:  python3 assets/_build/build_defenders.py
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
    "C": "#AEBFCF", "W": "#F3F1E2", "R": "#E5484D", "O": "#FF8C2B", "Y": "#FFE14D",
    "I": "#42C6D9",   # cyan  — tier 1 (new)
    "V": "#A65AD8",   # violet — keeper boss (new)
    "D": "#0A1018",   # near-black boot/outline accent
}

# Clean footballer template. 'J' = tier jersey colour (substituted per power).
TEMPLATE = [
    "................",
    "......KKKK......",
    ".....KCCCCK.....",
    ".....KCCCCK.....",
    "......KCCK......",
    "...KKJJJJJJKK...",
    "..KWJJJJJJJJWK..",
    "..KWJJJJJJJJWK..",
    "...KJJJJJJJJK...",
    "...KJJJJJJJJK...",
    "...KJJJJJJJJK...",
    "...KWWWWWWWWK...",
    "...KWWW..WWWK...",
    "...KCCC..CCCK...",
    "..KKKK..KKKK....",
    "................",
]

# Keeper boss — violet kit, gold gloves, "save" pose; brighter + distinct from field tiers.
KEEPER = [
    "................",
    "......KCCK......",
    "......CCCC......",
    ".....KVVVVK.....",
    ".KYKVVVVVVVVKYK.",
    ".KYKVVVVVVVVKYK.",
    "...KVVVVVVVVK...",
    "...KVVWWWWVVK...",
    "...KVVVVVVVVK...",
    "...KWWWWWWWWK...",
    "...KWWW..WWWK...",
    "...KCCC..CCCK...",
    "...KCCC..CCCK...",
    "..KKKK..KKKK....",
    "................",
    "................",
]

TIERS = {1: "I", 2: "Y", 3: "O", 4: "R"}   # cyan / gold / orange / red


def grid_to_json(rows, jersey=None):
    h, w = len(rows), len(rows[0])
    pixels = []
    for y, row in enumerate(rows):
        if len(row) != w:
            raise ValueError("bad width row %d (%d): %r" % (y, len(row), row))
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            col = PAL[jersey] if (ch == "J" and jersey) else PAL.get(ch)
            if col is None:
                raise ValueError("bad char %r" % ch)
            pixels.append({"x": x, "y": y, "color": col})
    return {"width": w, "height": h, "background": "transparent",
            "grid_lines": False, "pixel_size": 1, "pixels": pixels}


def main():
    os.makedirs(JSON_DIR, exist_ok=True)
    jobs = [("defender-%d" % n, TEMPLATE, TIERS[n]) for n in (1, 2, 3, 4)]
    jobs.append(("keeper", KEEPER, None))
    for name, rows, jersey in jobs:
        data = grid_to_json(rows, jersey)
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
