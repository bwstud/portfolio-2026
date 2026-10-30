/* Bonsai growth model. Pure, deterministic and DOM-free: it runs in the worker, and in Node for testing.

   A tree is a graph of internodes (stem segments). Each internode carries buds at its tip: one
   apical bud that extends the axis, and lateral buds arranged by the species' phyllotaxis.
   Growth follows the self-organising tree model of Palubicki et al. (2009):

   1. Light. Every leafy tip casts a pyramid of shade into a coarse voxel grid, tilted away from
      the light. A bud's light exposure Q is what's left after its neighbours' shade.
   2. Allocation. Q is summed from the tips down to the base. The base turns it into a growth
      budget v (capped by what the roots in the pot can feed), and v flows back up: at each fork
      the leading shoot keeps a share set by apical dominance, and laterals split the rest in
      proportion to their light (Borchert–Honda allocation).
   3. Growth. A bud that receives v ≥ 1 breaks into a shoot of ⌊v⌋ internodes. Shoots bend
      towards light, away from gravity and away from shade.
   4. Thickening. Branch radius follows the pipe model, r^p = Σ r_child^p, and never shrinks.
      That's why a trunk keeps its girth after its sacrifice branch is cut.
   5. Seasons. Growth comes in flushes; leaves colour and drop; buds age and die; shaded branches
      that can't pay their way are shed.

   Interventions (cut, pinch, defoliate, wire, jin, care) edit the graph or the environment, and
   the model responds the same way a tree would: cut a leader and its budget moves to the
   buds below it.

   Randomness is a hash of (seed, node id, purpose), never a running sequence, so replaying the same
   history gives the same tree, and an edit in one place doesn't reshuffle the dice elsewhere. */

import { SPECIES } from './species.js';

export const STEPS_PER_YEAR = 48;
export const START_MONTH = 2;                       // the seedling is planted at the start of March
export const PRELUDE_YEARS = 3;                     // grown in the nursery before it's handed over
export const START_STEP = PRELUDE_YEARS * STEPS_PER_YEAR + 8;   // handed over in early May, in fresh leaf

const ELONGATION = 4;                               // steps for an internode to reach full length
const GROW_FROM = 0.2, GROW_TO = 0.72;              // the thickening season, as fractions of a year
const GROW_STEPS = (GROW_TO - GROW_FROM) * STEPS_PER_YEAR;
const UP = [0, 1, 0];

/* ---------- small vector helpers on [x, y, z] arrays ---------- */
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function rotate(v, axis, angle) {             // Rodrigues' rotation
  const c = Math.cos(angle), s = Math.sin(angle), k = axis, d = dot(k, v) * (1 - c), x = cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d, v[1] * c + x[1] * s + k[1] * d, v[2] * c + x[2] * s + k[2] * d];
}
export function perpFrame(d) {                       // two unit vectors perpendicular to d; u is horizontal
  const u = norm(Math.abs(d[1]) < 0.97 ? cross(d, UP) : cross(d, [1, 0, 0]));
  return [u, cross(d, u)];
}

/* ---------- deterministic randomness ---------- */
export function rnd(seed, a, b = 0, c = 0) {
  let h = seed ^ Math.imul(a + 0x7f4a7c15, 0x9e3779b1) ^ Math.imul(b + 0x165667b1, 0x85ebca77) ^ Math.imul(c + 0x2545f491, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const R = { wander: 1, len: 2, bud: 3, leaf: 4, drop: 5, back: 6, jitter: 7 };   // purposes

export const yearFrac = step => (((step / STEPS_PER_YEAR) + START_MONTH / 12) % 1 + 1) % 1;
export const ageYears = step => step / STEPS_PER_YEAR;

/* ---------- the light grid ---------- */
const CELL = 0.02, NX = 72, NY = 80, NZ = 72, OX = -0.72, OY = -0.12, OZ = -0.72;
const grid = new Float32Array(NX * NY * NZ);
const CLAIM = 2;
const SHADE_A = 1, SHADE_B = 1.75, SHADE_DEPTH = 6, SHADE_C = 5, SHADE_LEAF = 0.3, SHADE_BUD = 0.15, SHADE_MAX = 1.1;
const cellOf = p => [Math.floor((p[0] - OX) / CELL), Math.floor((p[1] - OY) / CELL), Math.floor((p[2] - OZ) / CELL)];
const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) ? 0 : grid[(j * NZ + k) * NX + i];

function castShade(p, w, light) {
  const [ci, cj, ck] = cellOf(p);
  const sx = -light[0] / Math.max(0.25, light[1]), sz = -light[2] / Math.max(0.25, light[1]);
  for (let q = 0; q <= SHADE_DEPTH; q++) {
    const j = cj - q;
    if (j < 0) break;
    if (j >= NY) continue;
    const amt = w * SHADE_A * Math.pow(SHADE_B, -q);
    const oi = ci + Math.round(sx * q), ok = ck + Math.round(sz * q);
    for (let k = ok - q; k <= ok + q; k++) {
      if (k < 0 || k >= NZ) continue;
      for (let i = oi - q; i <= oi + q; i++) {
        if (i < 0 || i >= NX) continue;
        grid[(j * NZ + k) * NX + i] += amt;
      }
    }
  }
}
function shadeAt(p) { const [i, j, k] = cellOf(p); return at(i, j, k); }
function awayFromShade(p) {
  const [i, j, k] = cellOf(p);
  const g = [at(i + 1, j, k) - at(i - 1, j, k), at(i, j + 1, k) - at(i, j - 1, k), at(i, j, k + 1) - at(i, j, k - 1)];
  const l = len3(g);
  return l < 1e-4 ? [0, 0, 0] : [-g[0] / l, -g[1] / l, -g[2] / l];
}

/* ---------- creating a tree ---------- */
export function createTree({ species = 'maple', seed = 1, light = [0.3, 1, 0.4], potCapacity = 1 } = {}) {
  const sp = SPECIES[species];
  const state = {
    v: 1, species, seed: seed | 0, step: 0, nextId: 0,
    nodes: [], growing: [],
    wires: [], nextWire: 1,
    env: { light: norm(light), turn: 0, feed: 1 },
    roots: { mass: potCapacity * 0.3, cap: potCapacity },
    stress: 0, leafScale: 1, pending: [],
    lastQ: 1,
  };
  const root = newNode(state, sp, null, [0, 1, 0], 0, 0.035, 0);
  root.len = root.tl;
  root.r = sp.tipRadius * 1.4;
  return state;
}

function newNode(state, sp, parent, d, k, tl, gs, isMain = true) {
  const id = state.nextId++;
  const n = {
    id, p: parent ? parent.id : -1, c: [], m: isMain,
    d, len: 0, tl, gs, r: sp.tipRadius,
    born: state.step, k,
    ap: 1, lb: makeBuds(state, sp, id, d, k),
    lf: 0, ls: 0, dead: 0, scar: 0,
    ord: parent ? parent.ord + (isMain ? 0 : 1) : 0,
    Q: 0,
  };
  state.nodes[id] = n;
  if (parent) parent.c.push(id);
  state.growing.push(id);
  return n;
}

// lateral buds at a node's tip, arranged by phyllotaxis
function makeBuds(state, sp, id, d, k) {
  const count = sp.phyllotaxis === 'opposite' ? 2 : sp.phyllotaxis === 'whorl' ? 3 : 1;
  const base = sp.phyllotaxis === 'opposite' ? k * 90 : sp.phyllotaxis === 'whorl' ? k * 60 : k * 180;
  const [u, w] = perpFrame(d);
  const beta = sp.branchAngle * Math.PI / 180;
  const buds = [];
  for (let i = 0; i < count; i++) {
    const az = (base + i * 360 / count + (rnd(state.seed, id, R.jitter, i) - 0.5) * 30) * Math.PI / 180;
    const p = add(u.map(x => x * Math.cos(az)), w, Math.sin(az));
    buds.push({ d: norm(add(d.map(x => x * Math.cos(beta)), p, Math.sin(beta))), s: 1, b: 1 });
  }
  return buds;
}

/* ---------- traversal helpers ---------- */
export function positions(state) {
  const n = state.nextId, tip = new Float32Array(n * 3), base = new Float32Array(n * 3);
  for (let id = 0; id < n; id++) {
    const nd = state.nodes[id];
    if (!nd) continue;
    let bx = 0, by = 0, bz = 0;
    if (nd.p >= 0) { bx = tip[nd.p * 3]; by = tip[nd.p * 3 + 1]; bz = tip[nd.p * 3 + 2]; }
    base[id * 3] = bx; base[id * 3 + 1] = by; base[id * 3 + 2] = bz;
    tip[id * 3] = bx + nd.d[0] * nd.len; tip[id * 3 + 1] = by + nd.d[1] * nd.len; tip[id * 3 + 2] = bz + nd.d[2] * nd.len;
  }
  return { tip, base };
}
const tipOf = (pos, id) => [pos.tip[id * 3], pos.tip[id * 3 + 1], pos.tip[id * 3 + 2]];

export function subtree(state, id) {
  const out = [], stack = [id];
  while (stack.length) {
    const n = state.nodes[stack.pop()];
    if (!n) continue;
    out.push(n);
    for (const c of n.c) stack.push(c);
  }
  return out;
}
export const mainChild = (state, n) => {
  for (const c of n.c) if (state.nodes[c]?.m) return state.nodes[c];
  return null;
};
export function chainFrom(state, id) {
  const chain = [];
  let n = state.nodes[id];
  while (n) { chain.push(n.id); n = mainChild(state, n); }
  return chain;
}

function removeSubtree(state, id) {
  const n = state.nodes[id];
  if (!n || n.p < 0) return [];
  const gone = subtree(state, id);
  const parent = state.nodes[n.p];
  parent.c = parent.c.filter(c => c !== id);
  for (const b of parent.lb) if (b.c === id) b.s = -1;     // the bud it grew from can wake again
  // losing the leader: the strongest side branch takes over the axis
  if (n.m && parent.c.length) {
    const heir = parent.c.map(c => state.nodes[c]).reduce((a, c) => (c.r > a.r ? c : a));
    heir.m = true;
  }
  for (const g of gone) state.nodes[g.id] = null;
  const goneSet = new Set(gone.map(g => g.id));
  state.growing = state.growing.filter(g => !goneSet.has(g));
  for (const w of state.wires) w.chain = w.chain.filter(c => !goneSet.has(c));
  state.wires = state.wires.filter(w => w.chain.length);
  return gone;
}

/* ---------- vigour: roots, feeding, stress ---------- */
function vigorFactor(state) {
  const { mass, cap } = state.roots;
  const bound = Math.min(1, Math.max(0, (mass - cap) / (0.5 * cap)));
  const rootF = Math.min(1, Math.max(0.4, mass / cap)) * (1 - 0.35 * bound);
  const feedF = [0.6, 1, 1.3][state.env.feed] ?? 1;
  const health = 1 - Math.min(0.6, state.stress);
  return feedF * rootF * health;
}
export function treeLight(state) {                 // light direction in the tree's own frame (the pot can be turned)
  return norm(rotate(state.env.light, UP, -state.env.turn));
}

/* ---------- a growth flush ---------- */
function flush(state, sp, strength, rootId = 0, boostOnly = false) {
  const nodes = state.nodes, light = treeLight(state), pos = positions(state);
  const frac = yearFrac(state.step);
  const summer = frac > 0.36;

  grid.fill(0);
  for (let id = 0; id < state.nextId; id++) {
    const n = nodes[id];
    if (!n) continue;
    n.w = 0;
    if (n.dead) continue;
    // shade scales with leaf area: a pair of maple leaves casts far more than a juniper spray
    const buds = n.ap === 1 || n.lb.some(b => b.s === 1);
    if (n.lf) n.w = Math.min(SHADE_MAX, SHADE_LEAF * (sp.leaf.shade ?? 1) * n.lf * (n.ls / CELL) ** 2);
    else if (buds) n.w = SHADE_BUD;
    else continue;
    castShade(tipOf(pos, id), n.w, light);
  }

  // Lateral buds on wood more than a season old are latent: they don't compete for growth unless
  // something releases them (a cut or pinch nearby sets their boost). Growth comes from the periphery.
  const awake = (n, b) => b.s === 1 && (b.b > 1 || state.step - n.born < STEPS_PER_YEAR * 1.1);

  let top = 0.05;
  for (let id = 0; id < state.nextId; id++) if (nodes[id]) top = Math.max(top, pos.tip[id * 3 + 1]);

  // basipetal: light gathered by each subtree (children always have higher ids than parents)
  const qAp = new Float32Array(state.nextId), qSub = new Float32Array(state.nextId);
  for (let id = state.nextId - 1; id >= 0; id--) {
    const n = nodes[id];
    if (!n) continue;
    if (n.dead) { qSub[id] = 0; continue; }
    let q = 0;
    if (n.w) {
      q = Math.max(0, Math.min(1, 1 - Math.max(0, shadeAt(tipOf(pos, id)) - n.w * SHADE_A) / SHADE_C));
      if (summer && sp.habit === 'deciduous' && !n.lf) q *= 0.5;     // defoliated: less to feed it
    }
    n.Q = q;
    // A bud's claim on the budget: steeply more for sunlit buds, for buds high in the crown, and
    // for buds on the main framework rather than far out on side twigs (acrotony). This is why
    // the top of a bonsai runs strong and the lower branches weaken unless you intervene.
    const claim = Math.pow(q, CLAIM) * Math.exp(sp.acrotony * pos.tip[id * 3 + 1] / top) * Math.pow(0.82, Math.min(n.ord, 6));
    n.claim = claim;
    if (n.ap === 1 && !mainChild(state, n)) qAp[id] = claim;
    let s = qAp[id];
    for (const b of n.lb) if (awake(n, b)) s += claim * 0.8 * b.b;
    for (const c of n.c) s += qSub[c];
    qSub[id] = s;
  }
  // the budget comes from all the light gathered, not the weighted claims
  let qTotal = 0;
  const inSub = rootId === 0 ? null : new Set(subtree(state, rootId).map(n => n.id));
  for (let id = 0; id < state.nextId; id++) {
    const n = nodes[id];
    if (n && !n.dead && (!inSub || inSub.has(id))) qTotal += (n.Q || 0) * ((n.ap === 1 ? 1 : 0) + n.lb.filter(b => awake(n, b)).length * 0.8);
  }
  if (rootId === 0) state.lastQ = qTotal;

  // acropetal: share the budget out from the base
  const lambda = sp.apical;
  const cap = sp.vmax * Math.sqrt(state.roots.cap) * vigorFactor(state);
  let v0 = Math.min(sp.vigor * qTotal, cap) * strength;
  if (boostOnly) v0 = Math.min(v0, cap * 0.35);
  const events = [];
  const stack = [[rootId, v0]];
  while (stack.length) {
    const [id, v] = stack.pop();
    const n = nodes[id];
    if (!n || n.dead || v <= 0) continue;
    const main = mainChild(state, n);
    const qm = main ? qSub[main.id] : qAp[id];
    const laterals = [];
    for (const c of n.c) if (!nodes[c].m) laterals.push(['child', c, qSub[c]]);
    n.lb.forEach((b, i) => { if (awake(n, b)) laterals.push(['bud', i, n.claim * 0.8 * b.b]); });
    const ql = laterals.reduce((s, l) => s + l[2], 0);
    const denom = lambda * qm + (1 - lambda) * ql;
    if (denom <= 0) continue;
    const vm = v * lambda * qm / denom;
    if (main) stack.push([main.id, vm]);
    else if (qm > 0) events.push({ n, bud: -1, v: vm });
    for (const [kind, ref, q] of laterals) {
      const vl = v * (1 - lambda) * q / denom;
      if (kind === 'child') stack.push([ref, vl]);
      else if (n.Q > 0.12) events.push({ n, bud: ref, v: vl });
    }
  }

  // a bud breaks into ⌊v + r⌋ internodes, r a fixed per-bud dice roll, so small shares still
  // sometimes break and the expected growth matches the budget
  const spring = frac < 0.32;
  for (const e of events) {
    const count = Math.floor(e.v + rnd(state.seed, e.n.id, R.bud, state.step * 4 + e.bud + 1));
    if (count >= 1) growShoot(state, sp, e.n, e.bud, e.v, count, pos, light);
    else if (spring && e.bud < 0 && !e.n.lf && e.n.Q > 0.15) {
      // a spur: the bud opens into a rosette of leaves without extending
      e.n.lf = sp.leaf.count * (sp.habit === 'deciduous' ? 2 : 1);
      e.n.lborn = state.step;
      e.n.ls = sp.leaf.size * 0.7 * state.leafScale * (0.85 + 0.3 * rnd(state.seed, e.n.id, R.leaf, state.step));
    }
  }
  for (let id = 0; id < state.nextId; id++) nodes[id]?.lb.forEach(b => { b.b = 1; });
}

function growShoot(state, sp, parent, budIndex, v, n0, pos, light) {
  const apical = budIndex < 0;
  const count = Math.min(sp.maxMetamers, n0);
  const per = Math.max(v, 1) / count;
  const l = sp.internode * Math.min(1.25, Math.max(0.45, per / 1.6));
  let dir = apical ? parent.d : parent.lb[budIndex].d;
  if (apical) parent.ap = 0;
  else { parent.lb[budIndex].s = 0; parent.lb[budIndex].c = state.nextId; }
  const leader = apical && parent.ord === 0;
  // only the leader is strongly upright; side branches grow out more than up (plagiotropism)
  const g = leader ? sp.gravi : sp.graviLateral;
  let prev = parent, p = tipOf(pos, parent.id);
  for (let k = 0; k < count; k++) {
    const id = state.nextId;
    const wob = [rnd(state.seed, id, R.wander, 0) - 0.5, rnd(state.seed, id, R.wander, 1) - 0.5, rnd(state.seed, id, R.wander, 2) - 0.5];
    const ease = k < 2 && !apical ? 0.3 : 1;
    dir = norm(add(add(add(add(dir, UP, g * ease), light, sp.photo * ease), awayFromShade(p), 0.18 * ease), wob, sp.wander));
    const tl = l * (0.8 + 0.4 * rnd(state.seed, id, R.len));
    const n = newNode(state, sp, prev, dir, (apical || k > 0) ? prev.k + 1 : 0, tl, state.step + k, apical || k > 0);
    if (k < count - 1) n.ap = 0;
    n.lf = sp.leaf.count;
    n.lborn = state.step;
    n.ls = sp.leaf.size * Math.min(1.25, Math.max(0.5, per / 1.6)) * state.leafScale * (0.85 + 0.3 * rnd(state.seed, id, R.leaf));
    if (prev !== parent) prev.ap = 0;
    p = add(p, dir, tl);
    prev = n;
  }
}

/* ---------- one step of time (a week, near enough) ---------- */
export function stepTree(state) {
  const sp = SPECIES[state.species];
  const nodes = state.nodes;
  const f0 = yearFrac(state.step), f1 = yearFrac(state.step + 1);
  const crossed = t => (f0 <= f1 ? f0 <= t && t < f1 : f0 <= t || t < f1);
  const prelude = state.step < START_STEP;

  if (sp.nurseryChop && state.step === Math.round(STEPS_PER_YEAR * 1.75)) nurseryChop(state, sp);
  for (const fl of sp.flushes) if (crossed(fl.at)) flush(state, sp, fl.strength * (prelude ? 1.3 : 1));
  const due = state.pending.filter(p => p.at <= state.step);
  if (due.length) {
    state.pending = state.pending.filter(p => p.at > state.step);
    for (const p of due) if (nodes[p.root]) flush(state, sp, p.strength, p.root, true);
  }

  // elongation
  const still = [];
  for (const id of state.growing) {
    const n = nodes[id];
    if (!n) continue;
    const t = Math.min(1, Math.max(0, (state.step + 1 - n.gs) / ELONGATION));
    n.len = n.tl * t * t * (3 - 2 * t);
    if (t < 1) still.push(id);
  }
  state.growing = still;

  // thickening, roots and wire through the growing season
  if (f0 >= GROW_FROM && f0 < GROW_TO) {
    const p = sp.pipe, target = new Float32Array(state.nextId);
    for (let id = state.nextId - 1; id >= 0; id--) {
      const n = nodes[id];
      if (!n) continue;
      if (n.dead) { target[id] = 0; continue; }
      let s = (n.lf || n.ap === 1) ? Math.pow(sp.tipRadius, p) : 0;
      for (const c of n.c) if (!nodes[c].dead) s += Math.pow(target[c], p);
      target[id] = Math.pow(s, 1 / p);
      const age = (state.step - n.born) / STEPS_PER_YEAR;
      const goal = target[id] * (1 + 0.035 * Math.min(40, age));
      if (goal > n.r) n.r += (goal - n.r) * 0.045;
    }
    const rt = state.roots;
    rt.mass += 0.3 * (rt.cap * 1.6 - rt.mass) / GROW_STEPS;
    for (const w of state.wires) {
      w.set = Math.min(1, w.set + sp.wireSet / GROW_STEPS);
      w.chain.forEach((id, i) => {
        const n = nodes[id];
        if (n && n.r > w.r0[i] + w.gauge * 0.45) n.scar = Math.min(1, n.scar + sp.wireBite / GROW_STEPS);
      });
    }
  }

  // leaves: deciduous drop in autumn; evergreen foliage ages out
  if (sp.habit === 'deciduous') {
    const [d0, d1] = sp.colors.drop;
    for (let id = 0; id < state.nextId; id++) {
      const n = nodes[id];
      if (!n || !n.lf) continue;
      const t = d0 + (d1 - d0) * rnd(state.seed, id, R.drop);
      if (crossed(t)) n.lf = 0;
    }
  }

  if (crossed(0.94)) yearEnd(state, sp);
  state.step++;
}

// the grower cuts the young trunk back in its first winter, so the starter branches low
function nurseryChop(state, sp) {
  const pos = positions(state);
  for (const id of chainFrom(state, 0)) {
    if (pos.tip[id * 3 + 1] > sp.nurseryChop) {
      const n = state.nodes[id];
      applyOp(state, { t: 'cut', id: mainChild(state, n)?.id ?? id });
      break;
    }
  }
  state.stress = 0;
}

function yearEnd(state, sp) {
  const nodes = state.nodes;
  for (let id = 0; id < state.nextId; id++) {
    const n = nodes[id];
    if (!n) continue;
    const age = (state.step - n.born) / STEPS_PER_YEAR;
    if (age > sp.budAge) n.lb.forEach(b => { if (b.s === 1) b.s = -1; });
    if (sp.foliageYears && n.lf && age > sp.foliageYears) n.lf = 0;
  }
  // shed side branches whose leaves and buds sit in deep shade, or that have none left at all
  const count = new Float32Array(state.nextId), q = new Float32Array(state.nextId);
  for (let id = state.nextId - 1; id >= 0; id--) {
    const n = nodes[id];
    if (!n) continue;
    const alive = n.lf || n.ap === 1 || n.lb.some(b => b.s === 1);
    if (alive) { count[id] += 1; q[id] += n.Q || 0; }
    if (n.p >= 0) { count[n.p] += count[id]; q[n.p] += q[id]; }
  }
  const wired = new Set(state.wires.flatMap(w => w.chain));
  for (let id = 1; id < state.nextId; id++) {
    const n = nodes[id];
    if (!n || n.m || n.dead || wired.has(id)) continue;
    if (state.step - n.born < STEPS_PER_YEAR) continue;
    if (!count[id] || q[id] / count[id] < sp.shed) removeSubtree(state, id);
  }
  // dieback: bare wood with no buds, leaves or growth beyond it dies back to the last live bud
  for (let id = state.nextId - 1; id > 0; id--) {
    const n = nodes[id];
    if (!n || n.dead || wired.has(id) || n.c.some(c => nodes[c])) continue;
    if (n.lf || n.ap === 1 || n.lb.some(b => b.s === 1)) continue;
    removeSubtree(state, id);
  }
  state.stress *= 0.45;
  state.leafScale = Math.min(1, state.leafScale + 0.12);
}

/* ---------- interventions ---------- */
function respond(state, sp, rootId, strength) {
  const f = yearFrac(state.step);
  if (f > GROW_FROM && f < 0.62) state.pending.push({ at: state.step + 3, root: rootId, strength });
}
function ancestor(state, id, up) {
  let n = state.nodes[id];
  for (let i = 0; i < up && n && n.p >= 0; i++) n = state.nodes[n.p];
  return n ? n.id : 0;
}
function leafCount(nodes) { return nodes.reduce((s, n) => s + (n.lf || 0), 0); }

export function applyOp(state, op) {
  const sp = SPECIES[state.species];
  const nodes = state.nodes;
  const n = op.id != null ? nodes[op.id] : null;
  switch (op.t) {
    case 'cut': {
      if (!n || n.p < 0) return false;
      const total = leafCount(nodes.filter(Boolean));
      const parentId = n.p;
      const gone = removeSubtree(state, op.id);
      if (total) state.stress += 0.6 * leafCount(gone) / total;
      // wake buds on the wood below the cut
      let a = nodes[parentId];
      for (let i = 0; i < 4 && a; i++) {
        const age = (state.step - a.born) / STEPS_PER_YEAR;
        const chance = sp.backBud * (age > sp.budAge ? 0.5 : 1);
        a.lb.forEach((b, j) => {
          if (b.s === -1 && rnd(state.seed, a.id, R.back, state.step * 8 + j) < chance) b.s = 1;
          if (b.s === 1) b.b = 2;
        });
        if (!a.lb.some(b => b.s === 1) && rnd(state.seed, a.id, R.back, state.step * 8 + 7) < chance * 0.6) {
          a.lb.push(...makeBuds(state, sp, a.id + state.step * 131, a.d, a.k + 1).slice(0, 1).map(b => ({ ...b, b: 2 })));
        }
        a = a.p >= 0 ? nodes[a.p] : null;
      }
      respond(state, sp, ancestor(state, parentId, 3), 0.55);
      return true;
    }
    case 'pinch': {
      if (!n) return false;
      const chain = chainFrom(state, op.id);
      const tip = nodes[chain.at(-1)];
      const shoot = [tip];
      let a = tip;
      while (a.p >= 0 && nodes[a.p].born === tip.born && a.m) { a = nodes[a.p]; shoot.unshift(a); }
      const keep = Math.min(2, shoot.length - 1);
      if (shoot.length > 1 && keep < shoot.length) {
        const cut = shoot[keep];
        if (cut.p >= 0) removeSubtree(state, cut.id);
      }
      const end = nodes[shoot[Math.max(0, keep - 1)].id] || tip;
      end.ap = -1;
      for (const s of shoot.slice(0, keep)) s.lb.forEach(b => { if (b.s === 1) b.b = 2.2; });
      respond(state, sp, ancestor(state, end.id, 2), 0.45);
      return true;
    }
    case 'defoliate': {
      if (!sp.defoliate) return false;
      const target = n ? subtree(state, op.id) : nodes.filter(Boolean);
      const total = leafCount(nodes.filter(Boolean));
      const removed = leafCount(target);
      if (!removed) return false;
      for (const t of target) { t.lf = 0; t.lb.forEach(b => { if (b.s === 1) b.b = 1.6; }); }
      state.stress += 0.25 * removed / Math.max(1, total);
      state.leafScale = Math.max(0.55, state.leafScale * 0.78);
      respond(state, sp, n ? ancestor(state, op.id, 1) : 0, 0.6);
      return true;
    }
    case 'jin': {
      if (!n || n.p < 0) return false;
      for (const t of subtree(state, op.id)) {
        t.dead = 1; t.lf = 0; t.ap = -1;
        t.lb.forEach(b => { b.s = -1; });
      }
      state.growing = state.growing.filter(id => !nodes[id]?.dead);
      state.stress += 0.05;
      return true;
    }
    case 'wire': {
      if (!n) return false;
      const chain = op.chain ? op.chain.filter(id => nodes[id]) : chainFrom(state, op.id).slice(0, op.length || 24);
      if (!chain.length) return false;
      const axis = norm(op.axis), step = op.angle / chain.length;
      for (const id of chain) for (const t of subtree(state, id)) bendNode(t, axis, step);
      state.wires.push({
        id: state.nextWire++, kind: op.kind || 'wire', chain, axis, angle: op.angle,
        gauge: op.gauge || 0.0016, anchor: op.anchor || null, on: state.step, set: 0,
        r0: chain.map(id => nodes[id].r),
      });
      return true;
    }
    case 'unwire': {
      const w = state.wires.find(x => x.id === op.wire);
      if (!w) return false;
      const back = -w.angle * (1 - w.set) / w.chain.length;
      for (const id of w.chain) for (const t of subtree(state, id)) bendNode(t, w.axis, back);
      state.wires = state.wires.filter(x => x !== w);
      return true;
    }
    case 'feed': state.env.feed = op.level; return true;
    case 'turn': state.env.turn += op.angle; return true;
    case 'place': state.env.light = norm(op.light); if (op.setting) state.env.setting = op.setting; return true;
    case 'repot': {
      const rt = state.roots;
      if (op.cap) rt.cap = op.cap;
      if (op.pot) state.env.pot = op.pot;
      rt.mass = Math.min(rt.mass, rt.cap) * (1 - (op.prune || 0));
      state.stress += (op.prune || 0) * 0.5;
      return true;
    }
  }
  return false;
}
function bendNode(n, axis, angle) {
  n.d = norm(rotate(n.d, axis, angle));
  for (const b of n.lb) b.d = norm(rotate(b.d, axis, angle));
}

/* ---------- summaries for the inspector ---------- */
export function treeStats(state) {
  let count = 0, leaves = 0, height = 0;
  const pos = positions(state);
  for (let id = 0; id < state.nextId; id++) {
    const n = state.nodes[id];
    if (!n) continue;
    count++; leaves += n.lf || 0;
    height = Math.max(height, pos.tip[id * 3 + 1]);
  }
  const root = state.nodes[0];
  return {
    internodes: count, leaves, height,
    trunk: root ? root.r * 2 : 0,
    vigor: vigorFactor(state),
    rootBound: Math.max(0, Math.min(1, (state.roots.mass - state.roots.cap) / (0.5 * state.roots.cap))),
    stress: state.stress,
  };
}
