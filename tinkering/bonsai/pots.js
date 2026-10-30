/* Containers. Each pot is a profile curve swept around a superellipse, so one generator makes round
   bowls (n = 2), ovals (n = 2, unequal axes) and rounded rectangles (n ≈ 7). Glazes are painted
   procedurally onto canvases: mottled, crackled, or broken to rust where the glaze runs thin.

   Profiles are [radius, height] pairs from the foot to the lip and back down the inside to the soil
   line. Radius 1 is the pot's widest half-width; heights are metres. A point listed twice makes a
   crisp edge there. */

import * as THREE from 'three';

export const POTS = [
  {
    id: 'namako', name: 'Namako round', note: 'Sea-cucumber glaze: blue over brown stoneware, pooling in the curves.',
    w: 0.3, d: 0.3, n: 2, feet: 0, glaze: 'namako', cap: 0.9,
    profile: [[0.8, 0], [0.8, 0], [0.82, 0.006], [0.9, 0.022], [0.97, 0.045], [1, 0.062], [0.995, 0.07], [0.995, 0.07], [0.95, 0.072], [0.93, 0.066], [0.92, 0.058]],
  },
  {
    id: 'tokoname', name: 'Tokoname rectangle', note: 'Unglazed dark clay with a lipped rim and cloud feet. The classic for a formal tree.',
    w: 0.36, d: 0.26, n: 7, feet: 4, glaze: 'clay', cap: 1.15,
    profile: [[0.96, 0], [0.96, 0], [0.985, 0.004], [0.99, 0.06], [0.99, 0.06], [1.025, 0.062], [1.025, 0.074], [1.025, 0.074], [0.95, 0.075], [0.95, 0.075], [0.94, 0.064]],
  },
  {
    id: 'celadon', name: 'Celadon oval', note: 'Shallow oval in pale jade, with a fine crackle under the glaze.',
    w: 0.34, d: 0.23, n: 2, feet: 4, glaze: 'celadon', cap: 0.75,
    profile: [[0.86, 0], [0.86, 0], [0.9, 0.008], [0.97, 0.024], [1, 0.042], [1, 0.042], [0.99, 0.05], [0.94, 0.051], [0.94, 0.051], [0.93, 0.044]],
  },
  {
    id: 'tenmoku', name: 'Tenmoku drum', note: 'Deep, round and glossy iron-black, breaking to rust at the rim. Suits a juniper.',
    w: 0.22, d: 0.22, n: 2, feet: 3, glaze: 'tenmoku', cap: 1,
    profile: [[0.86, 0], [0.86, 0], [0.92, 0.008], [0.98, 0.035], [1, 0.062], [0.985, 0.09], [0.96, 0.104], [0.96, 0.104], [0.975, 0.108], [0.975, 0.113], [0.9, 0.114], [0.9, 0.114], [0.885, 0.1]],
  },
];
export const POT = Object.fromEntries(POTS.map(p => [p.id, p]));
export const FOOT = 0.012;

/* ---------- periodic value noise, for seamless glazes ---------- */
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
           L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return s / (1 - Math.pow(0.5, oct));
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* Paints a glaze. u runs round the pot (seamless), v up its profile (0 foot, 1 inside the lip). */
function paintGlaze(kind, W = 512, H = 256) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const R = 2.2;
  const crack = kind === 'celadon' ? crackle(W, H) : null;
  for (let j = 0; j < H; j++) {
    const v = 1 - j / (H - 1);                      // canvas rows run top-down; v runs foot to lip
    for (let i = 0; i < W; i++) {
      const a = (i / W) * Math.PI * 2, cx = Math.cos(a) * R, cz = Math.sin(a) * R;
      let c;
      if (kind === 'namako') {
        const drip = fbm(cx * 0.8, v * 1.2, cz * 0.8 + 9);                  // runs, stretched vertically
        const mott = fbm(cx * 3, v * 6, cz * 3);
        const thin = sstep(0.62, 0.95, v + (drip - 0.5) * 0.35);           // glaze breaks thin near the lip
        const deep = lerp3(hex('#22374f'), hex('#5f86a3'), sstep(0.35, 0.75, mott));
        c = lerp3(deep, hex('#8fa9b4'), sstep(0.62, 0.8, mott) * 0.6);
        c = lerp3(c, hex('#5a3a24'), thin * 0.85);
        c = lerp3(c, hex('#3b2a20'), 1 - sstep(0, 0.12, v));             // the bare foot
      } else if (kind === 'clay') {
        const n = fbm(cx * 4, v * 8, cz * 4);
        c = lerp3(hex('#2b1b14'), hex('#4d3224'), n);
        if (hash3(i, j, 7) > 0.985) c = lerp3(c, hex('#1b100c'), 0.7);     // iron speckle
      } else if (kind === 'celadon') {
        const n = fbm(cx * 2, v * 3, cz * 2);
        c = lerp3(hex('#9bb79a'), hex('#c3d6bd'), n);
        c = lerp3(c, hex('#7f9a80'), 1 - sstep(0.05, 0.4, v));             // glaze pools deeper low down
        c = lerp3(c, hex('#b9a58a'), 1 - sstep(0, 0.08, v));
        const k = crack[j * W + i];
        c = lerp3(c, hex('#6c836b'), k * 0.55);
      } else {                                                              // tenmoku
        const n = fbm(cx * 1.5, v * 2.5, cz * 1.5 + 3);
        const hare = fbm(cx * 9, v * 2, cz * 9);                            // fine streaks, like hare's fur
        c = lerp3(hex('#1e140f'), hex('#3a2418'), n);
        c = lerp3(c, hex('#8a4a22'), sstep(0.55, 0.8, hare) * 0.5);
        const rust = sstep(0.78, 0.96, v + (n - 0.5) * 0.25);
        c = lerp3(c, hex('#8c4a22'), rust);
        c = lerp3(c, hex('#4a3428'), 1 - sstep(0, 0.1, v));
      }
      const o = (j * W + i) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// a crackle network: thin lines between random cells, wrapped round the pot
function crackle(W, H) {
  const out = new Float32Array(W * H);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.9;
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 220; k++) {
    let x = r() * W, y = r() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (r() - 0.5) * 40; y += (r() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.35 + r() * 0.5;
    ctx.stroke();
    if (x < 40 || x > W - 40) { ctx.save(); ctx.translate(x < 40 ? W : -W, 0); ctx.stroke(); ctx.restore(); }
  }
  const d = ctx.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) out[i] = d[i * 4] / 255;
  return out;
}

const GLAZES = {
  namako: { roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  clay: { roughness: 0.88, clearcoat: 0, clearcoatRoughness: 1 },
  celadon: { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 },
  tenmoku: { roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.35 },
};
const glazeCache = {};

/* ---------- geometry ---------- */
const SEG = 128;
function superPoint(theta, n, a, b) {
  const c = Math.cos(theta), s = Math.sin(theta), e = 2 / n;
  return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

function sweep(profile, n, a, b) {
  const rows = profile.length, cols = SEG + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  let total = 0;
  const along = [0];
  for (let i = 1; i < rows; i++) {
    total += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1] / 0.12);
    along.push(total);
  }
  for (let i = 0; i < rows; i++) {
    const [rr, y] = profile[i];
    for (let j = 0; j < cols; j++) {
      const [x, z] = superPoint((j / SEG) * Math.PI * 2, n, a * rr, b * rr);
      const o = i * cols + j;
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      uv[o * 2] = j / SEG; uv[o * 2 + 1] = along[i] / total;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < SEG; j++) {
    const a0 = i * cols + j, a1 = a0 + cols;
    idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
  }
  // close the bottom
  const centre = rows * cols;
  const p2 = new Float32Array((rows * cols + 1) * 3);
  p2.set(pos);
  p2[centre * 3 + 1] = profile[0][1];
  const uv2 = new Float32Array((rows * cols + 1) * 2);
  uv2.set(uv);
  for (let j = 0; j < SEG; j++) idx.push(centre, j, j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv2, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld the seam's normals
  const nrm = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a0 = i * cols, a1 = i * cols + SEG;
    const x = nrm.getX(a0) + nrm.getX(a1), y = nrm.getY(a0) + nrm.getY(a1), z = nrm.getZ(a0) + nrm.getZ(a1);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a0, x / l, y / l, z / l); nrm.setXYZ(a1, x / l, y / l, z / l);
  }
  return g;
}

/* ---------- soil: akadama grit with moss, painted from the sand texture ---------- */
let sandImg = null, soilNormal = null;
export function preloadSoil(loader) {
  return Promise.all([
    new Promise(res => loader.load('assets/gravelly_sand_diff_1k.jpg', t => { sandImg = t.image; res(); }, undefined, res)),
    new Promise(res => loader.load('assets/gravelly_sand_nor_gl_1k.jpg', t => {
      soilNormal = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); res();
    }, undefined, res)),
  ]);
}
const soilCache = {};
function soilMap(key) {
  if (soilCache[key]) return soilCache[key];
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  if (sandImg) {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) ctx.drawImage(sandImg, x * S / 2, y * S / 2, S / 2, S / 2);
  } else { ctx.fillStyle = '#8a6040'; ctx.fillRect(0, 0, S, S); }
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#b39478';                       // warm akadama
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  // moss cushions: noisy blobs, denser away from the centre where the trunk stands
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const ph = key.length * 1.7;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i / S - 0.5, y = j / S - 0.5, r = Math.hypot(x, y);
    const n = fbm(i / 110 + ph, j / 110, 3.3, 5);
    const fine = fbm(i / 7, j / 7, 9, 3);
    // cushions with ragged edges: the fine noise breaks up the outline and the surface
    const m = sstep(0.56, 0.64, n + (fine - 0.5) * 0.12 + 0.05 * sstep(0.05, 0.4, r)) * (1 - sstep(0.42, 0.5, r));
    if (m <= 0) continue;
    const g = lerp3(hex('#26361a'), hex('#5e7431'), sstep(0.3, 0.75, fine) * 0.9 + n * 0.1);
    const o = (j * S + i) * 4;
    d[o] = d[o] + (g[0] - d[o]) * m; d[o + 1] = d[o + 1] + (g[1] - d[o + 1]) * m; d[o + 2] = d[o + 2] + (g[2] - d[o + 2]) * m;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (soilCache[key] = tex);
}

/* Builds a pot with its soil. Returns the group, the soil level (where the tree stands) and the rim. */
export function buildPot(def) {
  const group = new THREE.Group();
  const a = def.w / 2, b = def.d / 2;
  const raise = def.feet ? FOOT : 0;
  if (!glazeCache[def.glaze]) glazeCache[def.glaze] = paintGlaze(def.glaze);
  const glaze = GLAZES[def.glaze];
  const mat = new THREE.MeshPhysicalMaterial({ map: glazeCache[def.glaze], ...glaze, envMapIntensity: 1 });
  const body = new THREE.Mesh(sweep(def.profile, def.n, a, b), mat);
  body.position.y = raise;
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  if (def.feet) {
    const footGeo = new THREE.CylinderGeometry(0.014, 0.017, FOOT + 0.002, 20);
    const count = def.feet;
    for (let i = 0; i < count; i++) {
      const t = count === 3 ? (i / 3) * Math.PI * 2 + Math.PI / 2 : (i + 0.5) * Math.PI / 2;
      const [x, z] = superPoint(t, def.n, a * 0.72, b * 0.72);
      const f = new THREE.Mesh(footGeo, mat);
      f.position.set(x, FOOT / 2, z);
      f.castShadow = f.receiveShadow = true;
      group.add(f);
    }
  }

  // soil sits just below the inner lip and mounds gently towards the trunk
  const inner = def.profile.at(-1);
  const soilY = raise + inner[1] - 0.004;
  const rings = 24, soilGeo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const rr = (i / rings) * inner[0];
    for (let j = 0; j <= SEG; j++) {
      const [x, z] = superPoint((j / SEG) * Math.PI * 2, def.n, a * rr, b * rr);
      const mound = 0.012 * Math.pow(1 - i / rings, 1.6);
      pos.push(x, soilY + mound, z);
      uv.push(0.5 + x / (def.w * 1.05), 0.5 + z / (def.w * 1.05));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < SEG; j++) {
    const a0 = i * (SEG + 1) + j, a1 = a0 + SEG + 1;
    idx.push(a0, a0 + 1, a1, a0 + 1, a1 + 1, a1);
  }
  soilGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  soilGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  soilGeo.setIndex(idx);
  soilGeo.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeo, new THREE.MeshStandardMaterial({
    map: soilMap(def.id), normalMap: soilNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95,
  }));
  soil.receiveShadow = true;
  soil.castShadow = false;
  group.add(soil);

  const lip = def.profile.reduce((m, p) => Math.max(m, p[1]), 0);
  return {
    group, soilY: soilY + 0.012, rimY: raise + lip,
    rim: t => { const [x, z] = superPoint(t, def.n, a * inner[0], b * inner[0]); return [x, raise + lip, z]; },
    width: def.w, depth: def.d,
  };
}

/* A small silhouette of the pot for the picker. */
export function potIcon(def, color) {
  const W = 64, H = 30, s = 28 / (def.w / 2);
  const pts = def.profile.filter((p, i) => i < def.profile.findIndex(q => q[1] === Math.max(...def.profile.map(r => r[1]))) + 2);
  const yMax = Math.max(...def.profile.map(p => p[1]));
  const sy = (H - 6) / Math.max(yMax, 0.06);
  const toX = r => W / 2 + r * 28, toY = y => H - 3 - (def.feet ? 2 : 0) - y * sy * 0.8;
  const right = pts.map(([r, y]) => `${toX(r).toFixed(1)},${toY(y).toFixed(1)}`);
  const left = pts.slice().reverse().map(([r, y]) => `${toX(-r).toFixed(1)},${toY(y).toFixed(1)}`);
  const feet = def.feet ? `<rect x="${W / 2 - 22}" y="${H - 5}" width="6" height="3" rx="1"/><rect x="${W / 2 + 16}" y="${H - 5}" width="6" height="3" rx="1"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g fill="${color}"><polygon points="${right.join(' ')} ${left.join(' ')}"/>${feet}</g></svg>`;
}
export const POT_SWATCH = { namako: '#4f7896', tokoname: '#5a3326', celadon: '#a9c3a3', tenmoku: '#2a1a12' };
