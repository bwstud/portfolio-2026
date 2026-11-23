/* Rope physics: position-based dynamics on chains of particles.
   Each rope is a chain of particles joined by stiff distance constraints, with a soft
   bending constraint, capsule collisions between every pair of non-adjacent segments
   (so rope can't pass through rope), and contact with the table and the rail.
   Hands are kinematic particles or soft guides; everything else is gravity and contact.
   No three.js here, so the same code runs in the page and in headless tests. */

export const TABLE = { w: 1.1, d: 0.7, t: 0.04, round: 0.012 };   // top surface at y = 0
export const BAR = { x: 0, y: 0.06, r: 0.0175, half: 0.25 };        // dowel along z

const G = -9.81;

export class Sim {
  // ropes: [{ n, seg }]  r: rope radius (m)  mat: { bend, friction, damping }
  constructor(ropes, r, mat, { bar = false } = {}) {
    this.r = r;
    this.mat = mat;
    this.bar = bar;
    this.ropes = [];
    let total = 0;
    for (const rp of ropes) {
      this.ropes.push({ start: total, n: rp.n, seg: rp.seg });
      total += rp.n;
    }
    this.N = total;
    this.pos = new Float64Array(total * 3);
    this.prev = new Float64Array(total * 3);
    this.inv = new Float64Array(total).fill(1);
    this.guide = new Float64Array(total * 3);   // soft target per particle
    this.guideW = new Float64Array(total);      // 0 = free
    this.contactN = new Float64Array(total * 3); // static contact normal this step
    this.contact = new Uint8Array(total);       // 1 static, 2 rope
    this.grips = [];                            // { i, x, y, z, k, max }
    this.rope = new Int32Array(total);
    this.local = new Int32Array(total);
    this.ropes.forEach((rp, k) => {
      for (let j = 0; j < rp.n; j++) { this.rope[rp.start + j] = k; this.local[rp.start + j] = j; }
    });
    // segments: particle a joined to a + 1 within a rope
    const segs = [];
    for (const rp of this.ropes) for (let j = 0; j < rp.n - 1; j++) segs.push(rp.start + j);
    this.segs = Int32Array.from(segs);
    this.pairs = new Int32Array(0);
    this.cell = new Map();
    this.iterations = 6;
  }

  /* ---------- one fixed substep ---------- */
  step(dt) {
    const { pos, prev, inv, N } = this;
    const damp = this.mat.damping;
    const gdt2 = G * dt * dt;
    const vmax = this.r * 0.35;          // no particle moves more than a third of a radius per step,
                                         // so rope can't tunnel through rope
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      if (inv[i] === 0) { prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2]; continue; }
      let vx = (pos[o] - prev[o]) * damp;
      let vy = (pos[o + 1] - prev[o + 1]) * damp;
      let vz = (pos[o + 2] - prev[o + 2]) * damp;
      vy += gdt2;
      const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (v > vmax) { const f = vmax / v; vx *= f; vy *= f; vz *= f; }
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
      pos[o] += vx; pos[o + 1] += vy; pos[o + 2] += vz;
    }
    this.contact.fill(0);
    this.findPairs();
    for (let it = 0; it < this.iterations; it++) {
      this.solveGuides();
      this.solveGrips();
      this.solveLengths();
      this.solveBending();
      this.solveRopeContacts();
      this.solveStatic();
    }
    this.applyFriction();
  }

  // kinematic hand: moves the particle and keeps it out of the solver
  pin(i, x, y, z) {
    const o = i * 3;
    this.inv[i] = 0;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
  }
  unpin(i) { this.inv[i] = 1; }

  solveGuides() {
    const { pos, guide, guideW, inv, N } = this;
    for (let i = 0; i < N; i++) {
      const w = guideW[i];
      if (w === 0 || inv[i] === 0) continue;
      const o = i * 3;
      pos[o] += (guide[o] - pos[o]) * w;
      pos[o + 1] += (guide[o + 1] - pos[o + 1]) * w;
      pos[o + 2] += (guide[o + 2] - pos[o + 2]) * w;
    }
  }

  // a grip pulls toward its target but can only move so far per iteration: a bounded force,
  // so a knot that has jammed stops the hand instead of being crushed through itself
  solveGrips() {
    const { pos } = this;
    for (const g of this.grips) {
      const o = g.i * 3;
      let dx = (g.x - pos[o]) * g.k, dy = (g.y - pos[o + 1]) * g.k, dz = (g.z - pos[o + 2]) * g.k;
      const d = Math.hypot(dx, dy, dz);
      if (d > g.max) { const s = g.max / d; dx *= s; dy *= s; dz *= s; }
      pos[o] += dx; pos[o + 1] += dy; pos[o + 2] += dz;
    }
  }

  solveLengths() {
    const { pos, inv, segs } = this;
    for (let s = 0; s < segs.length; s++) {
      const a = segs[s], b = a + 1;
      const wa = inv[a], wb = inv[b], w = wa + wb;
      if (w === 0) continue;
      const rest = this.ropes[this.rope[a]].seg;
      const oa = a * 3, ob = b * 3;
      const dx = pos[ob] - pos[oa], dy = pos[ob + 1] - pos[oa + 1], dz = pos[ob + 2] - pos[oa + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      const c = (d - rest) / (d * w);
      pos[oa] += dx * c * wa; pos[oa + 1] += dy * c * wa; pos[oa + 2] += dz * c * wa;
      pos[ob] -= dx * c * wb; pos[ob + 1] -= dy * c * wb; pos[ob + 2] -= dz * c * wb;
    }
  }

  // resist bending: particles two apart are pushed back toward a straight span
  solveBending() {
    const k = this.mat.bend;
    if (k <= 0) return;
    const { pos, inv } = this;
    for (const rp of this.ropes) {
      const rest = rp.seg * 2;
      for (let j = 0; j < rp.n - 2; j++) {
        const a = rp.start + j, b = a + 2;
        const wa = inv[a], wb = inv[b], w = wa + wb;
        if (w === 0) continue;
        const oa = a * 3, ob = b * 3;
        const dx = pos[ob] - pos[oa], dy = pos[ob + 1] - pos[oa + 1], dz = pos[ob + 2] - pos[oa + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        if (d >= rest) continue;
        const c = k * (d - rest) / (d * w);
        pos[oa] += dx * c * wa; pos[oa + 1] += dy * c * wa; pos[oa + 2] += dz * c * wa;
        pos[ob] -= dx * c * wb; pos[ob + 1] -= dy * c * wb; pos[ob + 2] -= dz * c * wb;
      }
    }
  }

  /* ---------- rope against rope ---------- */
  // broad phase once per substep: segment midpoints hashed into cells
  findPairs() {
    const { pos, segs } = this;
    const reach = this.ropes.reduce((m, rp) => Math.max(m, rp.seg), 0) + 2 * this.r + 0.004;
    const inv = 1 / reach;
    const cell = this.cell;
    cell.clear();
    const mid = this._mid || (this._mid = new Float64Array(segs.length * 3));
    for (let s = 0; s < segs.length; s++) {
      const oa = segs[s] * 3;
      const x = (pos[oa] + pos[oa + 3]) * 0.5, y = (pos[oa + 1] + pos[oa + 4]) * 0.5, z = (pos[oa + 2] + pos[oa + 5]) * 0.5;
      mid[s * 3] = x; mid[s * 3 + 1] = y; mid[s * 3 + 2] = z;
      const key = ((Math.floor(x * inv) * 73856093) ^ (Math.floor(y * inv) * 19349663) ^ (Math.floor(z * inv) * 83492791)) | 0;
      let list = cell.get(key);
      if (!list) cell.set(key, list = []);
      list.push(s);
    }
    const out = this._pairs || (this._pairs = []);
    out.length = 0;
    const r2 = reach * reach;
    for (let s = 0; s < segs.length; s++) {
      const x = mid[s * 3], y = mid[s * 3 + 1], z = mid[s * 3 + 2];
      const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
      const a = segs[s];
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
        const key = (((cx + ix) * 73856093) ^ ((cy + iy) * 19349663) ^ ((cz + iz) * 83492791)) | 0;
        const list = cell.get(key);
        if (!list) continue;
        for (const t of list) {
          if (t <= s) continue;
          const b = segs[t];
          if (this.rope[a] === this.rope[b] && Math.abs(b - a) < 3) continue;   // neighbours share joints
          const dx = mid[t * 3] - x, dy = mid[t * 3 + 1] - y, dz = mid[t * 3 + 2] - z;
          if (dx * dx + dy * dy + dz * dz < r2) out.push(a, b);
        }
      }
    }
    this.pairs = out;
  }

  solveRopeContacts() {
    const { pos, inv, pairs } = this;
    const D = 2 * this.r;
    for (let p = 0; p < pairs.length; p += 2) {
      const a = pairs[p], b = pairs[p + 1];
      const oa = a * 3, ob = b * 3;
      // closest points between segments a→a+1 and b→b+1
      const p1x = pos[oa], p1y = pos[oa + 1], p1z = pos[oa + 2];
      const d1x = pos[oa + 3] - p1x, d1y = pos[oa + 4] - p1y, d1z = pos[oa + 5] - p1z;
      const p2x = pos[ob], p2y = pos[ob + 1], p2z = pos[ob + 2];
      const d2x = pos[ob + 3] - p2x, d2y = pos[ob + 4] - p2y, d2z = pos[ob + 5] - p2z;
      const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
      const A = d1x * d1x + d1y * d1y + d1z * d1z;
      const E = d2x * d2x + d2y * d2y + d2z * d2z;
      const F = d2x * rx + d2y * ry + d2z * rz;
      const C = d1x * rx + d1y * ry + d1z * rz;
      const B = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = A * E - B * B;
      let s = den > 1e-14 ? clamp01((B * F - C * E) / den) : 0;
      let t = (B * s + F) / E;
      if (t < 0) { t = 0; s = clamp01(-C / A); } else if (t > 1) { t = 1; s = clamp01((B - C) / A); }
      const nx = p1x + d1x * s - (p2x + d2x * t);
      const ny = p1y + d1y * s - (p2y + d2y * t);
      const nz = p1z + d1z * s - (p2z + d2z * t);
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 >= D * D || d2 < 1e-16) continue;
      const d = Math.sqrt(d2);
      const w0 = (1 - s) * inv[a], w1 = s * inv[a + 1], w2 = (1 - t) * inv[b], w3 = t * inv[b + 1];
      const den2 = (1 - s) * w0 + s * w1 + (1 - t) * w2 + t * w3;
      if (den2 < 1e-12) continue;
      const lam = (D - d) / (d * den2);
      const ux = nx * lam, uy = ny * lam, uz = nz * lam;
      pos[oa] += ux * w0; pos[oa + 1] += uy * w0; pos[oa + 2] += uz * w0;
      pos[oa + 3] += ux * w1; pos[oa + 4] += uy * w1; pos[oa + 5] += uz * w1;
      pos[ob] -= ux * w2; pos[ob + 1] -= uy * w2; pos[ob + 2] -= uz * w2;
      pos[ob + 3] -= ux * w3; pos[ob + 4] -= uy * w3; pos[ob + 5] -= uz * w3;
      this.contact[a] |= 2; this.contact[a + 1] |= 2; this.contact[b] |= 2; this.contact[b + 1] |= 2;
    }
  }

  /* ---------- table and rail ---------- */
  solveStatic() {
    const { pos, inv, N, r } = this;
    const hx = TABLE.w / 2 - TABLE.round, hz = TABLE.d / 2 - TABLE.round, hy = TABLE.t / 2 - TABLE.round;
    const cy = -TABLE.t / 2;
    const rr = BAR.r + r;
    for (let i = 0; i < N; i++) {
      if (inv[i] === 0) continue;
      const o = i * 3;
      let x = pos[o], y = pos[o + 1], z = pos[o + 2];
      // rounded box: closest point on the inner box, then push to radius
      const qx = Math.max(-hx, Math.min(hx, x));
      const qy = Math.max(cy - hy, Math.min(cy + hy, y));
      const qz = Math.max(-hz, Math.min(hz, z));
      let dx = x - qx, dy = y - qy, dz = z - qz;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const need = TABLE.round + r;
      if (d < need) {
        if (d < 1e-9) { dx = 0; dy = 1; dz = 0; d = 1; y = qy; }
        const k = need / d;
        x = qx + dx * k; y = qy + dy * k; z = qz + dz * k;
        this.markStatic(i, dx / d, dy / d, dz / d);
      }
      if (this.bar && Math.abs(z) < BAR.half) {
        const bx = x - BAR.x, by = y - BAR.y;
        const bd = Math.sqrt(bx * bx + by * by);
        if (bd < rr) {
          const k = rr / (bd || 1e-9);
          x = BAR.x + bx * k; y = BAR.y + by * k;
          this.markStatic(i, bx / bd, by / bd, 0);
        }
      }
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    }
  }

  markStatic(i, nx, ny, nz) {
    this.contact[i] |= 1;
    const o = i * 3;
    this.contactN[o] = nx; this.contactN[o + 1] = ny; this.contactN[o + 2] = nz;
  }

  // contact friction: kill some of the sliding motion along each contact
  applyFriction() {
    const { pos, prev, contact, contactN, N } = this;
    const mu = this.mat.friction;
    for (let i = 0; i < N; i++) {
      const c = contact[i];
      if (!c) continue;
      const o = i * 3;
      let vx = pos[o] - prev[o], vy = pos[o + 1] - prev[o + 1], vz = pos[o + 2] - prev[o + 2];
      if (c & 1) {
        const nx = contactN[o], ny = contactN[o + 1], nz = contactN[o + 2];
        const vn = vx * nx + vy * ny + vz * nz;
        const k = 1 - mu * 0.6;
        vx = (vx - vn * nx) * k + vn * nx;
        vy = (vy - vn * ny) * k + vn * ny;
        vz = (vz - vn * nz) * k + vn * nz;
      }
      if (c & 2) { const k = 1 - mu * 0.25; vx *= k; vy *= k; vz *= k; }
      prev[o] = pos[o] - vx; prev[o + 1] = pos[o + 1] - vy; prev[o + 2] = pos[o + 2] - vz;
    }
  }

  // smallest gap between non-adjacent rope segments, as a fraction of the rope diameter
  minClearance() {
    this.findPairs();
    let best = Infinity;
    const { pos, pairs } = this;
    for (let p = 0; p < pairs.length; p += 2) {
      const d = segDist(pos, pairs[p] * 3, pairs[p + 1] * 3);
      if (d < best) best = d;
    }
    return best / (2 * this.r);
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function segDist(pos, oa, ob) {
  const p1x = pos[oa], p1y = pos[oa + 1], p1z = pos[oa + 2];
  const d1x = pos[oa + 3] - p1x, d1y = pos[oa + 4] - p1y, d1z = pos[oa + 5] - p1z;
  const p2x = pos[ob], p2y = pos[ob + 1], p2z = pos[ob + 2];
  const d2x = pos[ob + 3] - p2x, d2y = pos[ob + 4] - p2y, d2z = pos[ob + 5] - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
  const F = d2x * rx + d2y * ry + d2z * rz, C = d1x * rx + d1y * ry + d1z * rz;
  const B = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = A * E - B * B;
  let s = den > 1e-14 ? clamp01((B * F - C * E) / den) : 0;
  let t = (B * s + F) / E;
  if (t < 0) { t = 0; s = clamp01(-C / A); } else if (t > 1) { t = 1; s = clamp01((B - C) / A); }
  return Math.hypot(p1x + d1x * s - p2x - d2x * t, p1y + d1y * s - p2y - d2y * t, p1z + d1z * s - p2z - d2z * t);
}
