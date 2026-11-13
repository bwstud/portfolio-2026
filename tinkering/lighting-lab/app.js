/* Lighting lab: the shell. It owns the renderer, the lesson list, the tutor panel and the
   lifecycle; each lesson in lessons/ builds its own scene through the ctx it is handed. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LESSONS, PARTS } from './lessons/index.js';
import { makeUI } from './ui.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), stage = $('stage'), side = $('side');
const params = new URLSearchParams(location.search);

/* ---------- saved progress (this browser only) ---------- */
const KEY = 'lighting-lab:v1';
let saved = { done: {}, notes: {} };
try { saved = { ...saved, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('debug') });
} catch (e) {
  $('err').style.display = 'flex';
  $('err').textContent = 'This browser could not start WebGL 2, which every lesson here needs.';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const size = { w: 1, h: 1 };

/* ---------- shared assets: HDRIs and their prefiltered (PMREM) versions are cached across lessons ---------- */
const HDRI = {
  studio: { file: 'hdri/studio_small_09.hdr', label: 'Small studio' },
  outdoor: { file: 'hdri/kloofendal_48d_partly_cloudy_puresky.hdr', label: 'Open sky, sun' },
  lebombo: { file: 'hdri/lebombo.hdr', label: 'Lebombo (interior, window)' },
};
const texCache = new Map(), pmremCache = new Map();
let pmremGen;
function pmrem() { return pmremGen ??= new THREE.PMREMGenerator(renderer); }
function hdri(name) {
  if (!texCache.has(name)) {
    texCache.set(name, new HDRLoader().loadAsync(HDRI[name].file).then(t => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.userData.keep = true;
      return t;
    }));
  }
  return texCache.get(name);
}
async function envMap(name) {
  if (!pmremCache.has(name)) {
    pmremCache.set(name, (async () => {
      let rt;
      if (name === 'room') rt = pmrem().fromScene(new RoomEnvironment(), 0.04);
      else rt = pmrem().fromEquirectangular(await hdri(name));
      rt.texture.userData.keep = true;
      return rt.texture;
    })());
  }
  return pmremCache.get(name);
}

/* ---------- lesson lifecycle ---------- */
let current = null;   // { def, ctx, api }
let frameFns = [], resizeFns = [], cleanups = [];
let renderFn = null;
let controls = null;

function resetRenderer() {
  renderer.setRenderTarget(null);
  renderer.setScissorTest(false);
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
}

function disposeObject(root) {
  const seen = new Set();
  const tex = t => { if (t && t.isTexture && !t.userData.keep && !seen.has(t)) { seen.add(t); t.dispose(); } };
  root.traverse(o => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) tex(m[k]);
      if (m.uniforms) for (const k in m.uniforms) tex(m.uniforms[k]?.value);
      m.dispose();
    }
    o.shadow?.map?.dispose?.();
    o.dispose?.();
  });
  if (root.isScene) { tex(root.background); tex(root.environment); }
}

function teardown() {
  if (!current) return;
  current.ctx.alive = false;
  try { current.api?.dispose?.(); } catch (e) { console.error(e); }
  for (const c of cleanups) try { c(); } catch {}
  disposeObject(current.ctx.scene);
  controls?.dispose();
  frameFns = []; resizeFns = []; cleanups = []; renderFn = null; controls = null;
  $('readout').innerHTML = ''; $('badge').textContent = ''; $('hint').textContent = '';
  split.disable();
  current = null;
}

/* ---------- before/after split ---------- */
const split = {
  value: 0.5, on: false, el: $('split'), labels: $('splitLabels'),
  enable(left, right) {
    this.on = true; this.el.style.display = 'block'; this.labels.style.display = 'flex';
    this.labels.children[0].textContent = left; this.labels.children[1].textContent = right;
    this.place();
  },
  disable() { this.on = false; this.el.style.display = 'none'; this.labels.style.display = 'none'; },
  place() { this.el.style.left = `${this.value * 100}%`; },
};
{
  let drag = false;
  split.el.addEventListener('pointerdown', e => { drag = true; split.el.setPointerCapture(e.pointerId); e.stopPropagation(); });
  split.el.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = stage.getBoundingClientRect();
    split.value = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0.02, 0.98);
    split.place();
  });
  split.el.addEventListener('pointerup', () => { drag = false; });
}

function makeCtx(def) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, size.w / size.h, 0.05, 200);
  camera.position.set(0, 1.6, 5);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.target.set(0, 0.8, 0);
  const ctx = {
    THREE, renderer, canvas, scene, camera, controls, size, split, def,
    hdri, envMap, HDRI,
    alive: true,   // false once the user has moved on; a lesson still awaiting a load must not touch the page
    readout: html => { if (ctx.alive) $('readout').innerHTML = html; },
    badge: text => { if (ctx.alive) $('badge').textContent = text; },
    hint: text => { if (ctx.alive) $('hint').textContent = text; },
    frame: fn => frameFns.push(fn),
    onResize: fn => resizeFns.push(fn),
    setRender: fn => { renderFn = fn; },
    listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); },
    cleanup: fn => cleanups.push(fn),
    dispose: disposeObject,
    /* normalised device coords for a pointer event on the canvas */
    ndc(e) {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    },
    /* treat a press-and-release with little movement as a click, so orbiting doesn't fire it */
    onClick(fn) {
      let down = null;
      ctx.listen(canvas, 'pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
      ctx.listen(canvas, 'pointerup', e => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) fn(e);
        down = null;
      });
    },
  };
  return ctx;
}

/* ---------- tutor panel ---------- */
function renderSide(def) {
  const note = saved.notes[def.id] || '';
  side.innerHTML = `
    <p class="kicker">${def.kicker}</p>
    <h2>${def.title}</h2>
    <div class="lesson">${def.body}</div>
    <h3>Play with it</h3>
    <div class="controls" id="controls"></div>
    ${def.tasks?.length ? `<h3>Try this</h3><ol class="tasks">${def.tasks.map(t => `<li><span>${t}</span></li>`).join('')}</ol>` : ''}
    ${def.questions?.length ? `<h3>Check yourself</h3><div class="qs">${def.questions.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>` : ''}
    ${def.ask?.length ? `<h3>Bring these to Claude</h3><ul class="ask">${def.ask.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
    ${def.more ? `<h3>Go deeper</h3><div class="lesson">${def.more}</div>` : ''}
    <h3>Your notes</h3>
    <div class="notes"><textarea id="notes" placeholder="What clicked, what didn't, what you want to ask. Saved in this browser.">${note.replace(/</g, '&lt;')}</textarea></div>
  `;
  side.scrollTop = 0;
  $('notes').addEventListener('input', e => { saved.notes[def.id] = e.target.value; persist(); });
  const box = $('doneBox');
  box.checked = !!saved.done[def.id];
  box.onchange = () => { saved.done[def.id] = box.checked; persist(); renderNav(def.id); };
  const i = LESSONS.findIndex(l => l.id === def.id);
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  $('pager').innerHTML = `${prev ? `<a class="btn" href="#${prev.id}">← Back</a>` : ''}${next ? `<a class="btn primary" href="#${next.id}">Next: ${next.short || next.title}</a>` : ''}`;
  for (const a of $('pager').querySelectorAll('a')) a.style.textDecoration = 'none';
}

function renderNav(activeId) {
  let html = '', part = null;
  LESSONS.forEach((l, i) => {
    if (l.part !== part) { part = l.part; if (PARTS[part]) html += `<li class="part">${PARTS[part]}</li>`; }
    html += `<li><a href="#${l.id}" class="${saved.done[l.id] ? 'is-done' : ''}" ${l.id === activeId ? 'aria-current="page"' : ''}>
      <span class="num">${String(i).padStart(2, '0')}</span>
      <span class="t">${l.short || l.title}<small>${l.sub || ''}</small></span>
      <span class="done" aria-label="done">✓</span></a></li>`;
  });
  $('lessons').innerHTML = html;
  $('lessons').querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

let loadToken = 0;
async function go(id) {
  const def = LESSONS.find(l => l.id === id) || LESSONS[0];
  const token = ++loadToken;
  teardown();
  resetRenderer();
  renderNav(def.id);
  renderSide(def);
  document.title = `${def.short || def.title} · Lighting lab`;
  $('hint').textContent = 'Loading…';
  let mod;
  try { mod = await def.load(); } catch (e) {
    console.error(e);
    $('hint').textContent = 'This lesson failed to load. Check the console.';
    return;
  }
  if (token !== loadToken) return;
  $('hint').textContent = '';
  const ctx = makeCtx(def);
  const ui = makeUI($('controls'));
  current = { def, ctx, api: null };
  try {
    current.api = await mod.default(ctx, ui);
  } catch (e) {
    console.error(e);
    $('hint').textContent = `Something broke: ${e.message}`;
  }
  if (token !== loadToken) return;
  resize();
}

/* ---------- loop ---------- */
function resize() {
  const r = stage.getBoundingClientRect();
  size.w = Math.max(1, Math.round(r.width)); size.h = Math.max(1, Math.round(r.height));
  renderer.setSize(size.w, size.h, false);
  if (current) {
    const cam = current.ctx.camera;
    if (cam.isPerspectiveCamera) { cam.aspect = size.w / size.h; cam.updateProjectionMatrix(); }
    for (const f of resizeFns) f(size);
  }
}
new ResizeObserver(resize).observe(stage);

const timer = new THREE.Timer();
timer.connect(document);
function loop(t) {
  requestAnimationFrame(loop);
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1), time = timer.getElapsed();
  if (!current) return;
  controls?.update(dt);
  for (const f of frameFns) f(dt, time);
  if (renderFn) renderFn(dt, time);
  else renderer.render(current.ctx.scene, current.ctx.camera);
}
requestAnimationFrame(loop);

addEventListener('hashchange', () => go(location.hash.slice(1)));
go(location.hash.slice(1));

if (params.has('debug')) window.__lab = { THREE, renderer, get current() { return current; }, go, saved };
