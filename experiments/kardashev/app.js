/* Powers of Watts — the shell: the zoom, the rail, the lesson card, the instrument panel, the overture and the coda.
   Each chapter (chapters/*.js) sets the frame it lives at and builds its own controls through the ctx handed to it. */
import { createZoom, powerAt, zAt, Z_MIN, Z_MAX, STOPS } from './zoom.js';
import { setPeople, setItems } from './plates.js';
import { buildEarth } from './plates.js';
import { createRail } from './rail.js';
import { createAudio } from './audio.js';
import { kOf, watts, supHTML } from './data.js';
import body from './chapters/body.js';
import share from './chapters/share.js';
import today from './chapters/today.js';
import type1 from './chapters/type1.js';
import type2 from './chapters/type2.js';
import type3 from './chapters/type3.js';

const CHAPTERS = [body, share, today, type1, type2, type3];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const phone = matchMedia('(max-width: 720px)');
const $ = s => document.querySelector(s);

// ---------- the zoom ----------
const canvas = $('#stage');
const zoom = createZoom(canvas, {});
const view = zoom.view;
{
  const img = new Image();
  img.onload = () => buildEarth(img);
  img.src = 'earth.png';
}

// ---------- audio ----------
const audio = createAudio();
const soundKey = $('#sound');
let hum = null;
function syncSound() {
  soundKey.setAttribute('aria-pressed', String(audio.ready && !audio.muted));
  if (audio.ready && !hum) hum = audio.drone({ freq: 80, gain: 0.035, colour: 900, wave: 'sine' });
}
soundKey.addEventListener('click', () => {
  if (!audio.ready) { audio.start(); audio.setMuted(false); }
  else audio.setMuted(!audio.muted);
  syncSound();
});
/* The hum: an octave for every five powers of ten, so the whole scale spans about seven octaves. */
const humFreq = p => 55 * Math.pow(2, Math.max(0, p) / 12.3);      // 55 Hz at a watt, three octaves up at the galaxy

// ---------- dials and rail ----------
const dialM = $('#dial-m'), dialP = $('#dial-p'), dialK = $('#dial-k');
const ovM = $('#ov-m'), ovP = $('#ov-p'), ovK = $('#ov-k');
let chapLive = null;      // a chapter's own power (W), shown in place of the scale's while the frame is at the chapter's home
function frameText(z) {
  const e = Math.floor(z), m = Math.pow(10, z - e);
  return `${m.toFixed(1)} × 10<sup>${e}</sup> m`;
}
const powerHTML = P => supHTML(watts(P));
let lastDial = '';
function updateDials() {
  const atHome = current && chapLive != null && Math.abs(view.z - current.view.z) < 0.5;
  // a power is only printed where something real sits in the frame: at a chapter's own view, or near a named stop.
  // In between, the needle still travels, but the dials show a dash rather than an invented number.
  const stop = STOPS.find(s => s.name && Math.abs(view.z - s.z) < 0.3);
  const known = atHome || !!stop;
  const P = atHome ? chapLive : stop ? Math.pow(10, stop.p) : Math.pow(10, powerAt(view.z));
  const K = kOf(P);
  const key = view.z.toFixed(3) + '|' + P.toPrecision(4) + known;
  if (key === lastDial) return;
  lastDial = key;
  const kTxt = (K < 0 ? '−' : '') + Math.abs(K).toFixed(2);
  dialM.innerHTML = frameText(view.z);
  dialP.innerHTML = known ? powerHTML(P) : '—';
  dialK.textContent = known ? kTxt : '—';
  dialP.title = !atHome && stop ? stop.name : '';
  rail.set(Math.log10(P));
  if (overtureOn) {
    ovM.innerHTML = frameText(view.z);
    ovP.innerHTML = known ? `${powerHTML(P)}${stop && !atHome ? ` <span class="ov__what">${stop.name}</span>` : ''}` : '—';
    ovK.textContent = known ? `Kardashev ${kTxt}` : '';
  }
  if (hum) hum.setFreq(humFreq(Math.log10(P)));
}
const rail = createRail($('#rail'), {
  chapters: CHAPTERS,
  onInput(p) { zoom.z = zAt(p); showReturn(); },
  onChapter(i) { go(i); },
});

// ---------- the stage: scroll, pinch or drag up and down to change scale ----------
canvas.addEventListener('wheel', e => {
  if (overtureOn) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoom.z = view.z + d * 0.0022;
  showReturn();
}, { passive: false });
const touches = new Map();
let dragZ = null;
canvas.addEventListener('pointerdown', e => {
  if (overtureOn) return;
  if (current && current.pointer && current.pointer.down && current.pointer.down(e, ctx)) { claimed = true; canvas.setPointerCapture(e.pointerId); return; }
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('is-dragging');
  dragZ = { z: view.z, y: e.clientY, d: pinchDist() };
});
let claimed = false;
function pinchDist() { const v = [...touches.values()]; return v.length >= 2 ? Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) : 0; }
canvas.addEventListener('pointermove', e => {
  if (claimed) { current.pointer.move && current.pointer.move(e, ctx); return; }
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  const d = pinchDist();
  if (touches.size >= 2 && dragZ.d) zoom.z = dragZ.z - Math.log10(d / dragZ.d);
  else if (touches.size === 1) zoom.z = dragZ.z + (e.clientY - dragZ.y) * 0.012;
  showReturn();
});
const endPointer = e => {
  if (claimed) { claimed = false; current.pointer.up && current.pointer.up(e, ctx); return; }
  touches.delete(e.pointerId);
  if (!touches.size) canvas.classList.remove('is-dragging');
  dragZ = { z: view.z, y: e.clientY, d: pinchDist() };
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

const returnKey = $('#return');
function showReturn() {
  if (!current) { returnKey.hidden = true; return; }
  const far = Math.abs(view.z - current.view.z) > 0.5;
  returnKey.hidden = !far;
}
returnKey.addEventListener('click', () => { home(); });
function home() {
  if (!current) return;
  returnKey.hidden = true;
  zoom.fly(current.view.z);
}

// ---------- the panel ----------
const panel = $('#panel');
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
  /* A fader with a typed number beside it, kept in step both ways. With log: true the fader moves in powers of ten
     while the number stays in plain units. */
  fader(parent, { label, min, max, step = 'any', value, unit = '', digits = 2, onInput, id, log = false }) {
    const row = document.createElement('div');
    row.className = 'row';
    const fid = 'f-' + (id || label.replace(/\W+/g, '-').toLowerCase());
    const toR = v => log ? Math.log10(v) : v, fromR = r => log ? Math.pow(10, r) : r;
    row.innerHTML = `<label class="m-legend m-legend--dim" for="${fid}">${label}${unit ? ` <span class="unit">${unit}</span>` : ''}</label>
      <input class="m-fader" type="range" id="${fid}" min="${toR(min)}" max="${toR(max)}" step="${log ? 'any' : step}">
      <input class="m-input row__num" type="number" min="${min}" max="${max}" step="any" aria-label="${label}, typed" inputmode="decimal">`;
    parent.appendChild(row);
    const range = row.querySelector('.m-fader'), num = row.querySelector('.row__num');
    let current = value;
    const fmt = v => {
      if (!log) return (+v).toFixed(digits);
      const d = v >= 100 ? 0 : v >= 10 ? Math.max(0, digits - 1) : v >= 1 ? digits : v >= 0.1 ? digits + 1 : digits + 2;
      return (+v).toFixed(Math.min(6, d));
    };
    const show = v => { range.value = toR(v); num.value = fmt(v); };
    show(value);
    range.addEventListener('input', () => {
      let v = fromR(+range.value);
      if (!log && step !== 'any') v = Math.round(v / step) * step;
      current = v; num.value = fmt(v); onInput && onInput(v);
    });
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (isFinite(v) && v >= min && v <= max) { current = v; range.value = toR(v); onInput && onInput(v); }
    });
    const tidy = () => {
      let v = parseFloat(num.value);
      const empty = !isFinite(v);
      if (empty) v = current;
      const clamped = Math.min(max, Math.max(min, v));
      if (clamped !== current) { current = clamped; onInput && onInput(clamped); }
      range.value = toR(clamped);
      if (empty || clamped !== v) num.value = fmt(clamped);
    };
    num.addEventListener('change', tidy);
    num.addEventListener('blur', tidy);
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { tidy(); num.blur(); } e.stopPropagation(); });
    range.addEventListener('keydown', e => e.stopPropagation());
    return {
      get value() { return current; },
      set(v) { if (document.activeElement === num) return; current = v; show(v); },
      row, range, num,
    };
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
      if (k.onClick) b.addEventListener('click', () => k.onClick(b));
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
  select(parent, { label, options, value, onChange }) {
    const wrap = document.createElement('div');
    wrap.className = 'segrow';
    const id = 's-' + label.replace(/\W+/g, '-').toLowerCase();
    wrap.innerHTML = `<label class="m-legend m-legend--dim" for="${id}">${label}</label><select class="m-input select" id="${id}">${options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}</select>`;
    const sel = wrap.querySelector('select');
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    sel.addEventListener('keydown', e => e.stopPropagation());
    parent.appendChild(wrap);
    return { set(v) { sel.value = v; }, el: sel };
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
    return { set(id, text) { const d = out[id]; if (d && d.innerHTML !== text) d.innerHTML = text; }, el: box };
  },
  lamps(parent, list) {
    const box = document.createElement('div'); box.className = 'lamps';
    const out = {};
    for (const l of list) {
      const row = document.createElement('div'); row.className = 'lamp';
      row.innerHTML = `<span class="m-led" aria-hidden="true"></span><span>${l.label}</span><b>${l.value}</b>`;
      box.appendChild(row); out[l.id] = row;
    }
    parent.appendChild(box);
    return { set(id, on) { const r = out[id]; if (!r) return; r.classList.toggle('is-on', on); r.querySelector('.m-led').classList.toggle('is-on', on); } };
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
    let dims = { w: 260, h: height };
    const size = () => {
      const w = wrap.clientWidth || 260, r = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(w * r); c.height = Math.round(height * r);
      c.style.height = height + 'px';
      g.setTransform(r, 0, 0, r, 0, 0);
      dims = { w, h: height };
    };
    size();
    new ResizeObserver(() => { size(); onResize && onResize(); }).observe(wrap);
    return { g, get w() { return dims.w; }, get h() { return dims.h; }, el: wrap, canvas: c };
  },
  note(parent, html) { const p = document.createElement('p'); p.className = 'note'; p.innerHTML = html; parent.appendChild(p); return p; },
};

// ---------- the lesson card ----------
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
const DONE_KEY = 'kardashev:done';
const done = new Set((() => { try { return JSON.parse(localStorage.getItem(DONE_KEY)) || []; } catch { return []; } })());
function showDone() {
  [...index_.children].forEach((b, j) => {
    const d = done.has(CHAPTERS[j].id);
    b.classList.toggle('is-done', d);
    b.querySelector('.index__lamp').classList.toggle('is-on', d);
    b.setAttribute('aria-label', `${CHAPTERS[j].name}${d ? ', done' : ''}`);
  });
  rail.setDone(done);
}
function markDone(id) {
  const first = !done.has(id);
  done.add(id);
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch {}
  showDone();
  if (first && done.size === CHAPTERS.length) setTimeout(coda, 3200);
}

function meetGoal(id, at) {
  if (goalState[id] !== false) return false;
  goalState[id] = true;
  const li = els.goals.querySelector(`[data-id="${id}"]`);
  if (li) { li.classList.add('is-met'); li.querySelector('.m-led').classList.add('is-on'); li.querySelector('.goal__status').textContent = 'Done'; }
  audio.chord(current.chordRoot || 261.63);
  if (at) pulse(at);
  if (Object.values(goalState).every(Boolean)) {
    els.next.classList.add('is-ready');
    markDone(current.id);
    const who = current;
    setTimeout(() => {
      if (current !== who || !who.finale) return;
      who.reward && who.reward(ctx);
      const text = who.finale(ctx);
      if (!text) return;
      els.finale.innerHTML = text; els.finale.hidden = false;
      els.finale.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    }, 700);
    announce(`${current.name}: done.${CHAPTERS[index + 1] ? ` Next is ${CHAPTERS[index + 1].name}.` : ''}`);
  }
  return true;
}
const liveEl = $('#live');
function announce(t) { liveEl.textContent = ''; requestAnimationFrame(() => { liveEl.textContent = t; }); }

function renderPredict(m) {
  const p = m.predict;
  els.predict.hidden = !p;
  els.predict.innerHTML = '';
  if (!p) return;
  const q = document.createElement('p');
  q.className = 'predict__q';
  q.innerHTML = `<span class="predict__tag">Guess first</span>${p.question}`;
  const opts = document.createElement('div');
  opts.className = 'predict__opts';
  const reveal = document.createElement('div');
  reveal.className = 'predict__reveal'; reveal.hidden = true;
  p.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'm-key m-key--tile m-key--left predict__opt';
    b.innerHTML = o;
    b.addEventListener('click', () => {
      opts.querySelectorAll('button').forEach((x, j) => {
        x.disabled = true;
        x.classList.toggle('is-answer', j === p.answer);
        x.setAttribute('aria-pressed', String(j === i));
      });
      const right = i === p.answer;
      reveal.innerHTML = `<p class="predict__verdict">${right ? 'Right.' : (p.wrong || 'Not quite, and most people guess the same.')}</p>${p.reveal}`;
      reveal.hidden = false;
      els.predict.classList.add('is-answered');
      current.onPredict && current.onPredict(i, right, ctx);
    });
    opts.appendChild(b);
  });
  els.predict.append(q, opts, reveal);
}

// ---------- a goal met: a ring of copper spreads from where it happened ----------
const pulses = [];
function pulse(at) {
  if (reduced.matches) return;
  pulses.push({ at, t: 0 });
}
view.overlays.push({
  node: 'earth',
  draw(g) {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const [x, y] = typeof p.at === 'function' ? p.at() : p.at;
      const k = 1 - Math.pow(1 - Math.min(1, p.t), 3);
      g.strokeStyle = `rgba(236,230,216,${0.5 * (1 - p.t)})`; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, 6 + k * 90, 0, Math.PI * 2); g.stroke();
    }
  },
});

// ---------- the router ----------
const index_ = $('#index');
let current = null, index = -1, ctx = null, chapterOverlays = [];
CHAPTERS.forEach((m, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'index__item';
  b.innerHTML = `<span class="index__n">${i + 1}</span><span class="index__name">${m.name}</span><span class="m-led index__lamp" aria-hidden="true"></span>`;
  b.addEventListener('click', () => go(i));
  index_.appendChild(b);
});
showDone();

function go(i, { fly = true } = {}) {
  if (i < 0 || i >= CHAPTERS.length) return;
  leaveOverture();
  if (current) {
    current.exit && current.exit(ctx);
    view.overlays = view.overlays.filter(o => !chapterOverlays.includes(o));
    chapterOverlays = [];
    view.state = {};
  }
  setPeople([]); setItems([]);
  index = i; current = CHAPTERS[i];
  [...index_.children].forEach((b, j) => b.setAttribute('aria-current', j === i ? 'step' : 'false'));
  rail.setCurrent(i);
  history.replaceState(null, '', '#' + current.id);
  document.title = `${current.name} · Powers of Watts · Brian Studwell`;

  els.body.classList.remove('is-in'); void els.body.offsetWidth; els.body.classList.add('is-in');
  els.count.textContent = `${i + 1} of ${CHAPTERS.length}`;
  els.title.textContent = current.title;
  els.prose.innerHTML = current.prose;
  renderPredict(current);
  renderGoals(current);
  els.finale.hidden = true;
  els.story.hidden = !current.story;
  if (current.story) { els.story.open = false; els.story.querySelector('.story__body').innerHTML = current.story; els.story.querySelector('summary').textContent = current.storyTitle || 'The story'; }
  els.back.disabled = i === 0;
  els.next.hidden = i === CHAPTERS.length - 1;
  els.next.classList.remove('is-ready');
  els.next.querySelector('.next__name').textContent = CHAPTERS[i + 1] ? CHAPTERS[i + 1].name : '';
  $('#card-scroll').scrollTop = 0;
  returnKey.hidden = true;

  ui.clear();
  chapLive = null;
  view.phase = current.view.phase ?? view.phase;
  ctx = {
    zoom, view, ui, audio, announce, pulse, phone: () => phone.matches,
    goal: meetGoal, goalMet: id => goalState[id] === true,
    overlay(o) { view.overlays.push(o); chapterOverlays.push(o); return o; },
    setLive(P) { chapLive = P; lastDial = ''; },
    get atHome() { return Math.abs(view.z - current.view.z) < 0.5; },
  };
  current.enter(ctx);
  resize();
  if (fly) zoom.fly(current.view.z);
  else zoom.z = current.view.z;
  if (phone.matches) setSheetTab('lesson');
  const tab = index_.children[i]; tab && tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
}
els.back.addEventListener('click', () => go(index - 1));
els.next.addEventListener('click', () => go(index + 1));

window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (current && current.key && current.key(e, ctx)) return;
  if ((e.key === ']' || e.key === 'PageDown') && current) go(index + 1);
  else if ((e.key === '[' || e.key === 'PageUp') && current) go(index - 1);
  else if ((e.key === '+' || e.key === '=') && !overtureOn) { zoom.z = view.z - 0.25; showReturn(); }
  else if ((e.key === '-' || e.key === '_') && !overtureOn) { zoom.z = view.z + 0.25; showReturn(); }
});
window.addEventListener('keyup', e => { if (current && current.keyup) current.keyup(e, ctx); });

// ---------- the coda: back to the fire ----------
function coda() {
  [0, 1, 2, 3, 4, 5].forEach(i => audio.pluck(130.81 * [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2][i], { gain: 0.12, delay: i * 0.2, decay: 3, pan: -0.5 + i * 0.2 }));
  const line = document.createElement('span'); line.className = 'finale__coda';
  line.innerHTML = 'All six. From a body to a galaxy is thirty-four powers of ten, and every one of them ends as warmth, the way the fire does. The scale is a measure of waste heat. The most advanced civilization may be the one we can’t see.';
  els.finale.append(line); els.finale.hidden = false;
  announce('All six chapters complete.');
  zoom.fly(Z_MAX - 0.4, { perOrder: 0.15, max: 4, done: () => setTimeout(() => zoom.fly(0.55, { perOrder: 0.15, max: 4 }), 900) });
}

// ---------- the overture: out from the fire to the galaxy, then back four times faster ----------
const overture = $('#overture');
let overtureOn = true;
function overtureLoop() {
  if (!overtureOn) return;
  zoom.z = 0.2;
  setTimeout(() => {
    if (!overtureOn) return;
    zoom.fly(21.2, { perOrder: 0.62, max: 14, done: () => setTimeout(() => {
      if (!overtureOn) return;
      zoom.fly(0.2, { perOrder: 0.16, max: 3.6, done: () => setTimeout(overtureLoop, 1200) });
    }, 1800) });
  }, 1400);
}
function begin(withSound) {
  if (withSound) { audio.start(); audio.setMuted(false); }
  syncSound();
  overture.classList.add('is-gone');
  setTimeout(() => { overture.hidden = true; }, 600);
  const id = location.hash.slice(1);
  const k = CHAPTERS.findIndex(m => m.id === id);
  go(k >= 0 ? k : 0);
}
function leaveOverture() {
  if (!overtureOn) return;
  overtureOn = false;
  zoom.stop();
  document.body.classList.remove('is-overture');
  overture.classList.add('is-gone');
  resize();
}
$('#begin').addEventListener('click', () => begin(true));
$('#begin-quiet').addEventListener('click', () => begin(false));

// ---------- phone sheet ----------
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
  let cx, cy, side;
  if (overtureOn) { cx = phone.matches ? w * 0.5 : w * 0.62; cy = phone.matches ? h * 0.34 : h * 0.44; side = Math.min(w, h) * 0.8; }
  else {
    const left = phone.matches ? 0 : ($('#card').getBoundingClientRect().right || 0);
    const right = phone.matches || panel.hidden ? w : ($('#panel').getBoundingClientRect().left || w);
    const top = phone.matches ? ($('.top').getBoundingClientRect().bottom || 60) : 56;
    const bottom = phone.matches ? ($('.dock').getBoundingClientRect().top || h) : ($('.dock').getBoundingClientRect().top || h - 100);
    cx = (left + right) / 2; cy = (top + bottom) / 2;
    side = Math.max(120, Math.min(right - left, bottom - top) - 24);
  }
  // the part of the canvas no card, panel or dock covers: the halftone only fills this
  view.clip = overtureOn ? null : phone.matches
    ? { l: 0, r: w, t: 0, b: ($('#sheet').getBoundingClientRect().top || h) }
    : { l: Math.max(0, ($('#card').getBoundingClientRect().right || 0) - 8), r: Math.min(w, (panel.hidden ? w : $('#panel').getBoundingClientRect().left) + 8), t: 0, b: h };
  zoom.resize({ cx, cy, side });
  current && current.resize && current.resize(ctx);
}
new ResizeObserver(resize).observe(canvas);
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (current && current.frame) current.frame(ctx, dt);
  for (let i = pulses.length - 1; i >= 0; i--) { pulses[i].t += dt / 0.9; if (pulses[i].t >= 1) pulses.splice(i, 1); }
  zoom.frame(dt);
  updateDials();
}

resize();
zoom.z = 0.2;
requestAnimationFrame(frame);
if (location.hash && CHAPTERS.some(m => '#' + m.id === location.hash)) {
  overture.hidden = true;
  go(CHAPTERS.findIndex(m => '#' + m.id === location.hash), { fly: false });
} else overtureLoop();
syncSound();
window.addEventListener('hashchange', () => {
  const k = CHAPTERS.findIndex(m => '#' + m.id === location.hash);
  if (k >= 0 && k !== index) { overture.hidden = true; go(k); }
});
window.__kardashev = { go: i => go(i), get ctx() { return ctx; }, get current() { return current; }, zoom, view, audio, get goals() { return { ...goalState }; } };
