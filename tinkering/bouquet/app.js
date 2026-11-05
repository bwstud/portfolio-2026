import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sim, findPlacement } from './physics.js';
import { CYLINDER, vaseDescription, buildVase } from './vase.js';
import {
  VARIETIES, STAGES, stageName, makeSpecimen, petalGeometry, sepalGeometry, receptacleGeometry,
  stamenGeometry, headCollider, leafGeometry, prickleGeometry, rng,
} from './rose.js';
import { petalTextures, leafletTexture, sepalTexture, stemTexture } from './textures.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('ui') === '0') document.body.classList.add('no-ui');
const store = {
  get(k) { try { return localStorage.getItem('bouquet:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('bouquet:' + k, v); } catch {} },
};
const progress = (t, f) => { $('loading-text').textContent = t; $('loading-bar').style.width = `${Math.round(f * 100)}%`; };

/* ---------- renderer, scene, camera ---------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;      // keeps a red rose red
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 20);
camera.position.set(0.15, 0.47, 1.5);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.18;
controls.maxDistance = 2.6;
controls.maxPolarAngle = Math.PI * 0.53;
controls.target.set(0, 0.275, 0);

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.42, right: 0.42, top: 0.5, bottom: -0.3, near: 0.1, far: 4 });
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.0015;
key.shadow.radius = 3;
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
const rim = new THREE.DirectionalLight(0xffffff, 0.6);
scene.add(key, key.target, fill, fill.target, rim, rim.target);
key.target.position.set(0, 0.25, 0);
fill.target.position.copy(key.target.position);
rim.target.position.copy(key.target.position);

/* ---------- post: AO from the scene's depth, then tone mapping ---------- */
const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType, samples: params.get('msaa') === '0' ? 0 : 4, depthTexture: new THREE.DepthTexture(1, 1),
});
class ScenePass extends Pass {
  constructor() {
    super();
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms) }));
  }
  setSize(w, h) { sceneRT.setSize(w, h); }
  render(r, writeBuffer) {
    r.setRenderTarget(sceneRT);
    r.clear();
    r.render(scene, camera);
    this.copy.material.uniforms.tDiffuse.value = sceneRT.texture;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(r);
  }
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.addPass(new ScenePass());
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.setGBuffer(sceneRT.depthTexture);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 0.85;
gtao.updateGtaoMaterial({ radius: 0.03, distanceExponent: 1.5, thickness: 0.6, scale: 1 });
composer.addPass(gtao);
composer.addPass(new OutputPass());

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  gtao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  camera.aspect = w / h;
  const bench = document.body.classList.contains('no-ui') ? 0 : Math.min(140, h * 0.16);
  camera.setViewOffset(w, h + bench, 0, bench, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

/* ---------- materials ---------- */
/* A plant-tissue material: two-sided, the texture's left half on the face and right half on the
   back, and light from behind passing through (thin tissue glows when back-lit). */
const tissueUniforms = [];
function tissue(opts, { transl = 0.5, sided = true, back = 1 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, ...opts });
  const u = { uTransl: { value: transl }, uBack: { value: back } };
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTransl;\nuniform float uBack;')
      .replace('#include <map_fragment>', sided ? `
        #ifdef USE_MAP
          vec2 sideUv = vec2(vMapUv.x * 0.5 + (gl_FrontFacing ? 0.0 : 0.5), vMapUv.y);
          vec4 sampledDiffuseColor = texture2D(map, sideUv);
          diffuseColor *= sampledDiffuseColor;
        #endif
        diffuseColor.rgb *= gl_FrontFacing ? 1.0 : uBack;` : '#include <map_fragment>')
      .replace('#include <lights_physical_pars_fragment>', TRANSLUCENT_LIGHTS);
  };
  m.customProgramCacheKey = () => `tissue-${sided}`;
  return m;
}
const TRANSLUCENT_LIGHTS = (() => {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const at = 'vec3 irradiance = dotNL * directLight.color;';
  if (!src.includes(at)) { console.warn('bouquet: translucency patch did not apply'); return src; }
  return src.replace(at, `${at}
    // light arriving from behind the leaf or petal comes through it, coloured by the tissue
    reflectedLight.directDiffuse += uTransl * saturate(-dot(geometryNormal, directLight.direction)) * directLight.color * BRDF_Lambert(material.diffuseColor);`);
})();

const mats = {};
const varietyMats = {};
function makeMaterials() {
  const leaf = leafletTexture({ face: '#2c4a1f', back: '#5b7a45', rib: '#7c9a5e', edge: '#4a3a22' });
  mats.leaf = tissue({ map: leaf.map, bumpMap: leaf.bump, bumpScale: 1.2, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.35, alphaTest: 0.5, color: 0xffffff }, { transl: 0.35, back: 1 });
  mats.leaf.shadowSide = THREE.DoubleSide;
  mats.sepal = tissue({ map: sepalTexture(), roughness: 0.7, color: 0xffffff }, { transl: 0.3 });
  mats.receptacle = new THREE.MeshPhysicalMaterial({ color: 0x4f6b2d, roughness: 0.42, clearcoat: 0.2 });
  const stemMap = stemTexture();
  mats.stem = new THREE.MeshPhysicalMaterial({ map: stemMap, vertexColors: true, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  mats.prickle = new THREE.MeshPhysicalMaterial({ color: 0x8a4a2a, roughness: 0.45, clearcoat: 0.4 });
  mats.stamen = new THREE.MeshStandardMaterial({ color: 0xd8a640, vertexColors: true, roughness: 0.6 });
  mats.rachis = new THREE.MeshPhysicalMaterial({ color: 0x47622c, roughness: 0.5 });
}
function petalMaterial(id) {
  if (varietyMats[id]) return varietyMats[id];
  const V = VARIETIES[id];
  const { map, bump } = petalTextures(V.petals);
  const m = tissue({
    map, bumpMap: bump, bumpScale: 0.6, vertexColors: true, roughness: 0.62,
    sheen: 0.7, sheenColor: new THREE.Color(V.sheen), sheenRoughness: 0.45, color: 0xffffff,
  }, { transl: V.transl, back: V.backTint });
  m.shadowSide = THREE.DoubleSide;
  varietyMats[id] = m;
  return m;
}

/* ---------- the room: table, wall, light ---------- */
const tex = new THREE.TextureLoader();
const LIGHTS = {
  studio: { env: 0.75, key: [2.2, 0xfff6ec, [-0.55, 1.05, 0.75]], fill: [0.35, 0xdde6ff, [0.9, 0.5, 0.6]], rim: [0.7, 0xffffff, [0.2, 0.9, -1]], wall: 0xd8d1c6, exposure: 1.0 },
  window: { env: 0.4, key: [3.6, 0xffdcb0, [1.2, 0.55, 0.25]], fill: [0.15, 0xbcd0ff, [-0.8, 0.4, 0.8]], rim: [0.25, 0xffd2a8, [-0.3, 0.6, -1]], wall: 0xa49c93, exposure: 0.95 },
};
let wallMat;
async function buildRoom() {
  const load = u => new Promise((res, rej) => tex.load(u, res, undefined, rej));
  const [diff, nor, rough, pd, pn] = await Promise.all([
    load('assets/wood_table_001_diff_2k.jpg'), load('assets/wood_table_001_nor_gl_2k.jpg'), load('assets/wood_table_001_rough_2k.jpg'),
    load('assets/clay_plaster_diff_1k.jpg'), load('assets/clay_plaster_nor_gl_1k.jpg'),
  ]);
  diff.colorSpace = THREE.SRGBColorSpace;
  for (const t of [diff, nor, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.2, 0.8); t.anisotropy = 8; }
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 1.1), new THREE.MeshPhysicalMaterial({ map: diff, normalMap: nor, roughnessMap: rough, roughness: 1, clearcoat: 0.15, clearcoatRoughness: 0.5 }));
  table.position.set(0, -0.02, 0.1);
  table.receiveShadow = true;
  scene.add(table);
  pd.colorSpace = THREE.SRGBColorSpace;
  for (const t of [pd, pn]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.5); }
  wallMat = new THREE.MeshStandardMaterial({ normalMap: pn, normalScale: new THREE.Vector2(0.4, 0.4), color: LIGHTS.studio.wall, roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.2), wallMat);
  wall.position.set(0, 1.05, -0.45);
  wall.receiveShadow = true;
  scene.add(wall);
  const env = await new Promise((res, rej) => new RGBELoader().load('assets/studio_small_09_1k.hdr', res, undefined, rej));
  env.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  scene.background = new THREE.Color(0x1a1816);
}
function setLight(id) {
  const L = LIGHTS[id];
  scene.environmentIntensity = L.env;
  for (const [light, [i, c, p]] of [[key, L.key], [fill, L.fill], [rim, L.rim]]) {
    light.intensity = i;
    light.color.set(c);
    light.position.set(...p).multiplyScalar(1.6).add(key.target.position);
  }
  if (wallMat) wallMat.color.set(L.wall);
  renderer.toneMappingExposure = L.exposure;
  document.body.classList.toggle('is-window', id === 'window');
  for (const b of $('lights').children) b.setAttribute('aria-pressed', b.dataset.light === id);
  state.light = id;
  store.set('light', id);
}

/* ---------- vase and physics ---------- */
const state = { mech: 'grid', water: 0.66, light: 'studio', variety: 'red', newBloom: 0.55 };
let desc, vase;
const sim = new Sim(vaseDescription(CYLINDER));
const vaseGroup = new THREE.Group();
scene.add(vaseGroup);
function rebuildVase() {
  desc = vaseDescription(CYLINDER, { water: state.water, tape: state.mech === 'grid' });
  sim.vase = desc;
  sim.wake();
  vaseGroup.clear();
  vase = buildVase(CYLINDER, desc, null);
  vaseGroup.add(vase.group);
}

/* ---------- a rose on its stem ---------- */
const SEG = 0.035;
const STEM_R = 0.0032;
let nextId = 1;
const stems = [];

function physSpec(spec, hc) {
  return { radius: STEM_R, lin: 0.0305, EI: 0.25, neckEI: 0.06, headMass: hc.mass, headR: hc.r, mu: 0.4 };
}

class Rose {
  constructor({ variety, seed, bloom, length, twist = 0, id = nextId++ }) {
    Object.assign(this, { variety, seed, bloom, length, twist, id });
    this.spec = makeSpecimen(variety, seed, length);
    this.group = new THREE.Group();
    this.head = new THREE.Group();
    this.group.add(this.head);
    this.leaves = [];
    this.prickles = [];
    this.highlight = 0;
    this.buildStatic();
    this.buildHead();
    scene.add(this.group);
  }
  buildStatic() {
    const r = rng(this.seed + 101);
    for (const l of this.spec.leaves) {
      const m = new THREE.Mesh(leafGeometry(l, r), mats.leaf);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.leaves.push({ mesh: m, leaf: l });
    }
    for (const p of this.spec.prickles) {
      const m = new THREE.Mesh(prickleGeometry(p.size), mats.prickle);
      m.castShadow = true;
      this.group.add(m);
      this.prickles.push({ mesh: m, p });
    }
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), mats.stem);
    this.tube.castShadow = this.tube.receiveShadow = true;
    this.group.add(this.tube);
  }
  buildHead() {
    for (const c of [...this.head.children]) { c.geometry.dispose(); this.head.remove(c); }
    const pet = new THREE.Mesh(petalGeometry(this.spec, this.bloom), petalMaterial(this.variety));
    const sep = new THREE.Mesh(sepalGeometry(this.spec, this.bloom), mats.sepal);
    const rec = new THREE.Mesh(receptacleGeometry(), mats.receptacle);
    for (const m of [pet, sep, rec]) { m.castShadow = m.receiveShadow = true; this.head.add(m); }
    const st = stamenGeometry(this.spec, this.bloom);
    if (st) { const m = new THREE.Mesh(st, mats.stamen); m.castShadow = true; this.head.add(m); }
    // a slight crook at the neck, the way a real head sits a little off its stem
    this.head.children.forEach(c => c.rotation.set(this.spec.lean, 0, this.spec.lean * 0.6));
  }
  get physics() { return sim.stem(this.id); }

  /* follow the physics: a smooth tube through the particles, the head on the end, and leaves
     and prickles carried on rotation-minimising frames so they turn with the stem */
  update() {
    const st = this.physics;
    if (!st) return;
    const pts = sim.points(st).map(p => new THREE.Vector3(...p));
    const head = pts.pop();
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const total = curve.getLength();
    const S = Math.max(24, pts.length * 7);
    const P = curve.getSpacedPoints(S);
    const T = P.map((_, i) => (i === S ? P[i].clone().sub(P[i - 1]) : P[i + 1].clone().sub(P[i])).normalize());
    // parallel transport, starting from a fixed reference so the frame is stable
    const N = [];
    const ref = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    N[0] = ref.clone().sub(T[0].clone().multiplyScalar(ref.dot(T[0]))).normalize();
    for (let i = 1; i <= S; i++) {
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const s = axis.length();
      N[i] = N[i - 1].clone();
      if (s > 1e-8) N[i].applyAxisAngle(axis.divideScalar(s), Math.asin(Math.min(1, s)));
      N[i].sub(T[i].clone().multiplyScalar(N[i].dot(T[i]))).normalize();
    }
    const tw = this.twist * Math.PI / 180;
    for (let i = 0; i <= S; i++) N[i].applyAxisAngle(T[i], tw);
    this.frames = { P, T, N, S, total };
    this.buildTube();
    const at = s => {                         // frame at arc length s from the cut end
      const f = Math.max(0, Math.min(S, s / total * S)), i = Math.min(S - 1, Math.floor(f)), k = f - i;
      const p = P[i].clone().lerp(P[i + 1], k), t = T[i].clone().lerp(T[i + 1], k).normalize();
      const n = N[i].clone().lerp(N[i + 1], k);
      n.sub(t.clone().multiplyScalar(n.dot(t))).normalize();
      return { p, t, n, b: new THREE.Vector3().crossVectors(t, n) };
    };
    // head: on the stem top, pointing at the head particle
    const top = P[S];
    const axis = head.clone().sub(top).normalize();
    const nTop = N[S].clone().sub(axis.clone().multiplyScalar(N[S].dot(axis))).normalize();
    const bTop = new THREE.Vector3().crossVectors(axis, nTop);
    this.head.matrix.makeBasis(bTop, axis, nTop).setPosition(top);
    this.head.matrixAutoUpdate = false;
    // leaves, measured from the top down
    for (const { mesh, leaf } of this.leaves) {
      const f = at(total - leaf.at);
      const out = f.n.clone().multiplyScalar(Math.cos(leaf.az)).add(f.b.clone().multiplyScalar(Math.sin(leaf.az)));
      const D = f.t.clone().multiplyScalar(Math.cos(leaf.tilt)).add(out.clone().multiplyScalar(Math.sin(leaf.tilt))).normalize();
      const side = new THREE.Vector3().crossVectors(f.t, out).normalize();
      const Z = new THREE.Vector3().crossVectors(D, side).normalize();
      if (Z.dot(new THREE.Vector3(0, 1, 0)) < 0 && Z.dot(out) < 0) Z.negate();
      const X = new THREE.Vector3().crossVectors(D, Z).normalize();
      mesh.matrix.makeBasis(X, D, Z).setPosition(f.p.clone().add(out.multiplyScalar(STEM_R * 0.7)));
      mesh.matrixAutoUpdate = false;
      // a florist strips every leaf that would sit inside the vase
      const inVase = f.p.y < desc.rimY + 0.012 && Math.hypot(f.p.x, f.p.z) < desc.rOut + 0.01;
      mesh.visible = leaf.at < this.length - 0.02 && !inVase;
    }
    for (const { mesh, p } of this.prickles) {
      const f = at(total - p.at);
      const out = f.n.clone().multiplyScalar(Math.cos(p.az)).add(f.b.clone().multiplyScalar(Math.sin(p.az)));
      const Z = new THREE.Vector3().crossVectors(out, f.t);
      mesh.matrix.makeBasis(out, f.t, Z).setPosition(f.p.clone().add(out.clone().multiplyScalar(STEM_R * 0.8)));
      mesh.matrixAutoUpdate = false;
      mesh.visible = p.at < this.length - 0.01 && !(f.p.y < desc.waterY && Math.hypot(f.p.x, f.p.z) < desc.rIn);
    }
  }

  buildTube() {
    const { P, T, N, S } = this.frames;
    const R = 10;
    const V = VARIETIES[this.variety];
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const green = new THREE.Color(0x56752f), red = new THREE.Color(V.name === 'Red' ? 0x6f4a2a : 0x617a34), cut = new THREE.Color(0xd9e0b0);
    for (let i = 0; i <= S; i++) {
      const f = i / S;
      const rad = STEM_R * (1.04 - 0.14 * f) * (f > 0.9 ? 1 - (f - 0.9) * 1.6 : 1);
      const b = new THREE.Vector3().crossVectors(T[i], N[i]);
      const c = green.clone().lerp(red, Math.pow(f, 6) * 0.8);
      for (let k = 0; k <= R; k++) {
        const a = (k / R) * Math.PI * 2;
        const n = N[i].clone().multiplyScalar(Math.cos(a)).add(b.clone().multiplyScalar(Math.sin(a)));
        let p = P[i].clone().addScaledVector(n, rad);
        // the cut end is slanted, the way a florist cuts a stem
        if (i === 0) p.addScaledVector(T[0], Math.cos(a) * rad * 0.9);
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
        uv.push(k / R, f * this.length * 6);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < S; i++) for (let k = 0; k < R; k++) {
      const a = i * (R + 1) + k, b = a + 1, c = a + R + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    // cut face
    const c0 = pos.length / 3;
    const cen = P[0].clone();
    pos.push(cen.x, cen.y, cen.z); nor.push(-T[0].x, -T[0].y, -T[0].z); uv.push(0.5, 0); col.push(cut.r, cut.g, cut.b);
    for (let k = 0; k <= R; k++) {
      const o = k * 3;
      pos.push(pos[o], pos[o + 1], pos[o + 2]); nor.push(-T[0].x, -T[0].y, -T[0].z); uv.push(0, 0); col.push(cut.r, cut.g, cut.b);
    }
    for (let k = 0; k < R; k++) idx.push(c0, c0 + 2 + k, c0 + 1 + k);
    const g = this.tube.geometry;
    const same = g.attributes.position && g.attributes.position.count === pos.length / 3;
    if (same) {
      g.attributes.position.array.set(pos); g.attributes.position.needsUpdate = true;
      g.attributes.normal.array.set(nor); g.attributes.normal.needsUpdate = true;
      g.attributes.color.array.set(col); g.attributes.color.needsUpdate = true;
      g.computeBoundingSphere();
    } else {
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
    }
  }

  setHighlight(on) {
    if (this.highlight === on) return;
    this.highlight = on;
    this.group.traverse(o => {
      if (!o.isMesh) return;
      if (on) {
        if (!o.userData.base) o.userData.base = o.material;
        const m = o.userData.base.clone();
        m.onBeforeCompile = o.userData.base.onBeforeCompile;
        m.customProgramCacheKey = o.userData.base.customProgramCacheKey;
        m.emissive = new THREE.Color(on === 2 ? 0x3a2418 : 0x1c140e);
        o.material = m;
      } else if (o.userData.base) {
        o.material.dispose();
        o.material = o.userData.base;
      }
    });
  }

  dispose() {
    this.setHighlight(0);
    this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    scene.remove(this.group);
  }

  get label() {
    return `${VARIETIES[this.variety].name} rose`;
  }
}

/* ---------- adding, cutting, changing ---------- */
function headR(spec, bloom) { return headCollider(spec, bloom); }

function addRose(opts, { place = true, pts = null } = {}) {
  const rose = new Rose(opts);
  const hc = headR(rose.spec, rose.bloom);
  if (!pts) {
    const r = rng(rose.seed + 55);
    const want = { length: rose.length, seg: SEG, headOff: hc.off, az: opts.az ?? r() * Math.PI * 2, tilt: opts.tilt ?? 0.18 + r() * 0.26, headR: hc.r };
    pts = findPlacement(sim, want)?.pts;
    if (!pts) { rose.dispose(); return null; }
  }
  sim.addStem(pts, physSpec(rose.spec, hc), rose.id);
  stems.push(rose);
  rose.update();
  return rose;
}

function removeRose(rose) {
  sim.removeStem(rose.id);
  rose.dispose();
  stems.splice(stems.indexOf(rose), 1);
  if (selected === rose) select(null);
}

// cut the stem shorter: the head stays where it is, the cut end comes up, and it drops
function cutRose(rose, length) {
  const st = rose.physics;
  const pts = sim.points(st);
  const head = pts.pop();
  const cutBy = rose.length - length;
  if (cutBy <= 0.001) return;
  // walk up from the bottom by cutBy, then resample the rest evenly
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(...pts[i].map((v, k) => v - pts[i - 1][k])));
  const total = lens[lens.length - 1];
  const sample = s => {
    let i = 1; while (i < lens.length - 1 && lens[i] < s) i++;
    const f = (s - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return pts[i - 1].map((v, k) => v + (pts[i][k] - v) * f);
  };
  const n = Math.max(3, Math.round(length / SEG));
  const out = [];
  for (let k = 0; k <= n; k++) out.push(sample(cutBy + (total - cutBy) * k / n));
  out.push(head);
  sim.removeStem(rose.id);
  rose.length = length;
  rose.spec.prickles = rose.spec.prickles.filter(p => p.at < length - 0.01);
  sim.addStem(out, physSpec(rose.spec, headR(rose.spec, rose.bloom)), rose.id);
  rose.update();
}

function setBloom(rose, bloom) {
  rose.bloom = bloom;
  rose.buildHead();
  const st = rose.physics;
  const hc = headR(rose.spec, bloom);
  const h = st.start + st.n - 1;
  sim.rad[h] = hc.r;
  st.seg[st.n - 2] = hc.off;
  sim.wake();
  rose.update();
}

function reroll(rose) {
  const seed = Math.floor(Math.random() * 1e9);
  const pts = sim.points(rose.physics);
  const opts = { variety: rose.variety, seed, bloom: rose.bloom, length: rose.length, twist: rose.twist, id: rose.id };
  sim.removeStem(rose.id);
  rose.dispose();
  stems.splice(stems.indexOf(rose), 1);
  const nr = addRose(opts, { pts });
  select(nr);
}

/* ---------- undo ---------- */
const history = { past: [], future: [] };
function snapshot() {
  return {
    mech: state.mech, water: state.water,
    stems: stems.map(s => ({ variety: s.variety, seed: s.seed, bloom: s.bloom, length: s.length, twist: s.twist, id: s.id, pts: sim.points(s.physics) })),
  };
}
function commit() {
  history.past.push(snapshot());
  if (history.past.length > 60) history.past.shift();
  history.future = [];
  syncHistory();
}
function restore(snap) {
  for (const s of [...stems]) { sim.removeStem(s.id); s.dispose(); }
  stems.length = 0;
  if (snap.mech !== state.mech || snap.water !== state.water) {
    state.mech = snap.mech; state.water = snap.water;
    syncVaseUi();
    rebuildVase();
  }
  for (const o of snap.stems) addRose(o, { pts: o.pts });
  sim.wake();
  select(null);
}
function undo() {
  if (history.past.length < 2) return;
  history.future.push(history.past.pop());
  restore(history.past[history.past.length - 1]);
  syncHistory();
}
function redo() {
  if (!history.future.length) return;
  const s = history.future.pop();
  history.past.push(s);
  restore(s);
  syncHistory();
}
function syncHistory() {
  $('undo').disabled = history.past.length < 2;
  $('redo').disabled = !history.future.length;
}

/* ---------- picking and the hand ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function rayAt(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray;
}
function pick(e) {
  const R = rayAt(e);
  let best = null;
  for (const rose of stems) {
    const st = rose.physics;
    const pts = sim.points(st);
    const head = new THREE.Vector3(...pts[pts.length - 1]);
    const hr = sim.rad[st.start + st.n - 1] * 0.95;
    const t = R.distanceSqToPoint(head) < hr * hr ? R.origin.distanceTo(head) - hr * 0.5 : Infinity;
    if (t < (best?.t ?? Infinity)) best = { rose, t };
    for (let k = 0; k < pts.length - 2; k++) {
      const a = new THREE.Vector3(...pts[k]), b = new THREE.Vector3(...pts[k + 1]);
      const onRay = new THREE.Vector3(), onSeg = new THREE.Vector3();
      const d2 = R.distanceSqToSegment(a, b, onRay, onSeg);
      const dist = R.origin.distanceTo(onRay);
      const tol = Math.max(STEM_R * 1.8, dist * 0.006);
      if (d2 < tol * tol && dist < (best?.t ?? Infinity)) best = { rose, t: dist };
    }
  }
  return best?.rose ?? null;
}

let selected = null, hovered = null, hold = null;
const MOUTH = () => new THREE.Vector3(0, desc.rimY, 0);

function select(rose) {
  if (selected && selected !== rose) selected.setHighlight(hovered === selected ? 1 : 0);
  selected = rose;
  if (rose) rose.setHighlight(2);
  syncBench();
}

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const rose = pick(e);
  if (!rose) { if (selected) select(null); return; }
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  select(rose);
  const st = rose.physics;
  const headIdx = st.start + st.n - 1;
  const hp = new THREE.Vector3(sim.pos[headIdx * 3], sim.pos[headIdx * 3 + 1], sim.pos[headIdx * 3 + 2]);
  hold = { rose, rho: Math.max(0.06, hp.distanceTo(MOUTH())), moved: false };
  canvas.classList.add('is-holding');
  moveHold(e);
});
canvas.addEventListener('pointermove', e => {
  if (hold) { moveHold(e); return; }
  const r = pick(e);
  if (r !== hovered) {
    if (hovered && hovered !== selected) hovered.setHighlight(0);
    hovered = r;
    if (r && r !== selected) r.setHighlight(1);
    canvas.classList.toggle('is-grab', !!r);
  }
});
const endHold = e => {
  if (!hold) return;
  sim.clearGuides();
  const st = hold.rose.physics;
  for (let k = 0; k < st.n; k++) for (let c = 0; c < 3; c++) sim.vel[(st.start + k) * 3 + c] *= 0.2;
  if (hold.moved) { commit(); say('Let go. It finds its own way to rest.'); }
  hold = null;
  controls.enabled = true;
  canvas.classList.remove('is-holding');
};
canvas.addEventListener('pointerup', endHold);
canvas.addEventListener('pointercancel', endHold);
canvas.addEventListener('wheel', e => {
  if (!hold) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  hold.rho = Math.max(0.05, Math.min(hold.rose.length + 0.12, hold.rho + e.deltaY * 0.00025));
  moveHold(hold.lastEvent || e);
}, { passive: false, capture: true });

/* The hand: the flower head moves over a dome centred on the vase's mouth; the stem is steered
   to pass through the mouth, near its centre and a little towards the side the head leans to. */
function moveHold(e) {
  hold.lastEvent = { clientX: e.clientX, clientY: e.clientY };
  const R = rayAt(e);
  const C = MOUTH();
  const oc = R.origin.clone().sub(C);
  const b = oc.dot(R.direction), c = oc.lengthSq() - hold.rho * hold.rho;
  const disc = b * b - c;
  let T;
  if (disc >= 0) T = R.origin.clone().addScaledVector(R.direction, -b - Math.sqrt(disc));
  else {
    const p = R.origin.clone().addScaledVector(R.direction, -b);
    T = C.clone().add(p.sub(C).setLength(hold.rho));
  }
  // keep the head above the lip: at least ~12° of elevation
  const w = T.clone().sub(C);
  const minY = hold.rho * Math.sin(0.21);
  if (w.y < minY) {
    const hz = Math.hypot(w.x, w.z) || 1e-6, hr = Math.sqrt(hold.rho * hold.rho - minY * minY);
    w.set(w.x / hz * hr, minY, w.z / hz * hr);
    T = C.clone().add(w);
  }
  const st = hold.rose.physics;
  const headIdx = st.start + st.n - 1;
  sim.setGuide(headIdx, T.x, T.y, T.z, 0);
  // a second hold lower down sets the stem's direction: through the mouth
  const P = C.clone().add(new THREE.Vector3(w.x, 0, w.z).multiplyScalar(0.15));
  const dir = P.clone().sub(T).normalize();
  const k = Math.round((st.n - 1) * 0.45);
  let s = 0; for (let j = k; j < st.n - 1; j++) s += st.seg[j];
  const G = T.clone().addScaledVector(dir, s);
  sim.setGuide(st.start + k, G.x, G.y, G.z, 4e-6);
  hold.moved = true;
}

addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { removeRose(selected); commit(); e.preventDefault(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
  if (e.key === 'Escape') select(null);
});

/* ---------- the panel ---------- */
function say(t) { $('say').textContent = t; }
function syncBench() {
  const b = $('bench');
  b.classList.toggle('is-empty', !selected);
  if (!selected) {
    $('sel-name').innerHTML = 'No rose in hand<small>pick one up</small>';
    return;
  }
  const s = selected;
  $('sel-name').innerHTML = `${s.label}<small>${s.spec.count} petals · ${Math.round(s.length * 100)} cm · ${stageName(s.bloom).toLowerCase()}</small>`;
  $('sel-bloom').value = s.bloom; $('sel-bloom-out').textContent = stageName(s.bloom);
  $('sel-length').max = s.spec.length; $('sel-length').value = s.length; $('sel-length-out').textContent = `${Math.round(s.length * 100)} cm`;
  $('sel-twist').value = s.twist; $('sel-twist-out').textContent = `${Math.round(s.twist)}°`;
}
$('sel-bloom').addEventListener('input', e => { if (!selected) return; setBloom(selected, +e.target.value); selected.setHighlight(0); selected.setHighlight(2); syncBench(); });
$('sel-bloom').addEventListener('change', commit);
$('sel-length').addEventListener('input', e => {
  if (!selected) return;
  const v = +e.target.value;
  if (v < selected.length - 0.004) { cutRose(selected, v); selected.setHighlight(0); selected.setHighlight(2); say('Snip. Shorter stems sit lower and stand straighter.'); }
  else e.target.value = selected.length;
  syncBench();
});
$('sel-length').addEventListener('change', commit);
$('sel-twist').addEventListener('input', e => { if (!selected) return; selected.twist = +e.target.value; selected.update(); syncBench(); });
$('sel-twist').addEventListener('change', commit);
$('reroll').addEventListener('click', () => { if (selected) { reroll(selected); commit(); } });
$('remove').addEventListener('click', () => { if (selected) { removeRose(selected); commit(); } });
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);

function buildVarietyUi() {
  const box = $('varieties');
  for (const [id, V] of Object.entries(VARIETIES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.variety = id;
    b.innerHTML = `<i style="background: radial-gradient(circle at 35% 30%, ${V.petals.edge}, ${V.petals.face} 55%, ${V.petals.back})"></i>${V.name}`;
    b.addEventListener('click', () => setVariety(id));
    box.appendChild(b);
  }
}
function setVariety(id) {
  state.variety = id;
  for (const b of $('varieties').children) b.setAttribute('aria-pressed', b.dataset.variety === id);
  $('variety-note').textContent = VARIETIES[id].note;
}
$('new-bloom').addEventListener('input', e => { state.newBloom = +e.target.value; $('new-bloom-out').textContent = stageName(state.newBloom); });
$('add').addEventListener('click', () => {
  const r = addRose({ variety: state.variety, seed: Math.floor(Math.random() * 1e9), bloom: state.newBloom, length: 0.4 + Math.random() * 0.08 });
  if (!r) { say('There’s no room for another stem without forcing it. Take one out, or cut some shorter.'); return; }
  select(r);
  commit();
  say('In it goes. Drag the head to place it where you want.');
});
const MECH_NOTES = {
  none: 'Stems lean on the rim and on each other, and cross in the water. Fewer stems splay out.',
  grid: 'A grid of clear tape across the mouth holds each stem in its own square, so they stand where you put them.',
};
function syncVaseUi() {
  for (const b of $('mechanics').children) b.setAttribute('aria-pressed', b.dataset.mech === state.mech);
  $('mech-note').textContent = MECH_NOTES[state.mech];
  $('water').value = state.water;
  $('water-out').textContent = state.water < 0.3 ? 'A little' : state.water < 0.45 ? 'A third' : state.water < 0.58 ? 'Half' : state.water < 0.74 ? 'Two thirds' : 'Nearly full';
}
for (const b of $('mechanics').children) b.addEventListener('click', () => { state.mech = b.dataset.mech; syncVaseUi(); rebuildVase(); commit(); });
$('water').addEventListener('input', e => { state.water = +e.target.value; syncVaseUi(); rebuildVase(); });
$('water').addEventListener('change', commit);
for (const b of $('lights').children) b.addEventListener('click', () => setLight(b.dataset.light));
$('clear').addEventListener('click', () => { for (const s of [...stems]) removeRose(s); commit(); });
$('refill').addEventListener('click', () => { for (const s of [...stems]) removeRose(s); arrange(); commit(); });

/* ---------- the starting arrangement ---------- */
const OPENING = [
  { variety: 'red', seed: 41, bloom: 0.56, length: 0.47, az: 0.4, tilt: 0.08 },
  { variety: 'red', seed: 7, bloom: 0.72, length: 0.44, az: 2.6, tilt: 0.3 },
  { variety: 'blush', seed: 12, bloom: 0.62, length: 0.43, az: 4.6, tilt: 0.32 },
  { variety: 'red', seed: 99, bloom: 0.35, length: 0.45, az: 5.6, tilt: 0.26 },
  { variety: 'ivory', seed: 23, bloom: 0.8, length: 0.41, az: 1.5, tilt: 0.4 },
  { variety: 'blush', seed: 58, bloom: 0.45, length: 0.42, az: 3.5, tilt: 0.42 },
  { variety: 'red', seed: 77, bloom: 0.95, length: 0.4, az: 0.9, tilt: 0.45 },
];
function arrange() {
  for (const o of OPENING) {
    addRose(o);
    for (let f = 0; f < 90 && !sim.sleeping; f++) sim.step();
  }
  for (const s of stems) s.update();
}

/* ---------- a lineup for checking the rose itself (?lineup=red) ---------- */
function lineup(variety) {
  const g = new THREE.Group();
  STAGES.forEach((st, i) => {
    const spec = makeSpecimen(variety, 41, 0.4);
    const head = new THREE.Group();
    const pet = new THREE.Mesh(petalGeometry(spec, st.bloom), petalMaterial(variety));
    const sep = new THREE.Mesh(sepalGeometry(spec, st.bloom), mats.sepal);
    const rec = new THREE.Mesh(receptacleGeometry(), mats.receptacle);
    const stm = stamenGeometry(spec, st.bloom);
    for (const m of [pet, sep, rec]) { m.castShadow = m.receiveShadow = true; head.add(m); }
    if (stm) head.add(new THREE.Mesh(stm, mats.stamen));
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(STEM_R * 0.9, STEM_R, 0.12, 12), mats.receptacle);
    stalk.position.y = -0.06;
    head.add(stalk);
    head.position.set((i - 2) * 0.12, 0.12, 0);
    if (params.has('tilt')) head.rotation.x = 0.75;
    g.add(head);
  });
  scene.add(g);
  const only = params.has('stage') ? +params.get('stage') : -1;
  if (only >= 0) g.children.forEach((h, i) => { h.visible = i === only; h.position.x = 0; });
  const dist = +(params.get('dist') || 1.25), ey = +(params.get('ey') || 0.06);
  controls.target.set(0, 0.145, 0);
  camera.position.set(0, 0.145 + ey, dist);
}

/* ---------- the loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  if (!sim.sleeping) {
    sim.step(1 / 60);
    for (const s of stems) s.update();
  }
  controls.update();
  composer.render(dt);
  requestAnimationFrame(frame);
}

/* ---------- start ---------- */
(async () => {
  progress('Cutting roses', 0.1);
  resize();
  makeMaterials();
  buildVarietyUi();
  setVariety('red');
  await buildRoom();
  progress('Filling the vase', 0.5);
  setLight(params.get('light') || store.get('light') || 'studio');
  syncVaseUi();
  if (params.has('lineup')) {
    lineup(params.get('lineup') || 'red');
  } else {
    rebuildVase();
    await new Promise(r => setTimeout(r, 0));
    progress('Arranging', 0.8);
    if (!params.has('empty')) arrange();
    commit();
  }
  for (const id of Object.keys(VARIETIES)) petalMaterial(id);
  progress('Ready', 1);
  $('loading').classList.add('is-done');
  requestAnimationFrame(frame);
  window.__bq = { sim, stems, scene, camera, controls, addRose, removeRose, select, setBloom, cutRose, state, settled: () => sim.sleeping, step: n => { for (let i = 0; i < n; i++) sim.step(); stems.forEach(s => s.update()); } };
})().catch(err => {
  console.error(err);
  $('loading-text').textContent = 'Something went wrong loading the vase.';
});
