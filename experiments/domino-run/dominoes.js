/* Domino styles, colours, and the meshes that show them.
   A domino's local axes: x across its width, y up its height, z through its thickness.
   It faces +z, and a push tips it forward onto that face. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PARAMS, dims, stdHeight } from './params.js';

export const STYLES = [
  { id: 'toppling', name: 'Toppling', note: 'Glossy plastic, the kind used for long runs.', density: 1150, friction: 1, sound: 'plastic', color: '#d8402f', roughness: 0.2, clearcoat: 0.7, bevel: 0.6 },
  { id: 'classic', name: 'Classic', note: 'Rounded tiles with pips on both faces.', density: 1500, friction: 1, sound: 'plastic', color: '#f2ede0', roughness: 0.32, clearcoat: 0.3, bevel: 1.5, pips: true },
  { id: 'wood', name: 'Wooden', note: 'Maple blocks with the grain showing through the stain.', density: 700, friction: 1.25, sound: 'wood', color: '#c9a06b', roughness: 0.62, bevel: 0.5, grain: true },
  { id: 'acrylic', name: 'Acrylic', note: 'Clear tinted plastic. Light passes through.', density: 1180, friction: 0.9, sound: 'acrylic', color: '#5fb6e8', roughness: 0.04, bevel: 0.5, glass: true },
  { id: 'steel', name: 'Steel', note: 'Brushed metal, seven times as heavy, and loud.', density: 7800, friction: 0.8, sound: 'metal', color: '#b9bec4', roughness: 0.34, metal: true, bevel: 0.4 },
];
export const styleById = Object.fromEntries(STYLES.map(s => [s.id, s]));

export const COLORS = [
  ['Red', '#d8402f'], ['Orange', '#ec7a26'], ['Yellow', '#f2c230'], ['Lime', '#9cc63b'],
  ['Green', '#2f9a57'], ['Teal', '#1f9a9a'], ['Sky', '#5fb6e8'], ['Blue', '#2f5fd0'],
  ['Indigo', '#4b3fa8'], ['Purple', '#8a46b8'], ['Pink', '#e46aa4'], ['Ivory', '#f2ede0'],
  ['White', '#fafafa'], ['Grey', '#8d9196'], ['Black', '#1b1c1e'], ['Maple', '#c9a06b'],
  ['Walnut', '#6b4a32'], ['Gold', '#d4a843'],
];

/* ---------- textures ---------- */
let grainTex = null;
function grain() {
  if (grainTex) return grainTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 512);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x0 = r() * 256, amp = 3 + r() * 10, f = 0.004 + r() * 0.01, ph = r() * 6;
    g.strokeStyle = `rgba(90, 55, 25, ${0.05 + r() * 0.16})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let y = 0; y <= 512; y += 8) g.lineTo(x0 + Math.sin(y * f + ph) * amp + Math.sin(y * 0.05 + ph) * 1.2, y);
    g.stroke();
  }
  grainTex = new THREE.CanvasTexture(c);
  grainTex.colorSpace = THREE.SRGBColorSpace;
  grainTex.anisotropy = 4;
  return grainTex;
}

const luminance = hex => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

const PIP_LAYOUT = {
  0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};
const pipTextures = new Map();
function pipTexture(color, a, b) {
  const key = `${color}|${a}|${b}|${PARAMS.pipSize}`;
  if (pipTextures.has(key)) return pipTextures.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 256);
  const ink = luminance(color) > 0.45 ? '#16171a' : '#f4f1ea';
  g.fillStyle = ink;
  g.fillRect(18, 126, 92, 4);
  const half = (v, y0) => {
    for (const [i, j] of PIP_LAYOUT[v]) {
      g.beginPath();
      g.arc(30 + j * 34, y0 + 22 + i * 40, 9.5 * PARAMS.pipSize, 0, Math.PI * 2);
      g.fill();
    }
  };
  half(a, 6); half(b, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  pipTextures.set(key, t);
  return t;
}

/* ---------- geometry, one per style at the standard height; meshes scale it ---------- */
let geos = null;
export function geometries() {
  if (geos) return geos;
  const { h, w, t } = dims(stdHeight());
  geos = {};
  for (const s of STYLES) {
    const r = Math.min(t * 0.49, t * PARAMS.bevel * s.bevel);
    geos[s.id] = new RoundedBoxGeometry(w, h, t, 3, Math.max(r, 1e-5));
  }
  const o = PARAMS.outline * h;
  geos.outline = new RoundedBoxGeometry(w + o, h + o, t + o, 2, Math.min((t + o) * 0.45, t * 0.3 + o / 2));
  // a pad on the surface under the domino, so a selection reads even when it's tiny on screen
  const pw = w * 1.45, pt = t + w * 0.45, pr = Math.min(pw, pt) * 0.35;
  const shape = new THREE.Shape();
  shape.moveTo(-pw / 2 + pr, -pt / 2);
  shape.lineTo(pw / 2 - pr, -pt / 2); shape.quadraticCurveTo(pw / 2, -pt / 2, pw / 2, -pt / 2 + pr);
  shape.lineTo(pw / 2, pt / 2 - pr); shape.quadraticCurveTo(pw / 2, pt / 2, pw / 2 - pr, pt / 2);
  shape.lineTo(-pw / 2 + pr, pt / 2); shape.quadraticCurveTo(-pw / 2, pt / 2, -pw / 2, pt / 2 - pr);
  shape.lineTo(-pw / 2, -pt / 2 + pr); shape.quadraticCurveTo(-pw / 2, -pt / 2, -pw / 2 + pr, -pt / 2);
  geos.pad = new THREE.ShapeGeometry(shape, 4);
  geos.pad.rotateX(-Math.PI / 2);
  geos.pad.translate(0, -h / 2 + h * 0.004, 0);
  return geos;
}
export function resetLook() {
  if (geos) for (const g of Object.values(geos)) g.dispose();
  geos = null;
  for (const m of mats.values()) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
  mats.clear();
  for (const t of pipTextures.values()) t.dispose();
  pipTextures.clear();
}

/* ---------- materials, shared by style + colour (+ pips) ---------- */
const mats = new Map();
export function material(styleId, color, pips) {
  const s = styleById[styleId] ?? STYLES[0];
  const key = s.pips ? `${s.id}|${color}|${pips[0]}${pips[1]}` : `${s.id}|${color}`;
  if (mats.has(key)) return mats.get(key);
  const gloss = Math.max(0.05, PARAMS.gloss);
  const rough = THREE.MathUtils.clamp(s.roughness / gloss, 0.02, 1);
  let m;
  if (s.glass) {
    m = new THREE.MeshPhysicalMaterial({
      color, roughness: rough, transmission: 1, thickness: 0.006, ior: 1.49,
      attenuationColor: new THREE.Color(color), attenuationDistance: 0.012, specularIntensity: 1,
    });
  } else if (s.metal) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 1, clearcoat: 0.1 });
  } else if (s.grain) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, map: grain() });
  } else {
    const side = new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: s.clearcoat ?? 0, clearcoatRoughness: 0.2 });
    if (s.pips) {
      const face = side.clone();
      face.map = pipTexture(color, pips[0], pips[1]);
      face.color.set('#ffffff');
      // BoxGeometry groups: +x, -x, +y, -y, +z, -z
      m = [side, side, side, side, face, face];
    } else m = side;
  }
  mats.set(key, m);
  return m;
}

const padMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const padMats = {
  selected: padMat('#f2a541', 0.75), locked: padMat('#7fa2c8', 0.5), lockedSelected: padMat('#b9d4f2', 0.75),
  group: padMat('#f2a541', 0.28), hover: padMat('#ffffff', 0.35), bad: padMat('#ff4d4d', 0.8),
};
const outlineMats = {
  selected: new THREE.MeshBasicMaterial({ color: '#f2a541', side: THREE.BackSide }),
  locked: new THREE.MeshBasicMaterial({ color: '#7fa2c8', side: THREE.BackSide }),
  lockedSelected: new THREE.MeshBasicMaterial({ color: '#b9d4f2', side: THREE.BackSide }),
  group: new THREE.MeshBasicMaterial({ color: '#f2a541', side: THREE.BackSide, transparent: true, opacity: 0.35, depthWrite: false }),
  hover: new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, transparent: true, opacity: 0.5, depthWrite: false }),
  bad: new THREE.MeshBasicMaterial({ color: '#ff4d4d', side: THREE.BackSide }),
};

export function ghostMaterial(bad) {
  return bad ? ghostBad : ghostOk;
}
const ghostOk = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.4, depthWrite: false });
const ghostBad = new THREE.MeshStandardMaterial({ color: '#ff5b4d', transparent: true, opacity: 0.6, roughness: 0.4, depthWrite: false });

/* ---------- a domino's mesh ---------- */
export function makeView(d) {
  const g = geometries();
  const mesh = new THREE.Mesh(g[d.style] ?? g.toppling, material(d.style, d.color, d.pips));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const outline = new THREE.Mesh(g.outline, outlineMats.selected);
  outline.visible = false;
  outline.renderOrder = -1;
  mesh.add(outline);
  const pad = new THREE.Mesh(g.pad, padMats.selected);
  pad.visible = false;
  pad.renderOrder = 1;
  pad.raycast = () => {};
  outline.raycast = () => {};
  mesh.add(pad);
  mesh.userData.dominoId = d.id;
  const view = { mesh, outline, pad, glow: null };
  placeView(view, d);
  return view;
}

export function restyleView(view, d) {
  const g = geometries();
  view.mesh.geometry = g[d.style] ?? g.toppling;
  view.outline.geometry = g.outline;
  view.pad.geometry = g.pad;
  if (!view.glow) view.mesh.material = material(d.style, d.color, d.pips);
  placeView(view, d);
}

export function placeView(view, d) {
  const s = d.h / stdHeight();
  view.mesh.scale.setScalar(s);
  view.mesh.position.set(d.x, d.y + d.h / 2, d.z);
  view.mesh.rotation.set(0, d.yaw, 0);
}

export function setOutline(view, kind) {
  view.outline.visible = !!kind;
  view.pad.visible = !!kind;
  if (kind) { view.outline.material = outlineMats[kind]; view.pad.material = padMats[kind]; }
}

/* a little preview canvas for the style list */
export function styleSwatch(styleId, color, size = 40) {
  const s = styleById[styleId];
  const c = document.createElement('canvas');
  c.width = size; c.height = size * 1.6;
  const g = c.getContext('2d');
  const w = size * 0.46, h = size * 0.92, x = (size - w) / 2, y = (c.height - h) / 2;
  const grd = g.createLinearGradient(x, 0, x + w, 0);
  const base = new THREE.Color(color);
  const lite = base.clone().lerp(new THREE.Color('#fff'), s.metal ? 0.55 : 0.25).getStyle();
  const dark = base.clone().multiplyScalar(s.metal ? 0.55 : 0.72).getStyle();
  grd.addColorStop(0, dark); grd.addColorStop(0.45, lite); grd.addColorStop(1, dark);
  g.globalAlpha = s.glass ? 0.6 : 1;
  g.fillStyle = grd;
  const r = s.pips ? 4 : 2;
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
  g.globalAlpha = 1;
  if (s.pips) {
    const ink = luminance(color) > 0.45 ? '#16171a' : '#f4f1ea';
    g.fillStyle = ink;
    g.fillRect(x + 3, y + h / 2 - 0.5, w - 6, 1);
    for (const [px, py] of [[0.3, 0.2], [0.7, 0.36], [0.5, 0.7], [0.3, 0.84], [0.7, 0.84], [0.3, 0.58], [0.7, 0.58]]) {
      g.beginPath(); g.arc(x + w * px, y + h * py, 1.7, 0, Math.PI * 2); g.fill();
    }
  }
  if (s.grain) {
    g.strokeStyle = 'rgba(70, 40, 15, 0.25)';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + 3 + i * w / 4, y); g.bezierCurveTo(x + 6 + i * w / 4, y + h / 3, x + i * w / 4, y + 2 * h / 3, x + 4 + i * w / 4, y + h); g.stroke(); }
  }
  return c;
}
