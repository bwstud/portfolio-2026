/* Chain Reaction: a Rube Goldberg machine in an empty concrete room.
   params.js holds every setting, sim.js runs the machine start to finish ("bakes" it),
   build.js and fx.js draw it, and this file plays the bake back and handles the UI. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCHEMA, SECTIONS, DEFAULTS, DEFAULT_LAYOUT, clone } from './params.js';
import { bake, FPS, MIST_FPS, trailPath } from './sim.js';
import { jumpProfile, toWorld, toLocal, operatorPlacement } from './geom.js';
import * as B from './build.js';
import { Burst, Mist, Decals, Beam } from './fx.js';
import { Sound } from './audio.js';

const $ = s => document.querySelector(s);
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const WORK_KEY = 'chain-reaction:working', VERSIONS_KEY = 'chain-reaction:versions';
const HOME = { pos: new THREE.Vector3(-8.7, 3.9, 3.6), target: new THREE.Vector3(-0.6, 0.35, -0.9) };

/* ---------- state ---------- */
const PARAMS = { ...DEFAULTS };
let LAYOUT = clone(DEFAULT_LAYOUT);
function mergeLayout(l) {
  const out = clone(DEFAULT_LAYOUT);
  if (!l || typeof l !== 'object') return out;
  for (const k of Object.keys(out)) {
    if (k === 'trail') { if (Array.isArray(l.trail)) out.trail = out.trail.map((p, i) => ({ ...p, ...(l.trail[i] || {}) })); }
    else if (l[k]) Object.assign(out[k], l[k]);
  }
  return out;
}
const pickParams = p => Object.fromEntries(Object.entries(p || {}).filter(([k, v]) => k in DEFAULTS && typeof v === typeof DEFAULTS[k]));
const working = store.get(WORK_KEY);
if (working) { Object.assign(PARAMS, pickParams(working.params)); LAYOUT = mergeLayout(working.layout); }

let run = null;            // the current bake
let T = 0;                 // playback time, seconds
let playing = false, rate = 1, baseRate = 1;
let selected = null;       // element id: jump | operator | pad | cube | laser | pile | trail | trail:0..2 | whale
let section = 'skier';
let tMode = 'translate';
let flying = false;
let currentVersion = null;

/* ---------- renderer, scene, camera ---------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101011);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(PARAMS.fov, 1, 0.02, 80);
camera.position.copy(HOME.pos);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.minDistance = 0.05; controls.maxDistance = 40;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
if (working?.camera) { camera.position.fromArray(working.camera.position); controls.target.fromArray(working.camera.target); }
controls.update();

const hemi = new THREE.HemisphereLight(0xe8eef5, 0x4a463f, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e2, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.012; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xdce6ff, 0.55);
scene.add(fill, fill.target);
const pileLight = new THREE.PointLight(0xff8a3a, 0, 3, 2);
const frontLight = new THREE.PointLight(0xff7a2a, 0, 1.6, 2);
const blastLight = new THREE.PointLight(0xffb060, 0, 30, 1.6);
scene.add(pileLight, frontLight, blastLight);

/* ---------- the things in the room ---------- */
const W = {};   // built objects
const fx = {
  trailFire: new Burst(scene, { kind: 'fire', drag: 2, acc: [0, 0.6, 0], gain: 0.9 }),
  trailSmoke: new Burst(scene, { kind: 'smoke', drag: 0.6, acc: [0, 0.05, 0], gain: 0.22, tint: [0.22, 0.21, 0.2] }),
  pileFire: new Burst(scene, { kind: 'fire', drag: 1.5, acc: [0, 1.2, 0], gain: 0.8 }),
  pileSparks: new Burst(scene, { kind: 'fire', drag: 0.4, acc: [0, -7, 0], gain: 1.4 }),
  pileSmoke: new Burst(scene, { kind: 'smoke', drag: 0.4, acc: [0, 0.12, 0], gain: 0.35, tint: [0.25, 0.24, 0.23] }),
  fireball: new Burst(scene, { kind: 'fire', drag: 4.5, acc: [0, 2.2, 0], gain: 0.7 }),
  blastSmoke: new Burst(scene, { kind: 'smoke', drag: 1.1, acc: [0, 0.22, 0], gain: 0.5, tint: [0.16, 0.12, 0.115] }),
  mist: new Mist(scene),
  decals: new Decals(scene),
  beam: new Beam(scene),
};
const pathGroup = new THREE.Group(); scene.add(pathGroup);

function disposeTree(o) {
  o.traverse(c => {
    c.geometry?.dispose?.();
    const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
    for (const m of ms) { for (const k of ['map', 'roughnessMap', 'alphaMap']) m[k]?.dispose?.(); m.dispose?.(); }
  });
  o.parent?.remove(o);
}
const tag = (o, el) => { o.userData.el = el; return o; };

let prof = jumpProfile(PARAMS);
let chunkGeos = B.chunkGeometries();
const chunkMat = B.fleshMat();

function buildAll() {
  for (const k of Object.keys(W)) { if (W[k]?.isObject3D) disposeTree(W[k]); }
  for (const m of W.chunks || []) disposeTree(m);
  prof = jumpProfile(PARAMS);
  W.room = B.buildRoom(PARAMS); scene.add(W.room);
  W.jump = tag(B.buildJump(PARAMS, prof), 'jump'); scene.add(W.jump);
  W.jump.userData.lift = 0.004;   // a few millimetres of snow keep the outrun off the concrete
  W.skier = B.buildSkier(PARAMS); W.jump.add(W.skier);
  W.operator = tag(B.buildOperator(PARAMS), 'operator'); scene.add(W.operator);
  W.lensOnCam = B.buildLens(PARAMS);
  W.lensOnCam.position.copy(W.operator.userData.lensMount); W.lensOnCam.rotation.y = -Math.PI / 2;
  W.operator.userData.tip.add(W.lensOnCam);
  W.lens = tag(B.buildLens(PARAMS), 'operator'); scene.add(W.lens);
  W.lens.traverse(c => { if (c.isMesh) c.castShadow = true; });
  W.pad = tag(B.buildPad(PARAMS), 'pad'); scene.add(W.pad);
  W.cube = tag(B.buildCube(PARAMS), 'cube'); scene.add(W.cube);
  W.laser = tag(B.buildLaser(), 'laser'); scene.add(W.laser);
  W.pile = tag(B.buildPile(PARAMS), 'pile'); scene.add(W.pile);
  const wh = B.buildWhale(PARAMS);
  W.whale = tag(new THREE.Group(), 'whale'); W.whale.add(wh.mid); scene.add(W.whale);
  W.whaleHead = tag(wh.head, 'whale'); W.whaleTail = tag(wh.tail, 'whale');
  W.whalePivots = wh.pivots;
  scene.add(W.whaleHead, W.whaleTail);
  W.handles = new THREE.Group(); scene.add(W.handles);
  const hm = new THREE.MeshStandardMaterial({ color: 0xf0a13c, emissive: 0xf0a13c, emissiveIntensity: 0.4, roughness: 0.4 });
  LAYOUT.trail.forEach((_, i) => {
    const h = tag(new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 10), hm), `trail:${i}`);
    h.castShadow = true; W.handles.add(h);
  });
  W.chunks = chunkGeos.map(g => { const m = new THREE.InstancedMesh(g, chunkMat, Math.max(1, Math.round(PARAMS.chunkCount))); m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false; scene.add(m); return m; });
  placeAll();
  applyLook();
}

/* put everything where LAYOUT says */
function placeAll() {
  const L = LAYOUT;
  const hw = PARAMS.roomWidth / 2 - 0.05, hd = PARAMS.roomDepth / 2 - 0.05;
  for (const k of ['jump', 'pad', 'cube', 'laser', 'pile', 'whale']) { L[k].x = clamp(L[k].x, -hw, hw); L[k].z = clamp(L[k].z, -hd, hd); }
  for (const p of L.trail) { p.x = clamp(p.x, -hw, hw); p.z = clamp(p.z, -hd, hd); }
  L.cube.y = clamp(L.cube.y, PARAMS.cubeSize / 2, PARAMS.roomHeight - PARAMS.cubeSize / 2);
  L.laser.y = clamp(L.laser.y, 0.15, PARAMS.roomHeight - 0.1);

  W.jump.position.set(L.jump.x, W.jump.userData.lift, L.jump.z); W.jump.rotation.y = (L.jump.rot || 0) * D2R;
  const op = operatorPlacement(PARAMS, L, prof);
  W.operator.position.set(op.x, 0, op.z); W.operator.rotation.y = op.rot * D2R;
  W.pad.position.set(L.pad.x, 0, L.pad.z);
  W.cube.position.set(L.cube.x, L.cube.y, L.cube.z);
  W.laser.position.set(L.laser.x, L.laser.y, L.laser.z);
  B.setLaserStand(W.laser, L.laser.y);
  W.laser.updateMatrixWorld(true);
  W.laser.userData.aim.lookAt(W.cube.position);
  W.pile.position.set(L.pile.x, 0, L.pile.z);
  W.whale.position.set(L.whale.x, 0, L.whale.z); W.whale.rotation.y = (L.whale.rot || 0) * D2R;
  L.trail.forEach((p, i) => W.handles.children[i]?.position.set(p.x, 0.025, p.z));
  // the trail follows the pile, the bend points and the whale
  if (W.trail) disposeTree(W.trail);
  W.trail = tag(B.buildTrail(PARAMS, trailPath(PARAMS, L)), 'trail'); scene.add(W.trail);
  // the sun's shadow covers the room
  const hx = PARAMS.roomWidth / 2 + 0.5, hz = PARAMS.roomDepth / 2 + 0.5;
  sun.position.set(2.5, 14, 4); sun.target.position.set(0, 0, 0);
  Object.assign(sun.shadow.camera, { left: -hx, right: hx, top: hz, bottom: -hz, near: 1, far: 30 });
  sun.shadow.camera.updateProjectionMatrix();
  fill.position.set(-4, 6, -3);
}

function applyLook() {
  const P = PARAMS;
  renderer.toneMappingExposure = P.exposure;
  hemi.intensity = 0.9 * P.lightLevel; sun.intensity = 2.4 * P.lightLevel; fill.intensity = 0.55 * P.lightLevel;
  camera.fov = P.fov; camera.updateProjectionMatrix();
  W.skier.userData.mats.suit.color.set(P.suitColor); W.skier.userData.mats.helmet.color.set(P.helmetColor);
  W.jump.userData.wallMat.color.set(P.wallColor);
  W.jump.userData.sparkleMat.uniforms.uAmt.value = P.snowSparkle;
  const cu = W.cube.userData; cu.mat.uniforms.uColor.value.set(P.cubeColor); cu.mat.uniforms.uGlow.value = P.cubeGlow; cu.dm.uniforms.uColor.value.set(P.cubeColor); cu.dm.uniforms.uGlow.value = P.cubeGlow;
  cu.edges.material.color.set(P.cubeColor); cu.node.emissive.set(P.cubeColor);
  W.operator.traverse(c => { if (c.material?.color && c.material.roughness === 0.75) c.material.color.set(P.opColor); });
  W.trail.userData.uniforms.uEmber.value = P.emberTime; W.trail.userData.uniforms.uSpeed.value = P.burnSpeed;
  fx.mist.mat.uniforms.uGore.value.set(P.goreColor); fx.mist.mat.uniforms.uHang.value = P.mistHang;
  sound.volume(P.volume);
  pathGroup.visible = !!P.showPaths;
  if (run) setFxFromRun();
}

/* ---------- bake and the effects that hang off it ---------- */
let bakeTimer = 0, bakeLite = false;
function scheduleBake(delay = 60, lite = false) {
  bakeLite = lite;
  clearTimeout(bakeTimer);
  bakeTimer = setTimeout(doBake, delay);
}
function doBake() {
  const P = bakeLite ? { ...PARAMS, mistCount: Math.min(PARAMS.mistCount, 250) } : PARAMS;
  run = bake(P, LAYOUT);
  T = clamp(T, 0, run.duration);
  setFxFromRun();
  renderMarks();
  renderChain(true);
  saveWorking();
}

function trailPoint(s) {
  const tr = run.trail;
  if (s <= 0) return tr.pts[0];
  if (s >= tr.length) return tr.pts[tr.pts.length - 1];
  let lo = 0, hi = tr.s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr.s[m] <= s) lo = m; else hi = m; }
  const f = (s - tr.s[lo]) / (tr.s[hi] - tr.s[lo] || 1);
  return [tr.pts[lo][0] + (tr.pts[hi][0] - tr.pts[lo][0]) * f, tr.pts[lo][1] + (tr.pts[hi][1] - tr.pts[lo][1]) * f];
}
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function setFxFromRun() {
  const P = PARAMS, R = run, tm = R.times, r = rnd(42);
  // trail flames and smoke, lit in order along the powder
  const tf = [], ts = [];
  if (tm.ignite >= 0) {
    for (let s = 0; s < R.trail.length; s += 0.008) {
      const [x, z] = trailPoint(s), t0 = tm.ignite + s / P.burnSpeed;
      for (let k = 0; k < 2; k++) {
        const life = P.trailBurnTime * (0.5 + r());
        tf.push({ p: [x + (r() - 0.5) * P.trailWidth * 0.6, 0.004, z + (r() - 0.5) * P.trailWidth * 0.6], v: [(r() - 0.5) * 0.03, P.trailFlame / life * (0.8 + r() * 0.8), (r() - 0.5) * 0.03], t0: t0 + r() * 0.04, life, s0: P.trailFlame * (0.45 + 0.3 * r()), s1: P.trailFlame * 0.12, seed: r() });
      }
      if (r() < 0.25) ts.push({ p: [x, 0.02, z], v: [(r() - 0.5) * 0.05, 0.12 + r() * 0.1, (r() - 0.5) * 0.05], t0: t0 + 0.15, life: 2.5 + r() * 2, s0: 0.03, s1: 0.3, seed: r() });
    }
  }
  fx.trailFire.set(tf); fx.trailSmoke.set(ts);
  // the pile flaring up
  const pf = [], psp = [], psm = [];
  const pp = [LAYOUT.pile.x, 0, LAYOUT.pile.z], pr = P.pileSize / 2;
  if (tm.ignite >= 0) {
    for (let i = 0; i < 420; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * pr * 0.8, life = 0.3 + r() * 0.6;
      pf.push({ p: [pp[0] + Math.cos(a) * d, P.pileSize * 0.3, pp[2] + Math.sin(a) * d], v: [Math.cos(a) * 0.2, P.pileFlame / life * (0.7 + 0.6 * r()), Math.sin(a) * 0.2], t0: tm.ignite + Math.pow(r(), 1.6) * P.pileBurn, life, s0: P.pileFlame * (0.3 + 0.3 * r()), s1: P.pileFlame * 0.12, seed: r() });
    }
    for (let i = 0; i < 160; i++) {
      const a = r() * 6.28, sp = 1 + r() * 3.5;
      psp.push({ p: [pp[0], P.pileSize * 0.35, pp[2]], v: [Math.cos(a) * sp * 0.5, sp, Math.sin(a) * sp * 0.5], t0: tm.ignite + r() * P.pileBurn * 0.6, life: 0.4 + r() * 0.8, s0: 0.012, s1: 0.006, seed: r() });
    }
    for (let i = 0; i < 90; i++) psm.push({ p: [pp[0] + (r() - 0.5) * pr, P.pileSize * 0.5, pp[2] + (r() - 0.5) * pr], v: [(r() - 0.5) * 0.2, 0.3 + r() * 0.4, (r() - 0.5) * 0.2], t0: tm.ignite + 0.1 + r() * (P.pileBurn + 1), life: 4 + r() * 4, s0: 0.08, s1: 0.8, seed: r() });
  }
  if (R.beam.on >= 0 && R.beam.hit) {   // wisps while the beam heats it
    const until = tm.ignite >= 0 ? tm.ignite : R.beam.on + 30;
    for (let i = 0; i < 40; i++) psm.push({ p: [...R.pileTop], v: [(r() - 0.5) * 0.04, 0.12 + r() * 0.1, (r() - 0.5) * 0.04], t0: R.beam.on + 0.1 + r() * (until - R.beam.on), life: 1.5 + r() * 1.5, s0: 0.01, s1: 0.12, seed: r() });
  }
  fx.pileFire.set(pf); fx.pileSparks.set(psp); fx.pileSmoke.set(psm);
  // the blast
  const fb = [], bs = [];
  if (R.blast) {
    const c = R.blast.charge;
    for (let i = 0; i < 520; i++) {
      let d = [r() - 0.5, r() - 0.3, r() - 0.5]; const l = Math.hypot(...d) || 1; d = d.map(v => v / l);
      const sp = 3 + r() * 13;
      fb.push({ p: [c[0] + d[0] * 0.3, c[1] + d[1] * 0.3, c[2] + d[2] * 0.3], v: d.map(v => v * sp), t0: tm.boom + r() * 0.07, life: 0.35 + r() * 0.9, s0: 0.35 + r() * 0.3, s1: 1.1 + r() * 0.6, seed: r() });
    }
    for (let i = 0; i < 260; i++) {
      let d = [r() - 0.5, r() * 0.8, r() - 0.5]; const l = Math.hypot(...d) || 1; d = d.map(v => v / l);
      const sp = 0.8 + r() * 4.5;
      bs.push({ p: [c[0] + d[0] * 0.5, c[1] + d[1] * 0.4, c[2] + d[2] * 0.5], v: d.map(v => v * sp), t0: tm.boom + 0.05 + r() * 0.6, life: 6 + r() * 7, s0: 0.5, s1: 2.6 + r() * 1.5, seed: r() });
    }
  }
  fx.fireball.set(fb); fx.blastSmoke.set(bs);
  fx.mist.set(R.blast?.mist);
  fx.decals.set(R.blast?.decals);
  // chunk instances: which chunks each shape draws
  if (R.blast) {
    const n = R.blast.chunkN;
    W.chunkIdx = chunkGeos.map(() => []);
    for (let i = 0; i < n; i++) W.chunkIdx[R.blast.chunk.shape[i]].push(i);
    W.chunks.forEach((m, k) => { if (m.instanceMatrix.count < W.chunkIdx[k].length) { const g = m.geometry; disposeTree(m); W.chunks[k] = m2(g); } });
    function m2(g) { const m = new THREE.InstancedMesh(g, chunkMat, Math.max(1, n)); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; }
  }
  buildPaths();
}

function buildPaths() {
  pathGroup.clear();
  const R = run;
  const sk = [];
  const jl = LAYOUT.jump;
  for (let f = 0; f < R.frames; f += 2) {
    const o = f * R.SK; if (R.skier[o + 6] < 0.01 && f > R.times.start * FPS + 30) continue;
    const [x, z] = toWorld(jl, R.skier[o], 0); sk.push(new THREE.Vector3(x, R.skier[o + 1] + 0.01, z));
  }
  const ln = [];
  for (let f = 0; f < R.frames; f += 2) { const o = f * R.LN; if (R.lens[o + 7] > 0) ln.push(new THREE.Vector3(R.lens[o], R.lens[o + 1], R.lens[o + 2])); }
  for (const [pts, col] of [[sk, 0xd8452f], [ln, 0x7fb6ff]]) {
    if (pts.length < 2) continue;
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: col, dashSize: 0.03, gapSize: 0.025, transparent: true, opacity: 0.7, depthWrite: false }));
    l.computeLineDistances(); pathGroup.add(l);
  }
}

/* ---------- playback: pose everything for time T ---------- */
const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), q5 = new THREE.Quaternion(), m4 = new THREE.Matrix4(), s3 = new THREE.Vector3();
let pointScale = 500;

function applyTime(t) {
  const R = run, P = PARAMS, tm = R.times;
  const f = clamp(t * FPS, 0, R.frames - 1), i0 = Math.floor(f), i1 = Math.min(R.frames - 1, i0 + 1), a = f - i0;
  const lerpAt = (arr, stride, k) => arr[i0 * stride + k] + (arr[i1 * stride + k] - arr[i0 * stride + k]) * a;

  // skier
  const S = k => lerpAt(R.skier, R.SK, k);
  W.skier.position.set(S(0), S(1), 0);
  W.skier.rotation.z = S(2);
  W.skier.userData.pose(S(3), S(4), S(5), R.skier[i0 * R.SK + 7], P.vAngle, P.tipAngle);

  // operator
  const th = R.op[i0] + (R.op[i1] - R.op[i0]) * a;
  W.operator.userData.tip.rotation.z = -th;
  W.operator.userData.tally.visible = (t * 2) % 1 < 0.6 || tm.topple < 0 || t < tm.topple;

  // lens
  const attached = tm.detach < 0 || t < tm.detach;
  W.lensOnCam.visible = attached; W.lens.visible = !attached;
  if (!attached) {
    const o0 = i0 * R.LN, o1 = i1 * R.LN;
    W.lens.position.set(lerpAt(R.lens, R.LN, 0), lerpAt(R.lens, R.LN, 1), lerpAt(R.lens, R.LN, 2));
    q4.set(R.lens[o0 + 3], R.lens[o0 + 4], R.lens[o0 + 5], R.lens[o0 + 6]);
    q5.set(R.lens[o1 + 3], R.lens[o1 + 4], R.lens[o1 + 5], R.lens[o1 + 6]);
    W.lens.quaternion.slerpQuaternions(q4, q5, a);
  }

  // pad
  B.setPadPop(W.pad, tm.pad >= 0 ? t - tm.pad : -1);

  // cube: brighter while it holds the lens
  const cu = W.cube.userData, c = R.cubeC, h = PARAMS.cubeSize / 2;
  const inCube = !attached && Math.abs(W.lens.position.x - c[0]) < h && Math.abs(W.lens.position.y - c[1]) < h && Math.abs(W.lens.position.z - c[2]) < h;
  cu.mat.uniforms.uActive.value += ((inCube ? 1 : 0) - cu.mat.uniforms.uActive.value) * 0.1;
  cu.mat.uniforms.uTime.value = t; cu.dm.uniforms.uTime.value = t; cu.dm.uniforms.uScale.value = pointScale;

  // laser
  const bm = R.beam;
  const beamOn = bm.on >= 0 && t >= bm.on && (bm.off < 0 || t < bm.off);
  if (beamOn) {
    const ap = W.laser.userData.aim.localToWorld(W.laser.userData.aperture.clone());
    const heat = bm.hit ? clamp((t - bm.on) / Math.max(0.05, (tm.ignite >= 0 ? tm.ignite : bm.on + 30) - bm.on), 0, 1) : 0;
    fx.beam.update({ on: true, from: ap, lens: W.lens.position.clone(), to: new THREE.Vector3(...bm.out), width: P.beamWidth, color: P.beamColor, flicker: Math.sin(t * 60) * 0.5 + 0.5, heat });
  } else fx.beam.update({ on: false });

  // pile and trail
  const burnt = tm.ignite >= 0 && t >= tm.ignite;
  W.pile.userData.mat.color.setScalar(burnt ? Math.max(0.25, 1 - (t - tm.ignite) / P.pileBurn) : 1);
  const flare = burnt ? Math.max(0, 1 - (t - tm.ignite) / P.pileBurn) : 0;
  pileLight.position.set(LAYOUT.pile.x, 0.12, LAYOUT.pile.z);
  pileLight.intensity = flare * (6 + 2 * Math.sin(t * 37) + Math.sin(t * 13)) * P.pileFlame * 4;
  const front = burnt ? Math.min(run.trail.length, (t - tm.ignite) * P.burnSpeed) : -1;
  const tu = W.trail.userData.uniforms; tu.uFront.value = front; tu.uTime.value = t;
  if (front >= 0 && front < run.trail.length) { const [x, z] = trailPoint(front); frontLight.position.set(x, 0.06, z); frontLight.intensity = 1.6 + Math.sin(t * 41) * 0.4; }
  else frontLight.intensity = 0;

  // the whale
  const blown = R.blast && t >= tm.boom;
  W.whale.visible = true;
  W.whale.children[0].visible = !blown;
  const wl = LAYOUT.whale, wr = (wl.rot || 0) * D2R;
  if (!blown) {
    W.whalePivots.forEach((px, i) => {
      const [x, z] = toWorld(wl, px, 0), m = i ? W.whaleTail : W.whaleHead;
      m.position.set(x, 0, z); m.rotation.set(0, wr, 0);
    });
    for (const m of W.chunks) m.count = 0;
  } else {
    const bl = R.blast, n = bl.chunkData.length;
    const fb = clamp(f - bl.boomFrame, 0, n - 1), j0 = Math.floor(fb), j1 = Math.min(n - 1, j0 + 1), b = fb - j0;
    const A = bl.pieceData[j0], Bp = bl.pieceData[j1];
    [W.whaleHead, W.whaleTail].forEach((m, i) => {
      const o = i * 7;
      m.position.set(A[o] + (Bp[o] - A[o]) * b, A[o + 1] + (Bp[o + 1] - A[o + 1]) * b, A[o + 2] + (Bp[o + 2] - A[o + 2]) * b);
      q4.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]); q5.set(Bp[o + 3], Bp[o + 4], Bp[o + 5], Bp[o + 6]);
      m.quaternion.slerpQuaternions(q4, q5, b);
    });
    const C0 = bl.chunkData[j0], C1 = bl.chunkData[j1];
    W.chunks.forEach((m, k) => {
      const ids = W.chunkIdx[k];
      ids.forEach((id, slot) => {
        const o = id * 7, r = bl.chunk.r[id] * 0.85;
        v3.set(C0[o] + (C1[o] - C0[o]) * b, C0[o + 1] + (C1[o + 1] - C0[o + 1]) * b, C0[o + 2] + (C1[o + 2] - C0[o + 2]) * b);
        q4.set(C0[o + 3], C0[o + 4], C0[o + 5], C0[o + 6]); q5.set(C1[o + 3], C1[o + 4], C1[o + 5], C1[o + 6]); q4.slerp(q5, b);
        s3.setScalar(r); m4.compose(v3, q4, s3); m.setMatrixAt(slot, m4);
      });
      m.count = ids.length; m.instanceMatrix.needsUpdate = true;
    });
  }
  const k = R.blast ? t - tm.boom : -1;
  blastLight.position.set(...(R.blast ? R.blast.charge : [0, 1, 0])); blastLight.position.y += 0.6;
  blastLight.intensity = k >= 0 ? 900 * Math.exp(-k * 7) + 25 * Math.exp(-k * 1.2) : 0;
  fx.mist.update(k, MIST_FPS, pointScale);
  fx.decals.update(t, P.goreColor);
  for (const b of ['trailFire', 'trailSmoke', 'pileFire', 'pileSparks', 'pileSmoke', 'fireball', 'blastSmoke']) fx[b].update(t, pointScale);
  W.jump.userData.sparkleMat.uniforms.uTime.value = t; W.jump.userData.sparkleMat.uniforms.uScale.value = pointScale;
  return k;
}

/* ---------- sound ---------- */
const sound = new Sound();
let soundOn = store.get('chain-reaction:sound') ?? true;
function soundTick(prevT, t) {
  if (!soundOn || !playing || rate <= 0 || rate > 4) { sound.quiet(); return; }
  for (const e of run.events) if (e.t > prevT && e.t <= t && e.ok) sound.event(e.id);
  for (const e of run.events) if (e.t > prevT && e.t <= t && !e.ok) sound.event('fail');
  const R = run, f = Math.min(R.frames - 1, Math.round(t * FPS));
  const skSpeed = R.skier[f * R.SK + 6];
  const onSnow = R.times.start >= 0 && t > R.times.start && (R.times.takeoff < 0 || t < R.times.takeoff || (R.times.land >= 0 && t > R.times.land));
  const burning = R.times.ignite >= 0 && t > R.times.ignite && t < R.times.reach;
  const beamOn = R.beam.on >= 0 && t >= R.beam.on && (R.beam.off < 0 || t < R.beam.off);
  const inCube = R.times.pad >= 0 && t > (R.events.find(e => e.id === 'enter')?.t ?? 1e9) && (R.beam.off < 0 || t < R.beam.off + 2);
  sound.continuous({ hiss: onSnow ? clamp(skSpeed / 6, 0, 1) : 0, wind: R.times.takeoff >= 0 && t > R.times.takeoff && (R.times.land < 0 || t < R.times.land) ? 1 : 0, fizz: burning ? 1 : 0, hum: inCube ? 1 : 0, beam: beamOn ? 1 : 0 }, rate);
}

/* ---------- camera: orbit, fly, follow, home ---------- */
const keys = new Set();
let camAnim = null;
function goHome() {
  const from = { p: camera.position.clone(), t: controls.target.clone() }, t0 = performance.now();
  camAnim = now => {
    const k = clamp((now - t0) / 700, 0, 1), e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(from.p, HOME.pos, e); controls.target.lerpVectors(from.t, HOME.target, e);
    if (flying) camera.lookAt(controls.target);
    if (k >= 1) camAnim = null;
  };
  if (PARAMS.follow) { PARAMS.follow = 0; renderParams(); toast('Follow is off so the camera can stay put.'); }
}
const look = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0 };
function setFly(on) {
  flying = on;
  $('#fly').setAttribute('aria-pressed', String(on));
  canvas.classList.toggle('is-fly', on);
  controls.enabled = !on;
  if (on) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); look.yaw = e.y; look.pitch = e.x;
    toast('Flying: drag to look, WASD to move, Q and E for down and up.');
  } else {
    const d = Math.max(0.5, camera.position.distanceTo(controls.target));
    controls.target.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(d));
  }
}
function moveCamera(dt) {
  if (!keys.size) return;
  const sp = PARAMS.flySpeed * (keys.has('shift') ? 3 : 1) * dt;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  if (!flying) { fwd.y = 0; fwd.normalize(); }
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const mv = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup') && flying) mv.addScaledVector(fwd, sp);
  if (keys.has('s') || keys.has('arrowdown') && flying) mv.addScaledVector(fwd, -sp);
  if (keys.has('d')) mv.addScaledVector(right, sp);
  if (keys.has('a')) mv.addScaledVector(right, -sp);
  if (keys.has('e')) mv.y += sp;
  if (keys.has('q')) mv.y -= sp;
  camera.position.add(mv); controls.target.add(mv);
}
function clampCamera() {
  const m = 0.04, hw = PARAMS.roomWidth / 2 - m, hd = PARAMS.roomDepth / 2 - m, H = PARAMS.roomHeight - m;
  for (const v of [camera.position, controls.target]) { v.x = clamp(v.x, -hw, hw); v.y = clamp(v.y, 0.01, H); v.z = clamp(v.z, -hd, hd); }
}
function activePoint(t) {
  const R = run, tm = R.times;
  if (tm.detach < 0 || t < tm.detach + 0.15) {
    const f = Math.min(R.frames - 1, Math.round(t * FPS)), o = f * R.SK;
    const [x, z] = toWorld(LAYOUT.jump, R.skier[o], 0);
    return [new THREE.Vector3(x, R.skier[o + 1] + 0.08, z), 1.1];
  }
  if (tm.settle < 0 || t < tm.settle + 0.3) { const f = Math.min(R.frames - 1, Math.round(t * FPS)) * R.LN; return [new THREE.Vector3(R.lens[f], R.lens[f + 1], R.lens[f + 2]), 1.0]; }
  if (tm.ignite < 0 || t < tm.ignite + 0.3) {
    const l = new THREE.Vector3(...R.cubeC), p = new THREE.Vector3(LAYOUT.pile.x, 0.1, LAYOUT.pile.z);
    return [l.lerp(p, 0.5), 2.2];
  }
  if (t < tm.reach) { const [x, z] = trailPoint((t - tm.ignite) * PARAMS.burnSpeed); return [new THREE.Vector3(x, 0.05, z), 1.4]; }
  return [new THREE.Vector3(...(R.blast ? R.blast.charge : R.cubeC)), 7];
}
function followTick(dt) {
  if (!PARAMS.follow || tcDragging || flying) return;
  const [p, dist] = activePoint(T);
  const k = 1 - Math.exp(-3.5 * dt);
  const d = new THREE.Vector3().subVectors(p, controls.target).multiplyScalar(k);
  controls.target.add(d); camera.position.add(d);
  const off = new THREE.Vector3().subVectors(camera.position, controls.target);
  const l = off.length(); off.setLength(l + (dist - l) * (1 - Math.exp(-1.5 * dt)));
  camera.position.copy(controls.target).add(off);
}

canvas.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY, moved: false };
  if (flying && e.button === 0) { look.drag = true; look.x = e.clientX; look.y = e.clientY; canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener('pointermove', e => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
  if (look.drag) {
    look.yaw -= (e.clientX - look.x) * 0.004; look.pitch = clamp(look.pitch - (e.clientY - look.y) * 0.004, -1.5, 1.5);
    look.x = e.clientX; look.y = e.clientY;
    camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
  } else hoverPick(e);
});
canvas.addEventListener('pointerup', e => {
  look.drag = false;
  if (down && !down.moved && !tcDragging && tc.axis === null) pick(e);
  down = null;
});
canvas.addEventListener('wheel', e => {
  if (!flying) return;
  e.preventDefault();
  camera.position.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), -e.deltaY * 0.002 * PARAMS.flySpeed);
}, { passive: false });
let down = null;

/* ---------- selecting and moving ---------- */
const tc = new TransformControls(camera, canvas);
tc.setSize(0.85);
scene.add(tc.getHelper());
let tcDragging = false;
tc.addEventListener('dragging-changed', e => {
  tcDragging = e.value;
  controls.enabled = !e.value && !flying;
  if (!e.value) { scheduleBake(0); renderParams(); }
});
tc.addEventListener('objectChange', () => { readLayoutFrom(tc.object); placeAll(); W.handles.visible = true; if (tc.object) proxySync(); scheduleBake(120, true); renderPositionFields(); });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hitAt(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const roots = [W.handles, W.jump, W.operator, W.lens, W.pad, W.cube, W.laser, W.pile, W.trail, W.whale, W.whaleHead, W.whaleTail];
  const hits = ray.intersectObjects(roots, true).filter(h => h.object.visible && !h.object.isPoints && !h.object.isLine);
  for (const h of hits) { let o = h.object; while (o && !o.userData.el) o = o.parent; if (o) return o.userData.el; }
  return null;
}
let hoverT = 0;
function hoverPick(e) {
  const now = performance.now(); if (now - hoverT < 60 || flying) return; hoverT = now;
  canvas.classList.toggle('is-hover', !!hitAt(e));
}
function pick(e) { if (flying) return; select(hitAt(e)); }

const ELEMENT_SECTION = { jump: 'jump', operator: 'operator', pad: 'pad', cube: 'cube', laser: 'laser', pile: 'pile', trail: 'trail', whale: 'whale' };
function select(el, keepSection = false) {
  selected = el;
  const base = el?.split(':')[0];
  if (el && !keepSection) {
    const s = SECTIONS.find(x => x.id === section);
    if (!s || s.element !== base) section = ELEMENT_SECTION[base] || section;
  }
  attachGizmo();
  renderParams();
  renderChain(true);
}
// the gizmo moves a proxy, so the operator can be dragged in world space while he's stored relative to the wall
const proxy = new THREE.Object3D(); scene.add(proxy);
function attachGizmo() {
  tc.detach();
  if (!selected || selected === 'trail') return;
  proxySync();
  tc.attach(proxy);
  updateGizmoMode();
}
function proxySync() {
  const el = selected, L = LAYOUT;
  if (!el) return;
  if (el.startsWith('trail:')) { const p = L.trail[+el.split(':')[1]]; proxy.position.set(p.x, 0.025, p.z); proxy.rotation.set(0, 0, 0); return; }
  if (el === 'operator') { const op = operatorPlacement(PARAMS, L, prof); proxy.position.set(op.x, 0, op.z); proxy.rotation.set(0, op.rot * D2R, 0); return; }
  const o = L[el];
  proxy.position.set(o.x, o.y ?? 0, o.z); proxy.rotation.set(0, (o.rot || 0) * D2R, 0);
}
function readLayoutFrom(obj) {
  if (obj !== proxy || !selected) return;
  const el = selected, L = LAYOUT, p = proxy.position;
  if (el.startsWith('trail:')) { const t = L.trail[+el.split(':')[1]]; t.x = p.x; t.z = p.z; return; }
  if (el === 'operator') {
    const [lx, lz] = toLocal(L.jump, p.x, p.z);
    L.operator.dx = lx - prof.wallBack; L.operator.dz = lz;
    L.operator.rot = Math.round(proxy.rotation.y / D2R - (L.jump.rot || 0));
    return;
  }
  const o = L[el];
  o.x = p.x; o.z = p.z;
  if ('y' in o) o.y = p.y;
  if ('rot' in o) o.rot = Math.round(normDeg(proxy.rotation.y / D2R) * 10) / 10;
}
const normDeg = d => ((d + 180) % 360 + 360) % 360 - 180;
const ROTATES = new Set(['jump', 'operator', 'whale']);
function updateGizmoMode() {
  const base = selected?.split(':')[0];
  const mode = tMode === 'rotate' && ROTATES.has(base) ? 'rotate' : 'translate';
  tc.setMode(mode);
  tc.showX = mode === 'translate'; tc.showZ = mode === 'translate';
  tc.showY = mode === 'rotate' || base === 'cube' || base === 'laser';
  $('#mode-move').setAttribute('aria-pressed', String(tMode === 'translate'));
  $('#mode-turn').setAttribute('aria-pressed', String(tMode === 'rotate'));
}
function setTMode(m) {
  tMode = m;
  const base = selected?.split(':')[0];
  if (m === 'rotate' && selected && !ROTATES.has(base)) toast('Only the ski jump, the camera operator and the whale turn.');
  updateGizmoMode();
}

/* ---------- the chain panel ---------- */
const LINKS = [
  { id: 'skier', name: 'Skier', el: 'jump', section: 'skier', events: ['start', 'takeoff', 'land'] },
  { id: 'wall', name: 'Wall', el: 'jump', section: 'barrier', events: ['bump', 'stop'] },
  { id: 'operator', name: 'Camera operator', el: 'operator', section: 'operator', events: ['topple'] },
  { id: 'lens', name: 'Lens', el: 'operator', section: 'lens', events: ['detach', 'lensStop'] },
  { id: 'pad', name: 'Spring pad', el: 'pad', section: 'pad', events: ['pad'] },
  { id: 'cube', name: 'Gravity cube', el: 'cube', section: 'cube', events: ['enter', 'settle'] },
  { id: 'laser', name: 'Laser pointer', el: 'laser', section: 'laser', events: ['laser'] },
  { id: 'pile', name: 'Gunpowder pile', el: 'pile', section: 'pile', events: ['ignite'] },
  { id: 'trail', name: 'Powder trail', el: 'trail', section: 'trail', events: ['reach'] },
  { id: 'whale', name: 'Whale', el: 'whale', section: 'whale', events: ['boom'] },
];
let chainSig = '';
function linkState(l, t) {
  const evs = run.events.filter(e => l.events.includes(e.id));
  const bad = evs.find(e => !e.ok);
  const okEvs = evs.filter(e => e.ok);
  const first = evs[0], lastOk = okEvs[okEvs.length - 1];
  const needAll = l.id === 'skier' ? 3 : l.id === 'cube' ? 2 : l.id === 'lens' ? 1 : 1;
  if (bad && t >= bad.t) return { s: 'fail', at: bad.t };
  if (!first) return { s: run.fail && run.fail.t <= t ? 'never' : 'wait', at: null };
  if (okEvs.length >= needAll && t >= lastOk.t) return { s: 'done', at: lastOk.t };
  if (t >= first.t) return { s: 'live', at: lastOk?.t ?? first.t };
  return { s: 'wait', at: (lastOk || first).t };
}
function renderChain(force) {
  if (!run) return;
  const states = LINKS.map(l => linkState(l, T));
  const sig = states.map(s => s.s).join() + selected + section;
  const story = [...run.events].filter(e => e.t <= T + 1e-6).pop();
  const storySig = story ? story.id + story.t : '';
  if (!force && sig + storySig === chainSig) return;
  chainSig = sig + storySig;
  const box = $('#links');
  box.innerHTML = LINKS.map((l, i) => {
    const st = states[i];
    const cur = SECTIONS.find(s => s.id === section)?.id === l.section || (selected && selected.split(':')[0] === l.el && l.section === section);
    return `<li><button class="link m-menu__item m-menu__item--plain" type="button" data-i="${i}" aria-current="${cur}"><span class="dot is-${st.s}" aria-hidden="true"></span><span>${esc(l.name)}</span><time>${st.at != null && st.s !== 'wait' ? st.at.toFixed(2) + ' s' : ''}</time></button></li>`;
  }).join('');
  box.querySelectorAll('.link').forEach(b => b.onclick = () => { const l = LINKS[+b.dataset.i]; section = l.section; select(l.el, true); });
  const done = states.filter(s => s.s === 'done').length;
  $('#chain-meta').textContent = run.ok ? `${done} of ${LINKS.length}` : `breaks at ${run.fail.t.toFixed(2)} s`;
  const el = $('#story');
  const failed = run.fail && T >= run.fail.t;
  el.classList.toggle('is-fail', !!failed);
  if (failed) el.innerHTML = `<strong>The chain broke</strong>${esc(run.fail.text)}`;
  else if (story) el.innerHTML = `<strong>${story.t.toFixed(2)} s</strong>${esc(story.text)}`;
  else el.innerHTML = `<strong>Ready</strong>${run.ok ? 'Press play to run the machine.' : 'Press play. This setup breaks somewhere: watch the chain.'}`;
}

function renderMarks() {
  const box = $('#marks');
  box.innerHTML = run.events.map(e => `<span class="mark${!e.ok ? ' is-fail' : e.id === 'boom' ? ' is-boom' : ''}" style="left:${(e.t / run.duration * 100).toFixed(2)}%" title="${esc(e.t.toFixed(2) + ' s: ' + e.text)}"></span>`).join('');
}

/* ---------- the tuning panel ---------- */
const fmtFor = step => v => { const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3; return (+v).toFixed(d); };
let rowId = 0;
/* one row: a label, a typed number field, a reset, and a slider (or a toggle or colour).
   The typed field and the slider stay in step both ways. A typed number inside the range takes
   effect as you type; leaving the field (or Enter) brings anything outside to the nearest end,
   and an empty field goes back to the current value. A typed value off the slider's step is
   kept as typed. */
function makeRow({ label, type = 'range', min, max, step, unit = '', note = '', get, set, def }) {
  const row = document.createElement('div');
  row.className = 'param';
  const id = `r${rowId++}`;
  const fmt = fmtFor(step || 1);
  const mark = () => row.classList.toggle('is-changed', get() !== def);
  if (type === 'toggle') {
    row.innerHTML = `<div class="param__head"><label class="toggle m-check"><input type="checkbox" id="${id}" ${get() ? 'checked' : ''}> ${esc(label)}</label><button class="param__reset" type="button" aria-label="Reset ${esc(label)}">↺</button></div>${note ? `<p class="note">${esc(note)}</p>` : ''}`;
    const inp = row.querySelector('input');
    inp.addEventListener('change', () => { set(inp.checked ? 1 : 0); mark(); });
    row.querySelector('.param__reset').onclick = () => { set(def); inp.checked = !!def; mark(); };
  } else if (type === 'color') {
    row.innerHTML = `<div class="param__head"><label for="${id}">${esc(label)}</label><input type="color" id="${id}" value="${get()}"><button class="param__reset" type="button" aria-label="Reset ${esc(label)}">↺</button></div>`;
    const inp = row.querySelector('input');
    inp.addEventListener('input', () => { set(inp.value); mark(); });
    row.querySelector('.param__reset').onclick = () => { set(def); inp.value = def; mark(); };
  } else {
    row.innerHTML = `<div class="param__head"><label for="${id}">${esc(label)}</label><input type="number" class="param__num m-input" min="${min}" max="${max}" step="any" value="${fmt(get())}" aria-label="${esc(label)}, typed"><span class="unit">${esc(unit)}</span><button class="param__reset" type="button" title="Back to ${esc(fmt(def))}" aria-label="Reset ${esc(label)}">↺</button></div>
      <input class="m-fader" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${get()}">${note ? `<p class="note">${esc(note)}</p>` : ''}`;
    const sl = row.querySelector('input[type=range]'), num = row.querySelector('.param__num');
    sl.addEventListener('input', () => { set(+sl.value); num.value = fmt(+sl.value); mark(); });
    num.addEventListener('input', () => { const v = num.valueAsNumber; if (Number.isFinite(v) && v >= min && v <= max) { set(v); sl.value = v; mark(); } });
    num.addEventListener('change', () => {
      const v = num.valueAsNumber;
      if (!Number.isFinite(v)) { num.value = fmt(get()); return; }
      if (v < min || v > max) { const c = clamp(v, min, max); set(c); sl.value = c; num.value = fmt(c); mark(); }
    });
    num.addEventListener('keydown', e => { if (e.key === 'Enter') num.blur(); });
    row.querySelector('.param__reset').onclick = () => { set(def); sl.value = def; num.value = fmt(def); mark(); };
    row._sync = () => { sl.value = get(); num.value = fmt(get()); mark(); };
  }
  mark();
  return row;
}

let rebuildTimer = 0;
function onParam(p) {
  if (p.apply === 'build') {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { buildAll(); attachGizmo(); scheduleBake(0); }, 160);
  } else if (p.apply === 'sim') scheduleBake(80);
  else { applyLook(); saveWorking(); }
  markChips();
}

const POSITION_FIELDS = {
  jump: [['x', 'Across (x)'], ['z', 'Along (z)'], ['rot', 'Turn']],
  operator: [['dx', 'Back from the wall'], ['dz', 'Along the wall'], ['rot', 'Turn']],
  pad: [['x', 'Across (x)'], ['z', 'Along (z)']],
  cube: [['x', 'Across (x)'], ['y', 'Height'], ['z', 'Along (z)']],
  laser: [['x', 'Across (x)'], ['y', 'Height'], ['z', 'Along (z)']],
  pile: [['x', 'Across (x)'], ['z', 'Along (z)']],
  whale: [['x', 'Across (x)'], ['z', 'Along (z)'], ['rot', 'Turn']],
};
let posRows = [];
function positionRows(el) {
  const rows = [];
  const P = PARAMS, hw = P.roomWidth / 2 - 0.05, hd = P.roomDepth / 2 - 0.05;
  const range = k => k === 'x' ? [-hw, hw, 0.01, 'm'] : k === 'z' ? [-hd, hd, 0.01, 'm'] : k === 'y' ? [0.1, P.roomHeight, 0.01, 'm'] : k === 'rot' ? [-180, 180, 1, '°'] : k === 'dx' ? [-0.05, 1.5, 0.005, 'm'] : [-1, 1, 0.005, 'm'];
  if (el === 'trail') {
    LAYOUT.trail.forEach((pt, i) => {
      for (const k of ['x', 'z']) {
        const [min, max, step, unit] = range(k);
        rows.push(makeRow({ label: `Bend ${i + 1} ${k === 'x' ? 'across (x)' : 'along (z)'}`, min, max, step, unit, get: () => LAYOUT.trail[i][k], set: v => { LAYOUT.trail[i][k] = v; layoutChanged(); }, def: DEFAULT_LAYOUT.trail[i][k] }));
      }
    });
    return rows;
  }
  for (const [k, label] of POSITION_FIELDS[el] || []) {
    const [min, max, step, unit] = range(k);
    rows.push(makeRow({ label, min, max, step, unit, get: () => LAYOUT[el][k], set: v => { LAYOUT[el][k] = v; layoutChanged(); }, def: DEFAULT_LAYOUT[el][k] }));
  }
  return rows;
}
function layoutChanged() { placeAll(); if (selected) proxySync(); scheduleBake(120); }
function renderPositionFields() { for (const r of posRows) r._sync?.(); }

function renderParams() {
  const chips = $('#chips');
  chips.innerHTML = SECTIONS.map(s => `<button class="chip m-key m-key--sm" type="button" data-s="${s.id}" aria-pressed="${s.id === section}">${esc(s.name)}</button>`).join('');
  chips.querySelectorAll('.chip').forEach(b => b.onclick = () => { section = b.dataset.s; const s = SECTIONS.find(x => x.id === section); if (s.element && selected?.split(':')[0] !== s.element) select(s.element, true); else { renderParams(); renderChain(true); } });
  markChips();
  const s = SECTIONS.find(x => x.id === section);
  $('#tune-title').textContent = s.name;
  const box = $('#params');
  box.innerHTML = '';
  posRows = [];
  const el = s.element;
  if (el && ['jump', 'operator', 'pad', 'cube', 'laser', 'pile', 'trail', 'whale'].includes(el) && (section === el || (el === 'jump' && section === 'jump') || section === ELEMENT_SECTION[el])) {
    const lab = document.createElement('p'); lab.className = 'group-label m-legend'; lab.textContent = el === 'trail' ? 'Bend points' : 'Position'; box.append(lab);
    posRows = positionRows(el); box.append(...posRows);
    const lab2 = document.createElement('p'); lab2.className = 'group-label m-legend'; lab2.textContent = 'Settings'; box.append(lab2);
  }
  for (const p of SCHEMA.filter(x => x.section === section)) {
    box.append(makeRow({ ...p, get: () => PARAMS[p.key], set: v => { PARAMS[p.key] = v; onParam(p); }, def: DEFAULTS[p.key] }));
  }
  const n = SCHEMA.filter(x => x.section === section && PARAMS[x.key] !== DEFAULTS[x.key]).length;
  $('#tune-meta').textContent = n ? `${n} changed` : '';
}
function markChips() {
  document.querySelectorAll('#chips .chip').forEach(b => {
    const id = b.dataset.s;
    b.classList.toggle('has-change', SCHEMA.some(x => x.section === id && PARAMS[x.key] !== DEFAULTS[x.key]));
  });
}
$('#reset-section').onclick = () => {
  const s = SECTIONS.find(x => x.id === section);
  let build = false;
  for (const p of SCHEMA.filter(x => x.section === section)) { if (PARAMS[p.key] !== DEFAULTS[p.key] && p.apply === 'build') build = true; PARAMS[p.key] = DEFAULTS[p.key]; }
  if (s.element && LAYOUT[s.element] && section === ELEMENT_SECTION[s.element]) { LAYOUT[s.element] = clone(DEFAULT_LAYOUT[s.element]); }
  if (build) buildAll(); else { placeAll(); applyLook(); }
  attachGizmo(); renderParams(); scheduleBake(0);
  toast(`${s.name} is back to its defaults.`);
};
$('#reset-all').onclick = () => {
  if (!confirm('Put every setting and every part of the machine back to the defaults? Saved versions stay.')) return;
  Object.assign(PARAMS, DEFAULTS); LAYOUT = clone(DEFAULT_LAYOUT);
  buildAll(); attachGizmo(); renderParams(); scheduleBake(0); currentVersion = null; renderVersions();
  toast('Everything is back to the defaults.');
};

/* ---------- versions ---------- */
const changedParams = () => Object.fromEntries(Object.keys(DEFAULTS).filter(k => PARAMS[k] !== DEFAULTS[k]).map(k => [k, PARAMS[k]]));
const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray() });
let workTimer = 0;
function saveWorking() { clearTimeout(workTimer); workTimer = setTimeout(() => store.set(WORK_KEY, { params: changedParams(), layout: LAYOUT, camera: cameraState() }), 400); }
const readVersions = () => { const v = store.get(VERSIONS_KEY); return Array.isArray(v) ? v : []; };
function renderVersions() {
  const list = readVersions();
  $('#versions-meta').textContent = list.length ? `${list.length} saved` : '';
  const ul = $('#vlist');
  if (!list.length) { ul.innerHTML = '<li class="empty">None saved yet.</li>'; return; }
  ul.innerHTML = list.map(v => `<li class="vitem${v.id === currentVersion ? ' is-current' : ''}" data-id="${esc(v.id)}">
    <span class="name">${esc(v.name)}</span><span class="when">${new Date(v.savedAt).toLocaleString()} · ${Object.keys(v.params || {}).length} settings changed</span>
    <span class="acts"><button class="btn m-key m-key--sm" data-a="load" type="button">Load</button><button class="btn m-key m-key--sm" data-a="over" type="button" title="Replace this version with what's in the room now">Update</button><button class="btn btn--danger m-key m-key--sm" data-a="del" type="button" aria-label="Delete ${esc(v.name)}">Delete</button></span></li>`).join('');
  ul.querySelectorAll('.vitem').forEach(li => li.querySelectorAll('button').forEach(b => b.onclick = () => versionAction(li.dataset.id, b.dataset.a)));
  if (!$('#version-name').value) $('#version-name').value = `Version ${list.length + 1}`;
}
function snapshot(name, id) { return { id: id || `v${Date.now().toString(36)}`, name, savedAt: new Date().toISOString(), params: changedParams(), layout: clone(LAYOUT), camera: cameraState() }; }
function applyVersion(v) {
  Object.assign(PARAMS, DEFAULTS, pickParams(v.params));
  LAYOUT = mergeLayout(v.layout);
  if (v.camera) { camera.position.fromArray(v.camera.position); controls.target.fromArray(v.camera.target); }
  buildAll(); select(null); renderParams(); T = 0; playing = false; updateTransport(); scheduleBake(0);
}
function versionAction(id, a) {
  const list = readVersions(), i = list.findIndex(v => v.id === id); if (i < 0) return;
  const st = $('#version-status');
  if (a === 'load') { applyVersion(list[i]); currentVersion = id; st.textContent = `Loaded “${list[i].name}”.`; }
  if (a === 'over') { list[i] = snapshot(list[i].name, id); store.set(VERSIONS_KEY, list); currentVersion = id; st.textContent = `Updated “${list[i].name}”.`; }
  if (a === 'del') { if (!confirm(`Delete “${list[i].name}”?`)) return; st.textContent = `Deleted “${list[i].name}”.`; list.splice(i, 1); store.set(VERSIONS_KEY, list); if (currentVersion === id) currentVersion = null; }
  renderVersions();
}
$('#version-save').onclick = () => {
  const list = readVersions();
  const name = $('#version-name').value.trim() || `Version ${list.length + 1}`;
  const v = snapshot(name);
  list.unshift(v);
  if (!store.set(VERSIONS_KEY, list)) { $('#version-status').textContent = 'This browser wouldn’t store it. Try exporting instead.'; return; }
  currentVersion = v.id; $('#version-name').value = '';
  $('#version-status').textContent = `Saved “${name}”.`;
  renderVersions();
};
$('#version-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#version-save').click(); });
$('#version-export').onclick = () => {
  const blob = new Blob([JSON.stringify({ kind: 'chain-reaction-versions', exportedAt: new Date().toISOString(), versions: readVersions() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chain-reaction-versions.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('#version-status').textContent = 'Exported every version as a JSON file.';
};
$('#version-import').onclick = () => $('#version-file').click();
$('#version-file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.versions;
    if (!Array.isArray(incoming)) throw new Error();
    const list = readVersions(); let added = 0;
    for (const v of incoming) { if (!v || !v.name || !v.layout) continue; if (list.some(x => x.id === v.id)) continue; list.push(v); added++; }
    store.set(VERSIONS_KEY, list); renderVersions();
    $('#version-status').textContent = `Imported ${added} ${added === 1 ? 'version' : 'versions'}.`;
  } catch { $('#version-status').textContent = 'That file isn’t a Chain Reaction export.'; }
  e.target.value = '';
};

/* ---------- transport ---------- */
const ICON_PLAY = '<path d="M6 4l14 8-14 8z"/>', ICON_PAUSE = '<path d="M7 4h3v16H7z"/><path d="M14 4h3v16h-3z"/>';
function updateTransport() {
  $('#play-icon').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
  $('#t-play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#t-play').title = playing ? 'Pause (Space)' : 'Play (Space)';
  const rew = playing && rate < 0, ff = playing && rate > 1;
  $('#t-rew').setAttribute('aria-pressed', String(rew)); $('#rew-badge').textContent = rew ? `${-rate}×` : '';
  $('#t-ff').setAttribute('aria-pressed', String(ff)); $('#ff-badge').textContent = ff ? `${rate}×` : '';
  $('#t-speed').textContent = `${baseRate}×`;
}
function play() { if (T >= run.duration - 1e-3) T = 0; rate = baseRate; playing = true; sound.resume(); updateTransport(); }
function pause() { playing = false; updateTransport(); }
function stepFrames(n) { pause(); T = clamp((Math.round(T * FPS) + n) / FPS, 0, run.duration); }
$('#t-play').onclick = () => (playing ? pause() : play());
$('#t-start').onclick = () => { T = 0; if (playing && rate < 0) pause(); };
$('#t-back').onclick = () => stepFrames(-1);
$('#t-fwd').onclick = () => stepFrames(1);
$('#t-rew').onclick = () => { if (T <= 0) T = run.duration; rate = playing && rate < 0 ? Math.max(-8, rate * 2) : -1; playing = true; sound.resume(); updateTransport(); };
$('#t-ff').onclick = () => { if (T >= run.duration) T = 0; rate = playing && rate > 1 ? Math.min(8, rate * 2) : 2; playing = true; sound.resume(); updateTransport(); };
$('#t-speed').onclick = () => { const s = [1, 0.5, 0.25, 0.1]; baseRate = s[(s.indexOf(baseRate) + 1) % s.length]; if (playing && Math.abs(rate) <= 1) rate = Math.sign(rate || 1) * baseRate; updateTransport(); };
const scrub = $('#scrub');
let scrubbing = false;
scrub.addEventListener('input', () => { scrubbing = true; T = scrub.value / 1000 * run.duration; });
scrub.addEventListener('change', () => { scrubbing = false; });
function updateClock() {
  if (!scrubbing) scrub.value = Math.round(T / run.duration * 1000);
  const f = Math.round(T * FPS);
  $('#clock').innerHTML = `${T.toFixed(2)} s <span class="dim">/ ${run.duration.toFixed(1)} s</span><span class="meta">frame ${f} of ${run.frames - 1}${playing && rate !== 1 ? ` · ${rate}×` : ''}</span>`;
}

/* ---------- header buttons and keys ---------- */
const togglePanel = (btn, panel, on) => { const v = on ?? $(panel).hidden; $(panel).hidden = !v; $(btn).setAttribute('aria-pressed', String(v)); };
$('#show-chain').onclick = () => togglePanel('#show-chain', '#chain');
$('#close-chain').onclick = () => togglePanel('#show-chain', '#chain', false);
$('#show-tune').onclick = () => togglePanel('#show-tune', '#tune');
$('#close-tune').onclick = () => togglePanel('#show-tune', '#tune', false);
function openPop(which) {
  for (const [b, p] of [['#show-versions', '#versions'], ['#show-help', '#help']]) {
    const on = p === which ? $(p).hidden : false;
    $(p).hidden = !on; $(b).setAttribute('aria-pressed', String(on));
  }
  if (!$('#versions').hidden) renderVersions();
}
$('#show-versions').onclick = () => openPop('#versions');
$('#close-versions').onclick = () => openPop(null);
$('#show-help').onclick = () => openPop('#help');
$('#close-help').onclick = () => openPop(null);
$('#mode-move').onclick = () => setTMode('translate');
$('#mode-turn').onclick = () => setTMode('rotate');
$('#fly').onclick = () => setFly(!flying);
$('#home').onclick = goHome;
const soundBtn = $('#sound');
const renderSound = () => { soundBtn.setAttribute('aria-pressed', String(soundOn)); soundBtn.title = soundOn ? 'Sound on' : 'Sound off'; soundBtn.querySelector('.wave').style.opacity = soundOn ? 1 : 0.15; };
soundBtn.onclick = () => { soundOn = !soundOn; store.set('chain-reaction:sound', soundOn); if (soundOn) sound.resume(); else sound.quiet(); renderSound(); };
renderSound();
if (matchMedia('(max-width: 700px)').matches) { togglePanel('#show-chain', '#chain', false); togglePanel('#show-tune', '#tune', false); }

addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select');
  if (typing && e.key !== 'Escape') return;
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['w', 'a', 's', 'd', 'q', 'e'].includes(k) || (flying && (k === 'arrowup' || k === 'arrowdown'))) { keys.add(k); e.preventDefault(); return; }
  if (k === 'shift') { keys.add('shift'); return; }
  switch (k) {
    case ' ': e.preventDefault(); playing ? pause() : play(); break;
    case 'arrowleft': e.preventDefault(); stepFrames(e.shiftKey ? -FPS : -1); break;
    case 'arrowright': e.preventDefault(); stepFrames(e.shiftKey ? FPS : 1); break;
    case 'j': $('#t-rew').click(); break;
    case 'l': $('#t-ff').click(); break;
    case 'k': pause(); break;
    case 'home': case '0': T = 0; break;
    case 'end': T = run.duration; pause(); break;
    case 'm': setTMode('translate'); break;
    case 'r': setTMode('rotate'); break;
    case 'f': setFly(!flying); break;
    case 'h': goHome(); break;
    case 'escape': if (typing) e.target.blur(); else if (!$('#versions').hidden || !$('#help').hidden) openPop(null); else select(null); break;
  }
});
addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); if (e.key === 'Shift') keys.delete('shift'); });
addEventListener('blur', () => keys.clear());

let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600); }

/* ---------- resize and the loop ---------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pointScale = renderer.domElement.height / (2 * Math.tan(camera.fov * D2R / 2));
}
addEventListener('resize', resize);

let last = performance.now(), camSaveT = 0;
const shakeOff = new THREE.Vector3();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const prevT = T;
  if (playing && !scrubbing) {
    T += dt * rate;
    if (T >= run.duration) { T = run.duration; pause(); }
    if (T <= 0) { T = 0; pause(); }
  }
  if (camAnim) camAnim(now);
  moveCamera(dt);
  followTick(dt);
  if (!flying) controls.update();
  clampCamera();
  if (flying && !look.drag) { /* keep the orbit target ahead of us */ }
  pointScale = renderer.domElement.height / (2 * Math.tan(camera.fov * D2R / 2));
  const k = applyTime(T);
  soundTick(prevT, T);
  // the blast shakes the camera a little
  shakeOff.set(0, 0, 0);
  if (k >= 0 && k < 1.5 && PARAMS.shake > 0) {
    const a = PARAMS.shake * 0.06 * Math.exp(-k * 3.5);
    shakeOff.set(Math.sin(now * 0.09) * a, Math.sin(now * 0.11 + 1) * a, Math.sin(now * 0.07 + 2) * a);
    camera.position.add(shakeOff);
  }
  renderer.render(scene, camera);
  camera.position.sub(shakeOff);
  updateClock();
  renderChain(false);
  if (now - camSaveT > 1500) { camSaveT = now; saveWorking(); }
  requestAnimationFrame(loop);
}

/* ---------- start ---------- */
resize();
buildAll();
run = bake(PARAMS, LAYOUT);
setFxFromRun();
renderParams();
renderMarks();
renderChain(true);
updateTransport();
$('#loading').remove();
requestAnimationFrame(loop);
// a small handle for poking at the page from the console
window.__chain = {
  get run() { return run; }, get T() { return T; }, setT: t => { T = t; }, PARAMS, get LAYOUT() { return LAYOUT; }, camera, controls, select,
  get selected() { return selected; }, get playing() { return playing; }, get rate() { return rate; },
  project: p => { const v = new THREE.Vector3(...p).project(camera); const r = canvas.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top]; },
};
