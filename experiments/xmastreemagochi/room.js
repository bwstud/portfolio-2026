/* A small, warm living room. The tree goes in the back-left corner by a south-facing window;
   the fireplace is on the back wall. Light follows the real sun over Rochester. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { canvasTexture, rng, TAU, speckle, smoothstep, lerp, clamp } from './util.js';
import { sunPosition, fireIsLit } from './sun.js';

RectAreaLightUniformsLib.init();

export const ROOM = { w: 5, d: 5, h: 2.8, tree: new THREE.Vector3(-1.72, 0, -1.72) };
const X0 = -ROOM.w / 2, Z0 = -ROOM.d / 2;
const WIN = { z0: -1.12, z1: 0.02, y0: 0.78, y1: 2.22 };

export function buildRoom() {
  const scene = new THREE.Scene();
  const r = rng(2026);
  const shadowy = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  /* ---- Surfaces ---- */
  const floorTex = canvasTexture(1024, 1024, (ctx, w, h) => {
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 400;
      while (x < w) {
        const len = 260 + r() * 300;
        const l = 38 + r() * 10;
        ctx.fillStyle = `hsl(${28 + r() * 6}, ${42 + r() * 10}%, ${l}%)`;
        ctx.fillRect(x, i * (h / rows), len, h / rows);
        for (let k = 0; k < 26; k++) {
          ctx.strokeStyle = `rgba(60,30,10,${0.06 + r() * 0.1})`; ctx.lineWidth = 1 + r() * 2;
          const yy = i * (h / rows) + r() * (h / rows);
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 8, x + len * 0.7, yy + (r() - 0.5) * 8, x + len, yy); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(30,15,5,.6)'; ctx.fillRect(x, i * (h / rows), 2, h / rows);
        x += len;
      }
      ctx.fillStyle = 'rgba(30,15,5,.55)'; ctx.fillRect(0, i * (h / rows), w, 2);
    }
  }, { repeat: [2.5, 2.5] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.02 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  const wallTex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c8b28c'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { ctx.fillStyle = 'rgba(255,240,210,.12)'; ctx.fillRect(x, 0, 14, h); }
    speckle(ctx, w, h, 6000, ['#fff', '#7a6040'], [1, 2], [0.02, 0.06], r);
  }, { repeat: [5, 2] });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf1ebdf, roughness: 0.5 });
  const wainscot = new THREE.MeshStandardMaterial({ color: 0x3a4d3c, roughness: 0.6 });

  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; scene.add(b); return b; };
  const T = 0.12;
  // back wall (fireplace wall)
  box(ROOM.w + T * 2, ROOM.h, T, wallMat, 0, ROOM.h / 2, Z0 - T / 2);
  // right wall, front wall (seen when the camera turns)
  box(T, ROOM.h, ROOM.d, wallMat, -X0 + T / 2, ROOM.h / 2, 0);
  box(ROOM.w + T * 2, ROOM.h, T, wallMat, 0, ROOM.h / 2, -Z0 + T / 2);
  // left wall with a window hole
  const lx = X0 - T / 2;
  box(T, WIN.y0, ROOM.d, wallMat, lx, WIN.y0 / 2, 0);
  box(T, ROOM.h - WIN.y1, ROOM.d, wallMat, lx, (ROOM.h + WIN.y1) / 2, 0);
  box(T, WIN.y1 - WIN.y0, WIN.z0 - Z0, wallMat, lx, (WIN.y0 + WIN.y1) / 2, (Z0 + WIN.z0) / 2);
  box(T, WIN.y1 - WIN.y0, -Z0 - WIN.z1, wallMat, lx, (WIN.y0 + WIN.y1) / 2, (WIN.z1 - Z0) / 2);
  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.h; scene.add(ceil);
  // wainscot and trim
  const wh = 0.86;
  box(ROOM.w, wh, 0.02, wainscot, 0, wh / 2, Z0 + 0.01);
  box(0.02, wh, ROOM.d, wainscot, X0 + 0.01, wh / 2, 0);
  box(0.02, wh, ROOM.d, wainscot, -X0 - 0.01, wh / 2, 0);
  box(ROOM.w, 0.04, 0.04, trim, 0, wh, Z0 + 0.02);
  box(0.04, 0.04, ROOM.d, trim, X0 + 0.02, wh, 0);
  box(0.04, 0.04, ROOM.d, trim, -X0 - 0.02, wh, 0);
  box(ROOM.w, 0.12, 0.025, trim, 0, 0.06, Z0 + 0.03);
  box(0.025, 0.12, ROOM.d, trim, X0 + 0.03, 0.06, 0);
  box(ROOM.w, 0.08, 0.06, trim, 0, ROOM.h - 0.04, Z0 + 0.03);
  box(0.06, 0.08, ROOM.d, trim, X0 + 0.03, ROOM.h - 0.04, 0);
  box(0.06, 0.08, ROOM.d, trim, -X0 - 0.03, ROOM.h - 0.04, 0);

  /* ---- Window ---- */
  const wz = (WIN.z0 + WIN.z1) / 2, wy = (WIN.y0 + WIN.y1) / 2, ww = WIN.z1 - WIN.z0, wht = WIN.y1 - WIN.y0;
  const casing = (w, h, d, x, y, z) => box(w, h, d, trim, x, y, z);
  casing(0.06, wht + 0.16, 0.08, X0 + 0.02, wy, WIN.z0 - 0.04);
  casing(0.06, wht + 0.16, 0.08, X0 + 0.02, wy, WIN.z1 + 0.04);
  casing(0.06, 0.08, ww + 0.16, X0 + 0.02, WIN.y1 + 0.04, wz);
  casing(0.16, 0.035, ww + 0.22, X0 + 0.05, WIN.y0 - 0.0175, wz);   // sill
  casing(0.04, 0.03, ww, X0 - 0.04, wy, wz);                         // meeting rail
  casing(0.04, wht, 0.025, X0 - 0.04, wy, wz);
  for (const f of [0.25, 0.75]) casing(0.03, 0.02, ww, X0 - 0.04, lerp(WIN.y0, WIN.y1, f), wz);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wht), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, envMapIntensity: 0.6 }));
  glass.rotation.y = Math.PI / 2; glass.position.set(X0 - 0.05, wy, wz); glass.castShadow = false;
  scene.add(glass);

  // the view outside
  // the street outside: one list of houses drawn twice (shapes, then lit windows)
  const hr = rng(77);
  const houses = [];
  for (let x = 60; x < 2048 - 220; x += 330 + hr() * 160) houses.push({ x, w: 220 + hr() * 90, h: 110 + hr() * 50, roof: 70 + hr() * 40, lit: [hr(), hr(), hr(), hr()], warm: hr() });
  const treeLine = Array.from({ length: 257 }, (_, i) => 0.6 - Math.abs(Math.sin(i * 0.11)) * 0.035 - hr() * 0.03);
  const silhouettes = canvasTexture(2048, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, h);
    treeLine.forEach((v, i) => ctx.lineTo(i * 8, h * v));
    ctx.lineTo(w, h); ctx.fill();
    for (const o of houses) {
      const base = h * 0.84;
      ctx.fillRect(o.x, base - o.h, o.w, o.h);
      ctx.beginPath(); ctx.moveTo(o.x - 18, base - o.h); ctx.lineTo(o.x + o.w / 2, base - o.h - o.roof); ctx.lineTo(o.x + o.w + 18, base - o.h); ctx.fill();
      ctx.fillRect(o.x + o.w * 0.72, base - o.h - o.roof * 0.9, 20, o.roof * 0.6);
    }
    ctx.fillRect(0, h * 0.84, w, h);
  });
  const windows = canvasTexture(2048, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    for (const o of houses) {
      const base = h * 0.84;
      o.lit.forEach((l, k) => { if (l < 0.7) { ctx.fillStyle = o.warm < 0.4 ? '#ffd08a' : '#ffb35c'; ctx.fillRect(o.x + 22 + k * (o.w - 44) / 4, base - o.h + 26 + (k % 2) * 36, 24, 30); } });
      for (let k = 0; k < 20; k++) { ctx.fillStyle = ['#ff4a3a', '#ffd23c', '#4bd16a', '#43a7ff'][k % 4]; ctx.fillRect(o.x + k * o.w / 20, base - o.h - 4, 5, 5); }
    }
  });
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: 1 }, uDusk: { value: 0 }, uSil: { value: silhouettes }, uWin: { value: windows }, uTime: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `
      varying vec2 vUv; uniform float uDay, uDusk, uTime; uniform sampler2D uSil, uWin;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        vec3 dayTop = vec3(.36,.56,.86), dayLow = vec3(.78,.86,.95);
        vec3 nightTop = vec3(.01,.015,.05), nightLow = vec3(.05,.06,.12);
        vec3 duskLow = vec3(1.0,.55,.3), duskTop = vec3(.32,.3,.55);
        float y = vUv.y;
        vec3 top = mix(nightTop, dayTop, uDay), low = mix(nightLow, dayLow, uDay);
        top = mix(top, duskTop, uDusk * .6); low = mix(low, duskLow, uDusk);
        vec3 col = mix(low, top, smoothstep(.3, 1., y));
        float st = step(.997, hash(floor(vUv * vec2(900., 260.)))) * (1. - uDay) * smoothstep(.5, .8, y);
        col += st * (.6 + .4 * sin(uTime * 2. + hash(floor(vUv * 300.)) * 30.));
        float sil = texture2D(uSil, vUv).r;
        vec3 snow = mix(vec3(.06,.07,.1), vec3(.86,.89,.94), uDay);
        vec3 land = mix(vec3(.02,.025,.035), vec3(.18,.2,.22), uDay);
        land = mix(land, snow, step(vUv.y, .16));
        col = mix(col, land, sil);
        col += texture2D(uWin, vUv).rgb * sil * (1. - uDay) * 1.6;
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(22, 7), skyMat);
  outside.rotation.y = Math.PI / 2;
  outside.position.set(X0 - 5, 2.2, wz);
  scene.add(outside);

  // curtains
  const curtainTex = canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6b1b22'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(230,190,120,.35)'; ctx.lineWidth = 2;
    for (let y = 20; y < h; y += 40) for (let x = 10; x < w; x += 40) { ctx.beginPath(); ctx.arc(x + (y / 40 % 2) * 20, y, 8, 0, TAU); ctx.stroke(); }
  }, { repeat: [1, 2] });
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainTex, roughness: 0.9, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.42, 2.25, 24, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 50) * 0.025 + Math.sin(p.getX(i) * 17) * 0.01);
    g.computeVertexNormals();
    const c = new THREE.Mesh(g, curtainMat);
    c.rotation.y = Math.PI / 2;
    c.position.set(X0 + 0.11, 1.32, side < 0 ? WIN.z0 - 0.2 : WIN.z1 + 0.2);
    c.castShadow = true;
    scene.add(c);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ww + 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x5a4020, metalness: 0.8, roughness: 0.4 }));
  rod.rotation.x = Math.PI / 2; rod.position.set(X0 + 0.11, 2.46, wz); scene.add(rod);

  /* ---- Fireplace ---- */
  const FX = 0.45;
  const brick = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d8cfc0'; ctx.fillRect(0, 0, w, h);
    const bh = 32, bw = 96;
    for (let row = 0; row < h / bh; row++) {
      for (let x = -(row % 2) * bw / 2; x < w; x += bw) {
        ctx.fillStyle = `hsl(${8 + r() * 10}, ${38 + r() * 18}%, ${30 + r() * 12}%)`;
        ctx.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
      }
    }
    speckle(ctx, w, h, 9000, ['#000', '#fff'], [1, 3], [0.03, 0.1], r);
  }, { repeat: [1.6, 1.5] });
  const brickMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.9 });
  const surround = new THREE.Group();
  const sw = 1.6, shh = 1.18, depth = 0.28;
  const sbox = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); surround.add(b); return b; };
  sbox(0.42, shh, depth, brickMat, -sw / 2 + 0.21, shh / 2, depth / 2);
  sbox(0.42, shh, depth, brickMat, sw / 2 - 0.21, shh / 2, depth / 2);
  sbox(sw, 0.34, depth, brickMat, 0, shh - 0.17, depth / 2);
  const soot = new THREE.MeshStandardMaterial({ color: 0x15100d, roughness: 1 });
  sbox(sw - 0.84, shh - 0.34, 0.02, soot, 0, (shh - 0.34) / 2, 0.03);
  sbox(0.02, shh - 0.34, depth, soot, -sw / 2 + 0.43, (shh - 0.34) / 2, depth / 2);
  sbox(0.02, shh - 0.34, depth, soot, sw / 2 - 0.43, (shh - 0.34) / 2, depth / 2);
  const mantelWood = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.5 });
  const mantel = new THREE.Mesh(new RoundedBoxGeometry(sw + 0.3, 0.07, depth + 0.12, 2, 0.015), mantelWood);
  mantel.position.set(0, shh + 0.035, (depth + 0.12) / 2); surround.add(mantel);
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.2, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 0.7 }));
  hearth.position.set(0, 0.025, depth + 0.2); surround.add(hearth);
  // grate and logs
  const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.6 });
  for (let i = 0; i < 6; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6), iron); bar.rotation.x = Math.PI / 2; bar.position.set(-0.2 + i * 0.08, 0.08, 0.15); surround.add(bar); }
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x3d2a1c, roughness: 1 });
  const logs = [[-0.08, 0.12, 0.13, 0.15], [0.1, 0.12, 0.15, -0.2], [0.0, 0.2, 0.12, 0.05]];
  for (const [x, y, z, rot] of logs) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.42, 10), barkMat);
    log.rotation.z = Math.PI / 2; log.rotation.y = rot; log.position.set(x, y, z); surround.add(log);
  }
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff4a10, emissiveIntensity: 0 });
  const embers = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.2), emberMat); embers.position.set(0, 0.07, 0.15); surround.add(embers);
  // flames
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `
      varying vec2 vUv; uniform float uTime, uOn;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a*n(p); p *= 2.03; a *= .5; } return v; }
      void main(){
        vec2 uv = vUv;
        float t = uTime;
        float q = fbm(vec2(uv.x * 4., uv.y * 3. - t * 2.2));
        float shape = 1. - smoothstep(0., .9, abs(uv.x - .5) * 2.4 + uv.y * 1.1 - q * .75);
        shape *= smoothstep(0., .08, uv.y);
        float inten = pow(clamp(shape, 0., 1.), 1.6);
        vec3 col = mix(vec3(1., .25, .02), vec3(1., .85, .4), inten);
        col = mix(col, vec3(.4,.55,1.), smoothstep(.1,0.,uv.y) * .5);
        gl_FragColor = vec4(col * inten * 1.25 * uOn, inten * uOn);
      }`,
  });
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.34 + (i % 2) * 0.1, 0.55), flameMat);
    f.position.set(-0.12 + i * 0.08, 0.38, 0.12 + (i % 2) * 0.04);
    f.rotation.y = (i - 1.5) * 0.4;
    surround.add(f); flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 6, 1.4);
  fireLight.position.set(0, 0.4, 0.45);
  surround.add(fireLight);
  surround.position.set(FX, 0, Z0);
  shadowy(surround);
  flames.forEach(f => { f.castShadow = false; f.receiveShadow = false; });
  surround.traverse(o => { if (o.material === soot) o.receiveShadow = false; });
  scene.add(surround);

  // mantel things: stockings, candles, a clock
  const felt = c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
  const stockingShape = new THREE.Shape();
  stockingShape.moveTo(0, 0); stockingShape.lineTo(0.12, 0); stockingShape.lineTo(0.12, -0.24); stockingShape.quadraticCurveTo(0.12, -0.32, 0.04, -0.33);
  stockingShape.lineTo(-0.08, -0.33); stockingShape.quadraticCurveTo(-0.13, -0.3, -0.1, -0.25); stockingShape.lineTo(0, -0.22); stockingShape.lineTo(0, 0);
  [[0xa3151e, -0.45], [0x1d5a2c, 0], [0xf0e8da, 0.45]].forEach(([c, x]) => {
    const s = new THREE.Mesh(new THREE.ExtrudeGeometry(stockingShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 }), felt(c));
    s.position.set(FX + x - 0.06, shh - 0.0, Z0 + depth + 0.07);
    const cuff = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.06, 0.07, 2, 0.02), felt(0xf8f4ec));
    cuff.position.set(FX + x, shh - 0.02, Z0 + depth + 0.09);
    scene.add(shadowy(s), shadowy(cuff));
  });
  const candleMat = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.6 });
  const candleFlames = [];
  for (const [x, h] of [[-0.75, 0.22], [-0.66, 0.16], [0.7, 0.18]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 16), candleMat);
    c.position.set(FX + x, shh + 0.07 + h / 2, Z0 + 0.16); scene.add(shadowy(c));
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
    fl.scale.y = 2.2; fl.position.set(FX + x, shh + 0.07 + h + 0.015, Z0 + 0.16); scene.add(fl); candleFlames.push(fl);
  }
  // picture above the mantel
  const paint = canvasTexture(512, 360, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5b6f8a'); g.addColorStop(0.6, '#c9c1b0'); g.addColorStop(1, '#e8e4dc');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b3a2e';
    for (let i = 0; i < 14; i++) { const x = r() * w, s = 30 + r() * 50; ctx.beginPath(); ctx.moveTo(x, h * 0.7 - s * 1.6); ctx.lineTo(x + s * 0.5, h * 0.72); ctx.lineTo(x - s * 0.5, h * 0.72); ctx.fill(); }
    ctx.fillStyle = '#7a3a2a'; ctx.fillRect(w * 0.6, h * 0.55, 60, 45); ctx.beginPath(); ctx.moveTo(w * 0.6 - 8, h * 0.55); ctx.lineTo(w * 0.6 + 30, h * 0.47); ctx.lineTo(w * 0.6 + 68, h * 0.55); ctx.fill();
    ctx.fillStyle = '#ffd590'; ctx.fillRect(w * 0.6 + 20, h * 0.58, 14, 14);
  });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.62, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.6, roughness: 0.4 }));
  frame.position.set(FX, 1.78, Z0 + 0.03); scene.add(shadowy(frame));
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.5), new THREE.MeshStandardMaterial({ map: paint, roughness: 0.8 }));
  canvas.position.set(FX, 1.78, Z0 + 0.051); scene.add(canvas);
  // mantel garland
  const garland = new THREE.Group();
  const g1 = new THREE.MeshStandardMaterial({ color: 0x1f4a26, roughness: 0.8 });
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const x = FX + lerp(-0.92, 0.92, t);
    const sag = Math.sin(t * Math.PI * 4) * -0.04;
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), g1);
    tuft.position.set(x, shh + 0.08 + Math.min(0, sag), Z0 + depth + 0.1 + (r() - 0.5) * 0.04);
    tuft.rotation.set(r() * 3, r() * 3, r() * 3); tuft.scale.set(1.2, 0.6, 0.8);
    garland.add(tuft);
    if (i % 9 === 4) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa3151e, roughness: 0.3, metalness: 0.4 })); b.position.copy(tuft.position).add(new THREE.Vector3(0, -0.02, 0.04)); garland.add(b); }
  }
  scene.add(shadowy(garland));

  /* ---- Furniture ---- */
  const fabric = (c, rep = 2) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, map: canvasTexture(128, 128, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); speckle(ctx, w, h, 3000, ['#000', '#888'], [1, 2], [0.04, 0.12], r); }, { repeat: [rep, rep] }) });
  const rbox = (w, h, d, m, x, y, z, rad = 0.04) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), m); b.position.set(x, y, z); return b; };
  // sofa on the right wall, facing the room
  const sofa = new THREE.Group();
  const sf = fabric(0x8a6a4e);
  sofa.add(rbox(0.9, 0.42, 2.1, sf, 0, 0.25, 0), rbox(0.22, 0.85, 2.1, sf, 0.34, 0.47, 0), rbox(0.9, 0.62, 0.2, sf, 0, 0.33, -1.0), rbox(0.9, 0.62, 0.2, sf, 0, 0.33, 1.0));
  for (const z of [-0.47, 0.47]) sofa.add(rbox(0.66, 0.14, 0.92, sf, -0.06, 0.52, z, 0.06));
  const pillow = (c, z, rot) => { const p = rbox(0.12, 0.38, 0.38, fabric(c), 0.18, 0.72, z, 0.08); p.rotation.x = rot; p.rotation.z = 0.25; sofa.add(p); };
  pillow(0xa3151e, -0.7, 0.2); pillow(0xe9dcc4, 0.68, -0.15);
  const throwM = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9, 12, 12), new THREE.MeshStandardMaterial({ map: skirtStyleThrow(), roughness: 1, side: THREE.DoubleSide }));
  { const p = throwM.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.02 + Math.cos(p.getY(i) * 7) * 0.02); throwM.geometry.computeVertexNormals(); }
  throwM.rotation.set(-Math.PI / 2.3, 0, Math.PI / 2); throwM.position.set(0.05, 0.62, 0.45); sofa.add(throwM);
  for (const [x, z] of [[-0.35, -0.95], [-0.35, 0.95], [0.35, -0.95], [0.35, 0.95]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.06, 8), mantelWood); leg.position.set(x, 0.03, z); sofa.add(leg); }
  sofa.position.set(-X0 - 0.5, 0, 0.55);
  scene.add(shadowy(sofa));
  // armchair angled at the fire
  const chair = new THREE.Group();
  const cf = fabric(0x2f4a3a);
  chair.add(rbox(0.8, 0.4, 0.8, cf, 0, 0.26, 0), rbox(0.8, 0.8, 0.18, cf, 0, 0.6, 0.34), rbox(0.16, 0.56, 0.8, cf, -0.36, 0.42, 0), rbox(0.16, 0.56, 0.8, cf, 0.36, 0.42, 0), rbox(0.6, 0.12, 0.6, cf, 0, 0.5, -0.05, 0.05));
  chair.position.set(1.55, 0, -1.05); chair.rotation.y = Math.PI * 0.82;
  scene.add(shadowy(chair));
  // rug
  const rugTex = canvasTexture(1024, 700, (ctx, w, h) => {
    ctx.fillStyle = '#7a1e22'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d9b46a'; ctx.lineWidth = 14; ctx.strokeRect(30, 30, w - 60, h - 60);
    ctx.strokeStyle = '#1f2f4a'; ctx.lineWidth = 34; ctx.strokeRect(70, 70, w - 140, h - 140);
    ctx.fillStyle = '#1f2f4a';
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 220, 140, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9b46a';
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; ctx.beginPath(); ctx.ellipse(w / 2 + Math.cos(a) * 150, h / 2 + Math.sin(a) * 90, 22, 10, a, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#e9dcc4'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 40, 0, TAU); ctx.fill();
    for (let x = 120; x < w - 100; x += 60) for (const y of [110, h - 110]) { ctx.fillStyle = '#d9b46a'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 14, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 14, y); ctx.fill(); }
    speckle(ctx, w, h, 30000, ['#000', '#fff'], [1, 2], [0.03, 0.08], r);
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.65), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.55, 0.004, -0.1); rug.receiveShadow = true; scene.add(rug);
  // floor lamp by the window
  const lampG = new THREE.Group();
  const brassM = new THREE.MeshStandardMaterial({ color: 0xa68440, metalness: 0.9, roughness: 0.35 });
  lampG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 24), brassM));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8), brassM); pole.position.y = 0.76; lampG.add(pole);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf2e4c4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffb060, emissiveIntensity: 0 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.3, 24, 1, true), shadeMat); shade.position.y = 1.55; lampG.add(shade);
  const lampLight = new THREE.PointLight(0xffb46b, 0, 7, 1.5); lampLight.position.y = 1.5; lampG.add(lampLight);
  lampG.position.set(X0 + 0.38, 0, 0.75);
  scene.add(shadowy(lampG));
  shade.castShadow = false;
  // side table and lamp by the sofa
  const table = new THREE.Group();
  table.add(rbox(0.5, 0.04, 0.5, mantelWood, 0, 0.58, 0, 0.01));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.58, 8), mantelWood); l.position.set(x, 0.29, z); table.add(l); }
  const jar = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.25 })); jar.position.y = 0.7; table.add(jar);
  const shade2Mat = shadeMat.clone();
  const shade2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 24, 1, true), shade2Mat); shade2.position.y = 0.95; table.add(shade2);
  const tableLight = new THREE.PointLight(0xffb46b, 0, 5, 1.5); tableLight.position.y = 0.92; table.add(tableLight);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.09, 16), new THREE.MeshStandardMaterial({ color: 0xa3151e, roughness: 0.3 })); mug.position.set(0.14, 0.645, 0.12); table.add(mug);
  table.position.set(-X0 - 0.4, 0, -0.9);
  scene.add(shadowy(table));
  shade2.castShadow = false;
  // bookshelf in the back right
  const shelf = new THREE.Group();
  const shelfWood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });
  shelf.add(rbox(0.9, 1.9, 0.32, shelfWood, 0, 0.95, 0, 0.01));
  for (let k = 0; k < 5; k++) {
    const y = 0.12 + k * 0.36;
    const cav = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.32, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a1a10 })); cav.position.set(0, y + 0.16, -0.13); shelf.add(cav);
    let x = -0.39;
    while (x < 0.36) {
      const bw = 0.025 + r() * 0.035, bh = 0.2 + r() * 0.1;
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.2), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(r(), 0.35 + r() * 0.3, 0.2 + r() * 0.25), roughness: 0.8 }));
      b.position.set(x + bw / 2, y + bh / 2 + 0.01, 0.03);
      if (r() < 0.08) b.rotation.z = 0.25;
      shelf.add(b);
      x += bw + 0.003;
    }
  }
  shelf.position.set(1.85, 0, Z0 + 0.17);
  scene.add(shadowy(shelf));

  /* ---- Lights ---- */
  const hemi = new THREE.HemisphereLight(0xdde6ff, 0x3a2a1c, 0.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0008;
  sun.target.position.set(0, 0, -0.5);
  scene.add(sun, sun.target);
  const windowFill = new THREE.RectAreaLight(0xcfe0ff, 0, ww, wht);
  windowFill.position.set(X0 - 0.02, wy, wz);
  windowFill.lookAt(0, wy, wz);
  scene.add(windowFill);
  const ambientWarm = new THREE.PointLight(0xffc890, 0, 8, 1.2);
  ambientWarm.position.set(0.5, 2.5, 0.4);
  scene.add(ambientWarm);

  /* ---- Time of day ---- */
  let fireOn = false;
  const state = { dayness: 1, fire: false, lamps: false };
  function setTime(ms) {
    const { alt, az } = sunPosition(ms);
    const dayness = smoothstep(-6, 8, alt);
    const dusk = clamp(1 - Math.abs(alt - 1) / 9) * (alt > -8 ? 1 : 0);
    state.dayness = dayness;
    skyMat.uniforms.uDay.value = dayness;
    skyMat.uniforms.uDusk.value = dusk;
    // sun through the window: x = north, z = east. Window faces south (−x).
    const a = alt * Math.PI / 180, z = az * Math.PI / 180;
    const dir = new THREE.Vector3(Math.cos(z) * Math.cos(a), Math.sin(a), Math.sin(z) * Math.cos(a));
    const inWindow = smoothstep(0.0, 0.35, -dir.x) * smoothstep(-1, 3, alt);
    sun.position.copy(dir).multiplyScalar(12).add(new THREE.Vector3(X0, 0, wz));
    sun.target.position.set(X0 + 1.5, 0, wz);
    sun.intensity = inWindow * lerp(1.6, 5.5, smoothstep(2, 25, alt));
    sun.color.setHSL(0.09, lerp(0.9, 0.35, smoothstep(0, 20, alt)), lerp(0.62, 0.92, smoothstep(0, 20, alt)));
    windowFill.intensity = lerp(0.03, 2.4, dayness);
    windowFill.color.setHSL(lerp(0.62, 0.58, dayness), 0.4, lerp(0.35, 0.85, dayness));
    hemi.intensity = lerp(0.02, 0.32, dayness);
    state.lamps = alt < 6;
    lampLight.intensity = state.lamps ? 1.5 : 0;
    tableLight.intensity = state.lamps ? 0.8 : 0;
    shadeMat.emissiveIntensity = state.lamps ? 0.6 : 0;
    shade2Mat.emissiveIntensity = state.lamps ? 0.6 : 0;
    ambientWarm.intensity = state.lamps ? 0.22 : 0.1;
    candleFlames.forEach(f => { f.visible = state.lamps; });
    fireOn = fireIsLit(ms);
    state.fire = fireOn;
    flameMat.uniforms.uOn.value = fireOn ? 1 : 0;
    emberMat.emissiveIntensity = fireOn ? 1.4 : 0.05;
  }
  function update(time) {
    skyMat.uniforms.uTime.value = time;
    flameMat.uniforms.uTime.value = time;
    if (fireOn) fireLight.intensity = 2.4 + Math.sin(time * 11) * 0.4 + Math.sin(time * 23.7) * 0.3 + Math.sin(time * 5.3) * 0.35;
    else fireLight.intensity = 0;
    candleFlames.forEach((f, i) => { f.scale.y = 2.2 + Math.sin(time * 13 + i * 2) * 0.25; });
  }

  // things the cat can come out from behind
  const catStart = new THREE.Vector3(1.6, 0, 1.6);
  return { scene, setTime, update, state, catStart, floor };
}

function skirtStyleThrow() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e9dcc4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(150,20,30,.7)';
    for (let k = 0; k < w; k += 64) { ctx.fillRect(k, 0, 20, h); ctx.fillRect(0, k, w, 20); }
    ctx.fillStyle = 'rgba(30,60,40,.5)';
    for (let k = 32; k < w; k += 64) { ctx.fillRect(k, 0, 5, h); ctx.fillRect(0, k, w, 5); }
  });
}
