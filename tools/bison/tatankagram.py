# The points the Tatankagram experiment (tinkering/tatankagram/) makes the animal from. Run by Blender:
#   /Applications/Blender.app/Contents/MacOS/Blender -b model/src/bison_blender.blend --python tatankagram.py
# It stands the model in its stand pose, scatters N points over its surface (each triangle gets points in proportion
# to its area, so the beads lie evenly), and gives each one the coat's brightness under it (bison.tga) and which way
# the surface faces there. Two sets:
#   head.bin   a bust: the head, the beard and the front of the hump, the head looking at the viewer
#   whole.bin  the whole animal, seen from the side
# Each point is 15 bytes: x, y, z as unsigned 16-bit (-RANGE to RANGE, the frame -1 to 1, z toward the viewer), the
# coat's tone (0-255, stretched), a size (0-255), the surface's facing packed into two bytes (octahedral), the coat's
# own colour (r, g, b, 0-255, as the texture has it), and how far the bead sits out from the skin in the coat (0-255
# for 0 to 0.1 of the frame; the experiment's Density fader scales it), and how loose it is (0-255: 0 on the animal,
# up to 255 far out in the trail the neck becomes). Little-endian. The points are in random order,
# so the first n of them are an even scatter of n: the experiment's Beads fader draws only that many.
import bpy, bmesh, os, struct, math, random
import numpy as np

N = 60000
RANGE = 1.8                     # positions are stored from -RANGE to RANGE (the frame is -1 to 1)
OUT = os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', '..', 'tinkering', 'tatankagram')
SEED = 1887                     # the year of Muybridge's buffalo, so the scatter is the same every run

sc = bpy.context.scene
arm = bpy.data.objects['Armature']; ob = bpy.data.objects['bison']
sc.frame_set(2)                 # stand_pose (frames 0-5 at 30 a second; the file plays at 24)
dg = bpy.context.evaluated_depsgraph_get()
ev = ob.evaluated_get(dg)
me = ev.to_mesh()
me.calc_loop_triangles()
mw = ob.matrix_world
uv = me.uv_layers.active.data

img = bpy.data.images.get('bison.tga') or bpy.data.images.load('//bison.tga')
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)

# the head's direction: where the head bone is against the middle of the body, along the animal's length (y)
head = arm.matrix_world @ arm.pose.bones['Bip01_Head'].head
verts = np.array([mw @ v.co for v in me.vertices])
lo, hi = verts.min(0), verts.max(0)
mid = (lo + hi) / 2
forward = 1.0 if head.y > mid[1] else -1.0
print('head at y %.2f, body from %.2f to %.2f: facing %s' % (head.y, lo[1], hi[1], '+y' if forward > 0 else '-y'))

tris = []
for t in me.loop_triangles:
    a, b, c = (mw @ me.vertices[i].co for i in t.vertices)
    u = [uv[l].uv for l in t.loops]
    nn = np.array(mw.to_3x3() @ t.normal); nn /= (np.linalg.norm(nn) or 1)   # the face's own outward normal
    vn = [np.array(mw.to_3x3() @ me.vertices[i].normal) for i in t.vertices]  # the smooth normals at its corners
    tris.append((np.array(a), np.array(b), np.array(c), np.array(u[0]), np.array(u[1]), np.array(u[2]), nn, vn))

# toward: when given, the way to the viewer. Each triangle then gets points in proportion to the area it shows the
# viewer, not its own area, so the picture's density is even: the face, square on, gets as many as its share of the
# frame, and the flanks, seen edge on, don't pile up into a bright rim. Faces turned away keep a few, for turning.
def sample(keep, n, rng, toward=None, weight=None):
    sel = [t for t in tris if keep((t[0] + t[1] + t[2]) / 3)]
    area = np.array([np.linalg.norm(np.cross(t[1] - t[0], t[2] - t[0])) / 2 for t in sel])
    if weight is not None: area = area * np.array([weight((t[0] + t[1] + t[2]) / 3) for t in sel])   # thinning out, as it goes
    if toward is not None:
        v = np.array(toward, dtype=np.float64)
        area = area * np.array([max(float(t[6] @ v), 0.0) + 0.5 for t in sel])
    pick = rng.choice(len(sel), size=n, p=area / area.sum())
    pts, nrm, tone, uvs, cols = [], [], [], [], []
    for k in pick:
        a, b, c, ua, ub, uc, _, vn = sel[k]
        r1, r2 = rng.random(), rng.random()
        if r1 + r2 > 1: r1, r2 = 1 - r1, 1 - r2
        p = a + r1 * (b - a) + r2 * (c - a)
        q = ua + r1 * (ub - ua) + r2 * (uc - ua)
        nn = vn[0] + r1 * (vn[1] - vn[0]) + r2 * (vn[2] - vn[0]); nn = nn / (np.linalg.norm(nn) or 1)   # blended across the face
        x = int(q[0] % 1 * (W - 1)); y = int(q[1] % 1 * (H - 1))
        col = px[y, x, :3]
        pts.append(p); nrm.append(nn); uvs.append((x, y)); cols.append(col)
        tone.append(0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2])
    pts, nrm, tone, cols = np.array(pts), np.array(nrm), np.array(tone), np.array(cols)
    # the coat's thickness: each bead lifted off the skin by a random height, most in the dark shag (the head, the
    # mane and the beard), a little on the short, pale hair, so the coat has depth, not just a painted surface
    lum = tone ** (1 / 2.2); lo_, hi_ = np.percentile(lum, 5), np.percentile(lum, 95)
    shag = 1 - np.clip((lum - lo_) / max(hi_ - lo_, 1e-6), 0, 1)
    lift = rng.random(len(pts)) ** 1.4 * (0.006 + 0.03 * shag ** 1.5)   # metres
    return pts, nrm, tone, cols, lift

def octa(n):
    n = n / np.abs(n).sum(1, keepdims=True)
    o = n[:, :2].copy()
    neg = n[:, 2] < 0
    o[neg] = (1 - np.abs(n[neg][:, [1, 0]])) * np.where(n[neg][:, :2] >= 0, 1, -1)
    return np.clip(np.round((o * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)

def write(name, pts, nrm, tone, cols, lift, view, rng, loose=None):
    if loose is None: loose = np.zeros(len(pts))
    # view: the frame's right, up and toward-the-viewer axes, in the model's coordinates
    R = np.array(view, dtype=np.float64)
    p = pts @ R.T; n = nrm @ R.T
    core = p[loose < 0.02]                                         # framed on the animal itself; the loose trail runs out past it
    c = (core.min(0) + core.max(0)) / 2
    s = 0.94 / max((core.max(0) - core.min(0))[:2].max() / 2, 1e-6)
    p = (p - c) * s / RANGE                                         # stored at 1/RANGE, so the trail can reach past the frame
    # tone: the coat's brightness, stretched so its darkest and brightest few percent reach the ends (the coat is
    # dark brown throughout, so as it is the beads would sit in a narrow, murky band)
    t = tone ** (1 / 2.2)
    a, b = np.percentile(t, 2), np.percentile(t, 98)
    t = np.clip((t - a) / max(b - a, 1e-6), 0, 1)
    # size: mostly small, a few large, the larger ones in the shag (the darkest, longest hair)
    size = np.clip(rng.random(len(t)) ** 1.6 * 0.8 + (1 - t) * 0.35, 0, 1)
    q = np.clip(np.round((np.clip(p, -1, 1) * 0.5 + 0.5) * 65535), 0, 65535).astype(np.uint16)
    oc = octa(n)
    rgb = np.clip(np.round(cols ** (1 / 2.2) * 255), 0, 255).astype(np.uint8)        # the texture's colour, as displayed
    lf = np.clip(np.round(lift * s / 0.1 * 255), 0, 255).astype(np.uint8)
    lo8 = np.clip(np.round(loose * 255), 0, 255).astype(np.uint8)
    buf = bytearray()
    for i in range(len(p)):
        buf += struct.pack('<HHHBB', q[i, 0], q[i, 1], q[i, 2], int(t[i] * 255), int(size[i] * 255)) + bytes(oc[i]) + bytes(rgb[i]) + bytes([lf[i], lo8[i]])
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, name), 'wb').write(buf)
    print('wrote %s: %d points, %.0f KB' % (name, len(p), len(buf) / 1024))

rng = np.random.default_rng(SEED)
f = forward
length = hi[1] - lo[1]; height = hi[2] - lo[2]
# head on. The frame's right is the animal's
# left (it faces us), up is up, toward us is the way it faces.
# a bust: the head, the beard and the front of the hump, as far back as 0.95 m from the tip of the nose, above the knees
tip = lo[1] if f < 0 else hi[1]
# No hard edge at the back: past the jaw (0.6 m from the nose) the body thins out as it goes back toward the
# shoulders, and those beads are let loose, scattered more the further back they sit and a little further away still,
# so the neck trails off into the distance. The experiment lets them drift (their looseness is in the file).
back = lambda m: abs(m[1] - tip)
front = lambda m: back(m) < 2.4 and m[2] > lo[2] + 0.3 * height
thin = lambda m: 1.0 if back(m) < 0.6 else math.exp(-((back(m) - 0.6) / 0.42) ** 1.25)
pts, nrm, tone, cols, lift = sample(front, N, rng, toward=(0, f, 0), weight=thin)
loose = np.clip((np.abs(pts[:, 1] - tip) - 0.6) / 1.2, 0, 1)
pts = pts + rng.normal(size=pts.shape) * (0.3 * loose ** 1.5)[:, None] + np.outer(loose ** 1.3 * rng.random(len(pts)) * 0.45, (0, -f, 0))
print('loose beads: %d of %d' % ((loose > 0.02).sum(), len(pts)))
write('head.bin', pts, nrm, tone, cols, lift, [(-f, 0, 0), (0, 0, 1), (0, f, 0)], rng, loose)
# the whole animal, from its right side, facing right
pts, nrm, tone, cols, lift = sample(lambda m: True, N, rng)
write('whole.bin', pts, nrm, tone, cols, lift, [(0, f, 0), (0, 0, 1), (f, 0, 0)], rng)
ev.to_mesh_clear()
