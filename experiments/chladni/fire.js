// A flame table: a grid of gas jets drilled through the plate, after the Rubens tube.
// Each flame stands taller where the plate shakes harder beneath it.
import * as THREE from 'three';
import { sample, NUT } from './plate.js';

const J = 27, SPAN = 0.92;

export function createFire({ field, uniforms, amount }) {
  const group = new THREE.Group();
  const jets = [];
  for (let j = 0; j < J; j++) {
    for (let i = 0; i < J; i++) {
      const x = -SPAN + (2 * SPAN * i) / (J - 1), z = -SPAN + (2 * SPAN * j) / (J - 1);
      if (x * x + z * z < (NUT * 1.6) ** 2) continue;
      jets.push([x, z, Math.random()]);
    }
  }
  const n = jets.length;
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setAttribute('aJet', new THREE.InstancedBufferAttribute(new Float32Array(jets.flat()), 3));
  const H = new Float32Array(n).fill(0);
  geo.setAttribute('aH', new THREE.InstancedBufferAttribute(H, 1).setUsage(THREE.DynamicDrawUsage));
  geo.instanceCount = n;

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime },
    vertexShader: /* glsl */`
      attribute vec3 aJet;
      attribute float aH;
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed, vH;
      void main() {
        vec4 base = modelMatrix * vec4(aJet.x, 0.0, aJet.y, 1.0);
        vec3 toCam = cameraPosition - base.xyz; toCam.y = 0.0;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
        float flick = 1.0 + 0.12 * sin(uTime * (11.0 + aJet.z * 7.0) + aJet.z * 40.0) + 0.06 * sin(uTime * 23.0 + aJet.z * 9.0);
        float h = aH * flick;
        float w = 0.05 + 0.08 * clamp(h * 4.0, 0.0, 1.0);
        vec3 world = base.xyz + right * position.x * w + vec3(0.0, 1.0, 0.0) * position.y * h;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        vUv = vec2(position.x, position.y);
        vSeed = aJet.z; vH = h;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed, vH;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.1; a *= 0.5; } return s; }
      void main() {
        float y = vUv.y;
        float n = fbm(vec2(vUv.x * 2.5 + vSeed * 10.0, y * 3.0 - uTime * 3.6 - vSeed * 5.0));
        float x = vUv.x + (n - 0.5) * 0.45 * y;
        float width = 0.5 * pow(max(1.0 - y, 0.0), 0.75) * smoothstep(0.0, 0.1, y + 0.03);
        float d = abs(x) / max(width, 1e-3);
        float body = smoothstep(1.0, 0.25, d) * smoothstep(1.0, 0.5, y + (n - 0.5) * 0.55);
        float core = smoothstep(0.55, 0.0, d) * smoothstep(0.75, 0.05, y);
        vec3 col = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.6, 0.16), core) + vec3(1.0, 0.92, 0.75) * core * core * 0.5;
        float tall = clamp(vH * 6.0, 0.0, 1.0);
        float blue = smoothstep(0.3, 0.0, y) * (1.0 - tall * 0.6);
        col = mix(col, vec3(0.12, 0.3, 1.0), blue * 0.85);
        float k = body * (0.35 + 1.5 * tall);
        gl_FragColor = vec4(col * k * 1.5, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flames = new THREE.Mesh(geo, mat);
  flames.frustumCulled = false;
  flames.renderOrder = 2;
  group.add(flames);

  // The holes in the plate, each with a ring of soot.
  const holes = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uStep: { value: (2 * SPAN) / (J - 1) } },
    vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uStep;
      varying vec2 vP;
      void main() {
        vec2 c = (vP + ${SPAN.toFixed(2)}) / uStep;
        vec2 g = clamp(floor(c + 0.5), 0.0, ${(J - 1).toFixed(1)});
        float d = length(c - g) * uStep;
        float inside = step(dot(vP, vP), ${((NUT * 1.6) ** 2).toFixed(4)});
        float a = (smoothstep(0.009, 0.006, d) * 0.95 + smoothstep(0.04, 0.008, d) * 0.35) * (1.0 - inside);
        gl_FragColor = vec4(0.01, 0.008, 0.006, a);
      }`,
    transparent: true, depthWrite: false,
  }));
  holes.rotation.x = -Math.PI / 2;
  holes.position.y = 0.0006;
  group.add(holes);

  const light = new THREE.PointLight(0xff8a3c, 0, 4, 1.4);
  light.position.set(0, 0.35, 0);
  group.add(light);

  let gas = amount, lit = 0, pourAt = -1;
  const pour = (t) => { pourAt = t; lit = 0; H.fill(0); };
  const setAmount = (k) => { gas = k; };
  let activity = 0;

  const update = ({ t, dt, drive }) => {
    // Relit from the centre outwards.
    const since = pourAt >= 0 ? t - pourAt : 99;
    const a = 1 - Math.exp(-dt / 0.1);
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const [x, z] = jets[k];
      const on = since > Math.hypot(x, z) * 0.9 ? 1 : 0;
      const amp = sample(field.amp, x, z) * drive;
      const target = on * (0.022 + 0.34 * amp * amp + 0.06 * amp) * (0.6 + 0.4 * gas);
      H[k] += (target - H[k]) * a;
      sum += H[k];
    }
    geo.attributes.aH.needsUpdate = true;
    const mean = sum / n;
    light.intensity = 0.15 + mean * 40;
    activity = Math.min(1, mean * 8);
    lit = Math.min(1, since / 1.2);
    return lit;
  };
  const dispose = () => { geo.dispose(); base.dispose(); mat.dispose(); holes.geometry.dispose(); holes.material.dispose(); };
  return { group, update, pour, setAmount, dispose, get activity() { return activity; }, coversPlate: true };
}
