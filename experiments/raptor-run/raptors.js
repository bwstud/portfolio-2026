/* Raptor Run: the koi pond's overhead camera on a forest floor. One person at a time sprints
   across from a random edge with a velociraptor close behind, timed to catch them just off
   screen.

   Built the way the koi are: every creature is a painting (paint.js), laid on a mesh that bends
   along a moving spine, lit and shadowed by the renderer (gl.js). The chase itself (paths,
   speeds, the catch off screen, the gait) is the same as the first version. */

import * as P from './paint.js';
import * as C from './creatures.js';
import { createRenderer, FLOATS } from './gl.js';
import { createSculptor } from './sculpt.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
const R = (a, b) => a + (b - a) * Math.random();
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (p) => Math.random() < p;

const canvas = document.getElementById('stage');
const gfx = createRenderer(canvas);
const sculptor = gfx && createSculptor(gfx.gl);
const bake = (spec) => ({ gl: sculptor.bake(spec), len: spec.len, half: spec.half, centre: spec.centre });

let W = 0, H = 0, DPR = 1, K = 1; // K scales the world on small screens
const SEED = (Math.random() * 1e9) | 0;
const TITLE = 'Raptor\nRun';

function resize() {
  W = innerWidth; H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, 2);
  // the creatures are big in the frame, as the koi are; smaller screens scale everything down
  K = (W < 760 ? clamp(W / 760, 0.55, 1) : 1) * 1.55;
  gfx.resize(W, H, DPR, P.paintGround(W, H, Math.min(DPR, 1.5), SEED, TITLE));
}

/* ---------- paths ---------- */
class Path {
  constructor(points) {
    this.p = points;
    this.s = [0];
    for (let i = 1; i < points.length; i++) this.s.push(this.s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    this.L = this.s[this.s.length - 1];
    const a = points[0], b = points[1], y = points[points.length - 2], z = points[points.length - 1];
    this.a0 = Math.atan2(b.y - a.y, b.x - a.x);
    this.a1 = Math.atan2(z.y - y.y, z.x - y.x);
  }
  at(s) {
    const p = this.p;
    if (s <= 0) return { x: p[0].x + Math.cos(this.a0) * s, y: p[0].y + Math.sin(this.a0) * s };
    if (s >= this.L) { const z = p[p.length - 1], e = s - this.L; return { x: z.x + Math.cos(this.a1) * e, y: z.y + Math.sin(this.a1) * e }; }
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const t = (s - this.s[lo]) / (this.s[hi] - this.s[lo] || 1);
    return { x: lerp(p[lo].x, p[hi].x, t), y: lerp(p[lo].y, p[hi].y, t) };
  }
  angle(s) { const a = this.at(s - 6), b = this.at(s + 6); return Math.atan2(b.y - a.y, b.x - a.x); }
}

function centripetal(p0, p1, p2, p3, u) {
  const d = (a, b) => Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const t = lerp(t1, t2, u);
  const m = (a, b, ta, tb) => { const k = (t - ta) / (tb - ta); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; };
  const A1 = m(p0, p1, t0, t1), A2 = m(p1, p2, t1, t2), A3 = m(p2, p3, t2, t3);
  return m(m(A1, A2, t0, t2), m(A2, A3, t1, t3), t1, t2);
}
const edgePoint = (e, u) => (e === 0 ? { x: u * W, y: 0 } : e === 1 ? { x: W, y: u * H } : e === 2 ? { x: u * W, y: H } : { x: 0, y: u * H });

function makePath() {
  const entry = edgePoint(Math.floor(Math.random() * 4), R(0.1, 0.9));
  const aim = { x: W * R(0.3, 0.7), y: H * R(0.3, 0.7) };
  const ang = Math.atan2(aim.y - entry.y, aim.x - entry.x) + R(-0.45, 0.45);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const tx = dx > 0 ? (W - entry.x) / dx : dx < 0 ? -entry.x / dx : Infinity;
  const ty = dy > 0 ? (H - entry.y) / dy : dy < 0 ? -entry.y / dy : Infinity;
  const tHit = Math.min(...[tx, ty].filter((v) => v > 1));
  const exit = { x: entry.x + dx * tHit, y: entry.y + dy * tHit };
  const len = Math.hypot(exit.x - entry.x, exit.y - entry.y);
  const ctrl = [{ x: entry.x - dx * 600 * K, y: entry.y - dy * 600 * K }, entry];
  const wps = chance(0.55) ? 2 : 1;
  for (let j = 1; j <= wps; j++) {
    const t = j / (wps + 1), off = R(-1, 1) * len * 0.17;
    ctrl.push({ x: clamp(lerp(entry.x, exit.x, t) - dy * off, W * 0.12, W * 0.88), y: clamp(lerp(entry.y, exit.y, t) + dx * off, H * 0.12, H * 0.88) });
  }
  ctrl.push(exit);
  const last = ctrl[ctrl.length - 2];
  const ox = exit.x - last.x, oy = exit.y - last.y, ol = Math.hypot(ox, oy) || 1;
  ctrl.push({ x: exit.x + (ox / ol) * 600 * K, y: exit.y + (oy / ol) * 600 * K });
  const ext = [{ x: 2 * ctrl[0].x - ctrl[1].x, y: 2 * ctrl[0].y - ctrl[1].y }, ...ctrl, { x: 2 * ctrl[ctrl.length - 1].x - ctrl[ctrl.length - 2].x, y: 2 * ctrl[ctrl.length - 1].y - ctrl[ctrl.length - 2].y }];
  const pts = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const n = Math.max(2, Math.ceil(Math.hypot(ext[i + 1].x - ext[i].x, ext[i + 1].y - ext[i].y) / 4));
    for (let j = 0; j < n; j++) pts.push(centripetal(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], j / n));
  }
  pts.push(ctrl[ctrl.length - 1]);
  return new Path(pts);
}

function onScreenSpan(path, pad) {
  const inside = (p) => p.x > -pad && p.x < W + pad && p.y > -pad && p.y < H + pad;
  let first = null, last = null;
  for (let i = 0; i < path.p.length; i++) if (inside(path.p[i])) { if (first === null) first = path.s[i]; last = path.s[i]; }
  return { first: first ?? 0, last: last ?? path.L };
}

// One gait cycle u in [0, 1). Each foot is planted for `duty` of the cycle, sliding back under the
// body at exactly the body's speed, and swings forward, lifted, for the rest.
function foot(u, reach, duty) {
  if (u < duty) return { f: reach * (1 - (2 * u) / duty), lift: 0 };
  const v = (u - duty) / (1 - duty);
  return { f: -reach + 2 * reach * smooth(v), lift: Math.sin(Math.PI * v) };
}

/* ---------- casting ---------- */
const BRIGHT = ['#e0603e', '#2ba3a0', '#f2b134', '#e94f7a', '#7c5cc4', '#3f8fd9', '#9bd14a'];
const DRESS = ['#e8a9c0', '#f2d06b', '#7fc4c9', '#d85c4a', '#f4f1ea', '#8fb36b'];
const ROLES = [
  () => ({ name: 'a park ranger', top: '#8a8455', sleeves: 'short', legs: '#5c5638', shoes: '#3a2a1c', hat: 'safari', hatCol: '#c2ad7a' }),
  () => ({ name: 'a scientist in a lab coat', top: '#7d9cc4', sleeves: 'long', coat: '#efeee8', legs: '#3a3d48', shoes: '#222222' }),
  () => ({ name: 'a tourist in a loud shirt', top: pick(BRIGHT), pattern: true, sleeves: 'short', legs: '#d9c7a0', shorts: true, shoes: '#f2f2f2', backpack: '#2f5d8a', straps: '#1f3d5a', hat: chance(0.5) ? 'cap' : null, hatCol: pick(['#d23c3c', '#f4f4f4', '#2a5ca8']) }),
  () => ({ name: 'a jogger', top: pick(BRIGHT), sleeves: 'none', legs: '#1d1d22', shorts: true, shoes: '#f2f2f2' }),
  () => ({ name: 'a construction worker', top: '#4a5a7a', vest: '#d4ee2c', sleeves: 'short', legs: '#3c4a63', shoes: '#5a3a1a', hat: 'hard', hatCol: '#f2c21b' }),
  () => ({ name: 'someone in a suit', top: pick(['#2a2e38', '#3b3f4a', '#4a3f35']), sleeves: 'long', legs: '#2a2e38', shoes: '#111111', briefcase: '#5a3a22' }),
  () => { const d = pick(DRESS); return { name: 'someone in a summer dress', top: d, dress: d, sleeves: 'none', legs: null, shoes: pick(['#c9a57a', '#f2f2f2', '#b34040']), hat: chance(0.4) ? 'sun' : null, hatCol: '#dcc48a' }; },
  () => ({ name: 'a hiker', top: pick(['#c4672f', '#3d7a8a', '#8a3d3d']), sleeves: 'long', legs: '#6c6a5e', shoes: '#4a3a2a', backpack: '#3d5a3a', straps: '#2a3d28', bigPack: true, hat: chance(0.5) ? 'sun' : null, hatCol: '#b8a070' }),
  () => ({ name: 'a security guard', top: '#2c3e66', sleeves: 'short', legs: '#1f2a44', shoes: '#111111', hat: 'cap', hatCol: '#15171c' }),
  () => ({ name: 'a chef', top: '#f4f2ee', sleeves: 'long', legs: '#2b2b2b', shoes: '#111111', hat: 'toque', hatCol: '#fbfbf8' }),
  () => ({ name: 'someone in a yellow raincoat', top: '#f0c419', coat: '#f0c419', sleeves: 'long', legs: '#3a4660', shoes: '#2a2a2a', hat: 'hood', hatCol: '#e6b812' }),
  () => { const c = pick(['#6a4c93', '#3a3a3a', '#b23a48', '#3f6e4a']); return { name: 'someone in a hoodie', top: c, sleeves: 'long', legs: '#3b4f7a', shoes: '#eeeeee', hat: chance(0.5) ? 'hood' : null, hatCol: c }; },
];
const BUILDS = [
  { w: [32, 37], speed: 1.06 }, { w: [37, 42], speed: 1 }, { w: [42, 48], speed: 0.97 }, { w: [40, 46], speed: 0.9 },
];

function makePerson() {
  const role = pick(ROLES)();
  const build = pick(BUILDS);
  const height = R(0.88, 1.12);
  const Wp = R(...build.w) * 1.05;
  const hairStyle = role.hat === 'hood' || role.hat === 'toque' || role.hat === 'hard' ? 'short' : pick(['short', 'short', 'long', 'ponytail', 'bun', 'curly', 'bald']);
  const p = {
    ...role, height, W: Wp, hairStyle,
    skin: pick(C.SKIN_TONES), hair: pick(C.HAIR_TONES), pattern2: pick(['#f6efe2', '#1f6f5a', '#f2b134', '#2a2a2a']),
    speedMul: build.speed * R(0.94, 1.08),
    reach: Wp * 0.58 * height, duty: 0.36,
    u: Math.random(), look: 0, lookTarget: 0, lookTimer: R(0.6, 1.4), flail: R(0.6, 1.2), time: 0,
  };
  if (ART.people.length) {
    const art = pick(ART.people);
    p.art = art; p.name = art.name; p.tex = {};
    return p;
  }
  const parts = C.personParts(p, Math.random() * 100);
  p.tex = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, bake(v)]));
  return p;
}

/* ---------- painted art ----------
   When art/manifest.json lists painted cut-outs (made by tools/raptor-art.py from generated
   paintings), they replace the sculpted creatures: each raptor painting bends along the spine as
   the koi do, and each runner flips to its own mirror image at every stride, so arms and legs
   swap. Anything missing falls back to the sculpted versions. */
const ART = { raptors: [], people: [] };
let flatN = null, flatM = null;
function loadImage(src) {
  return new Promise((ok, fail) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = fail; im.src = src; });
}
async function loadArt() {
  let m;
  try { const r = await fetch('art/manifest.json', { cache: 'no-cache' }); if (!r.ok) return; m = await r.json(); } catch { return; }
  const one = (w, h, rgba) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = rgba; g.fillRect(0, 0, w, h); return gfx.texture(cv, false); };
  flatN = one(1, 1, 'rgba(128,128,255,0.25)');
  flatM = one(1, 1, 'rgb(255,60,0)');
  const load = async (e) => { try { const im = await loadImage('art/' + e.file); return { ...e, tex: { a: gfx.texture(im), n: flatN, m: flatM } }; } catch { return null; } };
  ART.raptors = (await Promise.all((m.raptors || []).map(load))).filter(Boolean);
  ART.people = (await Promise.all((m.people || []).map(load))).filter(Boolean);
}

// raptors: each coat is painted once, on first use, and kept
const COAT_CACHE = new Map();
function coatTextures(coat) {
  if (!COAT_CACHE.has(coat.name)) {
    const seed = [...coat.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const sd = (seed % 1000) / 10;
    COAT_CACHE.set(coat.name, {
      body: bake(C.raptorBody(coat, sd)),
      arm: bake(C.raptorArm(coat, sd + 1)), thigh: bake(C.raptorThigh(coat, sd + 2)), shin: bake(C.raptorShin(coat, sd + 3)), foot: bake(C.raptorFoot(coat, sd + 4)),
    });
  }
  return COAT_CACHE.get(coat.name);
}

const LENGTH = C.LENGTH, STEP = 5, NODES = LENGTH / STEP + 1;
const HIP = 140, SHOULDER = 94;
function makeRaptor() {
  if (ART.raptors.length) {
    const art = pick(ART.raptors);
    return {
      coat: { name: art.name }, art, tex: null,
      reach: 44, duty: 0.4, u: Math.random(), tail: Math.random() * TAU, flap: Math.random() * TAU, jaw: 0,
      nodes: Array.from({ length: NODES }, () => ({ x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 })),
    };
  }
  const coat = pick(C.COATS);
  return {
    coat, tex: coatTextures(coat),
    reach: 44, duty: 0.4, u: Math.random(), tail: Math.random() * TAU, flap: Math.random() * TAU, jaw: 0,
    nodes: Array.from({ length: NODES }, () => ({ x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 })),
  };
}

/* ---------- the chase ---------- */
const state = { chase: null, wait: 0.8, paused: false, slow: false, count: 0, prints: [], dust: [], time: 0 };

function startChase() {
  const path = makePath();
  const span = onScreenSpan(path, 90 * K);
  const person = makePerson();
  const raptor = makeRaptor();
  const vp = 340 * K * person.speedMul;
  let vr = vp * R(1.13, 1.22);
  const sP0 = span.first - 4;
  const sCatch = span.last + vp * R(0.35, 0.7);
  const T = (sCatch - sP0) / vp;
  const minGap = 150 * K;
  if ((vr - vp) * T < minGap) vr = vp + minGap / T;
  state.chase = { path, span, person, raptor, vp, vr, t: 0, T, sP: sP0, sR: sCatch - vr * T, personGone: false };
  state.count++;
  setStatus();
}

function endChase() {
  const c = state.chase;
  if (c && !c.person.art) for (const t of Object.values(c.person.tex)) sculptor.free(t.gl);
  state.chase = null;
}

function update(dt) {
  state.time += dt;
  for (const p of state.prints) p.age += dt;
  state.prints = state.prints.filter((p) => p.age < 10);
  for (const d of state.dust) { d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 1 - 2.5 * dt; d.vy *= 1 - 2.5 * dt; d.r += 16 * K * dt; }
  state.dust = state.dust.filter((d) => d.age < d.life);

  const c = state.chase;
  if (!c) { state.wait -= dt; if (state.wait <= 0) startChase(); return; }
  c.t += dt; c.sP += c.vp * dt; c.sR += c.vr * dt;

  const p = c.person;
  p.u = (p.u + dt / ((2 * p.reach * K * p.height * 1.2) / (c.vp * p.duty))) % 1;
  p.time += dt;
  const gap = c.sP - c.sR;
  p.lookTimer -= dt;
  if (p.lookTimer <= 0) {
    if (p.lookTarget === 0 && gap < 560 * K && chance(0.7)) { p.lookTarget = (chance(0.5) ? 1 : -1) * R(1.3, 1.9); p.lookTimer = R(0.25, 0.45); }
    else { p.lookTarget = 0; p.lookTimer = R(0.7, 1.5); }
  }
  p.look += (p.lookTarget - p.look) * Math.min(1, dt * 12);

  const r = c.raptor;
  const rT = (2 * r.reach * K) / (c.vr * r.duty);
  const prevU = r.u;
  r.u = (r.u + dt / rT) % 1;
  r.tail += (dt * TAU) / rT;
  r.flap += dt * 5.2;
  r.jaw += ((gap < 400 * K ? 1 : 0) - r.jaw) * Math.min(1, dt * 4);
  layoutRaptor(c);
  for (const side of [1, -1]) {
    const off = side === 1 ? 0 : 0.5;
    if ((r.u + off) % 1 < (prevU + off) % 1) landFoot(c, side);
  }
  if (!c.personGone && c.sP - (p.reach + p.W) * K > c.span.last) c.personGone = true;
  if (c.sR - LENGTH * K > c.span.last + 40 * K) { endChase(); state.wait = R(1.2, 4.5); setStatus(); }
}

function layoutRaptor(c) {
  const r = c.raptor, path = c.path;
  for (let i = 0; i < NODES; i++) {
    const d = i * STEP, s = c.sR - d * K;
    const p = path.at(s), a = path.angle(s);
    const nx = -Math.sin(a), ny = Math.cos(a);
    const tailW = Math.pow(Math.max(0, (d - 150) / 150), 1.6);
    const torso = d > 60 && d < 210 ? Math.sin(((d - 60) / 150) * Math.PI) : 0;
    const neck = d < 70 ? Math.sin((d / 70) * Math.PI) : 0;
    const off = (Math.sin(r.tail - d * 0.015) * 4.5 * tailW + Math.sin(r.tail * 2) * 1.1 * torso + Math.sin(r.tail * 2 + 1.2) * 0.7 * neck) * K;
    const n = r.nodes[i];
    n.x = p.x + nx * off; n.y = p.y + ny * off;
  }
  for (let i = 0; i < NODES; i++) {
    const a = r.nodes[Math.max(0, i - 1)], b = r.nodes[Math.min(NODES - 1, i + 1)];
    let tx = a.x - b.x, ty = a.y - b.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const n = r.nodes[i];
    n.tx = tx; n.ty = ty; n.nx = -ty; n.ny = tx;
  }
}
function nodeAt(r, d) {
  const f = d / STEP, i = Math.min(NODES - 2, Math.floor(f)), t = f - i;
  const a = r.nodes[i], b = r.nodes[i + 1];
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t), nx: lerp(a.nx, b.nx, t), ny: lerp(a.ny, b.ny, t) };
}
function footPose(c, side) {
  const r = c.raptor;
  const u = (r.u + (side === 1 ? 0 : 0.5)) % 1;
  const { f, lift } = foot(u, r.reach * K, r.duty);
  const h = nodeAt(r, HIP);
  const lat = (C.halfWidth(HIP) * 0.62) * K;
  return { x: h.x + h.tx * f + h.nx * side * lat, y: h.y + h.ty * f + h.ny * side * lat, ang: Math.atan2(h.ty, h.tx), lift, f, h };
}
function landFoot(c, side) {
  const fp = footPose(c, side);
  state.prints.push({ x: fp.x, y: fp.y, ang: fp.ang + side * 0.1, side, age: 0 });
  for (let i = 0; i < 6; i++) {
    const a = fp.ang + Math.PI + R(-0.9, 0.9), sp = R(30, 100) * K;
    state.dust.push({ x: fp.x, y: fp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: R(4, 8) * K, age: 0, life: R(0.5, 1.0) });
  }
}

/* ---------- geometry ---------- */
// One buffer per item. A part is a strip of quads from its joint along +u; `ang` turns it, `mirror`
// flips which side its +v faces, `stretch` foreshortens it along its length.
const pool = [];
let poolUsed = 0;
function item(tex, n, gloss, bump) {
  let it = pool[poolUsed];
  if (!it) { it = { verts: new Float32Array(FLOATS * 6 * 64) }; pool[poolUsed] = it; }
  poolUsed++;
  if (it.verts.length < n * FLOATS) it.verts = new Float32Array(n * FLOATS * 2);
  it.tex = tex; it.count = 0; it.gloss = gloss; it.bump = bump; it.shadowOnly = false; it.baked = false;
  return it;
}
function vert(it, x, y, u, v, Ux, Uy, Vx, Vy, round, z, a) {
  const o = it.count * FLOATS, d = it.verts;
  d[o] = x; d[o + 1] = y; d[o + 2] = u; d[o + 3] = v; d[o + 4] = Ux; d[o + 5] = Uy; d[o + 6] = Vx; d[o + 7] = Vy; d[o + 8] = round; d[o + 9] = z; d[o + 10] = a;
  it.count++;
}
function placePart(items, t, x, y, ang, { mirror = 1, stretch = 1, scale = 1, z = 0, z1 = null, alpha = 1, round = 0.8, gloss = 0.1, bump = 3, back = 0 } = {}) {
  round = 0;
  const it = item(t.gl, 6 * 4, gloss, bump);
  const Ux = Math.cos(ang), Uy = Math.sin(ang), Vx = -Uy * mirror, Vy = Ux * mirror;
  const L = t.len * K * scale * stretch, Hh = t.half * K * scale;
  const ox = x - Ux * back * L, oy = y - Uy * back * L;
  const cols = 4;
  for (let i = 0; i < cols; i++) {
    const u0 = i / cols, u1 = (i + 1) / cols;
    const za = lerp(z, z1 ?? z, u0), zb = lerp(z, z1 ?? z, u1);
    const P0 = [ox + Ux * L * u0 - Vx * Hh, oy + Uy * L * u0 - Vy * Hh, u0, 0, za, -round];
    const P1 = [ox + Ux * L * u1 - Vx * Hh, oy + Uy * L * u1 - Vy * Hh, u1, 0, zb, -round];
    const P2 = [ox + Ux * L * u1 + Vx * Hh, oy + Uy * L * u1 + Vy * Hh, u1, 1, zb, round];
    const P3 = [ox + Ux * L * u0 + Vx * Hh, oy + Uy * L * u0 + Vy * Hh, u0, 1, za, round];
    for (const q of [P0, P1, P2, P0, P2, P3]) vert(it, q[0], q[1], q[2], q[3], Ux, Uy, Vx, Vy, q[5], q[4], alpha);
  }
  items.push(it);
}

let colTex = null;
function column(items, x, y, ang, w, z0, z1) {
  const it = item(colTex, 6, 0, 0);
  it.shadowOnly = true;
  const Vx = -Math.sin(ang) * w, Vy = Math.cos(ang) * w;
  const P0 = [x - Vx, y - Vy, 0, 0, z0], P1 = [x - Vx, y - Vy, 1, 0, z1], P2 = [x + Vx, y + Vy, 1, 1, z1], P3 = [x + Vx, y + Vy, 0, 1, z0];
  for (const q of [P0, P1, P2, P0, P2, P3]) vert(it, q[0], q[1], q[2], q[3], 1, 0, 0, 1, 0, q[4], 1);
  items.push(it);
}

// a limb that only casts a shadow: from (x0, y0) at height z0 to (x1, y1) at z1
function strut(items, x0, y0, z0, x1, y1, z1, w) {
  const it = item(colTex, 6, 0, 0);
  it.shadowOnly = true;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const Vx = -Math.sin(ang) * w, Vy = Math.cos(ang) * w;
  const P0 = [x0 - Vx, y0 - Vy, 0, 0, z0], P1 = [x1 - Vx, y1 - Vy, 1, 0, z1], P2 = [x1 + Vx, y1 + Vy, 1, 1, z1], P3 = [x0 + Vx, y0 + Vy, 0, 1, z0];
  for (const q of [P0, P1, P2, P0, P2, P3]) vert(it, q[0], q[1], q[2], q[3], 1, 0, 0, 1, 0, q[4], 1);
  items.push(it);
}

const ROWS = 12;
function bodyMesh(items, c) {
  const r = c.raptor;
  const art = r.art;
  const it = item(art ? art.tex : r.tex.body.gl, (NODES - 1) * 24 * 6, 0, 0);
  it.baked = !!art;
  // a painting's own proportions set how wide it is; it rolls a little with each stride
  const BH = art ? (LENGTH * art.h) / art.w / 2 : C.BODY_EXTENT;
  const roll = art ? 1 + Math.sin(r.u * TAU * 2) * 0.025 : 1;
  const rows = art ? 24 : ROWS;
  const pos = [];
  for (let i = 0; i < NODES; i++) {
    const d = i * STEP, n = r.nodes[i];
    const row = [];
    const z = (d < 50 ? lerp(82, 78, d / 50) : d < 190 ? 76 : lerp(76, 44, (d - 190) / 110)) * K;
    // a painting is laid so its traced backbone runs along the path, wherever it sits in the image
    const si = Math.min((art?.spine?.length ?? 1) - 1, Math.round((d / LENGTH) * ((art?.spine?.length ?? 1) - 1)));
    const sp = art?.spine ? art.spine[si] : 0.5;
    const trunk = art?.trunk ? art.trunk[si] : 1;
    // what hangs past the trunk in the painting (a leg, an arm) swings fore and aft with the
    // stride: the hind leg in time with the gait, the arm at a quicker, smaller pump
    const hind = sstep(96, 120, d) * sstep(196, 170, d), front = sstep(44, 62, d) * sstep(104, 90, d);
    const swing = (Math.sin(r.u * TAU) * 13 * hind + Math.sin(r.u * TAU * 2 + 1) * 4 * front) * K;
    for (let j = 0; j <= rows; j++) {
      const o = j / rows - sp;
      const limb = art ? sstep(0, 0.16, Math.abs(o) - trunk) : 0;
      const v = art ? o * BH * 2 : -BH + (j / ROWS) * BH * 2;
      // a painting has the head to the right, so u runs backwards across it
      row.push([n.x + n.nx * v * K * roll + n.tx * swing * limb, n.y + n.ny * v * K * roll + n.ty * swing * limb, art ? 1 - d / LENGTH : d / LENGTH, j / rows, 0, z]);
    }
    pos.push({ row, Ux: -n.tx, Uy: -n.ty, Vx: n.nx, Vy: n.ny });
  }
  for (let i = 0; i < NODES - 1; i++) {
    const A = pos[i], B = pos[i + 1];
    for (let j = 0; j < rows; j++) {
      for (const [col, k] of [[A, j], [B, j], [B, j + 1], [A, j], [B, j + 1], [A, j + 1]]) { const p = col.row[k]; vert(it, p[0], p[1], p[2], p[3], col.Ux, col.Uy, col.Vx, col.Vy, p[4], p[5], 1); }
    }
  }
  items.push(it);
}

function raptorItems(items, c) {
  const r = c.raptor, T = r.tex;
  if (r.art) {
    // the painting carries the limbs; the legs show in the shadow, striding: hip, knee, foot
    for (const side of [1, -1]) {
      const fp = footPose(c, side), h = fp.h;
      const hx = h.x + h.nx * side * 6 * K, hy = h.y + h.ny * side * 6 * K;
      const kx = lerp(hx, fp.x, 0.45) + h.tx * 12 * K, ky = lerp(hy, fp.y, 0.45) + h.ty * 12 * K;
      strut(items, hx, hy, 76 * K, kx, ky, 44 * K, 7 * K);
      strut(items, kx, ky, 44 * K, fp.x, fp.y, (1 + fp.lift * 20) * K, 3.6 * K);
    }
    bodyMesh(items, c);
    return;
  }
  const legs = [], thighs = [];
  for (const side of [1, -1]) {
    const fp = footPose(c, side);
    const h = fp.h;
    const fwd = Math.atan2(h.ty, h.tx);
    const hipX = h.x + h.nx * side * C.halfWidth(HIP) * 0.45 * K, hipY = h.y + h.ny * side * C.halfWidth(HIP) * 0.45 * K;
    // the ankle sits a little behind the foot's planted point; the knee bends forward and out
    const ax = fp.x - h.tx * 6 * K, ay = fp.y - h.ty * 6 * K;
    const kx = lerp(hipX, ax, 0.5) + h.tx * 10 * K + h.nx * side * 2 * K, ky = lerp(hipY, ay, 0.5) + h.ty * 10 * K + h.ny * side * 2 * K;
    const lift = fp.lift;
    const shinAng = Math.atan2(ay - ky, ax - kx), shinLen = Math.hypot(ax - kx, ay - ky) / (T.shin.len * K);
    const footScale = 1 + lift * 0.12;
    // toes point forward and splay out a little; a lifted foot curls its toes
    legs.push(() => placePart(items, T.shin, kx, ky, shinAng, { mirror: side, scale: 1.15, stretch: clamp(shinLen / 1.15, 0.3, 1.2), z: 46 * K, z1: (3 + lift * 22) * K }));
    legs.push(() => placePart(items, T.foot, ax, ay, fwd + side * 0.12, { mirror: -side, scale: footScale * 1.45, stretch: 1 - lift * 0.35, z: (2 + lift * 20) * K, z1: (1 + lift * 16) * K, back: 0.08 }));
    const thAng = Math.atan2(ky - hipY, kx - hipX);
    thighs.push(() => placePart(items, T.thigh, hipX - Math.cos(thAng) * 8 * K, hipY - Math.sin(thAng) * 8 * K, thAng, { mirror: side, stretch: clamp(Math.hypot(kx - hipX, ky - hipY) / (T.thigh.len * K * 0.8), 0.6, 1.15), z: 74 * K, z1: 46 * K }));
  }
  // the arms, folded forward under the chest; only the hands and claws show past the flanks
  for (const side of [1, -1]) {
    const sh = nodeAt(r, SHOULDER);
    const fwd = Math.atan2(sh.ty, sh.tx);
    const bob = Math.sin(r.flap + (side > 0 ? 0 : 0.7)) * 0.08 + r.jaw * 0.12;
    const w = C.halfWidth(SHOULDER) - 5;
    placePart(items, T.arm, sh.x + sh.nx * side * w * K, sh.y + sh.ny * side * w * K, fwd + side * (0.16 + bob), { mirror: side, z: 62 * K, z1: 50 * K });
  }
  legs.forEach((f) => f());
  thighs.forEach((f) => f());
  bodyMesh(items, c);
}

function personItems(items, c) {
  const p = c.person, T = p.tex;
  const at = c.path.at(c.sP), a = c.path.angle(c.sP);
  const fx = Math.cos(a), fy = Math.sin(a), nx = -fy, ny = fx;
  const k = K * p.height * 1.2;
  if (p.art) {
    const Wd = p.W * k;
    // legs and the trunk in the shadow
    for (const side of [1, -1]) {
      const st = foot((p.u + (side === 1 ? 0 : 0.5)) % 1, p.reach * k, p.duty);
      const hx = at.x + nx * side * Wd * 0.14, hy = at.y + ny * side * Wd * 0.14;
      strut(items, hx, hy, p.W * 1.95 * k, hx + fx * st.f, hy + fy * st.f, (1 + st.lift * p.W * 0.5) * k, Wd * 0.1);
    }
    column(items, at.x, at.y, a, Wd * 0.3, p.W * 1.95 * k, p.W * 3.3 * k);
    // the painting, flipped to its mirror every other stride so the limbs swap sides
    const across = Wd * 1.3, along = (across * p.art.w) / p.art.h;
    const flip = (p.u % 1) < 0.5 ? 1 : -1;
    const bob = 1 + Math.sin(p.u * TAU * 2) * 0.02;
    const t = { gl: p.art.tex, len: along / k, half: across / 2 / k };
    placePart(items, t, at.x, at.y, a + p.look * 0.25, { mirror: flip, scale: bob, z: p.W * 3.4 * k, back: 0.5 });
    items[items.length - 1].baked = true;
    return;
  }
  const u = p.u;
  const sway = Math.sin(u * TAU) * 0.14;
  const Wd = p.W * k;
  const sc = p.height * 1.2;
  const legs = [], arms = [];
  for (const side of [1, -1]) {
    const st = foot((u + (side === 1 ? 0 : 0.5)) % 1, p.reach * k, p.duty);
    const hx = at.x + nx * side * Wd * 0.16 - fx * Wd * 0.04, hy = at.y + ny * side * Wd * 0.16 - fy * Wd * 0.04;
    const tx = hx + fx * st.f + nx * side * Wd * 0.03, ty = hy + fy * st.f + ny * side * Wd * 0.03;
    const dist = Math.hypot(tx - hx, ty - hy);
    const ang = dist > 1 ? Math.atan2(ty - hy, tx - hx) : a;
    legs.push(() => placePart(items, T.leg, hx, hy, ang, { mirror: side, scale: sc, stretch: clamp(dist / (T.leg.len * k * 0.82), 0.32, 1.1), z: p.W * 1.95 * k, z1: (1 + st.lift * p.W * 0.5) * k }));
    // arms swing against the legs, pumping, with a little flail when it's close
    const swing = -st.f * 0.5 * (1 + p.flail * 0.15);
    const sx = at.x + nx * side * Wd * 0.44 + fx * Wd * 0.04, sy = at.y + ny * side * Wd * 0.44 + fy * Wd * 0.04;
    const out = Wd * (-0.06 + 0.06 * Math.max(0, Math.sin(p.time * 9 * p.flail)));
    const hxA = sx + fx * swing + nx * side * out, hyA = sy + fy * swing + ny * side * out;
    const aAng = Math.atan2(hyA - sy, hxA - sx), aLen = Math.hypot(hxA - sx, hyA - sy);
    arms.push(() => placePart(items, T.arm, sx, sy, aAng, { mirror: side, scale: sc, stretch: clamp(aLen / (T.arm.len * k * 0.85), 0.35, 1.1), z: p.W * 3.3 * k, z1: p.W * 2.2 * k }));
    if (T.case && side === 1) arms.push(() => placePart(items, T.case, hxA + nx * Wd * 0.06, hyA + ny * Wd * 0.06, a, { scale: sc, z: p.W * 1.9 * k, back: 0.5 }));
  }
  legs.forEach((f) => f());
  if (T.skirt) placePart(items, T.skirt, at.x - fx * Wd * 0.08, at.y - fy * Wd * 0.08, a + Math.PI + sway * 0.6, { scale: sc, stretch: 1 + Math.sin(p.time * 13) * 0.05, z: p.W * 2.0 * k, z1: p.W * 1.3 * k });
  arms.forEach((f) => f());
  // a column from hips to shoulders that only casts a shadow: from above the torso hides it,
  // but the sun sees a whole running figure
  column(items, at.x, at.y, a, Wd * 0.3, p.W * 1.95 * k, p.W * 3.3 * k);
  const ta = a + sway;
  placePart(items, T.torso, at.x + Math.cos(ta) * Wd * 0.22, at.y + Math.sin(ta) * Wd * 0.22, ta + Math.PI, { scale: sc, z: p.W * 3.4 * k });
  if (T.pack) placePart(items, T.pack, at.x - Math.cos(ta) * Wd * 0.02, at.y - Math.sin(ta) * Wd * 0.02, ta + Math.PI, { scale: sc, z: p.W * 3.3 * k });
  const ha = a - sway * 0.6 + p.look;
  const hc = { x: at.x + fx * Wd * 0.1, y: at.y + fy * Wd * 0.1 };
  placePart(items, T.head, hc.x + Math.cos(ha) * T.head.centre * k, hc.y + Math.sin(ha) * T.head.centre * k, ha + Math.PI, { scale: sc, z: p.W * 4.0 * k });
}

let printTex = null, puffTex = null;
function render() {
  poolUsed = 0;
  const items = [];
  const c = state.chase;
  if (c) {
    raptorItems(items, c);
    if (!c.personGone) personItems(items, c);
  }
  const prints = state.prints.map((p) => ({ x: p.x, y: p.y, ang: p.ang, w0: 3.5 * K, w1: 17 * K, h: 6.5 * K, a: 0.42 * (1 - sstep(4, 10, p.age)), flip: p.side < 0 }));
  const puffs = state.dust.map((d) => ({ x: d.x, y: d.y, ang: 0, w0: d.r, w1: d.r, h: d.r, a: 0.55 * (1 - d.age / d.life) }));
  gfx.frame({ items, prints, puffs, time: state.time, K, printTex, puffTex });
}

/* ---------- controls ---------- */
const $ = (id) => document.getElementById(id);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function setStatus() {
  const c = state.chase;
  $('now').textContent = state.paused ? 'Paused'
    : c ? `${capital(c.person.name)}, with ${/^[aeiou]/.test(c.raptor.coat.name) ? 'an' : 'a'} ${c.raptor.coat.name} raptor right behind`
      : 'The forest floor is quiet, for now';
  $('count').textContent = state.count ? `${state.count} chased off screen` : '';
}
function setPaused(v) {
  state.paused = v;
  $('pause-text').textContent = v ? 'Play' : 'Pause';
  $('pause-icon').setAttribute('d', v ? 'M4 2.5l9 5.5-9 5.5z' : 'M4 3h3v10H4zM9 3h3v10H9z');
  $('pause').title = v ? 'Play (Space)' : 'Pause (Space)';
  setStatus();
}
function nextChase() { if (state.chase) return; state.wait = 0; if (state.paused) setPaused(false); }
function setSlow(v) { state.slow = v; $('slow').setAttribute('aria-pressed', String(v)); }
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
function setHidden(v) { document.body.classList.toggle('ui-hidden', v); $('show').hidden = !v; if (v) $('show').focus(); else $('hide').focus(); }

async function boot() {
  if (!gfx) { $('now').textContent = 'This needs WebGL 2, which this browser has turned off.'; return; }
  await loadArt();
  printTex = gfx.texture(P.paintPrint());
  // a soft capsule for the shadow-only columns
  { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32; const g = cv.getContext('2d'); g.filter = 'blur(3px)'; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(4, 4, 56, 24, 12); g.fill(); colTex = { a: gfx.texture(cv) }; }
  puffTex = gfx.texture(P.paintPuff());
  resize();
  $('pause').addEventListener('click', () => setPaused(!state.paused));
  $('next').addEventListener('click', nextChase);
  $('slow').addEventListener('click', () => setSlow(!state.slow));
  $('full').addEventListener('click', toggleFull);
  $('hide').addEventListener('click', () => setHidden(true));
  $('show').addEventListener('click', () => setHidden(false));
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); setPaused(!state.paused); }
    else if (k === 'n') nextChase();
    else if (k === 'm') setSlow(!state.slow);
    else if (k === 'f') toggleFull();
    else if (k === 'h') setHidden(!document.body.classList.contains('ui-hidden'));
  });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      // the path was laid out for the old size, so clear the field and start fresh
      endChase(); state.prints = []; state.dust = []; state.wait = 0.6;
      setStatus();
    }, 150);
  });
  let last = performance.now();
  const frame = (now) => {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) update(raw * (state.slow ? 0.3 : 1));
    render();
    requestAnimationFrame(frame);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setPaused(true);
    $('now').textContent = 'Paused because your system asks for reduced motion. Press play to start.';
  } else setStatus();
  requestAnimationFrame(frame);
  // paint the other coats ahead of time, one per idle moment, so no chase starts with a stall
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  const warm = C.COATS.slice();
  const next = () => { const c = warm.shift(); if (!c) return; coatTextures(c); idle(next, { timeout: 2000 }); };
  idle(next, { timeout: 2000 });
}

// the title is set in the house display face, so wait for it before painting the ground
document.fonts.load('600 100px "Söhne Breit"').catch(() => {}).finally(boot);

// for testing from the console or a script
window.__raptorRun = { state, startChase, render, update, get size() { return { W, H, K }; } };
