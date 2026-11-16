import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { revolve, canvasTexture, decalMaterial, baseMaterials, mulberry } from './kit.js';
import { REAL } from './sets.js';

/* Scene units are metres of the physical chess set: the board is 46 cm across. */

const SQ = 0.052;                         // square, 52 mm
const PLINTH = 0.006;                     // base height under every piece
const PAWN_SPAN = 0.024;                  // a satellite's largest dimension
const PAWN_ROD = 0.008;
const TOURNAMENT = { king: 0.095, queen: 0.085, bishop: 0.072, knight: 0.062, rook: 0.056 };
const BASE_R = { king: 0.017, queen: 0.017, bishop: 0.0165, knight: 0.016, rook: 0.016, pawn: 0.0125 };
const ORDER = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const MAJORS = ['king', 'queen', 'bishop', 'knight', 'rook'];

const params = new URLSearchParams(location.search);
if (params.get('ui') === '0') document.body.classList.add('no-ui');
const store = {
  get(k) { try { return localStorage.getItem('rocket-chess:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('rocket-chess:' + k, v); } catch {} },
};
const state = {
  set: REAL,
  view: params.get('view') || store.get('view') || 'board',
  scale: store.get('scale') === 'tournament' ? 'tournament' : 'true',
  finish: store.get('finish') === 'mono' ? 'mono' : 'livery',
  spin: store.get('spin') === '1',
  selected: params.get('piece') || store.get('piece') || 'king',
};
if (!(state.selected in REAL.pieces) && !/^pawn[0-7]$/.test(state.selected)) state.selected = 'king';

/* ---------- renderer, scene, camera ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const labels = new CSS2DRenderer({ element: document.getElementById('labels') });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c0f);
scene.fog = new THREE.Fog(0x0b0c0f, 1.4, 3.6);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.002, 12);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.03;
controls.maxDistance = 2.2;
controls.maxPolarAngle = Math.PI * 0.495;
controls.screenSpacePanning = true;
controls.autoRotateSpeed = 0.5;

scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x1c1915, 0.5));
const key = new THREE.DirectionalLight(0xfff3e4, 2.2);
key.position.set(-0.7, 1.3, 0.8);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -0.42, right: 0.42, top: 0.42, bottom: -0.42, near: 0.4, far: 3.2 });
key.shadow.bias = -0.00015;
key.shadow.normalBias = 0.0006;
scene.add(key);
const rim = new THREE.DirectionalLight(0xa9c0ff, 0.9);
rim.position.set(0.8, 0.5, -1.0);
scene.add(rim);

const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.05;
floor.receiveShadow = true;
scene.add(floor);

/* ---------- board: brushed plates in a steel frame ---------- */
function brushed(seed) {
  const r = mulberry(seed);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 100 + r() * 90;
      g.fillStyle = `rgba(${v},${v},${v},${0.15 + r() * 0.3})`;
      g.fillRect(0, r() * h, w, 0.6 + r() * 1.4);
    }
  }, { repeat: true, srgb: false });
}
const brush = brushed(4);
const plate = (color, rough, rot) => new THREE.MeshPhysicalMaterial({
  color, metalness: 1, roughness: rough, roughnessMap: brush, anisotropy: 0.7, anisotropyRotation: rot, envMapIntensity: 0.6,
});
const SQUARES = {
  light: [plate(0xb4b8be, 0.5, 0), plate(0xb4b8be, 0.5, Math.PI / 2)],
  dark: [plate(0x2c2f35, 0.5, 0), plate(0x2c2f35, 0.5, Math.PI / 2)],
};
const frameMat = plate(0x9a9ea5, 0.36, 0);
const board = new THREE.Group();
{
  const sq = new THREE.BoxGeometry(SQ - 0.0006, 0.003, SQ - 0.0006);
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const dark = (f + r) % 2 === 0;
    const m = new THREE.Mesh(sq, SQUARES[dark ? 'dark' : 'light'][(f + r) % 4 < 2 ? 0 : 1]);
    m.position.set((f - 3.5) * SQ, -0.0015, (3.5 - r) * SQ);
    m.receiveShadow = true;
    board.add(m);
  }
  const span = 8 * SQ, rail = 0.022, H = 0.016;
  const back = new THREE.Mesh(new THREE.BoxGeometry(span, 0.004, span), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }));
  back.position.y = -0.005;
  board.add(back);
  for (const [w, d, x, z] of [[span + rail * 2, rail, 0, span / 2 + rail / 2], [span + rail * 2, rail, 0, -span / 2 - rail / 2],
    [rail, span, span / 2 + rail / 2, 0], [rail, span, -span / 2 - rail / 2, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), frameMat);
    m.position.set(x, 0.001 - H / 2, z);
    m.castShadow = m.receiveShadow = true;
    board.add(m);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.034, 32), frameMat);
    foot.position.set(sx * (span / 2 + rail / 2), -0.032, sz * (span / 2 + rail / 2));
    foot.castShadow = true;
    board.add(foot);
  }
  // engraved files and ranks on the frame
  const glyph = ch => decalMaterial(64, 64, (g, w, h) => {
    g.fillStyle = '#2a2c30'; g.font = `600 ${h * 0.62}px Geist, Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, h / 2);
  });
  const glyphGeo = new THREE.PlaneGeometry(0.011, 0.011);
  'abcdefgh'.split('').forEach((ch, i) => {
    const m = new THREE.Mesh(glyphGeo, glyph(ch));
    m.rotation.x = -Math.PI / 2;
    m.position.set((i - 3.5) * SQ, 0.0012, span / 2 + rail / 2);
    board.add(m);
  });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(glyphGeo, glyph(String(i + 1)));
    m.rotation.x = -Math.PI / 2;
    m.position.set(-span / 2 - rail / 2, 0.0012, (3.5 - i) * SQ);
    board.add(m);
  }
}
scene.add(board);

/* ---------- pieces ---------- */
const M = baseMaterials();
const templates = {};                     // built once, in metres
function template(key) {
  if (!templates[key]) {
    const def = key.startsWith('pawn') ? state.set.pawns[+key.slice(4)] : state.set.pieces[key];
    const g = def.build(M);
    g.updateMatrixWorld(true);
    templates[key] = g;
  }
  return templates[key];
}

const plinthMats = {
  white: new THREE.MeshPhysicalMaterial({ color: 0xc8cbd0, metalness: 1, roughness: 0.32, roughnessMap: brush, anisotropy: 0.6, envMapIntensity: 0.7 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x17181b, metalness: 0.85, roughness: 0.38, roughnessMap: brush, anisotropy: 0.6 }),
};
const accent = { white: new THREE.MeshStandardMaterial({ color: 0xb79a5b, metalness: 1, roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: 0x8a6d3b, metalness: 1, roughness: 0.35 }) };
const monoMats = {
  white: new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.35, metalness: 0 }),
  black: new THREE.MeshStandardMaterial({ color: 0x232327, roughness: 0.4, metalness: 0.3 }),
};
const rodMat = new THREE.MeshStandardMaterial({ color: 0xd6d8db, metalness: 1, roughness: 0.2 });
const plinthGeo = {};
function plinthGeometry(r) {
  return plinthGeo[r] ||= revolve([[0, 0], [r - 0.0006, 0], [r, 0.0006], [r, PLINTH - 0.0014], [r - 0.0012, PLINTH], [0, PLINTH]], { segments: 64, crease: 30 });
}

// model scale (model metres → board metres) for a key
function modelScale(key) {
  if (key.startsWith('pawn')) {
    const box = new THREE.Box3().setFromObject(template(key)), size = box.getSize(new THREE.Vector3());
    const n = Math.max(size.x, size.y, size.z) / PAWN_SPAN;
    const nice = n < 100 ? Math.round(n / 5) * 5 : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50;
    return 1 / nice;
  }
  if (state.scale === 'tournament') return (TOURNAMENT[key] - PLINTH) / state.set.pieces[key].height;
  return 1 / state.set.scale;
}

function makePiece(key, side) {
  const kind = key.startsWith('pawn') ? 'pawn' : key;
  const piece = new THREE.Group();
  piece.userData = { key, side };
  const base = new THREE.Mesh(plinthGeometry(BASE_R[kind]), plinthMats[side]);
  base.castShadow = base.receiveShadow = true;
  piece.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(BASE_R[kind] - 0.0028, 0.00035, 6, 64), accent[side]);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = PLINTH + 0.0001;
  piece.add(ring);

  const s = modelScale(key);
  const model = template(key).clone();
  model.scale.setScalar(s);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const ctr = box.getCenter(new THREE.Vector3());
  if (kind === 'pawn') {
    const mount = template(key).userData.mount.clone().multiplyScalar(s);
    let lift = PLINTH + PAWN_ROD - mount.y;
    lift = Math.max(lift, PLINTH + 0.0015 - box.min.y);
    model.position.set(-mount.x, lift, -mount.z);
    const top = mount.y + lift;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, top - PLINTH, 12), rodMat);
    rod.position.y = (top + PLINTH) / 2;
    rod.castShadow = true;
    piece.add(rod);
  } else {
    model.position.set(-ctr.x, PLINTH - box.min.y, -ctr.z);
  }
  model.userData.isModel = true;
  piece.add(model);
  model.traverse(o => { if (o.isMesh) o.userData.livery = o.material; });
  applyFinish(piece);
  if (side === 'black') piece.rotation.y = Math.PI;
  piece.userData.height = new THREE.Box3().setFromObject(piece).max.y;
  piece.userData.scale = s;
  return piece;
}

function applyFinish(piece) {
  const { side } = piece.userData;
  piece.traverse(o => {
    if (!o.isMesh || !o.userData.livery) return;
    o.material = state.finish === 'mono' ? monoMats[side] : o.userData.livery;
    o.visible = !(state.finish === 'mono' && o.userData.decal);
  });
}

const pieces = new THREE.Group();
scene.add(pieces);
function setUpBoard() {
  pieces.clear();
  for (const side of ['white', 'black']) {
    const home = side === 'white' ? 0 : 7, pawnRank = side === 'white' ? 1 : 6;
    ORDER.forEach((kind, f) => {
      const p = makePiece(kind, side);
      p.position.set((f - 3.5) * SQ, 0, (3.5 - home) * SQ);
      p.userData.square = 'abcdefgh'[f] + (home + 1);
      pieces.add(p);
    });
    for (let f = 0; f < 8; f++) {
      const p = makePiece('pawn' + f, side);
      p.position.set((f - 3.5) * SQ, 0, (3.5 - pawnRank) * SQ);
      p.userData.square = 'abcdefgh'[f] + (pawnRank + 1);
      pieces.add(p);
    }
  }
}

/* ---------- lineup: the five rockets side by side at 1:1250 with a ruler ---------- */
const lineup = new THREE.Group();
function setUpLineup() {
  lineup.clear();
  const s = 1 / state.set.scale, gap = 0.012;
  const items = MAJORS.map(k => {
    const m = template(k).clone();
    m.scale.setScalar(s);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    return { k, m, box, w: box.max.x - box.min.x };
  });
  const total = items.reduce((a, it) => a + it.w, 0) + gap * (items.length - 1);
  let x = -total / 2 + 0.01;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(total + 0.09, 0.006, 0.07), frameMat);
  shelf.position.set(-0.005, -0.003, 0);
  shelf.receiveShadow = shelf.castShadow = true;
  lineup.add(shelf);
  for (const it of items) {
    const ctr = it.box.getCenter(new THREE.Vector3());
    it.m.position.set(x + it.w / 2 - ctr.x, -it.box.min.y, -ctr.z);
    it.m.userData = { key: it.k, side: 'white', isModel: true };
    it.m.traverse(o => { if (o.isMesh) o.userData.livery = o.material; });
    const holder = new THREE.Group();
    holder.userData = { key: it.k, side: 'white', height: it.box.max.y - it.box.min.y };
    holder.add(it.m);
    lineup.add(holder);
    const def = state.set.pieces[it.k];
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `<b>${def.name}</b><span>${def.height.toFixed(1)} m · ${(def.height / state.set.scale * 1000).toFixed(1)} mm</span>`;
    const label = new CSS2DObject(tag);
    label.position.set(x + it.w / 2, -0.012, 0.03);
    lineup.add(label);
    x += it.w + gap;
  }
  // ruler: 0–130 m in model millimetres
  const rx = -total / 2 - 0.012, rulerMat = new THREE.MeshStandardMaterial({ color: 0xd9dbde, metalness: 0.8, roughness: 0.3 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 130 * s, 0.0012), rulerMat);
  bar.position.set(rx, 65 * s, 0);
  lineup.add(bar);
  for (let m = 0; m <= 130; m += 10) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(m % 50 ? 0.004 : 0.007, 0.0006, 0.0012), rulerMat);
    tick.position.set(rx + 0.002, m * s, 0);
    lineup.add(tick);
    if (m % 20 === 0) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.textContent = `${m} m`;
      const lab = new CSS2DObject(t);
      lab.position.set(rx - 0.004, m * s, 0);
      lineup.add(lab);
    }
  }
  // dashed guide at each rocket's real height
  const guide = new THREE.MeshBasicMaterial({ color: 0x5d626b });
  for (const it of items) {
    const y = it.box.max.y - it.box.min.y, cx = it.m.position.x + it.box.getCenter(new THREE.Vector3()).x;
    const line = new THREE.Mesh(new THREE.BoxGeometry(1, 0.0003, 0.0003), guide);
    line.scale.x = cx - rx;
    line.position.set((cx + rx) / 2, y, 0);
    lineup.add(line);
  }
  lineup.traverse(o => { if (o.isMesh && o.userData.livery) { o.castShadow = true; } });
}
scene.add(lineup);

/* ---------- views and camera moves ---------- */
const views = {
  board: { pos: [0.0, 0.5, 0.74], target: [0, 0.02, 0.02] },
  lineup: { pos: [0.0, 0.07, 0.3], target: [0.0, 0.052, 0] },
};
// on narrow screens, back the camera away until the board's full width fits
function fitView(v) {
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
  const k = Math.max(1, 0.3 / halfW);
  const t = new THREE.Vector3(...v.target);
  return { pos: new THREE.Vector3(...v.pos).sub(t).multiplyScalar(k).add(t).toArray(), target: v.target };
}
let fly = null;
function flyTo(pos, target, ms = 900) {
  fly = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target) };
}
function showView(view, instant = false) {
  state.view = view;
  store.set('view', view);
  board.visible = pieces.visible = view === 'board';
  lineup.visible = view === 'lineup';
  labels.domElement.style.display = view === 'lineup' ? '' : 'none';
  if (view === 'lineup' && !lineup.children.length) setUpLineup();
  const v = fitView(views[view]);
  if (instant) { camera.position.set(...v.pos); controls.target.set(...v.target); controls.update(); }
  else flyTo(v.pos, v.target);
  syncButtons();
}

function focusPiece(key) {
  const host = state.view === 'lineup' ? lineup : pieces;
  let target = null;
  host.children.forEach(p => { if (p.userData.key === key && (p.userData.side === 'white') && !target) target = p; });
  if (!target) return;
  const box = new THREE.Box3().setFromObject(target);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const h = Math.max(size.y, size.x * 0.8, 0.03);
  const dist = h / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
  const dir = new THREE.Vector3(0.35, 0.28, 1).normalize();
  flyTo(c.clone().addScaledVector(dir, dist).toArray(), c.toArray());
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
const listEl = $('pieces');
function entry(key, def, sub) {
  const b = document.createElement('button');
  b.className = 'piece m-menu__item m-menu__item--plain';
  b.dataset.key = key;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="piece__role m-legend">${def.role || 'Pawn · ' + 'abcdefgh'[+key.slice(4)]}</span>
    <span class="piece__name">${def.name}</span><span class="piece__sum">${sub}</span>`;
  b.addEventListener('click', () => select(key, true));
  return b;
}
function renderList() {
  listEl.innerHTML = '';
  const g1 = document.createElement('div');
  g1.className = 'group';
  g1.innerHTML = '<div class="label m-legend">Pieces · one scale</div>';
  MAJORS.forEach(k => { const d = state.set.pieces[k]; g1.appendChild(entry(k, d, `${d.flag} · ${d.height} m`)); });
  const g2 = document.createElement('div');
  g2.className = 'group';
  g2.innerHTML = '<div class="label m-legend">Pawns · satellites by launch</div>';
  state.set.pawns.forEach((d, i) => g2.appendChild(entry('pawn' + i, d, `${d.flag} · ${d.year}`)));
  listEl.append(g1, g2);
}

function ratio(s) { return `1:${Math.round(1 / s).toLocaleString('en-US')}`; }
function select(key, focus) {
  state.selected = key;
  store.set('piece', key);
  listEl.querySelectorAll('.piece').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
  const isPawn = key.startsWith('pawn');
  const def = isPawn ? state.set.pawns[+key.slice(4)] : state.set.pieces[key];
  const s = modelScale(key);
  const rows = isPawn
    ? [['Launched', def.year], ['Real size', def.size], ['Model scale', ratio(s)]]
    : [['Real height', `${def.height} m`], ['Max width', `${def.width} m`], ['Model', `${(def.height * s * 1000).toFixed(1)} mm · ${state.scale === 'true' ? ratio(s) : 'tournament'}`], ['Flew', def.year]];
  $('about').innerHTML = `
    <div class="about__head"><span class="about__name">${def.name}</span><span class="about__flag">${def.flag}</span></div>
    <dl class="specs">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p>${def.about}</p>
    ${def.notes ? `<p class="caution"><strong>Model notes.</strong> ${def.notes}</p>` : ''}`;
  if (focus) focusPiece(key);
}

function syncButtons() {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  document.querySelectorAll('[data-scale]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scale === state.scale)));
  document.querySelectorAll('[data-finish]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finish === state.finish)));
  $('scale-opt').classList.toggle('is-dim', state.view === 'lineup');
  $('spin').checked = state.spin;
}

document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => {
  state.scale = b.dataset.scale;
  store.set('scale', state.scale);
  setUpBoard();
  select(state.selected);
  syncButtons();
}));
document.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', () => {
  state.finish = b.dataset.finish;
  store.set('finish', state.finish);
  pieces.children.forEach(applyFinish);
  syncButtons();
}));
$('spin').addEventListener('change', e => { state.spin = e.target.checked; store.set('spin', state.spin ? '1' : '0'); });
$('reset').addEventListener('click', () => showView(state.view));
$('stl').addEventListener('click', () => {
  // the selected piece with its base, in millimetres, for printing
  const src = makePiece(state.selected, 'white');
  src.rotation.y = 0;
  src.scale.setScalar(1000);
  src.traverse(o => { if (o.isMesh && o.userData.decal) o.visible = false; });
  const strip = new THREE.Group();
  src.updateMatrixWorld(true);
  src.traverse(o => { if (o.isMesh && o.visible) { const m = new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld)); strip.add(m); } });
  const data = new STLExporter().parse(strip, { binary: true });
  const isPawn = state.selected.startsWith('pawn');
  const def = isPawn ? state.set.pawns[+state.selected.slice(4)] : state.set.pieces[state.selected];
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([data], { type: 'model/stl' })),
    download: `rocket-chess-${(def.role || 'pawn').toLowerCase()}-${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.stl`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
for (const id of ['library', 'options']) {
  $(id + '-toggle').addEventListener('click', () => {
    const open = !$(id).classList.contains('is-open');
    document.querySelectorAll('.library, .options').forEach(p => p.classList.remove('is-open'));
    $(id).classList.toggle('is-open', open);
  });
}

// click a piece to inspect it
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; fly = null; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(state.view === 'lineup' ? lineup : pieces, true)[0];
  let o = hit?.object;
  while (o && !o.userData.key) o = o.parent;
  if (o) select(o.userData.key, true);
});
canvas.addEventListener('wheel', () => { fly = null; }, { passive: true });

/* ---------- loop ---------- */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 46 : 32;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
renderer.setAnimationLoop(() => {
  if (fly) {
    const t = Math.min(1, (performance.now() - fly.t0) / fly.ms), k = ease(t);
    camera.position.lerpVectors(fly.p0, fly.p1, k);
    controls.target.lerpVectors(fly.t0v, fly.t1, k);
    if (t >= 1) fly = null;
  }
  controls.autoRotate = state.spin && !fly;
  controls.update();
  renderer.render(scene, camera);
  if (lineup.visible) labels.render(scene, camera);
});

renderList();
setUpBoard();
showView(state.view === 'lineup' ? 'lineup' : 'board', true);
select(state.selected, params.has('piece'));
window.__rc = { scene, camera, controls, pieces, templates, select, showView, focusPiece };
document.body.classList.add('is-ready');
