/* The physical world around the clay: the wheel, its splash pan and pedal, a water bucket, the
   stage around it (a cove lit through a gobo), and the photo set used for the finished piece. */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FLOOR = -0.56;             // the wheel head's top is y = 0
const V2 = (x, y) => new THREE.Vector2(x, y);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function rand(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296); }

/* ---------- the wheel ---------- */
export function buildWheel() {
  const g = new THREE.Group();
  const head = new THREE.Group();          // turns with the wheel
  const R = rand(7);

  // the head's top: spun aluminium with fine turning rings, two bat pin holes and index marks
  const top = canvasTex(1024, 1024, (x, w) => {
    const c = w / 2;
    x.fillStyle = '#c3c6c9'; x.fillRect(0, 0, w, w);
    for (let r = 4; r < c; r += 1.6) {
      x.strokeStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + R() * 0.05})`;
      x.lineWidth = 1; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke();
    }
    for (const r of [c * 0.42, c * 0.71]) { x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = '#222';
    for (const a of [0, Math.PI]) { x.beginPath(); x.arc(c + Math.cos(a) * c * 0.73, c + Math.sin(a) * c * 0.73, 9, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = 'rgba(20,20,20,0.6)'; x.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.2;
      x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9); x.lineTo(c + Math.cos(a) * c * 0.97, c + Math.sin(a) * c * 0.97); x.stroke();
    }
  });
  const headTop = new THREE.Mesh(new THREE.CircleGeometry(0.178, 96), new THREE.MeshStandardMaterial({ map: top, metalness: 0.8, roughness: 0.3 }));
  headTop.rotation.x = -Math.PI / 2;
  headTop.receiveShadow = true;
  const rimGeo = new THREE.LatheGeometry([V2(0.03, -0.026), V2(0.17, -0.026), V2(0.178, -0.021), V2(0.179, -0.004), V2(0.178, 0)], 96);
  const headRim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0xbfc2c5, metalness: 0.8, roughness: 0.28 }));
  headRim.castShadow = true;
  head.add(headTop, headRim);

  // slurry: the wet clay smeared on the head round the foot of the piece
  const slipMat = new THREE.MeshStandardMaterial({
    color: 0x8b847a, roughness: 0.25, transparent: true, depthWrite: false,
    alphaMap: canvasTex(512, 64, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#aaa'); gr.addColorStop(1, '#000');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.5})`; x.fillRect(R() * w, R() * h, 4 + R() * 60, 1 + R() * 3); }
    }, false),
  });
  const slip = new THREE.Mesh(new THREE.RingGeometry(1, 1.5, 96, 1), slipMat);
  slip.rotation.x = -Math.PI / 2; slip.position.y = 0.0004;
  // RingGeometry's UVs are planar; remap u to the radius so the gradient fades outward
  const uv = slip.geometry.attributes.uv, p = slip.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - 1) / 0.5, 0.5);
  head.add(slip);
  g.add(head);

  // splash pan, with slurry dried on its walls
  const panTex = canvasTex(1024, 256, (x, w, h) => {
    x.fillStyle = '#d9d5cc'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${110 + R() * 40},${100 + R() * 30},${88 + R() * 25},${R() * 0.18})`;
      const y = h * (0.15 + R() * 0.7);
      x.beginPath(); x.ellipse(R() * w, y, 3 + R() * 30, 1 + R() * 8, 0, 0, Math.PI * 2); x.fill();
    }
  });
  const pan = new THREE.Mesh(
    new THREE.LatheGeometry([V2(0.035, -0.075), V2(0.25, -0.075), V2(0.275, -0.068), V2(0.288, -0.04), V2(0.293, 0.028), V2(0.3, 0.036), V2(0.309, 0.032), V2(0.31, 0.012)], 96),
    new THREE.MeshStandardMaterial({ map: panTex, roughness: 0.55, side: THREE.DoubleSide }),
  );
  pan.castShadow = pan.receiveShadow = true;
  g.add(pan);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 32), new THREE.MeshStandardMaterial({ color: 0x444, metalness: 0.8, roughness: 0.4 }));
  shaft.position.y = -0.05;
  g.add(shaft);

  // body, legs, pedal
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.55, metalness: 0.2 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.3, 0.64, 4, 0.05), bodyMat);
  body.position.set(0, -0.235, -0.02);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.9, roughness: 0.35 });
  const legH = -0.385 - FLOOR;
  for (const [x, z] of [[-0.25, -0.26], [0.25, -0.26], [-0.25, 0.22], [0.25, 0.22]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, legH, 16), steel);
    leg.position.set(x, FLOOR + legH / 2, z);
    leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.012, 20), bodyMat);
    foot.position.set(x, FLOOR + 0.006, z);
    g.add(leg, foot);
  }
  const pedal = new THREE.Group();
  const pedalBase = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.045, 0.24, 3, 0.015), bodyMat);
  pedalBase.position.y = 0.022;
  const paddle = new THREE.Group();
  const paddleMesh = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.016, 0.2, 3, 0.006), new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.7 }));
  paddleMesh.position.set(0, 0.008, 0.09);
  paddle.add(paddleMesh);
  paddle.position.set(0, 0.046, -0.09);
  pedal.add(pedalBase, paddle);
  pedal.position.set(0.3, FLOOR, 0.46);
  pedal.rotation.y = -0.35;
  pedal.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.27, FLOOR + 0.03, 0.35), new THREE.Vector3(0.24, FLOOR + 0.006, 0.26), new THREE.Vector3(0.2, FLOOR + 0.02, 0.12), new THREE.Vector3(0.2, -0.36, 0.1),
  ]), 40, 0.006, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  g.add(pedal, cable);

  // water bucket with a sponge floating in it
  const bucket = new THREE.Group();
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x5f7f8f, roughness: 0.45, side: THREE.DoubleSide });
  const bucketMesh = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0), V2(0.12, 0), V2(0.135, 0.01), V2(0.15, 0.24), V2(0.158, 0.25), V2(0.152, 0.252)], 64), bucketMat);
  bucketMesh.castShadow = bucketMesh.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.145, 48), new THREE.MeshPhysicalMaterial({ color: 0x5b554a, roughness: 0.04, transmission: 0, clearcoat: 1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.19;
  const sponge = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.03, 0.06, 3, 0.012), new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.95 }));
  sponge.position.set(0.02, 0.198, -0.02); sponge.rotation.y = 0.5;
  bucket.add(bucketMesh, water, sponge);
  bucket.position.set(-0.44, FLOOR, 0.16);
  g.add(bucket);

  return { group: g, head, slip, pedal: paddle };
}

/* ---------- the stage ---------- */
// No photographed room: a plaster cove and a floor, lit by one shaped light. The light's gobo
// (a window, a skylight, leaves, a fire's glow) says where you are.
export function buildStage() {
  const g = new THREE.Group();
  const FR = 2.2, CR = 0.8, TOP = 4.2;
  // floor out to the cove, with radial rings so it can darken towards the walls
  const floorGeo = new THREE.RingGeometry(0.001, FR, 96, 10);
  floorGeo.rotateX(-Math.PI / 2);
  // the cove: floor curving up into a wall all round, so every orbit angle sees a backdrop
  const prof = [];
  for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI / 2; prof.push(V2(FR + Math.sin(a) * CR, CR - Math.cos(a) * CR)); }
  for (let i = 1; i <= 8; i++) prof.push(V2(FR + CR, CR + i / 8 * (TOP - CR)));
  const wallGeo = new THREE.LatheGeometry(prof, 128);
  // darken with height and distance: the light falls off, the room recedes
  const shade = (geo, f) => {
    const p = geo.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const v = f(Math.hypot(p.getX(i), p.getZ(i)), p.getY(i)); c.set([v, v, v], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  };
  shade(floorGeo, r => 1 - 0.35 * Math.min(1, r / FR) ** 1.5);
  shade(wallGeo, (r, y) => 0.65 - 0.4 * Math.min(1, y / TOP) ** 0.7);
  const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeo, floorMat), wall = new THREE.Mesh(wallGeo, wallMat);
  floor.position.y = wall.position.y = FLOOR;
  floor.receiveShadow = wall.receiveShadow = true;
  g.add(floor, wall);
  return { group: g, floorMat, wallMat };
}

// floor boards and concrete, painted once per setting
const floorCache = new Map();
export function floorTexture(kind, color) {
  const id = kind + color;
  if (floorCache.has(id)) return floorCache.get(id);
  const base = new THREE.Color(color), R = rand(kind.length * 31);
  const css = (c, k) => `rgb(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)})`;
  const t = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = css(base.clone().convertLinearToSRGB(), 1); x.fillRect(0, 0, w, h);
    const sb = base.clone().convertLinearToSRGB();
    if (kind === 'concrete') {
      // mottled trowelled concrete with a few old clay splashes
      for (let i = 0; i < 1400; i++) { x.fillStyle = css(sb, 0.85 + R() * 0.3).replace('rgb', 'rgba').replace(')', `,${R() * 0.12})`); x.beginPath(); x.ellipse(R() * w, R() * h, 6 + R() * 90, 4 + R() * 50, R() * 3, 0, Math.PI * 2); x.fill(); }
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(120,108,94,${0.08 + R() * 0.12})`; x.beginPath(); x.arc(R() * w, R() * h, 2 + R() * 9, 0, Math.PI * 2); x.fill(); }
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
    } else {
      // boards: varied tone, grain, a dark seam; painted boards are flatter
      const n = 8, bh = h / n, painted = kind === 'painted';
      for (let j = 0; j < n; j++) {
        const k = painted ? 0.94 + R() * 0.1 : 0.78 + R() * 0.4, off = R() * w;
        x.fillStyle = css(sb, k); x.fillRect(0, j * bh, w, bh);
        for (let i = 0; i < (painted ? 30 : 90); i++) {
          x.strokeStyle = `rgba(${painted ? '255,255,255' : '40,20,8'},${R() * (painted ? 0.05 : 0.14)})`; x.lineWidth = 1 + R() * 2;
          const y = j * bh + R() * bh; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (R() - 0.5) * 8, w * 0.6, y + (R() - 0.5) * 8, w, y); x.stroke();
        }
        x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, j * bh, w, 3);
        x.fillRect((off) % w, j * bh, 3, bh);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  floorCache.set(id, t);
  return t;
}

// what the light shines through. Drawn small and scaled up, so its edges come out soft.
const goboCache = new Map();
export function goboTexture(kind) {
  if (goboCache.has(kind)) return goboCache.get(kind);
  const small = document.createElement('canvas');
  const w = kind === 'leaves' ? 256 : 96;
  small.width = small.height = w;
  const x = small.getContext('2d'), R = rand(11);
  x.fillStyle = '#000'; x.fillRect(0, 0, w, w);
  if (kind === 'window' || kind === 'skylight') {
    // a frame of panes, the centre pane on the wheel so no bar crosses the clay
    const [cols, rows, size, bar] = kind === 'window' ? [3, 3, 0.42, 0.03] : [3, 2, 0.34, 0.035];
    const x0 = w * (0.5 - size / 2), s = w * size, pw = s / cols, ph = s / rows;
    const dx = cols % 2 ? 0 : pw / 2, dy = rows % 2 ? 0 : ph / 2;
    x.fillStyle = '#fff';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) x.fillRect(x0 + dx + i * pw + w * bar / 2, x0 + dy + j * ph + w * bar / 2, pw - w * bar, ph - w * bar);
  } else if (kind === 'leaves') {
    // dappled sun through foliage
    x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, w / 2, w * 0.46, 0, Math.PI * 2); x.fill();
    x.filter = 'blur(1.5px)';
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(0,0,0,${0.7 + R() * 0.3})`;
      const a = R() * Math.PI * 2, d = R() * w * 0.5, cx = w / 2 + Math.cos(a) * d, cy = w / 2 + Math.sin(a) * d;
      if (Math.hypot(cx - w / 2, cy - w / 2) < w * 0.09) continue;   // keep the wheel itself in sun
      const r = w * (0.012 + R() * 0.03);
      x.beginPath(); x.ellipse(cx, cy, r, r * (0.4 + R() * 0.4), R() * 3, 0, Math.PI * 2); x.fill();
    }
    x.filter = 'none';
  } else {
    // a fire's glow: a soft pool
    const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w * 0.5);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#bbb'); gr.addColorStop(1, '#000');
    x.fillStyle = gr; x.fillRect(0, 0, w, w);
  }
  const t = canvasTex(512, 512, (c, W) => { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(small, 0, 0, W, W); });
  goboCache.set(kind, t);
  return t;
}

/* ---------- the photo set ---------- */
export function buildSet() {
  const g = new THREE.Group();
  // a seamless sweep: floor curving up into a back wall
  const pts = [];
  const r = 0.9, back = -1.1;
  for (let i = 0; i <= 12; i++) pts.push([2.6 - i * (2.6 - (back + r)) / 12, 0]);
  for (let i = 1; i <= 16; i++) { const a = i / 16 * Math.PI / 2; pts.push([back + r - Math.sin(a) * r, r - Math.cos(a) * r]); }
  for (let i = 1; i <= 8; i++) pts.push([back, r + i * 0.4]);
  const W = 7, pos = [], idx = [];
  pts.forEach(([z, y], i) => { pos.push(-W / 2, y, z, W / 2, y, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const sweepMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.95 });
  const sweep = new THREE.Mesh(geo, sweepMat);
  sweep.position.y = -0.62;
  sweep.receiveShadow = true;
  // a plinth for the piece; its top is y = 0
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.85 });
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.62, 0.46, 4, 0.008), plinthMat);
  plinth.position.y = -0.31;
  plinth.castShadow = plinth.receiveShadow = true;
  g.add(sweep, plinth);
  return { group: g, sweepMat, plinthMat, plinth };
}

// how the finished piece is lit and dressed
export const LOOKS = {
  gallery: { name: 'Gallery', backdrop: '#7d7a74', plinth: '#d8d2c8', env: 0.55, exposure: 1.05,
    key: { pos: [-0.9, 1.4, 0.9], color: '#fff1e0', intensity: 22, angle: 0.42 }, soft: { pos: [0.7, 0.6, 0.8], color: '#e8eeff', intensity: 6.5 },
    rim: { pos: [0.4, 0.75, -1.05], color: '#ffffff', intensity: 9 } },
  window: { name: 'Window light', backdrop: '#b9b0a2', plinth: '#8a6a4f', env: 0.35, exposure: 1.1,
    key: { pos: [-1.6, 0.55, 0.25], color: '#ffe2bf', intensity: 32, angle: 0.5 }, soft: { pos: [1, 0.4, 0.8], color: '#d6e0ff', intensity: 1.2 },
    rim: { pos: [0.55, 0.5, -0.95], color: '#fff3e6', intensity: 2 } },
  lowkey: { name: 'Low key', backdrop: '#141414', plinth: '#1d1d1d', env: 0.12, exposure: 1.15,
    key: { pos: [0.15, 1.6, 0.45], color: '#fff4e8', intensity: 30, angle: 0.28 }, soft: { pos: [0.8, 0.3, 0.9], color: '#ffffff', intensity: 0.6 },
    rim: { pos: [-0.8, 0.6, -0.8], color: '#cfe0ff', intensity: 14 } },
  daylight: { name: 'Daylight', backdrop: '#e4ddd0', plinth: '#efeae2', env: 1.0, exposure: 0.95,
    key: { pos: [-0.6, 1.8, 1.0], color: '#ffffff', intensity: 10, angle: 0.7 }, soft: { pos: [0.8, 0.7, 1.0], color: '#ffffff', intensity: 3 },
    rim: { pos: [0.5, 0.8, -1], color: '#ffffff', intensity: 3 } },
};
