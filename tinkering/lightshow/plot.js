/* The rig plot: the trusses and the fixtures hung on them, as plain data, so a rig can be
   edited, undone, saved with a program and carried to another venue.

   Positions are relative to the stage, so a rig fits whichever room it is loaded into:
   x in half-widths of the deck (±1 at its edges), z in deck depths (0 at the downstage edge,
   -1 upstage), and heights as a share of the venue's trim height above the deck. An arc's
   radius is in half-widths on both axes, so a ring stays round.

   A truss is { id, kind, shape, ... }:
     kind  'truss' hangs in the air, 'tower' stands on the ground, 'floor' lies on the deck
     shape 'line' runs from a to b ([x, y, z]); 'arc' has a centre c ([x, z]), a height y, a
           radius r and a sweep from a0 to a1 in radians (0 points stage right, π/2 downstage)
   A fixture is { id, type, truss, t, group }: t is how far along its truss it hangs, 0 to 1.
   Pixel strips also have t1, where the strip ends. */

export const TYPES = [
  { id: 'beam', name: 'Spot', one: 'spot', plural: 'spots', group: 'beams' },
  { id: 'wash', name: 'Wash', one: 'wash', plural: 'washes', group: 'washes' },
  { id: 'laser', name: 'Laser', one: 'laser', plural: 'lasers', group: 'lasers' },
  { id: 'strobe', name: 'Strobe', one: 'strobe', plural: 'strobes', group: 'strobes' },
  { id: 'pixel', name: 'Pixels', one: 'pixel strip', plural: 'pixel strips', group: 'pixels' },
];
export const TYPE = Object.fromEntries(TYPES.map(t => [t.id, t]));
export const TYPE_OF_GROUP = Object.fromEntries(TYPES.map(t => [t.group, t.id]));
// what the renderer can afford: volumetric beams are the expensive part
export const BUDGET = { beam: 160, wash: 48, laser: 12, strobe: 48, pixel: 40 };
// the ways an effect can travel through a group's fixtures
export const ORDERS = [['auto', 'Rig order'], ['lr', 'Left to right'], ['center', 'Centre out'], ['around', 'Around'], ['depth', 'Front to back'], ['random', 'Shuffled']];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = x => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
let seq = 0;
export const uid = p => p + Date.now().toString(36).slice(-4) + (seq++).toString(36);
export const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- geometry ---------- */
// the stage's measurements, for turning plot units into metres
export function measure(def) {
  const { w: W, d: D, h: H } = def.stage, rh = def.rig.h;
  return { W, D, H, rh, hw: W / 2, big: W > 40 };
}
export const toWorld = (m, x, y, z) => [x * m.hw, m.H + y * m.rh, z * m.D];

// a point along a truss, in metres
export function trussPoint(tr, t, m, out = [0, 0, 0]) {
  if (tr.shape === 'arc') {
    const th = tr.a0 + (tr.a1 - tr.a0) * t, R = tr.r * m.hw;
    out[0] = tr.c[0] * m.hw + Math.cos(th) * R; out[1] = m.H + tr.y * m.rh; out[2] = tr.c[1] * m.D + Math.sin(th) * R;
    return out;
  }
  const a = tr.a, b = tr.b;
  out[0] = (a[0] + (b[0] - a[0]) * t) * m.hw;
  out[2] = (a[2] + (b[2] - a[2]) * t) * m.D;
  if (tr.kind === 'tower') out[1] = (m.H + b[1] * m.rh) * t;
  else if (tr.kind === 'floor') out[1] = m.H;
  else out[1] = m.H + (a[1] + (b[1] - a[1]) * t) * m.rh;
  return out;
}
export function trussLength(tr, m) {
  if (tr.shape === 'arc') return Math.abs(tr.a1 - tr.a0) * tr.r * m.hw;
  if (tr.kind === 'tower') return m.H + tr.b[1] * m.rh;
  const p = trussPoint(tr, 0, m), q = trussPoint(tr, 1, m);
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}
// the nearest point on a truss to a point in plan (x, z in metres), as t
export function closestT(tr, x, z, m) {
  if (tr.kind === 'tower') return null;
  let best = 0, bd = Infinity;
  const p = [0, 0, 0];
  for (let k = 0; k <= 64; k++) {
    const t = k / 64; trussPoint(tr, t, m, p);
    const d = (p[0] - x) ** 2 + (p[2] - z) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  // refine around the best sample
  let lo = Math.max(0, best - 1 / 64), hi = Math.min(1, best + 1 / 64);
  for (let r = 0; r < 20; r++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    const da = (trussPoint(tr, a, m, p), (p[0] - x) ** 2 + (p[2] - z) ** 2);
    const db = (trussPoint(tr, b, m, p), (p[0] - x) ** 2 + (p[2] - z) ** 2);
    if (da < db) hi = b; else lo = a;
  }
  return (lo + hi) / 2;
}

// where each kind of fixture sits relative to its truss, in metres: hung under a truss,
// on the face of a tower, or standing on the deck
const OFFSET = {
  truss: { beam: [0, -0.45, 0], wash: [0, -0.4, 0.3], laser: [0, -0.5, 0.2], strobe: [0, -0.35, 0.35], pixel: [0, -0.3, 0.25] },
  tower: { beam: [0, 0, 0.4], wash: [0, 0, 0.4], laser: [0, 0, 0.3], strobe: [0, 0, 0.35], pixel: [0, 0, 0.3] },
  floor: { beam: [0, 0.35, 0], wash: [0, 0.2, 0], laser: [0, 0.25, 0], strobe: [0, 0.3, 0], pixel: [0, 0.04, 0] },
};
export function fixturePoint(tr, type, t, m, out = [0, 0, 0]) {
  trussPoint(tr, t, m, out);
  const o = OFFSET[tr.kind][type];
  out[0] += o[0]; out[1] += o[1]; out[2] += o[2];
  return out;
}

/* ---------- building plots ---------- */
const line = (id, kind, a, b) => ({ id, kind, shape: 'line', a, b });
const arc = (id, c, y, r, a0 = 0, a1 = TAU) => ({ id, kind: 'truss', shape: 'arc', c, y, r, a0, a1 });
// hang n fixtures evenly along a truss, centred, across a share of its length
export function spread(n, span = 1) { return Array.from({ length: n }, (_, k) => n > 1 ? 0.5 + (k / (n - 1) - 0.5) * span : 0.5); }
function hang(plot, truss, type, ts, group = '') {
  for (const t of ts) plot.fixtures.push({ id: uid('x'), type, truss, t: clamp(t, 0, 1), group });
}
function strip(plot, truss, t = 0, t1 = 1, group = '') { plot.fixtures.push({ id: uid('x'), type: 'pixel', truss, t, t1, group }); }
// a closed ring spaces its fixtures without doubling up where it meets itself
const ringT = n => Array.from({ length: n }, (_, k) => k / n);
const empty = () => ({ v: 1, trusses: [], fixtures: [], groups: [] });

// the rig every venue starts with: three trusses over the deck, towers at the sides, a row
// of heads on the deck behind the band, and washes, lasers and pixels along the front
export function defaultPlot(def) {
  const m = measure(def), { W, D, H, rh, big } = m, top = H + rh;
  const n = (x, y, z) => [x / m.hw, (y - H) / rh, z / D];
  const tw = W * 0.92, towerX = W / 2 + (big ? 1.5 : 0.6), towerTop = top + 0.6;
  const p = empty();
  p.trusses.push(
    line('front', 'truss', n(-tw / 2, top, -0.8), n(tw / 2, top, -0.8)),
    line('mid', 'truss', n(-tw / 2, top + 0.6, -D * 0.42), n(tw / 2, top + 0.6, -D * 0.42)),
    line('back', 'truss', n(-tw / 2, top - 0.4, -D * 0.8), n(tw / 2, top - 0.4, -D * 0.8)),
    line('deck', 'floor', n(-W * 0.45, H, -D + 1.1), n(W * 0.45, H, -D + 1.1)),
    line('towerL', 'tower', n(-towerX, 0, -D * 0.25), n(-towerX, towerTop, -D * 0.25)),
    line('towerR', 'tower', n(towerX, 0, -D * 0.25), n(towerX, towerTop, -D * 0.25)),
    line('lip', 'floor', n(-W / 2, H, -0.35), n(W / 2, H, -0.35)),
  );
  hang(p, 'front', 'beam', spread(Math.round(W / 2.6), 0.96));
  hang(p, 'mid', 'beam', spread(Math.round(W / 2.2), 0.96));
  hang(p, 'back', 'beam', spread(Math.round(W / 2.6), 0.96));
  hang(p, 'deck', 'beam', spread(Math.round(W / 2.4), 1));
  const tAt = y => clamp(y / (H + (towerTop - H)), 0, 0.98);
  for (const s of ['towerL', 'towerR']) hang(p, s, 'beam', [0, 1, 2].map(k => tAt(H + 2 + k * (top - H - 3) / 2)));
  hang(p, 'front', 'wash', spread(Math.round(W / 3), 0.9));
  hang(p, 'lip', 'wash', spread(4, 0.85));
  hang(p, 'lip', 'laser', spread(4, 0.8));
  if (big) for (const s of ['towerL', 'towerR']) hang(p, s, 'laser', [tAt(top - 1)]);
  const ns = Math.max(4, Math.round(W / 4));
  hang(p, 'front', 'strobe', spread(ns, 1 - 1 / ns));
  for (const s of ['towerL', 'towerR']) hang(p, s, 'strobe', [0, 1, 2].map(k => tAt(H + 3 + k * 2.4)));
  strip(p, 'front'); strip(p, 'mid');
  for (const s of ['towerL', 'towerR']) strip(p, s, tAt(H + 0.5), tAt(top - 0.5));
  strip(p, 'lip');
  return p;
}

// starting points for a new rig. Each takes the venue so counts suit the size of the stage.
const count = (W, per, lo, hi) => clamp(Math.round(W / per), lo, hi);
export const TEMPLATES = [
  { id: 'house', name: 'This venue’s rig', note: 'Straight trusses, side towers and a floor row.', make: null },
  { id: 'chevron', name: 'Chevron', note: 'Two raked wings meeting upstage.', make(def) {
    const { W } = measure(def), p = empty();
    p.groups.push({ id: 'wings', name: 'Wings', type: 'beams' });
    p.trusses.push(
      line('wingL', 'truss', [-0.06, 1.18, -0.86], [-0.94, 0.86, -0.1]),
      line('wingR', 'truss', [0.06, 1.18, -0.86], [0.94, 0.86, -0.1]),
      line('back', 'truss', [-0.8, 0.95, -0.95], [0.8, 0.95, -0.95]),
      line('lip', 'floor', [-1, 0, -0.03], [1, 0, -0.03]),
    );
    const nw = count(W, 2.2, 5, 22);
    for (const s of ['wingL', 'wingR']) { hang(p, s, 'beam', spread(nw, 0.94), 'wings'); hang(p, s, 'strobe', spread(3, 0.7)); hang(p, s, 'wash', spread(2, 0.6)); strip(p, s); }
    hang(p, 'back', 'beam', spread(count(W, 2.4, 5, 24), 0.96));
    hang(p, 'back', 'wash', spread(count(W, 4, 3, 10), 0.9));
    hang(p, 'lip', 'laser', spread(4, 0.7)); hang(p, 'lip', 'wash', spread(4, 0.85)); strip(p, 'lip');
    return p;
  } },
  { id: 'halo', name: 'Halo', note: 'A ring over the band, and a smaller one inside it.', make(def) {
    const m = measure(def), p = empty();
    const R = Math.min(m.W * 0.42, m.D * 0.46), r = R / m.hw, cz = -0.5;
    p.groups.push({ id: 'inner', name: 'Inner ring', type: 'beams' });
    p.trusses.push(arc('outer', [0, cz], 1, r), arc('inner', [0, cz], 1.18, r * 0.52), line('lip', 'floor', [-1, 0, -0.03], [1, 0, -0.03]));
    const no = clamp(Math.round(TAU * R / 2.2), 10, 32);
    hang(p, 'outer', 'beam', ringT(no)); hang(p, 'outer', 'strobe', ringT(8).map(t => t + 0.0625)); hang(p, 'outer', 'wash', ringT(6).map(t => t + 0.04)); strip(p, 'outer');
    hang(p, 'inner', 'beam', ringT(clamp(Math.round(no / 2), 6, 16)), 'inner'); hang(p, 'inner', 'wash', ringT(4).map(t => t + 0.125)); strip(p, 'inner');
    hang(p, 'lip', 'laser', spread(4, 0.7)); hang(p, 'lip', 'wash', spread(4, 0.85));
    return p;
  } },
  { id: 'pods', name: 'Pods', note: 'Five short trusses at staggered heights.', make(def) {
    const { W } = measure(def), p = empty();
    p.groups.push({ id: 'outer', name: 'Outer pods', type: 'beams' }, { id: 'centre', name: 'Centre pod', type: 'beams' });
    const pods = [[-0.7, 0.86, -0.3], [-0.36, 1.02, -0.62], [0, 1.18, -0.42], [0.36, 1.02, -0.62], [0.7, 0.86, -0.3]];
    const half = clamp(2.6 / (W / 2), 0.08, 0.16), nb = count(W, 6, 3, 6);
    pods.forEach(([x, y, z], k) => {
      const id = 'pod' + (k + 1);
      p.trusses.push(line(id, 'truss', [x - half, y, z], [x + half, y, z]));
      hang(p, id, 'beam', spread(nb, 0.9), k === 2 ? 'centre' : k === 0 || k === 4 ? 'outer' : '');
      hang(p, id, 'wash', [0.5]); hang(p, id, 'strobe', [0.5]); strip(p, id);
    });
    p.trusses.push(line('deck', 'floor', [-0.9, 0, -0.85], [0.9, 0, -0.85]), line('lip', 'floor', [-1, 0, -0.03], [1, 0, -0.03]));
    hang(p, 'deck', 'beam', spread(count(W, 2.6, 4, 20), 1));
    hang(p, 'lip', 'laser', spread(4, 0.7)); hang(p, 'lip', 'wash', spread(4, 0.85)); strip(p, 'lip');
    return p;
  } },
  { id: 'ladders', name: 'Ladders', note: 'A wall of upright towers behind the band.', make(def) {
    const { W } = measure(def), p = empty();
    p.groups.push({ id: 'ladders', name: 'Ladders', type: 'beams' });
    const n = count(W, 3.4, 4, 11);
    for (let k = 0; k < n; k++) {
      const x = (k / (n - 1) - 0.5) * 1.7, id = 'ladder' + (k + 1);
      p.trusses.push(line(id, 'tower', [x, 0, -0.94], [x, 0.95, -0.94]));
      hang(p, id, 'beam', [0.42, 0.6, 0.78, 0.94], 'ladders'); hang(p, id, 'strobe', [0.52, 0.86]); strip(p, id, 0.18, 0.98);
    }
    p.trusses.push(line('front', 'truss', [-0.9, 1, -0.06], [0.9, 1, -0.06]), line('lip', 'floor', [-1, 0, -0.03], [1, 0, -0.03]));
    hang(p, 'front', 'beam', spread(count(W, 3, 4, 18), 0.96)); hang(p, 'front', 'wash', spread(count(W, 3, 4, 14), 0.9)); strip(p, 'front');
    hang(p, 'lip', 'laser', spread(4, 0.7));
    return p;
  } },
  { id: 'blank', name: 'Empty', note: 'One truss and nothing on it. Build from scratch.', make() {
    const p = empty();
    p.trusses.push(line('front', 'truss', [-0.9, 1, -0.1], [0.9, 1, -0.1]));
    return p;
  } },
];
export const templatePlot = (id, def) => { const t = TEMPLATES.find(x => x.id === id); return t?.make ? t.make(def) : defaultPlot(def); };

// how many of each type a plot holds
export function tally(plot) {
  const n = { beam: 0, wash: 0, laser: 0, strobe: 0, pixel: 0 };
  for (const f of plot.fixtures) n[f.type]++;
  return n;
}

/* ---------- mirroring ---------- */
const mirrorTruss = tr => tr.shape === 'arc'
  ? { ...tr, c: [-tr.c[0], tr.c[1]], a0: Math.PI - tr.a1, a1: Math.PI - tr.a0 }
  : { ...tr, a: [-tr.a[0], tr.a[1], tr.a[2]], b: [-tr.b[0], tr.b[1], tr.b[2]] };
// the truss that mirrors this one across the centre line: itself when it's symmetric
export function mirrorOf(plot, tr, m) {
  const mt = mirrorTruss(tr), pts = [0, 0.25, 0.5, 0.75, 1].map(t => trussPoint(mt, t, m));
  let best = null, bd = Infinity;
  for (const o of plot.trusses) {
    if (o.kind !== tr.kind || o.shape !== tr.shape) continue;
    let d = 0;
    for (const p of pts) { const t = o.kind === 'tower' ? 0 : closestT(o, p[0], p[2], m); const q = trussPoint(o, t ?? 0, m); d = Math.max(d, Math.hypot(q[0] - p[0], q[2] - p[2], o.kind === 'tower' ? 0 : q[1] - p[1])); }
    if (d < bd) { bd = d; best = o; }
  }
  return bd < 0.35 ? best : null;
}
// the matching t on the mirror truss
export function mirrorT(tr, t, mt, m) {
  if (tr.kind === 'tower') return t;
  const p = trussPoint(tr, t, m);
  return closestT(mt, -p[0], p[2], m);
}
// a copy of a truss on the other side of the centre line
export const mirroredCopy = (tr, id) => ({ ...clone(mirrorTruss(tr)), id });

/* ---------- resolving a plot into fixtures in metres ---------- */
// Every fixture gets its position, which side of the stage it's on, its place in its group,
// and where it falls in each effect order. The show engine reads these; it never needs to
// know how the rig was built.
export function resolve(plot, def) {
  const m = measure(def);
  const trusses = new Map(plot.trusses.map(t => [t.id, t]));
  const order = new Map(plot.trusses.map((t, i) => [t.id, i]));
  const out = { beams: [], washes: [], lasers: [], strobes: [], pixels: [] };
  // beam rows: which truss counts as the first, second... for aiming deeper into the crowd
  const beamRows = new Map();
  for (const tr of plot.trusses) if (plot.fixtures.some(f => f.truss === tr.id && f.type === 'beam')) beamRows.set(tr.id, Math.min(4, beamRows.size));
  const fx = plot.fixtures.filter(f => trusses.has(f.truss))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => order.get(a.f.truss) - order.get(b.f.truss) || a.i - b.i);
  // a stable build order: by truss, then the order they were hung
  let stripN = 0;
  const cell = m.big ? 0.6 : 0.35, tmp = [0, 0, 0], tmp2 = [0, 0, 0];
  for (const { f } of fx) {
    const tr = trusses.get(f.truss), list = out[TYPE[f.type].group];
    const base = { id: f.id, group: f.group || '', truss: tr.id, floor: tr.kind === 'floor', tower: tr.kind === 'tower' };
    if (f.type === 'pixel') {
      const t0 = f.t ?? 0, t1 = f.t1 ?? 1, len = trussLength(tr, m) * Math.abs(t1 - t0), n = Math.max(2, Math.round(len / cell));
      for (let k = 0; k < n; k++) {
        const t = t0 + (t1 - t0) * (k + 0.5) / n;
        const pos = fixturePoint(tr, 'pixel', t, m);
        trussPoint(tr, clamp(t + 0.002, 0, 1), m, tmp); trussPoint(tr, clamp(t - 0.002, 0, 1), m, tmp2);
        const d = [tmp[0] - tmp2[0], tmp[1] - tmp2[1], tmp[2] - tmp2[2]], dl = Math.hypot(...d) || 1;
        list.push({ ...base, pos, u: (k + 0.5) / n, strip: stripN, dir: d.map(v => v / dl), cell: len / n });
      }
      stripN++;
    } else {
      list.push({ ...base, pos: fixturePoint(tr, f.type, f.t, m), row: beamRows.get(tr.id) ?? 0 });
    }
  }
  for (const list of Object.values(out)) placeInGroups(list, m);
  return out;
}

// side, group index and effect orders, worked out within each group
function placeInGroups(list, m) {
  const parts = new Map();
  list.forEach((f, i) => {
    f.side = clamp(f.pos[0] / (m.W * 0.92), -0.6, 0.6);
    if (!parts.has(f.group)) parts.set(f.group, []);
    parts.get(f.group).push(f);
  });
  for (const part of parts.values()) {
    const n = part.length;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0;
    for (const f of part) { x0 = Math.min(x0, f.pos[0]); x1 = Math.max(x1, f.pos[0]); z0 = Math.min(z0, f.pos[2]); z1 = Math.max(z1, f.pos[2]); cx += f.pos[0] / n; cz += f.pos[2] / n; }
    const xr = x1 - x0, zr = z1 - z0, mid = (x0 + x1) / 2;
    let far = 0; for (const f of part) far = Math.max(far, Math.abs(f.pos[0] - mid));
    const shuffled = part.map((f, k) => [hash(k, n), k]).sort((a, b) => a[0] - b[0]);
    const rank = new Array(n); shuffled.forEach(([, k], r) => { rank[k] = r; });
    part.forEach((f, k) => {
      f.gi = k; f.gn = n;
      f.ord = {
        lr: xr > 0.05 ? (f.pos[0] - x0) / xr : 0.5,
        center: far > 0.05 ? Math.abs(f.pos[0] - mid) / far : 0,
        around: fract(Math.atan2(f.pos[2] - cz, f.pos[0] - cx) / TAU + 0.25),
        depth: zr > 0.05 ? (z1 - f.pos[2]) / zr : 0,
        random: n > 1 ? rank[k] / n : 0,
      };
    });
  }
}
