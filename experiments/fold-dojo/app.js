import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { build, animPos, restPos, poseMapOf, presentPos, modelPoly, centroid, ease } from './engine.js';
import { DESIGNS } from './designs.js';
import { COLORS, PATTERNS, WEIGHTS, SIZES, colorHex, drawSide, withCreases, swatch, fibreCanvas } from './paper.js';
import { SURFACES, makeSurfaces, roundedBox } from './surfaces.js';

const ENVS = [
  { id: 'studio', name: 'Studio', file: 'studio_small_09_1k.hdr', light: 1 },
  { id: 'kominka', name: 'Japanese house', file: 'studio_kominka_03_1k.hdr', light: 0.8 },
  { id: 'workshop', name: 'Workshop', file: 'artist_workshop_1k.hdr', light: 0.7 },
  { id: 'attic', name: 'Attic', file: 'pine_attic_1k.hdr', light: 0.7 },
  { id: 'veranda', name: 'Veranda', file: 'veranda_1k.hdr', light: 0.9 },
  { id: 'pines', name: 'Misty pines', file: 'misty_pines_1k.hdr', light: 0.6 },
];
const DISPLAYS = [
  { id: 'plinth', name: 'Plinth' },
  { id: 'floor', name: 'On the floor' },
  { id: 'float', name: 'Floating' },
];
const SPEEDS = [0.5, 1, 1.5, 2];
const BASE_DUR = 1.5;      // seconds for an ordinary fold at 1×
const HOLD = 0.7;          // pause between steps while watching
const THICK = 1.6;         // drawn thickness against real thickness, so stacks read at a glance

const url = new URLSearchParams(location.search);
if (url.get('ui') === '0') document.body.classList.add('no-ui');
const store = {
  get(k) { try { return localStorage.getItem('fold-dojo:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('fold-dojo:' + k, v); return true; } catch { return false; } },
};
const pick = (list, id, fallback) => (list.some(x => x.id === id) ? id : fallback);

const state = {
  design: pick(DESIGNS, url.get('design') || store.get('design'), 'crane'),
  mode: url.get('mode') === 'fold' ? 'fold' : 'watch',      // watch | fold, plus the viewer on top
  viewer: url.get('view') === '1',
  pattern: pick(PATTERNS, store.get('pattern'), 'solid'),
  color: pick(COLORS, store.get('color'), 'red'),
  back: ['white', 'same', 'second'].includes(store.get('back')) ? store.get('back') : 'white',
  color2: pick(COLORS, store.get('color2'), 'cream'),
  weight: pick(WEIGHTS, store.get('weight'), 'kami'),
  sizeSquare: pick(SIZES.square, store.get('sizeSquare'), 's15'),
  sizeRect: pick(SIZES.rect, store.get('sizeRect'), 'a4'),
  surface: pick(SURFACES, url.get('surface') || store.get('surface'), 'desk'),
  speed: SPEEDS.includes(+store.get('speed')) ? +store.get('speed') : 1,
  follow: store.get('follow') !== '0',
  lines: store.get('lines') !== '0',
  orbit: false,
  ao: url.has('ao') ? url.get('ao') === '1' : store.get('ao') ? store.get('ao') === '1' : innerWidth >= 900,
  env: pick(ENVS, store.get('env'), 'studio'),
  display: pick(DISPLAYS, store.get('display'), 'plinth'),
  blur: Math.min(0.6, Math.max(0, +(store.get('blur') ?? 0.25))),
  turntable: store.get('turntable') !== '0',
  // where we are: step index and progress through it
  step: 0, t: 0, playing: url.get('play') !== '0', hold: 0,
  hintLevel: 0, idle: 0,
};

/* ---------- renderer, scene, camera ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: url.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0e10);
const pmrem = new THREE.PMREMGenerator(renderer);

// a stand-in studio of glowing panels while the photograph loads
function studio() {
  const room = new THREE.Scene();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 12), new THREE.MeshBasicMaterial({ color: 0x17181b, side: THREE.BackSide }));
  walls.position.y = 2.5; room.add(walls);
  const panel = (w, h, color, power, at) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...at); m.lookAt(0, 0, 0); room.add(m);
  };
  panel(2.6, 2, 0xfff0dc, 9, [-2.2, 3.2, 2.4]); panel(0.6, 3.2, 0xf4f2ee, 3.5, [3.4, 1.6, 1]);
  panel(2, 0.8, 0xbcd0ff, 5, [1.4, 1.8, -3.4]); panel(4, 4, 0xffffff, 0.8, [0, 5.4, 0]);
  return room;
}
scene.environment = pmrem.fromScene(studio(), 0.02).texture;
scene.environmentIntensity = 0.4;

const hdrs = new Map();
const rgbe = new RGBELoader();
function loadEnv(id) {
  if (hdrs.has(id)) return hdrs.get(id);
  const env = ENVS.find(e => e.id === id);
  const p = new Promise(res => rgbe.load(`assets/${env.file}`, hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    res({ hdr, env: pmrem.fromEquirectangular(hdr).texture });
  }, undefined, () => res(null)));
  hdrs.set(id, p);
  return p;
}

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.005, 30);

/* ---------- paper interaction listeners go before the orbit controls, so a grab on the paper
   can stop the controls from also starting an orbit ---------- */
canvas.addEventListener('pointerdown', onPointerDown);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.06;
controls.maxDistance = 3;
controls.screenSpacePanning = true;
controls.autoRotateSpeed = 0.7;
controls.maxPolarAngle = Math.PI * 0.495;

const key = new THREE.DirectionalLight(0xfff4ea, 3.6);
key.position.set(-1.14, 0.95, 0.69);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45, near: 0.2, far: 4 });
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.002;
key.shadow.radius = 4;
scene.add(key, key.target);
scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2018, 0.12));

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.02, distanceExponent: 1, thickness: 1, scale: 1.2, samples: 16, distanceFallOff: 1 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
composer.addPass(gtao);
composer.addPass(new OutputPass());

/* ---------- the studio: surfaces, and the viewer's stands ---------- */
const surfaces = makeSurfaces(renderer, () => { dirty = true; });
scene.add(surfaces.root);

const viewerRoot = new THREE.Group();
viewerRoot.visible = false;
scene.add(viewerRoot);
const plinthMat = new THREE.MeshPhysicalMaterial({ color: 0xefede8, roughness: 0.82, clearcoat: 0.05 });
const plinth = new THREE.Mesh(roundedBox(0.34, 0.5, 0.34, 0.004, 2), plinthMat);
plinth.position.y = -0.5; plinth.receiveShadow = true; plinth.castShadow = true;
const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.receiveShadow = true;
viewerRoot.add(plinth, shadowFloor);
let skybox = null;

/* ---------- the sheet ---------- */
const paperRoot = new THREE.Group();          // moves the model into the viewer
const paper = new THREE.Group();              // scaled so one model unit = the sheet's width
paperRoot.add(paper);
scene.add(paperRoot);

const frontMat = new THREE.MeshPhysicalMaterial({ roughness: 0.75, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff), side: THREE.FrontSide });
const backMat = frontMat.clone();
const fibre = new THREE.CanvasTexture(fibreCanvas());
fibre.wrapS = fibre.wrapT = THREE.RepeatWrapping;
for (const m of [frontMat, backMat]) { m.bumpMap = fibre; m.bumpScale = 0.4; }
const front = new THREE.Mesh(new THREE.BufferGeometry(), frontMat);
const back = new THREE.Mesh(new THREE.BufferGeometry(), backMat);
for (const m of [front, back]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; paper.add(m); }

// hint glow over the part that moves, and the fold lines
const glowMat = new THREE.MeshBasicMaterial({ color: 0xf2a541, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const glow = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
glow.frustumCulled = false; glow.renderOrder = 2;
paper.add(glow);
const lineGroup = new THREE.Group();
paper.add(lineGroup);

let design, built, sheetM, T = 0.0005, sideBase = { front: null, back: null }, creaseCount = -1;

function sizeOf() {
  return design.shape === 'rect' ? SIZES.rect.find(s => s.id === state.sizeRect) : SIZES.square.find(s => s.id === state.sizeSquare);
}
function weightOf() { return WEIGHTS.find(w => w.id === state.weight); }

function rebuild(keepStep = false) {
  design = DESIGNS.find(d => d.id === state.design);
  const size = sizeOf();
  built = build(design, { aspect: size.h / size.w });
  sheetM = { w: 1, h: size.h / size.w };
  if (!keepStep) { state.step = 0; state.t = 0; state.hold = 0; }
  state.step = Math.min(state.step, built.anims.length);
  topo.clear();
  restyle();
  renderAll();
}

// paper colours and patterns, then the creases each state has
function restyle() {
  const size = sizeOf(), w = weightOf();
  paper.scale.setScalar(size.w);
  T = (w.mm / 1000) * THICK / size.w;
  const pat = PATTERNS.find(p => p.id === state.pattern);
  const col = colorHex(state.color);
  const colored = drawSide(state.pattern, col, size.w, size.h);
  const plain = state.back === 'same' ? colored : state.back === 'second' ? drawSide('solid', colorHex(state.color2), size.w, size.h, 1024) : drawSide('solid', '#f6f4ee', size.w, size.h, 1024);
  // which engine side carries the colour depends on how the design starts
  if (design.colorSide === 'back') { sideBase.front = plain; sideBase.back = colored; } else { sideBase.front = colored; sideBase.back = plain; }
  const metalFront = pat.metal && sideBase.front === colored, metalBack = pat.metal && sideBase.back === colored;
  for (const [m, metal] of [[frontMat, metalFront], [backMat, metalBack]]) {
    m.metalness = metal ? 0.85 : 0;
    m.roughness = metal ? 0.32 : w.rough;
    m.sheen = metal ? 0 : 0.25;
    m.bumpScale = state.weight === 'washi' ? 0.9 : 0.4;
    m.needsUpdate = true;
  }
  fibre.repeat.set(size.w / 0.1, size.h / 0.1);
  creaseCount = -1;
  dirty = true;
}
function updateCreases(S) {
  if (S.creases.length === creaseCount) return;
  creaseCount = S.creases.length;
  const size = sizeOf(), strength = weightOf().crease;
  const sheet = { w: 1, h: size.h / size.w };
  for (const [m, base, isBack] of [[frontMat, sideBase.front, false], [backMat, sideBase.back, true]]) {
    const c = withCreases(base, S.creases, sheet, strength, isBack);
    if (m.map) m.map.dispose();
    m.map = new THREE.CanvasTexture(c);
    m.map.colorSpace = THREE.SRGBColorSpace;
    m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    m.needsUpdate = true;
  }
}

/* ---------- turning facets into triangles ---------- */
// each facet is a convex polygon in paper coordinates: a fan from its centre, split finer so
// a flap can curl as it moves
const topo = new Map();
function topology(id, poly) {
  let t = topo.get(id);
  if (t) return t;
  const c = centroid(poly), n = poly.length;
  let maxE = 0;
  for (let i = 0; i < n; i++) maxE = Math.max(maxE, Math.hypot(poly[i][0] - c[0], poly[i][1] - c[1]));
  const k = Math.max(1, Math.min(6, Math.ceil(maxE / 0.07)));
  const pts = [], tris = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const base = pts.length, idx = (r, s) => base + (r * (r + 1)) / 2 + s;   // r rings from the centre
    for (let r = 0; r <= k; r++) for (let s = 0; s <= r; s++) {
      const u = r / k, v = r ? s / r : 0;
      pts.push([c[0] + (a[0] - c[0]) * u * (1 - v) + (b[0] - c[0]) * u * v, c[1] + (a[1] - c[1]) * u * (1 - v) + (b[1] - c[1]) * u * v]);
    }
    for (let r = 0; r < k; r++) for (let s = 0; s <= r; s++) {
      tris.push(idx(r, s), idx(r + 1, s), idx(r + 1, s + 1));
      if (s < r) tris.push(idx(r, s), idx(r + 1, s + 1), idx(r, s + 1));
    }
  }
  // make sure each triangle winds counter-clockwise in paper space (front side faces +z)
  for (let i = 0; i < tris.length; i += 3) {
    const p = pts[tris[i]], q = pts[tris[i + 1]], r = pts[tris[i + 2]];
    if ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) < 0) { const x = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = x; }
  }
  t = { pts, tris };
  topo.set(id, t);
  return t;
}

// what to draw now: a list of pieces, each a facet with a function giving where its points are
function pieces() {
  const n = built.anims.length;
  const at = state.viewer ? n : state.step;
  const t = state.viewer ? 0 : state.t;
  const curl = weightOf().curl;
  if (t > 0 && at < n) {
    let A = built.anims[at], tt = t;
    if (A.type === 'reverse') { A = A.of; tt = 1 - t; }
    const pr = A.present && !A.from ? A.present : built.states[at].present;
    const pa = A.present && !A.from ? ease(tt) : 1;
    return {
      list: A.items.map(it => ({ id: it.f.id, poly: it.f.poly, item: it, pos: q => presentPos(pr, animPos(A, it, q, tt, T, curl, 0.7), pa) })),
      anim: A, tt,
    };
  }
  const S = built.states[t >= 1 ? at + 1 : at];
  const pm = poseMapOf(S);
  // flat models stand up in the viewer
  let pr = S.present;
  if (!pr && state.viewer && design.display) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of S.facets) for (const [x, y] of modelPoly(f)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    pr = { o: [(x0 + x1) / 2, 0, -(y0 + y1) / 2], k: design.display.axis, angle: design.display.angle };
  }
  return { list: S.facets.map(f => ({ id: f.id, poly: f.poly, facet: f, pos: q => presentPos(pr, restPos(S, f, q, T, pm)) })), S };
}

let triOwner = [];        // which piece each triangle belongs to, for picking
let current = null;       // the pieces last drawn
let lift = 0;
function renderAll() {
  const P = pieces();
  current = P;
  const S = P.S || built.states[state.viewer ? built.anims.length : state.step];
  updateCreases(S);
  let nv = 0, ni = 0;
  for (const pc of P.list) { const tp = topology(pc.id, pc.poly); nv += tp.pts.length; ni += tp.tris.length; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni), idxB = new Uint32Array(ni);
  triOwner = new Array(ni / 3);
  let v = 0, f = 0, minY = Infinity;
  const w = sheetM.w, h = sheetM.h;
  P.list.forEach((pc, pi) => {
    const tp = topology(pc.id, pc.poly), base = v;
    for (const q of tp.pts) {
      const p = pc.pos(q);
      pos[v * 3] = p[0]; pos[v * 3 + 1] = p[1]; pos[v * 3 + 2] = p[2];
      if (p[1] < minY) minY = p[1];
      uv[v * 2] = (q[0] + w / 2) / w; uv[v * 2 + 1] = (q[1] + h / 2) / h;
      v++;
    }
    for (let i = 0; i < tp.tris.length; i += 3) {
      idx[f] = base + tp.tris[i]; idx[f + 1] = base + tp.tris[i + 1]; idx[f + 2] = base + tp.tris[i + 2];
      idxB[f] = base + tp.tris[i]; idxB[f + 1] = base + tp.tris[i + 2]; idxB[f + 2] = base + tp.tris[i + 1];
      triOwner[f / 3] = pi;
      f += 3;
    }
  });
  // nothing goes through the table: lift the whole sheet if any of it would
  lift = Math.max(0, T / 2 - minY);
  // normals from the front faces, then push each face out by half the thickness
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g0.setIndex(new THREE.BufferAttribute(idx, 1));
  g0.computeVertexNormals();
  const nrm = g0.attributes.normal.array;
  const pf = new Float32Array(nv * 3), pb = new Float32Array(nv * 3), nb = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) {
    const o = (i % 3 === 1 ? lift : 0);
    pf[i] = pos[i] + nrm[i] * T * 0.5 + o;
    pb[i] = pos[i] - nrm[i] * T * 0.5 + o;
    nb[i] = -nrm[i];
  }
  setGeo(front.geometry, pf, nrm, uv, idx);
  setGeo(back.geometry, pb, nb, uv, idxB);
  buildGlow(P, pf, idx);
  buildLines(P);
  dirty = true;
}
function setGeo(g, p, n, uv, idx) {
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
}

// the moving part of the next step, for hints
function movingPaperPoints() {
  if (state.viewer || state.step >= built.anims.length) return null;
  let A = built.anims[state.step];
  if (A.type === 'reverse') A = A.of;
  return A;
}
function insidePoly(poly, q) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    if (Math.abs(c) < 1e-12) continue;
    if (!s) s = Math.sign(c); else if (Math.sign(c) !== s) return false;
  }
  return true;
}
function isMoving(A, q, reverse) {
  const it = A.items.find(x => insidePoly(x.f.poly, q));
  if (!it) return false;
  return it.g >= 0;
}
function buildGlow(P, pf, idx) {
  glow.visible = false;
  if (state.mode !== 'fold' || state.t > 0 || !P.S) return;
  const A = movingPaperPoints();
  if (!A) return;
  const reverse = built.anims[state.step].type === 'reverse';
  // a triangle glows when its centre is on the moving part
  const keep = [];
  const pts = [];
  P.list.forEach(pc => { const tp = topology(pc.id, pc.poly); for (const q of tp.pts) pts.push(q); });
  for (let i = 0; i < idx.length; i += 3) {
    const a = pts[idx[i]], b = pts[idx[i + 1]], c = pts[idx[i + 2]];
    const q = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (isMoving(reverse ? A : A, q, reverse)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!keep.length || A.type === 'rigid' || A.type === 'custom') return;
  const g = glow.geometry;
  g.setAttribute('position', new THREE.BufferAttribute(pf, 3));
  g.setIndex(keep);
  g.computeBoundingSphere();
  glow.visible = true;
}

// dashed fold lines for the step about to happen
function buildLines(P) {
  for (const c of [...lineGroup.children]) { c.geometry.dispose(); lineGroup.remove(c); }
  if (!state.lines || state.viewer || state.step >= built.anims.length || state.t > 0.35) return;
  if (state.mode === 'watch' && state.t === 0 && state.hold === 0 && !state.playing) { /* still show when paused */ }
  let A = built.anims[state.step];
  const reverse = A.type === 'reverse';
  if (reverse) return;
  if (A.type !== 'fold') return;
  const seen = new Set();
  const S = built.states[state.step];
  const polys = S.facets.map(modelPoly);
  let top = 0;
  for (const f of S.facets) top = Math.max(top, f.level + 1);
  for (const it of A.items) {
    if (it.g < 0 || !it.hinges) continue;
    const hg = it.hinges[0];
    const L = hg.L;
    const k = `${L.p[0].toFixed(4)},${L.p[1].toFixed(4)},${L.u[0].toFixed(4)},${L.u[1].toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // the stretch of the line that crosses paper
    let lo = Infinity, hi = -Infinity;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const sa = (a[0] - L.p[0]) * L.n[0] + (a[1] - L.p[1]) * L.n[1], sb = (b[0] - L.p[0]) * L.n[0] + (b[1] - L.p[1]) * L.n[1];
        const pts = [];
        if (Math.abs(sa) < 1e-9) pts.push(a);
        if (sa * sb < 0) { const t = sa / (sa - sb); pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        for (const p of pts) { const s = (p[0] - L.p[0]) * L.u[0] + (p[1] - L.p[1]) * L.u[1]; lo = Math.min(lo, s); hi = Math.max(hi, s); }
      }
    }
    if (!(hi > lo)) continue;
    const y = (top + 0.6) * T + lift;
    const a = [L.p[0] + L.u[0] * lo, y, -(L.p[1] + L.u[1] * lo)], b = [L.p[0] + L.u[0] * hi, y, -(L.p[1] + L.u[1] * hi)];
    const valley = hg.angle > 0;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    const m = new THREE.LineDashedMaterial({ color: valley ? 0xf2a541 : 0x7fb4ff, dashSize: valley ? 0.022 : 0.008, gapSize: valley ? 0.014 : 0.012, transparent: true, opacity: 0.95, depthTest: false });
    const ln = new THREE.Line(g, m);
    ln.computeLineDistances();
    ln.renderOrder = 3;
    lineGroup.add(ln);
  }
}

/* ---------- camera ---------- */
const VIEWS = {
  front: (c, s) => new THREE.Vector3(0, 0.95, 0.95).normalize().multiplyScalar(s).add(c),
  top: (c, s) => new THREE.Vector3(0, 1, 0.02).normalize().multiplyScalar(s).add(c),
  side: (c, s) => new THREE.Vector3(-0.9, 0.6, 0.45).normalize().multiplyScalar(s).add(c),
  low: (c, s) => new THREE.Vector3(0.55, 0.32, 0.9).normalize().multiplyScalar(s).add(c),
};
let camAnim = null, zoom = 1;
const frameBox = new THREE.Box3();
function modelFrame() {
  paperRoot.updateMatrixWorld(true);
  frameBox.setFromObject(front, true);
  if (frameBox.isEmpty()) frameBox.set(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.02, 0.1));
  const c = frameBox.getCenter(new THREE.Vector3());
  const size = frameBox.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, size.y * 1.3, 0.05);
  // aim a little in front of (or below) the model so it sits above the card at the bottom
  if (!state.viewer) c.z += span * 0.22;
  else c.y -= span * 0.3;
  return { c, span };
}
function viewDistance(span) {
  const fit = Math.max(1, 1.2 / camera.aspect);
  return span * (state.viewer ? 2.3 : 2.9) * fit * zoom;
}
function setView(name, instant = false) {
  const { c, span } = modelFrame();
  const sheetSpan = sizeOf().w * Math.max(1, sheetM.h);
  const d = viewDistance(Math.max(span, sheetSpan * (state.viewer ? 0.5 : 0.75)));
  const to = VIEWS[name](c, d);
  state.view = name;
  if (instant) { camera.position.copy(to); controls.target.copy(c); controls.update(); return; }
  camAnim = { t: 0, p0: camera.position.clone(), p1: to, c0: controls.target.clone(), c1: c };
}
// the camera drifts with the paper as it moves across the table
const followAt = new THREE.Vector3();
let followReady = false;
function follow() {
  if (!state.follow || camAnim) return;
  const { c } = modelFrame();
  if (!followReady) { followAt.copy(c); followReady = true; return; }
  const d = c.clone().sub(followAt).multiplyScalar(0.06);
  followAt.add(d); camera.position.add(d); controls.target.add(d);
}
function setZoom(z) {
  zoom = z;
  const dir = camera.position.clone().sub(controls.target);
  const { span } = modelFrame();
  const sheetSpan = sizeOf().w * Math.max(1, sheetM.h);
  dir.setLength(viewDistance(Math.max(span, sheetSpan * (state.viewer ? 0.5 : 0.75))));
  camera.position.copy(controls.target).add(dir);
}

/* ---------- the viewer ---------- */
async function applyEnv() {
  const env = ENVS.find(e => e.id === state.env);
  const id = state.viewer ? state.env : 'studio';
  const r = await loadEnv(id);
  if (!r) return;
  if ((state.viewer ? state.env : 'studio') !== id) return;
  scene.environment = r.env;
  if (skybox) { viewerRoot.remove(skybox); skybox.geometry.dispose(); skybox = null; }
  if (state.viewer) {
    scene.environmentIntensity = 0.55 * env.light;
    key.intensity = 2.4 * env.light;
    if (state.display === 'floor') {
      skybox = new GroundedSkybox(r.hdr, 1.6, 12);
      skybox.material.color.setScalar(0.55 * env.light);   // the photo is HDR: tone it to match the backdrop
      skybox.position.y = 1.6 - 0.001;
      viewerRoot.add(skybox);
      scene.background = null;
    } else {
      scene.background = r.hdr;
      scene.backgroundBlurriness = state.blur;
      scene.backgroundIntensity = 0.55 * env.light;
    }
  } else {
    scene.environmentIntensity = 0.5;
    key.intensity = 3.6;
    scene.background = r.hdr;
    scene.backgroundBlurriness = 0.35;
    scene.backgroundIntensity = 0.12;
  }
  dirty = true;
}
function placeForViewer() {
  if (!state.viewer) { paperRoot.position.set(0, 0, 0); paperRoot.rotation.set(0, 0, 0); return; }
  // stand the finished piece in the middle of the stand
  paperRoot.position.set(0, 0, 0);
  paperRoot.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(front, true);
  const c = b.getCenter(new THREE.Vector3());
  paperRoot.position.set(-c.x, -b.min.y + (state.display === 'float' ? 0.06 : 0), -c.z);
  plinth.visible = state.display === 'plinth';
  shadowFloor.visible = state.display !== 'plinth';
  shadowFloor.position.y = state.display === 'float' ? -0.001 : 0.0005;
}
function enterViewer(on) {
  state.viewer = on;
  document.body.classList.toggle('is-viewer', on);
  surfaces.root.visible = !on;
  viewerRoot.visible = on;
  state.playing = false;
  renderAll();
  placeForViewer();
  applyEnv();
  controls.autoRotate = on ? false : state.orbit;
  spin = 0;
  setView(on ? 'low' : 'front', true);
  renderUi();
}

/* ---------- saved pieces ---------- */
const savedKey = 'pieces';
function readPieces() { try { return JSON.parse(store.get(savedKey)) || []; } catch { return []; } }
function writePieces(list) { return store.set(savedKey, JSON.stringify(list)); }
function snapshot(w = 320, h = 220) {
  render();
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const src = renderer.domElement, sw = src.width, sh = src.height;
  // the middle of the frame, where the piece is
  const scale = Math.max(w / sw, h / sh) / 0.6, cw = w / scale, ch = h / scale;
  c.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.78);
}
function paperSettings() {
  return { pattern: state.pattern, color: state.color, back: state.back, color2: state.color2, weight: state.weight, sizeSquare: state.sizeSquare, sizeRect: state.sizeRect };
}
function describePaper(p = paperSettings(), d = design) {
  const pat = PATTERNS.find(x => x.id === p.pattern);
  const col = COLORS.find(x => x.id === p.color);
  const size = d.shape === 'rect' ? SIZES.rect.find(s => s.id === p.sizeRect) : SIZES.square.find(s => s.id === p.sizeSquare);
  const wt = WEIGHTS.find(w => w.id === p.weight);
  const look = pat.usesColor ? (pat.id === 'solid' ? col.name : `${col.name.toLowerCase()} ${pat.name.toLowerCase()}`) : pat.name;
  return `${look[0].toUpperCase()}${look.slice(1)}, ${size.name} ${wt.name.toLowerCase()}`;
}
function savePiece(name) {
  const list = readPieces();
  const piece = {
    id: Date.now().toString(36), name: name || `${design.name} ${list.filter(p => p.design === design.id).length + 1}`,
    design: design.id, paper: paperSettings(), env: state.env, display: state.display, savedAt: new Date().toISOString(),
    thumb: snapshot(),
  };
  list.unshift(piece);
  if (!writePieces(list)) { toast('Could not save: this browser is out of storage space.'); return null; }
  toast(`Saved ${piece.name}.`);
  renderSaved();
  return piece;
}
function openPiece(p) {
  Object.assign(state, p.paper, { design: p.design, env: p.env || state.env, display: p.display || state.display });
  state.openPiece = p.id;
  rebuild();
  state.step = built.anims.length; state.t = 0;
  buildOptions();
  renderLibrary();
  enterViewer(true);
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
const ui = {
  list: $('design-list'), about: $('about'), saved: $('saved-list'), stepCount: $('step-count'), stepTime: $('step-time'),
  stepTitle: $('step-title'), stepText: $('step-text'), steps: $('steps'), play: $('play'), playIcon: $('play-icon'),
  speeds: $('speeds'), feedback: $('feedback'),
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderLibrary() {
  ui.list.innerHTML = '';
  for (const d of DESIGNS) {
    const b = document.createElement('button');
    b.className = 'item m-menu__item m-menu__item--plain';
    b.setAttribute('aria-pressed', String(d.id === state.design));
    const n = d.steps({ aspect: Math.SQRT2 }).length;
    b.innerHTML = `<span class="item__name">${esc(d.name)}</span><span class="item__sum">${esc(d.summary)}</span><span class="item__meta">${d.level} · ${n} steps</span>`;
    b.addEventListener('click', () => { if (d.id === state.design && !state.viewer) return; state.design = d.id; store.set('design', d.id); if (state.viewer) enterViewer(false); rebuild(); buildOptions(); renderLibrary(); setView('front'); renderUi(); closeDrawers(); });
    ui.list.appendChild(b);
  }
  ui.about.innerHTML = `<div class="about__name">${esc(design.name)}</div>${design.about.map(p => `<p>${esc(p)}</p>`).join('')}`;
}
function renderSaved() {
  const list = readPieces();
  ui.saved.innerHTML = list.length ? '' : '<p class="empty">Nothing saved yet. Finish a model and save it from the viewer, and it will appear here.</p>';
  for (const p of list) {
    const d = DESIGNS.find(x => x.id === p.design);
    if (!d) continue;
    const row = document.createElement('div');
    row.className = 'piece';
    row.innerHTML = `<button class="piece__open m-menu__item m-menu__item--plain" aria-label="Open ${esc(p.name)} in the viewer"><img src="${p.thumb}" alt=""><span><b>${esc(p.name)}</b><small>${esc(describePaper(p.paper, d))}</small><small>${new Date(p.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span></button><button class="piece__del m-key m-key--quiet" aria-label="Delete ${esc(p.name)}" title="Delete">×</button>`;
    row.querySelector('.piece__open').addEventListener('click', () => { openPiece(p); closeDrawers(); });
    row.querySelector('.piece__del').addEventListener('click', () => {
      if (!confirm(`Delete ${p.name}?`)) return;
      writePieces(readPieces().filter(x => x.id !== p.id));
      renderSaved();
    });
    ui.saved.appendChild(row);
  }
  $('saved-count').textContent = list.length ? String(list.length) : '';
}

function seg(el, items, get, set) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.name;
    b.setAttribute('aria-pressed', String(get() === it.id));
    b.addEventListener('click', () => { set(it.id); for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); });
    el.appendChild(b);
  }
}

function buildOptions() {
  // patterns
  const pats = $('patterns');
  pats.innerHTML = '';
  for (const p of PATTERNS) {
    const b = document.createElement('button');
    b.className = 'pat';
    b.title = p.name;
    b.setAttribute('aria-label', p.name);
    b.setAttribute('aria-pressed', String(p.id === state.pattern));
    b.appendChild(swatch(p.id, colorHex(state.color), 22));
    b.addEventListener('click', () => { state.pattern = p.id; store.set('pattern', p.id); restyle(); buildOptions(); });
    pats.appendChild(b);
  }
  $('pattern-name').textContent = PATTERNS.find(p => p.id === state.pattern).name;
  const usesColor = PATTERNS.find(p => p.id === state.pattern).usesColor;
  $('colors-wrap').classList.toggle('is-dim', !usesColor);
  swatches($('colors'), () => state.color, c => { state.color = c; store.set('color', c); restyle(); buildOptions(); });
  seg($('back'), [{ id: 'white', name: 'White' }, { id: 'same', name: 'Same' }, { id: 'second', name: 'Second colour' }], () => state.back, v => { state.back = v; store.set('back', v); restyle(); $('color2-wrap').hidden = v !== 'second'; });
  $('color2-wrap').hidden = state.back !== 'second';
  swatches($('colors2'), () => state.color2, c => { state.color2 = c; store.set('color2', c); restyle(); });
  const sizes = design.shape === 'rect' ? SIZES.rect : SIZES.square;
  const sizeKey = design.shape === 'rect' ? 'sizeRect' : 'sizeSquare';
  seg($('sizes'), sizes, () => state[sizeKey], v => { state[sizeKey] = v; store.set(sizeKey, v); rebuild(true); setView(state.view || 'front'); });
  $('size-note').textContent = design.shape === 'rect' ? 'This design needs a rectangle.' : 'Square origami paper.';
  const wl = $('weights');
  wl.innerHTML = '';
  for (const w of WEIGHTS) {
    const b = document.createElement('button');
    b.className = 'row m-menu__item m-menu__item--plain';
    b.setAttribute('aria-pressed', String(w.id === state.weight));
    b.innerHTML = `<b>${w.name} <span>${w.gsm} gsm</span></b><small>${w.note}</small>`;
    b.addEventListener('click', () => { state.weight = w.id; store.set('weight', w.id); restyle(); renderAll(); buildOptions(); });
    wl.appendChild(b);
  }
  const sl = $('surfaces');
  sl.innerHTML = '';
  for (const s of SURFACES) {
    const b = document.createElement('button');
    b.className = 'row row--swatch m-menu__item m-menu__item--plain';
    b.setAttribute('aria-pressed', String(s.id === state.surface));
    b.appendChild(surfaces.swatch(s.id));
    const t = document.createElement('span');
    t.innerHTML = `<b>${s.name}</b><small>${s.note}</small>`;
    b.appendChild(t);
    b.addEventListener('click', () => { state.surface = s.id; store.set('surface', s.id); surfaces.set(s.id); dirty = true; buildOptions(); });
    sl.appendChild(b);
  }
  // viewer
  const el = $('envs');
  el.innerHTML = '';
  for (const e of ENVS) {
    const b = document.createElement('button');
    b.className = 'chip m-key';
    b.textContent = e.name;
    b.setAttribute('aria-pressed', String(e.id === state.env));
    b.addEventListener('click', () => { state.env = e.id; store.set('env', e.id); applyEnv(); for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); });
    el.appendChild(b);
  }
  seg($('displays'), DISPLAYS, () => state.display, v => { state.display = v; store.set('display', v); placeForViewer(); applyEnv(); setView(state.view || 'low'); });
}
function swatches(el, get, set) {
  el.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch m-dot';
    b.style.background = c.hex;
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.setAttribute('aria-pressed', String(get() === c.id));
    b.addEventListener('click', () => { set(c.id); for (const x of el.children) x.setAttribute('aria-pressed', String(x === b)); });
    el.appendChild(b);
  }
}

function buildStatic() {
  for (const s of SPEEDS) {
    const b = document.createElement('button');
    b.textContent = `${s}×`;
    b.dataset.speed = s;
    b.addEventListener('click', () => { state.speed = s; store.set('speed', s); renderUi(); });
    ui.speeds.appendChild(b);
  }
  for (const v of document.querySelectorAll('[data-view]')) v.addEventListener('click', () => setView(v.dataset.view));
  for (const z of document.querySelectorAll('.zoom')) {
    z.addEventListener('input', () => setZoom(+z.value));
  }
  const tog = (id, k, fn) => { const el = $(id); el.checked = state[k]; el.addEventListener('change', () => { state[k] = el.checked; store.set(k, el.checked ? '1' : '0'); fn?.(); dirty = true; }); };
  tog('follow', 'follow');
  tog('lines', 'lines', () => renderAll());
  tog('orbit', 'orbit', () => { controls.autoRotate = state.orbit && !state.viewer; });
  tog('show-ao', 'ao');
  tog('turntable', 'turntable');
  const blur = $('blur');
  blur.value = state.blur;
  blur.addEventListener('input', () => { state.blur = +blur.value; store.set('blur', blur.value); scene.backgroundBlurriness = state.blur; dirty = true; });
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
  $('restart').addEventListener('click', () => goStep(0));
  $('prev').addEventListener('click', () => goStep(state.t > 0 ? state.step : state.step - 1));
  $('next').addEventListener('click', () => goStep(state.step + 1));
  ui.play.addEventListener('click', togglePlay);
  $('hint').addEventListener('click', () => { state.hintLevel = Math.min(2, state.hintLevel + 1); renderUi(); });
  $('showme').addEventListener('click', () => { if (state.step < built.anims.length && !drag) settle = { to: 1, auto: true }; });
  $('undo').addEventListener('click', () => { if (state.step > 0 && !drag) { goStep(state.step - 1); } });
  $('view-finished').addEventListener('click', () => enterViewer(true));
  $('fold-again').addEventListener('click', () => goStep(0));
  $('back-to-folding').addEventListener('click', () => enterViewer(false));
  $('save-form').addEventListener('submit', e => {
    e.preventDefault();
    const p = savePiece($('save-name').value.trim());
    if (p) { state.openPiece = p.id; $('save-name').value = ''; renderUi(); }
  });
  for (const t of document.querySelectorAll('[data-tab]')) t.addEventListener('click', () => {
    for (const x of document.querySelectorAll('[data-tab]')) x.setAttribute('aria-selected', String(x === t));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== t.dataset.tab;
  });
  for (const b of document.querySelectorAll('.drawer-toggle')) {
    b.addEventListener('click', () => {
      const el = $(b.dataset.drawer), open = !el.classList.contains('is-open');
      closeDrawers();
      el.classList.toggle('is-open', open);
      b.setAttribute('aria-expanded', String(open));
    });
  }
}
function closeDrawers() {
  for (const el of document.querySelectorAll('.library, .options')) el.classList.remove('is-open');
  for (const b of document.querySelectorAll('.drawer-toggle')) b.setAttribute('aria-expanded', 'false');
}

function setMode(m) {
  state.mode = m;
  if (state.viewer) enterViewer(false);
  state.playing = false;
  state.hintLevel = 0; state.idle = 0;
  if (state.t > 0 && state.t < 1) state.t = 0;
  renderAll();
  renderUi();
}
function goStep(i) {
  const n = built.anims.length;
  state.step = Math.max(0, Math.min(n, i));
  state.t = 0; state.hold = 0; settle = null;
  state.hintLevel = 0; state.idle = 0;
  if (state.step >= n) state.playing = false;
  renderAll(); renderUi();
}
function togglePlay() {
  if (state.mode !== 'watch') return;
  if (state.step >= built.anims.length) { goStep(0); state.playing = true; renderUi(); return; }
  state.playing = !state.playing;
  renderUi();
}
const dur = i => BASE_DUR * (built.steps[i]?.dur ? built.steps[i].dur / 1.5 : built.steps[i]?.type === 'unfold' ? 0.8 : 1);

function renderUi() {
  const n = built.anims.length, done = state.step >= n && !state.viewer;
  document.body.classList.toggle('is-fold', state.mode === 'fold');
  document.body.classList.toggle('is-done', done);
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode && !state.viewer));
  const i = Math.min(state.step, n - 1);
  const st = built.steps[i];
  if (done) {
    ui.stepCount.textContent = 'Finished';
    ui.stepTitle.textContent = `Your ${design.name.toLowerCase()} is done`;
    ui.stepText.textContent = 'Look at it in the viewer, with a choice of rooms to set it in, and save it there to keep it.';
  } else {
    ui.stepCount.textContent = `Step ${state.step + 1} of ${n}`;
    ui.stepTitle.textContent = st.title;
    ui.stepText.textContent = st.text;
  }
  let total = 0, upTo = 0;
  for (let k = 0; k < n; k++) { const d = dur(k); if (k < state.step) upTo += d; total += d; }
  upTo += dur(i) * (done ? 1 : state.t);
  ui.stepTime.textContent = state.mode === 'watch' ? `${fmt(upTo / state.speed)} / ${fmt(total / state.speed)}` : '';
  // progress
  if (ui.steps.children.length !== n) {
    ui.steps.innerHTML = '';
    for (let k = 0; k < n; k++) {
      const b = document.createElement('button');
      b.title = built.steps[k].title;
      b.setAttribute('aria-label', `Go to step ${k + 1}: ${built.steps[k].title}`);
      b.addEventListener('click', () => goStep(k));
      ui.steps.appendChild(b);
    }
  }
  [...ui.steps.children].forEach((b, k) => b.style.setProperty('--fill', k < state.step ? '100%' : k === state.step ? `${state.t * 100}%` : '0%'));
  const playing = state.playing && state.mode === 'watch';
  ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  ui.playIcon.innerHTML = playing ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11L13.5 8z"/>';
  $('prev').disabled = state.step === 0 && state.t === 0;
  $('next').disabled = done;
  for (const b of ui.speeds.children) b.setAttribute('aria-pressed', String(+b.dataset.speed === state.speed));
  // fold-it-yourself feedback
  if (state.mode === 'fold' && !done) {
    const A = built.anims[state.step];
    const how = A.type === 'rigid' ? (built.steps[state.step].type === 'flip' ? 'Drag the paper sideways to turn it over.' : 'Drag the paper round to turn it.')
      : A.type === 'reverse' ? 'Drag the flap back the way it came.'
        : A.type === 'custom' ? 'Drag a corner up toward the middle and the sheet will collapse along its creases.'
          : 'Grab the glowing part and drag it along the fold.';
    const hints = [how, `${how} The dashed lines are where it folds: amber dashes for a valley fold (toward you), blue dots for a mountain fold (away from you).`, `${how} Still stuck? Show me plays this step for you.`];
    ui.feedback.textContent = feedbackMsg || hints[state.hintLevel];
  } else ui.feedback.textContent = '';
  $('undo').disabled = state.step === 0;
  // viewer
  if (state.viewer) {
    const p = readPieces().find(x => x.id === state.openPiece);
    $('viewer-title').textContent = p ? p.name : design.name;
    $('viewer-sub').textContent = `${design.name} · ${describePaper()}`;
    $('save-name').placeholder = `${design.name} ${readPieces().filter(x => x.design === design.id).length + 1}`;
  }
  $('turntable').checked = state.turntable;
}
let feedbackMsg = '', feedbackTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---------- folding by hand ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null, settle = null;
function hitPaper(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([front, back], false);
  if (!hits.length) return null;
  const h = hits[0];
  const w = sheetM.w, hh = sheetM.h;
  return { q: [h.uv.x * w - w / 2, h.uv.y * hh - hh / 2], point: h.point };
}
// where paper point q is, in screen pixels, at each moment of the step
function trajectory(q) {
  const A0 = built.anims[state.step];
  const rev = A0.type === 'reverse', A = rev ? A0.of : A0;
  const it = A.items.find(x => insidePoly(x.f.poly, q));
  if (!it) return null;
  const pr = A.present && !A.from ? A.present : built.states[state.step].present;
  const curl = weightOf().curl;
  const pts = [];
  const v = new THREE.Vector3();
  const r = canvas.getBoundingClientRect();
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, tt = rev ? 1 - t : t;
    // lift for this moment: lowest corner of any facet
    let minY = Infinity;
    for (const x of A.items) for (const p of x.f.poly) { const y = presentPos(pr, animPos(A, x, p, tt, T, curl, 0.7), A.present && !A.from ? ease(tt) : 1)[1]; if (y < minY) minY = y; }
    const lf = Math.max(0, T / 2 - minY);
    const p = presentPos(pr, animPos(A, it, q, tt, T, curl, 0.7), A.present && !A.from ? ease(tt) : 1);
    v.set(p[0], p[1] + lf, p[2]);
    paper.localToWorld(v);
    v.project(camera);
    pts.push([(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]);
  }
  return { pts, moving: it.g >= 0 || A.type !== 'fold' };
}
function nearestT(traj, x, y, prev) {
  let best = prev, bd = Infinity;
  const P = traj.pts;
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[k], b = P[k + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const s = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    const px = a[0] + dx * s, py = a[1] + dy * s;
    // prefer staying near where the drag already is, so a looping path doesn't jump
    const t = (k + s) / (P.length - 1);
    const d = Math.hypot(x - px, y - py) + Math.abs(t - prev) * 60;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function onPointerDown(e) {
  if (state.mode !== 'fold' || state.viewer || e.button !== 0 || settle) return;
  if (state.step >= built.anims.length) return;
  const h = hitPaper(e);
  if (!h) return;
  const traj = trajectory(h.q);
  if (!traj) return;
  if (!traj.moving) {
    feedbackMsg = 'That part stays where it is. Grab the glowing part instead.';
    clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { feedbackMsg = ''; renderUi(); }, 2200);
    state.hintLevel = Math.max(state.hintLevel, 1);
    renderUi();
    return;
  }
  e.stopImmediatePropagation();
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, traj, q: h.q };
  canvas.style.cursor = 'grabbing';
  state.idle = 0;
}
canvas.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.id) {
    const r = canvas.getBoundingClientRect();
    state.t = nearestT(drag.traj, e.clientX - r.left, e.clientY - r.top, state.t);
    renderAll(); renderUi();
    return;
  }
  // a hand over anything that will move
  if (state.mode === 'fold' && !state.viewer && state.step < built.anims.length && !settle && e.pointerType === 'mouse') {
    const h = hitPaper(e);
    let over = false;
    if (h) {
      const A0 = built.anims[state.step], A = A0.type === 'reverse' ? A0.of : A0;
      over = A.type !== 'fold' || isMoving(A, h.q);
    }
    canvas.style.cursor = over ? 'grab' : '';
  }
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  controls.enabled = true;
  canvas.style.cursor = '';
  settle = { to: state.t > 0.45 ? 1 : 0 };
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------- keys ---------- */
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') goStep(state.step + 1);
  else if (e.key === 'ArrowLeft') goStep(state.t > 0 ? state.step : state.step - 1);
  else if (e.key === 'r' || e.key === 'R') goStep(0);
});

/* ---------- loop ---------- */
let dirty = true, last = performance.now(), spin = 0, bob = 0;
function render() {
  gtao.enabled = state.ao;
  composer.render();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  gtao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
addEventListener('resize', resize);

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const n = built.anims.length;
  let changed = false;
  if (!state.viewer && state.mode === 'watch' && state.playing && state.step < n) {
    if (state.hold > 0) { state.hold -= dt * state.speed; if (state.hold <= 0) { state.hold = 0; state.step++; state.t = 0; if (state.step >= n) state.playing = false; } }
    else {
      state.t = Math.min(1, state.t + dt * state.speed / dur(state.step));
      if (state.t >= 1) { state.t = 1; state.hold = HOLD; }
    }
    changed = true;
  }
  if (settle) {
    const sp = dt * state.speed / (dur(state.step) * (settle.auto ? 1 : 0.45));
    state.t = settle.to > state.t ? Math.min(1, state.t + sp) : Math.max(0, state.t - sp);
    if (state.t === settle.to) {
      if (settle.to === 1) { state.step++; state.t = 0; state.hintLevel = 0; state.idle = 0; if (state.step >= n) toast(`${design.name} finished.`); }
      settle = null;
    }
    changed = true;
  }
  // nudge the glow brighter after a while with no progress
  if (state.mode === 'fold' && !state.viewer && state.step < n && !drag) {
    state.idle += dt;
    const pulse = 0.5 + 0.5 * Math.sin(now / 380);
    const base = state.hintLevel > 0 || state.idle > 4 ? 0.28 : 0.12;
    if (glow.visible) { glowMat.opacity = base * (0.5 + pulse * 0.5); dirty = true; }
  }
  if (changed) { renderAll(); renderUi(); }
  if (state.t >= 1 && state.hold > 0 && changed) renderUi();
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt * 1.6);
    const k = ease(camAnim.t);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, k);
    controls.target.lerpVectors(camAnim.c0, camAnim.c1, k);
    if (camAnim.t >= 1) camAnim = null;
    dirty = true;
  } else if (!state.viewer && changed) follow();
  if (state.viewer) {
    if (state.turntable) { spin += dt * 0.35; paperRoot.rotation.y = spin; dirty = true; }
    if (state.display === 'float') { bob += dt; paper.position.y = Math.sin(bob * 1.3) * 0.006; dirty = true; } else paper.position.y = 0;
  } else { paperRoot.rotation.y = 0; paper.position.y = 0; }
  if (controls.update()) dirty = true;
  if (controls.autoRotate) dirty = true;
  if (dirty) {
    key.target.position.copy(controls.target);
    key.position.copy(controls.target).add(new THREE.Vector3(-1.14, 0.95, 0.69));
    render();
    dirty = false;
  }
  requestAnimationFrame(frame);
}

/* ---------- start ---------- */
surfaces.set(state.surface);
rebuild();
if (Number.isFinite(+url.get('step'))) { state.step = Math.max(0, Math.min(built.anims.length, Math.round(+url.get('step')))); state.t = Math.min(0.999, Math.max(0, +url.get('t') || 0)); }
buildStatic();
buildOptions();
renderLibrary();
renderSaved();
resize();
renderAll();
setView(url.get('cam') || 'front', true);
applyEnv();
if (state.viewer) enterViewer(true);
renderUi();
controls.addEventListener('change', () => { dirty = true; });
requestAnimationFrame(frame);
window.__fold = { state, get built() { return built; }, goStep, enterViewer, setView, renderAll, setMode, savePiece, camera, paper, THREE };
