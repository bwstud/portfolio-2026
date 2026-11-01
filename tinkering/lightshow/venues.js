/* Ten rooms, modelled in code. Each is stylised rather than surveyed: the shapes people know
   (the Bowl's shell, Radio City's arches, the rocks at Red Rocks, the Sphere's dome) at roughly
   the right scale, kept dark so the show lights them. The stage itself comes from rig.js.
   Every builder returns the room, a ground-height function for beams to land on, where the
   crowd stands, and camera shots. Stage front is z = 0; the audience is towards +z. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { withAspect } from './rig.js';

const TAU = Math.PI * 2;
function rand(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296); }
const M = (color, rough = 0.85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/* ---------- seating ---------- */
// straight rows: each row a step, widening towards the back
function rowsRect({ z0, z1, y0, y1, w0, w1, rows, mat, spots, every = 0.75, x0 = 0, skip = 0 }) {
  const parts = [], dz = (z1 - z0) / rows, dy = (y1 - y0) / rows;
  for (let k = 0; k < rows; k++) {
    const z = z0 + k * dz, y = y0 + k * dy, w = w0 + (w1 - w0) * k / rows;
    const b = new THREE.BoxGeometry(w, Math.max(0.05, y + dy), dz); b.translate(x0, (y + dy) / 2, z + dz / 2);
    parts.push(b);
    if (spots && k >= skip) for (let x = -w / 2 + 0.5; x < w / 2 - 0.4; x += every) spots.push([x0 + x, y + dy, z + dz * 0.5]);
  }
  return new THREE.Mesh(mergeGeometries(parts), mat);
}
const rectHeight = (o, x, z) => {
  if (z < o.z0 || z > o.z1) return null;
  const k = Math.floor((z - o.z0) / ((o.z1 - o.z0) / o.rows)), w = o.w0 + (o.w1 - o.w0) * k / o.rows;
  if (Math.abs(x - (o.x0 || 0)) > w / 2) return null;
  return o.y0 + (k + 1) * (o.y1 - o.y0) / o.rows;
};

// curved rows round a centre: phi is measured from +z towards +x. rx/rz scale an ellipse.
function rowsArc({ cx = 0, cz = 0, r0, r1, y0, y1, rows, phi0, phi1, mat, spots, every = 0.8, ell = [1, 1], seg = 64, fascia }) {
  const pos = [], idx = [];
  const dr = (r1 - r0) / rows, dy = (y1 - y0) / rows;
  const P = (r, phi, y) => [cx + Math.sin(phi) * r * ell[0], y, cz + Math.cos(phi) * r * ell[1]];
  const quad = (a, b, c, d) => { const n = pos.length / 3; pos.push(...a, ...b, ...c, ...d); idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); };
  for (let k = 0; k < rows; k++) {
    const r = r0 + k * dr, y = y0 + (k + 1) * dy;
    for (let s = 0; s < seg; s++) {
      const a = phi0 + (phi1 - phi0) * s / seg, b = phi0 + (phi1 - phi0) * (s + 1) / seg;
      quad(P(r, a, y), P(r, b, y), P(r + dr, a, y), P(r + dr, b, y));                 // tread
      quad(P(r, a, y - dy), P(r, b, y - dy), P(r, a, y), P(r, b, y));                 // riser
    }
    if (spots) {
      const len = Math.abs(phi1 - phi0) * r * (ell[0] + ell[1]) / 2, n = Math.floor(len / every);
      for (let i = 0; i < n; i++) spots.push(P(r + dr * 0.5, phi0 + (phi1 - phi0) * (i + 0.5) / n, y));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}
function arcHeight(o, x, z) {
  const ex = (x - (o.cx || 0)) / (o.ell ? o.ell[0] : 1), ez = (z - (o.cz || 0)) / (o.ell ? o.ell[1] : 1);
  const r = Math.hypot(ex, ez), phi = Math.atan2(ex, ez);
  if (r < o.r0 || r > o.r1 || phi < Math.min(o.phi0, o.phi1) || phi > Math.max(o.phi0, o.phi1)) return null;
  const k = Math.floor((r - o.r0) / ((o.r1 - o.r0) / o.rows));
  return o.y0 + (k + 1) * (o.y1 - o.y0) / o.rows;
}

// a vertical band following an arc or ellipse, for fascia, walls and ribbon boards
function band({ cx = 0, cz = 0, r, ell = [1, 1], y0, y1, phi0, phi1, seg = 96, mat, screen }) {
  const g = new THREE.CylinderGeometry(1, 1, 1, seg, 1, true, phi0, phi1 - phi0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, cx + x * r * ell[0], y0 + (y + 0.5) * (y1 - y0), cz + z * r * ell[1]);
  }
  g.computeVertexNormals();
  if (screen) withAspect(g, Math.abs(phi1 - phi0) * r * (ell[0] + ell[1]) / 2 / (y1 - y0));
  const m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide;
  return m;
}

/* ---------- skies and terrain ---------- */
function sky(kind) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
    uniforms: { uKind: { value: { night: 0, la: 1, dusk: 2 }[kind] }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */`
      uniform int uKind; uniform float uTime; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vD); float y = d.y;
        vec3 top = vec3(0.004, 0.006, 0.02), mid = vec3(0.012, 0.016, 0.05), hor = vec3(0.05, 0.035, 0.05);
        float glowDir = smoothstep(0.2, -1.0, d.z);          // towards -z, beyond the stage
        if (uKind == 1) { hor = vec3(0.16, 0.07, 0.05); mid = vec3(0.03, 0.025, 0.06); glowDir = 1.0; }
        if (uKind == 2) { top = vec3(0.006, 0.01, 0.04); mid = vec3(0.05, 0.03, 0.12); hor = mix(vec3(0.12, 0.05, 0.12), vec3(0.95, 0.38, 0.14), glowDir); }
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, y));
        c = mix(c, top, smoothstep(0.15, 0.7, y));
        if (uKind == 0) c += vec3(0.12, 0.06, 0.03) * glowDir * exp(-max(y, 0.0) * 18.0);
        if (uKind == 2) c += vec3(0.9, 0.45, 0.2) * glowDir * exp(-max(y + 0.02, 0.0) * 14.0) * 0.8;
        // stars
        vec3 q = floor(d * 380.0); float s = h(q);
        float star = step(uKind == 1 ? 0.9975 : 0.993, s) * smoothstep(0.02, 0.3, y) * (0.5 + 0.5 * sin(uTime * (2.0 + s * 9.0) + s * 40.0));
        c += vec3(star) * (uKind == 2 ? smoothstep(0.3, 0.7, y) : 1.0) * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

function cityLights(n, { x: [x0, x1], z: [z0, z1], y, seed = 3, size = 2.4, warm = 0.8 }) {
  const R = rand(seed), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = z0 + (z1 - z0) * Math.pow(R(), 0.7), spread = (x1 - x0) * (0.5 + 0.5 * (z - z0) / (z1 - z0 || 1));
    p.set([(R() - 0.5) * spread + (x0 + x1) / 2, y + R() * 3, z], i * 3);
    const w = R() < warm ? [1, 0.62 + R() * 0.2, 0.3] : [0.75, 0.85, 1];
    const k = 0.4 + R() * 0.9; c.set([w[0] * k, w[1] * k, w[2] * k], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  return pts;
}

// a sandstone monolith: a box pushed about by noise, tapered and banded
function monolith({ w, h, d, seed, lean = 0, color = [0.36, 0.12, 0.07] }) {
  const g = new THREE.BoxGeometry(w, h, d, 10, 22, 10), p = g.attributes.position, R = rand(seed);
  const ph = [R() * 10, R() * 10, R() * 10], col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / h + 0.5;
    const n = Math.sin(x * 0.11 + ph[0]) * Math.sin(y * 0.07 + ph[1]) + Math.sin(z * 0.13 + y * 0.05 + ph[2]) * 0.6;
    const taper = 1 - Math.pow(t, 2.2) * 0.55;
    x *= taper * (1 + n * 0.12); z *= taper * (1 + n * 0.18);
    y += Math.sin(x * 0.2 + ph[1]) * h * 0.04 * t;
    x += lean * t * h;
    p.setXYZ(i, x, y, z);
    const band = 0.75 + 0.25 * Math.sin(y * 0.6 + n * 2.0) + (R() - 0.5) * 0.08;
    col.set([color[0] * band, color[1] * band, color[2] * band], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, M(0xffffff, 0.95, 0, { vertexColors: true, emissive: new THREE.Color(0, 0, 0) }));
}

// terrain: a grid displaced by a height function, coloured by a colour function
function terrain({ w, d, x = 0, z, segW = 120, segD = 80, height, color }) {
  const g = new THREE.PlaneGeometry(w, d, segW, segD); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) + x, pz = p.getZ(i) + z, y = height(px, pz);
    p.setXYZ(i, px, y, pz);
    c.set(color(px, y, pz), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, M(0xffffff, 0.95, 0, { vertexColors: true }));
}

/* ---------- the venues ---------- */
const BUILDERS = {
  redrocks(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const seats = { z0: 7, z1: 88, y0: 0.2, y1: 42, w0: 34, w1: 74, rows: 70 };
    g.add(rowsRect({ ...seats, mat: M(0x3a2620, 0.9), spots, every: 0.9 }));
    // Ship Rock and Creation Rock, flanking the bowl; a third, lower rock behind the stage
    const ship = monolith({ w: 26, h: 100, d: 110, seed: 11, lean: 0.06 }); ship.position.set(52, 38, 18); ship.rotation.y = 0.12; g.add(ship);
    const creation = monolith({ w: 30, h: 92, d: 90, seed: 5, lean: -0.08 }); creation.position.set(-56, 34, 6); creation.rotation.y = -0.2; g.add(creation);
    const back = monolith({ w: 70, h: 30, d: 20, seed: 9, color: [0.3, 0.1, 0.06] }); back.position.set(-40, 6, -32); g.add(back);
    // the stage roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(def.stage.w + 12, 0.8, def.stage.d + 6), M(0x141416, 0.7));
    roof.position.set(0, def.stage.h + def.rig.h + 3.2, -def.stage.d / 2 + 1); g.add(roof);
    for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, def.stage.h + def.rig.h + 3, 1.2), M(0x151517, 0.7)); col.position.set(s * (def.stage.w / 2 + 5), (def.stage.h + def.rig.h + 3) / 2, -def.stage.d - 1); g.add(col); }
    // the hillside, falling away to the plains and Denver's lights
    g.add(terrain({ w: 1200, d: 900, z: -200, segW: 90, segD: 70,
      height: (x, z) => z > -30 && Math.abs(x) < 90 ? -0.05 : -Math.min(220, Math.max(0, -z - 30) * 0.5) + Math.sin(x * 0.02) * 8 + Math.sin(z * 0.03 + x * 0.01) * 6,
      color: (x, y) => { const k = 0.6 + Math.sin(x * 0.07) * 0.1; return [0.07 * k, 0.04 * k, 0.03 * k]; } }));
    g.add(cityLights(7000, { x: [-2600, 2600], z: [-700, -2800], y: -214, seed: 7, size: 3.2 }));
    g.add(sky('night'));
    return {
      group: g, spots, outdoor: true, fog: [0x05060b, 0.0035],
      // the rocks catch the stage's spill
      tints: [ship, creation, back].map(r => ({ mat: r.material, from: 'wash', gain: 0.09 })),
      crowd: { w: 44, mid: 30, depth: 50 },
      groundAt: (x, z) => rectHeight(seats, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : z < -30 ? -Math.min(220, (-z - 30) * 0.5) : 0),
      shots: { foh: [[6, 14, 52], [0, 6, -4]], wide: [[-20, 50, 86], [0, 6, -8]], side: [[34, 22, 30], [0, 6, -4]], crowd: [[-4, 3, 14], [0, 7, -6]] },
    };
  },

  bowl(def, ctx) {
    const g = new THREE.Group(), spots = [];
    // the shell: concentric rings telescoping back over the stage, white and lit by the washes
    const shellMat = M(0xd9d6cf, 0.6, 0, { emissive: new THREE.Color(0, 0, 0) });
    const H = def.stage.h, rings = 10;
    for (let k = 0; k < rings; k++) {
      const r = 21 - k * 0.75, z0 = 1.2 - k * 1.45, z1 = z0 - 1.45;
      // the upper half of a cylinder lying along z
      const cyl = new THREE.CylinderGeometry(r, r, z0 - z1, 64, 1, true, Math.PI / 2, Math.PI);
      cyl.rotateX(Math.PI / 2); cyl.translate(0, H - 0.3, (z0 + z1) / 2);
      const m = new THREE.Mesh(cyl, shellMat); m.material.side = THREE.DoubleSide; g.add(m);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 8, 72, Math.PI), shellMat);
      lip.position.set(0, H - 0.3, z0); g.add(lip);
    }
    const seats = { cz: 3, r0: 9, r1: 118, y0: 0.1, y1: 30, rows: 100, phi0: -1.1, phi1: 1.1 };
    g.add(rowsArc({ ...seats, mat: M(0x262a30, 0.9), spots, every: 1.0, seg: 72 }));
    // the hills round the bowl, and LA's glow
    g.add(terrain({ w: 1600, d: 1600, z: 0, segW: 120, segD: 120,
      height: (x, z) => { const r = Math.hypot(x, z - 40); return r < 140 ? Math.max(0, (z - 3)) * 0.0 - 0.1 : (r - 140) * 0.25 + Math.sin(x * 0.012) * 40 + Math.sin(z * 0.017 + 1) * 30 + 10; },
      color: () => [0.025, 0.03, 0.025] }));
    g.add(cityLights(2500, { x: [-1400, 1400], z: [500, 900], y: 30, seed: 4, size: 2.6 }));
    g.add(sky('la'));
    return {
      group: g, spots, outdoor: true, fog: [0x07070d, 0.003],
      crowd: { w: 70, mid: 40, depth: 70 }, tints: [{ mat: shellMat, from: 'wash', gain: 0.55 }],
      groundAt: (x, z) => arcHeight(seats, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[4, 12, 48], [0, 6, -4]], wide: [[-30, 40, 120], [0, 6, -6]] },
    };
  },

  msg(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const C = 24, phi = 2.35;
    const lower = { cx: 0, cz: C, r0: 30, r1: 46, y0: 1.2, y1: 15, rows: 20, phi0: -phi, phi1: phi, ell: [0.8, 1] };
    const upper = { cx: 0, cz: C, r0: 49, r1: 66, y0: 19, y1: 40, rows: 22, phi0: -phi, phi1: phi, ell: [0.8, 1] };
    const seatMat = M(0x1b1e2a, 0.85);
    g.add(rowsArc({ ...lower, mat: seatMat, spots, every: 0.9, seg: 96 }));
    g.add(rowsArc({ ...upper, mat: seatMat.clone(), spots, every: 1.0, seg: 96 }));
    // ribbon boards on the fascia between the tiers play the screen visuals
    g.add(band({ cz: C, r: 47.5, ell: [0.8, 1], y0: 16.2, y1: 18.2, phi0: -phi, phi1: phi, mat: ctx.screenMat, screen: true }));
    g.add(band({ cz: C, r: 29.6, ell: [0.8, 1], y0: 0.1, y1: 1.3, phi0: -phi, phi1: phi, mat: ctx.screenMat, screen: true }));
    // the round wall and the cable-hung ceiling with its spokes
    g.add(band({ cz: C, r: 70, ell: [0.8, 1], y0: 0, y1: 52, phi0: -Math.PI, phi1: Math.PI, mat: M(0x0b0c12, 0.9) }));
    const roofMat = M(0x161922, 0.8, 0.2);
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(70, 64), roofMat); ceil.rotation.x = Math.PI / 2; ceil.scale.set(0.8, 1, 1); ceil.position.set(0, 52, C); g.add(ceil);
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * TAU, spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 66), M(0x2a2e3a, 0.5, 0.6));
      spoke.position.set(Math.sin(a) * 33 * 0.8, 51, C + Math.cos(a) * 33); spoke.rotation.y = a; spoke.scale.x = 1; g.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3, 32), M(0x22252e, 0.5, 0.6)); hub.position.set(0, 50, C); g.add(hub);
    // the bridges hung over the upper seats
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 70), M(0x1f2330, 0.6, 0.4)); b.position.set(s * 42, 42, C); g.add(b); }
    // general admission floor
    for (let z = 3; z < 44; z += 0.85) for (let x = -19; x < 19; x += 0.8) spots.push([x + (Math.random() - 0.5) * 0.4, 0, z + (Math.random() - 0.5) * 0.4]);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(60, 80).rotateX(-Math.PI / 2).translate(0, 0, C), M(0x0d0e12, 0.6)));
    return {
      group: g, spots, outdoor: false, fog: [0x020306, 0.006],
      crowd: { w: 38, mid: 22, depth: 40 },
      groundAt: (x, z) => arcHeight(lower, x, z) ?? arcHeight(upper, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[3, 11, 46], [0, 7, -4]], wide: [[-30, 46, 64], [0, 6, 0]], side: [[36, 20, 16], [0, 6, -4]] },
    };
  },

  sphere(def, ctx) {
    const g = new THREE.Group(), spots = [];
    // the dome itself plays the screen's visuals, dimmer than the LED wall would be
    const dm = ctx.screenMat.clone();
    dm.uniforms = { ...ctx.screenU, uGain: { value: 0.75 } }; dm.defines = { DOME: 1 }; dm.side = THREE.BackSide;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(78, 96, 64, 0, TAU, 0, Math.PI * 0.64), dm);
    dome.position.set(0, -8, 30); g.add(dome);
    const seats = { z0: 12, z1: 70, y0: 0.6, y1: 46, w0: 46, w1: 96, rows: 58 };
    g.add(rowsRect({ ...seats, mat: M(0x14141c, 0.9), spots, every: 0.95 }));
    for (let z = 2; z < 12; z += 0.8) for (let x = -20; x < 20; x += 0.8) spots.push([x + (Math.random() - 0.5) * 0.3, 0, z]);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(76, 64).rotateX(-Math.PI / 2), M(0x09090d, 0.6)); floor.position.set(0, -0.02, 30); g.add(floor);
    return {
      group: g, spots, outdoor: false, fog: [0x000000, 0.002], dome: dm,
      crowd: { w: 60, mid: 26, depth: 50 },
      groundAt: (x, z) => rectHeight(seats, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[2, 26, 50], [0, 18, -10]], wide: [[0, 44, 70], [0, 24, 0]], crowd: [[-4, 3, 14], [0, 10, -6]], dome: [[0, 16, 30], [0, 44, -20]] },
    };
  },

  ryman(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const wood = M(0x3a2414, 0.75), wall = M(0x2a1a12, 0.9);
    const pews = { cz: -1, r0: 5, r1: 27, y0: 0, y1: 2.6, rows: 22, phi0: -1.0, phi1: 1.0, ell: [0.72, 1] };
    g.add(rowsArc({ ...pews, mat: wood, spots, every: 0.7, seg: 48 }));
    const bal = { cz: -1, r0: 25.5, r1: 33, y0: 6.4, y1: 11, rows: 8, phi0: -1.35, phi1: 1.35, ell: [0.56, 1] };
    g.add(rowsArc({ ...bal, mat: wood.clone(), spots, every: 0.75, seg: 60 }));
    const trim = M(0x8a6a35, 0.4, 0.6);
    g.add(band({ cz: -1, r: 25.4, ell: [0.56, 1], y0: 5.6, y1: 7.2, phi0: -1.35, phi1: 1.35, mat: trim }));
    for (let k = 0; k <= 12; k++) { const a = -1.3 + k * 2.6 / 12, col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.6, 10), trim); col.position.set(Math.sin(a) * 25.4 * 0.56, 2.8, -1 + Math.cos(a) * 25.4); g.add(col); }
    // the hall: walls, a gabled ceiling with beams
    const box = new THREE.Mesh(new THREE.BoxGeometry(38, 22, 50), wall); box.material.side = THREE.BackSide; box.position.set(0, 11, 15); g.add(box);
    for (let z = -8; z < 40; z += 4) { const beam = new THREE.Mesh(new THREE.BoxGeometry(38, 0.6, 0.5), wood); beam.position.set(0, 20.5, z); g.add(beam); }
    // stained glass: pointed windows down both side walls, glowing faintly
    const glass = canvasTex(128, 320, (x, w, h) => {
      const R = rand(2), cols = ['#b8322a', '#2a62b8', '#d4a52a', '#2a9a5a', '#7a3ab0', '#e07a2a'];
      x.fillStyle = '#100a06'; x.fillRect(0, 0, w, h);
      x.save(); x.beginPath(); x.moveTo(6, h); x.lineTo(6, 70); x.quadraticCurveTo(6, 6, w / 2, 0); x.quadraticCurveTo(w - 6, 6, w - 6, 70); x.lineTo(w - 6, h); x.closePath(); x.clip();
      for (let yy = 0; yy < h; yy += 22) for (let xx = 0; xx < w; xx += 22) { x.fillStyle = cols[Math.floor(R() * cols.length)]; x.fillRect(xx + 1, yy + 1, 20, 20); }
      x.restore();
    });
    const winMat = new THREE.MeshBasicMaterial({ map: glass, color: new THREE.Color(0.55, 0.55, 0.55), toneMapped: false });
    for (const s of [-1, 1]) for (let z = 2; z < 38; z += 6.5) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6), winMat); w.position.set(s * 18.9, 14, z); w.rotation.y = -s * Math.PI / 2; g.add(w); }
    const big = new THREE.Mesh(new THREE.PlaneGeometry(6, 9), winMat); big.position.set(0, 14, 39.9); big.rotation.y = Math.PI; g.add(big);
    return {
      group: g, spots, outdoor: false, fog: [0x050302, 0.012], tints: [{ mat: trim, from: 'wash', gain: 0.12 }],
      crowd: { w: 30, mid: 13, depth: 20 },
      groundAt: (x, z) => arcHeight(bal, x, z) ?? arcHeight(pews, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[2, 5.5, 22], [0, 4, -3]], wide: [[-6, 13.5, 28], [0, 4, -3]], side: [[12, 8, 6], [0, 3.5, -3]] },
    };
  },

  radiocity(def, ctx) {
    const g = new THREE.Group(), spots = [];
    // the great arches: half-ellipses telescoping out from the proscenium over the hall
    const gold = M(0x6a4a24, 0.45, 0.55, { emissive: new THREE.Color(0, 0, 0) });
    const cove = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    const N = 8, step = 7.6;
    const E = k => [17 + k * 4.6, 14 + k * 2.6];
    for (let k = 0; k < N; k++) {
      const [rx, ry] = E(k), z0 = 0.5 + k * step, z1 = z0 + step;
      const shell = new THREE.CylinderGeometry(1, 1, z1 - z0, 80, 1, true, Math.PI / 2, Math.PI);
      shell.rotateX(Math.PI / 2);
      const p = shell.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) + (z0 + z1) / 2);
      shell.computeVertexNormals();
      const sm = new THREE.Mesh(shell, gold); sm.material.side = THREE.DoubleSide; g.add(sm);
      if (k < N - 1) {
        // the step between this arch and the next, with a cove light along its edge
        const [nx, ny] = E(k + 1), pos = [], idx = [];
        for (let s = 0; s <= 80; s++) { const a = s / 80 * Math.PI; pos.push(Math.cos(a) * rx, Math.sin(a) * ry, z1, Math.cos(a) * nx, Math.sin(a) * ny, z1); if (s) { const n = (s - 1) * 2; idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); } }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
        const stepM = new THREE.Mesh(sg, gold); g.add(stepM);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 96, Math.PI), cove);
        lip.scale.set(rx + 0.3, ry + 0.3, 12); lip.position.z = z1 - 0.05; g.add(lip);
      }
    }
    const seats = { z0: 4, z1: 46, y0: 0, y1: 4.5, w0: 32, w1: 62, rows: 38 };
    g.add(rowsRect({ ...seats, mat: M(0x3a1010, 0.9), spots, every: 0.75 }));
    const mezz = [];
    for (const [y, z0] of [[8, 40], [12.5, 46], [17, 52]]) {
      const mz = { z0, z1: z0 + 9, y0: y, y1: y + 3, w0: 64, w1: 70, rows: 6 };
      mezz.push(mz);
      g.add(rowsRect({ ...mz, mat: M(0x2a0c0c, 0.9), spots, every: 0.9 }));
      const lip = new THREE.Mesh(new THREE.BoxGeometry(64, 1.2, 0.5), gold); lip.position.set(0, y - 0.2, z0); g.add(lip);
    }
    // the gold contour curtain behind the LED wall
    const curtain = canvasTex(1024, 256, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 40; i++) gr.addColorStop(i / 40, i % 2 ? '#8a6020' : '#d8a848');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      const v = x.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0.5)'); v.addColorStop(0.7, 'rgba(0,0,0,0)'); x.fillStyle = v; x.fillRect(0, 0, w, h);
    });
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(def.stage.w + 4, 15), M(0xffffff, 0.6, 0.2, { map: curtain }));
    cur.position.set(0, def.stage.h + 7.5, -def.stage.d - 0.3); g.add(cur);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), M(0x100806, 0.9)); back.position.set(0, 20, 62); back.rotation.y = Math.PI; g.add(back);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(90, 80).rotateX(-Math.PI / 2).translate(0, 0, 25), M(0x120808, 0.8)));
    return {
      group: g, spots, outdoor: false, fog: [0x060302, 0.008],
      tints: [{ mat: gold, from: 'wash', gain: 0.1 }, { mat: cove, from: 'wash', gain: 2.2, basic: true }],
      crowd: { w: 44, mid: 22, depth: 40 },
      groundAt: (x, z) => rectHeight(mezz[2], x, z) ?? rectHeight(mezz[1], x, z) ?? rectHeight(mezz[0], x, z) ?? rectHeight(seats, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[2, 9, 32], [0, 8, -4]], wide: [[0, 14, 37.5], [0, 9, -2]], side: [[14, 7, 14], [0, 6, -4]] },
    };
  },

  gorge(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const lawnY = (x, z) => z < 14 ? 0 : (z - 14) * 0.17 + Math.pow(Math.max(0, Math.abs(x) - 30) * 0.08, 2);
    const lawn = terrain({ w: 200, d: 170, z: 85, segW: 80, segD: 70, height: (x, z) => z < 6 ? -0.02 : lawnY(x, z),
      color: (x, y, z) => { const k = 0.8 + Math.sin(x * 0.3) * Math.sin(z * 0.2) * 0.1; return [0.035 * k, 0.06 * k, 0.03 * k]; } });
    g.add(lawn);
    const R = rand(8);
    for (let i = 0; i < 9000; i++) { const z = 15 + Math.pow(R(), 0.8) * 120, w = 36 + z * 0.3, x = (R() - 0.5) * 2 * w; spots.push([x, lawnY(x, z), z]); }
    for (let z = 4; z < 14; z += 0.8) for (let x = -24; x < 24; x += 0.8) spots.push([x, 0, z]);
    // the canyon: the land drops away behind the stage to the river, with cliffs beyond
    g.add(terrain({ w: 3000, d: 366, z: -177, segW: 120, segD: 60,
      height: (x, z) => -Math.min(170, Math.max(0, -z - 26) * 1.2) + Math.sin(x * 0.01) * 10,
      color: (x, y) => [0.05, 0.04, 0.035] }));
    g.add(terrain({ w: 4000, d: 700, z: -880, segW: 160, segD: 70,
      height: (x, z) => { const t = (-z - 560) / 650; return -175 + Math.max(0, t) * 240 + Math.sin(x * 0.006) * 40 * t + Math.sin(x * 0.021 + z * 0.01) * 14; },
      color: (x, y) => { const band = 0.7 + 0.3 * Math.sin(y * 0.12); return [0.16 * band, 0.1 * band, 0.07 * band]; } }));
    const river = new THREE.Mesh(new THREE.PlaneGeometry(4000, 260).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a2a44, fog: false }));
    river.position.set(0, -172, -470); g.add(river);
    g.add(cityLights(140, { x: [-1500, 1500], z: [-700, -1100], y: -40, seed: 12, size: 3 }));
    g.add(sky('dusk'));
    return {
      group: g, spots, outdoor: true, fog: [0x1a1420, 0.0016],
      crowd: { w: 70, mid: 46, depth: 90 },
      groundAt: (x, z) => z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : z < -26 ? -Math.min(170, (-z - 26) * 1.2) : z < 6 ? 0 : lawnY(x, z),
      shots: { foh: [[6, 12, 56], [0, 6, -6]], wide: [[-40, 34, 130], [0, 2, -30]], side: [[40, 14, 26], [0, 6, -6]] },
    };
  },

  sofi(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const C = 70, phi = 2.5;
    const lower = { cz: C, r0: 62, r1: 88, y0: 2, y1: 22, rows: 26, phi0: -phi, phi1: phi, ell: [0.78, 1] };
    const upper = { cz: C, r0: 94, r1: 128, y0: 28, y1: 66, rows: 32, phi0: -phi, phi1: phi, ell: [0.78, 1] };
    g.add(rowsArc({ ...lower, mat: M(0x1a2330, 0.85), spots, every: 1.6, seg: 120 }));
    g.add(rowsArc({ ...upper, mat: M(0x161d28, 0.85), spots, every: 1.9, seg: 120 }));
    g.add(band({ cz: C, r: 90.5, ell: [0.78, 1], y0: 23.5, y1: 26.5, phi0: -phi, phi1: phi, mat: ctx.screenMat, screen: true }));
    // the Infinity Screen: an oval, double-sided, hanging over the field
    const ring = band({ cz: C, r: 36, ell: [1, 0.62], y0: 46, y1: 60, phi0: -Math.PI, phi1: Math.PI, seg: 128, mat: ctx.screenMat, screen: true });
    g.add(ring);
    // the translucent roof canopy, ribbed
    const roofTex = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#0d1520'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(140,180,220,0.35)'; x.lineWidth = 2;
      for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * w / 16, 0); x.lineTo(i * w / 16, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 16); x.lineTo(w, i * h / 16); x.stroke(); }
    }, [6, 6]);
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 20, 0, TAU, 0, 1.15), M(0x223040, 0.4, 0.1, { map: roofTex, transparent: true, opacity: 0.8, side: THREE.BackSide, emissive: new THREE.Color(0.02, 0.03, 0.05), emissiveMap: roofTex }));
    roof.scale.set(150, 40, 175); roof.position.set(0, 60, C); g.add(roof);
    g.add(band({ cz: C, r: 134, ell: [0.78, 1], y0: 0, y1: 70, phi0: -Math.PI, phi1: Math.PI, mat: M(0x080b10, 0.9) }));
    for (let z = 5; z < 92; z += 1.2) for (let x = -34; x < 34; x += 1.1) spots.push([x + (Math.random() - 0.5) * 0.5, 0, z]);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(220, 260).rotateX(-Math.PI / 2).translate(0, 0, C), M(0x0a0d0a, 0.7)));
    return {
      group: g, spots, outdoor: false, fog: [0x03050a, 0.0028],
      crowd: { w: 66, mid: 45, depth: 90 },
      groundAt: (x, z) => arcHeight(lower, x, z) ?? arcHeight(upper, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[8, 22, 110], [0, 14, -6]], wide: [[-50, 72, 150], [0, 12, 8]], side: [[70, 30, 40], [0, 10, -6]], crowd: [[-6, 3, 30], [0, 12, -6]] },
    };
  },

  fillmore(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const damask = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#3a0910'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(120,30,40,0.55)';
      for (const [cx, cy] of [[64, 64], [192, 192], [192, 64], [64, 192]]) { x.beginPath(); x.ellipse(cx, cy, 26, 44, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(cx, cy, 44, 16, 0, 0, TAU); x.fill(); }
    }, [12, 4]);
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 13, 40), M(0xffffff, 0.9, 0, { map: damask })); room.material.side = THREE.BackSide; room.position.set(0, 6.5, 11); g.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 40).rotateX(-Math.PI / 2), M(0x2a1a10, 0.35)); floor.position.set(0, 0.01, 11); g.add(floor);
    // the balcony: down both sides and across the back
    const balMat = M(0x2a1210, 0.8), rail = M(0x8a6a35, 0.4, 0.6);
    for (const [x, z, w, d] of [[-12.5, 14, 5, 24], [12.5, 14, 5, 24], [0, 27.5, 30, 6]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), balMat); b.position.set(x, 4.2, z); g.add(b);
      for (let i = 0; i < Math.floor(w * d / 1.6); i++) spots.push([x + (Math.random() - 0.5) * (w - 1), 4.45, z + (Math.random() - 0.5) * (d - 1)]);
    }
    for (const [x, z, w, d] of [[-10, 14, 0.12, 24], [10, 14, 0.12, 24], [0, 24.5, 20, 0.12]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), rail); r.position.set(x, 5, z); g.add(r); }
    // chandeliers: clusters of warm crystals
    const crystal = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.8), toneMapped: false });
    const cg = mergeGeometries(Array.from({ length: 40 }, (_, i) => { const s = new THREE.SphereGeometry(0.07, 6, 4); const a = i * 2.4, r = 0.3 + (i % 5) * 0.12; s.translate(Math.cos(a) * r, -(i % 5) * 0.2, Math.sin(a) * r); return s; }));
    const chandeliers = [];
    for (const [x, z] of [[-6, 6], [6, 6], [0, 12], [-6, 18], [6, 18]]) { const c = new THREE.Mesh(cg, crystal); c.position.set(x, 10.6, z); g.add(c); chandeliers.push(c); }
    const curtain = canvasTex(512, 128, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 30; i++) gr.addColorStop(i / 30, i % 2 ? '#4a0810' : '#8a1820'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(def.stage.w + 2, 7), M(0xffffff, 0.8, 0, { map: curtain })); cur.position.set(0, def.stage.h + 3.5, -def.stage.d - 0.2); g.add(cur);
    for (let z = 1.5; z < 23; z += 0.65) for (let x = -9.5; x < 9.5; x += 0.65) spots.push([x + (Math.random() - 0.5) * 0.3, 0, z]);
    return {
      group: g, spots, outdoor: false, fog: [0x080203, 0.02], tints: [{ mat: crystal, from: 'house', gain: 1, basic: true, base: [0.35, 0.26, 0.17], peak: [1.6, 1.2, 0.8] }],
      crowd: { w: 18, mid: 9, depth: 18 },
      groundAt: (x, z) => z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : (Math.abs(x) > 10 && z > 2 && z < 26) || z > 24.5 ? 4.45 : 0,
      shots: { foh: [[1.5, 3.8, 17], [0, 3.2, -3]], wide: [[-6, 7.5, 27], [0, 3, -3]], side: [[9, 5.5, 4], [0, 3, -3]] },
    };
  },

  acl(def, ctx) {
    const g = new THREE.Group(), spots = [];
    const wall = M(0x0e0f14, 0.9);
    const room = new THREE.Mesh(new THREE.BoxGeometry(36, 24, 46), wall); room.material.side = THREE.BackSide; room.position.set(0, 12, 12); g.add(room);
    const seats = { z0: 3, z1: 24, y0: 0, y1: 2.4, w0: 24, w1: 30, rows: 18 };
    g.add(rowsRect({ ...seats, mat: M(0x1a1c24, 0.9), spots, every: 0.7 }));
    // three tiers of balconies wrapping close to the stage
    const balMat = M(0x16181f, 0.8), edge = M(0x2a2e3a, 0.5, 0.5);
    for (const [y, inset] of [[5.4, 0], [10, 1.5], [14.6, 3]]) {
      for (const [x, z, w, d] of [[-15.5 + inset * 0.3, 12, 5, 22], [15.5 - inset * 0.3, 12, 5, 22], [0, 30 - inset, 36, 7]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), balMat); b.position.set(x, y, z); g.add(b);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(w > 10 ? w : 0.3, 1.1, w > 10 ? 0.3 : d), edge); lip.position.set(w > 10 ? x : x - Math.sign(x) * w / 2, y + 0.6, w > 10 ? z - d / 2 : z); g.add(lip);
        for (let i = 0; i < Math.floor(w * d / 1.5); i++) spots.push([x + (Math.random() - 0.5) * (w - 1), y + 0.3, z + (Math.random() - 0.5) * (d - 1)]);
      }
    }
    // the skyline: the screen's visuals play as the sky, behind lit towers and the Capitol
    const { w: sw, h: sh } = def.screen, H = def.stage.h;
    const skyM = new THREE.Mesh(withAspect(new THREE.PlaneGeometry(sw, sh), sw / sh), ctx.screenMat);
    skyM.position.set(0, H + sh / 2, -def.stage.d + 0.3); g.add(skyM);
    const city = canvasTex(1536, 640, (x, w, h) => {
      const R = rand(21);
      x.clearRect(0, 0, w, h);
      const tower = (cx, tw, th, spire) => {
        x.fillStyle = '#05060a'; x.fillRect(cx - tw / 2, h - th, tw, th);
        if (spire) { x.beginPath(); x.moveTo(cx - tw / 2, h - th); x.lineTo(cx, h - th - spire); x.lineTo(cx + tw / 2, h - th); x.fill(); }
        for (let yy = h - th + 8; yy < h - 6; yy += 11) for (let xx = cx - tw / 2 + 5; xx < cx + tw / 2 - 6; xx += 9) if (R() < 0.42) { x.fillStyle = `rgba(255,${200 + R() * 40 | 0},${120 + R() * 60 | 0},${0.5 + R() * 0.5})`; x.fillRect(xx, yy, 4, 5); }
      };
      for (let i = 0; i < 26; i++) tower(R() * w, 40 + R() * 70, 120 + R() * 220, 0);
      tower(w * 0.3, 90, 470, 90); tower(w * 0.68, 110, 420, 0); tower(w * 0.8, 70, 360, 40); tower(w * 0.18, 80, 330, 0);
      // the Capitol: drum and dome on a low wing
      x.fillStyle = '#05060a'; x.fillRect(w * 0.5 - 150, h - 110, 300, 110); x.fillRect(w * 0.5 - 40, h - 200, 80, 90);
      x.beginPath(); x.ellipse(w * 0.5, h - 200, 56, 70, 0, Math.PI, 0); x.fill(); x.fillRect(w * 0.5 - 5, h - 300, 10, 40);
    });
    const cityM = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: city, transparent: true, alphaTest: 0.02, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
    cityM.position.set(0, H + sh / 2, -def.stage.d + 0.5); g.add(cityM);
    return {
      group: g, spots, outdoor: false, fog: [0x030305, 0.014], screens: [skyM],
      crowd: { w: 26, mid: 12, depth: 20 },
      groundAt: (x, z) => rectHeight(seats, x, z) ?? (z <= 0 && z >= -def.stage.d && Math.abs(x) <= def.stage.w / 2 ? def.stage.h : 0),
      shots: { foh: [[2, 6.5, 22], [0, 5, -4]], wide: [[-4, 19.8, 23.6], [0, 5, -4]], side: [[11, 8.5, 9], [0, 4, -4]] },
    };
  },
};

export function buildVenue(id, def, ctx) {
  const v = BUILDERS[id](def, ctx);
  const { w, d, h } = def.stage;
  const c = v.crowd;
  // shots every venue has, filled from its size unless the builder chose its own
  const S = {
    foh: [[2, h + 6, c.mid + 12], [0, h + 4, -d * 0.4]],
    crowd: [[-3, 2.6, Math.max(6, c.mid * 0.35)], [0, h + 5, -d * 0.4]],
    stage: [[w * 0.18, h + 2.2, -d * 0.75], [0, h + 2, c.mid]],
    side: [[w * 0.75, h + 6, 6], [0, h + 3, -d * 0.4]],
    wide: [[-c.w * 0.4, h + 18, c.mid + c.depth * 0.7], [0, h + 4, -d * 0.3]],
    drone: [[0, h + def.rig.h * 2, c.mid * 0.6], [0, h, -d * 0.4]],
  };
  v.shots = { ...S, ...(v.shots || {}) };
  v.tints = v.tints || [];
  return v;
}

/* ---------- the crowd ---------- */
// silhouettes that bob to the beat, a share with their arms up, and phone lights
export function buildCrowd(spots, budget, stageZ = -4) {
  const g = new THREE.Group();
  const R = rand(99);
  const pick = spots.length > budget ? spots.filter(() => R() < budget / spots.length) : spots;
  const body = (arms) => {
    const parts = [];
    const t = new THREE.CapsuleGeometry(0.2, 0.75, 3, 7); t.translate(0, 0.72, 0); parts.push(t);
    const hd = new THREE.SphereGeometry(0.12, 8, 6); hd.translate(0, 1.42, 0); parts.push(hd);
    if (arms) for (const s of [-1, 1]) { const a = new THREE.CapsuleGeometry(0.05, 0.6, 2, 5); a.rotateZ(s * 0.35); a.translate(s * 0.28, 1.65, 0); parts.push(a); }
    return mergeGeometries(parts);
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.8 });
  const uni = { uBeat: { value: 0 }, uJump: { value: 0 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPh; uniform float uBeat, uJump;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bob = max(0.0, sin(3.14159 * fract(uBeat + aPh * 0.15)));
        transformed.y += bob * uJump * (aPh > 0.55 ? 0.32 : 0.1);
        transformed.x += sin(uBeat * 1.5708 + aPh * 6.0) * 0.05 * position.y;`);
  };
  const split = Math.floor(pick.length * 0.78);
  const groups = [[pick.slice(0, split), body(false)], [pick.slice(split), body(true)]];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [list, geo] of groups) {
    if (!list.length) continue;
    const ph = new Float32Array(list.length);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z], i) => {
      q.setFromAxisAngle(up, Math.atan2(-x, stageZ - z) + (R() - 0.5) * 0.5);
      const k = 0.88 + R() * 0.24;
      m4.compose(p.set(x, y, z), q, s.set(k, k * (0.92 + R() * 0.16), k)); mesh.setMatrixAt(i, m4);
      ph[i] = R();
    });
    geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
    g.add(mesh);
  }
  // phones held up
  const nP = Math.floor(pick.length * 0.07), pp = new Float32Array(nP * 3), pc = new Float32Array(nP * 3);
  for (let i = 0; i < nP; i++) { const [x, y, z] = pick[Math.floor(R() * pick.length)]; pp.set([x + (R() - 0.5) * 0.3, y + 1.9 + R() * 0.3, z], i * 3); const k = 0.6 + R() * 0.4; pc.set([0.8 * k, 0.9 * k, 1 * k], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  { const x = dot.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); }
  const phones = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.22, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  phones.frustumCulled = false; g.add(phones);
  return {
    group: g, count: pick.length,
    update(beat, jump, phoneLevel) { uni.uBeat.value = beat; uni.uJump.value = jump; phones.material.opacity = phoneLevel; },
  };
}
