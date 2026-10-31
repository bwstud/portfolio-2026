import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { BODIES, GLAZES, SETTINGS, TOOLS } from './data.js';
import { Clay, DY, SEG, ROWS, HEAD_R } from './clay.js';
import { ClayMesh, profile, sectionPath } from './mesh.js';
import { makeClayMaterial, setBody, setGlaze } from './materials.js';
import { buildWheel, buildSet, buildStage, floorTexture, goboTexture, FLOOR, LOOKS } from './studio.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const params = new URLSearchParams(location.search);
if (params.get('ui') === '0') document.body.classList.add('no-ui');
const store = {
  get(k) { try { return localStorage.getItem('pottery:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('pottery:' + k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('pottery:' + k); } catch {} },
};
const json = (k, fallback) => { try { return JSON.parse(store.get(k)) ?? fallback; } catch { return fallback; } };
const cm = v => (v * 100).toFixed(1) + ' cm';
const mm = v => (v * 1000).toFixed(1) + ' mm';
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------- state ---------- */
const S = {
  phase: 'setup',
  body: BODIES[store.get('body')] ? store.get('body') : 'stoneware',
  kg: Number(store.get('kg')) || 1.25,
  setting: SETTINGS[store.get('setting')] ? store.get('setting') : 'workshop',
  tool: 'center', pressure: 1, size: 1, auto: store.get('auto') !== '0', sound: store.get('sound') !== '0',
  target: 0, rpm: 0, lastSpin: 160, dir: 1, angle: 0,
  foot: 'flat', glaze: 'celadon', inside: 'same', dip: 0.85, thick: 0.5,
  look: 'gallery', turntable: true, name: '',
};

/* ---------- renderer, scene, camera ---------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.75 : 2));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15110e);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.02, 60);
camera.position.set(0.05, 0.36, 0.66);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.16;
controls.maxDistance = 2.6;
controls.maxPolarAngle = Math.PI * 0.6;
controls.target.set(0, 0.06, 0);

// throwing light: one spot shining through the setting's gobo, plus the HDR for fill and reflections
const key = new THREE.SpotLight(0xffffff, 20, 0, 0.45, 0.3, 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.3;
key.shadow.camera.far = 8;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.002;
key.shadow.radius = 4;
const keyAim = new THREE.Vector3(0, -0.05, 0);
key.target.position.copy(keyAim);
const studio = new THREE.Group();
studio.add(key, key.target);
scene.add(studio);
const stage = buildStage();
studio.add(stage.group);

const wheel = buildWheel();
studio.add(wheel.group);

// the photo set for the finished piece
const set = buildSet();
const vKey = new THREE.SpotLight(0xffffff, 20, 0, 0.45, 0.85, 1.6);
vKey.castShadow = true;
vKey.shadow.mapSize.set(2048, 2048);
vKey.shadow.bias = -0.0002;
vKey.shadow.radius = 6;
const vSoft = new THREE.RectAreaLight(0xffffff, 4, 0.7, 0.5);
const vRim = new THREE.SpotLight(0xffffff, 8, 0, 0.5, 0.9, 1.6);
set.group.add(vKey, vKey.target, vSoft, vRim, vRim.target);
set.group.visible = false;
scene.add(set.group);

/* ---------- the clay ---------- */
const clay = new Clay();
const { mat: clayMat, u: clayU } = makeClayMaterial();
const clayGeo = new ClayMesh(THREE);
const clayMesh = new THREE.Mesh(clayGeo.geometry, clayMat);
clayMesh.castShadow = clayMesh.receiveShadow = true;
clayMesh.frustumCulled = false;
const spinner = new THREE.Group();     // turns with the wheel
spinner.add(clayMesh);
scene.add(spinner);
spinner.visible = false;

// a ring cut off by the needle, flying away
const offcutClay = new Clay();
const offcutGeo = new ClayMesh(THREE);
const offcutMat = clayMat.clone();
offcutMat.onBeforeCompile = clayMat.onBeforeCompile;
offcutMat.customProgramCacheKey = clayMat.customProgramCacheKey;
offcutMat.transparent = true;
const offcut = new THREE.Mesh(offcutGeo.geometry, offcutMat);
offcut.frustumCulled = false;
offcut.visible = false;
scene.add(offcut);
let offcutT = -1;

// guides: the cross-section in the plane facing you, a cursor, and the ring the tool is touching
const guideMat = new THREE.LineBasicMaterial({ color: 0xe8a477, transparent: true, opacity: 0.55, depthTest: false });
const sectionLine = new THREE.LineSegments(new THREE.BufferGeometry(), guideMat);
sectionLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ROWS * 2 + 140) * 12), 3));
sectionLine.renderOrder = 10;
sectionLine.frustumCulled = false;
const contact = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * TAU), 0, Math.sin(i / 96 * TAU)))),
  new THREE.LineBasicMaterial({ color: 0xffd2ae, transparent: true, opacity: 0.85 }));
const cursor = new THREE.Mesh(new THREE.RingGeometry(0.0032, 0.0048, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }));
cursor.renderOrder = 11;
const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.3, 0.0012, 0), new THREE.Vector3(0.3, 0.0012, 0)]), new THREE.LineBasicMaterial({ color: 0xdddddd }));
wire.visible = false;
scene.add(sectionLine, contact, cursor, wire);
sectionLine.visible = contact.visible = cursor.visible = false;

/* ---------- post ---------- */
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 0.8, aperture: 0.0016, maxblur: 0.006 });
bokeh.enabled = false;
composer.addPass(bokeh);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.28 }, grain: { value: 0.018 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vignette, grain, time; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    // grain per screen pixel, not per texel of an arbitrary grid, so it stays fine on any display
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.15, 1.0)));
      c.rgb += (h(floor(gl_FragCoord.xy)) - 0.5) * grain;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // keep the clay clear of the panels: left of the side panel on desktop, above the dock on a phone
  if (w > 760) camera.setViewOffset(w, h, S.phase === 'view' ? 0 : Math.min(150, w * 0.08), 0, w, h);
  else camera.setViewOffset(w, h, 0, S.phase === 'setup' ? h * 0.2 : h * 0.12, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------- settings ---------- */
const rgbe = new RGBELoader().setDataType(THREE.FloatType);
const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = new Map();
function loadHDR(file) {
  if (!envCache.has(file)) {
    envCache.set(file, new Promise((res, rej) => rgbe.load('assets/' + file, tex => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(tex).texture;
      res(env);
      tex.dispose();
    }, undefined, rej)));
  }
  return envCache.get(file);
}
let keyBase = { intensity: 20, pos: new THREE.Vector3() }, keyFlicker = 0, keySway = 0;
async function applySetting(id) {
  S.setting = id;
  store.set('setting', id);
  const s = SETTINGS[id];
  syncChoices();
  // the stage changes at once; the HDR's reflections follow when it has loaded
  if (S.phase !== 'view') stageSetting(s);
  const env = await loadHDR(s.hdr);
  if (S.setting !== id || S.phase === 'view') return;
  scene.environment = env;
  scene.environmentIntensity = s.env;
}
function stageSetting(s) {
  const L = s.light;
  renderer.toneMappingExposure = s.exposure;
  stage.floorMat.map = floorTexture(s.floor.kind, s.floor.color);
  stage.floorMat.roughness = s.floor.rough;
  stage.floorMat.needsUpdate = true;
  stage.wallMat.color.set(s.wall);
  scene.fog = new THREE.Fog(s.fog, 2.2, 6.5);
  scene.background = new THREE.Color(s.fog);
  keyBase.pos.fromArray(L.pos);
  key.position.copy(keyBase.pos);
  key.target.position.copy(keyAim);
  key.color.set(L.color);
  // spot intensity is in candela; lux at the wheel times distance squared
  keyBase.intensity = key.intensity = L.lux * keyBase.pos.distanceToSquared(keyAim);
  key.angle = L.angle;
  key.penumbra = L.penumbra;
  key.map = goboTexture(L.gobo);
  keyFlicker = L.flicker || 0;
  keySway = L.sway || 0;
}

/* ---------- history ---------- */
let hist = [], hi = -1;
function commit(label, tool = '') {
  if (hi < hist.length - 1) {
    const lost = hist.length - 1 - hi;
    if (lost >= 3) {
      const tip = hist[hist.length - 1];
      saveVersion(`Before rewind, ${new Date().toTimeString().slice(0, 5)}`, tip.snap, { quiet: true });
      toast(`The ${lost} later steps were kept as a version.`);
    }
    hist.length = hi + 1;
  }
  hist.push({ label, tool, snap: clay.snapshot() });
  if (hist.length > 500) hist.shift();
  hi = hist.length - 1;
  passiveDirty = false;
  dirty = true;
  syncHistory();
  saveSession();
}
function gotoStep(i) {
  i = clamp(i, 0, hist.length - 1);
  if (i === hi || !hist[i]) return;
  hi = i;
  clay.restore(hist[i].snap);
  dirty = true;
  syncHistory();
  saveSession();
}
const undo = () => gotoStep(hi - 1);
const redo = () => gotoStep(hi + 1);
function syncHistory() {
  const h = $('history');
  h.max = Math.max(0, hist.length - 1);
  h.value = hi;
  h.disabled = hist.length < 2;
  $('undo').disabled = hi <= 0;
  $('redo').disabled = hi >= hist.length - 1;
  const e = hist[hi];
  $('hist-out').innerHTML = e ? `<b>${e.label}</b> <span>· ${hi + 1} of ${hist.length}</span>` : '';
}

/* ---------- saving: the session and named versions ---------- */
function b64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str, Type) {
  const s = atob(str), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Type(u8.buffer);
}
function packSnap(s) {
  let marks = null;
  if (s.marks && s.marks.some(v => v !== 0)) {
    const q = new Int8Array(s.marks.length);
    for (let i = 0; i < q.length; i++) q[i] = clamp(Math.round(s.marks[i] / 0.00005), -127, 127);
    marks = b64(q);
  }
  return { ro: b64(s.ro), ri: b64(s.ri), ring: b64(s.ring), height: s.height, wet: s.wet, offset: s.offset, rim: s.rim, marks };
}
function unpackSnap(p) {
  let marks = null;
  if (p.marks) { const q = unb64(p.marks, Int8Array); marks = new Float32Array(SEG * (ROWS + 1)); for (let i = 0; i < q.length; i++) marks[i] = q[i] * 0.00005; }
  return { ro: unb64(p.ro, Float32Array), ri: unb64(p.ri, Float32Array), ring: unb64(p.ring, Float32Array), height: p.height, wet: p.wet, offset: p.offset, rim: p.rim, marks };
}
const glazeState = () => ({ foot: S.foot, glaze: S.glaze, inside: S.inside, dip: S.dip, thick: S.thick, look: S.look, name: S.name });
function record(snap) {
  return { body: S.body, kg: S.kg, setting: S.setting, phase: S.phase === 'setup' ? 'throw' : S.phase, ...glazeState(), snap: packSnap(snap) };
}
let sessionTimer = 0;
function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => { if (clay.height > 0) store.set('session', JSON.stringify(record(clay.snapshot()))); }, 400);
}
let versions = json('versions', []);
function saveVersion(name, snap = clay.snapshot(), { quiet = false } = {}) {
  name = (name || '').trim() || `Version ${versions.length + 1}`;
  const v = { name, savedAt: new Date().toISOString(), ...record(snap) };
  const at = versions.findIndex(x => x.name === name);
  if (at >= 0) versions[at] = v; else versions.unshift(v);
  if (!store.set('versions', JSON.stringify(versions))) {
    if (at < 0) versions.shift();
    toast('Not saved: this browser’s storage is full or unavailable.', { bad: true });
    return;
  }
  if (!quiet) toast(`Saved “${name}”`);
  renderVersions();
}
function loadRecord(v, { label = 'Loaded' } = {}) {
  S.body = v.body; S.kg = v.kg;
  Object.assign(S, { foot: v.foot || 'flat', glaze: v.glaze || 'celadon', inside: v.inside || 'same', dip: v.dip ?? 0.85, thick: v.thick ?? 0.5, look: v.look || 'gallery', name: v.name || '' });
  clay.body = BODIES[S.body];
  clay.restore(unpackSnap(v.snap));
  setBody(clayU, S.body);
  hist = []; hi = -1;
  commit(label);
  dirty = true;
  spinner.visible = true;
  if (v.setting && v.setting !== S.setting) applySetting(v.setting);
  setPhase(v.phase === 'view' ? 'view' : v.phase === 'glaze' ? 'glaze' : 'throw', { instant: true });
}

/* ---------- sound: the wheel's hum and wet clay under the hands ---------- */
const audio = { ctx: null };
function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = S.sound ? 0.5 : 0; master.connect(ctx.destination);
    const hum = ctx.createOscillator(); hum.type = 'sawtooth';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const humGain = ctx.createGain(); humGain.gain.value = 0;
    hum.connect(lp).connect(humGain).connect(master); hum.start();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0, b = 0; i < d.length; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 6; }
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const rub = ctx.createGain(); rub.gain.value = 0;
    noise.connect(bp).connect(rub).connect(master); noise.start();
    Object.assign(audio, { ctx, master, hum, humGain, bp, rub, lp });
  } catch { audio.ctx = null; }
}
function thud() {
  if (!audio.ctx || !S.sound) return;
  const { ctx, master } = audio, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(110, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.18);
  g.gain.setValueAtTime(0.5, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + 0.3);
}
function updateAudio(touching) {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime, r = S.phase === 'view' ? 0 : S.rpm;
  audio.hum.frequency.setTargetAtTime(30 + r * 0.22, t, 0.1);
  audio.humGain.gain.setTargetAtTime(Math.min(0.07, r / 240 * 0.07), t, 0.15);
  audio.rub.gain.setTargetAtTime(touching ? 0.05 * clamp(r / 90, 0.2, 1) * (0.4 + clay.wet) : 0, t, 0.05);
  audio.bp.frequency.setTargetAtTime(380 + clay.wet * 900 + r * 1.5, t, 0.1);
}

/* ---------- input: hands on the clay ----------
   The wheel spins, so a tool acts on the whole ring at its height. Where the pointer lands is read
   in the vertical plane through the axis that faces you, which turns the 3D view into the same
   cross-section the side panel draws: distance from the axis, and height. */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(), right = new THREE.Vector3();
const ptr = { x: 0, y: 0, over: false, pen: 1 };
let stroke = null, dirty = true, passiveDirty = false, hover = null, lastWarn = '', warnAt = 0, touches = new Set();
let cardScale = null;

function facingPlane() {
  tmpN.set(camera.position.x, 0, camera.position.z);
  if (tmpN.lengthSq() < 1e-6) tmpN.set(0, 0, 1);
  tmpN.normalize();
  plane.setFromNormalAndCoplanarPoint(tmpN, tmpV.set(0, 0, 0));
  right.crossVectors(UP, tmpN).normalize();
}
function readPlane(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  facingPlane();
  const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  const sr = hit.dot(right);
  return { r: Math.abs(sr), y: hit.y, side: Math.sign(sr) || 1, point: hit };
}
// where the ray first meets the outer wall, as an angle round the clay's own axis and a height
function readSurface(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction, h = clay.height;
  const inside = t => { const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; return y >= 0 && y <= h && Math.hypot(x, z) <= clay.sample(clay.ro, y); };
  let t = 0, step = 0.002, found = -1;
  for (; t < 4; t += step) if (inside(t)) { found = t; break; }
  if (found < 0) return null;
  let a = found - step, b = found;
  for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (inside(m)) b = m; else a = m; }
  const p = new THREE.Vector3().copy(d).multiplyScalar(b).add(o);
  const local = p.clone().applyAxisAngle(UP, -spinner.rotation.y);
  return { theta: Math.atan2(-local.z, local.x - clay.offset), y: p.y, point: p };
}

const isSurfaceTool = t => t === 'carve' || t === 'press';
function beginStroke(src, at, e) {
  if (S.phase !== 'throw' || S.tool === 'look' || !clay.height || placing > 0) return false;
  initAudio();
  if (passiveDirty) commit('Settled');
  stroke = { src, id: e?.pointerId, tool: S.tool, r: at.r, y: at.y, pr: at.r, py: at.y, last: null, cx: e?.clientX, cy: e?.clientY };
  clay.begin(S.tool, at.r, at.y);
  if (isSurfaceTool(S.tool) && clay.marks) clay.marks = clay.marks.slice();     // history keeps the old map
  document.body.classList.add('is-working');
  if (S.tool === 'press') stamp(true);
  return true;
}
function endStroke(cancel = false) {
  if (!stroke) return;
  const s = stroke;
  stroke = null;
  document.body.classList.remove('is-working');
  if (cancel) return;
  if (s.tool === 'needle') {
    if (S.rpm < 30) { toast('Spin the wheel to trim with the needle.'); return; }
    const res = clay.cut(s.y);
    if (res.warn) { toast(res.warn); return; }
    flingOffcut(res.removed);
    navigator.vibrate?.(12);
  }
  dirty = true;
  commit(TOOLS[s.tool].name, s.tool);
}
function stamp(first) {
  const hit = readSurface(stroke.cx, stroke.cy);
  if (!hit) return;
  const T = TOOLS[stroke.tool], sig = T.size * S.size, p = S.pressure * ptr.pen;
  const spinning = S.rpm > 4;
  if (stroke.tool === 'press') {
    const l = stroke.last;
    const r = clay.sample(clay.ro, hit.y);
    const gap = l ? Math.hypot((hit.theta - l.theta) * r, hit.y - l.y) : Infinity;
    if (first || gap > sig * 2.4) { clay.mark(hit.theta, hit.y, 0.0032 * p, sig, spinning); stroke.last = hit; dirty = true; }
  } else {
    const l = stroke.last || hit;
    let dth = hit.theta - l.theta;
    if (dth > Math.PI) dth -= TAU; else if (dth < -Math.PI) dth += TAU;
    const r = clay.sample(clay.ro, hit.y), len = Math.hypot(dth * r, hit.y - l.y);
    const steps = Math.max(1, Math.ceil(len / (sig * 0.4)));
    for (let i = 1; i <= steps; i++) clay.mark(l.theta + dth * i / steps, l.y + (hit.y - l.y) * i / steps, 0.0019 * p, sig, spinning);
    stroke.last = hit;
    dirty = true;
  }
}

canvas.addEventListener('pointerdown', e => {
  touches.add(e.pointerId);
  if (e.pointerType === 'touch' && touches.size > 1) { endStroke(); return; }     // two fingers: look around
  if (e.button !== 0) return;
  ptr.pen = e.pointerType === 'pen' && e.pressure > 0 ? 0.5 + e.pressure : 1;
  const at = readPlane(e.clientX, e.clientY);
  if (!at) return;
  if (beginStroke('3d', at, e)) {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch' && !store.get('coached')) showCoach();
  }
});
canvas.addEventListener('pointermove', e => {
  ptr.x = e.clientX; ptr.y = e.clientY; ptr.over = true;
  if (e.pointerType === 'pen' && e.pressure > 0) ptr.pen = 0.5 + e.pressure;
  if (stroke && stroke.src === '3d' && e.pointerId === stroke.id) { stroke.cx = e.clientX; stroke.cy = e.clientY; }
});
const lift = e => {
  touches.delete(e.pointerId);
  if (stroke && stroke.src === '3d' && e.pointerId === stroke.id) endStroke(e.type === 'pointercancel');
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ptr.over = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function syncControls() {
  const look = S.tool === 'look' || S.phase !== 'throw';
  controls.mouseButtons = { LEFT: look ? THREE.MOUSE.ROTATE : -1, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: look ? THREE.TOUCH.ROTATE : -1, TWO: THREE.TOUCH.DOLLY_ROTATE };
}

// the cross-section card: the same tools, worked on a flat drawing for precision
const card = $('section-card');
const cardPoint = e => {
  const svg = $('section'), b = svg.getBoundingClientRect(), sc = cardScale;
  if (!sc) return null;
  const vx = (e.clientX - b.left) / b.width * 268, vy = (e.clientY - b.top) / b.height * 210;
  return { r: Math.abs(vx - 134) / sc.s, y: (sc.base - vy) / sc.s };
};
card.addEventListener('pointerdown', e => {
  if (isSurfaceTool(S.tool)) { toast('Carving and pressing work on the 3D view, where you can see the surface.'); return; }
  const at = cardPoint(e);
  if (!at) return;
  if (S.tool === 'look') selectTool('pull');
  if (beginStroke('card', at, e)) { card.setPointerCapture(e.pointerId); cardScale.frozen = true; stroke.at = at; }
});
card.addEventListener('pointermove', e => {
  const at = cardPoint(e);
  hover = at ? { ...at, src: 'card' } : null;
  if (stroke && stroke.src === 'card' && e.pointerId === stroke.id && at) stroke.at = at;
});
card.addEventListener('pointerleave', () => { if (!stroke) hover = null; });
const cardUp = e => { if (stroke && stroke.src === 'card' && e.pointerId === stroke.id) { endStroke(e.type === 'pointercancel'); if (cardScale) cardScale.frozen = false; } };
card.addEventListener('pointerup', cardUp);
card.addEventListener('pointercancel', cardUp);

function workStroke(dt) {
  let at;
  if (stroke.src === 'card') at = stroke.at;
  else at = readPlane(stroke.cx, stroke.cy);
  if (!at) return;
  stroke.pr = stroke.r; stroke.py = stroke.y;
  stroke.r = at.r; stroke.y = at.y; stroke.side = at.side || 1;
  if (isSurfaceTool(stroke.tool)) { stamp(false); return; }
  if (stroke.tool === 'needle') return;
  const T = TOOLS[stroke.tool];
  const w = clay.apply(stroke.tool, {
    r: stroke.r, y: stroke.y, pr: stroke.pr, py: stroke.py, dt,
    p: S.pressure * ptr.pen, size: T.size * S.size, rpm: S.rpm,
  });
  if (w) { lastWarn = w; warnAt = performance.now(); }
  dirty = true;
}

/* ---------- the needle's offcut ---------- */
function flingOffcut(rem) {
  if (!rem || rem.ro.length < 2) return;
  const n = rem.ro.length;
  offcutClay.ro.fill(0); offcutClay.ri.fill(0); offcutClay.ring.fill(0);
  offcutClay.ro.set(rem.ro); offcutClay.ri.set(rem.ri);
  offcutClay.ri[0] = Math.max(offcutClay.ri[0], 0.0015);
  offcutClay.height = rem.height - rem.y0;
  offcutClay.rim = 0.6;
  offcutGeo.update(offcutClay, { offset: clay.offset });
  offcut.position.set(0, rem.y0, 0);
  offcut.rotation.set(0, spinner.rotation.y, 0);
  offcut.visible = n > 1;
  offcutT = 0;
}

/* ---------- placing the clay ---------- */
let placing = 0, thudded = false;
function placeClay() {
  clay.lump(S.kg, BODIES[S.body]);
  setBody(clayU, S.body);
  store.set('body', S.body);
  store.set('kg', String(S.kg));
  hist = []; hi = -1;
  commit(`Placed ${S.kg} kg`);
  spinner.visible = true;
  placing = 1;
  thudded = false;
  dirty = true;
  S.name = '';
  setPhase('throw');
  selectTool('center');
  frameView('seat');
  // on shorter screens the open note covers the top of the tool rail: fold it away (not remembered)
  if (innerHeight < 900) {
    const n = document.querySelector('.notes.is-open');
    if (n) { n.classList.remove('is-open'); n.querySelector('.notes__head')?.setAttribute('aria-expanded', 'false'); }
  }
}

/* ---------- phases ---------- */
const show = (el, on) => { el.hidden = !on; };
function setPhase(p, { instant = false } = {}) {
  const prev = S.phase;
  S.phase = p;
  document.body.dataset.phase = p;
  document.body.classList.toggle('is-viewing', p === 'view');
  show($('setup'), p === 'setup');
  show($('tools'), p === 'throw');
  show($('toolhint'), p === 'throw' && !coarse);
  show($('side'), p === 'throw');
  show($('dock'), p === 'throw');
  show($('glaze'), p === 'glaze');
  show($('viewbar'), p === 'view');
  show($('plaque'), p === 'view');
  show($('steps'), p !== 'setup');
  show($('new-piece'), p !== 'setup');
  show($('sheet-toggle'), p === 'throw' || p === 'glaze');
  $('sheet-toggle').textContent = p === 'glaze' ? 'Glaze' : 'Piece';
  $('side').classList.remove('is-open');
  $('glaze').classList.toggle('is-open', p === 'glaze');
  $('setup-cancel')?.toggleAttribute('hidden', !(p === 'setup' && clay.height > 0));
  for (const b of document.querySelectorAll('#steps button')) {
    const order = ['throw', 'glaze', 'view'];
    b.toggleAttribute('aria-current', b.dataset.step === p);
    if (b.dataset.step === p) b.setAttribute('aria-current', 'step');
    b.classList.toggle('is-done', order.indexOf(b.dataset.step) < order.indexOf(p));
    b.disabled = b.dataset.step === 'view' && p === 'throw';
  }
  clay.firm = p !== 'throw';
  syncControls();
  resize();

  const viewing = p === 'view';
  studio.visible = !viewing;
  set.group.visible = viewing;
  bokeh.enabled = viewing;
  spinner.scale.setScalar(viewing ? 1 - BODIES[S.body].shrink : 1);
  if (p === 'throw') {
    wetLook.target = 1; clayU.uFired.value = 0; clayU.uGlazed.value = 0;
    if (prev !== 'throw') { S.target = 0; S.rpm = instant ? 0 : S.rpm; }
  }
  if (p === 'glaze') {
    wetLook.target = 0; clayU.uFired.value = 1;
    S.target = 14;
    applyGlaze();
    if (prev === 'throw' && !instant) cutFree();
    frameView('seat');
  }
  if (p === 'view') {
    wetLook.target = 0; clayU.uFired.value = 1; S.target = 0; S.rpm = 0;
    applyGlaze();
    applyLook(S.look);
    shot('hero', true);
    renderPlaque();
  } else if (prev === 'view') {
    applySetting(S.setting);
    frameView('seat', true);
  }
  if (instant) clayU.uWetLook.value = wetLook.target;
  dirty = true;
  saveSession();
}
const wetLook = { target: 1 };

let wireT = -1;
function cutFree() { wireT = 0; wire.visible = true; navigator.vibrate?.(8); }

function applyGlaze() {
  setGlaze(clayU, S.glaze, { dip: S.dip, thick: S.thick, inside: S.inside, height: clay.height });
  syncGlazeUI();
}
function fire() {
  initAudio();
  const body = BODIES[S.body], kiln = $('kiln'), t0 = performance.now(), dur = 2600;
  kiln.classList.add('is-on');
  $('kiln-say').textContent = `Firing to cone ${body.cone}`;
  let switched = false;
  const tick = now => {
    const f = clamp((now - t0) / dur, 0, 1);
    const temp = Math.round(20 + (body.temp - 20) * (f < 0.75 ? Math.pow(f / 0.75, 1.4) : 1 - (f - 0.75) / 0.25 * 0.92));
    $('kiln-temp').textContent = `${temp.toLocaleString()} °C`;
    if (f > 0.75) $('kiln-say').textContent = 'Cooling';
    if (!switched && f > 0.45) { switched = true; setPhase('view'); }
    if (f < 1) requestAnimationFrame(tick);
    else setTimeout(() => kiln.classList.remove('is-on'), 150);
  };
  requestAnimationFrame(tick);
}

/* ---------- the viewer ---------- */
async function applyLook(id) {
  S.look = id;
  const L = LOOKS[id];
  const { env } = await loadHDR('studio_small_09_1k.hdr');
  if (S.phase !== 'view') return;
  scene.environment = env;
  scene.environmentIntensity = L.env;
  scene.background = new THREE.Color(L.backdrop).multiplyScalar(0.5);
  scene.fog = null;
  renderer.toneMappingExposure = L.exposure;
  set.sweepMat.color.set(L.backdrop);
  set.plinthMat.color.set(L.plinth);
  const h = clay.height;
  const pw = clamp(clay.stats().width * (1 - BODIES[S.body].shrink) * 1.75 / 0.46, 0.45, 1.2);
  set.plinth.scale.set(pw, 1, pw);
  vKey.position.fromArray(L.key.pos); vKey.color.set(L.key.color); vKey.intensity = L.key.intensity; vKey.angle = L.key.angle;
  vKey.target.position.set(0, h * 0.4, 0);
  vSoft.position.fromArray(L.soft.pos); vSoft.color.set(L.soft.color); vSoft.intensity = L.soft.intensity; vSoft.lookAt(0, h * 0.5, 0);
  vRim.position.fromArray(L.rim.pos); vRim.color.set(L.rim.color); vRim.intensity = L.rim.intensity;
  vRim.target.position.set(0, h * 0.5, 0);
  for (const b of document.querySelectorAll('#looks button')) b.setAttribute('aria-pressed', b.dataset.look === id);
  saveSession();
}
let camTween = null;
function tweenCamera(pos, target, dur = 0.9) {
  camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0, dur };
}
function pieceSize() {
  const s = spinner.scale.x;
  return { h: clay.height * s, r: clay.stats().width / 2 * s };
}
function shot(id, instant) {
  const { h, r } = pieceSize(), size = Math.max(h, r * 1.6, 0.06);
  const d = (size * 2.6 + 0.15) * Math.max(1, Math.sqrt(1 / camera.aspect) * 0.85);
  const shots = {
    hero: [new THREE.Vector3(-0.45, 0.42, 0.8).normalize().multiplyScalar(d), new THREE.Vector3(0, h * 0.42, 0)],
    eye: [new THREE.Vector3(0, h * 0.5, d * 0.95), new THREE.Vector3(0, h * 0.48, 0)],
    above: [new THREE.Vector3(0.2, 1, 0.45).normalize().multiplyScalar(d * 0.9), new THREE.Vector3(0, h * 0.3, 0)],
    detail: [new THREE.Vector3(0.14, h + size * 0.3, size * 0.95), new THREE.Vector3(0, h * 0.8, 0)],
  };
  const [p, t] = shots[id];
  if (id !== 'eye') p.y += h * 0.3;
  if (instant) { camera.position.copy(p); controls.target.copy(t); camTween = null; } else tweenCamera(p, t);
  for (const b of document.querySelectorAll('#shots button')) b.setAttribute('aria-pressed', b.dataset.shot === id);
}
function frameView(id = 'seat', instant = false) {
  const h = Math.max(clay.height, 0.06), w = Math.max(clay.stats().width / 2, 0.06);
  const f = Math.max(1, (Math.max(h, w * 1.3) + 0.08) / 0.2) * Math.max(1, Math.sqrt(1 / camera.aspect) * 0.85);
  const t = new THREE.Vector3(0, h * 0.45, 0);
  const views = {
    seat: new THREE.Vector3(0.05, 0.3, 0.62), side: new THREE.Vector3(0.62, 0.16, 0.08),
    above: new THREE.Vector3(0.04, 0.68, 0.22), low: new THREE.Vector3(0.32, 0.04, 0.55),
  };
  const p = views[id].clone().multiplyScalar(f * 1.2).add(new THREE.Vector3(0, h * 0.45, 0));
  if (instant) { camera.position.copy(p); controls.target.copy(t); } else tweenCamera(p, t, 0.7);
}
function renderPlaque() {
  const body = BODIES[S.body], g = GLAZES[S.glaze], s = clay.stats(), k = 1 - body.shrink;
  const kind = s.hollow ? (s.width > s.height * 1.6 ? 'bowl' : s.height > s.width * 1.6 ? 'vase' : s.width < 0.11 && s.height < 0.13 ? 'cup' : 'pot') : 'form';
  const name = S.name || `${g.none ? 'Bare' : g.name} ${kind}`;
  $('piece-name').value = name;
  $('plaque-say').textContent = `${body.name}${g.none ? '' : ', ' + g.name.toLowerCase()} glaze${S.inside === 'liner' ? ' with a white liner' : ''}. Fired to cone ${body.cone}.`;
  $('plaque-facts').innerHTML = `
    <dt>Height</dt><dd>${cm(s.height * k)}</dd>
    <dt>Width</dt><dd>${cm(s.width * k)}</dd>
    <dt>Weight</dt><dd>${(s.kg * 0.82).toFixed(2)} kg</dd>
    <dt>Shrinkage</dt><dd>${Math.round(body.shrink * 100)}%</dd>`;
}
function snapImage() {
  const was = [cursor.visible, contact.visible, sectionLine.visible];
  cursor.visible = contact.visible = sectionLine.visible = false;
  composer.render();
  canvas.toBlob(b => {
    if (!b) return;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `${($('piece-name').value || 'pot').replace(/[^\w\- ]+/g, '').trim() || 'pot'}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
  [cursor.visible, contact.visible, sectionLine.visible] = was;
}

/* ---------- UI: setup ---------- */
const ICONS = {
  look: '<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="10" cy="10" r="2.3"/>',
  center: '<path d="M6.5 16.5c-1-1.5-1.5-3.5-1.5-6.5M13.5 16.5c1-1.5 1.5-3.5 1.5-6.5"/><path d="M7 7.5c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5v6.5H7z"/><path d="M2 10h1.8M16.2 10H18"/>',
  open: '<path d="M3.5 8c0 5 2.8 8.5 6.5 8.5s6.5-3.5 6.5-8.5"/><path d="M10 2.5v8M7.5 8l2.5 2.5L12.5 8"/>',
  pull: '<path d="M5.5 17V9M14.5 17V9"/><path d="M10 14V3M7.5 5.5L10 3l2.5 2.5"/>',
  shape: '<path d="M7 3c-3.2 4-3.2 10 0 14M13 3c3.2 4 3.2 10 0 14"/><path d="M1.8 10h2M16.2 10h2"/>',
  rib: '<path d="M3 13.5c0-5 5-9.5 10-9.5 2.7 0 4 1.7 4 3.6 0 5.3-6 8.9-10.4 8.9C4.4 16.5 3 15.4 3 13.5z"/>',
  sponge: '<rect x="3" y="6" width="14" height="9" rx="3.5"/><circle cx="7.5" cy="10" r=".9"/><circle cx="12" cy="9" r=".9"/><circle cx="10.5" cy="12.6" r=".9"/>',
  needle: '<path d="M2.5 17.5l9.5-9.5"/><path d="M12 8l2.6-2.6a1.6 1.6 0 0 1 2.3 2.3L14.3 10.3z"/>',
  loop: '<path d="M2.5 17.5l7-7"/><path d="M9.5 10.5c0-3.4 2.2-6.5 5.2-6.5 1.4 0 2.3.9 2.3 2.2 0 3-3.2 5.3-6.4 5.3"/>',
  carve: '<path d="M2.5 17.5l8-8"/><path d="M10.5 9.5l2.2-5.3 3.1 3.1z"/>',
  press: '<path d="M6 15.5c-1.2-2.3-1.2-6 1-8.2s6.3-2 7.5 1"/><path d="M8.6 15.5c-.6-2.2 0-5.1 1.6-6.1s3.6 0 4.2 1.6"/><path d="M11.2 15.5c0-2.2.6-3.6 2-3.6"/>',
  water: '<path d="M10 2.8s5 5.6 5 9.2a5 5 0 0 1-10 0c0-3.6 5-9.2 5-9.2z"/>',
};
const AMOUNTS = [
  { kg: 0.5, name: 'Cup', d: 'M8 8h12l-1 11H9z' },
  { kg: 1, name: 'Mug', d: 'M7 6h11v13H7zM18 9h2.5a2 2 0 0 1 0 6H18' },
  { kg: 1.5, name: 'Bowl', d: 'M3 8h22c0 6-5 11-11 11S3 14 3 8z' },
  { kg: 2.5, name: 'Vase', d: 'M11 3h6v3c4 3 5 7 3 11l-1 2H9l-1-2c-2-4-1-8 3-11z' },
  { kg: 3.5, name: 'Big jar', d: 'M9 3h10v2c5 2 6 9 3 14H6C3 14 4 7 9 5z' },
];
const MAKES = [[0.75, 'Enough for an espresso cup or a small bud vase'], [1.25, 'A good size for a mug or a small bowl'], [2, 'A cereal bowl, a big mug or a short vase'], [3, 'A serving bowl or a tall vase'], [9, 'A large jar. Centring this much takes some work']];
const ROOM_SWATCH = {
  workshop: 'linear-gradient(160deg,#d7dadb,#a4a8aa 40%,#5f5d59)', attic: 'linear-gradient(160deg,#f3d7a8,#b0855a 45%,#4d3420)',
  veranda: 'linear-gradient(160deg,#f2f0e2,#c3cbbd 45%,#7f8c80)', fireside: 'linear-gradient(160deg,#c06a32,#3c2c22 45%,#0f0a07)',
};

function choice(html, pressed, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'choice'; b.innerHTML = html;
  b.setAttribute('aria-pressed', pressed);
  b.addEventListener('click', onClick);
  return b;
}
function bar(v) { return `<span style="display:inline-block;width:34px;height:4px;border-radius:2px;background:linear-gradient(90deg,var(--accent) ${v * 100}%,rgba(255,255,255,.12) 0);vertical-align:middle;margin-left:4px"></span>`; }
function buildSetup() {
  const list = $('body-list');
  list.innerHTML = '';
  for (const [id, b] of Object.entries(BODIES)) {
    list.append(choice(`
      <div class="swatch"><span style="background:${b.wet}"></span><em>wet</em><span style="background:${b.fired}"></span><em>fired, cone ${b.cone}</em></div>
      <b>${b.name}</b><small>${b.note}</small>
      <div class="traits"><span>Plasticity${bar(b.plastic / 1.2)}</span><span>Strength${bar(b.strength / 1.35)}</span></div>`,
    S.body === id, () => { S.body = id; syncChoices(); }));
  }
  const pre = $('presets');
  pre.innerHTML = '';
  for (const a of AMOUNTS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.kg = a.kg;
    b.innerHTML = `<svg viewBox="0 0 28 22"><path d="${a.d}"/></svg>${a.name}`;
    b.addEventListener('click', () => { S.kg = a.kg; syncChoices(); });
    pre.append(b);
  }
  $('kg').addEventListener('input', e => { S.kg = Number(e.target.value); syncChoices(); });
  const rooms = $('setting-list'), place = $('place');
  rooms.innerHTML = ''; place.innerHTML = '';
  for (const [id, s] of Object.entries(SETTINGS)) {
    const html = `<span class="thumb" style="background:${ROOM_SWATCH[id]}"></span><b>${s.name}</b><small>${s.note}</small>`;
    const pick = () => applySetting(id);
    const a = choice(html, S.setting === id, pick); a.dataset.setting = id; rooms.append(a);
    const b = choice(html, S.setting === id, pick); b.dataset.setting = id; place.append(b);
  }
  for (const t of document.querySelectorAll('[data-setup-tab]')) {
    t.addEventListener('click', () => {
      for (const o of document.querySelectorAll('[data-setup-tab]')) o.setAttribute('aria-selected', o === t);
      for (const p of document.querySelectorAll('[data-setup-panel]')) p.hidden = p.dataset.setupPanel !== t.dataset.setupTab;
    });
  }
  $('begin').addEventListener('click', placeClay);
  const cancel = document.createElement('button');
  cancel.className = 'btn'; cancel.id = 'setup-cancel'; cancel.type = 'button'; cancel.textContent = 'Back to my piece';
  cancel.addEventListener('click', () => setPhase(hist[hi] ? 'throw' : 'setup'));
  $('setup-hint').before(cancel);
}
function syncChoices() {
  [...$('body-list').children].forEach((b, i) => b.setAttribute('aria-pressed', Object.keys(BODIES)[i] === S.body));
  for (const b of document.querySelectorAll('[data-setting]')) b.setAttribute('aria-pressed', b.dataset.setting === S.setting);
  for (const b of $('presets').children) b.setAttribute('aria-pressed', Number(b.dataset.kg) === S.kg);
  $('kg').value = S.kg;
  $('kg-out').textContent = `${S.kg} kg`;
  $('kg-makes').textContent = MAKES.find(([k]) => S.kg <= k)[1];
  $('setup-summary').textContent = `${S.kg} kg of ${BODIES[S.body].name.toLowerCase()} · ${SETTINGS[S.setting].name}`;
}

/* ---------- UI: tools ---------- */
function buildTools() {
  const nav = $('tools');
  const add = (id, name, keyName) => {
    const b = document.createElement('button');
    b.className = 'tool'; b.type = 'button'; b.dataset.tool = id;
    b.setAttribute('aria-label', name);
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<svg viewBox="0 0 20 20">${ICONS[id]}</svg><span class="tip">${name}<kbd>${keyName}</kbd></span>`;
    b.addEventListener('click', () => selectTool(id));
    nav.append(b);
  };
  add('look', 'Look around', 'V');
  nav.append(document.createElement('hr'));
  let group = 'hands';
  for (const [id, t] of Object.entries(TOOLS)) {
    if (t.group !== group) { nav.append(document.createElement('hr')); group = t.group; }
    add(id, t.name, t.key);
  }
  nav.append(document.createElement('hr'));
  const w = document.createElement('button');
  w.className = 'tool tool--water'; w.type = 'button';
  w.setAttribute('aria-label', 'Add water');
  w.innerHTML = `<svg viewBox="0 0 20 20">${ICONS.water}</svg><span class="tip">Add water<kbd>W</kbd></span>`;
  w.addEventListener('click', addWater);
  nav.append(w);
}
function selectTool(id) {
  S.tool = id;
  document.body.dataset.tool = id;
  for (const b of document.querySelectorAll('.tool[data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === id);
  const T = TOOLS[id];
  if (T && S.auto && S.phase === 'throw') setTarget(T.rpm);
  $('th-name').textContent = T ? T.name : 'Look around';
  $('th-how').textContent = T ? T.how : 'Drag to turn the view, scroll or pinch to zoom. Pick a tool to work the clay.';
  $('tool-name').textContent = T ? T.name : 'Look around';
  $('tool-key').textContent = T ? `key ${T.key}` : 'key V';
  $('tool-how').textContent = $('th-how').textContent;
  lastWarn = '';
  syncControls();
  syncSpeed();
}
function addWater() {
  if (S.phase !== 'throw' || !clay.height) return;
  initAudio();
  clay.wet = Math.min(1, clay.wet + 0.18);
  if (clay.wet > 0.85) toast('That’s very wet. Sponge some off or it will slump.');
  dirty = true;
}

/* ---------- UI: the wheel ---------- */
function setTarget(rpm) {
  S.target = clamp(Math.round(rpm), 0, 240);
  if (S.target > 0) S.lastSpin = S.target;
  syncSpeed();
}
function syncSpeed() {
  const f = S.target / 240;
  $('speed-in').value = S.target;
  $('speed-fill').style.width = f * 100 + '%';
  $('speed-knob').style.left = f * 100 + '%';
  const T = TOOLS[S.tool];
  const band = $('speed-band');
  if (T) {
    const lo = T.rpm ? T.rpm * 0.75 : 0, hi = T.rpm ? T.rpm * 1.25 : 12;
    band.hidden = false;
    band.style.left = lo / 240 * 100 + '%';
    band.style.width = (hi - lo) / 240 * 100 + '%';
  } else band.hidden = true;
  const stopped = S.target === 0;
  $('spin').classList.toggle('is-stopped', stopped);
  $('spin').setAttribute('aria-label', stopped ? 'Start the wheel' : 'Stop the wheel');
  $('spin-icon').innerHTML = stopped ? '<path d="M4.5 2.5v11L13.5 8z"/>' : '<rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/>';
  $('auto').setAttribute('aria-pressed', S.auto);
}
function toggleSpin() { initAudio(); setTarget(S.target > 0 ? 0 : (S.lastSpin || TOOLS[S.tool]?.rpm || 120)); }
function buildDock() {
  $('speed-in').addEventListener('input', e => { initAudio(); setTarget(Number(e.target.value)); });
  $('spin').addEventListener('click', toggleSpin);
  $('dir').addEventListener('click', () => {
    S.dir = -S.dir;
    $('dir').textContent = S.dir > 0 ? '↺' : '↻';
    $('dir').setAttribute('aria-label', S.dir > 0 ? 'Turning anticlockwise' : 'Turning clockwise');
  });
  $('speed-ticks').innerHTML = [0, 60, 120, 180, 240].map(v => `<span style="left:${v / 240 * 100}%">${v}</span>`).join('');
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('history').addEventListener('input', e => gotoStep(Number(e.target.value)));
  $('to-glaze').addEventListener('click', () => setPhase('glaze'));
  $('auto').addEventListener('click', () => { S.auto = !S.auto; store.set('auto', S.auto ? '1' : '0'); syncSpeed(); });
  $('pressure').addEventListener('input', e => {
    S.pressure = Number(e.target.value);
    $('pressure-out').textContent = S.pressure < 0.55 ? 'Light' : S.pressure < 1.1 ? 'Firm' : 'Heavy';
  });
  $('size').addEventListener('input', e => { S.size = Number(e.target.value); $('size-out').textContent = `${S.size.toFixed(1)}×`; });
  $('water').addEventListener('click', addWater);
  $('frame').addEventListener('click', () => frameView('seat'));
  for (const b of document.querySelectorAll('#views button')) b.addEventListener('click', () => frameView(b.dataset.view));
}

/* ---------- UI: side panel ---------- */
function buildSide() {
  for (const t of document.querySelectorAll('[data-tab]')) {
    t.addEventListener('click', () => {
      for (const o of document.querySelectorAll('[data-tab]')) o.setAttribute('aria-selected', o === t);
      for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== t.dataset.tab;
    });
  }
  $('save-version').addEventListener('click', () => { saveVersion($('version-name').value); $('version-name').value = ''; });
  $('version-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('save-version').click(); e.stopPropagation(); });
  $('sheet-toggle').addEventListener('click', () => {
    const el = S.phase === 'glaze' ? $('glaze') : $('side');
    const open = !el.classList.contains('is-open');
    el.classList.toggle('is-open', open);
    $('sheet-toggle').setAttribute('aria-expanded', open);
  });
  for (const g of document.querySelectorAll('[data-close-sheet]')) g.addEventListener('click', () => { g.parentElement.classList.remove('is-open'); $('sheet-toggle').setAttribute('aria-expanded', 'false'); });
  renderVersions();
}
const tmpClay = new Clay();
function thumbSVG(snap, size = 44) {
  tmpClay.restore(snap);
  const P = profile(tmpClay), st = tmpClay.stats();
  const s = (size - 6) / Math.max(st.height, st.width, 0.05);
  return `<svg viewBox="0 0 ${size} ${size}"><path d="${sectionPath(P, size, size - 3, s)}" fill="#c9a88c" fill-rule="nonzero"/><path d="M3 ${size - 2.5}H${size - 3}" stroke="rgba(255,255,255,.2)"/></svg>`;
}
function renderVersions() {
  const el = $('versions');
  $('version-name').placeholder = `Version ${versions.length + 1}`;
  if (!versions.length) { el.innerHTML = '<p class="empty">No versions yet. Save one before you try something risky.</p>'; return; }
  el.innerHTML = '';
  versions.forEach((v, i) => {
    let snap;
    try { snap = unpackSnap(v.snap); } catch { return; }
    const d = new Date(v.savedAt);
    const row = document.createElement('div');
    row.className = 'version';
    const stage = v.phase === 'view' ? `fired, ${GLAZES[v.glaze]?.name.toLowerCase()}` : v.phase === 'glaze' ? 'glazing' : 'on the wheel';
    row.innerHTML = `${thumbSVG(snap)}<div><b></b><small>${cm(snap.height)} · ${stage} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toTimeString().slice(0, 5)}</small></div>
      <div class="row"><button class="btn" type="button" data-load>Load</button><button class="btn" type="button" data-del aria-label="Delete">✕</button></div>`;
    row.querySelector('b').textContent = v.name;
    row.querySelector('[data-load]').addEventListener('click', () => { loadRecord(v, { label: `Loaded “${v.name}”` }); toast(`Loaded “${v.name}”`); });
    row.querySelector('[data-del]').addEventListener('click', () => {
      if (!confirm(`Delete “${v.name}”?`)) return;
      versions.splice(i, 1);
      store.set('versions', JSON.stringify(versions));
      renderVersions();
    });
    el.append(row);
  });
}

// the live cross-section drawing and measurements
let lastPanel = 0;
function renderPanel(now) {
  if (now - lastPanel < 90 || S.phase !== 'throw') return;
  lastPanel = now;
  const st = clay.stats(), body = BODIES[S.body];
  const P = clayGeo.points;
  // scale with headroom, in steps, so the drawing doesn't swim while you work
  if (!cardScale || !cardScale.frozen) {
    const ext = Math.ceil(Math.max(st.height * 1.1, st.width / 2 * 1.9 / 1.3, 0.06) / 0.02) * 0.02;
    const s = Math.min(185 / ext, 120 / Math.max(st.width / 2 * 1.08, 0.04));
    if (!cardScale || Math.abs(cardScale.s - s) / s > 0.04) cardScale = { s, base: 198, frozen: false };
  }
  const { s, base } = cardScale;
  let svg = `<line x1="134" y1="8" x2="134" y2="${base}" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 4"/>`;
  svg += `<line x1="${134 - HEAD_R * s}" y1="${base + 1}" x2="${134 + HEAD_R * s}" y2="${base + 1}" stroke="rgba(255,255,255,.35)" stroke-width="2"/>`;
  svg += `<path d="${sectionPath(P, 268, base, s)}" fill="${body.wet}" stroke="rgba(255,255,255,.25)" stroke-width=".6"/>`;
  // walls giving way
  const n = clay.n;
  for (let k = 0; k <= n; k += 2) {
    const v = clay.strain[k];
    if (v < 0.8) continue;
    const y = base - k * DY * s, x = clay.ro[k] * s, op = clamp((v - 0.8) / 0.6, 0.15, 1);
    const c = v > 1 ? '255,122,98' : '243,196,138';
    svg += `<rect x="${134 + x - 1}" y="${y - 1.2}" width="3" height="2.4" fill="rgba(${c},${op})"/><rect x="${134 - x - 2}" y="${y - 1.2}" width="3" height="2.4" fill="rgba(${c},${op})"/>`;
  }
  const at = stroke ? { r: stroke.r, y: stroke.y } : hover;
  if (at && S.tool !== 'look') {
    const x = at.r * s, y = base - at.y * s;
    if (S.tool === 'needle') svg += `<line x1="20" x2="248" y1="${y}" y2="${y}" stroke="#ff7a62" stroke-dasharray="4 3"/>`;
    svg += `<circle cx="${134 + x}" cy="${y}" r="4" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="${134 - x}" cy="${y}" r="2.5" fill="none" stroke="rgba(255,255,255,.4)"/>`;
  }
  $('section').innerHTML = svg;
  $('dims').innerHTML = `${cm(st.height)} tall<br>${cm(st.width)} wide`;
  const warnWall = st.hollow && st.minWall < 0.004;
  $('facts').innerHTML = `
    <dt>Clay</dt><dd>${st.kg.toFixed(2)} kg</dd>
    <dt>Height</dt><dd>${cm(st.height)}</dd>
    <dt>Widest</dt><dd>${cm(st.width)}</dd>
    ${st.hollow ? `<dt>Rim</dt><dd>${cm(st.rim)} across</dd>
    <dt>Thinnest wall</dt><dd class="${warnWall ? 'warn' : ''}">${mm(st.minWall)} at ${cm(st.minWallAt)}</dd>
    <dt>Average wall</dt><dd>${mm(st.avgWall)}</dd>
    <dt>Floor</dt><dd class="${st.floor < 0.006 ? 'warn' : ''}">${mm(st.floor)}</dd>` : '<dt>Form</dt><dd>Solid, not yet opened</dd>'}
    <dt>After firing</dt><dd>${cm(st.height * (1 - body.shrink))} tall</dd>`;
  $('body-name').textContent = body.name;
  $('wet-bar').style.width = clay.wet * 100 + '%';
  $('wet-out').textContent = clay.wet < 0.12 ? 'Dry, grabbing' : clay.wet < 0.2 ? 'Getting dry' : clay.wet < 0.7 ? 'Good' : clay.wet < 0.85 ? 'Wet' : 'Sloppy';
  const c = 1 - clamp(clay.offset / 0.008, 0, 1);
  $('center-bar').style.width = c * 100 + '%';
  $('center-bar').style.background = c > 0.9 ? 'var(--safe)' : 'var(--accent)';
  $('center-out').textContent = clay.offset < 0.0006 ? 'Centred' : `${mm(clay.offset)} off`;
  // the tool hint: speed and the most useful warning right now
  const T = TOOLS[S.tool];
  if (T) {
    const ok = T.rpm ? Math.abs(S.rpm - T.rpm) < T.rpm * 0.3 : S.rpm < 8;
    $('th-speed').innerHTML = `<i style="background:${ok ? 'var(--safe)' : 'var(--warn)'}"></i>${T.rpm ? `Best near ${T.rpm} rpm` : 'Best with the wheel stopped'} · now ${Math.round(S.rpm)}`;
  } else $('th-speed').innerHTML = '';
  let warn = performance.now() - warnAt < 1500 ? lastWarn : '';
  if (!warn) {
    if (st.maxStrain > 1) warn = `The wall at ${cm(st.strainAt)} is giving way. Thicken it, straighten it, or let it firm up.`;
    else if (st.maxStrain > 0.8) warn = `The wall at ${cm(st.strainAt)} is near its limit.`;
    else if (clay.offset > 0.0025 && ['open', 'pull', 'shape'].includes(S.tool)) warn = 'Still off-centre. Centre it first (C).';
    else if (clay.wet < 0.12) warn = 'Getting dry. Add water (W).';
    else if (S.tool === 'pull' && !st.hollow) warn = 'Open it first (O).';
  }
  $('th-warn').textContent = warn;
}

/* ---------- UI: glaze ---------- */
function buildGlaze() {
  const grid = $('glazes');
  for (const [id, g] of Object.entries(GLAZES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.glaze = id;
    b.addEventListener('click', () => { S.glaze = id; applyGlaze(); saveSession(); });
    grid.append(b);
  }
  for (const b of document.querySelectorAll('#foot button')) b.addEventListener('click', () => { S.foot = b.dataset.foot; dirty = true; syncGlazeUI(); saveSession(); });
  for (const b of document.querySelectorAll('#inside button')) b.addEventListener('click', () => { S.inside = b.dataset.inside; applyGlaze(); saveSession(); });
  $('dip').addEventListener('input', e => { S.dip = Number(e.target.value); applyGlaze(); });
  $('thick').addEventListener('input', e => { S.thick = Number(e.target.value); applyGlaze(); });
  $('dip').addEventListener('change', saveSession);
  $('thick').addEventListener('change', saveSession);
  $('back-to-wheel').addEventListener('click', () => setPhase('throw'));
  $('fire').addEventListener('click', fire);
}
function syncGlazeUI() {
  const body = BODIES[S.body];
  for (const b of $('glazes').children) {
    const g = GLAZES[b.dataset.glaze];
    const sw = g.none ? body.fired : `linear-gradient(135deg, ${g.thin}, ${g.thick} 70%)`;
    b.innerHTML = `<span style="background:${sw}"></span><b>${g.name}</b>`;
    b.setAttribute('aria-pressed', b.dataset.glaze === S.glaze);
  }
  $('glaze-note').textContent = GLAZES[S.glaze].note;
  for (const b of document.querySelectorAll('#foot button')) b.setAttribute('aria-pressed', b.dataset.foot === S.foot);
  for (const b of document.querySelectorAll('#inside button')) b.setAttribute('aria-pressed', b.dataset.inside === S.inside);
  const none = GLAZES[S.glaze].none;
  for (const id of ['dip', 'thick']) $(id).disabled = none;
  for (const b of document.querySelectorAll('#inside button')) b.disabled = none;
  $('dip').value = S.dip; $('thick').value = S.thick;
  $('dip-out').textContent = Math.round(S.dip * 100) + '%';
  $('thick-out').textContent = S.thick < 0.3 ? 'Thin' : S.thick < 0.7 ? 'Medium' : 'Thick';
}

/* ---------- UI: viewer ---------- */
function buildViewer() {
  const looks = $('looks');
  for (const [id, L] of Object.entries(LOOKS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.look = id; b.textContent = L.name;
    b.addEventListener('click', () => applyLook(id));
    looks.append(b);
  }
  for (const b of document.querySelectorAll('#shots button')) b.addEventListener('click', () => shot(b.dataset.shot));
  $('turntable').addEventListener('click', () => { S.turntable = !S.turntable; $('turntable').setAttribute('aria-pressed', S.turntable); });
  $('snap').addEventListener('click', snapImage);
  $('reglaze').addEventListener('click', () => setPhase('glaze'));
  $('view-save').addEventListener('click', () => saveVersion($('piece-name').value));
  $('piece-name').addEventListener('input', e => { S.name = e.target.value; saveSession(); });
  $('piece-name').addEventListener('keydown', e => e.stopPropagation());
}

/* ---------- toasts, coach ---------- */
let toastTimer = 0;
function toast(text, { bad = false, action = null, label = '' } = {}) {
  const t = $('toast');
  $('toast-text').textContent = text;
  t.classList.toggle('is-bad', bad);
  const act = $('toast-act');
  act.hidden = !action;
  act.textContent = label;
  act.onclick = action ? () => { action(); t.hidden = true; } : null;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3200);
}
function showCoach() {
  $('coach').hidden = false;
  $('coach-ok').onclick = () => { $('coach').hidden = true; store.set('coached', '1'); };
}

/* ---------- keys ---------- */
addEventListener('keydown', e => {
  if (e.target.matches('input[type="text"]')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (S.phase === 'throw') (e.shiftKey ? redo : undo)(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); if (S.phase === 'throw') redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (S.phase !== 'setup') saveVersion(''); return; }
  if (mod || e.altKey) return;
  if (S.phase !== 'throw') return;
  if (e.target.matches('input[type="range"]') && e.key.startsWith('Arrow')) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') { e.preventDefault(); toggleSpin(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); setTarget(S.target + 10); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); setTarget(S.target - 10); return; }
  if (k === 'w') { addWater(); return; }
  if (k === 'f') { frameView('seat'); return; }
  if (k === 'v') { selectTool('look'); return; }
  if ('1234'.includes(k)) { frameView(['seat', 'side', 'above', 'low'][Number(k) - 1]); return; }
  if (e.key === 'Escape') { endStroke(true); return; }
  const t = Object.entries(TOOLS).find(([, T]) => T.key.toLowerCase() === k);
  if (t) selectTool(t[0]);
});

/* ---------- steps ---------- */
function buildSteps() {
  for (const b of document.querySelectorAll('#steps button')) {
    b.addEventListener('click', () => {
      const to = b.dataset.step;
      if (to === S.phase) return;
      if (to === 'view') fire();
      else setPhase(to);
    });
  }
  $('new-piece').addEventListener('click', () => { setPhase('setup'); });
  $('sound').setAttribute('aria-pressed', S.sound);
  $('sound').addEventListener('click', () => {
    S.sound = !S.sound;
    store.set('sound', S.sound ? '1' : '0');
    $('sound').setAttribute('aria-pressed', S.sound);
    $('sound').querySelector('.waves').style.opacity = S.sound ? 1 : 0.2;
    initAudio();
    if (audio.master) audio.master.gain.value = S.sound ? 0.5 : 0;
  });
  $('sound').querySelector('.waves').style.opacity = S.sound ? 1 : 0.2;
}

/* ---------- the frame ---------- */
const clock = new THREE.Clock();
let collapseWas = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta()), now = performance.now();

  // the wheel's inertia, and the pedal that follows it
  S.rpm += (S.target - S.rpm) * (1 - Math.exp(-dt * 2.2));
  if (Math.abs(S.rpm - S.target) < 0.05) S.rpm = S.target;
  if (S.phase === 'view') {
    if (S.turntable) spinner.rotation.y += dt * 0.22;
  } else {
    S.angle += S.dir * S.rpm / 60 * TAU * dt;
    wheel.head.rotation.y = spinner.rotation.y = S.angle;
  }
  wheel.pedal.rotation.x = -S.target / 240 * 0.28;
  $('rpm').textContent = Math.round(S.rpm);

  // hands on the clay
  if (stroke) workStroke(dt);
  if (S.phase === 'throw' && clay.height > 0 && placing <= 0) {
    clay.step(dt, S.rpm);
    if (clay.moved) { clay.moved = false; dirty = true; if (!stroke) passiveDirty = true; }
    for (const ev of clay.events.splice(0)) {
      if (ev === 'collapse') { toast('It collapsed.', { bad: true, action: undo, label: 'Undo' }); navigator.vibrate?.([20, 40, 20]); }
      if (ev === 'sag' && !stroke) toast('The wall is slumping. Undo, or thicken it at the base.', { action: undo, label: 'Undo' });
    }
    if (collapseWas > 0 && clay.collapsing === 0) commit('Collapsed');
    collapseWas = clay.collapsing;
  }

  // the lump drops onto the wheel and slumps a little
  if (placing > 0) {
    placing = Math.max(0, placing - dt * 2.4);
    const t = 1 - placing;
    const y = t < 0.55 ? 0.32 * (1 - (t / 0.55) ** 2) : 0;
    const sq = t < 0.55 ? 1 : 1 - Math.sin((t - 0.55) / 0.45 * Math.PI) * 0.12 * (1 - t);
    spinner.position.y = y;
    clayMesh.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (t >= 0.55 && !thudded) { thud(); thudded = true; }
    if (placing === 0) { spinner.position.y = 0; clayMesh.scale.set(1, 1, 1); }
  }

  // the wet sheen fades to leather-hard
  clayU.uWetLook.value += (wetLook.target - clayU.uWetLook.value) * (1 - Math.exp(-dt * 3));
  clayU.uWet.value = clay.wet;

  if (dirty && clay.height > 0) {
    const foot = S.phase !== 'throw' && S.foot === 'ring' ? { inner: 0.66, depth: 0.0055 } : null;
    clayGeo.update(clay, { foot, offset: S.phase === 'throw' ? clay.offset : 0 });
    if (S.phase !== 'throw') clayU.uHeight.value = clay.height;
    wheel.slip.scale.setScalar(Math.max(0.03, clay.ro[0] + 0.004));
    wheel.slip.material.color.set(BODIES[S.body].wet);
    dirty = false;
  }
  wheel.slip.visible = clay.height > 0 && spinner.visible;

  // guides
  const working = S.phase === 'throw' && S.tool !== 'look' && clay.height > 0;
  let at = null;
  if (stroke) at = { r: stroke.r, y: stroke.y, side: stroke.side || 1 };
  else if (working && ptr.over && !coarse) at = readPlane(ptr.x, ptr.y);
  else if (hover?.src === 'card') at = { ...hover, side: 1 };
  const near = !!at && at.y > -0.02 && at.y < clay.height + 0.05 && at.r < 0.26;     // three hides only on false, not null
  const showGuides = working && near && !isSurfaceTool(S.tool);
  sectionLine.visible = showGuides;
  contact.visible = working && near;
  cursor.visible = working && near && !!(stroke ? stroke.src === '3d' : !coarse && hover?.src !== 'card');
  clayU.uHighlight.value.set(-1, 0);
  if (showGuides || contact.visible) {
    facingPlane();
    const P = clayGeo.points, np = P.length / 4, arr = sectionLine.geometry.attributes.position.array;
    let o = 0;
    for (const sg of [1, -1]) for (let i = 0; i < np - 1; i++) {
      for (const j of [i, i + 1]) {
        const r = P[j * 4] * sg;
        arr[o++] = right.x * r; arr[o++] = P[j * 4 + 1]; arr[o++] = right.z * r;
      }
    }
    sectionLine.geometry.setDrawRange(0, o / 3);
    sectionLine.geometry.attributes.position.needsUpdate = true;
    const y = clamp(at.y, 0, clay.height);
    const k = Math.round(y / DY), kf = clay.floorRow();
    const inner = kf >= 0 && k >= kf && at.r < (clay.ro[k] + clay.ri[k]) / 2;
    const rr = S.tool === 'open' ? Math.max(0.003, at.r) : inner ? clay.sample(clay.ri, y) : clay.sample(clay.ro, y) + 0.0012;
    contact.position.set(0, y, 0);
    contact.scale.setScalar(Math.max(0.002, rr));
    contact.material.color.set(S.tool === 'needle' ? 0xff7a62 : 0xffd2ae);
    if (at.point && !stroke) { cursor.position.copy(at.point); cursor.quaternion.copy(camera.quaternion); }
    else { const sr = at.r * (at.side || 1); cursor.position.set(right.x * sr, at.y, right.z * sr); cursor.quaternion.copy(camera.quaternion); }
    clayU.uHighlight.value.set(y, TOOLS[S.tool].size * S.size);
  }

  // the wire passes under the piece to cut it free
  if (wireT >= 0) {
    wireT += dt / 0.8;
    wire.position.z = 0.3 - wireT * 0.6;
    if (wireT >= 1) { wireT = -1; wire.visible = false; }
  }
  // the needle's offcut flies off and fades
  if (offcutT >= 0) {
    offcutT += dt;
    const t = offcutT;
    offcut.position.y += dt * (0.25 - t * 1.4);
    offcut.position.x += dt * 0.22;
    offcut.rotation.z += dt * 1.2;
    offcutMat.opacity = clamp(1 - t / 0.9, 0, 1);
    if (t > 0.9) { offcutT = -1; offcut.visible = false; }
  }

  // firelight flickers and shifts; leaves stir in the breeze
  if (keyFlicker && S.phase !== 'view') {
    const f = Math.sin(now * 0.011) * 0.5 + Math.sin(now * 0.037) * 0.3 + Math.sin(now * 0.0071) * 0.2;
    key.intensity = keyBase.intensity * (1 + f * 0.14);
    key.position.set(keyBase.pos.x, keyBase.pos.y + f * 0.03, keyBase.pos.z + Math.sin(now * 0.0053) * 0.04);
  }
  if (keySway && S.phase !== 'view') key.target.position.set(keyAim.x + Math.sin(now * 0.00041) * 0.05 + Math.sin(now * 0.0013) * 0.012, keyAim.y, keyAim.z + Math.sin(now * 0.00029) * 0.04);

  // the camera follows the piece as it grows, unless a move is under way
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
    const e = 1 - Math.pow(1 - camTween.t, 3);
    camera.position.lerpVectors(camTween.p0, camTween.p1, e);
    controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (camTween.t >= 1) camTween = null;
  } else if (S.phase === 'throw' && clay.height > 0) {
    const ty = Math.max(0.03, clay.height * 0.45);
    const dy = (ty - controls.target.y) * (1 - Math.exp(-dt * 1.2));
    controls.target.y += dy; camera.position.y += dy;
  }
  controls.update();
  if (bokeh.enabled) {
    // focus on the near face of the piece where the camera is aimed, not on its axis
    const sc = spinner.scale.x, k = clamp(Math.round(controls.target.y / sc / DY), 0, ROWS - 1);
    bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target) - clay.ro[k] * sc;
  }
  grade.uniforms.time.value = (now % 10000) / 1000;
  grade.uniforms.vignette.value = S.phase === 'view' ? 0.42 : 0.28;

  updateAudio(!!stroke && !isSurfaceTool(stroke.tool) && S.rpm > 5);
  renderPanel(now);
  composer.render();
  requestAnimationFrame(frame);
}

/* ---------- start ---------- */
buildSetup();
buildTools();
buildDock();
buildSide();
buildGlaze();
buildViewer();
buildSteps();
syncChoices();
selectTool('center');
syncHistory();
applySetting(S.setting);

const session = json('session', null);
if (session && !params.has('new')) {
  try { loadRecord(session, { label: 'Picked up where you left off' }); }
  catch { setPhase('setup'); }
} else setPhase('setup');
requestAnimationFrame(frame);

// for testing from the console
window.pottery = {
  S, clay, commit, setPhase, selectTool, setTarget, hist: () => hist, gotoStep, saveVersion, fire, frameView, shot, applyLook,
  // screen position of a point r from the axis at height y, on the right of the facing plane
  screen(r, y) { facingPlane(); const v = new THREE.Vector3(right.x * r, y, right.z * r).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
  stats: () => clay.stats(), scene, camera, controls, bokeh,
};
