/* Xmastreemagochi: pick a fir at the Troop 31 lot, bring it home, keep it alive to January 1. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { clock, sunTimes, fireIsLit, seasonEnd, timeLabel, dateLabel, localMidnight, lotHours, localParts } from './sun.js';
import { SPECIES, lotStock, inspect as inspectFacts, heightM } from './species.js';
import { buildTree } from './tree.js';
import { buildLot } from './lot.js';
import { buildRoom, ROOM } from './room.js';
import { buildStand, buildSkirt, skirtHeight, skirtSwatch } from './decor.js';
import { STANDS, SKIRTS, STRANDS, LIGHT_MODES } from './decor-data.js';
import { StrandSet, spiralPoints, swagRows, dropPoints, tuck, strandLength } from './lights.js';
import { ORNAMENTS, ORN, buildOrnament } from './ornaments.js';
import { FallingNeedles, FloorNeedles } from './needles.js';
import { advance, thirstLabel, hoursToDry, NEEDLES_PER_DRAWN, TOTAL_NEEDLES } from './sim.js';
import { Cat } from './cat.js';
import { store } from './store.js';
import { uid, clamp, lerp, tween, easeInOut, rng, disposeTree } from './util.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Renderer ---------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 1.05);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

/* ---------- UI helpers ---------- */
function toast(text, kind = '', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast m-toast ${kind}`;
  el.textContent = text;
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
  setTimeout(() => el.remove(), ms);
}
function hint(text) { const h = $('#hint'); h.hidden = !text; h.textContent = text || ''; }
async function fadeThrough(text, mid) {
  const f = $('#fade');
  $('#fadeText').textContent = text;
  f.classList.add('on');
  await new Promise(r => setTimeout(r, 650));
  await mid();
  await new Promise(r => setTimeout(r, 900));
  f.classList.remove('on');
}
function flyTo(pos, target, ms = 1100) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  return tween(ms, k => { camera.position.lerpVectors(p0, pos, k); controls.target.lerpVectors(t0, target, k); });
}

/* ---------- Game state ---------- */
let game = null;
let mode = 'none';           // 'lot' | 'room'
let lot = null, room = null;
const view = {
  tool: 'look', inspect: null, close: false,
  lights: { type: 'miniwarm', method: 'spiral', turns: 7, depth: 0.86, from: 0.06, to: 0.95, dir: 1, rows: 4, swags: 7, drops: 10, draw: [] },
  orn: { id: 'ball', c: 0, mode: 'hang', group: 'Classics' },
  setupStep: 0,
};
const activeTree = () => game?.trees.find(t => t.id === game.activeTreeId);
const save = (now = false) => game && store.save(game, now);
store.onError = msg => toast(msg);

function newGame() { return { v: 1, seasonStart: clock.now(), activeTreeId: null, trees: [] }; }
const treeName = t => `${SPECIES[t.spec.species].name} #${t.spec.tag}`;

function seasonOver() { return game && clock.now() >= seasonEnd(game.seasonStart); }
function showEnded() {
  mode = 'ended';
  for (const id of ['#welcome', '#status', '#tools', '#side', '#hint']) $(id).hidden = true;
  $('#ended').hidden = false;
  document.querySelector('.top').hidden = true;
}

/* ---------- Welcome and accounts ---------- */
let authKind = 'login';
document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => {
  authKind = b.dataset.auth;
  document.querySelectorAll('[data-auth]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $('#authSubmit').textContent = authKind === 'login' ? 'Sign in' : 'Create account';
  $('#authForm').password.autocomplete = authKind === 'login' ? 'current-password' : 'new-password';
  $('#authError').textContent = '';
}));
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  $('#authSubmit').disabled = true;
  const err = await store.auth(authKind, f.username.value, f.password.value);
  $('#authSubmit').disabled = false;
  if (err) { $('#authError').textContent = err; return; }
  f.password.value = '';
  let state = await store.load().catch(err => { toast(err.message); return null; });
  const guest = store.loadGuest();
  if (game && game.trees.length && (!state || !state.trees?.length)) {
    state = game;                      // a guest who just signed in keeps their trees
    store.clearGuest();
  } else if (!state && guest?.trees?.length) {
    state = guest;
    store.clearGuest();
    toast('Moved the trees from this browser into your account.');
  } else if (game && game.trees.length && state?.trees?.length && game !== state) {
    toast('Your account already had trees, so those are loaded. Trees from this browser are still here when you play as a guest.', '', 7000);
  }
  begin(state);
});
$('#guestBtn').addEventListener('click', () => { store.guest(); begin(store.loadGuest()); });
$('#accountBtn').addEventListener('click', async () => {
  if (store.mode === 'account') {
    if (!confirm(`Sign out of ${store.user}?`)) return;
    await store.logout();
    location.reload();
  } else {
    $('#welcome').hidden = false;
    $('#guestBtn').textContent = 'Keep playing as a guest';
  }
});
function accountChip() {
  const b = $('#accountBtn');
  b.hidden = false;
  b.textContent = store.mode === 'account' ? `Signed in as ${store.user}` : (store.accounts ? 'Guest · save to an account' : 'Saved in this browser');
  b.disabled = !store.accounts && store.mode !== 'account';
}

function begin(state) {
  $('#welcome').hidden = true;
  game = state && Array.isArray(state.trees) ? state : newGame();
  if (!game.seasonStart) game.seasonStart = clock.now();
  accountChip();
  if (seasonOver()) return showEnded();
  const now = clock.now();
  for (const t of game.trees) advance(t, now);
  save();
  if (!game.trees.length) goLot(true);
  else goRoom();
}

/* ---------- The lot ---------- */
let lotDay = null;
function ensureLot() {
  const day = Math.floor(localMidnight(clock.now()) / 86400000);
  if (lot && lotDay === day) return;
  if (lot) disposeTree(lot.scene);
  lotDay = day;
  const owned = new Set(game.trees.map(t => t.spec.seed));
  lot = buildLot(lotStock(day).filter(s => !owned.has(s.seed)));
  lot.scene.environment = envTex;
  lot.scene.environmentIntensity = 0.25;
  lot.falling = new FallingNeedles(lot.scene, 500);
}

function goLot(first = false) {
  leaveRoom();
  ensureLot();
  mode = 'lot';
  renderPass.scene = lot.scene;
  lot.setTime(clock.now());
  camera.fov = 50; camera.updateProjectionMatrix();
  camera.position.set(1.5, 1.75, 10.5);
  controls.target.set(0, 1.1, 0);
  controls.minDistance = 1.2; controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enabled = true; controls.enableRotate = true;
  for (const id of ['#status', '#tools', '#side']) $(id).hidden = true;
  hint('Drag to look around. Click a tree to look it over.');
  const [o, c] = lotHours(clock.now());
  if (!lot.state.open) toast(`The lot is closed right now (open ${fmtHour(o)} to ${fmtHour(c)} today). The scouts left the gate open, so have a look.`, '', 7000);
  else if (first) toast('Welcome to the Troop 31 lot. Fraser, balsam and Douglas firs, fresh off the truck.');
}
const fmtHour = h => (h === 12 ? 'noon' : h > 12 ? `${h - 12} p.m.` : `${h} a.m.`);

function lotPick(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hulls = lot.specimens.map(s => (s.geo || s.tree).hull);
  const hit = raycaster.intersectObjects(hulls, false)[0];
  return hit ? lot.specimens.find(s => (s.geo || s.tree).hull === hit.object) : null;
}

async function inspectTree(item) {
  if (view.inspect && view.inspect !== item) closeInspect(false);
  view.inspect = item;
  view.tested = {};
  if (!item.geo) {
    // swap in real needles for the close look
    item.geo = buildTree(item.spec, { lod: 'geo', layout: item.tree.layout });
    item.geo.group.position.copy(item.tree.group.position);
    item.geo.group.rotation.copy(item.tree.group.rotation);
    const tag = item.tree.sway.children.find(c => c.geometry?.type === 'PlaneGeometry');
    if (tag) item.geo.sway.add(tag);
    item.holder.remove(item.tree.group);
    item.holder.add(item.geo.group);
    item.geo.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  const H = heightM(item.spec);
  const c = item.holder.position.clone().add(new THREE.Vector3(0, H * 0.5, 0));
  const dir = camera.position.clone().sub(c).setY(0).normalize();
  hint('Drag to walk around it. Scroll to step closer.');
  controls.minDistance = 0.08;
  renderInspect();
  await flyTo(c.clone().addScaledVector(dir, H * 0.9 + 1.2).add(new THREE.Vector3(0, 0.25, 0)), c);
}

function closeInspect(fly = true) {
  const item = view.inspect;
  if (!item) return;
  view.inspect = null;
  view.close = false;
  const tag = item.geo.sway.children.find(c => c.geometry?.type === 'PlaneGeometry');
  if (tag) item.tree.sway.add(tag);
  item.holder.remove(item.geo.group);
  item.geo.dispose();
  item.geo = null;
  item.holder.add(item.tree.group);
  $('#side').hidden = true;
  hint('Drag to look around. Click a tree to look it over.');
  controls.minDistance = 1.2;
  if (fly) flyTo(new THREE.Vector3(camera.position.x, 1.75, camera.position.z).lerp(new THREE.Vector3(1.5, 1.75, 10.5), 0.6), new THREE.Vector3(0, 1.1, 0));
}

const TESTS = {
  'Bend a needle': 'Bend one',
  'Shake test': 'Shake it',
  'Lift it': 'Lift and drop',
  'The cut': 'Check the stump',
  'Smell': 'Crush a needle',
};
function renderInspect() {
  const item = view.inspect;
  const s = item.spec, S = SPECIES[s.species];
  const facts = inspectFacts(s);
  const side = $('#side');
  side.hidden = false;
  side.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div><h3>${S.name}</h3><div class="faint" style="font-style:italic">${S.latin} · tag #${s.tag}</div></div>
      <div class="price">$${s.price}</div>
    </div>
    <div class="scroll">
      <p class="muted">${S.origin}</p>
      <div class="facts">
        ${facts.map(([k, v]) => {
          const test = TESTS[k];
          const done = view.tested[k];
          return `<div class="fact ${done ? 'hot' : ''}"><b>${k}</b>${test && !done ? `<button class="btn small m-key" data-test="${k}">${test}</button>` : `<span>${done || v}</span>`}</div>`;
        }).join('')}
      </div>
      <div class="row">
        <button class="btn small m-key" data-act="close">${view.close ? 'Step back' : 'Look closely at the needles'}</button>
        <button class="btn small m-key" data-act="spin">Turn it around</button>
      </div>
    </div>
    <button class="btn primary m-key m-key--lg m-key--primary" data-act="buy">Take it home · $${s.price}</button>
    <button class="btn m-key" data-act="back">Back to the lot</button>`;
}

function testTree(name) {
  const item = view.inspect;
  const t = item.geo, s = item.spec, f = s.freshness;
  let result = inspectFacts(s).find(([k]) => k === name)[1];
  if (name === 'Shake test') {
    t.shake(1.6);
    const n = Math.round(6 + (1 - f) * 170);
    dropNeedles(t, n, f);
    result = f > 0.82 ? `A few brown needles from the inside fell out. That's normal: a fresh tree.`
      : f > 0.65 ? `A light shower, a few green ones from the tips. Fair.`
      : `Green needles rained off the branch tips. This one's been out of water a while.`;
  }
  if (name === 'Lift it') {
    t.bounce();
    setTimeout(() => dropNeedles(t, Math.round(4 + (1 - f) * 80), f), 480);
  }
  view.tested[name] = result;
  renderInspect();
}

function dropNeedles(t, n, freshness) {
  const r = Math.random;
  for (let i = 0; i < n; i++) {
    const p = t.sway.localToWorld(t.randomNeedlePoint(r));
    const green = r() > 0.15 + freshness * 0.7;
    const c = green ? new THREE.Color().setHSL(0.3 + r() * 0.05, 0.45, 0.16 + r() * 0.06) : new THREE.Color().setHSL(0.08, 0.5, 0.22 + r() * 0.1);
    setTimeout(() => lot?.falling.spawn(p, c), r() * 500);
  }
}

async function lookClose() {
  const item = view.inspect;
  const t = item.geo, L = t.layout;
  if (view.close) {
    view.close = false;
    renderInspect();
    const H = heightM(item.spec);
    const c = item.holder.position.clone().add(new THREE.Vector3(0, H * 0.5, 0));
    const dir = camera.position.clone().sub(c).setY(0).normalize();
    return flyTo(c.clone().addScaledVector(dir, H * 0.9 + 1.2).add(new THREE.Vector3(0, 0.25, 0)), c);
  }
  // the branch tip at chest height that faces us
  const toCam = camera.position.clone().sub(item.holder.position).setY(0).normalize();
  let best = null, bestScore = -9;
  t.group.updateMatrixWorld(true);
  for (const h of L.hang) {
    if (h.p.y < 0.8 || h.p.y > 1.5) continue;
    const wp = t.sway.localToWorld(h.p.clone());
    const out = wp.clone().sub(item.holder.position).setY(0).normalize();
    const score = out.dot(toCam);
    if (score > bestScore) { bestScore = score; best = wp; }
  }
  if (!best) return;
  view.close = true;
  view.tested['Needle color'] = SPECIES[item.spec.species].needleNote + (item.spec.freshness < 0.64 ? ' Up close, some tips have gone dull and olive.' : ' Up close the color is deep and even.');
  renderInspect();
  const out = best.clone().sub(item.holder.position).setY(0).normalize();
  await flyTo(best.clone().addScaledVector(out, 0.4).add(new THREE.Vector3(0, 0.1, 0)), best.clone().addScaledVector(out, 0.02), 1300);
}

async function buy(item) {
  const s = item.spec;
  const now = clock.now();
  const t = {
    id: uid(), spec: { ...s }, boughtAt: now, standId: null, skirtId: 'none', turn: 0,
    water: 0, hydration: s.freshness, lost: 0, onFloor: 0, carry: 0, lastSim: now,
    strands: [], ornaments: [], topper: null, lights: { on: true, mode: 'steady' },
    setupDone: false, stats: { cats: 0, saves: 0, broken: 0 },
  };
  game.trees.push(t);
  game.activeTreeId = t.id;
  save(true);
  await fadeThrough('The scouts put a fresh cut on the trunk, run it through the baler and tie it to your roof…', async () => {
    closeInspect(false);
    lot.specimens = lot.specimens.filter(x => x !== item);
    lot.scene.remove(item.holder);
    goRoom();
  });
}

/* ---------- The room ---------- */
const R = { base: null, holder: null, tree: null, stand: null, skirt: null, floor: null, strands: null, preview: null, orn: null, ghost: null, can: null, broom: null, falling: null, pendingDrops: 0, wrappers: [], fallingOrn: [] };

function ensureRoom() {
  if (room) return;
  room = buildRoom();
  room.scene.environment = envTex;
  room.scene.environmentIntensity = 0.3;
  R.falling = new FallingNeedles(room.scene, 600);
  R.shards = new FallingNeedles(room.scene, 300);
  R.shards.mesh.material = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.1 });
  R.can = wateringCan(); R.can.visible = false; room.scene.add(R.can);
  R.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1, 8), new THREE.MeshStandardMaterial({ color: 0x9fd0f0, transparent: true, opacity: 0.55, roughness: 0.05 }));
  R.stream.visible = false; room.scene.add(R.stream);
  R.broom = broom(); R.broom.visible = false; room.scene.add(R.broom);
}

function leaveRoom() {
  if (cat) { cat.done(); cat = null; }
}

function goRoom() {
  ensureRoom();
  mode = 'room';
  renderPass.scene = room.scene;
  mountTree();
  room.setTime(clock.now());
  camera.fov = 50; camera.updateProjectionMatrix();
  camera.position.set(0.95, 1.55, 1.65);
  controls.target.set(-1.45, 1.05, -1.45);
  controls.minDistance = 0.3; controls.maxDistance = 4.6;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.enabled = true; controls.enableRotate = true;
  $('#status').hidden = false;
  $('#tools').hidden = false;
  hint('');
  const t = activeTree();
  scheduleCat();
  if (!t.setupDone) setTool('setup');
  else setTool(view.tool === 'setup' ? 'look' : view.tool);
  updateStatus();
}

function mountTree() {
  const t = activeTree();
  const scene = room.scene;
  if (R.base) { scene.remove(R.base); disposeTree(R.base); }
  if (R.tree) { R.tree.dispose(); }
  R.wrappers = [];
  R.base = new THREE.Group();
  R.base.position.copy(ROOM.tree);
  scene.add(R.base);
  R.stand = t.standId ? buildStand(t.standId) : null;
  if (R.stand) R.base.add(R.stand.group);
  R.skirt = R.stand ? buildSkirt(t.skirtId, R.stand) : null;
  if (R.skirt) R.base.add(R.skirt);
  R.floor = new FloorNeedles(R.base, heightAt);
  R.floor.setCount(Math.round(t.onFloor / NEEDLES_PER_DRAWN), 0.42, 1 - t.hydration);
  R.holder = new THREE.Group();
  R.holder.position.y = R.stand ? R.stand.mount - 0.12 : 0;
  R.holder.rotation.y = t.turn;
  R.base.add(R.holder);
  R.tree = buildTree(t.spec, { lod: 'geo' });
  R.tree.group.rotation.z = (t.spec.lean * 0.6 * Math.PI) / 180;
  if (!R.stand) R.tree.group.rotation.z += 0.12;   // leaning in the corner until it has a stand
  R.holder.add(R.tree.group);
  R.strands = new StrandSet(R.tree.sway);
  R.strands.set(t.strands, R.tree.layout);
  R.strands.on = t.lights.on; R.strands.mode = t.lights.mode;
  R.preview = new StrandSet(R.tree.sway);
  R.orn = new THREE.Group();
  R.tree.sway.add(R.orn);
  rebuildOrnaments();
  R.pendingDrops = 0;
  applyTreeLook();
}

function heightAt(x, z) {
  const t = activeTree();
  const d = Math.hypot(x, z);
  if (R.stand && R.skirt && R.skirt.visible) return skirtHeight(d, R.stand.top, R.stand.outer);
  if (R.stand && d < R.stand.outer * 0.8) return R.stand.top * 0.6;
  return 0;
}

function applyTreeLook() {
  const t = activeTree();
  if (!t || !R.tree) return;
  R.tree.setDryness(clamp((0.86 - t.hydration) / 0.6));
  R.tree.setThinning(t.lost / TOTAL_NEEDLES);
  if (R.stand) R.stand.setLevel(t.water / STANDS[t.standId].capacity);
}

function rebuildOrnaments() {
  const t = activeTree();
  R.orn.clear();
  R.wrappers = [];
  const L = R.tree.layout;
  t.ornaments.forEach((o, i) => {
    const h = L.hang[o.hp];
    if (!h || !ORN[o.id]) return;
    R.orn.add(makeWrapper(o, h, i));
  });
  if (t.topper && ORN[t.topper.id]) {
    const w = new THREE.Group();
    w.position.set(0, L.H - 0.06, 0);
    w.add(buildOrnament(t.topper.id, t.topper.c));
    w.userData = { topper: true, id: t.topper.id, phase: 0 };
    R.orn.add(w);
    R.wrappers.push(w);
  }
}
function makeWrapper(o, h, i) {
  const w = new THREE.Group();
  w.position.copy(h.p);
  const m = buildOrnament(o.id, o.c);
  if (ORN[o.id].perch) {
    m.position.y = 0.006;
    m.rotation.y = Math.atan2(-h.out.z, h.out.x);
  } else {
    const len = 0.025 + (o.hp % 5) * 0.006;
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, len, 3), hookMat);
    hook.position.y = -len / 2;
    w.add(hook);
    m.position.y = -len;
    m.rotation.y = (o.hp * 2.39) % (Math.PI * 2);
  }
  w.add(m);
  w.userData = { index: i, id: o.id, phase: (o.hp * 1.7) % 6.28 };
  R.wrappers.push(w);
  return w;
}
const hookMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 1, roughness: 0.3 });

/* ---------- Tools ---------- */
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
function setTool(tool) {
  if (mode !== 'room') return;
  const t = activeTree();
  if (!t.setupDone && tool !== 'setup' && tool !== 'trees') { toast('Set the tree in a stand first.'); tool = 'setup'; }
  view.tool = tool;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  controls.enableRotate = !['water', 'sweep'].includes(tool);
  if (R.skirt) R.skirt.visible = tool !== 'water';
  if (R.floor) R.floor.reseat();
  R.can.visible = tool === 'water';
  R.broom.visible = false;
  R.preview.clear();
  view.lights.draw = [];
  clearGhost();
  document.body.dataset.cursor = tool === 'water' ? 'pour' : tool === 'sweep' ? 'sweep' : '';
  const side = $('#side');
  side.hidden = tool === 'look';
  hint({
    look: 'Drag to look around. Scroll to get closer.',
    water: 'Press and hold to pour. Watch the level: it can overflow.',
    sweep: 'Drag across the floor to sweep up needles. Right-drag or switch to Look to move.',
    lights: '', ornaments: '', setup: '', trees: '',
  }[tool]);
  renderSide();
  if (tool === 'lights') updatePreview();
}

function renderSide() {
  const side = $('#side');
  const t = activeTree();
  const tool = view.tool;
  if (tool === 'look') return;
  if (tool === 'setup') {
    const step = view.setupStep;
    side.innerHTML = `
      <h3>${t.setupDone ? 'Stand and skirt' : 'Set up your tree'}</h3>
      <div class="steps">${[0, 1, 2].map(i => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
      <div class="seg m-seg m-seg--fill">${['Stand', 'Skirt', 'Turn'].map((n, i) => `<button data-step="${i}" aria-pressed="${i === step}">${n}</button>`).join('')}</div>
      <div class="scroll">
        ${step === 0 ? `<p class="muted">Pick a stand. Bigger wells mean fewer trips with the watering can.</p>
          <div class="options">${Object.entries(STANDS).map(([id, s]) => `<button class="opt m-menu__item m-menu__item--plain" data-stand="${id}" aria-pressed="${t.standId === id}"><span>${s.name}</span><small>${s.note}</small></button>`).join('')}</div>` : ''}
        ${step === 1 ? `<p class="muted">A skirt hides the stand and catches needles.</p>
          <div class="swatches">${SKIRTS.map(s => `<button class="swatch ${s.id === 'none' ? 'none' : ''}" data-skirt="${s.id}" aria-pressed="${t.skirtId === s.id}" style="${s.id !== 'none' ? `background-image:url(${swatch(s.id)})` : ''}"><span>${s.name}</span></button>`).join('')}</div>` : ''}
        ${step === 2 ? `<p class="muted">Every tree has a good side. ${t.spec.bare > 0.3 ? 'This one is thin on one side: turn that to the wall.' : 'This one is fairly even.'}</p>
          <label class="slider"><span class="top-line"><span class="m-legend">Turn the tree</span><span class="m-value">${Math.round(((t.turn * 180) / Math.PI + 360) % 360)}°</span></span><input class="m-fader" type="range" min="0" max="360" step="1" value="${Math.round(((t.turn * 180) / Math.PI + 360) % 360)}" data-turn></label>
          ${t.spec.bare > 0.3 ? '<button class="btn small m-key" data-act="bareToWall">Thin side to the corner</button>' : ''}` : ''}
      </div>
      <div class="row">
        ${step > 0 ? '<button class="btn m-key" data-step="' + (step - 1) + '">Back</button>' : ''}
        ${step < 2 ? `<button class="btn primary m-key m-key--lg m-key--primary" data-step="${step + 1}" ${!t.standId ? 'disabled' : ''}>Next</button>` : '<button class="btn primary m-key m-key--lg m-key--primary" data-act="setupDone">Done</button>'}
      </div>`;
  } else if (tool === 'water') {
    const cap = STANDS[t.standId].capacity;
    side.innerHTML = `<h3>Water</h3>
      <div class="scroll">
        <p class="muted">The skirt is folded back so you can see the well. Hold the pointer down anywhere to pour.</p>
        <div class="fact"><b>${STANDS[t.standId].name}</b><span id="wellText">${(t.water * 0.264).toFixed(2)} of ${(cap * 0.264).toFixed(2)} gallons</span></div>
        <p class="faint">Rule of thumb: a cut tree drinks about a quart a day for every inch of trunk, and more in the first few days. If the well runs dry, the needles start to go.</p>
      </div>`;
  } else if (tool === 'sweep') {
    side.innerHTML = `<h3>Sweep</h3><div class="scroll"><p class="muted">Drag the brush across the floor and the skirt.</p>
      <div class="fact"><b>On the floor</b><span id="floorCount">${R.floor.count.toLocaleString()} needles</span></div>
      <p class="faint">A watered tree sheds a little every day. A thirsty one sheds a lot.</p></div>`;
  } else if (tool === 'lights') renderLights();
  else if (tool === 'ornaments') renderOrnaments();
  else if (tool === 'trees') renderTrees();
}
const swatchCache = {};
const swatch = id => (swatchCache[id] ||= skirtSwatch(id));

function renderLights() {
  const t = activeTree(), V = view.lights, T = STRANDS[V.type];
  const len = previewLength();
  const sliders = {
    spiral: [['turns', 'Turns', 3, 14, 1], ['depth', 'Tuck into branches', 0.6, 1.02, 0.02], ['from', 'Bottom', 0, 0.5, 0.02], ['to', 'Top', 0.5, 1, 0.02]],
    swags: [['rows', 'Rows', 1, 7, 1], ['swags', 'Swags per row', 4, 12, 1], ['depth', 'Tuck into branches', 0.8, 1.05, 0.02]],
    drops: [['drops', 'Drops', 6, 18, 2], ['depth', 'Tuck into branches', 0.7, 1.02, 0.02]],
    draw: [['depth', 'Tuck into branches', 0.6, 1.02, 0.02]],
  }[V.method];
  $('#side').innerHTML = `<h3>Lights and garland</h3>
    <div class="scroll">
      <div class="options">${Object.entries(STRANDS).map(([id, s]) => `<button class="opt m-menu__item m-menu__item--plain" data-strand="${id}" aria-pressed="${V.type === id}"><span>${s.name}</span><small>${s.note}</small></button>`).join('')}</div>
      <div class="label m-legend">How to hang it</div>
      <div class="seg m-seg m-seg--fill">${[['spiral', 'Wrap'], ['swags', 'Swags'], ['drops', 'Drops'], ['draw', 'Hand-place']].map(([id, n]) => `<button data-method="${id}" aria-pressed="${V.method === id}">${n}</button>`).join('')}</div>
      ${V.method === 'draw' ? `<p class="muted">Click points on the tree to run the strand through the branches. ${V.draw.length} points so far.</p>` : ''}
      ${V.method === 'spiral' ? `<div class="seg m-seg m-seg--fill"><button data-dir="1" aria-pressed="${V.dir === 1}">Clockwise</button><button data-dir="-1" aria-pressed="${V.dir === -1}">Counter-clockwise</button></div>` : ''}
      ${sliders.map(([k, n, a, b, s]) => `<label class="slider"><span class="top-line"><span class="m-legend">${n}</span><span class="m-value">${V[k]}</span></span><input class="m-fader" type="range" min="${a}" max="${b}" step="${s}" value="${V[k]}" data-lp="${k}"></label>`).join('')}
      <p class="faint">${len.toFixed(1)} m of ${T.kind === 'garland' ? 'garland' : 'wire'}: about ${Math.max(1, Math.ceil(len / T.length))} strand${Math.ceil(len / T.length) > 1 ? 's' : ''} of ${T.length} m.</p>
      <div class="row">
        <button class="btn primary m-key m-key--lg m-key--primary" data-act="addStrand">${V.method === 'draw' ? 'Finish strand' : 'Hang it'}</button>
        <button class="btn m-key" data-act="undoStrand" ${t.strands.length ? '' : 'disabled'}>Take down last</button>
        <button class="btn m-key" data-act="clearStrands" ${t.strands.length ? '' : 'disabled'}>Take down all</button>
      </div>
      <div class="divider"></div>
      <div class="row"><button class="btn m-key" data-act="lightsOn" aria-pressed="${t.lights.on}">${t.lights.on ? 'Lights on' : 'Lights off'}</button></div>
      <div class="seg m-seg m-seg--fill">${LIGHT_MODES.map(m => `<button data-lmode="${m.id}" aria-pressed="${t.lights.mode === m.id}">${m.name}</button>`).join('')}</div>
      <p class="faint">${R.strands.bulbCount.toLocaleString()} bulbs on the tree.</p>
    </div>`;
}

function previewStrands() {
  const V = view.lights, L = R.tree.layout;
  if (V.method === 'spiral') return [spiralPoints(L, V)];
  if (V.method === 'swags') return swagRows(L, V);
  if (V.method === 'drops') return dropPoints(L, V);
  return V.draw.length > 1 ? [V.draw] : [];
}
function previewLength() { return previewStrands().reduce((s, p) => s + strandLength(p), 0); }
function updatePreview() {
  if (view.tool !== 'lights') return;
  R.preview.set(previewStrands().map(points => ({ type: view.lights.type, points })), R.tree.layout);
  R.preview.on = true;
}

function renderOrnaments() {
  const V = view.orn;
  const groups = [...new Set(ORNAMENTS.map(o => o.group))];
  const o = ORN[V.id];
  const thumbs = getThumbs();
  $('#side').innerHTML = `<h3>Ornaments</h3>
    <div class="seg m-seg m-seg--fill"><button data-omode="hang" aria-pressed="${V.mode === 'hang'}">Hang</button><button data-omode="remove" aria-pressed="${V.mode === 'remove'}">Take off</button></div>
    <div class="scroll">
      ${groups.map(g => `<div class="label m-legend">${g}</div><div class="orn-grid">${ORNAMENTS.filter(x => x.group === g).map(x => `<button class="orn" title="${esc(x.name)}" data-orn="${x.id}" aria-pressed="${V.id === x.id}" style="background-image:url(${thumbs[x.id]})"></button>`).join('')}</div>`).join('')}
    </div>
    <div class="fact"><b>${o.name}${o.fragile ? ' · glass' : ''}</b><span>${o.note}</span>
      ${o.colors ? `<div class="colors" style="margin-top:6px">${o.colors.map((c, i) => `<button class="color m-dot" data-ocolor="${i}" aria-pressed="${V.c === i}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="Color ${i + 1}"></button>`).join('')}</div>` : ''}
    </div>
    <p class="faint">${o.topper ? 'Click the top of the tree to set it.' : 'Click a branch to hang it.'} ${activeTree().ornaments.length} on the tree.</p>
    <button class="btn m-key" data-act="clearOrnaments" ${activeTree().ornaments.length || activeTree().topper ? '' : 'disabled'}>Take everything off</button>`;
}

function renderTrees() {
  const now = clock.now();
  $('#side').innerHTML = `<h3>Your trees</h3>
    <div class="scroll"><div class="options">
      ${game.trees.map(t => `<button class="opt tree-item m-menu__item m-menu__item--plain" data-tree="${t.id}" aria-pressed="${t.id === game.activeTreeId}">
        <span>${treeName(t)}</span><span class="faint">${t.spec.heightFt} ft</span>
        <small>${t.standId ? thirstLabel(t) : 'Not set up yet'}</small><small>${t.ornaments.length} ornaments</small>
      </button>`).join('')}
    </div>
    <p class="faint">Each tree lives in its own corner by the window. They all drink, whether you're looking or not.</p></div>
    <button class="btn primary m-key m-key--lg m-key--primary" data-act="toLot">Buy another tree at the lot</button>`;
}

/* side panel events */
$('#side').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const t = activeTree();
  const d = b.dataset;
  if (mode === 'lot') {
    if (d.test) return testTree(d.test);
    if (d.act === 'close') return lookClose();
    if (d.act === 'spin') { const h = view.inspect.holder; const r0 = h.rotation.y; return tween(1600, k => { h.rotation.y = r0 + k * Math.PI; }); }
    if (d.act === 'buy') return buy(view.inspect);
    if (d.act === 'back') return closeInspect();
    return;
  }
  if (d.step != null) { view.setupStep = +d.step; return renderSide(); }
  if (d.stand) {
    t.standId = d.stand;
    t.water = Math.min(t.water, STANDS[d.stand].capacity);
    mountTree(); save(); return renderSide();
  }
  if (d.skirt) { t.skirtId = d.skirt; mountTree(); save(); return renderSide(); }
  if (d.act === 'bareToWall') {
    t.turn = t.spec.bareAngle + Math.PI * 0.75;
    R.holder.rotation.y = t.turn; save(); return renderSide();
  }
  if (d.act === 'setupDone') {
    t.setupDone = true; save();
    setTool('water');
    toast(t.water < 0.5 ? 'The stand is dry. Fill it now: a fresh cut drinks a lot in its first few days.' : 'All set.');
    return;
  }
  if (d.strand) { view.lights.type = d.strand; updatePreview(); return renderLights(); }
  if (d.method) { view.lights.method = d.method; view.lights.draw = []; updatePreview(); return renderLights(); }
  if (d.dir) { view.lights.dir = +d.dir; updatePreview(); return renderLights(); }
  if (d.act === 'addStrand') {
    const list = previewStrands();
    if (!list.length) return toast('Click a few points on the tree first.');
    for (const points of list) t.strands.push({ type: view.lights.type, points });
    view.lights.draw = [];
    R.strands.set(t.strands, R.tree.layout);
    updatePreview(); save(); return renderLights();
  }
  if (d.act === 'undoStrand') { t.strands.pop(); R.strands.set(t.strands, R.tree.layout); save(); return renderLights(); }
  if (d.act === 'clearStrands') { t.strands = []; R.strands.set([], R.tree.layout); save(); return renderLights(); }
  if (d.act === 'lightsOn') { t.lights.on = !t.lights.on; R.strands.on = t.lights.on; save(); return renderLights(); }
  if (d.lmode) { t.lights.mode = d.lmode; R.strands.mode = d.lmode; save(); return renderLights(); }
  if (d.omode) { view.orn.mode = d.omode; clearGhost(); return renderOrnaments(); }
  if (d.orn) { view.orn.id = d.orn; view.orn.c = 0; clearGhost(); return renderOrnaments(); }
  if (d.ocolor != null) { view.orn.c = +d.ocolor; clearGhost(); return renderOrnaments(); }
  if (d.act === 'clearOrnaments') {
    if (!confirm('Take every ornament off the tree?')) return;
    t.ornaments = []; t.topper = null; rebuildOrnaments(); save(); return renderOrnaments();
  }
  if (d.tree) {
    if (d.tree === game.activeTreeId) return;
    game.activeTreeId = d.tree; save();
    mountTree(); updateStatus();
    if (!activeTree().setupDone) { view.setupStep = 0; setTool('setup'); } else renderTrees();
    return;
  }
  if (d.act === 'toLot') return fadeThrough('Driving over to East Avenue…', async () => goLot());
});
$('#side').addEventListener('input', e => {
  const el = e.target;
  const t = activeTree();
  if (el.dataset.turn != null) {
    t.turn = (+el.value * Math.PI) / 180;
    R.holder.rotation.y = t.turn;
    el.closest('.slider').querySelector('.top-line span:last-child').textContent = `${el.value}°`;
    save();
  }
  if (el.dataset.lp) {
    view.lights[el.dataset.lp] = +el.value;
    el.closest('.slider').querySelector('.top-line span:last-child').textContent = el.value;
    updatePreview();
    const p = $('#side .faint');
    if (p) { const T = STRANDS[view.lights.type], len = previewLength(); p.textContent = `${len.toFixed(1)} m of ${T.kind === 'garland' ? 'garland' : 'wire'}: about ${Math.max(1, Math.ceil(len / T.length))} strand${Math.ceil(len / T.length) > 1 ? 's' : ''} of ${T.length} m.`; }
  }
});

/* ---------- Ornament thumbnails ---------- */
let thumbs = null;
function getThumbs() {
  if (thumbs) return thumbs;
  thumbs = {};
  const size = 112;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  s.add(new THREE.HemisphereLight(0xffffff, 0x443322, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(1, 2, 3); s.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.001, 10);
  for (const o of ORNAMENTS) {
    const m = buildOrnament(o.id, 0);
    s.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).length();
    cam.position.copy(c).add(new THREE.Vector3(0.25, 0.15, 1).normalize().multiplyScalar(sz * 1.9));
    cam.lookAt(c);
    r.render(s, cam);
    thumbs[o.id] = r.domElement.toDataURL();
    s.remove(m);
  }
  pm.dispose();
  r.dispose();
  return thumbs;
}

/* ---------- Pointer ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(9, 9);
let down = null, pointerHeld = false, lastPointer = { x: 0, y: 0 };
canvas.addEventListener('pointermove', e => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  lastPointer = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerdown', e => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  down = { x: e.clientX, y: e.clientY, button: e.button };
  pointerHeld = e.button === 0;
});
addEventListener('pointerup', e => {
  pointerHeld = false;
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const wasLeft = down.button === 0;
  down = null;
  if (e.target !== canvas || moved > 6 || !wasLeft) return;
  click(e);
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (mode === 'lot' && view.inspect) closeInspect();
    else if (mode === 'room' && view.tool === 'lights' && view.lights.draw.length) { view.lights.draw = []; updatePreview(); renderLights(); }
  }
});

function click(e) {
  if (mode === 'lot') {
    const item = lotPick(ndc);
    if (item && item !== view.inspect) inspectTree(item);
    return;
  }
  if (mode !== 'room') return;
  raycaster.setFromCamera(ndc, camera);
  // the cat comes first
  if (cat && cat.state !== 'done') {
    if (raycaster.intersectObject(cat.hitObject, false).length) return cat.click('cat');
    const fp = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (fp && fp.distanceTo(new THREE.Vector3(cat.pos.x, 0, cat.pos.z)) < 0.45) return cat.click('block');
  }
  const t = activeTree();
  if (view.tool === 'ornaments') {
    if (view.orn.mode === 'remove' || e.altKey) {
      const hit = raycaster.intersectObjects(R.wrappers, true)[0];
      if (!hit) return;
      let w = hit.object; while (w.parent && !R.wrappers.includes(w)) w = w.parent;
      if (w.userData.topper) t.topper = null;
      else t.ornaments.splice(w.userData.index, 1);
      rebuildOrnaments(); save(); renderOrnaments();
      return;
    }
    const target = ornamentTarget();
    if (!target) return;
    if (target.topper) t.topper = { id: view.orn.id, c: view.orn.c };
    else t.ornaments.push({ id: view.orn.id, c: view.orn.c, hp: target.hp });
    rebuildOrnaments(); clearGhost(); save(); renderOrnaments();
    return;
  }
  if (view.tool === 'lights' && view.lights.method === 'draw') {
    const hit = raycaster.intersectObject(R.tree.hull, false)[0];
    if (!hit) return;
    const local = R.tree.sway.worldToLocal(hit.point.clone());
    view.lights.draw.push(tuck(R.tree.layout, local, view.lights.depth));
    updatePreview(); renderLights();
  }
}

function ornamentTarget() {
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(R.tree.hull, false)[0];
  if (!hit) return null;
  const local = R.tree.sway.worldToLocal(hit.point.clone());
  const L = R.tree.layout;
  if (ORN[view.orn.id].topper) return local.y > L.H * 0.78 ? { topper: true } : null;
  const used = new Set(activeTree().ornaments.map(o => o.hp));
  let best = -1, bd = 0.22;
  L.hang.forEach((h, i) => {
    if (used.has(i)) return;
    const d = h.p.distanceTo(local);
    if (d < bd) { bd = d; best = i; }
  });
  return best >= 0 ? { hp: best } : null;
}
function clearGhost() { if (R.ghost) { R.ghost.parent?.remove(R.ghost); R.ghost = null; R.ghostKey = null; } }
function updateGhost() {
  if (view.tool !== 'ornaments' || view.orn.mode !== 'hang' || down) { clearGhost(); document.body.dataset.cursor = view.tool === 'ornaments' && view.orn.mode === 'remove' ? 'remove' : document.body.dataset.cursor === 'place' ? '' : document.body.dataset.cursor; return; }
  const target = ornamentTarget();
  if (!target) { clearGhost(); document.body.dataset.cursor = ''; return; }
  document.body.dataset.cursor = 'place';
  const key = `${view.orn.id}:${view.orn.c}:${target.topper ? 'top' : target.hp}`;
  if (R.ghostKey === key) return;
  clearGhost();
  const L = R.tree.layout;
  R.ghost = target.topper
    ? (() => { const w = new THREE.Group(); w.position.set(0, L.H - 0.06, 0); w.add(buildOrnament(view.orn.id, view.orn.c)); return w; })()
    : makeWrapper({ id: view.orn.id, c: view.orn.c, hp: target.hp }, L.hang[target.hp], -1);
  R.wrappers = R.wrappers.filter(w => w !== R.ghost);
  R.ghostKey = key;
  R.tree.sway.add(R.ghost);
}

/* ---------- Water and sweep ---------- */
let overflowWarned = 0;
function updateWater(dt, time) {
  const t = activeTree();
  if (view.tool !== 'water' || !R.stand) { R.stream.visible = false; return; }
  const cap = STANDS[t.standId].capacity;
  const basePos = R.base.position;
  // the can hovers over the side of the well that faces the camera
  const toCam = camera.position.clone().sub(basePos).setY(0).normalize();
  const canY = R.stand.top + 0.22;
  const reach = Math.max(R.stand.outer + 0.12, R.tree.layout.profile(canY - R.holder.position.y) * 0.7 + 0.12);
  const pouring = pointerHeld;
  const tilt = pouring ? 0.75 : 0.15;
  R.can.position.lerp(basePos.clone().addScaledVector(toCam, reach).add(new THREE.Vector3(0, canY, 0)), Math.min(1, dt * 8));
  R.can.rotation.y = Math.atan2(toCam.x, toCam.z) + Math.PI / 2;
  R.can.rotation.z = lerp(R.can.rotation.z, tilt, Math.min(1, dt * 6));
  if (pouring && R.can.rotation.z > 0.5) {
    const spout = R.can.localToWorld(new THREE.Vector3(0.24, 0.13, 0));
    const surf = basePos.clone().addScaledVector(toCam, R.stand.outer * 0.3); surf.y = R.stand.top * 0.7;
    const len = spout.distanceTo(surf);
    R.stream.visible = true;
    R.stream.position.copy(spout).add(surf).multiplyScalar(0.5);
    R.stream.scale.set(1, len, 1);
    R.stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spout.clone().sub(surf).normalize());
    t.water += 0.55 * dt;
    if (t.water > cap) {
      t.water = cap;
      if (performance.now() - overflowWarned > 5000) { overflowWarned = performance.now(); toast('It\'s overflowing onto the floor. Ease off.'); }
    }
    R.stand.setLevel(t.water / cap);
    const wt = $('#wellText'); if (wt) wt.textContent = `${(t.water * 0.264).toFixed(2)} of ${(cap * 0.264).toFixed(2)} gallons`;
    save();
    if (Math.random() < dt * 4) updateStatus();
  } else R.stream.visible = false;
}

function updateSweep(dt, time) {
  if (view.tool !== 'sweep') { R.broom.visible = false; return; }
  raycaster.setFromCamera(ndc, camera);
  const p = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (!p || Math.abs(p.x) > ROOM.w / 2 || Math.abs(p.z) > ROOM.d / 2) { R.broom.visible = false; return; }
  const local = p.clone().sub(R.base.position);
  const y = heightAt(local.x, local.z);
  R.broom.visible = true;
  const prev = R.broom.position.clone();
  R.broom.position.set(p.x, y, p.z);
  const mv = R.broom.position.clone().sub(prev);
  if (mv.lengthSq() > 1e-6) R.broom.rotation.y = lerp(R.broom.rotation.y, Math.atan2(-mv.z, mv.x), 0.15);
  R.broom.rotation.z = pointerHeld ? Math.sin(time * 18) * 0.12 : 0;
  if (pointerHeld) {
    const n = R.floor.sweep(local, 0.15);
    if (n) {
      const t = activeTree();
      t.onFloor = Math.max(0, t.onFloor - n * NEEDLES_PER_DRAWN);
      const fc = $('#floorCount'); if (fc) fc.textContent = `${R.floor.count.toLocaleString()} needles`;
      save();
      if (R.floor.count === 0) toast('Floor is clean.');
    }
  }
}

/* ---------- Falling ornaments ---------- */
function dislodge(worldPos, radius, top = false) {
  const t = activeTree();
  const v = new THREE.Vector3();
  const drop = [];
  for (const w of R.wrappers) {
    if (drop.length >= 2) break;
    if (w.userData.topper && !top) continue;
    w.getWorldPosition(v);
    if (v.distanceTo(worldPos) > radius) continue;
    if (!w.userData.topper && Math.random() > 0.55) continue;
    drop.push(w);
  }
  if (!drop.length) return 0;
  const gone = new Set(drop.filter(w => !w.userData.topper).map(w => w.userData.index));
  for (const w of drop) {
    room.scene.attach(w);
    R.fallingOrn.push({ w, v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), id: w.userData.id, bounced: 0, rest: 0 });
    if (w.userData.topper) t.topper = null;
  }
  t.ornaments = t.ornaments.filter((_, i) => !gone.has(i));
  rebuildOrnaments();
  save();
  return drop.length;
}
function updateFallingOrnaments(dt) {
  for (const f of [...R.fallingOrn]) {
    f.v.y -= 9.8 * dt;
    f.w.position.addScaledVector(f.v, dt);
    f.w.rotation.x += f.spin.x * dt; f.w.rotation.z += f.spin.z * dt;
    const local = f.w.position.clone().sub(R.base.position);
    const g = heightAt(local.x, local.z) + 0.03;
    if (f.w.position.y <= g) {
      f.w.position.y = g;
      const o = ORN[f.id];
      if (o.fragile && !f.bounced) {
        room.scene.remove(f.w);
        R.fallingOrn = R.fallingOrn.filter(x => x !== f);
        const color = new THREE.Color(o.colors ? o.colors[0] : 0xdddddd);
        for (let i = 0; i < 26; i++) R.shards.spawn(f.w.position.clone(), color, new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6));
        activeTree().stats.broken++;
        toast(`The ${o.name.toLowerCase()} shattered.`);
        save();
        continue;
      }
      if (f.bounced < 1 && Math.abs(f.v.y) > 1) { f.v.y *= -0.35; f.v.x *= 0.5; f.v.z *= 0.5; f.bounced++; }
      else { f.v.set(0, 0, 0); f.spin.set(0, 0, 0); f.rest += dt; }
      if (f.rest > 1.6) {
        room.scene.remove(f.w);
        R.fallingOrn = R.fallingOrn.filter(x => x !== f);
        toast(`The ${o.name.toLowerCase()} fell off. It's back in the box.`);
      }
    }
  }
}

/* ---------- The cat ---------- */
let cat = null, nextCat = Infinity;
function scheduleCat() {
  const s = params.get('cat');
  nextCat = performance.now() + (s ? +s : 70 + Math.random() * 200) * 1000;
}
function maybeCat() {
  const t = activeTree();
  if (cat || mode !== 'room' || !t?.setupDone || document.hidden || performance.now() < nextCat) return;
  const L = R.tree.layout;
  cat = new Cat(room.scene, {
    treeAt: () => R.base.position,
    treeRadiusAt: y => L.profile(y - R.holder.position.y),
    treeHeight: () => L.H + R.holder.position.y,
    start: room.catStart,
    onDislodge: (p, rad, top) => dislodge(p, rad, top),
    onSay: msg => toast(msg, 'cat', 5000),
    onEnd: ({ saved, damage, name }) => {
      const tt = activeTree();
      tt.stats.cats++;
      if (saved) tt.stats.saves++;
      save();
      cat = null;
      scheduleCat();
      if (!saved && !damage) toast(`${name} gave up. Nothing fell.`);
    },
  });
}

/* ---------- Status ---------- */
function updateStatus() {
  if (mode !== 'room') return;
  const t = activeTree();
  const now = clock.now();
  $('#treeName').textContent = `${treeName(t)} · ${t.spec.heightFt} ft`;
  const cap = t.standId ? STANDS[t.standId].capacity : 1;
  const wf = t.standId ? t.water / cap : 0;
  $('#waterMeter i').style.width = `${wf * 100}%`;
  $('#waterText').textContent = t.standId ? `${(t.water * 0.264).toFixed(2)} of ${(cap * 0.264).toFixed(2)} gal` : 'No stand';
  $('#thirstMeter i').style.width = `${t.hydration * 100}%`;
  $('#thirstMeter i').style.background = t.hydration > 0.75 ? 'var(--green)' : t.hydration > 0.45 ? 'var(--accent)' : 'var(--red)';
  $('#thirstText').textContent = `${Math.round(t.hydration * 100)}%`;
  const hrs = t.standId ? hoursToDry(t, now) : 0;
  const end = seasonEnd(game.seasonStart);
  const days = Math.max(0, Math.ceil((end - now) / 86400000));
  $('#statusNote').innerHTML = [
    t.standId ? thirstLabel(t) : 'Waiting for a stand.',
    t.standId && t.water > 0.05 ? `The well lasts about ${hrs < 1 ? 'less than an hour' : `${Math.round(hrs)} more hours`}.` : '',
    `${Math.round(t.onFloor / NEEDLES_PER_DRAWN).toLocaleString()} needles on the floor.`,
    `${days} day${days === 1 ? '' : 's'} until January 1.`,
  ].filter(Boolean).join('<br>');
}
function updateClock() {
  const now = clock.now();
  const { sunrise, sunset } = sunTimes(now);
  const fire = fireIsLit(now);
  $('#clock').innerHTML = `<span>${dateLabel(now)}</span><b>${timeLabel(now)}</b><span class="sunline">Sunrise ${sunrise ? timeLabel(sunrise) : '–'} · sunset ${sunset ? timeLabel(sunset) : '–'}${mode === 'room' && fire ? ' · fire lit' : ''}</span>`;
}

/* ---------- Sim tick ---------- */
let lastTick = 0, lastLight = 0, lastFireState = null;
function tick() {
  if (!game) return;
  const now = clock.now();
  if (seasonOver()) { store.save(game, true); return showEnded(); }
  for (const t of game.trees) {
    const before = t.onFloor;
    const dropped = advance(t, now);
    if (t === activeTree() && mode === 'room' && dropped) {
      const drawn = dropped / NEEDLES_PER_DRAWN;
      if (drawn > 150) R.floor.setCount(Math.round(t.onFloor / NEEDLES_PER_DRAWN), 0.42, 1 - t.hydration);
      else R.pendingDrops += drawn;
    }
  }
  // a reminder about any other tree that's going dry
  for (const t of game.trees) {
    if (t === activeTree() || !t.standId) continue;
    if (t.water <= 0.01 && !t._warned) { t._warned = true; toast(`${treeName(t)} has run out of water.`); }
    if (t.water > 0.5) t._warned = false;
  }
  if (mode === 'room') { applyTreeLook(); updateStatus(); }
  updateClock();
  save();
}

/* ---------- Props ---------- */
function wateringCan() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x2f6b4a, metalness: 0.5, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.18, 24), m); body.position.y = 0.09; g.add(body);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, 0.26, 10), m); spout.position.set(0.15, 0.1, 0); spout.rotation.z = -0.95; g.add(spout);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.012, 0.03, 12), m); rose.position.set(0.25, 0.165, 0); rose.rotation.z = -0.95; g.add(rose);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 20, Math.PI), m); handle.position.set(-0.02, 0.18, 0); g.add(handle);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function broom() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.28), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 })); head.position.y = 0.05; g.add(head);
  const bristle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.27), new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 })); bristle.position.y = 0.018; g.add(bristle);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8), head.material); handle.position.set(-0.28, 0.5, 0); handle.rotation.z = 0.55; g.add(handle);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/* ---------- Loop ---------- */
let last = performance.now();
function frame(nowMs) {
  requestAnimationFrame(frame);
  if (mode === 'ended') return;
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  const time = nowMs / 1000;
  if (nowMs - lastTick > 1000) { lastTick = nowMs; tick(); }
  if (mode === 'none') { composer.render(); return; }
  controls.update();
  if (mode === 'lot') {
    if (nowMs - lastLight > 5000) { lastLight = nowMs; lot.setTime(clock.now()); }
    camera.position.y = Math.max(camera.position.y, 0.3);
    if (view.inspect?.geo) view.inspect.geo.update(dt, time);
    lot.falling.update(dt, () => 0.01);
    bloom.strength = lerp(0.9, 0.3, lot.state.dayness);
    if (!view.inspect && !down) document.body.dataset.cursor = lotPick(ndc) ? 'pointer' : '';
  } else if (mode === 'room') {
    if (nowMs - lastLight > 5000) {
      lastLight = nowMs;
      room.setTime(clock.now());
      if (lastFireState !== null && room.state.fire !== lastFireState) toast(room.state.fire ? 'The sun is down. Someone lit the fire.' : 'Midnight. The fire has burned down.');
      lastFireState = room.state.fire;
    }
    room.update(time);
    const p = camera.position;
    p.x = clamp(p.x, -2.35, 2.35); p.y = clamp(p.y, 0.2, 2.65); p.z = clamp(p.z, -2.35, 2.35);
    const shake = R.tree.update(dt, time);
    R.tree.setWobble(cat ? cat.wobble() : 0);
    // live needle drop
    let k = 0;
    while (R.pendingDrops >= 1 && k < 6) {
      R.pendingDrops -= 1; k++;
      const lp = R.tree.randomNeedlePoint();
      R.falling.spawn(R.tree.sway.localToWorld(lp), R.floor.color(1 - activeTree().hydration), new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1));
    }
    R.falling.update(dt, (x, z) => heightAt(x - R.base.position.x, z - R.base.position.z), n => {
      R.floor.add(n.p.clone().sub(R.base.position), n.c);
      return true;
    });
    R.shards.update(dt, (x, z) => heightAt(x - R.base.position.x, z - R.base.position.z) + 0.002);
    const amp = 0.02 + shake * 0.4 + (cat?.wobble() || 0) * 0.25;
    for (const w of R.wrappers) { w.rotation.x = Math.sin(time * 2.1 + w.userData.phase) * amp; w.rotation.z = Math.cos(time * 1.7 + w.userData.phase) * amp; }
    R.strands.update(time, room.state.dayness);
    R.preview.update(time, room.state.dayness);
    updateWater(dt, time);
    updateSweep(dt, time);
    updateGhost();
    updateFallingOrnaments(dt);
    maybeCat();
    if (cat) cat.update(dt, time);
    bloom.strength = lerp(0.7, 0.3, room.state.dayness);
    renderer.toneMappingExposure = lerp(0.95, 1.0, room.state.dayness);
  }
  composer.render();
}

/* ---------- Start ---------- */
(async function start() {
  updateClock();
  await store.init();
  if (!store.accounts) { $('#authBox').hidden = true; $('#noAccounts').hidden = false; $('#guestBtn').textContent = 'Start'; }
  if (store.mode === 'account') {
    const state = await store.load().catch(e => { toast(e.message); return null; });
    begin(state);
  } else {
    $('#welcome').hidden = false;
    if (store.hasGuest()) $('#guestBtn').innerHTML = 'Continue in this browser <span class="faint">· your trees are saved here</span>';
  }
  requestAnimationFrame(frame);
})();

if (clock.debug) console.info('[xmastreemagochi] debug clock', { speed: clock.speed, at: new Date(clock.now()).toString() });

// test hooks (?debug)
if (params.has("debug")) window.__xmas = { renderer, composer, renderPass, THREE, game: () => game, lot: () => lot, room: () => room, R, view, camera, controls, inspectTree, buy, setTool, lookClose, testTree, flyTo, spawnCat: () => { nextCat = 0; }, mode: () => mode, renderSide, mountTree, activeTree };
