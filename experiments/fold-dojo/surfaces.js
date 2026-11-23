/* The surfaces you fold on. Each puts its working top at y = 0, so the paper always rests on
   the same plane. The mat and the pad lie on the wooden desk. */

import * as THREE from 'three';

export const SURFACES = [
  { id: 'desk', name: 'Wooden desk', note: 'Oiled oak, warm and forgiving.' },
  { id: 'concrete', name: 'Concrete counter', note: 'Sealed, cool and grey.' },
  { id: 'mat', name: 'Cutting mat', note: 'Self-healing, with a centimetre grid.' },
  { id: 'rubber', name: 'Rubber pad', note: 'Matte and grippy, on the desk.' },
  { id: 'glass', name: 'Glass table', note: 'Clear, with the floor below.' },
];

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function roundedBox(w, h, d, r, seg = 4) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(r * 0.5, h * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: seg, curveSegments: seg * 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bev, 0);
  // top face UVs from x/z so textures lie flat across it
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getZ(i) + d / 2) / d);
  g.computeVertexNormals();
  return g;
}

function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function matCanvas(w, d) {
  const ppm = 3000;   // pixels per metre
  const W = Math.round(w * ppm), H = Math.round(d * ppm);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  g.fillStyle = '#2f6b57'; g.fillRect(0, 0, W, H);
  const rnd = mulberry(4);
  for (let i = 0; i < W * H / 60; i++) { g.globalAlpha = 0.05; g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * W, rnd() * H, 1, 1); }
  g.globalAlpha = 1;
  const m = 0.02 * ppm, cm = 0.01 * ppm;
  const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
  g.strokeStyle = 'rgba(230, 240, 228, 0.32)';
  for (let i = 0, x = x0; x <= x1 + 0.5; x += cm, i++) { g.lineWidth = i % 5 ? 1.2 : 2.6; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  for (let i = 0, y = y0; y <= y1 + 0.5; y += cm, i++) { g.lineWidth = i % 5 ? 1.2 : 2.6; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  // 45 and 60 degree guides from the corner
  g.strokeStyle = 'rgba(230, 240, 228, 0.22)'; g.lineWidth = 1.6;
  for (const a of [45, 60, 30]) { const r = (a * Math.PI) / 180; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0 + Math.cos(r) * W * 2, y1 - Math.sin(r) * W * 2); g.stroke(); }
  g.fillStyle = 'rgba(235, 244, 232, 0.75)';
  g.font = `${Math.round(cm * 0.55)}px Geist, Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  for (let i = 0, x = x0; x <= x1 + 0.5; x += cm, i++) if (i % 2 === 0) g.fillText(String(i), x, y0 - cm * 0.25);
  g.textAlign = 'right';
  for (let i = 0, y = y1; y >= y0 - 0.5; y -= cm, i++) if (i % 2 === 0) g.fillText(String(i), x0 - cm * 0.2, y + cm * 0.2);
  return c;
}

function noiseCanvas(S, base, amt, seed, speck = 0) {
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const rnd = mulberry(seed);
  for (let i = 0; i < S * S / 6; i++) { g.globalAlpha = amt * rnd(); g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); }
  for (let i = 0; i < speck; i++) { g.globalAlpha = 0.5; g.fillStyle = rnd() < 0.5 ? '#6a6d72' : '#15171a'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.4, 0, 6.28); g.fill(); }
  g.globalAlpha = 1;
  return c;
}

export function makeSurfaces(renderer, onLoad) {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function scan(mat, files, size, w, d, turn = 0, tint = 0xffffff) {
    const maps = {}; let left = Object.keys(files).length;
    for (const [slot, file] of Object.entries(files)) {
      loader.load(`assets/${file}`, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(w / size, d / size); t.center.set(0.5, 0.5); t.rotation = turn;
        t.anisotropy = maxAniso;
        if (slot === 'map') t.colorSpace = THREE.SRGBColorSpace;
        maps[slot] = t;
        if (--left) return;
        Object.assign(mat, { roughness: maps.roughnessMap ? 1 : mat.roughness, color: new THREE.Color(tint), ...maps });
        mat.needsUpdate = true;
        onLoad?.();
      });
    }
  }

  const root = new THREE.Group();
  const groups = {};

  // the desk: also under the mat and the pad
  const deskW = 1.6, deskD = 0.9, deskT = 0.04;
  const deskMat = new THREE.MeshPhysicalMaterial({ color: 0x6b4b33, roughness: 0.8, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  scan(deskMat, { map: 'wood_table_001_diff_2k.jpg', normalMap: 'wood_table_001_nor_gl_2k.jpg', roughnessMap: 'wood_table_001_rough_2k.jpg' }, 1.2, deskW, deskD, Math.PI / 2, 0xc4bcbc);
  const desk = new THREE.Mesh(roundedBox(deskW, deskT, deskD, 0.012), deskMat);
  desk.receiveShadow = true;
  const deskAt = top => { const m = desk.clone(); m.position.y = top - deskT; return m; };

  groups.desk = new THREE.Group();
  groups.desk.add(deskAt(0));

  const conMat = new THREE.MeshPhysicalMaterial({ color: 0x8a8a88, roughness: 0.75, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  scan(conMat, { map: 'concrete_floor_02_diff_1k.jpg', normalMap: 'concrete_floor_02_nor_gl_1k.jpg', roughnessMap: 'concrete_floor_02_rough_1k.jpg' }, 1.6, 1.8, 0.75, 0, 0xc9ced3);
  conMat.normalScale = new THREE.Vector2(0.35, 0.35);
  const counter = new THREE.Mesh(roundedBox(1.8, 0.05, 0.75, 0.006), conMat);
  counter.position.y = -0.05; counter.receiveShadow = true;
  groups.concrete = new THREE.Group(); groups.concrete.add(counter);

  const mw = 0.6, md = 0.45, mt = 0.003;
  const matMat = new THREE.MeshPhysicalMaterial({ map: canvasTex(matCanvas(mw, md)), roughness: 0.62, sheen: 0.2, sheenRoughness: 0.8 });
  const mat = new THREE.Mesh(roundedBox(mw, mt, md, 0.008, 2), matMat);
  mat.position.y = -mt; mat.receiveShadow = true;
  groups.mat = new THREE.Group(); groups.mat.add(mat, deskAt(-mt));

  const pw = 0.5, pd = 0.36, pt = 0.005;
  const padTex = canvasTex(noiseCanvas(512, '#26282c', 0.08, 8, 900));
  padTex.wrapS = padTex.wrapT = THREE.RepeatWrapping; padTex.repeat.set(2, 1.5);
  const padBump = canvasTex(noiseCanvas(512, '#808080', 0.5, 9), false);
  padBump.wrapS = padBump.wrapT = THREE.RepeatWrapping; padBump.repeat.set(6, 4.5);
  const pad = new THREE.Mesh(roundedBox(pw, pt, pd, 0.02, 3), new THREE.MeshPhysicalMaterial({ map: padTex, bumpMap: padBump, bumpScale: 0.6, roughness: 0.92, sheen: 0.35, sheenRoughness: 0.9, sheenColor: new THREE.Color(0x6a7080) }));
  pad.position.y = -pt; pad.receiveShadow = true;
  groups.rubber = new THREE.Group(); groups.rubber.add(pad, deskAt(-pt));

  // glass: a clear slab over a floor seen through it, with a catcher for the paper's shadow
  const gw = 1.4, gd = 0.8, gt = 0.012;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, thickness: gt, ior: 1.52,
    attenuationColor: new THREE.Color(0xc9e6d8), attenuationDistance: 0.25, specularIntensity: 1,
  });
  const glass = new THREE.Mesh(roundedBox(gw, gt, gd, 0.01, 3), glassMat);
  glass.position.y = -gt;
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.ShadowMaterial({ opacity: 0.22 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.0003; catcher.receiveShadow = true;
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.85 });
  scan(floorMat, { map: 'wood_table_001_diff_2k.jpg', normalMap: 'wood_table_001_nor_gl_2k.jpg' }, 0.8, 6, 6, 0, 0x8c7e78);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.72; floor.receiveShadow = true;
  // a steel frame under the glass edge
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.9, roughness: 0.35 });
  const frame = new THREE.Group();
  for (const [x, z, w, d] of [[0, gd / 2 - 0.02, gw - 0.04, 0.02], [0, -gd / 2 + 0.02, gw - 0.04, 0.02], [gw / 2 - 0.02, 0, 0.02, gd - 0.04], [-gw / 2 + 0.02, 0, 0.02, gd - 0.04]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), steel); b.position.set(x, -gt - 0.0125, z); frame.add(b);
  }
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), steel); l.position.set(x * (gw / 2 - 0.04), -0.37, z * (gd / 2 - 0.04)); frame.add(l);
  }
  groups.glass = new THREE.Group(); groups.glass.add(glass, catcher, floor, frame);

  for (const g of Object.values(groups)) { g.visible = false; root.add(g); }
  return {
    root,
    set(id) { for (const [k, g] of Object.entries(groups)) g.visible = k === id; },
    swatch(id) {
      // a small picture of each surface for the picker
      const c = Object.assign(document.createElement('canvas'), { width: 68, height: 36 });
      const g = c.getContext('2d');
      const fill = { desk: ['#7a5638', '#4c3322'], concrete: ['#a3a3a0', '#7d7d7a'], mat: ['#2f6b57', '#2f6b57'], rubber: ['#2a2c30', '#1c1d20'], glass: ['#d7ece3', '#9fc4b6'] }[id];
      const gr = g.createLinearGradient(0, 0, 68, 36); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]);
      g.fillStyle = gr; g.fillRect(0, 0, 68, 36);
      if (id === 'mat') { g.strokeStyle = 'rgba(230,240,228,0.4)'; for (let x = 4; x < 68; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 36); g.stroke(); } for (let y = 4; y < 36; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(68, y); g.stroke(); } }
      if (id === 'desk') { g.strokeStyle = 'rgba(30,18,10,0.35)'; for (let y = 3; y < 36; y += 5) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(20, y + 2, 45, y - 2, 68, y + 1); g.stroke(); } }
      if (id === 'glass') { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(10, 0); g.lineTo(24, 0); g.lineTo(8, 36); g.lineTo(-6, 36); g.fill(); }
      return c;
    },
  };
}
