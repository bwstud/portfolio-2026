/* Kaleidoscope configurations: the settings every scope has, the built-in set, and where
   new ones made in the lab are kept.

   Saved configurations live in one of two places:
   - In the project, as tinkering/kaleidoscopes/configs.json, when the lab runs on the local
     server (`npm run dev`). That file ships with the site, so they appear for everyone.
   - In this browser's localStorage, anywhere else (the deployed site has no server to write
     to). Those are only visible in the browser that made them.
   The main page shows the built-in set, then the project's, then this browser's. */
import { MIRRORS } from './scope.js';

/* Every setting, grouped as the lab shows them. The lab builds its controls from this. */
export const SECTIONS = [
  {
    title: 'Mirrors',
    fields: [
      { key: 'mirrors', label: 'Arrangement', type: 'select', options: Object.entries(MIRRORS).map(([value, m]) => ({ value, label: m.label })),
        help: 'Two mirrors repeat the picture around a centre. Three or four mirrors tile it out to the edge.' },
      { key: 'segments', label: 'Mirror angle', type: 'range', min: 2, max: 24, step: 1, only: c => c.mirrors === 'wedge',
        format: v => `180° ÷ ${v} = ${(180 / v).toFixed(1).replace(/\.0$/, '')}°`, help: 'The picture repeats twice this many times around the centre.' },
      { key: 'zoom', label: 'Pattern size', type: 'range', min: 0.4, max: 6, step: 0.05, format: v => `${v.toFixed(2)}×`,
        help: 'How many mirror cells fit across the view. Higher is a finer pattern.' },
    ],
  },
  {
    title: 'Object cell',
    note: 'The part of the picture the mirrors reflect.',
    fields: [
      { key: 'picScale', label: 'Picture under the mirrors', type: 'range', min: 0.05, max: 1.5, step: 0.01, format: v => `${Math.round(v * 100)}%`,
        help: 'How much of the picture one cell takes in. Small values magnify detail.' },
      { key: 'cellRotate', label: 'Turn', type: 'range', min: -180, max: 180, step: 1, format: v => `${v}°` },
      { key: 'cellX', label: 'Across', type: 'range', min: -1, max: 1, step: 0.01, format: v => v.toFixed(2) },
      { key: 'cellY', label: 'Up', type: 'range', min: -1, max: 1, step: 0.01, format: v => v.toFixed(2) },
    ],
  },
  {
    title: 'Motion',
    fields: [
      { key: 'turn', label: 'Turning the tube', type: 'range', min: -30, max: 30, step: 0.5, format: v => `${v}°/s`,
        help: 'Turns the picture under the mirrors, which is what turning a real kaleidoscope does.' },
      { key: 'drift', label: 'Drift', type: 'range', min: 0, max: 3, step: 0.05, format: v => v.toFixed(2),
        help: 'Slides the picture slowly about, like loose beads settling.' },
      { key: 'spin', label: 'Spin the view', type: 'range', min: -30, max: 30, step: 0.5, format: v => `${v}°/s` },
      { key: 'breathe', label: 'Breathe', type: 'range', min: 0, max: 1, step: 0.01, format: v => v.toFixed(2),
        help: 'The pattern grows and shrinks a little, slowly.' },
    ],
  },
  {
    title: 'Glass and mirrors',
    fields: [
      { key: 'loss', label: 'Light lost per reflection', type: 'range', min: 0, max: 0.3, step: 0.005, format: v => `${Math.round(v * 1000) / 10}%`,
        help: 'Real mirrors keep 90–96% of the light, so images reflected many times are darker.' },
      { key: 'seam', label: 'Mirror seams', type: 'range', min: 0, max: 1, step: 0.01, format: v => v.toFixed(2) },
      { key: 'aberration', label: 'Colour fringing', type: 'range', min: 0, max: 0.06, step: 0.001, format: v => v.toFixed(3) },
      { key: 'lens', label: 'Lens bulge', type: 'range', min: -0.6, max: 0.9, step: 0.01, format: v => v.toFixed(2) },
      { key: 'twist', label: 'Twist', type: 'range', min: -3, max: 3, step: 0.01, format: v => v.toFixed(2),
        help: 'Turns the view more the farther it is from the centre.' },
    ],
  },
  {
    title: 'Eyepiece',
    fields: [
      { key: 'eyepiece', label: 'Shape', type: 'select', options: [{ value: 'circle', label: 'Round eyepiece' }, { value: 'full', label: 'Full screen' }] },
      { key: 'eyeSize', label: 'Size', type: 'range', min: 0.5, max: 1.6, step: 0.01, format: v => v.toFixed(2), only: c => c.eyepiece === 'circle' },
      { key: 'edge', label: 'Edge softness', type: 'range', min: 0, max: 0.2, step: 0.005, format: v => v.toFixed(3), only: c => c.eyepiece === 'circle' },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01, format: v => v.toFixed(2) },
      { key: 'sheen', label: 'Glass sheen', type: 'range', min: 0, max: 0.6, step: 0.01, format: v => v.toFixed(2) },
      { key: 'rim', label: 'Tube colour', type: 'color' },
    ],
  },
  {
    title: 'Colour',
    fields: [
      { key: 'brightness', label: 'Brightness', type: 'range', min: -0.4, max: 0.4, step: 0.01, format: v => v.toFixed(2) },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0.5, max: 1.8, step: 0.01, format: v => v.toFixed(2) },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.01, format: v => v.toFixed(2) },
      { key: 'hue', label: 'Hue shift', type: 'range', min: -180, max: 180, step: 1, format: v => `${v}°` },
      { key: 'tint', label: 'Glass tint', type: 'color' },
      { key: 'tintAmount', label: 'Tint strength', type: 'range', min: 0, max: 1, step: 0.01, format: v => v.toFixed(2) },
    ],
  },
];

export const FIELDS = Object.fromEntries(SECTIONS.flatMap(s => s.fields).map(f => [f.key, f]));

export const DEFAULTS = {
  mirrors: 'tri60', segments: 6, zoom: 1.6,
  picScale: 0.42, cellRotate: 0, cellX: 0, cellY: 0,
  turn: 3, drift: 0.4, spin: 0, breathe: 0,
  loss: 0.05, seam: 0.25, aberration: 0, lens: 0, twist: 0,
  eyepiece: 'circle', eyeSize: 0.94, edge: 0.03, vignette: 0.4, sheen: 0.14, rim: '#0a0a0c',
  brightness: 0, contrast: 1, saturation: 1, hue: 0, tint: '#ffffff', tintAmount: 0,
};

const preset = (id, name, about, params) => ({ id, name, about, builtin: true, params: { ...DEFAULTS, ...params } });

export const BUILTINS = [
  preset('classic', 'Classic', 'Three mirrors in an equilateral triangle, the usual toy kaleidoscope.', {}),
  preset('snowflake', 'Snowflake', 'Two mirrors at 30°, for six-fold symmetry.', {
    mirrors: 'wedge', segments: 6, zoom: 1, picScale: 0.55, turn: 2, loss: 0.03 }),
  preset('rose-window', 'Rose window', 'Two mirrors at 22.5°, for eight petals, with a little glow.', {
    mirrors: 'wedge', segments: 8, zoom: 1, picScale: 0.5, saturation: 1.15, sheen: 0.2, seam: 0.35 }),
  preset('mandala', 'Mandala', 'Sixteen-fold, fine and slow.', {
    mirrors: 'wedge', segments: 16, zoom: 1, picScale: 0.36, turn: 1.5, drift: 0.25, loss: 0.02, seam: 0.15 }),
  preset('tile-floor', 'Tile floor', 'A right-isosceles triangle tiled edge to edge across the screen.', {
    mirrors: 'tri45', zoom: 2.6, picScale: 0.3, eyepiece: 'full', vignette: 0.2, loss: 0.01, seam: 0.2, sheen: 0 }),
  preset('star-chart', 'Star chart', 'The 30-60-90 triangle, which gives six- and three-fold stars.', {
    mirrors: 'tri30', zoom: 2, picScale: 0.4, turn: -2.5 }),
  preset('mosaic', 'Mosaic', 'Four mirrors in a square, a grid of reflections.', {
    mirrors: 'square', zoom: 2.4, picScale: 0.32, eyepiece: 'full', seam: 0.45, vignette: 0.25, sheen: 0, loss: 0.015 }),
  preset('whirlpool', 'Whirlpool', 'Five-fold, twisted and spinning.', {
    mirrors: 'wedge', segments: 5, zoom: 1, picScale: 0.5, twist: 1.3, spin: 6, turn: 1, seam: 0.1 }),
  preset('prism', 'Prism', 'Seven-fold through a bulging lens with colour fringes.', {
    mirrors: 'wedge', segments: 7, zoom: 1.1, picScale: 0.45, aberration: 0.03, lens: 0.35, saturation: 1.2, sheen: 0.22 }),
  preset('antique-brass', 'Antique brass', 'Old, tarnished mirrors in a brass tube.', {
    mirrors: 'tri60', zoom: 1.8, loss: 0.085, tint: '#f0c98a', tintAmount: 0.45, saturation: 0.7, contrast: 1.1,
    vignette: 0.65, rim: '#2a1d0f', sheen: 0.08, seam: 0.4 }),
];

/* Fill in anything a saved configuration is missing and drop keys we don't know, so old
   saves keep working after settings are added. */
export function normalise(params) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const v = params?.[key];
    if (v === undefined || v === null) continue;
    const f = FIELDS[key];
    if (f?.type === 'range') {
      const n = Number(v);
      if (Number.isFinite(n)) out[key] = Math.min(f.max, Math.max(f.min, n));
    } else if (f?.type === 'select') {
      if (f.options.some(o => o.value === v)) out[key] = v;
    } else if (f?.type === 'color') {
      if (/^#[0-9a-f]{6}$/i.test(v)) out[key] = v.toLowerCase();
    }
  }
  return out;
}

/* ---------- where saved configurations live ---------- */
const API = '/__kaleido';
const LS_KEY = 'kaleidoscopes:configs';
let mode = null; // 'project' | 'browser'

export async function storeMode() {
  if (mode) return mode;
  try {
    const res = await fetch(`${API}/ping`, { cache: 'no-store' });
    mode = res.ok ? 'project' : 'browser';
  } catch { mode = 'browser'; }
  return mode;
}

const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const lsWrite = list => { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; } catch { return false; } };

function tidy(list, origin) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
    .map(c => ({ id: c.id, name: c.name, about: c.about ?? '', savedAt: c.savedAt ?? '', origin, params: normalise(c.params) }));
}

/* base: the path to the kaleidoscopes folder, relative to the page ('' or '../') */
export async function loadProject(base) {
  try {
    const res = await fetch(`${base}configs.json`, { cache: 'no-store' });
    return res.ok ? tidy(await res.json(), 'project') : [];
  } catch { return []; }
}

export const loadBrowser = () => tidy(lsRead(), 'browser');

export async function loadAll(base) {
  const builtins = BUILTINS.map(c => ({ ...c, origin: 'builtin' }));
  const project = await loadProject(base);
  const taken = new Set([...builtins, ...project].map(c => c.id));
  return [...builtins, ...project, ...loadBrowser().filter(c => !taken.has(c.id))];
}

const strip = ({ id, name, about, savedAt, params }) => ({ id, name, about, savedAt, params });

/* Save the full list of this store's configurations (the project file, or this browser). */
export async function saveList(list) {
  const clean = list.map(strip);
  if ((await storeMode()) === 'project') {
    const res = await fetch(`${API}/configs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error((await res.text()) || `Saving failed (${res.status}).`);
    return;
  }
  if (!lsWrite(clean)) throw new Error('This browser would not save it. Private windows often block storage.');
}

export function makeId(name, taken) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'untitled';
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/* Share a configuration in a link: #c=<base64url JSON> */
export function encodeShare(name, params) {
  const json = JSON.stringify({ name, params });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(s) {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    const { name, params } = JSON.parse(new TextDecoder().decode(bytes));
    return { id: 'shared', name: typeof name === 'string' ? name.slice(0, 80) : 'Shared', about: 'From a shared link.', origin: 'shared', params: normalise(params) };
  } catch { return null; }
}
