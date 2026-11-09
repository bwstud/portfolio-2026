/* Raptor Run: an overhead jungle clearing. One person at a time sprints across it from a
   random edge, with a velociraptor close behind, timed to catch them just off screen.
   Three canvases: ground (painted once), stage (actors each frame), canopy (painted once). */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const R = (a, b) => a + (b - a) * Math.random();
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (p) => Math.random() < p;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- canvases ---------- */
const groundCanvas = document.getElementById('ground');
const stage = document.getElementById('stage');
const canopyCanvas = document.getElementById('canopy');
const gctx = groundCanvas.getContext('2d');
const ctx = stage.getContext('2d');
const cctx = canopyCanvas.getContext('2d');
const shadowLayer = document.createElement('canvas');
const sctx = shadowLayer.getContext('2d');

let W = 0, H = 0, DPR = 1, K = 1; // K scales the world on small screens
const SEED = (Math.random() * 1e9) | 0;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  K = clamp(Math.min(W, H) / 760, 0.55, 1);
  for (const c of [groundCanvas, stage, canopyCanvas, shadowLayer]) {
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
  }
  paintGround();
  paintCanopy();
}

/* ---------- ground ---------- */
function blob(c, x, y, r, rng, points = 9, jitter = 0.35) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const rr = r * (1 - jitter / 2 + rng() * jitter);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  c.beginPath();
  for (let i = 0; i < points; i++) {
    const p = pts[i], q = pts[(i + 1) % points];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) c.moveTo(mx, my); else c.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const p = pts[0], q = pts[1];
  c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  c.closePath();
}

function fern(c, x, y, size, rng) {
  const fronds = 7 + Math.floor(rng() * 5);
  const base = rng() * TAU;
  const greens = ['#4f7a2a', '#5d8a31', '#46702a', '#6b9838'];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < fronds; i++) {
      const a0 = base + (i / fronds) * TAU + (rng() - 0.5) * 0.5;
      const len = size * (0.7 + rng() * 0.45);
      const curl = (rng() - 0.5) * 0.9;
      const ox = pass === 0 ? 5 * K : 0, oy = pass === 0 ? 7 * K : 0;
      c.strokeStyle = pass === 0 ? 'rgba(18, 24, 8, 0.35)' : greens[i % greens.length];
      c.lineCap = 'round';
      let px = x + ox, py = y + oy, ang = a0;
      const steps = 12;
      for (let j = 1; j <= steps; j++) {
        const t = j / steps;
        ang = a0 + curl * t;
        const nx = px + Math.cos(ang) * (len / steps), ny = py + Math.sin(ang) * (len / steps);
        c.lineWidth = 1.6 * K;
        c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
        const leaf = size * 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 1;
        c.lineWidth = 2.6 * K * (1 - t * 0.5);
        for (const s of [-1, 1]) {
          const la = ang + s * 1.05;
          c.beginPath(); c.moveTo(nx, ny);
          c.lineTo(nx + Math.cos(la) * leaf, ny + Math.sin(la) * leaf); c.stroke();
        }
        px = nx; py = ny;
      }
    }
  }
}

function rock(c, x, y, r, rng) {
  c.save();
  c.fillStyle = 'rgba(15, 18, 8, 0.4)';
  blob(c, x + r * 0.35, y + r * 0.45, r * 1.02, seeded(Math.floor(rng() * 1e9)), 8, 0.3); c.fill();
  const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, '#a7a194'); g.addColorStop(0.55, '#7c776b'); g.addColorStop(1, '#55514a');
  c.fillStyle = g;
  blob(c, x, y, r, rng, 8, 0.32); c.fill();
  c.strokeStyle = 'rgba(30, 28, 22, 0.5)'; c.lineWidth = 1.2 * K; c.stroke();
  c.fillStyle = 'rgba(160, 170, 90, 0.35)';
  for (let i = 0; i < 6; i++) {
    c.beginPath(); c.arc(x + (rng() - 0.5) * r, y + (rng() - 0.5) * r, (1 + rng() * 2.5) * K, 0, TAU); c.fill();
  }
  c.restore();
}

function paintGround() {
  const c = gctx, rng = seeded(SEED);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#56622f'; c.fillRect(0, 0, W, H);

  const area = W * H;
  const tones = ['#6b7438', '#47522a', '#7a6a42', '#3e4a26', '#8a7a4c', '#5f6e30'];
  for (let i = 0; i < area / 9000; i++) {
    const x = rng() * W, y = rng() * H, r = (60 + rng() * 260) * K;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const col = tones[Math.floor(rng() * tones.length)];
    g.addColorStop(0, col + '40'); g.addColorStop(1, col + '00');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // trampled dirt patches
  for (let i = 0; i < 3 + area / 400000; i++) {
    const x = rng() * W, y = rng() * H, r = (70 + rng() * 120) * K;
    c.fillStyle = 'rgba(128, 104, 66, 0.35)';
    blob(c, x, y, r, rng, 11, 0.5); c.fill();
    c.fillStyle = 'rgba(150, 124, 80, 0.3)';
    blob(c, x + 6 * K, y - 4 * K, r * 0.6, rng, 9, 0.5); c.fill();
  }

  // grass blades, batched by colour
  const blades = ['#6f8237', '#4d5f26', '#7f9140', '#3f4f20', '#8b9a4a', '#5a6d2c'];
  c.lineCap = 'round';
  for (const col of blades) {
    c.strokeStyle = col; c.lineWidth = 1.1 * K;
    c.beginPath();
    for (let i = 0; i < area / 120; i++) {
      const x = rng() * W, y = rng() * H, len = (2.5 + rng() * 5.5) * K, a = rng() * TAU;
      c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    c.stroke();
  }

  // fallen leaves and pebbles
  const leafCols = ['#9a7a34', '#7a5a26', '#b08f45', '#6a6a2a'];
  for (let i = 0; i < area / 5000; i++) {
    const x = rng() * W, y = rng() * H;
    c.fillStyle = leafCols[Math.floor(rng() * leafCols.length)];
    c.beginPath(); c.ellipse(x, y, (2.5 + rng() * 3) * K, (1.2 + rng() * 1.4) * K, rng() * TAU, 0, TAU); c.fill();
  }
  for (let i = 0; i < area / 7000; i++) {
    const x = rng() * W, y = rng() * H, r = (0.8 + rng() * 1.8) * K;
    c.fillStyle = 'rgba(20, 20, 10, 0.3)'; c.beginPath(); c.arc(x + r * 0.5, y + r * 0.6, r, 0, TAU); c.fill();
    c.fillStyle = '#9b958a'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  for (let i = 0; i < 3 + area / 500000; i++) rock(c, rng() * W, rng() * H, (12 + rng() * 26) * K, rng);
  for (let i = 0; i < 5 + area / 160000; i++) fern(c, rng() * W, rng() * H, (34 + rng() * 40) * K, rng);
}

/* ---------- canopy ---------- */
function paintCanopy() {
  const c = cctx, rng = seeded(SEED ^ 0x5bd1e995);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);

  // trees overhanging the edges, partly off screen
  const spots = [];
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const edge = i % 4;
    const u = 0.1 + rng() * 0.8;
    const r = (110 + rng() * 90) * K;
    const off = r * (0.15 + rng() * 0.35);
    const x = edge === 0 ? u * W : edge === 1 ? W + off : edge === 2 ? u * W : -off;
    const y = edge === 0 ? -off : edge === 1 ? u * H : edge === 2 ? H + off : u * H;
    spots.push({ x, y, r, seed: Math.floor(rng() * 1e9) });
  }

  // shadow of the canopy, blurred where supported, falling down and right
  const tmp = document.createElement('canvas');
  tmp.width = shadowLayer.width; tmp.height = shadowLayer.height;
  const t = tmp.getContext('2d');
  t.setTransform(DPR, 0, 0, DPR, 0, 0);
  t.fillStyle = '#000';
  for (const s of spots) canopyShape(t, s, true);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 0.32;
  if ('filter' in c) c.filter = `blur(${10 * K * DPR}px)`;
  c.drawImage(tmp, 46 * K * DPR, 64 * K * DPR);
  c.restore();

  for (const s of spots) canopyShape(c, s, false);
}

function canopyShape(c, s, solid) {
  const rng = seeded(s.seed);
  const clumps = [];
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, d = rng() * s.r * 0.65;
    clumps.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, r: s.r * (0.35 + rng() * 0.3) });
  }
  if (solid) {
    for (const cl of clumps) { blob(c, cl.x, cl.y, cl.r, rng, 10, 0.3); c.fill(); }
    return;
  }
  const layers = [['#1f3814', 1, 0, 0], ['#2c4a1a', 0.86, -0.08, -0.1], ['#3d6022', 0.66, -0.16, -0.2], ['#55782c', 0.4, -0.26, -0.3]];
  for (const [col, scale, dx, dy] of layers) {
    c.fillStyle = col;
    for (const cl of clumps) {
      blob(c, cl.x + dx * cl.r, cl.y + dy * cl.r, cl.r * scale, rng, 10, 0.35); c.fill();
    }
  }
  // individual leaves for texture
  const leaves = ['#264516', '#3a5c20', '#4d7228', '#628a33'];
  for (const cl of clumps) {
    for (let i = 0; i < 70; i++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * cl.r * 1.02;
      c.fillStyle = leaves[Math.floor(rng() * leaves.length)];
      c.beginPath();
      c.ellipse(cl.x + Math.cos(a) * d, cl.y + Math.sin(a) * d, (6 + rng() * 6) * K, (2.5 + rng() * 2.5) * K, rng() * TAU, 0, TAU);
      c.fill();
    }
  }
}

/* ---------- paths ---------- */
class Path {
  constructor(points) {
    this.p = points;
    this.s = [0];
    for (let i = 1; i < points.length; i++) {
      this.s.push(this.s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    this.L = this.s[this.s.length - 1];
    const a = points[0], b = points[1], y = points[points.length - 2], z = points[points.length - 1];
    this.a0 = Math.atan2(b.y - a.y, b.x - a.x);
    this.a1 = Math.atan2(z.y - y.y, z.x - y.x);
  }
  at(s) {
    const p = this.p;
    if (s <= 0) return { x: p[0].x + Math.cos(this.a0) * s, y: p[0].y + Math.sin(this.a0) * s };
    if (s >= this.L) {
      const z = p[p.length - 1], e = s - this.L;
      return { x: z.x + Math.cos(this.a1) * e, y: z.y + Math.sin(this.a1) * e };
    }
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    const t = (s - this.s[lo]) / (this.s[hi] - this.s[lo] || 1);
    return { x: lerp(p[lo].x, p[hi].x, t), y: lerp(p[lo].y, p[hi].y, t) };
  }
  angle(s) {
    const a = this.at(s - 6), b = this.at(s + 6);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}

function centripetal(p0, p1, p2, p3, u) {
  const d = (a, b) => Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const t = lerp(t1, t2, u);
  const mix = (a, b, ta, tb) => { const k = (t - ta) / (tb - ta); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; };
  const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

function edgePoint(edge, u) {
  return edge === 0 ? { x: u * W, y: 0 } : edge === 1 ? { x: W, y: u * H } : edge === 2 ? { x: u * W, y: H } : { x: 0, y: u * H };
}

function makePath() {
  const edge = Math.floor(Math.random() * 4);
  const entry = edgePoint(edge, R(0.1, 0.9));
  const aim = { x: W * R(0.3, 0.7), y: H * R(0.3, 0.7) };
  let ang = Math.atan2(aim.y - entry.y, aim.x - entry.x) + R(-0.45, 0.45);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const tx = dx > 0 ? (W - entry.x) / dx : dx < 0 ? -entry.x / dx : Infinity;
  const ty = dy > 0 ? (H - entry.y) / dy : dy < 0 ? -entry.y / dy : Infinity;
  const cand = [tx, ty].filter((v) => v > 1);
  const tHit = Math.min(...cand);
  const exit = { x: entry.x + dx * tHit, y: entry.y + dy * tHit };
  const len = Math.hypot(exit.x - entry.x, exit.y - entry.y);

  const ctrl = [{ x: entry.x - dx * 500 * K, y: entry.y - dy * 500 * K }, entry];
  const wps = chance(0.55) ? 2 : 1;
  for (let j = 1; j <= wps; j++) {
    const t = j / (wps + 1);
    const off = R(-1, 1) * len * 0.17;
    ctrl.push({
      x: clamp(lerp(entry.x, exit.x, t) - dy * off, W * 0.12, W * 0.88),
      y: clamp(lerp(entry.y, exit.y, t) + dx * off, H * 0.12, H * 0.88),
    });
  }
  ctrl.push(exit);
  const last = ctrl[ctrl.length - 2];
  const ox = exit.x - last.x, oy = exit.y - last.y, ol = Math.hypot(ox, oy) || 1;
  ctrl.push({ x: exit.x + (ox / ol) * 500 * K, y: exit.y + (oy / ol) * 500 * K });

  const pts = [];
  const ext = [
    { x: 2 * ctrl[0].x - ctrl[1].x, y: 2 * ctrl[0].y - ctrl[1].y },
    ...ctrl,
    { x: 2 * ctrl[ctrl.length - 1].x - ctrl[ctrl.length - 2].x, y: 2 * ctrl[ctrl.length - 1].y - ctrl[ctrl.length - 2].y },
  ];
  for (let i = 1; i < ext.length - 2; i++) {
    const seg = Math.hypot(ext[i + 1].x - ext[i].x, ext[i + 1].y - ext[i].y);
    const n = Math.max(2, Math.ceil(seg / 4));
    for (let j = 0; j < n; j++) pts.push(centripetal(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], j / n));
  }
  pts.push(ctrl[ctrl.length - 1]);
  return new Path(pts);
}

// first and last arc lengths at which a point is inside the screen grown by pad
function onScreenSpan(path, pad) {
  const inside = (p) => p.x > -pad && p.x < W + pad && p.y > -pad && p.y < H + pad;
  let first = null, last = null;
  for (let i = 0; i < path.p.length; i++) {
    if (inside(path.p[i])) { if (first === null) first = path.s[i]; last = path.s[i]; }
  }
  return { first: first ?? 0, last: last ?? path.L };
}

/* ---------- gait ---------- */
// One gait cycle u in [0, 1). Each foot is planted for `duty` of the cycle (sliding back
// under the body at exactly the body's speed) and swings forward, lifted, for the rest.
function foot(u, reach, duty) {
  if (u < duty) return { f: reach * (1 - (2 * u) / duty), lift: 0 };
  const v = (u - duty) / (1 - duty);
  return { f: -reach + 2 * reach * smooth(v), lift: Math.sin(Math.PI * v) };
}

/* ---------- people ---------- */
const SKIN = ['#f3d6c1', '#e8bd9b', '#d6a079', '#bb7f57', '#946040', '#70462c', '#4d2f1e'];
const HAIR = ['#1b1511', '#3a291d', '#5e3d23', '#8b5b2c', '#b98b4b', '#dcc38c', '#9c9c9c', '#e9e5dc', '#a5432b'];
const BRIGHT = ['#e0603e', '#2ba3a0', '#f2b134', '#e94f7a', '#7c5cc4', '#3f8fd9', '#9bd14a'];
const DRESS = ['#e8a9c0', '#f2d06b', '#7fc4c9', '#d85c4a', '#f4f1ea', '#8fb36b'];

const ROLES = [
  () => ({ name: 'a park ranger', top: '#8a8455', sleeves: 'short', legs: '#5c5638', shoes: '#3a2a1c', hat: 'safari', hatCol: '#c2ad7a' }),
  () => ({ name: 'a scientist in a lab coat', top: '#7d9cc4', sleeves: 'long', coat: '#efeee8', legs: '#3a3d48', shoes: '#222' }),
  () => ({ name: 'a tourist in a loud shirt', top: pick(BRIGHT), pattern: true, sleeves: 'short', legs: '#d9c7a0', shorts: true, shoes: '#f2f2f2', backpack: '#2f5d8a', hat: chance(0.5) ? 'cap' : null, hatCol: pick(['#d23c3c', '#f4f4f4', '#2a5ca8']) }),
  () => ({ name: 'a jogger', top: pick(BRIGHT), sleeves: 'none', legs: '#1d1d22', shorts: true, shoes: '#f2f2f2' }),
  () => ({ name: 'a construction worker', top: '#4a5a7a', vest: '#d4ee2c', sleeves: 'short', legs: '#3c4a63', shoes: '#5a3a1a', hat: 'hard', hatCol: '#f2c21b' }),
  () => ({ name: 'someone in a suit', top: pick(['#2a2e38', '#3b3f4a', '#4a3f35']), sleeves: 'long', legs: '#2a2e38', shoes: '#111', briefcase: '#5a3a22' }),
  () => { const d = pick(DRESS); return { name: 'someone in a summer dress', top: d, dress: d, sleeves: 'none', legs: null, shoes: pick(['#c9a57a', '#f2f2f2', '#b34040']), hat: chance(0.4) ? 'sun' : null, hatCol: '#dcc48a' }; },
  () => ({ name: 'a hiker', top: pick(['#c4672f', '#3d7a8a', '#8a3d3d']), sleeves: 'long', legs: '#6c6a5e', shoes: '#4a3a2a', backpack: '#3d5a3a', bigPack: true, hat: chance(0.5) ? 'sun' : null, hatCol: '#b8a070' }),
  () => ({ name: 'a security guard', top: '#2c3e66', sleeves: 'short', legs: '#1f2a44', shoes: '#111', hat: 'cap', hatCol: '#15171c' }),
  () => ({ name: 'a chef', top: '#f4f2ee', sleeves: 'long', legs: '#2b2b2b', shoes: '#111', hat: 'toque', hatCol: '#fbfbf8' }),
  () => ({ name: 'someone in a yellow raincoat', top: '#f0c419', coat: '#f0c419', sleeves: 'long', legs: '#3a4660', shoes: '#2a2a2a', hat: 'hood', hatCol: '#e6b812' }),
  () => { const c = pick(['#6a4c93', '#3a3a3a', '#b23a48', '#3f6e4a']); return { name: 'someone in a hoodie', top: c, sleeves: 'long', legs: '#3b4f7a', shoes: '#eee', hat: chance(0.5) ? 'hood' : null, hatCol: c }; },
];
const BUILDS = [
  { name: 'slim', w: [32, 37], belly: 0, speed: 1.06 },
  { name: 'average', w: [37, 42], belly: 0.05, speed: 1 },
  { name: 'broad', w: [42, 48], belly: 0.08, speed: 0.97 },
  { name: 'round', w: [40, 46], belly: 0.3, speed: 0.9 },
];

function makePerson() {
  const role = pick(ROLES)();
  const build = pick(BUILDS);
  const height = R(0.86, 1.14);
  const W0 = R(...build.w) * 1.15 * K * lerp(0.92, 1.06, (height - 0.86) / 0.28);
  const hairStyle = role.hat === 'hood' || role.hat === 'toque' || role.hat === 'hard' ? 'short'
    : pick(['short', 'short', 'long', 'ponytail', 'bun', 'curly', 'bald']);
  return {
    ...role,
    build, height,
    W: W0,
    belly: build.belly,
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairStyle,
    speedMul: build.speed * R(0.94, 1.08),
    reach: W0 * 0.62 * height,
    duty: 0.36,
    u: Math.random(),
    look: 0, lookTarget: 0, lookTimer: R(0.6, 1.4),
    flail: R(0.6, 1.2),
    time: 0,
  };
}

/* ---------- raptors ---------- */
const COATS = [
  { name: 'tawny', base: '#a8834a', dark: '#5a3f22', stripe: '#3f2a14', light: '#c9a86c', leg: '#76582f', claw: '#1f170e', feathers: null },
  { name: 'olive', base: '#7b7e46', dark: '#3f4426', stripe: '#2b301b', light: '#9a9c62', leg: '#5a5c33', claw: '#1a1a10', feathers: '#3b3d24' },
  { name: 'rust', base: '#a65b33', dark: '#5a2c18', stripe: '#3a1a0c', light: '#c88052', leg: '#7a4428', claw: '#1c0f08', feathers: '#e0cfa4' },
  { name: 'slate', base: '#6e7277', dark: '#3a3d42', stripe: '#212327', light: '#8e9398', leg: '#54575b', claw: '#111214', feathers: '#9fb0bd' },
];
// half-width of the body in px at each distance (px) back from the snout, for a 300 px raptor
const PROFILE = [[0, 2], [6, 5.5], [14, 8.6], [26, 11.2], [34, 11.6], [41, 8], [48, 6], [60, 6.2], [72, 9], [88, 14.5], [108, 18.5], [128, 20], [146, 19.5], [162, 16.5], [178, 12.5], [196, 9.4], [220, 7], [246, 5], [270, 3.2], [290, 1.6], [300, 0.5]];
function halfWidth(d) {
  for (let i = 1; i < PROFILE.length; i++) {
    if (d <= PROFILE[i][0]) {
      const [d0, w0] = PROFILE[i - 1], [d1, w1] = PROFILE[i];
      return lerp(w0, w1, (d - d0) / (d1 - d0));
    }
  }
  return 0.5;
}
const LENGTH = 300, STEP = 6, NODES = LENGTH / STEP + 1;
const HIP = 146, SHOULDER = 84;

function makeRaptor() {
  return {
    coat: pick(COATS),
    reach: 62 * K,
    duty: 0.38,
    u: Math.random(),
    tail: Math.random() * TAU,
    nodes: Array.from({ length: NODES }, () => ({ x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0 })),
    jaw: 0,
  };
}

/* ---------- the chase ---------- */
const state = {
  chase: null,
  wait: 0.8,
  paused: false,
  slow: false,
  count: 0,
  prints: [],
  dust: [],
};

function startChase() {
  const path = makePath();
  const pad = 70 * K;
  const span = onScreenSpan(path, pad);
  const person = makePerson();
  const raptor = makeRaptor();
  const vp = 330 * K * person.speedMul;
  let vr = vp * R(1.13, 1.22);
  const sP0 = span.first - 4;
  // catch a little after the person leaves the screen
  const sCatch = span.last + vp * R(0.35, 0.7);
  const T = (sCatch - sP0) / vp;
  const minGap = 120 * K;
  if ((vr - vp) * T < minGap) vr = vp + minGap / T;
  const sR0 = sCatch - vr * T;
  state.chase = {
    path, span, person, raptor, vp, vr, t: 0, T,
    sP: sP0, sR: sR0,
    personGone: false,
  };
  state.count++;
  setStatus();
}

function update(dt) {
  // tracks and dust
  for (const p of state.prints) p.age += dt;
  state.prints = state.prints.filter((p) => p.age < 9);
  for (const d of state.dust) {
    d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 1 - 2.5 * dt; d.vy *= 1 - 2.5 * dt; d.r += 14 * K * dt;
  }
  state.dust = state.dust.filter((d) => d.age < d.life);

  const c = state.chase;
  if (!c) {
    state.wait -= dt;
    if (state.wait <= 0) startChase();
    return;
  }
  c.t += dt;
  c.sP += c.vp * dt;
  c.sR += c.vr * dt;

  // person gait and glances back
  const p = c.person;
  const pT = (2 * p.reach) / (c.vp * p.duty);
  p.u = (p.u + dt / pT) % 1;
  p.time += dt;
  const gap = c.sP - c.sR;
  p.lookTimer -= dt;
  if (p.lookTimer <= 0) {
    if (p.lookTarget === 0 && gap < 520 * K && chance(0.7)) {
      p.lookTarget = (chance(0.5) ? 1 : -1) * R(1.6, 2.3);
      p.lookTimer = R(0.25, 0.45);
    } else {
      p.lookTarget = 0;
      p.lookTimer = R(0.7, 1.5);
    }
  }
  p.look += (p.lookTarget - p.look) * Math.min(1, dt * 14);

  // raptor gait, with prints and dust as each foot lands
  const r = c.raptor;
  const rT = (2 * r.reach) / (c.vr * r.duty);
  const prevU = r.u;
  r.u = (r.u + dt / rT) % 1;
  r.tail += dt * TAU / rT;
  r.jaw += ((gap < 380 * K ? 1 : 0) - r.jaw) * Math.min(1, dt * 4);
  layoutRaptor(c);
  for (const side of [1, -1]) {
    const off = side === 1 ? 0 : 0.5;
    const a = (prevU + off) % 1, b = (r.u + off) % 1;
    if (b < a) landFoot(c, side);
  }

  if (!c.personGone && c.sP - p.reach - p.W > c.span.last) c.personGone = true;
  if (c.sR - LENGTH * K > c.span.last + 20 * K) {
    state.chase = null;
    state.wait = R(1.2, 4.5);
    setStatus();
  }
}

function layoutRaptor(c) {
  const r = c.raptor, path = c.path;
  const wag = Math.sin(r.tail);
  for (let i = 0; i < NODES; i++) {
    const d = i * STEP;
    const s = c.sR - d * K;
    const p = path.at(s);
    const a = path.angle(s);
    const nx = -Math.sin(a), ny = Math.cos(a);
    const tailW = Math.pow(Math.max(0, (d - 150) / 150), 1.6);
    const torso = d > 60 && d < 210 ? Math.sin(((d - 60) / 150) * Math.PI) : 0;
    const off = (Math.sin(r.tail - d * 0.02) * 7 * tailW + Math.sin(r.tail * 2) * 1.2 * torso) * K;
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
  const { f, lift } = foot(u, r.reach, r.duty);
  const h = nodeAt(r, HIP);
  const lat = (halfWidth(HIP) + 13) * K;
  return {
    x: h.x + h.tx * f + h.nx * side * lat,
    y: h.y + h.ty * f + h.ny * side * lat,
    ang: Math.atan2(h.ty, h.tx),
    lift, f, h,
  };
}

function landFoot(c, side) {
  const fp = footPose(c, side);
  state.prints.push({ x: fp.x, y: fp.y, ang: fp.ang, side, age: 0 });
  for (let i = 0; i < 5; i++) {
    const a = fp.ang + Math.PI + R(-0.9, 0.9);
    const sp = R(30, 90) * K;
    state.dust.push({ x: fp.x, y: fp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: R(3, 6) * K, age: 0, life: R(0.5, 0.9) });
  }
}

/* ---------- drawing ---------- */
// In shadow mode every fill is solid black; the layer is composited at low opacity.
let SH = false;
const col = (c) => (SH ? '#000' : c);

function capsule(c, x1, y1, x2, y2, w, fill) {
  c.strokeStyle = col(fill); c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}

function drawPerson(c, chase) {
  const p = chase.person, path = chase.path;
  const pos = path.at(chase.sP), ang = path.angle(chase.sP);
  const W = p.W;
  const legA = foot(p.u, p.reach, p.duty);
  const legB = foot((p.u + 0.5) % 1, p.reach, p.duty);
  const bob = 0.5 + 0.5 * Math.cos(TAU * 2 * (p.u - (p.duty + 0.5) / 2));
  c.save();
  c.translate(pos.x, pos.y);
  if (SH) c.translate(bob * 3 * K, bob * 4 * K);
  c.rotate(ang);
  const sc = 1 + bob * 0.025;
  c.scale(sc, sc);

  // legs: right leg is +y
  const legW = W * 0.22;
  for (const [side, L] of [[1, legA], [-1, legB]]) {
    const hy = side * W * 0.19, fy = side * W * 0.21;
    if (p.legs && p.shorts) {
      capsule(c, 0, hy, L.f * 0.45, lerp(hy, fy, 0.45), legW * 1.05, p.legs);
      capsule(c, L.f * 0.45, lerp(hy, fy, 0.45), L.f, fy, legW * 0.85, p.skin);
    } else {
      capsule(c, 0, hy, L.f, fy, legW, p.legs || p.skin);
    }
    c.fillStyle = col(p.shoes);
    c.beginPath(); c.ellipse(L.f + W * 0.06, fy, W * 0.17 * (1 + L.lift * 0.12), W * 0.09, 0, 0, TAU); c.fill();
  }

  if (p.dress) {
    c.fillStyle = col(p.dress);
    c.beginPath(); c.ellipse(-W * 0.04, 0, W * 0.36, W * 0.46, 0, 0, TAU); c.fill();
  }

  // coat tails flap behind
  const flap = Math.sin(p.time * 15) * W * 0.05;
  if (p.coat) {
    c.fillStyle = col(p.coat);
    c.beginPath();
    c.moveTo(W * 0.1, -W * 0.5);
    c.quadraticCurveTo(-W * 0.4, -W * 0.56, -W * 0.72 - flap, -W * 0.36);
    c.quadraticCurveTo(-W * 0.82, flap, -W * 0.72 + flap, W * 0.36);
    c.quadraticCurveTo(-W * 0.4, W * 0.56, W * 0.1, W * 0.5);
    c.closePath(); c.fill();
  }

  // arms swing against the legs, flailing a little
  for (const [side, L] of [[1, legB], [-1, legA]]) {
    const sx = W * 0.02, sy = side * W * 0.44;
    const wild = Math.sin(p.time * 11 + side) * W * 0.06 * p.flail;
    const hx = L.f * 0.62 + wild, hy = side * W * (0.52 + 0.06 * p.flail) + wild * 0.5 * side;
    const ex = lerp(sx, hx, 0.5) - W * 0.04, ey = lerp(sy, hy, 0.5) + side * W * 0.05;
    const sleeve = p.coat || p.top;
    const armW = W * 0.16;
    if (p.sleeves === 'long') { capsule(c, sx, sy, ex, ey, armW, sleeve); capsule(c, ex, ey, hx, hy, armW * 0.9, sleeve); }
    else if (p.sleeves === 'short') { capsule(c, sx, sy, ex, ey, armW, sleeve); capsule(c, ex, ey, hx, hy, armW * 0.8, p.skin); }
    else { capsule(c, sx, sy, ex, ey, armW * 0.9, p.skin); capsule(c, ex, ey, hx, hy, armW * 0.8, p.skin); }
    c.fillStyle = col(p.skin);
    c.beginPath(); c.arc(hx, hy, W * 0.1, 0, TAU); c.fill();
    if (p.briefcase && side === 1) {
      c.fillStyle = col(p.briefcase);
      c.save(); c.translate(hx, hy + W * 0.08); c.fillRect(-W * 0.2, -W * 0.03, W * 0.4, W * 0.12); c.restore();
    }
  }

  // torso
  const rx = W * (0.24 + p.belly * 0.15), ry = W * 0.5;
  c.fillStyle = col(p.coat || p.top);
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill();
  if (!SH) { c.strokeStyle = 'rgba(15, 12, 8, 0.45)'; c.lineWidth = 1.2 * K; c.stroke(); }
  if (p.belly > 0.1) { c.beginPath(); c.ellipse(rx * 0.35, 0, rx * 0.9, ry * 0.7, 0, 0, TAU); c.fill(); }
  if (!SH) {
    if (p.coat && p.top !== p.coat) { // shirt showing at the open front of the coat
      c.fillStyle = p.top; c.beginPath(); c.ellipse(rx * 0.55, 0, rx * 0.45, ry * 0.22, 0, 0, TAU); c.fill();
    }
    if (p.pattern) {
      c.save(); c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.clip();
      const dots = ['#fff4d6', '#2f8f4a', '#ffd23f', '#e94f7a'];
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, d = (i % 5) / 5;
        c.fillStyle = dots[i % dots.length];
        c.beginPath(); c.arc(Math.cos(a) * rx * d, Math.sin(a) * ry * d, W * 0.05, 0, TAU); c.fill();
      }
      c.restore();
    }
    if (p.vest) {
      c.fillStyle = p.vest;
      c.beginPath(); c.ellipse(0, 0, rx * 0.95, ry * 0.94, 0, 0, TAU); c.fill();
      c.strokeStyle = '#e4e4e4'; c.lineWidth = W * 0.05;
      c.beginPath(); c.moveTo(-rx * 0.85, -ry * 0.6); c.lineTo(rx * 0.85, -ry * 0.6); c.moveTo(-rx * 0.85, ry * 0.6); c.lineTo(rx * 0.85, ry * 0.6); c.stroke();
    }
    c.fillStyle = 'rgba(255, 255, 255, 0.08)';
    c.beginPath(); c.ellipse(-rx * 0.1, -ry * 0.25, rx * 0.6, ry * 0.45, 0, 0, TAU); c.fill();
  }
  if (p.backpack) {
    c.fillStyle = col(p.backpack);
    const bw = p.bigPack ? W * 0.62 : W * 0.48, bd = p.bigPack ? W * 0.36 : W * 0.24;
    c.beginPath(); c.roundRect(-rx - bd * 0.7, -bw / 2, bd, bw, W * 0.08); c.fill();
    if (!SH) { c.fillStyle = 'rgba(0, 0, 0, 0.18)'; c.fillRect(-rx - bd * 0.55, -bw * 0.32, bd * 0.4, bw * 0.64); }
  }

  drawHead(c, p, W);
  c.restore();
}

function drawHead(c, p, W) {
  const r = W * 0.21;
  c.save();
  c.translate(W * 0.05, 0);
  c.rotate(p.look);
  const sway = Math.sin(p.time * 15) * r * 0.35;
  // long hair streams behind, under the head
  if (!p.hat || p.hat === 'cap' || p.hat === 'sun' || p.hat === 'safari') {
    c.fillStyle = col(p.hair);
    if (p.hairStyle === 'long') { c.beginPath(); c.ellipse(-r * 1.05, sway * 0.5, r * 0.95, r * 0.85, 0, 0, TAU); c.fill(); }
    if (p.hairStyle === 'ponytail') capsule(c, -r * 0.7, 0, -r * 2.1, sway, r * 0.5, p.hair);
  }
  c.fillStyle = col(p.skin);
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  if (!SH) { c.strokeStyle = 'rgba(15, 12, 8, 0.4)'; c.lineWidth = 1.1 * K; c.stroke(); }
  if (!SH) { c.fillStyle = 'rgba(0, 0, 0, 0.12)'; c.beginPath(); c.ellipse(r * 0.95, 0, r * 0.18, r * 0.12, 0, 0, TAU); c.fill(); }

  const cap = (fill) => { c.fillStyle = col(fill); c.beginPath(); c.arc(-r * 0.16, 0, r * 0.93, 0, TAU); c.fill(); };
  switch (p.hat) {
    case 'safari':
    case 'sun': {
      c.fillStyle = col(p.hatCol);
      c.beginPath(); c.arc(0, 0, r * (p.hat === 'sun' ? 2.05 : 1.75), 0, TAU); c.fill();
      if (!SH) {
        c.fillStyle = 'rgba(0, 0, 0, 0.14)'; c.beginPath(); c.arc(0, 0, r * 1.05, 0, TAU); c.fill();
        c.fillStyle = p.hatCol; c.beginPath(); c.arc(-r * 0.05, -r * 0.05, r * 0.92, 0, TAU); c.fill();
        c.strokeStyle = p.hat === 'sun' ? '#b4475a' : '#5a4a2a'; c.lineWidth = r * 0.16;
        c.beginPath(); c.arc(0, 0, r * 1.02, 0, TAU); c.stroke();
      }
      break;
    }
    case 'cap':
      c.fillStyle = col(p.hatCol);
      c.beginPath(); c.ellipse(r * 0.95, 0, r * 0.6, r * 0.72, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(-r * 0.05, 0, r * 1.0, 0, TAU); c.fill();
      if (!SH) { c.fillStyle = 'rgba(255, 255, 255, 0.15)'; c.beginPath(); c.arc(-r * 0.05, 0, r * 0.18, 0, TAU); c.fill(); }
      break;
    case 'hard':
      c.fillStyle = col(p.hatCol);
      c.beginPath(); c.ellipse(r * 0.1, 0, r * 1.32, r * 1.15, 0, 0, TAU); c.fill();
      if (!SH) { c.strokeStyle = 'rgba(0, 0, 0, 0.2)'; c.lineWidth = r * 0.2; c.beginPath(); c.moveTo(-r * 0.9, 0); c.lineTo(r * 1.0, 0); c.stroke(); }
      break;
    case 'toque':
      c.fillStyle = col(p.hatCol);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; c.beginPath(); c.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.62, 0, TAU); c.fill(); }
      if (!SH) { c.fillStyle = 'rgba(0, 0, 0, 0.06)'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill(); }
      break;
    case 'hood':
      c.fillStyle = col(p.hatCol);
      c.beginPath(); c.arc(-r * 0.18, 0, r * 1.15, 0, TAU); c.fill();
      if (!SH) {
        c.fillStyle = p.skin; c.beginPath(); c.ellipse(r * 0.55, 0, r * 0.42, r * 0.55, 0, 0, TAU); c.fill();
        c.fillStyle = p.hair; c.beginPath(); c.ellipse(r * 0.38, 0, r * 0.2, r * 0.5, 0, 0, TAU); c.fill();
      }
      break;
    default:
      if (p.hairStyle === 'bald') {
        if (!SH) { c.fillStyle = 'rgba(255, 255, 255, 0.22)'; c.beginPath(); c.arc(-r * 0.2, -r * 0.25, r * 0.35, 0, TAU); c.fill(); }
        c.fillStyle = col(p.hair); c.beginPath(); c.arc(-r * 0.5, 0, r * 0.62, Math.PI * 0.55, Math.PI * 1.45); c.lineTo(-r * 0.5, 0); c.fill();
      } else if (p.hairStyle === 'curly') {
        c.fillStyle = col(p.hair);
        for (let i = 0; i < 10; i++) { const a = Math.PI * 0.35 + (i / 9) * Math.PI * 1.3; c.beginPath(); c.arc(Math.cos(a) * r * 0.78 - r * 0.1, Math.sin(a) * r * 0.78, r * 0.42, 0, TAU); c.fill(); }
        cap(p.hair);
      } else {
        cap(p.hair);
        if (p.hairStyle === 'bun') { c.beginPath(); c.arc(-r * 0.75, 0, r * 0.42, 0, TAU); c.fill(); }
      }
      if (!SH && p.hairStyle !== 'bald') { c.fillStyle = 'rgba(255, 255, 255, 0.1)'; c.beginPath(); c.arc(-r * 0.3, -r * 0.3, r * 0.4, 0, TAU); c.fill(); }
  }
  c.restore();
}

function smoothClosed(c, pts) {
  const n = pts.length;
  c.beginPath();
  c.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  c.closePath();
}

function outline(r, scale, from = 0, to = LENGTH, inset = 0) {
  const left = [], right = [];
  for (let i = 0; i < NODES; i++) {
    const d = i * STEP;
    if (d < from || d > to) continue;
    const n = r.nodes[i], w = Math.max(0.3, halfWidth(d) * scale - inset) * K;
    left.push([n.x + n.nx * w, n.y + n.ny * w]);
    right.push([n.x - n.nx * w, n.y - n.ny * w]);
  }
  return left.concat(right.reverse());
}

function drawLeg(c, chase, side) {
  const r = chase.raptor, coat = r.coat;
  const fp = footPose(chase, side);
  const h = fp.h;
  const { kx, ky } = knee(fp, side);
  capsule(c, kx, ky, fp.x, fp.y, 7 * K, coat.leg);
  // three forward toes, the inner one carrying the raised sickle claw
  const curl = 1 - fp.lift * 0.45;
  const toe = (spread, len) => {
    const a = fp.ang + spread;
    capsule(c, fp.x, fp.y, fp.x + Math.cos(a) * len * curl * K, fp.y + Math.sin(a) * len * curl * K, 3.8 * K, coat.leg);
    c.fillStyle = col(coat.claw);
    c.beginPath(); c.arc(fp.x + Math.cos(a) * (len * curl + 1.5) * K, fp.y + Math.sin(a) * (len * curl + 1.5) * K, 1.4 * K, 0, TAU); c.fill();
  };
  toe(side * 0.34, 14); toe(0, 18); toe(-side * 0.4, 12);
  const sa = fp.ang - side * 0.9;
  c.strokeStyle = col(coat.claw); c.lineWidth = 2.2 * K; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(fp.x - h.nx * side * 2 * K, fp.y - h.ny * side * 2 * K);
  c.quadraticCurveTo(fp.x + Math.cos(sa) * 9 * K, fp.y + Math.sin(sa) * 9 * K, fp.x + Math.cos(fp.ang - side * 0.2) * 9 * K, fp.y + Math.sin(fp.ang - side * 0.2) * 9 * K);
  c.stroke();
}

function knee(fp, side) {
  const h = fp.h, lat = (halfWidth(HIP) + 3) * K;
  // the knee rides forward of the hip and follows the foot part of the way
  const along = 10 * K + fp.f * 0.4;
  return { kx: h.x + h.tx * along + h.nx * side * lat, ky: h.y + h.ty * along + h.ny * side * lat };
}

// big drumstick thigh, drawn over the body so the hind legs read from above
function drawThigh(c, chase, side) {
  const r = chase.raptor, coat = r.coat;
  const fp = footPose(chase, side), h = fp.h;
  const { kx, ky } = knee(fp, side);
  const hx = h.x + h.nx * side * halfWidth(HIP) * 0.6 * K, hy = h.y + h.ny * side * halfWidth(HIP) * 0.6 * K;
  const cx = lerp(hx, kx, 0.55), cy = lerp(hy, ky, 0.55);
  const ang = Math.atan2(ky - hy, kx - hx);
  const len = Math.hypot(kx - hx, ky - hy) / 2 + 10 * K;
  c.fillStyle = col(coat.leg);
  c.beginPath(); c.ellipse(cx, cy, len, 10 * K, ang, 0, TAU); c.fill();
  if (SH) return;
  c.strokeStyle = 'rgba(25, 18, 8, 0.5)'; c.lineWidth = 1.2 * K;
  c.stroke();
}

function drawArm(c, r, side) {
  const coat = r.coat;
  const s = nodeAt(r, SHOULDER + 6);
  const pump = Math.sin(r.u * TAU * 2) * 2.5 * K;
  const w = halfWidth(SHOULDER + 6) * K;
  const sx = s.x + s.nx * side * w * 0.85, sy = s.y + s.ny * side * w * 0.85;
  const ex = sx + s.nx * side * 9 * K - s.tx * 4 * K, ey = sy + s.ny * side * 9 * K - s.ty * 4 * K;
  const hx = ex + s.tx * (16 * K + pump) - s.nx * side * 2 * K, hy = ey + s.ty * (16 * K + pump) - s.ny * side * 2 * K;
  if (coat.feathers) {
    c.strokeStyle = col(coat.feathers); c.lineCap = 'round'; c.lineWidth = 2.4 * K;
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const bx = lerp(ex, hx, t), by = lerp(ey, hy, t);
      c.beginPath(); c.moveTo(bx, by);
      c.lineTo(bx + s.nx * side * 7 * K - s.tx * (9 + i * 2) * K, by + s.ny * side * 7 * K - s.ty * (9 + i * 2) * K);
      c.stroke();
    }
  }
  capsule(c, sx, sy, ex, ey, 6 * K, coat.leg);
  capsule(c, ex, ey, hx, hy, 4.2 * K, coat.leg);
  c.strokeStyle = col(coat.claw); c.lineWidth = 1.6 * K;
  for (const k of [-1, 0, 1]) {
    c.beginPath(); c.moveTo(hx, hy);
    c.lineTo(hx + s.tx * 5 * K - s.nx * side * (3 + k * 1.6) * K, hy + s.ty * 5 * K - s.ny * side * (3 + k * 1.6) * K);
    c.stroke();
  }
}

function drawRaptor(c, chase) {
  const r = chase.raptor, coat = r.coat;
  const bob = 0.5 + 0.5 * Math.cos(TAU * 2 * (r.u - (r.duty + 0.5) / 2));
  c.save();
  if (SH) c.translate(bob * 5 * K, bob * 6 * K);

  // far side first: legs and arms sit under the body
  drawLeg(c, chase, 1); drawLeg(c, chase, -1);
  drawThigh(c, chase, 1); drawThigh(c, chase, -1);
  drawArm(c, r, 1); drawArm(c, r, -1);

  // body
  c.fillStyle = col(coat.base);
  smoothClosed(c, outline(r, 1 + bob * 0.03)); c.fill();
  if (SH) { c.restore(); return; }

  // light flank, dark dorsal band, cross stripes
  c.fillStyle = coat.light + '55';
  smoothClosed(c, outline(r, 0.92, 40, 290, 3)); c.fill();
  c.fillStyle = coat.dark + 'cc';
  smoothClosed(c, outline(r, 0.3, 40, 300)); c.fill();
  c.lineCap = 'round';
  for (let i = 0, d = 86; d <= 284; i++, d += 17 + (i % 3) * 5) {
    const n = nodeAt(r, d), m = nodeAt(r, d + 9);
    const w = halfWidth(d) * 0.8 * K;
    c.strokeStyle = coat.stripe + '70';
    c.lineWidth = (d < 190 ? 4.2 : 3) * K * (i % 2 ? 0.7 : 1);
    c.beginPath();
    for (const sd of [1, -1]) {
      c.moveTo(m.x + m.nx * sd * w * 0.22, m.y + m.ny * sd * w * 0.22);
      c.lineTo(n.x + n.nx * sd * w, n.y + n.ny * sd * w);
    }
    c.stroke();
  }
  if (coat.feathers) { // short crest along the neck and a fan at the tail
    c.strokeStyle = coat.feathers + 'bb'; c.lineWidth = 1.6 * K;
    const tip = nodeAt(r, LENGTH - 6);
    for (let i = -3; i <= 3; i++) {
      const a = Math.atan2(-tip.ty, -tip.tx) + i * 0.13;
      c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(tip.x + Math.cos(a) * 11 * K, tip.y + Math.sin(a) * 11 * K); c.stroke();
    }
  }
  // rim
  c.strokeStyle = 'rgba(25, 18, 8, 0.45)'; c.lineWidth = 1.2 * K;
  smoothClosed(c, outline(r, 1 + bob * 0.03)); c.stroke();
  // dark mask through the eye and a pale throat edge
  c.fillStyle = coat.dark + '99';
  smoothClosed(c, outline(r, 0.55, 10, 44)); c.fill();

  // head: eyes, brow, nostrils, a slightly open jaw when it's close
  const eye = nodeAt(r, 26), nose = nodeAt(r, 4);
  for (const side of [1, -1]) {
    const w = halfWidth(26) * 0.78 * K;
    const ex = eye.x + eye.nx * side * w, ey = eye.y + eye.ny * side * w;
    c.fillStyle = '#e8c247'; c.beginPath(); c.ellipse(ex, ey, 3.2 * K, 2.1 * K, Math.atan2(eye.ty, eye.tx), 0, TAU); c.fill();
    c.fillStyle = '#130d06'; c.beginPath(); c.arc(ex, ey, 1.2 * K, 0, TAU); c.fill();
    c.strokeStyle = coat.dark; c.lineWidth = 1.6 * K;
    c.beginPath(); c.moveTo(ex + eye.tx * 4 * K, ey + eye.ty * 4 * K); c.lineTo(ex - eye.tx * 5 * K + eye.nx * side * 1.5 * K, ey - eye.ty * 5 * K + eye.ny * side * 1.5 * K); c.stroke();
    c.fillStyle = '#1a120a';
    c.beginPath(); c.arc(nose.x + nose.nx * side * 2.2 * K, nose.y + nose.ny * side * 2.2 * K, 0.9 * K, 0, TAU); c.fill();
    if (r.jaw > 0.05) {
      const j0 = nodeAt(r, 2), j1 = nodeAt(r, 24);
      const gape = r.jaw * 2 * K;
      c.strokeStyle = 'rgba(60, 10, 8, 0.7)'; c.lineWidth = 1.4 * K;
      c.beginPath();
      c.moveTo(j0.x + j0.nx * side * (halfWidth(2) * K + gape * 0.5), j0.y + j0.ny * side * (halfWidth(2) * K + gape * 0.5));
      c.lineTo(j1.x + j1.nx * side * (halfWidth(24) * K + gape * 0.2), j1.y + j1.ny * side * (halfWidth(24) * K + gape * 0.2));
      c.stroke();
    }
  }
  c.restore();
}

function drawPrints(c) {
  for (const p of state.prints) {
    const a = Math.min(1, (9 - p.age) / 3) * 0.32;
    c.save();
    c.translate(p.x, p.y); c.rotate(p.ang);
    c.strokeStyle = `rgba(40, 30, 14, ${a})`; c.fillStyle = `rgba(40, 30, 14, ${a})`;
    c.lineWidth = 2.6 * K; c.lineCap = 'round';
    c.beginPath(); c.ellipse(0, 0, 3.4 * K, 2.6 * K, 0, 0, TAU); c.fill();
    c.beginPath();
    for (const s of [-0.36, 0, 0.36]) {
      const len = (s === 0 ? 13 : 10) * K;
      c.moveTo(2 * K, 0); c.lineTo(Math.cos(s * p.side) * len, Math.sin(s * p.side) * len);
    }
    c.stroke();
    c.restore();
  }
}

function drawDust(c) {
  for (const d of state.dust) {
    const a = (1 - d.age / d.life) * 0.28;
    c.fillStyle = `rgba(196, 176, 128, ${a})`;
    c.beginPath(); c.arc(d.x, d.y, d.r, 0, TAU); c.fill();
  }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawPrints(ctx);
  const c = state.chase;
  if (!c) { drawDust(ctx); return; }

  // shadows: silhouettes in black on their own layer, composited once
  sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  sctx.clearRect(0, 0, W, H);
  SH = true;
  if (!c.personGone) drawPerson(sctx, c);
  drawRaptor(sctx, c);
  SH = false;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(shadowLayer, 9 * K * DPR, 12 * K * DPR);
  ctx.restore();

  drawDust(ctx);
  drawRaptor(ctx, c);
  if (!c.personGone) drawPerson(ctx, c);
}

/* ---------- controls ---------- */
const $ = (id) => document.getElementById(id);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function setStatus() {
  const c = state.chase;
  $('now').textContent = state.paused ? 'Paused'
    : c ? `${capital(c.person.name)}, with ${/^[aeiou]/.test(c.raptor.coat.name) ? 'an' : 'a'} ${c.raptor.coat.name} raptor right behind`
      : 'The clearing is quiet, for now';
  $('count').textContent = state.count ? `${state.count} chased off screen` : '';
}

function setPaused(v) {
  state.paused = v;
  $('pause-text').textContent = v ? 'Play' : 'Pause';
  $('pause-icon').setAttribute('d', v ? 'M4 2.5l9 5.5-9 5.5z' : 'M4 3h3v10H4zM9 3h3v10H9z');
  $('pause').title = v ? 'Play (Space)' : 'Pause (Space)';
  setStatus();
}

function nextChase() {
  if (state.chase) return;
  state.wait = 0;
  if (state.paused) setPaused(false);
}

function setSlow(v) {
  state.slow = v;
  $('slow').setAttribute('aria-pressed', String(v));
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function setHidden(v) {
  document.body.classList.toggle('ui-hidden', v);
  $('show').hidden = !v;
  if (v) $('show').focus(); else $('hide').focus();
}

$('pause').addEventListener('click', () => setPaused(!state.paused));
$('next').addEventListener('click', nextChase);
$('slow').addEventListener('click', () => setSlow(!state.slow));
$('full').addEventListener('click', toggleFull);
$('hide').addEventListener('click', () => setHidden(true));
$('show').addEventListener('click', () => setHidden(false));
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPaused(!state.paused); }
  else if (k === 'n') nextChase();
  else if (k === 'm') setSlow(!state.slow);
  else if (k === 'f') toggleFull();
  else if (k === 'h') setHidden(!document.body.classList.contains('ui-hidden'));
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resize();
    // the path was laid out for the old size, so clear the field and start fresh
    state.chase = null; state.prints = []; state.dust = []; state.wait = 0.6;
    setStatus();
  }, 150);
});

/* ---------- loop ---------- */
let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused) update(raw * (state.slow ? 0.3 : 1));
  render();
  requestAnimationFrame(frame);
}

resize();
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setPaused(true);
  $('now').textContent = 'Paused because your system asks for reduced motion. Press play to start.';
} else setStatus();
requestAnimationFrame(frame);

// for testing from the console or a script
window.__raptorRun = { state, startChase, get size() { return { W, H, K }; } };
