/* The things in the room, built from primitives and canvas textures. Each builder returns
   a group in its own frame plus whatever handles the playback needs to pose it. */
import * as THREE from 'three';
import { OP, WALL_THICK, whaleSection, WHALE_SPLIT } from './geom.js';

const D2R = Math.PI / 180;

/* ---------- textures ---------- */
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function noiseLayer(ctx, size, cells, alpha, rnd, lo = 0, hi = 255) {
  const [c, x] = canvas(cells);
  const img = x.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) { const v = lo + (hi - lo) * rnd(); img.data.set([v, v, v, 255], i * 4); }
  x.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, size, size); ctx.restore();
}

export function concreteTexture(tone) {
  const S = 1024, [c, x] = canvas(S), rnd = seeded(99);
  const v = Math.round(tone * 255);
  x.fillStyle = `rgb(${v},${v - 2},${v - 6})`; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'overlay';
  for (const [cells, a] of [[6, 0.14], [24, 0.14], [96, 0.12], [384, 0.12]]) noiseLayer(x, S, cells, a, rnd, 100, 156);
  x.globalCompositeOperation = 'source-over';
  // power-trowel swirls
  x.lineWidth = 2;
  for (let i = 0; i < 220; i++) {
    const cx = rnd() * S, cy = rnd() * S, r = 20 + rnd() * 90;
    x.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.03})`;
    x.beginPath(); x.arc(cx, cy, r, rnd() * 6, rnd() * 6 + 1.5); x.stroke();
  }
  // stains and patches
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * S, cy = rnd() * S, r = 30 + rnd() * 160;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rnd() < 0.7;
    gr.addColorStop(0, `rgba(${dark ? '40,36,30' : '235,232,225'},${0.02 + rnd() * 0.04})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // pits and aggregate specks
  for (let i = 0; i < 9000; i++) {
    const d = rnd() < 0.6; x.fillStyle = `rgba(${d ? '20,20,20' : '240,238,232'},${0.08 + rnd() * 0.25})`;
    const s = rnd() < 0.95 ? 1 + rnd() * 1.5 : 2 + rnd() * 3;
    x.fillRect(rnd() * S, rnd() * S, s, s);
  }
  // hairline cracks
  for (let i = 0; i < 7; i++) {
    let px = rnd() * S, py = rnd() * S; x.strokeStyle = 'rgba(25,22,20,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py);
    const a0 = rnd() * 6.28;
    for (let k = 0; k < 30; k++) { px += Math.cos(a0 + (rnd() - 0.5) * 1.6) * 6; py += Math.sin(a0 + (rnd() - 0.5) * 1.6) * 6; x.lineTo(px, py); }
    x.stroke();
  }
  // saw-cut control joints: the texture covers 6 m, joints every 3 m
  x.fillStyle = 'rgba(18,16,14,0.75)';
  for (const p of [0, S / 2]) { x.fillRect(p - 1.5, 0, 3, S); x.fillRect(0, p - 1.5, S, 3); }
  x.fillStyle = 'rgba(255,255,255,0.10)';
  for (const p of [0, S / 2]) { x.fillRect(p + 1.5, 0, 1, S); x.fillRect(0, p + 1.5, S, 1); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function blockWallTexture() {
  const S = 1024, [c, x] = canvas(S), rnd = seeded(7);
  x.fillStyle = '#c9c7c1'; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'overlay';
  for (const [cells, a] of [[16, 0.25], [64, 0.2], [256, 0.2]]) noiseLayer(x, S, cells, a, rnd, 90, 170);
  x.globalCompositeOperation = 'source-over';
  // 400 x 200 mm blocks: the texture covers 2 m x 2 m, so 5 x 10 blocks
  const bw = S / 5, bh = S / 10;
  x.strokeStyle = 'rgba(80,78,72,0.45)'; x.lineWidth = 3;
  for (let r = 0; r < 10; r++) {
    const y = r * bh; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke();
    for (let k = 0; k <= 5; k++) { const xx = k * bw + (r % 2 ? bw / 2 : 0); x.beginPath(); x.moveTo(xx % (S + 1), y); x.lineTo(xx % (S + 1), y + bh); x.stroke(); }
  }
  for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(60,58,52,${rnd() * 0.25})`; x.fillRect(rnd() * S, rnd() * S, 2, 2); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function stripeTexture() {
  const [c, x] = canvas(256, 32);
  x.fillStyle = '#e8b416'; x.fillRect(0, 0, 256, 32);
  x.fillStyle = '#141414';
  for (let i = -2; i < 20; i++) { x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 8, 32); x.lineTo(i * 16 + 24, 0); x.lineTo(i * 16 + 16, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function powderTexture() {
  const S = 256, [c, x] = canvas(S), rnd = seeded(31);
  x.fillStyle = '#2b2b2c'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) { const v = 20 + rnd() * 70; x.fillStyle = `rgb(${v},${v},${v + 3})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- the room ---------- */
export function buildRoom(P) {
  const g = new THREE.Group();
  const W = P.roomWidth, Dp = P.roomDepth, H = P.roomHeight;
  const floorTex = concreteTexture(P.floorTone);
  floorTex.repeat.set(W / 6, Dp / 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), new THREE.MeshStandardMaterial({ map: floorTex, roughnessMap: floorTex, roughness: 1.35, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor';
  g.add(floor);

  const wallTex = blockWallTexture();
  const wallMat = side => { const t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(side / 2, H / 2); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }); };
  const walls = [
    [W, [0, H / 2, -Dp / 2], 0], [W, [0, H / 2, Dp / 2], Math.PI],
    [Dp, [-W / 2, H / 2, 0], Math.PI / 2], [Dp, [W / 2, H / 2, 0], -Math.PI / 2],
  ];
  const band = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.7 });
  for (const [len, pos, ry] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat(len));
    m.position.set(...pos); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
    // a painted dado band and a rubber skirting, like most warehouses
    const b = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), band);
    b.position.set(pos[0], 0.55, pos[2]); b.rotation.y = ry; b.translateZ(0.012); b.receiveShadow = true; g.add(b);
    const sk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.012), new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.6 }));
    sk.position.set(pos[0], 0.05, pos[2]); sk.rotation.y = ry; sk.translateZ(0.02); g.add(sk);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
  // linear LED fixtures in rows
  const fixMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff6e8, emissiveIntensity: 2.2 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.6, roughness: 0.4 });
  const rows = Math.max(2, Math.round(Dp / 3.2)), cols = Math.max(2, Math.round(W / 3.5));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = (j + 0.5) / cols * W - W / 2, z = (i + 0.5) / rows * Dp - Dp / 2;
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.16), housing); h.position.set(x, H - 0.25, z); g.add(h);
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.01, 0.12), fixMat); l.position.set(x, H - 0.285, z); g.add(l);
    for (const s of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.22), housing); w.position.set(x + s, H - 0.11, z); g.add(w); }
  }
  g.userData.fixtures = { rows, cols };
  return g;
}

/* ---------- the ski jump, its wall and the snow ---------- */
export function buildJump(P, prof) {
  const g = new THREE.Group();
  const w = prof.width;
  const snow = new THREE.MeshStandardMaterial({ color: 0xf3f6f9, roughness: 0.72, metalness: 0 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xb58a5a, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.7, roughness: 0.4 });
  const ply = new THREE.MeshStandardMaterial({ color: 0xc8a676, roughness: 0.85, side: THREE.DoubleSide });

  const ribbon = (pts, z0, z1, dy0 = 0, dy1 = 0, mat) => {
    const pos = [], idx = [];
    pts.forEach(([x, y]) => { pos.push(x, y + dy0, z0, x, y + dy1, z1); });
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  const inrun = prof.inrun.pts, hill = prof.hill.pts;
  // snow surfaces, with a little thickness and timber edge boards
  g.add(ribbon(inrun, w / 2, -w / 2, 0, 0, snow));
  g.add(ribbon(inrun, -w / 2, w / 2, -0.03, -0.03, wood));
  g.add(ribbon(hill, w / 2, -w / 2, 0, 0, snow));
  for (const s of [-1, 1]) {
    const z = s * (w / 2 + 0.006);
    g.add(ribbon(inrun, z, z, -0.035, 0.03, wood));
    g.add(ribbon(hill.filter((p, i) => i % 2 === 0 || i === hill.length - 1), z, z, -0.002, 0.025, wood));
  }
  // ice tracks on the inrun
  const trackMat = new THREE.MeshStandardMaterial({ color: 0xc9dbe8, roughness: 0.15, metalness: 0.1 });
  for (const s of [-1, 1]) g.add(ribbon(inrun, s * 0.045 - 0.008, s * 0.045 + 0.008, 0.0015, 0.0015, trackMat));
  // the plywood skirts under the landing hill
  const sideShape = new THREE.Shape();
  sideShape.moveTo(prof.xk, 0); hill.forEach(([x, y]) => sideShape.lineTo(x, y)); sideShape.lineTo(prof.xk, 0);
  const sideGeo = new THREE.ShapeGeometry(sideShape);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(sideGeo, ply); m.position.z = s * (w / 2 + 0.012); m.castShadow = m.receiveShadow = true; g.add(m); }
  const knollFace = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.024, prof.yk), ply);
  knollFace.position.set(prof.xk, prof.yk / 2, 0); knollFace.rotation.y = -Math.PI / 2; g.add(knollFace);
  // K-point and distance lines on the landing hill
  const lineMat = c => new THREE.MeshBasicMaterial({ color: c });
  [[0.35, 0x3a6fd8], [0.55, 0x3a6fd8], [0.72, 0xd8312f]].forEach(([f, col]) => {
    const x = prof.xk + (prof.xh - prof.xk) * f, y = prof.hillY(x);
    const e = 0.004, ang = Math.atan2(prof.hillY(x + e) - prof.hillY(x - e), 2 * e);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.008, w), lineMat(col));
    m.position.set(x, y + 0.0015, 0); m.rotation.set(-Math.PI / 2, 0, 0); m.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), ang); g.add(m);
  });
  // scaffold tower under the inrun
  const post = (x, y0, y1, z) => {
    const h = y1 - y0; if (h < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.022, h, 0.022), wood); m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  const deckY = x => { for (let i = 1; i < inrun.length; i++) if (inrun[i][0] >= x) { const a = inrun[i - 1], b = inrun[i], f = (x - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * f; } return inrun[inrun.length - 1][1]; };
  const xs = [];
  for (let x = 0.02; x < prof.edge[0] - 0.02; x += 0.32) xs.push(x);
  xs.push(prof.edge[0] - 0.025);
  for (const x of xs) for (const s of [-1, 1]) post(x, 0, deckY(x) - 0.032, s * (w / 2 - 0.02));
  // braces between the posts
  for (let i = 0; i < xs.length - 1; i++) for (const s of [-1, 1]) {
    const x0 = xs[i], x1 = xs[i + 1];
    for (let lv = 0.3; lv < Math.min(deckY(x0), deckY(x1)) - 0.1; lv += 0.45) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.014, 0.01), wood); m.position.set((x0 + x1) / 2, lv, s * (w / 2 - 0.02)); m.castShadow = true; g.add(m);
    }
    const a = new THREE.Vector3(x0, 0.05, 0), b = new THREE.Vector3(x1, Math.min(deckY(x1) - 0.06, 0.05 + (x1 - x0) * 1.6), 0);
    const len = a.distanceTo(b); const br = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, 0.008), steel);
    br.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, s * (w / 2 - 0.006)); br.rotation.z = Math.atan2(b.y - a.y, b.x - a.x); g.add(br);
  }
  for (const x of xs) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, w), wood); m.position.set(x, Math.max(0.2, deckY(x) - 0.06), 0); g.add(m); }
  // start platform and bar
  const top = inrun[0];
  const plat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, w + 0.1), wood); plat.position.set(top[0] - 0.1, top[1] - 0.01, 0); plat.castShadow = true; g.add(plat);
  for (const s of [-1, 1]) post(top[0] - 0.2, 0, top[1] - 0.02, s * (w / 2 + 0.03));
  const barA = inrun[3] || inrun[1];
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, w + 0.02), steel); bar.rotation.x = Math.PI / 2; bar.position.set(barA[0] - 0.02, barA[1] + 0.05, 0); g.add(bar);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06), steel); p.position.set(barA[0] - 0.02, barA[1] + 0.02, s * (w / 2 + 0.01)); g.add(p); }
  // railings up the tower
  for (const s of [-1, 1]) g.add(ribbon(inrun.filter((_, i) => i % 3 === 0), s * (w / 2 + 0.025), s * (w / 2 + 0.025), 0.08, 0.085, steel));

  // the wall at the end of the outrun, padded on the snow side
  const wallW = w + 0.5;
  const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.wallColor), roughness: 0.55 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK, P.wallHeight, wallW), wallMat);
  wall.position.set(prof.xb + WALL_THICK / 2, P.wallHeight / 2, 0); wall.castShadow = wall.receiveShadow = true; g.add(wall);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICK + 0.008, 0.008, wallW + 0.008), new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.5 }));
  cap.position.set(prof.xb + WALL_THICK / 2, P.wallHeight, 0); g.add(cap);
  // feet behind the wall
  for (const zz of [-wallW / 2 + 0.03, 0, wallW / 2 - 0.03]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.02), steel); f.position.set(prof.xb + WALL_THICK + 0.03, 0.004, zz); g.add(f);
  }
  g.userData.wallMat = wallMat;
  g.userData.snowMat = snow;

  // sparkles on the snow
  const sp = [], seed = [];
  const rnd = seeded(5);
  for (const path of [prof.inrun, prof.hill]) for (let i = 0; i < 900; i++) {
    const s = rnd() * path.length; const k = Math.min(path.pts.length - 2, path.s.findIndex(v => v >= s));
    const a = path.pts[Math.max(0, k)]; sp.push(a[0], a[1] + 0.0015, (rnd() - 0.5) * (w - 0.02)); seed.push(rnd());
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sgeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmt: { value: P.snowSparkle }, uScale: { value: 400 } },
    vertexShader: `attribute float aSeed; uniform float uTime, uScale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv;
        vec3 vd = normalize(-mv.xyz); float f = fract(aSeed*91.7 + dot(vd, vec3(13.1,7.7,5.3))*3.0);
        vA = pow(max(0., 1. - abs(f-.5)*18.), 2.);
        gl_PointSize = clamp(uScale * 0.004 / -mv.z, 1., 4.); }`,
    fragmentShader: `uniform float uAmt; varying float vA; void main(){ vec2 c = gl_PointCoord-.5; float d = 1.-smoothstep(0.,.5,length(c)); gl_FragColor = vec4(vec3(1.), d*vA*uAmt); }`,
  });
  const sparkles = new THREE.Points(sgeo, smat); sparkles.frustumCulled = false; g.add(sparkles);
  g.userData.sparkleMat = smat;
  return g;
}

/* ---------- figures ---------- */
function limb(r, l, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mat);
  m.position.y = l / 2; m.castShadow = true; return m;
}

/* A ski jumper about 20 cm tall. Root sits under the bindings and is turned to the ski angle;
   the body chain (ankle, knee, hip) bends from the poses below. */
export function buildSkier(P) {
  const root = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.suitColor), roughness: 0.5 });
  const suit2 = new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 0.5 });
  const helmet = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.helmetColor), roughness: 0.25, metalness: 0.1 });
  const goggle = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.9 });
  const skiMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.35 });
  const skiTop = new THREE.MeshStandardMaterial({ color: 0xe9c21a, roughness: 0.4 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.5 });
  const skis = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.z = s * 0.014;
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.003, 0.011), skiMat); k.position.set(0.01, 0.0015, 0); k.castShadow = true; g.add(k);
    const kt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.0008, 0.009), skiTop); kt.position.set(0.01, 0.0034, 0); g.add(kt);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.011), skiMat); tip.position.set(0.152, 0.006, 0); tip.rotation.z = 0.45; g.add(tip);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.014, 0.011), boot); b.position.set(0, 0.009, 0); b.castShadow = true; g.add(b);
    root.add(g); skis.push({ g, s });
  }
  const ankle = new THREE.Group(); ankle.position.y = 0.012; root.add(ankle);
  const SH = 0.052, TH = 0.054, TO = 0.06;
  for (const s of [-1, 1]) { const m = limb(0.0065, SH, suit); m.position.z = s * 0.013; ankle.add(m); }
  const knee = new THREE.Group(); knee.position.y = SH; ankle.add(knee);
  for (const s of [-1, 1]) { const m = limb(0.0078, TH, suit); m.position.z = s * 0.012; knee.add(m); }
  const hip = new THREE.Group(); hip.position.y = TH; knee.add(hip);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.0145, TO - 0.02, 4, 12), suit); torso.position.y = TO / 2; torso.scale.set(0.85, 1, 1.05); torso.castShadow = true; hip.add(torso);
  const bib = new THREE.Mesh(new THREE.CapsuleGeometry(0.0148, 0.025, 4, 12), new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 }));
  bib.position.y = TO * 0.62; bib.scale.set(0.86, 1, 1.06); hip.add(bib);
  const neck = new THREE.Group(); neck.position.y = TO + 0.004; hip.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 16, 12), helmet); head.position.y = 0.012; head.castShadow = true; neck.add(head);
  const gg = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.02), goggle); gg.position.set(0.011, 0.011, 0); neck.add(gg);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0, TO - 0.006, s * 0.019); hip.add(sh);
    const a = limb(0.0055, 0.06, suit2); a.position.y = -0.03; sh.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), suit2); hand.position.y = -0.064; sh.add(hand);
    arms.push({ g: sh, s });
  }
  // poses: shin lean (forward from ski normal), knee, hip and arm angles in degrees
  const STAND = { a1: 14, a2: 26, a3: 28, arm: 8, out: 6 };
  const TUCK = { a1: 38, a2: 118, a3: 160, arm: -8, out: 4 };
  const LAND = { a1: 30, a2: 62, a3: 58, arm: 25, out: 55 };
  const CRASH = { a1: 75, a2: 10, a3: 15, arm: 60, out: 70 };
  const lerp = (a, b, f) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] + (b[k] - a[k]) * f]));
  function pose(tuck, fly, land, crash, vSpread, tipAngle) {
    const FLY = { a1: 90 - Math.max(6, tipAngle - 10), a2: 8, a3: 4, arm: -14, out: 10 };
    let p = lerp(STAND, TUCK, tuck);
    p = lerp(p, FLY, fly);
    p = lerp(p, LAND, land);
    p = lerp(p, CRASH, crash);
    ankle.rotation.z = -p.a1 * D2R;
    knee.rotation.z = p.a2 * D2R;
    hip.rotation.z = -p.a3 * D2R;
    neck.rotation.z = (p.a1 - p.a2 + p.a3 - 10) * D2R * 0.6;   // keep his eyes up
    for (const a of arms) { a.g.rotation.z = p.arm * D2R; a.g.rotation.x = -a.s * p.out * D2R; }
    for (const k of skis) { k.g.rotation.y = -k.s * vSpread * fly * 0.5 * D2R; k.g.position.z = k.s * (0.014 + 0.01 * fly); }
  }
  pose(0, 0, 0, 0, 0, 28);
  root.userData.pose = pose;
  root.userData.mats = { suit, helmet };
  return root;
}

/* The camera operator, about 20 cm tall, filming over the wall with a shoulder camera. */
export function buildOperator(P) {
  const h = P.opHeight, k = h / 0.2;
  const root = new THREE.Group();
  const tip = new THREE.Group(); root.add(tip);   // rotates about the feet
  const body = new THREE.Group(); body.scale.setScalar(k); tip.add(body);
  const jacket = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.opColor), roughness: 0.75 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2c3646, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.2 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x1f2b3a, roughness: 0.7 });
  for (const s of [-1, 1]) {
    const leg = limb(0.0085, 0.085, jeans); leg.position.set(0, 0.006, s * 0.012); body.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.013), black); shoe.position.set(-0.006, 0.005, s * 0.012); shoe.castShadow = true; body.add(shoe);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.04, 4, 12), jacket); torso.position.y = 0.125; torso.scale.set(0.8, 1, 1.1); torso.castShadow = true; body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 16, 12), skin); head.position.y = 0.172; head.castShadow = true; body.add(head);
  const capM = new THREE.Mesh(new THREE.SphereGeometry(0.0132, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap); capM.position.y = 0.174; body.add(capM);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.018), cap); brim.position.set(-0.014, 0.176, 0); body.add(brim);
  // arms up to the camera on his right shoulder
  const armR = limb(0.006, 0.045, jacket); armR.position.set(-0.005, 0.15, -0.024); armR.rotation.set(0.2, 0, 1.7); body.add(armR);
  const armL = limb(0.006, 0.05, jacket); armL.position.set(-0.002, 0.14, 0.022); armL.rotation.set(-0.7, 0, 1.4); body.add(armL);
  // the camera: body on the shoulder, lens out front (where OP.lens says), viewfinder
  const cam = new THREE.Group(); body.add(cam);
  const L = OP.lens;
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.016), black); camBody.position.set(-0.024, L[1] * 0.2, L[2] * 0.2); camBody.castShadow = true; cam.add(camBody);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), black); handle.position.set(-0.024, L[1] * 0.2 + 0.014, L[2] * 0.2); cam.add(handle);
  const vf = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.008), black); vf.position.set(-0.04, L[1] * 0.2 + 0.004, L[2] * 0.2 + 0.012); cam.add(vf);
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.0015, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); tally.position.set(-0.052, L[1] * 0.2 + 0.012, L[2] * 0.2); cam.add(tally);
  root.userData = { tip, body, lensMount: new THREE.Vector3(L[0], L[1], L[2]).multiplyScalar(h), tally };
  return root;
}

export function buildLens(P) {
  const d = P.lensSize, r = d / 2, len = d * 0.95;
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }));
  barrel.rotation.x = Math.PI / 2; barrel.castShadow = true; g.add(barrel);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, len * 0.3, 28), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 }));
  ring.rotation.x = Math.PI / 2; ring.position.z = len * 0.05; g.add(ring);
  const red = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, r * 0.03, 6, 28), new THREE.MeshBasicMaterial({ color: 0xc8202a })); red.position.z = len * 0.4; g.add(red);
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, len * 0.12, 28), new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 1, roughness: 0.2 }));
  mount.rotation.x = Math.PI / 2; mount.position.z = -len * 0.55; g.add(mount);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x8fb4ff, roughness: 0.02, metalness: 0, transmission: 0.6, thickness: 0.01, ior: 1.6, iridescence: 1, iridescenceIOR: 1.8, clearcoat: 1, transparent: true, opacity: 0.85 });
  for (const z of [len / 2 - 0.0005, -len / 2 + 0.0005]) {
    const gl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.88, 24, 12, 0, Math.PI * 2, 0, 0.6), glass);
    gl.rotation.x = z > 0 ? Math.PI / 2 : -Math.PI / 2; gl.position.z = z - Math.sign(z) * r * 0.88 * Math.cos(0.6); g.add(gl);
  }
  return g;
}

/* ---------- the pad, the cube, the laser ---------- */
export function buildPad(P) {
  const r = P.padRadius;
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.85, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.6, roughness: 0.5 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, 0.004, r * 2.8), dark); base.position.y = 0.002; base.receiveShadow = true; g.add(base);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 8), steel); b.position.set(x * r * 1.2, 0.005, z * r * 1.2); g.add(b); }
  const stripes = stripeTexture(); stripes.repeat.set(Math.max(4, Math.round(r * 120)), 1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.02, r * 1.28, 48, 1), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0042; g.add(ring);
  // stripe UVs run round the ring
  { const uv = ring.geometry.attributes.uv, pos = ring.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)); const rr = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (a / (Math.PI * 2) + 0.5), (rr - r * 1.02) / (r * 0.26)); } }
  const well = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.003, 40), new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.9 })); well.position.y = 0.0028; g.add(well);
  const plateG = new THREE.Group(); g.add(plateG);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.006, 40), steel); plate.position.y = 0.003; plate.castShadow = true; plate.receiveShadow = true; plateG.add(plate);
  const grip = new THREE.Mesh(new THREE.RingGeometry(r * 0.3, r * 0.34, 32), dark); grip.rotation.x = -Math.PI / 2; grip.position.y = 0.0062; plateG.add(grip);
  // spring under the plate, stretched as it fires
  const turns = 6, pts = [];
  for (let i = 0; i <= turns * 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.6, i / (turns * 24), Math.sin(a) * r * 0.6)); }
  const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.0025, 6, false), steel);
  spring.castShadow = true; g.add(spring);
  g.userData = { plateG, spring };
  return g;
}
export function setPadPop(pad, tau) {   // tau: seconds since it fired (negative: not yet)
  const { plateG, spring } = pad.userData;
  let h = 0;
  if (tau >= 0) h = 0.07 * (1 - Math.exp(-80 * tau)) * Math.exp(-1.6 * tau) * (0.75 + 0.25 * Math.cos(tau * 30) * Math.exp(-4 * tau));
  plateG.position.y = h;
  spring.visible = h > 0.002;
  spring.scale.y = Math.max(0.001, h + 0.003);
  spring.position.y = 0.002;
}

export function buildCube(P) {
  const s = P.cubeSize;
  const g = new THREE.Group();
  const col = new THREE.Color(P.cubeColor);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: col }, uGlow: { value: P.cubeGlow }, uActive: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime, uGlow, uActive; uniform vec3 uColor; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float fr = pow(1. - abs(dot(vN, vV)), 2.);
        vec3 q = vP * ${(12 / s).toFixed(3)};
        float lines = 0.; for (int i=0;i<3;i++){ float c = q[i] + uTime*0.35*(float(i)-1.); lines += smoothstep(.93, 1., abs(fract(c)-.5)*2.); }
        float a = (0.035 + fr*0.22 + lines*0.04) * uGlow * (1. + uActive*0.8);
        gl_FragColor = vec4(uColor * a, a); }`,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat); g.add(box);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
  g.add(edges);
  const node = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.8, roughness: 0.3, emissive: col, emissiveIntensity: 0.25 });
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), node); n.position.set(x * s / 2, y * s / 2, z * s / 2); g.add(n);
  }
  // dust drifting in the field
  const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  const rnd = seeded(77);
  for (let i = 0; i < N; i++) { pos.set([(rnd() - 0.5) * s, (rnd() - 0.5) * s, (rnd() - 0.5) * s], i * 3); seed[i] = rnd(); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: col }, uHalf: { value: s / 2 }, uScale: { value: 400 }, uGlow: { value: P.cubeGlow } },
    vertexShader: `attribute float aSeed; uniform float uTime, uHalf, uScale; varying float vS;
      void main(){ vec3 p = position; float a = uTime*(0.15+aSeed*0.25) + aSeed*20.;
        p += vec3(sin(a), cos(a*1.3), sin(a*0.7+1.)) * uHalf*0.12; p = clamp(p, -uHalf, uHalf); vS = aSeed;
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(uScale*0.006/-mv.z, 1., 6.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uGlow; varying float vS; void main(){ float d = 1.-smoothstep(0.,.5,length(gl_PointCoord-.5)); gl_FragColor = vec4(uColor, d*(0.35+0.4*vS)*uGlow); }`,
  });
  const dust = new THREE.Points(dg, dm); dust.frustumCulled = false; g.add(dust);
  g.userData = { mat, dm, edges, node };
  return g;
}

export function buildLaser() {
  const g = new THREE.Group();   // origin at the pointer; tripod hangs down to the floor
  const alu = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.9, roughness: 0.25 });
  const blk = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.5 });
  const aim = new THREE.Group(); g.add(aim);   // +z points along the beam
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.15, 20), alu); pen.rotation.x = Math.PI / 2; pen.castShadow = true; aim.add(pen);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.02, 20), blk); nose.rotation.x = Math.PI / 2; nose.position.z = 0.085; aim.add(nose);
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.003, 0.012), new THREE.MeshStandardMaterial({ color: 0xb01818 })); btn.position.set(0, 0.0095, 0.02); aim.add(btn);
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.02, 0.03), blk); clamp.position.y = -0.012; aim.add(clamp);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), blk); head.position.y = -0.03; g.add(head);
  const legs = new THREE.Group(); g.add(legs);
  g.userData = { aim, legs, alu, blk, aperture: new THREE.Vector3(0, 0, 0.095) };
  return g;
}
export function setLaserStand(laser, y) {
  const { legs, alu, blk } = laser.userData;
  legs.clear();
  const top = new THREE.Vector3(0, -0.04, 0), spread = Math.max(0.12, y * 0.32);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, Math.max(0.01, y * 0.35)), alu); col.position.y = -0.04 - y * 0.175; legs.add(col);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.4, foot = new THREE.Vector3(Math.cos(a) * spread, -y, Math.sin(a) * spread);
    const len = top.distanceTo(foot), m = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, len), alu);
    m.position.copy(top).add(foot).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(top).normalize()); m.castShadow = true; legs.add(m);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), blk); f.position.copy(foot).setY(-y + 0.004); legs.add(f);
  }
}

/* ---------- gunpowder ---------- */
export function buildPile(P) {
  const R = P.pileSize / 2, h = P.pileSize * 0.42;
  const pts = [];
  for (let i = 0; i <= 16; i++) { const f = i / 16; pts.push(new THREE.Vector2(R * f, h * Math.pow(1 - f * f, 0.9) + 0.001)); }
  pts.reverse();
  const geo = new THREE.LatheGeometry(pts, 40);
  const pos = geo.attributes.position, rnd = seeded(3);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > 0.002) pos.setY(i, y * (0.9 + rnd() * 0.2)); }
  geo.computeVertexNormals();
  const tex = powderTexture(); tex.repeat.set(3, 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xffffff });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  m.userData = { mat };
  return m;
}

/* the trail: a low ribbon of powder along the curve; the shader darkens what's burnt and
   glows behind the flame front. aS is arc length along the trail. */
export function buildTrail(P, trail) {
  const w = P.trailWidth, pts = trail.pts, S = trail.s;
  const across = 7, pos = [], s = [], uv = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    for (let j = 0; j < across; j++) {
      const f = j / (across - 1) - 0.5, wobble = 1 + 0.15 * Math.sin(S[i] * 37 + j);
      const y = 0.0006 + 0.006 * Math.cos(f * Math.PI) ** 1.5 * (w / 0.035) * wobble;
      pos.push(pts[i][0] + nx * f * w * wobble, y, pts[i][1] + nz * f * w * wobble);
      s.push(S[i]); uv.push(S[i] * 8, f + 0.5);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < across - 1; j++) {
    const a = i * across + j, b = a + across;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const tex = powderTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const uniforms = { uFront: { value: -1 }, uTime: { value: 0 }, uEmber: { value: P.emberTime }, uSpeed: { value: P.burnSpeed } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aS; varying float vS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = aS;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFront, uTime, uEmber, uSpeed; varying float vS;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float burnt = step(vS, uFront);
        float since = (uFront - vS);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05,0.045,0.04) + diffuseColor.rgb*0.15, burnt);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uFront >= vS) {
          float age = since / max(uSpeed, 0.001);   // seconds since this bit lit
          float glow = exp(-age * 5.0) * 3.0 + (uEmber > 0. ? exp(-age * 2.5 / max(uEmber, 0.01)) * 0.4 * (0.6 + 0.4*sin(vS*90. + uTime*7.)) : 0.);
          totalEmissiveRadiance += vec3(1.0, 0.35, 0.06) * glow;
        }`);
  };
  mat.customProgramCacheKey = () => 'trail';
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true;
  m.userData = { uniforms };
  return m;
}

/* ---------- the whale ---------- */
function whaleColor(u, a) {   // a: angle round the body, 0 = flank, +pi/2 = back
  const back = new THREE.Color(0x30353c), belly = new THREE.Color(0x8c887f), rot = new THREE.Color(0x8a6460), pale = new THREE.Color(0xa9a397);
  const up = Math.sin(a);
  const c = belly.clone().lerp(back, THREE.MathUtils.smoothstep(up, -0.4, 0.3));
  // soft, large patches of decay and a few pale scars, smooth across the body
  const n = Math.sin(u * 23 + a * 2.3) * Math.sin(u * 9.7 - a * 1.7 + 1.3) + 0.35 * Math.sin(u * 51 + a * 5.1);
  c.lerp(rot, THREE.MathUtils.smoothstep(n, 0.35, 0.95) * 0.45);
  const sc = Math.sin(u * 140 + a * 3) * Math.sin(u * 17 + a * 9);
  c.lerp(pale, THREE.MathUtils.smoothstep(sc, 0.85, 0.98) * 0.5);
  if (up < -0.2) c.multiplyScalar(0.94 + 0.06 * Math.cos(a * 70));   // throat grooves
  return c;
}
function bodyGeometry(P, u0, u1, pivotX) {
  const L = P.whaleLength, rings = Math.max(6, Math.round((u1 - u0) * 70)), seg = 36;
  const pos = [], col = [], idx = [];
  const rnd = seeded(Math.round(u0 * 1000) + 11);
  for (let i = 0; i <= rings; i++) {
    const u = u0 + (u1 - u0) * i / rings, s = whaleSection(u, L, P.whaleBloat);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2;
      let y = s.cy + s.h * Math.sin(a);
      const flat = Math.max(0, 0.012 - y);
      y = Math.max(0.004, y);
      const z = s.w * Math.cos(a) * (1 + flat * 4);
      // a bit of sag and lumpiness: it's been dead a while
      const lump = 1 + 0.025 * Math.sin(u * 40 + a * 3) * Math.sin(a * 2 + u * 9);
      pos.push(L * (0.5 - u) - pivotX, y * lump, z * lump);
      let c = whaleColor(u, a);
      if (u < 0.09 && Math.abs(Math.sin(a) + 0.05) < 0.05) c = new THREE.Color(0x1c1c1e);   // mouth line
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function capGeometry(P, u, pivotX, facing) {   // the raw end of a blown-apart section
  const s = whaleSection(u, P.whaleLength, P.whaleBloat), shape = new THREE.Shape();
  for (let j = 0; j <= 36; j++) { const a = j / 36 * Math.PI * 2; const y = Math.max(0.004, s.cy + s.h * Math.sin(a)); const z = s.w * Math.cos(a) * (0.95 + 0.03 * Math.sin(j * 1.7)); j ? shape.lineTo(z, y * 0.97) : shape.moveTo(z, y * 0.97); }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
  geo.translate(P.whaleLength * (0.5 - u) - pivotX, 0, 0);
  return geo;
}
export const fleshMat = () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 });

export function buildWhale(P) {
  const L = P.whaleLength;
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  const meat = new THREE.MeshStandardMaterial({ color: 0x6e1418, roughness: 0.35, side: THREE.DoubleSide });
  const [s0, s1] = WHALE_SPLIT;
  const headPivot = L * (0.5 - s0 * 0.5), tailPivot = L * (0.5 - (s1 + 1) * 0.5);
  const head = new THREE.Group(), mid = new THREE.Group(), tail = new THREE.Group();
  const add = (grp, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
  add(head, bodyGeometry(P, 0, s0, headPivot), skin);
  add(head, capGeometry(P, s0, headPivot, -1), meat);
  add(mid, bodyGeometry(P, s0 - 0.002, s1 + 0.002, 0), skin);
  add(tail, bodyGeometry(P, s1, 1, tailPivot), skin);
  add(tail, capGeometry(P, s1, tailPivot, 1), meat);
  head.position.x = headPivot; tail.position.x = tailPivot;
  // eye, flippers, dorsal fin and flukes
  const sEye = whaleSection(0.08, L, P.whaleBloat);
  for (const z of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(L * 0.006, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.1 }));
    eye.position.set(L * (0.5 - 0.085) - headPivot, sEye.cy - sEye.h * 0.1, z * sEye.w * 0.93); head.add(eye);
  }
  const fin = (len, wid, thick) => { const g = new THREE.SphereGeometry(1, 20, 10); g.scale(len, thick, wid); return g; };
  const finMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.55 });
  const sF = whaleSection(0.27, L, P.whaleBloat);
  for (const z of [-1, 1]) {
    const f = new THREE.Mesh(fin(L * 0.07, L * 0.025, L * 0.008), finMat);
    f.position.set(L * (0.5 - 0.27), sF.cy - sF.h * 0.55, z * (sF.w * 0.95 + L * 0.05)); f.rotation.set(z * 0.5, z * 0.9, -0.25); f.castShadow = true; mid.add(f);
  }
  const sD = whaleSection(0.62, L, P.whaleBloat);
  const dors = new THREE.Mesh(new THREE.ConeGeometry(L * 0.018, L * 0.04, 4), finMat); dors.scale.set(2, 1, 0.3); dors.position.set(L * (0.5 - 0.62), sD.cy + sD.h * 0.98, 0); dors.rotation.z = 0.5; mid.add(dors);
  const fl = new THREE.Shape();
  const fw = L * 0.16, fd = L * 0.07;
  fl.moveTo(0, 0); fl.bezierCurveTo(-fd * 0.3, fw * 0.3, -fd * 0.9, fw * 0.8, -fd * 0.6, fw); fl.bezierCurveTo(-fd * 0.9, fw * 0.6, -fd * 0.95, fw * 0.2, -fd * 0.8, 0);
  fl.bezierCurveTo(-fd * 0.95, -fw * 0.2, -fd * 0.9, -fw * 0.6, -fd * 0.6, -fw); fl.bezierCurveTo(-fd * 0.9, -fw * 0.8, -fd * 0.3, -fw * 0.3, 0, 0);
  const flG = new THREE.ExtrudeGeometry(fl, { depth: L * 0.008, bevelEnabled: true, bevelThickness: L * 0.003, bevelSize: L * 0.003, bevelSegments: 2 });
  flG.rotateX(Math.PI / 2);
  const flukes = new THREE.Mesh(flG, finMat);
  const sT = whaleSection(0.99, L, P.whaleBloat);
  flukes.position.set(L * (0.5 - 0.985) - tailPivot, sT.cy + L * 0.006, 0); flukes.rotation.z = -0.05; flukes.castShadow = true; tail.add(flukes);
  // a little rope where the fuse goes in
  return { head, mid, tail, pivots: [headPivot, tailPivot], skin };
}

/* eight lumpy chunk shapes, flesh inside, blubber and skin on one side */
export function chunkGeometries() {
  const out = [], rnd = seeded(2024);
  const meat = new THREE.Color(0x8a1a1c), dark = new THREE.Color(0x4a0b0e), fat = new THREE.Color(0xe8d6b8), skin = new THREE.Color(0x2f343b);
  for (let k = 0; k < 8; k++) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position, cols = [];
    const sx = 0.6 + rnd() * 0.8, sy = 0.45 + rnd() * 0.6, sz = 0.6 + rnd() * 0.8;
    const f1 = 2 + rnd() * 3, f2 = rnd() * 6;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 1 + 0.28 * Math.sin(v.x * f1 + f2) * Math.cos(v.y * f1 * 1.3) + 0.15 * Math.sin(v.z * 7 + k);
      v.multiplyScalar(n); v.set(v.x * sx, v.y * sy, v.z * sz);
      p.setXYZ(i, v.x, v.y, v.z);
      const side = v.y / sy;
      const c = side > 0.55 ? skin.clone() : side > 0.3 ? fat.clone() : meat.clone().lerp(dark, Math.max(0, Math.sin(v.x * 9 + v.z * 7)) * 0.7);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}
