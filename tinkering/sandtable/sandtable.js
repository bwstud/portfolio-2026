import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { addVersions } from '../versions.js';

/* ---------- parameters (everything the panel can change) ---------- */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS = {
  autoRotate: !REDUCED,
  rotateSpeed: 0.45,
  distance: 2.4,
  tilt: 38,                  // degrees above the horizon
  fov: 40,

  exaggeration: 6,
  seaLevel: 2,               // metres; also hides near-zero ocean noise in the source data
  density: 480,              // particles across the long side
  size: 1.8,
  shimmer: 0.35,

  glowColor: '#2ee6c5',
  lowColor: '#0a5249',
  contourColor: '#d6fff5',
  brightness: 0.42,
  bloomStrength: 0.95,
  bloomRadius: 0.4,
  bloomThreshold: 0.22,
  exposure: 1.0,

  contourInterval: 40,       // metres
  contourStrength: 0.85,

  oceanDensity: 0.22,
  oceanOpacity: 0.3,

  cursorRadius: 0.16,        // fraction of screen height
  cursorStrength: 0.12,
  cursorScatter: 0.6,
  cursorFollow: 12,

  showBoats: true,
  boatSpeed: 1,
  boatSize: 1,
  wakeLife: 7,
  wakeBrightness: 1,
  wakeSpread: 0.35,

  showMarkers: true,
  showPOIs: true,
  markerHeight: 0.16,

  renderScale: Math.min(devicePixelRatio, 1.5),
};
const params = { ...DEFAULTS };

/* ---------- renderer, scene, camera ---------- */
const canvas = document.getElementById('scene');
const statusEl = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x030605, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(params.fov, innerWidth / innerHeight, 0.01, 50);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.04, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
// pan slides across the map (right-drag, two fingers, or shift-drag); zoom heads for the cursor
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.minDistance = 0.08;
controls.maxDistance = 6;
controls.listenToKeyEvents(window);   // arrow keys pan
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.autoRotate = params.autoRotate;
controls.autoRotateSpeed = params.rotateSpeed;

const HOME_TARGET = new THREE.Vector3(0, 0.04, 0);
const HOME_THETA = Math.PI * 0.15;

function placeCamera(theta) {
  const s = new THREE.Spherical(params.distance, THREE.MathUtils.degToRad(90 - params.tilt),
    theta ?? (new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).theta || HOME_THETA));
  camera.position.setFromSpherical(s).add(controls.target);
  camera.lookAt(controls.target);
}
placeCamera();

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
  uniforms.uAspect.value = camera.aspect;
  uniforms.uPixelRatio.value = pr;
}

/* ---------- particle material: all per-frame motion happens on the GPU ---------- */
const uniforms = {
  uTime: { value: 0 },
  uHeightScale: { value: 0 },
  uSeaLevel: { value: params.seaLevel },
  uMaxElev: { value: 466 },
  uSize: { value: params.size },
  uPixelRatio: { value: 1 },
  uShimmer: { value: params.shimmer },
  uAspect: { value: 1 },
  uTanHalf: { value: 1 },
  uMouse: { value: new THREE.Vector2(9, 9) },
  uActive: { value: 0 },
  uRadius: { value: params.cursorRadius },
  uStrength: { value: params.cursorStrength },
  uScatter: { value: params.cursorScatter },
  uContourInterval: { value: params.contourInterval },
  uContourStrength: { value: params.contourStrength },
  uOceanDensity: { value: params.oceanDensity },
  uOceanOpacity: { value: params.oceanOpacity },
  uColorLow: { value: new THREE.Color(params.lowColor) },
  uColorHigh: { value: new THREE.Color(params.glowColor) },
  uColorContour: { value: new THREE.Color(params.contourColor) },
  uBrightness: { value: params.brightness },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uTime, uHeightScale, uSeaLevel, uMaxElev, uSize, uPixelRatio, uShimmer;
    uniform float uAspect, uTanHalf, uActive, uRadius, uStrength, uScatter;
    uniform float uContourInterval, uOceanDensity, uOceanOpacity;
    uniform vec2 uMouse;
    attribute float aElev;
    attribute float aRand;
    varying float vH;
    varying float vContour;
    varying float vAlpha;
    varying float vDisturb;

    void main() {
      float land = step(uSeaLevel, aElev);
      float h = max(aElev - uSeaLevel, 0.0);
      float keep = max(land, step(aRand, uOceanDensity));   // thin out the ocean

      vec3 p = position;
      p.y = h * uHeightScale + sin(uTime * 1.3 + aRand * 40.0) * uShimmer * 0.004;

      // cursor: push particles away from the pointer in screen space, scaled by depth
      // so the hole is the same size on screen wherever the terrain sits
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vec4 clip = projectionMatrix * mv;
      vec2 d = clip.xy / clip.w - uMouse;
      d.x *= uAspect;
      float dist = length(d);
      float f = 1.0 - smoothstep(0.0, uRadius, dist);
      f *= f * uActive;
      vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0, 1.0);
      float depth = -mv.z;
      float push = f * uStrength * (0.55 + 0.9 * aRand);
      mv.xy += dir * push * depth * uTanHalf * vec2(1.0, 1.0);
      mv.z += f * uScatter * (aRand - 0.35) * 0.25;
      gl_Position = projectionMatrix * mv;

      // contour lines every uContourInterval metres (and the coastline at sea level)
      float fr = fract(h / uContourInterval);
      vContour = land * (1.0 - smoothstep(0.0, 0.09, min(fr, 1.0 - fr)));
      vH = clamp(h / (uMaxElev - uSeaLevel), 0.0, 1.0);
      vAlpha = keep * mix(uOceanOpacity, 1.0, land);
      vDisturb = f;

      gl_PointSize = keep * uSize * uPixelRatio * (2.2 / max(depth, 0.05)) * (0.7 + 0.6 * aRand) * mix(0.7, 1.0, land);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColorLow, uColorHigh, uColorContour;
    uniform float uBrightness, uContourStrength;
    varying float vH;
    varying float vContour;
    varying float vAlpha;
    varying float vDisturb;

    void main() {
      float r = length(gl_PointCoord - 0.5);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.05, r);
      vec3 col = mix(uColorLow, uColorHigh, pow(vH, 0.6));
      col = mix(col, uColorContour, vContour * uContourStrength);
      col += uColorHigh * vDisturb * 0.8;                 // stirred sand flares
      gl_FragColor = vec4(col * uBrightness, a * vAlpha);
    }
  `,
});

const points = new THREE.Points(new THREE.BufferGeometry(), material);
points.frustumCulled = false;
scene.add(points);

/* ---------- terrain: Mount Desert Island heightmap (int16 decimetres) ---------- */
let terrain = null;   // { w, h, data: Float32Array metres }

async function loadTerrain() {
  const [meta, buf] = await Promise.all([
    fetch('acadia.json').then(r => r.json()),
    fetch('acadia.bin').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]);
  const raw = new Int16Array(buf);
  const data = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw[i] / 10;
  terrain = { w: meta.width, h: meta.height, data, metersPerPixel: meta.metersPerPixel, merc: meta.mercator };
  uniforms.uMaxElev.value = meta.max;
}

function sample(x, y) {   // bilinear, in heightmap pixels
  const { w, h, data } = terrain;
  x = Math.min(Math.max(x, 0), w - 1.001); y = Math.min(Math.max(y, 0), h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  const top = data[i] + (data[i + 1] - data[i]) * fx;
  const bot = data[i + w] + (data[i + w + 1] - data[i + w]) * fx;
  return top + (bot - top) * fy;
}

function buildParticles() {
  const { w, h } = terrain;
  const long = Math.max(w, h);
  const cols = Math.round(params.density * w / long), rows = Math.round(params.density * h / long);
  const n = cols * rows;
  const pos = new Float32Array(n * 3), elev = new Float32Array(n), rand = new Float32Array(n);
  const sx = w / long, sz = h / long;   // world extent: long side spans -1..1
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, k++) {
      const u = (c + Math.random()) / cols, v = (r + Math.random()) / rows;   // jitter avoids moiré
      pos[k * 3] = (u * 2 - 1) * sx;
      pos[k * 3 + 2] = (v * 2 - 1) * sz;   // row 0 is north → −z
      elev[k] = sample(u * (w - 1), v * (h - 1));
      rand[k] = Math.random();
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aElev', new THREE.BufferAttribute(elev, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  points.geometry.dispose();
  points.geometry = g;
  stats.particles = n.toLocaleString();
}

function geoToScene(lat, lon) {   // → heightmap uv and world x/z
  const { zoom, x0, y0, x1, y1 } = terrain.merc;
  const n = 2 ** zoom, phi = THREE.MathUtils.degToRad(lat);
  const tx = (lon + 180) / 360 * n;
  const ty = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * n;
  const u = (tx - x0) / (x1 - x0), v = (ty - y0) / (y1 - y0);
  const long = Math.max(terrain.w, terrain.h);
  return { u, v, x: (u * 2 - 1) * terrain.w / long, z: (v * 2 - 1) * terrain.h / long };
}

function applyHeightScale() {
  // long side (2 world units) covers long * metersPerPixel metres on the ground
  const groundMeters = Math.max(terrain.w, terrain.h) * terrain.metersPerPixel;
  uniforms.uHeightScale.value = params.exaggeration * 2 / groundMeters;
}

/* ---------- markers ----------
   Each marker is a beacon on the terrain, a beam rising from it, and an HTML label at the top of the beam.
   The engagement marker is pinned (always shown). Points of interest stay hidden until the cursor's hole
   uncovers them; hovering one grows its beam and then shows its label. */
const PINNED = [
  { lat: 44.3097222, lon: -68.2080556, title: 'Blackwoods Campground.', note: 'Engaged here 09/06/2026.' },
];
// Coordinates checked against the heightmap (lakes sit at their ~83 m surface; peaks match summit heights).
const POIS = [
  ['Cadillac Mountain', 44.3526, -68.2249, '466 m, the highest point on the U.S. Atlantic coast.'],
  ['Jordan Pond', 44.3330, -68.2560, 'Clear glacial lake framed by the Bubbles.'],
  ['The Bubbles', 44.3417, -68.2496, 'Twin rounded peaks, home of the glacial erratic Bubble Rock.'],
  ['Sand Beach', 44.3299, -68.1834, 'One of the few sand beaches on this rocky coast.'],
  ['Thunder Hole', 44.3207, -68.1888, 'Waves boom through a narrow granite inlet.'],
  ['Otter Cliffs', 44.3094, -68.1906, 'Pink granite cliffs rising straight from the sea.'],
  ['Precipice Trail', 44.3488, -68.1886, 'Iron-rung climb up the east face of Champlain Mountain.'],
  ['Bar Harbor', 44.3876, -68.2039, 'Gateway town on Frenchman Bay.'],
  ['Eagle Lake', 44.3730, -68.2450, 'Carriage-road loop around a quiet glacial lake.'],
  ['Echo Lake Beach', 44.3245, -68.3335, 'Freshwater swimming beach beneath Beech Cliff.'],
  ['Beech Mountain', 44.3127, -68.3443, 'Fire-tower summit overlooking Long Pond.'],
  ['Somesville', 44.3637, -68.3317, 'Village at the head of Somes Sound.'],
  ['Northeast Harbor', 44.2934, -68.2861, 'Sailing village at the mouth of Somes Sound.'],
  ['Southwest Harbor', 44.2795, -68.3244, 'Working harbor on the quiet side of the island.'],
  ['Bass Harbor Head Light', 44.2220, -68.3373, 'Lighthouse on the island’s southern tip, lit since 1858.'],
  ['Islesford', 44.2620, -68.2300, 'Village on Little Cranberry Island.'],
];
const MARKERS = [
  ...PINNED.map(m => ({ ...m, pinned: true })),
  ...POIS.map(([name, lat, lon, note]) => ({ lat, lon, title: name + '.', note, pinned: false })),
];
const NM = MARKERS.length;

const beaconGeom = new THREE.BufferGeometry();
const beaconPos = new THREE.BufferAttribute(new Float32Array(NM * 3), 3);
const beaconIntensity = new THREE.BufferAttribute(new Float32Array(NM), 1);
const beaconScale = new THREE.BufferAttribute(new Float32Array(MARKERS.map(m => m.pinned ? 1 : 0.7)), 1);
beaconGeom.setAttribute('position', beaconPos);
beaconGeom.setAttribute('aIntensity', beaconIntensity);
beaconGeom.setAttribute('aScale', beaconScale);
const beacons = new THREE.Points(beaconGeom, new THREE.ShaderMaterial({
  uniforms: { uTime: uniforms.uTime, uPixelRatio: uniforms.uPixelRatio, uColor: { value: new THREE.Color('#e9fffa') } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uPixelRatio;
    attribute float aIntensity, aScale;
    varying float vIntensity;
    varying float vSeed;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      vIntensity = aIntensity;
      vSeed = position.x * 13.0 + position.z * 7.0;   // stagger the ripples
      gl_PointSize = step(0.01, aIntensity) * 26.0 * aScale * (0.6 + 0.4 * aIntensity) * uPixelRatio * (2.2 / max(-mv.z, 0.05));
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying float vIntensity;
    varying float vSeed;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      if (r > 1.0) discard;
      float core = smoothstep(0.22, 0.0, r);
      float t = fract(uTime * 0.6 + vSeed);
      float ring = smoothstep(0.08, 0.0, abs(r - t)) * (1.0 - t);   // ripple expanding outward
      gl_FragColor = vec4(uColor * (core * 1.6 + ring * 0.9) * vIntensity, 1.0);
    }
  `,
}));

const beamGeom = new THREE.BufferGeometry();
const beamPos = new THREE.BufferAttribute(new Float32Array(NM * 6), 3);
const beamColor = new THREE.BufferAttribute(new Float32Array(NM * 6), 3);
beamGeom.setAttribute('position', beamPos);
beamGeom.setAttribute('color', beamColor);
const beams = new THREE.LineSegments(beamGeom, new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
beacons.frustumCulled = beams.frustumCulled = false;

const markerGroup = new THREE.Group();
markerGroup.add(beams, beacons);
scene.add(markerGroup);

const markers = MARKERS.map(m => {
  const label = document.createElement('div');
  label.className = 'marker-label' + (m.pinned ? ' is-pinned' : '');
  label.innerHTML = '<strong></strong><span></span>';
  label.firstChild.textContent = m.title;
  label.lastChild.textContent = m.note;
  label.hidden = true;
  document.body.appendChild(label);
  return { ...m, label, ground: new THREE.Vector3(), top: new THREE.Vector3(),
    reveal: m.pinned ? 1 : 0, grow: m.pinned ? 1 : 0, labelShown: false };
});

function placeMarkers() {
  for (const m of markers) {
    const { u, v, x, z } = geoToScene(m.lat, m.lon);
    const elev = sample(u * (terrain.w - 1), v * (terrain.h - 1));
    m.ground.set(x, Math.max(elev - params.seaLevel, 0) * uniforms.uHeightScale.value, z);
  }
}

const projected = new THREE.Vector3();
const easeOut = t => 1 - (1 - t) ** 3;
let hovered = null;

function updateMarkers(dt) {
  if (!terrain) return;
  const mouse = uniforms.uMouse.value, active = uniforms.uActive.value;
  const holeR = uniforms.uRadius.value * 0.85;                          // inside the cleared hole
  const hoverR = Math.max(uniforms.uRadius.value * 0.3, 30 / (innerHeight / 2));   // ≥ 30 px
  const kIn = 1 - Math.exp(-dt * 8), kOut = 1 - Math.exp(-dt * 5);

  // which POIs the hole uncovers, and which one (nearest) is hovered
  let best = null, bestDist = Infinity;
  for (const m of markers) {
    projected.copy(m.ground).project(camera);
    m.ndcX = projected.x; m.ndcY = projected.y; m.behind = projected.z > 1;
    if (m.pinned) continue;
    const dx = (projected.x - mouse.x) * camera.aspect, dy = projected.y - mouse.y;
    m.dist = Math.hypot(dx, dy);
    const uncovered = params.showPOIs && !m.behind && active > 0.3 && m.dist < holeR;
    m.reveal += ((uncovered ? 1 : 0) - m.reveal) * (uncovered ? kIn : kOut);
    const reach = m === hovered ? hoverR * 1.4 : hoverR;                 // a little stickiness once hovered
    if (uncovered && m.dist < reach && m.dist < bestDist) { best = m; bestDist = m.dist; }
  }
  hovered = best;

  markers.forEach((m, i) => {
    if (!m.pinned) m.grow = m === hovered ? Math.min(1, m.grow + dt / 0.7) : Math.max(0, m.grow - dt / 0.35);
    const g = m.ground, h = params.markerHeight * easeOut(m.grow);
    m.top.set(g.x, g.y + h, g.z);
    beaconPos.setXYZ(i, g.x, g.y, g.z);
    beaconIntensity.setX(i, m.reveal);
    beamPos.setXYZ(i * 2, g.x, g.y, g.z);
    beamPos.setXYZ(i * 2 + 1, g.x, g.y + h, g.z);
    const c = m.reveal * (m.grow > 0 ? 1 : 0);
    beamColor.setXYZ(i * 2, 0.9 * c, 1 * c, 0.97 * c);
    beamColor.setXYZ(i * 2 + 1, 0, 0.05 * c, 0.04 * c);

    // label: pinned always; POIs once the beam has (nearly) reached the top
    projected.copy(m.top).project(camera);
    const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2;
    const show = params.showMarkers && onScreen && (m.pinned || m.grow > 0.85);
    if (show !== m.labelShown) { m.labelShown = show; m.label.classList.toggle('is-shown', show); if (show) m.label.hidden = false; }
    if (!show) { if (m.pinned || m.grow === 0) m.label.hidden = true; return; }   // POI labels fade out first
    const px = (projected.x + 1) / 2 * innerWidth, py = (1 - projected.y) / 2 * innerHeight;
    m.label.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, calc(-100% - 6px))`;
  });
  beaconPos.needsUpdate = beaconIntensity.needsUpdate = beamPos.needsUpdate = beamColor.needsUpdate = true;
}

/* ---------- boats: tiny particle hulls on looping routes, with GPU-animated wakes ---------- */
// Routes are lat/lon waypoints checked against the heightmap to stay ≥ ~70 m from land.
const BOATS = [
  { type: 'tour', length: 0.02, speed: 0.010, route: [
    [44.4177, -68.2207], [44.4324, -68.2116], [44.4372, -68.1865], [44.4299, -68.1613],
    [44.4185, -68.1613], [44.412, -68.1796], [44.4112, -68.2025]] },   // Frenchman Bay, off Bar Harbor
  { type: 'lobster', length: 0.012, speed: 0.007, route: [
    [44.318, -68.17], [44.3, -68.168], [44.282, -68.18], [44.276, -68.205],
    [44.29, -68.196], [44.305, -68.183]] },   // off Otter Cliffs
  { type: 'lobster', length: 0.012, speed: 0.0065, route: [
    [44.322, -68.468], [44.32, -68.443], [44.296, -68.444], [44.288, -68.462],
    [44.3, -68.472]] },   // Western Bay
  { type: 'sail', length: 0.011, speed: 0.005, route: [
    [44.30792, -68.31135], [44.30988, -68.3118], [44.31184, -68.31157], [44.31379, -68.31135],
    [44.31575, -68.31135], [44.31771, -68.3118], [44.31966, -68.31066], [44.32162, -68.3093],
    [44.32357, -68.30952], [44.32553, -68.30998], [44.32749, -68.31066], [44.32944, -68.31157],
    [44.3314, -68.3118], [44.33335, -68.31226], [44.33531, -68.31226], [44.33726, -68.31226],
    [44.33922, -68.31271], [44.34117, -68.31476], [44.34313, -68.31636], [44.34509, -68.31704],
    [44.34704, -68.31841], [44.34704, -68.31704], [44.34509, -68.31568], [44.34313, -68.31499],
    [44.34117, -68.3134], [44.33922, -68.31135], [44.33726, -68.31089], [44.33531, -68.31089],
    [44.33335, -68.31089], [44.3314, -68.31043], [44.32944, -68.31021], [44.32749, -68.3093],
    [44.32553, -68.30861], [44.32357, -68.30816], [44.32162, -68.30793], [44.31966, -68.3093],
    [44.31771, -68.31043], [44.31575, -68.30998], [44.31379, -68.30998], [44.31184, -68.31021],
    [44.30988, -68.31043], [44.30792, -68.30998]] },   // up and down Somes Sound
];

// Hull shapes in local space: +x is the bow, y is up, z is the beam. All in units of boat length.
function boatShape(type) {
  const pts = [];
  const add = (x, y, z) => pts.push(x, y, z);
  const line = (a, b, n) => { for (let i = 0; i <= n; i++) { const t = i / n; add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); } };
  const box = (x0, x1, y0, y1, hw, n) => {
    for (const y of [y0, y1]) { line([x0, y, -hw], [x1, y, -hw], n); line([x0, y, hw], [x1, y, hw], n); line([x1, y, -hw], [x1, y, hw], 3); line([x0, y, -hw], [x0, y, hw], 3); }
    for (const x of [x0, x1]) for (const z of [-hw, hw]) line([x, y0, z], [x, y1, z], 3);
  };
  const beam = { tour: 0.3, lobster: 0.34, sail: 0.28 }[type];
  for (let i = 0; i <= 24; i++) {   // deck outline: full beam aft, fine entry at the bow
    const x = -0.5 + i / 24, f = x < 0.1 ? 1 : Math.sqrt(Math.max(0, 1 - ((x - 0.1) / 0.4) ** 2));
    add(x, 0.04, beam / 2 * f); add(x, 0.04, -beam / 2 * f);
  }
  line([-0.5, 0.04, -beam / 2], [-0.5, 0.04, beam / 2], 4);   // transom
  if (type === 'lobster') box(-0.02, 0.24, 0.04, 0.26, beam * 0.32, 5);   // wheelhouse forward, open work deck aft
  if (type === 'tour') { box(-0.32, 0.3, 0.04, 0.16, beam * 0.42, 10); box(-0.18, 0.18, 0.16, 0.27, beam * 0.34, 7); }
  if (type === 'sail') {
    line([0.1, 0.04, 0], [0.1, 1.3, 0], 18);   // mast
    line([0.1, 0.1, 0], [-0.42, 0.1, 0], 8);   // boom
    line([-0.42, 0.1, 0], [0.1, 1.24, 0], 18);   // mainsail leech
    line([0.1, 1.2, 0], [0.48, 0.06, 0], 16);   // jib
  }
  return new Float32Array(pts);
}

const boatMaterial = new THREE.ShaderMaterial({
  uniforms: { uPixelRatio: uniforms.uPixelRatio, uColor: { value: new THREE.Color('#e9fffa') } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uPixelRatio;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = min(1.6 * (2.2 / max(-mv.z, 0.05)), 3.0) * uPixelRatio;   // capped: crisp outline when zoomed in
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    void main() {
      float r = length(gl_PointCoord - 0.5);
      if (r > 0.5) discard;
      gl_FragColor = vec4(uColor * smoothstep(0.5, 0.0, r) * 0.32, 1.0);   // dim: many points overlap on a tiny hull
    }
  `,
});

const WAKE_PER_BOAT = 1200, WAKE_SPACING = 0.0005;
const wakeCount = WAKE_PER_BOAT * BOATS.length;
const wakeGeom = new THREE.BufferGeometry();
const wakeOrigin = new THREE.BufferAttribute(new Float32Array(wakeCount * 3), 3);
const wakeVel = new THREE.BufferAttribute(new Float32Array(wakeCount * 2), 2);
const wakeBirth = new THREE.BufferAttribute(new Float32Array(wakeCount).fill(-1e6), 1);
const wakeKind = new THREE.BufferAttribute(new Float32Array(wakeCount), 1);   // 0 = V arm, 1 = churned centre
for (const a of [wakeOrigin, wakeVel, wakeBirth, wakeKind]) a.setUsage(THREE.DynamicDrawUsage);
wakeGeom.setAttribute('position', wakeOrigin);
wakeGeom.setAttribute('aVel', wakeVel);
wakeGeom.setAttribute('aBirth', wakeBirth);
wakeGeom.setAttribute('aKind', wakeKind);

const wakeUniforms = {
  uTime: uniforms.uTime,
  uPixelRatio: uniforms.uPixelRatio,
  uLife: { value: params.wakeLife },
  uBrightness: { value: params.wakeBrightness },
  uColor: uniforms.uColorHigh,
};
const wakes = new THREE.Points(wakeGeom, new THREE.ShaderMaterial({
  uniforms: wakeUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uTime, uPixelRatio, uLife;
    attribute vec2 aVel;
    attribute float aBirth, aKind;
    varying float vFade;
    varying float vKind;
    void main() {
      float age = uTime - aBirth;
      float life = uLife * mix(1.0, 0.55, aKind);   // churned water settles first
      float t = clamp(age / life, 0.0, 1.0);
      vec3 p = position;
      p.xz += aVel * age * (1.0 - 0.4 * t);           // spreads outward, slowing as it goes
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      vFade = (age < 0.0 || age > life) ? 0.0 : pow(1.0 - t, 1.6);
      vKind = aKind;
      gl_PointSize = step(0.001, vFade) * uPixelRatio * min((1.1 + 1.2 * t) * (2.2 / max(-mv.z, 0.05)), 2.0 + 2.5 * t);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uBrightness;
    varying float vFade;
    varying float vKind;
    void main() {
      float r = length(gl_PointCoord - 0.5);
      if (r > 0.5 || vFade <= 0.0) discard;
      vec3 col = mix(uColor, vec3(1.0), 0.45 + 0.3 * vKind);
      gl_FragColor = vec4(col * smoothstep(0.5, 0.0, r) * vFade * uBrightness * 0.55, 1.0);
    }
  `,
}));
wakes.frustumCulled = false;

const boatGroup = new THREE.Group();
boatGroup.add(wakes);
scene.add(boatGroup);

const boats = BOATS.map((b, i) => {
  const mesh = new THREE.Points(new THREE.BufferGeometry().setAttribute('position',
    new THREE.BufferAttribute(boatShape(b.type), 3)), boatMaterial);
  mesh.frustumCulled = false;
  boatGroup.add(mesh);
  return { ...b, mesh, curve: null, u: Math.random(), heading: 0, phase: Math.random() * 10,
    slot: 0, base: i * WAKE_PER_BOAT, travelled: 0, last: new THREE.Vector3() };
});

function placeBoatRoutes() {
  for (const b of boats) {
    const pts = b.route.map(([lat, lon]) => { const g = geoToScene(lat, lon); return new THREE.Vector3(g.x, 0, g.z); });
    b.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    b.curve.arcLengthDivisions = 3000;
    b.curveLength = b.curve.getLength();
    b.last.copy(b.curve.getPointAt(b.u));
    b.heading = (() => { const t = b.curve.getTangentAt(b.u); return Math.atan2(-t.z, t.x); })();
  }
}

const tangent = new THREE.Vector3(), bow = new THREE.Vector3();
function emitWake(b, pos, dirX, dirZ, speed) {
  const halfBeam = b.length * params.boatSize * 0.15;
  const sternX = pos.x - dirX * b.length * params.boatSize * 0.5, sternZ = pos.z - dirZ * b.length * params.boatSize * 0.5;
  const px = -dirZ, pz = dirX;   // starboard-ish perpendicular
  const spread = speed * params.wakeSpread;
  for (let k = 0; k < 3; k++) {
    const i = b.base + b.slot; b.slot = (b.slot + 1) % WAKE_PER_BOAT;
    const side = k === 0 ? -1 : k === 1 ? 1 : 0;
    const jitter = (Math.random() - 0.5) * 0.3;
    wakeOrigin.setXYZ(i, sternX + px * halfBeam * side, 0.0008, sternZ + pz * halfBeam * side);
    const v = side === 0 ? spread * jitter * 0.6 : side * spread * (0.85 + 0.3 * Math.random());
    wakeVel.setXY(i, px * v - dirX * speed * 0.05, pz * v - dirZ * speed * 0.05);
    wakeBirth.setX(i, uniforms.uTime.value);
    wakeKind.setX(i, side === 0 ? 1 : 0);
  }
}

function updateBoats(dt) {
  if (!terrain || !params.showBoats) return;
  for (const b of boats) {
    // lobster boats work their traps: slow down and speed up as they go
    const pace = b.type === 'lobster' ? 0.55 + 0.45 * Math.sin(uniforms.uTime.value * 0.35 + b.phase) : 1;
    const speed = b.speed * params.boatSpeed * pace;
    b.u = (b.u + speed * dt / b.curveLength) % 1;
    const pos = b.curve.getPointAt(b.u);
    b.curve.getTangentAt(b.u, tangent);
    const target = Math.atan2(-tangent.z, tangent.x);
    let d = target - b.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    b.heading += d * (1 - Math.exp(-dt * 4));   // smooth out wiggles in narrow channels
    b.mesh.position.set(pos.x, 0.0015, pos.z);
    b.mesh.rotation.y = b.heading;
    b.mesh.scale.setScalar(b.length * params.boatSize);

    bow.set(Math.cos(b.heading), 0, -Math.sin(b.heading));
    b.travelled += pos.distanceTo(b.last);
    b.last.copy(pos);
    while (b.travelled >= WAKE_SPACING) { b.travelled -= WAKE_SPACING; emitWake(b, pos, bow.x, bow.z, speed); }
  }
  wakeOrigin.needsUpdate = wakeVel.needsUpdate = wakeBirth.needsUpdate = wakeKind.needsUpdate = true;
}

/* ---------- pointer ---------- */
const mouseTarget = new THREE.Vector2(9, 9);
let activeTarget = 0;
canvas.addEventListener('pointermove', e => {
  mouseTarget.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (uniforms.uActive.value < 0.01) uniforms.uMouse.value.copy(mouseTarget);   // don't sweep in from offscreen
  activeTarget = 1;
});
canvas.addEventListener('pointerleave', () => { activeTarget = 0; });
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') {   // touch: disturb where the finger lands
    mouseTarget.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    uniforms.uMouse.value.copy(mouseTarget);
    activeTarget = 1;
  }
});
canvas.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') activeTarget = 0; });

/* ---------- camera moves: home, and double-click to fly to a spot ---------- */
let flight = null;   // { from, to, t } eased target move; the camera keeps its offset

function resetCamera() {
  flight = null;
  params.distance = DEFAULTS.distance;
  params.tilt = DEFAULTS.tilt;
  controls.target.copy(HOME_TARGET);
  placeCamera(HOME_THETA);
}

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOME_TARGET.y);
const raycaster = new THREE.Raycaster();
canvas.addEventListener('dblclick', e => {
  raycaster.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  if (!hit) return;
  flight = { from: controls.target.clone(), to: clampTarget(hit), t: 0, zoom: Math.min(1, 0.6 / offset.length()) };
});

// keep the orbit centre over the map so panning can't wander off into empty space
function clampTarget(v) {
  v.x = THREE.MathUtils.clamp(v.x, -1.2, 1.2);
  v.z = THREE.MathUtils.clamp(v.z, -1.2, 1.2);
  v.y = HOME_TARGET.y;
  return v;
}

function updateFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / 1.1);
  const e = flight.t * flight.t * (3 - 2 * flight.t);
  const prev = controls.target.clone();
  controls.target.lerpVectors(flight.from, flight.to, e);
  camera.position.add(controls.target.clone().sub(prev));
  // ease in closer on the way, unless already close
  const off = camera.position.clone().sub(controls.target);
  off.multiplyScalar(Math.pow(flight.zoom, dt / 1.1));
  camera.position.copy(controls.target).add(off);
  if (flight.t >= 1) flight = null;
}

/* ---------- control panel ---------- */
const stats = { fps: '—', particles: '—' };
const gui = new GUI({ title: 'Sandtable controls' });
addVersions(gui, {
  key: 'sandtable', params, defaults: DEFAULTS, camera, controls,
  apply(prev) {
    flight = null;
    sync(); resize();
    if (params.density !== prev.density && terrain) buildParticles();
  },
});
const sync = () => {
  controls.autoRotate = params.autoRotate;
  controls.autoRotateSpeed = params.rotateSpeed;
  camera.fov = params.fov; camera.updateProjectionMatrix();
  uniforms.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(params.fov) / 2);
  uniforms.uSeaLevel.value = params.seaLevel;
  uniforms.uSize.value = params.size;
  uniforms.uShimmer.value = params.shimmer;
  uniforms.uColorHigh.value.set(params.glowColor);
  uniforms.uColorLow.value.set(params.lowColor);
  uniforms.uColorContour.value.set(params.contourColor);
  uniforms.uBrightness.value = params.brightness;
  bloom.strength = params.bloomStrength;
  bloom.radius = params.bloomRadius;
  bloom.threshold = params.bloomThreshold;
  renderer.toneMappingExposure = params.exposure;
  uniforms.uContourInterval.value = params.contourInterval;
  uniforms.uContourStrength.value = params.contourStrength;
  uniforms.uOceanDensity.value = params.oceanDensity;
  uniforms.uOceanOpacity.value = params.oceanOpacity;
  uniforms.uRadius.value = params.cursorRadius;
  uniforms.uStrength.value = params.cursorStrength;
  uniforms.uScatter.value = params.cursorScatter;
  markerGroup.visible = params.showMarkers;
  boatGroup.visible = params.showBoats;
  wakeUniforms.uLife.value = params.wakeLife;
  wakeUniforms.uBrightness.value = params.wakeBrightness;
  if (terrain) { applyHeightScale(); placeMarkers(); }
};

const fScene = gui.addFolder('Scene');
fScene.add(params, 'autoRotate').name('Auto-rotate').onChange(sync);
fScene.add(params, 'rotateSpeed', 0, 4, 0.05).name('Rotation speed').onChange(sync);
fScene.add({ home: resetCamera }, 'home').name('Reset camera');
fScene.add(params, 'distance', 0.08, 6, 0.01).name('Camera distance').onChange(placeCamera).listen();
fScene.add(params, 'tilt', 2, 88, 0.5).name('Camera tilt (°)').onChange(placeCamera).listen();
fScene.add(params, 'fov', 15, 90, 1).name('Field of view').onChange(sync);

const fTerrain = gui.addFolder('Terrain');
fTerrain.add(params, 'exaggeration', 1, 20, 0.1).name('Height exaggeration').onChange(sync);
fTerrain.add(params, 'seaLevel', -5, 60, 0.5).name('Sea level (m)').onChange(sync);
fTerrain.add(params, 'density', 120, 900, 10).name('Particle density')
  .onFinishChange(() => terrain && buildParticles());
fTerrain.add(params, 'size', 0.3, 8, 0.05).name('Particle size').onChange(sync);
fTerrain.add(params, 'shimmer', 0, 2, 0.01).name('Shimmer').onChange(sync);

const fLight = gui.addFolder('Light & glow');
fLight.addColor(params, 'glowColor').name('Glow colour').onChange(sync);
fLight.addColor(params, 'lowColor').name('Lowland colour').onChange(sync);
fLight.add(params, 'brightness', 0.05, 3, 0.01).name('Particle brightness').onChange(sync);
fLight.add(params, 'bloomStrength', 0, 3, 0.01).name('Glow strength').onChange(sync);
fLight.add(params, 'bloomRadius', 0, 1, 0.01).name('Glow radius').onChange(sync);
fLight.add(params, 'bloomThreshold', 0, 1, 0.01).name('Glow threshold').onChange(sync);
fLight.add(params, 'exposure', 0.2, 3, 0.01).name('Exposure').onChange(sync);

const fContours = gui.addFolder('Contours');
fContours.add(params, 'contourInterval', 5, 150, 1).name('Interval (m)').onChange(sync);
fContours.add(params, 'contourStrength', 0, 1, 0.01).name('Line strength').onChange(sync);
fContours.addColor(params, 'contourColor').name('Line colour').onChange(sync);

const fOcean = gui.addFolder('Ocean');
fOcean.add(params, 'oceanDensity', 0, 1, 0.01).name('Density').onChange(sync);
fOcean.add(params, 'oceanOpacity', 0, 1, 0.01).name('Opacity').onChange(sync);

const fCursor = gui.addFolder('Cursor');
fCursor.add(params, 'cursorRadius', 0.02, 0.6, 0.005).name('Radius').onChange(sync);
fCursor.add(params, 'cursorStrength', 0, 0.6, 0.005).name('Push distance').onChange(sync);
fCursor.add(params, 'cursorScatter', 0, 3, 0.01).name('Depth scatter').onChange(sync);
fCursor.add(params, 'cursorFollow', 1, 40, 0.5).name('Follow speed');

const fBoats = gui.addFolder('Boats');
fBoats.add(params, 'showBoats').name('Show boats').onChange(sync);
fBoats.add(params, 'boatSpeed', 0, 5, 0.05).name('Speed');
fBoats.add(params, 'boatSize', 0.3, 4, 0.05).name('Boat size');
fBoats.add(params, 'wakeLife', 1, 20, 0.5).name('Wake length (s)').onChange(sync);
fBoats.add(params, 'wakeSpread', 0, 1.2, 0.01).name('Wake spread');
fBoats.add(params, 'wakeBrightness', 0, 3, 0.01).name('Wake brightness').onChange(sync);

const fMarkers = gui.addFolder('Markers');
fMarkers.add(params, 'showMarkers').name('Show markers').onChange(sync);
fMarkers.add(params, 'showPOIs').name('Reveal points of interest');
fMarkers.add(params, 'markerHeight', 0.02, 0.6, 0.005).name('Beam height').onChange(sync);

const fPerf = gui.addFolder('Performance');
fPerf.add(params, 'renderScale', 0.5, 2, 0.05).name('Render scale').onChange(resize);
fPerf.add(stats, 'particles').name('Particles').disable().listen();
fPerf.add(stats, 'fps').name('FPS').disable().listen();

gui.add({
  reset() {
    const rebuild = params.density !== DEFAULTS.density;
    Object.assign(params, DEFAULTS);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    sync(); resetCamera(); resize();
    if (rebuild && terrain) buildParticles();
  },
}, 'reset').name('Reset to defaults');
gui.add({
  fullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); },
}, 'fullscreen').name('Toggle fullscreen');

if (innerWidth < 700) gui.close();   // keep the map visible on small screens

/* ---------- loop ---------- */
const clock = new THREE.Clock();
const offset = new THREE.Vector3();
let frames = 0, fpsTime = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  uniforms.uTime.value += dt;

  const k = 1 - Math.exp(-dt * params.cursorFollow);
  uniforms.uMouse.value.lerp(mouseTarget, k);
  uniforms.uActive.value += (activeTarget - uniforms.uActive.value) * (1 - Math.exp(-dt * 6));

  updateBoats(dt);
  updateFlight(dt);
  controls.update(dt);
  const before = controls.target.clone();
  clampTarget(controls.target);
  camera.position.add(controls.target.clone().sub(before));
  offset.copy(camera.position).sub(controls.target);
  const dist = offset.length();
  params.distance = Math.round(dist * 100) / 100;
  params.tilt = Math.round((90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(offset.y / dist, -1, 1)))) * 2) / 2;

  composer.render(dt);
  updateMarkers(dt);

  frames++; fpsTime += dt;
  if (fpsTime >= 0.5) { stats.fps = Math.round(frames / fpsTime).toString(); frames = 0; fpsTime = 0; }
}

addEventListener('resize', resize);
resize(); sync();

loadTerrain().then(() => {
  applyHeightScale();
  buildParticles();
  placeMarkers();
  placeBoatRoutes();
  statusEl.style.opacity = 0;
  renderer.setAnimationLoop(tick);
}).catch(err => {
  statusEl.textContent = 'Could not load terrain data';
  console.error(err);
});
