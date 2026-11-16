/* Fire, smoke, the blood mist, splatter and the laser beam. Everything here is drawn as a
   function of playback time, so it rewinds as cleanly as it plays. */
import * as THREE from 'three';

function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/* ---------- bursts: particles with a start time, a life and ballistic-with-drag motion ---------- */
const burstVS = `
  attribute vec3 aV; attribute float aT0, aLife, aS0, aS1, aSeed;
  uniform float uTime, uDrag, uScale; uniform vec3 uAcc;
  varying float vF, vSeed;
  void main(){
    float age = uTime - aT0;
    if (age < 0. || age > aLife) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
    float k = max(uDrag, 0.0001);
    float d = (1. - exp(-k * age)) / k;
    vec3 p = position + aV * d + 0.5 * uAcc * age * age;
    p.x += sin(uTime * 9. + aSeed * 40.) * 0.01 * age;
    p.z += cos(uTime * 8. + aSeed * 31.) * 0.01 * age;
    vF = age / aLife; vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(1024., uScale * mix(aS0, aS1, vF) / -mv.z);
  }`;
const fireFS = `
  uniform float uGain; varying float vF, vSeed;
  void main(){
    vec2 c = gl_PointCoord - .5; float r = length(c); if (r > .5) discard;
    float soft = pow(1. - r * 2., 1.6);
    vec3 col = mix(vec3(1., .93, .75), vec3(1., .5, .1), smoothstep(0., .35, vF));
    col = mix(col, vec3(.55, .1, .03), smoothstep(.35, .85, vF));
    float a = soft * pow(1. - vF, 1.4) * uGain;
    gl_FragColor = vec4(col * a, a);
  }`;
const smokeFS = `
  uniform float uGain; uniform vec3 uTint; varying float vF, vSeed;
  void main(){
    vec2 c = gl_PointCoord - .5; float r = length(c); if (r > .5) discard;
    float soft = pow(1. - r * 2., 2.) * (0.8 + 0.2 * sin(vSeed * 50. + r * 9.));
    float a = soft * smoothstep(0., .08, vF) * (1. - vF) * uGain;
    gl_FragColor = vec4(uTint * (0.8 + 0.4 * vSeed), a);
  }`;

export class Burst {
  constructor(scene, { kind = 'fire', drag = 1, acc = [0, 0, 0], gain = 1, tint = [0.18, 0.18, 0.19] } = {}) {
    this.geo = new THREE.BufferGeometry();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: burstVS, fragmentShader: kind === 'fire' ? fireFS : smokeFS,
      transparent: true, depthWrite: false, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uDrag: { value: drag }, uScale: { value: 500 }, uAcc: { value: new THREE.Vector3(...acc) }, uGain: { value: gain }, uTint: { value: new THREE.Vector3(...tint) } },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = kind === 'fire' ? 3 : 2;
    scene.add(this.points);
  }
  /* list: [{ p:[x,y,z], v:[x,y,z], t0, life, s0, s1 }] (sizes in metres) */
  set(list) {
    const n = list.length, P = new Float32Array(n * 3), V = new Float32Array(n * 3), T = new Float32Array(n), Lf = new Float32Array(n), S0 = new Float32Array(n), S1 = new Float32Array(n), Sd = new Float32Array(n);
    list.forEach((e, i) => { P.set(e.p, i * 3); V.set(e.v, i * 3); T[i] = e.t0; Lf[i] = e.life; S0[i] = e.s0; S1[i] = e.s1; Sd[i] = e.seed ?? (i * 0.6180339) % 1; });
    const g = this.geo;
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aV', new THREE.BufferAttribute(V, 3));
    g.setAttribute('aT0', new THREE.BufferAttribute(T, 1)); g.setAttribute('aLife', new THREE.BufferAttribute(Lf, 1));
    g.setAttribute('aS0', new THREE.BufferAttribute(S0, 1)); g.setAttribute('aS1', new THREE.BufferAttribute(S1, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(Sd, 1));
    g.setDrawRange(0, n);
  }
  update(t, scale) { this.mat.uniforms.uTime.value = t; this.mat.uniforms.uScale.value = scale; }
  dispose() { this.points.parent?.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}

/* ---------- mist: baked positions, faded by age ---------- */
export class Mist {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uAge: { value: -1 }, uHang: { value: 7 }, uScale: { value: 500 }, uGore: { value: new THREE.Color(0x7a0d0f) } },
      vertexShader: `attribute float aLife, aSize, aTone; uniform float uAge, uHang, uScale; varying float vA, vTone;
        void main(){
          float life = aLife * uHang;
          if (uAge < 0. || uAge > life) { gl_Position = vec4(2.,2.,2.,1.); gl_PointSize = 0.; return; }
          float f = uAge / life;
          vA = smoothstep(0., 0.03, uAge) * (1. - smoothstep(0.55, 1., f)); vTone = aTone;
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(512., uScale * (0.035 + 0.06 * aSize) * (1. + uAge * 0.25) / -mv.z);
        }`,
      fragmentShader: `uniform vec3 uGore; varying float vA, vTone;
        void main(){ vec2 c = gl_PointCoord - .5; float r = length(c); if (r > .5) discard;
          float a = pow(1. - r * 2., 1.8) * vA * 0.55;
          gl_FragColor = vec4(uGore * (0.55 + 0.8 * vTone), a); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 2;
    scene.add(this.points);
    this.data = null;
  }
  set(mist) {
    this.data = mist;
    if (!mist || !mist.frames) { this.geo.setDrawRange(0, 0); return; }
    const n = mist.life.length;
    this.pos = new Float32Array(n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(mist.life, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(mist.size, 1));
    this.geo.setAttribute('aTone', new THREE.BufferAttribute(mist.tone, 1));
    this.geo.setDrawRange(0, n);
  }
  update(age, mistFps, scale) {
    this.mat.uniforms.uAge.value = age;
    this.mat.uniforms.uScale.value = scale;
    const m = this.data;
    if (!m || !m.frames || age < 0) return;
    const f = Math.min(m.frames - 1, age * mistFps), i0 = Math.floor(f), i1 = Math.min(m.frames - 1, i0 + 1), a = f - i0;
    const A = m.data[i0], B = m.data[i1];
    for (let i = 0; i < this.pos.length; i++) this.pos[i] = A[i] + (B[i] - A[i]) * a;
    this.geo.attributes.position.needsUpdate = true;
  }
}

/* ---------- splatter ---------- */
function splatAtlas() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), rnd = seeded(404), H = S / 2;
  const blob = (cx, cy, r) => { x.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, rr = r * (0.75 + 0.35 * rnd()); k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); };
  x.fillStyle = '#fff';
  // 0: a big splat with satellites
  blob(H / 2, H / 2, H * 0.24);
  for (let i = 0; i < 26; i++) { const a = rnd() * 6.28, d = H * (0.2 + rnd() * 0.26); blob(H / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d, H * (0.01 + rnd() * 0.04)); }
  // 1: spiky impact
  x.save(); x.translate(H * 1.5, H * 0.5);
  blob(0, 0, H * 0.14);
  for (let i = 0; i < 11; i++) { const a = rnd() * 6.28, l = H * (0.08 + Math.pow(rnd(), 2) * 0.36), w = H * (0.012 + rnd() * 0.035); x.save(); x.rotate(a); x.beginPath(); x.moveTo(0, -w); x.quadraticCurveTo(l * 0.6, -w * 0.5, l, 0); x.quadraticCurveTo(l * 0.6, w * 0.5, 0, w); x.fill(); blob(l, 0, w * (0.6 + rnd())); for (let k = 0; k < 3; k++) blob(l * (1.1 + rnd() * 0.4), (rnd() - 0.5) * w * 3, H * 0.008 * (0.5 + rnd())); x.restore(); }
  x.restore();
  // 2: fine spray
  for (let i = 0; i < 160; i++) { const a = rnd() * 6.28, d = Math.pow(rnd(), 0.7) * H * 0.45; blob(H / 2 + Math.cos(a) * d, H * 1.5 + Math.sin(a) * d, H * (0.004 + rnd() * 0.016)); }
  // 3: a wall hit that runs down
  x.save(); x.translate(H * 1.5, H * 1.3);
  blob(0, 0, H * 0.16);
  for (let i = 0; i < 6; i++) { const px = (rnd() - 0.5) * H * 0.26, w = H * (0.012 + rnd() * 0.02), l = H * (0.15 + rnd() * 0.5); x.fillRect(px - w / 2, 0, w, Math.min(l, H * 0.68)); blob(px, Math.min(l, H * 0.68), w * 0.9); }
  x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

export class Decals {
  constructor(scene) {
    this.scene = scene;
    this.atlas = splatAtlas();
    this.uTime = { value: 0 };
    this.mat = new THREE.MeshStandardMaterial({ color: 0x7a0d0f, roughness: 0.22, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.uTime; sh.uniforms.uAtlas = { value: this.atlas };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aT; attribute float aShape; varying float vT; varying float vShape; varying vec2 vUv2;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = aT; vShape = aShape; vUv2 = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform sampler2D uAtlas; varying float vT; varying float vShape; varying vec2 vUv2;')
        .replace('#include <map_fragment>', `
          vec2 cell = vec2(mod(vShape, 2.), floor(vShape / 2.));
          float m = texture2D(uAtlas, vec2((vUv2.x + cell.x) * 0.5, ((1. - vUv2.y) + cell.y) * 0.5)).r;
          float grow = smoothstep(vT, vT + 0.07, uTime);
          if (uTime < vT || m * grow < 0.05) discard;
          diffuseColor.a *= m * grow * 0.92;
          diffuseColor.rgb *= 0.75 + 0.25 * m;`);
    };
    this.mat.customProgramCacheKey = () => 'decal';
    this.mesh = null;
  }
  set(list) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!list || !list.length) return;
    const n = list.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    const aT = new Float32Array(n), aShape = new Float32Array(n);
    const mesh = new THREE.InstancedMesh(geo, this.mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
    list.forEach((d, i) => {
      const nrm = new THREE.Vector3(...d.n);
      q.setFromUnitVectors(z, nrm);
      let shape = d.kind === 1 ? 2 : d.shape % 2;
      const wall = Math.abs(nrm.y) < 0.5;
      if (wall && d.kind === 0 && d.shape >= 2) shape = 3;   // runs down the wall
      if (wall && shape === 3) {
        // keep the drips pointing down: the plane's -y should line up with world -y
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const a = Math.atan2(new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).dot(nrm), up.dot(new THREE.Vector3(0, 1, 0)));
        q.multiply(new THREE.Quaternion().setFromAxisAngle(z, a));
      } else q.multiply(new THREE.Quaternion().setFromAxisAngle(z, d.rot));
      const k = shape === 3 ? d.size * 1.5 : d.size;
      s.set(k, k, 1); p.set(...d.p);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      aT[i] = d.t; aShape[i] = shape;
    });
    geo.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 1));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(aShape, 1));
    mesh.renderOrder = 1; mesh.frustumCulled = false; mesh.receiveShadow = true;
    this.scene.add(mesh); this.mesh = mesh;
  }
  update(t, color) { this.uTime.value = t; this.mat.color.set(color); }
}

/* ---------- the laser beam ---------- */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
export class Beam {
  constructor(scene) {
    this.g = new THREE.Group(); scene.add(this.g);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); cyl.translate(0, 0.5, 0);
    const cone = new THREE.CylinderGeometry(0.15, 1, 1, 12, 1, true); cone.translate(0, 0.5, 0);
    const mk = (geo, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x40ff7a, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); m.renderOrder = 4; this.g.add(m); return m; };
    this.inCore = mk(cyl, 0.95); this.inHalo = mk(cyl, 0.18);
    this.outCore = mk(cone, 0.95); this.outHalo = mk(cone, 0.18);
    const tex = glowTexture();
    const sp = op => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x40ff7a, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); s.renderOrder = 5; this.g.add(s); return s; };
    this.flare0 = sp(0.9); this.flare1 = sp(0.9); this.spot = sp(1);
    this.light = new THREE.PointLight(0x40ff7a, 0, 1.2, 2); this.g.add(this.light);
    this.g.visible = false;
  }
  _seg(core, halo, a, b, r) {
    const d = new THREE.Vector3().subVectors(b, a), l = d.length();
    for (const [m, k] of [[core, 1], [halo, 3.2]]) {
      m.position.copy(a); m.scale.set(r * k, l, r * k);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
  }
  update({ on, from, lens, to, width, color, flicker, heat }) {
    this.g.visible = on;
    if (!on) { this.light.intensity = 0; return; }
    const c = new THREE.Color(color);
    for (const m of [this.inCore, this.inHalo, this.outCore, this.outHalo]) m.material.color.copy(c);
    for (const s of [this.flare0, this.flare1, this.spot]) s.material.color.copy(c);
    this.inCore.material.color.lerp(new THREE.Color(1, 1, 1), 0.5); this.outCore.material.color.lerp(new THREE.Color(1, 1, 1), 0.5);
    const r = width / 2000;
    this._seg(this.inCore, this.inHalo, from, lens, r);
    this._seg(this.outCore, this.outHalo, to, lens, r * 1.3);   // the cone narrows towards the pile
    this.flare0.position.copy(from); this.flare0.scale.setScalar(0.05 + r * 6);
    this.flare1.position.copy(lens); this.flare1.scale.setScalar(0.09 + r * 8);
    this.spot.position.copy(to); this.spot.scale.setScalar((0.05 + 0.08 * heat) * (0.85 + 0.15 * flicker));
    this.light.position.copy(to).add(new THREE.Vector3(0, 0.04, 0)); this.light.color.copy(c); this.light.intensity = 0.25 + heat * 0.8;
  }
}
