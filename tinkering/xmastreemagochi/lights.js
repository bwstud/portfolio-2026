/* String lights and garlands: generation tools and drawing. Strand points are stored in
   tree-local metres so they follow the tree when it turns. */
import * as THREE from 'three';
import { STRANDS } from './decor-data.js';
import { rng, lerp, clamp, TAU } from './util.js';

const round = v => Math.round(v * 1000) / 1000;
const pack = v => [round(v.x), round(v.y), round(v.z)];

/* ---------- Tools ---------- */
export function spiralPoints(L, { turns = 7, from = 0.08, to = 0.95, depth = 0.86, dir = 1, start = 0 }) {
  const pts = [];
  const r = rng(Math.round(turns * 100 + from * 1000));
  const n = Math.max(12, Math.round(turns * 18));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = lerp(L.yb + (L.H - L.yb) * to, L.yb + (L.H - L.yb) * from, t);
    const rad = L.profile(y) * depth * (0.94 + r() * 0.1);
    const a = start + dir * t * turns * TAU;
    pts.push([round(Math.cos(a) * rad), round(y), round(Math.sin(a) * rad)]);
  }
  return pts;
}

export function swagRows(L, { rows = 4, swags = 7, depth = 0.95, sag = 0.07, from = 0.15, to = 0.8 }) {
  const strands = [];
  for (let k = 0; k < rows; k++) {
    const y = L.yb + (L.H - L.yb) * lerp(from, to, rows === 1 ? 0.5 : k / (rows - 1));
    const pts = [];
    const n = swags;
    const off = k * 0.4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 6; j++) {
        const t = j / 6;
        const a = off + ((i + t) / n) * TAU;
        const yy = y - Math.sin(t * Math.PI) * sag * (L.profile(y) / L.R + 0.4);
        const rad = L.profile(yy) * depth * (1 - Math.sin(t * Math.PI) * 0.04);
        pts.push([round(Math.cos(a) * rad), round(yy), round(Math.sin(a) * rad)]);
      }
    }
    pts.push(pts[0]);
    strands.push(pts);
  }
  return strands;
}

/* vertical drops from the top, the way some people hang lights quickly */
export function dropPoints(L, { drops = 10, depth = 0.9 }) {
  const strands = [];
  const pts = [];
  for (let i = 0; i < drops; i++) {
    const a = (i / drops) * TAU;
    const down = i % 2 === 0;
    for (let j = 0; j <= 10; j++) {
      const t = down ? j / 10 : 1 - j / 10;
      const y = lerp(L.H - 0.1, L.yb + 0.05, t);
      const rad = L.profile(y) * depth;
      const aa = a + (t * 0.25);
      pts.push([round(Math.cos(aa) * rad), round(y), round(Math.sin(aa) * rad)]);
    }
  }
  strands.push(pts);
  return strands;
}

/* a hull hit (tree-local) pushed back into the foliage */
export function tuck(L, p, depth = 0.88) {
  const r = L.profile(p.y) * depth;
  const len = Math.hypot(p.x, p.z) || 1;
  return pack(new THREE.Vector3((p.x / len) * r, p.y, (p.z / len) * r));
}

export function strandLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
  return d;
}

/* ---------- Drawing ---------- */
const bulbGeo = {};
function geoFor(kind, size) {
  const key = kind + size;
  if (bulbGeo[key]) return bulbGeo[key];
  let g;
  if (kind === 'bulb') {
    g = new THREE.LatheGeometry([[0, 0], [size * 0.45, 0.2 * size], [size * 0.7, size * 1.1], [size * 0.55, size * 1.9], [size * 0.2, size * 2.4], [0, size * 2.6]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  } else if (kind === 'mini') {
    g = new THREE.CapsuleGeometry(size * 0.6, size * 1.6, 3, 8); g.translate(0, size * 1.4, 0);
  } else if (kind === 'bubble') {
    g = new THREE.CylinderGeometry(size * 0.32, size * 0.32, size * 4, 8); g.translate(0, size * 2.6, 0);
  } else {
    g = new THREE.SphereGeometry(size, 6, 4);
  }
  bulbGeo[key] = g;
  return g;
}

export class StrandSet {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'strands';
    parent.add(this.group);
    this.items = [];
    this.on = true;
    this.mode = 'steady';
    this.glowCount = 0;
    this.glowColor = new THREE.Color(0xffc080);
    this.glowLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffc080, 0, 2.4, 1.6);
      this.group.add(l);
      this.glowLights.push(l);
    }
  }
  clear() {
    for (const it of this.items) { this.group.remove(it.obj); it.obj.traverse(o => { if (o.geometry && !Object.values(bulbGeo).includes(o.geometry)) o.geometry.dispose(); }); }
    this.items = [];
  }
  set(strands, layout) {
    this.clear();
    this.layout = layout;
    for (const s of strands) this.items.push(this.make(s));
    this.updateGlow();
  }
  make(s) {
    const T = STRANDS[s.type];
    const obj = new THREE.Group();
    const pts = s.points.map(p => new THREE.Vector3(...p));
    if (pts.length < 2) return { s, obj, bulbs: null };
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const r = rng(s.points.length * 31 + Math.round(len * 100));
    const item = { s, obj, curve, len, bulbs: null, phases: [], colors: [] };
    if (T.kind === 'garland') {
      const n = Math.min(4000, Math.floor(len / T.spacing));
      let geo, matl;
      if (T.bead === 'popcorn') { geo = new THREE.IcosahedronGeometry(0.009, 1); matl = new THREE.MeshStandardMaterial({ roughness: 0.9 }); }
      else if (T.bead === 'gold') { geo = new THREE.SphereGeometry(0.009, 12, 8); matl = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.18 }); }
      else { geo = new THREE.PlaneGeometry(0.003, 0.05); matl = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }); }
      const mesh = new THREE.InstancedMesh(geo, matl, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const p = curve.getPointAt(i / n);
        let c;
        if (T.bead === 'popcorn') {
          const cran = i % 4 === 3;
          c = cran ? new THREE.Color(0x8e0f1a) : new THREE.Color(0xf6ecd4).multiplyScalar(0.9 + r() * 0.15);
          sc.setScalar(cran ? 0.7 : 0.9 + r() * 0.5);
        } else if (T.bead === 'gold') { c = new THREE.Color(0xe0b04a); sc.setScalar(1); }
        else { c = new THREE.Color(0xdfe6f2).multiplyScalar(0.8 + r() * 0.4); sc.setScalar(0.7 + r() * 0.6); }
        e.set(r() * TAU, r() * TAU, r() * TAU); q.setFromEuler(e);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c);
      }
      mesh.castShadow = true;
      obj.add(mesh);
    } else {
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, Math.round(len * 40)), T.kind === 'fairy' ? 0.0007 : 0.0022, 4),
        new THREE.MeshStandardMaterial({ color: T.wire, roughness: 0.6, metalness: T.kind === 'fairy' ? 0.8 : 0 }));
      obj.add(wire);
      const n = Math.max(1, Math.floor(len / T.spacing));
      const mesh = new THREE.InstancedMesh(geoFor(T.kind, T.size), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const p = curve.getPointAt(t);
        // bulbs point outward and up, away from the trunk
        const out = new THREE.Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.7).add(new THREE.Vector3(r() - 0.5, 1, r() - 0.5).multiplyScalar(T.kind === 'bubble' ? 1.6 : 0.6)).normalize();
        q.setFromUnitVectors(up, out);
        m.compose(p, q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
        const c = new THREE.Color(T.colors[i % T.colors.length]);
        item.colors.push(c);
        item.phases.push(r() * TAU);
        mesh.setColorAt(i, c);
      }
      mesh.frustumCulled = false;
      obj.add(mesh);
      item.bulbs = mesh;
      item.T = T;
    }
    this.group.add(obj);
    return item;
  }
  add(s) { const it = this.make(s); this.items.push(it); this.updateGlow(); return it; }
  updateGlow() {
    // three soft lights inside the tree, tinted by the average bulb color
    let sum = new THREE.Color(0, 0, 0), n = 0;
    for (const it of this.items) if (it.bulbs) for (const c of it.colors) { sum.add(c); n++; }
    const L = this.layout;
    this.glowColor = n ? sum.multiplyScalar(1 / n) : new THREE.Color(0xffc080);
    this.glowCount = n;
    this.glowLights.forEach((l, i) => {
      l.color.copy(this.glowColor);
      if (L) l.position.set(0, L.yb + (L.H - L.yb) * (0.2 + i * 0.3), 0);
    });
  }
  update(time, dayness) {
    const c = new THREE.Color();
    let avg = 0, cnt = 0;
    for (const it of this.items) {
      if (!it.bulbs) continue;
      const mesh = it.bulbs;
      const n = it.colors.length;
      for (let i = 0; i < n; i++) {
        let b = 1;
        if (!this.on) b = 0.06;
        else if (this.mode === 'twinkle') { const s = Math.sin(time * 2.3 + it.phases[i] * 3) + Math.sin(time * 3.7 + it.phases[i]); b = s > 1.3 ? 0.25 : 1; }
        else if (this.mode === 'fade') b = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.9 + (i % it.T.colors.length) * 1.6));
        else if (this.mode === 'chase') b = ((i / 3 - time * 2) % 1 + 1) % 1 < 0.4 ? 1 : 0.22;
        if (it.T.kind === 'bubble' && this.on) b *= 0.9 + 0.1 * Math.sin(time * 20 + it.phases[i]);
        const k = this.on ? lerp(4.2, 2.2, dayness) * it.T.glow : 1;
        c.copy(it.colors[i]).multiplyScalar(b * k);
        mesh.setColorAt(i, this.on ? c : c.copy(it.colors[i]).multiplyScalar(0.25));
        avg += b; cnt++;
      }
      mesh.instanceColor.needsUpdate = true;
    }
    const level = cnt ? avg / cnt : 0;
    const strength = this.on ? clamp(this.glowCount / 160, 0.2, 1.1) * level * lerp(0.45, 0.15, dayness) : 0;
    this.glowLights.forEach(l => { l.intensity = strength; });
  }
  get bulbCount() { return this.items.reduce((s, it) => s + (it.colors?.length || 0), 0); }
}
