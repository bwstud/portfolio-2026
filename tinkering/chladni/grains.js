// Loose grains drawn as points: one shader, with a style per material.
// Each grain is a small sprite shaded as a sphere, cube, needle or flake.
import * as THREE from 'three';

const PIGMENTS = [[0.82, 0.03, 0.2], [1.0, 0.33, 0.02], [0.03, 0.25, 0.88], [0.18, 0.62, 0.06]];

export function createGrains({ medium, sand, uniforms }) {
  const n = sand.count;
  const group = new THREE.Group();
  const pos = new Float32Array(n * 3);
  const state = new Float32Array(n * 3);        // hop, heat, angle
  const seed = new Float32Array(n), lift = new Float32Array(n), tint = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i] = Math.random(); lift[i] = Math.random(); }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aState', new THREE.BufferAttribute(state, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));

  const mat = new THREE.ShaderMaterial({
    defines: { STYLE: medium.style },
    uniforms: {
      uSize: { value: medium.size },
      uScale: uniforms.uScale,
      uAspect: uniforms.uAspect,
      uLight: uniforms.uLight,
      uView: uniforms.uView,
      uTime: uniforms.uTime,
      uBack: uniforms.uBack,
    },
    vertexShader: /* glsl */`
      attribute float seed;
      attribute vec3 aState, aTint;
      uniform float uSize, uScale, uAspect;
      varying float vSeed, vHop, vHeat, vAng;
      varying vec3 vTint;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = uSize * (0.7 + 0.6 * fract(seed * 7.13));
        gl_PointSize = max(1.6, s * uScale / -mv.z);
        vSeed = seed; vHop = aState.x; vHeat = aState.y; vTint = aTint;
        #if STYLE == 2
          // Which way the needle points on screen.
          vec3 d = vec3(cos(aState.z), 0.0, sin(aState.z)) * 0.01;
          vec4 p1 = projectionMatrix * modelViewMatrix * vec4(position + d, 1.0);
          vec2 sd = (p1.xy / p1.w - gl_Position.xy / gl_Position.w) * vec2(uAspect, 1.0);
          vAng = atan(sd.y, sd.x);
        #else
          vAng = aState.z;
        #endif
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uView;
      uniform float uTime, uBack;
      varying float vSeed, vHop, vHeat, vAng;
      varying vec3 vTint;
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        c.y = -c.y;
        float r2 = dot(c, c);
        float alpha = smoothstep(1.0, 0.72, r2);
        vec3 col;
        #if STYLE == 1
          // salt: a small cube, flat faces, and a glint that comes and goes as you orbit
          vec2 q = rot(c, vSeed * 6.283);
          float m = max(abs(q.x), abs(q.y));
          if (m > 0.74) discard;
          alpha = smoothstep(0.74, 0.62, m);
          vec3 nrm = normalize(vec3(sign(q.x) * step(abs(q.y), abs(q.x)), sign(q.y) * step(abs(q.x), abs(q.y)), 1.6));
          float l = max(dot(nrm, uLight), 0.0);
          float glint = pow(max(0.0, sin(vSeed * 211.0 + dot(uView, vec3(9.0, 4.0, 7.0)))), 60.0);
          col = vec3(0.72, 0.75, 0.78) * (0.22 + 1.1 * l) + glint * 7.0;
        #elif STYLE == 2
          // iron filings: dark needles with a bright edge along their length
          vec2 q = rot(c, -vAng);
          float e = q.x * q.x + q.y * q.y * 18.0;
          if (e > 1.0) discard;
          alpha = smoothstep(1.0, 0.6, e);
          vec3 nrm = normalize(vec3(0.0, q.y * 4.2, sqrt(max(0.0, 1.0 - q.y * q.y * 18.0))));
          float l = max(dot(nrm, uLight), 0.0);
          float spec = pow(max(dot(reflect(-uLight, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
          col = vec3(0.05, 0.05, 0.055) * (0.4 + l) + spec * 0.6;
        #elif STYLE == 3
          // glitter: a flat holographic flake that flashes as it turns
          if (r2 > 1.0) discard;
          float tilt = vSeed * 80.0 + dot(uView, vec3(11.0, 5.0, 9.0)) + vHop * 30.0;
          float flash = pow(max(0.0, sin(tilt)), 22.0);
          float hue = fract(vSeed * 3.7 + dot(uView, vec3(0.6, 0.3, 0.5)) + vHop * 0.4);
          vec3 h = 0.5 + 0.5 * cos(6.283 * (hue + vec3(0.0, 0.33, 0.67)));
          col = mix(vec3(0.5), h, 0.55) * (0.16 + 0.3 * max(uLight.z, 0.0)) + h * flash * 5.0;
        #else
          if (r2 > 1.0) discard;
          vec3 nrm = vec3(c, sqrt(1.0 - r2));
          float l = max(dot(nrm, uLight), 0.0);
          #if STYLE == 4
            // pigment: matte powder in four colours
            col = vTint * (0.18 + 0.95 * l);
          #elif STYLE == 5
            // glow powder: dull until it's thrown, then it lights up and slowly fades
            float g = vHeat;
            col = vec3(0.16, 0.2, 0.17) * (0.3 + l) + vec3(0.25, 1.0, 0.55) * (0.14 + g * g * 3.2 + g * 0.5) * (1.0 - r2 * 0.6);
          #elif STYLE == 6
            // embers: coals that flare as they hop and dim as they settle
            float flick = 0.75 + 0.25 * sin(uTime * (3.0 + vSeed * 4.0) + vSeed * 40.0);
            float g = 0.18 * flick + vHeat * 1.4 + vHop * 1.2;
            vec3 hot = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.55, 0.12), clamp(g * 0.7, 0.0, 1.0));
            col = vec3(0.02, 0.012, 0.01) * (0.3 + l) + hot * g * 2.4 * (1.0 - r2 * 0.7);
          #else
            // sand: pale quartz with some darker grains mixed in
            vec3 base = mix(vec3(0.42, 0.31, 0.19), vec3(0.78, 0.66, 0.48), vSeed);
            if (fract(vSeed * 13.7) < 0.1) base *= 0.42;
            float spec = pow(max(dot(reflect(-uLight, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.25;
            col = base * (0.16 + 1.35 * l) + spec;
          #endif
        #endif
        // On the light table a grain is lit from behind: a silhouette.
        #if STYLE < 5
          col = mix(col, col * 0.12, uBack);
        #endif
        gl_FragColor = vec4(col, alpha);
      }`,
    alphaToCoverage: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // Embers throw sparks off the grains that are hopping hardest.
  let sparks = null;
  if (medium.style === 6) {
    const S = 260;
    const sp = new Float32Array(S * 3), sv = new Float32Array(S * 3), life = new Float32Array(S);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('life', new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
    const sm = new THREE.ShaderMaterial({
      uniforms: { uScale: uniforms.uScale },
      vertexShader: `attribute float life; uniform float uScale; varying float vL; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vL = life; gl_PointSize = life > 0.0 ? max(1.0, 0.006 * uScale / -mv.z) : 0.0; }`,
      fragmentShader: `varying float vL; void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.8, 0.35), vL) * 3.0 * vL * smoothstep(0.5, 0.0, r), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(sg, sm);
    pts.frustumCulled = false;
    group.add(pts);
    let cursor = 0;
    sparks = (dt) => {
      for (let tries = 0; tries < 40; tries++) {
        const i = (Math.random() * n) | 0;
        if (sand.hop[i] < 0.55 || Math.random() > 0.3) continue;
        const k = cursor++ % S;
        sp.set([sand.x[i], 0.01, sand.y[i]], k * 3);
        sv.set([(Math.random() - 0.5) * 0.25, 0.35 + Math.random() * 0.6, (Math.random() - 0.5) * 0.25], k * 3);
        life[k] = 1;
      }
      for (let k = 0; k < S; k++) {
        if (life[k] <= 0) continue;
        life[k] -= dt * (0.9 + (k % 7) * 0.12);
        sv[k * 3 + 1] -= dt * 0.25;
        sp[k * 3] += sv[k * 3] * dt; sp[k * 3 + 1] += sv[k * 3 + 1] * dt; sp[k * 3 + 2] += sv[k * 3 + 2] * dt;
      }
      sg.attributes.position.needsUpdate = true;
      sg.attributes.life.needsUpdate = true;
    };
  }

  // Poured in: each grain falls from above at its own moment.
  let pourAt = -1;
  const pour = (t) => {
    pourAt = t;
    for (let i = 0; i < n; i++) {
      const q = (sand.x[i] > 0 ? 1 : 0) + (sand.y[i] > 0 ? 2 : 0);
      tint.set(PIGMENTS[q].map((v) => v * (0.75 + 0.35 * seed[i])), i * 3);
    }
    geo.attributes.aTint.needsUpdate = true;
  };

  const update = ({ t, dt, drive }) => {
    const top = 0.0035;
    const pouring = pourAt >= 0 ? t - pourAt : 99;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const x = sand.x[i], z = sand.y[i];
      const d = Math.min(sand.depthAt(x, z), 28);
      let y = top + 0.0016 * Math.pow(d, 0.75) * lift[i] + sand.hop[i] * 0.03 * drive;
      if (pouring < 1.3) {
        const k = (pouring - seed[i] * 0.75) / 0.45;
        if (k < 0) y = -50; else if (k < 1) y += (1 - k) * (1 - k) * 1.2;
      }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      state[j] = sand.hop[i] * drive; state[j + 1] = sand.heat[i]; state[j + 2] = sand.ang[i];
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aState.needsUpdate = true;
    if (sparks) sparks(dt);
    return Math.min(1, Math.max(0, (pouring - 0.3) / 0.9));
  };

  const dispose = () => {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  };
  return { group, update, pour, dispose };
}
