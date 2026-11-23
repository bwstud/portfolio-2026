import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { KNOTS } from './knots.js';
import { Player } from './player.js';
import { TABLE, BAR } from './physics.js';

/* ---------- rope materials: how each one looks and how it behaves ---------- */
// bend: resistance to bending. friction: grip against itself and the table.
// The look: rough is the surface's scatter, spec how much it reflects at all (fibres reflect
// little), sheen the fuzz of loose fibres catching light at grazing angles, relief how deep
// the strands are cut into the rope's outline.
const MATERIALS = {
  poly: { name: 'Polyester braid', note: 'Firm double braid. A good all-rounder.', pattern: 'braid', rough: 0.62, spec: 0.55, sheen: 0.5, relief: 0.09, bend: 0.14, friction: 0.35 },
  nylon: { name: 'Nylon kernmantle', note: 'Smooth, slick sheath. Knots slide easily.', pattern: 'fine', rough: 0.48, spec: 0.75, sheen: 0.35, relief: 0.05, bend: 0.17, friction: 0.3 },
  paracord: { name: 'Paracord', note: 'Thin, soft and supple.', pattern: 'paracord', rough: 0.58, spec: 0.6, sheen: 0.6, relief: 0.07, bend: 0.08, friction: 0.3 },
  cotton: { name: 'Cotton', note: 'Soft 3-strand. Floppy, holds well.', pattern: 'soft', rough: 0.95, spec: 0.3, sheen: 1, relief: 0.12, bend: 0.06, friction: 0.55 },
  manila: { name: 'Manila', note: 'Natural fibre, 3-strand. Stiff and grippy.', pattern: 'laid', rough: 0.88, spec: 0.35, sheen: 0.7, relief: 0.16, bend: 0.3, friction: 0.65 },
};
const COLORS = ['#d9542b', '#e8a33a', '#e9d36b', '#3f9a5c', '#2f6fd6', '#1f3557', '#7a4bb3', '#ece6da', '#c9a66b', '#2a2a2c'];
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

const params = new URLSearchParams(location.search);
if (params.get('ui') === '0') document.body.classList.add('no-ui');   // clean frames for thumbnails
const store = {
  get(k) { try { return localStorage.getItem('knot-dojo:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('knot-dojo:' + k, v); } catch {} },
};
const state = {
  knot: KNOTS.find(k => k.id === (params.get('knot') || store.get('knot'))) || KNOTS[0],
  material: MATERIALS[store.get('material')] ? store.get('material') : 'poly',
  color: store.get('color') || COLORS[0],
  color2: store.get('color2') || COLORS[4],
  thickness: Math.min(14, Math.max(6, +store.get('thickness') || 10)),
  speed: SPEEDS.includes(+store.get('speed')) ? +store.get('speed') : 1,
  playing: params.get('play') !== '0',
  showPath: store.get('path') === '1',
  showHands: store.get('hands') !== '0',
  // ambient occlusion costs a few milliseconds a frame: on by default except on small screens
  ao: params.has('ao') ? params.get('ao') === '1' : store.get('ao') ? store.get('ao') === '1' : innerWidth >= 900,
  orbit: false,
};

/* ---------- renderer, scene, camera ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// Neutral: made for product renders, it keeps the rope colours true instead of washing them out
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      // supports a blur radius, for soft-edged shadows

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0e10);
scene.fog = new THREE.Fog(0x0d0e10, 1.6, 4.5);

// Light comes mostly from the reflections of a photo studio. Large soft sources are what make
// fibres and wood read as real; small point lights make everything look plastic. The real
// studio is a photograph (Studio Small 09, Poly Haven, CC0) with two big octagonal softboxes;
// until it loads, and if it can't, a stand-in built from glowing panels does the same job.
function studio() {
  const room = new THREE.Scene();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 12), new THREE.MeshBasicMaterial({ color: 0x17181b, side: THREE.BackSide }));
  walls.position.y = 2.5;
  room.add(walls);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0x0c0b0a }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9;
  room.add(floor);
  const panel = (w, h, color, power, at, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...at); m.lookAt(...look);
    room.add(m);
  };
  panel(2.6, 2.0, 0xfff0dc, 9, [-2.2, 3.2, 2.4], [0, 0, 0]);      // key softbox
  panel(0.6, 3.2, 0xf4f2ee, 3.5, [3.4, 1.6, 1.0], [0, 0.3, 0]);   // fill strip
  panel(2.0, 0.8, 0xbcd0ff, 5, [1.4, 1.8, -3.4], [0, 0, 0]);      // cool kicker from behind
  panel(4.0, 4.0, 0xffffff, 0.8, [0, 5.4, 0], [0, 0, 0]);         // ceiling bounce
  return room;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio(), 0.02).texture;
scene.environmentIntensity = 0.35;
new RGBELoader().load('assets/studio_small_09_1k.hdr', hdr => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const old = scene.environment;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.5;
  // the studio itself, dim and far out of focus behind the table, as a camera would see it
  scene.background = hdr;
  scene.backgroundBlurriness = 0.35;
  scene.backgroundIntensity = 0.12;
  scene.fog = null;
  old.dispose();
});

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.01, 20);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.08;
controls.maxDistance = 2.5;
controls.screenSpacePanning = true;
controls.autoRotateSpeed = 0.6;

// the direct light of the front-left softbox in the photo (azimuth 149°, 34° up), which also
// casts the shadows, so they fall the way the reflections say the light comes from
const key = new THREE.DirectionalLight(0xfff4ea, 4.2);
key.position.set(-1.14, 0.95, 0.69);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45, near: 0.3, far: 3.5 });
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.003;
key.shadow.radius = 5;
scene.add(key);
scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2018, 0.12));

// Ambient occlusion darkens the places light can't easily reach: where rope presses on the
// table, and the gaps inside a knot. It's most of what makes the rope sit in the scene
// instead of floating over it.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.04, distanceExponent: 1, thickness: 1, scale: 1.4, samples: 16, distanceFallOff: 1 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 1;
composer.addPass(gtao);
composer.addPass(new OutputPass());

/* ---------- table and rail ---------- */
function woodTexture(w, h, base, dark, seed) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const rnd = mulberry(seed);
  for (let i = 0; i < 260; i++) {
    const y0 = rnd() * h, amp = 4 + rnd() * 14, f = 0.002 + rnd() * 0.006, ph = rnd() * 6.28;
    g.strokeStyle = dark; g.globalAlpha = 0.04 + rnd() * 0.12; g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3);
    g.stroke();
  }
  // broad colour drift between boards, then pores
  for (let i = 0; i < 18; i++) {
    g.globalAlpha = 0.02 + rnd() * 0.04;
    g.fillStyle = rnd() < 0.6 ? dark : '#ffffff';
    g.fillRect(0, rnd() * h, w, 20 + rnd() * 120);
  }
  g.fillStyle = dark;
  for (let i = 0; i < w * h / 90; i++) {
    g.globalAlpha = 0.05 + rnd() * 0.15;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // the same picture, read as height and roughness: grain lines sit lower and are less polished
  const b = new THREE.CanvasTexture(c);
  b.anisotropy = 8;
  return { map: t, bump: b };
}

// an oiled table top: mostly matte, with a faint sheen of finish on top
const tableWood = woodTexture(2048, 1024, '#4a3526', '#1e130b', 7);
const tableMat = new THREE.MeshPhysicalMaterial({
  map: tableWood.map, bumpMap: tableWood.bump, bumpScale: 1.5, roughnessMap: tableWood.bump, roughness: 0.9,
  clearcoat: 0.25, clearcoatRoughness: 0.55, specularIntensity: 0.6,
});

// Scanned wood (Poly Haven, CC0) replaces the drawn grain once it arrives. size: how many
// metres one copy of the texture covers; turn: rotate it so the grain runs the right way;
// rough: the roughness to use where there is no roughness scan; tint: a colour to multiply it by.
const loader = new THREE.TextureLoader();
function scanned(mat, files, size, across, along, turn = 0, rough = 1, tint = 0xffffff) {
  const maps = {};
  let left = Object.keys(files).length;
  for (const [slot, file] of Object.entries(files)) {
    loader.load(`assets/${file}`, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(across / size, along / size);
      t.center.set(0.5, 0.5); t.rotation = turn;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (slot === 'map') t.colorSpace = THREE.SRGBColorSpace;
      maps[slot] = t;
      if (--left) return;
      // all in: swap them together, so the surface never shows half old, half new
      Object.assign(mat, { bumpMap: null, roughnessMap: null, roughness: maps.roughnessMap ? 1 : rough, color: new THREE.Color(tint), ...maps });
      mat.needsUpdate = true;
    });
  }
}
scanned(tableMat, { map: 'wood_table_001_diff_2k.jpg', normalMap: 'wood_table_001_nor_gl_2k.jpg', roughnessMap: 'wood_table_001_rough_2k.jpg' },
  1.5, TABLE.w, TABLE.d, Math.PI / 2, 1, 0xbdb6b8);     // toned down: the scan is very red under this light
const table = new THREE.Mesh(roundedBox(TABLE.w, TABLE.t, TABLE.d, TABLE.round), tableMat);
table.position.y = -TABLE.t / 2;
table.castShadow = table.receiveShadow = true;
scene.add(table);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.75;
floor.receiveShadow = true;
scene.add(floor);
const legMat = new THREE.MeshStandardMaterial({ color: 0x2b1f16, roughness: 0.8 });
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.71, 0.045), legMat);
  leg.position.set(sx * (TABLE.w / 2 - 0.06), -0.395, sz * (TABLE.d / 2 - 0.06));
  scene.add(leg);
}

const rail = new THREE.Group();
const dowelWood = woodTexture(1024, 256, '#b08453', '#5a3b1c', 3);
const railWood = new THREE.MeshPhysicalMaterial({ map: dowelWood.map, bumpMap: dowelWood.bump, bumpScale: 1, roughnessMap: dowelWood.bump, roughness: 0.8, clearcoat: 0.2, clearcoatRoughness: 0.5 });
scanned(railWood, { map: 'oak_veneer_01_diff_1k.jpg', normalMap: 'oak_veneer_01_nor_gl_1k.jpg' }, 1.83, 2 * Math.PI * BAR.r, BAR.half * 2, 0, 0.6);
const dowel = new THREE.Mesh(new THREE.CylinderGeometry(BAR.r, BAR.r, BAR.half * 2, 48), railWood);
dowel.rotation.x = Math.PI / 2;
dowel.position.set(BAR.x, BAR.y, 0);
dowel.castShadow = dowel.receiveShadow = true;
rail.add(dowel);
for (const s of [-1, 1]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, BAR.y + 0.025, 0.03), railWood);
  post.position.set(BAR.x, (BAR.y + 0.025) / 2, s * (BAR.half - 0.015));
  post.castShadow = post.receiveShadow = true;
  rail.add(post);
}
scene.add(rail);

/* ---------- rope surface: braided or laid strands, drawn into a height map ---------- */
const textures = {};
function ropeTextures(pattern) {
  if (textures[pattern]) return textures[pattern];
  const W = 128, H = 256;          // around × along (one tile = two circumferences)
  const h = new Float32Array(W * H);
  const prof = f => Math.pow(Math.max(0, Math.sin(Math.PI * f)), 0.55);
  const frac = v => v - Math.floor(v);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    let val;
    if (pattern === 'laid' || pattern === 'soft') {
      // three strands spiralling one way, fibres inside them the other
      const f = frac(3 * u + 6 * v);
      const fib = 0.5 + 0.5 * Math.sin(2 * Math.PI * (27 * u - 30 * v));
      val = prof(f) * (pattern === 'laid' ? 0.82 + 0.18 * fib : 0.9 + 0.1 * fib);
    } else {
      // two families of carriers crossing over and under
      const n = pattern === 'fine' ? 12 : 8, m = pattern === 'paracord' ? 10 : pattern === 'fine' ? 14 : 8;
      const g1 = n * u + m * v, g2 = n * u - m * v;
      const a = prof(frac(g1)), b = prof(frac(g2));
      const top = ((Math.floor(g1) + Math.floor(g2)) & 2) === 0;
      val = top ? Math.max(a, b * 0.55) : Math.max(b, a * 0.55);
      val = val * 0.9 + 0.1 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (4 * n * u + 3 * m * v)));
    }
    h[y * W + x] = val;
  }
  const rnd = mulberry(11);
  const canvases = () => Object.assign(document.createElement('canvas'), { width: W, height: H });
  const albedo = canvases(), normal = canvases(), surf = canvases();
  const ia = albedo.getContext('2d').createImageData(W, H), inn = normal.getContext('2d').createImageData(W, H);
  const isf = surf.getContext('2d').createImageData(W, H);
  const strength = pattern === 'laid' ? 3.2 : pattern === 'soft' ? 2.2 : 2.4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, val = h[i];
    const dx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W];
    const dy = h[((y + 1) % H) * W + x] - h[((y + H - 1) % H) * W + x];
    const nx = -dx * strength, ny = -dy * strength, nz = 1, l = Math.hypot(nx, ny, nz);
    // fibres: each texel a little lighter or darker, and the crests worn paler
    const fib = 0.92 + 0.16 * rnd();
    const g = Math.round(255 * Math.min(1, (0.78 + 0.22 * val) * fib));
    ia.data.set([g, g, g, 255], i * 4);
    // red: ambient occlusion (crevices see less of the room). green: roughness (crevices rougher)
    isf.data.set([255 * (0.35 + 0.65 * Math.pow(val, 0.7)), 255 * (1 - 0.25 * val), 0, 255], i * 4);
    inn.data.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255, 255], i * 4);
  }
  albedo.getContext('2d').putImageData(ia, 0, 0);
  normal.getContext('2d').putImageData(inn, 0, 0);
  surf.getContext('2d').putImageData(isf, 0, 0);
  const map = new THREE.CanvasTexture(albedo), normalMap = new THREE.CanvasTexture(normal), surfMap = new THREE.CanvasTexture(surf);
  for (const t of [map, normalMap, surfMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  return (textures[pattern] = { map, normalMap, surfMap, albedo, height: { h, W, H } });
}

function ropeMaterial(id, color) {
  const m = MATERIALS[id], tx = ropeTextures(m.pattern);
  return new THREE.MeshPhysicalMaterial({
    color, map: tx.map, normalMap: tx.normalMap, normalScale: new THREE.Vector2(1, 1),
    aoMap: tx.surfMap, aoMapIntensity: 1, roughnessMap: tx.surfMap, roughness: m.rough, metalness: 0,
    specularIntensity: m.spec, ior: 1.5,
    sheen: m.sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15),
  });
}

// the rope mesh takes its outline from the same strands the textures draw
function dressMesh(me, id, color) {
  const m = MATERIALS[id];
  me.mesh.material = ropeMaterial(id, color);
  me.relief = { ...ropeTextures(m.pattern).height, amp: m.relief };
}

/* ---------- rope mesh: a tube swept along the particles every frame ---------- */
class RopeMesh {
  constructor(n, material) {
    this.n = n;
    this.sub = 3;           // smoothed points per segment
    this.radial = 28;
    this.relief = null;     // { h, W, H, amp }: strand heights to raise the surface by
    this.cap = 4;           // rings rounding off each end
    this.rings = (n - 1) * this.sub + 1 + this.cap * 2;
    const V = this.rings * (this.radial + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(V * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    const R = this.radial + 1;
    for (let k = 0; k < this.rings - 1; k++) for (let j = 0; j < this.radial; j++) {
      const a = k * R + j, b = a + R;
      idx.push(a, a + 1, b, b, a + 1, b + 1);     // counter-clockwise seen from outside
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.c = new Float32Array(((n - 1) * this.sub + 1) * 3);
    this.arc = new Float32Array((n - 1) * this.sub + 1);
  }

  update(pos, start, r, seg) {
    const { n, sub, c, arc } = this;
    const P = (i, k) => pos[(start + Math.max(0, Math.min(n - 1, i))) * 3 + k];
    let m = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        for (let k = 0; k < 3; k++) {
          // extrapolate the ghost points at the ends so the tube doesn't bend at the tips
          const p0 = i === 0 ? 2 * P(0, k) - P(1, k) : P(i - 1, k);
          const p1 = P(i, k), p2 = P(i + 1, k);
          const p3 = i + 2 > n - 1 ? 2 * P(n - 1, k) - P(n - 2, k) : P(i + 2, k);
          c[m * 3 + k] = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        }
        arc[m] = (i + t) * seg;
        m++;
      }
    }
    for (let k = 0; k < 3; k++) c[m * 3 + k] = P(n - 1, k);
    arc[m] = (n - 1) * seg;
    m++;

    const posA = this.mesh.geometry.attributes.position.array;
    const norA = this.mesh.geometry.attributes.normal.array;
    const uvA = this.mesh.geometry.attributes.uv.array;
    const R = this.radial + 1, tile = 2 * 2 * Math.PI * r;
    const rel = this.relief;
    // height of the strands under texture coordinate (u, v), centred on zero
    const bump = (u, v) => {
      if (!rel) return 0;
      const x = Math.floor(u * rel.W) % rel.W, y = ((Math.floor(v * rel.H) % rel.H) + rel.H) % rel.H;
      return (rel.h[y * rel.W + x] - 0.62) * rel.amp;
    };
    // parallel-transport frame, so the tube doesn't twist as the rope moves
    let tx = c[3] - c[0], ty = c[4] - c[1], tz = c[5] - c[2];
    let l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    let nx = -tz, ny = 0, nz = tx;
    if (Math.hypot(nx, nz) < 0.1) { nx = 0; ny = 1; nz = 0; }
    ({ x: nx, y: ny, z: nz } = norm(nx - tx * (tx * nx + ty * ny + tz * nz), ny - ty * (tx * nx + ty * ny + tz * nz), nz - tz * (tx * nx + ty * ny + tz * nz)));
    let ring = 0;
    const emit = (cx, cy, cz, rad, axialN, v) => {
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const sinA = Math.sqrt(Math.max(0, 1 - axialN * axialN));
      for (let j = 0; j <= this.radial; j++) {
        const a = (j / this.radial) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
        const o = (ring * R + j) * 3;
        const rr = rad * (1 + (axialN === 0 ? bump(j / this.radial, v / tile) : 0));
        posA[o] = cx + ox * rr; posA[o + 1] = cy + oy * rr; posA[o + 2] = cz + oz * rr;
        norA[o] = ox * sinA + tx * axialN; norA[o + 1] = oy * sinA + ty * axialN; norA[o + 2] = oz * sinA + tz * axialN;
        uvA[(ring * R + j) * 2] = j / this.radial;
        uvA[(ring * R + j) * 2 + 1] = v / tile;
      }
      ring++;
    };
    for (let q = this.cap; q >= 1; q--) {
      const a = (q / this.cap) * Math.PI / 2;
      const back = Math.sin(a) * r * 0.9;
      emit(c[0] - tx * back, c[1] - ty * back, c[2] - tz * back, r * Math.cos(a) + r * 0.02, -Math.sin(a), arc[0] - back);
    }
    for (let k = 0; k < m; k++) {
      const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
      let ux = c[b * 3] - c[a * 3], uy = c[b * 3 + 1] - c[a * 3 + 1], uz = c[b * 3 + 2] - c[a * 3 + 2];
      l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      const d = ux * nx + uy * ny + uz * nz;
      ({ x: nx, y: ny, z: nz } = norm(nx - ux * d, ny - uy * d, nz - uz * d));
      tx = ux; ty = uy; tz = uz;
      emit(c[k * 3], c[k * 3 + 1], c[k * 3 + 2], r, 0, arc[k]);
    }
    const e = (m - 1) * 3;
    for (let q = 1; q <= this.cap; q++) {
      const a = (q / this.cap) * Math.PI / 2;
      const fwd = Math.sin(a) * r * 0.9;
      emit(c[e] + tx * fwd, c[e + 1] + ty * fwd, c[e + 2] + tz * fwd, r * Math.cos(a) + r * 0.02, Math.sin(a), arc[m - 1] + fwd);
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = g.attributes.uv.needsUpdate = true;
  }
}

function norm(x, y, z) { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; }

/* ---------- the knot being shown ---------- */
const ropeGroup = new THREE.Group();
scene.add(ropeGroup);
const handMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, depthWrite: false });
const handGeo = new THREE.SphereGeometry(1, 20, 14);
const hands = [];
let player = null, meshes = [], pathLines = [];
let seekTarget = null;

function ropeColors() { return [state.color, state.color2]; }

function build(keepTime = false) {
  const t = keepTime && player ? player.t : 0;
  const r = state.thickness / 2000;
  const m = MATERIALS[state.material];
  player = new Player(state.knot, { radius: r, material: { bend: m.bend, friction: m.friction, damping: 0.996 } });
  if (player.warning) console.warn(player.warning);
  for (const me of meshes) { me.mesh.geometry.dispose(); me.mesh.material.dispose(); ropeGroup.remove(me.mesh); }
  for (const l of pathLines) { l.geometry.dispose(); ropeGroup.remove(l); }
  meshes = player.ropes.map((rp, k) => {
    const me = new RopeMesh(rp.n, null);
    dressMesh(me, state.material, ropeColors()[k]);
    ropeGroup.add(me.mesh);
    return me;
  });
  pathLines = player.paths.map((P, k) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.pts), 3));
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: ropeColors()[k], dashSize: 0.006, gapSize: 0.005, transparent: true, opacity: 0.75 }));
    line.computeLineDistances();
    line.visible = state.showPath;
    ropeGroup.add(line);
    return line;
  });
  rail.visible = !!state.knot.bar;
  followReady = false;
  if (t > 0) seekTo(t);
  renderAll();
}

function seekTo(t) {
  if (!player || t < player.t - 1e-6) build();
  seekTarget = Math.min(t, player.duration);
}

function runSeek() {
  if (seekTarget === null) return false;
  const t0 = performance.now();
  while (player.t < seekTarget - 1e-6 && performance.now() - t0 < 30) player.advance(Math.min(0.05, seekTarget - player.t));
  if (player.t >= seekTarget - 1e-6) { seekTarget = null; return false; }
  return true;
}

function drawRope() {
  const { sim } = player;
  meshes.forEach((me, k) => me.update(sim.pos, sim.ropes[k].start, sim.r, sim.ropes[k].seg));
  let h = 0;
  if (state.showHands) {
    for (const hd of player.hands) {
      const i = hd.tip ? player.tipIndex(hd.rope) : hd.i;
      if (!hands[h]) { hands[h] = new THREE.Mesh(handGeo, handMat); scene.add(hands[h]); }
      hands[h].position.set(sim.pos[i * 3], sim.pos[i * 3 + 1], sim.pos[i * 3 + 2]);
      hands[h].scale.setScalar(sim.r * 2.4);
      hands[h].visible = true;
      h++;
    }
  }
  for (; h < hands.length; h++) hands[h].visible = false;
}

/* ---------- camera ---------- */
// frame the knot itself (where its crossings are), not the long standing part
function knotFrame() {
  const box = new THREE.Box3();
  for (const x of player.crossings) for (const e of [x.mover, x.still]) {
    const P = player.paths[e.rope], k = Math.round(e.k);
    box.expandByPoint(new THREE.Vector3(P.pts[k * 3], P.pts[k * 3 + 1], P.pts[k * 3 + 2]));
  }
  if (state.knot.bar) box.expandByPoint(new THREE.Vector3(BAR.x, BAR.y, 0));
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  if (player.gripsOn && !state.knot.bar) {
    // being pulled tight: frame the knot where it is now
    const [x, , z] = player.knotBody();
    c.x = x; c.z = z;
    followAt.set(x, 0, z);
  }
  c.y = state.knot.bar ? 0.035 : 0.01;
  return { c, span: Math.max(size.x, size.z, 0.12) + 0.12 };
}

// the camera drifts along with the knot as it is pulled tight
const followAt = new THREE.Vector3();
let followReady = false;
function follow() {
  const [x, , z] = player.gripsOn ? player.knotBody() : player.knotCenter();
  const now = new THREE.Vector3(x, 0, z);
  if (!followReady || !player.gripsOn) { followAt.copy(now); followReady = true; return; }
  const d = now.sub(followAt).multiplyScalar(0.08);
  followAt.add(d);
  camera.position.add(d);
  controls.target.add(d);
  if (camAnim) { camAnim.p1.add(d); camAnim.c1.add(d); }
}

const VIEWS = {
  front: (c, s) => c.clone().add(new THREE.Vector3(0, 0.62, 0.78).multiplyScalar(s * 2.1)),
  top: (c, s) => c.clone().add(new THREE.Vector3(0, 2.1 * s, 0.02)),
  side: (c, s) => c.clone().add(new THREE.Vector3(-0.85, 0.45, 0.4).multiplyScalar(s * 2.0)),
  close: (c, s) => c.clone().add(new THREE.Vector3(0.18, 0.5, 0.42).multiplyScalar(s * 1.1)),
};
let camAnim = null;
function setView(name, instant = false) {
  const { c, span } = knotFrame();
  const fit = Math.max(1, 1.25 / camera.aspect);    // portrait screens need to stand further back
  const to = VIEWS[name](c, span * fit);
  if (instant) { camera.position.copy(to); controls.target.copy(c); controls.update(); return; }
  camAnim = { t: 0, p0: camera.position.clone(), p1: to, c0: controls.target.clone(), c1: c };
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
const ui = {
  list: $('knot-list'), about: $('about'), stepCount: $('step-count'), stepTime: $('step-time'),
  stepTitle: $('step-title'), stepText: $('step-text'), steps: $('steps'), play: $('play'),
  playIcon: $('play-icon'), busy: $('busy'), speeds: $('speeds'),
};

function buildLibrary() {
  const groups = [...new Set(KNOTS.map(k => k.group))];
  ui.list.innerHTML = '';
  for (const gname of groups) {
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<div class="label m-legend">${gname}</div>`;
    for (const k of KNOTS.filter(k => k.group === gname)) {
      const b = document.createElement('button');
      b.className = 'knot m-menu__item m-menu__item--plain';
      b.dataset.id = k.id;
      b.innerHTML = `<span class="knot__name">${k.name}</span><span class="knot__sum">${k.summary}</span>`;
      b.addEventListener('click', () => selectKnot(k));
      g.appendChild(b);
    }
    ui.list.appendChild(g);
  }
}

function selectKnot(k) {
  state.knot = k;
  store.set('knot', k.id);
  state.playing = true;
  build();
  setView('front');
  closeDrawers();
}

function renderAbout() {
  const k = state.knot;
  for (const b of ui.list.querySelectorAll('.knot')) b.setAttribute('aria-pressed', b.dataset.id === k.id);
  ui.about.innerHTML = `
    <div class="about__head"><span class="about__name">${k.name}</span><span class="about__abok">ABOK ${k.abok}</span></div>
    <p><strong>Use it for</strong> ${lower(k.uses)}</p>
    <p class="caution"><strong>Watch out</strong> ${lower(k.caution)}</p>`;
  $('second-wrap').classList.toggle('is-dim', k.ropes.length < 2);
}
const lower = s => s[0].toLowerCase() + s.slice(1);

function buildOptions() {
  const mats = $('materials');
  for (const [id, m] of Object.entries(MATERIALS)) {
    const b = document.createElement('button');
    b.className = 'material m-menu__item m-menu__item--plain';
    b.dataset.id = id;
    const sw = document.createElement('canvas');
    sw.width = 68; sw.height = 36;
    b.append(sw);
    b.insertAdjacentHTML('beforeend', `<span><b>${m.name}</b><small>${m.note}</small></span>`);
    b.addEventListener('click', () => {
      state.material = id;
      store.set('material', id);
      const mm = MATERIALS[id];
      if (player) { player.sim.mat.bend = mm.bend; player.sim.mat.friction = mm.friction; }
      restyle();
      renderOptions();
    });
    mats.appendChild(b);
  }
  const swatchRow = (el, keyName) => {
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch m-dot';
      b.style.background = c;
      b.dataset.color = c;
      b.setAttribute('aria-label', `Color ${c}`);
      b.addEventListener('click', () => setColor(keyName, c));
      el.appendChild(b);
    }
    const custom = document.createElement('label');
    custom.className = 'swatch swatch--custom m-dot';
    custom.title = 'Pick any color';
    custom.innerHTML = `<input type="color" aria-label="Custom color">`;
    custom.querySelector('input').addEventListener('input', e => setColor(keyName, e.target.value));
    el.appendChild(custom);
  };
  swatchRow($('colors'), 'color');
  swatchRow($('colors2'), 'color2');

  const thick = $('thick');
  thick.value = state.thickness;
  thick.addEventListener('input', () => { $('thick-out').textContent = `${thick.value} mm`; });
  thick.addEventListener('change', () => {
    state.thickness = +thick.value;
    store.set('thickness', thick.value);
    build(true);           // new thickness: re-tie up to the same moment
  });

  for (const v of document.querySelectorAll('[data-view]')) v.addEventListener('click', () => setView(v.dataset.view));
  $('orbit').addEventListener('change', e => { state.orbit = e.target.checked; controls.autoRotate = state.orbit; });
  $('show-path').checked = state.showPath;
  $('show-path').addEventListener('change', e => {
    state.showPath = e.target.checked;
    store.set('path', state.showPath ? '1' : '0');
    for (const l of pathLines) l.visible = state.showPath;
  });
  $('show-ao').checked = state.ao;
  $('show-ao').addEventListener('change', e => { state.ao = e.target.checked; store.set('ao', state.ao ? '1' : '0'); });
  $('show-hands').checked = state.showHands;
  $('show-hands').addEventListener('change', e => { state.showHands = e.target.checked; store.set('hands', state.showHands ? '1' : '0'); });

  for (const s of SPEEDS) {
    const b = document.createElement('button');
    b.textContent = `${s}×`;
    b.dataset.speed = s;
    b.addEventListener('click', () => { state.speed = s; store.set('speed', s); renderOptions(); });
    ui.speeds.appendChild(b);
  }
}

function setColor(keyName, c) {
  state[keyName] = c;
  store.set(keyName, c);
  restyle();
  renderOptions();
}

function restyle() {
  meshes.forEach((me, k) => {
    me.mesh.material.dispose();
    dressMesh(me, state.material, ropeColors()[k]);
  });
  pathLines.forEach((l, k) => l.material.color.set(ropeColors()[k]));
}

function renderOptions() {
  for (const b of document.querySelectorAll('.material')) {
    b.setAttribute('aria-pressed', b.dataset.id === state.material);
    const m = MATERIALS[b.dataset.id], tx = ropeTextures(m.pattern), cv = b.querySelector('canvas'), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = state.color; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(tx.albedo, 0, 0, tx.albedo.width, tx.albedo.height / 2, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-over';
  }
  for (const [id, key] of [['colors', 'color'], ['colors2', 'color2']]) {
    for (const b of $(id).querySelectorAll('.swatch')) b.setAttribute('aria-pressed', b.dataset.color === state[key]);
  }
  $('thick-out').textContent = `${state.thickness} mm`;
  for (const b of ui.speeds.children) b.setAttribute('aria-pressed', +b.dataset.speed === state.speed);
}

function buildSteps() {
  ui.steps.innerHTML = '';
  state.knot.steps.forEach((st, i) => {
    const b = document.createElement('button');
    b.title = `${i + 1}. ${st.title}`;
    b.setAttribute('aria-label', `Go to step ${i + 1}: ${st.title}`);
    b.addEventListener('click', () => goStep(i));
    ui.steps.appendChild(b);
  });
}

let shownStep = -1;
function renderStep() {
  const p = player, steps = state.knot.steps;
  const i = seekTarget !== null ? p.stepAt(seekTarget) : p.stepAt();
  if (i !== shownStep) {
    shownStep = i;
    ui.stepCount.textContent = `Step ${i + 1} of ${steps.length}`;
    ui.stepTitle.textContent = steps[i].title;
    ui.stepText.textContent = steps[i].text;
  }
  const t = p.t;
  [...ui.steps.children].forEach((b, k) => {
    const a = p.stepStarts[k], z = p.stepStarts[k + 1] ?? p.duration;
    b.style.setProperty('--fill', `${Math.round(Math.min(1, Math.max(0, (t - a) / (z - a))) * 100)}%`);
  });
  ui.stepTime.textContent = p.done ? 'Tied' : `${fmt(t)} / ${fmt(p.duration)}`;
  const playing = state.playing && !p.done;
  ui.playIcon.innerHTML = playing ? '<path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/>'
    : p.done ? '<path d="M8 3a5 5 0 1 1-4.6 3h1.7A3.5 3.5 0 1 0 8 4.5V7L4.5 3.75 8 .5z"/>' : '<path d="M4 2.5v11L13.5 8z"/>';
  ui.play.setAttribute('aria-label', playing ? 'Pause' : p.done ? 'Replay' : 'Play');
  ui.busy.hidden = seekTarget === null;
  $('prev').disabled = i === 0 && t < 0.5;
  $('next').disabled = i >= steps.length - 1;
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function renderAll() {
  buildSteps();
  shownStep = -1;
  renderAbout();
  renderOptions();
  renderStep();
}

function goStep(i) {
  const n = state.knot.steps.length;
  i = Math.max(0, Math.min(n - 1, i));
  seekTo(player.stepStarts[i]);
}

function togglePlay() {
  if (player.done) { build(); state.playing = true; return; }
  state.playing = !state.playing;
}

ui.play.addEventListener('click', togglePlay);
$('restart').addEventListener('click', () => { build(); state.playing = true; });
$('prev').addEventListener('click', () => {
  const i = player.stepAt();
  // mid-step goes back to the start of this step; at the start, to the one before
  goStep(player.t - player.stepStarts[i] > 0.6 ? i : i - 1);
});
$('next').addEventListener('click', () => goStep(player.stepAt() + 1));
addEventListener('keydown', e => {
  if (e.target.closest?.('input, select')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') $('next').click();
  else if (e.key === 'ArrowLeft') $('prev').click();
  else if (e.key === 'r' || e.key === 'R') $('restart').click();
});

// small screens: the two panels become drawers
function closeDrawers() {
  for (const t of document.querySelectorAll('.drawer-toggle')) {
    t.setAttribute('aria-expanded', 'false');
    $(t.dataset.drawer).classList.remove('is-open');
  }
}
for (const t of document.querySelectorAll('.drawer-toggle')) {
  t.addEventListener('click', () => {
    const open = t.getAttribute('aria-expanded') !== 'true';
    closeDrawers();
    t.setAttribute('aria-expanded', open);
    $(t.dataset.drawer).classList.toggle('is-open', open);
  });
}
// keep drags on the panels from reaching the camera
for (const el of document.querySelectorAll('.panel')) ['pointerdown', 'wheel'].forEach(type => el.addEventListener(type, e => e.stopPropagation()));

/* ---------- loop ---------- */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

buildLibrary();
buildOptions();
build();
resize();
setView(params.get('view') || 'front', true);
if (params.has('seek')) {
  const s = params.get('seek');
  seekTo(s === 'end' ? player.duration : player.stepStarts[+s] ?? +s);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!runSeek() && state.playing && !player.done) player.advance(dt * state.speed);
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / 0.7);
    const e = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
    controls.target.lerpVectors(camAnim.c0, camAnim.c1, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  follow();
  controls.update();
  drawRope();
  renderStep();
  if (state.ao) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- helpers ---------- */
function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = w / 2 - r, z = d / 2 - r;
  shape.moveTo(-x, -d / 2);
  shape.lineTo(x, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -z);
  shape.lineTo(w / 2, z); shape.quadraticCurveTo(w / 2, d / 2, x, d / 2);
  shape.lineTo(-x, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, z);
  shape.lineTo(-w / 2, -z); shape.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: 0, bevelSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.translate(0, h / 2 - r, 0);
  // planar UVs from above so the grain runs along the table
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getZ(i) / d + 0.5);
  return g;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
