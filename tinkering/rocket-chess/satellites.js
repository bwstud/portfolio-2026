import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Builder, revolve, strut, around, paint, canvasTexture, mulberry, TAU, DEG } from './kit.js';

/* The pawns: eight satellites, each at its own scale (they range from 0.58 m to 21 m).
   Each builder returns a Group in metres with userData.mount: the point the display rod
   meets the spacecraft. */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = o => new THREE.MeshStandardMaterial(o);

// solar cell panels: dark blue cells on a light grid
function cellTexture(cols, rows, { cell = '#1c2a55', grid = '#a9adb5', seed = 1 } = {}) {
  const r = mulberry(seed);
  return canvasTexture(cols * 16, rows * 16, (g, w, h) => {
    g.fillStyle = grid; g.fillRect(0, 0, w, h);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const v = (r() - 0.5) * 14;
      g.fillStyle = `rgb(${28 + v},${42 + v},${85 + v})`;
      if (cell !== '#1c2a55') g.fillStyle = cell;
      g.fillRect(i * 16 + 1, j * 16 + 1, 14, 14);
    }
  }, { repeat: true });
}

// spacecraft thermal blanket: silver panels with seams
function foilTexture(seed = 2, base = 215) {
  const r = mulberry(seed);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = `rgb(${base},${base},${base - 4})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const v = base - 25 + r() * 40;
      g.fillStyle = `rgba(${v},${v},${v - 3},0.55)`;
      g.fillRect(r() * w, r() * h, 30 + r() * 120, 30 + r() * 120);
    }
    g.strokeStyle = 'rgba(80,80,80,0.5)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo((i / 8) * w, 0); g.lineTo((i / 8) * w, h); g.stroke(); }
    for (let j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(0, (j / 4) * h); g.lineTo(w, (j / 4) * h); g.stroke(); }
  }, { repeat: true });
}

/* ---------- Sputnik 1 · USSR · 1957 ----------
   58 cm polished aluminium sphere, two pairs of whip antennas (2.4 m and 2.9 m)
   swept back from the front hemisphere. */
export function sputnik(M) {
  const b = new Builder();
  b.add(new THREE.SphereGeometry(0.29, 48, 32), M.chrome);
  b.add(new THREE.TorusGeometry(0.291, 0.008, 6, 64), M.chrome, { rot: [Math.PI / 2, 0, 0], pos: V(0, 0.04, 0) });
  [2.4, 2.9, 2.4, 2.9].forEach((len, k) => {
    const a = (k * 90 + 45) * DEG;
    const root = V(Math.sin(a) * 0.264, 0.12, Math.cos(a) * 0.264);
    const dir = V(Math.sin(a) * Math.sin(35 * DEG), -Math.cos(35 * DEG), Math.cos(a) * Math.sin(35 * DEG)).normalize();
    b.add(strut(root.clone().addScaledVector(dir, -0.02), root.clone().addScaledVector(dir, 0.1), 0.022, 8), M.chrome);
    b.add(strut(root, root.clone().addScaledVector(dir, len), 0.011, 5), M.chrome);
  });
  const g = b.build();
  // tip the whole thing so the antennas trail back, as in the famous photographs
  const tilt = new THREE.Group();
  g.rotation.x = -0.45;
  tilt.add(g);
  tilt.userData.mount = V(0, -0.29 * Math.cos(0.45), 0.29 * Math.sin(0.45));
  return tilt;
}

/* ---------- Explorer 1 · USA · 1958 ----------
   2.03 m × 15.2 cm: instrument section and nose on top of the spent fourth-stage motor,
   striped for thermal control, four whip antennas at the waist. */
export function explorer1(M) {
  const b = new Builder();
  const stripes = canvasTexture(16, 256, (g, w, h) => {
    g.fillStyle = '#efefe9'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2a24';
    for (let i = 0; i < 8; i++) g.fillRect(0, (i / 8) * h, w, h / 16);
  });
  b.add(revolve([[0.04, 0], [0.066, 0.05], [0.07, 0.12]], { segments: 24 }), M.engine);
  b.add(revolve([[0.07, 0.12], [0.076, 0.14], [0.076, 1.02]], { segments: 32 }), M.alu);
  b.add(revolve([[0.076, 1.02], [0.078, 1.04], [0.078, 1.08], [0.076, 1.1]], { segments: 32 }), M.darkgray);
  b.add(revolve([[0.076, 1.1], [0.076, 1.72]], { segments: 32 }), std({ map: stripes, roughness: 0.5 }));
  b.add(revolve([[0.076, 1.72], [0.06, 1.86], [0.035, 1.97], [0.012, 2.03], [0, 2.03]], { segments: 32 }), M.white);
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4 + 0.4;
    b.add(strut(around(0.07, a, 1.06), around(0.62, a, 1.0), 0.008, 5), M.wire);
  }
  const g = b.build();
  g.userData.mount = V(0, 0, 0);
  return g;
}

/* ---------- Telstar 1 · USA (AT&T / Bell Labs) · 1962 ----------
   88 cm faceted ball, 72 facets (3,600 solar cells on 60 of them), equatorial belt of
   microwave antenna cavities, helical command antenna on top. */
export function telstar(M) {
  const b = new Builder();
  const cells = cellTexture(24, 12, { seed: 7 });
  const ball = new THREE.SphereGeometry(0.44, 12, 6);
  b.add(ball, std({ map: cells, metalness: 0.5, roughness: 0.32, flatShading: true }));
  const belt = canvasTexture(512, 32, (g, w, h) => {
    g.fillStyle = '#c8cacd'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2c30';
    for (let i = 0; i < 48; i++) { g.fillRect((i / 48) * w + 2, 5, w / 48 - 4, 9); g.fillRect((i / 48) * w + 2, 18, w / 48 - 4, 9); }
  });
  b.add(revolve([[0.43, -0.065], [0.448, -0.06], [0.448, 0.06], [0.43, 0.065]], { segments: 48 }), std({ map: belt, metalness: 0.7, roughness: 0.35 }));
  const pts = [];
  for (let i = 0; i <= 120; i++) { const t = i / 120; pts.push(V(Math.cos(t * TAU * 6) * 0.06, 0.42 + t * 0.24, Math.sin(t * TAU * 6) * 0.06)); }
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.006, 5), M.alu);
  b.add(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 12), M.alu, { pos: V(0, 0.44, 0) });
  const g = b.build();
  g.userData.mount = V(0, -0.44, 0);
  return g;
}

/* ---------- Dong Fang Hong 1 · China · 1970 ----------
   1 m, 72-faced near-sphere, 173 kg; four whip antennas of about 2 m. Broadcast
   "The East Is Red" from orbit. */
export function dongFangHong(M) {
  const b = new Builder();
  const cells = cellTexture(16, 18, { seed: 3 });
  b.add(new THREE.SphereGeometry(0.5, 8, 9), std({ map: cells, metalness: 0.55, roughness: 0.3, flatShading: true }));
  for (const y of [-0.17, 0.17]) {
    b.add(revolve([[0.468, y - 0.03], [0.478, y - 0.025], [0.478, y + 0.025], [0.468, y + 0.03]], { segments: 8, phiStart: TAU / 16 }), M.alu);
  }
  b.add(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 16), M.alu, { pos: V(0, 0.5, 0) });
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4 + TAU / 16;
    const root = around(0.4, a, -0.28);
    const dir = V(Math.sin(a) * Math.cos(40 * DEG), -Math.sin(40 * DEG), Math.cos(a) * Math.cos(40 * DEG));
    b.add(strut(root, root.clone().addScaledVector(dir, 2.1), 0.012, 5), M.wire);
  }
  const g = b.build();
  g.userData.mount = V(0, -0.5, 0);
  return g;
}

/* ---------- Aryabhata · India · 1975 ----------
   26-sided polyhedron (a rhombicuboctahedron), 1.4 m across, solar cells on every face
   but the top and bottom. Built by ISRO, launched on a Soviet Kosmos-3M. */
export function aryabhata(M) {
  const b = new Builder();
  const q = 1 + Math.SQRT2, pts = [];
  for (const [x, y, z] of [[1, 1, q], [1, q, 1], [q, 1, 1]]) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(V(sx * x, sy * y, sz * z));
  }
  const geo = new ConvexGeometry(pts);
  geo.scale(1.4 / (2 * q), 1.19 / (2 * q), 1.4 / (2 * q));
  geo.rotateY(TAU / 16);
  const r = mulberry(9);
  b.add(paint(geo, (p, n) => {
    if (Math.abs(n.y) > 0.95) return '#c9ccd0';
    const v = Math.floor((r() - 0.5) * 10);
    return `rgb(${52 + v},${78 + v},${150 + v})`;
  }), std({ vertexColors: true, metalness: 0.45, roughness: 0.32 }));
  b.add(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 24), M.alu, { pos: V(0, -0.62, 0) });
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4;
    b.add(strut(around(0.3, a, -0.58), around(0.55, a, -0.95), 0.008, 4), M.wire);
  }
  const g = b.build();
  g.userData.mount = V(0, -0.66, 0);
  return g;
}

/* ---------- Voyager · USA (NASA/JPL) · 1977 ----------
   3.66 m high-gain dish over a ten-sided bus (1.78 m across, 47 cm tall), science boom with
   the scan platform, RTG boom with three generators, 13 m magnetometer boom, gold record. */
export function voyager(M) {
  const b = new Builder();
  const dishMat = std({ color: 0xf2f1ec, roughness: 0.45, side: THREE.DoubleSide });
  const bus = std({ color: 0x2c2c2f, metalness: 0.6, roughness: 0.4 });
  b.add(new THREE.CylinderGeometry(0.936, 0.936, 0.47, 10), bus, { rot: [0, TAU / 20, 0] });
  b.add(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 20), M.gold, { pos: V(0, 0.35, 0) });
  // high-gain antenna, focal length ~1.2 m, with subreflector on a tripod
  const dish = [];
  for (let i = 0; i <= 12; i++) { const r = (i / 12) * 1.83; dish.push([r, 0.5 + (r * r) / (4 * 1.2)]); }
  b.add(revolve(dish, { segments: 64 }), dishMat);
  b.add(revolve([[1.83, 0.5 + 1.83 * 1.83 / 4.8], [1.86, 0.5 + 1.83 * 1.83 / 4.8 + 0.03]], { segments: 64 }), dishMat);
  const sub = V(0, 1.75, 0);
  for (let k = 0; k < 3; k++) b.add(strut(around(0.9, k * TAU / 3, 0.5 + 0.81 / 4.8), sub, 0.018, 4), M.alu);
  b.add(new THREE.CylinderGeometry(0.2, 0.14, 0.08, 20), dishMat, { pos: sub });
  // science boom (−x) to the scan platform with cameras
  b.add(strut(V(-0.9, 0, 0), V(-3.2, 0.15, 0), 0.05, 6), M.alu);
  b.add(new THREE.BoxGeometry(0.55, 0.45, 0.5), bus, { pos: V(-3.3, 0.15, 0) });
  b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), M.alu, { pos: V(-3.3, 0.15, 0.35), rot: [Math.PI / 2, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12), M.alu, { pos: V(-3.15, 0.3, 0.32), rot: [Math.PI / 2, 0, 0] });
  // RTG boom (+x, angled down) with three finned generators
  const rtgDir = V(1, -0.32, 0).normalize();
  b.add(strut(V(0.9, -0.1, 0), V(0.9, -0.1, 0).addScaledVector(rtgDir, 2.4), 0.04, 6), M.alu);
  for (let i = 0; i < 3; i++) {
    const c = V(0.9, -0.1, 0).addScaledVector(rtgDir, 0.9 + i * 0.55);
    const rot = [0, 0, Math.atan2(rtgDir.y, rtgDir.x) - Math.PI / 2];
    b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 6), M.darkgray, { pos: c, rot });
    b.add(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 12), M.darkgray, { pos: c, rot });
  }
  // magnetometer boom: 13 m triangular lattice, sensors along it
  const mStart = V(-0.5, -0.1, -0.8), mDir = V(-0.42, -0.08, -1).normalize();
  const mEnd = mStart.clone().addScaledVector(mDir, 13);
  b.add(strut(mStart, mEnd, 0.07, 3), M.alu);
  for (const t of [6.5, 13]) b.add(new THREE.BoxGeometry(0.18, 0.18, 0.18), M.alu, { pos: mStart.clone().addScaledVector(mDir, t) });
  // golden record on the side of the bus
  b.add(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 32), M.gold, { pos: V(0.27, 0, 0.89), rot: [Math.PI / 2, 0, 0] });
  const g = b.build();
  g.userData.mount = V(0, -0.235, 0);
  return g;
}

/* ---------- Hubble Space Telescope · NASA / ESA · 1990 ----------
   13.2 m × 4.2 m. Aft shroud and equipment section, forward shell and light shield,
   aperture door open, the rigid solar arrays fitted in 2002 (7.1 × 2.6 m each),
   two high-gain antennas on masts. Shown as it looked after the last servicing in 2009. */
export function hubble(M) {
  const b = new Builder();
  const fa = foilTexture(4, 222); fa.repeat.set(3, 1);
  const foil = std({ map: fa, metalness: 0.85, roughness: 0.32 });
  const fb = foilTexture(6, 232); fb.repeat.set(2, 2);
  const shell = std({ map: fb, metalness: 0.7, roughness: 0.38 });
  b.add(revolve([[0, -0.25], [1.2, -0.2], [2.0, -0.05], [2.13, 0], [2.13, 5.2], [1.6, 5.3]], { segments: 64 }), foil);
  b.add(revolve([[1.6, 5.3], [1.55, 5.35], [1.55, 13.2], [1.5, 13.2]], { segments: 64 }), shell);
  b.add(revolve([[1.5, 13.2], [1.5, 12.6]], { segments: 48 }), M.black);              // inside the baffle
  // aperture door, standing open on its hinge
  b.add(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 48), shell, { pos: V(0, 13.2 + 1.55, -1.62), rot: [Math.PI / 2 - 0.15, 0, 0] });
  // solar arrays on their masts
  const cells = cellTexture(40, 16, { seed: 4 });
  cells.repeat.set(1, 1);
  const arrayMat = std({ map: cells, metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide });
  for (const s of [1, -1]) {
    b.add(strut(V(s * 2.0, 4.4, 0), V(s * 2.9, 4.4, 0), 0.06, 8), M.alu);
    b.add(new THREE.BoxGeometry(7.1, 2.6, 0.05), arrayMat, { pos: V(s * (2.8 + 3.55), 4.4, 0) });
    b.add(new THREE.BoxGeometry(7.15, 0.08, 0.08), M.gold, { pos: V(s * (2.8 + 3.55), 4.4, 0) });
  }
  // high-gain antennas
  for (const s of [1, -1]) {
    b.add(strut(V(0, 7.9, s * 1.5), V(0, 7.9, s * 4.4), 0.05, 6), M.alu);
    const dish = [];
    for (let i = 0; i <= 8; i++) { const r = (i / 8) * 0.65; dish.push([r, r * r * 0.5]); }
    b.add(revolve(dish, { segments: 32 }), std({ color: 0xe8e6df, roughness: 0.5, side: THREE.DoubleSide }), { pos: V(0, 7.9, s * 4.45), rot: [s * Math.PI / 2, 0, 0] });
  }
  // handrails and grapple fixture hints on the equipment section
  for (let k = 0; k < 10; k++) b.add(new THREE.BoxGeometry(0.06, 1.2, 0.06), M.gold, { pos: around(2.16, k * TAU / 10, 3.2) });
  const g = b.build();
  g.userData.mount = V(0, -0.25, 0);
  return g;
}

/* ---------- James Webb Space Telescope · NASA / ESA / CSA · 2021 ----------
   Five-layer sunshield 21.2 × 14.2 m, 6.5 m primary of 18 gold-coated beryllium
   hexagons (1.32 m), secondary on a tripod 7.1 m out, spacecraft bus, solar array,
   momentum flap. */
export function jwst(M) {
  const b = new Builder();
  const hull = [[10.6, 0], [4.3, 7.08], [-4.3, 7.08], [-10.6, 0], [-4.3, -7.08], [4.3, -7.08]];
  const kapton = [0xc7a9d6, 0xc9b2db, 0xcdbde0, 0xd0c8e2, 0xd7d6dc];
  for (let i = 0; i < 5; i++) {
    const s = 1 - i * 0.035;
    const shape = new THREE.Shape(hull.map(([x, z]) => new THREE.Vector2(x * s, z * s)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    b.add(g, std({ color: kapton[i], metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }), { pos: V(0, i * 0.22, 0) });
  }
  // spreader bars across the short axis and booms along the long axis
  for (const z of [7.08, -7.08]) b.add(new THREE.BoxGeometry(8.6, 0.3, 0.3), M.darkgray, { pos: V(0, 0.3, z * 0.98) });
  b.add(new THREE.BoxGeometry(20.8, 0.18, 0.18), M.darkgray, { pos: V(0, 1.0, 0) });
  // momentum flap at the aft tip
  b.add(new THREE.BoxGeometry(0.08, 2.4, 2.2), M.darkgray, { pos: V(-10.8, 0.9, 0), rot: [0, 0, 0.5] });

  // spacecraft bus, solar array and high-gain antenna on the sun side
  b.add(new THREE.BoxGeometry(2.0, 1.4, 2.0), std({ color: 0x2b2b2e, metalness: 0.5, roughness: 0.45 }), { pos: V(0, -0.9, 0) });
  const cells = cellTexture(20, 8, { seed: 8 });
  b.add(new THREE.BoxGeometry(5.9, 0.05, 2.5), std({ map: cells, metalness: 0.4, roughness: 0.35 }), { pos: V(0, -1.5, -3.4), rot: [0.15, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.3, 0.05, 0.25, 20), M.white, { pos: V(0.6, -1.75, 0.6) });

  // optical telescope: tower, backplane, 18 segments on a gently concave surface, facing +z
  b.add(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 12), M.darkgray, { pos: V(0, 1.6, 0) });
  const OC = V(0, 5.0, 0), Rc = 16;
  const tiltM = new THREE.Matrix4().makeRotationX(-0.12);
  const segR = 1.32 / Math.sqrt(3), pitch = 1.32 + 0.007;
  const axial = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    const s = -q - r, d = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    if (d >= 1 && d <= 2) axial.push([q, r]);
  }
  const seg = new THREE.CylinderGeometry(segR * 0.995, segR * 0.995, 0.12, 6);
  seg.rotateX(Math.PI / 2);
  for (const [q, r] of axial) {
    const x = pitch * (q + r / 2), y = pitch * (r * Math.sqrt(3) / 2);
    const z = (x * x + y * y) / (2 * Rc);
    const m = new THREE.Matrix4().makeTranslation(OC.x, OC.y, OC.z).multiply(tiltM)
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().lookAt(V(-x, -y, Rc - z), V(0, 0, 0), V(0, 1, 0)));
    b.add(seg, M.mirror, { matrix: m });
  }
  // backplane and instrument module behind the mirror
  const back = new THREE.CylinderGeometry(3.3, 3.3, 0.5, 6);
  back.rotateX(Math.PI / 2);
  b.add(back, M.black, { matrix: new THREE.Matrix4().makeTranslation(OC.x, OC.y, OC.z - 0.3).multiply(tiltM) });
  b.add(new THREE.BoxGeometry(2.2, 2.2, 1.8), std({ color: 0x1d1d20, metalness: 0.4, roughness: 0.5 }), { pos: V(0, 4.0, -1.6) });
  // secondary mirror on three struts, ~7.1 m in front of the primary
  const sec = V(0, 5.0 + 7.1 * Math.sin(0.12), 7.1 * Math.cos(0.12));
  b.add(new THREE.CylinderGeometry(0.37, 0.37, 0.15, 24), M.mirror, { pos: sec, rot: [Math.PI / 2 - 0.12, 0, 0] });
  for (const [x, y] of [[0, 3.5], [-2.9, -1.9], [2.9, -1.9]]) {
    const foot = V(x, y, 0.25).applyMatrix4(tiltM).add(OC);
    b.add(strut(foot, sec, 0.06, 6), M.darkgray);
  }
  b.add(new THREE.BoxGeometry(0.7, 0.9, 0.5), M.black, { matrix: new THREE.Matrix4().makeTranslation(OC.x, OC.y, OC.z + 0.25).multiply(tiltM) });
  const g = b.build();
  g.userData.mount = V(0, -1.6, 0);
  return g;
}

