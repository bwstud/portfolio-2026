/* The clay: a stack of horizontal rings, one every 2 mm up the wheel's axis. Each ring has an outer
   and an inner radius (inner is 0 while the lump is solid), so the volume is a plain sum and every
   tool can conserve it the way real clay does: thin a wall and the clay rises, open the lump and it
   spreads, push a wall out and it gets thinner. Marks made on a still wheel live in a separate
   angle × height map of inward offsets. No three.js here, so it runs and tests in Node. */

import { TOOLS } from './data.js';

export const DY = 0.002;            // ring spacing, m
export const ROWS = 300;            // 60 cm of headroom
export const SEG = 160;             // angular resolution of the marks map and the mesh
export const MIN_WALL = 0.0028;
export const MIN_FLOOR = 0.004;
export const HEAD_R = 0.172;        // usable radius of the wheel head
export const DENSITY = 1800;        // wet clay, kg/m³

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// a pat-down lump: flat bottom, rounded shoulders, coning towards a point as it gets taller
// p is the squareness of the shoulder: a pressed-down puck is squarer than a tall cone
function lumpShape(u, taper, p = 3) {
  u = Math.min(1, Math.max(0, u));
  return Math.pow(1 - Math.pow(u, p), 1 / p) * (1 - taper * u);
}
function shapeFactor(taper, p = 3) {   // ∫ shape² du, so V = π R² h · factor
  let s = 0;
  for (let i = 0; i < 64; i++) { const v = lumpShape((i + 0.5) / 64, taper, p); s += v * v; }
  return s / 64;
}
// the ring of wall whose cross-section is area/2π, centred on mid, kept off the axis
function ringAt(mid, area) {
  let t = area / mid;
  if (mid - t / 2 < 0.0015) { mid = (0.0015 + Math.sqrt(0.0015 * 0.0015 + 2 * area)) / 2; t = area / mid; }
  return [mid + t / 2, mid - t / 2];
}

export class Clay {
  constructor() {
    this.ro = new Float32Array(ROWS + 2);
    this.ri = new Float32Array(ROWS + 2);
    this.ring = new Float32Array(ROWS + 2);     // throwing-line amplitude, m
    this.strain = new Float32Array(ROWS + 2);   // >1 means that ring of wall is giving way
    this.marks = null;                          // Float32Array(SEG × (ROWS+1)), inward is negative
    this.height = 0;
    this.wet = 0.55;
    this.offset = 0;                            // off-centre, m
    this.rim = 0.4;                             // 0 a square-cut rim, 1 fully rounded
    this.body = null;
    this.firm = false;                          // leather-hard: no more sagging
    this.collapsing = 0;
    this.events = [];                           // things the UI should hear about once
    this.scale = new Float32Array(ROWS + 2);
  }

  /* ---------- reading ---------- */
  get n() { return Math.min(ROWS, Math.floor(this.height / DY + 1e-6)); }
  get hollow() { return this.ri[this.n] > 0; }
  floorRow() {
    let k = this.n;
    if (!(this.ri[k] > 0)) return -1;
    while (k > 0 && this.ri[k - 1] > 0) k--;
    return k;
  }
  floorY() { const k = this.floorRow(); return k < 0 ? this.height : k * DY; }
  volume() {
    const { ro, ri } = this, n = this.n;
    let v = 0;
    for (let k = 0; k < n; k++) v += (ro[k] * ro[k] - ri[k] * ri[k]) * DY;
    v += (ro[n] * ro[n] - ri[n] * ri[n]) * (this.height - n * DY);
    return Math.PI * v;
  }
  kg() { return this.volume() * DENSITY; }
  sample(arr, y) {
    const n = this.n, f = clamp(y / DY, 0, n), i = Math.min(Math.floor(f), n), t = f - i;
    return i >= n ? arr[n] : arr[i] + (arr[i + 1] - arr[i]) * t;
  }
  // a summary for the UI: wall thickness, rim, floor, widest point
  stats() {
    const n = this.n, kf = this.floorRow();
    let minT = Infinity, minAt = 0, sumT = 0, cnt = 0, maxR = 0, maxStrain = 0, strainAt = 0;
    for (let k = 0; k <= n; k++) {
      maxR = Math.max(maxR, this.ro[k]);
      if (kf >= 0 && k > kf + 2 && k < n - 1) {
        const t = this.ro[k] - this.ri[k];
        sumT += t; cnt++;
        if (t < minT) { minT = t; minAt = k * DY; }
      }
      if (this.strain[k] > maxStrain) { maxStrain = this.strain[k]; strainAt = k * DY; }
    }
    return {
      kg: this.kg(), height: this.height, hollow: kf >= 0, floor: kf >= 0 ? kf * DY : 0,
      rim: this.ro[n] * 2, rimInner: this.ri[n] * 2, width: maxR * 2,
      minWall: cnt ? minT : 0, minWallAt: minAt, avgWall: cnt ? sumT / cnt : 0,
      wet: this.wet, offset: this.offset, maxStrain, strainAt,
    };
  }

  /* ---------- making ---------- */
  lump(kg, body) {
    this.body = body;
    this.ro.fill(0); this.ri.fill(0); this.ring.fill(0); this.strain.fill(0);
    this.marks = null;
    const V = kg / DENSITY, aspect = 0.8, c = shapeFactor(0);
    const R = Math.cbrt(V / (Math.PI * aspect * c));
    this.height = R * aspect;
    for (let k = 0; k <= this.n; k++) this.ro[k] = R * lumpShape(k * DY / this.height, 0);
    this.normalize(V);
    this.wet = 0.55; this.offset = 0.007; this.rim = 0.4; this.firm = false; this.collapsing = 0; this.collapsed = false;
    return this;
  }

  snapshot() {
    const n = this.n + 1;
    return {
      ro: this.ro.slice(0, n), ri: this.ri.slice(0, n), ring: this.ring.slice(0, n),
      height: this.height, wet: this.wet, offset: this.offset, rim: this.rim, marks: this.marks,
    };
  }
  restore(s) {
    this.ro.fill(0); this.ri.fill(0); this.ring.fill(0); this.strain.fill(0);
    this.ro.set(s.ro); this.ri.set(s.ri); this.ring.set(s.ring);
    Object.assign(this, { height: s.height, wet: s.wet, offset: s.offset, rim: s.rim, marks: s.marks, collapsing: 0, collapsed: false, sagging: false });
    this.updateStrain();
  }

  // scale a solid lump's radii so it holds exactly V
  normalize(V) {
    const v = this.volume();
    if (v <= 0) return;
    const f = Math.sqrt(V / v);
    for (let k = 0; k <= this.n; k++) this.ro[k] *= f;
  }

  // add (or remove) clay at the top: an open piece gets taller at its rim, a solid lump stretches
  grow(dv) {
    if (Math.abs(dv) < 1e-12) return;
    const { ro, ri, ring } = this, n = this.n;
    const a = Math.PI * (ro[n] * ro[n] - ri[n] * ri[n]);
    if (ri[n] > 0 && a > 1e-6) {
      const h = clamp(this.height + dv / a, this.floorY() + 0.004, ROWS * DY);
      const m = Math.min(ROWS, Math.floor(h / DY + 1e-6));
      for (let k = n + 1; k <= m; k++) { ro[k] = ro[n]; ri[k] = ri[n]; ring[k] = ring[n] * 0.7; }
      for (let k = m + 1; k <= ROWS + 1; k++) { ro[k] = 0; ri[k] = 0; ring[k] = 0; }
      this.height = h;
    } else {
      const v = this.volume();
      if (v > 0) this.stretch(Math.max(0.2, (v + dv) / v));
    }
  }
  stretch(f) {
    const old = this.ro.slice(), oldR = this.ring.slice(), n0 = this.n, h = Math.min(ROWS * DY, this.height * f);
    const m = Math.floor(h / DY + 1e-6);
    const at = (arr, y) => { const g = clamp(y / DY, 0, n0), i = Math.min(Math.floor(g), n0), t = g - i; return i >= n0 ? arr[n0] : arr[i] + (arr[i + 1] - arr[i]) * t; };
    for (let k = 0; k <= m; k++) { this.ro[k] = at(old, k * DY / f); this.ring[k] = at(oldR, k * DY / f); }
    for (let k = m + 1; k <= ROWS + 1; k++) { this.ro[k] = 0; this.ring[k] = 0; }
    this.height = h;
  }

  // each ring k now spans scale[k] times its old height: resample so everything above moves with it
  restack(scale) {
    const n = this.n;
    let moved = false;
    for (let k = 0; k <= n; k++) if (Math.abs(scale[k] - 1) > 1e-7) { moved = true; break; }
    if (!moved) return;
    const Y = new Float64Array(n + 1);
    for (let k = 1; k <= n; k++) Y[k] = Y[k - 1] + DY * (scale[k - 1] + scale[k]) / 2;
    const top = Math.min(ROWS * DY, Y[n] + (this.height - n * DY) * scale[n]);
    const ro = this.ro.slice(0, n + 1), ri = this.ri.slice(0, n + 1), rg = this.ring.slice(0, n + 1);
    const m = Math.min(ROWS, Math.floor(top / DY + 1e-6));
    let i = 0;
    for (let j = 0; j <= m; j++) {
      const y = j * DY;
      while (i < n - 1 && Y[i + 1] <= y) i++;
      const f = n > 0 ? clamp((y - Y[i]) / Math.max(1e-9, Y[i + 1] - Y[i]), 0, 1) : 0, i1 = Math.min(n, i + 1);
      this.ro[j] = ro[i] + (ro[i1] - ro[i]) * f;
      this.ri[j] = ri[i] > 0 && ri[i1] > 0 ? ri[i] + (ri[i1] - ri[i]) * f : (f < 0.5 ? ri[i] : ri[i1]);
      this.ring[j] = rg[i] + (rg[i1] - rg[i]) * f;
    }
    for (let j = m + 1; j <= ROWS + 1; j++) { this.ro[j] = 0; this.ri[j] = 0; this.ring[j] = 0; }
    this.height = top;
  }

  // keep the shape physical: an unbroken opening from the rim down, walls never thinner than clay
  // can be, nothing past the edge of the wheel head
  fix() {
    const { ro, ri } = this, n = this.n;
    if (!(ri[n] > 0)) { for (let k = 0; k <= n; k++) ri[k] = 0; }
    else {
      let k = n;
      while (k > 0 && ri[k - 1] > 0) k--;
      for (let j = 0; j < k; j++) ri[j] = 0;
      if (k * DY < MIN_FLOOR) {               // never open right through the floor
        for (let j = k; j * DY < MIN_FLOOR && j <= n; j++) ri[j] = 0;
      }
    }
    for (let k = 0; k <= n; k++) {
      ro[k] = Math.min(ro[k], HEAD_R);
      if (ri[k] > 0) ri[k] = clamp(ri[k], 0.0015, ro[k] - MIN_WALL * 0.6);
    }
  }

  /* ---------- tools ----------
     begin() when a hand or tool first touches; apply() every frame it stays on.
     s: { r, y, pr, py (last frame's cursor), dt, p (pressure 0–1.5), size, rpm }
     Returns a short warning for the UI, or ''. */
  begin(tool, r, y) {
    const k = clamp(Math.round(y / DY), 0, this.n);
    this.st = { tool, r0: r, y0: y, h0: this.height, V0: this.volume(), mid0: this.ri[k] > 0 ? (this.ro[k] + this.ri[k]) / 2 : r };
  }
  apply(tool, s) {
    const st = this.st || { r0: s.r, y0: s.y, h0: this.height, mid0: s.r };
    const T = TOOLS[tool], body = this.body;
    const spinF = T.min ? clamp(s.rpm / T.min, 0, 1) : 1;
    const wetF = clamp(this.wet / 0.18, 0.3, 1);
    const grabby = this.wet < 0.12 && ['center', 'open', 'pull', 'shape'].includes(tool);
    let warn = '';
    if (T.min && s.rpm < 4) return 'Spin the wheel to use this. Space starts it.';
    if (grabby && s.rpm > 20) {
      this.offset = Math.min(0.02, this.offset + s.dt * 0.004);
      warn = 'The clay is dry and grabbing your hands. Add water (W).';
    }
    const { ro, ri, ring } = this;
    const n = this.n, sig = s.size, kf = this.floorRow();
    const band = (from = 0) => [Math.max(from, Math.floor((s.y - 3 * sig) / DY)), Math.min(n, Math.ceil((s.y + 3 * sig) / DY))];
    const gauss = k => { const d = (k * DY - s.y) / sig; return Math.exp(-d * d); };

    switch (tool) {
      case 'center': {
        this.offset *= Math.exp(-s.dt * spinF * s.p * wetF * 2.2);
        if (this.offset < 0.0006) this.offset = 0;
        for (let k = 0; k <= n; k++) ring[k] *= Math.exp(-s.dt * 3 * spinF);
        if (kf >= 0) { if (!warn) warn = this.offset ? '' : 'Centred. An open piece can be centred but not coned.'; break; }
        const V = this.volume();
        const R0 = Math.sqrt(V / (Math.PI * Math.max(0.01, st.h0) * shapeFactor(0)));
        const hT = clamp(st.h0 + (s.y - st.y0) * 1.2, 0.25 * R0, 0.3);
        const taper = clamp((hT / R0 - 1) / 2.5, 0, 0.45), sq = clamp(3 + (1 - hT / R0) * 6, 3, 7);
        const c = shapeFactor(taper, sq);
        let R = Math.sqrt(V / (Math.PI * hT * c));
        if (R > HEAD_R - 0.01) R = HEAD_R - 0.01;
        if (R < 0.02) return 'That is as tall as this much clay will cone.';
        const a = 1 - Math.exp(-s.dt * spinF * s.p * wetF * 2.4);
        const h = this.height + (hT - this.height) * a;
        const m = Math.min(ROWS, Math.floor(Math.max(h, this.height) / DY) + 1);
        for (let k = 0; k <= m; k++) {
          const target = k * DY <= hT ? R * lumpShape(k * DY / hT, taper, sq) : 0;
          ro[k] += (target - ro[k]) * a;
        }
        this.height = h;
        for (let k = this.n + 1; k <= ROWS + 1; k++) ro[k] = 0;
        this.normalize(V);
        this.wet = Math.max(0, this.wet - s.dt * 0.01);
        break;
      }

      case 'open': {
        if (s.y > this.height + 0.01) return 'Press down into the top of the clay.';
        const yF = clamp(s.y, MIN_FLOOR, this.height - 0.004);
        const W = clamp(s.r, 0.005, HEAD_R);
        if (W > this.sample(ro, yF) - MIN_WALL * 2) return 'That is past the wall. Stay inside it.';
        // a fresh lump has a domed top too narrow to open: press it flat into the shoulders first
        if (kf < 0) {
          const V = this.volume();
          let k = n;
          while (k > 0 && ro[k] < W + 0.009) k--;
          if (k < n) { this.height = k * DY; for (let j = k + 1; j <= ROWS + 1; j++) ro[j] = 0; this.normalize(V); }
        }
        const a = 1 - Math.exp(-s.dt * 3.2 * s.p * spinF * wetF * (body?.plastic ?? 1));
        const n2 = this.n;
        for (let k = Math.ceil(yF / DY); k <= n2; k++) {
          const y = k * DY, u = (y - yF) / (0.5 * W + 0.004);
          let tr = W * Math.sqrt(clamp(u, 0, 1));
          tr = Math.min(tr, ro[k] - MIN_WALL * 2.5);
          if (tr <= ri[k]) continue;
          if (ri[k] === 0 && tr < 0.002) continue;
          const r2 = ri[k] + (tr - ri[k]) * a;
          ro[k] = Math.min(HEAD_R, Math.sqrt(ro[k] * ro[k] + r2 * r2 - ri[k] * ri[k]));
          ri[k] = r2;
        }
        this.wet = Math.min(1, this.wet + s.dt * 0.01);
        if (yF < 0.006) warn ||= `Floor ${(yF * 1000).toFixed(0)} mm. Any thinner and it may crack.`;
        else if (this.offset > 0.003) warn ||= 'Still off-centre: the walls will come up uneven.';
        break;
      }

      case 'pull': {
        if (kf < 0) return 'Open the clay first, then pull up the wall.';
        // the hands ride the wall straight up from where they started; drift sideways to flare or collar
        const swept = Math.abs(s.y - s.py) + s.dt * 0.002;
        const guide = st.mid0 + (s.r - st.r0);
        const [k0, k1] = band(kf + 1);
        const scale = this.scale.fill(1, 0, n + 2);
        for (let k = k0; k <= k1; k++) {
          if (!(ri[k] > 0)) continue;
          const t = ro[k] - ri[k], mid = (ro[k] + ri[k]) / 2;
          const a = clamp(swept / sig * 0.16 * s.p * (body?.plastic ?? 1) * spinF * wetF * gauss(k), 0, 0.4);
          const t2 = t <= MIN_WALL ? t : Math.max(MIN_WALL, t - (t - MIN_WALL) * a);
          const mid2 = clamp(mid + (guide - mid) * Math.min(1, a * 2.5), t2 / 2 + 0.003, HEAD_R - t2 / 2);
          ro[k] = mid2 + t2 / 2; ri[k] = mid2 - t2 / 2;
          scale[k] = (mid * t) / (mid2 * t2);             // the thinned ring stretches; the wall above rides up
          ring[k] += (0.00026 - ring[k]) * Math.min(1, a * 3);
        }
        // a pull that starts at the base gathers the spare clay round the foot up into the wall
        const kw = Math.min(n, kf + 2), lip = ro[kw] + 0.002;
        let gathered = 0;
        for (let k = Math.max(0, k0 - 6); k <= kf; k++) {
          if (ro[k] <= lip) continue;
          const a = clamp(swept / sig * 0.4 * s.p * spinF * wetF * Math.max(gauss(k), 0.5), 0, 0.5);
          const r2 = ro[k] - (ro[k] - lip) * a;
          gathered += Math.PI * (ro[k] * ro[k] - r2 * r2) * DY;
          ro[k] = r2;
        }
        if (gathered > 0) {
          const area = Math.PI * (ro[kf + 1] ** 2 - ri[kf + 1] ** 2) * DY;
          if (area > 0) scale[kf + 1] += gathered / area;
        }
        this.restack(scale);
        this.wet = Math.min(1, this.wet + swept * 0.25);
        if (this.offset > 0.003) warn ||= 'Off-centre: the wall will thin unevenly. Centre it first.';
        break;
      }

      case 'shape': {
        const d = (s.r - s.pr) * spinF * wetF;
        if (Math.abs(d) < 1e-7) break;
        const [k0, k1] = band(0);
        const scale = this.scale.fill(1, 0, n + 2);
        for (let k = k0; k <= k1; k++) {
          const w = gauss(k);
          if (ri[k] > 0) {
            const t = ro[k] - ri[k], mid = (ro[k] + ri[k]) / 2;
            // the same clay spread round a bigger ring gets thinner
            [ro[k], ri[k]] = ringAt(clamp(mid + d * w, 0.004, HEAD_R - t / 2), t * mid);
          } else if (k <= n) {
            const r2 = clamp(ro[k] + d * w, 0.006, HEAD_R);
            scale[k] = (ro[k] * ro[k]) / (r2 * r2);         // squeezed in, a solid lump gets taller
            ro[k] = r2;
          }
        }
        this.restack(scale);
        break;
      }

      case 'rib':
      case 'loop': {
        const k = clamp(Math.round(s.y / DY), 0, n);
        const inner = kf >= 0 && k >= kf && s.r < (ro[k] + ri[k]) / 2;
        const arr = inner ? ri : ro;
        const [k0, k1] = band(inner ? kf : 0);
        const lam = 1 - Math.exp(-s.dt * (tool === 'rib' ? 5 : 14) * spinF * Math.min(1.2, s.p + 0.2));
        const old = arr.slice(Math.max(0, k0 - 2), k1 + 3), off = Math.max(0, k0 - 2);
        const at = j => old[clamp(j, k0, k1) - off];
        for (let j = k0; j <= k1; j++) {
          if (inner && !(ri[j] > 0)) continue;
          const w = gauss(j);
          if (tool === 'rib') {
            const avg = (at(j - 2) + at(j - 1) + at(j + 1) + at(j + 2)) / 4;
            arr[j] += (avg - arr[j]) * lam * w;
            ring[j] *= 1 - Math.min(1, lam * w * 1.6);
          }
          const depth = tool === 'rib' ? 0.6 : 1;
          if (!inner && s.r < ro[j]) ro[j] -= (ro[j] - Math.max(s.r, ri[j] + MIN_WALL)) * lam * w * depth;
          if (inner && s.r > ri[j]) ri[j] += (Math.min(s.r, ro[j] - MIN_WALL) - ri[j]) * lam * w * depth;
        }
        if (tool === 'rib') this.wet = Math.max(0, this.wet - s.dt * 0.04 * Math.min(1, s.p));
        break;
      }

      case 'sponge': {
        this.wet = Math.max(0, this.wet - s.dt * 0.3 * s.p);
        const [k0, k1] = band(0);
        for (let k = k0; k <= k1; k++) ring[k] *= 1 - Math.min(1, s.dt * 1.5 * gauss(k));
        if (Math.abs(s.y - this.height) < 0.012 && s.rpm > 10) this.rim = Math.min(1, this.rim + s.dt * 0.8);
        break;
      }
      default: break;
    }
    this.fix();
    // hands move clay, they don't make or lose it: settle any rounding at the rim
    if (st.V0 && (tool === 'pull' || tool === 'shape' || tool === 'open')) {
      const dv = st.V0 - this.volume();
      if (Math.abs(dv) > st.V0 * 1e-4) this.grow(dv);
    }
    this.updateStrain();
    return warn;
  }

  // cut everything above y; returns the removed ring so it can be shown falling away
  cut(y) {
    const kf = this.floorRow();
    if (y >= this.height - 0.0005) return { warn: 'That is above the rim.' };
    if (kf >= 0 && y < kf * DY + 0.006) return { warn: 'That would cut through the floor.' };
    y = Math.max(0.006, y);
    const k0 = Math.floor(y / DY), n = this.n;
    const removed = { ro: this.ro.slice(k0, n + 1), ri: this.ri.slice(k0, n + 1), y0: k0 * DY, height: this.height };
    this.height = y;
    for (let k = this.n + 1; k <= ROWS + 1; k++) { this.ro[k] = 0; this.ri[k] = 0; this.ring[k] = 0; }
    this.rim = 0.1;
    this.fix();
    this.updateStrain();
    return { removed };
  }

  // carve or press into the outer wall. theta in radians, around the clay's own axis.
  // ring: the wheel is turning, so the mark goes all the way round.
  mark(theta, y, depth, sig, ring) {
    if (!this.marks) this.marks = new Float32Array(SEG * (ROWS + 1));
    const M = this.marks, n = this.n, { ro, ri } = this;
    const k0 = Math.max(0, Math.floor((y - 3 * sig) / DY)), k1 = Math.min(n, Math.ceil((y + 3 * sig) / DY));
    for (let k = k0; k <= k1; k++) {
      const r = Math.max(0.005, ro[k]);
      const limit = ri[k] > 0 ? Math.max(0, ro[k] - ri[k] - MIN_WALL) : 0.012;
      const dyk = (k * DY - y) / sig, gy = Math.exp(-dyk * dyk);
      if (gy < 0.02) continue;
      const span = ring ? SEG : Math.min(SEG, Math.ceil(3 * sig / r / (TAU / SEG)));
      const jc = Math.round(((theta % TAU + TAU) % TAU) / TAU * SEG);
      for (let dj = ring ? 0 : -span; dj <= (ring ? SEG - 1 : span); dj++) {
        const j = ((jc + dj) % SEG + SEG) % SEG;
        const arc = ring ? 0 : (dj * TAU / SEG) * r / sig;
        const g = gy * Math.exp(-arc * arc);
        const i = k * SEG + j;
        M[i] = Math.max(-limit, Math.min(M[i], -depth * g));
      }
    }
  }

  /* ---------- the clay left to itself ---------- */
  step(dt, rpm) {
    if (this.height <= 0) return;
    const body = this.body;
    this.wet = Math.max(0, this.wet - dt * 0.0035 * (body?.thirst ?? 1) * (0.4 + rpm / 150));
    if (this.firm) return;
    const kf = this.floorRow();
    if (kf < 0) return;
    const { ro, ri } = this;
    // spun too fast, a tall wall flares outward
    if (rpm > 170) {
      const k = dt * 0.004 * ((rpm - 170) / 80) ** 2, n = this.n, span = Math.max(DY, this.height - kf * DY);
      for (let j = kf + 1; j <= n; j++) {
        const t = ro[j] - ri[j], mid = (ro[j] + ri[j]) / 2;
        [ro[j], ri[j]] = ringAt(Math.min(HEAD_R - t / 2, mid + k * ((j - kf) * DY / span) ** 2), t * mid);
      }
      this.moved = true;
    }
    this.updateStrain();
    let worst = -1, ws = 1;
    for (let k = kf + 1; k <= this.n; k++) if (this.strain[k] > ws) { ws = this.strain[k]; worst = k; }
    if (!this.collapsing && !this.collapsed && ws > 1.9) { this.collapsing = 0.8; this.collapsed = true; this.events.push('collapse'); }
    if (this.collapsing > 0) {
      this.collapsing = Math.max(0, this.collapsing - dt);
      if (worst < 0) worst = Math.max(kf + 1, Math.floor(this.n * 0.4));
      this.sag(worst, dt * 1.3);
    } else if (worst > 0) {
      this.sag(worst, Math.min(0.02, (ws - 1) * dt * 0.35));
      if (!this.sagging) this.events.push('sag');
      this.sagging = true;
    } else this.sagging = false;
  }

  // the wall above ring k leans over by angle a, pivoting on k
  sag(k, a) {
    const { ro, ri, ring } = this, n = this.n;
    if (k >= n) return;
    const km = Math.max(0, k - 3), kp = Math.min(n, k + 3);
    const lean = ((ro[kp] + ri[kp]) - (ro[km] + ri[km])) >= 0 ? 1 : -1;
    const c = Math.cos(a), s = Math.sin(a) * lean;
    const mk = (ro[k] + ri[k]) / 2, yk = k * DY;
    const ys = [], ms = [], ts = [], rs = [];
    for (let j = k; j <= n; j++) {
      const dx = (ro[j] + ri[j]) / 2 - mk, dy = (j === n ? this.height : j * DY) - yk;
      const x2 = dx * c + dy * s, y2 = -dx * s + dy * c;
      const area = (ro[j] - ri[j]) * (ro[j] + ri[j]) / 2;          // cross-section × mid, conserved
      ys.push(yk + Math.max(0, y2)); ms.push(clamp(mk + x2, 0.004, HEAD_R)); ts.push(area); rs.push(ring[j]);
    }
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 1e-5);
    const top = ys[ys.length - 1];
    let i = 0;
    const m = Math.min(ROWS, Math.floor(top / DY + 1e-6));
    for (let j = k + 1; j <= m; j++) {
      const y = j * DY;
      while (i < ys.length - 2 && ys[i + 1] < y) i++;
      const f = clamp((y - ys[i]) / Math.max(1e-6, ys[i + 1] - ys[i]), 0, 1);
      const mid = ms[i] + (ms[i + 1] - ms[i]) * f, area = ts[i] + (ts[i + 1] - ts[i]) * f;
      [ro[j], ri[j]] = ringAt(mid, area); ring[j] = rs[i];
    }
    for (let j = m + 1; j <= ROWS + 1; j++) { ro[j] = 0; ri[j] = 0; ring[j] = 0; }
    this.height = clamp(top, (k + 1) * DY, ROWS * DY);
    this.fix();
    this.moved = true;
  }

  updateStrain() {
    const { ro, ri, strain } = this, n = this.n, kf = this.floorRow();
    strain.fill(0);
    if (kf < 0) return;
    const strength = this.body?.strength ?? 1;
    for (let k = kf + 1; k <= n; k++) {
      const t = Math.max(1e-4, ro[k] - ri[k]);
      const km = Math.max(kf, k - 4), kp = Math.min(n, k + 4);
      const s = kp > km ? ((ro[kp] + ri[kp]) - (ro[km] + ri[km])) / 2 / ((kp - km) * DY) : 0;
      const above = this.height - k * DY;
      const thin = MIN_WALL * 0.85 / t;
      const lean = Math.abs(s) * (0.5 + above / 0.1) * (0.45 + this.wet) * (0.0065 / t) * 0.8 / strength;
      strain[k] = Math.max(thin, lean);
    }
  }
}

