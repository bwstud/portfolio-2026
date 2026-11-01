// A shallow layer of liquid in a tray on the plate. Its surface carries the plate's
// standing wave, slowed down so you can watch it rise and fall: the real one moves
// hundreds of times a second, far too fast to see.
import * as THREE from 'three';

const LOOKS = {
  water: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, ior: 1.33, thickness: 0.03,
    attenuationColor: new THREE.Color(0x1f5f6e), attenuationDistance: 0.04, envMapIntensity: 2.2,
  }),
  mercury: () => new THREE.MeshPhysicalMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.02, envMapIntensity: 1 }),
  ferro: () => new THREE.MeshPhysicalMaterial({
    color: 0x07070a, metalness: 0.55, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4,
  }),
  lava: () => new THREE.MeshPhysicalMaterial({ color: 0x1a0d08, metalness: 0, roughness: 0.75, emissive: 0xffffff }),
};

export function createLiquid({ medium, uniforms, amount }) {
  const group = new THREE.Group();
  const look = medium.look;
  const mat = LOOKS[look]();
  const SEG = look === 'ferro' ? 360 : 260;
  const u = {
    tField: uniforms.tField,
    uTime: uniforms.uTime,
    uPhase: { value: new THREE.Vector2(1, 0) },
    uAmp: { value: medium.height },
    uDrive: { value: 0 },
    uSpike: { value: look === 'ferro' ? 0.045 : 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform sampler2D tField;
        uniform vec2 uPhase;
        uniform float uAmp, uDrive, uSpike;
        #define SEG_N ${SEG.toFixed(1)}
        varying vec3 vLiq;
        varying vec2 vLuv;
        // Ferrofluid spikes: sharp cones on a hexagonal lattice.
        float lattice(vec2 p) {
          const float A = 0.085;
          vec2 r = vec2(1.0, 1.732) * A, h = r * 0.5;
          vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
          float d = min(length(a), length(b));
          return pow(max(0.0, 1.0 - d / (A * 0.46)), 1.7);
        }
        float liqH(vec2 uv) {
          vec4 f = texture2D(tField, vec2(uv.x, 1.0 - uv.y));
          float h = (f.r * uPhase.x + f.g * uPhase.y) * uAmp * uDrive;
          if (uSpike > 0.0) h += uSpike * smoothstep(0.3, 0.85, f.b * uDrive) * lattice(uv * 1.96);
          return h;
        }`)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        float e = 0.7 / SEG_N;
        float h0 = liqH(uv);
        float hx = liqH(uv + vec2(e, 0.0)) - liqH(uv - vec2(e, 0.0));
        float hy = liqH(uv + vec2(0.0, e)) - liqH(uv - vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-hx / (2.0 * e * 1.96), -hy / (2.0 * e * 1.96), 1.0));
        vLiq = vec3(texture2D(tField, vec2(uv.x, 1.0 - uv.y)).b * uDrive, h0, 0.0);
        vLuv = uv;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.z += h0;');
    if (look === 'lava') {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */`#include <common>
          uniform float uTime;
          varying vec3 vLiq;
          varying vec2 vLuv;
          float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
          }
          float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`)
        .replace('#include <emissivemap_fragment>', /* glsl */`
          // A cooling crust with glowing cracks. Shaking breaks it open, and the glow wells up.
          vec2 p = vLuv * 9.0 + vec2(uTime * 0.03, -uTime * 0.02);
          float n = fbm(p + fbm(p * 0.7 + uTime * 0.05) * 1.5);
          float crack = 1.0 - smoothstep(0.0, 0.035 + vLiq.x * 0.08, abs(n - 0.5));
          float open = smoothstep(0.22, 0.8, vLiq.x + (n - 0.5) * 0.3);
          float heat = clamp(crack * (0.5 + vLiq.x) * (1.0 - open * 0.5) + open * 0.85, 0.0, 1.0);
          vec3 glow = mix(vec3(0.7, 0.06, 0.0), vec3(1.0, 0.55, 0.1), heat) * heat * 3.2;
          totalEmissiveRadiance = glow + vec3(0.04, 0.005, 0.0);
          diffuseColor.rgb *= 1.0 - heat * 0.9;`);
    }
  };
  mat.customProgramCacheKey = () => 'liquid-' + look;


  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 1.96, SEG, SEG), mat);
  surface.rotation.x = -Math.PI / 2;
  surface.frustumCulled = false;
  group.add(surface);

  // The tray's rim, in whatever the plate is made of.
  const RIM_H = 0.034, RIM_T = 0.02;
  const rimMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2c30, metalness: 1, roughness: 0.45, envMapIntensity: 0.45 });
  const rim = [];
  for (const [w, d, x, z] of [[2, RIM_T, 0, -1 + RIM_T / 2], [2, RIM_T, 0, 1 - RIM_T / 2], [RIM_T, 2 - 2 * RIM_T, -1 + RIM_T / 2, 0], [RIM_T, 2 - 2 * RIM_T, 1 - RIM_T / 2, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, RIM_H, d), rimMat);
    m.position.set(x, RIM_H / 2, z);
    group.add(m);
    rim.push(m);
  }

  let light = null;
  if (look === 'lava') {
    light = new THREE.PointLight(0xff5a1a, 0, 3, 1.6);
    light.position.set(0, 0.5, 0);
    group.add(light);
  }

  let depth = 0.012 * amount, level = 0, pourAt = -1, phase = 0;
  const pour = (t) => { pourAt = t; level = 0.0005; };
  const setAmount = (k) => { depth = 0.008 + 0.009 * k; };
  setAmount(amount);

  const update = ({ t, dt, drive }) => {
    level += (depth - level) * (1 - Math.exp(-dt / 0.35));
    surface.position.y = level;
    phase += dt * Math.PI * 2 * 1.1;
    u.uPhase.value.set(Math.cos(phase), Math.sin(phase));
    u.uDrive.value = drive * Math.min(1, level / depth);
    if (light) light.intensity = 0.25 + drive * 1.4;
    return 0;
  };
  const dispose = () => { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); mat.dispose(); rimMat.dispose(); };
  return { group, update, pour, setAmount, dispose };
}
