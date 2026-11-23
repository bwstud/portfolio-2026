/* Music of the Spheres — what the scene is drawn with. The orbital plane is the world's XZ plane; physics (x, y)
   maps to world (x, −z), so anticlockwise in the physics reads anticlockwise from above. */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const COLOR = {
  brass: 0xe7d7a8,
  brassDim: 0x8f8466,
  copper: 0xe08a3c,
  sun: 0xfff1d0,
  ink: 0x070a14,
};

const materials = new Set();           // every LineMaterial needs the canvas size, so the shell can set it on resize
export function setLineResolution(w, h) { materials.forEach(m => m.resolution.set(w, h)); }

/* A line of fixed capacity drawn as screen-space quads (crisp at any width). set() rewrites it in place: no
   allocation per frame. Points are flat physics coordinates [x0, y0, x1, y1, …], scaled by `scale`. */
export class FatLine {
  constructor({ capacity = 512, color = COLOR.brass, width = 1.25, opacity = 1, dashed = false, dash = 0.2, gap = 0.12, fade = false, additive = true, closed = false } = {}) {
    this.capacity = capacity;
    this.closed = closed;
    this.fade = fade;
    this.geometry = new LineSegmentsGeometry();
    const pos = new Float32Array(capacity * 6), col = new Float32Array(capacity * 6);
    this.geometry.setPositions(pos);
    this.geometry.setColors(col);
    this.pos = this.geometry.attributes.instanceStart.data;
    this.col = this.geometry.attributes.instanceColorStart.data;
    this.color = new THREE.Color(color);
    this.material = new LineMaterial({
      color: 0xffffff, linewidth: width, vertexColors: true, transparent: true, opacity, depthWrite: false,
      dashed, dashSize: dash, gapSize: gap, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    materials.add(this.material);
    this.object = new LineSegments2(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 1;
    this.geometry.instanceCount = 0;
  }
  /* pts: flat physics array. scale: world units per physics unit. y: height of the plane. */
  set(pts, scale = 1, y = 0, count = pts.length / 2) {
    const n = Math.min(count, this.capacity + 1);
    const P = this.pos.array, C = this.col.array;
    const segs = Math.max(0, (this.closed ? n : n - 1));
    const c = this.color;
    for (let i = 0; i < segs && i < this.capacity; i++) {
      const a = i, b = (i + 1) % n;
      const o = i * 6;
      P[o] = pts[a * 2] * scale; P[o + 1] = y; P[o + 2] = -pts[a * 2 + 1] * scale;
      P[o + 3] = pts[b * 2] * scale; P[o + 4] = y; P[o + 5] = -pts[b * 2 + 1] * scale;
      // a trail fades towards its tail: additive blending, so darker is fainter
      const fa = this.fade ? Math.pow(i / Math.max(1, segs), 1.6) : 1, fb = this.fade ? Math.pow((i + 1) / Math.max(1, segs), 1.6) : 1;
      C[o] = c.r * fa; C[o + 1] = c.g * fa; C[o + 2] = c.b * fa;
      C[o + 3] = c.r * fb; C[o + 4] = c.g * fb; C[o + 5] = c.b * fb;
    }
    this.geometry.instanceCount = Math.min(segs, this.capacity);
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
    if (this.material.dashed) this.object.computeLineDistances();
    return this;
  }
  /* separate segments: pairs [x0, y0, x1, y1, …], each with its own brightness (0–1) */
  segments(pairs, scale = 1, y = 0, bright = null) {
    const P = this.pos.array, C = this.col.array, c = this.color;
    const n = Math.min(pairs.length / 4, this.capacity);
    for (let i = 0; i < n; i++) {
      const o = i * 6, k = bright ? bright[i] : 1;
      P[o] = pairs[i * 4] * scale; P[o + 1] = y; P[o + 2] = -pairs[i * 4 + 1] * scale;
      P[o + 3] = pairs[i * 4 + 2] * scale; P[o + 4] = y; P[o + 5] = -pairs[i * 4 + 3] * scale;
      C[o] = C[o + 3] = c.r * k; C[o + 1] = C[o + 4] = c.g * k; C[o + 2] = C[o + 5] = c.b * k;
    }
    this.geometry.instanceCount = n;
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
  }
  /* strings that fade to nothing at both ends: each pair [x0, y0, x1, y1] is drawn as two halves, bright in the middle */
  fadedStrings(pairs, scale = 1, y = 0, bright = null) {
    const P = this.pos.array, C = this.col.array, c = this.color;
    const n = Math.min(pairs.length / 4, Math.floor(this.capacity / 2));
    for (let i = 0; i < n; i++) {
      const ax = pairs[i * 4], ay = pairs[i * 4 + 1], bx = pairs[i * 4 + 2], by = pairs[i * 4 + 3];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, k = bright ? bright[i] : 1;
      for (let h = 0; h < 2; h++) {
        const o = (i * 2 + h) * 6, sx = h ? mx : ax, sy = h ? my : ay, ex = h ? bx : mx, ey = h ? by : my, ks = h ? k : 0, ke = h ? 0 : k;
        P[o] = sx * scale; P[o + 1] = y; P[o + 2] = -sy * scale; P[o + 3] = ex * scale; P[o + 4] = y; P[o + 5] = -ey * scale;
        C[o] = c.r * ks; C[o + 1] = c.g * ks; C[o + 2] = c.b * ks; C[o + 3] = c.r * ke; C[o + 4] = c.g * ke; C[o + 5] = c.b * ke;
      }
    }
    this.geometry.instanceCount = n * 2;
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
  }
  clear() { this.geometry.instanceCount = 0; }
  setColor(c) { this.color.set(c); }
  dispose() { this.geometry.dispose(); this.material.dispose(); materials.delete(this.material); }
}

/* A trail: a ring buffer of recent positions drawn as a fading FatLine. */
export class Trail {
  constructor(opts = {}) {
    this.n = opts.capacity || 600;
    this.line = new FatLine({ ...opts, capacity: this.n, fade: true });
    this.buf = new Float64Array(this.n * 2);
    this.flat = new Float64Array(this.n * 2);
    this.count = 0; this.head = 0;
    this.object = this.line.object;
    this.minStep = opts.minStep || 0;
    this.lx = Infinity; this.ly = Infinity;
  }
  push(x, y) {
    if (this.minStep && Math.hypot(x - this.lx, y - this.ly) < this.minStep) return;
    this.lx = x; this.ly = y;
    this.buf[this.head * 2] = x; this.buf[this.head * 2 + 1] = y;
    this.head = (this.head + 1) % this.n;
    this.count = Math.min(this.count + 1, this.n);
  }
  draw(scale = 1, y = 0) {
    const start = (this.head - this.count + this.n) % this.n;
    for (let i = 0; i < this.count; i++) {
      const k = (start + i) % this.n;
      this.flat[i * 2] = this.buf[k * 2]; this.flat[i * 2 + 1] = this.buf[k * 2 + 1];
    }
    this.line.set(this.flat, scale, y, this.count);
  }
  reset() { this.count = 0; this.head = 0; this.lx = Infinity; this.line.clear(); }
  dispose() { this.line.dispose(); }
}

// ---- glow: one soft radial texture, shared ----
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.14)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.03)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function halo(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 2;
  return s;
}

/* The Sun (or any star): a bright core, a wide soft corona and a faint long glow. */
export function star(radius = 0.12, color = COLOR.sun) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.MeshBasicMaterial({ color }));
  g.add(core);
  g.add(halo(color, radius * 9, 0.9));
  g.add(halo(0xffc98a, radius * 26, 0.28));
  g.userData.core = core;
  return g;
}

/* A planet lit from the star at the origin: a real terminator when the camera tilts, plus a small halo so it reads
   at any zoom. */
export function planet(radius, color, { glow = 1, light = null } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, emissive: color, emissiveIntensity: 0.08 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  g.add(mesh);
  const h = halo(color, radius * 7 * glow, 0.55);
  g.add(h);
  g.userData = { mesh, halo: h, radius };
  return g;
}

/* A flat arrow in the orbital plane: shaft and head, drawn on top. Set with set(x0, y0, x1, y1) in world units. */
export class Arrow {
  constructor(color = COLOR.copper, width = 2.2) {
    this.line = new FatLine({ capacity: 3, color, width, additive: false });
    this.head = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.head.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.head.renderOrder = 3;
    this.object = new THREE.Group();
    this.object.add(this.line.object, this.head);
    this.tmp = new Float64Array(4);
  }
  set(x0, y0, x1, y1, headSize = 0.12, y = 0.002) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / L, uy = dy / L, hs = Math.min(headSize, L * 0.45);
    const bx = x1 - ux * hs, by = y1 - uy * hs;
    this.tmp[0] = x0; this.tmp[1] = y0; this.tmp[2] = bx; this.tmp[3] = by;
    this.line.set(this.tmp, 1, y, 2);
    const p = this.head.geometry.attributes.position.array, w = hs * 0.55;
    p[0] = x1; p[1] = y; p[2] = -y1;
    p[3] = bx - uy * w; p[4] = y; p[5] = -(by + ux * w);
    p[6] = bx + uy * w; p[7] = y; p[8] = -(by - ux * w);
    this.head.geometry.attributes.position.needsUpdate = true;
    this.head.geometry.computeBoundingSphere();
  }
  set visible(v) { this.object.visible = v; }
  dispose() { this.line.dispose(); this.head.geometry.dispose(); this.head.material.dispose(); }
}

/* A ring marker lying in the plane (the empty focus, a target, a capture zone). */
export function ring(radius, color = COLOR.brass, width = 1, opacity = 0.8, dashed = false) {
  const n = 96, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(Math.cos(a) * radius, Math.sin(a) * radius); }
  const l = new FatLine({ capacity: n, color, width, opacity, closed: true, dashed, dash: radius * 0.18, gap: radius * 0.12 });
  l.set(pts, 1, 0, n);
  return l;
}

/* Equal-area wedges: a fan of triangles from the focus, one wedge per time slice. Alternate wedges are shaded so the
   eye can compare them. Rewritten in place. */
export class Wedges {
  constructor(maxWedges = 16, perWedge = 24, color = COLOR.brass) {
    this.max = maxWedges; this.per = perWedge;
    const tris = maxWedges * perWedge;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(tris * 9);
    this.colors = new Float32Array(tris * 9);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.object = new THREE.Mesh(this.geo, this.mat);
    this.object.frustumCulled = false;
    this.base = new THREE.Color(color);
    this.geo.setDrawRange(0, 0);
  }
  /* wedges: array of flat point arrays (physics units), oldest first. */
  set(wedges, scale, y = -0.001) {
    const P = this.positions, C = this.colors;
    let t = 0;
    const n = Math.min(wedges.length, this.max);
    for (let w = 0; w < n; w++) {
      const pts = wedges[wedges.length - n + w];
      const age = (w + 1) / n;
      const k = (w % 2 ? 0.014 : 0.032) * (0.35 + 0.65 * age * age);   // linear light: small numbers are already visible
      const r = this.base.r * k, g = this.base.g * k, b = this.base.b * k;
      const m = Math.min(this.per, pts.length / 2 - 1);
      for (let i = 0; i < m; i++) {
        const o = t * 9;
        P[o] = 0; P[o + 1] = y; P[o + 2] = 0;
        P[o + 3] = pts[i * 2] * scale; P[o + 4] = y; P[o + 5] = -pts[i * 2 + 1] * scale;
        P[o + 6] = pts[i * 2 + 2] * scale; P[o + 7] = y; P[o + 8] = -pts[i * 2 + 3] * scale;
        for (let v = 0; v < 3; v++) { C[o + v * 3] = r; C[o + v * 3 + 1] = g; C[o + v * 3 + 2] = b; }
        t++;
      }
    }
    this.geo.setDrawRange(0, t * 3);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.geo.setDrawRange(0, 0); }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

/* A field of stars on a far sphere, with a few brighter ones, twinkling only in brightness and only slightly. */
export function starfield(count = 2600, radius = 400) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos[i * 3] = radius * s * Math.cos(th); pos[i * 3 + 1] = radius * u; pos[i * 3 + 2] = radius * s * Math.sin(th);
    const warm = rand();
    const b = 0.25 + Math.pow(rand(), 6) * 0.9;
    col[i * 3] = b * (0.85 + warm * 0.2); col[i * 3 + 1] = b * (0.88 + warm * 0.06); col[i * 3 + 2] = b * (1.05 - warm * 0.2);
    size[i] = 0.8 + Math.pow(rand(), 8) * 3.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: `attribute float size; varying vec3 vC; varying float vS; uniform float uTime; uniform float uPixel;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        float tw = 0.85 + 0.15 * sin(uTime * 0.7 + position.x * 0.37 + position.y * 0.11);
        vC *= tw; vS = size; gl_PointSize = size * uPixel; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vS;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * a, 1.0); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { materials.delete(m); m.dispose(); });
  });
}
