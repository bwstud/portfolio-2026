import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* Settings for the mounted specimen. Each builds a group whose top surface is at y = top,
   sized to the skeleton's footprint. The steel rod a mount stands on is built separately,
   since it follows the pose. */

export const SETTINGS = [
  { id: 'void', name: 'Void', note: 'Floating in empty space, nothing to stand on.' },
  { id: 'stone', name: 'Stone slab', note: 'A honed slab of dark granite.' },
  { id: 'wood', name: 'Wood slab', note: 'A live-edge walnut slab, oiled.' },
  { id: 'case', name: 'Glass case', note: 'A museum vitrine on a walnut plinth.' },
  { id: 'shadow', name: 'Shadow box', note: 'A deep linen-lined box, open at the front.' },
  { id: 'dome', name: 'Glass dome', note: 'A bell jar over a bed of moss, stones and fallen branches.' },
];

function canvasTexture(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

// seeded random so a setting looks the same every time
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

const granite = () => canvasTexture(1024, 1024, (g, w, h) => {
  const r = rng(7);
  g.fillStyle = '#2b2b2d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(15,15,17,${0.5 * r()})` : v < 0.9 ? `rgba(90,88,86,${0.5 * r()})` : `rgba(190,185,178,${0.6 * r()})`;
    const s = 1 + r() * 3.5; g.fillRect(r() * w, r() * h, s, s);
  }
});

const walnut = (seed = 3) => canvasTexture(1024, 1024, (g, w, h) => {
  const r = rng(seed);
  g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {           // grain runs along the slab's length (texture v)
    const x0 = r() * w, amp = 6 + r() * 26, f = 0.004 + r() * 0.01, ph = r() * 6;
    g.strokeStyle = r() < 0.5 ? `rgba(30,17,9,${0.25 + r() * 0.4})` : `rgba(120,80,50,${0.15 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * 2.4; g.beginPath();
    for (let y = 0; y <= h; y += 8) { const x = x0 + Math.sin(y * f + ph) * amp; y ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
});

const linen = () => canvasTexture(512, 512, (g, w, h) => {
  const r = rng(11);
  g.fillStyle = '#d9d0bf'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(120,105,85,${0.04 + r() * 0.06})`; g.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,250,240,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 1, h); }
}, 6);

const glass = () => new THREE.MeshPhysicalMaterial({
  color: '#ffffff', roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.5,
  transparent: true, opacity: 0.18, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false,
});

const steel = new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0.9, roughness: 0.35 });

/* the rod a mounted skeleton stands on: from the base up into the chest; k scales its gauge */
export function buildRod(top, belly, k = 1) {
  const g = new THREE.Group();
  const h = belly.y - top;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * k, 0.016 * k, h, 16), steel);
  post.position.set(belly.x, top + h / 2, belly.z); post.castShadow = true;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * k, 0.09 * k, 0.012 * k, 32), steel);
  foot.position.set(belly.x, top + 0.006 * k, belly.z); foot.castShadow = foot.receiveShadow = true;
  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.06 * k, 0.008 * k, 8, 24, Math.PI), steel);
  cradle.position.set(belly.x, belly.y, belly.z); cradle.rotation.set(0, Math.PI / 2, Math.PI);
  g.add(post, foot, cradle);
  return g;
}

/* foot: the skeleton's floor print {minX,maxX,minZ,maxZ}; height: its top. The settings are
   drawn at the size that suits a giraffe; k shrinks the whole thing (slab, glass, moss) for
   smaller animals, so a moa gets a proportionate plinth rather than a giraffe's. */
export function buildSetting(id, { foot, height, k = 1 }) {
  const s = buildAtScale(id, {
    foot: { minX: foot.minX / k, maxX: foot.maxX / k, minZ: foot.minZ / k, maxZ: foot.maxZ / k }, height: height / k,
  });
  s.group.scale.setScalar(k);
  return { ...s, top: s.top * k };
}

function buildAtScale(id, { foot, height }) {
  const g = new THREE.Group();
  const cx = (foot.minX + foot.maxX) / 2, cz = (foot.minZ + foot.maxZ) / 2;
  const w = foot.maxX - foot.minX + 0.9, d = foot.maxZ - foot.minZ + 0.9;
  let top = 0;
  const add = (m, shadows = true) => { if (shadows) { m.castShadow = true; m.receiveShadow = true; } g.add(m); return m; };

  if (id === 'void') {
    return { group: g, top: 0, floor: false };
  }
  if (id === 'stone') {
    top = 0.14;
    const map = granite(); map.repeat.set(w / 0.8, d / 0.8);
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.05 });
    add(new THREE.Mesh(new RoundedBoxGeometry(w, top, d, 3, 0.012), m)).position.set(cx, top / 2, cz);
  }
  if (id === 'wood' || id === 'case') {
    top = id === 'wood' ? 0.11 : 0.34;
    const map = walnut(id === 'wood' ? 3 : 5); map.rotation = 0;
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0 });
    if (id === 'wood') {
      // live edge: an irregular outline extruded to the slab's thickness
      const r = rng(19), s = new THREE.Shape(), n = 48;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2, wob = 1 + (r() - 0.5) * 0.07 + Math.sin(a * 3 + 1) * 0.03;
        const x = Math.cos(a) * (w / 2 + 0.12) * wob, z = Math.sin(a) * (d / 2 + 0.1) * wob;
        i ? s.lineTo(x, z) : s.moveTo(x, z);
      }
      const geo = new THREE.ExtrudeGeometry(s, { depth: top, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
      geo.rotateX(Math.PI / 2); geo.translate(cx, top, cz);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
      add(new THREE.Mesh(geo, m));
    } else {
      add(new THREE.Mesh(new RoundedBoxGeometry(w + 0.1, top, d + 0.1, 3, 0.01), m)).position.set(cx, top / 2, cz);
      const H = height + 0.35;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), glass());
      box.position.set(cx, top + H / 2, cz); box.renderOrder = 2; g.add(box);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: '#9aa3a8', transparent: true, opacity: 0.5 }));
      edges.position.copy(box.position); g.add(edges);
      const cap = add(new THREE.Mesh(new RoundedBoxGeometry(w + 0.06, 0.05, d + 0.06, 2, 0.01), m));
      cap.position.set(cx, top + H + 0.025, cz);
    }
  }
  if (id === 'shadow') {
    top = 0.06;
    const H = height + 0.5, D = d + 0.3, W = w + 0.3;
    const frame = new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.6 });
    const lin = new THREE.MeshStandardMaterial({ map: linen(), roughness: 0.95 });
    // the walls face inward and are invisible from outside, so from any angle you look in
    const wall = (sx, sy, x, y, z, rx, ry) => {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), lin));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); return m;
    };
    wall(D, H, cx - W / 2, H / 2, cz, 0, Math.PI / 2);          // back, behind the animal's right side
    wall(W, D, cx, top, cz, -Math.PI / 2, 0);                   // floor
    wall(W, D, cx, H, cz, Math.PI / 2, 0);                      // ceiling
    wall(W, H, cx, H / 2, cz - D / 2, 0, 0);                    // tail end
    wall(W, H, cx, H / 2, cz + D / 2, 0, Math.PI);              // head end
    add(new THREE.Mesh(new THREE.BoxGeometry(W, top, D), frame)).position.set(cx, top / 2 - 0.001, cz);
    // the dark frame around the open side
    for (const [sy, sz, y, z] of [[0.1, D + 0.1, 0.05, cz], [0.1, D + 0.1, H, cz], [H + 0.1, 0.1, H / 2, cz - D / 2], [H + 0.1, 0.1, H / 2, cz + D / 2]])
      add(new THREE.Mesh(new THREE.BoxGeometry(0.12, sy, sz), frame)).position.set(cx + W / 2, y, z);
  }
  if (id === 'dome') {
    top = 0.16;
    const R = Math.max(w, d) / 2 + 0.25;
    const wood = new THREE.MeshStandardMaterial({ map: walnut(9), roughness: 0.5 });
    add(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.18, top, 96), wood)).position.set(cx, top / 2, cz);
    const H = height + 0.2 - R;
    const jar = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Math.max(H, 0.1), 96, 1, true), glass());
    cyl.position.y = top + H / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2), glass());
    cap.position.y = top + H;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), glass());
    knob.position.y = top + H + R + 0.03;
    cyl.renderOrder = cap.renderOrder = knob.renderOrder = 2;
    jar.add(cyl, cap, knob); jar.position.set(cx, 0, cz); g.add(jar);
    groundcover(g, { cx, cz, R, top });
  }
  return { group: g, top, floor: true };
}

/* moss, grass, stones and branches on the dome's base */
function groundcover(g, { cx, cz, R, top }) {
  const r = rng(29);
  const inDisc = (k = 0.95) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * k; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };
  // moss: a carpet of squashed lumps
  const mossGeo = new THREE.IcosahedronGeometry(1, 1);
  const moss = new THREE.InstancedMesh(mossGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), 3200);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < moss.count; i++) {
    const [x, z] = inDisc(), k = 0.025 + r() * 0.045;
    m.compose(p.set(x, top + k * 0.1, z), q.setFromEuler(new THREE.Euler(r() * 0.5, r() * 6, r() * 0.5)), s.set(k, k * (0.5 + r() * 0.5), k));
    moss.setMatrixAt(i, m);
    moss.setColorAt(i, c.setHSL(0.2 + r() * 0.08, 0.5 + r() * 0.25, 0.035 + r() * 0.06));   // linear space: dark values read as deep moss
  }
  moss.receiveShadow = true; g.add(moss);
  // grass: thin tapered blades in tufts
  const blade = new THREE.ConeGeometry(0.004, 1, 3); blade.translate(0, 0.5, 0);
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#8a8f45', roughness: 0.9 }), 1400);
  for (let i = 0; i < grass.count; i += 14) {
    const [x, z] = inDisc(0.9);
    for (let k = 0; k < 14 && i + k < grass.count; k++) {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.7, r() * 6, (r() - 0.5) * 0.7));
      m.compose(p.set(x + (r() - 0.5) * 0.05, top, z + (r() - 0.5) * 0.05), q, s.set(1, 0.08 + r() * 0.16, 1));
      grass.setMatrixAt(i + k, m);
      grass.setColorAt(i + k, c.setHSL(0.13 + r() * 0.06, 0.4, 0.08 + r() * 0.1));
    }
  }
  grass.castShadow = true; g.add(grass);
  // stones
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8b877f', roughness: 0.85, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const [x, z] = inDisc(0.85), k = 0.04 + r() * 0.1;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), stoneMat);
    st.scale.set(k * (1 + r()), k * 0.6, k); st.position.set(x, top + k * 0.2, z); st.rotation.y = r() * 6;
    st.castShadow = st.receiveShadow = true; g.add(st);
  }
  // fallen branches: bent tubes with a twig or two
  const bark = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.95 });
  for (let i = 0; i < 5; i++) {
    const [x, z] = inDisc(0.7), a = r() * Math.PI, L = 0.5 + r() * 0.7;
    const pts = [0, 0.33, 0.66, 1].map(t => new THREE.Vector3(x + Math.cos(a) * (t - 0.5) * L, top + 0.025 + Math.sin(t * 3) * 0.02 * r(), z + Math.sin(a) * (t - 0.5) * L + Math.sin(t * 5) * 0.05));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012 + r() * 0.012, 7), bark);
    tube.castShadow = tube.receiveShadow = true; g.add(tube);
    const base = pts[2], tw = new THREE.Vector3(base.x + (r() - 0.5) * 0.3, base.y + 0.08, base.z + (r() - 0.5) * 0.3);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(base, tw), 4, 0.006, 5), bark));
  }
}
