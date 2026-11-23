/* The lighting rig: trusses, the stage, and every fixture, drawn from the frames the show
   engine writes. Beams are instanced cones with a volumetric haze shader; where a beam lands
   it leaves a soft pool of light. Only a handful of real three.js lights exist: they carry the
   average colour of each group onto the architecture, the band and the crowd. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LASER_RAYS } from './show.js';
import { resolve, defaultPlot, measure, trussPoint, trussLength } from './plot.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOISE = /* glsl */`
  float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

/* ---------- the LED screen ---------- */
// One material for every surface that plays the screen's visuals: the LED wall, side screens,
// ribbon boards, a halo screen, or the dome. uv.x runs 0..aspect, uv.y 0..1.
export function makeScreenMaterial() {
  const u = {
    uTime: { value: 0 }, uBeat: { value: 0 }, uMix: { value: 1 },
    uVisA: { value: 1 }, uVisB: { value: 1 }, uLevelA: { value: 0 }, uLevelB: { value: 0 },
    uSpeedA: { value: 8 }, uSpeedB: { value: 8 },
    uPalA: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
    uPalB: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
    uFFT: { value: null }, uLow: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
    uGain: { value: 1.6 }, uFlash: { value: 0 },
  };
  const fft = new THREE.DataTexture(new Uint8Array(64 * 4), 64, 1, THREE.RGBAFormat);
  fft.needsUpdate = true; fft.magFilter = fft.minFilter = THREE.LinearFilter;
  u.uFFT.value = fft;
  const mat = new THREE.ShaderMaterial({
    uniforms: u, toneMapped: false, side: THREE.DoubleSide, fog: false,
    defines: { DOME: 0 },
    vertexShader: /* glsl */`
      attribute float aAsp;
      varying vec2 vUv; varying vec3 vDir; varying float vAsp;
      void main() {
        vUv = uv; vAsp = aAsp > 0.0 ? aAsp : 1.0;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = normalize(wp.xyz - vec3(0.0, 0.0, 30.0));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBeat, uMix, uLevelA, uLevelB, uSpeedA, uSpeedB, uLow, uMid, uHigh, uGain, uFlash;
      uniform int uVisA, uVisB;
      uniform vec3 uPalA[3], uPalB[3];
      uniform sampler2D uFFT;
      varying vec2 vUv; varying vec3 vDir; varying float vAsp;
      ${NOISE}
      float fbm(vec3 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.3 + vnoise(p * 4.1) * 0.2; }
      vec3 pal3(vec3 P[3], float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(P[0], P[1], t) : t < 2.0 ? mix(P[1], P[2], t - 1.0) : mix(P[2], P[0], t - 2.0); }
      vec3 visual(int v, vec2 uv, float asp, vec3 P[3], float sp) {
        float b = uBeat, t = b / sp;
        vec2 c = uv - vec2(asp * 0.5, 0.5);
        float kick = exp(-fract(b) * 4.0);
        if (v == 0) {         // gradient
          float g = uv.y + 0.12 * sin(uv.x * 1.3 + t * 6.283) ;
          vec3 col = mix(P[1], P[0], smoothstep(0.0, 1.0, g));
          col += P[2] * 0.25 * exp(-dot(c, c) * 3.0) * (0.6 + 0.4 * sin(t * 6.283));
          return col * 0.8;
        }
        if (v == 1) {         // waves
          float w = sin(uv.y * 9.0 + sin(uv.x * 2.0 + t * 6.283) * 2.0 - t * 12.566);
          float w2 = sin(uv.y * 23.0 - uv.x * 3.0 + t * 18.85);
          vec3 col = mix(P[0], P[1], 0.5 + 0.5 * w) * (0.35 + 0.65 * smoothstep(0.2, 0.9, w * 0.5 + 0.5));
          return col + P[2] * smoothstep(0.92, 1.0, w2) * 0.6;
        }
        if (v == 2) {         // tunnel
          float r = length(c), a = atan(c.y, c.x);
          float z = 0.35 / max(r, 0.02) + t * 4.0;
          float rings = smoothstep(0.55, 1.0, sin(z * 6.283));
          float spokes = smoothstep(0.7, 1.0, sin(a * 8.0 + t * 3.0));
          vec3 col = pal3(P, z * 0.12) * (rings * 0.9 + spokes * 0.35);
          return col * smoothstep(0.0, 0.25, r) * (0.7 + 0.5 * kick);
        }
        if (v == 3) {         // spectrum, mirrored from the centre
          float x = abs(c.x) / (asp * 0.5);
          float bars = 40.0, i = floor(x * bars);
          float lv = texture2D(uFFT, vec2((i + 0.5) / bars * 0.8, 0.5)).r;
          lv = max(lv, 0.08 + 0.12 * sin(i * 0.7 + b * 1.57) * kick);
          float yy = abs(c.y) * 2.0;
          float gap = step(0.18, fract(x * bars));
          float on = step(yy, lv) * gap * step(0.15, fract(yy * 24.0));
          vec3 col = mix(P[0], P[1], yy) + P[2] * step(lv - 0.03, yy) * step(yy, lv);
          return col * on;
        }
        if (v == 4) {         // grid of tiles flashing on the beat
          vec2 g = floor(vec2(uv.x / asp * 12.0, uv.y * 6.0));
          float h = h31(vec3(g, floor(b * 2.0 / max(0.5, sp / 4.0))));
          vec2 f = fract(vec2(uv.x / asp * 12.0, uv.y * 6.0));
          float tile = step(0.06, f.x) * step(f.x, 0.94) * step(0.08, f.y) * step(f.y, 0.92);
          vec3 col = P[int(mod(h * 7.0, 3.0))];
          return col * tile * step(0.55, h) * (0.5 + 0.7 * kick);
        }
        if (v == 5) {         // rings from the centre on every beat
          float r = length(c);
          float ring = 0.0;
          for (int k = 0; k < 4; k++) {
            float age = fract(b / max(0.5, sp / 8.0) - float(k) * 0.25);
            ring += smoothstep(0.035, 0.0, abs(r - age * 1.1)) * (1.0 - age);
          }
          return pal3(P, r * 0.6 - t * 0.5) * ring * 1.3 + P[1] * 0.06;
        }
        // clouds
        float n = fbm(vec3(uv * vec2(1.6, 2.2), t * 0.6));
        float n2 = fbm(vec3(uv * 4.0 + n, t * 0.3 + 4.0));
        return pal3(P, n * 0.9 + t * 0.05) * smoothstep(0.3, 0.8, n2) * 1.1;
      }
      void main() {
        vec2 uv = vUv; float asp = vAsp;
        #if DOME
          // the dome: wrap azimuth round the room, elevation up the dome
          float az = atan(vDir.x, -vDir.z);
          uv = vec2(az / 3.14159 * 1.6 + 1.6, clamp(vDir.y * 1.05 + 0.15, 0.0, 1.0));
          asp = 3.2;
        #endif
        vec3 col = visual(uVisA, uv, asp, uPalA, uSpeedA) * uLevelA;
        if (uVisA != uVisB || uSpeedA != uSpeedB) col = mix(col, visual(uVisB, uv, asp, uPalB, uSpeedB) * uLevelB, uMix);
        else col = mix(col, visual(uVisB, uv, asp, uPalB, uSpeedB) * uLevelB, uMix);
        // LED pixel pitch, faint, and a lift from the music
        #if !DOME
          vec2 px = fract(vUv * vec2(160.0, 90.0));
          col *= 0.78 + 0.22 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y);
        #endif
        col *= 0.85 + uLow * 0.5;
        col += vec3(uFlash);
        gl_FragColor = vec4(col * uGain, 1.0);
      }`,
  });
  return { mat, u };
}

// a plane whose uv.x runs to its aspect, so the visuals keep their proportions
export function screenPlane(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  return withAspect(g, w / h);
}
// stretch a geometry's uv.x to its aspect and tell the shader what that aspect is
export function withAspect(g, asp) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * asp);
  g.setAttribute('aAsp', new THREE.BufferAttribute(new Float32Array(uv.count).fill(asp), 1));
  return g;
}

/* ---------- beams ---------- */
// near: how far from the camera a beam fades out, so one passing through the lens doesn't fog the frame
function beamMaterial(gain, near = [0.4, 3]) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHaze: { value: 0.6 }, uGain: { value: gain }, uLens: { value: 0.09 }, uNear: { value: new THREE.Vector2(...near) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute vec4 aP;      // level, end radius, length, seed
      uniform float uLens;
      varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying float vZ; varying vec4 vP;
      void main() {
        vec3 p = position;
        float R = max(aP.y, 0.001);
        p.xy *= mix(uLens / R, 1.0, p.z);          // a cone from the lens out to the end radius
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        mat3 im = mat3(instanceMatrix);
        vec3 n = normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
        vN = normalize(mat3(modelMatrix) * im * n);
        vW = wp.xyz; vZ = position.z; vCol = aCol; vP = aP;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uHaze, uGain; uniform vec2 uNear;
      varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying float vZ; varying vec4 vP;
      ${NOISE}
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float edge = pow(abs(dot(V, normalize(vN))), 2.2);
        float d = vZ * vP.z;                        // metres from the lens
        float fall = exp(-d * 0.028) * (0.25 + 0.75 * exp(-d * 0.18)) + 0.06;
        fall *= smoothstep(1.0, 0.9, vZ);
        float hz = vnoise(vW * 0.35 + vec3(uTime * 0.05, -uTime * 0.11, uTime * 0.03));
        hz = hz * 0.65 + vnoise(vW * 1.1 - vec3(0.0, uTime * 0.2, 0.0)) * 0.35;
        float haze = (0.12 + 0.88 * uHaze) * (0.45 + 0.85 * hz);
        float nearCam = smoothstep(uNear.x, uNear.y, distance(cameraPosition, vW));
        float a = vP.x * edge * fall * haze * nearCam * uGain;
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
  });
}

function poolMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: /* glsl */`
      attribute vec3 aCol; varying vec3 vCol; varying vec2 vUv;
      void main() { vCol = aCol; vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec2 vUv;
      void main() { float r = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a = a * a * (0.6 + 0.4 * smoothstep(1.0, 0.6, r)); gl_FragColor = vec4(vCol * a, 1.0); }`,
  });
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// one metre of box truss along +x: four chords and zigzag lacing
function trussSegment(s = 0.4) {
  const parts = [];
  const bar = (a, b, r = 0.025) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r, r, len, 5, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    parts.push(g);
  };
  const h = s / 2;
  for (const [y, z] of [[h, h], [h, -h], [-h, h], [-h, -h]]) bar([0, y, z], [1, y, z], 0.026);
  for (const [y0, z0, y1, z1] of [[h, h, -h, h], [h, -h, -h, -h], [h, h, h, -h], [-h, h, -h, -h]]) bar([0, y0, z0], [0.5, y1, z1], 0.012), bar([0.5, y1, z1], [1, y0, z0], 0.012);
  return mergeGeometries(parts);
}

/* ---------- the rig ---------- */
export function buildRig(venue, def, screenMat, plot = null) {
  const g = new THREE.Group();
  const { w: W, d: D, h: H } = def.stage;
  const top = H + def.rig.h;
  const big = W > 40;
  const beams = [], washes = [], lasers = [], strobes = [], pixels = [];

  // deck, skirt and a drum riser
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.55, metalness: 0.1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), deckMat);
  deck.position.set(0, H / 2, -D / 2); deck.receiveShadow = true; g.add(deck);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x222226 }));
  lip.position.set(0, H, 0); g.add(lip);
  const riser = new THREE.Mesh(new THREE.BoxGeometry(Math.min(6, W * 0.3), 0.6, Math.min(4, D * 0.3)), deckMat);
  riser.position.set(0, H + 0.3, -D * 0.62); g.add(riser);

  // the band: simple silhouettes, a drum kit, amps and wedges
  const figMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.7 });
  const person = (() => {
    const body = new THREE.CapsuleGeometry(0.22, 0.9, 4, 10); body.translate(0, 0.75, 0);
    const head = new THREE.SphereGeometry(0.14, 12, 10); head.translate(0, 1.55, 0);
    return mergeGeometries([body, head]);
  })();
  const bandAt = [[-W * 0.22, -D * 0.3], [W * 0.22, -D * 0.32], [0, -D * 0.2], [-W * 0.08, -D * 0.38], [0, -D * 0.6 + 0.0]];
  bandAt.forEach(([x, z], i) => {
    const p = new THREE.Mesh(person, figMat);
    p.position.set(x, H + (i === 4 ? 0.6 : 0), z); p.rotation.y = (Math.random() - 0.5) * 0.4;
    if (i === 4) p.scale.setScalar(0.85);
    g.add(p);
  });
  const kit = new THREE.Group();
  for (const [x, z, r, h] of [[0, 0.5, 0.32, 0.45], [-0.6, 0.2, 0.22, 0.6], [0.6, 0.2, 0.24, 0.55], [-0.9, -0.1, 0.3, 1.1], [0.9, -0.2, 0.3, 1.2]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.3 }));
    c.position.set(x, h, z); kit.add(c);
  }
  kit.position.set(0, H + 0.6, -D * 0.6 + 0.6); g.add(kit);
  for (const x of [-W * 0.32, -W * 0.27, W * 0.27, W * 0.32]) {
    const amp = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.3, 0.4), figMat);
    amp.position.set(x, H + 0.65, -D * 0.55); g.add(amp);
  }

  // trusses, then the fixtures hung on them, from the rig plot
  const R0 = resolve(plot || defaultPlot(def), def), m = measure(def);
  beams.push(...R0.beams); washes.push(...R0.washes); lasers.push(...R0.lasers); strobes.push(...R0.strobes); pixels.push(...R0.pixels);
  const seg = trussSegment(big ? 0.6 : 0.4);
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.85, roughness: 0.35 });
  const pieces = [], pa = [0, 0, 0], pb = [0, 0, 0];
  for (const tr of (plot || defaultPlot(def)).trusses) {
    if (tr.kind === 'floor') continue;
    const len = trussLength(tr, m), n = Math.max(1, Math.ceil(len));
    for (let k = 0; k < n; k++) { trussPoint(tr, k / n, m, pa); trussPoint(tr, (k + 1) / n, m, pb); pieces.push([pa.slice(), pb.slice()]); }
  }
  const trusses = new THREE.InstancedMesh(seg, trussMat, Math.max(1, pieces.length));
  trusses.count = pieces.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), X = new THREE.Vector3(1, 0, 0), d3 = new THREE.Vector3();
  pieces.forEach(([a, b], i) => {
    d3.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const l = d3.length(); d3.divideScalar(l || 1);
    m4.compose(v3.fromArray(a), q.setFromUnitVectors(X, d3), new THREE.Vector3(l, 1, 1));
    trusses.setMatrixAt(i, m4);
  });
  q.identity();
  g.add(trusses);
  const cell = big ? 0.6 : 0.35;

  // the LED wall, unless the room itself is the screen
  const screens = [];
  if (!def.screen.dome && !def.screen.skyline) {
    const { w: sw, h: sh, y: sy } = def.screen;
    const wall = new THREE.Mesh(screenPlane(sw, sh), screenMat);
    wall.position.set(0, H + sy, -D + 0.55); g.add(wall); screens.push(wall);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, sh + 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.6 }));
    frame.position.set(0, H + sy, -D + 0.42); g.add(frame);
    if (def.screen.sides) for (const s of [-1, 1]) {
      const side = new THREE.Mesh(screenPlane(8, 4.5), screenMat);
      side.position.set(s * (W / 2 + 7), H + 6.5, -2); side.rotation.y = -s * 0.25; g.add(side); screens.push(side);
    }
  }

  /* --- the drawable fixtures --- */
  const maxLen = big ? 220 : W > 20 ? 110 : 60;
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  cyl.translate(0, 0.5, 0); cyl.rotateX(Math.PI / 2);
  // every mesh keeps at least one slot, so an empty group still makes valid buffers
  const N = n => Math.max(1, n);
  const mkBeams = (n, gain, near) => {
    const geo = cyl.clone();
    const mesh = new THREE.InstancedMesh(geo, beamMaterial(gain, near), N(n));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(N(n) * 3), 3));
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(N(n) * 4), 4));
    mesh.count = n; mesh.frustumCulled = false; mesh.renderOrder = 5;
    return mesh;
  };
  const beamMesh = mkBeams(beams.length, 0.3, [0.6, 4]), washMesh = mkBeams(washes.length, 0.035, [3, 14]);
  g.add(beamMesh, washMesh);
  const pool = new THREE.CircleGeometry(0.5, 32); pool.rotateX(-Math.PI / 2);
  const poolGeo = pool.clone();
  const nPools = beams.length + washes.length;
  const pools = new THREE.InstancedMesh(poolGeo, poolMaterial(), N(nPools));
  poolGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(N(nPools) * 3), 3));
  pools.count = nPools; pools.frustumCulled = false; pools.renderOrder = 4; g.add(pools);
  // fixture heads and their lens glow
  const headGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.42, 14); headGeo.rotateX(Math.PI / 2); headGeo.translate(0, 0, -0.1);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x1b1c20, metalness: 0.6, roughness: 0.45 }), N(nPools));
  heads.count = nPools; g.add(heads);
  const glowN = N(beams.length + washes.length + lasers.length);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowN * 3), 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(glowN * 3), 3));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ size: big ? 1.6 : 0.9, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  glow.frustumCulled = false; glow.renderOrder = 6; g.add(glow);
  // lasers
  const laserGeo = new THREE.BufferGeometry();
  laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N(lasers.length) * LASER_RAYS * 6), 3));
  laserGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N(lasers.length) * LASER_RAYS * 6), 3));
  const laserLines = new THREE.LineSegments(laserGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  laserLines.frustumCulled = false; laserLines.renderOrder = 7; g.add(laserLines);
  // strobes and pixels
  const strobeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(big ? 1.2 : 0.55, big ? 0.6 : 0.32, 0.12), new THREE.MeshBasicMaterial({ toneMapped: false }), N(strobes.length));
  strobeMesh.setColorAt(0, new THREE.Color(0, 0, 0)); strobeMesh.count = strobes.length;
  strobes.forEach((s, i) => { m4.makeTranslation(...s.pos); strobeMesh.setMatrixAt(i, m4); strobeMesh.setColorAt(i, new THREE.Color(0.02, 0.02, 0.02)); });
  g.add(strobeMesh);
  // pixel cells are a box along +x, turned to follow their strip
  const pxGeo = new THREE.BoxGeometry(1, big ? 0.12 : 0.07, big ? 0.12 : 0.07);
  const pxMesh = new THREE.InstancedMesh(pxGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), N(pixels.length));
  pxMesh.setColorAt(0, new THREE.Color(0, 0, 0)); pxMesh.count = pixels.length;
  pixels.forEach((p, i) => { m4.compose(v3.fromArray(p.pos), q.setFromUnitVectors(X, d3.fromArray(p.dir)), new THREE.Vector3(p.cell * 0.82, 1, 1)); pxMesh.setMatrixAt(i, m4); pxMesh.setColorAt(i, new THREE.Color(0, 0, 0)); });
  q.identity();
  g.add(pxMesh);

  // real lights: a wash key, a back light for the band, a crowd light, the screen's spill, strobe
  const key = [], keyTarget = new THREE.Object3D(); keyTarget.position.set(0, H + 1, -D * 0.4); g.add(keyTarget);
  for (const x of [-W * 0.3, 0, W * 0.3]) {
    const s = new THREE.SpotLight(0xffffff, 0, 0, 0.75, 0.6, 2); s.position.set(x, top - 0.5, 6); s.target = keyTarget; key.push(s); g.add(s);
  }
  const back = new THREE.SpotLight(0xffffff, 0, 0, 0.9, 0.5, 2); back.position.set(0, top, -D * 0.9); back.target = keyTarget; g.add(back);
  const crowdTarget = new THREE.Object3D(); crowdTarget.position.set(0, 0, venue.crowd.mid); g.add(crowdTarget);
  const crowdLight = new THREE.SpotLight(0xffffff, 0, 0, 0.9, 0.7, 2); crowdLight.position.set(0, top, -1); crowdLight.target = crowdTarget; g.add(crowdLight);
  const spill = new THREE.PointLight(0xffffff, 0, 0, 2); spill.position.set(0, H + (def.screen.y || 6), -D + 3); g.add(spill);
  const strobeLight = new THREE.PointLight(0xffffff, 0, 0, 2); strobeLight.position.set(0, top - 1, 2); g.add(strobeLight);

  const S = big ? 3.4 : W > 20 ? 1.6 : 1;    // big rooms need more light to read
  const tmpQ = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const c3 = new THREE.Color();

  // march a ray until it meets the floor, the stage or the stands
  function hit(p, d, max) {
    let t = 0, step = 0.6;
    for (let k = 0; k < 160 && t < max; k++) {
      t += step; step = Math.min(step * 1.12, 4);
      const x = p[0] + d.x * t, y = p[1] + d.y * t, z = p[2] + d.z * t;
      if (y <= venue.groundAt(x, z)) {
        // refine
        let a = t - step, b = t;
        for (let r = 0; r < 6; r++) { const m = (a + b) / 2; if (p[1] + d.y * m <= venue.groundAt(p[0] + d.x * m, p[2] + d.z * m)) b = m; else a = m; }
        return b;
      }
    }
    return -1;
  }

  function update(frame, { time, beat, master = 1, flash = 0 }) {
    const haze = frame.haze;
    beamMesh.material.uniforms.uTime.value = washMesh.material.uniforms.uTime.value = time;
    beamMesh.material.uniforms.uHaze.value = washMesh.material.uniforms.uHaze.value = haze;
    const bc = beamMesh.geometry.attributes.aCol.array, bp = beamMesh.geometry.attributes.aP.array;
    const pc = pools.geometry.attributes.aCol.array, gp = glowGeo.attributes.position.array, gc = glowGeo.attributes.color.array;
    let avgB = [0, 0, 0], avgBc = [0, 0, 0], beamSum = 0;
    const F = frame.beams;
    for (let i = 0; i < beams.length; i++) {
      const o = i * 8, fx = beams[i];
      dir.set(F[o], F[o + 1], F[o + 2]);
      // heads on the floor can't point down through the deck
      if (fx.floor && dir.y < 0.05) { dir.y = 0.05; dir.normalize(); }
      const lv = Math.max(0, F[o + 6]) * master, half = THREE.MathUtils.lerp(0.012, 0.2, F[o + 7]);
      const h = lv > 0.002 ? hit(fx.pos, dir, maxLen) : -1, L = h > 0 ? h : maxLen, R = L * Math.tan(half);
      tmpQ.setFromUnitVectors(Z, dir);
      m4.compose(pos.fromArray(fx.pos), tmpQ, sc.set(R, R, L)); beamMesh.setMatrixAt(i, m4);
      m4.compose(pos, tmpQ, one); heads.setMatrixAt(i, m4);
      // narrow beams are brighter per area than wide ones
      const k = lv * (1.25 - F[o + 7] * 0.7);
      bc[i * 3] = F[o + 3] * k; bc[i * 3 + 1] = F[o + 4] * k; bc[i * 3 + 2] = F[o + 5] * k;
      bp[i * 4] = 1; bp[i * 4 + 1] = R; bp[i * 4 + 2] = L; bp[i * 4 + 3] = i;
      // a pool where it lands
      if (h > 0) {
        // a glancing beam spreads its light over a longer, dimmer pool
        const inc = clamp(-dir.y, 0.15, 1), r = Math.min(big ? 9 : 5, Math.max(0.5, R * 1.8) / Math.max(0.45, inc + 0.25));
        m4.compose(pos.set(fx.pos[0] + dir.x * h, fx.pos[1] + dir.y * h + 0.04, fx.pos[2] + dir.z * h), q.identity(), sc.set(r, 1, r));
        const pk = lv * 0.32 * inc / (1 + r * 0.35);
        pc[i * 3] = F[o + 3] * pk; pc[i * 3 + 1] = F[o + 4] * pk; pc[i * 3 + 2] = F[o + 5] * pk;
      } else { m4.makeScale(0, 0, 0); pc[i * 3] = pc[i * 3 + 1] = pc[i * 3 + 2] = 0; }
      pools.setMatrixAt(i, m4);
      gp[i * 3] = fx.pos[0] + dir.x * 0.12; gp[i * 3 + 1] = fx.pos[1] + dir.y * 0.12; gp[i * 3 + 2] = fx.pos[2] + dir.z * 0.12;
      gc[i * 3] = F[o + 3] * lv * 1.6; gc[i * 3 + 1] = F[o + 4] * lv * 1.6; gc[i * 3 + 2] = F[o + 5] * lv * 1.6;
      const toCrowd = dir.z > 0.3 && dir.y < 0 ? 1 : 0;
      for (let c = 0; c < 3; c++) { avgB[c] += F[o + 3 + c] * lv * (1 - toCrowd); avgBc[c] += F[o + 3 + c] * lv * toCrowd; }
      beamSum += lv;
    }
    // washes
    const Wf = frame.washes, off = beams.length;
    let avgW = [0, 0, 0], avgWc = [0, 0, 0];
    for (let i = 0; i < washes.length; i++) {
      const o = i * 5, fx = washes[i], lv = Math.max(0, Wf[o + 3]) * master, crowd = Wf[o + 4] > 0.5;
      const tx = fx.side * (crowd ? venue.crowd.w * 0.8 : W * 0.8);
      const tz = crowd ? venue.crowd.mid * 0.7 : -D * 0.45, ty = crowd ? 1 : H;
      dir.set(tx - fx.pos[0], ty - fx.pos[1], tz - fx.pos[2]).normalize();
      if (fx.floor) dir.set(tx * 0.3 - fx.pos[0] * 0.3, 1.2, crowd ? 1.5 : -0.6).normalize();
      const h = lv > 0.002 ? hit(fx.pos, dir, maxLen) : -1, L = h > 0 ? h : maxLen * 0.5, R = L * Math.tan(0.36);
      tmpQ.setFromUnitVectors(Z, dir);
      m4.compose(pos.fromArray(fx.pos), tmpQ, sc.set(R, R, L)); washMesh.setMatrixAt(i, m4);
      m4.compose(pos, tmpQ, one); heads.setMatrixAt(off + i, m4);
      const wa = washMesh.geometry.attributes;
      wa.aCol.array[i * 3] = Wf[o] * lv; wa.aCol.array[i * 3 + 1] = Wf[o + 1] * lv; wa.aCol.array[i * 3 + 2] = Wf[o + 2] * lv;
      wa.aP.array[i * 4] = 1; wa.aP.array[i * 4 + 1] = R; wa.aP.array[i * 4 + 2] = L; wa.aP.array[i * 4 + 3] = i;
      if (h > 0) {
        const r = Math.min(big ? 14 : 8, Math.max(2, R * 2.4));
        m4.compose(pos.set(fx.pos[0] + dir.x * h, fx.pos[1] + dir.y * h + 0.05, fx.pos[2] + dir.z * h), q.identity(), sc.set(r, 1, r));
        const pk = lv * 0.1;
        pc[(off + i) * 3] = Wf[o] * pk; pc[(off + i) * 3 + 1] = Wf[o + 1] * pk; pc[(off + i) * 3 + 2] = Wf[o + 2] * pk;
      } else { m4.makeScale(0, 0, 0); pc[(off + i) * 3] = pc[(off + i) * 3 + 1] = pc[(off + i) * 3 + 2] = 0; }
      pools.setMatrixAt(off + i, m4);
      gp[(off + i) * 3] = fx.pos[0]; gp[(off + i) * 3 + 1] = fx.pos[1]; gp[(off + i) * 3 + 2] = fx.pos[2];
      gc[(off + i) * 3] = Wf[o] * lv * 0.9; gc[(off + i) * 3 + 1] = Wf[o + 1] * lv * 0.9; gc[(off + i) * 3 + 2] = Wf[o + 2] * lv * 0.9;
      for (let c = 0; c < 3; c++) (crowd ? avgWc : avgW)[c] += Wf[o + c] * lv;
    }
    washMesh.instanceMatrix.needsUpdate = true; washMesh.geometry.attributes.aCol.needsUpdate = washMesh.geometry.attributes.aP.needsUpdate = true;
    beamMesh.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = pools.instanceMatrix.needsUpdate = true;
    beamMesh.geometry.attributes.aCol.needsUpdate = beamMesh.geometry.attributes.aP.needsUpdate = pools.geometry.attributes.aCol.needsUpdate = true;
    // lasers
    const Lf = frame.lasers, stride = LASER_RAYS * 2 + 5, lp = laserGeo.attributes.position.array, lc = laserGeo.attributes.color.array;
    const goff = beams.length + washes.length;
    for (let i = 0; i < lasers.length; i++) {
      const o = i * stride, fx = lasers[i], lv = Math.max(0, Lf[o + 3]) * master * (0.3 + 0.7 * haze), rays = Lf[o + 4];
      for (let k = 0; k < LASER_RAYS; k++) {
        const yaw = Lf[o + 5 + k * 2], pitch = Lf[o + 6 + k * 2], on = k < rays - 0.01 ? lv : 0;
        dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const h = on > 0.002 ? hit(fx.pos, dir, maxLen * 1.5) : -1, L = h > 0 ? h : maxLen * 1.5;
        const v = (i * LASER_RAYS + k) * 6;
        lp[v] = fx.pos[0]; lp[v + 1] = fx.pos[1]; lp[v + 2] = fx.pos[2];
        lp[v + 3] = fx.pos[0] + dir.x * L; lp[v + 4] = fx.pos[1] + dir.y * L; lp[v + 5] = fx.pos[2] + dir.z * L;
        const kk = on * 3.2;
        lc[v] = Lf[o] * kk; lc[v + 1] = Lf[o + 1] * kk; lc[v + 2] = Lf[o + 2] * kk;
        lc[v + 3] = Lf[o] * kk * 0.25; lc[v + 4] = Lf[o + 1] * kk * 0.25; lc[v + 5] = Lf[o + 2] * kk * 0.25;
      }
      gp[(goff + i) * 3] = fx.pos[0]; gp[(goff + i) * 3 + 1] = fx.pos[1]; gp[(goff + i) * 3 + 2] = fx.pos[2];
      gc[(goff + i) * 3] = Lf[o] * lv * 2; gc[(goff + i) * 3 + 1] = Lf[o + 1] * lv * 2; gc[(goff + i) * 3 + 2] = Lf[o + 2] * lv * 2;
    }
    laserGeo.attributes.position.needsUpdate = laserGeo.attributes.color.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = glowGeo.attributes.color.needsUpdate = true;
    // strobes
    let strobeMax = flash;
    for (let i = 0; i < strobes.length; i++) {
      const e = Math.min(1, frame.strobes[i] * master + flash);
      strobeMax = Math.max(strobeMax, e);
      strobeMesh.setColorAt(i, c3.setRGB(0.02 + e * 6, 0.02 + e * 6, 0.02 + e * 5.6));
    }
    strobeMesh.instanceColor.needsUpdate = true;
    // pixels
    const P = frame.pixels;
    for (let i = 0; i < pixels.length; i++) pxMesh.setColorAt(i, c3.setRGB(P[i * 3] * 2.6 * master, P[i * 3 + 1] * 2.6 * master, P[i * 3 + 2] * 2.6 * master));
    pxMesh.instanceColor.needsUpdate = true;
    // the real lights carry the averages onto the room
    const nb = Math.max(1, beams.length), nwc = Math.max(1, washes.length);
    const setL = (light, rgb, n, lux, dist) => {
      const m = Math.max(rgb[0], rgb[1], rgb[2]);
      if (m < 1e-4) { light.intensity = 0; return; }
      light.color.setRGB(rgb[0] / m, rgb[1] / m, rgb[2] / m);
      light.intensity = m / n * lux * dist * dist;
    };
    for (const s of key) setL(s, avgW, nwc / 2, 14 * S, 9 + D * 0.4);
    setL(back, avgB, nb / 3, 10 * S, def.rig.h);
    setL(crowdLight, [avgBc[0] + avgWc[0] * 2, avgBc[1] + avgWc[1] * 2, avgBc[2] + avgWc[2] * 2], nb / 3, 4 * S, venue.crowd.mid);
    strobeLight.intensity = strobeMax * 40 * S * S * 8;
    return { avgW, avgB, beamSum, strobeMax, n: nwc };
  }

  function setScreenSpill(rgb, level) {
    const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
    spill.color.setRGB(rgb[0] / m, rgb[1] / m, rgb[2] / m);
    spill.intensity = level * m * 10 * S * (def.screen.w || 12);
  }

  return { group: g, beams, washes, lasers, strobes, pixels, update, setScreenSpill, screens, stageTop: H, rigTop: top, bandAt };
}
