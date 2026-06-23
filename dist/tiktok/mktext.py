#!/usr/bin/env python3
# Render transparent text-overlay PNGs (hook layer + endcard layer) for a TikTok clip.
# Usage: python3 mktext.py '<json config>'
import sys, json, os
from PIL import Image, ImageDraw, ImageFont

DEFAULT_FONT = os.path.join(os.path.dirname(__file__), "silkscreen-700.ttf")
FONT_PATH = DEFAULT_FONT   # overridden per-config in main()
COLORS = {"accent": (255, 210, 63, 255), "white": (244, 246, 234, 255),
          "ink": (11, 19, 34, 255), "red": (229, 72, 77, 255)}

def col(name):
    return COLORS.get(name, (255, 255, 255, 255))

def fit_font(text, size, max_w):
    """Shrink font until text fits within max_w."""
    s = size
    while s > 12:
        f = ImageFont.truetype(FONT_PATH, s)
        w = f.getbbox(text)[2] - f.getbbox(text)[0]
        if w <= max_w:
            return f, w
        s -= 2
    return ImageFont.truetype(FONT_PATH, 12), 0

def draw_center(draw, W, item):
    size = item["size"]
    fill = col(item.get("fill", "white"))
    max_w = item.get("max_w", W - 110)
    f, tw = fit_font(item["text"], size, max_w)
    bbox = f.getbbox(item["text"])
    th = bbox[3] - bbox[1]
    x = (W - tw) / 2
    y = item["y"]
    # backing box (rounded) for readability
    if item.get("box"):
        pad_x, pad_y = 30, 20
        box = [x - pad_x, y - pad_y, x + tw + pad_x, y + th + pad_y + bbox[1]]
        bd = ImageDraw.Draw(draw._image if hasattr(draw, "_image") else None)
        draw.rounded_rectangle(box, radius=18, fill=(11, 19, 34, int(255 * item.get("box", 0.8))))
    # text with black stroke (outline)
    draw.text((x, y - bbox[1]), item["text"], font=f, fill=fill,
              stroke_width=item.get("stroke", 6), stroke_fill=(0, 0, 0, 235))

def render_layer(W, H, items, scrim=0.0):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if scrim > 0:
        d.rectangle([0, 0, W, H], fill=(11, 19, 34, int(255 * scrim)))
    for it in items:
        draw_center(d, W, it)
    return img

def main():
    global FONT_PATH
    cfg = json.loads(sys.argv[1])
    FONT_PATH = cfg.get("font", DEFAULT_FONT)
    W, H = cfg.get("w", 1080), cfg.get("h", 1920)
    out_dir = cfg["out_dir"]
    os.makedirs(out_dir, exist_ok=True)
    # warn on glyphs missing from the chosen font (catches missing Cyrillic)
    try:
        from fontTools.ttLib import TTFont
        cmap = TTFont(FONT_PATH).getBestCmap()
        chars = set()
        for layer in ("hook", "mid", "end"):
            for it in cfg.get(layer, []):
                chars |= set(it["text"])
        missing = sorted(c for c in chars if c != ' ' and ord(c) not in cmap)
        if missing:
            print("WARN missing glyphs in", os.path.basename(FONT_PATH), ":", missing)
    except Exception as e:
        print("glyph-check skipped:", e)
    if cfg.get("hook"):
        render_layer(W, H, cfg["hook"]).save(os.path.join(out_dir, "hook.png"))
    if cfg.get("mid"):
        render_layer(W, H, cfg["mid"]).save(os.path.join(out_dir, "mid.png"))
    if cfg.get("end"):
        render_layer(W, H, cfg["end"], scrim=cfg.get("end_scrim", 0.0)).save(os.path.join(out_dir, "end.png"))
    print("LAYERS", out_dir)

if __name__ == "__main__":
    main()
