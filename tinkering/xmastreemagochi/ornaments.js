/* The ornament box. Each builder returns a group whose origin is the hook (or, for
   perching and topper pieces, the point that rests on the branch). */
import * as THREE from 'three';
import { rng, TAU, canvasTexture } from './util.js';
import { mergeGeometries, birdNest } from './tree.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const matCache = new Map();
function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
const glass = c => mat('g' + c, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.07, envMapIntensity: 1.4 }));
const matte = c => mat('m' + c, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.55 }));
const gold = () => mat('gold', () => new THREE.MeshStandardMaterial({ color: 0xd9a73c, metalness: 1, roughness: 0.25 }));
const brass = () => mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xb8924a, metalness: 1, roughness: 0.35 }));
const silver = () => mat('silver', () => new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 1, roughness: 0.12 }));
const plain = (c, r = 0.8) => mat(`p${c}${r}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: r }));
const straw = () => mat('straw', () => new THREE.MeshStandardMaterial({ color: 0xd8b86a, roughness: 0.7 }));

function cap(g, y = 0, r = 0.008) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.009, 12), gold());
  c.position.y = y - 0.0045;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.0035, 0.0009, 6, 12), gold());
  loop.position.y = y + 0.002;
  g.add(c, loop);
  return y - 0.009;
}
const lathe = (pts, m, seg = 28) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), seg), m);
const tex = (w, h, draw) => canvasTexture(w, h, draw);

/* ---------- Builders ---------- */
const B = {
  ball(c) {
    const g = new THREE.Group();
    const y = cap(g);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.036, 32, 20), glass(c));
    s.position.y = y - 0.034;
    g.add(s);
    return g;
  },
  matteBall(c) {
    const g = new THREE.Group();
    const y = cap(g);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.034, 28, 18), matte(c));
    s.position.y = y - 0.032;
    g.add(s);
    return g;
  },
  shinyBrite(c) {
    const g = new THREE.Group();
    const y = cap(g, 0, 0.009);
    const col = new THREE.Color(c).getStyle();
    const t = tex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff8ec'; ctx.fillRect(0, h * 0.4, w, h * 0.2);
      ctx.fillStyle = col;
      for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.ellipse((i + 0.5) * w / 16, h / 2, 4, 9, 0, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
      for (const yy of [0.36, 0.64]) { ctx.beginPath(); ctx.moveTo(0, h * yy); ctx.lineTo(w, h * yy); ctx.stroke(); }
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 32, 20), new THREE.MeshStandardMaterial({ map: t, metalness: 0.5, roughness: 0.12 }));
    s.position.y = y - 0.033;
    // the indented reflector on one side
    const dimple = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 12, 0, TAU, 0, 1.1), silver());
    dimple.rotation.x = Math.PI / 2;
    dimple.position.set(0, y - 0.033, 0.036);
    dimple.scale.set(1, 1, -0.5);
    g.add(s, dimple);
    return g;
  },
  finial(c) {
    const g = new THREE.Group();
    const y = cap(g, 0, 0.006);
    const m = lathe([[0, 0], [0.006, -0.004], [0.012, -0.012], [0.02, -0.03], [0.012, -0.045], [0.017, -0.055], [0.011, -0.068], [0.004, -0.1], [0.0015, -0.13], [0, -0.135]], glass(c));
    m.position.y = y;
    g.add(m);
    return g;
  },
  icicle() {
    const g = new THREE.Group();
    const geo = new THREE.ConeGeometry(0.008, 0.13, 6, 12);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i), a = (yy + 0.065) * 40;
      const x = p.getX(i), z = p.getZ(i);
      p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), yy, x * Math.sin(a) + z * Math.cos(a));
    }
    geo.computeVertexNormals();
    geo.rotateX(Math.PI);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xeaf6ff, metalness: 0.3, roughness: 0.03, transparent: true, opacity: 0.72 }));
    m.position.y = -0.07;
    g.add(m);
    return g;
  },
  candyCane() {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.022, -0.012, 0), new THREE.Vector3(-0.018, 0.004, 0), new THREE.Vector3(0, 0.008, 0),
      new THREE.Vector3(0.012, -0.004, 0), new THREE.Vector3(0.012, -0.03, 0), new THREE.Vector3(0.012, -0.11, 0)]);
    const t = tex(256, 16, (ctx, w, h) => {
      ctx.fillStyle = '#fbf6ef'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d4202a';
      for (let i = -2; i < 20; i++) { ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16 + 7, 0); ctx.lineTo(i * 16 + 15, h); ctx.lineTo(i * 16 + 8, h); ctx.fill(); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0055, 10), new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 }));
    m.position.x = 0.022;
    m.position.y = -0.002;
    g.add(m);
    return g;
  },
  pinecone() {
    const g = new THREE.Group();
    const parts = [];
    const r = rng(9);
    for (let row = 0; row < 11; row++) {
      const t = row / 10;
      const rad = Math.sin(Math.PI * (0.15 + t * 0.85)) * 0.018 + 0.004;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + row * 0.4;
        const s = new THREE.SphereGeometry(0.008, 6, 4);
        s.scale(1, 0.45, 0.8);
        s.rotateZ(-0.6);
        s.translate(rad, 0, 0);
        s.rotateY(a);
        s.translate(0, -0.012 - t * 0.06, 0);
        parts.push(s);
      }
    }
    const m = new THREE.Mesh(mergeGeometries(parts), plain(0x7a5230, 0.9));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.012, 6), plain(0x5a3c22));
    stem.position.y = -0.006;
    g.add(m, stem);
    return g;
  },
  snowflake() {
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const arm = new THREE.BoxGeometry(0.004, 0.04, 0.002); arm.translate(0, 0.02, 0);
      arm.rotateZ(a); parts.push(arm);
      for (const k of [0.45, 0.72]) {
        for (const s of [-1, 1]) {
          const b = new THREE.BoxGeometry(0.003, 0.014 * (1.2 - k), 0.002);
          b.translate(0, 0.007 * (1.2 - k), 0); b.rotateZ(s * 0.9); b.translate(0, 0.04 * k, 0); b.rotateZ(a);
          parts.push(b);
        }
      }
    }
    const m = new THREE.Mesh(mergeGeometries(parts), mat('snow', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3, emissive: 0x222833 })));
    m.position.y = -0.042;
    g.add(m);
    return g;
  },
  bell(c) {
    const g = new THREE.Group();
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.001, 6, 12), brass()); g.add(loop);
    const m = lathe([[0, -0.004], [0.008, -0.006], [0.013, -0.015], [0.015, -0.03], [0.02, -0.042], [0.026, -0.05], [0.025, -0.052]], new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: 0.22, side: THREE.DoubleSide }));
    const clap = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), brass()); clap.position.y = -0.048;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0025, 6, 12), plain(0xb3121f, 0.6)); bow.position.y = -0.005; bow.scale.set(1.4, 0.6, 1);
    g.add(m, clap, bow);
    return g;
  },
  gingerbread() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.absarc(0, 0.032, 0.014, -0.3 * Math.PI, 1.3 * Math.PI, false);
    s.lineTo(-0.032, 0.012); s.quadraticCurveTo(-0.036, 0.004, -0.03, 0.002); s.lineTo(-0.012, 0.006);
    s.lineTo(-0.024, -0.03); s.quadraticCurveTo(-0.022, -0.038, -0.014, -0.034); s.lineTo(0, -0.012);
    s.lineTo(0.014, -0.034); s.quadraticCurveTo(0.022, -0.038, 0.024, -0.03); s.lineTo(0.012, 0.006);
    s.lineTo(0.03, 0.002); s.quadraticCurveTo(0.036, 0.004, 0.032, 0.012); s.lineTo(0.008, 0.02);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 });
    const m = new THREE.Mesh(geo, plain(0x9a5a2a, 0.85));
    m.position.set(0, -0.048, -0.003);
    const icing = plain(0xfffaf0, 0.5);
    for (const [x, y] of [[-0.005, 0.036], [0.005, 0.036], [0, 0.012], [0, 0.0], [0, -0.012]]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), icing);
      d.position.set(x, y - 0.048, 0.0045); g.add(d);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.001, 4, 10, Math.PI), icing);
    smile.rotation.z = Math.PI; smile.position.set(0, 0.029 - 0.048, 0.0045); g.add(smile);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.001, 4, 10), plain(0xc21b2b, 0.6));
    g.add(m, ribbon);
    return g;
  },
  pickle() {
    const g = new THREE.Group();
    const y = cap(g, 0, 0.005);
    const geo = new THREE.CapsuleGeometry(0.012, 0.06, 8, 16);
    const p = geo.attributes.position;
    const r = rng(3);
    const bumps = Array.from({ length: 40 }, () => [r() * TAU, r.range(-0.04, 0.04)]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      let k = 1 + 0.12 * Math.sin(yy * 30);
      for (const [ba, by] of bumps) { const d = Math.hypot(Math.sin(a - ba) * 0.012, yy - by); k += 0.18 * Math.exp(-d * d / 0.00002); }
      const bend = Math.sin((yy + 0.042) / 0.084 * Math.PI) * 0.005;
      p.setXYZ(i, x * k + bend, yy, z * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3f7a1f, metalness: 0.45, roughness: 0.18 }));
    m.position.y = y - 0.043;
    g.add(m);
    return g;
  },
  spider() {
    const g = new THREE.Group();
    const parts = [];
    const R = 0.04;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const b = new THREE.CylinderGeometry(0.0006, 0.0006, R, 3); b.translate(0, R / 2, 0); b.rotateZ(a); parts.push(b);
    }
    for (const k of [0.3, 0.52, 0.74, 0.96]) {
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU;
        const p0 = new THREE.Vector3(-Math.sin(a0) * R * k, Math.cos(a0) * R * k, 0), p1 = new THREE.Vector3(-Math.sin(a1) * R * k, Math.cos(a1) * R * k, 0);
        const len = p0.distanceTo(p1);
        const c = new THREE.CylinderGeometry(0.0005, 0.0005, len, 3);
        c.rotateZ(Math.PI / 2);
        c.rotateZ(Math.atan2(p1.y - p0.y, p1.x - p0.x));
        c.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0);
        parts.push(c);
      }
    }
    const web = new THREE.Mesh(mergeGeometries(parts), mat('web', () => new THREE.MeshStandardMaterial({ color: 0xf0f3ff, metalness: 0.9, roughness: 0.2, emissive: 0x30333a })));
    web.position.y = -R;
    const body = new THREE.Group();
    const abd = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), plain(0x111111, 0.3)); abd.scale.set(1, 1.2, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 10, 8), plain(0x111111, 0.3)); head.position.y = 0.009;
    body.add(abd, head);
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1, k = i % 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.014, 3), plain(0x111111));
      leg.rotation.z = s * (0.9 + k * 0.25) ; leg.position.set(s * 0.008, 0.006 - k * 0.004, 0);
      body.add(leg);
    }
    body.position.set(0.008, -R + 0.01, 0.002);
    g.add(web, body);
    return g;
  },
  bombka(c) {
    const g = new THREE.Group();
    const y = cap(g);
    const col = new THREE.Color(c).getStyle();
    const t = tex(512, 256, (ctx, w, h) => {
      ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
      const r = rng(11);
      const flower = (x, yy, s, petal, center) => {
        ctx.fillStyle = petal;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(x + Math.cos(i) * s, yy + Math.sin(i) * s, s * 0.9, s * 0.45, i, 0, TAU); ctx.fill(); }
        ctx.fillStyle = center; ctx.beginPath(); ctx.arc(x, yy, s * 0.5, 0, TAU); ctx.fill();
      };
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.5) * w / 4;
        ctx.strokeStyle = '#3b8f3a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 40, h / 2 + 30); ctx.quadraticCurveTo(x, h / 2 - 10, x + 40, h / 2 + 30); ctx.stroke();
        flower(x, h / 2, 18, r() < 0.5 ? '#e9283a' : '#f6c22d', '#fff4d6');
        flower(x - 40, h / 2 + 30, 9, '#4a7fe0', '#fff');
        flower(x + 40, h / 2 + 30, 9, '#f08ac2', '#fff');
      }
      ctx.fillStyle = '#e6b84a';
      for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc(r() * w, r() < 0.5 ? h * 0.22 : h * 0.8, 2.5, 0, TAU); ctx.fill(); }
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.037, 32, 20), new THREE.MeshStandardMaterial({ map: t, metalness: 0.35, roughness: 0.15 }));
    s.position.y = y - 0.035;
    g.add(s);
    return g;
  },
  kugel(c) {
    const g = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.006, 0.01, 8), brass());
    crown.position.y = -0.005;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0012, 6, 12), brass());
    g.add(crown, loop);
    const m = new THREE.MeshStandardMaterial({ color: c, metalness: 0.75, roughness: 0.08 });
    const r = rng(4);
    const parts = [];
    for (let row = 0; row < 6; row++) {
      const n = Math.max(1, 6 - row);
      const rad = 0.006 + (6 - row) * 0.0035;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + row;
        const s = new THREE.SphereGeometry(0.0085, 14, 10);
        s.translate(Math.cos(a) * rad * 0.9, -0.016 - row * 0.011, Math.sin(a) * rad * 0.9);
        parts.push(s);
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(parts), m));
    return g;
  },
  dresden() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    const N = 16;
    for (let i = 0; i <= N * 2; i++) {
      const a = (i / (N * 2)) * TAU + Math.PI / 2;
      const r = i % 2 ? 0.016 : (i % 4 ? 0.03 : 0.038);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.008, 0, TAU, true); s.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0006, bevelSegments: 1 });
    const m = new THREE.Mesh(geo, gold()); m.position.y = -0.04;
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.006, 14, 10), glass(0xb3121f)); gem.position.y = -0.04;
    g.add(m, gem);
    return g;
  },
  himmeli() {
    const g = new THREE.Group();
    const parts = [];
    const v = [[0, 0.03, 0], [0, -0.03, 0], [0.02, 0, 0], [-0.02, 0, 0], [0, 0, 0.02], [0, 0, -0.02]].map(a => new THREE.Vector3(...a));
    const edges = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]];
    const addEdge = (a, b, rr) => {
      const len = a.distanceTo(b);
      const c = new THREE.CylinderGeometry(rr, rr, len, 5);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(c);
    };
    for (const [a, b] of edges) addEdge(v[a], v[b], 0.0012);
    const inner = v.map(p => p.clone().multiplyScalar(0.45));
    for (const [a, b] of edges) addEdge(inner[a], inner[b], 0.0008);
    addEdge(v[0], v[1], 0.0006);
    const m = new THREE.Mesh(mergeGeometries(parts), straw()); m.position.y = -0.031;
    g.add(m);
    return g;
  },
  wovenHeart(c) {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, -0.5); s.lineTo(-0.5, 0); s.absarc(-0.25, 0.25, 0.3536, Math.PI * 1.25, Math.PI * 0.25, true);
    s.absarc(0.25, 0.25, 0.3536, Math.PI * 0.75, -Math.PI * 0.25, true); s.lineTo(0, -0.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
    const col = new THREE.Color(c).getStyle();
    const t = tex(256, 256, (ctx, w, h) => {
      const n = 5;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? col : '#f6f1e6';
        ctx.fillRect(i * w / n, j * h / n, w / n, h / n);
      }
    });
    t.rotation = Math.PI / 4; t.center.set(0.5, 0.5); t.repeat.set(1.4, 1.4); t.offset.set(0.5, 0.5);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
    m.rotation.z = Math.PI;
    m.scale.setScalar(0.07);
    m.position.set(0, -0.047, -0.0014);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0018, 4, 16, Math.PI), plain(0xf6f1e6));
    handle.position.y = -0.016;
    g.add(m, handle);
    return g;
  },
  strawGoat() {
    const g = new THREE.Group();
    const parts = [];
    const tube = (pts, rr = 0.003) => parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 12, rr, 5));
    tube([[-0.025, -0.035, 0], [0.025, -0.035, 0]], 0.007);
    tube([[0.022, -0.035, 0], [0.03, -0.022, 0], [0.034, -0.012, 0]], 0.004);
    tube([[0.032, -0.012, 0], [0.042, -0.014, 0]], 0.0035);
    for (const zz of [-0.005, 0.005]) tube([[0.032, -0.01, zz], [0.026, 0.0, zz * 2], [0.018, -0.002, zz * 3], [0.02, -0.01, zz * 3]], 0.0015);
    for (const [x, zz] of [[-0.02, -0.004], [-0.02, 0.004], [0.018, -0.004], [0.018, 0.004]]) tube([[x, -0.035, zz], [x, -0.065, zz * 1.5]], 0.0022);
    tube([[-0.025, -0.034, 0], [-0.033, -0.026, 0]], 0.002);
    const m = new THREE.Mesh(mergeGeometries(parts), straw());
    const rib = plain(0xc0141f, 0.6);
    for (const x of [-0.012, 0.012]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.0015, 5, 12), rib); b.rotation.y = Math.PI / 2; b.position.set(x, -0.035, 0); g.add(b); }
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.028, 3), plain(0xc0141f));
    thread.position.y = -0.014;
    g.add(m, thread);
    return g;
  },
  moravian(c, big = false) {
    const g = new THREE.Group();
    const dirs = [];
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) dirs.push(new THREE.Vector3(x, y, z).normalize());
    const R = big ? 0.06 : 0.026;
    const parts = [new THREE.SphereGeometry(R * 0.35, 12, 8)];
    for (const d of dirs) {
      const cone = new THREE.ConeGeometry(R * 0.17, R, 4);
      cone.translate(0, R * 0.5 + R * 0.25, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      parts.push(cone);
    }
    const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.35, flatShading: true }));
    m.position.y = big ? R * 1.3 : -R * 1.3;
    m.userData.glow = true;
    g.add(m);
    return g;
  },
  bird(c) {
    const g = new THREE.Group();   // perches: origin is the clip on the branch
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 14), glass(c)); body.scale.set(1.6, 1, 1); body.position.set(0, 0.014, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), glass(c)); head.position.set(0.02, 0.024, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.008, 6), gold()); beak.rotation.z = -Math.PI / 2; beak.position.set(0.031, 0.023, 0);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.006), brass());
    g.add(body, head, beak, clip);
    // spun-glass tail
    const pts = [];
    const r = rng(c);
    for (let i = 0; i < 90; i++) {
      const a = r.range(-0.5, 0.5), b = r.range(-0.35, 0.35), len = r.range(0.035, 0.055);
      pts.push(-0.018, 0.016, 0, -0.018 - Math.cos(a) * len, 0.016 + Math.sin(a) * len * 0.6 + 0.01, Math.sin(b) * len * 0.8);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })));
    return g;
  },
  nest() { const n = birdNest(); n.scale.setScalar(0.9); return n; },
  mushroom() {
    const g = new THREE.Group();
    const capM = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 12, 0, TAU, 0, Math.PI / 2), plain(0xc8161d, 0.85));
    capM.scale.set(1, 0.7, 1); capM.position.y = -0.016;
    const under = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), plain(0xf2e8d4)); under.rotation.x = Math.PI / 2; under.position.y = -0.016;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.026, 12), plain(0xf5efe2, 0.95)); stem.position.y = -0.03;
    const r = rng(2);
    for (let i = 0; i < 14; i++) {
      const th = r() * TAU, ph = r.range(0.15, 1.2);
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 4), plain(0xffffff, 0.9));
      d.position.set(Math.sin(ph) * Math.cos(th) * 0.022, -0.016 + Math.cos(ph) * 0.0155, Math.sin(ph) * Math.sin(th) * 0.022);
      d.scale.set(1, 0.5, 1);
      g.add(d);
    }
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.002, 3), plain(0xffffff));
    g.add(capM, under, stem, thread);
    return g;
  },
  acorn() {
    const g = new THREE.Group();
    const y = cap(g, 0, 0.004);
    const nut = lathe([[0, -0.016], [0.012, -0.018], [0.016, -0.03], [0.013, -0.045], [0.006, -0.054], [0, -0.056]], silver());
    nut.position.y = y;
    const cupT = tex(64, 64, (ctx, w, h) => { ctx.fillStyle = '#8a6a2a'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c9a24a'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.beginPath(); ctx.arc(i * 8 + (j % 2) * 4 + 4, j * 8 + 4, 3, 0, TAU); ctx.fill(); } });
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.0175, 20, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: cupT, metalness: 0.8, roughness: 0.4 }));
    cup.scale.set(1, 0.6, 1); cup.position.y = y - 0.016;
    g.add(nut, cup);
    return g;
  },
  pysanka(c) {
    const g = new THREE.Group();
    const col = new THREE.Color(c).getStyle();
    const t = tex(512, 256, (ctx, w, h) => {
      ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111'; ctx.fillRect(0, h * 0.47, w, h * 0.06);
      ctx.strokeStyle = '#f5e7c8'; ctx.lineWidth = 3;
      for (const yy of [0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(0, h * yy); ctx.lineTo(w, h * yy); ctx.stroke(); }
      ctx.fillStyle = '#f3c02a';
      for (let i = 0; i < 8; i++) {
        const x = (i + 0.5) * w / 8;
        ctx.beginPath(); ctx.moveTo(x, h * 0.32); ctx.lineTo(x + 18, h * 0.4); ctx.lineTo(x, h * 0.46); ctx.lineTo(x - 18, h * 0.4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, h * 0.54); ctx.lineTo(x + 18, h * 0.6); ctx.lineTo(x, h * 0.68); ctx.lineTo(x - 18, h * 0.6); ctx.fill();
        ctx.save(); ctx.translate(x + w / 16, h * 0.15); ctx.fillStyle = '#f5e7c8';
        for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(0, -2, 14, 4); }
        ctx.restore();
        ctx.save(); ctx.translate(x + w / 16, h * 0.85); ctx.fillStyle = '#f5e7c8';
        for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(0, -2, 14, 4); }
        ctx.restore();
      }
    });
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.022, 28, 20), new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 }));
    egg.scale.set(1, 1.35, 1); egg.position.y = -0.033;
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.004, 3), plain(0xc0141f)); thread.position.y = -0.002;
    g.add(egg, thread);
    return g;
  },
  lilac() {
    const g = new THREE.Group();
    const r = rng(8);
    const parts = [], parts2 = [];
    for (let i = 0; i < 70; i++) {
      const t = r();
      const rad = (1 - t) * 0.016 + 0.003;
      const a = r() * TAU;
      const s = new THREE.SphereGeometry(0.0042, 6, 5);
      s.translate(Math.cos(a) * rad, -0.008 - t * 0.06, Math.sin(a) * rad);
      (r() < 0.5 ? parts : parts2).push(s);
    }
    g.add(new THREE.Mesh(mergeGeometries(parts), glass(0x9a6fd1)));
    g.add(new THREE.Mesh(mergeGeometries(parts2), glass(0xc6a6ef)));
    const leafS = new THREE.Shape(); leafS.moveTo(0, 0); leafS.quadraticCurveTo(0.014, 0.012, 0, 0.032); leafS.quadraticCurveTo(-0.014, 0.012, 0, 0);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafS), new THREE.MeshStandardMaterial({ color: 0x3e7a35, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
      leaf.rotation.z = s * 2.2; leaf.position.set(s * 0.004, -0.008, 0.004);
      g.add(leaf);
    }
    return g;
  },
  zeppelin() {
    const g = new THREE.Group();
    const hullM = glass(0xc9ccd4);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.05, 8, 18), hullM); body.rotation.z = Math.PI / 2; body.position.y = -0.026;
    const gond = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.005, 0.006), glass(0xc2a24a)); gond.position.y = -0.04;
    g.add(body, gond);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.0012), glass(0xb3121f));
      fin.position.set(-0.033, -0.026, 0); fin.rotation.x = (i * Math.PI) / 2; fin.translateY(0.009);
      g.add(fin);
    }
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.015, 3), silver()); wire.position.y = -0.007;
    g.add(wire);
    return g;
  },
  /* ---- Toppers: origin sits on the leader, piece rises above ---- */
  star() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.045 : 0.11;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.008, bevelSegments: 2 }),
      new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1, roughness: 0.2, emissive: 0xffb43a, emissiveIntensity: 0.6 }));
    m.position.set(0, 0.13, -0.006);
    m.userData.glow = true;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.06, 10), gold()); stem.position.y = 0.01;
    g.add(m, stem);
    return g;
  },
  angel() {
    const g = new THREE.Group();
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6efe0, roughness: 0.7, side: THREE.DoubleSide }));
    dress.position.y = 0.06;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.004, 6, 24), gold()); trim.rotation.x = Math.PI / 2; trim.position.y = -0.018;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), plain(0xf1cfb0, 0.6)); head.position.y = 0.16;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 12, 0, TAU, 0, 1.6), plain(0xc89a4a, 0.7)); hair.position.y = 0.163;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0025, 6, 24), new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.2, emissive: 0xffc04a, emissiveIntensity: 0.8 }));
    halo.rotation.x = Math.PI / 2.4; halo.position.y = 0.195;
    halo.userData.glow = true;
    const wingS = new THREE.Shape(); wingS.moveTo(0, 0); wingS.bezierCurveTo(0.03, 0.06, 0.09, 0.06, 0.1, 0.02); wingS.bezierCurveTo(0.07, 0.0, 0.04, -0.04, 0, -0.03);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ShapeGeometry(wingS), new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide, emissive: 0x222018 }));
      w.position.set(0, 0.11, -0.02); w.scale.x = s; w.rotation.y = s * -0.5;
      g.add(w);
    }
    g.add(dress, trim, head, hair, halo);
    return g;
  },
  parol(c) {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.05 : 0.12;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.03, 0, TAU, true); s.holes.push(hole);
    const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.5, transparent: true, opacity: 0.92 }));
    panel.position.set(0, 0.15, -0.01);
    panel.userData.glow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffe38a, emissiveIntensity: 1.4 }));
    ring.position.y = 0.15; ring.userData.glow = true;
    g.add(panel, ring);
    for (const x of [-0.03, 0.03]) {
      const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x * 0.5, 0.08, 0.01), new THREE.Vector3(x, 0.02, 0.02), new THREE.Vector3(x * 1.6, -0.06, 0.01)]), 16, 0.004, 6),
        new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd36b, emissiveIntensity: 0.8 }));
      tail.userData.glow = true;
      g.add(tail);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.06, 8), plain(0x6b4a2a)); stem.position.y = 0.01;
    g.add(stem);
    return g;
  },
  moravianTop(c) { return B.moravian(c, true); },
  spire(c) {
    const g = new THREE.Group();
    const m = lathe([[0.012, 0], [0.016, 0.02], [0.03, 0.05], [0.032, 0.07], [0.018, 0.09], [0.012, 0.1], [0.024, 0.12], [0.022, 0.135], [0.01, 0.15], [0.006, 0.2], [0.002, 0.26], [0, 0.27]], glass(c));
    g.add(m);
    return g;
  },
};

/* ---------- Catalog ---------- */
const COLORS = {
  glass: [0xb3121f, 0xd4a13a, 0xc9ccd4, 0x14683a, 0x1f4fb5, 0xc23f86, 0x6a2a8a, 0x0f8a8a],
  matte: [0x8e1b22, 0xe7dccb, 0x2d4a3a, 0xc98f2a, 0x9aa7b8],
  brite: [0xd8354a, 0x3e8ad8, 0x3aa75a, 0xe0b23c, 0xe58ab8],
  kugel: [0x6a2a8a, 0xb3121f, 0x14683a, 0xc9a23c],
  bombka: [0x101828, 0x6e0f16, 0x0e3b2a],
  heart: [0xc0141f, 0x1d6b3a],
  pysanka: [0x9c1414, 0x15161a],
  parol: [0xd6262a, 0xf4c430, 0x2c6fd6],
  moravian: [0xfff3d4, 0xd6262a, 0xf4c430],
  bird: [0xd4d8e0, 0xc23f2a, 0x3a7fd0, 0xd4a13a],
  bell: [0xd9a73c, 0xc9ccd4, 0xb3121f],
};

export const ORNAMENTS = [
  { id: 'ball', name: 'Glass ball', group: 'Classics', note: 'Blown glass, silvered inside.', build: B.ball, colors: COLORS.glass, fragile: true },
  { id: 'matteBall', name: 'Satin ball', group: 'Classics', note: 'Soft satin-finish glass.', build: B.matteBall, colors: COLORS.matte, fragile: true },
  { id: 'finial', name: 'Teardrop finial', group: 'Classics', note: 'A long glass drop, the shape Lauscha glassblowers made famous.', build: B.finial, colors: COLORS.glass, fragile: true },
  { id: 'icicle', name: 'Glass icicle', group: 'Classics', note: 'Twisted clear glass that catches the lights.', build: B.icicle, fragile: true },
  { id: 'candyCane', name: 'Candy cane', group: 'Classics', note: 'Peppermint, hung by its crook.', build: B.candyCane },
  { id: 'pinecone', name: 'Pinecone', group: 'Classics', note: 'Picked up on a walk and kept for years.', build: B.pinecone },
  { id: 'snowflake', name: 'Glitter snowflake', group: 'Classics', note: 'Six arms, no two alike (these two are alike).', build: B.snowflake },
  { id: 'bell', name: 'Jingle bell', group: 'Classics', note: 'Brass bell with a red bow. It really rings.', build: B.bell, colors: COLORS.bell },
  { id: 'gingerbread', name: 'Gingerbread man', group: 'Classics', note: 'Baked hard and iced. Smells good for a week.', build: B.gingerbread },
  { id: 'shinyBrite', name: 'Indent reflector', group: 'Heirlooms', note: 'A 1950s-style ball with a silvered dimple and painted stripes.', build: B.shinyBrite, colors: COLORS.brite, fragile: true },
  { id: 'kugel', name: 'Kugel grape cluster', group: 'Heirlooms', note: 'Heavy, thick-walled German glass from the 1800s, capped in brass.', build: B.kugel, colors: COLORS.kugel, fragile: true },
  { id: 'dresden', name: 'Dresden paper star', group: 'Heirlooms', note: 'Embossed gilded cardboard, made around Dresden c.1880–1910.', build: B.dresden },
  { id: 'bird', name: 'Clip-on bird', group: 'Heirlooms', note: 'Victorian glass bird with a spun-glass tail. Clips onto a branch.', build: B.bird, colors: COLORS.bird, fragile: true, perch: true },
  { id: 'acorn', name: 'Mercury glass acorn', group: 'Heirlooms', note: 'Silvered glass nut in a gilt cup.', build: B.acorn, fragile: true },
  { id: 'zeppelin', name: 'Glass airship', group: 'Heirlooms', note: 'Lauscha glassblowers made airships when zeppelins were new, around 1910.', build: B.zeppelin, fragile: true },
  { id: 'pickle', name: 'Glass pickle', group: 'Around the world', note: 'Hang it last. Whoever spots it on Christmas morning gets an extra gift.', build: B.pickle, fragile: true },
  { id: 'spider', name: 'Christmas spider', group: 'Around the world', note: 'Ukrainian legend: spiders webbed a poor family\'s bare tree, and the webs turned to silver at dawn.', build: B.spider },
  { id: 'bombka', name: 'Polish bombka', group: 'Around the world', note: 'Hand-painted glass in the folk style of Polish ornament makers.', build: B.bombka, colors: COLORS.bombka, fragile: true },
  { id: 'himmeli', name: 'Himmeli', group: 'Around the world', note: 'Finnish straw geometry, strung on thread. Said to bring a good harvest.', build: B.himmeli },
  { id: 'wovenHeart', name: 'Woven heart', group: 'Around the world', note: 'A Danish julehjerte, woven from two strips of paper. Hans Christian Andersen made the oldest one known.', build: B.wovenHeart, colors: COLORS.heart },
  { id: 'strawGoat', name: 'Straw goat', group: 'Around the world', note: 'The Swedish julbock, tied with red ribbon.', build: B.strawGoat },
  { id: 'moravian', name: 'Moravian star', group: 'Around the world', note: 'A 26-point paper star first folded at a Moravian school in Germany in the 1830s.', build: B.moravian, colors: COLORS.moravian },
  { id: 'mushroom', name: 'Lucky mushroom', group: 'Around the world', note: 'A felted fly agaric, the German Glückspilz. A lucky mushroom for the year ahead.', build: B.mushroom },
  { id: 'pysanka', name: 'Pysanka egg', group: 'Around the world', note: 'A Ukrainian egg, decorated layer by layer in wax and dye.', build: B.pysanka, colors: COLORS.pysanka, fragile: true },
  { id: 'nest', name: 'Bird\'s nest', group: 'Around the world', note: 'Tuck it into the branches: a tree with a nest has good luck all year.', build: B.nest, perch: true },
  { id: 'lilac', name: 'Glass lilac', group: 'Rochester', note: 'For the Lilac City, and spring in Highland Park.', build: B.lilac, fragile: true },
  // toppers
  { id: 'star', name: 'Gold star', group: 'Toppers', note: 'Lights up with the strand.', build: B.star, topper: true },
  { id: 'angel', name: 'Angel', group: 'Toppers', note: 'Linen gown, gold halo.', build: B.angel, topper: true },
  { id: 'parol', name: 'Parol lantern', group: 'Toppers', note: 'A Filipino star lantern: the light that led the Magi.', build: B.parol, colors: COLORS.parol, topper: true },
  { id: 'moravianTop', name: 'Moravian star', group: 'Toppers', note: 'The big one, glowing from inside.', build: B.moravianTop, colors: COLORS.moravian, topper: true },
  { id: 'spire', name: 'Glass spire', group: 'Toppers', note: 'A tall blown-glass point.', build: B.spire, colors: COLORS.glass, topper: true },
];
export const ORN = Object.fromEntries(ORNAMENTS.map(o => [o.id, o]));

export function buildOrnament(id, colorIndex = 0) {
  const o = ORN[id];
  const c = o.colors ? o.colors[colorIndex % o.colors.length] : undefined;
  const g = o.build(c);
  g.scale.setScalar(o.topper ? 1.25 : 1.2);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
  g.userData.ornament = id;
  return g;
}
