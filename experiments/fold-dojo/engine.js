/* Fold Dojo engine.

   A sheet is a list of flat convex facets. Each facet keeps its outline in paper coordinates
   (the unfolded sheet, centred on 0,0) and an affine map M that places it in the model plane.
   Facets are listed bottom to top; `level` is how many sheets lie under a facet where it sits,
   which is what gives a folded model its thickness.

   A fold step is one or more moves. A move picks facets (side of a line, layer, tag, part of
   the sheet) and turns them about a chain of hinges. One hinge is a plain valley or mountain
   fold. Two hinges, one inside the other, give a petal fold, where the sides fold in while
   the flap swings up. At the end every hinge has turned half a turn, so each moved facet is
   reflected across its hinge lines, and the new stacking order is read from which way each
   layer was travelling as it landed.

   Model plane: x to the right, y away from the viewer. In 3D that is X = x, Z = -y, Y up.
   Heights are kept in layers and multiplied by the paper's thickness when drawn. */

const TOL = 1e-9;

/* ---------- 2D affine maps, [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f ---------- */
export const Aff = {
  I: () => [1, 0, 0, 1, 0, 0],
  mul: (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ],
  apply: (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]],
  det: m => m[0] * m[3] - m[1] * m[2],
  inv(m) {
    const k = 1 / (m[0] * m[3] - m[1] * m[2]);
    const a = m[3] * k, b = -m[1] * k, c = -m[2] * k, d = m[0] * k;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
  },
  rotate(ang, c = [0, 0]) {
    const co = Math.cos(ang), si = Math.sin(ang);
    return [co, si, -si, co, c[0] - co * c[0] + si * c[1], c[1] - si * c[0] - co * c[1]];
  },
  // reflection across the line through p with unit direction u
  reflect(p, u) {
    const a = u[0] * u[0] - u[1] * u[1], b = 2 * u[0] * u[1];
    return [a, b, b, -a, p[0] - (a * p[0] + b * p[1]), p[1] - (b * p[0] - a * p[1])];
  },
};

/* ---------- convex polygons ---------- */
export function area(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}
export function centroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-14) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}
const ccw = poly => (area(poly) < 0 ? poly.slice().reverse() : poly);

// a line with a chosen side: p a point on it, u its unit direction, n the unit normal that
// points to the chosen side. side() is the signed distance to it.
export function line(a, b, toward) {
  let u = [b[0] - a[0], b[1] - a[1]];
  const l = Math.hypot(u[0], u[1]);
  u = [u[0] / l, u[1] / l];
  let n = [-u[1], u[0]];
  if (toward && (toward[0] - a[0]) * n[0] + (toward[1] - a[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { p: a, u, n };
}
const side = (L, q) => (q[0] - L.p[0]) * L.n[0] + (q[1] - L.p[1]) * L.n[1];

function clip(poly, L, keep = 1) {
  const out = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const sp = keep * side(L, p), sq = keep * side(L, q);
    if (sp >= -1e-12) out.push(p);
    if ((sp > 1e-12 && sq < -1e-12) || (sp < -1e-12 && sq > 1e-12)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
function intersect(a, b) {        // both convex and counter-clockwise
  let out = a;
  for (let i = 0, n = b.length; i < n && out.length > 2; i++) {
    const p = b[i], q = b[(i + 1) % n];
    out = clip(out, line(p, q, [p[0] - (q[1] - p[1]), p[1] + (q[0] - p[0])]), 1);
  }
  return out;
}
function inside(poly, q, tol = 1e-7) {   // counter-clockwise convex
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], r = poly[(i + 1) % n];
    if ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0]) < tol * Math.hypot(r[0] - p[0], r[1] - p[1])) return false;
  }
  return true;
}
const bbox = poly => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
const boxesMeet = (a, b) => a[0] < b[2] - 1e-9 && b[0] < a[2] - 1e-9 && a[1] < b[3] - 1e-9 && b[1] < a[3] - 1e-9;

export const modelPoly = f => ccw(f.poly.map(p => Aff.apply(f.M, p)));

/* ---------- 3D helpers ---------- */
export function rotAxis(p, o, k, ang) {    // rotate point p about the axis through o along unit k
  const x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  const c = Math.cos(ang), s = Math.sin(ang), d = (k[0] * x + k[1] * y + k[2] * z) * (1 - c);
  return [
    o[0] + x * c + (k[1] * z - k[2] * y) * s + k[0] * d,
    o[1] + y * c + (k[2] * x - k[0] * z) * s + k[1] * d,
    o[2] + z * c + (k[0] * y - k[1] * x) * s + k[2] * d,
  ];
}
// the axis a hinge turns about: lies along the crease, turning the moving side upward for a
// positive angle
function hingeAxis(L, h) {
  const n3 = [L.n[0], 0, -L.n[1]];
  return { o: [L.p[0], h, -L.p[1]], k: [-n3[2], 0, n3[0]] };
}
export const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

/* ---------- state ---------- */
export function initialState(poly, M = Aff.I()) {
  return { facets: [{ id: 1, poly, M, level: 0, tags: [] }], creases: [], pose: [], present: null, nextId: 2 };
}
const cloneFacet = f => ({ ...f, tags: f.tags.slice() });

function splitFacet(S, f, L) {
  const mp = modelPoly(f);
  const a = clip(mp, L, 1), b = clip(mp, L, -1);
  if (a.length < 3 || b.length < 3 || Math.abs(area(a)) < 1e-10 || Math.abs(area(b)) < 1e-10) return [f];
  const inv = Aff.inv(f.M);
  return [a, b].map(poly => ({
    ...cloneFacet(f), id: S.nextId++, poly: ccw(poly.map(p => Aff.apply(inv, p))),
  }));
}

function levels(facets, polys) {
  // level = one more than the highest facet under it that it overlaps
  const lv = new Array(facets.length).fill(0);
  const bbs = polys.map(bbox);
  for (let i = 0; i < facets.length; i++) {
    for (let j = 0; j < i; j++) {
      if (!boxesMeet(bbs[i], bbs[j]) || lv[j] + 1 <= lv[i]) continue;
      const x = intersect(polys[i], polys[j]);
      if (x.length > 2 && area(x) > 1e-8) lv[i] = lv[j] + 1;
    }
  }
  return lv;
}

/* ---------- steps ---------- */
// prepare a move from its description in a design
function prepMove(m) {
  const chain = m.hinges.map(h => ({ L: line(h.a, h.b, h.toward), angle: h.angle }));
  const within = (m.within || [m.hinges[0]]).map(w => line(w.a, w.b, w.toward));
  return { ...m, chain, within, full: chain.every(h => Math.abs(Math.abs(h.angle) - Math.PI) < 1e-6) };
}

function countAbove(facets, polys, i, c) {
  let n = 0;
  for (let j = i + 1; j < facets.length; j++) if (inside(polys[j], c)) n++;
  return n;
}

// the middle of the stack under a point: halfway between its lowest and highest layers
function stackMiddle(facets, polys, q, only) {
  let lo = Infinity, hi = -Infinity;
  facets.forEach((f, i) => {
    if (only && !only(i)) return;
    if (inside(polys[i], q, 1e-9)) { lo = Math.min(lo, f.level); hi = Math.max(hi, f.level); }
  });
  return lo === Infinity ? null : (lo + hi) / 2;
}

function runFold(S0, step, warn) {
  const S = { ...S0, facets: S0.facets.map(cloneFacet) };
  const moves = step.moves.map(prepMove);
  const oldPolys0 = S0.facets.map(modelPoly);

  // 1. cut every facet that a move could reach along that move's hinge and boundary lines
  let facets = S.facets.map(f => ({ ...f, origin: f.id }));
  for (const mv of moves) {
    const lines = [...mv.chain.map(h => h.L), ...mv.within];
    const reach = f => {
      if (mv.tag && !f.tags.includes(mv.tag)) return false;
      if (mv.paper && !mv.paper(centroid(f.poly))) return false;
      let p = modelPoly(f);
      for (const w of mv.within) { p = clip(p, w, 1); if (p.length < 3) return false; }
      return Math.abs(area(p)) > 1e-10;
    };
    for (const L of lines) facets = facets.flatMap(f => (reach(f) ? splitFacet(S, f, L) : [f]));
  }

  // 2. pick which facets each move carries
  let polys = facets.map(modelPoly);
  const group = new Array(facets.length).fill(-1);
  moves.forEach((mv, mi) => {
    let n = 0;
    facets.forEach((f, i) => {
      if (group[i] >= 0) return;
      const c = centroid(polys[i]);
      if (!mv.within.every(w => side(w, c) > 1e-7)) return;
      if (mv.tag && !f.tags.includes(mv.tag)) return;
      if (mv.paper && !mv.paper(centroid(f.poly))) return;
      if (mv.layers) {
        const above = countAbove(facets, polys, i, c);
        if (above < mv.layers[0] || above > mv.layers[1]) return;
      }
      group[i] = mi; n++;
    });
    if (!n) warn?.(`"${step.title}": move ${mi + 1} picked up nothing`);
  });

  // 3. put back together any facet that was cut but whose pieces all do the same thing
  const byOrigin = new Map();
  facets.forEach((f, i) => { (byOrigin.get(f.origin) || byOrigin.set(f.origin, []).get(f.origin)).push(i); });
  const orig = new Map(S.facets.map(f => [f.id, f]));
  const merged = [], mgroup = [];
  const done = new Set();
  facets.forEach((f, i) => {
    const sib = byOrigin.get(f.origin);
    if (sib.length > 1 && sib.every(j => group[j] === group[i])) {
      if (done.has(f.origin)) return;
      done.add(f.origin);
      merged.push(cloneFacet(orig.get(f.origin))); mgroup.push(group[i]);
    } else { merged.push(f); mgroup.push(group[i]); }
  });
  facets = merged;
  polys = facets.map(modelPoly);
  for (const [i, f] of facets.entries()) { delete f.origin; if (mgroup[i] >= 0 && moves[mgroup[i]].addTag) f.tags.push(moves[mgroup[i]].addTag); }

  // hinge heights: valleys turn about the top of the layers they carry, mountains the bottom
  const hv = moves.map(() => -Infinity), hm = moves.map(() => Infinity);
  facets.forEach((f, i) => { const g = mgroup[i]; if (g >= 0) { hv[g] = Math.max(hv[g], f.level + 1); hm[g] = Math.min(hm[g], f.level); } });

  // which way each layer of an inside-reverse fold opens: the front half up, the back half down
  const cSrc = facets.map((f, i) => (mgroup[i] >= 0 && moves[mgroup[i]].inside ? stackMiddle(S0.facets, oldPolys0, centroid(polys[i])) ?? f.level : 0));

  // 4. where each facet lands
  const items = facets.map((f, i) => {
    const g = mgroup[i];
    if (g < 0) return { f, g, Mnew: f.M };
    const mv = moves[g];
    let R = Aff.I();
    if (mv.full) for (const h of mv.chain) R = Aff.mul(R, Aff.reflect(h.L.p, h.L.u));
    const hinges = mv.chain.map(h => {
      let sign = 1, height;
      if (mv.inside) { sign = f.level >= cSrc[i] ? 1 : -1; height = f.level + 0.5; }
      else height = h.angle > 0 ? hv[g] : hm[g];
      return { ...hingeAxis(h.L, height), L: h.L, angle: h.angle * sign, hLevel: height };
    });
    return { f, g, Mnew: Aff.mul(R, f.M), hinges, curl: mv.chain.length === 1 && !mv.inside };
  });

  // creases: where each moved facet meets each hinge line, in paper coordinates
  const creases = S0.creases.slice();
  for (const it of items) {
    if (it.g < 0) continue;
    const mv = moves[it.g];
    let F = Aff.I();
    for (let j = mv.chain.length - 1; j >= 0; j--) {
      const L = mv.chain[j].L, FM = Aff.mul(F, it.f.M);
      const pts = it.f.poly.map(p => Aff.apply(FM, p)).filter(q => Math.abs(side(L, q)) < 1e-7);
      if (pts.length >= 2) {
        const tt = pts.map(q => (q[0] - L.p[0]) * L.u[0] + (q[1] - L.p[1]) * L.u[1]);
        const a = pts[tt.indexOf(Math.min(...tt))], b = pts[tt.indexOf(Math.max(...tt))];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) {
          const inv = Aff.inv(FM);
          const up = Aff.det(FM) > 0 ? 1 : -1;
          creases.push({ a: Aff.apply(inv, a), b: Aff.apply(inv, b), valley: mv.chain[j].angle * up > 0 });
        }
      }
      if (mv.full) F = Aff.mul(Aff.reflect(L.p, L.u), F);
    }
  }

  const partial = moves.some(m => !m.full);
  if (partial) {
    // shaping: the flat state stays as it is and the turned flaps are kept as a pose
    const pose = S0.pose.slice();
    items.forEach(it => { if (it.g >= 0) pose.push({ id: it.f.id, hinges: it.hinges }); });
    const next = { ...S, facets, creases, pose };
    if (step.present) next.present = presentFor(next, step.present);
    return { state: next, anim: { type: 'fold', items, present: next.present, from: S0.present } };
  }

  // 5. stacking order. For each overlapping pair, compare how the two layers were moving as
  // they landed: first the outermost hinge (carried up over the top, or down underneath,
  // and how far out from the crease), then the next hinge in, then the layer it started on.
  const newPolys = items.map(it => ccw(it.f.poly.map(p => Aff.apply(it.Mnew, p))));
  const stationary = i => items[i].g < 0;
  const oldPolys = facets.map(modelPoly);
  function key(i, P) {
    const it = items[i];
    if (it.g < 0) return { c: [], b: it.f.level };
    const mv = moves[it.g];
    const pOld = Aff.apply(Aff.mul(it.f.M, Aff.inv(it.Mnew)), P);
    if (mv.inside) {
      // an inside reverse fold slips between the layers it lands among
      const dst = stackMiddle(facets, oldPolys, P, stationary);
      const src = stackMiddle(S0.facets, oldPolys0, pOld) ?? it.f.level;
      return { c: [], b: (dst ?? src) + 0.5 * (it.f.level - src) };
    }
    const k = mv.chain.length, c = new Array(k);
    let p = pOld;
    for (let j = k - 1; j >= 0; j--) {
      const h = mv.chain[j];
      c[j] = side(h.L, p) * Math.sign(h.angle) * (j % 2 ? -1 : 1);
      p = Aff.apply(Aff.reflect(h.L.p, h.L.u), p);
    }
    return { c, b: (k % 2 ? -1 : 1) * it.f.level };
  }
  const N = items.length, above = Array.from({ length: N }, () => []), indeg = new Array(N).fill(0);
  const bbs = newPolys.map(bbox);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (!boxesMeet(bbs[i], bbs[j])) continue;
      const x = intersect(newPolys[i], newPolys[j]);
      if (x.length < 3 || area(x) < 1e-8) continue;
      const P = centroid(x), ki = key(i, P), kj = key(j, P);
      let d = 0;
      for (let m = 0; m < Math.max(ki.c.length, kj.c.length) && !d; m++) {
        const a = ki.c[m] || 0, b = kj.c[m] || 0;
        if (Math.abs(a - b) > 1e-7) d = a - b;
      }
      if (!d && Math.abs(ki.b - kj.b) > 1e-9) d = ki.b - kj.b;
      if (!d) d = i - j;
      if (d > 0) { above[j].push(i); indeg[i]++; } else { above[i].push(j); indeg[j]++; }
    }
  }
  const order = topo(N, above, indeg);
  const out = order.map(i => ({ ...items[i].f, M: items[i].Mnew }));
  const lv = levels(out, out.map(modelPoly));
  out.forEach((f, i) => { f.level = lv[i]; });
  const levelOf = new Map(out.map(f => [f.id, f.level]));
  for (const it of items) it.newLevel = levelOf.get(it.f.id);
  return { state: { ...S, facets: out, creases }, anim: { type: 'fold', items } };
}

// order a graph whose edges point upward; on a cycle, break it at the lowest remaining facet
function topo(N, above, indeg) {
  const deg = indeg.slice(), done = new Array(N).fill(false), order = [];
  while (order.length < N) {
    let pick = -1;
    for (let i = 0; i < N; i++) if (!done[i] && deg[i] === 0) { pick = i; break; }
    if (pick < 0) for (let i = 0; i < N; i++) if (!done[i]) { pick = i; break; }
    done[pick] = true; order.push(pick);
    for (const j of above[pick]) deg[j]--;
  }
  return order;
}

function bounds(S) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of S.facets) for (const [x, y] of modelPoly(f)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function presentFor(S, pr) {
  const b = bounds(S);
  return { o: [b.cx, 0, -b.cy], k: pr.axis, angle: pr.angle };
}

function runFlip(S0, step) {
  const ax = step.axis ?? 0;
  const F = [-1, 0, 0, 1, 2 * ax, 0];
  const rev = S0.facets.slice().reverse();
  const items = S0.facets.map(f => ({ f, g: 0, Mnew: Aff.mul(F, f.M) }));
  const out = rev.map(f => ({ ...cloneFacet(f), M: Aff.mul(F, f.M) }));
  const lv = levels(out, out.map(modelPoly));
  out.forEach((f, i) => { f.level = lv[i]; });
  const levelOf = new Map(out.map(f => [f.id, f.level]));
  for (const it of items) it.newLevel = levelOf.get(it.f.id);
  const top = Math.max(...S0.facets.map(f => f.level)) + 1;
  return {
    state: { ...S0, facets: out },
    anim: { type: 'rigid', items, o: [ax, top / 2, 0], k: [0, 0, 1], angle: Math.PI },
  };
}

function runTurn(S0, step) {
  const b = bounds(S0);
  const c = [b.cx, b.cy];
  const R = Aff.rotate(step.angle, c);
  const items = S0.facets.map(f => ({ f, g: 0, Mnew: Aff.mul(R, f.M), newLevel: f.level }));
  const out = S0.facets.map(f => ({ ...cloneFacet(f), M: Aff.mul(R, f.M) }));
  return { state: { ...S0, facets: out }, anim: { type: 'rigid', items, o: [c[0], 0, -c[1]], k: [0, 1, 0], angle: step.angle } };
}

// a custom move: the design supplies where every point of the sheet is at each moment
function runCustom(S0, step, warn) {
  const S = { ...S0, facets: S0.facets.map(cloneFacet) };
  let facets = S.facets;
  for (const [a, b] of step.cuts) {
    const L = line(a, b);
    facets = facets.flatMap(f => splitFacet(S, f, L));
  }
  const motion = step.motion;
  const items = facets.map(f => {
    // three points of the facet, where they land, give its new flat placement
    const c = centroid(f.poly);
    const q = [c, [c[0] + 0.01, c[1]], [c[0], c[1] + 0.01]];
    const w = q.map(p => motion(Aff.apply(f.M, p), 1));
    const P = w.map(v => [v[0], -v[2]]);
    const src = [q[0], q[1], q[2]];
    const Mnew = affineFrom(src, P);
    return { f, g: 0, Mnew, motion };
  });
  // order from height a moment before the end
  const eps = step.orderAt ?? 0.98;
  const newPolys = items.map(it => ccw(it.f.poly.map(p => Aff.apply(it.Mnew, p))));
  const N = items.length, above = Array.from({ length: N }, () => []), indeg = new Array(N).fill(0);
  const bbs = newPolys.map(bbox);
  const hAt = (i, P) => {
    const it = items[i];
    const pOld = Aff.apply(Aff.mul(it.f.M, Aff.inv(it.Mnew)), P);
    return motion(pOld, eps)[1];
  };
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (!boxesMeet(bbs[i], bbs[j])) continue;
      const x = intersect(newPolys[i], newPolys[j]);
      if (x.length < 3 || area(x) < 1e-8) continue;
      const P = centroid(x);
      let d = hAt(i, P) - hAt(j, P);
      if (Math.abs(d) < 1e-12) {
        // layers pressed together: the design says which goes in front
        d = step.tieBreak ? step.tieBreak(centroid(items[i].f.poly)) - step.tieBreak(centroid(items[j].f.poly)) : 0;
        if (Math.abs(d) < 1e-12) warn?.(`"${step.title}": two layers tie`);
      }
      if (d > 0) { above[j].push(i); indeg[i]++; } else { above[i].push(j); indeg[j]++; }
    }
  }
  const order = topo(N, above, indeg);
  const out = order.map(i => ({ ...items[i].f, M: items[i].Mnew }));
  const lv = levels(out, out.map(modelPoly));
  out.forEach((f, i) => { f.level = lv[i]; });
  const levelOf = new Map(out.map(f => [f.id, f.level]));
  for (const it of items) it.newLevel = levelOf.get(it.f.id);
  const creases = S0.creases.concat(step.creases || []);
  return { state: { ...S, facets: out, creases }, anim: { type: 'custom', items } };
}

function affineFrom(src, dst) {
  // the affine map taking three source points to three destination points
  const [p0, p1, p2] = src, [q0, q1, q2] = dst;
  const s = [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1]];
  const d = [q1[0] - q0[0], q1[1] - q0[1], q2[0] - q0[0], q2[1] - q0[1]];
  const det = s[0] * s[3] - s[2] * s[1];
  const si = [s[3] / det, -s[1] / det, -s[2] / det, s[0] / det];
  const a = d[0] * si[0] + d[2] * si[1], b = d[1] * si[0] + d[3] * si[1];
  const c = d[0] * si[2] + d[2] * si[3], e = d[1] * si[2] + d[3] * si[3];
  return [a, b, c, e, q0[0] - (a * p0[0] + c * p0[1]), q0[1] - (b * p0[0] + e * p0[1])];
}

/* ---------- a whole design ---------- */
// Runs every step once. Returns the state before each step (states[i]) and how step i moves.
export function build(design, opts = {}) {
  const warn = opts.warn || (m => console.warn('[fold-dojo]', design.id, m));
  const sheet = design.sheet(opts);
  let S = initialState(sheet.poly, sheet.M);
  const states = [S], anims = [], stack = [];
  design.steps(opts).forEach((step, i) => {
    let r;
    if (step.type === 'fold') r = runFold(S, step, warn);
    else if (step.type === 'flip') r = runFlip(S, step);
    else if (step.type === 'turn') r = runTurn(S, step);
    else if (step.type === 'custom') r = runCustom(S, step, warn);
    else if (step.type === 'unfold') {
      const j = stack.pop();
      if (j === undefined) throw new Error('nothing to unfold');
      const back = states[j];
      r = { state: { ...back, creases: S.creases }, anim: { type: 'reverse', of: anims[j] } };
    }
    if (step.type === 'fold' || step.type === 'custom') stack.push(i);
    anims.push(r.anim);
    S = r.state;
    states.push(S);
  });
  return { states, anims, steps: design.steps(opts), sheet };
}

/* ---------- where a point of the paper is ---------- */
// flat placement: the centre plane of a facet's sheet, `level` sheets up
export function flatPos(M, level, q, T) {
  const [x, y] = Aff.apply(M, q);
  return [x, (level + 0.5) * T, -y];
}

function chainPos(it, q, a, T, curl, dmax) {
  let p = flatPos(it.f.M, it.f.level, q, T);
  const hs = it.hinges;
  for (let j = hs.length - 1; j >= 0; j--) {
    const h = hs[j];
    let ang = h.angle * a;
    if (j === 0 && it.curl && curl > 0) {
      // the far edge of a flap trails a little behind the crease, more in thin paper
      const m = Aff.apply(it.f.M, q);
      const d = Math.max(0, side(h.L, m)) / dmax;
      ang -= Math.sign(h.angle) * curl * Math.sin(Math.PI * a) * d * d * 0.9;
    }
    p = rotAxis(p, [h.o[0], h.hLevel * T, h.o[2]], h.k, ang);
  }
  return p;
}

// position of paper point q of an animation item, part way (t from 0 to 1) through its step
export function animPos(anim, it, q, t, T, curl = 0, dmax = 1) {
  if (it.g < 0) return flatPos(it.f.M, it.f.level, q, T);
  const a = ease(t);
  let p, end;
  if (anim.type === 'fold') {
    p = chainPos(it, q, a, T, curl, dmax);
    if (it.newLevel === undefined) return p;                   // a shaping step: no settling
    end = chainPos(it, q, 1, T, 0, dmax);
  } else if (anim.type === 'rigid') {
    const o = [anim.o[0], anim.o[1] * T, anim.o[2]];
    p = rotAxis(flatPos(it.f.M, it.f.level, q, T), o, anim.k, anim.angle * a);
    end = rotAxis(flatPos(it.f.M, it.f.level, q, T), o, anim.k, anim.angle);
  } else {
    const m = Aff.apply(it.f.M, q);
    p = it.motion(m, t);
    end = it.motion(m, 1);
  }
  // settle onto the exact flat stack over the last part of the move
  const w = smooth(0.7, 1, t);
  if (w > 0) {
    const tgt = flatPos(it.Mnew, it.newLevel, q, T);
    p = [p[0] + (tgt[0] - end[0]) * w, p[1] + (tgt[1] - end[1]) * w, p[2] + (tgt[2] - end[2]) * w];
  }
  return p;
}

// a state at rest, with any shaping pose and presentation turn
export function restPos(S, f, q, T, poseMap) {
  let p = flatPos(f.M, f.level, q, T);
  const pose = poseMap?.get(f.id);
  if (pose) for (let j = pose.length - 1; j >= 0; j--) { const h = pose[j]; p = rotAxis(p, [h.o[0], h.hLevel * T, h.o[2]], h.k, h.angle); }
  return p;
}
export function poseMapOf(S) {
  const m = new Map();
  for (const e of S.pose) m.set(e.id, e.hinges);
  return m;
}
export function presentPos(pr, p, a = 1) {
  return pr ? rotAxis(p, pr.o, pr.k, pr.angle * a) : p;
}
export { side, bounds };
