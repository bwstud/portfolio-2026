/* Powers of Watts — the plates: what the zoom passes through. The ground, from the fire to the whole Earth, is one
   field drawn in halftone (field.js): the innermost scale that the dot screen can resolve answers for each point, so
   the yard gives way to the street, the town, the region and the globe without a seam. People, flames and orbits are
   drawn as shapes on top. Copper is power in use: fire, windows, lamps, city light, collectors. Everything else is cool. */
import { halftone, hash, noise, fbm } from './field.js';

const TAU = Math.PI * 2;
export const COPPER = '#e08a3c';
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

export const AU = 1.496e11, LY = 9.4607e15;
/* Where each node's origin sits relative to the one before (metres). Earth's centre is under the fire: we look
   straight down on it. The Sun is an AU to the left; the galaxy's centre 26,000 light years up and to the right. */
export const NODES = { sun: [-AU, 0], gal: [1.25e20, -2.17e20] };

export function label(g, text, x, y, { align = 'left', color = 'rgba(233,228,216,0.62)', size = 10 } = {}) {
  g.font = `${size}px "Söhne Mono", ui-monospace, monospace`;
  g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(4,10,19,0.9)'; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}
export function glow(g, x, y, r, inner, outer = 'rgba(0,0,0,0)') {
  if (!(r > 0.5)) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
}
export function ring(g, x, y, r, style, width = 1, dash = null) {
  g.strokeStyle = style; g.lineWidth = width;
  if (dash) g.setLineDash(dash);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  if (dash) g.setLineDash([]);
}

// ================= the ground: one field, many scales =================
const C = { grass: 1, warm: 2, road: 3, roofHi: 4, roofLo: 5, tree: 6, water: 7, stone: 8, light: 9, hot: 10, seaDay: 11, landDay: 12, panel: 13, landNight: 14, seaNight: 15, wood: 16, person: 17, personLit: 18, body: 19 };
const GROUND = [null,
  { fill: '#3b5248' }, { fill: '#b8743e' }, { fill: '#555b64' }, { fill: '#77808c' }, { fill: '#3f454e' },
  { fill: '#40604b' }, { fill: '#1f3b58' }, { fill: '#5d6268' },
  { fill: 'rgb(240,140,64)', add: true }, { fill: 'rgb(255,192,128)', add: true },
  { fill: '#16314f' }, { fill: '#5d7a5c' }, { fill: '#c9d6e4' }, { fill: '#1d2b32' }, { fill: '#0c1a2a' },
  { fill: '#4a3424' }, { fill: '#56677a' }, { fill: '#d8925a' }, { fill: '#e08a3c' }];
let S = {};             // the view's state, read by the fields each frame
let T = 0;              // seconds, for flicker

export const PERSON = { x: -1.15, y: 0.42 };
const HOUSE = { x: -3, y: -17, w: 14, h: 9.5 };


/* People are part of the field too, so they share the dots. A chapter hands over a list; a coarse grid finds the
   few near any point. Seated people face the fire; a counted body is one copper dot. */
let PEOPLE = [], GRID = new Map();
export function setPeople(list) {
  PEOPLE = list; GRID = new Map();
  for (const p of list) {
    const k = Math.floor(p.x) + ',' + Math.floor(p.y);
    if (!GRID.has(k)) GRID.set(k, []);
    GRID.get(k).push(p);
  }
}
function personF(x, y, s, o) {
  if (!PEOPLE.length) return 0;
  const gx = Math.floor(x), gy = Math.floor(y);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const b = GRID.get((gx + dx) + ',' + (gy + dy));
    if (!b) continue;
    for (const p of b) {
      const ex = x - p.x, ey = y - p.y;
      if (ex * ex + ey * ey > 0.36) continue;
      if (p.kind === 'body') {
        if (ex * ex + ey * ey < Math.max(0.2, s * 0.72) ** 2) { o.v = 0.75 + 0.25 * (p.pulse ?? 1); return (p.pulse ?? 1) > 1.2 ? C.hot : C.body; }
        continue;
      }
      // seated, facing the fire: u toward it, v across
      const f = Math.atan2(-p.y, -p.x), cu = Math.cos(f), su = Math.sin(f);
      const u = ex * cu + ey * su, v = -ex * su + ey * cu, pad = s * 0.35;
      const inE = (cu0, cv0, ru, rv) => ((u - cu0) / (ru + pad)) ** 2 + ((v - cv0) / (rv + pad)) ** 2 < 1;
      if (u * u + v * v < (0.095 + pad) ** 2) { o.v = 0.95; return C.person; }
      if (inE(-0.02, 0, 0.13, 0.23) || inE(0.17, -0.16, 0.14, 0.05) || inE(0.17, 0.16, 0.14, 0.05)) { o.v = 0.9; return u > 0.04 && (p.lit ?? 1) > 0.2 ? C.personLit : C.person; }
      if (inE(0.33, -0.09, 0.2, 0.055) || inE(0.33, 0.09, 0.2, 0.055)) { o.v = 0.85; return C.person; }
    }
  }
  return 0;
}
const ITEMS = [];
/* Small things on the ground: a kettle, a bulb. */
export function setItems(list) { ITEMS.length = 0; ITEMS.push(...list); }
function itemF(x, y, s, o) {
  for (const it of ITEMS) {
    const d = Math.hypot(x - it.x, y - it.y);
    if (d < Math.max(it.r, s * 0.5)) { o.v = it.v ?? 0.9; return C[it.c]; }
  }
  return 0;
}

function fireF(x, y, s, o, r, hs) {
  const pc = personF(x, y, s, o) || itemF(x, y, s, o);
  if (pc) return pc;
  if (logAt(x, y, s)) { o.v = 0.9; return C.wood; }
  const lit = S.fireLit ?? 1;
  if (r < 0.5) { o.v = 0.4 + 0.6 * noise(x * 9, y * 9 + T * 4) * lit; return lit > 0.05 ? C.hot : C.stone; }
  if (r < 0.76) {
    const a = (Math.atan2(y, x) / TAU * 11 + 0.3) % 1;
    if ((a + 1) % 1 < 0.78) { o.v = 0.9 - Math.abs(r - 0.63) * 4; return C.stone; }
  }
  const warm = Math.exp(-(r - 0.6) / 0.95) * lit * (0.9 + 0.1 * Math.sin(T * 9));
  if (hs < warm * 0.75) { o.v = 0.18 + 0.45 * warm; return C.warm; }
  o.v = 0.24 + 0.22 * noise(x * 5, y * 5); return C.grass;
}
const TREES = [[-11, 6, 3.4], [10, 9, 2.8], [-10, -8, 2.4], [11, -12, 3], [-24, 2, 3.8], [25, -4, 3.2], [-33, -2, 3], [34, 8, 3.6]];
function roofAt(x, y, cx, cy, w, h) {
  if (Math.abs(x - cx) > w / 2 || Math.abs(y - cy) > h / 2) return 0;
  return y < cy ? C.roofHi : C.roofLo;
}
const LOGS = [[0.4, 0.95], [2.3, 0.85], [4.1, 0.9]].map(([a, len]) => ({ c: Math.cos(a), s: Math.sin(a), len }));
function logAt(x, y, s) {
  for (const L of LOGS) { const u = x * L.c + y * L.s, v = -x * L.s + y * L.c; if (Math.abs(u) < L.len / 2 && Math.abs(v) < 0.055 + s * 0.3) return true; }
  return false;
}
function yardF(x, y, s, o, r, hs) {
  const pc = personF(x, y, s, o);
  if (pc) return pc;
  if (y < -31 && y > -39) { o.v = 0.5; return C.road; }
  if (x > 3 && x < 7 && y < -21.75 && y > -31) { o.v = 0.48; return C.road; }
  let c = roofAt(x, y, HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h) || roofAt(x, y, HOUSE.x - 30, HOUSE.y - 1, 13, 9) || roofAt(x, y, HOUSE.x + 30, HOUSE.y + 2, 12, 9.5);
  if (c) { o.v = 0.85; return c; }
  if (Math.abs(Math.abs(x) - 15) < 0.2 && y > -31 && y < 15 && hs < 0.4 / s + 0.1) { o.v = 0.45; return C.stone; }
  for (const [tx, ty, tr] of TREES) { const d = Math.hypot(x - tx, y - ty); if (d < tr) { o.v = 0.55 + 0.3 * (1 - d / tr) - (y > ty ? 0.15 : 0); return C.tree; } }
  // the house's power, spilling from its south windows onto the lawn
  const on = S.houseLight ?? 0.6;
  if (on > 0 && y > -12.25 && y < -6 && x > -10 && x < 4) {
    const wx = ((x + 10) % 4.6) - 2.3, k = Math.exp(-(y + 12.25) / 1.6) * Math.exp(-(wx * wx) / 2.2) * on;
    if (k > 0.05) { o.v = 0.2 + 0.6 * k; return C.light; }
  }
  if (r < 1.3) { o.v = 0.8; return C.hot; }
  if (r < 3 && hs < 0.5) { o.v = 0.3; return C.warm; }
  o.v = 0.22 + 0.22 * fbm(x / 3, y / 3); return C.grass;
}
function hoodF(x, y, s, o, r, hs) {
  const ky = Math.round((y + 35) / 80), sy = -35 + 80 * ky, dy = y - sy;
  const kx = Math.round((x - 82) / 164), sx = 82 + 164 * kx, dx = x - sx;
  const on = S.townLight ?? 1;
  // street lamps: a pool of light every 42 m along each street
  const lx = 42 * Math.round((x - 7) / 42) + 7, ly = 42 * Math.round((y - 7) / 42) + 7;
  const dl = Math.min(Math.hypot(x - lx, dy), Math.hypot(dx, y - ly));
  if (dl < Math.max(1.1, s * 0.5)) { o.v = 0.9 * on; return C.hot; }
  const pool = 0.75 * Math.exp(-(dl * dl) / (2 * 4.5 * 4.5)) * on;
  if (Math.abs(dy) < 5 || Math.abs(dx) < 5) {
    if (pool > 0.06) { o.v = 0.15 + pool; return C.light; }
    o.v = 0.42; return C.road;
  }
  const side = dy > 0 ? 1 : -1, ady = Math.abs(dy);
  if (ady > 12 && ady < 25 && Math.abs(dx) > 16) {
    const lk = Math.round(x / 30);
    let cx = 30 * lk + (hash(lk, ky * 2 + side) - 0.5) * 4, cy = sy + side * 18, hw = 6.5, hh = 4.5;
    if (lk === 0 && ky === 0 && side > 0) { cx = HOUSE.x; cy = HOUSE.y; hw = HOUSE.w / 2; hh = HOUSE.h / 2; }
    if (Math.abs(x - cx) < hw && Math.abs(y - cy) < hh) { o.v = 0.82; return y < cy ? C.roofHi : C.roofLo; }
    // windows facing the street
    if (Math.abs(x - cx) < hw - 1 && Math.abs(y - (cy - side * (hh + 1.2))) < 1.2 && hash(lk, ky * 7 + side) < 0.75) { o.v = 0.35 * on; return C.light; }
  }
  if (pool > 0.12) { o.v = pool * 0.7; return C.light; }
  if (fbm(x / 14, y / 14) > 0.64) { o.v = 0.5; return C.tree; }
  o.v = 0.2 + 0.16 * noise(x / 6, y / 6); return C.grass;
}
const shore = y => 3800 + 900 * Math.sin(y / 5200) + 260 * Math.sin(y / 1300 + 1);
function townF(x, y, s, o, r, hs) {
  if (x > shore(y)) { o.v = 0.14 + 0.08 * noise(x / 300, y / 300); return C.water; }
  const on = S.townLight ?? 1;
  const ma = Math.abs((((x + 400) % 1600) + 1600) % 1600 - 800), mb = Math.abs((((y + 400) % 1600) + 1600) % 1600 - 800);
  if (Math.min(ma, mb) < Math.max(18, s * 0.45)) { o.v = 0.6 * on; return C.light; }
  if (Math.abs(x - (0.55 * y - 900)) < Math.max(26, s * 0.5)) { o.v = 0.8 * on; return C.hot; }
  if (Math.hypot(x + 1800, y - 1500) < 700 || Math.hypot(x - 1200, y + 2600) < 500) { o.v = 0.35; return C.tree; }
  const d = 0.45 + 0.4 * fbm(x / 900, y / 900);
  if (hs < d * 0.72) { o.v = (0.3 + 0.35 * hash(Math.floor(x / 23), Math.floor(y / 23))) * on; return C.light; }
  o.v = 0.2; return C.grass;
}
const CITY = { x: 9000, y: -14000 };
const shoreR = y => 9000 + 9000 * Math.sin(y / 90000 + 0.3) + 3000 * Math.sin(y / 21000) + (y > 60000 ? (y - 60000) * 0.5 : 0);
const SPOKES = Array.from({ length: 9 }, (_, k) => Math.PI / 2 + (k + 0.5) / 9 * Math.PI);
function regionF(x, y, s, o, r, hs) {
  if (x > shoreR(y)) { o.v = 0.12; return C.water; }
  const on = S.townLight ?? 1;
  const dx = x - CITY.x, dy = (y - CITY.y) / 1.15, dc = Math.hypot(dx, dy);
  let D = 1.15 * Math.exp(-dc / 15000);
  const ang = Math.atan2(dy, dx);
  for (const a of SPOKES) { let da = Math.abs(((ang - a + Math.PI) % TAU + TAU) % TAU - Math.PI); if (da < 0.5) { const perp = Math.sin(da) * dc; if (perp < Math.max(900, s * 0.5) && dc < 110000) D += 0.55 * Math.exp(-dc / 60000); } }
  const t = fbm(x / 30000 + 3, y / 30000 - 1);
  D += 0.16 + (t > 0.6 ? (t - 0.6) * 2.4 : 0);
  D = Math.min(1, D) * on;
  if (hs < D * 0.8) { o.v = 0.22 + 0.55 * D; return D > 0.85 ? C.hot : C.light; }
  o.v = 0.24; return C.landNight;
}

// ---------- the globe ----------
export const EARTH_R = 6.371e6;
export const HOME = { lat: 41.9, lon: -87.8 };
let EARTH = null;
export function buildEarth(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const cg = c.getContext('2d', { willReadFrequently: true }); cg.drawImage(img, 0, 0);
  const d = cg.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, v = new Uint8Array(n);
  for (let i = 0; i < n; i++) v[i] = d[i * 4];
  EARTH = { v, W: c.width, H: c.height };
}
export const earthReady = () => !!EARTH;
const lat0 = HOME.lat * Math.PI / 180, lon0 = HOME.lon * Math.PI / 180, cl0 = Math.cos(lat0), sl0 = Math.sin(lat0);
let SUN_DIR = [0, 0, 1];
function globeF(x, y, s, o, r, hs) {
  const R = EARTH_R, nx = x / R, ny = -y / R, nz2 = 1 - nx * nx - ny * ny;
  if (nz2 <= 0) return 0;
  const nz = Math.sqrt(nz2);
  // view → world: undo the tilt that put home at the centre
  const wy = ny * cl0 + nz * sl0, wz = -ny * sl0 + nz * cl0;
  const lat = Math.asin(Math.max(-1, Math.min(1, wy))), lon = lon0 + Math.atan2(nx, wz);
  let land = 0, light = 0;
  if (EARTH) {
    const u = (((lon / TAU + 0.5) % 1) + 1) % 1 * EARTH.W - 0.5, v = (0.5 - lat / Math.PI) * EARTH.H - 0.5;
    const i = Math.floor(u), j = Math.max(0, Math.min(EARTH.H - 2, Math.floor(v))), fu = u - i, fv = v - j;
    const at = (a, b) => EARTH.v[b * EARTH.W + ((a % EARTH.W) + EARTH.W) % EARTH.W];
    const q = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)], wq = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv];
    for (let k = 0; k < 4; k++) { if (q[k] > 0) land += wq[k]; if (q[k] > 1) light += wq[k] * (q[k] - 2) / 253; }
  }
  const isLand = land > 0.5 - (hs - 0.5) * 0.3;
  const d = nx * SUN_DIR[0] + nz * SUN_DIR[2];
  const day = smooth(-0.12, 0.3, d);
  const pv = S.panels && S.panels(lat, lon, isLand);
  if (pv) { o.v = (0.3 + 0.45 * day) * (pv === true ? 1 : pv); return C.panel; }
  const L = light * (1 - day) * (S.earthLight ?? 1);
  if (L > 0.015 && hs < 0.35 + L * 1.5) { o.v = Math.min(1, 0.2 + 0.9 * L); return L > 0.55 ? C.hot : C.light; }
  if (isLand) { if (day > 0.04) { o.v = 0.2 + 0.6 * day; return C.landDay; } o.v = 0.3; return C.landNight; }
  if (day > 0.04) { o.v = 0.16 + 0.5 * day; return C.seaDay; } o.v = 0.25; return C.seaNight;
}
function groundF(x, y, s, o, i, j) {
  const r = Math.hypot(x, y), hs = hash(i * 3 + 1, j * 5 + 2);
  const k = 0.82 + 0.18 * hash(i, j);
  if (r < 4.4 * k && s < 0.32 * k) return fireF(x, y, s, o, r, hs);
  if (r < 46 * k && s < 3.6 * k) return yardF(x, y, s, o, r, hs);
  if (r < 480 * k && s < 40 * k) return hoodF(x, y, s, o, r, hs);
  if (r < 6600 * k && s < 520 * k) return townF(x, y, s, o, r, hs);
  if (r < 150000 * k && s < 9000 * k) return regionF(x, y, s, o, r, hs);
  if (r < EARTH_R) return globeF(x, y, s, o, r, hs);
  return 0;
}
function drawGround(g, { ox, oy, ppm, view, w, h }) {
  S = view.state; T = view.t;
  const th = Math.PI * Math.min(1, Math.max(0, view.phase));
  SUN_DIR = [-Math.sin(th), 0, Math.cos(th)];
  const R = EARTH_R * ppm;
  g.fillStyle = '#060c14'; g.beginPath(); g.arc(ox, oy, R, 0, TAU); g.fill();
  halftone(g, { ox, oy, ppm, w, h, field: groundF, palette: GROUND, S: 8, R: EARTH_R, clip: view.clip });
  const heat = S.heat || 0;
  if (heat > 0 && R > 4) {
    g.globalCompositeOperation = 'lighter';
    const hg = g.createRadialGradient(ox, oy, R * 0.3, ox, oy, R * 1.1);
    hg.addColorStop(0, `rgba(255,70,30,${0.06 * heat})`); hg.addColorStop(0.88, `rgba(255,80,40,${0.26 * heat})`); hg.addColorStop(1, 'rgba(255,80,40,0)');
    g.fillStyle = hg; g.beginPath(); g.arc(ox, oy, R * 1.1, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  if (R > 3 && R < 40000) {
    const grd = g.createRadialGradient(ox, oy, R * 0.98, ox, oy, R * 1.05);
    grd.addColorStop(0, 'rgba(110,160,220,0)'); grd.addColorStop(0.35, `rgba(110,160,220,${0.14 + 0.24 * (1 - th / Math.PI)})`); grd.addColorStop(1, 'rgba(110,160,220,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(ox, oy, R * 1.05, 0, TAU); g.fill();
  }
}

// ---------- the fire's light: the flame's glow and its sparks (the logs and people are in the field) ----------
const embers = (() => { const r = rng(5); return Array.from({ length: 60 }, () => ({ a: r() * TAU, v: 0.4 + r() * 0.8, ph: r() })); })();
function drawFire(g, { ox, oy, ppm, view }) {
  const t = view.t, lit = S.fireLit ?? 1;
  const flick = 0.84 + 0.09 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 23.7 + 1) + 0.04 * Math.sin(t * 3.3);
  g.globalCompositeOperation = 'lighter';
  glow(g, ox, oy, 2.6 * ppm * (0.96 + 0.04 * flick), `rgba(255,140,60,${0.16 * lit * flick})`);
  glow(g, ox, oy, 0.6 * ppm, `rgba(255,190,110,${0.7 * lit * flick})`);
  glow(g, ox + Math.sin(t * 5) * 0.05 * ppm, oy + Math.cos(t * 4) * 0.05 * ppm, 0.24 * ppm, `rgba(255,236,190,${0.9 * lit})`);
  if (lit > 0.05) for (const e of embers) {
    const k = (t * e.v * 0.25 + e.ph) % 1, rr = (0.15 + k * 1.3) * ppm;
    g.fillStyle = `rgba(255,${150 + 80 * (1 - k)},90,${(1 - k) * 0.9 * lit})`;
    const sz = Math.max(1, 0.022 * ppm);
    g.fillRect(ox + Math.cos(e.a + k * 0.6) * rr - sz / 2, oy + Math.sin(e.a + k * 0.6) * rr - sz / 2, sz, sz);
  }
  g.globalCompositeOperation = 'source-over';
}

// ---------- the Moon's orbit ----------
const MOON_A = 3.844e8;
function drawMoon(g, { ox, oy, ppm, px, view }) {
  ring(g, ox, oy, MOON_A * ppm, 'rgba(233,228,216,0.16)', 1, [2, 4]);
  const a = -2.2 + view.t * 0.004, mx = ox + Math.cos(a) * MOON_A * ppm, my = oy + Math.sin(a) * MOON_A * ppm;
  const mr = Math.max(1.6, 1.737e6 * ppm);
  g.fillStyle = '#9a968e'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
  if (px > 140) { label(g, 'Moon', mx + mr + 6, my); label(g, 'Earth', ox + Math.max(4, EARTH_R * ppm) + 6, oy); }
}

// ---------- the Sun ----------
export const SUN_R = 6.957e8;
const SUN_PAL = [null, { fill: 'rgb(255,214,150)', add: true }, { fill: 'rgb(255,150,70)', add: true }, { fill: 'rgb(255,90,50)', add: true }];
function sunF(x, y, s, o) {
  const r2 = (x * x + y * y) / (SUN_R * SUN_R);
  if (r2 >= 1) return 0;
  const mu = Math.sqrt(1 - r2), sw = S.swarm || 0, ir = S.infrared || 0;
  const gran = 0.78 + 0.44 * noise(x / (SUN_R * 0.035) + T * 0.15, y / (SUN_R * 0.035));
  o.v = (1 - 0.62 * (1 - mu)) * gran * (1 - 0.985 * sw) * (ir ? 0.45 : 1);
  return ir ? 3 : mu > 0.55 ? 1 : 2;
}
function drawSun(g, { ox, oy, ppm, view, w, h }) {
  S = view.state; T = view.t;
  const R = SUN_R * ppm, sw = S.swarm || 0, ir = S.infrared || 0;
  if (R > 2) {
    g.globalCompositeOperation = 'lighter';
    glow(g, ox, oy, R * 3, ir ? `rgba(255,90,50,${0.18 * (1 - sw)})` : `rgba(255,190,120,${0.3 * (1 - 0.985 * sw)})`);
    g.globalCompositeOperation = 'source-over';
    halftone(g, { ox, oy, ppm, w, h, field: sunF, palette: SUN_PAL, S: 8, R: SUN_R, clip: view.clip });
  }
}

// ---------- planets ----------
const INNER = [['Mercury', 5.79e10, -0.6], ['Venus', 1.082e11, 1.9], ['Earth', AU, 0], ['Mars', 2.279e11, 3.6]];
const OUTER = [['Jupiter', 7.785e11, 2.4], ['Saturn', 1.434e12, -1.1], ['Uranus', 2.871e12, 0.8], ['Neptune', 4.495e12, 4.1]];
function planets(g, { ox, oy, ppm }, list, minLabel) {
  for (const [name, a, ang] of list) {
    const R = a * ppm;
    ring(g, ox, oy, R, name === 'Earth' ? 'rgba(127,176,220,0.4)' : 'rgba(233,228,216,0.13)', 1);
    const x = ox + Math.cos(ang) * R, y = oy + Math.sin(ang) * R;
    g.fillStyle = name === 'Earth' ? '#7fb0dc' : '#a8a296';
    g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
    if (R > minLabel) label(g, name, x + 6, y);
  }
}
function drawInner(g, o) {
  const { ox, oy, view } = o, sw = view.state.swarm || 0, ir = view.state.infrared || 0;
  planets(g, o, INNER, 34);
  const vis = (1 - sw * 0.985) * (ir ? 0.25 : 1);
  g.globalCompositeOperation = 'lighter';
  glow(g, ox, oy, 28, ir ? `rgba(255,100,60,${0.7 * vis})` : `rgba(255,214,150,${0.9 * vis})`);
  glow(g, ox, oy, 7, ir ? `rgba(255,140,90,${vis})` : `rgba(255,246,220,${vis})`);
  g.globalCompositeOperation = 'source-over';
  if (o.px > 120) label(g, 'Sun', ox + 12, oy - 12);
}
function drawOuter(g, o) { planets(g, o, OUTER, 30); }

// ---------- nearby stars ----------
const NEAR = [['Alpha Centauri', 4.37, -2.5], ['Barnard’s Star', 5.96, 1.2], ['Wolf 359', 7.86, 2.7], ['Sirius', 8.6, -0.9], ['Epsilon Eridani', 10.5, 0.3], ['Tau Ceti', 11.9, 4.4], ['Vega', 25, -1.8], ['Arcturus', 36.7, 2.0], ['Betelgeuse', 548, -2.2], ['Rigel', 860, 0.6], ['Deneb', 2600, 3.3]];
const stars = (() => {
  const r = rng(71), n = 7000, x = new Float32Array(n), y = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const rr = LY * 3 * Math.pow(10, r() * 3.6), a = r() * TAU; x[i] = Math.cos(a) * rr; y[i] = Math.sin(a) * rr; b[i] = 0.3 + r() * 0.7; }
  return { x, y, b, n };
})();
function drawStars(g, { ox, oy, ppm, w, h }) {
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(205,216,236,0.75)';
  g.beginPath();
  for (let i = 0; i < stars.n; i++) {
    const px = ox + stars.x[i] * ppm, py = oy + stars.y[i] * ppm;
    if (px < 0 || px > w || py < 0 || py > h) continue;
    const s = 0.7 + stars.b[i] * 1.3;
    g.rect(px - s / 2, py - s / 2, s, s);
  }
  g.fill();
  g.globalCompositeOperation = 'source-over';
  for (const [name, ly, a] of NEAR) {
    const px = ox + Math.cos(a) * ly * LY * ppm, py = oy + Math.sin(a) * ly * LY * ppm;
    if (px < 8 || px > w - 140 || py < 40 || py > h - 20) continue;
    const dist = Math.hypot(px - ox, py - oy);
    if (dist < 26 || dist > Math.max(w, h) * 0.7) continue;
    g.fillStyle = 'rgba(240,236,226,0.95)'; g.fillRect(px - 1.5, py - 1.5, 3, 3);
    label(g, `${name} · ${ly < 20 ? ly.toFixed(1) : Math.round(ly).toLocaleString('en-US')} ly`, px + 7, py, { color: 'rgba(233,228,216,0.55)' });
  }
}

// ---------- the Milky Way, in halftone ----------
export const GAL_R = 5.0e20;
const PITCH = Math.tan(16 * Math.PI / 180), R0 = 0.12 * GAL_R;
const GAL_PAL = [null, { fill: 'rgb(214,222,240)', add: true }, { fill: 'rgb(255,214,164)', add: true }, { fill: 'rgb(160,196,255)', add: true }];
function galF(x, y, s, o, i, j) {
  const r = Math.hypot(x, y);
  if (r > GAL_R * 1.25) return 0;
  // the bar and bulge
  const c = Math.cos(-0.45), sn = Math.sin(-0.45), bx = (x * c - y * sn) / 1.7, by = (x * sn + y * c) / 0.75;
  const bulge = 1.3 * Math.exp(-(bx * bx + by * by) / (2 * (0.075 * GAL_R) ** 2));
  // four log-spiral arms, two strong and two weak, over a faint disc
  const th = Math.atan2(y, x), t = r / GAL_R;
  let arms = 0, dust = 0;
  if (r > R0 * 0.6) {
    // arms wander a little in radius, as real ones do, so they read as spirals rather than rings
    const base = Math.log(Math.max(r, R0 * 0.6) / R0) / PITCH + 0.45 + 0.5 * (noise(th * 1.6 + 3, r / (0.18 * GAL_R)) - 0.5);
    for (let k = 0; k < 4; k++) {
      let d = ((th - base - k * Math.PI / 2) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU;
      const wdt = (0.05 + 0.06 * t) * GAL_R * (k % 2 ? 1.25 : 1);
      arms += (k % 2 ? 0.45 : 1) * Math.exp(-((d * r) ** 2) / (2 * wdt * wdt));
      if (k % 2 === 0) { const dd = d * r + wdt * 0.9; dust = Math.max(dust, 0.75 * Math.exp(-(dd * dd) / (2 * (wdt * 0.28) ** 2)) * smooth(0.15, 0.3, t)); }
    }
  }
  const disc = 0.28 * Math.exp(-r / (0.32 * GAL_R));
  const clump = 0.45 + 0.75 * noise(x / (0.022 * GAL_R), y / (0.022 * GAL_R)) + 0.35 * noise(x / (0.007 * GAL_R), y / (0.007 * GAL_R));
  const v = (bulge + arms * 0.8 * clump * smooth(1.15, 0.7, t) + disc);
  const hs = hash(i * 7 + 3, j * 11 + 5);
  const near = smooth(GAL_R * 0.0008, GAL_R * 0.006, s);
  // dust: dark lanes on the inner edge of the strong arms
  if (dust > 0.45 && hs < dust) return 0;
  if (hs > (v * 1.5 + 0.04) * near) return 0;
  o.v = Math.min(1, 0.15 + v * 0.75);
  if (bulge > arms) return 2;
  return arms > 0.5 && clump > 1.05 && hs < 0.25 ? 3 : 1;
}
const galCache = { key: '', cv: null };
function drawGalaxy(g, { ox, oy, ppm, view, w, h }) {
  S = view.state;
  // stars aren't on a grid: the galaxy's dots are nudged off it, which also breaks the moiré between arms and screen
  // the galaxy doesn't change between frames unless the view does: keep the last halftone and reuse it while still
  const dim = S.galDim || 0, c = view.clip, dpr = view.dpr || 1;
  const key = [ox.toFixed(1), oy.toFixed(1), ppm.toExponential(6), w, h, c ? c.l + ',' + c.r + ',' + c.b : '', dpr].join('|');
  if (key !== galCache.key) {
    const cv = galCache.cv || (galCache.cv = document.createElement('canvas'));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const cg = cv.getContext('2d');
    cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, cv.width, cv.height); cg.setTransform(dpr, 0, 0, dpr, 0, 0);
    halftone(cg, { ox, oy, ppm, w, h, field: galF, palette: GAL_PAL, S: 6, R: GAL_R * 1.25, clip: c, jitter: 0.55 });
    galCache.key = key;
  }
  const prevA = g.globalAlpha;
  g.globalAlpha = prevA * (1 - dim);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(galCache.cv, 0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = prevA;
  const D = GAL_R * 2.3 * ppm;
  const sx = ox - NODES.gal[0] * ppm, sy = oy - NODES.gal[1] * ppm;
  if (D > 200 && D < 20000 && !S.hideSunMark) {
    ring(g, sx, sy, 7, 'rgba(236,230,216,0.6)', 1);
    label(g, 'the Sun', sx + 16, sy, { color: 'rgba(236,230,216,0.92)', size: 11 });
  }
}

/* size: nominal width (metres). minPx / maxPx: the on-screen widths a plate fades in from and out to. */
export const PLATES = [
  { id: 'fire', node: 'earth', size: 8, minPx: 24, maxPx: 80000, draw: drawFire },
  { id: 'ground', node: 'earth', size: EARTH_R * 2.1, minPx: 1, maxPx: Infinity, draw: drawGround, always: true },
  { id: 'moon', node: 'earth', size: MOON_A * 2.2, minPx: 60, maxPx: 6000, draw: drawMoon },
  { id: 'sun', node: 'sun', size: SUN_R * 2, minPx: 1, maxPx: 1e6, draw: drawSun, extent: 3 },
  { id: 'inner', node: 'sun', size: 4.8e11, minPx: 30, maxPx: 9000, draw: drawInner, extent: 0.6 },
  { id: 'outer', node: 'sun', size: 9.4e12, minPx: 30, maxPx: 8000, draw: drawOuter },
  { id: 'stars', node: 'sun', size: LY * 7000, minPx: 30, maxPx: 3e6, draw: drawStars },
  { id: 'galaxy', node: 'gal', size: GAL_R * 2.3, minPx: 10, maxPx: 4e4, draw: drawGalaxy },
];
