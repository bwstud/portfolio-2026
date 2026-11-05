/* A hybrid tea rose, grown from numbers.

   A specimen is a seed, a colourway and a bloom stage. The seed fixes everything a grower
   couldn't: how many petals, their sizes and small irregularities, the stem's length, which
   leaves survived the packing shed. The bloom stage (0 a tight bud, 0.55 the florist's
   "half open" high centre, 1 blown) only changes how far each petal has opened, so the same
   specimen can be watched opening.

   Botany it follows:
   - Petals spiral at the golden angle (137.5°), the oldest and largest outermost. Outer petals
     open first; the inner ones stay furled into the high centre until late.
   - Each petal is a surface: a narrow claw widening to a broad, rounded blade, cupped across its
     width, incurved along its length while closed, and, once open, reflexed at the tip with the
     margins rolled back. The rolled margins are what give a hybrid tea its pointed petals.
   - Five sepals, long and tapering, two of them "bearded" with small side lobes, hug the bud
     and fold back down the stem as it opens.
   - Leaves are compound: five leaflets (three near the top), alternate, about 2/5 of a turn apart.

   Geometry is in the head's own frame: origin where the stem meets the receptacle, +Y along the
   stem's axis. All sizes in metres. */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function rng(seed) {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const VARIETIES = {
  red: {
    name: 'Red', note: 'Deep velvet crimson, the classic florist rose.',
    petals: { face: '#6f0610', edge: '#4a040b', claw: '#c9a06a', back: '#8e1a24', vein: '#3a0308', edgeAmt: 0.5, clawLen: 0.2, mottle: 0.12, veinAmt: 0.3 },
    sheen: '#b8283a', backTint: 1.0, transl: 0.55, count: 36, size: 1, reflex: 1, roll: 1, ruffle: 0.25, blueing: 0.18,
  },
  blush: {
    name: 'Blush', note: 'Pale pink, deepening to coral at the heart.',
    petals: { face: '#f2c3b8', edge: '#f7dcd2', claw: '#f4d9a0', back: '#f5d6cc', vein: '#d9958a', edgeAmt: 0.6, clawLen: 0.3, mottle: 0.06, veinAmt: 0.22 },
    sheen: '#fff0ea', backTint: 1.0, transl: 0.8, count: 40, size: 1.02, reflex: 0.85, roll: 0.9, ruffle: 0.5, blueing: 0,
    heart: '#e9947f',
  },
  ivory: {
    name: 'Ivory', note: 'Cream white with a green-gold base, the bridal rose.',
    petals: { face: '#e6dfca', edge: '#efe9d8', claw: '#c9c88e', back: '#e2dbc3', vein: '#bdb491', edgeAmt: 0.5, clawLen: 0.32, mottle: 0.06, veinAmt: 0.3 },
    sheen: '#fffaf0', backTint: 1.0, transl: 0.6, count: 38, size: 1.04, reflex: 0.95, roll: 1, ruffle: 0.35, blueing: 0,
    heart: '#efe4bf',
  },
};

export const STAGES = [
  { id: 'bud', name: 'Bud', bloom: 0.04 },
  { id: 'opening', name: 'Opening', bloom: 0.32 },
  { id: 'half', name: 'Half open', bloom: 0.55 },
  { id: 'open', name: 'Open', bloom: 0.78 },
  { id: 'blown', name: 'Blown', bloom: 1 },
];
export const stageName = b => STAGES.reduce((best, s) => (Math.abs(s.bloom - b) < Math.abs(best.bloom - b) ? s : best)).name;

/* Everything about a specimen that doesn't depend on the bloom stage. */
export function makeSpecimen(varietyId, seed, length) {
  const V = VARIETIES[varietyId];
  const r = rng(seed * 7919 + 17);
  const count = Math.round(V.count + (r() - 0.5) * 8);
  const size = V.size * (0.92 + r() * 0.16);
  const petals = [];
  for (let i = 0; i < count; i++) {
    petals.push({
      jAz: (r() - 0.5) * 0.16, jLen: (r() - 0.5) * 0.12, jOpen: (r() - 0.5) * 0.14, jReflex: (r() - 0.5) * 0.3,
      jRoll: (r() - 0.5) * 0.4, phase: r() * TAU, tint: (r() - 0.5) * 0.08, lag: (r() - 0.5) * 0.08,
    });
  }
  const sepals = [];
  for (let k = 0; k < 5; k++) sepals.push({ len: 0.024 + r() * 0.008, jAz: (r() - 0.5) * 0.15, beard: k === 0 || k === 2 ? 1 : k === 4 ? 0.5 : 0, curl: r() });
  // leaves: two or three kept near the top, alternate at 2/5 of a turn
  const leaves = [];
  const nLeaves = 2 + (r() < 0.55 ? 1 : 0);
  let s = 0.07 + r() * 0.03, az = r() * TAU;
  for (let k = 0; k < nLeaves; k++) {
    leaves.push({ at: s, az, leaflets: k === 0 ? 3 : 5, size: (k === 0 ? 0.75 : 1) * (0.9 + r() * 0.2), tilt: 0.75 + r() * 0.3, droop: r() });
    s += 0.06 + r() * 0.035;
    az += TAU * 0.4 + (r() - 0.5) * 0.4;
  }
  // a few prickles; florist roses are mostly stripped of them
  const prickles = [];
  const np = 4 + Math.floor(r() * 6);
  for (let k = 0; k < np; k++) prickles.push({ at: 0.05 + r() * (length - 0.1), az: r() * TAU, size: 0.7 + r() * 0.6 });
  return {
    variety: varietyId, seed, length, count, size, petals, sepals, leaves, prickles,
    lean: (r() - 0.5) * 0.12,          // a slight crook at the neck
    hue: (r() - 0.5) * 0.04,
  };
}

/* ---------- the petal surface ---------- */
const NU = 17, NV = 15;

/* One petal as a grid. p: placement and shape at this bloom stage. Writes into the arrays and
   returns the vertex count added. */
function petalGrid(p, out) {
  const { az, rb, yb, L, W, alpha, bendIn, reflex, cupR, roll, ruffle, phase, tint, guard } = p;
  const er = [Math.cos(az), 0, Math.sin(az)], et = [-Math.sin(az), 0, Math.cos(az)];
  // centreline in the radial–vertical plane, integrated along the length
  const cl = [], tn = [], nin = [];
  let x = rb, y = yb;
  for (let j = 0; j < NV; j++) {
    const v = j / (NV - 1);
    const a = alpha - bendIn * Math.pow(v, 1.3) + reflex * Math.pow(smooth(0.45, 1, v), 1.4);
    cl.push([x, y]);
    tn.push([Math.sin(a), Math.cos(a)]);
    nin.push([-Math.cos(a), Math.sin(a)]);
    const dv = L / (NV - 1);
    x += Math.sin(a) * dv; y += Math.cos(a) * dv;
  }
  const base = out.pos.length / 3;
  for (let j = 0; j < NV; j++) {
    const v0 = j / (NV - 1);
    for (let i = 0; i < NU; i++) {
      const u = (i / (NU - 1)) * 2 - 1;              // -1 … 1 across
      // the rounded top: rows reach less far up towards the margins
      const top = 0.84 + 0.16 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.025 * Math.exp(-((u / 0.22) ** 2));
      const v = v0 * top;
      const jj = Math.min(NV - 2, Math.floor(v * (NV - 1))), f = v * (NV - 1) - jj;
      const cx = mix(cl[jj][0], cl[jj + 1][0], f), cy = mix(cl[jj][1], cl[jj + 1][1], f);
      const nx = mix(nin[jj][0], nin[jj + 1][0], f), ny = mix(nin[jj][1], nin[jj + 1][1], f);
      // half-width: narrow claw, widest past the middle
      const hw = W * 0.5 * (0.2 + 0.8 * Math.pow(Math.sin(Math.min(1, v / 0.72) * Math.PI / 2), 0.85));
      // cross-section: integrate the curve from the midrib out; cupped in the middle, rolled back
      // at the margins near the tip
      const xEnd = Math.abs(u) * hw;
      const steps = 8;
      let lat = 0, inw = 0, ang = 0;
      const kCup = 1 / cupR(v);
      for (let s = 0; s < steps; s++) {
        const xm = (s + 0.5) / steps * xEnd;
        const uu = hw > 0 ? xm / hw : 0;
        const k = kCup - roll * smooth(0.5, 1, uu) * smooth(0.3, 0.95, v);
        const dx = xEnd / steps;
        ang += k * dx * 0.5;
        lat += Math.cos(ang) * dx; inw += Math.sin(ang) * dx;
        ang += k * dx * 0.5;
      }
      lat *= Math.sign(u);
      // ruffled margin near the tip
      inw += ruffle * smooth(0.72, 1, v) * Math.pow(Math.abs(u), 1.5) * Math.sin(u * 7 + phase) * 0.0018;
      const X = cx * er[0] + nx * inw * er[0] + et[0] * lat;
      const Y = cy + ny * inw;
      const Z = cx * er[2] + nx * inw * er[2] + et[2] * lat;
      out.pos.push(X, Y, Z);
      out.uv.push(i / (NU - 1), v);
      // per-vertex tint: guard petals blue a little at the edges, a hint of shading at the claw
      const shade = 1 + tint - guard * smooth(0.4, 1, v) * 0.25;
      out.col.push(shade, shade * (1 - guard * 0.04), shade * (1 + guard * 0.06));
    }
  }
  for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) {
    const a = base + j * NU + i, b = a + 1, c = a + NU, d = c + 1;
    out.idx.push(a, b, c, b, d, c);
  }
}

function grid() { return { pos: [], uv: [], col: [], idx: [] }; }
function toGeometry(g) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  if (g.col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setIndex(g.idx);
  geo.computeVertexNormals();
  return geo;
}

/* How far each petal is open at a bloom stage: outer first, inner last. r: 0 innermost … 1 outer */
function openness(r, bloom, lag) {
  // outer petals start loosening straight away and are done by half open; the innermost only
  // begin at about 0.7 and are never fully open, even blown
  const start = 0.72 * (1 - r) - 0.01 + lag;
  return smooth(0, 1, (bloom - start) / 0.58);
}

export const RECEPTACLE_TOP = 0.0122;

/* Petals of a specimen at a bloom stage. */
export function petalGeometry(spec, bloom) {
  const V = VARIETIES[spec.variety];
  const out = grid();
  const N = spec.count;
  for (let i = 0; i < N; i++) {
    const pp = spec.petals[i];
    const r = N > 1 ? 1 - i / (N - 1) : 1;           // i = 0 is the outermost, oldest petal
    const o = openness(r, bloom, pp.lag);
    const Lmax = 0.047 * spec.size;
    const L = Lmax * (0.42 + 0.58 * Math.pow(r, 0.7)) * (1 + pp.jLen);
    const W = L * mix(0.82, 1.12, r);
    const shell = 0.0030 + 0.0125 * Math.pow(r, 1.05);           // radius of the bud at this petal
    const alphaBud = (2 + 13 * r) * Math.PI / 180;
    // how far this petal leans out when fully open: outer ones past horizontal, the heart upright
    // and how far it goes grows with the flower's age: at half open the outer petals are at about
    // 70°, open about 90°, and only a blown rose lets them fall past horizontal
    const reach = mix(0.34, 1, smooth(0.45, 1, bloom));
    const alphaMax = (16 + 90 * Math.pow(r, 1.15) * reach) * Math.PI / 180;
    const alpha = mix(alphaBud, alphaMax, o) * (1 + pp.jOpen);
    // closed petals curve in at the tip to close the bud; the heart stays a tall spiral cone
    const bendIn = mix(0.18 + 0.5 * smooth(0.4, 1, r), 0.02, o);
    const reflex = mix(0, (0.2 + 0.85 * r) * V.reflex * mix(0.55, 1, smooth(0.45, 1, bloom)), Math.pow(o, 1.3)) * (1 + pp.jReflex);
    const openR = 0.009 + 0.026 * r;
    const cupBase = mix(shell, openR, Math.pow(o, 0.8));
    const minR = W * 0.5 / (0.82 * Math.PI);                     // never wrap past ~300°
    const cupR = v => Math.max(minR, cupBase * mix(0.8, 1.35, v));
    // margins roll back once a petal is opening, strongest on the middle petals: the points
    const roll = (110 * V.roll) * smooth(0.15, 0.7, o) * mix(0.6, 1, smooth(0.1, 0.7, r)) * (1 + pp.jRoll);
    petalGrid({
      az: i * GOLDEN + pp.jAz, rb: 0.0012 + 0.0042 * r, yb: RECEPTACLE_TOP - 0.0012 * r + 0.0015 * (1 - r),
      L, W, alpha, bendIn, reflex, cupR, roll, ruffle: V.ruffle * (0.3 + 0.7 * o), phase: pp.phase,
      tint: pp.tint - (V.heart ? 0 : 0), guard: V.blueing * smooth(0.75, 1, r) * smooth(0.5, 1, bloom),
    }, out);
  }
  const geo = toGeometry(out);
  // the heart colour: inner petals of some varieties are deeper
  if (V.heart) {
    const heart = new THREE.Color(V.heart), face = new THREE.Color(V.petals.face);
    const col = geo.attributes.color;
    const per = NU * NV;
    for (let i = 0; i < N; i++) {
      const r = N > 1 ? 1 - i / (N - 1) : 1;
      const t = smooth(0.35, 0, r) * 0.9;
      const k = [mix(1, heart.r / face.r, t), mix(1, heart.g / face.g, t), mix(1, heart.b / face.b, t)];
      for (let q = 0; q < per; q++) {
        const o = (i * per + q) * 3;
        col.array[o] *= k[0]; col.array[o + 1] *= k[1]; col.array[o + 2] *= k[2];
      }
    }
  }
  return geo;
}

/* The receptacle (hip) the petals and sepals grow from: a small vase shape. */
export function receptacleGeometry() {
  const pts = [[0.0029, -0.004], [0.003, 0], [0.0036, 0.002], [0.0051, 0.0058], [0.0055, 0.0088], [0.0049, 0.0112], [0.004, RECEPTACLE_TOP], [0.0015, RECEPTACLE_TOP + 0.0006], [0, RECEPTACLE_TOP + 0.0006]];
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 20);
}

/* Sepals: they hug the bud, then fold back down the stem. */
export function sepalGeometry(spec, bloom) {
  const out = grid();
  const o = smooth(0.1, 0.5, bloom);
  for (let k = 0; k < 5; k++) {
    const sp = spec.sepals[k];
    const az = k * TAU / 5 + sp.jAz + 0.3;
    const er = [Math.cos(az), 0, Math.sin(az)], et = [-Math.sin(az), 0, Math.cos(az)];
    const L = sp.len;
    const NUs = 7, NVs = 14;
    const alpha = mix(0.62, 2.2 + sp.curl * 0.4, o);
    const base = out.pos.length / 3;
    let x = 0.0052, y = 0.0102;
    const cl = [];
    for (let j = 0; j < NVs; j++) {
      const v = j / (NVs - 1);
      // closed: hug the bud's curve; open: fold back and curl at the tip
      const a = alpha + mix(-1.05 * Math.pow(v, 0.8), 0.9 * v * v, o);
      cl.push([x, y, a]);
      const dv = L / (NVs - 1);
      x += Math.sin(a) * dv; y += Math.cos(a) * dv;
    }
    for (let j = 0; j < NVs; j++) {
      const v = j / (NVs - 1);
      const [cx, cy, a] = cl[j];
      const nx = -Math.cos(a), ny = Math.sin(a);
      // lanceolate, drawn out to a thread; bearded sepals have side lobes
      let hw = 0.0032 * Math.pow(1 - v, 0.9) * (0.6 + 0.4 * Math.sin(Math.min(1, v / 0.25) * Math.PI / 2));
      if (sp.beard && v > 0.35 && v < 0.8) hw += 0.0016 * sp.beard * Math.max(0, Math.sin((v - 0.35) / 0.15 * Math.PI)) ;
      for (let i = 0; i < NUs; i++) {
        const u = (i / (NUs - 1)) * 2 - 1;
        const lat = u * hw;
        const inw = (u * u) * hw * 0.6 * (1 - o * 0.5);        // a shallow trough
        out.pos.push(cx * er[0] + nx * inw * er[0] + et[0] * lat, cy + ny * inw, cx * er[2] + nx * inw * er[2] + et[2] * lat);
        out.uv.push(i / (NUs - 1), v);
      }
    }
    for (let j = 0; j < NVs - 1; j++) for (let i = 0; i < NUs - 1; i++) {
      const a = base + j * NUs + i, b = a + 1, c = a + NUs, d = c + 1;
      out.idx.push(a, b, c, b, d, c);
    }
  }
  return toGeometry(out);
}

/* Stamens, only seen once the rose is blown: a ring of short filaments with golden anthers. */
export function stamenGeometry(spec, bloom) {
  if (bloom < 0.82) return null;
  const r = rng(spec.seed + 3);
  const parts = [];
  const n = 60;
  for (let k = 0; k < n; k++) {
    const az = k * GOLDEN, rad = 0.0028 + r() * 0.0035;
    const h = 0.004 + r() * 0.003;
    const fil = new THREE.CylinderGeometry(0.00018, 0.00022, h, 4, 1);
    fil.translate(0, h / 2, 0);
    fil.rotateZ(-0.25 - r() * 0.3);
    fil.rotateY(-az);
    fil.translate(Math.cos(az) * rad, RECEPTACLE_TOP - 0.001, Math.sin(az) * rad);
    const anth = new THREE.SphereGeometry(0.0006, 5, 4);
    anth.scale(1, 0.7, 1.6);
    anth.translate(0, h, 0);
    anth.rotateZ(-0.25 - r() * 0.3);
    anth.rotateY(-az);
    anth.translate(Math.cos(az) * rad, RECEPTACLE_TOP - 0.001, Math.sin(az) * rad);
    const tag = (g, t) => { const c = new Float32Array(g.attributes.position.count * 3).fill(t); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g; };
    parts.push(tag(fil.toNonIndexed(), 0.75), tag(anth.toNonIndexed(), 1));
  }
  return mergeGeometries(parts);
}

/* How big the head is to the physics: a sphere centred some way above the receptacle. */
export function headCollider(spec, bloom) {
  const o = smooth(0.05, 0.85, bloom);
  return {
    r: mix(0.017, 0.047, o) * spec.size,
    off: mix(0.028, 0.026, o) * spec.size,
    mass: 0.018 + 0.006 * spec.size,
  };
}

/* ---------- leaves ---------- */

/* A compound leaf in its own frame: petiole along +Y from the origin, the blade facing +Z. */
export function leafGeometry(leaf, r) {
  const parts = [];
  const len = 0.105 * leaf.size;              // petiole to the tip of the terminal leaflet
  const pet = 0.02 * leaf.size;
  // rachis: a slender tube
  const rach = new THREE.CylinderGeometry(0.0006, 0.0009, len * 0.7, 5, 1);
  rach.translate(0, len * 0.35, 0);
  const ruv = rach.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, 0.5, 0.45);     // sample the midrib, never the cut-out
  parts.push(rach.toNonIndexed());
  const pairs = leaf.leaflets === 3 ? 1 : 2;
  const leaflet = (scale, at, side) => {
    const g = leafletCard(0.042 * scale * leaf.size, 0.026 * scale * leaf.size);
    if (side) {
      g.rotateZ(side * (0.95 + r() * 0.25));          // out to the side, angled forward
      g.rotateY(side * 0.15);
    }
    g.rotateX(-0.12 - leaf.droop * 0.25);
    g.translate(0, at, 0);
    return g;
  };
  for (let p = 0; p < pairs; p++) {
    const at = pet + (len * 0.7 - pet) * (p / (pairs + 0.3));
    const sc = 0.82 + 0.1 * p;
    parts.push(leaflet(sc, at, 1), leaflet(sc, at + 0.002, -1));
  }
  parts.push(leaflet(1.05, len * 0.7, 0));
  // stipules at the base: small wings along the petiole
  const stip = leafletCard(0.012 * leaf.size, 0.004 * leaf.size);
  stip.translate(0.0015, 0.002, 0);
  parts.push(stip);
  const merged = mergeGeometries(parts.map(g => { if (g.index) g = g.toNonIndexed(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
  return merged;
}

/* One leaflet card: base at the origin, tip along +Y, folded a little along the midrib and
   arched; the outline comes from the texture's alpha. */
function leafletCard(len, wid) {
  const nu = 6, nv = 10;
  const out = grid();
  for (let j = 0; j < nv; j++) {
    const v = j / (nv - 1);
    for (let i = 0; i < nu; i++) {
      const u = (i / (nu - 1)) * 2 - 1;
      const x = u * wid * 0.5 / 0.92;
      const fold = Math.abs(u) * wid * 0.12;                 // V along the midrib
      const arch = Math.sin(v * Math.PI) * len * 0.06 - v * v * len * 0.08;
      out.pos.push(x, v * len, fold + arch);
      out.uv.push(i / (nu - 1), v);
    }
  }
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
    out.idx.push(a, b, c, b, d, c);
  }
  const g = toGeometry(out);
  g.deleteAttribute('color');
  return g.toNonIndexed();
}

/* A prickle: a flattened, down-hooked cone, broad at the base. */
export function prickleGeometry(size) {
  const g = new THREE.ConeGeometry(0.0018 * size, 0.0042 * size, 6, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.0021 * size;      // 0 at the base … tip
    const t = y / (0.0042 * size);
    p.setX(i, p.getX(i) * 1.6);
    p.setY(i, p.getY(i) - t * t * 0.0016 * size); // hooked down
  }
  g.rotateZ(-Math.PI / 2);                      // point out along +X
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
