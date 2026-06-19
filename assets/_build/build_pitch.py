#!/usr/bin/env python3
"""Offside Trap — sunny-arcade pitch tileset (clean, perfectly tileable).

Per-tile AI grass repeats/seams badly, so the repeating field is built here as
flat vivid mowing-stripe tiles + a distinct "cover" tile for hidden cells + a
goal/crowd band. PixelLab handles the hero art (characters, items). 32px world.

Outputs (overwrite): tile-revealed-empty (light stripe), tile-grass-b (dark
stripe), tile-hidden (cover), goal-left, goal-mid, goal-right.

Run:  python3 assets/_build/build_pitch.py
"""
import os
from PIL import Image

T = 32
ASSETS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def hx(c):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


def grass(base, speck_lo, speck_hi, edge):
    """Flat vivid grass tile with a faint deterministic speckle + 1px cell bevel."""
    base, speck_lo, speck_hi, edge = map(hx, (base, speck_lo, speck_hi, edge))
    im = Image.new("RGBA", (T, T), base)
    px = im.load()
    for y in range(T):
        for x in range(T):
            h = (x * 7 + y * 13) % 31
            if h == 0:
                px[x, y] = speck_hi
            elif (x * 5 + y * 11) % 37 == 0:
                px[x, y] = speck_lo
    # subtle cell definition: darker right/bottom edge
    for i in range(T):
        px[T - 1, i] = edge
        px[i, T - 1] = edge
    return im


def cover(base, hi, lo, edge):
    """Hidden-cell cover: duller darker turf with a raised bevel (reads clickable)."""
    base, hi, lo, edge = map(hx, (base, hi, lo, edge))
    im = Image.new("RGBA", (T, T), base)
    px = im.load()
    for y in range(T):
        for x in range(T):
            if (x * 3 + y * 7) % 19 == 0:
                px[x, y] = lo
    for i in range(T):
        px[i, 0] = hi          # top highlight
        px[0, i] = hi          # left highlight
        px[i, T - 1] = edge    # bottom shadow
        px[T - 1, i] = edge    # right shadow
    return im


def goal(kind):
    """Goal band tile (32x32): crowd stand strip + white net + goal line.
    kind in {left, mid, right}. mid repeats across the band."""
    stand = hx("#A8344A"); crowd = [hx(c) for c in ("#F0C857", "#5AA0E0", "#EDEFE0", "#E0556A", "#7BD42E")]
    net_bg = hx("#23402F"); net = hx("#EDEFE0"); line = hx("#F4F6EA"); post = hx("#FFFFFF")
    grass_bg = hx("#54A823")
    im = Image.new("RGBA", (T, T), grass_bg)
    px = im.load()
    for y in range(T):
        for x in range(T):
            if y < 9:                                   # stands + crowd
                px[x, y] = stand
                if (x * 5 + y * 9) % 6 == 0:
                    px[x, y] = crowd[(x + y) % len(crowd)]
            elif y < 11:                                # crossbar / top frame
                px[x, y] = post
            elif y < 27:                                # net opening
                px[x, y] = net if (x % 4 == 0 or y % 6 == 0) else net_bg
            elif y < 29:                                # goal line
                px[x, y] = line
    if kind == "left":
        for y in range(9, 29):
            px[0, y] = post; px[1, y] = post
    elif kind == "right":
        for y in range(9, 29):
            px[T - 1, y] = post; px[T - 2, y] = post
    return im


def main():
    jobs = {
        "tile-revealed-empty": grass("#79D42C", "#5FB327", "#8CE03E", "#62B82B"),  # light stripe (bright)
        "tile-grass-b":        grass("#5CB827", "#48961E", "#6BC833", "#46901E"),  # dark stripe (bright)
        "tile-hidden":         cover("#2C5F31", "#41834A", "#1E4A24", "#15351A"),  # unrevealed cover (dark, raised)
        "goal-left":           goal("left"),
        "goal-mid":            goal("mid"),
        "goal-right":          goal("right"),
    }
    for name, im in jobs.items():
        im.save(os.path.join(ASSETS, name + ".png"))
        print("ok ", name)


if __name__ == "__main__":
    main()
