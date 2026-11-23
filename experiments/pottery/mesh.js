/* Turns the clay's rings into a surface. The cross-section is traced once as a polyline (bottom,
   outer wall, rim, inner wall, floor), then swept round the axis. Carved marks, throwing lines and
   being off-centre are added per vertex, with normals worked out analytically so there is no seam.
   Each vertex also carries what the glaze needs: which surface it is on, its height, and whether
   glaze would pool there (hollows, carved lines) or break thin (rims, ridges). */

import { DY, SEG, ROWS } from './clay.js';

export const SIDE = { bottom: 0, outer: 1, rim: 2, inner: 3, floor: 4, top: 5 };
const LAMBDA = 0.0085;                   // spacing of the throwing lines
const MAXP = ROWS * 2 + 120;
const COLS = SEG + 1;
const TAU = Math.PI * 2;

// the cross-section as [r, y, side, row] quads, traced with the clay on the left
export function profile(clay, foot = null) {
  const out = [];
  const push = (r, y, side, row = -1) => out.push(r, y, side, row);
  const { ro, ri } = clay, n = clay.n, h = clay.height, kf = clay.floorRow();
  if (n < 1) return new Float32Array(0);
  const r0 = ro[0];

  // bottom: from the axis out to a small bevel at the foot
  const bevel = Math.min(0.0025, r0 * 0.1);
  if (foot && kf >= 0) {
    const fi = r0 * foot.inner, depth = Math.min(foot.depth, kf * DY - 0.005);
    if (depth > 0.0015) {
      for (let i = 0; i <= 6; i++) push(fi * i / 6, depth, SIDE.bottom);
      push(fi + 0.001, depth * 0.6, SIDE.bottom);
      push(fi + 0.002, 0, SIDE.bottom);
      for (let i = 1; i <= 4; i++) push(fi + 0.002 + (r0 - bevel - fi - 0.002) * i / 4, 0, SIDE.bottom);
    } else foot = null;
  }
  if (!foot || kf < 0) {
    const steps = Math.max(3, Math.ceil(r0 / 0.008));
    for (let i = 0; i <= steps; i++) push((r0 - bevel) * i / steps, 0, SIDE.bottom);
  }
  // outer wall
  // the rim rounds over by up to half the wall, less on a thick or freshly cut one
  const rimT = kf >= 0 ? Math.max(0.0015, (ro[n] - ri[n]) / 2) : 0;
  const lift = kf >= 0 ? Math.max(0.0008, Math.min(rimT * (0.35 + 0.65 * clay.rim), 0.006, (h - kf * DY) * 0.45)) : 0;
  const yTop = h - lift;
  push(clay.sample(ro, bevel), bevel, SIDE.outer, bevel / DY);
  for (let k = 2; k * DY < yTop - 0.0005; k++) push(ro[k], k * DY, SIDE.outer, k);
  push(clay.sample(ro, yTop), yTop, SIDE.outer, yTop / DY);

  if (kf >= 0) {
    // rim: a half-round when sponged, nearer square when freshly cut
    const a = clay.sample(ro, yTop), b = clay.sample(ri, yTop), c = (a + b) / 2, w = (a - b) / 2;
    for (let i = 1; i < 10; i++) {
      const t = Math.PI * i / 10, sq = 1 - clay.rim;
      const cx = Math.cos(t), sy = Math.sin(t);
      const px = Math.sign(cx) * Math.pow(Math.abs(cx), 1 - sq * 0.7), py = Math.pow(sy, 1 - sq * 0.7);
      push(c + w * px, yTop + lift * py, SIDE.rim, yTop / DY);
    }
    // inner wall, down to the floor
    push(b, yTop, SIDE.inner, yTop / DY);
    let k = Math.floor((yTop - 0.0005) / DY);
    for (; k > kf; k--) push(ri[k], k * DY, SIDE.inner, k);
    const fr = ri[kf], fy = kf * DY;
    push(fr, fy, SIDE.inner, kf);
    // the floor itself, out to the axis
    const steps = Math.max(2, Math.ceil(fr / 0.006));
    for (let i = 1; i <= steps; i++) push(fr * (1 - i / steps), fy, SIDE.floor, kf);
  } else {
    // a solid top: across from the shoulder to the axis
    const a = clay.sample(ro, h);
    const steps = Math.max(1, Math.ceil(a / 0.006));
    for (let i = 1; i <= steps; i++) push(a * (1 - i / steps), h, SIDE.top);
  }
  return new Float32Array(out);
}

export class ClayMesh {
  constructor(THREE) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * COLS * 3);
    this.nrm = new Float32Array(MAXP * COLS * 3);
    this.info = new Float32Array(MAXP * COLS * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array((MAXP - 1) * SEG * 6);
    let o = 0;
    for (let i = 0; i < MAXP - 1; i++) for (let j = 0; j < SEG; j++) {
      const a = i * COLS + j, b = a + COLS;
      idx[o++] = a; idx[o++] = a + 1; idx[o++] = b;
      idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1;
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.15, 0), 0.4);
    this.geometry = g;
    this.cos = new Float32Array(COLS); this.sin = new Float32Array(COLS);
    for (let j = 0; j <= SEG; j++) { this.cos[j] = Math.cos(j / SEG * TAU); this.sin[j] = Math.sin(j / SEG * TAU); }
    this.points = new Float32Array(0);
  }

  update(clay, { foot = null, offset = clay.offset } = {}) {
    const P = profile(clay, foot), np = P.length / 4;
    this.points = P;
    const { pos, nrm, info, cos, sin } = this;
    const M = clay.marks, ring = clay.ring;
    const kap = new Float32Array(np);

    // curvature of the section: positive where it turns away from the clay (convex)
    for (let i = 0; i < np; i++) {
      const a = Math.max(0, i - 2), b = Math.min(np - 1, i + 2);
      const ax = P[i * 4] - P[a * 4], ay = P[i * 4 + 1] - P[a * 4 + 1];
      const bx = P[b * 4] - P[i * 4], by = P[b * 4 + 1] - P[i * 4 + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      kap[i] = la > 0 && lb > 0 ? (ax * by - ay * bx) / (la * lb) / ((la + lb) / 2) : 0;
    }

    for (let i = 0; i < np; i++) {
      const R = P[i * 4], Y = P[i * 4 + 1], side = P[i * 4 + 2], row = P[i * 4 + 3];
      const a = Math.max(0, i - 1), b = Math.min(np - 1, i + 1);
      let tr = P[b * 4] - P[a * 4], ty = P[b * 4 + 1] - P[a * 4 + 1];
      const tl = Math.hypot(tr, ty) || 1; tr /= tl; ty /= tl;
      const wall = side === 1 || side === 3;
      const k = row >= 0 ? Math.min(ROWS, Math.round(row)) : -1;
      // throwing lines: a gentle ripple up the walls
      let rr = 0, drr = 0, pool = 0;
      if (wall && k >= 0 && ring[k] > 1e-6) {
        // spacing wanders a little, as fingers do
        const ph = TAU * Y / LAMBDA + Math.sin(Y * 290) * 0.9 + Math.sin(Y * 1130) * 0.35;
        rr = ring[k] * Math.sin(ph);
        drr = ring[k] * TAU / LAMBDA * Math.cos(ph);
        pool -= ring[k] * Math.sin(ph) * (TAU / LAMBDA) ** 2 * (side === 1 ? 1 : -1) * 0.0007;
      }
      const isOuter = side === 1 && M && k >= 0;
      const base = i * COLS;
      for (let j = 0; j <= SEG; j++) {
        const jj = j % SEG;
        let m = 0, mt = 0, my = 0, lap = 0;
        if (isOuter) {
          const at = (kk, j2) => M[Math.max(0, Math.min(ROWS, kk)) * SEG + ((j2 % SEG) + SEG) % SEG];
          m = at(k, jj);
          if (m !== 0 || at(k, jj + 1) !== 0 || at(k + 1, jj) !== 0) {
            const mjp = at(k, jj + 1), mjm = at(k, jj - 1), mkp = at(k + 1, jj), mkm = at(k - 1, jj);
            mt = (mjp - mjm) / (2 * TAU / SEG);
            my = (mkp - mkm) / (2 * DY);
            const rA = Math.max(0.005, R) * TAU / SEG;
            lap = (mjp + mjm - 2 * m) / (rA * rA) + (mkp + mkm - 2 * m) / (DY * DY);
          }
        }
        const rho = Math.max(0, R + rr + m);
        const c = cos[j], s = sin[j];
        const v = (base + j) * 3;
        pos[v] = rho * c + offset; pos[v + 1] = Y; pos[v + 2] = -rho * s;
        // outward normal: (b·ρ, −b·∂m/∂θ, −a·ρ) in the (radial, tangential, up) frame
        const A = tr + (drr + my) * ty, B = ty;
        let nR = B * rho, nT = -B * mt, nY = -A * rho;
        if (rho < 1e-5) { nR = 0; nT = 0; nY = side === 0 ? -1 : 1; }
        const l = Math.hypot(nR, nT, nY) || 1;
        nR /= l; nT /= l; nY /= l;
        nrm[v] = nR * c - nT * s; nrm[v + 1] = nY; nrm[v + 2] = -nR * s - nT * c;
        info[v] = side;
        info[v + 1] = Y;
        let p = 0.5 - kap[i] * 0.0012 + pool + lap * 0.0006;
        if (side === 4) p += 0.3;
        else if (side === 3) p += 0.08;
        info[v + 2] = p;
      }
    }
    const g = this.geometry;
    g.setDrawRange(0, Math.max(0, np - 1) * SEG * 6);
    for (const name of ['position', 'normal', 'aInfo']) {
      const at = g.attributes[name];
      at.clearUpdateRanges();
      at.addUpdateRange(0, np * COLS * 3);
      at.needsUpdate = true;
    }
    return np;
  }
}

// an SVG path of the cross-section, mirrored either side of the axis, scaled to fit w × h
export function sectionPath(P, w, h, scale) {
  const np = P.length / 4;
  if (!np) return '';
  const cx = w / 2;
  let d = '';
  for (const sgn of [1, -1]) {
    for (let i = 0; i < np; i++) {
      const x = cx + sgn * P[i * 4] * scale, y = h - P[i * 4 + 1] * scale;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    d += 'Z';
  }
  return d;
}
