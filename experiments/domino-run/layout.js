/* The layout: plain data that saves straight to JSON.
   domino: { id, seq, x, y, z, yaw, h, style, color, pips:[a,b], locked, start, effects:[], group }
   group:  { id, name, members:[ids in falling order] }
   y is the surface the domino stands on. Yaw turns about the vertical: a domino with yaw a
   faces (sin a, cos a) in (x, z) and falls that way. */
import { PARAMS, dims } from './params.js';

export function newLayout(env = 'living-room') {
  return { version: 1, env, dominoes: [], groups: [], nextId: 1, nextSeq: 1, nextGroup: 1 };
}

export const fwd = yaw => [Math.sin(yaw), Math.cos(yaw)];
export const yawOf = (x, z) => Math.atan2(x, z);
export const rot = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

let pipSeed = 1;
function randomPips() {
  pipSeed = (pipSeed * 16807) % 2147483647;
  const a = pipSeed % 7;
  pipSeed = (pipSeed * 16807) % 2147483647;
  return [a, pipSeed % 7];
}

export function addDomino(L, spec) {
  const d = {
    id: L.nextId++, seq: L.nextSeq++,
    x: spec.x, y: spec.y ?? 0, z: spec.z, yaw: spec.yaw ?? 0, h: spec.h,
    style: spec.style, color: spec.color, pips: spec.pips ?? randomPips(),
    locked: !!spec.locked, start: !!spec.start, effects: [...(spec.effects ?? [])], group: null,
  };
  L.dominoes.push(d);
  return d;
}

export const byId = (L, id) => L.dominoes.find(d => d.id === id);
export const groupById = (L, gid) => L.groups.find(g => g.id === gid);
export const groupOf = (L, id) => { const d = byId(L, id); return d?.group ? groupById(L, d.group) : null; };

export function removeDominoes(L, ids) {
  const set = new Set(ids);
  L.dominoes = L.dominoes.filter(d => !set.has(d.id));
  for (const g of L.groups) g.members = g.members.filter(id => !set.has(id));
  pruneGroups(L);
}

function pruneGroups(L) {
  const dead = L.groups.filter(g => g.members.length < 2);
  for (const g of dead) for (const id of g.members) { const d = byId(L, id); if (d) d.group = null; }
  L.groups = L.groups.filter(g => g.members.length >= 2);
}

/* ---------- footprint and overlap ---------- */
function corners(d, grow = 0) {
  const { w, t } = dims(d.h);
  const hw = w / 2 + grow, ht = t / 2 + grow;
  const [fx, fz] = fwd(d.yaw);           // thickness axis
  const sx = fz, sz = -fx;               // width axis
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [d.x + sx * hw * a + fx * ht * b, d.z + sz * hw * a + fz * ht * b]);
}
function project(pts, ax, az) {
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of pts) { const v = x * ax + z * az; if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}
export function overlaps(a, b, grow = 0.0004) {
  if (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5) return false;
  const reach = (Math.max(a.h, b.h) * 0.6);
  if (Math.abs(a.x - b.x) > reach * 2 || Math.abs(a.z - b.z) > reach * 2) return false;
  const pa = corners(a, grow), pb = corners(b, grow);
  for (const yaw of [a.yaw, b.yaw]) {
    for (const [ax, az] of [fwd(yaw), [Math.cos(yaw), -Math.sin(yaw)]]) {
      const [a0, a1] = project(pa, ax, az), [b0, b1] = project(pb, ax, az);
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}
export function collides(L, spec, ignore = new Set()) {
  return L.dominoes.some(d => !ignore.has(d.id) && overlaps(spec, d));
}
export function anyCollide(L, specs, ignore = new Set()) {
  for (let i = 0; i < specs.length; i++) {
    if (collides(L, specs[i], ignore)) return true;
    for (let j = 0; j < i; j++) if (overlaps(specs[i], specs[j])) return true;
  }
  return false;
}

/* ---------- order along a chain ---------- */
export function orderChain(L, ids) {
  const ds = ids.map(id => byId(L, id)).filter(Boolean);
  if (ds.length < 3) {
    if (ds.length === 2) {
      const [a, b] = ds;
      const [fx, fz] = fwd(a.yaw);
      const aFirst = (b.x - a.x) * fx + (b.z - a.z) * fz >= 0;
      return aFirst ? [a.id, b.id] : [b.id, a.id];
    }
    return ds.map(d => d.id);
  }
  const cx = ds.reduce((s, d) => s + d.x, 0) / ds.length, cz = ds.reduce((s, d) => s + d.z, 0) / ds.length;
  const far = (from) => ds.reduce((best, d) => (Math.hypot(d.x - from.x, d.z - from.z) > Math.hypot(best.x - from.x, best.z - from.z) ? d : best), ds[0]);
  const A = far({ x: cx, z: cz }), B = far(A);
  const facing = (s, o) => { const [fx, fz] = fwd(s.yaw); return ((o.x - s.x) * fx + (o.z - s.z) * fz) / (Math.hypot(o.x - s.x, o.z - s.z) || 1); };
  let S;
  if (A.start !== B.start) S = A.start ? A : B;
  else {
    const fa = facing(A, { x: cx, z: cz }), fb = facing(B, { x: cx, z: cz });
    S = Math.abs(fa - fb) > 0.2 ? (fa > fb ? A : B) : (A.seq < B.seq ? A : B);
  }
  const out = [S], left = new Set(ds.filter(d => d !== S));
  let cur = S;
  while (left.size) {
    let best = null, bd = Infinity;
    for (const d of left) { const dist = Math.hypot(d.x - cur.x, d.z - cur.z); if (dist < bd) { bd = dist; best = d; } }
    out.push(best); left.delete(best); cur = best;
  }
  return out.map(d => d.id);
}

export function makeGroup(L, ids, name) {
  const ordered = orderChain(L, ids);
  for (const g of L.groups) g.members = g.members.filter(id => !ordered.includes(id));
  pruneGroups(L);
  const g = { id: L.nextGroup++, name: name ?? `Group ${L.nextGroup - 1}`, members: ordered };
  L.groups.push(g);
  for (const id of ordered) byId(L, id).group = g.id;
  return g;
}

export function ungroup(L, gid) {
  const g = groupById(L, gid);
  if (!g) return;
  for (const id of g.members) { const d = byId(L, id); if (d) d.group = null; }
  L.groups = L.groups.filter(x => x !== g);
}

/* a group's members in order, or a loose selection ordered on the fly */
export function members(L, ids) {
  const gs = new Set(ids.map(id => byId(L, id)?.group).filter(Boolean));
  if (gs.size === 1) {
    const g = groupById(L, [...gs][0]);
    if (g.members.length === ids.length) return g.members.map(id => byId(L, id));
  }
  return orderChain(L, ids).map(id => byId(L, id));
}

function chainEnds(ms) {
  const n = ms.length, first = ms[0], last = ms[n - 1];
  const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  const dirStart = n > 1 ? norm(ms[1].x - first.x, ms[1].z - first.z) : fwd(first.yaw);
  const dirEnd = n > 1 ? norm(last.x - ms[n - 2].x, last.z - ms[n - 2].z) : fwd(last.yaw);
  const spacing = n > 1 ? Math.hypot(last.x - ms[n - 2].x, last.z - ms[n - 2].z) : PARAMS.spacing * last.h;
  return { first, last, dirStart, dirEnd, spacing };
}

/* ---------- paste ---------- */
/* Copies of `ms` (ordered). By default the copy carries on from the leading end, turned so its
   first step follows the parent's last. If something already stands in front of the leading
   end, or the extension won't fit, the copy goes alongside the parent instead. */
export function pastePlan(L, ms, surfaceAt, blocked = () => false) {
  const { first, last, dirStart, dirEnd, spacing } = chainEnds(ms);
  const strip = d => ({ x: d.x, y: d.y, z: d.z, yaw: d.yaw, h: d.h, style: d.style, color: d.color, effects: d.effects, locked: false, start: false });
  const inParent = new Set(ms.map(d => d.id));

  const followed = L.dominoes.some(d => {
    if (inParent.has(d.id)) return false;
    const dx = d.x - last.x, dz = d.z - last.z, dist = Math.hypot(dx, dz);
    if (dist > Math.max(spacing * 1.8, last.h * 0.9) || dist < 1e-6) return false;
    return (dx * dirEnd[0] + dz * dirEnd[1]) / dist > Math.cos(THREE_40);
  });

  if (!followed) {
    const a = yawOf(...dirEnd) - yawOf(...dirStart);
    const ax = last.x + dirEnd[0] * spacing, az = last.z + dirEnd[1] * spacing;
    const specs = ms.map(d => {
      const [rx, rz] = rot(d.x - first.x, d.z - first.z, a);
      const s = strip(d);
      s.x = ax + rx; s.z = az + rz; s.yaw = wrap(d.yaw + a);
      return s;
    });
    if (settle(specs, surfaceAt) && !specs.some(blocked) && !anyCollide(L, specs)) return { specs, mode: 'extend' };
  }

  const why = followed ? 'followed' : 'blocked';
  // alongside: shift sideways by the parent's width plus a clear gap, whichever side is free
  const n = ms.length;
  let main = n > 1 ? [last.x - first.x, last.z - first.z] : fwd(first.yaw);
  const ml = Math.hypot(...main) || 1;
  main = [main[0] / ml, main[1] / ml];
  const perp = [main[1], -main[0]];
  let lo = Infinity, hi = -Infinity, wMax = 0;
  for (const d of ms) {
    const v = (d.x - first.x) * perp[0] + (d.z - first.z) * perp[1];
    lo = Math.min(lo, v); hi = Math.max(hi, v);
    wMax = Math.max(wMax, dims(d.h).w);
  }
  const step = (hi - lo) + wMax * 2.2;
  for (let k = 1; k <= 6; k++) for (const side of [1, -1]) {
    const off = side * step * k;
    const specs = ms.map(d => { const s = strip(d); s.x += perp[0] * off; s.z += perp[1] * off; return s; });
    if (settle(specs, surfaceAt) && !specs.some(blocked) && !anyCollide(L, specs)) return { specs, mode: 'beside', why };
  }
  return null;
}
const THREE_40 = 40 * Math.PI / 180;

/* stand each spec on whatever surface is under it; false if any is off the floor plan */
export function settle(specs, surfaceAt) {
  for (const s of specs) {
    const y = surfaceAt(s.x, s.z, s.y);
    if (y == null) return false;
    s.y = y;
  }
  return true;
}

/* ---------- bend: drag one end, the other stays put ---------- */
/* `snap` is the group as it was when the drag began (ordered). `end` is 'last' or 'first',
   the end being dragged. Returns new {x, z, yaw} for each member in the original order. */
export function bendPlan(snap, end, tx, tz) {
  const n = snap.length;
  const arr = end === 'last' ? snap : [...snap].reverse();
  const P0 = arr[0];
  const tan = (a, i) => {
    const p = a[Math.max(0, i - 1)], q = a[Math.min(a.length - 1, i + 1)];
    if (p === q) return fwd(p.yaw);
    const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    return [(q.x - p.x) / l, (q.z - p.z) / l];
  };
  const rel = arr.map((d, i) => wrap(d.yaw - yawOf(...tan(arr, i))));
  const d0 = tan(arr, 0);
  let dx = tx - P0.x, dz = tz - P0.z;
  let len = Math.hypot(dx, dz);
  const minLen = (n - 1) * dims(Math.max(...snap.map(d => d.h))).t * 1.25;
  if (len < minLen) {
    const l = len || 1;
    dx = dx / l * minLen; dz = dz / l * minLen; len = minLen;
  }
  const P1 = [P0.x + dx, P0.z + dz];
  const C = [P0.x + d0[0] * len * 0.5, P0.z + d0[1] * len * 0.5];
  const B = u => [(1 - u) ** 2 * P0.x + 2 * u * (1 - u) * C[0] + u * u * P1[0], (1 - u) ** 2 * P0.z + 2 * u * (1 - u) * C[1] + u * u * P1[1]];
  const dB = u => [2 * (1 - u) * (C[0] - P0.x) + 2 * u * (P1[0] - C[0]), 2 * (1 - u) * (C[1] - P0.z) + 2 * u * (P1[1] - C[1])];
  const N = 240, cum = [0], pts = [B(0)];
  for (let i = 1; i <= N; i++) { const p = B(i / N); cum.push(cum[i - 1] + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])); pts.push(p); }
  const total = cum[N];
  const out = arr.map((d, i) => {
    if (i === 0) return { x: d.x, z: d.z, yaw: d.yaw };
    const s = total * i / (n - 1);
    let k = 1; while (k < N && cum[k] < s) k++;
    const u = (k - 1 + (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1)) / N;
    const [x, z] = B(u);
    const t = dB(u);
    return { x, z, yaw: wrap(yawOf(t[0], t[1]) + rel[i]) };
  });
  const spacing = n > 1 ? total / (n - 1) : 0;
  return { positions: end === 'last' ? out : out.reverse(), spacing };
}

/* ---------- reusable elements ---------- */
export function elementFrom(ms, name) {
  const { first, dirStart } = chainEnds(ms);
  const base = yawOf(...dirStart);
  return {
    name, savedAt: new Date().toISOString(), count: ms.length,
    dominoes: ms.map(d => {
      const [x, z] = rot(d.x - first.x, d.z - first.z, -base);
      return { x, z, y: d.y - first.y, yaw: wrap(d.yaw - base), h: d.h, style: d.style, color: d.color, effects: [...d.effects] };
    }),
  };
}

/* an element stood with its first domino at (x, z) heading along `yaw` */
export function elementSpecs(el, x, y, z, yaw) {
  return el.dominoes.map(e => {
    const [rx, rz] = rot(e.x, e.z, yaw);
    return { x: x + rx, y: y + (e.y ?? 0), z: z + rz, yaw: wrap(e.yaw + yaw), h: e.h, style: e.style, color: e.color, effects: e.effects ?? [] };
  });
}

/* where a new domino should go to carry on from `prev` toward the cursor */
export function nextAfter(prev, cx, cz, spacingRatio, maxTurn = THREE_40) {
  const dx = cx - prev.x, dz = cz - prev.z, dist = Math.hypot(dx, dz);
  const sp = spacingRatio * prev.h;
  if (dist < 1e-6) { const [fx, fz] = fwd(prev.yaw); return { x: prev.x + fx * sp, z: prev.z + fz * sp, yaw: prev.yaw }; }
  // limit how sharply the line can turn in one step
  const want = yawOf(dx, dz);
  const turn = maxTurn;
  const diff = wrap(want - prev.yaw);
  const yaw = wrap(prev.yaw + Math.max(-turn, Math.min(turn, diff)));
  const [fx, fz] = fwd(yaw);
  return { x: prev.x + fx * sp, z: prev.z + fz * sp, yaw };
}

export function clone(L) { return JSON.parse(JSON.stringify(L)); }
