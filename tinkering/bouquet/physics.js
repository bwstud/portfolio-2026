/* Stems in a vase: extended position-based dynamics (XPBD) with small steps.

   Each stem is a chain of particles from the cut end up to the top of the stem, plus one more
   particle for the flower head: heavy, with a collision radius the size of the bloom, held a few
   centimetres beyond the stem top. Segments keep their length exactly; bending is a vector
   constraint at every interior particle whose compliance comes from the stem's real flexural
   rigidity (EI), so a rose stem is as stiff as a rose stem and a heavy head nods on its neck.

   Contacts are with the vase (floor, wall, rounded lip), the tape grid across the mouth, the
   table, and other stems and heads. Friction is what lets a stem rest leaning on the rim rather
   than sliding down it. Below the water line motion is damped, the way water calms a stem.

   No three.js here, so the same code runs in the page and in Node tests. Units: metres, kg, s. */

const G = -9.81;
const MAX_PUSH = 0.0006;      // most an overlap between two bodies is undone in one substep (m)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Sim {
  constructor(vase) {
    this.vase = vase;            // { floorY, rimY, rIn, rOut, lipR, waterY, tape: [{ax,az,bx,bz,y,r}] }
    this.cap = 4096;
    this.pos = new Float64Array(this.cap * 3);
    this.prev = new Float64Array(this.cap * 3);
    this.vel = new Float64Array(this.cap * 3);
    this.inv = new Float64Array(this.cap);
    this.rad = new Float64Array(this.cap);
    this.inside = new Uint8Array(this.cap);     // 1 while the particle is inside the vase
    this.n = 0;
    this.stems = [];             // { id, start, n, seg[], comp[], head, mu, ... }
    this.guides = [];            // { i, x, y, z, comp }
    this.substeps = 32;
    this.awake = 0;              // frames of motion left before sleeping is considered
    this.calm = 0;
  }

  /* A stem from points (bottom first), the last point being the head centre.
     spec: { radius, lin (kg/m), EI (N m²), neckEI, headMass, headR, mu } */
  addStem(points, spec, id) {
    const n = points.length;
    this.ensure(this.n + n);
    const start = this.n;
    const seg = [], comp = [];
    for (let k = 0; k < n; k++) {
      const i = start + k, o = i * 3, p = points[k];
      this.pos[o] = this.prev[o] = p[0];
      this.pos[o + 1] = this.prev[o + 1] = p[1];
      this.pos[o + 2] = this.prev[o + 2] = p[2];
      this.vel[o] = this.vel[o + 1] = this.vel[o + 2] = 0;
      this.rad[i] = spec.radius;
      this.inside[i] = this.isInside(p[0], p[1], p[2]) ? 1 : 0;
    }
    for (let k = 0; k < n - 1; k++) {
      const a = points[k], b = points[k + 1];
      seg.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    // masses: stem tissue shared between neighbours, the head carries the bloom
    for (let k = 0; k < n; k++) {
      const i = start + k;
      if (k === n - 1) { this.inv[i] = 1 / spec.headMass; this.rad[i] = spec.headR; continue; }
      const l = (k > 0 ? seg[k - 1] : 0) * 0.5 + (k < n - 2 ? seg[k] : 0) * 0.5 || seg[0] * 0.5;
      // the cut end carries the whole stem's weight onto the floor; a light particle under a heavy
      // chain converges badly, so it gets a few grams (roughly the water it holds in the base)
      this.inv[i] = 1 / Math.max(k === 0 ? 0.006 : 1e-5, l * spec.lin);
    }
    const stem = { id, start, n, seg, comp, mu: spec.mu ?? 0.4, spec };
    stem.bends = bendStencils(seg, spec);
    this.stems.push(stem);
    this.n += n;
    this.wake();
    return stem;
  }

  removeStem(id) {
    const keep = this.stems.filter(s => s.id !== id);
    if (keep.length === this.stems.length) return;
    const snap = keep.map(s => ({ s, pts: this.points(s), vel: this.velocities(s) }));
    this.stems = []; this.n = 0;
    for (const { s, pts, vel } of snap) {
      const ns = this.addStem(pts, s.spec, s.id);
      ns.seg = s.seg; ns.comp = s.comp;   // keep rest lengths exactly
      for (let k = 0; k < ns.n; k++) for (let c = 0; c < 3; c++) this.vel[(ns.start + k) * 3 + c] = vel[k][c];
    }
    this.guides = [];
    this.wake();
  }

  ensure(n) {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    const grow = (A, k) => { const B = new A.constructor(cap * k); B.set(A); return B; };
    this.pos = grow(this.pos, 3); this.prev = grow(this.prev, 3); this.vel = grow(this.vel, 3);
    this.inv = grow(this.inv, 1); this.rad = grow(this.rad, 1); this.inside = grow(this.inside, 1);
    this.cap = cap;
  }

  points(stem) {
    const out = [];
    for (let k = 0; k < stem.n; k++) { const o = (stem.start + k) * 3; out.push([this.pos[o], this.pos[o + 1], this.pos[o + 2]]); }
    return out;
  }
  velocities(stem) {
    const out = [];
    for (let k = 0; k < stem.n; k++) { const o = (stem.start + k) * 3; out.push([this.vel[o], this.vel[o + 1], this.vel[o + 2]]); }
    return out;
  }
  stem(id) { return this.stems.find(s => s.id === id); }

  isInside(x, y, z) {
    const v = this.vase;
    return y < v.rimY + v.lipR && Math.hypot(x, z) < (v.rIn + v.rOut) * 0.5;
  }

  wake(frames = 60) { this.awake = Math.max(this.awake, frames); this.calm = 0; this.age = 0; }
  get sleeping() { return this.awake <= 0 && this.guides.length === 0; }

  setGuide(i, x, y, z, comp = 0) {
    const g = this.guides.find(g => g.i === i);
    if (g) Object.assign(g, { x, y, z, comp });
    else this.guides.push({ i, x, y, z, comp, lambda: 0 });
    this.wake();
  }
  clearGuides() { this.guides = []; this.wake(); }

  /* ---------- the step ---------- */
  step(dt = 1 / 60) {
    if (this.sleeping) return 0;
    const h = dt / this.substeps;
    const n3 = this.n * 3;
    if (!this.frameStart || this.frameStart.length < n3) this.frameStart = new Float64Array(this.cap * 3);
    this.frameStart.set(this.pos.subarray(0, n3));
    for (let s = 0; s < this.substeps; s++) this.substep(h);
    let moved = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      const d = Math.abs(this.pos[o] - this.frameStart[o]) + Math.abs(this.pos[o + 1] - this.frameStart[o + 1]) + Math.abs(this.pos[o + 2] - this.frameStart[o + 2]);
      if (d > moved) moved = d;
    }
    if (this.guides.length) { this.awake = Math.max(this.awake, 30); this.age = 0; }
    // sleep once nothing moves faster than ~1.5 mm/s (3.5 mm/s once settling damping is on) for
    // half a second, or after 12 s regardless (contact jitter would otherwise keep it awake forever)
    this.age = (this.age || 0) + 1;
    // the threshold relaxes as settling damping comes on: what's left is contact creep
    const still = this.age > 120 ? 6e-5 : 2.5e-5;
    if (moved < still) this.calm++; else this.calm = 0;
    this.awake--;
    if ((this.calm > 30 && this.awake <= 0) || this.age > 720) this.awake = 0;
    else this.awake = Math.max(this.awake, 1);
    return moved;
  }

  substep(h) {
    const { pos, prev, vel, inv, n } = this;
    const v = this.vase;
    // settling: after a second with nobody holding a stem, damping rises over the next second,
    // the way contact friction quickly takes the last motion out of a real arrangement
    const age = this.guides.length ? 0 : this.age || 0;
    const settle = Math.min(1, Math.max(0, (age - 60) / 60));
    const air = 0.8 + 7 * settle * settle;
    // predict
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
      if (inv[i] === 0) continue;
      const wet = this.inside[i] && pos[o + 1] < v.waterY;
      const damp = Math.exp(-(wet ? 9 + air : air) * h);
      vel[o] *= damp; vel[o + 1] = (vel[o + 1] + G * h) * damp; vel[o + 2] *= damp;
      pos[o] += vel[o] * h; pos[o + 1] += vel[o + 1] * h; pos[o + 2] += vel[o + 2] * h;
    }
    for (const g of this.guides) g.lambda = 0;

    for (const st of this.stems) this.solveStatic(st);      // contacts first and last: the stem
    for (const st of this.stems) this.solveStem(st, h);      // constraints in between can't undo them
    this.solveGuides(h);
    this.solveStemContacts();
    for (const st of this.stems) this.solveStatic(st);

    // velocities from positions; track the largest move
    let moved = 0;
    const ih = 1 / h;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const dx = pos[o] - prev[o], dy = pos[o + 1] - prev[o + 1], dz = pos[o + 2] - prev[o + 2];
      vel[o] = dx * ih; vel[o + 1] = dy * ih; vel[o + 2] = dz * ih;
      const d = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (d > moved) moved = d;
      // inside/outside the vase only changes over the lip
      const r = Math.hypot(pos[o], pos[o + 2]);
      if (pos[o + 1] > v.rimY + v.lipR + this.rad[i]) this.inside[i] = 0;
      if (pos[o + 1] > v.rimY - v.lipR && r < v.rIn) this.inside[i] = 1;
    }
    return moved;
  }

  solveStem(st, h) {
    const { pos, inv } = this;
    const { start, n, seg, comp } = st;
    // stretch: exact
    for (let k = 0; k < n - 1; k++) {
      const a = start + k, b = a + 1, oa = a * 3, ob = b * 3;
      const wa = inv[a], wb = inv[b], w = wa + wb;
      if (w === 0) continue;
      const dx = pos[ob] - pos[oa], dy = pos[ob + 1] - pos[oa + 1], dz = pos[ob + 2] - pos[oa + 2];
      const len = Math.hypot(dx, dy, dz) || 1e-9;
      const c = (len - seg[k]) / (len * w);
      pos[oa] += wa * c * dx; pos[oa + 1] += wa * c * dy; pos[oa + 2] += wa * c * dz;
      pos[ob] -= wb * c * dx; pos[ob + 1] -= wb * c * dy; pos[ob + 2] -= wb * c * dz;
    }
    // bending: C = (x[k-m] + x[k+m]) / 2 - x[k] = 0, a linear vector constraint, at several spans
    const ih2 = 1 / (h * h);
    for (const [ka, kb, kc, alpha] of st.bends) {
      const a = start + ka, b = start + kb, c = start + kc;
      const wa = inv[a], wb = inv[b], wc = inv[c];
      const denom = 0.25 * wa + wb + 0.25 * wc + alpha * ih2;
      if (denom === 0) continue;
      const oa = a * 3, ob = b * 3, oc = c * 3;
      for (let j = 0; j < 3; j++) {
        const C = 0.5 * (pos[oa + j] + pos[oc + j]) - pos[ob + j];
        const dl = -C / denom;
        pos[oa + j] += 0.5 * wa * dl;
        pos[oc + j] += 0.5 * wc * dl;
        pos[ob + j] -= wb * dl;
      }
    }
  }

  solveGuides(h) {
    const { pos, inv } = this;
    const ih2 = 1 / (h * h);
    for (const g of this.guides) {
      const w = inv[g.i];
      if (w === 0) continue;
      const o = g.i * 3;
      const a = g.comp * ih2;
      const k = w / (w + a);
      pos[o] += (g.x - pos[o]) * k;
      pos[o + 1] += (g.y - pos[o + 1]) * k;
      pos[o + 2] += (g.z - pos[o + 2]) * k;
    }
  }

  /* ---------- contact with things that don't move ---------- */
  solveStatic(st) {
    const { pos, prev, inv, rad, inside } = this;
    const v = this.vase;
    const mu = v.muGlass ?? 0.25;           // wet stem on wet glass is slippery
    const muTape = v.muTape ?? 0.45;
    const { start, n } = st;
    const rimR = (v.rIn + v.rOut) * 0.5;
    for (let k = 0; k < n; k++) {
      const i = start + k, o = i * 3;
      if (inv[i] === 0) continue;
      const r = rad[i];
      const isHead = k === n - 1;
      let x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const rho = Math.hypot(x, z);
      if (inside[i]) {
        // floor
        if (y < v.floorY + r) this.contact(i, 0, 1, 0, v.floorY + r - y, mu);
        // wall, up to the lip
        y = pos[o + 1]; x = pos[o]; z = pos[o + 2];
        const rr = Math.hypot(x, z);
        const lim = v.rIn - r;
        if (y < v.rimY && rr > lim && rr > 1e-9) this.contact(i, -x / rr, 0, -z / rr, rr - lim, mu);
      } else {
        // table and the outside of the glass
        if (y < r) this.contact(i, 0, 1, 0, r - y, mu);
        y = pos[o + 1]; x = pos[o]; z = pos[o + 2];
        const rr = Math.hypot(x, z);
        if (y < v.rimY && rr < v.rOut + r && rr > 1e-9) this.contact(i, x / rr, 0, z / rr, v.rOut + r - rr, mu);
      }
      if (isHead) this.sphereRim(i, r, rimR, mu);
    }
    // segments against the lip (a torus) and the tape grid
    for (let k = 0; k < n - 2; k++) {
      const a = start + k, b = a + 1;
      this.segmentRim(a, b, rimR, mu);
      for (const t of v.tape) this.segmentTape(a, b, t, muTape);
    }
    // the neck segment too: heads shouldn't drop through tape
    for (const t of v.tape) this.segmentTape(start + n - 2, start + n - 1, t, muTape, true);
  }

  // push particle i along unit normal by depth, with Coulomb friction against its own motion
  contact(i, nx, ny, nz, depth, mu) {
    const { pos, prev } = this;
    const o = i * 3;
    pos[o] += nx * depth; pos[o + 1] += ny * depth; pos[o + 2] += nz * depth;
    const dx = pos[o] - prev[o], dy = pos[o + 1] - prev[o + 1], dz = pos[o + 2] - prev[o + 2];
    const dn = dx * nx + dy * ny + dz * nz;
    const tx = dx - dn * nx, ty = dy - dn * ny, tz = dz - dn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-12) return;
    const f = tl < mu * depth * 1.4 ? 1 : (mu * depth) / tl;   // static, then kinetic
    pos[o] -= tx * f; pos[o + 1] -= ty * f; pos[o + 2] -= tz * f;
  }

  // closest point on a segment to the lip circle (y = rimY, radius rimR): sampled, then refined
  segmentRim(a, b, rimR, mu) {
    const { pos, inv, rad } = this;
    const v = this.vase;
    const oa = a * 3, ob = b * 3;
    const ax = pos[oa], ay = pos[oa + 1], az = pos[oa + 2];
    const bx = pos[ob], by = pos[ob + 1], bz = pos[ob + 2];
    const reach = v.lipR + Math.max(rad[a], rad[b]);
    if (Math.max(ay, by) < v.rimY - reach || Math.min(ay, by) > v.rimY + reach) return;
    const dist = t => {
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const q = Math.hypot(x, z) - rimR, w = y - v.rimY;
      return q * q + w * w;
    };
    let best = 0, bd = Infinity;
    for (let s = 0; s <= 8; s++) { const d = dist(s / 8); if (d < bd) { bd = d; best = s / 8; } }
    let lo = Math.max(0, best - 0.125), hi = Math.min(1, best + 0.125);
    for (let it = 0; it < 10; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (dist(m1) < dist(m2)) hi = m2; else lo = m1;
    }
    const t = (lo + hi) / 2;
    const r = rad[a] + (rad[b] - rad[a]) * t;
    const minD = v.lipR + r;
    // a segment that passes through the glass below the lip: lift it over the lip
    const ra = Math.hypot(ax, az), rb = Math.hypot(bx, bz);
    if ((ra - rimR) * (rb - rimR) < 0) {
      const tc = (rimR - ra) / (rb - ra);           // where it crosses the wall (radius is near-linear here)
      const yc = ay + (by - ay) * tc;
      const r = rad[a] + (rad[b] - rad[a]) * tc;
      const need = v.rimY + v.lipR * 0.7 + r;
      if (yc < need && yc > v.rimY - 0.06) { this.pushSegment(a, b, tc, 0, 1, 0, need - yc, mu); return; }
    }
    if (bd > minD * minD * 4 && dist(t) > minD * minD) return;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    const rho = Math.hypot(x, z) || 1e-9;
    const cx = x / rho * rimR, cz = z / rho * rimR;          // nearest point on the lip's core circle
    let nx = x - cx, ny = y - v.rimY, nz = z - cz;
    const d = Math.hypot(nx, ny, nz);
    if (d >= minD) return;
    if (d < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
    this.pushSegment(a, b, t, nx, ny, nz, minD - d, mu);
  }

  // a head (sphere) against the lip
  sphereRim(i, r, rimR, mu) {
    const { pos } = this;
    const v = this.vase;
    const o = i * 3;
    const x = pos[o], y = pos[o + 1], z = pos[o + 2];
    const rho = Math.hypot(x, z) || 1e-9;
    const cx = x / rho * rimR, cz = z / rho * rimR;
    let nx = x - cx, ny = y - v.rimY, nz = z - cz;
    const d = Math.hypot(nx, ny, nz);
    const minD = v.lipR + r * 0.7;              // petals give: heads may hang a little over the lip
    if (d >= minD || d < 1e-9) return;
    nx /= d; ny /= d; nz /= d;
    this.contact(i, nx, ny, nz, minD - d, mu);
  }

  // tape: a static capsule across the mouth
  segmentTape(a, b, t, mu, neck = false) {
    const { pos, rad } = this;
    const oa = a * 3, ob = b * 3;
    const r = (neck ? rad[a] : Math.max(rad[a], rad[b])) + t.r;
    const P = [pos[oa], pos[oa + 1], pos[oa + 2]], Q = [pos[ob], pos[ob + 1], pos[ob + 2]];
    if (Math.max(P[1], Q[1]) < t.y - r || Math.min(P[1], Q[1]) > t.y + r) return;
    const [s, u] = closestSegSeg(P, Q, [t.ax, t.y, t.az], [t.bx, t.y, t.bz]);
    const px = P[0] + (Q[0] - P[0]) * s, py = P[1] + (Q[1] - P[1]) * s, pz = P[2] + (Q[2] - P[2]) * s;
    const qx = t.ax + (t.bx - t.ax) * u, qy = t.y, qz = t.az + (t.bz - t.az) * u;
    let nx = px - qx, ny = py - qy, nz = pz - qz;
    const d = Math.hypot(nx, ny, nz);
    if (d >= r) return;
    if (d < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
    this.pushSegment(a, b, s, nx, ny, nz, r - d, mu);
  }

  pushSegment(a, b, t, nx, ny, nz, depth, mu) {
    const { pos, prev, inv } = this;
    const wa = inv[a] * (1 - t), wb = inv[b] * t;
    const w = wa * (1 - t) + wb * t;
    if (w === 0) return;
    const ka = wa / w, kb = wb / w;
    const oa = a * 3, ob = b * 3;
    pos[oa] += nx * depth * ka; pos[oa + 1] += ny * depth * ka; pos[oa + 2] += nz * depth * ka;
    pos[ob] += nx * depth * kb; pos[ob + 1] += ny * depth * kb; pos[ob + 2] += nz * depth * kb;
    // friction on the contact point's tangential motion
    const dx = (pos[oa] - prev[oa]) * (1 - t) + (pos[ob] - prev[ob]) * t;
    const dy = (pos[oa + 1] - prev[oa + 1]) * (1 - t) + (pos[ob + 1] - prev[ob + 1]) * t;
    const dz = (pos[oa + 2] - prev[oa + 2]) * (1 - t) + (pos[ob + 2] - prev[ob + 2]) * t;
    const dn = dx * nx + dy * ny + dz * nz;
    const tx = dx - dn * nx, ty = dy - dn * ny, tz = dz - dn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-12) return;
    const f = tl < mu * depth * 1.4 ? 1 : (mu * depth) / tl;
    pos[oa] -= tx * f * ka; pos[oa + 1] -= ty * f * ka; pos[oa + 2] -= tz * f * ka;
    pos[ob] -= tx * f * kb; pos[ob + 1] -= ty * f * kb; pos[ob + 2] -= tz * f * kb;
  }

  /* ---------- stems and heads against each other ---------- */
  solveStemContacts() {
    const S = this.stems;
    if (S.length < 2) return;
    const { pos, rad } = this;
    // bounding boxes per stem
    const box = S.map(st => {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < st.n; k++) {
        const i = st.start + k, o = i * 3, r = rad[i];
        x0 = Math.min(x0, pos[o] - r); x1 = Math.max(x1, pos[o] + r);
        y0 = Math.min(y0, pos[o + 1] - r); y1 = Math.max(y1, pos[o + 1] + r);
        z0 = Math.min(z0, pos[o + 2] - r); z1 = Math.max(z1, pos[o + 2] + r);
      }
      return [x0, y0, z0, x1, y1, z1];
    });
    for (let p = 0; p < S.length; p++) for (let q = p + 1; q < S.length; q++) {
      const A = box[p], B = box[q];
      if (A[3] < B[0] || B[3] < A[0] || A[4] < B[1] || B[4] < A[1] || A[5] < B[2] || B[5] < A[2]) continue;
      this.pairContacts(S[p], S[q]);
    }
  }

  pairContacts(sa, sb) {
    const { pos, rad } = this;
    const mu = Math.min(sa.mu, sb.mu);
    const ha = sa.start + sa.n - 1, hb = sb.start + sb.n - 1;
    // head against head: soft, petals give way
    this.sphereSphere(ha, hb, 0.55, mu * 0.5);
    // head against the other's stem segments, stem against stem
    for (let k = 0; k < sb.n - 2; k++) this.sphereSegment(ha, sb.start + k, sb.start + k + 1, mu);
    for (let k = 0; k < sa.n - 2; k++) this.sphereSegment(hb, sa.start + k, sa.start + k + 1, mu);
    for (let i = 0; i < sa.n - 2; i++) {
      const a0 = sa.start + i, a1 = a0 + 1, oa0 = a0 * 3, oa1 = a1 * 3;
      const ar = Math.max(rad[a0], rad[a1]);
      const aminx = Math.min(pos[oa0], pos[oa1]) - ar, amaxx = Math.max(pos[oa0], pos[oa1]) + ar;
      const aminy = Math.min(pos[oa0 + 1], pos[oa1 + 1]) - ar, amaxy = Math.max(pos[oa0 + 1], pos[oa1 + 1]) + ar;
      const aminz = Math.min(pos[oa0 + 2], pos[oa1 + 2]) - ar, amaxz = Math.max(pos[oa0 + 2], pos[oa1 + 2]) + ar;
      for (let j = 0; j < sb.n - 2; j++) {
        const b0 = sb.start + j, b1 = b0 + 1, ob0 = b0 * 3, ob1 = b1 * 3;
        const br = Math.max(rad[b0], rad[b1]);
        if (Math.max(pos[ob0], pos[ob1]) + br < aminx || Math.min(pos[ob0], pos[ob1]) - br > amaxx) continue;
        if (Math.max(pos[ob0 + 1], pos[ob1 + 1]) + br < aminy || Math.min(pos[ob0 + 1], pos[ob1 + 1]) - br > amaxy) continue;
        if (Math.max(pos[ob0 + 2], pos[ob1 + 2]) + br < aminz || Math.min(pos[ob0 + 2], pos[ob1 + 2]) - br > amaxz) continue;
        this.segmentSegment(a0, a1, b0, b1, ar + br, mu);
      }
    }
  }

  sphereSphere(a, b, give, mu) {
    const { pos, inv, rad } = this;
    const oa = a * 3, ob = b * 3;
    let nx = pos[ob] - pos[oa], ny = pos[ob + 1] - pos[oa + 1], nz = pos[ob + 2] - pos[oa + 2];
    const d = Math.hypot(nx, ny, nz);
    const minD = (rad[a] + rad[b]) * 0.82;
    if (d >= minD || d < 1e-9) return;
    nx /= d; ny /= d; nz /= d;
    const w = inv[a] + inv[b];
    if (w === 0) return;
    const c = Math.min(minD - d, MAX_PUSH) * give / w;
    pos[oa] -= nx * c * inv[a]; pos[oa + 1] -= ny * c * inv[a]; pos[oa + 2] -= nz * c * inv[a];
    pos[ob] += nx * c * inv[b]; pos[ob + 1] += ny * c * inv[b]; pos[ob + 2] += nz * c * inv[b];
  }

  sphereSegment(h, a, b, mu) {
    const { pos, inv, rad } = this;
    const oh = h * 3, oa = a * 3, ob = b * 3;
    const ex = pos[ob] - pos[oa], ey = pos[ob + 1] - pos[oa + 1], ez = pos[ob + 2] - pos[oa + 2];
    const ll = ex * ex + ey * ey + ez * ez || 1e-12;
    const t = clamp(((pos[oh] - pos[oa]) * ex + (pos[oh + 1] - pos[oa + 1]) * ey + (pos[oh + 2] - pos[oa + 2]) * ez) / ll, 0, 1);
    const cx = pos[oa] + ex * t, cy = pos[oa + 1] + ey * t, cz = pos[oa + 2] + ez * t;
    let nx = pos[oh] - cx, ny = pos[oh + 1] - cy, nz = pos[oh + 2] - cz;
    const d = Math.hypot(nx, ny, nz);
    const minD = rad[h] * 0.75 + Math.max(rad[a], rad[b]);
    if (d >= minD || d < 1e-9) return;
    nx /= d; ny /= d; nz /= d;
    const wa = inv[a] * (1 - t), wb = inv[b] * t, wh = inv[h];
    const w = wh + wa * (1 - t) + wb * t;
    if (w === 0) return;
    const c = Math.min(minD - d, MAX_PUSH) / w;
    pos[oh] += nx * c * wh; pos[oh + 1] += ny * c * wh; pos[oh + 2] += nz * c * wh;
    pos[oa] -= nx * c * wa; pos[oa + 1] -= ny * c * wa; pos[oa + 2] -= nz * c * wa;
    pos[ob] -= nx * c * wb; pos[ob + 1] -= ny * c * wb; pos[ob + 2] -= nz * c * wb;
  }

  segmentSegment(a0, a1, b0, b1, minD, mu) {
    const { pos, prev, inv } = this;
    const P = [pos[a0 * 3], pos[a0 * 3 + 1], pos[a0 * 3 + 2]], Q = [pos[a1 * 3], pos[a1 * 3 + 1], pos[a1 * 3 + 2]];
    const R = [pos[b0 * 3], pos[b0 * 3 + 1], pos[b0 * 3 + 2]], S = [pos[b1 * 3], pos[b1 * 3 + 1], pos[b1 * 3 + 2]];
    const [s, t] = closestSegSeg(P, Q, R, S);
    const px = P[0] + (Q[0] - P[0]) * s, py = P[1] + (Q[1] - P[1]) * s, pz = P[2] + (Q[2] - P[2]) * s;
    const qx = R[0] + (S[0] - R[0]) * t, qy = R[1] + (S[1] - R[1]) * t, qz = R[2] + (S[2] - R[2]) * t;
    let nx = px - qx, ny = py - qy, nz = pz - qz;
    const d = Math.hypot(nx, ny, nz);
    if (d >= minD) return;
    if (d < 1e-9) { nx = 0; ny = 0; nz = 1; } else { nx /= d; ny /= d; nz /= d; }
    const w0 = inv[a0] * (1 - s), w1 = inv[a1] * s, w2 = inv[b0] * (1 - t), w3 = inv[b1] * t;
    const w = w0 * (1 - s) + w1 * s + w2 * (1 - t) + w3 * t;
    if (w === 0) return;
    const c = Math.min(minD - d, MAX_PUSH) / w;
    const move = (i, k, sign) => { const o = i * 3; pos[o] += sign * nx * c * k; pos[o + 1] += sign * ny * c * k; pos[o + 2] += sign * nz * c * k; };
    move(a0, w0, 1); move(a1, w1, 1); move(b0, w2, -1); move(b1, w3, -1);
    // friction between the two contact points
    const rel = j => (pos[a0 * 3 + j] - prev[a0 * 3 + j]) * (1 - s) + (pos[a1 * 3 + j] - prev[a1 * 3 + j]) * s
      - (pos[b0 * 3 + j] - prev[b0 * 3 + j]) * (1 - t) - (pos[b1 * 3 + j] - prev[b1 * 3 + j]) * t;
    const dx = rel(0), dy = rel(1), dz = rel(2);
    const dn = dx * nx + dy * ny + dz * nz;
    const tx = dx - dn * nx, ty = dy - dn * ny, tz = dz - dn * nz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-12) return;
    const depth = Math.min(minD - d, MAX_PUSH);
    const f = (tl < mu * depth * 1.4 ? 1 : (mu * depth) / tl) / w;
    const fr = (i, k, sign) => { const o = i * 3; pos[o] -= sign * tx * f * k; pos[o + 1] -= sign * ty * f * k; pos[o + 2] -= sign * tz * f * k; };
    fr(a0, w0, 1); fr(a1, w1, 1); fr(b0, w2, -1); fr(b1, w3, -1);
  }
}

/* Bending stencils. A chain solved one neighbour at a time is far softer than its compliance says,
   because stiffness only travels one particle per iteration. Stencils that span 2 and 4 segments
   carry it down the stem quickly. Each stencil gets its share of the stem's real rigidity: a
   span of length L has alpha = L³ / (4 EI), and the three spans together split it. Near the head
   the neck uses its own, softer EI. */
function bendStencils(seg, spec) {
  const n = seg.length + 1, out = [];
  const at = k => { let s = 0; for (let i = 0; i < k; i++) s += seg[i]; return s; };
  const spans = [[1, 0.5], [2, 0.3], [4, 0.2]];
  for (const [m, share] of spans) {
    for (let k = m; k < n - m; k++) {
      if (m > 1 && k + m >= n - 1) continue;           // the long spans stop short of the neck
      const L = (at(k + m) - at(k - m)) * 0.5;
      const neck = k + m >= n - 2;
      const ei = (neck ? spec.neckEI : spec.EI) * share;
      out.push([k - m, k, k + m, L * L * L / (4 * ei)]);
    }
  }
  return out;
}

// closest points between segments PQ and RS, as parameters (s, t) in [0, 1]
export function closestSegSeg(P, Q, R, S) {
  const d1 = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
  const d2 = [S[0] - R[0], S[1] - R[1], S[2] - R[2]];
  const r = [P[0] - R[0], P[1] - R[1], P[2] - R[2]];
  const a = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2];
  const e = d2[0] * d2[0] + d2[1] * d2[1] + d2[2] * d2[2];
  const f = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  let s, t;
  if (a < 1e-12 && e < 1e-12) return [0, 0];
  if (a < 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2];
    if (e < 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
      const den = a * e - b * b;
      s = den > 1e-14 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return [s, t];
}

/* Where a new stem goes: through a point near the mouth, leaning at `tilt` from vertical towards
   azimuth `az`, cut end on the floor (or against the wall). Returns points bottom → head. */
export function placeStem(vase, { length, seg, headOff, az, tilt, through = [0, 0] }) {
  const dx = Math.sin(tilt) * Math.cos(az), dz = Math.sin(tilt) * Math.sin(az), dy = Math.cos(tilt);
  const P = [through[0], vase.rimY, through[1]];
  // go down from the mouth along -d until the floor or the wall, whichever comes first
  const r = 0.004, R = vase.rIn - r;
  let t = (vase.rimY - vase.floorY - r) / dy;
  const a = dx * dx + dz * dz, b = -2 * (P[0] * dx + P[2] * dz), c = P[0] * P[0] + P[2] * P[2] - R * R;
  if (c > 0) return null;                                   // the mouth point itself is in the glass
  if (a > 1e-12) t = Math.min(t, (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a));
  if (t * dy < 0.06) return null;                           // too steep to get the cut end down into the vase
  const bottom = [P[0] - dx * t, P[1] - dy * t, P[2] - dz * t];
  const n = Math.max(3, Math.round(length / seg));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const s = length * k / n;
    pts.push([bottom[0] + dx * s, bottom[1] + dy * s, bottom[2] + dz * s]);
  }
  const top = pts[pts.length - 1];
  pts.push([top[0] + dx * headOff, top[1] + dy * headOff, top[2] + dz * headOff]);
  return pts;
}

/* Find room for a new stem. Tries leans around the vase and through different points of the
   mouth, and keeps the one whose stem and head stay furthest from everything already there,
   with a mild preference for the lean that was asked for. */
export function findPlacement(sim, want) {
  const v = sim.vase;
  const others = [];
  for (const st of sim.stems) others.push({ pts: sim.points(st), r: sim.rad[st.start], hr: sim.rad[st.start + st.n - 1] });
  const cells = v.tape.length ? gridCells(v) : [[0, 0]];
  let best = null;
  for (let a = 0; a < 24; a++) for (const tilt of [want.tilt * 0.7, want.tilt, want.tilt * 1.25]) for (const c of cells) {
    const az = want.az + (a / 24) * Math.PI * 2;
    const through = v.tape.length ? c : [Math.cos(az) * 0.3 * v.rIn * (a % 2), Math.sin(az) * 0.3 * v.rIn * (a % 2)];
    const pts = placeStem(v, { ...want, az, tilt, through });
    if (!pts) continue;
    if (v.tape.length && !throughClear(pts, v)) continue;
    let clear = 1;
    const head = pts[pts.length - 1];
    for (const o of others) {
      const oh = o.pts[o.pts.length - 1];
      clear = Math.min(clear, Math.hypot(head[0] - oh[0], head[1] - oh[1], head[2] - oh[2]) - (want.headR + o.hr) * 0.8);
      for (let i = 0; i < pts.length - 2; i += 1) for (let j = 0; j < o.pts.length - 2; j++) {
        const [s, t] = closestSegSeg(pts[i], pts[i + 1], o.pts[j], o.pts[j + 1]);
        const P = pts[i], Q = pts[i + 1], R = o.pts[j], S = o.pts[j + 1];
        const d = Math.hypot(P[0] + (Q[0] - P[0]) * s - R[0] - (S[0] - R[0]) * t, P[1] + (Q[1] - P[1]) * s - R[1] - (S[1] - R[1]) * t, P[2] + (Q[2] - P[2]) * s - R[2] - (S[2] - R[2]) * t);
        clear = Math.min(clear, d - 0.0075);
      }
    }
    const turn = Math.min(a, 24 - a) / 12;
    const score = Math.min(clear, 0.02) - turn * 0.004 - Math.abs(tilt - want.tilt) * 0.004;
    if (!best || score > best.score) best = { score, pts, az, tilt };
  }
  return best;
}

// centres of the tape grid's cells
function gridCells(v) {
  const xs = [...new Set(v.tape.filter(t => t.ax === t.bx).map(t => t.ax))].sort((a, b) => a - b);
  const edges = [-v.rIn, ...xs, v.rIn];
  const mids = [];
  for (let i = 0; i < edges.length - 1; i++) mids.push((edges[i] + edges[i + 1]) / 2);
  const out = [];
  for (const x of mids) for (const z of mids) if (Math.hypot(x, z) < v.rIn * 0.85) out.push([x, z]);
  return out;
}

// the straight stem's crossing of the mouth must miss the tape
function throughClear(pts, v) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a[1] - v.rimY) * (b[1] - v.rimY) > 0) continue;
    const t = (v.rimY - a[1]) / (b[1] - a[1]);
    const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    for (const tp of v.tape) {
      const d = tp.ax === tp.bx ? Math.abs(x - tp.ax) : Math.abs(z - tp.az);
      if (d < 0.0055) return false;
    }
    return Math.hypot(x, z) < v.rIn - 0.004;
  }
  return true;
}
