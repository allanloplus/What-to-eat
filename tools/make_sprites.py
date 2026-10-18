"""Crop the character sheets in assets/source/ into transparent WebP sprites.

Usage:  python3 tools/make_sprites.py
Needs:  Pillow, numpy

Each sprite is cut from its sheet, the white paper around the character is
flood-filled from the crop border into transparency (the black outlines stop
the fill), and the result is trimmed and scaled down.
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source"
OUT = ROOT / "assets" / "img"

# name: (sheet, (left, top, right, bottom), output max height[, options])
# Panels are cut a few px inside their black frames. Options:
#   seeds: extra (x, y) points, relative to the crop, inside paper that the
#          character encloses (e.g. the gap under a raised arm)
#   erase: (left, top, right, bottom) boxes, relative to the crop, painted
#          white first, to drop a neighbour that pokes into the crop
#   gray:  also treat light neutral grey as paper (the sheet's ruled lines)
A = "allan-expressions.jpg"
P = "allan-poses.jpg"
T = "allan-turnaround.jpg"
R = "arale-sheet.jpg"

GRID_X = [(8, 652), (686, 1318), (1350, 1992)]
GRID_Y = [(8, 677), (711, 1334), (1368, 1992)]
ALLAN_MOODS = [
    "calm", "joy", "unsure",
    "curious", "busy", "stressed",
    "sad", "treat", "tired",
]

ARALE_X = [(442, 792), (828, 1179), (1214, 1565), (1598, 1949)]
ARALE_Y = [(810, 1111), (1146, 1446)]
ARALE_FACES = [
    "laugh", "think", "surprise", "confused",
    "explain", "sad", "wink", "fired",
]

SPRITES = {}
for i, mood in enumerate(ALLAN_MOODS):
    x0, x1 = GRID_X[i % 3]
    y0, y1 = GRID_Y[i // 3]
    SPRITES[f"allan-{mood}"] = (A, (x0, y0, x1, y1), 300, {})
SPRITES["allan-stressed"][3]["seeds"] = [(115, 266)]
for i, face in enumerate(ARALE_FACES):
    x0, x1 = ARALE_X[i % 4]
    y0, y1 = ARALE_Y[i // 4]
    SPRITES[f"arale-{face}"] = (R, (x0, y0, x1, y1), 300, {})

SPRITES.update({
    "allan-stand": (P, (90, 50, 610, 1470), 560, {}),
    "allan-wave": (P, (740, 110, 1960, 1493), 560, {}),
    "allan-walk": (T, (1450, 330, 1700, 1350), 360, {"erase": [(222, 260, 250, 1020), (0, 900, 14, 1020)]}),
    "arale-hello": (R, (80, 120, 455, 770), 560, {"gray": True}),
    "arale-stand": (R, (60, 800, 415, 1470), 560, {}),
})

WHITE = 236  # every channel above this counts as paper


def knock_out_paper(img: Image.Image, opts: dict) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    for x0, y0, x1, y1 in opts.get("erase", []):
        rgb[y0:y1, x0:x1] = 255
    h, w, _ = rgb.shape
    paper = (rgb > WHITE).all(axis=2)
    if opts.get("gray"):
        paper |= (rgb > 170).all(axis=2) & (rgb.max(axis=2) - rgb.min(axis=2) < 16)
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x, y in opts.get("seeds", []):
        if paper[y, x]:
            seen[y, x] = True
            q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if paper[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if paper[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and paper[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # Soften the JPEG fringe: pixels next to the knocked-out area that are
    # still light get partial alpha so the edge doesn't show a white halo.
    light = rgb.min(axis=2)
    edge = np.zeros_like(seen)
    edge[1:, :] |= seen[:-1, :]
    edge[:-1, :] |= seen[1:, :]
    edge[:, 1:] |= seen[:, :-1]
    edge[:, :-1] |= seen[:, 1:]
    fringe = edge & ~seen & (light > 200)
    alpha[fringe] = np.clip((255 - light[fringe]) * 4, 60, 255).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), alpha])
    return Image.fromarray(out, "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheets = {}
    for name, (sheet, box, max_h, opts) in SPRITES.items():
        if sheet not in sheets:
            sheets[sheet] = Image.open(SRC / sheet)
        sprite = knock_out_paper(sheets[sheet].crop(box), opts)
        bbox = sprite.getchannel("A").getbbox()
        if bbox:
            sprite = sprite.crop(bbox)
        if sprite.height > max_h:
            ratio = max_h / sprite.height
            sprite = sprite.resize((round(sprite.width * ratio), max_h), Image.LANCZOS)
        path = OUT / f"{name}.webp"
        sprite.save(path, "WEBP", quality=82, method=6)
        print(f"{path.relative_to(ROOT)}  {sprite.size}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
