import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';
import { addVersions } from '../versions.js';
import { SPECIES, SPECIES_LIST } from './species.js';
import { POTS, POT, buildPot, potIcon, POT_SWATCH, preloadSoil } from './pots.js';
import { leafTexture, leafGeometry } from './leaves.js';
import { STEPS_PER_YEAR, START_STEP, START_MONTH } from './sim.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('ui') === '0') document.body.classList.add('no-ui');
const store = {
  get(k) { try { return localStorage.getItem('bonsai:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('bonsai:' + k, v); } catch {} },
  del(k) { try { localStorage.removeItem('bonsai:' + k); } catch {} },
};

/* ---------- settings: where the tree lives ---------- */
// key: the main light, as a direction towards it. grow: where the tree's light comes from, which
// is what it grows towards. In the alcove that's the window, so the tree leans unless it's turned.
const SETTINGS = {
  studio: {
    name: 'Studio', note: 'A dark sweep and one soft key light from above and in front.',
    hdr: 'studio_small_08_1k.hdr', env: 0.6, exposure: 1.35, stand: 'slab',
    key: { dir: [0.5, 0.95, 0.65], color: '#fff0de', intensity: 2.6 }, grow: [0.3, 1, 0.45],
    fill: { color: '#cfd8ff', intensity: 0.35 }, rim: { color: '#ffffff', intensity: 0.8 },
  },
  tokonoma: {
    name: 'Tokonoma', note: 'A plaster alcove lit from a window on the left. Turn the pot now and then, or the tree will lean.',
    hdr: 'studio_kominka_03_1k.hdr', env: 0.5, exposure: 1.3, stand: 'jita',
    key: { dir: [-0.95, 0.55, 0.3], color: '#ffe2c0', intensity: 3 }, grow: [-0.55, 1, 0.2],
    fill: { color: '#ffe9d0', intensity: 0.25 }, rim: { color: '#ffd9b0', intensity: 0 },
  },
  garden: {
    name: 'Garden bench', note: 'Outdoors in soft, misty light from overhead.',
    hdr: 'misty_pines_1k.hdr', env: 1, exposure: 1.15, background: true, blur: 0.5, bg: 0.85, stand: 'none',
    key: { dir: [0.3, 1, 0.25], color: '#eef1ff', intensity: 1.3 }, grow: [0.15, 1, 0.15],
    fill: { color: '#dfe8ff', intensity: 0.2 }, rim: { color: '#ffffff', intensity: 0 },
  },
  winter: {
    name: 'Winter garden', note: 'A snowfield in a pine wood under low winter sun. Snow settles on the branches through the cold months.',
    hdr: 'snowy_forest_path_01_1k.hdr', env: 0.85, exposure: 1.05, background: true, blur: 0.35, bg: 0.9, stand: 'stone',
    key: { dir: [0.55, 0.42, 0.6], color: '#fff1df', intensity: 1.9 }, grow: [0.3, 1, 0.35],
    fill: { color: '#c7d6ff', intensity: 0.35 }, rim: { color: '#ffe8cc', intensity: 0.6 },
  },
};
const SETTING_LIST = Object.entries(SETTINGS).map(([id, s]) => ({ id, ...s }));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SPEEDS = [{ label: '½×', sps: 2.4 }, { label: '1×', sps: 4.8 }, { label: '5×', sps: 24 }, { label: '25×', sps: 120 }, { label: '100×', sps: 480 }];
const MAX_AGE = 500;
const MAX_STEP = Math.round((MAX_AGE - START_MONTH / 12) * STEPS_PER_YEAR);

/* ---------- renderer, scene, camera ---------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: params.has('shot') || params.has('portrait') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.02, 30);
camera.position.set(0.22, 0.42, 1.05);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.12;
controls.maxDistance = 4;
controls.maxPolarAngle = Math.PI * 0.62;
controls.target.set(0, 0.2, 0);

const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.6, right: 0.6, top: 0.8, bottom: -0.4, near: 0.2, far: 5 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.002;
const fill = new THREE.DirectionalLight(0xffffff, 0.3);       // softens the shadow side; casts no shadow
const rim = new THREE.DirectionalLight(0xffffff, 0);          // from behind, to edge the silhouette
scene.add(key, key.target, fill, fill.target, rim, rim.target);

const world = new THREE.Group();          // setting and stand
const turntable = new THREE.Group();      // the pot and tree, turned together
const treeGroup = new THREE.Group();
turntable.add(treeGroup);
scene.add(world, turntable);

/* ---------- post: AO from the main depth, depth of field, grade ----------
   The scene renders once into its own multisampled target with a depth texture. AO and depth of
   field both read that depth, so alpha-tested leaves are leaf-shaped to them, not rectangles. */
const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType, samples: params.get('msaa') === '0' ? 0 : 4, depthTexture: new THREE.DepthTexture(1, 1),
});
class ScenePass extends Pass {
  constructor() {
    super();
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms) }));
  }
  setSize(w, h) { sceneRT.setSize(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    this.copy.material.uniforms.tDiffuse.value = sceneRT.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
  }
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.addPass(new ScenePass());
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.setGBuffer(sceneRT.depthTexture);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 0.9;
gtao.updateGtaoMaterial({ radius: 0.06, distanceExponent: 1.4, thickness: 1.2, scale: 1 });
composer.addPass(gtao);

const dof = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: sceneRT.depthTexture },
    near: { value: 0.02 }, far: { value: 30 }, focus: { value: 1 }, aperture: { value: 0.02 },
    maxBlur: { value: 10 }, resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float near, far, focus, aperture, maxBlur; uniform vec2 resolution;
    varying vec2 vUv;
    float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
    float coc(float z) { return clamp(abs(z - focus) / max(z, 1e-3) * aperture * resolution.y, 0.0, maxBlur); }
    void main() {
      float z = viewZ(vUv);
      float c = coc(z);
      vec4 sum = texture2D(tDiffuse, vUv); float wsum = 1.0;
      // golden-angle disc; a sample only spreads onto us if it is blurry itself or behind us
      for (int i = 1; i < 40; i++) {
        float fi = float(i);
        float r = sqrt(fi / 40.0) * maxBlur;
        float a = fi * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * r / resolution;
        float zs = viewZ(vUv + o);
        float cs = coc(zs);
        float w = smoothstep(r - 1.0, r + 1.0, zs < z ? cs : min(cs, c));
        sum += texture2D(tDiffuse, vUv + o) * w; wsum += w;
      }
      gl_FragColor = sum / wsum;
    }`,
});
dof.uniforms.tDepth.value = sceneRT.depthTexture;     // ShaderPass clones uniforms, textures included
composer.addPass(dof);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.35 }, grain: { value: 0.03 }, time: { value: 0 }, aspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vignette, grain, time, aspect; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c.rgb *= mix(1.0, smoothstep(1.05, 0.25, length(d)), vignette);
      c.rgb += (h(vUv * 911.0) - 0.5) * grain;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);

/* ---------- loading ---------- */
const texLoader = new THREE.TextureLoader();
const rgbe = new RGBELoader();
const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = {};
function loadEnv(file) {
  if (!envCache[file]) envCache[file] = new Promise(res => rgbe.load('assets/' + file, hdr => {
    const env = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    res(env);
  }));
  return envCache[file];
}
function tex(file, srgb, repeat = 1) {
  const t = texLoader.load('assets/' + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- materials ---------- */
const HI = {
  select: new THREE.Color('#9fd3ff'), cut: new THREE.Color('#ff5a46'), pinch: new THREE.Color('#d4f57a'),
  defoliate: new THREE.Color('#ffb347'), wire: new THREE.Color('#ff9a4d'), guy: new THREE.Color('#ff9a4d'), jin: new THREE.Color('#fff1d6'),
};
const shared = {
  uHi: { value: new THREE.Vector4(-10, -10, 0, 0) },    // highlighted dfs range, strength
  uHiColor: { value: HI.select.clone() },
  uSel: { value: new THREE.Vector2(-10, -10) },         // selected range
  uTime: { value: 0 }, uWind: { value: 1 }, uTransl: { value: 1 },
  uLightView: { value: new THREE.Vector3(0, 1, 0) }, uLightColor: { value: new THREE.Color(1, 1, 1) },
  uSnow: { value: 0 },
};

const barkCache = {};
function barkMaterial(sp) {
  if (barkCache[sp.id]) return barkCache[sp.id];
  const t = sp.bark.tex;
  const m = new THREE.MeshStandardMaterial({
    map: tex(`${t}_diff_1k.jpg`, true), normalMap: tex(`${t}_nor_gl_1k.jpg`), roughnessMap: tex(`${t}_rough_1k.jpg`),
    color: new THREE.Color(sp.bark.tint), roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2),
  });
  const young = new THREE.Color(sp.bark.young);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared, { uYoung: { value: young }, uDead: { value: new THREE.Color('#d9d2c4') } });
    sh.vertexShader = 'attribute vec4 aInfo; attribute float aDfs; varying vec4 vInfo; varying float vDfs;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo; vDfs = aDfs;');
    sh.fragmentShader = `uniform vec3 uYoung, uDead, uHiColor; uniform vec4 uHi; uniform vec2 uSel; uniform float uSnow;
      varying vec4 vInfo; varying float vDfs;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.3333));
        vec3 youngBark = uYoung * mix(0.8, 1.2, smoothstep(0.02, 0.2, lum));
        diffuseColor.rgb = mix(youngBark, diffuseColor.rgb, vInfo.x);
        vec3 deadwood = uDead * mix(0.62, 1.08, smoothstep(0.01, 0.16, lum));
        diffuseColor.rgb = mix(diffuseColor.rgb, deadwood, vInfo.y);
        float groove = 1.0 - smoothstep(0.03, 0.09, abs(fract(vInfo.w) - 0.5));
        diffuseColor.rgb *= 1.0 - 0.6 * vInfo.z * groove;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.55, roughnessFactor, vInfo.x);
        roughnessFactor = mix(roughnessFactor, 0.72, vInfo.y);`)
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * mix(0.2, 1.0, max(vInfo.x, vInfo.y));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hi = step(uHi.x - 0.5, vDfs) * step(vDfs, uHi.y + 0.5) * uHi.z;
        float sel = step(uSel.x - 0.5, vDfs) * step(vDfs, uSel.y + 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, uHiColor * 0.5, hi * 0.55);
        totalEmissiveRadiance += uHiColor * hi * 0.22 + vec3(0.62, 0.83, 1.0) * sel * 0.07;
        // snow lies on bark that faces the sky
        vec3 upW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        float snow = uSnow * smoothstep(0.3, 0.75, upW.y) * (1.0 - vInfo.y * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), snow);
        roughnessFactor = mix(roughnessFactor, 0.85, snow);`);
  };
  return (barkCache[sp.id] = m);
}

const leafCache = {};
function leafMaterial(sp) {
  if (leafCache[sp.id]) return leafCache[sp.id];
  const m = new THREE.MeshStandardMaterial({
    map: leafTexture(sp.leaf.shape), alphaTest: sp.leaf.shape === 'spray' ? 0.3 : 0.5, side: THREE.DoubleSide,
    roughness: sp.leaf.shape === 'spray' ? 0.8 : 0.68, envMapIntensity: 0.65, alphaToCoverage: true,
  });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = 'attribute float aDfs; varying float vDfs; uniform float uTime, uWind;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDfs = aDfs;
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float ph = uTime * 1.6 + dot(ip, vec3(41.0, 23.0, 31.0));
          float sway = uWind * uv.y;
          transformed.z += (sin(ph) * 0.1 + sin(ph * 2.3 + 0.7) * 0.04) * sway;
          transformed.x += sin(ph * 0.8 + 1.3) * 0.05 * sway;
        #endif`);
    sh.fragmentShader = `uniform vec3 uHiColor, uLightView, uLightColor; uniform vec4 uHi; uniform vec2 uSel; uniform float uTransl, uSnow;
      varying float vDfs;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 upL = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.95), uSnow * 0.7 * smoothstep(0.25, 0.85, abs(upL.y)));`)
      .replace('#include <opaque_fragment>', `
        // light passing through the blade: strongest when the sun is behind the leaf
        vec3 V = normalize(vViewPosition);
        float back = pow(clamp(dot(-V, uLightView), 0.0, 1.0), 2.5);
        outgoingLight += diffuseColor.rgb * uLightColor * (back * 0.9 + 0.08) * uTransl;
        float hi = step(uHi.x - 0.5, vDfs) * step(vDfs, uHi.y + 0.5) * uHi.z;
        float sel = step(uSel.x - 0.5, vDfs) * step(vDfs, uSel.y + 0.5);
        outgoingLight = mix(outgoingLight, uHiColor * 0.6, hi * 0.5) + vec3(0.62, 0.83, 1.0) * sel * 0.03;
        #include <opaque_fragment>`);
  };
  return (leafCache[sp.id] = m);
}

const wireMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.9, roughness: 0.32 });   // copper, warming to red as it tightens
const pickMat = new THREE.ShaderMaterial({
  vertexShader: `attribute float aDfs; varying float vId;
    void main() {
      vId = aDfs + 1.0;
      vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `varying float vId;
    void main() {
      float id = floor(vId + 0.5);
      gl_FragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
    }`,
  side: THREE.DoubleSide,
});

/* ---------- tree meshes ---------- */
const branchMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
branchMesh.castShadow = branchMesh.receiveShadow = true;
let leafMesh = null, leafCapacity = 0, leafShape = null;
const wireMesh = new THREE.Mesh(new THREE.BufferGeometry(), wireMat);
wireMesh.castShadow = true;
treeGroup.add(branchMesh, wireMesh);

function ensureLeaves(count, sp) {
  if (leafMesh && count <= leafCapacity && leafShape === sp.leaf.shape) return;
  if (leafMesh) { treeGroup.remove(leafMesh); leafMesh.geometry.dispose(); leafMesh.dispose(); }
  leafCapacity = Math.max(256, Math.ceil(count * 1.5));
  leafShape = sp.leaf.shape;
  const geo = leafGeometry(sp.leaf.shape);
  geo.setAttribute('aDfs', new THREE.InstancedBufferAttribute(new Float32Array(leafCapacity), 1));
  leafMesh = new THREE.InstancedMesh(geo, leafMaterial(sp), leafCapacity);
  leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(leafCapacity * 3), 3);
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  leafMesh.frustumCulled = false;
  treeGroup.add(leafMesh);
}

/* ---------- the setting: backdrop and stand ---------- */
const walnut = {
  map: tex('black_walnut_veneer_01_diff_1k.jpg', true), normalMap: tex('black_walnut_veneer_01_nor_gl_1k.jpg'),
  roughnessMap: tex('black_walnut_veneer_01_rough_1k.jpg'),
};
let settingId = null, potId = null, pot = null;
const settingGroup = new THREE.Group();
world.add(settingGroup);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.4 }));
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.receiveShadow = true;

function gradientBackground(top, bottom) {
  const cv = document.createElement('canvas');
  cv.width = 2; cv.height = 512;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top); g.addColorStop(0.62, bottom); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const backgrounds = { studio: gradientBackground('#2b2c2a', '#0b0b0a'), tokonoma: new THREE.Color('#15110d') };

function slab(w, h, d, tint, radius = 0.004, maps = walnut) {
  const m = new THREE.MeshStandardMaterial({ ...maps, color: tint });
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/* ---------- stands: what the pot rests on. Display only; each has its top at y = 0 ---------- */
const STANDS = {
  none: { name: 'Nothing', h: 0, note: 'The pot sits straight on the surface.' },
  slab: { name: 'Walnut slab', h: 0.03, note: 'A plain, dark walnut board. Quiet under anything.' },
  table: { name: 'Rosewood table', h: 0.1, note: 'A low four-legged stand that lifts the tree to the eye. Formal.' },
  jita: { name: 'Jita board', h: 0.012, note: 'A thin, pale board, the usual base in a tokonoma.' },
  stone: { name: 'Stone slab', h: 0.04, note: 'A rough grey slab with a broken edge. Suits junipers and winter.' },
  burl: { name: 'Burl slab', h: 0.045, note: 'A cross-section of burl wood with its natural, wandering edge.' },
};
const STAND_LIST = Object.entries(STANDS).map(([id, s]) => ({ id, ...s }));
const stoneMaps = { normalMap: tex('gravelly_sand_nor_gl_1k.jpg', false, 3) };

// a flat slab with a wandering natural edge, extruded downwards from y = 0
function naturalSlab(a, b, h, wobble, seed, material) {
  const shape = new THREE.Shape();
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 1 + wobble * (Math.sin(t * 3 + seed) * 0.5 + Math.sin(t * 7 + seed * 2.3) * 0.3 + Math.sin(t * 13 + seed * 0.7) * 0.2);
    const x = Math.cos(t) * a * r, y = Math.sin(t) * b * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, -0.004, 0);
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function buildStand(id, def) {
  const g = new THREE.Group();
  const w = Math.max(def.w * 1.3, def.w + 0.08), d = Math.max(def.d * 1.3, def.d + 0.08);
  if (id === 'slab') {
    const m = slab(w, 0.03, d, '#8a7262');
    m.position.y = -0.015;
    g.add(m);
  } else if (id === 'jita') {
    const m = slab(w * 1.05, 0.012, d * 1.05, '#b39a7c', 0.002);
    m.position.y = -0.006;
    g.add(m);
  } else if (id === 'table') {
    const top = slab(w, 0.02, d, '#5b2c21', 0.003);
    top.position.y = -0.01;
    const apron = slab(w - 0.03, 0.018, d - 0.03, '#4a231a', 0.002);
    apron.position.y = -0.028;
    g.add(top, apron);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = slab(0.022, 0.08, 0.022, '#4a231a', 0.004);
      leg.position.set(sx * (w / 2 - 0.03), -0.06, sz * (d / 2 - 0.03));
      g.add(leg);
    }
  } else if (id === 'stone') {
    g.add(naturalSlab(w * 0.56, d * 0.58, 0.04, 0.06, 1.3,
      new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#7d7a74', roughness: 0.9, normalScale: new THREE.Vector2(0.6, 0.6) })));
  } else if (id === 'burl') {
    g.add(naturalSlab(w * 0.6, d * 0.62, 0.045, 0.1, 4.1, new THREE.MeshStandardMaterial({ ...walnut, color: '#9a6a4a' })));
  }
  return g;
}

/* ---------- settings: the surface the stand sits on, and what's around it ---------- */
const plaster = new THREE.MeshStandardMaterial({
  map: tex('clay_plaster_diff_1k.jpg', true, 2), normalMap: tex('clay_plaster_nor_gl_1k.jpg', false, 2),
  color: '#e8d6b8', roughness: 0.95,
});
const snowMat = new THREE.MeshStandardMaterial({
  color: '#f3f5f9', roughness: 0.92, normalMap: tex('gravelly_sand_nor_gl_1k.jpg', false, 10), normalScale: new THREE.Vector2(0.25, 0.25),
});
function buildSurface(id) {
  const g = new THREE.Group();
  if (id === 'studio') {
    shadowCatcher.position.y = 0;
    g.add(shadowCatcher);
  } else if (id === 'tokonoma') {
    const board = slab(1.9, 0.05, 0.72, '#7b6352', 0.003);
    board.position.set(0, -0.025, -0.06);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.4), plaster);
    wall.position.set(0, 0.68, -0.42);
    wall.receiveShadow = true;
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.4), plaster);
    side.rotation.y = -Math.PI / 2;
    side.position.set(0.95, 0.68, -0.06);
    side.receiveShadow = true;
    const post = slab(0.07, 1.45, 0.07, '#5e4a3c', 0.006);
    post.position.set(0.9, 0.7, -0.38);
    g.add(board, wall, side, post);
  } else if (id === 'garden') {
    const bench = slab(0.95, 0.05, 0.4, '#a8a49a', 0.006);
    bench.position.y = -0.025;
    const legMat = new THREE.MeshStandardMaterial({ color: '#77746c', roughness: 0.92 });
    for (const x of [-0.34, 0.34]) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.44, 0.34, 3, 0.01), legMat);
      leg.position.set(x, -0.27, 0);
      leg.castShadow = leg.receiveShadow = true;
      g.add(leg);
    }
    shadowCatcher.position.y = -0.49;
    g.add(bench, shadowCatcher);
  } else if (id === 'winter') {
    // a snowfield, with a few drifted boulders half buried around the tree
    const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64), snowMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);
    const rockMat = new THREE.MeshStandardMaterial({ ...stoneMaps, color: '#5f5d59', roughness: 0.9 });
    for (const [x, z, r] of [[-0.75, -0.55, 0.16], [0.9, -0.9, 0.24], [-1.3, -1.6, 0.3], [0.5, 0.9, 0.1]]) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), rockMat);
      rock.position.set(x, -r * 0.35, z);
      rock.scale.set(1.2, 0.7, 1);
      rock.castShadow = rock.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), snowMat);
      cap.position.copy(rock.position);
      cap.scale.copy(rock.scale);
      cap.castShadow = cap.receiveShadow = true;
      g.add(rock, cap);
    }
  }
  return g;
}

// falling snow, for the winter garden: points drifting down through a box round the tree
const snowfall = (() => {
  const N = 1400, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 2.4; pos[i * 3 + 1] = Math.random() * 1.8; pos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uScale: { value: 400 }, uAmount: { value: 0 } },
    vertexShader: `attribute float seed; uniform float uTime, uScale; varying float vA;
      void main() {
        vec3 p = position;
        float fall = 0.05 + 0.05 * seed;
        p.y = mod(p.y - uTime * fall, 1.8) - 0.1;
        p.x += sin(uTime * 0.6 + seed * 40.0) * 0.04;
        p.z += cos(uTime * 0.5 + seed * 31.0) * 0.04;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(14.0, (0.003 + 0.004 * seed) * uScale / -mv.z);     // flakes 3–7 mm across
        // fade flakes at the ends of the box and those right in front of the lens
        vA = smoothstep(-0.1, 0.05, p.y) * (1.0 - smoothstep(1.4, 1.7, p.y)) * smoothstep(0.25, 0.6, -mv.z);
      }`,
    fragmentShader: `uniform float uAmount; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.15, d) * 0.85 * vA * uAmount);
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.visible = false;
  return pts;
})();
world.add(snowfall);

let standId = null, surfaceGroup = null, standGroup = null;
function placeWorld() {
  // the stand's top is y = 0, where the pot sits; the setting's surface sits under the stand
  const h = STANDS[standId]?.h || 0;
  if (surfaceGroup) surfaceGroup.position.y = -h;
  if (standGroup) standGroup.position.y = 0;
  turntable.position.y = 0;
}
function applyStand(id) {
  if (!STANDS[id]) id = 'none';
  if (id === standId && standGroup && standGroup.userData.pot === potId) return;
  standId = id;
  if (standGroup) settingGroup.remove(standGroup);
  standGroup = buildStand(id, POT[potId || 'namako']);
  standGroup.userData.pot = potId;
  settingGroup.add(standGroup);
  placeWorld();
  renderDisplay();
  if (setupOpen) renderSetup();
}

async function applySetting(id) {
  if (id === settingId) return;
  settingId = id;
  const s = SETTINGS[id];
  if (surfaceGroup) settingGroup.remove(surfaceGroup);
  surfaceGroup = buildSurface(id);
  settingGroup.add(surfaceGroup);
  snowfall.visible = id === 'winter';
  loadLightFor(id);
  applyStand(store.get('stand') || s.stand);
  placeWorld();
  const env = await loadEnv(s.hdr);
  if (settingId !== id) return;
  scene.environment = env;
  scene.background = s.background ? env : backgrounds[id];
  applyLight();
  renderDisplay();
}

function applyPot(id) {
  if (id === potId) return;
  potId = id;
  if (pot) { turntable.remove(pot.group); }
  pot = buildPot(POT[id]);
  // snow settles on the soil in a winter garden
  pot.soil.material.onBeforeCompile = sh => {
    sh.uniforms.uSnow = shared.uSnow;
    sh.fragmentShader = 'uniform float uSnow;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float drift = smoothstep(0.35, 0.65, texture2D(map, vMapUv * 3.0).g + uSnow * 0.6 - 0.2);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), uSnow * drift);`);
  };
  turntable.add(pot.group);
  treeGroup.position.y = pot.soilY;
  if (standId) { const sId = standId; standId = null; applyStand(sId); }
}

/* ---------- the worker and what it sends back ---------- */
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let frame = null, meta = null, busy = false, busySince = 0, previewing = false;
const queue = [];          // actions run in order, never dropped
let latest = null;         // only the newest scrub or preview matters
let speciesId = null;

worker.onmessage = ({ data }) => {
  if (data.type === 'error') { console.error(data.message); busy = false; return; }
  busy = false;
  if (data.saved && !setupOpen) store.set('project', JSON.stringify(data.saved));
  if (data.acted) selected = -1;
  if (data.rejected && data.rejected !== 'undo') flash(rejectText(data.rejected));
  applyFrame(data.frame, data.preview);
  meta = data.meta;
  previewing = data.preview;
  renderTimeline();
  pump();
};
function send(msg) {
  if (msg.type === 'goto' || msg.type === 'preview') latest = msg;
  else queue.push(msg);
  pump();
}
function pump() {
  if (busy) return;
  const msg = queue.shift() || latest;
  if (!msg) return;
  if (msg === latest) latest = null;
  busy = true;
  busySince = performance.now();
  worker.postMessage(msg);
}

function applyFrame(f, isPreview) {
  frame = f;
  const sp = SPECIES[f.species];
  if (speciesId !== f.species) {
    speciesId = f.species;
    branchMesh.material = barkMaterial(sp);
    updateToolAvailability();
  }
  const b = f.branch;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
  g.setAttribute('aInfo', new THREE.BufferAttribute(b.info, 4));
  g.setAttribute('aDfs', new THREE.BufferAttribute(b.dfs, 1));
  g.setIndex(new THREE.BufferAttribute(b.index, 1));
  g.computeBoundingSphere();
  branchMesh.geometry.dispose();
  branchMesh.geometry = g;

  const L = f.leaves;
  ensureLeaves(L.count, sp);
  leafMesh.instanceMatrix.array.set(L.matrix);
  leafMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceColor.array.set(L.color);
  leafMesh.instanceColor.needsUpdate = true;
  const da = leafMesh.geometry.attributes.aDfs;
  da.array.set(L.dfs);
  da.needsUpdate = true;
  leafMesh.count = L.count;

  const w = f.wires;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(w.position, 3));
  wg.setAttribute('normal', new THREE.BufferAttribute(w.normal, 3));
  wg.setAttribute('color', new THREE.BufferAttribute(w.color, 3));
  wg.setIndex(new THREE.BufferAttribute(w.index, 1));
  wireMesh.geometry.dispose();
  wireMesh.geometry = wg;

  if (f.env.pot && f.env.pot !== potId) applyPot(f.env.pot);
  if (f.env.setting && f.env.setting !== settingId) applySetting(f.env.setting);
  turnTarget = f.env.turn;
  if (autoFrame && !isPreview && !playing) frameTree(true);
  if (!isPreview) {
    if (selected >= f.info.ids.length) selected = -1;
    if (selected >= 0 && !selectedId(selected)) selected = -1;
    renderInspector();
    renderCare();
    checkWires();
  }
  updateHighlight();
}
const selectedId = dfs => frame && dfs >= 0 && dfs < frame.info.ids.length ? frame.info.ids[dfs] : null;

/* ---------- picking: render the tree's dfs ids into a small patch under the cursor ----------
   Twigs can be a pixel wide, so the patch is 9×9 and the hit nearest its centre wins. */
const PICK = 9;
const pickRT = new THREE.WebGLRenderTarget(PICK, PICK);
const pickBuf = new Uint8Array(PICK * PICK * 4);
function pick(x, y) {
  if (!frame) return -1;
  const bg = scene.background;
  const vis = [world.visible, wireMesh.visible, pot?.group.visible];
  world.visible = false; wireMesh.visible = false; if (pot) pot.group.visible = false;
  scene.background = null;
  scene.overrideMaterial = pickMat;
  renderer.shadowMap.autoUpdate = false;
  camera.setViewOffset(innerWidth, innerHeight, x - (PICK - 1) / 2, y - (PICK - 1) / 2, PICK, PICK);
  renderer.setRenderTarget(pickRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(pickRT, 0, 0, PICK, PICK, pickBuf);
  renderer.setRenderTarget(null);
  camera.clearViewOffset();
  scene.overrideMaterial = null;
  scene.background = bg;
  renderer.shadowMap.autoUpdate = true;
  [world.visible, wireMesh.visible] = vis;
  if (pot) pot.group.visible = vis[2];
  let best = -1, bestD = Infinity;
  const c = (PICK - 1) / 2;
  for (let j = 0; j < PICK; j++) for (let i = 0; i < PICK; i++) {
    const o = (j * PICK + i) * 4;
    const id = pickBuf[o] + pickBuf[o + 1] * 256 + pickBuf[o + 2] * 65536;
    const d = (i - c) ** 2 + (j - c) ** 2;
    if (id && d < bestD) { bestD = d; best = id - 1; }
  }
  return best;
}

/* ---------- tools ---------- */
const TOOLS = {
  select: { title: 'Look and inspect', hint: 'Click a branch to see its age, vigour and wire. Drag to orbit, right-drag to pan, scroll to zoom.' },
  cut: { title: 'Concave cutter', hint: 'Click a branch to cut it off where it joins its parent. Its growth goes to the buds that are left, and buds below the cut may wake.' },
  pinch: { title: 'Pinch', hint: 'Click a soft new shoot to take out its growing tip. The buds lower down break instead, which builds fine ramification.' },
  defoliate: { title: 'Defoliate', hint: 'Click a branch to strip its leaves, or the trunk for the whole tree. In early summer it pushes a second flush of smaller leaves. Weakens the area you strip, which helps balance a strong top.' },
  wire: { title: 'Wire and bend', hint: 'Drag a branch to bend it. The wire holds it while the wood sets; remove it before it bites into the bark.' },
  guy: { title: 'Guy wire', hint: 'Drag a branch towards the pot rim to pull it down with a guy wire.' },
  jin: { title: 'Jin', hint: 'Click a branch to strip its bark and keep it as bleached deadwood.' },
};
let tool = 'select', hover = -1, selected = -1, bending = null, downAt = null;

function setTool(t) {
  if (!TOOLS[t] || document.querySelector(`.tool[data-tool="${t}"]`)?.disabled) return;
  tool = t;
  document.body.dataset.tool = t;
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  shared.uHiColor.value.copy(HI[t]);
  renderHint();
  updateHighlight();
}
function renderHint(extra = '') {
  const t = TOOLS[tool], sp = speciesId && SPECIES[speciesId];
  let warn = '';
  if (sp && tool === 'cut' && sp.backBud < 0.2) warn = `${sp.name} rarely buds on bare wood. Cut into wood with no green and it won't regrow.`;
  if (sp && tool === 'cut' && sp.backBud >= 0.8) warn = `${sp.name} buds back almost anywhere after a cut.`;
  if (sp && tool === 'pinch' && sp.habit === 'evergreen') warn = 'On juniper, pinching keeps foliage pads compact.';
  $('toolhint').innerHTML = `<b>${t.title}</b>${t.hint}${warn ? `<span class="warn">${warn}</span>` : ''}${extra ? `<span class="warn">${extra}</span>` : ''}`;
}
function updateToolAvailability() {
  const sp = SPECIES[speciesId];
  const d = document.querySelector('.tool[data-tool="defoliate"]');
  d.disabled = !sp.defoliate;
  d.querySelector('.tip').firstChild.textContent = sp.defoliate ? 'Defoliate' : `Defoliate (not for ${sp.name.toLowerCase()})`;
  if (tool === 'defoliate' && !sp.defoliate) setTool('select');
  renderHint();
}

// which dfs range a tool would act on from a hovered node
function toolRange(t, i) {
  if (!frame || i < 0) return null;
  const f = frame.info;
  const dead = f.flags[i] & 1;
  switch (t) {
    case 'select': return [i, f.chainEnd[i]];
    case 'cut': return i === 0 ? null : [i, f.end[i]];
    case 'jin': return i === 0 || dead ? null : [i, f.end[i]];
    case 'defoliate': return dead ? null : [i, f.end[i]];
    case 'pinch': {
      if (dead) return null;
      for (let k = i; k <= f.chainEnd[i]; k++) if (f.flags[k] & 4) return [k, f.chainEnd[i]];
      return null;
    }
    case 'wire': case 'guy': return dead && t === 'wire' ? null : [i, Math.min(f.chainEnd[i], i + 23)];
  }
  return null;
}
function updateHighlight() {
  const r = bending ? [bending.start, bending.end] : toolRange(tool, hover);
  shared.uHi.value.set(r ? r[0] : -10, r ? r[1] : -10, r ? (tool === 'select' ? 0.45 : 1) : 0, 0);
  if (selected >= 0 && frame && selected < frame.info.ids.length) shared.uSel.value.set(selected, frame.info.end[selected]);
  else shared.uSel.value.set(-10, -10);
}

const pointer = new THREE.Vector2();
const ray = new THREE.Raycaster();
let pickQueued = false, lastXY = [0, 0];
canvas.addEventListener('pointermove', e => {
  lastXY = [e.clientX, e.clientY];
  if (bending) { bendTo(e); return; }
  if (e.buttons && tool === 'select') return;
  if (!pickQueued) { pickQueued = true; requestAnimationFrame(() => { pickQueued = false; hover = pick(...lastXY); updateHighlight(); }); }
});
canvas.addEventListener('pointerleave', () => { hover = -1; updateHighlight(); });
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  downAt = [e.clientX, e.clientY];
  if ((tool === 'wire' || tool === 'guy') && frame) {
    const i = pick(e.clientX, e.clientY);
    const r = toolRange(tool, i);
    if (!r) return;
    pause();
    controls.enabled = false;
    document.body.classList.add('is-bending');
    canvas.setPointerCapture(e.pointerId);
    const f = frame.info;
    const local = k => new THREE.Vector3(f.base[k * 3], f.base[k * 3 + 1], f.base[k * 3 + 2]);
    const base = local(r[0]);
    const tip = new THREE.Vector3(f.tip[r[1] * 3], f.tip[r[1] * 3 + 1], f.tip[r[1] * 3 + 2]);
    treeGroup.updateMatrixWorld();
    const tipWorld = tip.clone().applyMatrix4(treeGroup.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), tipWorld);
    bending = { start: r[0], end: r[1], id: f.ids[r[0]], base, tip, plane, axis: null, angle: 0, target: null,
      gauge: Math.min(0.004, Math.max(0.0009, f.radius[r[0]] * 0.75)) };
    updateHighlight();
  }
});
canvas.addEventListener('pointerup', e => {
  if (bending) { finishBend(); return; }
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) { downAt = null; return; }
  downAt = null;
  const i = pick(e.clientX, e.clientY);
  click(i);
});

function click(i) {
  if (!frame) return;
  if (tool === 'select') { selected = i; renderInspector(); updateHighlight(); return; }
  if (tool === 'wire' || tool === 'guy') { if (i >= 0) flash('Drag the branch to bend it.'); return; }
  const r = toolRange(tool, i);
  if (!r) {
    if (i >= 0 && tool === 'pinch') flash('Nothing to pinch there: pinching works on this year’s soft shoots.');
    if (i === 0 && (tool === 'cut' || tool === 'jin')) flash('That’s the base of the trunk. Cut higher up to chop the trunk.');
    return;
  }
  pause();
  const id = frame.info.ids[i];
  if (tool === 'defoliate' && i === 0) act({ t: 'defoliate' });
  else act({ t: tool, id });
  selected = -1;
}

function bendTo(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const hit = ray.ray.intersectPlane(bending.plane, new THREE.Vector3());
  if (!hit) return;
  const inv = treeGroup.matrixWorld.clone().invert();
  const target = hit.applyMatrix4(inv);
  const v0 = bending.tip.clone().sub(bending.base), v1 = target.clone().sub(bending.base);
  const axis = v0.clone().cross(v1);
  if (axis.lengthSq() < 1e-10) return;
  axis.normalize();
  bending.axis = axis;
  bending.angle = Math.min(1.7, v0.angleTo(v1));
  bending.target = target;
  send({ type: 'preview', op: bendOp() });
}
function bendOp() {
  const op = { t: 'wire', kind: tool, id: bending.id, length: bending.end - bending.start + 1, axis: bending.axis.toArray(), angle: bending.angle, gauge: bending.gauge };
  if (tool === 'guy' && bending.target && pot) {
    const t = Math.atan2(bending.target.z, bending.target.x);
    const [x, y, z] = pot.rim(t);
    op.anchor = [x, y - pot.soilY + 0.003, z];
  }
  return op;
}
function finishBend() {
  controls.enabled = true;
  document.body.classList.remove('is-bending');
  const op = bending.axis && bending.angle > 0.03 ? bendOp() : null;
  bending = null;
  if (op) act(op);
  else { flash('Drag the branch to bend it.'); send({ type: 'goto', step: frame.step }); }
  updateHighlight();
}

function act(op) {
  if (latest?.type === 'preview') latest = null;
  send({ type: 'act', op });
}
function rejectText(t) {
  return { cut: 'Can’t cut there.', pinch: 'Nothing to pinch there.', defoliate: 'There are no leaves to take off.', jin: 'Can’t make deadwood there.', wire: 'Can’t wire there.' }[t] || 'That didn’t work.';
}
let flashTimer = 0;
function flash(text) {
  renderHint(text);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => renderHint(), 3500);
}

document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('frame').addEventListener('click', () => frameTree());

/* ---------- inspector ---------- */
const pct = x => `${Math.round(x * 100)}%`;
const mm = r => `${(r * 2000).toFixed(r < 0.0025 ? 1 : 0)} mm`;
function renderInspector() {
  const el = $('inspector');
  if (!frame) { el.innerHTML = ''; return; }
  const sp = SPECIES[frame.species];
  const s = frame.stats;
  if (selected < 0) {
    const bound = s.rootBound;
    const potName = POT[frame.env.pot]?.name || '';
    el.innerHTML = `
      <div class="sec__head"><h3>${sp.name}</h3><span class="meta">${sp.latin}</span></div>
      <dl class="facts">
        <dt>Height</dt><dd>${Math.round(s.height * 100)} cm</dd>
        <dt>Trunk</dt><dd>${mm(s.trunk / 2)}</dd>
        <dt>Vigour</dt><dd class="${s.vigor < 0.55 ? 'warn' : ''}">${pct(Math.min(1, s.vigor / 1.3))}</dd>
        <dt>Roots</dt><dd class="${bound > 0.5 ? 'warn' : ''}">${bound > 0.5 ? 'Pot-bound' : bound > 0.05 ? 'Filling the pot' : 'Growing'}</dd>
        <dt>Branch tips</dt><dd>${frame.info.ids.length}</dd>
      </dl>
      ${bound > 0.5 ? `<p class="say">The roots have filled the ${potName.toLowerCase()}. Repot in early spring to restore vigour.</p>` : ''}
      ${s.stress > 0.25 ? '<p class="say">Recovering from heavy work. It will grow more slowly this year.</p>' : ''}
      ${frame.wireList.some(w => w.biting) ? '<p class="say">A wire is biting into the bark. Select the wired branch to remove it.</p>' : ''}
      <p class="say">${sp.blurb}</p>`;
    return;
  }
  const f = frame.info, i = selected;
  const flags = f.flags[i];
  let chainLen = 0;
  for (let k = i; k <= f.chainEnd[i]; k++) chainLen += f.len[k];
  const wire = frame.wireList.find(w => i >= w.start && i <= w.end);
  const kind = i === 0 ? 'Trunk base' : f.order[i] === 0 ? 'Trunk' : (flags & 4) ? 'New shoot' : f.order[i] === 1 ? 'Primary branch' : 'Branch';
  const light = f.light[i];
  el.innerHTML = `
    <div class="sec__head"><h3>${flags & 1 ? 'Deadwood' : kind}</h3><button class="btn" type="button" id="deselect">Done</button></div>
    <dl class="facts">
      <dt>Thickness</dt><dd>${mm(f.radius[i])}</dd>
      <dt>Length to tip</dt><dd>${(chainLen * 100).toFixed(1)} cm</dd>
      <dt>Age</dt><dd>${f.age[i] < 1 ? `${Math.max(1, Math.round(f.age[i] * 52))} weeks` : `${Math.floor(f.age[i])} years`}</dd>
      ${flags & 1 ? '' : `<dt>Light</dt><dd>${light > 0.66 ? 'Bright' : light > 0.33 ? 'Partial shade' : light > 0 ? 'Shaded' : '—'}</dd>`}
      ${wire ? `<dt>${wire.kind === 'guy' ? 'Guy wire' : 'Wire'}</dt><dd class="${wire.biting || wire.tight >= TIGHT ? 'warn' : ''}">${wire.biting ? 'Biting in' : wire.tight >= TIGHT ? 'Tightening' : `${pct(wire.set)} set`}</dd>` : ''}
    </dl>
    ${wire ? `<p class="say">${wire.biting ? 'The bark is swelling over the wire. Remove it now; the scar will stay.' : wire.tight >= TIGHT ? 'The branch has thickened against the wire. Remove it soon or it will bite.' : ''}
      ${wire.set >= 0.95 ? 'The bend has set. Safe to remove.' : `If removed now it springs back about ${pct(1 - wire.set)} of the way.`}</p>
      <div class="row"><button class="btn btn--accent" type="button" id="unwire">Remove ${wire.kind === 'guy' ? 'guy wire' : 'wire'}</button></div>` : ''}
    ${!(flags & 1) && light > 0 && light < 0.3 ? '<p class="say">Shaded branches weaken and may be shed. Thin above it to let light in.</p>' : ''}`;
  $('deselect').onclick = () => { selected = -1; renderInspector(); updateHighlight(); };
  if (wire) $('unwire').onclick = () => { pause(); act({ t: 'unwire', wire: wire.id }); };
}

/* ---------- care ---------- */
function renderCare() {
  if (!frame) return;
  document.querySelectorAll('#feed button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.level === frame.env.feed));
  const m = frameMonth();
  const wires = frame.wireList.length;
  $('wire-count').textContent = wires ? `${wires} on` : 'none on';
  $('unwire-all').disabled = !wires;
  $('repot-say').textContent = m >= 1 && m <= 3 ? 'Early spring: the best time to repot.' : 'Best done in early spring, just before the buds open. Root work at other times sets the tree back further. To change container, use Display.';
  renderDisplay();
}
$('feed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) act({ t: 'feed', level: +b.dataset.level }); });
$('turn-left').addEventListener('click', () => act({ t: 'turn', angle: Math.PI / 2 }));
$('turn-right').addEventListener('click', () => act({ t: 'turn', angle: -Math.PI / 2 }));
$('unwire-all').addEventListener('click', () => {
  const n = frame?.wireList.length || 0;
  if (!n) return;
  const loose = frame.wireList.filter(w => w.set < 0.9).length;
  if (loose && !confirm(`${loose} of ${n} wires haven't fully set, so those branches will spring partway back. Remove all ${n}?`)) return;
  pause();
  act({ t: 'unwire', all: true });
});

/* ---------- wire warnings: pause once when a wire starts to tighten, and again when it bites ---------- */
const TIGHT = 0.7;
const warned = { tight: new Set(), bite: new Set() };
let alertWires = [], alertDismissed = new Set();
let lastWireStep = 0;
function checkWires() {
  if (!frame) return;
  if (frame.step < lastWireStep) { warned.tight.clear(); warned.bite.clear(); alertDismissed.clear(); }   // rewound: warn again
  lastWireStep = frame.step;
  const risky = frame.wireList.filter(w => w.tight >= TIGHT || w.biting);
  let fresh = false;
  for (const w of risky) {
    const set = w.biting ? warned.bite : warned.tight;
    if (!set.has(w.id)) { set.add(w.id); fresh = true; alertDismissed.delete(w.id); }
  }
  if (fresh && playing) pause();
  alertWires = risky.filter(w => !alertDismissed.has(w.id));
  const el = $('wire-alert');
  el.hidden = !alertWires.length || setupOpen;
  if (el.hidden) return;
  const biting = alertWires.filter(w => w.biting).length, tight = alertWires.length - biting;
  const one = alertWires.length === 1;
  const parts = [];
  if (biting) parts.push(`<b>${biting === 1 ? 'A wire is' : `${biting} wires are`} biting into the bark.</b> The scar will stay; remove ${biting === 1 ? 'it' : 'them'} now.`);
  if (tight) parts.push(`<b>${tight === 1 ? 'A wire is' : `${tight} wires are`} tightening</b> as the branch thickens. Remove ${tight === 1 ? 'it' : 'them'} soon, before ${tight === 1 ? 'it bites' : 'they bite'}.`);
  const unset = alertWires.filter(w => w.set < 0.9).length;
  if (unset) parts.push(`${unset === alertWires.length ? (one ? 'It hasn’t' : 'They haven’t') : `${unset} of them haven’t`} fully set, so the branch${unset === 1 ? '' : 'es'} will spring partway back.`);
  $('wire-alert-text').innerHTML = parts.join(' ');
  $('wire-remove').textContent = one ? 'Remove it' : 'Remove them';
  $('wire-dismiss').textContent = one ? 'Leave it on' : 'Leave them on';
}
$('wire-show').addEventListener('click', () => {
  const w = alertWires[0];
  if (!w) return;
  setTool('select');
  showTab('tree');
  selected = w.start;
  renderInspector();
  updateHighlight();
});
$('wire-remove').addEventListener('click', () => {
  if (!alertWires.length) return;
  pause();
  act({ t: 'unwire', ids: alertWires.map(w => w.id) });
});
$('wire-dismiss').addEventListener('click', () => {
  for (const w of alertWires) alertDismissed.add(w.id);
  checkWires();
});

$('prune').addEventListener('input', () => { $('prune-out').textContent = `${$('prune').value}%`; });
$('do-repot').addEventListener('click', () => {
  const p = POT[frame.env.pot];
  pause();
  act({ t: 'repot', pot: p.id, cap: p.cap, prune: +$('prune').value / 100 });
  $('repot').open = false;
});

/* ---------- time ---------- */
let playing = false, clock = START_STEP, speed = +(store.get('speed') ?? 1);
if (!SPEEDS[speed]) speed = 1;
const frameMonth = () => frame ? Math.floor((((frame.step / STEPS_PER_YEAR) + START_MONTH / 12) % 1) * 12) : 2;
$('speeds').innerHTML = SPEEDS.map((s, i) => `<button type="button" data-i="${i}" title="${(STEPS_PER_YEAR / s.sps).toFixed(1)} s a year">${s.label}</button>`).join('');
$('speeds').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { speed = +b.dataset.i; store.set('speed', speed); renderTimeline(); } });
function play() {
  if (!frame) return;
  if (frame.step >= MAX_STEP) return;
  playing = true;
  clock = frame.step;
  selected = -1;
  renderInspector();
  renderTimeline();
}
function pause() {
  if (!playing) return;
  playing = false;
  if (frame) send({ type: 'goto', step: frame.step, save: true });
  renderTimeline();
}
$('play').addEventListener('click', () => playing ? pause() : play());

function trackEnd() {
  const reach = meta ? Math.max(...meta.branches.map(b => b.reach || START_STEP)) : START_STEP;
  const now = frame ? frame.step : START_STEP;
  const yrs = Math.ceil((Math.max(reach, now) - START_STEP) / STEPS_PER_YEAR) + 3;
  return START_STEP + Math.max(10, yrs) * STEPS_PER_YEAR;
}
function renderTimeline() {
  if (!frame) return;
  const age = frame.step / STEPS_PER_YEAR + START_MONTH / 12;
  $('date-age').textContent = `Age ${Math.floor(age)}`;
  $('date-month').textContent = MONTHS[frameMonth()];
  $('play-icon').innerHTML = playing ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11L13.5 8z"/>';
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Grow');
  document.querySelectorAll('#speeds button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === speed));
  const end = trackEnd(), span = end - START_STEP;
  const x = s => `${((s - START_STEP) / span) * 100}%`;
  $('head').style.left = x(frame.step);
  const yearPct = (STEPS_PER_YEAR / span) * 100;
  // seasons, one year per tile, starting in March
  $('seasons').style.backgroundImage = `linear-gradient(90deg, #8fb85e 0%, #4f8a3a 17%, #4f8a3a 50%, #c8722c 58%, #b0562a 70%, #55606c 80%, #55606c 100%)`;
  $('seasons').style.backgroundSize = `${yearPct}% 100%`;
  const active = meta?.branches.find(b => b.id === meta.active);
  const reach = active ? active.reach : frame.step;
  $('reach').style.left = x(Math.max(reach, frame.step));
  $('marks').innerHTML = (active ? active.ops.filter(o => o.step >= START_STEP).map(o => `<span class="mark" style="left:${x(o.step)}" title="${o.t}"></span>`).join('') : '')
    + (active && active.parent ? `<span class="mark mark--fork" style="left:${x(active.fork)}" title="Branched here"></span>` : '');
  // ticks on whole ages
  const ageAt = s => s / STEPS_PER_YEAR + START_MONTH / 12;
  const years = span / STEPS_PER_YEAR;
  const every = [1, 2, 5, 10, 20, 25, 50, 100].find(e => years / e <= 12) || 100;
  let ticks = '';
  for (let a = Math.ceil(ageAt(START_STEP) / every) * every; a <= ageAt(end); a += every) {
    ticks += `<span style="left:${x((a - START_MONTH / 12) * STEPS_PER_YEAR)}">${a}</span>`;
  }
  $('ticks').innerHTML = ticks;
  $('track').setAttribute('aria-valuenow', Math.floor(age));
  $('track').setAttribute('aria-valuetext', `Age ${Math.floor(age)}, ${MONTHS[frameMonth()]}`);
  if (meta) {
    const sel = $('branch');
    const opts = meta.branches.map(b => `<option value="${b.id}" ${b.id === meta.active ? 'selected' : ''}>${b.name}${b.parent ? ` · from age ${Math.floor(b.fork / STEPS_PER_YEAR + START_MONTH / 12)}` : ''}</option>`).join('');
    if (sel.dataset.opts !== opts) { sel.innerHTML = opts; sel.dataset.opts = opts; }
    sel.disabled = meta.branches.length < 2;
  }
}
$('branch').addEventListener('change', e => { pause(); send({ type: 'branch', id: +e.target.value }); });

let scrubbing = false;
function scrubTo(e) {
  const r = $('track').getBoundingClientRect();
  const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const step = Math.round(START_STEP + t * (trackEnd() - START_STEP));
  playing = false;
  send({ type: 'goto', step: Math.min(MAX_STEP, step) });
}
$('track').addEventListener('pointerdown', e => { scrubbing = true; $('track').setPointerCapture(e.pointerId); scrubTo(e); });
$('track').addEventListener('pointermove', e => { if (scrubbing) scrubTo(e); });
$('track').addEventListener('pointerup', () => { scrubbing = false; if (frame) send({ type: 'goto', step: frame.step, save: true }); });
$('track').addEventListener('keydown', e => {
  if (!frame) return;
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  stepBy(d * (e.shiftKey ? STEPS_PER_YEAR : 4));
});
function stepBy(n) {
  playing = false;
  send({ type: 'goto', step: Math.max(START_STEP, Math.min(MAX_STEP, frame.step + n)), save: true });
}

/* ---------- keyboard ---------- */
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || setupOpen) return;
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); pause(); send({ type: 'undo' }); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (k === ' ') { e.preventDefault(); playing ? pause() : play(); return; }
  if (e.target.closest('#track')) return;
  const map = { v: 'select', c: 'cut', p: 'pinch', d: 'defoliate', w: 'wire', g: 'guy', j: 'jin' };
  if (map[k]) setTool(map[k]);
  else if (k === 'f') { view = null; frameTree(); renderDisplay(); }
  else if ('1234'.includes(k) && k) setView(['front', 'side', 'back', 'top'][+k - 1]);
  else if (k === 'escape') { if (bending) { bending = null; controls.enabled = true; send({ type: 'goto', step: frame.step }); } setTool('select'); selected = -1; renderInspector(); updateHighlight(); }
  else if (k === 'arrowright') stepBy(e.shiftKey ? STEPS_PER_YEAR : 4);
  else if (k === 'arrowleft') stepBy(-(e.shiftKey ? STEPS_PER_YEAR : 4));
});

/* ---------- camera: framing and presets ---------- */
// keep the tree framed until the viewer moves the camera themselves
let camGoal = null, autoFrame = true, view = null;
controls.addEventListener('start', () => { autoFrame = false; camGoal = null; view = null; renderDisplay(); });
const VIEWS = { front: [0, 0.16, 1], side: [1, 0.16, 0], back: [0, 0.16, -1], top: [0, 1, 0.0001] };
function frameTree(immediate = false, preset = view) {
  if (!frame) return;
  const h = Math.max(0.12, frame.stats.height);
  const potW = pot ? pot.width : 0.3;
  const soil = pot ? pot.soilY : 0.07;
  let spread = 0;
  const tip = frame.info.tip;
  for (let i = 0; i < tip.length; i += 3) spread = Math.max(spread, Math.hypot(tip[i], tip[i + 2]));
  const fovH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dir, target, size;
  if (preset) {
    dir = new THREE.Vector3(...VIEWS[preset]).normalize();
    if (preset === 'top') {
      target = new THREE.Vector3(0, soil + h * 0.5, 0);
      size = Math.max(spread * 2, potW) * 1.15;
    }
  } else {
    dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.05 || dir.y > 0.8) dir.set(0.22, 0.28, 1).normalize();
  }
  // aim a little low: the timeline covers the bottom of the view
  target ||= new THREE.Vector3(0, soil * 0.3 + h * 0.4, 0);
  size ||= Math.max(h + soil, potW * 1.1, spread * 2);
  const dist = size / fovH * 1.55 / Math.min(1, camera.aspect * 0.9) + (preset === 'top' ? h * 0.5 : 0);
  const pos = target.clone().add(dir.multiplyScalar(dist));
  if (immediate) { controls.target.copy(target); camera.position.copy(pos); camGoal = null; }
  else camGoal = { target, pos };
}
function setView(v) {
  view = v;
  autoFrame = false;
  frameTree(false, v);
  renderDisplay();
}
document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

const TONE = { AgX: THREE.AgXToneMapping, ACES: THREE.ACESFilmicToneMapping, Neutral: THREE.NeutralToneMapping };
const help = (c, text) => { c.domElement.insertAdjacentHTML('afterend', `<div class="gui-help">${text}</div>`); return c; };
const deg = r => Math.round(THREE.MathUtils.radToDeg(r));
const dirFrom = (az, el) => {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
};

/* ---------- light: every light in the scene, kept per setting ---------- */
function lightDefaults(id) {
  const s = SETTINGS[id];
  const d = new THREE.Vector3(...s.key.dir).normalize();
  const az = deg(Math.atan2(d.x, d.z));
  return {
    exposure: s.exposure, toneMapping: 'AgX',
    keyOn: true, key: s.key.intensity, keyColor: s.key.color, keyDir: az, keyHeight: deg(Math.asin(d.y)),
    shadows: true, softness: 4, shadowStrength: 1,
    fill: s.fill.intensity, fillColor: s.fill.color, fillDir: ((az + 150 + 540) % 360) - 180, fillHeight: 20,
    rim: s.rim.intensity, rimColor: s.rim.color, rimDir: ((az + 180 + 540) % 360) - 180, rimHeight: 35,
    env: s.env, envRotation: 0, bg: s.bg ?? 1, bgBlur: s.blur ?? 0,
    ao: true, aoStrength: 0.9, aoRadius: 0.06, glow: 1,
  };
}
const light = lightDefaults('studio');
const lightSaved = (() => { try { return JSON.parse(store.get('light')) || {}; } catch { return {}; } })();
function loadLightFor(id) {
  Object.assign(light, lightDefaults(id), lightSaved[id] || {});
  lightGui?.controllersRecursive().forEach(c => c.updateDisplay());
}
function applyLight() {
  const s = SETTINGS[settingId || 'studio'];
  renderer.toneMapping = TONE[light.toneMapping];
  renderer.toneMappingExposure = light.exposure;
  const at = new THREE.Vector3(0, 0.15, 0);
  for (const [l, on, i, c, az, el] of [
    [key, light.keyOn, light.key, light.keyColor, light.keyDir, light.keyHeight],
    [fill, true, light.fill, light.fillColor, light.fillDir, light.fillHeight],
    [rim, true, light.rim, light.rimColor, light.rimDir, light.rimHeight],
  ]) {
    l.visible = on && i > 0;
    l.intensity = i;
    l.color.set(c);
    l.position.copy(dirFrom(az, el)).multiplyScalar(2.2).add(at);
    l.target.position.copy(at);
  }
  key.castShadow = light.shadows;
  key.shadow.radius = light.softness;
  key.shadow.intensity = light.shadowStrength;
  shadowCatcher.material.opacity = 0.45 * light.shadowStrength * (light.shadows ? 1 : 0);
  scene.environmentIntensity = light.env;
  scene.environmentRotation.y = THREE.MathUtils.degToRad(light.envRotation);
  scene.backgroundRotation.y = THREE.MathUtils.degToRad(light.envRotation);
  scene.backgroundIntensity = s.background ? light.bg : 1;
  scene.backgroundBlurriness = s.background ? light.bgBlur : 0;
  gtao.enabled = light.ao && params.get('ao') !== '0';
  gtao.blendIntensity = light.aoStrength;
  gtao.updateGtaoMaterial({ radius: light.aoRadius });
  shared.uTransl.value = light.glow;
}
function saveLight() {
  if (!settingId) return;
  const d = lightDefaults(settingId), diff = {};
  for (const k of Object.keys(d)) if (light[k] !== d[k]) diff[k] = light[k];
  lightSaved[settingId] = diff;
  store.set('light', JSON.stringify(lightSaved));
}

const lightGui = new GUI({ container: $('light'), title: 'Light' });
const fExp = lightGui.addFolder('Exposure');
help(fExp.add(light, 'exposure', 0.3, 3, 0.01).name('Exposure'), 'Overall brightness, before tone mapping.');
help(fExp.add(light, 'toneMapping', Object.keys(TONE)).name('Tone mapping'), 'How highlights roll off. AgX is filmic and gentle, ACES punchier, Neutral the most literal.');
const fKey = lightGui.addFolder('Key light');
help(fKey.add(light, 'keyOn').name('On'), 'The main light, and the only one that casts shadows.');
help(fKey.add(light, 'key', 0, 8, 0.05).name('Intensity'), 'How strong the main light is. It sets the mood more than anything else.');
help(fKey.addColor(light, 'keyColor').name('Colour'), 'Warm for golden hour, cool for overcast or moonlight.');
help(fKey.add(light, 'keyDir', -180, 180, 1).name('Direction (°)'), 'Swings the light round the tree; 0 is from the front. Side light shows bark; back light makes leaves glow.');
help(fKey.add(light, 'keyHeight', 3, 89, 1).name('Height (°)'), 'Low is dramatic, with long shadows; high is flat, like midday.');
help(fKey.add(light, 'shadows').name('Shadows'), 'Shadows from the key light onto the tree, pot and stand.');
help(fKey.add(light, 'softness', 0, 16, 0.5).name('Shadow softness'), 'Blurs shadow edges, as if the light source were larger.');
help(fKey.add(light, 'shadowStrength', 0, 1, 0.01).name('Shadow strength'), 'How dark the shadows are; lower lets the surroundings fill them.');
const fFill = lightGui.addFolder('Fill light');
help(fFill.add(light, 'fill', 0, 4, 0.05).name('Intensity'), 'A soft second light that lifts the shadow side. No shadows of its own.');
help(fFill.addColor(light, 'fillColor').name('Colour'), 'Often a little cooler than the key, like skylight.');
help(fFill.add(light, 'fillDir', -180, 180, 1).name('Direction (°)'), 'Usually opposite the key, to the front.');
help(fFill.add(light, 'fillHeight', 0, 89, 1).name('Height (°)'), 'Low fill opens up the underside of the canopy.');
const fRim = lightGui.addFolder('Rim light');
help(fRim.add(light, 'rim', 0, 6, 0.05).name('Intensity'), 'Light from behind that edges the silhouette and separates it from the background.');
help(fRim.addColor(light, 'rimColor').name('Colour'), 'A warm rim against a cool background reads well.');
help(fRim.add(light, 'rimDir', -180, 180, 1).name('Direction (°)'), '180 is straight behind the tree.');
help(fRim.add(light, 'rimHeight', 0, 89, 1).name('Height (°)'), 'Higher rims catch the top of the canopy.');
const fEnv = lightGui.addFolder('Surroundings');
help(fEnv.add(light, 'env', 0, 3, 0.01).name('Ambient'), 'Light and reflections from the environment all around.');
help(fEnv.add(light, 'envRotation', -180, 180, 1).name('Rotation (°)'), 'Turns the surroundings, moving their bright patches and reflections.');
help(fEnv.add(light, 'bg', 0, 2, 0.01).name('Background brightness'), 'For outdoor settings: how bright the scenery behind is.');
help(fEnv.add(light, 'bgBlur', 0, 1, 0.01).name('Background blur'), 'Softens the scenery, like a long lens at a wide aperture.');
const fAo = lightGui.addFolder('Contact shadows');
help(fAo.add(light, 'ao').name('On'), 'Darkens creases, forks and where the trunk meets the soil.');
help(fAo.add(light, 'aoStrength', 0, 1, 0.01).name('Strength'), 'How dark those creases get.');
help(fAo.add(light, 'aoRadius', 0.01, 0.2, 0.005).name('Reach (m)'), 'How far the darkening spreads from each crease.');
const fGlow = lightGui.addFolder('Leaves');
help(fGlow.add(light, 'glow', 0, 3, 0.05).name('Leaf glow'), 'Light shining through leaves held up to it.');
lightGui.add({ reset() { delete lightSaved[settingId]; store.set('light', JSON.stringify(lightSaved)); loadLightFor(settingId); applyLight(); } }, 'reset').name('Reset to this setting’s light');
lightGui.onChange(() => { applyLight(); saveLight(); });
addVersions(lightGui, { key: 'bonsai-light', params: light, defaults: lightDefaults('studio'), apply: () => { applyLight(); saveLight(); }, camera, controls });
lightGui.folders.forEach(f => f.close());
fKey.open();

/* ---------- look: lens, grade, life ---------- */
const LOOK_DEFAULTS = { focal: 70, dof: true, aperture: 1, vignette: 0.35, grain: 0.03, wind: 1 };
const look = { ...LOOK_DEFAULTS, ...(() => { try { return JSON.parse(store.get('look')) || {}; } catch { return {}; } })() };
function applyLook() {
  dof.enabled = look.dof && params.get('dof') !== '0';
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * look.focal)));
  camera.updateProjectionMatrix();
  grade.uniforms.vignette.value = look.vignette;
  grade.uniforms.grain.value = look.grain;
  shared.uWind.value = look.wind;
  store.set('look', JSON.stringify(Object.fromEntries(Object.keys(LOOK_DEFAULTS).map(k => [k, look[k]]))));
}
const gui = new GUI({ container: $('look'), title: 'Look' });
const fLens = gui.addFolder('Lens');
help(fLens.add(look, 'focal', 24, 135, 1).name('Focal length (mm)'), 'Long lenses flatten and isolate; wide ones exaggerate depth. Portraits usually sit at 70–105.');
help(fLens.add(look, 'dof').name('Depth of field'), 'Focus on the tree and let the background fall away.');
help(fLens.add(look, 'aperture', 0, 3, 0.05).name('Aperture'), 'How shallow the focus is. Higher is a wider aperture, with more blur.');
const fGrade = gui.addFolder('Grade');
help(fGrade.add(look, 'vignette', 0, 1, 0.01).name('Vignette'), 'Darkens the corners to hold the eye on the tree.');
help(fGrade.add(look, 'grain', 0, 0.12, 0.005).name('Grain'), 'A little film grain hides banding in smooth backgrounds.');
const fLife = gui.addFolder('Life');
help(fLife.add(look, 'wind', 0, 3, 0.05).name('Breeze'), 'How much the leaves stir.');
gui.onChange(applyLook);
addVersions(gui, { key: 'bonsai-look', params: look, defaults: LOOK_DEFAULTS, apply: applyLook, camera, controls });

/* ---------- side panel tabs and the display panel ---------- */
function showTab(name) {
  document.querySelectorAll('#side .tabs [role="tab"]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  store.set('tab', name);
}
document.querySelectorAll('#side .tabs [role="tab"]').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
showTab(store.get('tab') || 'tree');

$('place').innerHTML = SETTING_LIST.map(s => `<button class="choice" type="button" data-id="${s.id}" title="${s.note}"><b>${s.name}</b></button>`).join('');
$('containers').innerHTML = POTS.map(p => `<button class="choice" type="button" data-id="${p.id}" title="${p.note}">${potIcon(p, POT_SWATCH[p.id])}<b>${p.name}</b></button>`).join('');
$('stands').innerHTML = STAND_LIST.map(s => `<button class="choice" type="button" data-id="${s.id}"><b>${s.name}</b></button>`).join('');
$('place').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && frame && b.dataset.id !== frame.env.setting) act({ t: 'place', setting: b.dataset.id, light: SETTINGS[b.dataset.id].grow });
});
$('containers').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !frame || b.dataset.id === frame.env.pot) return;
  const p = POT[b.dataset.id];
  act({ t: 'repot', pot: p.id, cap: p.cap, prune: 0 });
});
$('stands').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  store.set('stand', b.dataset.id);
  applyStand(b.dataset.id);
});
function renderDisplay() {
  const pressed = (el, id) => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id || b.dataset.view === id));
  pressed($('place'), frame?.env.setting || settingId);
  pressed($('containers'), frame?.env.pot || potId);
  pressed($('stands'), standId);
  pressed($('views'), view);
}

/* ---------- setup ---------- */
let setupOpen = false;
const setup = {
  species: store.get('species') || 'maple',
  pot: store.get('pot') || 'namako',
  setting: store.get('setting') || 'studio',
  seed: Math.floor(Math.random() * 1e9),
};
if (!SPECIES[setup.species]) setup.species = 'maple';
if (!POT[setup.pot]) setup.pot = 'namako';
if (!SETTINGS[setup.setting]) setup.setting = 'studio';

$('species-list').innerHTML = SPECIES_LIST.map(s => `
  <button class="choice" type="button" data-id="${s.id}"><b>${s.name}</b><i>${s.latin}</i><small>${s.blurb}</small></button>`).join('');
$('pot-list').innerHTML = POTS.map(p => `
  <button class="choice" type="button" data-id="${p.id}">${potIcon(p, POT_SWATCH[p.id])}<b>${p.name}</b><small>${p.note}</small></button>`).join('');
$('setting-list').innerHTML = SETTING_LIST.map(s => `
  <button class="choice" type="button" data-id="${s.id}"><b>${s.name}</b><small>${s.note}</small></button>`).join('');
$('stand-list').innerHTML = STAND_LIST.map(s => `
  <button class="choice" type="button" data-id="${s.id}"><b>${s.name}</b><small>${s.note}</small></button>`).join('');
function renderSetup() {
  for (const [list, key] of [['species-list', 'species'], ['pot-list', 'pot'], ['setting-list', 'setting']]) {
    $(list).querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === setup[key]));
  }
  $('stand-list').querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === standId));
  $('setup-summary').textContent = [SPECIES[setup.species].name, SETTINGS[setup.setting].name, POT[setup.pot].name,
    STANDS[standId]?.name === 'Nothing' ? 'no stand' : STANDS[standId]?.name].filter(Boolean).join(' · ');
}
function showSetupTab(name) {
  document.querySelectorAll('[data-setup-tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.setupTab === name));
  document.querySelectorAll('[data-setup-panel]').forEach(p => { p.hidden = p.dataset.setupPanel !== name; });
}
document.querySelectorAll('[data-setup-tab]').forEach(t => t.addEventListener('click', () => showSetupTab(t.dataset.setupTab)));
$('stand-list').addEventListener('click', e => {
  const b = e.target.closest('.choice');
  if (!b) return;
  store.set('stand', b.dataset.id);
  applyStand(b.dataset.id);
  renderSetup();
});
function plantPreview() {
  store.set('species', setup.species); store.set('pot', setup.pot); store.set('setting', setup.setting);
  applyPot(setup.pot);
  applySetting(setup.setting);
  newTree();
}
function newTree() {
  const p = POT[setup.pot];
  send({ type: 'new', species: setup.species, seed: setup.seed, light: SETTINGS[setup.setting].grow, potCap: p.cap, pot: setup.pot, setting: setup.setting });
}
for (const [list, key] of [['species-list', 'species'], ['pot-list', 'pot'], ['setting-list', 'setting']]) {
  $(list).addEventListener('click', e => {
    const b = e.target.closest('.choice');
    if (!b) return;
    setup[key] = b.dataset.id;
    autoFrame = true;
    plantPreview();
    renderSetup();
  });
}
$('reroll').addEventListener('click', () => { setup.seed = Math.floor(Math.random() * 1e9); newTree(); });
$('begin').addEventListener('click', () => {
  openSetup(false);
  // the worker saved nothing while setup was open; ask for the current state so it's stored
  send({ type: 'goto', step: START_STEP, save: true });
  play();
});
$('new-tree').addEventListener('click', () => {
  if (!confirm('Start a new tree? The current tree and its timelines will be replaced.')) return;
  pause();
  store.del('project');
  setup.seed = Math.floor(Math.random() * 1e9);
  openSetup(true);
  plantPreview();
});
function openSetup(open) {
  setupOpen = open;
  $('setup').hidden = !open;
  for (const id of ['tools', 'side', 'timeline', 'toolhint']) $(id).hidden = open;
  if (open) $('wire-alert').hidden = true;
  $('new-tree').hidden = open;
  if (open) { setTool('select'); renderSetup(); }
}

/* ---------- loop ---------- */
let turnTarget = 0, last = performance.now();
const lightView = new THREE.Vector3();
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const w = innerWidth * renderer.getPixelRatio(), h = innerHeight * renderer.getPixelRatio();
  dof.uniforms.resolution.value.set(w, h);
  grade.uniforms.aspect.value = innerWidth / innerHeight;
}
addEventListener('resize', resize);
resize();

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && frame) {
    clock += dt * SPEEDS[speed].sps;
    const want = Math.min(MAX_STEP, Math.floor(clock));
    if (want > frame.step && !busy) send({ type: 'goto', step: want });
    if (want >= MAX_STEP) pause();
    const lead = Math.max(6, SPEEDS[speed].sps * 0.5);
    if (clock > frame.step + lead) clock = frame.step + lead;      // don't run ahead of a slow build
  }
  turntable.rotation.y += (turnTarget - turntable.rotation.y) * Math.min(1, dt * 4);
  if (camGoal) {
    controls.target.lerp(camGoal.target, Math.min(1, dt * 5));
    camera.position.lerp(camGoal.pos, Math.min(1, dt * 5));
    controls.update();
    if (camera.position.distanceTo(camGoal.pos) < 0.002) camGoal = null;
  }
  controls.update();
  shared.uTime.value = now / 1000;
  snowfall.material.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  $('busy').hidden = !(busy && now - busySince > 400);
  if (frame) {
    const f = ((frame.step / STEPS_PER_YEAR) + START_MONTH / 12) % 1;
    const cold = Math.max(1 - THREE.MathUtils.smoothstep(f, 0.12, 0.24), THREE.MathUtils.smoothstep(f, 0.84, 0.94));
    const want = settingId === 'winter' ? cold : 0;
    shared.uSnow.value += (want - shared.uSnow.value) * Math.min(1, dt * 2);
    snowfall.material.uniforms.uAmount.value = settingId === 'winter' ? 0.25 + 0.75 * cold : 0;
  }
  grade.uniforms.time.value = (now / 1000) % 10;
  lightView.copy(key.position).sub(key.target.position).normalize().transformDirection(camera.matrixWorldInverse);
  shared.uLightView.value.copy(lightView);
  shared.uLightColor.value.copy(key.color).multiplyScalar(key.intensity * 0.35);
  // depth of field focuses on the tree's centre
  dof.uniforms.focus.value = camera.position.distanceTo(controls.target);
  dof.uniforms.aperture.value = 0.0035 * look.aperture * (look.focal / 70);
  dof.uniforms.near.value = camera.near; dof.uniforms.far.value = camera.far;
  composer.render(dt);
  requestAnimationFrame(tick);
}

/* ---------- start ---------- */
await preloadSoil(texLoader);
applyLook();
applyLight();
const saved = (() => { try { return JSON.parse(store.get('project')); } catch { return null; } })();
if (saved && saved.v === 1 && SPECIES[saved.species] && !params.has('species')) {
  openSetup(false);
  applyPot(saved.pot);
  applySetting(saved.setting);
  send({ type: 'load', project: saved });
} else {
  if (params.has('species') && SPECIES[params.get('species')]) setup.species = params.get('species');
  if (params.has('pot') && POT[params.get('pot')]) setup.pot = params.get('pot');
  if (params.has('setting') && SETTINGS[params.get('setting')]) setup.setting = params.get('setting');
  if (params.has('seed')) setup.seed = +params.get('seed');
  openSetup(!params.has('species'));
  plantPreview();
  if (params.has('age')) send({ type: 'goto', step: Math.max(START_STEP, Math.round((+params.get('age') - START_MONTH / 12) * STEPS_PER_YEAR)) });
}
setTool('select');
requestAnimationFrame(tick);

if (params.has('debug')) {
  // test hooks; not part of the page
  window.__bonsai = { get frame() { return frame; }, get queueState() { return { busy, queue: queue.length, latest: latest?.type || null }; }, get meta() { return meta; }, get busy() { return busy || queue.length > 0 || !!latest; },
    act, send, setTool, pick, camera, treeGroup, controls, play, pause, frameTree };
}

if (params.has('portrait')) {
  import('./portrait.js').then(m => {
    window.bonsaiPortrait = {
      async capture(aspect = 'laptop') {
        const shot = await m.capturePortrait({ renderer, scene, camera, composer, aspect: m.ASPECTS[aspect] });
        for (const [name, blob] of [['image', shot.image], ['depth', shot.depth]]) {
          const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `bonsai-${name}.png` });
          a.click();
          URL.revokeObjectURL(a.href);
        }
        return shot;
      },
      prompt: m.portraitPrompt,
    };
  });
}
