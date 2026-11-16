# Packs render.py's frames of the 3DRT bison into one sheet for the Bison Lab.
# In: model/out/aNN.png (the texture's colours, unlit), nNN.png (which way the surface faces), dNN.png (nearness)
# and meta.json.
# Out: a sheet, four frames across. Each frame: R = the animal's tones (its coat, lit from above and ahead), G = a height
# (0 at the outline, rounding up inside it, and higher the nearer the camera, so a leg stands off the belly behind
# it), B = the outline. Beside it, <out>-marks.png in the same layout: the
# lights on the head (the horn and the eye), which the page sets brighter than any tone.
# Usage, from this folder: python3 sheet.py ../../tinkering/bison-lab/bison.png
import sys, glob, json, numpy as np
from PIL import Image, ImageFilter
out = sys.argv[1]
CW, CH = 400, 240            # one frame in the sheet
ROUND = 20                   # px in the sheet over which the outline rounds off
DEPTH = 0.6                  # how much of the height is the model's own nearness, the rest the rounded outline
LIGHT = (0.5, 0.15, 0.8)     # where the light is: toward the camera, ahead of the animal, above it
AMBIENT = 0.22               # how bright a surface turned right away from the light still is
COAT = 0.72                  # how much of the tone is the coat's own light and dark; the rest is the light on its form alone
def soft(a, r): return np.asarray(Image.fromarray(np.clip(a, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(r)), float)
def grow(a, px): return np.asarray(Image.fromarray((a * 255).astype('uint8')).filter(ImageFilter.MaxFilter(px))) > 0
meta = json.load(open('model/out/meta.json'))['frames']
files = sorted(glob.glob('model/out/a[0-9][0-9].png')); N = len(files)
F = []
for k, f in enumerate(files):
    a = np.asarray(Image.open(f).convert('RGBA'), float) / 255; n = np.asarray(Image.open(f.replace('/a', '/n')).convert('RGB'), float) / 127.5 - 1
    d = np.asarray(Image.open(f.replace('/a', '/d')).convert('RGBA'), float)[..., 0] / 255
    F.append(dict(rgb=a[..., :3], mask=a[..., 3], facing=n, depth=d, head=meta[k]['Bip01_Head'], nub=meta[k]['Bip01_HeadNub']))
H, W = F[0]['mask'].shape; yy, xx = np.mgrid[0:H, 0:W]
# one scale for the whole stride, so a frame is not brighter than its neighbours
lum = [fr['rgb'] @ np.array((0.3, 0.59, 0.11)) for fr in F]
inside = np.concatenate([l[fr['mask'] > 0.9] for l, fr in zip(lum, F)]); lo, hi = np.percentile(inside, [2, 99.5])
# the model's axes, as the camera sees them: its width runs away from the camera, and its length whichever way the head is
m0 = F[0]['mask'] > 0.9; cols = np.nonzero(m0.any(0))[0]; mid = (cols[0] + cols[-1]) / 2
ahead = np.sign(F[0]['facing'][..., 1][m0 & (xx > mid)].mean() - F[0]['facing'][..., 1][m0 & (xx < mid)].mean())
SUN = np.array(LIGHT, float); SUN /= np.linalg.norm(SUN); SUN = SUN * (-1, ahead, 1)
din = np.concatenate([fr['depth'][fr['mask'] > 0.9] for fr in F]); dlo, dhi = np.percentile(din, [1, 99.5])
cells, marks = [], []
for k, fr in enumerate(F):
    coat = np.clip((lum[k] - lo) / (hi - lo), 0, 1)
    n = fr['facing']; lit = np.clip((n @ SUN) / np.maximum(np.linalg.norm(n, axis=2), 1e-3), 0, 1)
    tone = (1 - COAT + COAT * coat) * (AMBIENT + (1 - AMBIENT) * lit)   # the light on the form, through the coat
    # the lights on the head. The horn and the eye are the only pale things on it: both are found by their
    # tone, near the head's bone, so they sit exactly where the model has them
    mx, mn = fr['rgb'].max(2), fr['rgb'].min(2); sat = (mx - mn) / np.maximum(mx, 1e-3)
    hx, hy = fr['head']; nx, ny = fr['nub']; reach = np.hypot(nx - hx, ny - hy)
    near = (np.hypot(xx - hx, yy - hy) < reach * 2.6) & (fr['mask'] > 0.9)
    pale = near & (coat > 0.5)
    solid = soft(pale * 255.0, 4) > 140                                # the coat has pale flecks too: only what is pale all through counts
    horn = grow(solid, 9) & near & (coat > 0.4)
    eye = np.zeros_like(horn)
    mark = soft(horn * 255.0, 1.5)
    fr['dbg'] = (tone, horn, eye)
    M = Image.fromarray((fr['mask'] * 255).astype('uint8')).resize((CW, CH), Image.LANCZOS)
    L = Image.fromarray((np.clip(tone, 0, 1) * 255).astype('uint8')).resize((CW, CH), Image.LANCZOS)
    mm = np.asarray(M, float) / 255
    # height: how many steps in from the outline, rounded like the side of a barrel
    d = np.zeros((CH, CW)); cur = np.pad(mm > 0.5, 1)
    for i in range(ROUND):
        d += cur[1:-1, 1:-1]
        cur[1:-1, 1:-1] = cur[1:-1, 1:-1] & cur[:-2, 1:-1] & cur[2:, 1:-1] & cur[1:-1, :-2] & cur[1:-1, 2:]
    tt = np.clip(d / ROUND, 0, 1); h = np.sqrt(1 - (1 - tt) ** 2)
    nearness = np.asarray(Image.fromarray((np.clip((fr['depth'] - dlo) / (dhi - dlo), 0, 1) * 255).astype('uint8')).resize((CW, CH), Image.LANCZOS), float) / 255
    h = h * (1 - DEPTH + DEPTH * nearness)
    hh = soft(h * 255, 1.0) / 255
    cells.append(np.dstack([np.asarray(L, float) * (mm > 0.02), hh * 255 * (mm > 0.02), mm * 255]).astype('uint8'))
    marks.append(np.asarray(Image.fromarray(mark.astype('uint8')).resize((CW, CH), Image.LANCZOS)))
    print('%02d horn %d px, eye %d px' % (k, horn.sum(), eye.sum()))
per = 4; rows = -(-N // per)
sheet = np.zeros((rows * CH, per * CW, 3), 'uint8')
for k, c in enumerate(cells): sheet[(k // per) * CH:(k // per + 1) * CH, (k % per) * CW:(k % per + 1) * CW] = c
Image.fromarray(sheet).save(out, optimize=True)
ms = np.zeros((rows * CH, per * CW), 'uint8')
for k, c in enumerate(marks): ms[(k // per) * CH:(k // per + 1) * CH, (k % per) * CW:(k % per + 1) * CW] = c
Image.fromarray(ms).save(out.replace('.png', '-marks.png'), optimize=True)
print(N, 'frames', sheet.shape)
if len(sys.argv) > 2:   # a second path: a picture of the tones and the marks found, to check by eye
    rowsd = [np.hstack([(np.clip(fr['dbg'][0], 0, 1) * 255)[100:500, 850:1250], (fr['dbg'][1] * 255.0)[100:500, 850:1250]]) for fr in F[::3]]
    Image.fromarray(np.vstack(rowsd).astype('uint8')).save(sys.argv[2])
