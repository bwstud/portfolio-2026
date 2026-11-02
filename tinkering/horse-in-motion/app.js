// The Horse in Motion: Muybridge's eleven gallop frames of Sallie Gardner (19 June 1878),
// cropped from the public-domain card scan and played back as a loop.
//
// The frames in frames/ are already registered: each was shifted so the rider sits still
// horizontally and the track lines sit still vertically. OFFSETS holds the shift that was
// applied (in output pixels), so "As printed" can undo it and show each crop as it sits in
// its box on the card.

const N = 11;
const W = 1000, H = 643;                 // frame size
const ZOOM = 1.07;                       // a little overscan so shifted frames never show an edge
const INTERVAL = 1 / 25;                 // seconds between exposures, per the card
const STEP_IN = 27;                      // inches between cameras
const AIRBORNE = new Set([2, 3]);        // frames with all four hooves off the ground

const OFFSETS = [[0, 0], [-11.4, 0], [-30, 1.6], [-28.4, -4.9], [-4.9, -5.7], [-8.1, -14.6],
  [-40.6, -10.6], [-14.6, -7.3], [-1.6, -6.5], [-11.4, -10.6], [-10.6, -11.4]];
// centre the offsets so the "as printed" jitter is spread around the middle
const mean = i => OFFSETS.reduce((s, o) => s + o[i], 0) / N;
const MX = mean(0), MY = mean(1);
const RAW = OFFSETS.map(([x, y]) => [-(x - MX), -(y - MY)]);

// cells on card.jpg (2400 × 1479), in frame order 1–12
const CARD = { w: 2400, h: 1479, cells: [[56, 61, 553, 354], [631, 61, 553, 354], [1204, 61, 555, 354],
  [1780, 61, 556, 354], [56, 435, 553, 357], [631, 435, 553, 357], [1204, 435, 555, 357],
  [1780, 435, 556, 357], [56, 811, 553, 359], [631, 811, 553, 359], [1204, 811, 555, 359],
  [1780, 811, 556, 359]] };

const ABOUT = {
  frame: {
    follow: 'Each frame is shifted so the rider holds still, as if one camera ran alongside the mare.',
    raw: 'Each crop exactly as it sits in its box on the card. The prints were trimmed and mounted by hand, so the horse wanders.',
  },
  ghost: {
    off: 'One exposure at a time.',
    trail: 'The three exposures before this one, fading.',
    all: 'All eleven exposures stacked, like a single long exposure of the whole stride.',
  },
};

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem('horse-in-motion:' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('horse-in-motion:' + k, v); } catch {} },
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  frame: 0,
  playing: !reduceMotion,
  speed: parseFloat(store.get('speed', '0.25')),
  framing: store.get('framing', 'follow'),
  ghost: store.get('ghost', 'off'),
  tone: store.get('tone', 'albumen'),
};
if (![0.125, 0.25, 0.5, 1].includes(state.speed)) state.speed = 0.25;

const canvas = $('screen');
const ctx = canvas.getContext('2d');
const wrap = $('screen-wrap');
const frames = [];
let stackCache = {};

// ---------- loading ----------
const src = i => `frames/f${String(i + 1).padStart(2, '0')}.jpg`;
const loadImg = s => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = s; });

// ---------- drawing ----------
function layout() {
  const stage = $('stage').getBoundingClientRect();
  const capH = $('stage').querySelector('.caption').offsetHeight;
  const availH = stage.height - (capH ? capH + 12 : 0) - 16;
  const availW = stage.width - 16;
  let w = Math.min(availW, availH * W / H, 1200);
  w = Math.max(200, Math.floor(w));
  const h = Math.round(w * H / W);
  wrap.style.width = w + 'px';
  wrap.style.height = h + 'px';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  draw();
}

function placeFrame(c, i, alpha = 1) {
  const s = c.canvas.width / W * ZOOM;
  const [ox, oy] = state.framing === 'raw' ? RAW[i] : [0, 0];
  const dw = W * s, dh = H * s;
  c.globalAlpha = alpha;
  c.drawImage(frames[i], (c.canvas.width - dw) / 2 + ox * s, (c.canvas.height - dh) / 2 + oy * s, dw, dh);
  c.globalAlpha = 1;
}

// the mean of all eleven frames, built once per framing and canvas size
function stack() {
  const key = `${state.framing}:${canvas.width}x${canvas.height}`;
  if (stackCache[key]) return stackCache[key];
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  const c = off.getContext('2d');
  for (let i = 0; i < N; i++) placeFrame(c, i, 1 / (i + 1));   // running average
  stackCache = { [key]: off };
  return off;
}

function draw() {
  if (frames.length < N) return;
  const i = state.frame;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#d8d1c3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.ghost === 'all') {
    ctx.drawImage(stack(), 0, 0);
    // the current exposure, laid over the stack as a darker figure
    ctx.globalCompositeOperation = 'darken';
    placeFrame(ctx, i, 0.65);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    placeFrame(ctx, i);
    if (state.ghost === 'trail') {
      ctx.globalCompositeOperation = 'darken';
      [0.34, 0.2, 0.1].forEach((a, k) => placeFrame(ctx, (i - k - 1 + N) % N, a));
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  updateReadout();
}

// ---------- readout, strip, card ----------
const stripCells = [];
function buildStrip() {
  const strip = $('strip');
  for (let i = 0; i < N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    b.setAttribute('aria-label', `Frame ${i + 1}${AIRBORNE.has(i + 1) ? ', all four hooves off the ground' : ''}`);
    b.innerHTML = `<img class="toned" src="${src(i)}" alt="" decoding="async"><span class="cell__n">${i + 1}</span>${AIRBORNE.has(i + 1) ? '<span class="cell__air" aria-hidden="true"></span>' : ''}`;
    b.addEventListener('click', () => { pause(); go(i); });
    strip.appendChild(b);
    stripCells.push(b);
  }
}

const hits = [];
function buildCard() {
  const box = $('card-img');
  CARD.cells.forEach(([x, y, w, h], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hit' + (i === N ? ' hit--still' : '');
    Object.assign(b.style, {
      left: (x / CARD.w * 100) + '%', top: (y / CARD.h * 100) + '%',
      width: (w / CARD.w * 100) + '%', height: (h / CARD.h * 100) + '%',
    });
    if (i < N) {
      b.setAttribute('aria-label', `Show frame ${i + 1}`);
      b.addEventListener('click', () => { pause(); go(i); $('card').close(); });
      hits.push(b);
    } else {
      b.setAttribute('aria-label', 'Frame 12: the mare standing still, not part of the stride');
      b.title = 'The mare standing still, for comparison';
    }
    box.appendChild(b);
  });
}

let lastShown = -1;
function updateReadout() {
  const i = state.frame;
  if (i === lastShown) return;
  lastShown = i;
  $('r-frame').textContent = `Frame ${i + 1} of ${N}`;
  const t = (i * INTERVAL).toFixed(2);
  $('r-detail').textContent = `${t} s · ${i * STEP_IN} in down the track${AIRBORNE.has(i + 1) ? ' · airborne' : ''}`;
  $('badge').classList.toggle('is-on', AIRBORNE.has(i + 1));
  stripCells.forEach((c, k) => c.setAttribute('aria-current', k === i ? 'true' : 'false'));
  hits.forEach((c, k) => c.setAttribute('aria-current', k === i ? 'true' : 'false'));
}

function go(i) {
  state.frame = ((i % N) + N) % N;
  draw();
}

// ---------- playback ----------
const ICON_PLAY = '<path d="M4.5 2.8v10.4L13 8z"/>';
const ICON_PAUSE = '<path d="M4 3h2.8v10H4zM9.2 3H12v10H9.2z"/>';
function syncPlay() {
  $('play-icon').innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
  $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
}
function play() { state.playing = true; acc = 0; syncPlay(); }
function pause() { state.playing = false; syncPlay(); }
function toggle() { state.playing ? pause() : play(); }

let acc = 0, last = performance.now();
function tick(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (state.playing && frames.length === N && !dragging) {
    acc += dt;
    const per = INTERVAL / state.speed;
    if (acc >= per) {
      const steps = Math.floor(acc / per);
      acc -= steps * per;
      go(state.frame + steps);
    }
  }
  requestAnimationFrame(tick);
}

// ---------- segmented controls ----------
function seg(id, key, onChange) {
  const el = $(id);
  const buttons = [...el.querySelectorAll('button')];
  const sync = () => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(state[key]))));
  buttons.forEach(b => b.addEventListener('click', () => {
    state[key] = key === 'speed' ? parseFloat(b.dataset.v) : b.dataset.v;
    store.set(key, state[key]);
    sync();
    onChange?.();
  }));
  sync();
  return sync;
}

function applyTone() { document.body.dataset.tone = state.tone; }
function applyAbout() {
  $('about-frame').textContent = ABOUT.frame[state.framing];
  $('about-ghost').textContent = ABOUT.ghost[state.ghost];
}

const syncSpeed = seg('seg-speed', 'speed', () => { acc = 0; });
seg('seg-frame', 'framing', () => { applyAbout(); draw(); });
seg('seg-ghost', 'ghost', () => { applyAbout(); draw(); });
seg('seg-tone', 'tone', applyTone);
applyTone();
applyAbout();

// ---------- scrubbing by drag ----------
let dragging = false, dragX = 0, dragFrame = 0, wasPlaying = false;
wrap.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  dragging = true; dragX = e.clientX; dragFrame = state.frame; wasPlaying = state.playing;
  wrap.setPointerCapture(e.pointerId);
});
wrap.addEventListener('pointermove', e => {
  if (!dragging) return;
  const per = Math.max(24, wrap.clientWidth / (N * 1.5));
  go(dragFrame + Math.round((e.clientX - dragX) / per));
});
const endDrag = e => {
  if (!dragging) return;
  dragging = false;
  // a tap without a drag toggles playback
  if (Math.abs(e.clientX - dragX) < 4) { wasPlaying ? pause() : play(); }
  else if (wasPlaying) play();
};
wrap.addEventListener('pointerup', endDrag);
wrap.addEventListener('pointercancel', endDrag);

// ---------- buttons and keys ----------
$('play').addEventListener('click', toggle);
$('prev').addEventListener('click', () => { pause(); go(state.frame - 1); });
$('next').addEventListener('click', () => { pause(); go(state.frame + 1); });

const card = $('card');
$('card-open').addEventListener('click', () => card.showModal());
$('card-close').addEventListener('click', () => card.close());
card.addEventListener('click', e => { if (e.target === card) card.close(); });

const side = $('side');
const viewToggle = $('view-toggle');
viewToggle.addEventListener('click', () => {
  const open = !side.classList.contains('is-open');
  side.classList.toggle('is-open', open);
  viewToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', e => {
  if (side.classList.contains('is-open') && !side.contains(e.target) && !viewToggle.contains(e.target)) {
    side.classList.remove('is-open');
    viewToggle.setAttribute('aria-expanded', 'false');
  }
});

const SPEEDS = [0.125, 0.25, 0.5, 1];
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (card.open && e.key.toLowerCase() !== 'c') return;
  const tag = document.activeElement?.tagName;
  if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); go(state.frame - 1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); go(state.frame + 1); }
  else if (e.key >= '1' && e.key <= '4') {
    state.speed = SPEEDS[+e.key - 1]; store.set('speed', state.speed); syncSpeed(); acc = 0;
  }
  else if (e.key.toLowerCase() === 'c') { card.open ? card.close() : card.showModal(); }
});

// ---------- start ----------
buildStrip();
buildCard();
syncPlay();
new ResizeObserver(() => layout()).observe($('stage'));
layout();

Promise.all(Array.from({ length: N }, (_, i) => loadImg(src(i)))).then(list => {
  frames.push(...list);
  $('loading').hidden = true;
  layout();
  last = performance.now();
  requestAnimationFrame(tick);
}).catch(() => {
  $('loading').textContent = 'The frames did not load. Try reloading the page.';
});

window.horse = { state, go, play, pause };
