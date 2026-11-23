/* Knot paths. Each rope's working end follows a path traced from where the rope enters
   the knot to where its tip finishes. Paths are authored as rough points in centimetres;
   this module smooths them, finds every place the path crosses itself (or the other rope),
   gives each crossing its over/under from the knot's sequence (read in the order the end
   makes them), lifts the upper strand clear, then relaxes the path so no two parts of
   rope sit closer than the rope's own thickness. */
import { BAR } from './physics.js';

export const DS = 0.0025;          // path sample spacing, m
const GAP = 0.004;                 // clearance kept between strands at a crossing, m
const BUMP = 0.04;                 // half-width of the lift at a crossing, m

/* points: [x, z] on the table, [x, z, y] at a height, { phi, z } on the rail (degrees,
   0 = top, 90 = far side). rotate: degrees about the vertical, applied to table points. */
function expand(points, r, rotate = 0) {
  const c = Math.cos(rotate * Math.PI / 180), s = Math.sin(rotate * Math.PI / 180);
  const rho = BAR.r + r;
  const out = [];
  const onBar = (phi, z) => {
    const a = phi * Math.PI / 180;
    return [BAR.x + rho * Math.sin(a), BAR.y + rho * Math.cos(a), z / 100];
  };
  points.forEach((p, k) => {
    if (!Array.isArray(p)) {
      const q = points[k - 1];
      if (q && !Array.isArray(q)) {
        // walk around the rail in small steps so the path hugs it
        const steps = Math.ceil(Math.abs(p.phi - q.phi) / 8);
        for (let j = 1; j < steps; j++) {
          const f = j / steps;
          out.push({ p: onBar(q.phi + (p.phi - q.phi) * f, q.z + (p.z - q.z) * f), ctrl: -1 });
        }
      }
      out.push({ p: onBar(p.phi, p.z), ctrl: k });
      return;
    }
    const [x0, z0, y] = p;
    const x = x0 * c + z0 * s, z = -x0 * s + z0 * c;
    out.push({ p: [x / 100, y === undefined ? r : Math.max(r, y / 100), z / 100], ctrl: k });
  });
  return out;
}

// centripetal Catmull-Rom through the points, then resampled at even spacing
function smooth(nodes) {
  const P = nodes.map(n => n.p);
  const dense = [];
  const ctrlAt = [];
  const ext = [sub2(P[0], P[1]), ...P, sub2(P.at(-1), P.at(-2))];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const t0 = 0, t1 = t0 + Math.sqrt(dist(p0, p1) || 1e-6), t2 = t1 + Math.sqrt(dist(p1, p2) || 1e-6), t3 = t2 + Math.sqrt(dist(p2, p3) || 1e-6);
    const n = Math.max(2, Math.ceil(dist(p1, p2) / 0.001));
    if (nodes[i - 1].ctrl >= 0) ctrlAt[nodes[i - 1].ctrl] = dense.length;
    for (let j = 0; j < n; j++) {
      const t = t1 + (t2 - t1) * (j / n);
      dense.push(cr(p0, p1, p2, p3, t0, t1, t2, t3, t));
    }
  }
  if (nodes.at(-1).ctrl >= 0) ctrlAt[nodes.at(-1).ctrl] = dense.length;
  dense.push(P.at(-1).slice());
  return resample(dense, ctrlAt);
}

// even spacing by arc length; `by` measures arc on another polyline with the same points count
function resample(dense, ctrlAt, by = dense) {
  const arc = [0];
  for (let i = 1; i < by.length; i++) arc.push(arc[i - 1] + dist(by[i - 1], by[i]));
  const L = arc.at(-1);
  const n = Math.max(2, Math.round(L / DS) + 1);
  const pts = new Float64Array(n * 3);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1)) * L;
    while (j < dense.length - 2 && arc[j + 1] < a) j++;
    const f = (a - arc[j]) / ((arc[j + 1] - arc[j]) || 1);
    for (let c = 0; c < 3; c++) pts[k * 3 + c] = dense[j][c] + (dense[j + 1][c] - dense[j][c]) * f;
  }
  const ctrl = ctrlAt ? ctrlAt.map(i => (i === undefined ? undefined : arc[i] / L * (n - 1) * DS)) : null;
  return { pts, n, length: (n - 1) * DS, ctrl };
}

function cr(p0, p1, p2, p3, t0, t1, t2, t3, t) {
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
    const a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
    const a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
    const b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
    const b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
    out[c] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
  }
  return out;
}

/* ---------- crossings ---------- */
// Where two parts of rope overlap seen from above (or, on the rail, seen unrolled),
// one must pass over the other. Returns crossings with sample indices on each strand.
function findCrossings(paths, r, useBar) {
  const near = BAR.r + r + 0.009;
  const views = paths.map(P => {
    const n = P.n, uv = new Float64Array(n * 2), dom = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const x = P.pts[k * 3], y = P.pts[k * 3 + 1], z = P.pts[k * 3 + 2];
      const bx = x - BAR.x, by = y - BAR.y;
      if (useBar && Math.abs(z) < BAR.half && Math.hypot(bx, by) < near) {
        dom[k] = 1;
        uv[k * 2] = Math.atan2(bx, by);       // angle round the rail, 0 at the top
        uv[k * 2 + 1] = z;
      } else {
        uv[k * 2] = x; uv[k * 2 + 1] = z;
      }
    }
    return { uv, dom };
  });
  const found = [];
  const rho = BAR.r + r;
  for (let a = 0; a < paths.length; a++) for (let b = a; b < paths.length; b++) {
    const A = paths[a], B = paths[b], va = views[a], vb = views[b];
    for (let i = 0; i < A.n - 1; i++) {
      const da = va.dom[i];
      if (va.dom[i + 1] !== da) continue;
      if (da === 1 && Math.abs(va.uv[i * 2 + 2] - va.uv[i * 2]) > Math.PI) continue;   // seam under the rail
      const sa = da === 1 ? rho : 1;
      const ax = va.uv[i * 2] * sa, ay = va.uv[i * 2 + 1], bx = va.uv[i * 2 + 2] * sa, by = va.uv[i * 2 + 3];
      for (let j = a === b ? i + 2 : 0; j < B.n - 1; j++) {
        if (a === b && (j - i) * DS < 0.03) continue;
        if (vb.dom[j] !== da || vb.dom[j + 1] !== da) continue;
        if (da === 1 && Math.abs(vb.uv[j * 2 + 2] - vb.uv[j * 2]) > Math.PI) continue;
        if (da === 0 && Math.abs(A.pts[i * 3 + 1] - B.pts[j * 3 + 1]) > 0.03) continue;
        const cx = vb.uv[j * 2] * sa, cy = vb.uv[j * 2 + 1], dx = vb.uv[j * 2 + 2] * sa, dy = vb.uv[j * 2 + 3];
        const hit = segX(ax, ay, bx, by, cx, cy, dx, dy);
        if (!hit) continue;
        const ia = i + hit[0], jb = j + hit[1];
        if (found.some(f => f.a === a && f.b === b && Math.abs(f.ia - ia) * DS < 0.015 && Math.abs(f.jb - jb) * DS < 0.015)) continue;
        found.push({ a, b, ia, jb, bar: da === 1 });
      }
    }
  }
  return found;
}

function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
  return [t, u];
}

/* ---------- build ---------- */
// knot: { ropes: [{ points, rotate }], sequence, steps, bar }
// Returns per-rope paths { pts, n, length, ctrl } plus the crossings for debugging.
export function buildPaths(knot, r) {
  const rot = knot.rotate || 0;
  const paths = knot.ropes.map(rp => smooth(expand(rp.points, r, rot)));
  const crossings = findCrossings(paths, r, knot.bar);

  // order of laying: the step in which the end first reaches each sample
  const reach = paths.map(() => 0);
  const stepOf = paths.map(P => new Float64Array(P.n).fill(1e9));
  knot.steps.forEach((st, si) => {
    for (const mv of st.moves || []) {
      const P = paths[mv.rope];
      const to = mv.to === 'end' ? P.length : P.ctrl[mv.to];
      for (let k = 0; k < P.n; k++) if (stepOf[mv.rope][k] === 1e9 && k * DS <= to + 1e-9) stepOf[mv.rope][k] = si;
      reach[mv.rope] = Math.max(reach[mv.rope], to);
    }
  });
  const when = (rope, k) => stepOf[rope][Math.round(k)] * 1e3 + k * DS;
  for (const c of crossings) {
    const ta = when(c.a, c.ia), tb = when(c.b, c.jb);
    // the mover is whichever strand gets there later
    if (ta > tb) { c.mover = { rope: c.a, k: c.ia }; c.still = { rope: c.b, k: c.jb }; c.t = ta; }
    else { c.mover = { rope: c.b, k: c.jb }; c.still = { rope: c.a, k: c.ia }; c.t = tb; }
  }
  crossings.sort((p, q) => p.t - q.t);
  const seq = knot.sequence || '';
  crossings.forEach((c, i) => {
    c.type = seq[i] || 'O';
    c.over = c.type === 'O' ? c.mover : c.still;
    c.under = c.type === 'O' ? c.still : c.mover;
  });
  const warning = crossings.length !== seq.length
    ? `${knot.id}: found ${crossings.length} crossings, sequence has ${seq.length}` : null;

  // lift each upper strand clear of the one beneath it (up on the table, outward on the rail)
  const off = paths.map(P => new Float64Array(P.n));
  const dirs = paths.map(P => {
    const d = new Float64Array(P.n * 3);
    for (let k = 0; k < P.n; k++) {
      const x = P.pts[k * 3] - BAR.x, y = P.pts[k * 3 + 1] - BAR.y, z = P.pts[k * 3 + 2];
      const h = Math.hypot(x, y);
      if (knot.bar && Math.abs(z) < BAR.half && h < BAR.r + r + 0.009) { d[k * 3] = x / h; d[k * 3 + 1] = y / h; }
      else d[k * 3 + 1] = 1;
    }
    return d;
  });
  const h = 2 * r + GAP;
  const w = Math.round(BUMP / DS);
  const shape = x => (x < 0.35 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (x - 0.35) / 0.65)));
  const raise = (off, list) => {
    for (let pass = 0; pass < 4; pass++) {
      for (const c of list) {
        const ku = Math.round(c.under.k), ko = Math.round(c.over.k);
        const need = off[c.under.rope][ku] + h;
        if (off[c.over.rope][ko] >= need - 1e-6) continue;
        const O = off[c.over.rope];
        for (let j = Math.max(0, ko - w); j <= Math.min(O.length - 1, ko + w); j++) O[j] = Math.max(O[j], need * shape(Math.abs(j - ko) / w));
      }
    }
  };
  raise(off, crossings);
  // the lifts a strand needs when it is laid: everything except passing over a later end
  const laid = paths.map(P => new Float64Array(P.n));
  raise(laid, crossings.filter(c => c.over === c.mover));
  paths.forEach((P, i) => {
    for (let k = 0; k < P.n; k++) for (let c = 0; c < 3; c++) P.pts[k * 3 + c] += off[i][k] * dirs[i][k * 3 + c];
  });

  // Where the end later passes under a strand that is already down, that strand is only
  // lifted at the moment the end arrives (a finger raising it). Record how far each such
  // lift raises the path, so it can lie flat until then.
  const dyn = paths.map((P, i) => off[i].map((v, k) => Math.max(0, v - laid[i][k])));
  const lifts = paths.map(() => []);
  for (const c of crossings) {
    if (c.over !== c.still) continue;
    lifts[c.still.rope].push({ k: Math.round(c.still.k), w, mover: c.mover.rope, at: c.mover.k * DS });
  }

  relax(paths, r, knot.bar);
  const out = paths.map((P, i) => {
    const flat = new Float64Array(P.pts);
    for (let k = 0; k < P.n; k++) {
      for (let c = 0; c < 3; c++) flat[k * 3 + c] -= dyn[i][k] * dirs[i][k * 3 + c];
      flat[k * 3 + 1] = Math.max(r, flat[k * 3 + 1]);
    }
    const R = resample(toList(P.pts, P.n), null);
    const F = resample(toList(flat, P.n), null, toList(P.pts, P.n));
    const ratio = (R.n - 1) / (P.n - 1);
    R.ctrl = P.ctrl.map(a => (a === undefined ? undefined : a * R.length / P.length));
    // pts: path with every lift down; lift: how far each lift raises it
    R.lift = new Float64Array(R.n * 3);
    for (let k = 0; k < R.n * 3; k++) R.lift[k] = R.pts[k] - F.pts[k];
    R.pts = F.pts;
    R.lifts = lifts[i].map(l => ({ ...l, k: l.k * ratio, w: l.w * ratio }));
    return R;
  });
  // movers' crossing arcs were measured before resampling, scale them the same way
  out.forEach(R => R.lifts.forEach(l => { l.at *= out[l.mover].length / paths[l.mover].length; }));
  return { paths: out, crossings, warning };
}

// push apart any two samples closer than a rope's width, keep clear of table and rail,
// and smooth a little so the pushes don't leave kinks
function relax(paths, r, useBar) {
  const D = 2 * r + GAP * 0.8;
  const all = [];
  paths.forEach((P, i) => { for (let k = 0; k < P.n; k++) all.push([i, k]); });
  for (let it = 0; it < 60; it++) {
    const grid = new Map();
    const key = (x, y, z) => `${Math.floor(x / D)},${Math.floor(y / D)},${Math.floor(z / D)}`;
    for (const [i, k] of all) {
      const p = paths[i].pts;
      const kk = key(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
      (grid.get(kk) || grid.set(kk, []).get(kk)).push([i, k]);
    }
    for (const [i, k] of all) {
      const p = paths[i].pts;
      const x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2];
      const cx = Math.floor(x / D), cy = Math.floor(y / D), cz = Math.floor(z / D);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const list = grid.get(`${cx + a},${cy + b},${cz + c}`);
        if (!list) continue;
        for (const [j, m] of list) {
          if (j < i || (j === i && m <= k)) continue;
          if (j === i && (m - k) * DS < D * 2.2) continue;
          const q = paths[j].pts;
          const dx = q[m * 3] - p[k * 3], dy = q[m * 3 + 1] - p[k * 3 + 1], dz = q[m * 3 + 2] - p[k * 3 + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d >= D || d < 1e-9) continue;
          const push = (D - d) / d * 0.5;
          p[k * 3] -= dx * push; p[k * 3 + 1] -= dy * push; p[k * 3 + 2] -= dz * push;
          q[m * 3] += dx * push; q[m * 3 + 1] += dy * push; q[m * 3 + 2] += dz * push;
        }
      }
    }
    for (const P of paths) {
      const p = P.pts;
      if (it % 3 === 2) {
        for (let k = 1; k < P.n - 1; k++) for (let c = 0; c < 3; c++) {
          p[k * 3 + c] = p[k * 3 + c] * 0.6 + (p[(k - 1) * 3 + c] + p[(k + 1) * 3 + c]) * 0.2;
        }
      }
      for (let k = 0; k < P.n; k++) {
        if (p[k * 3 + 1] < r) p[k * 3 + 1] = r;
        if (useBar && Math.abs(p[k * 3 + 2]) < BAR.half) {
          const bx = p[k * 3] - BAR.x, by = p[k * 3 + 1] - BAR.y, h = Math.hypot(bx, by), rr = BAR.r + r;
          if (h < rr) { p[k * 3] = BAR.x + bx / h * rr; p[k * 3 + 1] = BAR.y + by / h * rr; }
        }
      }
    }
  }
}

/* ---------- lookups ---------- */
export function sampleAt(path, u, out) {
  const { pts, n } = path;
  let f = u / DS;
  if (f <= 0) {
    // before the start: carry straight on back along the first tangent
    const tx = pts[3] - pts[0], ty = pts[4] - pts[1], tz = pts[5] - pts[2];
    const k = f;
    out[0] = pts[0] + tx * k; out[1] = pts[1] + ty * k; out[2] = pts[2] + tz * k;
    return out;
  }
  if (f >= n - 1) f = n - 1 - 1e-9;
  const k = Math.floor(f), t = f - k;
  for (let c = 0; c < 3; c++) out[c] = pts[k * 3 + c] + (pts[k * 3 + 3 + c] - pts[k * 3 + c]) * t;
  return out;
}

export function tangentAt(path, u) {
  const a = sampleAt(path, u - 0.01, [0, 0, 0]), b = sampleAt(path, u + 0.01, [0, 0, 0]);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d];
}

function toList(pts, n) { const l = []; for (let k = 0; k < n; k++) l.push([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]]); return l; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function sub2(a, b) { return [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]]; }
