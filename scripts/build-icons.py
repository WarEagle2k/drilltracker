#!/usr/bin/env python3
"""Builds the map's rig-type icons (icons/*.png) from the silhouettes in icons/src/.

The silhouettes were generated with GPT Image (via Higgsfield) as flat black side
elevations on a transparent background. Each icon is an alpha-only mask at three
times its size on the map; the page colours it with CSS (mask-image), so one file
serves every colour mode and theme.

    python3 scripts/build-icons.py      (needs Pillow)
"""
import os
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
HEIGHTS = {'drillship': 28, 'semisub': 32, 'jackup': 36}  # CSS px on the map; keep in step with RIG_ICONS in app.js
SCALE = 3

for name, h in HEIGHTS.items():
    a = Image.open(os.path.join(ROOT, 'icons', 'src', name + '.png')).split()[-1]
    a = a.point(lambda v: 255 if v > 110 else 0)   # a hard silhouette, no soft fringe
    a = a.crop(a.getbbox())
    a = a.filter(ImageFilter.MaxFilter(5))         # thicken hairlines (crane wires, lattice) so they survive the downscale
    target = h * SCALE
    a = a.resize((round(a.size[0] * target / a.size[1]), target), Image.LANCZOS)
    out = Image.new('LA', a.size, (255, 0)); out.putalpha(a)
    path = os.path.join(ROOT, 'icons', name + '.png')
    out.save(path, optimize=True)
    print('%s: %dx%d at %dx -> %d x %d px on the map, %d KB' % (path, a.size[0], a.size[1], SCALE, round(a.size[0] / SCALE), h, os.path.getsize(path) // 1024))
