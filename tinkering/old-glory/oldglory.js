import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { addVersions } from '../versions.js';

/* ---------- parameters (everything the panel can change) ---------- */
// World units are metres. The audience stands at +z looking toward -z.
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS = {
  scene: 'flag',
  drones: 1000,
  autoRotate: false,
  rotateSpeed: 0.3,
  fov: 45,

  flagWidth: 95,             // metres, hoist to fly
  altitude: 75,              // centre of the formation
  waveAmplitude: 4.5,        // metres of depth in each ripple
  waveLength: 42,            // metres between crests
  waveSpeed: 5,              // metres per second the ripple travels
  foldShading: 0.55,         // darken the troughs so the folds read
  drift: 1,                  // slow sway of the whole formation

  flightSpeed: 9,            // top speed, m/s
  hover: 0.25,               // GPS-style wobble per drone, metres
  lightSize: 0.9,            // metres
  brightness: 1,
  starSize: 1.6,
  twinkle: 0.35,

  red: '#ff2b36',
  white: '#fff4ea',
  blue: '#2f4dff',

  bloomStrength: 1.1,
  bloomRadius: 0.45,
  bloomThreshold: 0.1,
  exposure: 1.0,
  showPads: true,

  renderScale: Math.min(devicePixelRatio, 1.5),
};
const params = { ...DEFAULTS };

/* ---------- renderer, scene, camera ---------- */
const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x03050b, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(params.fov, innerWidth / innerHeight, 1, 2000);
const HOME_POSITION = new THREE.Vector3(0, 18, 165);
camera.position.copy(HOME_POSITION);

const controls = new OrbitControls(camera, canvas);
const homeTarget = () => new THREE.Vector3(0, params.altitude - 8, 0);
controls.target.copy(homeTarget());
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 40;
controls.maxDistance = 500;
controls.maxPolarAngle = THREE.MathUtils.degToRad(95);
controls.autoRotate = params.autoRotate;
controls.autoRotateSpeed = params.rotateSpeed;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight),
  params.bloomStrength, params.bloomRadius, params.bloomThreshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const pr = Math.min(devicePixelRatio, params.renderScale);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  updateProjScale();
}

/* ---------- light material: each drone is a soft point sized in metres ---------- */
const uniforms = {
  uProjScale: { value: 1 },  // pixels per metre at 1 m depth
  uSize: { value: params.lightSize },
  uBrightness: { value: params.brightness },
};

function updateProjScale() {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  uniforms.uProjScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

const lightMaterial = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uProjScale, uSize;
    attribute vec3 color;
    attribute float aBright;
    attribute float aScale;
    varying vec3 vColor;
    varying float vBright;

    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float px = uSize * aScale * uProjScale / max(-mv.z, 1.0);
      gl_PointSize = max(px, 1.5);
      // keep far-away lights from vanishing: shrink their size, not their energy
      vBright = aBright * min(1.0, px / 1.5);
      vColor = color;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uBrightness;
    varying vec3 vColor;
    varying float vBright;

    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r2 = dot(d, d) * 4.0;
      if (r2 > 1.0) discard;
      float core = exp(-r2 * 9.0);
      float halo = exp(-r2 * 2.5) * 0.35;
      vec3 col = vColor * (core + halo) + vec3(core * core * 0.35);   // hot white centre
      gl_FragColor = vec4(col * vBright * uBrightness, 1.0);
    }
  `,
});

/* ---------- scenes: each one lays out slots and moves them over time ---------- */
// A slot carries where a drone should be at time t, its colour key and brightness.
// New scenes (eagle, wheat field, ballgame…) add an entry here with the same shape.
const FLAG_RATIO = 1.9;                       // US flag: fly / hoist
const CANTON_W = 0.76, CANTON_H = 7 / 13;     // in hoist units

const SCENES = {
  flag: {
    label: 'American flag',
    build(n) {
      // field drones on a grid whose rows land exactly two (or more) per stripe
      const field = Math.max(n - 50, 13 * 8);
      const k = Math.max(1, Math.round(Math.sqrt(field / FLAG_RATIO) / 13));
      const rows = 13 * k;
      const cols = Math.max(4, Math.round(field / rows));
      const slots = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u = (c + 0.5) / cols * FLAG_RATIO;   // 0 at the hoist
          const v = (r + 0.5) / rows;                // 0 at the top
          const stripe = Math.floor(v * 13);
          const canton = u < CANTON_W && v < CANTON_H;
          slots.push({ u, v, color: canton ? 'blue' : stripe % 2 ? 'white' : 'red', star: false });
        }
      }
      // 50 stars: nine rows alternating 6 and 5, per the flag specification
      for (let j = 0; j < 9; j++) {
        const count = j % 2 ? 5 : 6;
        for (let i = 0; i < count; i++) {
          slots.push({ u: 0.063 * (2 * i + 1 + (j % 2)), v: 0.054 * (j + 1), color: 'white', star: true });
        }
      }
      return slots;
    },

    // writes world position into out, returns a brightness multiplier
    place(slot, t, out) {
      const H = params.flagWidth / FLAG_RATIO;
      const x = slot.u * H;                                  // metres from the hoist
      const env = Math.pow(x / params.flagWidth, 0.85);      // pinned at the hoist, loose at the fly
      const z = waveDepth(x, t) * env;
      const slope = (waveDepth(x + 0.5, t) - waveDepth(x - 0.5, t)) * env;   // per metre
      out.set(
        x - params.flagWidth / 2,
        params.altitude + (0.5 - slot.v) * H - Math.abs(z) * 0.08,     // slight pull as it billows
        z,
      );
      // folds facing away from the audience dim, folds facing them brighten
      const shade = THREE.MathUtils.clamp(0.5 - slope * 1.6, 0, 1);
      return THREE.MathUtils.lerp(1, 0.35 + 0.95 * shade, params.foldShading);
    },
  },
};

function waveDepth(x, t) {
  const kx = (Math.PI * 2) / params.waveLength;
  const w = kx * params.waveSpeed;
  return params.waveAmplitude * (
    Math.sin(kx * x - w * t) * 0.75 +
    Math.sin(kx * 1.7 * x - w * 1.35 * t + 1.3) * 0.25
  );
}

/* ---------- the fleet: CPU flight sim, ~1000 drones is cheap ---------- */
let slots = [], pos, vel, pads, rand;
let geometry, lights, padGeometry, padLights;
const target = new THREE.Vector3();
const stats = { drones: '—', fps: '—' };

function buildFleet() {
  slots = SCENES[params.scene].build(params.drones);
  const n = slots.length;
  pos = new Float32Array(n * 3);
  vel = new Float32Array(n * 3);
  pads = new Float32Array(n * 3);
  rand = new Float32Array(n * 4);

  // launch pads sit under each drone's slot so the climb is straight up, no crossings
  const H = params.flagWidth / FLAG_RATIO;
  slots.forEach((s, i) => {
    pads[i * 3] = s.u * H - params.flagWidth / 2;
    pads[i * 3 + 1] = 0.3;
    pads[i * 3 + 2] = (s.v - 0.5) * 40 + (s.star ? 0.8 : 0);
    for (let j = 0; j < 4; j++) rand[i * 4 + j] = Math.random();
  });

  if (geometry) { scene.remove(lights, padLights); geometry.dispose(); padGeometry.dispose(); }
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(new Float32Array(n), 1));
  slots.forEach((s, i) => { geometry.attributes.aScale.array[i] = s.star ? params.starSize : 1; });
  lights = new THREE.Points(geometry, lightMaterial);
  lights.frustumCulled = false;

  // dim marker on every pad, so the ground has some presence
  padGeometry = new THREE.BufferGeometry();
  padGeometry.setAttribute('position', new THREE.BufferAttribute(pads.slice(), 3));
  padGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.55), 3));
  padGeometry.setAttribute('aBright', new THREE.BufferAttribute(new Float32Array(n).fill(0.12), 1));
  padGeometry.setAttribute('aScale', new THREE.BufferAttribute(new Float32Array(n).fill(0.45), 1));
  padLights = new THREE.Points(padGeometry, lightMaterial);
  padLights.visible = params.showPads;

  scene.add(padLights, lights);
  stats.drones = n.toLocaleString();
  applyColors();
  launch(REDUCED);
}

function launch(instant) {
  showTime = 0;
  for (let i = 0; i < slots.length; i++) {
    if (instant) {
      SCENES[params.scene].place(slots[i], 0, target);
      target.toArray(pos, i * 3);
    } else {
      pos.set(pads.subarray(i * 3, i * 3 + 3), i * 3);
    }
    vel.fill(0, i * 3, i * 3 + 3);
  }
}

const palette = { red: new THREE.Color(), white: new THREE.Color(), blue: new THREE.Color() };
// white LEDs read far brighter than red or blue ones; even them out so the stripes hold
const COLOR_GAIN = { red: 1.5, white: 0.7, blue: 1.8 };
function applyColors() {
  for (const key in palette) palette[key].set(params[key]).multiplyScalar(COLOR_GAIN[key]);
  const col = geometry.attributes.color.array;
  slots.forEach((s, i) => palette[s.color].toArray(col, i * 3));
  geometry.attributes.color.needsUpdate = true;
}

const OMEGA = 2.4;           // how tightly a drone tracks its slot (rad/s)
let showTime = 0;

function updateFleet(dt) {
  showTime += dt;
  const t = showTime;
  const place = SCENES[params.scene].place;
  const p = geometry.attributes.position.array;
  const bright = geometry.attributes.aBright.array;
  const maxV = params.flightSpeed;
  // whole-formation sway, like a fleet holding station in light wind
  const sx = Math.sin(t * 0.11) * 1.6 * params.drift;
  const sy = Math.sin(t * 0.17 + 1) * 0.8 * params.drift;
  const sz = Math.sin(t * 0.07 + 2) * 1.2 * params.drift;

  for (let i = 0, n = slots.length; i < n; i++) {
    const i3 = i * 3, i4 = i * 4;
    const b = place(slots[i], t, target);
    const h = params.hover;
    target.x += sx + Math.sin(t * 0.9 + rand[i4] * 40) * h;
    target.y += sy + Math.sin(t * 0.7 + rand[i4 + 1] * 40) * h;
    target.z += sz + Math.sin(t * 0.8 + rand[i4 + 2] * 40) * h;

    // critically damped spring toward the slot, capped at the drone's top speed
    let vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2];
    vx += (OMEGA * OMEGA * (target.x - pos[i3]) - 2 * OMEGA * vx) * dt;
    vy += (OMEGA * OMEGA * (target.y - pos[i3 + 1]) - 2 * OMEGA * vy) * dt;
    vz += (OMEGA * OMEGA * (target.z - pos[i3 + 2]) - 2 * OMEGA * vz) * dt;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > maxV) { const k = maxV / sp; vx *= k; vy *= k; vz *= k; }
    vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
    pos[i3] += vx * dt; pos[i3 + 1] += vy * dt; pos[i3 + 2] += vz * dt;

    p[i3] = pos[i3]; p[i3 + 1] = pos[i3 + 1]; p[i3 + 2] = pos[i3 + 2];

    const twinkle = slots[i].star
      ? 1 - params.twinkle * 0.5 * (1 + Math.sin(t * 2.6 + rand[i4 + 3] * 60))
      : 1;
    bright[i] = b * twinkle;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.aBright.needsUpdate = true;
}

function resetCamera() {
  camera.position.copy(HOME_POSITION);
  controls.target.copy(homeTarget());
  controls.update();
}

/* ---------- control panel ---------- */
const gui = new GUI({ title: 'Old Glory controls' });
addVersions(gui, {
  key: 'old-glory', params, defaults: DEFAULTS, camera, controls,
  apply(prev) {
    sync(); resize();
    const layout = ['scene', 'drones', 'flagWidth', 'starSize'].some(k => params[k] !== prev[k]);
    if (layout) buildFleet(); else applyColors();
  },
});
const sync = () => {
  controls.autoRotate = params.autoRotate;
  controls.autoRotateSpeed = params.rotateSpeed;
  camera.fov = params.fov; camera.updateProjectionMatrix(); updateProjScale();
  uniforms.uSize.value = params.lightSize;
  uniforms.uBrightness.value = params.brightness;
  bloom.strength = params.bloomStrength;
  bloom.radius = params.bloomRadius;
  bloom.threshold = params.bloomThreshold;
  renderer.toneMappingExposure = params.exposure;
  if (padLights) padLights.visible = params.showPads;
};
const rebuild = () => buildFleet();

const fShow = gui.addFolder('Show');
fShow.add(params, 'scene', Object.fromEntries(Object.entries(SCENES).map(([k, s]) => [s.label, k])))
  .name('Scene').onChange(rebuild);
fShow.add(params, 'drones', 300, 3000, 10).name('Drones').onFinishChange(rebuild);
fShow.add({ relaunch: () => launch(false) }, 'relaunch').name('Relaunch from the ground');
fShow.add({ home: resetCamera }, 'home').name('Reset camera');
fShow.add(params, 'autoRotate').name('Auto-rotate').onChange(sync);
fShow.add(params, 'rotateSpeed', 0, 3, 0.05).name('Rotation speed').onChange(sync);
fShow.add(params, 'fov', 20, 90, 1).name('Field of view').onChange(sync);

const fFlag = gui.addFolder('Flag');
fFlag.add(params, 'flagWidth', 40, 200, 1).name('Width (m)').onFinishChange(rebuild);
fFlag.add(params, 'altitude', 30, 150, 1).name('Altitude (m)');
fFlag.add(params, 'waveAmplitude', 0, 15, 0.1).name('Wave depth (m)');
fFlag.add(params, 'waveLength', 10, 120, 1).name('Wavelength (m)');
fFlag.add(params, 'waveSpeed', 0, 20, 0.1).name('Wave speed (m/s)');
fFlag.add(params, 'foldShading', 0, 1, 0.01).name('Fold shading');
fFlag.add(params, 'drift', 0, 5, 0.05).name('Formation drift');

const fDrones = gui.addFolder('Drones');
fDrones.add(params, 'flightSpeed', 1, 25, 0.5).name('Top speed (m/s)');
fDrones.add(params, 'hover', 0, 2, 0.01).name('Hover wobble (m)');
fDrones.add(params, 'lightSize', 0.2, 4, 0.05).name('Light size (m)').onChange(sync);
fDrones.add(params, 'brightness', 0.1, 3, 0.01).name('Brightness').onChange(sync);
fDrones.add(params, 'starSize', 0.5, 4, 0.05).name('Star size').onFinishChange(rebuild);
fDrones.add(params, 'twinkle', 0, 1, 0.01).name('Star twinkle');
fDrones.add(params, 'showPads').name('Show launch pads').onChange(sync);

const fColour = gui.addFolder('Colours');
fColour.addColor(params, 'red').name('Red').onChange(applyColors);
fColour.addColor(params, 'white').name('White').onChange(applyColors);
fColour.addColor(params, 'blue').name('Blue').onChange(applyColors);

const fGlow = gui.addFolder('Glow');
fGlow.add(params, 'bloomStrength', 0, 3, 0.01).name('Glow strength').onChange(sync);
fGlow.add(params, 'bloomRadius', 0, 1, 0.01).name('Glow radius').onChange(sync);
fGlow.add(params, 'bloomThreshold', 0, 1, 0.01).name('Glow threshold').onChange(sync);
fGlow.add(params, 'exposure', 0.2, 3, 0.01).name('Exposure').onChange(sync);

const fPerf = gui.addFolder('Performance');
fPerf.add(params, 'renderScale', 0.5, 2, 0.05).name('Render scale').onChange(resize);
fPerf.add(stats, 'drones').name('Drones in the air').disable().listen();
fPerf.add(stats, 'fps').name('FPS').disable().listen();

gui.add({
  reset() {
    Object.assign(params, DEFAULTS);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    sync(); resize(); resetCamera(); buildFleet();
  },
}, 'reset').name('Reset to defaults');
gui.add({
  fullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); },
}, 'fullscreen').name('Toggle fullscreen');

if (innerWidth < 700) gui.close();   // keep the show visible on small screens

/* ---------- loop ---------- */
const clock = new THREE.Clock();
let frames = 0, fpsTime = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateFleet(dt);
  controls.update(dt);
  composer.render(dt);

  frames++; fpsTime += dt;
  if (fpsTime >= 0.5) { stats.fps = Math.round(frames / fpsTime).toString(); frames = 0; fpsTime = 0; }
}

addEventListener('resize', resize);
resize(); sync();
buildFleet();
renderer.setAnimationLoop(tick);
