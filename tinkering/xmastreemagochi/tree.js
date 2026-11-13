/* A procedural fir. One layout per specimen (seeded), drawn two ways:
   'geo'  – every needle is real geometry, for close inspection and the living room
   'card' – needle sprays painted on crossed cards, for the fifteen trees on the lot */
import * as THREE from 'three';
import { SPECIES, heightM } from './species.js';
import { rng, clamp, lerp, TAU, canvasTexture } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const sprayGeoCache = new Map();
const cardTexCache = new Map();

/* ---------- Layout ---------- */
export function layoutTree(spec) {
  const S = SPECIES[spec.species];
  const r = rng(spec.seed);
  const H = heightM(spec);
  const yb = spec.handleIn * 0.0254 + 0.06;
  const R = (H * S.width * spec.fullness) / 2;
  const profile = y => (y < yb ? 0 : R * Math.pow(clamp((H - y) / (H - yb)), S.taper) * (0.9 + 0.1 * clamp((y - yb) / 0.3)));
  const trunkR = y => lerp(0.012 + H * 0.017, 0.004, clamp(y / H));

  const sprays = [];   // { p, d, u, s }
  const branches = []; // { a, b, r } woody segments
  const hang = [];     // { p, out }
  const angDist = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);

  const addSpray = (p, d, u, s) => sprays.push({ p: p.clone(), d: d.clone().normalize(), u: u.clone(), s });

  let y = yb + 0.04 + r() * 0.05;
  let whorl = 0;
  const top = H - 0.28;
  while (y < top) {
    const k = clamp((y - yb) / (top - yb));
    const n = Math.max(3, S.perWhorl + r.int(-1, 1) - (k > 0.85 ? 1 : 0));
    const base = r() * TAU;
    for (let i = 0; i < n; i++) {
      const ang = base + (i / n) * TAU + r.range(-0.25, 0.25);
      let L = profile(y) * r.range(0.82, 1.06);
      const near = angDist(ang, spec.bareAngle);
      if (near < 1.0) L *= 1 - spec.bare * (1 - near / 1.0);
      if (L < 0.05) continue;
      branch(y, ang, L, k, 1);
    }
    // a few short twigs between whorls
    const inter = Math.round(S.perWhorl * 0.9);
    for (let i = 0; i < inter; i++) {
      const yy = y + S.gap * r.range(0.3, 0.75);
      if (yy > top) break;
      const ang = r() * TAU;
      let L = profile(yy) * r.range(0.4, 0.7);
      const near = angDist(ang, spec.bareAngle);
      if (near < 1.0) L *= 1 - spec.bare * (1 - near / 1.0);
      if (L > 0.05) branch(yy, ang, L, k, 0.55);
    }
    y += S.gap * r.range(0.82, 1.18) * lerp(1, 0.72, k);
    whorl++;
  }

  function branch(y0, ang, L, k, weight) {
    const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const tilt = S.tilt + r.range(-0.12, 0.12) + k * 0.15;
    const droop = S.droop * r.range(0.7, 1.3) * (1 - k * 0.5);
    const start = new THREE.Vector3(out.x * trunkR(y0), y0, out.z * trunkR(y0));
    const at = t => start.clone()
      .addScaledVector(out, t * L)
      .addScaledVector(UP, t * L * Math.tan(tilt) - droop * L * t * t);
    // woody segments
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      branches.push({ a: at(i / segs), b: at((i + 1) / segs), r: lerp(0.006 + L * 0.012, 0.0025, i / segs) * (weight > 0.8 ? 1 : 0.7) });
    }
    const side = new THREE.Vector3().crossVectors(UP, out).normalize();
    const sprayLen = S.sprayLen;
    // laterals in alternating pairs, each fanning into sub-laterals like a real fir frond
    const gap = S.latGap / spec.fullness;
    const sideOf = d => new THREE.Vector3().crossVectors(UP, d).normalize();
    const jit = (d, k = 0.12) => d.clone().add(new THREE.Vector3(r.range(-k, k), r.range(-k * 0.6, k * 0.6), r.range(-k, k))).normalize();
    for (let t = 0.1 + r() * 0.05; t < 0.98; t += (gap / L) * r.range(0.85, 1.15)) {
      const p = at(t);
      const tangent = at(Math.min(1, t + 0.02)).sub(at(Math.max(0, t - 0.02))).normalize();
      const len = (((1 - t) * 0.6 + 0.25) * L * 0.62 + 0.05) * weight;
      for (const sgn of [-1, 1]) {
        if (r() < 0.08) continue;
        const a = S.latAngle * r.range(0.8, 1.1);
        const dd = tangent.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, sgn * Math.sin(a));
        dd.y += S.tilt * 0.3 - S.droop * 0.3;
        dd.normalize();
        const steps = Math.max(1, Math.round(len / (sprayLen * 0.75)));
        const q = p.clone();
        for (let j = 0; j < steps; j++) {
          const s = r.range(0.9, 1.15) * (1 - (j / steps) * 0.2);
          dd.y -= S.droop * 0.12; dd.normalize();
          addSpray(q, jit(dd), UP, s);
          const sd0 = sideOf(dd);
          for (const sub of [-1, 1]) {
            if (r() < 0.22) continue;
            const sd = dd.clone().multiplyScalar(Math.cos(0.85)).addScaledVector(sd0, sub * Math.sin(0.85)).normalize();
            addSpray(q.clone().addScaledVector(dd, sprayLen * s * 0.3), jit(sd, 0.18), UP, s * 0.78);
          }
          q.addScaledVector(dd, sprayLen * s * 0.75);
        }
        if (weight > 0.8 && t > 0.3 && r() < 0.28) hang.push({ p: q.clone().add(new THREE.Vector3(0, -0.012, 0)), out: dd.clone().setY(0).normalize() });
      }
      // spray on the branch itself
      addSpray(p, jit(tangent, 0.2), UP, r.range(0.9, 1.2));
    }
    // leading tip
    addSpray(at(1), at(1).sub(at(0.9)).normalize(), UP, 1.1);
    if (weight > 0.8 && L > 0.12) {
      for (const t of [0.72, 0.86, 1.0]) {
        const p = at(t).addScaledVector(out, 0.04);
        p.y -= 0.02;
        hang.push({ p, out: out.clone() });
      }
    }
  }

  // an outer shell of sprays that fills the silhouette, rolled so some face the viewer
  const shellN = Math.round((H - yb) * R * 1400 * spec.fullness);
  for (let i = 0; i < shellN; i++) {
    const yy = lerp(yb + 0.08, top, Math.pow(r(), 0.85));
    const ang = r() * TAU;
    const near = angDist(ang, spec.bareAngle);
    if (near < 1.0 && r() < spec.bare * (1 - near / 1.0) * 1.3) continue;
    const rad = profile(yy) * r.range(0.62, 0.98);
    const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const p = new THREE.Vector3(out.x * rad, yy, out.z * rad);
    const tangent = new THREE.Vector3(-out.z, 0, out.x);
    const d = out.clone().multiplyScalar(r.range(0.5, 1)).addScaledVector(tangent, r.range(-0.8, 0.8));
    d.y = S.tilt * 0.6 - S.droop * 0.8 + r.range(-0.25, 0.2);
    const u = UP.clone().multiplyScalar(r.range(0.4, 1)).addScaledVector(out, r.range(-0.6, 0.9)).normalize();
    addSpray(p, d, u, r.range(0.8, 1.1));
  }

  // leader: a vertical tuft and a top point for the topper
  const leaderBase = top;
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const yy = lerp(leaderBase, H - 0.02, t);
    const a = r() * TAU;
    const d = new THREE.Vector3(Math.cos(a) * 0.6, 1.4 + t, Math.sin(a) * 0.6);
    addSpray(new THREE.Vector3(Math.cos(a) * 0.01, yy, Math.sin(a) * 0.01), d, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), lerp(1, 0.6, t));
  }
  branches.push({ a: new THREE.Vector3(0, 0, 0), b: new THREE.Vector3(0, H, 0), r: trunkR(0), trunk: true });

  // shuffle so thinning removes evenly
  for (let i = sprays.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sprays[i], sprays[j]] = [sprays[j], sprays[i]]; }

  let nest = null;
  if (spec.nest) {
    const yy = lerp(yb, H, 0.42);
    const a = spec.bareAngle + Math.PI;
    nest = new THREE.Vector3(Math.cos(a) * profile(yy) * 0.35, yy, Math.sin(a) * profile(yy) * 0.35);
  }

  return { H, R, yb, profile, trunkR, sprays, branches, hang, top: new THREE.Vector3(0, H, 0), nest };
}

/* ---------- Spray geometry (one twig with real needles, along +x, length 1) ---------- */
function sprayGeometry(speciesKey) {
  if (sprayGeoCache.has(speciesKey)) return sprayGeoCache.get(speciesKey);
  const S = SPECIES[speciesKey];
  const N = S.needle;
  const L = S.sprayLen;
  const pos = [], col = [], nor = [];
  const c = S.colors;
  const r = rng(speciesKey.length * 999);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  const push = (p, rgb, nn) => { pos.push(p.x, p.y, p.z); col.push(...rgb); nor.push(nn.x, nn.y, nn.z); };
  const tri = (a, b, cc, ca, cb, cc2, nn) => { push(a, ca, nn); push(b, cb, nn); push(cc, cc2, nn); };
  for (let i = 0; i < N.nodes; i++) {
    const x = 0.03 + (i / (N.nodes - 1)) * 0.94;
    const tipK = Math.pow(i / N.nodes, 2.5);
    for (const [phi, lk] of N.ranks) {
      const ph = phi + r.range(-0.12, 0.12);
      const radial = new THREE.Vector3(0, Math.cos(ph), Math.sin(ph));
      const sw = N.sweep + r.range(-0.1, 0.1) + tipK * 0.4;
      const d = radial.clone().multiplyScalar(Math.cos(sw)).add(new THREE.Vector3(Math.sin(sw), 0, 0)).normalize();
      const len = (N.len * lk * (1 - tipK * 0.45) * r.range(0.85, 1.1)) / L;
      const wid = N.w / L;
      const b = new THREE.Vector3(x, 0, 0).addScaledVector(radial, 0.004 / L);
      w.crossVectors(d, Math.abs(d.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : UP).normalize();
      n.crossVectors(w, d).normalize();
      if (n.y < 0) n.negate();
      const tip = b.clone().addScaledVector(d, len);
      const bl = b.clone().addScaledVector(w, -wid / 2), br = b.clone().addScaledVector(w, wid / 2);
      const m = b.clone().addScaledVector(d, len * 0.7);
      const ml = m.clone().addScaledVector(w, -wid / 2), mr = m.clone().addScaledVector(w, wid / 2);
      const k = r.range(0.85, 1.1);
      const base = c.top.map(x => x * k);
      const mid = c.top.map((x, j) => lerp(x, c.tip[j], 0.5) * k);
      const tp = c.tip.map(x => x * k);
      tri(bl, br, mr, base, base, mid, n);
      tri(bl, mr, ml, base, mid, mid, n);
      tri(ml, mr, tip, mid, mid, tp, n);
    }
  }
  // the twig
  const tw = 0.0011 / L;
  for (const [a, b] of [[new THREE.Vector3(0, tw, 0), new THREE.Vector3(0, -tw, 0)], [new THREE.Vector3(0, 0, tw), new THREE.Vector3(0, 0, -tw)]]) {
    const a2 = a.clone().setX(1), b2 = b.clone().setX(1);
    tri(a, b, b2, c.twig, c.twig, c.twig, UP); tri(a, b2, a2, c.twig, c.twig, c.twig, UP);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  sprayGeoCache.set(speciesKey, g);
  return g;
}

function cardTexture(speciesKey) {
  if (cardTexCache.has(speciesKey)) return cardTexCache.get(speciesKey);
  const S = SPECIES[speciesKey];
  const c = S.colors;
  const css = (rgb, k = 1) => `rgb(${rgb.map(x => Math.round(Math.min(1, Math.pow(x * k, 1 / 2.2)) * 255)).join(',')})`;
  const r = rng(77);
  const t = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < S.needle.nodes * 2.6; i++) {
      const x = 6 + (i / (S.needle.nodes * 2.6)) * (w - 14);
      for (const sgn of [-1, 1]) {
        const len = (S.needle.len / S.sprayLen) * w * 0.75 * r.range(0.8, 1.1) * (1 - Math.pow(i / 30, 3) * 0.4);
        const a = (S.needle.sweep + 0.25) * sgn;
        ctx.strokeStyle = css(r() < 0.5 ? c.top : c.tip, r.range(0.8, 1.2));
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x, h / 2);
        ctx.lineTo(x + Math.sin(Math.abs(a)) * len * 0.6, h / 2 + sgn * Math.cos(a * 0.6) * len);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = css(c.twig, 0.6); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w - 8, h / 2); ctx.stroke();
  });
  cardTexCache.set(speciesKey, t);
  return t;
}

function cardGeometry() {
  // two crossed cards along +x: one flat (xz), one upright (xy)
  const g1 = new THREE.PlaneGeometry(1, 0.7); g1.rotateX(-Math.PI / 2); g1.translate(0.5, 0, 0);
  const g2 = new THREE.PlaneGeometry(1, 0.5); g2.translate(0.5, 0, 0);
  const pos = [...g1.attributes.position.array, ...g2.attributes.position.array];
  const uv = [...g1.attributes.uv.array, ...g2.attributes.uv.array];
  const nor = [...g1.attributes.normal.array, ...g2.attributes.normal.array];
  const idx = [...g1.index.array, ...[...g2.index.array].map(i => i + 4)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/* Silvery undersides on back faces (Fraser and balsam have white bands beneath) */
function needleMaterial(S) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const under = new THREE.Color(...S.colors.under);
  m.userData.uniforms = { uDry: { value: 0 }, uUnder: { value: under }, uUnderMix: { value: S.underMix } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDry; uniform vec3 uUnder; uniform float uUnderMix;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, uUnder, uUnderMix);
        vec3 dryCol = vec3(dot(diffuseColor.rgb, vec3(.4,.5,.1))) * vec3(1.9, 1.45, 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, dryCol, uDry);`);
  };
  return m;
}

/* ---------- Building a drawable tree ---------- */
export function buildTree(spec, { lod = 'geo', layout = null } = {}) {
  const S = SPECIES[spec.species];
  const L = layout || layoutTree(spec);
  const group = new THREE.Group();
  group.name = 'tree';
  const sway = new THREE.Group();     // shake and cat wobble rotate this
  group.add(sway);

  // bark
  const bark = new THREE.MeshStandardMaterial({ color: 0x33251b, roughness: 0.95 });
  const wood = [];
  for (const b of L.branches) {
    const len = b.a.distanceTo(b.b);
    const g = new THREE.CylinderGeometry(b.trunk ? 0.004 : b.r * 0.7, b.r, len, b.trunk ? 10 : 6, 1, !b.trunk);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, b.b.clone().sub(b.a).normalize());
    g.applyQuaternion(q);
    g.translate(b.a.x, b.a.y, b.a.z);
    wood.push(g);
  }
  const woodMesh = new THREE.Mesh(mergeGeometries(wood), bark);
  woodMesh.castShadow = true;
  sway.add(woodMesh);

  // cut face at the base: fresh resin shows as glossy amber beads
  const cut = new THREE.Mesh(new THREE.CircleGeometry(L.trunkR(0), 20),
    new THREE.MeshStandardMaterial({ color: spec.cutDaysAgo <= 6 ? 0xd9b98a : 0x9c9284, roughness: spec.cutDaysAgo <= 6 ? 0.35 : 0.95 }));
  cut.rotation.x = Math.PI / 2;
  cut.position.y = 0.001;
  sway.add(cut);

  // needles
  let mesh;
  const count = L.sprays.length;
  if (lod === 'geo') {
    mesh = new THREE.InstancedMesh(sprayGeometry(spec.species), needleMaterial(S), count);
  } else {
    const mat = new THREE.MeshStandardMaterial({ map: cardTexture(spec.species), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
    mat.userData.uniforms = { uDry: { value: 0 } };
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, mat.userData.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDry;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 dryCol = vec3(dot(diffuseColor.rgb, vec3(.4,.5,.1))) * vec3(1.9, 1.45, 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, dryCol, uDry);`);
    };
    mesh = new THREE.InstancedMesh(cardGeometry(), mat, count);
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.45 });
  }
  const m4 = new THREE.Matrix4(), x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
  const r = rng(spec.seed ^ 0x5bd1);
  const baseColors = [];
  L.sprays.forEach((s, i) => {
    x.copy(s.d);
    z.crossVectors(x, s.u);
    if (z.lengthSq() < 1e-4) z.set(0, 0, 1);
    z.normalize();
    y.crossVectors(z, x).normalize();
    const k = S.sprayLen * s.s * (lod === 'geo' ? 1.45 : 1.25);
    m4.makeBasis(x.multiplyScalar(k), y.multiplyScalar(k), z.multiplyScalar(k));
    m4.setPosition(s.p);
    mesh.setMatrixAt(i, m4);
    const b = r.range(0.82, 1.12);
    const c = new THREE.Color(b, b, b * r.range(0.95, 1.05));
    baseColors.push(c);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = lod === 'geo';
  mesh.frustumCulled = false;
  sway.add(mesh);

  if (L.nest) {
    const nest = birdNest();
    nest.position.copy(L.nest);
    sway.add(nest);
  }

  // an invisible hull for picking
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const yy = lerp(L.yb, L.H, i / 24);
    pts.push(new THREE.Vector2(Math.max(0.01, L.profile(yy) * 0.92), yy));
  }
  const hull = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  hull.visible = false;
  hull.name = 'hull';
  sway.add(hull);

  const state = { shakeT: 99, shakeAmp: 0, wobble: 0, bounceT: 99, dry: 0, thin: 0 };
  const api = {
    group, sway, mesh, hull, layout: L, spec,
    setDryness(d) {
      state.dry = d;
      mesh.material.userData.uniforms.uDry.value = clamp(d * 0.75);
      // individual sprays brown first
      const dr = rng(spec.seed ^ 0x77);
      L.sprays.forEach((_, i) => {
        const brown = dr() < d * 0.55;
        const c = baseColors[i].clone();
        if (brown) c.multiply(new THREE.Color(1.6, 1.15, 0.45));
        mesh.setColorAt(i, c);
      });
      mesh.instanceColor.needsUpdate = true;
    },
    setThinning(f) {
      state.thin = clamp(f, 0, 0.8);
      mesh.count = Math.floor(count * (1 - state.thin));
    },
    shake(amp = 1) { state.shakeT = 0; state.shakeAmp = amp; },
    bounce() { state.bounceT = 0; },
    setWobble(w) { state.wobble = w; },
    /* random point on the foliage, in tree-local coordinates */
    randomNeedlePoint(rr = Math.random) {
      const s = L.sprays[Math.floor(rr() * Math.min(mesh.count, L.sprays.length))];
      return s.p.clone().addScaledVector(s.d, S.sprayLen * s.s * rr());
    },
    update(dt, time) {
      state.shakeT += dt;
      state.bounceT += dt;
      const decay = Math.exp(-state.shakeT * 3.2);
      const a = state.shakeAmp * decay * 0.05;
      sway.rotation.z = Math.sin(state.shakeT * 17) * a + Math.sin(time * 9.3) * state.wobble * 0.02;
      sway.rotation.x = Math.sin(state.shakeT * 13 + 1) * a * 0.7 + Math.cos(time * 7.1) * state.wobble * 0.015;
      // drop test: lift a few inches, let it thump
      const bt = state.bounceT;
      sway.position.y = bt < 0.35 ? Math.sin((bt / 0.35) * Math.PI / 2) * 0.09 : bt < 0.5 ? (1 - (bt - 0.35) / 0.15) * 0.09 : 0;
      if (bt >= 0.5 && bt < 0.5 + dt) state.shakeT = 0, state.shakeAmp = 0.6;
      return decay * state.shakeAmp;
    },
    dispose() {
      woodMesh.geometry.dispose(); bark.dispose(); hull.geometry.dispose();
      mesh.material.dispose(); mesh.dispose();
    },
  };
  return api;
}

export function birdNest() {
  const g = new THREE.Group();
  const twig = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 1 });
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r.range(0.035, 0.05), 0.003, 3, 12, r.range(2, 5)), twig);
    t.rotation.set(Math.PI / 2 + r.range(-0.35, 0.35), r.range(-0.3, 0.3), r() * TAU);
    t.position.y = r.range(0, 0.025);
    g.add(t);
  }
  const egg = new THREE.MeshStandardMaterial({ color: 0x9fd2d6, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), egg);
    e.scale.set(1, 1.3, 1);
    e.position.set(Math.cos(i * 2.1) * 0.014, 0.018, Math.sin(i * 2.1) * 0.014);
    g.add(e);
  }
  return g;
}

/* Merge simple non-indexed/indexed geometries with position+normal(+uv) */
export function mergeGeometries(list) {
  const pos = [], nor = [], uv = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array);
    else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
