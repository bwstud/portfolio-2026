/* Wicker Portrait: the page. Finds the face (MediaPipe, on this device), hands it to the loom, and runs the controls. */
import { Loom } from './weave.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2';
const MAX_SIDE = 1600, LIVE_SIDE = matchMedia('(max-width: 820px)').matches ? 960 : 1280;
const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

const CANES = {
  honey:  { lo: [0.27, 0.165, 0.085], hi: [0.74, 0.54, 0.32], gap: [0.03, 0.018, 0.01] },
  willow: { lo: [0.33, 0.28, 0.17], hi: [0.76, 0.66, 0.45], gap: [0.06, 0.05, 0.035] },
  smoked: { lo: [0.16, 0.09, 0.042], hi: [0.52, 0.33, 0.16], gap: [0.028, 0.016, 0.009] },
};
const STRAW = ['#3b2410', '#6e4520', '#9c6a33', '#c08d4e', '#dcb274', '#ecd09a'];

/* ---------------- settings (remembered per viewer) ---------------- */
const DEFAULTS = { strands: 60, pattern: 'twill', cane: 'honey', beard: 'none', flyaways: 60, grade: 'golden', hollow: false };
const store = { get() { try { return JSON.parse(localStorage.getItem('wicker-portrait') || '{}'); } catch { return {}; } }, set(v) { try { localStorage.setItem('wicker-portrait', JSON.stringify(v)); } catch {} } };
const S = { ...DEFAULTS, ...(params.has('fresh') ? {} : store.get()) };
const save = () => store.set({ strands: S.strands, pattern: S.pattern, cane: S.cane, beard: S.beard, flyaways: S.flyaways, grade: S.grade, hollow: S.hollow });

/* ---------------- the loom ---------------- */
const canvas = $('#portrait');
let loom;
try { loom = new Loom(canvas); }
catch (e) { fail('This browser can’t run the loom (it needs WebGL 2).'); throw e; }

let reveal = 0, original = false, seed = Math.random() * 10, faceCount = 0, flyCanvas = null, hasPhoto = false;
const opts = () => ({ strands: S.strands, pattern: S.pattern, cane: CANES[S.cane], beard: S.beard, flyaways: S.flyaways / 100, grade: S.grade, hollow: S.hollow, reveal, original, seed, debug: params.has('regions') });
const draw = () => loom.render(opts());

/* ---------------- models ---------------- */
let landmarker, hairSeg, personSeg, runMode = 'IMAGE';
const ready = (async () => {
  status('busy', 'Setting up the loom');
  const { FilesetResolver, FaceLandmarker, ImageSegmenter } = await import(MP + '/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(MP + '/wasm');
  const make = delegate => Promise.all([
    FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: 'models/face_landmarker.task', delegate }, runningMode: 'IMAGE', numFaces: 4, minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4 }),
    ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: 'models/hair_segmenter.tflite', delegate }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true }),
    ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: 'models/selfie_segmenter.tflite', delegate }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true }),
  ]);
  try { [landmarker, hairSeg, personSeg] = await make('GPU'); }
  catch { [landmarker, hairSeg, personSeg] = await make('CPU'); }
  status('on', 'Loom ready');
})().catch(e => { console.error(e); status('err', 'The loom didn’t load. Check your connection and reload.'); throw e; });

async function setMode(m) {
  if (runMode === m) return;
  runMode = m;
  await Promise.all([landmarker, hairSeg, personSeg].map(t => t.setOptions({ runningMode: m })));
}

/* a mask from MediaPipe as one byte per pixel; the last confidence mask is the hair or the person */
function maskBytes(result) {
  const masks = result.confidenceMasks; if (!masks || !masks.length) return null;
  const m = masks[masks.length - 1], f = m.getAsFloat32Array(), out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] * 255;
  return { data: out, w: m.width, h: m.height };
}
function segment(seg, src, ts) {
  let out = null;
  const cb = r => { out = maskBytes(r); };
  if (ts === undefined) seg.segment(src, cb); else seg.segmentForVideo(src, ts, cb);
  return out;
}
const smallCanvas = document.createElement('canvas'), smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
function small(src, side) {
  const k = side / Math.max(src.width, src.height);
  smallCanvas.width = Math.round(src.width * k); smallCanvas.height = Math.round(src.height * k);
  smallCtx.drawImage(src, 0, 0, smallCanvas.width, smallCanvas.height);
  return smallCtx.getImageData(0, 0, smallCanvas.width, smallCanvas.height);
}

/* ---------------- one photo, woven ---------------- */
const photoCanvas = document.createElement('canvas'), photoCtx = photoCanvas.getContext('2d');
let hairMask = null, stillReady = false;

async function weavePhoto(drawable, w, h, { animate = true, from = 0 } = {}) {
  await ready;
  await setMode('IMAGE');
  const k = MAX_SIDE / Math.max(w, h);            // small photos are scaled up too, so the strands stay crisp
  photoCanvas.width = Math.round(w * k); photoCanvas.height = Math.round(h * k);
  photoCtx.imageSmoothingQuality = 'high';
  photoCtx.drawImage(drawable, 0, 0, photoCanvas.width, photoCanvas.height);
  status('busy', 'Weaving');
  const t0 = performance.now();
  loom.setPhoto(photoCanvas);
  hairMask = segment(hairSeg, photoCanvas);
  const person = segment(personSeg, photoCanvas);
  let faces = landmarker.detect(photoCanvas).faceLandmarks || [];
  if (!faces.length && person) faces = findSmallFace(person);
  gateHair(hairMask, faces);
  hairMask ? loom.setMask('hair', hairMask.data, hairMask.w, hairMask.h) : loom.clearMask('hair');
  person ? loom.setMask('person', person.data, person.w, person.h) : loom.clearMask('person');
  faceCount = loom.setFaces(faces, small(photoCanvas, 256));
  seed = Math.random() * 10;
  makeFlyaways();
  const ms = Math.round(performance.now() - t0);
  hasPhoto = true; stillReady = true;
  document.body.classList.add('has-photo'); document.body.classList.remove('is-live');
  if (!faceCount) {
    status('warn', 'No face found. The face finder needs both eyes in view.');
    caption('No face found, so nothing was woven. Try a photo looking toward the camera.');
  } else {
    status('on', `Woven in ${ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s'}`);
    captionFor();
  }
  canvas.setAttribute('aria-label', faceCount ? `Your photo as a wicker portrait: ${faceCount === 1 ? 'a face' : faceCount + ' faces'} woven in cane, hair turned to straw.` : 'Your photo, with hair turned to straw. No face was found.');
  playReveal(animate && !reduceMotion, from);
}
function captionFor() {
  caption(`${faceCount > 1 ? faceCount + ' faces, ' : ''}${S.strands} strands across the face, ${S.pattern === 'twill' ? 'two over, two under' : 'one over, one under'}`);
}

let revealRaf = 0;
function playReveal(animate, from = 0) {
  cancelAnimationFrame(revealRaf);
  const END = 1.6;
  if (!animate) { reveal = END; draw(); return; }
  const dur = 2400 * (1 - from / END), t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    reveal = from + (END - from) * (1 - Math.pow(1 - t, 2.2));
    draw();
    if (t < 1) revealRaf = requestAnimationFrame(step);
  };
  revealRaf = requestAnimationFrame(step);
}

/* stray straws: short curved strands standing out from the edge of the hair, the way the husband's hair blows about */
function makeFlyaways() {
  const W = photoCanvas.width, H = photoCanvas.height;
  if (!hairMask) { loom.setFly(null); return; }
  const { data: m, w: mw, h: mh } = hairMask;
  const f0 = loom.faces[0], D = f0 ? f0.D : Math.min(W, H) * 0.15, fc = f0 ? f0.c : [W / 2, H / 2];
  const sx = mw / W, sy = mh / H, at = (x, y) => m[Math.min(mh - 1, Math.max(0, Math.round(y * sy))) * mw + Math.min(mw - 1, Math.max(0, Math.round(x * sx)))];
  const step = Math.max(2, Math.round(D / 40)), edge = [];
  for (let y = step; y < H - step; y += step) for (let x = step; x < W - step; x += step) {
    if (at(x, y) < 140) continue;
    if (at(x + step, y) < 110 || at(x - step, y) < 110 || at(x, y + step) < 110 || at(x, y - step) < 110) edge.push([x, y]);
  }
  fly.width = W; fly.height = H;
  const ctx = fly.getContext('2d'); ctx.clearRect(0, 0, W, H);
  let s = Math.floor(seed * 1e6) >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = edge.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [edge[i], edge[j]] = [edge[j], edge[i]]; }
  const n = Math.min(edge.length, 900);
  ctx.lineCap = 'round';
  const g = step * 2;
  for (let i = 0; i < n; i++) {
    const [x, y] = edge[i];
    let nx = (at(x - g, y) - at(x + g, y)), ny = (at(x, y - g) - at(x, y + g));
    const nl = Math.hypot(nx, ny); if (nl < 1) continue; nx /= nl; ny /= nl;            // outward, from hair to not-hair
    const tx = -ny, ty = nx;
    const toFace = ((fc[0] - x) * nx + (fc[1] - y) * ny) / (Math.hypot(fc[0] - x, fc[1] - y) || 1);
    const r = rnd(), L = D * (0.04 + 0.26 * r * r) * (toFace > 0.3 ? 0.3 : 1);
    const bend = (rnd() - 0.5) * 1.4;                                                 // frizz, not whiskers: every straw bends
    const dx = nx + tx * bend * 0.6, dy = ny + ty * bend * 0.6 - 0.12, dl = Math.hypot(dx, dy);
    const ux = dx / dl, uy = dy / dl;
    const ex = x + ux * L + tx * bend * L * 0.35, ey = y + uy * L + ty * bend * L * 0.35;
    const cx = x + ux * L * 0.55, cy = y + uy * L * 0.55;
    ctx.strokeStyle = STRAW[Math.floor(rnd() * STRAW.length)];
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    ctx.lineWidth = Math.max(0.6, D / 300) * (0.5 + rnd() * 0.9);
    ctx.beginPath(); ctx.moveTo(x - ux * L * 0.3, y - uy * L * 0.3); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  loom.setFly(fly);
}
const fly = document.createElement('canvas');

/* a face too small for the detector: look again, closer, at the top of the person */
const cropCanvas = document.createElement('canvas'), cropCtx = cropCanvas.getContext('2d');
function findSmallFace(person) {
  const { data, w, h } = person, W = photoCanvas.width, H = photoCanvas.height;
  let top = -1, x0 = w, x1 = 0, bottom = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[y * w + x] > 128) { if (top < 0) top = y; bottom = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (top < 0) return [];
  const bh = bottom - top; let sx = 0, n = 0;
  for (let y = top; y < top + bh * 0.06; y++) for (let x = 0; x < w; x++) if (data[y * w + x] > 128) { sx += x; n++; }
  if (!n) return [];
  const k = W / w, size = Math.max(64, bh * 0.34) * k, cx = (sx / n) * k, cy = top * k + size * 0.42;
  const sx0 = Math.max(0, cx - size / 2), sy0 = Math.max(0, cy - size / 2), sw = Math.min(W - sx0, size), sh = Math.min(H - sy0, size);
  cropCanvas.width = 640; cropCanvas.height = Math.round(640 * sh / sw);
  cropCtx.drawImage(photoCanvas, sx0, sy0, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
  const found = landmarker.detect(cropCanvas).faceLandmarks || [];
  return found.map(lm => lm.map(p => ({ x: (sx0 + p.x * sw) / W, y: (sy0 + p.y * sh) / H, z: p.z * sw / W })));
}

/* straw only where hair could be: around a face, never on a black shirt three heads below it */
function gateHair(mask, faces) {
  if (!mask) return;
  const { data, w, h } = mask;
  if (!faces.length) { data.fill(0); return; }
  const fs = faces.map(lm => {
    const ax = lm[33].x * w, ay = lm[33].y * h, bx = lm[263].x * w, by = lm[263].y * h;
    const D = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / D, uy = (by - ay) / D;
    return { cx: lm[168].x * w, cy: lm[168].y * h, D, ux, uy };
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!data[i]) continue;
    let g = 0;
    for (const f of fs) {
      const rx = x - f.cx, ry = y - f.cy, qx = (rx * f.ux + ry * f.uy) / f.D, qy = (-rx * f.uy + ry * f.ux) / f.D;
      const e = Math.hypot(qx / 2.3, qy / (qy < 0 ? 2.2 : 4.2));      // up to the crown, out past the ears, down to long hair on the shoulders
      g = Math.max(g, 1 - Math.min(1, Math.max(0, (e - 0.85) / 0.25)));
    }
    data[i] *= g;
  }
}

/* ---------------- input: a file, a drop, a paste ---------------- */
async function openFile(file) {
  if (!file || !file.type.startsWith('image/')) { status('warn', 'That isn’t an image. Try a JPEG or PNG.'); return; }
  stopLive();
  const url = URL.createObjectURL(file), img = new Image();
  img.src = url;
  try { await img.decode(); }
  catch { URL.revokeObjectURL(url); status('warn', 'This browser can’t open that file. Try a JPEG or PNG.'); return; }
  await weavePhoto(img, img.naturalWidth, img.naturalHeight);
  URL.revokeObjectURL(url);
}
async function openURL(src) {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src; await img.decode();
  await weavePhoto(img, img.naturalWidth, img.naturalHeight, { animate: !params.has('still') });
}
$('#file').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
document.querySelectorAll('[data-act="choose"]').forEach(b => b.addEventListener('click', () => $('#file').click()));
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('is-drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('is-drag'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('is-drag'); openFile(e.dataTransfer.files[0]); });
addEventListener('paste', e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (it) openFile(it.getAsFile()); });

/* ---------------- the camera: a live wicker mirror ---------------- */
const video = document.createElement('video'); video.playsInline = true; video.muted = true;
let stream = null, liveRaf = 0, lastTs = 0, frameN = 0, liveSmall = null;
const liveCanvas = document.createElement('canvas'), liveCtx = liveCanvas.getContext('2d');
async function startLive() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) { status('warn', 'This browser can’t reach a camera. Choose a photo instead.'); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }); }
  catch (e) { status('warn', e.name === 'NotAllowedError' ? 'The camera was blocked. Allow it in the address bar, or choose a photo.' : 'No camera could be opened. Choose a photo instead.'); return; }
  video.srcObject = stream; await video.play();
  await ready; await setMode('VIDEO');
  document.body.classList.add('is-live', 'has-photo');
  hasPhoto = true; reveal = 1.6; loom.setFly(null);
  status('on', 'Live. Hold still, then take the portrait.');
  caption('Live, at ' + LIVE_SIDE + ' pixels. The portrait is woven at full size.');
  const k = Math.min(1, LIVE_SIDE / Math.max(video.videoWidth, video.videoHeight));
  liveCanvas.width = Math.round(video.videoWidth * k); liveCanvas.height = Math.round(video.videoHeight * k);
  $('#shutter').focus({ preventScroll: true });
  const tick = () => {
    if (!stream) return;
    liveRaf = requestAnimationFrame(tick);
    if (video.readyState < 2) return;
    liveCtx.save(); liveCtx.translate(liveCanvas.width, 0); liveCtx.scale(-1, 1);     // a mirror, as people expect a selfie to look
    liveCtx.drawImage(video, 0, 0, liveCanvas.width, liveCanvas.height); liveCtx.restore();
    let ts = performance.now(); if (ts <= lastTs) ts = lastTs + 1; lastTs = ts;
    loom.setPhoto(liveCanvas);
    const faces = landmarker.detectForVideo(liveCanvas, ts).faceLandmarks || [];
    if (frameN % 2 === 0) { const h = segment(hairSeg, liveCanvas, ts); if (h) { gateHair(h, faces); loom.setMask('hair', h.data, h.w, h.h); } }
    const p = segment(personSeg, liveCanvas, ts); if (p) loom.setMask('person', p.data, p.w, p.h);
    if (frameN % 4 === 0 || !liveSmall) liveSmall = small(liveCanvas, 128);
    faceCount = loom.setFaces(faces, liveSmall);
    frameN++;
    draw();
  };
  tick();
}
function stopLive() {
  if (!stream) return;
  cancelAnimationFrame(liveRaf);
  stream.getTracks().forEach(t => t.stop()); stream = null;
  document.body.classList.remove('is-live');
}
async function takePortrait() {
  if (!stream) return;
  const w = video.videoWidth, h = video.videoHeight;
  const snap = document.createElement('canvas'); snap.width = w; snap.height = h;
  const c = snap.getContext('2d'); c.translate(w, 0); c.scale(-1, 1); c.drawImage(video, 0, 0, w, h);
  stopLive();
  const flash = $('#flash'); flash.classList.remove('is-on'); void flash.offsetWidth; flash.classList.add('is-on');
  await weavePhoto(snap, w, h, { from: 0.95 });
}
document.querySelectorAll('[data-act="camera"]').forEach(b => b.addEventListener('click', startLive));
$('#shutter').addEventListener('click', takePortrait);
$('#cancel-live').addEventListener('click', () => { stopLive(); if (!stillReady) { hasPhoto = false; document.body.classList.remove('has-photo'); status('on', 'Loom ready'); } else weavePhoto(photoCanvas, photoCanvas.width, photoCanvas.height, { animate: false }); });

/* ---------------- controls ---------------- */
function fader(id, { min, max, step = 1, digits = 0, get, set }) {
  const range = $('#' + id), num = $('#' + id + '-n');
  let current = get();
  const show = v => { range.value = v; num.value = (+v).toFixed(digits); };
  show(current);
  range.addEventListener('input', () => { current = +range.value; num.value = current.toFixed(digits); set(current); });
  num.addEventListener('input', () => { const v = parseFloat(num.value); if (isFinite(v) && v >= min && v <= max) { current = v; range.value = v; set(v); } });   // in range: takes effect as typed
  const tidy = () => {
    let v = parseFloat(num.value); const empty = !isFinite(v);
    if (empty) v = current;                                    // empty: back to the current value
    const c = Math.min(max, Math.max(min, v));                 // outside: to the nearest end
    if (c !== current) { current = c; set(c); }
    range.value = c;
    if (empty || c !== v) num.value = c.toFixed(digits);       // otherwise the typed number stays as typed
  };
  num.addEventListener('change', tidy); num.addEventListener('blur', tidy);
  num.addEventListener('keydown', e => { if (e.key === 'Enter') { tidy(); num.blur(); } });
}
const rerender = () => { save(); if (hasPhoto && !stream) { cancelAnimationFrame(revealRaf); reveal = 1.6; draw(); } if (faceCount && !stream) captionFor(); };
fader('strands', { min: 30, max: 90, get: () => S.strands, set: v => { S.strands = v; rerender(); } });
fader('flyaways', { min: 0, max: 100, get: () => S.flyaways, set: v => { S.flyaways = v; rerender(); } });

document.querySelectorAll('.m-seg[data-key]').forEach(seg => {
  const key = seg.dataset.key, buttons = [...seg.querySelectorAll('button')];
  const sync = () => buttons.forEach(b => { const on = b.value === S[key]; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  sync();
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => { S[key] = b.value; sync(); rerender(); });
    b.addEventListener('keydown', e => {                      // arrow keys move through a radio group
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
      e.preventDefault(); const nb = buttons[(i + d + buttons.length) % buttons.length]; nb.focus(); nb.click();
    });
  });
});
const hollow = $('#hollow');
hollow.setAttribute('aria-pressed', S.hollow);
hollow.addEventListener('click', () => { S.hollow = !S.hollow; hollow.setAttribute('aria-pressed', S.hollow); rerender(); });

/* compare: hold to see the photo as it was */
const cmp = $('#compare');
const hold = on => { if (!hasPhoto) return; original = on; cmp.setAttribute('aria-pressed', on); draw(); };
cmp.addEventListener('pointerdown', e => { e.preventDefault(); cmp.setPointerCapture(e.pointerId); hold(true); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => cmp.addEventListener(ev, () => hold(false)));
cmp.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hold(true); } });
cmp.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false); });
cmp.addEventListener('contextmenu', e => e.preventDefault());

/* save and share */
const blob = () => new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.93));
$('#save').addEventListener('click', async () => {
  if (!hasPhoto) return;
  const b = await blob(), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'wicker-portrait.jpg'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  status('on', 'Saved');
});
const shareBtn = $('#share');
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] })) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', async () => {
    const f = new File([await blob()], 'wicker-portrait.jpg', { type: 'image/jpeg' });
    try { await navigator.share({ files: [f], title: 'Wicker portrait' }); } catch {}
  });
}
document.querySelectorAll('[data-act="new"]').forEach(b => b.addEventListener('click', () => $('#file').click()));

/* keys: C to compare, S to save */
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.key === 'c') hold(true);
  if (e.key === 's' && hasPhoto) $('#save').click();
  if (e.key === ' ' && stream && e.target === document.body) { e.preventDefault(); takePortrait(); }
});
addEventListener('keyup', e => { if (e.key === 'c') hold(false); });

/* ---------------- status and caption ---------------- */
function status(kind, text) {
  const s = $('#status'); if (!s) return;
  s.querySelector('.m-led').className = 'm-led' + (kind === 'busy' ? ' m-led--busy is-on' : kind === 'on' ? ' is-on' : '');
  s.dataset.kind = kind;
  s.querySelector('span:last-child').textContent = text;
}
function caption(text) { $('#caption').textContent = text; }
function fail(text) { status('err', text); document.body.classList.add('is-broken'); }

/* for testing: ?photo=<same-origin url> weaves that photo on load */
if (params.get('photo')) openURL(params.get('photo')).catch(e => { console.error(e); status('err', String(e)); });
window.__wicker = { S, draw, openURL, get loom() { return loom; }, get reveal() { return reveal; }, get frames() { return frameN; } };
