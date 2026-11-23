#!/usr/bin/env python3
"""Raptor Run art: turn generated paintings into the cut-outs the page loads.

    python3 tools/raptor-art.py

Reads every image in experiments/raptor-run/source/ named
    raptor-<coat>.png      a raptor from directly above, head to the right
    person-<role>.png      a runner from directly above, running to the right
(png, jpg or webp). For each one it:
  1. keys out the plain background (the colour found around the border, flood-filled from
     the edges, so a pale belly or a white shirt inside the figure is kept),
  2. feathers the edge and pulls the background colour out of the edge pixels, so no white
     halo shows on the green ground,
  3. crops to the figure with a small margin and scales it (raptors 2048 px wide, people 768),
  4. writes experiments/raptor-run/art/<name>.webp with transparency,
and writes art/manifest.json listing what is there. The page uses the art it finds and
falls back to the code-sculpted creatures for anything missing.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'experiments', 'raptor-run')
SRC = os.path.join(ROOT, 'source')
OUT = os.path.join(ROOT, 'art')
TOL = 34          # how far (RGB distance) from the background colour still counts as background
EDGE = 2.2        # px of soft edge
WIDTH = {'raptor': 2048, 'person': 768}

# what the status line calls each runner, by file name; anything else is "someone"
ROLES = {
    'ranger': 'a park ranger', 'scientist': 'a scientist in a lab coat', 'tourist': 'a tourist in a loud shirt',
    'jogger': 'a jogger', 'builder': 'a construction worker', 'suit': 'someone in a suit',
    'dress': 'someone in a summer dress', 'hiker': 'a hiker', 'guard': 'a security guard', 'chef': 'a chef',
    'raincoat': 'someone in a yellow raincoat', 'hoodie': 'someone in a hoodie',
}


def background_mask(img):
    """True where the pixel is background connected to the border: the plain backdrop, and any
    soft grey shadow the generator painted under the figure (neutral greys, lighter than the
    figure, that touch the backdrop)."""
    rgb = img.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(a - bg, axis=-1)
    f = a.astype(np.float32)
    mx, mn = f.max(axis=-1), f.min(axis=-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
    shadowy = (sat < 0.1) & (lum > 120) & (lum <= bg.mean() + 4)
    cand = (dist < TOL) | shadowy
    probe = Image.fromarray((cand * 255).astype(np.uint8)).copy()  # a copy: an image over a numpy buffer ignores flood fills
    step = max(8, min(w, h) // 64)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] + \
            [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for x, y in seeds:
        if probe.getpixel((x, y)) == 255:
            ImageDraw.floodfill(probe, (x, y), 128, thresh=0)
    # pockets of backdrop enclosed by the figure (between a leg and the tail, say): seed only
    # where a whole 11 px square is backdrop-coloured, so small white details are kept
    near = (dist < TOL * 0.6).astype(np.uint8) * 255
    solid = np.asarray(Image.fromarray(near).filter(ImageFilter.MinFilter(11))) > 0
    filled = np.asarray(probe) == 128
    ys, xs = np.nonzero(solid & ~filled)
    for y, x in list(zip(ys, xs))[::97]:
        if probe.getpixel((int(x), int(y))) == 255:
            ImageDraw.floodfill(probe, (int(x), int(y)), 128, thresh=0)
    m = np.asarray(probe) == 128
    return m, bg, dist


def cut(path, kind):
    img = Image.open(path)
    img.load()
    has_alpha = img.mode in ('RGBA', 'LA') and np.asarray(img.getchannel('A')).min() < 250
    rgba = img.convert('RGBA')
    if has_alpha:
        alpha = np.asarray(rgba.getchannel('A')).astype(np.float32) / 255
        bg = np.array([255, 255, 255])
    else:
        mask, bg, dist = background_mask(rgba)
        # soften: blur the hard mask a little, then keep only the fade toward the outside
        hard = Image.fromarray(((~mask) * 255).astype(np.uint8))
        soft = np.asarray(hard.filter(ImageFilter.GaussianBlur(EDGE))).astype(np.float32) / 255
        inner = np.asarray(hard.filter(ImageFilter.MinFilter(3))).astype(np.float32) / 255
        alpha = np.clip(np.minimum(soft * 1.6 - 0.3, 1.0), 0, 1)
        alpha = np.maximum(alpha, inner)
        # in a band along the edge, fade pixels by how close they are to the background colour,
        # which takes off the pale fringe a generated image leaves around a figure
        band = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
        t = np.clip((dist - TOL * 0.5) / (TOL * 2.5), 0, 1)
        fade = t * t * (3 - 2 * t)
        alpha = np.where(band, np.minimum(alpha, fade), alpha)
    a = np.asarray(rgba).astype(np.float32)
    rgb = a[..., :3]
    # un-mix the background from semi-transparent edge pixels
    k = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.where(alpha[..., None] < 0.999, (rgb - bg * (1 - k)) / k, rgb)
    rgb = np.clip(rgb, 0, 255)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    ys, xs = np.nonzero(alpha > 0.02)
    if not len(xs):
        raise ValueError('nothing left after removing the background')
    pad = int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.02) + 2
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad + 1), min(im.height, ys.max() + pad + 1))
    im = im.crop(box)
    target = WIDTH[kind]
    if im.width != target:
        im = im.resize((target, max(1, round(im.height * target / im.width))), Image.LANCZOS)
    return im


def spine(im, n=48):
    """The backbone's line and the trunk's half depth across the painting, n samples each (in
    image heights, 0 top .. 1 bottom), head first. Legs and arms hang off one side of the trunk,
    so the trunk's depth is taken as a low percentile over a wide window of columns (limb columns
    stand out above it), and the spine sits that far in from the back edge. The page bends the
    painting along the spine and swings whatever sticks out past the trunk."""
    a = np.asarray(im.getchannel('A')).astype(np.float32) / 255
    h, w = a.shape
    top, bot = [], []
    for i in range(n):
        x0, x1 = int(i * w / n), int((i + 1) * w / n)
        col = a[:, x0:max(x1, x0 + 1)].max(axis=1) > 0.5
        ys = np.nonzero(col)[0]
        top.append(ys.min() / h if len(ys) else None)
        bot.append(ys.max() / h if len(ys) else None)
    known = [i for i in range(n) if top[i] is not None]
    for i in range(n):
        if top[i] is None:
            j = min(known, key=lambda k: abs(k - i))
            top[i], bot[i] = top[j], bot[j]
    depth = np.array(bot) - np.array(top)
    trunk = np.array([np.percentile(depth[max(0, i - 6):i + 7], 30) for i in range(n)]) / 2
    # the back is the side the limbs don't hang from: the edge that moves least along the body
    back_top = np.std(np.diff(top)) <= np.std(np.diff(bot))
    centre = np.array(top) + trunk if back_top else np.array(bot) - trunk
    sm = lambda v, k: np.array([np.mean(v[max(0, i - k):i + k + 1]) for i in range(n)])
    centre, trunk = sm(centre, 3), sm(trunk, 2)
    return [round(float(v), 4) for v in centre[::-1]], [round(float(v), 4) for v in trunk[::-1]]


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isdir(SRC):
        sys.exit(f'No source folder: {SRC}')
    manifest = {'raptors': [], 'people': []}
    for f in sorted(os.listdir(SRC)):
        stem, ext = os.path.splitext(f)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp') or '-' not in stem:
            continue
        kind, name = stem.split('-', 1)
        if kind not in WIDTH:
            continue
        im = cut(os.path.join(SRC, f), kind)
        file = f'{kind}-{name}.webp'
        im.save(os.path.join(OUT, file), 'WEBP', quality=90, method=6)
        entry = {'file': file, 'w': im.width, 'h': im.height}
        if kind == 'raptor':
            entry['spine'], entry['trunk'] = spine(im)
            manifest['raptors'].append({'name': name, **entry})
        else:
            manifest['people'].append({'role': name, 'name': ROLES.get(name, 'someone'), **entry})
        print(f'{f} -> art/{file}  {im.width}x{im.height}  {os.path.getsize(os.path.join(OUT, file)) // 1024} KB')
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
    print(f"manifest: {len(manifest['raptors'])} raptors, {len(manifest['people'])} people")


if __name__ == '__main__':
    main()
