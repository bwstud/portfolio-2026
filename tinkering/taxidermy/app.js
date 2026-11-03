import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadRig } from './rig.js';
import { SETTINGS, buildSetting, buildRod } from './stage.js';
import { createSheets } from './sheets.js';
import { parseCommand } from './command.js';
import { exportSkeleton } from './export.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
// each specimen: its model, rig, the bone the mounting rod meets, and its caption and credit
const SPECIMENS = {
  giraffe: {
    name: 'Northern giraffe, adult male', rodBone: 'Sternum_IV',
    caption: (h, l) => `Northern giraffe, adult male. ${h} m to the top of the horns, ${l} m nose to tail.`,
    credit: 'Skeleton: <a href="https://data.public.lu/en/datasets/photogrammetric-3d-scan-of-a-giraffe-skeleton/" target="_blank" rel="noopener">photogrammetric scan of a giraffe skeleton</a> (MNHNL 132557), Musée national d’histoire naturelle Luxembourg, CC BY 4.0. Bones simplified and articulated for this page.',
  },
  moa: {
    name: 'Little bush moa', rodBone: 'Sternum',
    caption: (h, l) => `Little bush moa, extinct since the 1400s. ${h} m at the head, ${l} m beak to toe in this stride.`,
    credit: 'Skeleton: <a href="https://sketchfab.com/3d-models/little-bush-moa-skeleton-b658205efa2a4d16abc9bb40bc96cdc8" target="_blank" rel="noopener">little bush moa</a> scanned bone by bone from Auckland War Memorial Museum specimens 5511 and 5512 by Daniel Thomas, Massey University, CC BY 4.0. Windpipe rings are a digital reconstruction. Simplified, recoloured from the scan’s texture, and articulated for this page.',
  },
};
const asked = new URLSearchParams(location.search).get('animal');
const ANIMAL = SPECIMENS[asked] ? asked : 'giraffe';
const SPEC = SPECIMENS[ANIMAL];
$('animal').value = ANIMAL;
$('animal').addEventListener('change', e => { location.search = `?animal=${e.target.value}`; });
$('credit').innerHTML = SPEC.credit;
$('scene').setAttribute('aria-label', `A ${SPEC.name.toLowerCase()} skeleton, mounted`);

// ---------- renderer, camera, light ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.4; controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.53;

const hemi = new THREE.HemisphereLight('#fff6ea', '#2a241e', 0.6);
const key = new THREE.DirectionalLight('#fff3e0', 2.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight('#cfe0ff', 0.9);
scene.add(hemi, key, key.target, rim);

const LIGHTS = {
  gallery: { bg: 'radial-gradient(ellipse at 50% 40%, #2c2723 0%, #0b0a09 70%)', key: ['#fff3e0', 2.6, [3, 7, 4]], rim: ['#cfe0ff', 0.9], hemi: 0.6, env: 0.45, exposure: 1.0 },
  window: { bg: 'radial-gradient(ellipse at 30% 30%, #4a4d50 0%, #1a1b1d 75%)', key: ['#f4f7ff', 3.2, [6, 5, 1]], rim: ['#ffe9cc', 0.5], hemi: 1.0, env: 0.8, exposure: 1.05 },
  night: { bg: 'radial-gradient(ellipse at 50% 30%, #141a2c 0%, #030407 70%)', key: ['#ffd6a0', 3.4, [0.5, 9, 1.5]], rim: ['#6f8cff', 1.4], hemi: 0.15, env: 0.15, exposure: 0.95 },
};
let light = 'gallery';
function setLight(id) {
  light = id;
  const L = LIGHTS[id];
  canvas.style.background = L.bg;
  key.color.set(L.key[0]); key.intensity = L.key[1];
  key.position.set(...L.key[2]).multiplyScalar(1.4).add(new THREE.Vector3(0, 0, 0));
  rim.color.set(L.rim[0]); rim.intensity = L.rim[1]; rim.position.set(-5, 4, -6);
  hemi.intensity = L.hemi; scene.environmentIntensity = L.env; renderer.toneMappingExposure = L.exposure;
  for (const b of document.querySelectorAll('#lights button')) b.setAttribute('aria-pressed', b.dataset.light === id);
}

// a floor that only shows shadows, under every setting except the void
const catcher = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.ShadowMaterial({ opacity: 0.4 }));
catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true;
scene.add(catcher);

// the animal is framed in the clear space between the header and the bench, not the whole canvas
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const bench = document.querySelector('.bench');
  const shown = bench && getComputedStyle(bench).display !== 'none';
  const top = shown ? 52 : 0, bottom = shown ? h - (innerHeight - bench.getBoundingClientRect().top) - 12 : h;
  const s = Math.max(0, h / 2 - (top + bottom) / 2);
  camera.aspect = w / (h + 2 * s);
  camera.setViewOffset(w, h + 2 * s, 0, 2 * s, w, h);
  camera.updateProjectionMatrix();
  return (bottom - top) / (h + 2 * s);      // share of the full frame's height that shows
}
addEventListener('resize', resize);
resize();

// ---------- load ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync(`assets/${ANIMAL}.glb`, e => {
  if (e.total) $('loading-bar').style.width = `${(100 * e.loaded) / e.total}%`;
});
const rig = await loadRig(gltf, `assets/${ANIMAL}-rig.json`);
$('loading').classList.add('is-done');

const stand = new THREE.Group();          // lifts the skeleton onto the setting's top
stand.add(rig.root);
scene.add(stand);
const rest = rig.pose();
const restBox = rig.bounds();
const meshes = Object.values(rig.bones).map(b => b.mesh);

// settings, rod and shadows are sized for a giraffe; smaller animals get them in proportion
const K = Math.min(1, Math.max(0.3, (restBox.max.y - restBox.min.y) / 4.6));
controls.minDistance = 0.4 * K;

// frame the whole animal: back off until it fills the clear space
const home = { target: restBox.getCenter(new THREE.Vector3()), dir: new THREE.Vector3(7.4, 1.0, 6.2).normalize() };
{
  // tall animals fill the height; long low ones (the moa) need room for their length
  const size = restBox.getSize(new THREE.Vector3());
  const share = resize(), tall = Math.max(size.y * 1.08 + 0.3 * K, Math.max(size.x, size.z) * 0.95);
  const dist = tall / share / 2 / Math.tan((camera.fov * DEG) / 2);
  camera.position.copy(home.target).addScaledVector(home.dir, dist);
  controls.target.copy(home.target); controls.update();
}
key.shadow.camera.left = key.shadow.camera.bottom = -3.4 * K;
key.shadow.camera.right = key.shadow.camera.top = 3.4 * K;
key.shadow.camera.far = 30;

// ---------- settings ----------
const ICONS = {
  void: '<circle cx="17" cy="11" r="6" stroke-dasharray="2 2.4"/><path d="M9 23h16" opacity=".35"/>',
  stone: '<path d="M4 17h26v5H4z"/><path d="M9 19.5h3M18 20h4" opacity=".6"/>',
  wood: '<path d="M4 18c4-1.5 22-1.5 26 0v4c-4 1.4-22 1.4-26 0z"/><path d="M9 20c4-.6 9-.6 13 0" opacity=".6"/>',
  case: '<path d="M6 4h22v15H6z"/><path d="M4 19h26v4H4z"/><path d="M9 7l4 4" opacity=".5"/>',
  shadow: '<path d="M5 3h24v21H5z"/><path d="M8 6h18v15H8z" opacity=".6"/>',
  dome: '<path d="M8 20V11a9 9 0 0 1 18 0v9"/><path d="M5 20h24v4H5z"/><path d="M11 20c1-2 3-2 4 0M19 20c1-1.5 2.5-1.5 4 0" opacity=".6"/>',
};
let setting = null, settingId = 'stone', rodOn = true, rod = null;
function placeRod() {
  if (rod) { scene.remove(rod); rod.traverse(o => o.geometry?.dispose()); rod = null; }
  if (!rodOn || !setting.floor) return;
  const p = rig.centreOf(SPEC.rodBone);
  rod = buildRod(setting.top, new THREE.Vector3(p.x, p.y - 0.07 * K, p.z), K);
  scene.add(rod);
}
function setSetting(id) {
  settingId = id;
  if (setting) { scene.remove(setting.group); setting.group.traverse(o => { o.geometry?.dispose(); }); }
  stand.position.y = 0; stand.updateMatrixWorld(true);
  const box = rig.bounds();
  const foot = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
  setting = buildSetting(id, { foot, height: box.max.y, k: K });
  scene.add(setting.group);
  stand.position.y = setting.floor ? setting.top : 0.35 * K;
  stand.updateMatrixWorld(true);
  catcher.visible = setting.floor;
  placeRod();
  for (const b of $('settings').children) b.setAttribute('aria-pressed', b.dataset.id === id);
  $('setting-note').textContent = SETTINGS.find(s => s.id === id).note;
  if (sel && mode === 'translate') rig.centreOf(sel, handle.position);
  sheets?.update(rig.bounds(), 0);
}
for (const s of SETTINGS) {
  const b = document.createElement('button');
  b.className = 'setting'; b.type = 'button'; b.dataset.id = s.id;
  b.innerHTML = `<svg viewBox="0 0 34 26" aria-hidden="true">${ICONS[s.id]}</svg>${s.name}`;
  b.addEventListener('click', () => { setSetting(s.id); });
  $('settings').append(b);
}
$('rod').addEventListener('change', e => { rodOn = e.target.checked; placeRod(); });
for (const b of document.querySelectorAll('#lights button')) b.addEventListener('click', () => setLight(b.dataset.light));

// ---------- sheets ----------
let sheets = null;
sheets = createSheets($('sheet-list'), {
  skeleton: rig.root,
  onPick: v => flyTo(new THREE.Vector3(...v.dir).normalize()),
});
$('sheet-foot').textContent = SPEC.caption((restBox.max.y - restBox.min.y).toFixed(2), (restBox.max.z - restBox.min.z).toFixed(2));

let flight = null;
function flyTo(dir) {
  const box = rig.bounds(), mid = box.getCenter(new THREE.Vector3());
  const dist = camera.position.distanceTo(controls.target);
  flight = { t: 0, p0: camera.position.clone(), c0: controls.target.clone(), c1: mid, p1: mid.clone().addScaledVector(dir, Math.max(dist, 9 * K)) };
}

// ---------- picking and the gizmo ----------
let sel = null, mode = 'rotate';
const gizmo = new TransformControls(camera, canvas);
gizmo.setSize(0.8);
scene.add(gizmo.getHelper());
const handle = new THREE.Object3D();      // what the move gizmo drags: the bone's middle
scene.add(handle);
const tint = new THREE.Color('#d9a86c');

function select(name) {
  if (sel) rig.bones[sel].mesh.material.emissive.set(0x000000);
  sel = name;
  if (sel) rig.bones[sel].mesh.material.emissive.copy(tint).multiplyScalar(0.28);
  attach();
  showBone();
}
function attach() {
  gizmo.detach();
  if (!sel) return;
  if (mode === 'rotate') {
    gizmo.setMode('rotate'); gizmo.setSpace('local');
    gizmo.attach(rig.bones[sel].joint);
  } else {
    gizmo.setMode('translate'); gizmo.setSpace('world');
    rig.centreOf(sel, handle.position);
    gizmo.attach(handle);
  }
}
function setMode(m) {
  mode = m;
  for (const b of document.querySelectorAll('#modes button')) b.setAttribute('aria-pressed', b.dataset.mode === m);
  attach();
}
for (const b of document.querySelectorAll('#modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));

let before = null;
gizmo.addEventListener('dragging-changed', e => {
  controls.enabled = !e.value;
  if (e.value) before = rig.pose();
  else { commit(before); before = null; if (mode === 'translate') rig.centreOf(sel, handle.position); }
});
gizmo.addEventListener('objectChange', () => {
  if (mode === 'translate' && sel) rig.reach(sel, handle.position, 12);
  rig.root.updateMatrixWorld(true);
  showNumbers();
});

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || gizmo.dragging) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(meshes, false)[0];
  if (hit) select(hit.object.userData.bone);
  else if (!gizmo.axis) select(null);
});

// ---------- history ----------
const undo = [], redo = [];
function commit(prev) {
  const now = rig.pose();
  if (JSON.stringify(prev) === JSON.stringify(now)) return;
  undo.push(prev); if (undo.length > 200) undo.shift();
  redo.length = 0;
  changed();
}
function changed() {
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  rig.root.updateMatrixWorld(true);
  if (sel && mode === 'translate') rig.centreOf(sel, handle.position);
  showNumbers();
  sheets.update(rig.bounds());
  placeRod();
}
function step(from, to) {
  if (!from.length) return say(from === undo ? 'Nothing to undo' : 'Nothing to redo');
  to.push(rig.pose());
  rig.setPose(from.pop());
  changed();
  say(from === undo ? 'Undone' : 'Redone');
}
$('undo').addEventListener('click', () => step(undo, redo));
$('redo').addEventListener('click', () => step(redo, undo));
$('reset').addEventListener('click', () => { const p = rig.pose(); rig.setPose(rest); commit(p); say('Back to the mounted pose'); });

// ---------- the bench: numbers, nudges, commands ----------
const euler = new THREE.Euler();
function showBone() {
  const el = $('bone-name');
  if (!sel) { el.innerHTML = 'No bone picked<small>click one, or type “select skull”</small>'; showNumbers(); return; }
  const b = rig.bones[sel];
  el.innerHTML = `${b.label}<small>${b.parent ? 'joins the ' + rig.label(b.parent).replace(/^(Left|Right) /, (m) => m.toLowerCase()) : 'carries the whole skeleton'}</small>`;
  showNumbers();
}
function showNumbers() {
  const on = !!sel;
  for (const id of ['rx', 'ry', 'rz']) $(id).disabled = !on;
  if (!on) { for (const id of ['rx', 'ry', 'rz']) $(id).value = ''; return; }
  euler.setFromQuaternion(rig.bones[sel].joint.quaternion, 'XYZ');
  for (const k of ['x', 'y', 'z']) if (document.activeElement !== $('r' + k)) $('r' + k).value = (euler[k] / DEG).toFixed(1).replace(/\.0$/, '').replace(/^-0$/, '0');
}
for (const k of ['x', 'y', 'z']) {
  $('r' + k).addEventListener('change', () => {
    if (!sel) return;
    const prev = rig.pose();
    const v = ['x', 'y', 'z'].map(a => (+$('r' + a).value || 0) * DEG);
    rig.bones[sel].joint.quaternion.setFromEuler(euler.set(...v, 'XYZ'));
    commit(prev);
  });
}
const DIRS = { up: [0, 1, 0], down: [0, -1, 0], forward: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };
function move(name, dir, mm) {
  const prev = rig.pose();
  const target = rig.centreOf(name).addScaledVector(new THREE.Vector3(...DIRS[dir]), mm / 1000);
  const miss = rig.reach(name, target);
  commit(prev);
  return miss;
}
function turn(name, axis, deg) {
  const prev = rig.pose();
  rig.turn(name, axis, deg * DEG);
  commit(prev);
}
for (const b of document.querySelectorAll('#nudges button')) {
  b.addEventListener('click', () => {
    if (!sel) return say('Pick a bone first', true);
    const mm = +$('step').value || 20;
    const miss = move(sel, b.dataset.dir, mm);
    say(miss > 0.005 ? `Moved as far as the joints allow (${(miss * 1000).toFixed(0)} mm short)` : `Moved ${rig.label(sel).toLowerCase()} ${mm} mm ${b.dataset.dir}`);
  });
}

let sayTimer = 0;
function say(text, bad = false) {
  const el = $('say');
  el.textContent = text; el.classList.toggle('is-bad', bad);
  clearTimeout(sayTimer); sayTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

$('cmd').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.target.blur(); return; }
  if (e.key !== 'Enter') return;
  const text = e.target.value.trim();
  if (!text) return;
  const c = parseCommand(text, rig, sel);
  if (c.error) return say(c.error, true);
  if (c.verb === 'undo') return step(undo, redo);
  if (c.verb === 'redo') return step(redo, undo);
  if (c.verb === 'reset') return $('reset').click();
  if (c.bone !== sel) select(c.bone);
  if (c.verb === 'select') say(`Picked ${rig.label(c.bone).toLowerCase()}`);
  if (c.verb === 'move') {
    const miss = move(c.bone, c.dir, c.mm);
    say(miss > 0.005 ? `Moved as far as the joints allow (${(miss * 1000).toFixed(0)} mm short)` : `Moved ${rig.label(c.bone).toLowerCase()} ${c.mm} mm ${c.dir}`);
  }
  if (c.verb === 'rotate') {
    turn(c.bone, c.axis, c.deg);
    say(`Turned ${rig.label(c.bone).toLowerCase()} ${Math.abs(c.deg)}° ${c.deg >= 0 ? 'counterclockwise' : 'clockwise'} about its ${c.axis.toUpperCase()} axis`);
  }
  e.target.value = '';
});

// ---------- saved poses ----------
const storeKey = `taxidermy-poses:${ANIMAL}`;
const readPoses = () => { try { return JSON.parse(localStorage.getItem(storeKey)) || []; } catch { return []; } };
const writePoses = list => { try { localStorage.setItem(storeKey, JSON.stringify(list)); return true; } catch { return false; } };
function listPoses() {
  const poses = readPoses();
  const ul = $('poses'); ul.innerHTML = '';
  $('poses-empty').hidden = poses.length > 0;
  for (const p of poses) {
    const li = document.createElement('li');
    const when = new Date(p.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    li.innerHTML = `<button class="pose__name" type="button" title="Load this pose"></button><button class="x" type="button" aria-label="Delete">×</button>`;
    li.firstChild.textContent = p.name;
    li.firstChild.insertAdjacentHTML('beforeend', `<small>${when}</small>`);
    li.firstChild.addEventListener('click', () => {
      const prev = rig.pose();
      rig.setPose(p.pose);
      if (p.light) setLight(p.light);
      if (p.setting) setSetting(p.setting);
      if (p.camera) { camera.position.fromArray(p.camera.position); controls.target.fromArray(p.camera.target); }
      commit(prev);
      say(`Loaded “${p.name}”`);
    });
    li.lastChild.addEventListener('click', () => {
      if (!confirm(`Delete “${p.name}”?`)) return;
      writePoses(readPoses().filter(x => x.name !== p.name));
      listPoses();
    });
    ul.append(li);
  }
  $('pose-name').placeholder = `Pose ${poses.length + 1}`;
}
$('pose-save').addEventListener('click', () => {
  const poses = readPoses();
  const name = $('pose-name').value.trim() || `Pose ${poses.length + 1}`;
  const p = { name, savedAt: new Date().toISOString(), pose: rig.pose(), setting: settingId, light,
              camera: { position: camera.position.toArray(), target: controls.target.toArray() } };
  const at = poses.findIndex(x => x.name === name);
  at >= 0 ? (poses[at] = p) : poses.push(p);
  say(writePoses(poses) ? `Saved “${name}”` : 'Not saved: this browser won’t store it', !writePoses(poses));
  $('pose-name').value = '';
  listPoses();
});
$('pose-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('pose-save').click(); });
listPoses();

// ---------- export ----------
for (const b of document.querySelectorAll('[data-export]')) {
  b.addEventListener('click', async () => {
    b.disabled = true; say(`Building the ${b.dataset.export.toUpperCase()}…`);
    await new Promise(r => setTimeout(r, 30));
    try {
      const { blob, name } = await exportSkeleton(b.dataset.export, rig, stand, `${ANIMAL}-skeleton`);
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      say(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      console.error(err); say(`Export failed: ${err.message}`, true);
    }
    b.disabled = false;
  });
}

// ---------- keys ----------
addEventListener('keydown', e => {
  if (e.target.matches?.('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.shiftKey ? step(redo, undo) : step(undo, redo); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (k === 'r') setMode('rotate');
  else if (k === 'g') setMode('translate');
  else if (k === 'escape') select(null);
  else if (k === '/') { e.preventDefault(); $('cmd').focus(); }
});

// ---------- go ----------
setLight('gallery');
setSetting('stone');
showBone();
window.__rig = rig; window.__view = { camera, controls };   // for poking at it from the console

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / 0.9);
    const s = flight.t * flight.t * (3 - 2 * flight.t);
    camera.position.lerpVectors(flight.p0, flight.p1, s);
    controls.target.lerpVectors(flight.c0, flight.c1, s);
    if (flight.t >= 1) flight = null;
  }
  controls.update();
  const mid = controls.target;
  key.target.position.copy(mid);
  key.position.copy(mid).add(new THREE.Vector3(...LIGHTS[light].key[2]).multiplyScalar(1.4));
  renderer.render(scene, camera);
});
window.__ready = 1;
