import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Modelling kit. Every craft is built in real metres, standing on y = 0, front facing +z.
   Surfaces of revolution carry u around the body (front at u = 0.5) and v in metres up the
   body, so liveries can be painted in real units. */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/* ---------- geometry ---------- */

// Revolve a profile [[r, y], ...] about +y. Corners sharper than `crease` degrees stay hard.
// v = (y - v0) / vSpan: pass { v0: 0, vSpan: 1 } for metres, or leave it to span the part.
export function revolve(profile, { segments = 48, phiStart = 0, phiLength = TAU, crease = 40, v0, vSpan } = {}) {
  const ys = profile.map(p => p[1]);
  const lo = v0 ?? Math.min(...ys);
  const span = vSpan ?? (Math.max(...ys) - lo || 1);
  const cosCrease = Math.cos(crease * DEG);
  const segN = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const dr = profile[i + 1][0] - profile[i][0], dy = profile[i + 1][1] - profile[i][1];
    const l = Math.hypot(dr, dy);
    segN.push(l ? [dy / l, -dr / l] : null);
  }
  const blend = (n, m) => {
    if (!m || n[0] * m[0] + n[1] * m[1] < cosCrease) return n;
    const s = [n[0] + m[0], n[1] + m[1]], l = Math.hypot(s[0], s[1]);
    return [s[0] / l, s[1] / l];
  };
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < segN.length; i++) {
    const n = segN[i];
    if (!n) continue;
    const a = profile[i], b = profile[i + 1];
    const na = blend(n, segN[i - 1]), nb = blend(n, segN[i + 1]);
    const base = pos.length / 3;
    for (let s = 0; s <= segments; s++) {
      const phi = phiStart + (s / segments) * phiLength;
      const sn = Math.sin(phi), cs = Math.cos(phi);
      for (const [p, q] of [[a, na], [b, nb]]) {
        pos.push(p[0] * sn, p[1], p[0] * cs);
        nor.push(q[0] * sn, q[1], q[0] * cs);
        uv.push(phi / TAU + 0.5, (p[1] - lo) / span);
      }
    }
    for (let s = 0; s < segments; s++) {
      const a0 = base + s * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Skin a list of rings (arrays of Vector3, same length, ordered counter-clockwise seen from
// the end the rings advance toward). Optional caps close the first and last ring.
export function loft(rings, { closed = true, capStart = false, capEnd = false, flat = false } = {}) {
  const n = rings[0].length;
  const pos = [], uv = [], idx = [];
  rings.forEach((ring, j) => ring.forEach((p, i) => {
    pos.push(p.x, p.y, p.z);
    uv.push(i / (n - (closed ? 0 : 1)), j / (rings.length - 1));
  }));
  const cols = closed ? n : n - 1;
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < cols; i++) {
    const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n;
    idx.push(a, b, c, b, d, c);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (flat) g = g.toNonIndexed();
  g.computeVertexNormals();
  // caps are separate flat fans so they don't soften the rim
  const parts = [g.index ? g.toNonIndexed() : g];
  const cap = (ring, flip) => {
    const ctr = new THREE.Vector3();
    ring.forEach(p => ctr.add(p));
    ctr.divideScalar(ring.length);
    const f = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (flip) f.push(ctr, a, b); else f.push(ctr, b, a);
    }
    const c = new THREE.BufferGeometry().setFromPoints(f);
    c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(f.length * 2), 2));
    c.computeVertexNormals();
    parts.push(c);
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings.at(-1), true);
  return parts.length > 1 ? mergeGeometries(parts) : g;
}

// Flat outline [[x, y], ...] extruded `depth` along z (centred unless `from` is given).
export function slab(outline, depth, { from = -depth / 2, bevel = 0 } = {}) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 1, curveSegments: 6,
  });
  g.translate(0, 0, from + bevel);
  return g;
}

// Round tube from a to b (Vector3s), for struts, booms and lattice members.
export function strut(a, b, r, sides = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, sides, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

// Rocket nozzle bell, exit at y = 0, opening downward. Open-ended so the dark throat shows.
export function bell(exitR, length, throatR = exitR * 0.32, { segments = 20 } = {}) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;                         // 0 at exit, 1 at throat
    pts.push([throatR + (exitR - throatR) * Math.pow(1 - t, 1.7), t * length * 0.86]);
  }
  pts.push([throatR * 1.25, length * 0.93], [throatR * 1.15, length]);
  return revolve(pts, { segments, crease: 80 });
}
export function bellInner(exitR, length, throatR = exitR * 0.32) {
  const pts = [];
  for (let i = 8; i >= 0; i--) {
    const t = i / 8;
    pts.push([(throatR + (exitR - throatR) * Math.pow(1 - t, 1.7)) * 0.97, t * length * 0.86]);
  }
  return revolve(pts, { segments: 20, crease: 80 });
}

// Tangent ogive from radius R at y0 to a tip of radius `tip` at y0 + L, closed with a round nose.
// `end` stretches the result so the very tip lands exactly at that height.
export function ogive(R, L, y0, { tip = 0, steps = 24, blunt = 0.6, end } = {}) {
  const rho = (R * R + L * L) / (2 * R);
  let pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * L;
    const r = Math.sqrt(Math.max(0, rho * rho - x * x)) + R - rho;
    pts.push([Math.max(r, 0), y0 + x]);
  }
  if (tip > 0) {
    // cut the point off where it narrows to `tip` and round it over
    const k = pts.findIndex(p => p[0] < tip);
    pts = k > 0 ? pts.slice(0, k) : pts;
    const [r0, yc] = pts.at(-1);
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * Math.PI / 2;
      pts.push([r0 * Math.cos(a), yc + r0 * blunt * Math.sin(a)]);
    }
  }
  if (end !== undefined) {
    const k = (end - y0) / (pts.at(-1)[1] - y0);
    pts = pts.map(([r, y]) => [r, y0 + (y - y0) * k]);
  }
  return pts;
}

// Radius of an ogive profile at height y (linear between samples).
export function radiusAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if (y >= y0 && y <= y1) return y1 === y0 ? r0 : r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return y < profile[0][1] ? profile[0][0] : profile.at(-1)[0];
}

// Lattice panel (grid fin) in the x-y plane, w × h, t thick along z, nx × ny open cells.
export function lattice(w, h, t, nx, ny, frame = 0.12, bar = 0.05) {
  const parts = [];
  const box = (sx, sy, x, y) => { const g = new THREE.BoxGeometry(sx, sy, t); g.translate(x, y, 0); parts.push(g); };
  box(w, frame, 0, h / 2 - frame / 2); box(w, frame, 0, -h / 2 + frame / 2);
  box(frame, h, w / 2 - frame / 2, 0); box(frame, h, -w / 2 + frame / 2, 0);
  for (let i = 1; i < nx; i++) box(bar, h - frame, -w / 2 + (i / nx) * w, 0);
  for (let j = 1; j < ny; j++) box(w - frame, bar, 0, -h / 2 + (j / ny) * h);
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}

// Open zig-zag truss between two rings: n bays, struts of radius sr.
export function truss(r0, y0, r1, y1, n, sr, { phi0 = 0, rings = true } = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = phi0 + (i / n) * TAU, h = TAU / n / 2;
    parts.push(strut(around(r0, a, y0), around(r1, a + h, y1), sr));
    parts.push(strut(around(r1, a + h, y1), around(r0, a + 2 * h, y0), sr));
  }
  if (rings) {
    parts.push(revolve([[r0 + sr, y0 - sr * 1.5], [r0 + sr, y0 + sr * 1.5]], { segments: 48 }));
    parts.push(revolve([[r1 + sr, y1 - sr * 1.5], [r1 + sr, y1 + sr * 1.5]], { segments: 48 }));
  }
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
}

// Point at angle phi around +y (phi = 0 is +z, increasing toward +x).
export const around = (r, phi, y = 0) => new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));

/* ---------- vertex paint ---------- */

// Colour each vertex from fn(position, normal) → hex. Pair with a material that has vertexColors.
export function paint(g, fn) {
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), c = new THREE.Color();
  // colour whole triangles from their centroid so boundaries stay crisp
  for (let i = 0; i < p.count; i += 3) {
    v.set(0, 0, 0); w.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      v.x += p.getX(i + k) / 3; v.y += p.getY(i + k) / 3; v.z += p.getZ(i + k) / 3;
      w.x += n.getX(i + k); w.y += n.getY(i + k); w.z += n.getZ(i + k);
    }
    c.set(fn(v, w.normalize())).convertSRGBToLinear();
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* ---------- builder: collect parts, merge by material ---------- */

export class Builder {
  constructor() { this.buckets = new Map(); this.decals = []; }

  // place a geometry with an optional transform: { pos, rot: [x, y, z] Euler, scale, matrix }
  add(g, mat, t = {}) {
    if (!g) return this;
    g = g.index ? g.toNonIndexed() : g.clone();
    const m = t.matrix || new THREE.Matrix4().compose(
      t.pos || new THREE.Vector3(),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.rot || [0, 0, 0]), t.order || 'XYZ')),
      typeof t.scale === 'number' ? new THREE.Vector3(t.scale, t.scale, t.scale) : (t.scale || new THREE.Vector3(1, 1, 1)),
    );
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (mat.vertexColors && !g.attributes.color) {
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
    g.clearGroups();
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return this;
  }

  // a text or emblem drawn on a transparent plane; hidden in monochrome finishes
  decal(g, mat, t) { this.add(g, mat, t); this.decals.push(mat); return this; }

  // same part repeated at n angles around +y
  ring(g, mat, n, { phi0 = 0, t = {} } = {}) {
    for (let i = 0; i < n; i++) {
      const rot = new THREE.Matrix4().makeRotationY(phi0 + (i / n) * TAU);
      const local = new THREE.Matrix4().compose(t.pos || new THREE.Vector3(),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
      this.add(g, mat, { matrix: rot.multiply(local) });
    }
    return this;
  }

  build() {
    const group = new THREE.Group();
    for (const [mat, list] of this.buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = !mat.transparent && !mat.alphaTest;
      mesh.receiveShadow = true;
      mesh.userData.decal = this.decals.includes(mat);
      group.add(mesh);
    }
    return group;
  }
}

/* ---------- textures ---------- */

export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  if (repeat) t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Livery for a revolved part: draw(g, W, H, X, Y) with X(u) and Y(metresFromBottom) helpers.
// The canvas spans the full circumference (front at the centre) and `height` metres.
export function livery(circ, height, draw, { px = 48, base = '#f1f1ec' } = {}) {
  const W = Math.min(2048, Math.round(circ * px)), H = Math.min(4096, Math.round(height * px));
  return canvasTexture(W, H, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const X = u => u * W;                 // u: 0..1 around, 0.5 = front
    const Y = m => H - (m / height) * H;  // metres up from the part's bottom
    draw(g, W, H, X, Y);
  });
}

// Vertical letters, centred on u, filling metres [y0, y1] of a livery
export function verticalText(g, text, X, Y, u, y0, y1, { color = '#111', width = 0.05, font = 'Geist, Helvetica, Arial, sans-serif', weight = 800 } = {}) {
  const letters = [...text];
  const step = (Y(y0) - Y(y1)) / letters.length;
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${weight} ${step * 0.86}px ${font}`;
  letters.forEach((ch, i) => {
    const cy = Y(y1) + step * (i + 0.5);
    g.save();
    g.translate(X(u), cy);
    const m = g.measureText(ch).width || 1;
    const want = X(width) - X(0);
    g.scale(Math.min(1.25, want / m), 1);
    g.fillText(ch, 0, 0);
    g.restore();
  });
}

export function usFlag(g, x, y, w, h) {
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? '#f4f4f0' : '#b22234';
    g.fillRect(x, y + (i * h) / 13, w, h / 13 + 0.5);
  }
  g.fillStyle = '#3c3b6e';
  g.fillRect(x, y, w * 0.4, (h * 7) / 13);
  g.fillStyle = '#fff';
  const cw = w * 0.4, ch = (h * 7) / 13;
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) {
    g.beginPath();
    g.arc(x + cw * ((c + (r % 2 ? 1 : 0.5)) / 6), y + ch * ((r + 0.5) / 9), Math.max(0.6, ch * 0.03), 0, TAU);
    g.fill();
  }
}

/* ---------- materials ---------- */

const std = (o) => new THREE.MeshStandardMaterial(o);

export function baseMaterials() {
  return {
    white: std({ color: 0xf0f0eb, roughness: 0.48 }),
    offwhite: std({ color: 0xdcdad2, roughness: 0.55 }),
    black: std({ color: 0x18181a, roughness: 0.55 }),
    gray: std({ color: 0x8c9096, roughness: 0.5 }),
    lightgray: std({ color: 0xbfc2c3, roughness: 0.5 }),
    darkgray: std({ color: 0x45484d, roughness: 0.55 }),
    engine: std({ color: 0x3b3936, metalness: 0.75, roughness: 0.45 }),
    throat: std({ color: 0x0d0c0b, roughness: 0.9, side: THREE.DoubleSide }),
    alu: std({ color: 0xc9ccd0, metalness: 1, roughness: 0.3 }),
    chrome: std({ color: 0xe8e8e8, metalness: 1, roughness: 0.12 }),
    foil: std({ color: 0xd9d6cf, metalness: 1, roughness: 0.32 }),
    gold: std({ color: 0xd3a43a, metalness: 1, roughness: 0.3 }),
    mirror: std({ color: 0xf0c04c, metalness: 1, roughness: 0.1 }),
    wire: std({ color: 0x9a9da2, metalness: 0.9, roughness: 0.35 }),
    vertex: std({ vertexColors: true, roughness: 0.5 }),
  };
}

// decals: transparent plane material from a canvas
export function decalMaterial(w, h, draw) {
  const map = canvasTexture(w, h, (g) => { g.clearRect(0, 0, w, h); draw(g, w, h); });
  return std({ map, transparent: false, alphaTest: 0.5, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
}
