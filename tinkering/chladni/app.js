import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MODES, F_MIN, F_MAX, NUT, DENS, GRID, createField, createSand, toUnit } from './plate.js';
import { GROUPS, MEDIA, PLATES, AMOUNTS, byId } from './media.js';
import { createGrains } from './grains.js';
import { createSolids } from './solids.js';
import { createLiquid } from './liquid.js';
import { createFire } from './fire.js';

const $ = (id) => document.getElementById(id);
const small = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHARE = small ? 0.55 : 1;      // phones get fewer grains

// ---------- renderer ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
camera.position.set(0, 3.1, 3.0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.22;
controls.rotateSpeed = 0.6;
controls.target.set(0, -0.02, 0.04);

// A dark studio for the metal to reflect: one big softbox overhead, a strip to the left,
// a cool rim behind. Everything else is black, so the plate reads as a lit object in a void.
function studio(strips = false) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  if (strips) {
    // For liquids: a ceiling of strip lights. A still surface mirrors them straight;
    // the standing wave bends them, which is how the figure shows in a liquid.
    for (let k = -6; k <= 6; k++) panel(7, 0.12, 0xfff3e2, 3.4, [0, 4.4, -2.6 + k * 0.42], [0, -10, -2.6 + k * 0.42]);
    panel(6, 6, 0x9a958c, 0.5, [0, -2.2, 0], [0, 0, 0]);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0).texture;
    pmrem.dispose();
    return tex;
  }
  panel(2.6, 1.3, 0xfff1dc, 3.2, [-0.6, 4.6, -3.2], [0, 0, 0]);
  panel(0.35, 4.5, 0xffe2c0, 1.6, [-4.4, 1.8, -1.2], [0, 0.6, 0]);
  panel(3.5, 0.3, 0xbcd4ff, 1.2, [3.2, 1.2, -3.6], [0, 0.4, 0]);
  // A pale floor, standing in for the bright plate that round things see beneath them.
  panel(6, 6, 0x9a958c, 0.9, [0, -2.2, 0], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}
const ENV = { studio: studio(), strips: studio(true) };
scene.environment = ENV.studio;

// A light from over the viewer's shoulder, for solids that the softboxes alone leave dark.
// Its mirror image in the flat plate points away from the camera, so the plate doesn't glare.
const key = new THREE.DirectionalLight(0xfff4e6, 1.8);
key.position.set(0.8, 3, 2.6);
scene.add(key);


// ---------- the plate ----------
const rig = new THREE.Group();
scene.add(rig);

function brushed() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(150,150,150)';
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = 'rgb(105,105,105)';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 6000; i++) {
    const v = 80 + Math.random() * 60, y = Math.random() * 1024;
    g.strokeStyle = `rgba(${v},${v},${v},${0.1 + Math.random() * 0.2})`;
    g.lineWidth = 0.5 + Math.random() * 1.4;
    const x = Math.random() * 1024, len = 80 + Math.random() * 700;
    g.beginPath(); g.moveTo(x - len / 2, y); g.lineTo(x + len / 2, y + (Math.random() - 0.5) * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const steel = new THREE.MeshPhysicalMaterial({
  color: 0xb4b7bc, metalness: 1, roughness: 0.62, roughnessMap: brushed(),
  anisotropy: 0.75, envMapIntensity: 0.8,
});
const roughBrush = steel.roughnessMap;
const PLATE_MATS = {
  steel,
  brass: new THREE.MeshPhysicalMaterial({
    color: 0xd9b36a, metalness: 1, roughness: 0.66, roughnessMap: roughBrush, anisotropy: 0.75, envMapIntensity: 0.85,
  }),
  obsidian: new THREE.MeshPhysicalMaterial({
    color: 0x050506, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1,
  }),
  lightbox: new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.4, transmission: 1, ior: 1.5, thickness: 0.026, envMapIntensity: 0.6,
  }),
};
const TH = 0.026;
const plate = new THREE.Mesh(new RoundedBoxGeometry(2, TH, 2, 3, 0.008), steel);
plate.position.y = -TH / 2;
rig.add(plate);

// The centre mount: a washer, a hex nut, and a post that fades into the dark below.
const darkSteel = new THREE.MeshPhysicalMaterial({ color: 0x8d9096, metalness: 1, roughness: 0.32, envMapIntensity: 1 });
const washer = new THREE.Mesh(new THREE.CylinderGeometry(NUT * 0.98, NUT * 0.98, 0.005, 40), darkSteel);
washer.position.y = 0.0025;
const nut = new THREE.Mesh(new THREE.CylinderGeometry(NUT * 0.72, NUT * 0.72, 0.026, 6), darkSteel);
nut.position.y = 0.018;
const bolt = new THREE.Mesh(new THREE.CylinderGeometry(NUT * 0.36, NUT * 0.36, 0.034, 24), darkSteel);
bolt.position.y = 0.02;
rig.add(washer, nut, bolt);

const fade = (() => {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#555'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
})();
const post = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 1.6, 24, 1, true),
  new THREE.MeshPhysicalMaterial({ color: 0x6d7076, metalness: 1, roughness: 0.4, alphaMap: fade, transparent: true, depthWrite: false })
);
post.position.y = -TH - 0.8;
rig.add(post);

// Under the light table: a warm panel that only shows through the frosted glass.
const under = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#fff6e6'); gr.addColorStop(0.6, '#f3dcb8'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.94, 1.94), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.05, 1.0, 0.92), toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -TH - 0.05;
  m.visible = false;
  rig.add(m);
  return m;
})();

let plateId = 'steel';
function setPlate(id) {
  plateId = id;
  plate.material = PLATE_MATS[id];
  under.visible = id === 'lightbox';
  shared.uBack.value = id === 'lightbox' ? 1 : 0;
}

// ---------- what's on the plate ----------
const field = createField();
const KEY = new THREE.Vector3(-0.45, 1, -0.55).normalize();   // matches the overhead softbox
const shared = {
  uScale: { value: 1 },
  uAspect: { value: 1 },
  uLight: { value: new THREE.Vector3() },
  uView: { value: new THREE.Vector3() },
  uTime: { value: 0 },
  tField: { value: null },
  uBack: { value: 0 },
};

// The plate's motion as a texture, for the liquids: its in-phase and quarter-phase
// parts, and how far it moves.
const fieldData = new Uint16Array(GRID * GRID * 4);
const fieldTex = new THREE.DataTexture(fieldData, GRID, GRID, THREE.RGBAFormat, THREE.HalfFloatType);
fieldTex.magFilter = fieldTex.minFilter = THREE.LinearFilter;
shared.tField.value = fieldTex;
let fieldShown = -1;
function uploadField() {
  if (fieldShown === field.version) return;
  fieldShown = field.version;
  const h = THREE.DataUtils.toHalfFloat;
  for (let i = 0, j = 0; i < GRID * GRID; i++, j += 4) {
    fieldData[j] = h(field.re[i]); fieldData[j + 1] = h(field.im[i]); fieldData[j + 2] = h(field.amp[i]);
  }
  fieldTex.needsUpdate = true;
}

// Where grains lie thick, the plate under and around them is shaded.
const depthData = new Uint8Array(DENS * DENS);
const depthTex = new THREE.DataTexture(depthData, DENS, DENS, THREE.RedFormat, THREE.UnsignedByteType);
depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
const shade = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: depthTex }, uAlpha: { value: 0.62 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDepth;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float d = texture2D(tDepth, vec2(vUv.x, 1.0 - vUv.y)).r * 12.0;
        gl_FragColor = vec4(0.03, 0.022, 0.015, uAlpha * (1.0 - exp(-d * 0.45)));
      }`,
    transparent: true, depthWrite: false,
  })
);
shade.rotation.x = -Math.PI / 2;
shade.position.y = 0.0004;
rig.add(shade);
function writeDepth(k) {
  for (let i = 0; i < depthData.length; i++) depthData[i] = Math.min(255, sand.depth[i] * 21);
  depthTex.needsUpdate = true;
  shade.material.uniforms.uAlpha.value = 0.62 * medium.shade * k;
}

// The current material, and the view that draws it.
let medium = MEDIA[0], amount = AMOUNTS[1], sand = null, view = null, pourShown = 1;
const usesGrains = () => medium.kind === 'grains' || medium.kind === 'solids';

function build() {
  if (view) { rig.remove(view.group); view.dispose(); }
  sand = null;
  if (usesGrains()) {
    const count = Math.round(medium.count * amount.k * (medium.kind === 'grains' ? SHARE : Math.max(SHARE, 0.75)));
    sand = createSand(count, medium.sim || {});
    sand.scatter();
    view = (medium.kind === 'grains' ? createGrains : createSolids)({ medium, sand, uniforms: shared });
  } else if (medium.kind === 'liquid') {
    view = createLiquid({ medium, uniforms: shared, amount: amount.k });
  } else {
    view = createFire({ field, uniforms: shared, amount: amount.k });
  }
  rig.add(view.group);
  shade.visible = !!sand;
  scene.environment = medium.kind === 'liquid' ? ENV.strips : ENV.studio;
  view.pour(clock.elapsedTime);
  if (sand) sand.measure();
  setHiss();
}

// ---------- the void ----------
const backdrop = new THREE.Mesh(
  new THREE.SphereGeometry(40, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uGlow: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uGlow;
      varying vec3 vDir;
      void main() {
        float below = smoothstep(0.35, -0.6, vDir.y);
        float halo = pow(max(dot(vDir, normalize(vec3(0.0, -0.25, -1.0))), 0.0), 6.0);
        vec3 c = vec3(0.006, 0.007, 0.009) + vec3(0.03, 0.022, 0.014) * halo * (0.7 + uGlow) + vec3(0.004, 0.003, 0.002) * below;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
scene.add(backdrop);

// Dust hanging in the light.
const MOTES = 140;
const motePos = new Float32Array(MOTES * 3), moteVel = new Float32Array(MOTES * 3);
for (let i = 0; i < MOTES; i++) {
  motePos.set([(Math.random() - 0.5) * 7, (Math.random() - 0.4) * 3.5, (Math.random() - 0.6) * 6], i * 3);
  moteVel.set([(Math.random() - 0.5) * 0.02, (Math.random() - 0.3) * 0.012, (Math.random() - 0.5) * 0.02], i * 3);
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 1 } },
  vertexShader: `uniform float uScale; varying float vA; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(0.012 * uScale / -mv.z, 1.0, 6.0); vA = smoothstep(9.0, 2.0, -mv.z); }`,
  fragmentShader: `varying float vA; void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * 0.5 * vA * smoothstep(0.5, 0.0, r), 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
motes.frustumCulled = false;
scene.add(motes);

// ---------- post ----------
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.5, 0.92);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      c.rgb *= mix(0.42, 1.0, smoothstep(1.05, 0.2, length(q)));
      c.rgb += (hash(vUv * 917.0 + fract(uTime) * 61.0) - 0.5) * 0.01;
      gl_FragColor = c;
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 40 : 32;
  // Frame the plate in the space between the header and the dock: centre it there with a
  // view offset, and stand back far enough that it fits that space's width and height.
  const dockTop = document.querySelector('.dock').getBoundingClientRect().top;
  const top = 58, bottom = dockTop - (w < 600 ? 52 : 64);
  const free = Math.max(160, bottom - top);
  camera.setViewOffset(w, h, 0, h / 2 - (top + bottom) / 2, w, h);
  camera.updateProjectionMatrix();
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(3.4, 2.3 / (0.84 * 2 * tan * (w / h)), 1.5 / (0.72 * 2 * tan * (free / h)));
  controls.minDistance = dist * 0.55;
  controls.maxDistance = dist * 1.6;
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  const scale = (h * renderer.getPixelRatio() / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  shared.uScale.value = scale;
  shared.uAspect.value = w / h;
  motes.material.uniforms.uScale.value = scale;
  finish.uniforms.uAspect.value = w / h;
}
addEventListener('resize', resize);
resize();

// ---------- sound ----------
let audio = null;
function startAudio() {
  if (audio) return audio;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const tone = ctx.createGain();
  tone.gain.value = 0;
  osc.connect(tone).connect(master);
  osc.start();

  // The hiss of sand hopping on the metal.
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.25);
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass'; band.frequency.value = 4200; band.Q.value = 0.6;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  noise.connect(band).connect(hiss).connect(master);
  noise.start();

  audio = { ctx, master, osc, tone, hiss, band };
  setHiss();
  return audio;
}
// Each material makes its own noise under the tone: sand hisses, steel balls rattle,
// the flame table roars.
function setHiss() {
  if (!audio) return;
  const h = medium.hiss, t = audio.ctx.currentTime;
  audio.band.type = h.type;
  audio.band.frequency.setTargetAtTime(h.f, t, 0.05);
  audio.band.Q.setTargetAtTime(h.q, t, 0.05);
}
function updateAudio(moving) {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  // High sines are piercing, so they're turned down; the plate gets louder as it rings.
  const level = 0.16 * (0.45 + 0.55 * field.strength) / Math.sqrt(1 + (freq / 1800) ** 2);
  audio.osc.frequency.setTargetAtTime(freq, t, 0.012);
  audio.tone.gain.setTargetAtTime(level, t, 0.06);
  audio.hiss.gain.setTargetAtTime(Math.min(0.06 * medium.hiss.g, moving * 0.12 * medium.hiss.g), t, 0.08);
}

// ---------- state ----------
let on = false;
let drive = 0;
let freq = MODES[3].f;          // starts on a resonance: flip the switch and a figure forms
let glide = null;
const dock = document.querySelector('.dock');

function setOn(v) {
  on = v;
  $('power').setAttribute('aria-checked', String(v));
  dock.classList.toggle('is-sounding', v);
  $('cap-on').classList.toggle('is-on', v);
  $('cap-off').classList.toggle('is-on', !v);
  const a = startAudio();
  if (a.ctx.state === 'suspended') a.ctx.resume();
  a.master.gain.setTargetAtTime(v ? 1 : 0, a.ctx.currentTime, v ? 0.03 : 0.05);
  if (v) hint.note('on');
}
$('power').addEventListener('click', () => setOn(!on));

function setFreq(f, fromGlide = false) {
  if (!fromGlide) glide = null;
  freq = Math.min(F_MAX, Math.max(F_MIN, f));
  if (on) hint.note('tune');
}

// Glide to the next resonance up or down, so a phone user can find one without fine turning.
function hop(dir) {
  const eps = 0.004;
  const list = dir > 0 ? MODES.filter((m) => m.f > freq * (1 + eps)) : MODES.filter((m) => m.f < freq * (1 - eps)).reverse();
  if (!list.length) return;
  const from = freq, to = list[0].f, start = performance.now();
  const dur = reduced ? 1 : 900 + 260 * Math.abs(Math.log2(to / from));
  glide = { from, to, start, dur };
}
$('prev').addEventListener('click', () => hop(-1));
$('next').addEventListener('click', () => hop(1));

// ---------- the knob ----------
// One full turn is one octave, so a resonance is a comfortable twist wide.
// The ring around it shows where you are in the whole range, with a dot for each resonance.
const knob = $('knob'), grip = $('grip');
const ARC = 300, R = 53, C = 58;
const polar = (u, r = R) => {
  const a = THREE.MathUtils.degToRad(-ARC / 2 + u * ARC - 90);
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const arcPath = (u0, u1) => {
  const [x0, y0] = polar(u0), [x1, y1] = polar(u1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${(u1 - u0) * ARC > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
$('dial-track').setAttribute('d', arcPath(0, 1));
const ticks = MODES.map((m) => {
  const [x, y] = polar(toUnit(m.f), R);
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('class', 'tick'); c.setAttribute('cx', x.toFixed(2)); c.setAttribute('cy', y.toFixed(2)); c.setAttribute('r', '1.1');
  $('dial-ticks').appendChild(c);
  return c;
});

let drag = null;
knob.addEventListener('pointerdown', (e) => {
  knob.setPointerCapture(e.pointerId);
  const r = knob.getBoundingClientRect();
  drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, a: null, y: e.clientY };
  knob.focus({ preventScroll: true });
  e.preventDefault();
});
knob.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
  let oct = 0;
  if (Math.hypot(dx, dy) > 12) {
    // Turn it like a real knob, by circling it…
    const a = Math.atan2(dy, dx);
    if (drag.a !== null) {
      let d = a - drag.a;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      oct = d / (2 * Math.PI);
    }
    drag.a = a;
  } else {
    // …or, right over its centre, by dragging up and down.
    oct = (drag.y - e.clientY) / 260;
    drag.a = null;
  }
  drag.y = e.clientY;
  if (oct) setFreq(freq * Math.pow(2, oct));
});
const endDrag = () => { drag = null; };
knob.addEventListener('pointerup', endDrag);
knob.addEventListener('pointercancel', endDrag);
knob.addEventListener('wheel', (e) => {
  e.preventDefault();
  setFreq(freq * Math.pow(2, -e.deltaY * (e.shiftKey ? 0.004 : 0.0009)));
}, { passive: false });

function nudge(e) {
  const step = e.shiftKey ? 1 / 12 : 1 / 240;     // a semitone, or a twentieth of one
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowUp') setFreq(freq * Math.pow(2, step));
  else if (k === 'ArrowLeft' || k === 'ArrowDown') setFreq(freq / Math.pow(2, step));
  else if (k === 'PageUp') setFreq(freq * 2);
  else if (k === 'PageDown') setFreq(freq / 2);
  else if (k === 'Home') setFreq(F_MIN);
  else if (k === 'End') setFreq(F_MAX);
  else return false;
  return true;
}
knob.addEventListener('keydown', (e) => { if (nudge(e)) { e.preventDefault(); e.stopPropagation(); } });

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); setOn(!on); return; }
  if (e.key === '[') { hop(-1); return; }
  if (e.key === ']') { hop(1); return; }
  if (e.key === 's' || e.key === 'S') { scatter(); return; }
  if (e.key === 'Escape') openSheet(false);
  if (tag !== 'BUTTON' && nudge(e)) e.preventDefault();
});

// ---------- pour again ----------
function scatter() { build(); }
$('scatter').addEventListener('click', scatter);

// ---------- the material picker ----------
const store = {
  get() { try { return JSON.parse(localStorage.getItem('chladni:v1')) || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem('chladni:v1', JSON.stringify(v)); } catch {} },
};
const POUR_LABEL = { grains: 'Pour again', solids: 'Pour again', liquid: 'Refill', fire: 'Relight' };
const swatch = (item, attr) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'swatch'; b.dataset[attr] = item.id;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="swatch__chip" style="background:${item.swatch}"></span><span class="swatch__name">${item.name}</span>`;
  return b;
};
for (const g of GROUPS) {
  const wrap = document.createElement('div');
  wrap.className = 'side__group';
  wrap.innerHTML = `<div class="side__sub">${g.name}</div><div class="swatches"></div>`;
  MEDIA.filter((m) => m.group === g.id).forEach((m) => wrap.lastChild.appendChild(swatch(m, 'medium')));
  $('media').appendChild(wrap);
}
PLATES.forEach((pl) => $('plates').appendChild(swatch(pl, 'plate')));
AMOUNTS.forEach((am) => {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.amount = am.id; b.textContent = am.name;
  b.setAttribute('aria-pressed', 'false');
  $('amounts').appendChild(b);
});
const AMOUNT_LABEL = { grains: 'Amount', solids: 'Amount', liquid: 'Depth', fire: 'Gas' };

function reflect() {
  document.querySelectorAll('[data-medium]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.medium === medium.id)));
  document.querySelectorAll('[data-plate]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.plate === plateId)));
  document.querySelectorAll('[data-amount]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.amount === amount.id)));
  $('about').textContent = medium.about;
  $('amount-label').textContent = AMOUNT_LABEL[medium.kind];
  $('scatter-label').textContent = POUR_LABEL[medium.kind];
  $('scatter').title = `${POUR_LABEL[medium.kind]} (S)`;
  $('mat-name').textContent = medium.name;
  $('mat-chip').style.background = medium.swatch;
  store.set({ medium: medium.id, plate: plateId, amount: amount.id });
}
function setMedium(id) {
  if (id === medium.id) return;
  medium = byId(MEDIA, id);
  build(); reflect();
}
function setAmount(id) {
  amount = byId(AMOUNTS, id);
  // Liquids and flames take a new depth or gas flow in place; loose things are poured again.
  if (view.setAmount && !sand) view.setAmount(amount.k); else build();
  reflect();
}
$('side').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.medium) setMedium(b.dataset.medium);
  else if (b.dataset.plate) { setPlate(b.dataset.plate); reflect(); }
  else if (b.dataset.amount) setAmount(b.dataset.amount);
  if (small && (b.dataset.medium || b.dataset.plate)) openSheet(false);
});
// On phones the picker is a sheet, opened from the header.
function openSheet(v) {
  $('side').classList.toggle('is-open', v);
  $('mat-toggle').setAttribute('aria-expanded', String(v));
  document.body.classList.toggle('sheet-open', v);
}
$('mat-toggle').addEventListener('click', () => openSheet(!$('side').classList.contains('is-open')));

// ---------- hint ----------
const hint = {
  el: $('hint'), seen: new Set(),
  note(what) {
    this.seen.add(what);
    if (what === 'on') this.el.textContent = 'Turn the knob slowly to find another resonance';
    if (this.seen.has('on') && this.seen.has('tune')) this.el.classList.add('is-gone');
  },
};

// ---------- readout ----------
let shown = { hz: -1, mode: undefined, near: -1 };
function readout() {
  const hz = Math.round(freq);
  if (hz !== shown.hz) {
    $('hz').textContent = hz.toLocaleString('en-US');
    knob.setAttribute('aria-valuenow', String(hz));
    knob.setAttribute('aria-valuetext', `${hz} hertz${field.mode ? `, mode ${field.mode.n} by ${field.mode.m}` : ''}`);
    shown.hz = hz;
  }
  const md = field.mode;
  const label = md ? `Resonance (${md.n}, ${md.m})` : 'Between resonances';
  if (label !== shown.mode) {
    $('mode').textContent = label;
    $('mode').classList.toggle('is-locked', !!md);
    shown.mode = label;
  }
  const u = toUnit(freq);
  grip.style.transform = `rotate(${(Math.log2(freq / F_MIN) * 360) % 360}deg)`;
  $('dial-value').setAttribute('d', arcPath(0, Math.max(0.0005, u)));
  const [px, py] = polar(u);
  $('dial-pos').setAttribute('cx', px.toFixed(2));
  $('dial-pos').setAttribute('cy', py.toFixed(2));
  $('meter').style.width = `${(field.strength * 100).toFixed(1)}%`;
  dock.style.setProperty('--res', (on ? field.strength : 0).toFixed(2));
  let near = -1, best = Infinity;
  MODES.forEach((m, i) => { const d = Math.abs(Math.log2(m.f / freq)); if (d < best) { best = d; near = i; } });
  if (best > 0.02) near = -1;
  if (near !== shown.near) {
    if (shown.near >= 0) ticks[shown.near].classList.remove('is-near');
    if (near >= 0) ticks[near].classList.add('is-near');
    shown.near = near;
  }
}

// ---------- loop ----------
let acc = 0, frame = 0;
const lightView = new THREE.Vector3();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  if (glide) {
    const k = Math.min(1, (performance.now() - glide.start) / glide.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    setFreq(glide.from * Math.pow(glide.to / glide.from, e), true);
    if (k >= 1) glide = null;
  }
  field.set(freq);

  // The switch doesn't cut the plate dead: it rings up quickly and down a little slower.
  drive += ((on ? 1 : 0) - drive) * (1 - Math.exp(-dt / (on ? 0.07 : 0.12)));
  if (drive < 0.002) drive = 0;

  shared.uTime.value = t;
  let activity = 0;
  if (sand) {
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 3) {
      if (drive > 0) sand.step(field, drive, 1 / 60);
      else { sand.moving = 0; for (let i = 0; i < sand.count; i++) sand.heat[i] *= sand.opts.cool; }
      acc -= 1 / 60; steps++;
    }
    if (steps === 3) acc = 0;
    if (drive > 0 && frame % 2 === 0) sand.measure();
    activity = sand.moving * drive;
  } else if (medium.kind === 'liquid') uploadField();
  const k = view.update({ t, dt, drive });
  if (sand && (drive > 0 || k !== pourShown || frame < 2)) writeDepth(k);
  pourShown = k;
  if (medium.kind === 'fire') activity = view.activity;
  // Materials that make their own light dim the studio, so it carries.
  const lit = medium.dark ? 0.1 : 1;
  scene.environmentIntensity += (lit - scene.environmentIntensity) * (1 - Math.exp(-dt / 0.4));
  key.intensity = 1.8 * scene.environmentIntensity;
  updateAudio(activity);

  // Floating: a slow drift, and a buzz you can only just see when it rings hard.
  const buzz = reduced ? 0 : drive * field.strength * 0.0008;
  rig.position.y = (reduced ? 0 : Math.sin(t * 0.55) * 0.012) + (Math.random() - 0.5) * buzz;
  rig.rotation.x = reduced ? 0 : Math.sin(t * 0.37) * 0.006;
  rig.rotation.z = reduced ? 0 : Math.sin(t * 0.29 + 1) * 0.005;

  for (let i = 0; i < MOTES * 3; i += 3) {
    motePos[i] += moteVel[i] * dt; motePos[i + 1] += moteVel[i + 1] * dt; motePos[i + 2] += moteVel[i + 2] * dt;
    if (motePos[i + 1] > 2.2) motePos[i + 1] = -1.4;
    if (Math.abs(motePos[i]) > 3.5) moteVel[i] *= -1;
    if (Math.abs(motePos[i + 2] + 0.6) > 3) moteVel[i + 2] *= -1;
  }
  moteGeo.attributes.position.needsUpdate = true;

  controls.update();
  lightView.copy(KEY).transformDirection(camera.matrixWorldInverse);
  shared.uLight.value.copy(lightView);
  camera.getWorldDirection(shared.uView.value);
  backdrop.material.uniforms.uGlow.value = drive * field.strength;
  finish.uniforms.uTime.value = t;
  readout();
  composer.render();
  frame++;
  requestAnimationFrame(tick);
}
{
  const saved = store.get();
  medium = byId(MEDIA, saved.medium);
  amount = byId(AMOUNTS, saved.amount || 'some');
  setPlate(byId(PLATES, saved.plate).id);
  build();
  reflect();
}
requestAnimationFrame(tick);

window.chladni = { scene, field, setOn, setFreq, hop, setMedium, setPlate, setAmount, get sand() { return sand; }, get medium() { return medium; }, get freq() { return freq; }, MODES };
