#!/usr/bin/env python3
"""Compose a scaled-up contact sheet of all sprites for visual QA."""
import json
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
SCALE = 12
PAD = 10
LABEL_H = 14
COLS = 5
BG_A, BG_B = (40, 46, 58), (52, 60, 74)   # dark checker so light + dark sprites read

manifest = json.load(open(os.path.join(ASSETS, "sprites.json")))
names = sorted(manifest["sprites"].keys())

cell = 16 * SCALE                      # all sprites fit in a 16px logical box
cw = cell + PAD * 2
ch = cell + PAD * 2 + LABEL_H
rows = (len(names) + COLS - 1) // COLS
sheet = Image.new("RGB", (cw * COLS, ch * rows), (24, 28, 36))
draw = ImageDraw.Draw(sheet)

for i, name in enumerate(names):
    cx = (i % COLS) * cw
    cy = (i // COLS) * ch
    spr = Image.open(os.path.join(ASSETS, f"{name}.png")).convert("RGBA")
    big = spr.resize((spr.width * SCALE, spr.height * SCALE), Image.NEAREST)
    # checker backdrop sized to the sprite
    back = Image.new("RGB", big.size, BG_A)
    bd = ImageDraw.Draw(back)
    for yy in range(0, big.height, SCALE):
        for xx in range(0, big.width, SCALE):
            if ((xx // SCALE) + (yy // SCALE)) % 2:
                bd.rectangle([xx, yy, xx + SCALE - 1, yy + SCALE - 1], fill=BG_B)
    back.paste(big, (0, 0), big)
    # centre within the 16px cell (8x8 particles get centred)
    ox = cx + PAD + (cell - big.width) // 2
    oy = cy + PAD + (cell - big.height) // 2
    sheet.paste(back, (ox, oy))
    draw.text((cx + PAD, cy + cell + PAD + 2), name, fill=(220, 224, 232))

out = os.path.join(HERE, "_preview.png")
sheet.save(out)
print(out)
