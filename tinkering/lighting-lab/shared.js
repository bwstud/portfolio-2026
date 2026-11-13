/* Pieces several lessons share: tone-mapping operators (GLSL and JS twins), a false-colour
   map, the studio cyc, the still life and the Cornell box. */
import * as THREE from 'three';

/* ---------- tone mapping ----------
   Ported from three.js's own operators so the curves here match what renderer.toneMapping does.
   Each takes an already-exposed linear colour and returns a linear display colour in 0..1. */
export const TONEMAP_GLSL = /* glsl */`
vec3 tmNone(vec3 c) { return clamp(c, 0.0, 1.0); }
vec3 tmReinhard(vec3 c) { return clamp(c / (1.0 + c), 0.0, 1.0); }
vec3 labRRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 tmACES(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = IN * (c / 0.6); c = labRRTAndODTFit(c); return clamp(OUT * c, 0.0, 1.0);
}
const mat3 R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 SRGB_TO_R2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
vec3 agxContrast(vec3 x) { vec3 x2 = x * x; vec3 x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 tmAgX(vec3 c) {
  const mat3 INSET = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 OUTSET = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float MINEV = -12.47393, MAXEV = 4.026069;
  c = INSET * (SRGB_TO_R2020 * c);
  c = clamp((log2(max(c, 1e-10)) - MINEV) / (MAXEV - MINEV), 0.0, 1.0);
  c = OUTSET * agxContrast(c);
  c = pow(max(vec3(0.0), c), vec3(2.2));
  return clamp(R2020_TO_SRGB * c, 0.0, 1.0);
}
vec3 tmNeutral(vec3 c) {
  const float START = 0.76, DESAT = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < START) return c;
  float d = 1.0 - START;
  float np = 1.0 - d * d / (peak + d - START);
  c *= np / peak;
  float g = 1.0 - 1.0 / (DESAT * (peak - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 tonemap(vec3 c, int op) {
  if (op == 1) return tmReinhard(c);
  if (op == 2) return tmACES(c);
  if (op == 3) return tmAgX(c);
  if (op == 4) return tmNeutral(c);
  return tmNone(c);
}
float srgbEncode1(float x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1.0 / 2.4) - 0.055; }
vec3 srgbEncode(vec3 c) { c = clamp(c, 0.0, 1.0); return vec3(srgbEncode1(c.r), srgbEncode1(c.g), srgbEncode1(c.b)); }
`;

const mul = (m, v) => [  // m given as three columns, like GLSL mat3(col0, col1, col2)
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];
const clamp01 = v => v.map(x => Math.min(1, Math.max(0, x)));
export const TONEMAP_JS = [
  c => clamp01(c),
  c => clamp01(c.map(x => x / (1 + x))),
  c => {
    const IN = [[0.59719, 0.07600, 0.02840], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
    const OUT = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
    const v = mul(IN, c.map(x => x / 0.6)).map(x => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081));
    return clamp01(mul(OUT, v));
  },
  c => {
    const S2R = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.0880], [0.0433, 0.0113, 0.8956]];
    const R2S = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
    const INSET = [[0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
    const OUTSET = [[1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294], [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
    let v = mul(INSET, mul(S2R, c)).map(x => Math.min(1, Math.max(0, (Math.log2(Math.max(x, 1e-10)) + 12.47393) / (4.026069 + 12.47393))));
    v = v.map(x => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; });
    v = mul(OUTSET, v).map(x => Math.pow(Math.max(0, x), 2.2));
    return clamp01(mul(R2S, v));
  },
  c => {
    const x = Math.min(...c), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    let v = c.map(y => y - off);
    const peak = Math.max(...v);
    if (peak < 0.76) return v;
    const d = 0.24, np = 1 - d * d / (peak + d - 0.76);
    v = v.map(y => y * np / peak);
    const g = 1 - 1 / (0.15 * (peak - np) + 1);
    return v.map(y => y + (np - y) * g);
  },
];
export const srgbEncode = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

/* ---------- false colour ----------
   Turbo, Google's perceptual rainbow (polynomial fit by Anton Mikhailov), for "how much light" views. */
export const TURBO_GLSL = /* glsl */`
vec3 turbo(float x) {
  const vec4 kr = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  const vec4 kg = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  const vec4 kb = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  const vec2 kr2 = vec2(-152.94239396, 59.28637943);
  const vec2 kg2 = vec2(4.27729857, 2.82956604);
  const vec2 kb2 = vec2(-89.90310912, 27.34824973);
  x = clamp(x, 0.0, 1.0);
  vec4 v4 = vec4(1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  return vec3(dot(v4, kr) + dot(v2, kr2), dot(v4, kg) + dot(v2, kg2), dot(v4, kb) + dot(v2, kb2));
}`;
export function turboCSS(x) {
  const v4 = [1, x, x * x, x * x * x], v2 = [v4[2] * v4[2], v4[3] * v4[2]];
  const d = (a, b) => a.reduce((s, ai, i) => s + ai * b[i], 0);
  const r = d(v4, [0.13572138, 4.61539260, -42.66032258, 132.13108234]) + d(v2, [-152.94239396, 59.28637943]);
  const g = d(v4, [0.09140261, 2.19418839, 4.84296658, -14.18503333]) + d(v2, [4.27729857, 2.82956604]);
  const b = d(v4, [0.10667330, 12.64194608, -60.58204836, 110.36276771]) + d(v2, [-89.90310912, 27.34824973]);
  const c = v => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
export function legend(stops, labels) {
  const cells = Array.from({ length: stops }, (_, i) => `<span style="flex:1;background:${turboCSS(i / (stops - 1))}"></span>`).join('');
  return `<div class="legend">${cells}</div><div class="legend-l">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
}

/* ---------- studio cyc: a floor that curves up into a back wall, so there's no horizon ---------- */
export function cyc({ width = 14, depth = 6, height = 6, radius = 2, color = 0xd9d6d0, roughness = 0.85 } = {}) {
  const shape = [];
  shape.push(new THREE.Vector2(depth, 0));
  shape.push(new THREE.Vector2(0, 0));
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * Math.PI / 2;
    shape.push(new THREE.Vector2(-Math.sin(a) * radius, radius - Math.cos(a) * radius));
  }
  shape.push(new THREE.Vector2(-radius, height));
  // sweep the profile across x: build a ribbon by hand
  const pos = [], uv = [], idx = [];
  const segX = 2;
  for (let i = 0; i < shape.length; i++) {
    for (let j = 0; j <= segX; j++) {
      const x = -width / 2 + (j / segX) * width;
      pos.push(x, shape[i].y, shape[i].x);
      uv.push(j / segX, i / (shape.length - 1));
    }
  }
  for (let i = 0; i < shape.length - 1; i++) for (let j = 0; j < segX; j++) {
    const a = i * (segX + 1) + j, b = a + segX + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness }));
  m.receiveShadow = true;
  m.position.z = -1.2;
  return m;
}

/* ---------- the still life used by lessons 0, 8 and 9 ---------- */
export async function stillLife() {
  const { TeapotGeometry } = await import('three/addons/geometries/TeapotGeometry.js');
  const group = new THREE.Group();
  const mats = {
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xe8e2d6, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.6, side: THREE.DoubleSide }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xf2c46b, roughness: 0.18, metalness: 1 }),
    clay: new THREE.MeshPhysicalMaterial({ color: 0xb8553a, roughness: 0.75 }),
    blue: new THREE.MeshPhysicalMaterial({ color: 0x2d4a8a, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0x8fa8e0), sheenRoughness: 0.5 }),
  };
  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const teapot = new TeapotGeometry(0.32, 12);
  add(teapot, mats.ceramic, -0.55, 0.32 * 0.75 + 0.005, -0.15, 0.6);
  add(new THREE.SphereGeometry(0.28, 64, 32), mats.glass, 0.35, 0.28, 0.25);
  const ring = add(new THREE.TorusGeometry(0.2, 0.05, 32, 96), mats.gold, 0.95, 0.05, -0.2);
  ring.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.36, 0.36, 0.36), mats.clay, 0.6, 0.18, -0.65, 0.5);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 64), mats.blue, -1.15, 0.35, -0.7);
  return { group, mats };
}

/* ---------- the Cornell box (lessons 6 and 9) ----------
   2 m cube, open at the front (+z), floor at y = 0, matching tools/blender/cornell.py. */
export const CORNELL = {
  red: 0xa8231c, green: 0x2f8a2a, white: 0xc9c5bd,
  camera: { pos: [0, 1, 3.9], target: [0, 1, 0], fov: 39.3 },
};
export function cornellBox() {
  const group = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  const white = mat(CORNELL.white), red = mat(CORNELL.red), green = mat(CORNELL.green);
  const wall = (w, h, m, pos, rot) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...pos); p.rotation.set(...rot);
    p.receiveShadow = true; p.castShadow = true;
    group.add(p);
    return p;
  };
  wall(2, 2, white, [0, 0, 0], [-Math.PI / 2, 0, 0]);          // floor
  wall(2, 2, white, [0, 2, 0], [Math.PI / 2, 0, 0]);           // ceiling
  wall(2, 2, white, [0, 1, -1], [0, 0, 0]);                    // back
  wall(2, 2, red, [-1, 1, 0], [0, Math.PI / 2, 0]);            // left
  wall(2, 2, green, [1, 1, 0], [0, -Math.PI / 2, 0]);          // right
  const box = (w, h, d, x, z, ry) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    b.position.set(x, h / 2, z); b.rotation.y = ry;
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  };
  box(0.6, 1.2, 0.6, -0.33, -0.3, 0.3);
  box(0.6, 0.6, 0.6, 0.35, 0.3, -0.3);
  return { group, white, red, green };
}

/* Scan an HDRI for its brightest pixel (the sun, outdoors) and its average, sphere-weighted. */
const statCache = {};
export async function hdriStats(ctx, name) {
  if (name in statCache) return statCache[name];
  if (!ctx.HDRI[name]) return (statCache[name] = null);
  const t = await ctx.hdri(name);
  const { data, width, height } = t.image;
  const f = data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : x => x;
  let best = 0, bi = 0, sum = 0, sumW = 0;
  for (let y = 0; y < height; y++) {
    const w = Math.sin((y + 0.5) / height * Math.PI);   // rows near the poles cover less of the sphere
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const Y = 0.2126 * f(data[i]) + 0.7152 * f(data[i + 1]) + 0.0722 * f(data[i + 2]);
      sum += Y * w; sumW += w;
      if (Y > best) { best = Y; bi = y * width + x; }
    }
  }
  // three samples equirects with u = atan(z, x) / 2π + 0.5 and v = asin(y) / π + 0.5,
  // and HDRLoader flips rows so the file's first row is the top of the sky
  const u = (bi % width + 0.5) / width, v = 1 - (Math.floor(bi / width) + 0.5) / height;
  const az = (u - 0.5) * 2 * Math.PI, el = (v - 0.5) * Math.PI;
  const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  return (statCache[name] = { best, avg: sum / sumW, dir, elev: el * 180 / Math.PI });
}

/* Pretty-print numbers in readouts */
export const num = (v, d = 2) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 10000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(d);
};
