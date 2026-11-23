/* Music of the Spheres — the shell: renderer, camera, the movement router, the lesson card, the instrument panel and
   the dock. Each movement (movements/*.js) builds its own scene and controls through the ctx this file hands it. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setLineResolution, starfield, disposeTree } from './draw.js';
import { createAudio } from './audio.js';
import falling from './movements/falling.js';
import ellipse from './movements/ellipse.js';
import harmony from './movements/harmony.js';
import resonance from './movements/resonance.js';
import catchup from './movements/catchup.js';
import transfer from './movements/transfer.js';

const MOVEMENTS = [falling, ellipse, harmony, resonance, catchup, transfer];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const $ = s => document.querySelector(s);

// ---------- renderer ----------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
let maxDpr = Math.min(2, window.devicePixelRatio || 1);
let dpr = maxDpr;
renderer.setPixelRatio(dpr);

const scene = new THREE.Scene();
// the night sky's gradient is drawn in WebGL, not behind a transparent canvas: additive light then adds to it
// instead of punching opaque holes through to the page
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const g = c.getContext('2d'), grd = g.createRadialGradient(594, 270, 0, 594, 270, 900);
  grd.addColorStop(0, '#0e1530'); grd.addColorStop(0.42, '#060913'); grd.addColorStop(1, '#020308');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 640);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 2000);
const sky = starfield();
scene.add(sky);
scene.add(new THREE.AmbientLight(0x8090b0, 0.16));
const sunLight = new THREE.PointLight(0xfff1d8, 3.2, 0, 0);   // no falloff: a planet is lit the same at any distance
scene.add(sunLight);

// pointer: a movement may claim a press (to drag a handle) before the camera sees it
const pointerHandlers = [];
let dragging = null;
canvas.addEventListener('pointerdown', e => {
  for (const h of pointerHandlers) {
    if (h.down && h.down(e)) {
      dragging = h; canvas.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation(); e.preventDefault();
      return;
    }
  }
});
canvas.addEventListener('pointermove', e => {
  if (dragging) { dragging.move && dragging.move(e); e.stopImmediatePropagation(); return; }
  let cursor = '';
  for (const h of pointerHandlers) if (h.hover) { const c = h.hover(e); if (c) { cursor = c; break; } }
  canvas.style.cursor = cursor;
});
const endDrag = e => { if (dragging) { dragging.up && dragging.up(e); dragging = null; e.stopImmediatePropagation(); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = 0.8;

// ---------- camera moves: one per movement change ----------
let tween = null;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function sphericalOf(pos, target) {
  const s = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
  return s;
}
function flyTo({ target = [0, 0, 0], distance = 10, polar = 30, azimuth = 0 }, duration = 1.6) {
  const to = { target: new THREE.Vector3(...target), sph: new THREE.Spherical(distance, THREE.MathUtils.degToRad(Math.max(0.01, polar)), THREE.MathUtils.degToRad(azimuth)) };
  if (reduced.matches || duration === 0) {
    controls.target.copy(to.target);
    camera.position.setFromSpherical(to.sph).add(to.target);
    controls.update(); tween = null; return;
  }
  const from = { target: controls.target.clone(), sph: sphericalOf(camera.position, controls.target) };
  // take the short way round
  let dθ = to.sph.theta - from.sph.theta;
  dθ = ((dθ + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  tween = { from, to, dθ, t: 0, duration };
}
function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.duration);
  const k = ease(tween.t), { from, to } = tween;
  // distance moves in log space, so a big zoom doesn't rush its last part
  const r = Math.exp(THREE.MathUtils.lerp(Math.log(from.sph.radius), Math.log(to.sph.radius), k));
  const sph = new THREE.Spherical(r, THREE.MathUtils.lerp(from.sph.phi, to.sph.phi, k), from.sph.theta + tween.dθ * k);
  controls.target.lerpVectors(from.target, to.target, k);
  camera.position.setFromSpherical(sph).add(controls.target);
  if (tween.t >= 1) tween = null;
}
controls.addEventListener('start', () => { tween = null; });

// ---------- labels: small text pinned to points in the scene ----------
const labelLayer = $('#labels');
const labels = new Set();
const v3 = new THREE.Vector3();
function makeLabel(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'label ' + cls;
  el.textContent = text;
  labelLayer.appendChild(el);
  const pr = /label--(planet|copper)/.test(cls) ? 2 : /label--quiet/.test(cls) ? 0 : 1;
  const ax = /label--right/.test(cls) ? 0 : /label--left/.test(cls) ? 1 : 0.5;
  const L = { el, x: 0, y: 0, z: 0, on: true, pr, ax, w: 0,
    at(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    show(v) { this.on = v; el.style.display = v ? '' : 'none'; return this; },
    text(t) { if (el.textContent !== t) { el.textContent = t; this.w = 0; } return this; },
    remove() { el.remove(); labels.delete(L); } };
  labels.add(L);
  return L;
}
let occluders = [];
function measureOccluders() {
  occluders = ['#card', '#panel', '.dock__inner', '.top', '#sheet'].map(q => document.querySelector(q))
    .filter(e => e && !e.hidden && e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
}
const hits = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
function placeLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const placed = [];
  // planets and the learner's craft claim their space first; quiet annotations give way
  const list = [...labels].filter(L => L.on).sort((a, b) => b.pr - a.pr);
  for (const L of list) {
    v3.set(L.x, L.y, L.z).project(camera);
    const sx = (v3.x + 1) / 2 * w, sy = (1 - v3.y) / 2 * h;
    if (!L.w) L.w = L.el.offsetWidth || 60;
    const box = { x: sx - L.w * L.ax - 2, right: sx + L.w * (1 - L.ax) + 2, y: sy - 8, bottom: sy + 8 };
    const vis = v3.z < 1 && v3.z > -1 && box.x > 4 && box.right < w - 4 && box.y > 4 && box.bottom < h - 4
      && !occluders.some(r => hits(box, r)) && !placed.some(b => hits(box, b));
    if (vis) placed.push(box);
    if (L.vis !== vis) { L.vis = vis; L.el.style.opacity = vis ? '' : '0'; }
    L.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
  }
}

// ---------- screen ↔ plane ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function planeHit(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, p) ? p : null;
}
function toScreen(x, y, z) {
  v3.set(x, y, z).project(camera);
  return { x: (v3.x + 1) / 2 * canvas.clientWidth, y: (1 - v3.y) / 2 * canvas.clientHeight };
}
function screenDist(e, x, y, z) {
  const r = canvas.getBoundingClientRect(), s = toScreen(x, y, z);
  return Math.hypot(e.clientX - r.left - s.x, e.clientY - r.top - s.y);
}

// ---------- audio ----------
const audio = createAudio();
const soundKey = $('#sound');
function syncSound() { soundKey.setAttribute('aria-pressed', String(audio.ready && !audio.muted)); }
soundKey.addEventListener('click', () => {
  if (!audio.ready) { audio.start(); audio.setMuted(false); }
  else audio.setMuted(!audio.muted);
  syncSound();
  current && current.onSound && current.onSound();
});

// ---------- the panel: controls a movement asks for ----------
const panel = $('#panel');
const fmt = (v, d = 2) => {
  if (!isFinite(v)) return '∞';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const ui = {
  clear() { panel.innerHTML = ''; panel.hidden = true; },
  group(title) {
    panel.hidden = false;
    const g = document.createElement('div');
    g.className = 'group';
    if (title) { const h = document.createElement('p'); h.className = 'm-legend group__title'; h.textContent = title; g.appendChild(h); }
    panel.appendChild(g);
    return g;
  },
  /* A fader with a typed number beside it, kept in step both ways (the project's rule for numeric controls). */
  fader(parent, { label, min, max, step = 'any', value, unit = '', digits = 2, onInput, id }) {
    const row = document.createElement('div');
    row.className = 'row';
    const fid = 'f-' + (id || label.replace(/\W+/g, '-').toLowerCase());
    row.innerHTML = `<label class="m-legend m-legend--dim" for="${fid}">${label}${unit ? ` <span class="unit">${unit}</span>` : ''}</label>
      <input class="m-fader" type="range" id="${fid}" min="${min}" max="${max}" step="${step}">
      <input class="m-input row__num" type="number" min="${min}" max="${max}" step="${step === 'any' ? 'any' : step}" aria-label="${label}, typed" inputmode="decimal">`;
    parent.appendChild(row);
    const range = row.querySelector('.m-fader'), num = row.querySelector('.row__num');
    let current = value;
    const show = v => { range.value = v; num.value = (+v).toFixed(digits); };
    show(value);
    range.addEventListener('input', () => { current = +range.value; num.value = current.toFixed(digits); onInput && onInput(current); });
    // a typed value keeps its own digits; the fader just shows the nearest position
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (isFinite(v) && v >= min && v <= max) { current = v; range.value = v; onInput && onInput(v); }   // in range: takes effect as typed
    });
    const tidy = () => {
      let v = parseFloat(num.value);
      const empty = !isFinite(v);
      if (empty) v = current;                              // empty: back to the current value
      const clamped = Math.min(max, Math.max(min, v));     // outside: to the nearest end
      if (clamped !== current) { current = clamped; onInput && onInput(clamped); }
      range.value = clamped;
      if (empty || clamped !== v) num.value = clamped.toFixed(digits);   // otherwise leave the typed number as it is
    };
    num.addEventListener('change', tidy);
    num.addEventListener('blur', tidy);
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { tidy(); num.blur(); } e.stopPropagation(); });
    range.addEventListener('keydown', e => e.stopPropagation());
    return { get value() { return current; }, set(v) { if (Math.abs(v - current) < 1e-9 && document.activeElement === num) return; current = v; show(v); }, row, range, num };
  },
  keys(parent, list) {
    const row = document.createElement('div');
    row.className = 'keys';
    const out = {};
    for (const k of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm-key' + (k.accent ? ' m-key--accent' : '') + (k.cls ? ' ' + k.cls : '');
      b.innerHTML = k.html || k.label;
      if (k.title) b.title = k.title;
      if (k.aria) b.setAttribute('aria-label', k.aria);
      b.addEventListener('click', () => k.onClick && k.onClick(b));
      row.appendChild(b);
      out[k.id || k.label] = b;
    }
    parent.appendChild(row);
    return out;
  },
  seg(parent, { label, options, value, onChange }) {
    const wrap = document.createElement('div');
    wrap.className = 'segrow';
    if (label) { const l = document.createElement('span'); l.className = 'm-legend m-legend--dim'; l.textContent = label; wrap.appendChild(l); }
    const seg = document.createElement('div');
    seg.className = 'm-seg m-seg--wrap'; seg.setAttribute('role', 'radiogroup');
    if (label) seg.setAttribute('aria-label', label);
    const buttons = options.map(o => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = o.label;
      b.setAttribute('aria-checked', String(o.value === value));
      b.addEventListener('click', () => { set(o.value); onChange && onChange(o.value); });
      seg.appendChild(b);
      return [o.value, b];
    });
    function set(v) { buttons.forEach(([val, b]) => b.setAttribute('aria-checked', String(val === v))); }
    wrap.appendChild(seg);
    parent.appendChild(wrap);
    return { set, el: wrap };
  },
  readouts(parent, list) {
    const box = document.createElement('dl');
    box.className = 'readouts';
    const out = {};
    for (const r of list) {
      const dt = document.createElement('dt'); dt.textContent = r.label;
      const dd = document.createElement('dd'); dd.textContent = '–';
      box.append(dt, dd);
      out[r.id] = dd;
    }
    parent.appendChild(box);
    return { set(id, text) { const d = out[id]; if (d && d.textContent !== text) d.textContent = text; }, el: box };
  },
  canvas(parent, { height = 150, label, onResize } = {}) {
    const wrap = document.createElement('figure');
    wrap.className = 'inset';
    const c = document.createElement('canvas');
    c.setAttribute('role', 'img');
    if (label) c.setAttribute('aria-label', label);
    wrap.appendChild(c);
    parent.appendChild(wrap);
    const g = c.getContext('2d');
    const size = () => {
      const w = wrap.clientWidth || 260, r = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(w * r); c.height = Math.round(height * r);
      c.style.height = height + 'px';
      g.setTransform(r, 0, 0, r, 0, 0);
      return { w, h: height };
    };
    let dims = size();
    const ro = new ResizeObserver(() => { dims = size(); onResize && onResize(); });
    ro.observe(wrap);
    return { g, get w() { return dims.w; }, get h() { return dims.h; }, el: wrap, canvas: c };
  },
  note(parent, html) { const p = document.createElement('p'); p.className = 'note'; p.innerHTML = html; parent.appendChild(p); return p; },
};

// ---------- the lesson card ----------
const card = $('#card');
const els = {
  count: $('#card-count'), title: $('#card-title'), prose: $('#card-prose'),
  predict: $('#predict'), goals: $('#goals'), finale: $('#finale'), story: $('#story'), back: $('#back'), next: $('#next'), body: $('#card-body'),
};
let goalState = {};
function renderGoals(m) {
  els.goals.innerHTML = '';
  goalState = {};
  (m.goals || []).forEach(g => {
    const li = document.createElement('li');
    li.className = 'goal';
    li.innerHTML = `<span class="m-led" aria-hidden="true"></span><span class="goal__text">${g.text}</span><span class="visually-hidden goal__status">Not yet</span>`;
    li.dataset.id = g.id;
    els.goals.appendChild(li);
    goalState[g.id] = false;
  });
}
// movements finished, remembered in this browser only (it is a convenience: the page works without it)
const DONE_KEY = 'music-of-the-spheres:done';
const done = new Set((() => { try { return JSON.parse(localStorage.getItem(DONE_KEY)) || []; } catch { return []; } })());
function showDone() {
  [...index_.children].forEach((b, j) => {
    const d = done.has(MOVEMENTS[j].id);
    b.classList.toggle('is-done', d);
    b.querySelector('.index__lamp').classList.toggle('is-on', d);
    b.setAttribute('aria-label', `${MOVEMENTS[j].name}${d ? ', done' : ''}`);
  });
}
function markDone(id) {
  const first = !done.has(id);
  done.add(id);
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch {}
  showDone();
  if (first && done.size === MOVEMENTS.length) setTimeout(coda, 3600);
}
/* All six: a closing cadence (the six movements' roots, then home), the light rings from the centre, and a last line. */
function coda() {
  const roots = MOVEMENTS.map(m => m.chordRoot || 261.63);
  roots.forEach((f, i) => audio.pluck(f, { gain: 0.12, delay: i * 0.22, decay: 3, pan: -0.5 + i * 0.2 }));
  [1, 5 / 4, 3 / 2, 2].forEach((r, i) => audio.pluck(130.81 * r, { gain: 0.14, delay: roots.length * 0.22 + 0.3 + i * 0.05, decay: 5, bright: 0.6 }));
  [0, 500, 1000, 1500].forEach(d => setTimeout(() => pulse(controls.target.x, controls.target.z, 0xe7d7a8), d));
  const codaLine = document.createElement('span'); codaLine.className = 'finale__coda';
  codaLine.textContent = 'All six movements. Falling, ellipses, harmony, resonance, rendezvous and transfer: one law of gravity, and Kepler\'s music running through all of it.';
  els.finale.append(codaLine);
  els.finale.hidden = false;
  announce('All six movements complete.');
}

function meetGoal(id, at) {
  if (goalState[id] !== false) return false;
  if (at) pulse(at[0], at[1]);
  goalState[id] = true;
  const li = els.goals.querySelector(`[data-id="${id}"]`);
  if (li) {
    li.classList.add('is-met');
    li.querySelector('.m-led').classList.add('is-on');
    li.querySelector('.goal__status').textContent = 'Done';
  }
  audio.chord(current.chordRoot || 261.63);
  if (Object.values(goalState).every(Boolean)) {
    els.next.classList.add('is-ready');
    markDone(current.id);
    // the held moment: the camera settles on what just happened, the light rings out three times, a line sums it up
    const who = current;
    {
      setTimeout(() => {
        // asked for after the moment, so a movement has finished updating its own state first
        if (current !== who || !who.finale) return;
        const fin = who.finale(ctx);
        if (!fin) return;
        els.finale.textContent = fin.text; els.finale.hidden = false;
        els.finale.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
        if (fin.at) {
          flyTo({ target: [fin.at[0], 0, fin.at[1]], distance: fitDistance(fin.radius || 1.5), polar: current.camera.polar, azimuth: current.camera.azimuth || 0 }, 2.4);
          [0, 420, 840].forEach(d => setTimeout(() => pulse(fin.at[0], fin.at[1], 0xe7d7a8), d));
        }
      }, 700);
    }
    announce(`${current.name}: done. Next is ${MOVEMENTS[index + 1] ? MOVEMENTS[index + 1].name : 'the end'}.`);
  }
  return true;
}
const live = $('#live');
function announce(t) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = t; }); }

function renderPredict(m) {
  const p = m.predict;
  els.predict.hidden = !p;
  els.predict.innerHTML = '';
  if (!p) return;
  const q = document.createElement('p');
  q.className = 'predict__q';
  q.innerHTML = `<span class="predict__tag">Guess first</span> ${p.question}`;
  const opts = document.createElement('div');
  opts.className = 'predict__opts';
  const reveal = document.createElement('div');
  reveal.className = 'predict__reveal'; reveal.hidden = true;
  p.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'm-key m-key--tile m-key--left predict__opt';
    b.textContent = o;
    b.addEventListener('click', () => {
      opts.querySelectorAll('button').forEach((x, j) => {
        x.disabled = true;
        x.classList.toggle('is-answer', j === p.answer);
        x.setAttribute('aria-pressed', String(j === i));
      });
      const right = i === p.answer;
      reveal.innerHTML = `<p class="predict__verdict">${right ? 'Right.' : 'Not quite, and most people guess the same.'}</p>${p.reveal}`;
      reveal.hidden = false;
      els.predict.classList.add('is-answered');
      current.onPredict && current.onPredict(i, right);
    });
    opts.appendChild(b);
  });
  els.predict.append(q, opts, reveal);
}

// ---------- dock: play, speed, scale ----------
const playKey = $('#play'), speedSeg = $('#speed'), scaleChip = $('#scale');
let playing = true;
function setPlaying(p) {
  playing = p;
  playKey.setAttribute('aria-pressed', String(!p));
  playKey.setAttribute('aria-label', p ? 'Pause' : 'Play');
  playKey.querySelector('.play__icon').innerHTML = p
    ? '<svg viewBox="0 0 12 12" width="12" height="12"><rect x="2" y="1.5" width="2.6" height="9" rx="0.6"/><rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6"/></svg>'
    : '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M3 1.6v8.8L10.4 6z"/></svg>';
}
playKey.addEventListener('click', () => setPlaying(!playing));
let speedIndex = 0, sizeNote = '';
function renderSpeeds(m) {
  speedSeg.innerHTML = '';
  const list = m.speeds || [];
  speedIndex = m.speedIndex || 0;
  speedSeg.parentElement.hidden = list.length < 2;
  list.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = s.short || s.label;
    b.setAttribute('aria-checked', String(i === speedIndex));
    b.addEventListener('click', () => setSpeed(i));
    speedSeg.appendChild(b);
  });
  updateChip();
}
function setSpeed(i) {
  speedIndex = i;
  [...speedSeg.children].forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
  updateChip();
  current.onSpeed && current.onSpeed(current.speeds[i].value);
}
function updateChip() {
  const s = current.speeds && current.speeds[speedIndex];
  scaleChip.textContent = [s ? s.label : '', sizeNote].filter(Boolean).join('; ');
}

// ---------- the router ----------
const index_ = $('#index');
let current = null, index = -1, group = null, ctx = null;
MOVEMENTS.forEach((m, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'index__item';
  b.innerHTML = `<span class="index__n">${i + 1}</span><span class="index__name">${m.name}</span><span class="m-led index__lamp" aria-hidden="true"></span>`;
  b.addEventListener('click', () => go(i));
  index_.appendChild(b);
});

showDone();
function go(i, { fly = true } = {}) {
  if (i < 0 || i >= MOVEMENTS.length) return;
  leaveOverture();
  if (current) {
    current.exit && current.exit(ctx);
    pointerHandlers.length = 0;
    [...labels].forEach(l => l.remove());
    audio.stopAll();
    scene.remove(group); disposeTree(group);
  }
  index = i; current = MOVEMENTS[i];
  group = new THREE.Group();
  scene.add(group);
  [...index_.children].forEach((b, j) => b.setAttribute('aria-current', j === i ? 'step' : 'false'));
  history.replaceState(null, '', '#' + current.id);
  document.title = `${current.name} · Music of the Spheres · Brian Studwell`;

  // the card: one entrance for the whole card body, nothing staggered
  els.body.classList.remove('is-in'); void els.body.offsetWidth; els.body.classList.add('is-in');
  els.count.textContent = `${i + 1} of ${MOVEMENTS.length}`;
  els.title.textContent = current.title;
  els.prose.innerHTML = current.prose;
  renderPredict(current);
  renderGoals(current);
  els.finale.hidden = true;
  els.story.hidden = !current.story;
  if (current.story) { els.story.open = false; els.story.querySelector('.story__body').innerHTML = current.story; els.story.querySelector('summary').textContent = current.storyTitle || 'The story'; }
  els.back.disabled = i === 0;
  els.next.hidden = i === MOVEMENTS.length - 1;
  els.next.classList.remove('is-ready');
  els.next.querySelector('.next__name').textContent = MOVEMENTS[i + 1] ? MOVEMENTS[i + 1].name : '';
  $('#card-scroll').scrollTop = 0;

  ui.clear();
  sizeNote = '';
  controls.enableRotate = current.rotate !== false;
  controls.minDistance = current.camera.min || 0.5;
  controls.maxDistance = current.camera.max || 400;
  ctx = {
    THREE, scene, group, camera, controls, renderer, ui, audio, fmt,
    label: makeLabel, planeHit, toScreen, screenDist,
    onPointer(h) { pointerHandlers.push(h); },
    goal: meetGoal, goalMet: id => goalState[id] === true,
    get speed() { return current.speeds ? current.speeds[speedIndex].value : 1; },
    get playing() { return playing; },
    setPlaying, flyTo, announce, pulse,
    fit(radius, opts = {}) { flyTo({ target: [0, 0, 0], polar: current.camera.polar, ...opts, distance: fitDistance(radius) }, opts.duration ?? 1.2); },
    setSize(t) { sizeNote = t; updateChip(); },
    sunLight, isPhone: () => phone.matches,
  };
  renderSpeeds(current);
  setPlaying(true);
  current.enter(ctx);
  resize();
  flyTo(cameraFor(current), fly ? 1.8 : 0);
  if (phone.matches) setSheetTab('lesson');
}
const phone = matchMedia('(max-width: 720px)');
function cameraFor(m) {
  const c = { ...m.camera };
  if (phone.matches && c.phoneDistance) c.distance = c.phoneDistance;
  if (phone.matches && c.phoneTarget) c.target = c.phoneTarget;
  if (c.radius) c.distance = fitDistance(c.radius);
  return c;
}
els.back.addEventListener('click', () => go(index - 1));
els.next.addEventListener('click', () => go(index + 1));

window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); setPlaying(!playing); }
  else if ((e.key === ']' || e.key === 'PageDown') && current) go(index + 1);
  else if ((e.key === '[' || e.key === 'PageUp') && current) go(index - 1);
  else current && current.key && current.key(e);
});

// ---------- the overture: the six planets Kepler knew, turning behind the title ----------
const overture = $('#overture');
function begin(withSound) {
  if (withSound) { audio.start(); audio.setMuted(false); }
  syncSound();
  overture.classList.add('is-gone');
  document.body.classList.remove('is-overture');
  setTimeout(() => { overture.hidden = true; }, 600);
  resize();
  const id = location.hash.slice(1);
  const k = MOVEMENTS.findIndex(m => m.id === id);
  go(k >= 0 ? k : 0);
}
$('#begin').addEventListener('click', () => begin(true));
$('#begin-quiet').addEventListener('click', () => begin(false));

// overture scene: the Harmony movement in its quiet mode, with no card or panel
let overtureState = null;
function startOverture() {
  document.body.classList.add('is-overture');
  group = new THREE.Group(); scene.add(group);
  current = harmony; index = -1;
  ctx = { THREE, scene, group, camera, controls, renderer, ui: null, audio, fmt, label: makeLabel, planeHit, toScreen, screenDist,
    onPointer() {}, goal() {}, goalMet: () => false, get speed() { return 8 / 365.25; }, get playing() { return true; },
    setPlaying() {}, flyTo, announce() {}, setSize() {}, sunLight, ambient: true, isPhone: () => phone.matches };
  harmony.enter(ctx);
  controls.enableRotate = false; controls.enableZoom = false; controls.enablePan = false;
  flyTo({ target: [0, 0, 0], distance: phone.matches ? 26 : 17, polar: 64, azimuth: -24 }, 0);
  flyTo({ target: [0, 0, 0], distance: phone.matches ? 21 : 13.5, polar: 58, azimuth: 8 }, 14);
  overtureState = true;
}
function leaveOverture() {
  if (!overtureState) return;
  overtureState = null;
  current.exit && current.exit(ctx);
  [...labels].forEach(l => l.remove());
  scene.remove(group); disposeTree(group);
  current = null;
  controls.enableZoom = true; controls.enablePan = true;
}

// ---------- a goal met: a ring of light spreads from where it happened, with the chord ----------
const pulses = [];
function pulse(x, z, color = 0xe08a3c) {
  if (reduced.matches) return;
  const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z);
  scene.add(m);
  pulses.push({ m, t: 0, size: camera.position.distanceTo(controls.target) * 0.09 });
}
function stepPulses(dt) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.t += dt / 1.6;
    const k = 1 - Math.pow(1 - Math.min(1, p.t), 3);
    p.m.scale.setScalar(0.05 + p.size * k);
    p.m.material.opacity = 0.9 * (1 - p.t);
    if (p.t >= 1) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pulses.splice(i, 1); }
  }
}

// ---------- phone: the sheet holds the lesson and the controls, one at a time ----------
const sheetTabs = $('#sheet-tabs');
function setSheetTab(t) {
  $('#sheet').dataset.tab = t;
  sheetTabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tab === t)));
  $('#sheet').scrollTop = 0;
}
sheetTabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setSheetTab(b.dataset.tab)));

// ---------- size and loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the scene clear of the card and panel: shift the view's centre into the open stage
  const overture = document.body.classList.contains('is-overture');
  let cx, cy;
  if (overture) { cx = phone.matches ? w * 0.5 : w * 0.64; cy = phone.matches ? h * 0.34 : h * 0.46; }
  else {
    const left = phone.matches ? 0 : ($('#card').getBoundingClientRect().right || 0);
    const right = phone.matches || panel.hidden ? w : ($('#panel').getBoundingClientRect().left || w);
    const top = phone.matches ? ($('.top').getBoundingClientRect().bottom || 60) : 56;
    const bottom = phone.matches ? ($('#sheet').getBoundingClientRect().top || h) : h - 86;
    cx = (left + right) / 2; cy = (top + bottom) / 2;
    stage = { w: Math.max(120, right - left), h: Math.max(120, bottom - top) };
  }
  camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
  camera.updateProjectionMatrix();
  setLineResolution(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  sky.material.uniforms.uPixel.value = renderer.getPixelRatio();
  measureOccluders();
}
/* How far back the camera must sit for a circle of this world radius to fill the open stage, with a margin. */
let stage = { w: 800, h: 600 };
function fitDistance(radius) {
  const H = canvas.clientHeight || 800, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return radius * (H / 2) / (t * 0.44 * Math.min(stage.w, stage.h));
}
new ResizeObserver(resize).observe(canvas);
window.addEventListener('resize', resize);

let last = performance.now(), slow = 0, fast = 0, elapsed = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000);
  // adaptive resolution: drop the pixel ratio if frames run long, bring it back when there's room
  const ms = now - last;
  last = now;
  if (ms > 24) { slow++; fast = 0; } else if (ms < 14) { fast++; slow = 0; }
  if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); slow = 0; }
  if (fast > 240 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.25); renderer.setPixelRatio(dpr); resize(); fast = 0; }
  elapsed += real;
  sky.material.uniforms.uTime.value = elapsed;
  stepTween(real);
  stepPulses(real);
  if (!tween) controls.update();
  if (current) current.frame(ctx, real, playing ? real * ctx.speed : 0);
  placeLabels();
  renderer.render(scene, camera);
}

setPlaying(true);
startOverture();
resize();
requestAnimationFrame(frame);
if (location.hash && MOVEMENTS.some(m => '#' + m.id === location.hash)) {
  // a deep link: go straight in, quietly; the Sound key starts the music
  overture.hidden = true; document.body.classList.remove('is-overture');
  go(MOVEMENTS.findIndex(m => '#' + m.id === location.hash), { fly: false });
}
syncSound();
// a link or the back button changes the hash: follow it
window.addEventListener('hashchange', () => {
  const k = MOVEMENTS.findIndex(m => '#' + m.id === location.hash);
  if (k >= 0 && k !== index) {
    if (!overture.hidden) { overture.classList.add('is-gone'); document.body.classList.remove('is-overture'); overture.hidden = true; }
    go(k);
  }
});
window.__mots = { go: i => go(i), get ctx() { return ctx; }, get current() { return current; }, setPlaying, setSpeed, audio, renderer, camera, controls };
