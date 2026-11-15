/* Domino Run: build a run in a 3D room, then knock it down and watch it back. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { PARAMS, DEFAULTS, SCHEMA, SECTIONS, loadParams, changedFromDefaults, dims, stdHeight, MAX_HEIGHT, INCH } from './params.js';
import { buildRoom, updateRoomLights } from './room.js';
import { STYLES, styleById, COLORS, makeView, restyleView, placeView, setOutline, styleSwatch, geometries, resetLook, ghostMaterial } from './dominoes.js';
import * as Lay from './layout.js';
import { Run } from './physics.js';
import { Sound } from './audio.js';
import { EFFECTS, effectById, EffectLayer } from './effects.js';
import { BUILT_INS, builtIn } from './elements.js';
import * as store from './store.js';

const RAPIER_URL = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.3/rapier.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const url = new URL(location.href);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl ';

const ENVS = [
  { id: 'living-room', name: 'Living room', note: 'Couch, coffee table, built-ins and a TV. Hardwood floor, windows on two sides.', ready: true },
  { id: 'kitchen', name: 'Kitchen', note: 'Tile floor, an island and long counters.', look: ['#d9d2c5', '#8b7d6b'] },
  { id: 'gym', name: 'School gym', note: 'A sprung maple floor with court lines and bleachers.', look: ['#d8a964', '#7b4b22'] },
  { id: 'library', name: 'Library', note: 'Reading tables and stacks of shelves to run between.', look: ['#7a5a3c', '#2e2219'] },
  { id: 'garage', name: 'Garage workshop', note: 'Sealed concrete, a workbench and a pegboard.', look: ['#9a9c9e', '#3d4043'] },
  { id: 'lobby', name: 'Office lobby', note: 'Polished stone, a reception desk and stairs.', look: ['#d6d8db', '#5d6670'] },
  { id: 'museum', name: 'Museum hall', note: 'A long gallery with plinths and a marble floor.', look: ['#e9e4da', '#9b8f7e'] },
];

/* ---------------- state ---------------- */
const prefs = (() => { try { return JSON.parse(localStorage.getItem('domino-run:prefs')) || {}; } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('domino-run:prefs', JSON.stringify({ style: S.style, color: S.color, h: S.h, spacing: S.spacing, speed: S.speed, follow: S.follow, muted: sound.muted })); } catch {} };

await loadParams();
const S = {
  screen: 'pick', phase: 'build', tool: 'select',
  style: styleById[prefs.style] ? prefs.style : 'toppling',
  color: prefs.color ?? '#d8402f',
  h: Math.min(MAX_HEIGHT, Math.max(stdHeight(), prefs.h ?? stdHeight())),
  spacing: prefs.spacing ?? PARAMS.spacing,
  sel: new Set(), hover: null,
  playing: false, t: 0, speed: prefs.speed ?? 1, follow: prefs.follow ?? true,
  ghostYaw: 0, lastPlaced: null, element: null,
  labOpen: url.searchParams.has('lab'), labSection: 'physics',
  saveId: null, saveName: '', tab: 'dominoes',
};
let L = Lay.newLayout();
try { const draft = JSON.parse(localStorage.getItem('domino-run:draft')); if (draft?.dominoes) L = draft; } catch {}

const sound = new Sound();
sound.muted = !!prefs.muted;
const views = new Map();
let room = null, run = null, R = null;
let clipboard = null, held = null, drag = null;
const undoStack = [], redoStack = [];

/* ---------------- renderer, scene, camera ---------------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = PARAMS.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
let shadowDirty = true;
const dirty = () => { shadowDirty = true; };

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb3c4');
const camera = new THREE.PerspectiveCamera(PARAMS.fov, 1, 0.004, 60);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI / 2 - 0.01;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
function applyCam() {
  camera.fov = PARAMS.fov; camera.updateProjectionMatrix();
  controls.dampingFactor = PARAMS.damping;
  controls.minDistance = PARAMS.minDistance; controls.maxDistance = PARAMS.maxDistance;
}
applyCam();
/* Camera keys. Holding ⌘ (Ctrl elsewhere) or ⌥ hands the left button to the camera:
   drag to orbit, add Shift to pan. Right-drag orbits and Shift + right-drag pans, as before;
   the middle button pans.
   OrbitControls swaps orbit and pan itself whenever ⌘, Ctrl or Shift is down, so the left
   button is mapped to the opposite of what's wanted and the swap lands on the right one. */
const keys = { cam: false, alt: false, shift: false };
function mouseButtons() {
  const freeLeft = S.phase === 'run' || S.screen !== 'room';
  let left = -1;
  if (keys.cam) left = keys.shift ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;   // swapped by OrbitControls
  else if (keys.alt || freeLeft) left = THREE.MOUSE.ROTATE;                  // Shift turns it into pan
  controls.mouseButtons = { LEFT: left, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  canvas.classList.toggle('is-camera', (keys.cam || keys.alt) && S.screen === 'room');
}
function readKeys(e) {
  const cam = e.metaKey || (!isMac && e.ctrlKey);
  if (cam === keys.cam && e.altKey === keys.alt && e.shiftKey === keys.shift) return;
  keys.cam = cam; keys.alt = e.altKey; keys.shift = e.shiftKey;
  mouseButtons();
}
mouseButtons();
// before OrbitControls sees the press, in case a key changed while the window was elsewhere
canvas.addEventListener('pointerdown', readKeys, { capture: true });

const dominoRoot = new THREE.Group(); dominoRoot.name = 'dominoes';
const markers = new THREE.Group(); markers.name = 'markers';
const ghosts = new THREE.Group(); ghosts.name = 'ghosts';
const handles = new THREE.Group(); handles.name = 'handles';
scene.add(dominoRoot, markers, ghosts, handles);
const effects = new EffectLayer(scene, sound);

const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envFrames = [];
let hdrReady = false;
new RGBELoader().load(new URL('./assets/suburban_garden_2k.hdr', import.meta.url).href, tex => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
  hdrReady = true;
  scheduleEnv();
});
function scheduleEnv() { envFrames = [2, 40, 160]; }
function captureEnv() {
  if (!room) return;
  const hide = [dominoRoot, markers, ghosts, handles, effects.root];
  const was = hide.map(o => o.visible);
  hide.forEach(o => { o.visible = false; });
  room.group.position.y = -1.2;
  room.group.updateMatrixWorld(true);
  const env = scene.environment;
  scene.environment = null;
  renderer.shadowMap.needsUpdate = true;
  const rt = pmrem.fromScene(scene, 0.03, 0.05, 40);
  room.group.position.y = 0;
  room.group.updateMatrixWorld(true);
  hide.forEach((o, i) => { o.visible = was[i]; });
  envRT?.dispose();
  envRT = rt;
  scene.environment = rt.texture ?? env;
  dirty();
}
function applyLights() {
  if (!room) return;
  updateRoomLights(room, PARAMS);
  scene.environmentIntensity = PARAMS.environment;
  scene.backgroundIntensity = PARAMS.outside;
  renderer.toneMappingExposure = PARAMS.exposure;
  dirty();
}

function rebuildRoom() {
  if (room) { scene.remove(room.group); room.dispose(); }
  room = buildRoom(renderer, PARAMS);
  scene.add(room.group);
  applyLights();
  scheduleEnv();
  dirty();
}

/* ---------------- surfaces and placement checks ---------------- */
const ray = new THREE.Raycaster();
const down = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const DOWN = new THREE.Vector3(0, -1, 0);
function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pickSurface(e) {
  setRay(e);
  for (const h of ray.intersectObjects(room.placeables, false)) {
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.y > 0.7) return { x: h.point.x, y: h.point.y, z: h.point.z };
  }
  return null;
}
function pickPlane(e, y) {
  setRay(e);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? { x: p.x, y, z: p.z } : null;
}
function pickDomino(e) {
  setRay(e);
  const meshes = [];
  for (const v of views.values()) if (v.mesh.visible) meshes.push(v.mesh);
  const h = ray.intersectObjects(meshes, false)[0];
  return h ? Lay.byId(L, h.object.userData.dominoId) : null;
}
function pickHandle(e) {
  if (!handles.visible) return null;
  setRay(e);
  const h = ray.intersectObjects(handles.children, false)[0];
  return h ? h.object.userData.end : null;
}
function surfaceAt(x, z, nearY = 0) {
  const { W, D } = room.bounds;
  if (Math.abs(x) > W / 2 - 0.005 || Math.abs(z) > D / 2 - 0.005) return null;
  down.set(new THREE.Vector3(x, nearY + 0.05, z), DOWN);
  const h = down.intersectObjects(room.placeables, false)[0];
  return h ? h.point.y : null;
}
function roomBlocked(s) {
  const { w } = dims(s.h);
  const r = w / 2;
  const { W, D } = room.bounds;
  if (Math.abs(s.x) > W / 2 - r * 0.6 || Math.abs(s.z) > D / 2 - r * 0.6) return true;
  for (const c of room.colliders) {
    if (c.mat === 'floor' || c.mat === 'wall') continue;
    const top = c.pos[1] + c.half[1], bot = c.pos[1] - c.half[1];
    if (s.y >= top - 0.004 || s.y + s.h <= bot) continue;
    if (Math.abs(s.x - c.pos[0]) < c.half[0] + r * 0.7 && Math.abs(s.z - c.pos[2]) < c.half[2] + r * 0.7) return true;
  }
  return false;
}
const invalid = (specs, ignore) => specs.some(roomBlocked) || Lay.anyCollide(L, specs, ignore);

/* ---------------- views of the layout ---------------- */
function syncViews() {
  const ids = new Set(L.dominoes.map(d => d.id));
  for (const [id, v] of views) if (!ids.has(id)) { dominoRoot.remove(v.mesh); views.delete(id); }
  for (const d of L.dominoes) {
    const key = `${d.style}|${d.color}|${d.pips}`;
    let v = views.get(d.id);
    if (!v) { v = makeView(d); v.key = key; views.set(d.id, v); dominoRoot.add(v.mesh); }
    else if (v.key !== key) { restyleView(v, d); v.key = key; }
    else placeView(v, d);
    v.mesh.visible = !(held && held.ids.has(d.id));
  }
  for (const id of [...S.sel]) if (!ids.has(id)) S.sel.delete(id);
  outlines();
  rebuildMarkers();
  updateHandles();
  refresh();
  dirty();
}

const bad = new Set();
function outlines() {
  const hoverGroup = S.hover ? Lay.groupOf(L, S.hover) : null;
  for (const d of L.dominoes) {
    const v = views.get(d.id);
    if (!v) continue;
    let k = null;
    if (S.phase === 'build') {
      if (bad.has(d.id)) k = 'bad';
      else if (S.sel.has(d.id)) k = d.locked ? 'lockedSelected' : 'selected';
      else if (d.locked) k = 'locked';
      else if (S.hover === d.id) k = 'hover';
      else if (hoverGroup && hoverGroup.members.includes(d.id) && S.tool === 'select') k = 'group';
    }
    setOutline(v, k);
  }
}

function implicitStart() {
  if (L.dominoes.some(d => d.start) || !L.dominoes.length) return null;
  return L.dominoes.reduce((a, b) => (b.seq < a.seq ? b : a));
}

const markerMats = {
  start: new THREE.MeshBasicMaterial({ color: '#6fd39a', transparent: true, opacity: 0.95, depthWrite: false }),
  auto: new THREE.MeshBasicMaterial({ color: '#6fd39a', transparent: true, opacity: 0.4, depthWrite: false }),
};
const arrowGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.9); s.lineTo(0.55, 0); s.lineTo(0.2, 0); s.lineTo(0.2, -0.8); s.lineTo(-0.2, -0.8); s.lineTo(-0.2, 0); s.lineTo(-0.55, 0); s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const dotGeo = new THREE.SphereGeometry(1, 14, 10);
const dotMats = new Map();
function rebuildMarkers() {
  for (const c of [...markers.children]) markers.remove(c);
  if (S.phase !== 'build') return;
  const auto = implicitStart();
  for (const d of L.dominoes) {
    if (d.start || d === auto) {
      // an arrow behind the first domino, pointing the way it will fall
      const m = new THREE.Mesh(arrowGeo, d.start ? markerMats.start : markerMats.auto);
      const [fx, fz] = Lay.fwd(d.yaw);
      const k = d.h * 0.42;
      m.scale.set(k, 1, -k);
      m.rotation.y = d.yaw;
      m.position.set(d.x - fx * d.h * 0.62, d.y + 0.0015, d.z - fz * d.h * 0.62);
      m.renderOrder = 2;
      markers.add(m);
    }
    if (d.effects?.length) {
      const fx = effectById[d.effects[0]];
      if (!fx) continue;
      if (!dotMats.has(fx.id)) dotMats.set(fx.id, new THREE.MeshBasicMaterial({ color: fx.color }));
      const dot = new THREE.Mesh(dotGeo, dotMats.get(fx.id));
      dot.scale.setScalar(Math.max(0.0025, d.h * 0.06));
      dot.position.set(d.x, d.y + d.h * 1.16, d.z);
      markers.add(dot);
    }
  }
}

/* group end handles for bending */
const handleMat = new THREE.MeshBasicMaterial({ color: '#f2a541' });
const handleGeo = new THREE.SphereGeometry(1, 18, 12);
for (const end of ['first', 'last']) {
  const m = new THREE.Mesh(handleGeo, handleMat);
  m.userData.end = end;
  m.renderOrder = 3;
  handles.add(m);
}
function selectedGroup() {
  if (S.sel.size < 2) return null;
  const g = Lay.groupOf(L, [...S.sel][0]);
  if (!g || g.members.length !== S.sel.size || !g.members.every(id => S.sel.has(id))) return null;
  return g;
}
function updateHandles() {
  const g = S.phase === 'build' && S.tool === 'select' && !held ? selectedGroup() : null;
  handles.visible = !!g && !g.members.some(id => Lay.byId(L, id).locked);
  if (!handles.visible) return;
  const ends = { first: Lay.byId(L, g.members[0]), last: Lay.byId(L, g.members[g.members.length - 1]) };
  for (const m of handles.children) {
    const d = ends[m.userData.end];
    const live = drag?.kind === 'bend' ? drag.live.get(d.id) : null;
    const p = live ?? d;
    m.position.set(p.x, (live ? live.y : d.y) + d.h * 1.22, p.z);
    m.scale.setScalar(Math.max(0.004, d.h * 0.12));
  }
}

/* ghost dominoes for placing, drawing, carrying and elements */
function showGhosts(specs, isBad) {
  const g = geometries();
  while (ghosts.children.length < specs.length) {
    const m = new THREE.Mesh(g.toppling, ghostMaterial(false));
    m.renderOrder = 1;
    ghosts.add(m);
  }
  ghosts.children.forEach((m, i) => {
    const s = specs[i];
    m.visible = !!s;
    if (!s) return;
    m.geometry = g[s.style] ?? g.toppling;
    m.material = ghostMaterial(isBad);
    m.scale.setScalar(s.h / stdHeight());
    m.position.set(s.x, s.y + s.h / 2, s.z);
    m.rotation.set(0, s.yaw, 0);
  });
}
const hideGhosts = () => ghosts.children.forEach(m => { m.visible = false; });

/* ---------------- editing with undo ---------------- */
function snapshot() { return Lay.clone(L); }
function pushUndo(before) {
  undoStack.push(before);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}
function changed() {
  stopRun();
  saveDraft();
  syncViews();
}
function edit(fn) {
  if (S.phase === 'run') stopRun();
  const before = snapshot();
  const res = fn();
  if (res === false) return false;
  pushUndo(before);
  changed();
  return res;
}
function undo() {
  if (!undoStack.length) return;
  cancelHeld();
  redoStack.push(snapshot());
  L = undoStack.pop();
  changed();
  toast('Undone');
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  L = redoStack.pop();
  changed();
  toast('Redone');
}
let draftTimer = 0;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { try { localStorage.setItem('domino-run:draft', JSON.stringify(L)); } catch {} }, 400);
}

const sel = () => [...S.sel].map(id => Lay.byId(L, id)).filter(Boolean);
const editable = () => sel().filter(d => !d.locked);
function select(ids, add = false) {
  if (!add) S.sel.clear();
  for (const id of ids) S.sel.add(id);
  outlines(); updateHandles(); refresh();
}
function withGroup(d, alone) {
  if (alone) return [d.id];
  const g = d.group ? Lay.groupById(L, d.group) : null;
  return g ? [...g.members] : [d.id];
}

/* a domino whose front is clear and which the cursor is in front of: new ones join on */
function snapTarget(p, preferId) {
  const free = d => {
    const [fx, fz] = Lay.fwd(d.yaw);
    const reach = Math.max(PARAMS.spacing, S.spacing) * d.h * 1.5;
    return !L.dominoes.some(o => {
      if (o === d) return false;
      const dx = o.x - d.x, dz = o.z - d.z, dist = Math.hypot(dx, dz);
      return dist < reach && (dx * fx + dz * fz) / (dist || 1) > 0.6 && Math.abs(o.y - d.y) < d.h * 0.5;
    });
  };
  const test = d => {
    if (!d || Math.abs(d.y - p.y) > d.h * 0.5) return false;
    const [fx, fz] = Lay.fwd(d.yaw);
    const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
    return dist < Math.max(2.6 * d.h, 0.07) && dx * fx + dz * fz > 0 && free(d);
  };
  const pref = preferId != null ? Lay.byId(L, preferId) : null;
  if (test(pref)) return pref;
  let best = null, bd = Infinity;
  for (const d of L.dominoes) {
    if (!test(d)) continue;
    const dist = Math.hypot(p.x - d.x, p.z - d.z);
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}
const spacingFor = (prev, h) => S.spacing * Math.max(prev.h, h) / prev.h;
const newSpec = (x, y, z, yaw) => ({ x, y, z, yaw, h: S.h, style: S.style, color: S.color, effects: [] });

/* camera-facing default: dominoes fall away from you */
function cameraYaw() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return Math.atan2(d.x, d.z);
}

/* ---------------- tools ---------------- */
function setTool(t) {
  if (S.phase === 'run') stopRun();
  cancelHeld();
  if (drag?.kind === 'draw') drag = null;
  if (t !== 'element') S.element = null;
  S.tool = t;
  if (t === 'place' || t === 'draw' || t === 'element') S.ghostYaw = Math.round(cameraYaw() / (Math.PI / 12)) * (Math.PI / 12);
  hideGhosts();
  canvas.className = t === 'select' ? '' : 'is-place';
  updateHandles(); outlines(); refresh();
}

let ghostSpecs = null, ghostBad = false, ghostAnchor = null;
function previewPlace(e) {
  const hit = pickSurface(e);
  if (!hit) { hideGhosts(); ghostSpecs = null; return; }
  const anchor = e.shiftKey ? null : snapTarget(hit, S.lastPlaced);
  let spec;
  if (anchor) {
    const n = Lay.nextAfter(anchor, hit.x, hit.z, spacingFor(anchor, S.h));
    const y = surfaceAt(n.x, n.z, anchor.y);
    spec = newSpec(n.x, y ?? anchor.y, n.z, n.yaw);
    if (y == null) spec.bad = true;
  } else spec = newSpec(hit.x, hit.y, hit.z, S.ghostYaw);
  ghostSpecs = [spec];
  ghostAnchor = anchor;
  ghostBad = !!spec.bad || invalid([spec]);
  showGhosts(ghostSpecs, ghostBad);
}
function placeOne() {
  if (!ghostSpecs) return;
  if (ghostBad) { toast('There’s no room there.'); return; }
  const spec = ghostSpecs[0], anchor = ghostAnchor;
  edit(() => {
    const d = Lay.addDomino(L, spec);
    // carrying on from the end of a group joins the group
    const g = anchor?.group ? Lay.groupById(L, anchor.group) : null;
    if (g && g.members[g.members.length - 1] === anchor.id) { g.members.push(d.id); d.group = g.id; }
    S.lastPlaced = d.id;
    S.ghostYaw = d.yaw;
  });
  if (L.dominoes.length === 1) toast('Placed. It has a green arrow: the first one placed gets the push.');
}

function previewElement(e) {
  const hit = pickSurface(e);
  if (!hit || !S.element) { hideGhosts(); ghostSpecs = null; return; }
  const anchor = e.shiftKey ? null : snapTarget(hit);
  let base;
  if (anchor) {
    const first = S.element.dominoes[0];
    const n = Lay.nextAfter(anchor, hit.x, hit.z, spacingFor(anchor, first.h));
    base = { x: n.x, y: anchor.y, z: n.z, yaw: n.yaw };
  } else base = { ...hit, yaw: S.ghostYaw };
  const specs = Lay.elementSpecs(S.element, base.x, base.y, base.z, base.yaw);
  const ok = Lay.settle(specs, (x, z) => surfaceAt(x, z, base.y));
  ghostSpecs = specs;
  ghostBad = !ok || invalid(specs);
  showGhosts(specs, ghostBad);
}
function placeElement() {
  if (!ghostSpecs) return;
  if (ghostBad) { toast('It doesn’t fit there. Turn it with Q and E, or move it.'); return; }
  const name = S.element.name;
  let ids = [];
  edit(() => {
    ids = ghostSpecs.map(s => Lay.addDomino(L, s).id);
    if (ids.length > 1) Lay.makeGroup(L, ids, uniqueName(name));
  });
  setTool('select');
  select(ids);
  toast(`Placed ${name}. Drag its ends to bend it.`);
}
function uniqueName(base) {
  const names = new Set(L.groups.map(g => g.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/* draw: drag to lay a line */
function startDraw(e) {
  const hit = pickSurface(e);
  if (!hit) return;
  const anchor = e.shiftKey ? null : snapTarget(hit, S.lastPlaced);
  drag = { kind: 'draw', x0: e.clientX, y0: e.clientY, start: hit, prev: anchor ? { ...anchor } : null, anchor, specs: [], blocked: false };
}
function moveDraw(e) {
  const c = pickSurface(e) ?? pickPlane(e, drag.prev?.y ?? drag.start.y);
  if (!c) return;
  const st = drag;
  const sp = S.spacing * S.h;
  if (!st.prev) {
    if (Math.hypot(c.x - st.start.x, c.z - st.start.z) < sp * 0.8) return;
    const first = newSpec(st.start.x, st.start.y, st.start.z, Lay.yawOf(c.x - st.start.x, c.z - st.start.z));
    if (invalid([first])) { st.blocked = true; return; }
    st.specs.push(first);
    st.prev = first;
  }
  let guard = 0;
  while (Math.hypot(c.x - st.prev.x, c.z - st.prev.z) >= spacingFor(st.prev, S.h) * st.prev.h && guard++ < 200) {
    const n = Lay.nextAfter(st.prev, c.x, c.z, spacingFor(st.prev, S.h), Math.PI / 7);
    const y = surfaceAt(n.x, n.z, st.prev.y);
    const spec = newSpec(n.x, y ?? 0, n.z, n.yaw);
    const ignore = new Set(st.anchor ? [st.anchor.id] : []);
    if (y == null || roomBlocked(spec) || Lay.collides(L, spec, ignore) || st.specs.slice(0, -1).some(o => Lay.overlaps(o, spec))) { st.blocked = true; break; }
    st.blocked = false;
    st.specs.push(spec);
    st.prev = spec;
  }
  showGhosts(st.specs, false);
}
function endDraw(e) {
  const st = drag;
  drag = null;
  hideGhosts();
  if (!st.specs.length) {
    if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 5) {
      // a click without a drag places one
      previewPlace(e);
      placeOne();
    }
    return;
  }
  let made = [];
  edit(() => {
    made = st.specs.map(s => Lay.addDomino(L, s));
    const g = st.anchor?.group ? Lay.groupById(L, st.anchor.group) : null;
    if (g && g.members[g.members.length - 1] === st.anchor.id) {
      for (const d of made) { g.members.push(d.id); d.group = g.id; }
    } else if (made.length > 1) {
      Lay.makeGroup(L, made.map(d => d.id), uniqueName('Line'));
    }
    S.lastPlaced = made[made.length - 1].id;
  });
  toast(`${made.length} placed${made.length > 1 ? ', grouped as a line' : ''}.${st.blocked ? ' Stopped where something was in the way.' : ''}`);
}

/* carry: pick up, move, set down */
function pickUp() {
  const ds = editable();
  if (!ds.length) { toast(sel().length ? 'Those are locked. Unlock them first (L).' : 'Select something to pick up.'); return; }
  const anchor = ds[0];
  held = {
    ids: new Set(ds.map(d => d.id)), anchor: anchor.id, rot: 0, before: snapshot(),
    base: ds.map(d => ({ id: d.id, dx: d.x - anchor.x, dy: d.y - anchor.y, dz: d.z - anchor.z, yaw: d.yaw, d })),
    specs: null, bad: false,
  };
  syncViews();
  toast('Holding. Click to set down, Q and E to turn, Esc to put back.');
}
function previewHeld(e) {
  const hit = pickSurface(e);
  if (!hit) { hideGhosts(); held.specs = null; return; }
  const specs = held.base.map(b => {
    const [rx, rz] = Lay.rot(b.dx, b.dz, held.rot);
    return { ...b.d, x: hit.x + rx, z: hit.z + rz, y: hit.y + b.dy, yaw: b.yaw + held.rot };
  });
  const ok = Lay.settle(specs, (x, z) => surfaceAt(x, z, hit.y));
  held.specs = specs;
  held.bad = !ok || invalid(specs, held.ids);
  showGhosts(specs, held.bad);
}
function setDown() {
  if (!held?.specs) return;
  if (held.bad) { toast('There’s no room there.'); return; }
  const { specs, before } = held;
  held = null;
  hideGhosts();
  for (const s of specs) Object.assign(Lay.byId(L, s.id), { x: s.x, y: s.y, z: s.z, yaw: s.yaw });
  pushUndo(before);
  changed();
}
function cancelHeld() {
  if (!held) return;
  held = null;
  hideGhosts();
  syncViews();
}

/* ---------------- selection actions ---------------- */
function rotateSel(a) {
  if (held) { held.rot += a; if (lastPointer) previewHeld(lastPointer); return; }
  if (S.tool !== 'select') { S.ghostYaw += a; if (lastPointer) movePreview(lastPointer); return; }
  const ds = editable();
  if (!ds.length) return;
  const cx = ds.reduce((s, d) => s + d.x, 0) / ds.length, cz = ds.reduce((s, d) => s + d.z, 0) / ds.length;
  const before = snapshot();
  for (const d of ds) {
    const [rx, rz] = Lay.rot(d.x - cx, d.z - cz, a);
    d.x = cx + rx; d.z = cz + rz; d.yaw += a;
    const y = surfaceAt(d.x, d.z, d.y);
    if (y != null) d.y = y;
  }
  if (invalid(ds, new Set(ds.map(d => d.id)))) { L = before; syncViews(); toast('No room to turn them there.'); return; }
  pushUndo(before);
  changed();
}
function nudge(dx, dz) {
  const ds = editable();
  if (!ds.length) return;
  const before = snapshot();
  for (const d of ds) { d.x += dx; d.z += dz; const y = surfaceAt(d.x, d.z, d.y); if (y != null) d.y = y; }
  if (invalid(ds, new Set(ds.map(d => d.id)))) { L = before; syncViews(); return; }
  pushUndo(before);
  changed();
}
function toggleLock() {
  const ds = sel();
  if (!ds.length) return;
  const lock = ds.some(d => !d.locked);
  edit(() => { for (const d of ds) d.locked = lock; });
  toast(lock ? `Locked ${ds.length}. They can’t be moved or deleted until unlocked.` : `Unlocked ${ds.length}.`);
}
function groupSel() {
  if (S.sel.size < 2) { toast('Select two or more to group.'); return; }
  let g;
  edit(() => { g = Lay.makeGroup(L, [...S.sel], uniqueName('Group')); });
  toast(`Grouped as ${g.name}. Copy and paste it, or drag an end to bend it.`);
}
function ungroupSel() {
  const gs = new Set(sel().map(d => d.group).filter(Boolean));
  if (!gs.size) return;
  edit(() => { for (const g of gs) Lay.ungroup(L, g); });
  toast('Ungrouped.');
}
function deleteSel() {
  const ds = sel();
  if (!ds.length) return;
  const gone = ds.filter(d => !d.locked);
  if (!gone.length) { toast('Locked dominoes can’t be deleted. Unlock them first (L).'); return; }
  const g = selectedGroup();
  edit(() => { Lay.removeDominoes(L, gone.map(d => d.id)); });
  const kept = ds.length - gone.length;
  toast(`${g ? `Deleted ${g.name}` : `Deleted ${gone.length}`}.${kept ? ` ${kept} locked ones stayed.` : ''}`);
}
function copySel() {
  const ds = sel();
  if (!ds.length) return false;
  const ms = Lay.members(L, ds.map(d => d.id));
  const g = selectedGroup();
  clipboard = { ids: ms.map(d => d.id), snap: Lay.clone({ ms }).ms, name: g?.name ?? null };
  toast(`Copied ${ms.length}. Paste carries on from the end.`);
  refresh();
  return true;
}
function paste() {
  if (!clipboard) { toast('Copy something first.'); return; }
  const live = clipboard.ids.map(id => Lay.byId(L, id));
  const parent = live.every(Boolean) ? live : clipboard.snap;
  const plan = Lay.pastePlan(L, parent, (x, z, y) => surfaceAt(x, z, y), roomBlocked);
  if (!plan) { toast('No room to paste it at the end or alongside.'); return; }
  let ids = [];
  edit(() => {
    ids = plan.specs.map(s => Lay.addDomino(L, s).id);
    if (ids.length > 1) Lay.makeGroup(L, ids, uniqueName(clipboard.name ? `${clipboard.name} copy` : 'Group'));
  });
  clipboard = { ...clipboard, ids, snap: Lay.clone({ ms: ids.map(id => Lay.byId(L, id)) }).ms };
  select(ids);
  toast(plan.mode === 'extend' ? 'Pasted, carrying on from the leading end.'
    : plan.why === 'followed' ? 'Pasted alongside. More dominoes already stand past the leading end.'
    : 'Pasted alongside. Carrying on from the end would run into something.');
}
function toggleStart() {
  const ds = sel();
  if (!ds.length) return;
  const on = ds.some(d => !d.start);
  edit(() => { for (const d of ds) d.start = on; });
  toast(on ? `${ds.length > 1 ? 'They’ll' : 'It’ll'} get the push when the run starts.` : 'No longer a starter.');
}
function selectAll() { select(L.dominoes.map(d => d.id)); }

function applyLook(patch, label) {
  const ds = editable();
  if (!ds.length) return;
  const before = snapshot();
  for (const d of ds) Object.assign(d, patch);
  if (patch.h && invalid(ds, new Set(ds.map(d => d.id)))) { L = before; syncViews(); toast('No room to make them that size.'); return; }
  pushUndo(before);
  changed();
  toast(`${label} for ${ds.length}.`);
}
function toggleEffect(id) {
  const ds = editable();
  if (!ds.length) { toast('Select the dominoes to add it to.'); return; }
  const all = ds.every(d => d.effects.includes(id));
  edit(() => { for (const d of ds) d.effects = all ? d.effects.filter(x => x !== id) : [...new Set([...d.effects, id])]; });
  toast(all ? `${effectById[id].name} taken off ${ds.length}.` : `${effectById[id].name} on ${ds.length}. Press play to see it.`);
}

/* ---------------- pointer ---------------- */
let lastPointer = null, lastClick = { id: null, t: 0 };
function movePreview(e) {
  if (S.phase !== 'build' || S.screen !== 'room') return;
  if (held) previewHeld(e);
  else if (S.tool === 'place') previewPlace(e);
  else if (S.tool === 'element') previewElement(e);
}
canvas.addEventListener('pointerdown', e => {
  if (S.screen !== 'room') return;
  sound.ensure();
  if (e.button !== 0 || e.altKey || keys.cam || S.phase === 'run') return;
  camAnim = null;
  if (held) { setDown(); return; }
  if (S.tool === 'place') { previewPlace(e); placeOne(); return; }
  if (S.tool === 'element') { previewElement(e); placeElement(); return; }
  if (S.tool === 'draw') { startDraw(e); return; }
  const end = pickHandle(e);
  if (end) { startBend(end, e); return; }
  const d = pickDomino(e);
  if (d) {
    const now = performance.now();
    if (lastClick.id === d.id && now - lastClick.t < 320) { lastClick.id = null; select(withGroup(d, true)); pickUp(); return; }
    lastClick = { id: d.id, t: now };
    if (e.shiftKey) {
      const ids = withGroup(d, false);
      const has = ids.every(id => S.sel.has(id));
      for (const id of ids) has ? S.sel.delete(id) : S.sel.add(id);
      select([], true);
      return;
    }
    // clicking one that's already part of a bigger selection narrows to it, unless it's dragged
    const narrow = S.sel.has(d.id) && S.sel.size > 1;
    if (!S.sel.has(d.id)) select(withGroup(d, false));
    drag = { kind: 'maybe', x0: e.clientX, y0: e.clientY, anchor: d, narrow };
    return;
  }
  drag = { kind: 'box', x0: e.clientX, y0: e.clientY, add: e.shiftKey };
});

window.addEventListener('pointermove', e => {
  if (S.screen !== 'room') return;
  lastPointer = e;
  if (!drag) { hoverWanted = true; movePreview(e); return; }
  if (drag.kind === 'maybe' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) beginMove(e);
  if (drag.kind === 'move') moveSel(e);
  else if (drag.kind === 'box') {
    const m = $('#marquee');
    m.hidden = false;
    Object.assign(m.style, { left: `${Math.min(e.clientX, drag.x0)}px`, top: `${Math.min(e.clientY, drag.y0)}px`, width: `${Math.abs(e.clientX - drag.x0)}px`, height: `${Math.abs(e.clientY - drag.y0)}px` });
  } else if (drag.kind === 'bend') moveBend(e);
  else if (drag.kind === 'draw') moveDraw(e);
});

window.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag;
  if (d.kind === 'draw') { endDraw(e); return; }
  drag = null;
  canvas.classList.remove('is-grab');
  if (d.kind === 'move' || d.kind === 'bend') finishLive(d);
  else if (d.kind === 'maybe' && d.narrow) select([d.anchor.id]);
  else if (d.kind === 'box') {
    $('#marquee').hidden = true;
    const w = Math.abs(e.clientX - d.x0), h = Math.abs(e.clientY - d.y0);
    if (w < 4 && h < 4) { if (!d.add) select([]); return; }
    const r = canvas.getBoundingClientRect();
    const x0 = Math.min(e.clientX, d.x0), x1 = Math.max(e.clientX, d.x0), y0 = Math.min(e.clientY, d.y0), y1 = Math.max(e.clientY, d.y0);
    const v = new THREE.Vector3();
    const hits = L.dominoes.filter(o => {
      v.set(o.x, o.y + o.h / 2, o.z).project(camera);
      if (v.z > 1) return false;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
    }).map(o => o.id);
    select(hits, d.add);
    if (hits.length) toast(`${hits.length} selected. G groups them.`);
  }
});

function beginMove(e) {
  const ds = sel();
  if (ds.some(d => d.locked)) { drag = null; toast('Locked. Press L to unlock before moving.'); return; }
  const a = drag.anchor;
  const hit = pickSurface(e) ?? pickPlane(e, a.y);
  drag = {
    kind: 'move', before: snapshot(), anchor: a,
    orig: new Map(ds.map(d => [d.id, { x: d.x, y: d.y, z: d.z }])),
    off: hit ? { x: a.x - hit.x, z: a.z - hit.z } : { x: 0, z: 0 },
    live: new Map(),
  };
  canvas.classList.add('is-grab');
}
function moveSel(e) {
  const a = drag.anchor, o = drag.orig.get(a.id);
  const hit = pickSurface(e) ?? pickPlane(e, o.y);
  if (!hit) return;
  const dx = hit.x + drag.off.x - o.x, dz = hit.z + drag.off.z - o.z;
  const specs = [];
  for (const [id, p] of drag.orig) {
    const d = Lay.byId(L, id);
    const x = p.x + dx, z = p.z + dz;
    const y = surfaceAt(x, z, hit.y) ?? p.y;
    drag.live.set(id, { x, y, z, yaw: d.yaw });
    specs.push({ ...d, x, y, z });
  }
  liveApply(specs);
}
function liveApply(specs) {
  const ignore = new Set(specs.map(s => s.id));
  bad.clear();
  for (const s of specs) {
    if (roomBlocked(s) || Lay.collides(L, s, ignore)) bad.add(s.id);
    const v = views.get(s.id);
    if (v) placeView(v, s);
  }
  for (let i = 0; i < specs.length; i++) for (let j = 0; j < i; j++) if (Lay.overlaps(specs[i], specs[j])) { bad.add(specs[i].id); }
  outlines();
  updateHandles();
  dirty();
}
function finishLive(d) {
  const wasBad = bad.size > 0;
  bad.clear();
  $('#tag').hidden = true;
  if (!d.live.size) { syncViews(); return; }
  if (wasBad) {
    L = d.before;
    syncViews();
    toast(d.kind === 'bend' ? 'That bend runs into something. Put back.' : 'That spot overlaps something. Put back.');
    return;
  }
  for (const [id, p] of d.live) Object.assign(Lay.byId(L, id), p);
  pushUndo(d.before);
  changed();
}

/* bend: drag one end of a group, the other end stays put */
function startBend(end, e) {
  const g = selectedGroup();
  if (!g) return;
  const ms = g.members.map(id => Lay.byId(L, id));
  drag = { kind: 'bend', end, before: snapshot(), snap: ms.map(d => ({ ...d })), live: new Map() };
  canvas.classList.add('is-grab');
}
function moveBend(e) {
  const tip = drag.end === 'last' ? drag.snap[drag.snap.length - 1] : drag.snap[0];
  const hit = pickSurface(e) ?? pickPlane(e, tip.y);
  if (!hit) return;
  const { positions, spacing } = Lay.bendPlan(drag.snap, drag.end, hit.x, hit.z);
  const specs = drag.snap.map((d, i) => {
    const p = positions[i];
    const y = surfaceAt(p.x, p.z, d.y) ?? d.y;
    drag.live.set(d.id, { x: p.x, y, z: p.z, yaw: p.yaw });
    return { ...d, x: p.x, y, z: p.z, yaw: p.yaw };
  });
  liveApply(specs);
  const h = Math.max(...drag.snap.map(d => d.h));
  const ratio = spacing / h;
  const tag = $('#tag');
  tag.hidden = false;
  tag.style.left = `${e.clientX}px`; tag.style.top = `${e.clientY}px`;
  const warn = ratio > 0.9 ? ' · too far apart to topple' : ratio < PARAMS.thicknessRatio * 1.6 ? ' · very tight' : '';
  tag.textContent = `Spacing ${ratio.toFixed(2)} × height${warn}`;
  tag.classList.toggle('is-warn', !!warn);
}

/* hover outline, worked out once a frame */
let hoverWanted = false;
function updateHover() {
  if (!hoverWanted || !lastPointer || S.phase !== 'build' || drag || held || S.tool !== 'select') {
    if (S.hover && (S.tool !== 'select' || S.phase !== 'build')) { S.hover = null; outlines(); }
    return;
  }
  hoverWanted = false;
  const onHandle = pickHandle(lastPointer);
  const d = onHandle ? null : pickDomino(lastPointer);
  const id = d?.id ?? null;
  canvas.classList.toggle('is-hover', !!d || !!onHandle);
  if (id !== S.hover) { S.hover = id; outlines(); }
}

/* ---------------- the run ---------------- */
async function ensureRapier() {
  if (R) return R;
  setStatus('Loading the physics…');
  const mod = await import(RAPIER_URL);
  R = mod.default;
  await R.init();
  return R;
}
let starting = false;
async function startRun(playNow = true) {
  if (!L.dominoes.length) { toast('Place some dominoes first.'); return false; }
  if (starting) return false;
  starting = true;
  try {
    await ensureRapier();
  } catch (err) {
    starting = false;
    toast('The physics engine didn’t load. Check the connection and try again.');
    return false;
  }
  starting = false;
  cancelHeld();
  drag = null;
  hideGhosts();
  run?.dispose();
  run = new Run(R, L, room, PARAMS, styleById);
  effects.setRun(run, L, id => views.get(id));
  S.phase = 'run';
  S.t = 0;
  S.playing = playNow;
  S.hover = null;
  outlines(); rebuildMarkers(); updateHandles(); mouseButtons();
  marksAt = 0;
  refresh();
  return true;
}
function stopRun() {
  if (!run && S.phase === 'build') return;
  effects.clear();
  run?.dispose();
  run = null;
  S.phase = 'build';
  S.playing = false;
  S.t = 0;
  mouseButtons();
  for (const d of L.dominoes) { const v = views.get(d.id); if (v) placeView(v, d); }
  rebuildMarkers(); outlines(); updateHandles(); refresh();
  dirty();
}
async function playPause() {
  sound.ensure();
  if (!run) { await startRun(true); return; }
  if (!S.playing && run.done && S.t >= endTime() - 1e-3) S.t = 0;
  S.playing = !S.playing;
  refresh();
}
function seek(t) {
  if (!run) return;
  if (t > run.frontier && !run.done) run.advance(t, 600);
  S.t = THREE.MathUtils.clamp(t, 0, endTime());
  effects.update(S.t, S.t, false);
  refresh();
}
/* how far the playhead may go: the simulated frontier, and once the run is over, until the
   last effect has finished too */
const endTime = () => (!run ? 0 : run.done ? Math.max(run.duration, effects.endTime()) : run.frontier);
const tmp = new Float64Array(7);
function applyPoses(t) {
  for (let i = 0; i < run.n; i++) {
    const v = views.get(run.ids[i]);
    if (!v) continue;
    run.pose(i, t, tmp);
    v.mesh.position.set(tmp[0], tmp[1], tmp[2]);
    v.mesh.quaternion.set(tmp[3], tmp[4], tmp[5], tmp[6]);
  }
  dirty();
}
const proj = new THREE.Vector3();
function panOf(p) {
  proj.set(p.x, p.y, p.z).project(camera);
  return THREE.MathUtils.clamp(proj.x * 0.8, -1, 1);
}
function playSounds(a, b) {
  if (!run || b <= a || b - a > 0.3 || sound.muted) return;
  const ev = run.events;
  let lo = 0, hi = ev.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t <= a) lo = m + 1; else hi = m; }
  const due = [];
  for (let k = lo; k < ev.length && ev[k].t <= b; k++) due.push(ev[k]);
  if (!due.length) return;
  const budget = S.speed > 1 ? Math.max(3, Math.ceil(PARAMS.voices / 5)) : 14;
  if (due.length > budget) due.sort((x, y) => y.speed - x.speed).length = budget;
  for (const e of due) {
    const dist = camera.position.distanceTo(proj.set(e.x, e.y, e.z));
    sound.impact(e, panOf(e), 1 / (1 + dist * 0.6));
  }
}
const front = new THREE.Vector3();
function follow(dt) {
  if (!S.follow || !S.playing || camAnim) return;
  let n = 0;
  front.set(0, 0, 0);
  for (let i = 0; i < run.n; i++) {
    const h = run.hit[i];
    if (h <= S.t && S.t - h < PARAMS.followWindow) {
      run.pose(i, S.t, tmp);
      front.x += tmp[0]; front.y += tmp[1]; front.z += tmp[2];
      n++;
    }
  }
  if (!n) return;
  front.divideScalar(n);
  const k = 1 - Math.exp(-dt / PARAMS.followLag);
  const dx = (front.x - controls.target.x) * k, dy = (front.y - controls.target.y) * k, dz = (front.z - controls.target.z) * k;
  controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
  camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
}

/* ---------------- camera views ---------------- */
let camAnim = null;
function focus() {
  const ds = S.sel.size ? sel() : L.dominoes;
  if (!ds.length) return { c: room.openFloor.clone(), r: 0.6 };
  const c = new THREE.Vector3();
  for (const d of ds) c.add(new THREE.Vector3(d.x, d.y + d.h / 2, d.z));
  c.divideScalar(ds.length);
  let r = 0;
  for (const d of ds) r = Math.max(r, Math.hypot(d.x - c.x, d.z - c.z) + d.h);
  return { c, r: Math.max(r, 0.12) };
}
const VIEWS = [
  { id: 'fit', name: 'Fit' }, { id: 'room', name: 'Room' }, { id: 'above', name: 'Above' },
  { id: 'floor', name: 'Floor level' }, { id: 'couch', name: 'Couch' }, { id: 'window', name: 'Window' },
];
function viewPose(id) {
  const { W, D, H } = room.bounds;
  const { c, r } = focus();
  const fitDist = r / Math.sin(THREE.MathUtils.degToRad(PARAMS.fov) / 2) * 0.95 + 0.08;
  const cur = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  switch (id) {
    case 'fit': {
      const dir = cur.clone();
      if (dir.y < 0.45) { dir.y = 0.45; dir.normalize(); }
      return { pos: c.clone().addScaledVector(dir, fitDist), target: c };
    }
    case 'room': return { pos: new THREE.Vector3(W / 2 - 0.4, Math.min(H - 0.35, 2.0), D / 2 - 0.4), target: L.dominoes.length ? c : room.openFloor.clone() };
    case 'above': return { pos: new THREE.Vector3(c.x, Math.min(H - 0.15, c.y + Math.max(0.3, fitDist * 1.05)), c.z + 0.001), target: c };
    case 'floor': {
      const dir = new THREE.Vector3(cur.x, 0, cur.z).normalize();
      if (!isFinite(dir.x)) dir.set(0, 0, 1);
      return { pos: c.clone().addScaledVector(dir, Math.max(0.2, fitDist * 0.9)).setY(c.y * 0.35 + 0.012), target: new THREE.Vector3(c.x, c.y * 0.7, c.z) };
    }
    case 'couch': {
      const cz = D / 2 - PARAMS.couchZ - 0.475;
      return { pos: new THREE.Vector3(PARAMS.couchX, 1.12, cz - 0.05), target: L.dominoes.length ? c : room.openFloor.clone() };
    }
    case 'window': return { pos: new THREE.Vector3(-W / 2 + 0.35, 1.35, THREE.MathUtils.clamp(c.z, -D / 2 + 0.5, D / 2 - 0.5)), target: c };
  }
  return null;
}
function setView(id, instant = false) {
  const p = viewPose(id);
  if (!p) return;
  if (instant) { camera.position.copy(p.pos); controls.target.copy(p.target); controls.update(); return; }
  camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.pos, t1: p.target, k: 0 };
}
function stepCam(dt) {
  if (!camAnim) return;
  camAnim.k = Math.min(1, camAnim.k + dt / 0.7);
  const e = camAnim.k < 0.5 ? 4 * camAnim.k ** 3 : 1 - (-2 * camAnim.k + 2) ** 3 / 2;
  camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
  controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
  if (camAnim.k >= 1) camAnim = null;
}
function clampCam() {
  if (!room) return;
  const { W, D, H } = room.bounds, m = PARAMS.wallMargin;
  const p = camera.position;
  p.x = THREE.MathUtils.clamp(p.x, -W / 2 + m, W / 2 - m);
  p.y = THREE.MathUtils.clamp(p.y, 0.012, H - m);
  p.z = THREE.MathUtils.clamp(p.z, -D / 2 + m, D / 2 - m);
  // and out of the furniture: push the camera out through the nearest face
  for (const c of room.colliders) {
    if (c.mat === 'floor' || c.mat === 'wall') continue;
    const g = 0.03;
    const dx = c.half[0] + g - Math.abs(p.x - c.pos[0]);
    const dy = c.half[1] + g - Math.abs(p.y - c.pos[1]);
    const dz = c.half[2] + g - Math.abs(p.z - c.pos[2]);
    if (dx <= 0 || dy <= 0 || dz <= 0) continue;
    if (dy <= dx && dy <= dz) p.y = c.pos[1] + Math.sign(p.y - c.pos[1] || 1) * (c.half[1] + g);
    else if (dx <= dz) p.x = c.pos[0] + Math.sign(p.x - c.pos[0] || 1) * (c.half[0] + g);
    else p.z = c.pos[2] + Math.sign(p.z - c.pos[2] || 1) * (c.half[2] + g);
  }
  const t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, -W / 2, W / 2);
  t.y = THREE.MathUtils.clamp(t.y, 0, H);
  t.z = THREE.MathUtils.clamp(t.z, -D / 2, D / 2);
}
const zoomEl = $('#zoom');
const distToZoom = d => Math.log(d / PARAMS.maxDistance) / Math.log(PARAMS.minDistance / PARAMS.maxDistance);
const zoomToDist = v => PARAMS.maxDistance * Math.pow(PARAMS.minDistance / PARAMS.maxDistance, v);
zoomEl.addEventListener('input', () => {
  camAnim = null;
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, zoomToDist(+zoomEl.value));
});
controls.addEventListener('change', () => {
  if (document.activeElement !== zoomEl) zoomEl.value = distToZoom(camera.position.distanceTo(controls.target));
});

/* ---------------- saving ---------------- */
function thumbnail() {
  const hide = [markers, ghosts, handles];
  const was = hide.map(o => o.visible);
  hide.forEach(o => { o.visible = false; });
  for (const v of views.values()) { v.outline.visible = false; v.pad.visible = false; }
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const c = document.createElement('canvas');
  c.width = 480; c.height = 300;
  const g = c.getContext('2d');
  const ar = 480 / 300;
  let sw = src.width, sh = src.width / ar;
  if (sh > src.height) { sh = src.height; sw = sh * ar; }
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 480, 300);
  hide.forEach((o, i) => { o.visible = was[i]; });
  outlines();
  return c.toDataURL('image/jpeg', 0.82);
}
function stateData() {
  return {
    ...Lay.clone(L),
    camera: { pos: camera.position.toArray(), target: controls.target.toArray() },
    settings: { style: S.style, color: S.color, h: S.h, spacing: S.spacing },
  };
}
async function doSave(name, asNew) {
  try {
    const res = await store.save('states', name, stateData(), thumbnail(), asNew ? null : S.saveId);
    S.saveId = res.id; S.saveName = name;
    const mode = await store.storeMode();
    toast(mode === 'project' ? `Saved to saves/states/${res.id}.json` : 'Saved in this browser.');
  } catch (err) { toast(`Couldn’t save: ${err.message}`); }
}
async function openState(id, name) {
  try {
    const data = await store.load('states', id);
    const before = snapshot();
    const { camera: cam, settings, ...layout } = data;
    L = { ...Lay.newLayout(), ...layout };
    if (settings) Object.assign(S, { style: settings.style ?? S.style, color: settings.color ?? S.color, h: settings.h ?? S.h, spacing: settings.spacing ?? S.spacing });
    S.saveId = id; S.saveName = name;
    S.sel.clear();
    pushUndo(before);
    changed();
    if (cam) { camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...cam.pos), t1: new THREE.Vector3(...cam.target), k: 0 }; }
    closeModal();
    toast(`Opened ${name}. ${L.dominoes.length} dominoes.`);
  } catch (err) { toast(`Couldn’t open it: ${err.message}`); }
}

/* ---------------- UI ---------------- */
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), ms);
}
function setStatus(msg) { $('#scrub-msg').textContent = msg; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const fmtH = h => `${(h / INCH).toFixed(h < 0.1 ? 1 : 1).replace(/\.0$/, '')} in · ${Math.round(h * 1000)} mm`;

/* size slider is logarithmic from the standard height to 12 inches */
const sizeEl = $('#size');
const hToSlider = h => Math.log(h / stdHeight()) / Math.log(MAX_HEIGHT / stdHeight());
const sliderToH = v => stdHeight() * Math.pow(MAX_HEIGHT / stdHeight(), v);
const SIZE_CHIPS = [['Standard', () => stdHeight()], ['3 in', () => 3 * INCH], ['4 in', () => 4 * INCH], ['6 in', () => 6 * INCH], ['8 in', () => 8 * INCH], ['12 in', () => 12 * INCH]];

function buildPanels() {
  // styles
  $('#styles').innerHTML = '';
  for (const s of STYLES) {
    const b = document.createElement('button');
    b.className = 'row';
    b.dataset.style = s.id;
    b.append(styleSwatch(s.id, s.id === 'wood' ? '#c9a06b' : s.id === 'steel' ? '#b9bec4' : s.color));
    const t = document.createElement('span');
    t.innerHTML = `<b>${esc(s.name)}</b><small>${esc(s.note)}</small>`;
    b.append(t);
    b.addEventListener('click', () => { S.style = s.id; savePrefs(); applyLook({ style: s.id }, `${s.name} style`); refresh(); });
    $('#styles').append(b);
  }
  // colours
  $('#colors').innerHTML = '';
  for (const [name, hex] of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.title = name; b.setAttribute('aria-label', name);
    b.dataset.color = hex;
    b.addEventListener('click', () => setColor(hex, name));
    $('#colors').append(b);
  }
  $('#custom-color').addEventListener('change', e => setColor(e.target.value, 'Colour'));
  // sizes
  $('#size-chips').innerHTML = '';
  for (const [name, f] of SIZE_CHIPS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = name;
    b.addEventListener('click', () => setSize(f(), true));
    $('#size-chips').append(b);
  }
  sizeEl.addEventListener('input', () => setSize(sliderToH(+sizeEl.value), false));
  sizeEl.addEventListener('change', () => setSize(sliderToH(+sizeEl.value), true));
  $('#spacing').addEventListener('input', e => { S.spacing = +e.target.value; savePrefs(); refresh(); });
  // tools and tabs
  for (const b of $$('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));
  for (const b of $$('.tabs [data-tab]')) b.addEventListener('click', () => { S.tab = b.dataset.tab; refresh(); if (S.tab === 'elements') loadElements(); });
  // elements
  $('#builtins').innerHTML = '';
  for (const b of BUILT_INS) {
    const el = document.createElement('button');
    el.className = 'item';
    el.dataset.builtin = b.id;
    el.innerHTML = `<span class="item__icon">${elementIcon(b.id)}</span><span class="item__body"><b>${esc(b.name)}</b><small>${esc(b.note)}</small></span>`;
    el.addEventListener('click', () => startElement(builtIn(b.id, { h: S.h, style: S.style, color: S.color, spacing: S.spacing }), b.id));
    $('#builtins').append(el);
  }
  // effects
  $('#effects').innerHTML = '';
  for (const fx of EFFECTS) {
    const el = document.createElement('button');
    el.className = 'item';
    el.dataset.fx = fx.id;
    el.innerHTML = `<span class="fx-dot" style="color:${fx.color}"></span><span class="item__body"><b>${esc(fx.name)}</b><small>${esc(fx.note)} ${fx.when === 'hit' ? 'Fires when it’s hit.' : 'Fires when it lands.'}</small></span><span class="fx-count"></span>`;
    el.addEventListener('click', () => toggleEffect(fx.id));
    $('#effects').append(el);
  }
  // camera views
  $('#views').innerHTML = '';
  for (const v of VIEWS) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = v.name;
    b.addEventListener('click', () => setView(v.id));
    $('#views').append(b);
  }
  for (const k of $$('[data-mod]')) k.textContent = MOD.trim();
  $('#follow').checked = S.follow;
  $('#follow').addEventListener('change', e => { S.follow = e.target.checked; savePrefs(); });
  // timeline
  for (const sp of [0.2, 0.5, 1, 2, 5]) {
    const b = document.createElement('button');
    b.textContent = `${sp}×`;
    b.dataset.speed = sp;
    b.addEventListener('click', () => { S.speed = sp; savePrefs(); refresh(); });
    $('#speeds').append(b);
  }
  $('#tl-play').addEventListener('click', playPause);
  $('#tl-restart').addEventListener('click', () => { if (!run) return; seek(0); S.playing = true; refresh(); });
  $('#tl-back').addEventListener('click', () => seek(S.t - 5));
  $('#tl-fwd').addEventListener('click', () => seek(S.t + 5));
  scrubber();
  // header
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#save').addEventListener('click', saveDialog);
  $('#open').addEventListener('click', openDialog);
  $('#help').addEventListener('click', helpDialog);
  $('#sound').addEventListener('click', () => { sound.ensure(); sound.muted = !sound.muted; sound.levels(); savePrefs(); refresh(); });
  $('#lab-toggle').addEventListener('click', () => { S.labOpen = !S.labOpen; refresh(); if (S.labOpen) renderLab(); });
  $('#room-chip').addEventListener('click', () => showPicker(true));
  $('#open-left').addEventListener('click', () => { $('#left').classList.toggle('is-open'); $('#right').classList.remove('is-open'); });
  $('#open-right').addEventListener('click', () => { $('#right').classList.toggle('is-open'); $('#left').classList.remove('is-open'); });
}

function elementIcon(id) {
  const paths = {
    line: 'M4 18h16M6 18v-6M10 18v-6M14 18v-6M18 18v-6',
    curve: 'M4 19c0-8 6-14 15-14',
    uturn: 'M6 20V10a6 6 0 0 1 12 0v10',
    s: 'M5 19c6 0 6-7 7-7s1-7 7-7',
    spiral: 'M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1-4 6',
    fork: 'M12 21v-8M12 13l-6-9M12 13l6-9',
    growth: 'M4 20v-3M9 20v-6M14 20v-9M19 20v-13',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[id] ?? paths.line}"/></svg>`;
}

function setColor(hex, name) {
  S.color = hex;
  savePrefs();
  applyLook({ color: hex }, name);
  refresh();
}
function setSize(h, commit) {
  S.h = THREE.MathUtils.clamp(h, stdHeight(), MAX_HEIGHT);
  savePrefs();
  if (commit) applyLook({ h: S.h }, `Height ${fmtH(S.h)}`);
  refresh();
}
function startElement(el, builtinId) {
  if (S.phase === 'run') stopRun();
  setTool('element');
  S.element = el;
  S.elementKey = builtinId ?? el.name;
  toast(`Placing ${el.name}: click to set it down. Near the end of a line it joins on.`);
  refresh();
}
async function loadElements() {
  const box = $('#saved-elements');
  try {
    const items = await store.list('elements');
    if (!items.length) { box.innerHTML = '<p class="empty">Select a group and choose Save as element to keep it here.</p>'; return; }
    box.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `<span class="item__icon">${elementIcon('line')}</span><button class="item__body" style="text-align:left"><b>${esc(it.name)}</b><small>${it.count} dominoes</small></button><button class="item__del" title="Delete" aria-label="Delete ${esc(it.name)}">×</button>`;
      row.querySelector('.item__body').addEventListener('click', async () => {
        try { const data = await store.load('elements', it.id); startElement({ ...data, name: it.name }, `saved:${it.id}`); }
        catch (err) { toast(`Couldn’t load it: ${err.message}`); }
      });
      row.querySelector('.item__del').addEventListener('click', async () => {
        if (!confirm(`Delete the element "${it.name}"?`)) return;
        await store.remove('elements', it.id);
        loadElements();
      });
      box.append(row);
    }
  } catch (err) { box.innerHTML = `<p class="empty">Couldn’t list saved elements: ${esc(err.message)}</p>`; }
}

function scrubber() {
  const el = $('#scrub');
  let wasPlaying = false, dragging = false;
  const at = e => {
    const r = el.getBoundingClientRect();
    return THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1) * trackLength();
  };
  el.addEventListener('pointerdown', e => {
    if (!run) return;
    dragging = true; wasPlaying = S.playing; S.playing = false;
    el.setPointerCapture(e.pointerId);
    seek(at(e));
  });
  el.addEventListener('pointermove', e => { if (dragging) seek(at(e)); });
  el.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; S.playing = wasPlaying; refresh(); });
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { seek(S.t - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { seek(S.t + 1); e.preventDefault(); }
  });
}
const trackLength = () => (!run ? 1 : run.done ? Math.max(endTime(), 0.1) : Math.max(run.frontier * 1.15, 6));
let marksAt = 0;
function drawTimeline() {
  const total = trackLength();
  const doneEl = $('#done'), played = $('#played'), head = $('#head');
  if (!run) {
    doneEl.style.width = '0'; played.style.width = '0'; head.style.left = '0';
    $('#time').innerHTML = `${fmtTime(0)}`;
    $('#marks').innerHTML = '';
    setStatus(L.dominoes.length ? 'Press play to knock them down' : 'Place a domino to begin');
    return;
  }
  doneEl.style.width = `${run.frontier / total * 100}%`;
  played.style.width = `${S.t / total * 100}%`;
  head.style.left = `${S.t / total * 100}%`;
  $('#time').innerHTML = `${fmtTime(S.t)} <small>/ ${run.done ? fmtTime(endTime()) : fmtTime(run.frontier) + '…'}</small>`;
  const scrub = $('#scrub');
  scrub.setAttribute('aria-valuemax', run.frontier.toFixed(1));
  scrub.setAttribute('aria-valuenow', S.t.toFixed(1));
  if (!run.done) setStatus(`Working out the run, ${run.frontier.toFixed(1)} s so far`);
  else {
    const fell = run.fallenBy(Infinity);
    setStatus(fell === run.n ? `All ${run.n} fell in ${run.duration.toFixed(1)} s` : `${fell} of ${run.n} fell. The rest were never reached.`);
  }
  const now = performance.now();
  if (now - marksAt > 500) {
    marksAt = now;
    const marks = [];
    for (const it of effects.items) {
      const t0 = effects.trigger(it);
      if (t0 === Infinity) continue;
      marks.push(`<i style="left:${t0 / total * 100}%;background:${effectById[it.id].color}" title="${esc(effectById[it.id].name)}"></i>`);
    }
    $('#marks').innerHTML = marks.join('');
  }
}

function refresh() {
  for (const b of $$('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool || (S.tool === 'element' && false)));
  for (const b of $$('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
  for (const p of $$('[data-pane]')) p.hidden = p.dataset.pane !== S.tab;
  const eds = editable();
  const appliesTxt = eds.length ? `changes the ${eds.length} selected` : '';
  for (const a of $$('[data-applies]')) a.textContent = appliesTxt;
  const note = $('[data-applies-note]');
  if (note) note.textContent = eds.length ? `Release the slider to resize the ${eds.length} selected.` : '';
  for (const b of $$('#styles .row')) b.setAttribute('aria-pressed', String(b.dataset.style === S.style));
  for (const b of $$('#colors .swatch')) b.setAttribute('aria-pressed', String(b.dataset.color === S.color));
  $('#custom-color').value = S.color;
  if (document.activeElement !== sizeEl) sizeEl.value = hToSlider(S.h);
  $('#size-out').textContent = fmtH(S.h);
  $('#spacing').value = S.spacing;
  $('#spacing-out').textContent = `${S.spacing.toFixed(2)} × height · ${Math.round(S.spacing * S.h * 1000)} mm`;
  for (const b of $$('#builtins .item')) b.setAttribute('aria-pressed', String(S.tool === 'element' && S.elementKey === b.dataset.builtin));
  // effects counts
  const sd = sel();
  for (const b of $$('#effects .item')) {
    const n = sd.filter(d => d.effects.includes(b.dataset.fx)).length;
    const total = L.dominoes.filter(d => d.effects.includes(b.dataset.fx)).length;
    b.setAttribute('aria-pressed', String(sd.length > 0 && n === sd.length));
    b.querySelector('.fx-count').textContent = total ? `${n && sd.length ? `${n} selected · ` : ''}${total} in run` : '';
  }
  $('#fx-hint').textContent = sd.length ? `Adding to the ${sd.length} selected. Pick an effect again to take it off.` : 'Select dominoes, then pick an effect to add it. Pick it again to take it off.';
  // header
  $('#save').disabled = L.dominoes.length === 0;
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
  $('#sound').setAttribute('aria-pressed', String(!sound.muted));
  $('#sound').title = sound.muted ? 'Sound off' : 'Sound on';
  $('#sound .wave').style.opacity = sound.muted ? 0.15 : 1;
  $('#lab-toggle').setAttribute('aria-pressed', String(S.labOpen));
  $('#lab').hidden = !S.labOpen;
  $('#right').hidden = S.labOpen;
  // timeline buttons
  $('#tl-play-icon').innerHTML = S.playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4v16l13-8z"/>';
  $('#tl-play').setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
  $('#tl-play').title = S.playing ? 'Pause (Space)' : 'Play (Space)';
  for (const id of ['#tl-restart', '#tl-back', '#tl-fwd']) $(id).disabled = !run;
  $('#tl-play').disabled = !L.dominoes.length;
  for (const b of $$('#speeds button')) b.setAttribute('aria-pressed', String(+b.dataset.speed === S.speed));
  const groups = L.groups.length, starts = L.dominoes.filter(d => d.start).length || (L.dominoes.length ? 1 : 0);
  const fxN = L.dominoes.filter(d => d.effects.length).length;
  let status = `<span><b>${L.dominoes.length}</b> dominoes</span><span><b>${groups}</b> group${groups === 1 ? '' : 's'}</span><span><b>${starts}</b> start${starts === 1 ? '' : 's'}</span>${fxN ? `<span><b>${fxN}</b> with effects</span>` : ''}`;
  if (run) status = `<span><b>${run.fallenBy(S.t)}</b> of ${run.n} down</span>${effects.slowActive(S.t) ? '<span class="slow">Slow motion</span>' : ''}<span>Speed ${S.speed}×</span>`;
  $('#tl-status').innerHTML = status;
  renderInspector();
  drawTimeline();
}

let lastInspector = '';
function renderInspector() {
  const box = $('#sel');
  let html;
  if (S.phase === 'run') {
    html = `<div class="run-note"><b>Watching the run</b>Orbit with a left drag. Scrub the timeline, or change speed. The layout comes back when you go back to building.<button class="btn" data-act="build">Back to building <kbd>Esc</kbd></button></div>`;
  } else if (held) {
    html = `<div class="sel__title">Holding ${held.ids.size}</div><div class="sel__meta">Click to set down. <kbd>Q</kbd> <kbd>E</kbd> turn. <kbd>Esc</kbd> puts ${held.ids.size > 1 ? 'them' : 'it'} back.</div>`;
  } else if (!S.sel.size) {
    const starts = L.dominoes.filter(d => d.start).length;
    html = `<div class="sel__title">Nothing selected</div>
      <div class="tips">
        <p><span>Click</span><span>Select. A grouped one selects its group.</span></p>
        <p><span>Click again</span><span>Just that one, out of its group.</span></p>
        <p><span>Drag empty floor</span><span>Box select. Shift adds.</span></p>
        <p><span>Double-click</span><span>Pick one up to carry it.</span></p>
        <p><span>Draw tool</span><span>Drag to lay a line.</span></p>
      </div>
      <div class="stats"><div class="stat"><b>${L.dominoes.length}</b><small>dominoes</small></div><div class="stat"><b>${L.groups.length}</b><small>groups</small></div><div class="stat"><b>${starts || (L.dominoes.length ? 1 : 0)}</b><small>${starts ? 'starts' : 'start, auto'}</small></div></div>`;
  } else {
    const ds = sel();
    const g = selectedGroup();
    const locked = ds.filter(d => d.locked).length;
    const sizes = [...new Set(ds.map(d => fmtH(d.h)))];
    const groupsIn = new Set(ds.map(d => d.group).filter(Boolean));
    const fx = [...new Set(ds.flatMap(d => d.effects))];
    const meta = [g ? `${esc(g.name)}, a group` : groupsIn.size ? `In ${groupsIn.size} group${groupsIn.size > 1 ? 's' : ''}` : 'Not grouped',
      sizes.length === 1 ? sizes[0] : 'Mixed heights', locked ? `${locked} locked` : '', ds.some(d => d.start) ? 'Starts the run' : ''].filter(Boolean).join(' · ');
    const can = { group: ds.length > 1 && !g, ungroup: groupsIn.size > 0, paste: !!clipboard };
    const btn = (act, label, key, extra = '', dis = false) => `<button class="act ${extra}" data-act="${act}" ${dis ? 'disabled' : ''}><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    html = `<div class="sel__title">${ds.length === 1 ? '1 domino' : `${ds.length} dominoes`}</div><div class="sel__meta">${meta}</div>
      <div class="actions">
        ${btn('rotl', 'Turn left', 'Q')}${btn('rotr', 'Turn right', 'E')}
        ${btn('pickup', 'Pick up', 'H')}${btn('lock', locked === ds.length ? 'Unlock' : 'Lock', 'L')}
        ${btn('group', 'Group', 'G', '', !can.group)}${btn('ungroup', 'Ungroup', '⇧G', '', !can.ungroup)}
        ${btn('copy', 'Copy', `${MOD}C`)}${btn('paste', 'Paste', `${MOD}V`, '', !can.paste)}
        ${btn('start', ds.every(d => d.start) ? 'Not the start' : 'Start here', 'S')}${btn('dup', 'Duplicate', `${MOD}D`)}
        ${btn('element', 'Save as element', '', 'act--wide')}
        ${btn('delete', g ? 'Delete group' : 'Delete', '⌫', 'act--wide act--danger')}
      </div>
      ${g ? '<p class="note">Drag the orange dot on either end to bend or stretch the group. The other end stays put.</p>' : ''}
      ${fx.length ? `<div class="sub">Effects</div><div class="fx-chips">${fx.map(id => `<span class="fx-chip"><span class="fx-dot" style="color:${effectById[id]?.color}"></span>${esc(effectById[id]?.name ?? id)}<button data-unfx="${id}" aria-label="Remove ${esc(effectById[id]?.name ?? id)}">×</button></span>`).join('')}</div>` : ''}`;
  }
  if (html === lastInspector) return;
  lastInspector = html;
  box.innerHTML = html;
}
$('#sel').addEventListener('click', e => {
  const b = e.target.closest('[data-act], [data-unfx]');
  if (!b) return;
  if (b.dataset.unfx) {
    const id = b.dataset.unfx;
    edit(() => { for (const d of editable()) d.effects = d.effects.filter(x => x !== id); });
    return;
  }
  ({
    build: stopRun, rotl: () => rotateSel(Math.PI / 12), rotr: () => rotateSel(-Math.PI / 12), pickup: pickUp, lock: toggleLock,
    group: groupSel, ungroup: ungroupSel, copy: copySel, paste, start: toggleStart, dup: () => { if (copySel()) paste(); },
    element: elementDialog, delete: deleteSel,
  })[b.dataset.act]?.();
});

/* ---------------- dialogs ---------------- */
function openModal(html, mount) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  m.onclick = e => { if (e.target === m) closeModal(); };
  mount?.(m.firstElementChild);
  m.querySelector('input, button')?.focus();
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
const modalOpen = () => !$('#modal').hidden;

async function saveDialog() {
  if (!L.dominoes.length) return;
  const mode = await store.storeMode();
  const where = mode === 'project' ? 'Saves go in this project, in <code>tinkering/domino-run/saves/states/</code>.' : 'There’s no local server here, so saves stay in this browser.';
  const name = S.saveName || `Run ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  openModal(`<h2>Save this run</h2><p>${where} ${L.dominoes.length} dominoes, with the camera where it is now.</p>
    <div class="field"><label for="save-name">Name</label><input type="text" id="save-name" value="${esc(name)}" maxlength="80"></div>
    <div class="modal__actions"><button class="btn" data-x="cancel">Cancel</button>${S.saveId ? '<button class="btn" data-x="new">Save as new</button>' : ''}<button class="btn btn--accent" data-x="save">${S.saveId ? 'Save over' : 'Save'}</button></div>`, m => {
    const input = m.querySelector('#save-name');
    input.select();
    const go = asNew => { const n = input.value.trim(); if (!n) { input.focus(); return; } closeModal(); doSave(n, asNew); };
    m.querySelector('[data-x="save"]').onclick = () => go(false);
    m.querySelector('[data-x="new"]')?.addEventListener('click', () => go(true));
    m.querySelector('[data-x="cancel"]').onclick = closeModal;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(false); });
  });
}
async function openDialog() {
  const mode = await store.storeMode();
  openModal(`<h2>Open a saved run</h2><p>${mode === 'project' ? 'From <code>tinkering/domino-run/saves/states/</code> in this project.' : 'Saved in this browser.'}</p><div class="saves" id="save-list"><p class="empty">Loading…</p></div>
    <div class="modal__actions"><button class="btn" data-x="close">Close</button></div>`, async m => {
    m.querySelector('[data-x="close"]').onclick = closeModal;
    const box = m.querySelector('#save-list');
    try {
      const items = await store.list('states');
      if (!items.length) { box.innerHTML = '<p class="empty">Nothing saved yet. Place a domino, then Save.</p>'; return; }
      box.innerHTML = '';
      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'save';
        const when = new Date(it.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        row.innerHTML = `<button class="save__open">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : '<span class="noimg"></span>'}<span><b>${esc(it.name)}</b><small>${it.count} dominoes · ${esc(when)}</small></span></button><button class="item__del" title="Delete" aria-label="Delete ${esc(it.name)}">×</button>`;
        row.querySelector('.save__open').onclick = () => openState(it.id, it.name);
        row.querySelector('.item__del').onclick = async () => {
          if (!confirm(`Delete "${it.name}"? This removes the file.`)) return;
          await store.remove('states', it.id);
          if (S.saveId === it.id) { S.saveId = null; S.saveName = ''; }
          row.remove();
        };
        box.append(row);
      }
    } catch (err) { box.innerHTML = `<p class="empty">Couldn’t list saves: ${esc(err.message)}</p>`; }
  });
}
function elementDialog() {
  const ds = sel();
  if (!ds.length) return;
  const g = selectedGroup();
  openModal(`<h2>Save as an element</h2><p>Keeps these ${ds.length} dominoes as a piece you can place again, in this run or a new one. It keeps their sizes, colours and effects.</p>
    <div class="field"><label for="el-name">Name</label><input type="text" id="el-name" value="${esc(g?.name ?? 'My element')}" maxlength="60"></div>
    <div class="modal__actions"><button class="btn" data-x="cancel">Cancel</button><button class="btn btn--accent" data-x="save">Save element</button></div>`, m => {
    const input = m.querySelector('#el-name');
    input.select();
    const go = async () => {
      const name = input.value.trim();
      if (!name) return;
      closeModal();
      try {
        const el = Lay.elementFrom(Lay.members(L, ds.map(d => d.id)), name);
        await store.save('elements', name, el, null);
        toast(`Saved ${name}. It’s under Elements.`);
        S.tab = 'elements'; refresh(); loadElements();
      } catch (err) { toast(`Couldn’t save it: ${err.message}`); }
    };
    m.querySelector('[data-x="save"]').onclick = go;
    m.querySelector('[data-x="cancel"]').onclick = closeModal;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}
function helpDialog() {
  const k = (keys, what) => `<p><span>${what}</span><span>${keys.map(x => `<kbd>${x}</kbd>`).join(' ')}</span></p>`;
  openModal(`<h2>Shortcuts</h2><div class="help-grid">
    <h3>Tools</h3>${k(['V'], 'Select')}${k(['B'], 'Place')}${k(['D'], 'Draw a line')}${k(['Shift'], 'Place without joining on')}
    <h3>Selection</h3>${k(['Q', 'E'], 'Turn 15°')}${k(['Shift', 'Q'], 'Turn 3°')}${k(['H'], 'Pick up, set down')}${k(['L'], 'Lock, unlock')}${k(['G'], 'Group')}${k(['⇧', 'G'], 'Ungroup')}
    ${k([MOD.trim(), 'C'], 'Copy')}${k([MOD.trim(), 'V'], 'Paste')}${k([MOD.trim(), 'D'], 'Duplicate')}${k(['⌫'], 'Delete')}${k(['S'], 'Start here')}${k(['←', '→'], 'Nudge')}${k([MOD.trim(), 'A'], 'Select all')}${k([MOD.trim(), 'Z'], 'Undo')}
    <h3>Playback</h3>${k(['Space'], 'Play, pause')}${k(['←', '→'], '5 seconds back, forward')}${k(['Home'], 'Restart')}${k(['[', ']'], 'Slower, faster')}${k(['Esc'], 'Back to building')}${k(['T'], 'Follow on, off')}
    <h3>Camera</h3>${k(['Right drag'], 'Orbit')}${k(['⇧', 'Right drag'], 'Pan')}${k([MOD.trim(), 'Drag'], 'Orbit')}${k([MOD.trim(), '⇧', 'Drag'], 'Pan')}${k(['Middle drag'], 'Pan')}${k(['Scroll'], 'Zoom')}${k(['F'], 'Fit to dominoes')}
  </div><div class="modal__actions"><button class="btn" data-x="close">Close</button></div>`, m => { m.querySelector('[data-x="close"]').onclick = closeModal; });
}

/* ---------------- keyboard ---------------- */
window.addEventListener('keydown', e => {
  readKeys(e);
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
  if (modalOpen()) { if (e.key === 'Escape') closeModal(); return; }
  if (typing || S.screen !== 'room') return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (key === ' ') { e.preventDefault(); playPause(); return; }
  if (S.phase === 'run') {
    if (e.key === 'ArrowLeft') { seek(S.t - 5); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { seek(S.t + 5); e.preventDefault(); }
    else if (e.key === 'Home') { seek(0); }
    else if (e.key === 'Escape') stopRun();
    else if (key === '[' || key === ']') speedStep(key === ']' ? 1 : -1);
    else if (key === 't') { S.follow = !S.follow; $('#follow').checked = S.follow; savePrefs(); toast(S.follow ? 'Following the falling dominoes.' : 'Camera stays put.'); }
    else if (key === 'f') setView('fit');
    else if (['v', 'b', 'd'].includes(key) && !mod) setTool({ v: 'select', b: 'place', d: 'draw' }[key]);
    else if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    return;
  }
  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { e.preventDefault(); redo(); return; }
  if (mod && key === 'c') { e.preventDefault(); copySel(); return; }
  if (mod && key === 'v') { e.preventDefault(); paste(); return; }
  if (mod && key === 'd') { e.preventDefault(); if (copySel()) paste(); return; }
  if (mod && key === 'a') { e.preventDefault(); selectAll(); return; }
  if (mod && key === 's') { e.preventDefault(); saveDialog(); return; }
  if (mod && key === 'o') { e.preventDefault(); openDialog(); return; }
  if (mod) return;
  const step = e.shiftKey ? Math.PI / 60 : Math.PI / 12;
  switch (key) {
    case 'v': setTool('select'); break;
    case 'b': setTool('place'); break;
    case 'd': setTool('draw'); break;
    case 'q': rotateSel(step); break;
    case 'e': rotateSel(-step); break;
    case 'h': held ? setDown() : pickUp(); break;
    case 'l': toggleLock(); break;
    case 'g': e.shiftKey ? ungroupSel() : groupSel(); break;
    case 's': toggleStart(); break;
    case 'f': setView('fit'); break;
    case '[': speedStep(-1); break;
    case ']': speedStep(1); break;
    case '?': helpDialog(); break;
    case 'backspace': case 'delete': e.preventDefault(); deleteSel(); break;
    case 'escape':
      if (held) cancelHeld();
      else if (S.tool !== 'select') setTool('select');
      else select([]);
      break;
    case 'arrowleft': case 'arrowright': case 'arrowup': case 'arrowdown': {
      if (!S.sel.size) break;
      e.preventDefault();
      // nudge in the camera's frame
      const amt = (e.shiftKey ? 0.01 : 0.002);
      const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const v = key === 'arrowup' ? f : key === 'arrowdown' ? f.clone().negate() : key === 'arrowright' ? r : r.clone().negate();
      nudge(v.x * amt, v.z * amt);
      break;
    }
  }
});
window.addEventListener('keyup', readKeys);
window.addEventListener('blur', () => { keys.cam = keys.alt = keys.shift = false; mouseButtons(); });
function speedStep(dir) {
  const sp = [0.2, 0.5, 1, 2, 5];
  const i = THREE.MathUtils.clamp(sp.indexOf(S.speed) + dir, 0, sp.length - 1);
  S.speed = sp[i]; savePrefs(); refresh();
}

/* ---------------- lab ---------------- */
let savedParams = { ...PARAMS };
const debounced = new Map();
function later(key, fn, ms = 220) { clearTimeout(debounced.get(key)); debounced.set(key, setTimeout(fn, ms)); }
function applyParam(p) {
  switch (p.apply) {
    case 'run': if (run) later('run', () => startRun(true)); break;
    case 'room': later('room', () => { const wasRun = !!run; stopRun(); rebuildRoom(); resettle(); if (wasRun) startRun(true); }, 300); break;
    case 'light': applyLights(); if (p.key === 'shadowSize') scheduleEnv(); break;
    case 'look': later('look', () => { resetLook(); for (const [id, v] of views) { restyleView(v, Lay.byId(L, id)); } rebuildMarkers(); ghosts.clear(); if (run) startRun(true); dirty(); }); break;
    case 'cam': applyCam(); break;
    case 'live':
      if (p.key === 'volume' || p.key === 'reverb') sound.levels();
      if (p.key === 'spacing') { S.spacing = PARAMS.spacing; refresh(); }
      break;
  }
  labCount();
}
function resettle() {
  for (const d of L.dominoes) { const y = surfaceAt(d.x, d.z, d.y); if (y != null) d.y = y; }
  syncViews();
}
function renderLab() {
  const tabs = $('#lab-tabs');
  tabs.innerHTML = '';
  for (const s of SECTIONS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = s.name;
    b.setAttribute('aria-pressed', String(s.id === S.labSection));
    b.onclick = () => { S.labSection = s.id; renderLab(); };
    tabs.append(b);
  }
  const box = $('#lab-params');
  box.innerHTML = '';
  for (const p of SCHEMA.filter(x => x.section === S.labSection)) {
    const row = document.createElement('div');
    row.className = 'param';
    const id = `p-${p.key}`;
    const fmt = v => (p.type === 'toggle' ? (v ? 'On' : 'Off') : p.type === 'color' ? '' : (+v).toFixed(p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : p.step >= 0.01 ? 2 : 3));
    row.innerHTML = `<div class="param__head"><label for="${id}">${esc(p.label)}</label>${p.type === 'color' || p.type === 'toggle' ? `<output>${fmt(PARAMS[p.key])}</output>` : `<input type="number" class="param__num" min="${p.min}" max="${p.max}" step="${p.step}" value="${+fmt(PARAMS[p.key])}" aria-label="${esc(p.label)}, typed">`}<span class="unit">${esc(p.unit ?? '')}</span><button class="param__reset" title="Back to default (${esc(String(p.value))})" aria-label="Reset ${esc(p.label)}">↺</button></div>
      ${p.type === 'color' ? `<input type="color" id="${id}" value="${PARAMS[p.key]}">` : p.type === 'toggle' ? `<label class="check" style="margin-top:4px"><input type="checkbox" id="${id}" ${PARAMS[p.key] ? 'checked' : ''}> On</label>` : `<input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${PARAMS[p.key]}">`}
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}`;
    const input = row.querySelector(`#${CSS.escape(id)}`);
    const out = row.querySelector('output'), num = row.querySelector('.param__num');
    const mark = () => row.classList.toggle('is-changed', PARAMS[p.key] !== DEFAULTS[p.key]);
    mark();
    input.addEventListener(p.type === 'color' ? 'input' : p.type === 'toggle' ? 'change' : 'input', () => {
      PARAMS[p.key] = p.type === 'color' ? input.value : p.type === 'toggle' ? (input.checked ? 1 : 0) : +input.value;
      if (out) out.textContent = fmt(PARAMS[p.key]);
      if (num) num.value = +fmt(PARAMS[p.key]);
      mark();
      applyParam(p);
    });
    // a number field beside the slider: type a value in place of dragging. A number inside the slider's range takes
    // effect as it is typed; leaving the field (or Enter) tidies it, bringing anything outside to the nearest end.
    if (num) {
      const take = v => { PARAMS[p.key] = v; input.value = v; mark(); applyParam(p); labCount(); };
      num.addEventListener('input', () => { const v = num.valueAsNumber; if (Number.isFinite(v) && v >= p.min && v <= p.max) take(v); });
      num.addEventListener('change', () => {
        const v = num.valueAsNumber;
        if (Number.isFinite(v)) take(Math.min(p.max, Math.max(p.min, v)));
        num.value = +fmt(PARAMS[p.key]);
      });
    }
    row.querySelector('.param__reset').onclick = () => {
      PARAMS[p.key] = DEFAULTS[p.key];
      renderLab();
      applyParam(p);
    };
    box.append(row);
  }
  labCount();
}
function labCount() {
  const n = Object.keys(changedFromDefaults()).length;
  const unsaved = Object.keys(PARAMS).some(k => PARAMS[k] !== savedParams[k]);
  $('#lab-count').textContent = `${n} changed from defaults${unsaved ? ' · not saved' : ''}`;
}
function applyAll(prev) {
  for (const p of SCHEMA) if (PARAMS[p.key] !== prev[p.key]) applyParam(p);
}
$('#lab-save').addEventListener('click', async () => {
  try {
    await store.saveParams(changedFromDefaults());
    savedParams = { ...PARAMS };
    const n = Object.keys(changedFromDefaults()).length;
    $('#lab-status').textContent = `Saved ${n} ${n === 1 ? 'setting' : 'settings'} to tinkering/domino-run/params.json. Everyone gets ${n === 1 ? 'it' : 'them'} once it’s committed.`;
    labCount();
  } catch (err) { $('#lab-status').textContent = err.message; }
});
$('#lab-revert').addEventListener('click', () => {
  const prev = { ...PARAMS };
  Object.assign(PARAMS, savedParams);
  applyAll(prev); renderLab();
  $('#lab-status').textContent = 'Back to the last saved settings.';
});
$('#lab-defaults').addEventListener('click', () => {
  const prev = { ...PARAMS };
  for (const p of SCHEMA) if (p.section === S.labSection) PARAMS[p.key] = DEFAULTS[p.key];
  applyAll(prev); renderLab();
  $('#lab-status').textContent = `${SECTIONS.find(s => s.id === S.labSection).name} is back to its defaults.`;
});
$('#lab-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(changedFromDefaults(), null, 2)); $('#lab-status').textContent = 'Copied the changed settings as JSON.'; }
  catch { $('#lab-status').textContent = 'The browser wouldn’t allow copying.'; }
});
$('#lab-run').addEventListener('click', async () => {
  const v = $('#lab-test').value;
  if (v) loadTest(v);
  await startRun(true);
});
$('#lab-test').addEventListener('change', e => { if (e.target.value) loadTest(e.target.value); });

function loadTest(kind) {
  const before = snapshot();
  L = Lay.newLayout();
  const h = stdHeight(), sp = PARAMS.spacing * h;
  const o = room.openFloor;
  const put = (x, z, yaw, extra = {}) => Lay.addDomino(L, { x, y: surfaceAt(x, z, extra.y ?? 0) ?? 0, z, yaw, h: extra.h ?? h, style: extra.style ?? S.style, color: extra.color ?? S.color, effects: extra.effects ?? [] });
  if (kind === 'line') {
    const ids = [];
    for (let i = 0; i < 40; i++) ids.push(put(o.x - 20 * sp + i * sp, o.z, Math.PI / 2).id);
    Lay.makeGroup(L, ids, 'Test line');
  } else if (kind === 'curve') {
    const el = builtIn('s', { h, style: S.style, color: S.color, spacing: PARAMS.spacing });
    const specs = Lay.elementSpecs(el, o.x - 0.35, 0, o.z + 0.1, Math.PI / 2);
    Lay.makeGroup(L, specs.map(s => put(s.x, s.z, s.yaw).id), 'Test S-bend');
  } else if (kind === 'growth') {
    const el = builtIn('growth', { h, style: S.style, color: S.color, spacing: PARAMS.spacing });
    const specs = Lay.elementSpecs(el, o.x - 0.3, 0, o.z, Math.PI / 2);
    Lay.makeGroup(L, specs.map(s => put(s.x, s.z, s.yaw, { h: s.h })).map(d => d.id), 'Test growth');
  } else if (kind === 'table') {
    const { surfaces } = room;
    const cz = room.bounds.D / 2 - PARAMS.couchZ - 0.475, tz = cz - 0.475 - PARAMS.tableGap - 0.31;
    const ids = [];
    // along the table top to its end, so the last one tips off onto a line on the floor
    const endX = PARAMS.couchX + PARAMS.tableLength / 2;
    for (let i = 0; i < 24; i++) ids.push(put(endX - 0.012 - (23 - i) * sp, tz, Math.PI / 2, { y: surfaces.table }).id);
    for (let i = 0; i < 16; i++) ids.push(put(endX + 0.035 + i * sp, tz, Math.PI / 2).id);
    Lay.byId(L, ids[0]).start = true;
  } else if (kind === 'mixed') {
    STYLES.forEach((s, k) => {
      const ids = [];
      for (let i = 0; i < 24; i++) ids.push(put(o.x - 12 * sp + i * sp, o.z - 0.3 + k * 0.15, Math.PI / 2, { style: s.id, color: s.color }).id);
      Lay.byId(L, ids[0]).start = true;
      Lay.makeGroup(L, ids, s.name);
    });
  }
  pushUndo(before);
  S.sel.clear();
  changed();
  setView('fit');
}

/* ---------------- environment picker ---------------- */
function buildPicker() {
  const box = $('#envs');
  box.innerHTML = '';
  for (const env of ENVS) {
    const b = document.createElement('button');
    b.className = 'env';
    b.disabled = !env.ready;
    const img = env.ready
      ? `<img class="env__img" src="assets/env-${env.id}.jpg" alt="">`
      : `<span class="env__img" style="background:linear-gradient(160deg, ${env.look[0]}, ${env.look[1]})"></span>`;
    b.innerHTML = `${img}<span class="env__body"><b>${esc(env.name)}</b><small>${esc(env.note)}</small>${env.ready ? '<span class="env__go">Build here →</span>' : '<span class="env__soon">Coming soon</span>'}</span>`;
    if (env.ready) b.addEventListener('click', () => enterRoom(env.id));
    box.append(b);
  }
}
function showPicker(on) {
  $('#picker').hidden = !on;
  if (on) { S.screen = 'pick'; stopRun(); }
}
let roomReady = false;
async function enterRoom(id) {
  showPicker(false);
  S.screen = 'room';
  mouseButtons();
  const u = new URL(location.href);
  u.searchParams.set('room', id);
  history.replaceState(null, '', u);
  if (!roomReady) {
    $('#loading').hidden = false;
    const t0 = performance.now();
    while (!hdrReady && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 50));
    $('#loading').hidden = true;
    roomReady = true;
  }
  refresh();
  if (!L.dominoes.length) toast('Pick Place or Draw, then click the floor. Draw lays a whole line as you drag.', 5200);
  else toast(`Picked up where you left off: ${L.dominoes.length} dominoes.`, 3200);
  ensureRapier().catch(() => {});
  store.storeMode().then(m => { $('#store-note').textContent = m === 'project' ? 'Saving to this project' : 'Saving in this browser'; });
}

/* ---------------- frame loop ---------------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
let refreshAt = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (envFrames.length) { envFrames = envFrames.map(f => f - 1); if (envFrames[0] <= 0) { envFrames.shift(); if (hdrReady) captureEnv(); } }
  stepCam(dt);
  if (run) {
    run.advance(S.t + 4 * Math.max(1, S.speed), 7);
    if (S.playing) {
      const prev = S.t;
      S.t += dt * S.speed * effects.timeScale(S.t);
      const end = endTime();
      if (S.t >= end) {
        S.t = end;
        if (run.done) { S.playing = false; refresh(); }
      }
      playSounds(prev, S.t);
      effects.update(S.t, prev, true, panOf, camera);
      follow(dt);
    } else effects.update(S.t, S.t, false, panOf, camera);
    applyPoses(S.t);
    const dim = effects.dimLevel;
    renderer.toneMappingExposure = PARAMS.exposure * (1 - 0.55 * dim);
    if (room) room.sun.intensity = PARAMS.sun * (1 - 0.8 * dim);
    const now = performance.now();
    if (now - refreshAt > 120) { refreshAt = now; drawTimeline(); if (S.playing) refreshStatus(); }
  }
  controls.update();
  clampCam();
  updateHover();
  if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  renderer.render(scene, camera);
}
function refreshStatus() {
  $('#tl-status').innerHTML = `<span><b>${run.fallenBy(S.t)}</b> of ${run.n} down</span>${effects.slowActive(S.t) ? '<span class="slow">Slow motion</span>' : ''}<span>Speed ${S.speed}×</span>`;
}

/* ---------------- start ---------------- */
resize();
rebuildRoom();
buildPanels();
buildPicker();
syncViews();
setView('room', true);
if (L.dominoes.length) setView('fit', true);
if (S.labOpen) renderLab();
refresh();
const wanted = url.searchParams.get('room');
if (ENVS.find(e => e.id === wanted && e.ready)) enterRoom(wanted);
else showPicker(true);
frame();

/* test hook */
window.__domino = {
  S, get L() { return L; }, set L(v) { L = v; changed(); }, get run() { return run; }, views, camera, controls, scene, renderer, THREE,
  setTool, setView, startRun, stopRun, seek, select, groupSel, copySel, paste, deleteSel, toggleLock, toggleEffect, loadTest,
  surfaceAt, roomBlocked, get room() { return room; }, sound, effects, pickUp, setDown, rotateSel, undo, redo,
  bend(end, x, z) { const g = selectedGroup(); if (!g) return false; drag = { kind: 'bend', end, before: snapshot(), snap: g.members.map(id => ({ ...Lay.byId(L, id) })), live: new Map() }; const fake = { clientX: 0, clientY: 0 }; const tip = end === 'last' ? drag.snap.at(-1) : drag.snap[0]; const { positions } = Lay.bendPlan(drag.snap, end, x, z); const specs = drag.snap.map((d, i) => { const p = positions[i]; const y = surfaceAt(p.x, p.z, d.y) ?? d.y; drag.live.set(d.id, { x: p.x, y, z: p.z, yaw: p.yaw }); return { ...d, x: p.x, y, z: p.z, yaw: p.yaw }; }); liveApply(specs); const d = drag; drag = null; finishLive(d); return { tip, fake }; },
  saveState: doSave, openState, store, thumbnail,
  finish() { if (run) run.advance(1e9, 1e9); return run && { n: run.n, fell: run.fallenBy(Infinity), dur: run.duration, end: endTime() }; },
};
