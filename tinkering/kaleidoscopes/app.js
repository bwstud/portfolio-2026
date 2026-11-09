/* Kaleidoscopes: the viewing page. Pick a kaleidoscope and a picture (or add your own photo
   or video), then drag, turn and magnify it under the mirrors. */
import { Scope } from './scope.js';
import { loadAll, decodeShare } from './configs.js';
import { GALLERY, galleryUrl, thumbUrl, loadImageUrl, loadFile, creditLine } from './sources.js';
import { attachGestures, renderThumb, download, fileSlug, toaster, store } from './shared.js';

const $ = id => document.getElementById(id);
const canvas = $('scope');
const toast = toaster($('toast'));

let scope;
try {
  scope = new Scope(canvas);
} catch (e) {
  document.body.innerHTML = `<p class="fatal">${e.message}</p>`;
  throw e;
}

const state = {
  configs: [],
  config: null,
  picture: null,      // { kind, el, title, credit?, galleryId?, url? }
  user: { x: 0, y: 0, rot: 0, scale: 1 },
  turning: true,
  t: 0,
};

/* ---------- kaleidoscope strip ---------- */
function scopeTiles() {
  const strip = $('scopes');
  strip.replaceChildren();
  for (const cfg of state.configs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.dataset.id = cfg.id;
    b.title = cfg.about || cfg.name;
    b.setAttribute('aria-pressed', String(cfg === state.config));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const name = document.createElement('span');
    name.className = 'tile__name';
    name.textContent = cfg.name;
    b.append(c, name);
    if (cfg.origin === 'browser' || cfg.origin === 'project' || cfg.origin === 'shared') {
      const badge = document.createElement('span');
      badge.className = 'tile__badge';
      badge.textContent = cfg.origin === 'shared' ? 'Shared' : 'Yours';
      b.append(badge);
    }
    b.addEventListener('click', () => chooseConfig(cfg));
    strip.append(b);
  }
  drawThumbs();
}

function drawThumbs() {
  if (!state.picture) return;
  for (const b of $('scopes').children) {
    const cfg = state.configs.find(c => c.id === b.dataset.id);
    if (cfg) renderThumb(b.querySelector('canvas'), cfg.params, state.picture.el);
  }
}

function chooseConfig(cfg, { quiet = false } = {}) {
  state.config = cfg;
  for (const b of $('scopes').children) b.setAttribute('aria-pressed', String(b.dataset.id === cfg.id));
  $('scopes').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (cfg.origin !== 'shared') store.set('kaleidoscopes:config', cfg.id);
  updateTitle();
  if (!quiet && cfg.about) toast(`${cfg.name}. ${cfg.about}`);
}

function step(list, current, dir) {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length];
}

/* ---------- picture strip ---------- */
function pictureTiles() {
  const strip = $('pictures');
  for (const g of GALLERY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile tile--pic';
    b.dataset.id = g.id;
    b.title = `${g.title}, ${g.by}`;
    b.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img');
    img.src = thumbUrl('', g);
    img.alt = '';
    img.loading = 'lazy';
    const name = document.createElement('span');
    name.className = 'tile__name';
    name.textContent = g.title.split(',')[0];
    b.append(img, name);
    b.addEventListener('click', () => chooseGallery(g));
    strip.append(b);
  }
}

function markPicture(id) {
  for (const b of $('pictures').querySelectorAll('.tile[data-id]')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
}

let loadToken = 0;
async function chooseGallery(g) {
  const token = ++loadToken;
  markPicture(g.id);
  try {
    const el = await loadImageUrl(galleryUrl('', g));
    if (token !== loadToken) return;
    setPicture({ kind: 'image', el, title: g.title, gallery: g });
    store.set('kaleidoscopes:picture', g.id);
  } catch (e) {
    toast(e.message, { bad: true });
  }
}

async function chooseFile(file) {
  if (!file) return;
  const token = ++loadToken;
  toast('Opening…', { ms: 8000 });
  try {
    const pic = await loadFile(file);
    if (token !== loadToken) { if (pic.url) URL.revokeObjectURL(pic.url); return; }
    markPicture(null);
    setPicture(pic);
    toast(pic.kind === 'video' ? 'Your video is playing under the mirrors.' : 'Your photo is under the mirrors.');
  } catch (e) {
    toast(e.message, { bad: true, ms: 5000 });
  }
}

function setPicture(pic) {
  const old = state.picture;
  if (old && old !== pic) {
    if (old.kind === 'video') { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); }
    if (old.url) URL.revokeObjectURL(old.url);
  }
  state.picture = pic;
  scope.setSource(pic.el);
  Object.assign(state.user, { x: 0, y: 0, rot: 0, scale: 1 });
  const video = pic.kind === 'video';
  $('video-play').hidden = !video;
  $('video-sound').hidden = !video;
  if (video) {
    $('video-play').textContent = 'Pause video';
    $('video-sound').textContent = 'Sound off';
    $('video-sound').setAttribute('aria-pressed', 'false');
  }
  const credit = $('credit');
  if (pic.gallery) {
    credit.innerHTML = '';
    const a = document.createElement('a');
    a.href = pic.gallery.source;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = creditLine(pic.gallery);
    credit.append(a);
  } else {
    credit.textContent = `${pic.title} · stays in your browser`;
  }
  updateTitle();
  drawThumbs();
  // a video's thumbnails come from its first frame, so draw them again once it's moving
  if (video) setTimeout(drawThumbs, 600);
}

function updateTitle() {
  const parts = [state.config?.name, state.picture?.gallery?.title ?? state.picture?.title].filter(Boolean);
  $('current').textContent = parts.join(' · ');
}

/* ---------- controls ---------- */
$('add').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', e => { chooseFile(e.target.files[0]); e.target.value = ''; });

function setTurning(on) {
  state.turning = on;
  $('turning').setAttribute('aria-pressed', String(on));
  $('turning-text').textContent = on ? 'Turning' : 'Held still';
  $('turning-icon').setAttribute('d', on ? 'M3 2h2v8H3zM7 2h2v8H7z' : 'M3 2l7 4-7 4z');
}
$('turning').addEventListener('click', () => setTurning(!state.turning));

const gestures = attachGestures(canvas, { user: state.user, config: () => state.config.params });
$('reset').addEventListener('click', () => { gestures.reset(); state.t = 0; });

$('video-play').addEventListener('click', () => {
  const v = state.picture?.el;
  if (!(v instanceof HTMLVideoElement)) return;
  if (v.paused) { v.play(); $('video-play').textContent = 'Pause video'; }
  else { v.pause(); $('video-play').textContent = 'Play video'; }
});
$('video-sound').addEventListener('click', () => {
  const v = state.picture?.el;
  if (!(v instanceof HTMLVideoElement)) return;
  v.muted = !v.muted;
  $('video-sound').textContent = v.muted ? 'Sound off' : 'Sound on';
  $('video-sound').setAttribute('aria-pressed', String(!v.muted));
});

/* snapshot: drawn and read back in the same frame, so the buffer is still there */
let snapPending = false;
$('snap').addEventListener('click', () => { snapPending = true; });
function takeSnapshot() {
  snapPending = false;
  canvas.toBlob(blob => {
    if (!blob) return toast('That picture could not be saved.', { bad: true });
    download(blob, `${fileSlug(state.config.name)}-${Date.now()}.png`);
    toast('Saved a picture.');
  }, 'image/png');
}

/* recording a clip */
let recorder = null, recordStart = 0, recordTimer = null;
function recordType() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'];
  return types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
}
$('record').addEventListener('click', () => {
  if (recorder) { recorder.stop(); return; }
  const type = recordType();
  if (!type || !canvas.captureStream) return toast('This browser cannot record the canvas.', { bad: true });
  const stream = canvas.captureStream(60);
  const v = state.picture?.el;
  if (v instanceof HTMLVideoElement && !v.muted && v.captureStream) {
    for (const track of v.captureStream().getAudioTracks()) stream.addTrack(track);
  }
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    clearInterval(recordTimer);
    $('record').classList.remove('is-on');
    $('record-text').textContent = 'Record';
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: type.split(';')[0] }), `${fileSlug(state.config.name)}-${Date.now()}.${ext}`);
    toast('Saved the clip.');
    recorder = null;
  };
  recorder.start(250);
  recordStart = performance.now();
  $('record').classList.add('is-on');
  const tick = () => {
    const s = Math.floor((performance.now() - recordStart) / 1000);
    $('record-text').textContent = `Stop ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  tick();
  recordTimer = setInterval(tick, 500);
});

$('full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here.', { bad: true }));
});

function setUiHidden(hidden) {
  document.body.classList.toggle('ui-hidden', hidden);
  $('show').hidden = !hidden;
}
$('hide').addEventListener('click', () => setUiHidden(true));
$('show').addEventListener('click', () => setUiHidden(false));

window.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowright' || k === 'arrowleft') {
    chooseConfig(step(state.configs, state.config, k === 'arrowright' ? 1 : -1));
    e.preventDefault();
  } else if (k === ']' || k === '[') {
    const current = GALLERY.find(g => g === state.picture?.gallery) ?? GALLERY[0];
    chooseGallery(step(GALLERY, current, k === ']' ? 1 : -1));
  } else if (k === ' ') {
    if (e.target.closest('button')) return;
    setTurning(!state.turning);
    e.preventDefault();
  } else if (k === 's') snapPending = true;
  else if (k === 'r') $('record').click();
  else if (k === 'f') $('full').click();
  else if (k === 'h') setUiHidden(!document.body.classList.contains('ui-hidden'));
  else if (k === 'escape' && document.body.classList.contains('ui-hidden')) setUiHidden(false);
});

/* drag and drop anywhere */
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('drop').hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop').hidden = true; });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  $('drop').hidden = true;
  chooseFile(e.dataTransfer?.files?.[0]);
});

/* ---------- loop ---------- */
/* The eyepiece sits in the space between the header and the dock, not behind them. */
function viewFrame() {
  const w = innerWidth, h = innerHeight;
  if (document.body.classList.contains('ui-hidden')) return { x: w / 2, y: h / 2, size: Math.min(w, h) };
  const top = 52;
  const bottom = Math.max(top + 160, document.querySelector('.dock').getBoundingClientRect().top - 6);
  return { x: w / 2, y: (top + bottom) / 2, size: Math.min(w, bottom - top) };
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.turning) state.t += dt;
  scope.resize();
  scope.frame = viewFrame();
  if (state.config && state.picture) scope.draw(state.config.params, state.t, state.user);
  if (snapPending) takeSnapshot();
  requestAnimationFrame(frame);
}

/* ---------- start ---------- */
async function start() {
  pictureTiles();
  state.configs = await loadAll('');

  const params = new URLSearchParams(location.search);
  const shared = location.hash.startsWith('#c=') ? decodeShare(location.hash.slice(3)) : null;
  if (shared) state.configs.unshift(shared);
  const wanted = shared?.id ?? params.get('config') ?? store.get('kaleidoscopes:config');
  state.config = state.configs.find(c => c.id === wanted) ?? state.configs[0];

  const picId = params.get('picture') ?? store.get('kaleidoscopes:picture');
  const g = GALLERY.find(x => x.id === picId) ?? GALLERY[1];
  scopeTiles();
  chooseConfig(state.config, { quiet: true });
  await chooseGallery(g);
  if (shared) toast(`Showing “${shared.name}” from a shared link.`);
  requestAnimationFrame(frame);
}
start();
