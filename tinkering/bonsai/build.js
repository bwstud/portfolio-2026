/* Turns a tree graph into typed arrays the GPU can draw. Runs in the worker, next to the model.

   Nodes are numbered in depth-first order with the leading (main) child visited first. That makes
   two useful ranges contiguous: a node's whole subtree is [i, end[i]], and the axis it leads
   from there to its tip is [i, chainEnd[i]]. The page highlights either with one uniform, so
   hover previews for cut, pinch, wire and jin are free. */

import { positions, perpFrame, yearFrac, rnd, STEPS_PER_YEAR, treeLight, treeStats } from './sim.js';
import { SPECIES } from './species.js';

const TEX = 0.05;                                   // metres of bark per texture repeat
const UP = [0, 1, 0];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lin = hex => {                                // sRGB hex to linear rgb
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => Math.pow(c / 255, 2.2));
};
const sides = r => r > 0.006 ? 16 : r > 0.0025 ? 10 : r > 0.0011 ? 7 : 5;

export function buildFrame(state) {
  const sp = SPECIES[state.species];
  const nodes = state.nodes;
  const pos = positions(state);
  const N = state.nextId;

  /* ---------- depth-first order, main child first ---------- */
  const dfsOf = new Int32Array(N).fill(-1);
  const order = [];
  const stack = [0];
  while (stack.length) {
    const id = stack.pop();
    const n = nodes[id];
    if (!n) continue;
    dfsOf[id] = order.length;
    order.push(id);
    const kids = n.c.filter(c => nodes[c]);
    kids.sort((a, b) => (nodes[a].m ? 1 : 0) - (nodes[b].m ? 1 : 0));   // main last on the stack, so popped first
    for (const c of kids) stack.push(c);
  }
  const M = order.length;
  const end = new Int32Array(M), chainEnd = new Int32Array(M);
  for (let i = M - 1; i >= 0; i--) {
    const n = nodes[order[i]];
    let e = i;
    for (const c of n.c) if (nodes[c]) e = Math.max(e, end[dfsOf[c]]);
    end[i] = e;
    const mc = n.c.find(c => nodes[c]?.m);
    chainEnd[i] = mc != null ? chainEnd[dfsOf[mc]] : i;
  }

  /* ---------- per-node info for the page (indexed by dfs) ---------- */
  const info = {
    ids: new Int32Array(M), end, chainEnd,
    radius: new Float32Array(M), age: new Float32Array(M), light: new Float32Array(M),
    flags: new Uint8Array(M), tip: new Float32Array(M * 3), base: new Float32Array(M * 3), len: new Float32Array(M),
    order: new Uint8Array(M),
  };
  const wiredIds = new Map();
  for (const w of state.wires) for (const id of w.chain) wiredIds.set(id, w.id);
  const year = state.step / STEPS_PER_YEAR;
  for (let i = 0; i < M; i++) {
    const id = order[i], n = nodes[id];
    info.ids[i] = id;
    info.radius[i] = n.r;
    info.age[i] = (state.step - n.born) / STEPS_PER_YEAR;
    info.light[i] = n.Q || 0;
    info.len[i] = n.len;
    info.order[i] = Math.min(255, n.ord);
    info.flags[i] = (n.dead ? 1 : 0) | (n.lf ? 2 : 0) | (info.age[i] < 1 ? 4 : 0) | (wiredIds.has(id) ? 8 : 0) | (n.m ? 16 : 0);
    for (let k = 0; k < 3; k++) { info.tip[i * 3 + k] = pos.tip[id * 3 + k]; info.base[i * 3 + k] = pos.base[id * 3 + k]; }
  }
  // light for a branch is the average over the leafy and budded tips it carries
  const lsum = new Float32Array(M), lcnt = new Float32Array(M);
  for (let i = M - 1; i >= 0; i--) {
    const n = nodes[order[i]];
    if (n.Q > 0) { lsum[i] += n.Q; lcnt[i] += 1; }
    if (n.p >= 0) { const pi = dfsOf[n.p]; lsum[pi] += lsum[i]; lcnt[pi] += lcnt[i]; }
  }
  for (let i = 0; i < M; i++) info.light[i] = lcnt[i] ? lsum[i] / lcnt[i] : 0;

  /* ---------- bark: one tube per internode ---------- */
  const chainSides = new Uint8Array(N), chainRep = new Float32Array(N), vEnd = new Float32Array(N);
  let vCount = 0;
  for (const id of order) {
    const n = nodes[id];
    const parent = n.p >= 0 ? nodes[n.p] : null;
    if (n.m && parent) { chainSides[id] = chainSides[n.p]; chainRep[id] = chainRep[n.p]; }
    else { chainSides[id] = sides(n.r); chainRep[id] = Math.max(1, Math.round(2 * Math.PI * n.r / TEX)); }
    const rings = id === 0 ? 5 : 2;
    vCount += rings * (chainSides[id] + 1) + (n.c.some(c => nodes[c]?.m) ? 0 : chainSides[id] + 2);
  }
  const P = new Float32Array(vCount * 3), Nn = new Float32Array(vCount * 3), UV = new Float32Array(vCount * 2);
  const INFO = new Float32Array(vCount * 4), DFS = new Float32Array(vCount);
  const idx = [];
  let v = 0;
  const barkYears = sp.bark.years;

  for (const id of order) {
    const n = nodes[id];
    const d = dfsOf[id];
    const parent = n.p >= 0 ? nodes[n.p] : null;
    const mc = n.c.map(c => nodes[c]).find(c => c?.m);
    const S = chainSides[id], rep = chainRep[id];
    const b = [pos.base[id * 3], pos.base[id * 3 + 1], pos.base[id * 3 + 2]];
    const t = [pos.tip[id * 3], pos.tip[id * 3 + 1], pos.tip[id * 3 + 2]];
    // Thin side branches start sunk inside their parent and swell into a collar. A side branch
    // nearly as thick as its parent is a fork between near-equals: it starts at the joint itself,
    // its first ring turned between the two directions, so the stems divide rather than overlap.
    let start = b, collar = n.r, tanA = n.d;
    if (parent && n.m) tanA = norm([parent.d[0] + n.d[0], parent.d[1] + n.d[1], parent.d[2] + n.d[2]]);
    else if (parent) {
      const ratio = n.r / parent.r;
      if (ratio > 0.55) {
        tanA = norm([parent.d[0] * ratio + n.d[0], parent.d[1] * ratio + n.d[1], parent.d[2] * ratio + n.d[2]]);
        collar = Math.min(n.r * 1.08, parent.r);
      } else {
        start = [b[0] - n.d[0] * parent.r * 0.9, b[1] - n.d[1] * parent.r * 0.9, b[2] - n.d[2] * parent.r * 0.9];
        collar = Math.max(n.r, Math.min(parent.r * 0.7, n.r * 1.35));
      }
    }
    const tanB = mc ? norm([n.d[0] + mc.d[0], n.d[1] + mc.d[1], n.d[2] + mc.d[2]]) : n.d;
    const r0 = collar, r1 = mc ? mc.r : n.r * 0.72;
    const v0 = n.m && parent ? vEnd[n.p] : 0;
    const segLen = Math.hypot(t[0] - start[0], t[1] - start[1], t[2] - start[2]);
    vEnd[id] = v0 + segLen / TEX;

    const age = (state.step - n.born) / STEPS_PER_YEAR;
    const mature = Math.max(smooth(0.6, barkYears, age), smooth(0.0016, 0.007, n.r));
    const scar = n.scar || 0;
    const wid = wiredIds.get(id), wire = wid != null ? state.wires.find(w => w.id === wid) : null;
    const pitch = wire ? Math.max(0.008, wire.r0[wire.chain.indexOf(id)] * 7) : 0.02;

    // the trunk's first internode flares into surface roots
    const ts = id === 0 ? [0, 0.12, 0.3, 0.6, 1] : [0, 1];
    const ringStart = v;
    for (const tt of ts) {
      const c = id === 0
        ? [mix(start[0], t[0], tt), mix(start[1] - 0.012, t[1], tt), mix(start[2], t[2], tt)]
        : (tt === 0 ? start : t);
      const tan = tt === 0 ? tanA : tt === 1 ? tanB : n.d;
      const [u, w] = perpFrame(tan);
      let r = mix(r0, r1, tt);
      const flare = id === 0 ? Math.pow(1 - tt, 2.2) : 0;
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        let rr = r;
        if (flare) {
          const lobes = Math.pow(Math.max(0, Math.sin(a * 5 + 0.7) * 0.6 + Math.sin(a * 3 + 2.1) * 0.4), 2);
          rr = r * (1 + flare * (0.9 + 1.4 * lobes));
        }
        const nx = u[0] * ca + w[0] * sa, ny = u[1] * ca + w[1] * sa, nz = u[2] * ca + w[2] * sa;
        P[v * 3] = c[0] + nx * rr; P[v * 3 + 1] = c[1] + ny * rr; P[v * 3 + 2] = c[2] + nz * rr;
        Nn[v * 3] = nx; Nn[v * 3 + 1] = ny; Nn[v * 3 + 2] = nz;
        const along = mix(v0, vEnd[id], tt);
        UV[v * 2] = (j / S) * rep; UV[v * 2 + 1] = along;
        INFO[v * 4] = mature; INFO[v * 4 + 1] = n.dead ? 1 : 0; INFO[v * 4 + 2] = scar;
        INFO[v * 4 + 3] = along * TEX / pitch + j / S;
        DFS[v] = d;
        v++;
      }
    }
    for (let k = 0; k < ts.length - 1; k++) {
      const a0 = ringStart + k * (S + 1), a1 = a0 + S + 1;
      for (let j = 0; j < S; j++) idx.push(a0 + j, a0 + j + 1, a1 + j, a0 + j + 1, a1 + j + 1, a1 + j);
    }
    if (!mc) {                                      // cap the end: a cut face, or the tip of a shoot
      const last = ringStart + (ts.length - 1) * (S + 1);
      const center = v;
      P[v * 3] = t[0] + n.d[0] * r1 * 0.3; P[v * 3 + 1] = t[1] + n.d[1] * r1 * 0.3; P[v * 3 + 2] = t[2] + n.d[2] * r1 * 0.3;
      Nn.set(n.d, v * 3); UV[v * 2] = 0.5; UV[v * 2 + 1] = vEnd[id];
      INFO[v * 4] = mature; INFO[v * 4 + 1] = n.dead ? 1 : 0; INFO[v * 4 + 2] = 0; INFO[v * 4 + 3] = 0; DFS[v] = d;
      v++;
      for (let j = 0; j <= S; j++) {
        for (let k = 0; k < 3; k++) { P[v * 3 + k] = P[(last + j) * 3 + k]; Nn[v * 3 + k] = n.d[k] * 0.6 + Nn[(last + j) * 3 + k] * 0.4; }
        UV[v * 2] = UV[(last + j) * 2]; UV[v * 2 + 1] = UV[(last + j) * 2 + 1];
        for (let k = 0; k < 4; k++) INFO[v * 4 + k] = INFO[(last + j) * 4 + k];
        DFS[v] = d;
        v++;
      }
      for (let j = 0; j < S; j++) idx.push(center, center + 1 + j, center + 2 + j);
    }
  }
  const branch = {
    position: P.subarray(0, v * 3), normal: Nn.subarray(0, v * 3), uv: UV.subarray(0, v * 2),
    info: INFO.subarray(0, v * 4), dfs: DFS.subarray(0, v),
    index: v > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
  };

  /* ---------- leaves ---------- */
  const leaves = buildLeaves(state, sp, order, dfsOf, pos);

  /* ---------- wire ---------- */
  const wires = buildWires(state, pos);

  return {
    step: state.step, species: state.species,
    branch, leaves, wires, info,
    wireList: state.wires.map(w => ({
      id: w.id, kind: w.kind, set: w.set, on: w.on,
      start: dfsOf[w.chain[0]], end: dfsOf[w.chain.at(-1)],
      biting: w.chain.some(id => nodes[id] && nodes[id].scar > 0.02),
    })),
    env: { ...state.env, light: treeLight(state) },
    stats: treeStats(state),
    year,
  };
}

/* Leaves are instanced cards. Each gets a matrix (position, orientation, size), a colour for its
   age and the season, and its node's dfs index for highlighting. */
function buildLeaves(state, sp, order, dfsOf, pos) {
  const nodes = state.nodes;
  const frac = yearFrac(state.step);
  const light = treeLight(state);
  const c = sp.colors;
  const emerge = lin(c.emerge), summer = lin(c.summer), autumn = c.autumn.map(lin), winter = c.winter ? lin(c.winter) : null;
  const spray = sp.leaf.shape === 'spray';
  let count = 0;
  for (const id of order) { const n = nodes[id]; if (n.lf && !n.dead) count += spray ? 2 : n.lf; }
  const matrix = new Float32Array(count * 16), color = new Float32Array(count * 3), dfs = new Float32Array(count);
  let k = 0;
  for (const id of order) {
    const n = nodes[id];
    if (!n.lf || n.dead) continue;
    const tip = [pos.tip[id * 3], pos.tip[id * 3 + 1], pos.tip[id * 3 + 2]];
    const weeks = state.step - (n.lborn ?? n.born);
    const unfold = smooth(0, 1, n.tl ? n.len / n.tl : 1) * smooth(-1, 3, weeks);
    const ageY = weeks / STEPS_PER_YEAR;

    // colour: fresh growth, then summer green, then autumn (or winter bronzing for evergreens)
    const jit = rnd(state.seed, id, 11);
    let col = summer.slice();
    const fresh = 1 - smooth(1, 7, weeks);
    col = col.map((x, i) => mix(x, emerge[i], fresh));
    if (sp.habit === 'deciduous') {
      const a = smooth(c.autumnStart, c.autumnPeak, frac + (jit - 0.5) * 0.04);
      const ac = autumn[Math.floor(jit * autumn.length) % autumn.length];
      col = col.map((x, i) => mix(x, ac[i], a));
    } else if (winter) {
      const w = Math.max(smooth(0.8, 0.95, frac), 1 - smooth(0.12, 0.25, frac)) * 0.5 * Math.min(1, ageY + 0.3);
      col = col.map((x, i) => mix(x, winter[i], w));
    }
    const shade = 0.85 + 0.3 * rnd(state.seed, id, 12);
    col = col.map(x => x * shade);

    const leavesHere = spray ? 2 : n.lf;
    for (let i = 0; i < leavesHere; i++) {
      let y, z;
      if (spray) {
        // a spray continues its twig, lifted a little; the second card crosses the first
        y = norm([n.d[0], n.d[1] + 0.35, n.d[2]]);
        const [u, w] = perpFrame(y);
        const a = i * Math.PI / 2 + jit * 3;
        z = norm([u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)]);
      } else {
        // leaves sit at the buds; a spur's rosette has extra leaves turned between them
        const L = n.lb.length;
        let bud = L ? n.lb[i % L].d : n.d;
        if (L && i >= L) {
          const [u, w] = perpFrame(n.d), a = Math.PI / 2 + jit;
          const p = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)];
          bud = norm([bud[0] * 0.3 + p[0], bud[1] * 0.3 + p[1], bud[2] * 0.3 + p[2]]);
        }
        y = norm([bud[0] + n.d[0] * 0.35, bud[1] + n.d[1] * 0.35 - 0.3, bud[2] + n.d[2] * 0.35]);
        const face = norm([light[0] * 0.5 + UP[0], light[1] * 0.5 + UP[1], light[2] * 0.5 + UP[2]]);
        z = norm([face[0] - y[0] * dot(face, y), face[1] - y[1] * dot(face, y), face[2] - y[2] * dot(face, y)]);
      }
      const x = cross(y, z);
      const s = n.ls * unfold * (spray ? 1.6 : 1);
      const off = spray ? 0 : s * 0.12;
      const o = k * 16;
      matrix[o] = x[0] * s; matrix[o + 1] = x[1] * s; matrix[o + 2] = x[2] * s; matrix[o + 3] = 0;
      matrix[o + 4] = y[0] * s; matrix[o + 5] = y[1] * s; matrix[o + 6] = y[2] * s; matrix[o + 7] = 0;
      matrix[o + 8] = z[0] * s; matrix[o + 9] = z[1] * s; matrix[o + 10] = z[2] * s; matrix[o + 11] = 0;
      matrix[o + 12] = tip[0] + y[0] * off; matrix[o + 13] = tip[1] + y[1] * off; matrix[o + 14] = tip[2] + y[2] * off; matrix[o + 15] = 1;
      color[k * 3] = col[0]; color[k * 3 + 1] = col[1]; color[k * 3 + 2] = col[2];
      dfs[k] = dfsOf[id];
      k++;
    }
  }
  return { matrix, color, dfs, count: k };
}

/* Wire coils around its branch at the radius the branch had when it was wired. As the branch
   thickens the coil stays put, so it sinks in: that's the bite you have to watch for. */
function buildWires(state, pos) {
  const nodes = state.nodes;
  const pts = [];                                    // polylines: [{points, radius}]
  for (const w of state.wires) {
    const gauge = w.gauge;
    if (w.kind === 'guy') {
      const at = w.chain[Math.min(w.chain.length - 1, Math.floor(w.chain.length * 0.6))];
      if (!nodes[at] || !w.anchor) continue;
      pts.push({ points: [[pos.tip[at * 3], pos.tip[at * 3 + 1], pos.tip[at * 3 + 2]], w.anchor], radius: gauge * 0.35 });
      continue;
    }
    const line = [];
    let phase = 0;
    w.chain.forEach((id, i) => {
      const n = nodes[id];
      if (!n) return;
      const b = [pos.base[id * 3], pos.base[id * 3 + 1], pos.base[id * 3 + 2]];
      const [u, ww] = perpFrame(n.d);
      const hr = Math.max(w.r0[i] + gauge * 0.5, n.r - gauge * 0.25);
      const pitch = Math.max(0.008, w.r0[i] * 7);
      const steps = Math.max(3, Math.ceil(n.len / pitch * 10));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const a = phase + (t * n.len / pitch) * Math.PI * 2;
        line.push([
          b[0] + n.d[0] * n.len * t + (u[0] * Math.cos(a) + ww[0] * Math.sin(a)) * hr,
          b[1] + n.d[1] * n.len * t + (u[1] * Math.cos(a) + ww[1] * Math.sin(a)) * hr,
          b[2] + n.d[2] * n.len * t + (u[2] * Math.cos(a) + ww[2] * Math.sin(a)) * hr,
        ]);
      }
      phase += (n.len / pitch) * Math.PI * 2;
    });
    if (line.length > 1) pts.push({ points: line, radius: gauge * 0.5 });
  }
  // sweep a thin square-ish tube along each polyline
  const S = 5;
  let total = 0;
  for (const p of pts) total += p.points.length * (S + 1);
  const P = new Float32Array(total * 3), Nn = new Float32Array(total * 3), idx = [];
  let v = 0;
  for (const { points, radius } of pts) {
    const startV = v;
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const tan = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const [u, w] = perpFrame(tan);
      for (let j = 0; j <= S; j++) {
        const ang = j / S * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
        const nx = u[0] * ca + w[0] * sa, ny = u[1] * ca + w[1] * sa, nz = u[2] * ca + w[2] * sa;
        P[v * 3] = points[i][0] + nx * radius; P[v * 3 + 1] = points[i][1] + ny * radius; P[v * 3 + 2] = points[i][2] + nz * radius;
        Nn[v * 3] = nx; Nn[v * 3 + 1] = ny; Nn[v * 3 + 2] = nz;
        v++;
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a0 = startV + i * (S + 1), a1 = a0 + S + 1;
      for (let j = 0; j < S; j++) idx.push(a0 + j, a0 + j + 1, a1 + j, a0 + j + 1, a1 + j + 1, a1 + j);
    }
  }
  return { position: P, normal: Nn, index: v > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
