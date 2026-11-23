# Packs Muybridge's "Buffalo galloping" into one sheet for the Bison Lab.
# In: raw/fNN.jpg (the photographs) and mask/fNN.png (the animal cut out of each, by mask.swift).
# Out: a sheet, four frames across. Each frame: R = tones inside the animal, G = a rounded height (0 at the outline,
# 1 deep inside), B = the outline. Beside it, <out>-marks.png in the same layout: the lights drawn on the animal
# (the horn, the eye's pinpoint, the light on the nose), which the page sets brighter than any tone.
# Usage, from this folder: python3 pack.py ../../experiments/bison-lab/bison.png
import sys, glob, math, numpy as np
from PIL import Image, ImageFilter, ImageDraw
out = sys.argv[1]
START, N = 2, 14                         # the stride: photographs 3 to 16, the pair of ends that meet most nearly (the animal's second stride is not quite its first)
CW, CH = 400, 240                        # one frame in the sheet
X0, X1, Y0, Y1 = -760, 540, -80, 700     # the window cut from each photograph, from the body's middle and the top of the back
ROUND = 20                               # px in the sheet over which the outline rounds off
REF = 5                                  # the frame the others are lined up with, and whose head every frame wears
TAIL = (256, 302)
GREY = 190                               # the dark grey of the face's planes, in the photograph's tones
FADED = ('13',)                          # frames whose plate has faded over the hump's front edge
FLAWED = ('10', '11')                    # frames with a white flaw in the plate, under the chin                        # where the tail leaves the rump, in the window
files = sorted(glob.glob('raw/f[0-9][0-9].jpg'))
F = []
for f in files:
    im = Image.open(f).convert('L'); W, H = im.size
    mask = np.asarray(Image.open(f.replace('raw', 'mask').replace('.jpg', '.png')).convert('L').resize(im.size, Image.BILINEAR), float) / 255
    m = mask > 0.5; ys, xs = np.nonzero(m)
    lum = np.asarray(im, float); lo, hi = np.percentile(lum[m], [3, 99.2])
    F.append(dict(f=f, id=f[-6:-4], W=W, H=H, mask=mask, m=m, raw=lum, lum=np.clip((lum - lo) / (hi - lo), 0, 1),
                  t=ys.min(), b=ys.max(), l=xs.min(), r=xs.max(), top=np.where(m.any(0), m.argmax(0), -1).astype(float)))
# line the frames up by the line of the back, from the rump to the hump, which keeps its shape through the stride.
# The body then stands still and only the legs, head and tail move; the page puts the rise and fall back.
ref = F[REF]; REFID = ref['id']
cxr = np.nonzero(ref['m'][ref['t']:int(ref['t'] + 0.55 * (ref['b'] - ref['t']))])[1].mean()
sec = np.array([x for x in range(ref['l'], int(cxr)) if 0 <= ref['top'][x] < ref['t'] + 0.45 * (ref['b'] - ref['t'])])
CWs, CHs = X1 - X0, Y1 - Y0
yy, xx = np.mgrid[0:CHs, 0:CWs]
def window(fr, arr):
    ox, oy = int(round(cxr + fr['dx'] + X0)), int(round(ref['t'] + fr['dy'] + Y0)); o = np.zeros((CHs, CWs))
    xa, xb = max(0, ox), min(fr['W'], ox + CWs); ya, yb = max(0, oy), min(fr['H'], oy + CHs)
    o[ya - oy:yb - oy, xa - ox:xb - ox] = arr[ya:yb, xa:xb]; return o
def grow(a, px): return np.asarray(Image.fromarray((a * 255).astype('uint8')).filter(ImageFilter.MaxFilter(px))) > 0
def shrink(a, px): return np.asarray(Image.fromarray((a * 255).astype('uint8')).filter(ImageFilter.MinFilter(px))) > 0
def soft(a, r): return np.asarray(Image.fromarray(np.clip(a, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(r)), float)
for fr in F:
    best = None
    for dx in range(-220, 221):
        x2 = sec + dx; ok = (x2 >= 0) & (x2 < fr['W'])
        if ok.sum() < len(sec) * 0.9: continue
        t2 = fr['top'][x2[ok]]; good = t2 >= 0
        if good.sum() < len(sec) * 0.9: continue
        d = t2[good] - ref['top'][sec[ok][good]]; dy = np.median(d); err = np.mean(np.abs(d - dy))
        if best is None or err < best[0]: best = (err, dx, dy)
    fr['dx'], fr['dy'] = best[1], best[2]
    fr['wm'] = window(fr, fr['mask']); fr['wl'] = window(fr, fr['lum']); fr['wr'] = window(fr, fr['raw'])
F = F[START:START + N]
# the horn is the one bright thing on the head: where it is in each frame is where the head is
track = []
for fr in F:
    d = (soft(fr['wr'], 3) - soft(fr['wr'], 30)) * shrink(fr['wm'] > 0.5, 21)
    d[:, :980] = 0; d[:, 1240:] = 0; d[:30] = 0; d[270:] = 0
    y, x = np.unravel_index(d.argmax(), d.shape)
    near = (d > d.max() * 0.5) & (abs(yy - y) < 40) & (abs(xx - x) < 40); ys, xs = np.nonzero(near)
    track.append((xs.mean(), ys.mean()))
track = np.array(track)
def smooth(v, keep=2):   # the stride repeats, so the head's path is a sum of a few slow waves
    c = np.fft.rfft(v); c[keep + 1:] = 0; return np.fft.irfft(c, len(v))
hx, hy = smooth(track[:, 0], 1), smooth(track[:, 1], 2)
# every frame wears the reference frame's head, carried to where its own horn is: several photographs cut the face
# off at their edge, and two have plate damage across it
REF = next(i for i, fr in enumerate(F) if fr['id'] == REFID)
rx, ry = track[REF]
head = F[REF]; rm = head['wm'].copy(); rl = head['wl'].copy()
cols = np.nonzero((rm > 0.5)[:, int(rx):].any(0))[0] + int(rx)
chin = max(len(rm) - (rm[::-1, c] > 0.5).argmax() for c in cols[cols > rx + 20])   # the beard's lowest point
print('horn in the reference at %.0f, %.0f; chin at %d' % (rx, ry, chin))
for k, fr in enumerate(F):
    sx, sy = int(round(hx[k] - rx)), int(round(hy[k] - ry))
    dm, dl = np.roll(np.roll(rm, sy, 0), sx, 1), np.roll(np.roll(rl, sy, 0), sx, 1)
    low = chin + sy + 6
    w = np.clip((xx - (hx[k] - 120)) / 50, 0, 1) * np.clip((low - yy) / 24, 0, 1)
    fr['wm'] = fr['wm'] * (1 - w) + dm * w; fr['wl'] = fr['wl'] * (1 - w) + dl * w
    # what is left of the frame's own face or of the plate's flaws in front of and under the new head
    stray = (xx > hx[k] + 40) & (yy < low + 70) & (fr['wm'] > 0.3) & ~grow(dm > 0.5, 9) & ((fr['wl'] > 0.5) | (yy < low - 10))
    fr['wm'][grow(stray, 15) & (xx > hx[k] + 30) & ~(dm > 0.5)] = 0
    if fr['id'] in FLAWED:   # a white flaw in the plate under the chin: not part of the animal
        flaw = (xx > hx[k] - 80) & (yy > low - 70) & (yy < low + 120) & (fr['wl'] > 0.55)
        zone = (xx > hx[k] - 100) & (yy > low - 70)
        whole = [w for w in (F[(k - 1) % N], F[(k + 1) % N], F[(k - 2) % N], F[(k + 2) % N]) if w['id'] not in FLAWED][:2]
        near = np.maximum(*[w['wm'] for w in whole])
        gone = grow(flaw, 25) & zone
        fr['wm'][gone] = near[gone]; fr['wl'][gone] = 0.1                # under the flaw, the outline is the frames' either side
        fr['wm'][zone & ~grow(near > 0.5, 31)] = 0                       # and nothing stands where they have no trace of the animal
    # the head, beard and chest are the animal's darkest fur; some plates have faded there
    front = np.clip((xx - (hx[k] - (270 if fr['id'] in FADED else 150))) / 60, 0, 1)
    fr['wl'] = np.minimum(fr['wl'], 1 - front * 0.72)
    fr['sx'], fr['sy'] = sx, sy
def bezier(p0, p1, p2, n=40): return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in np.linspace(0, 1, n)]
def stroke(draw, pts, w0, w1, fill):
    for i, (x, y) in enumerate(pts):
        r = (w0 + (w1 - w0) * i / (len(pts) - 1)) / 2; draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)
# The tail is not in the photographs to speak of, so it is run as a rope: a chain of short links pinned to the rump,
# held up at its root the way the animal carries it at a gallop, blown back by the air it runs through, pulled down by
# its weight, and shaken by the rump rising and falling under it once a stride. It is run until it repeats, then read
# off once per frame. Lengths are px in the window and times are frames, at about 380 px to the metre and 28 frames a second.
def run_tail(HOLD=1.0, HEAVE=1.0):
    links, L, sub = 11, 17.0, 24
    rest = [math.radians(a) for a in (118, 128, 140, 152, 163, 172, 180, 186, 191, 195, 198)]   # each link's heading at rest: up off the rump, then over and back
    hold = [0.30, 0.20, 0.12, 0.07, 0.04, 0.022, 0.012, 0.007, 0.004, 0.003, 0.002]            # how firmly it is held to that: muscle at the root, none in the hair
    grav, wind, heave, drag = 4.8, 2.2, 3.0, 0.045   # px/frame²: weight; the air's push back, most on the brush; the rump's heave; and how much the air damps it
    root = np.array(TAIL, float) + (26, 20)   # a little inside the rump, so the root never shows daylight
    p = np.array([root + sum((np.array((math.cos(a), -math.sin(a))) * L for a in rest[:i]), np.zeros(2)) for i in range(links + 1)])
    q = p.copy(); out = []; dt = 1.0 / sub
    for step in range(N * sub * 14):
        ph = 2 * math.pi * (step / sub) / N
        # in the rump's own frame its heave is a force on the rope, the other way; the hindquarters kick up as the legs drive (twice the stride's rate, smaller)
        ay = heave * math.cos(ph) + 0.4 * heave * math.cos(2 * ph + 0.9)
        v = (p - q) * (1 - drag); q = p.copy()
        f = np.zeros_like(p); f[:, 1] += grav + ay * HEAVE; f[:, 0] -= wind * np.linspace(0.5, 1.6, links + 1)
        p = p + v + f * dt * dt; p[0] = root
        for i in range(1, links + 1):
            prev = p[i - 1] - p[i - 2] if i > 1 else np.array((math.cos(rest[0]), -math.sin(rest[0])))
            base = math.atan2(-prev[1], prev[0]) + (rest[i - 1] - (rest[i - 2] if i > 1 else rest[0]))   # where the link before it says it should point
            want = p[i - 1] + np.array((math.cos(base), -math.sin(base))) * L
            p[i] += (want - p[i]) * hold[i - 1] * HOLD
        for it in range(8):
            for i in range(1, links + 1): d = p[i] - p[i - 1]; p[i] = p[i - 1] + d / np.linalg.norm(d) * L
        if step >= N * sub * 13 and step % sub == 0: out.append(p.copy())
    return out
def dense(nodes, per=8):   # a smooth line through the rope's joints
    P = [nodes[0]] + list(nodes) + [nodes[-1]]; o = []
    for i in range(1, len(P) - 2):
        for t in np.linspace(0, 1, per, endpoint=False):
            o.append(tuple(0.5 * ((2 * P[i]) + (-P[i - 1] + P[i + 1]) * t + (2 * P[i - 1] - 5 * P[i] + 4 * P[i + 1] - P[i + 2]) * t * t + (-P[i - 1] + 3 * P[i] - 3 * P[i + 1] + P[i + 2]) * t ** 3)))
    return o + [tuple(nodes[-1])]
tails = run_tail()
print('tail tip travels %.0f px across and %.0f px up and down in a stride' % (np.ptp([t[-1][0] for t in tails]), np.ptp([t[-1][1] for t in tails])))
for k, fr in enumerate(F):
    x, y = hx[k], hy[k]
    M = Image.fromarray((np.clip(fr['wm'], 0, 1) * 255).astype('uint8')); L = Image.fromarray((np.clip(fr['wl'], 0, 1) * 255).astype('uint8'))
    K = Image.new('L', M.size, 0)   # the marks: the lights drawn on the animal, kept apart from its tones so they stay crisp
    dm, dl, dk = ImageDraw.Draw(M), ImageDraw.Draw(L), ImageDraw.Draw(K)
    # the tail, as the run below left it at this point in the stride: the stalk, then a brush of hair over its last third
    pts = dense(tails[k])
    for d, tone in ((dm, 255), (dl, 50)): stroke(d, pts, 34, 17, tone)
    brush = pts[int(len(pts) * 0.62):]
    for d, tone in ((dm, 255), (dl, 28)):
        for i, (px, py) in enumerate(brush):
            r = (17 + 26 * math.sin(math.pi * (i / (len(brush) - 1)) ** 0.75)) / 2; d.ellipse((px - r, py - r, px + r, py + r), fill=tone)
    # the snout: the nose is the head's lowest front corner, where the outline turns back under to the beard, well
    # below the bulge of the brow. The muzzle is built out there, a dark grey against the black of the head, with the
    # bridge of the nose running the length of the face down to it
    stroke(dl, bezier((x + 62, y + 30), (x + 84, y + 96), (x + 82, y + 154), 40), 16, 22, GREY - 14)
    muzzle = [(x + 50, y + 152), (x + 88, y + 148), (x + 100, y + 166), (x + 101, y + 200), (x + 92, y + 218), (x + 54, y + 226)]   # blunt and squared off, a little proud of the face
    for d, tone in ((dm, 255), (dl, GREY)): d.polygon(muzzle, fill=tone)
    dl.line((x + 60, y + 212, x + 98, y + 205), fill=6, width=5)                  # the mouth
    dl.ellipse((x + 84, y + 181, x + 97, y + 192), fill=4)                        # the nostril
    dk.ellipse((x + 85, y + 159, x + 99, y + 172), fill=175)                     # and the light on the nose above it
    # the eye: a pinpoint of light in a dark grey socket, down and forward of the horn's root
    ex, ey = x + 38, y + 72
    dl.ellipse((ex - 30, ey - 19, ex + 26, ey + 17), fill=GREY - 6)
    dl.line((ex - 26, ey - 15, ex + 20, ey - 17), fill=5, width=6)               # the brow over it
    dk.ellipse((ex - 8, ey - 7, ex + 8, ey + 7), fill=255)
    # the horn: from the side of the head, out and up to a point
    horn = bezier((x - 26, y + 34), (x + 40, y + 26), (x + 24, y - 74))
    stroke(dl, [(px - 3, py + 3) for px, py in horn], 48, 20, 5)   # a dark edge to stand against
    stroke(dm, horn, 32, 11, 255); stroke(dk, horn, 32, 11, 255)
    fr['M'], fr['L'], fr['K'] = M, L, K
cells = []; marks = []
for fr in F:
    L = fr['L'].resize((CW, CH), Image.LANCZOS); M = fr['M'].resize((CW, CH), Image.LANCZOS)
    mm = np.asarray(M, float) / 255
    # height: how many steps in from the outline, rounded like the side of a barrel
    d = np.zeros((CH, CW)); cur = np.pad(mm > 0.5, 1)
    for i in range(ROUND):
        d += cur[1:-1, 1:-1]
        cur[1:-1, 1:-1] = cur[1:-1, 1:-1] & cur[:-2, 1:-1] & cur[2:, 1:-1] & cur[1:-1, :-2] & cur[1:-1, 2:]
    tt = np.clip(d / ROUND, 0, 1); h = np.sqrt(1 - (1 - tt) ** 2)
    hh = soft(h * 255, 1.6) / 255
    cells.append(np.dstack([np.asarray(L, float) * (mm > 0.02), hh * 255 * (mm > 0.02), mm * 255]).astype('uint8'))
    marks.append(np.asarray(fr['K'].resize((CW, CH), Image.LANCZOS)))
    print(fr['id'], 'dx %d dy %.0f head moved %d, %d' % (fr['dx'], fr['dy'], fr['sx'], fr['sy']))
per = 4; rows = -(-N // per)
sheet = np.zeros((rows * CH, per * CW, 3), 'uint8')
for k, c in enumerate(cells): sheet[(k // per) * CH:(k // per + 1) * CH, (k % per) * CW:(k % per + 1) * CW] = c
Image.fromarray(sheet).save(out, optimize=True)
ms = np.zeros((rows * CH, per * CW), 'uint8')
for k, c in enumerate(marks): ms[(k // per) * CH:(k // per + 1) * CH, (k % per) * CW:(k % per + 1) * CW] = c
Image.fromarray(ms).save(out.replace('.png', '-marks.png'), optimize=True)
print(N, 'frames', sheet.shape)
