// Diffusion Studio: the stage, the pipeline that draws it, and the hand that works the surface.

import * as G from './gl.js';
import * as SH from './shaders.js';
import { DEFAULTS, TABS, LOOKS, MATERIALS, SCENES, TYPE_KEYS, TEXT_KEYS, LAYER_TEXT_KEYS, LAMP_PRESETS } from './schema.js';
import { buildPanel } from './ui.js';
import { setWords, setLayers, LAYERS } from './text.js';
import { createTimeline } from './timeline.js';
import { createSaved } from './saved.js';

const $ = (id) => document.getElementById(id);
const S = { ...DEFAULTS, tl: structuredClone(DEFAULTS.tl) };
const LAYER_KEYS = Object.keys(DEFAULTS).filter((k) => /^l\d\./.test(k));
const stage = $('stage'), cvs = $('view');

// ---- colour ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; };
// a black body's colour at a temperature, normalised so its brightest channel is 1 (linear light)
function kelvin(K) {
  const t = K / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * (t - 60) ** -0.1332047592; g = 288.1221695283 * (t - 60) ** -0.0755148492; b = 255; }
  const c = [r, g, b].map((v) => lin(Math.min(255, Math.max(0, v)) / 255));
  const m = Math.max(...c); return c.map((v) => v / m);
}
const mul = (a, b) => a.map((v, i) => v * (Array.isArray(b) ? b[i] : b));
// a gel's hue turned by some fraction of the circle (a white gel is given colour to turn)
function hueTurn(h, turns) {
  const n = parseInt(h.slice(1), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0; if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hh = (hh / 6 + turns) % 1; if (hh < 0) hh += 1;
  const sat = Math.max(mx ? d / mx : 0, 0.85), v = Math.max(mx, 0.9);
  const k = (m) => { const x = (m + hh * 6) % 6; return v - v * sat * Math.max(0, Math.min(x, 4 - x, 1)); };
  return [k(5), k(3), k(1)].map(lin);
}

// ---- the camera ----
// Zoom, pan and roll set which part of the pane the render covers (an affine from render uv to pane cm); orbit
// (yaw and pitch) then looks at that flat render in perspective, from an eye circling the pane's centre. The
// render covers the box the tilted view needs. Zoom 1 fills the view with the pane.
const F0 = 1.6;                                  // the eye's distance, in view heights: a moderate lens
const rad = (d) => (d * Math.PI) / 180;
function orbitMatrix() {
  const y = rad(-S['cam.yaw']), x = rad(S['cam.pitch']);
  const cy = Math.cos(y), sy = Math.sin(y), cx = Math.cos(x), sx = Math.sin(x);
  // Ry(yaw) · Rx(pitch), column-major for GLSL
  const m = [[cy, 0, -sy], [sy * sx, cx, cy * sx], [sy * cx, -sx, cy * cx]];   // columns
  return m;
}
const mv = (m, v) => [0, 1, 2].map((r) => m[0][r] * v[0] + m[1][r] * v[1] + m[2][r] * v[2]);
// a screen point (0 … 1, y up) to the flat render's f space (0 … 1 when untilted), or null if it misses the pane plane
function screenToF(sx, sy, m = orbitMatrix(), aspect = W / H) {
  const ndc = [(sx - 0.5) * aspect, sy - 0.5];
  const E = mv(m, [0, 0, -F0]), R = mv(m, [ndc[0], ndc[1], F0]);
  if (R[2] <= 1e-4) return null;
  const t = -E[2] / R[2];
  return [(E[0] + R[0] * t) / aspect + 0.5, E[1] + R[1] * t + 0.5];
}
let cam = null;
function camera() {
  const aspect = W / H, m = orbitMatrix();
  const cover = Math.min(S['pane.w'], S['pane.h'] * aspect);
  const Vw = cover / S['cam.zoom'], Vh = Vw / aspect;
  let bb = [0, 0, 1, 1];
  if (S['cam.yaw'] || S['cam.pitch']) {
    const pts = [];
    for (let i = 0; i <= 4; i++) for (const [x, y] of [[i / 4, 0], [i / 4, 1], [0, i / 4], [1, i / 4]]) {
      const f = screenToF(x, y, m, aspect);
      pts.push(f ? f.map((v) => Math.max(-2.5, Math.min(3.5, v))) : [x < 0.5 ? -2.5 : 3.5, y < 0.5 ? -2.5 : 3.5]);
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  }
  const r = rad(S['cam.roll']), cr = Math.cos(r), sr = Math.sin(r);
  const rot = ([x, y]) => [cr * x - sr * y, sr * x + cr * y];
  const C = [S['cam.panx'], S['cam.pany']];
  const o = rot([(bb[0] - 0.5) * Vw, (bb[1] - 0.5) * Vh]);
  const O = [C[0] + o[0], C[1] + o[1]], Ax = rot([bb[2] * Vw, 0]), Ay = rot([0, bb[3] * Vh]);
  const det = Ax[0] * Ay[1] - Ay[0] * Ax[1];
  const toUv = [Ay[1] / det, -Ax[1] / det, -Ay[0] / det, Ax[0] / det];   // column-major inverse of [Ax Ay]
  const pxCm = Math.sqrt((W * H) / ((bb[2] * Vw) * (bb[3] * Vh)));
  // the eye's offset, in pane cm per cm of depth: what is behind shifts by it as the view turns
  const E = mv(m, [0, 0, -F0]);
  const view = rot([E[0] / E[2], E[1] / E[2]]);
  cam = { O, Ax, Ay, toUv, pxCm, bb, m, view, key: '' };
  return cam;
}
const paneAt = (u, v) => [cam.O[0] + cam.Ax[0] * u + cam.Ay[0] * v, cam.O[1] + cam.Ax[1] * u + cam.Ay[1] * v];
const paneUv = ([x, y]) => [x / S['pane.w'] + 0.5, y / S['pane.h'] + 0.5];
const CAM_KEYS = ['cam.zoom', 'cam.panx', 'cam.pany', 'cam.roll', 'cam.yaw', 'cam.pitch', 'pane.w', 'pane.h'];
const camKey = () => CAM_KEYS.map((k) => S[k]).join(',') + `,${W},${H}`;

// ---- GL ----
let gl, P = {}, W = 0, H = 0, pyrN1, pyrN2, pyrMask, pyrC, textTex, srcFbo, stateA, stateB, stateW = 0, stateH = 0;
let pyrLay, layTex, pyrGob, pyrSh, dummy;
let textInfo = { bbox: [0.4, 0.4, 0.6, 0.6], points: [], centre: [0.5, 0.5] };
let layInfo = { boxes: [] };
let textDirty = true, layerDirty = true, resetState = true, failed = false;
// the left side of a comparison draws with its own words and layers
const resA = { textTex: null, pyrMask: null, layTex: null, pyrLay: null, textInfo: null, layInfo: null, key: '' };
let abTex = null, abFbo = null;
function swapRes() {
  [textTex, resA.textTex] = [resA.textTex, textTex]; [pyrMask, resA.pyrMask] = [resA.pyrMask, pyrMask];
  [layTex, resA.layTex] = [resA.layTex, layTex]; [pyrLay, resA.pyrLay] = [resA.pyrLay, pyrLay];
  [textInfo, resA.textInfo] = [resA.textInfo, textInfo]; [layInfo, resA.layInfo] = [resA.layInfo, layInfo];
}
const canvasTex = () => { const t = G.texture(gl, W, H, { format: 'rgba8' }); gl.bindTexture(gl.TEXTURE_2D, t.t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };

function init() {
  try {
    gl = G.context(cvs);
    P.copy = G.program(gl, SH.COPY, 'copy');
    P.source = G.program(gl, SH.SOURCE, 'source');
    P.state = G.program(gl, SH.STATE, 'state');
    P.comp = G.program(gl, SH.COMPOSITE, 'composite');
    P.final = G.program(gl, SH.FINAL, 'final');
    P.gobo = G.program(gl, SH.GOBO, 'gobo');
    P.shaft = G.program(gl, SH.SHAFT, 'shaft');
    P.trace = G.program(gl, SH.TRACE, 'trace');
    dummy = G.texture(gl, 1, 1, { format: 'rgba8' });
  } catch (e) { fail(e); return false; }
  return true;
}
function fail(e) {
  failed = true; console.error(e);
  $('fail').hidden = false; $('fail').textContent = String(e.message || e).split('\n')[0];
}

function resize() {
  const r = stage.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2) * S['cam.scale'];
  let w = Math.round(r.width * scale), h = Math.round(r.height * scale);
  const cap = 2400 / Math.max(w, h); if (cap < 1) { w = Math.round(w * cap); h = Math.round(h * cap); }
  w = Math.max(64, w); h = Math.max(64, h);
  if (still) { w = still.w; h = still.h; }
  if (w === W && h === H) return;
  W = w; H = h; cvs.width = W; cvs.height = H;
  for (const p of [pyrN1, pyrN2, pyrMask, pyrC, pyrLay, pyrGob, pyrSh, resA.pyrMask, resA.pyrLay]) p?.dispose();
  pyrN1 = G.pyramid(gl, W, H); pyrN2 = G.pyramid(gl, W, H); pyrMask = G.pyramid(gl, W, H); pyrC = G.pyramid(gl, W, H);
  pyrLay = G.pyramid(gl, W, H); pyrGob = G.pyramid(gl, W, H); pyrSh = G.pyramid(gl, Math.max(16, W >> 2), Math.max(16, H >> 2));
  for (const t of [layTex, resA.textTex, resA.layTex, abTex]) if (t) gl.deleteTexture(t.t);
  layTex = canvasTex();
  Object.assign(resA, { textTex: null, pyrMask: null, layTex: null, pyrLay: null, key: '' });
  if (abFbo) gl.deleteFramebuffer(abFbo);
  abTex = null; abFbo = null; layerDirty = true;
  if (srcFbo) gl.deleteFramebuffer(srcFbo);
  srcFbo = G.fbo2(gl, pyrN1.main, pyrN2.main);
  if (textTex) gl.deleteTexture(textTex.t);
  textTex = G.texture(gl, W, H, { format: 'rgba8' });
  gl.bindTexture(gl.TEXTURE_2D, textTex.t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  textDirty = true;
}
// the surface's own record lives on the pane, not the screen, so a wipe stays put as the camera moves
function paneState() {
  const w = 1024, h = Math.max(32, Math.round(1024 * S['pane.h'] / S['pane.w']));
  if (w === stateW && h === stateH) return;
  stateW = w; stateH = h;
  for (const t of [stateA, stateB]) if (t) gl.deleteTexture(t.t);
  stateA = G.texture(gl, stateW, stateH); stateB = G.texture(gl, stateW, stateH);
  resetState = true;
}

// ---- the words ----
let family = DEFAULTS['tx.family'];
// With "Pane fits the words" on, the pane grows to hold the words with room around them, keeping the view's
// shape so that at zoom 1 it still fills the stage. It never shrinks below the studio's 110 cm pane.
const PANE_MIN = 110;
function fitPane() {
  if (!S['pane.fit'] || !textInfo?.boxCm) return false;
  const all = [textInfo.boxCm, ...(layInfo.boxes || [])], aspect = W / H;
  const x0 = Math.min(...all.map((b) => b[0])), y0 = Math.min(...all.map((b) => b[1])), x1 = Math.max(...all.map((b) => b[2])), y1 = Math.max(...all.map((b) => b[3]));
  const halfW = Math.max(Math.abs(x0), Math.abs(x1)), halfH = Math.max(Math.abs(y0), Math.abs(y1));
  const need = Math.max(PANE_MIN, halfW * 2 * 1.22, halfH * 2 * 1.4 * aspect);
  const w = Math.min(1000, Math.ceil(need / 5) * 5), h = Math.round((w / aspect) * 10) / 10;
  if (w === S['pane.w'] && h === S['pane.h']) return false;
  S['pane.w'] = w; S['pane.h'] = h;
  ui.syncKeys(['pane.w', 'pane.h']);
  return true;
}
function words() {
  textInfo = setWords(S, W, H, family, cam, S.scene === 10);
  // drip starts, from the render onto the pane
  if (textInfo.points) textInfo.points = textInfo.points.map(([u, v]) => paneUv(paneAt(u, v)));
  else textInfo.points = [];
  gl.bindTexture(gl.TEXTURE_2D, textTex.t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, textInfo.canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  P.copy.use().set('uSrc', textTex.t);
  G.draw(gl, G.fbo(gl, pyrMask.main, 0), W, H);
  pyrMask.build();
  textDirty = false;
}
// the other layers of words, one per channel
const layerFamily = (L) => S[`${L}.family`] || family;
function layerWords() {
  layInfo = setLayers(S, W, H, cam, layerFamily);
  gl.bindTexture(gl.TEXTURE_2D, layTex.t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, layInfo.canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  P.copy.use().set('uSrc', layTex.t);
  G.draw(gl, G.fbo(gl, pyrLay.main, 0), W, H);
  pyrLay.build();
  layerDirty = false;
}
function loadLayerFont(L) {
  const fam = S[`${L}.family`]; if (!fam) return;
  document.fonts.load(`${S[`${L}.italic`] ? 'italic ' : ''}${S[`${L}.weight`]} 40px "${fam}"`).then(() => { layerDirty = true; }, () => {});
}

// ---- drops: running water, from rain and from a fingertip's letters ----
const drops = [];
let dropClock = 0, dripClock = 0;
function stepDrops(dt) {
  const pane = [S['pane.w'], S['pane.h']];
  const spawn = (x, y, r) => { if (drops.length < 48) drops.push({ x, y, r, v: 0, hold: Math.random() * 1.5, wob: Math.random() * 10 }); };
  dropClock += dt * S['c.drops'];
  while (dropClock > 1) { dropClock -= 1; spawn(Math.random(), 0.3 + Math.random() * 0.75, S['c.dropsz'] * (0.6 + Math.random() * 0.8)); }
  if (S.scene === 10 && textInfo.points.length) {
    dripClock += dt * S['wr.drips'];
    while (dripClock > 1) { dripClock -= 1; const p = textInfo.points[(Math.random() * textInfo.points.length) | 0]; spawn(p[0], p[1], S['c.dropsz'] * (0.5 + Math.random() * 0.6)); }
  }
  for (const d of drops) {
    // a drop holds, then runs when it is heavy enough, stopping and starting as it meets dry glass
    if (d.hold > 0) { d.hold -= dt; continue; }
    const g = S['c.dropspd'] * (0.6 + d.r * 1.2);
    d.v += (g * 14 - d.v) * Math.min(1, dt * 3);
    if (Math.random() < dt * 0.6) d.v *= 0.2;
    d.y -= (d.v * dt) / pane[1];
    d.x += Math.sin(d.wob + d.y * 40) * 0.0004 * d.v * dt * 10 / pane[0] * 10;
  }
  for (let i = drops.length - 1; i >= 0; i--) if (drops[i].y < -0.05) drops.splice(i, 1);
}
const dropArr = new Float32Array(48 * 4);
function packDrops() {
  dropArr.fill(0);
  drops.forEach((d, i) => { dropArr.set([d.x, d.y, d.r, Math.min(3, d.v / 10)], i * 4); });
  return dropArr;
}

// ---- the hand: a brush on the surface, or moving the words ----
let tool = 'move';
const brush = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false };
let drag = null;
const TOOL_ID = { wipe: 1, wet: 2, breathe: 3, grease: 4, clean: 5 };
function screenAt(e) { const r = cvs.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; }
// where on the pane (cm) the pointer is, through the camera; null off the pane's plane
function paneAtPointer(e) {
  if (!cam) return null;
  const f = screenToF(...screenAt(e));
  if (!f) return null;
  return paneAt((f[0] - cam.bb[0]) / cam.bb[2], (f[1] - cam.bb[1]) / cam.bb[3]);
}
const setKeys = (o) => { for (const [k, v] of Object.entries(o)) { S[k] = v; changed(k); } ui.syncKeys(Object.keys(o)); };
const round = (v, d = 10) => Math.round(v * d) / d;
let spaceHeld = false;
cvs.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  cvs.setPointerCapture(e.pointerId);
  const p = paneAtPointer(e), s = screenAt(e);
  if (compare && Math.abs(s[0] - compare.split) * cvs.getBoundingClientRect().width < 14) { drag = { mode: 'split' }; cvs.classList.add('is-dragging'); return; }
  const mode = e.button === 1 || spaceHeld ? 'pan' : tool;
  if (mode === 'move' && p) drag = { mode, p, tx: S['tx.x'], ty: S['tx.y'] };
  else if (mode === 'pan' && p) drag = { mode, p };
  else if (mode === 'orbit') drag = { mode, s, yaw: S['cam.yaw'], pitch: S['cam.pitch'], roll: S['cam.roll'], alt: e.altKey };
  else if (p) { brush.down = true; [brush.x, brush.y] = paneUv(p); brush.px = brush.x; brush.py = brush.y; }
  if (drag) cvs.classList.add('is-dragging');
});
cvs.addEventListener('pointermove', (e) => {
  if (compare && !drag) cvs.classList.toggle('is-near-split', Math.abs(screenAt(e)[0] - compare.split) * cvs.getBoundingClientRect().width < 14);
  if (drag?.mode === 'split') { compare.split = Math.max(0.02, Math.min(0.98, screenAt(e)[0])); return; }
  if (drag?.mode === 'move') {
    const p = paneAtPointer(e); if (!p) return;
    setKeys({ 'tx.x': round(drag.tx + p[0] - drag.p[0]), 'tx.y': round(drag.ty + p[1] - drag.p[1]) });
  } else if (drag?.mode === 'pan') {
    // keep the point first grabbed under the pointer
    const p = paneAtPointer(e); if (!p) return;
    setKeys({ 'cam.panx': round(S['cam.panx'] - (p[0] - drag.p[0])), 'cam.pany': round(S['cam.pany'] - (p[1] - drag.p[1])) });
  } else if (drag?.mode === 'orbit') {
    const s = screenAt(e), dx = (s[0] - drag.s[0]) * 180, dy = (s[1] - drag.s[1]) * 140;
    if (drag.alt) setKeys({ 'cam.roll': round(((drag.roll + dx + 540) % 360) - 180) });
    else setKeys({ 'cam.yaw': round(Math.max(-75, Math.min(75, drag.yaw + dx))), 'cam.pitch': round(Math.max(-75, Math.min(75, drag.pitch - dy))) });
  } else if (brush.down) { const p = paneAtPointer(e); if (p) [brush.x, brush.y] = paneUv(p); }
});
const lift = () => { drag = null; brush.down = false; cvs.classList.remove('is-dragging'); };
cvs.addEventListener('pointerup', lift);
cvs.addEventListener('pointercancel', lift);
cvs.addEventListener('auxclick', (e) => e.preventDefault());
// the wheel (or a pinch) zooms about the pointer; with Shift it pushes the words toward or away from the glass
cvs.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) {
    const d = e.deltaY || e.deltaX;
    setKeys({ 'tx.depth': Math.max(0, Math.min(150, round(S['tx.depth'] + d * 0.02))) });
    return;
  }
  const before = paneAtPointer(e);
  const z = Math.max(0.2, Math.min(12, S['cam.zoom'] * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
  S['cam.zoom'] = Math.round(z * 1000) / 1000; changed('cam.zoom'); camera();
  const after = paneAtPointer(e);
  if (before && after) setKeys({ 'cam.zoom': S['cam.zoom'], 'cam.panx': round(S['cam.panx'] + before[0] - after[0]), 'cam.pany': round(S['cam.pany'] + before[1] - after[1]) });
  else ui.syncKeys(['cam.zoom']);
}, { passive: false });
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.target.closest('input, textarea, select, button')) { spaceHeld = true; cvs.classList.add('is-panning'); } });
document.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceHeld = false; cvs.classList.remove('is-panning'); } });

// ---- the frame ----
let lastCam = '';
let time = 0, last = performance.now(), playing = true, breathClock = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let shadow = { ...S }, applyingTL = false, fogAge = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (failed) return;
  if (still) { stillFrame(now); last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing) time += dt;
  const pdt = playing ? dt : 0;
  timeline.step(dt);
  applyTimeline();
  resize();
  paneState();
  camera();
  const k = camKey();
  if (k !== lastCam) { lastCam = k; textDirty = true; layerDirty = true; }
  if (textDirty || layerDirty) {
    if (textDirty) words();
    if (layerDirty) layerWords();
    if (fitPane()) { camera(); lastCam = camKey(); words(); layerWords(); }
  }
  showZoom();
  stepDrops(pdt);
  if (compare) renderA();
  render(pdt);
  shadow = { ...S };
}
// the timeline drives the settings it has tracks for
function applyTimeline() {
  if (!timeline.hasTracks()) return;
  const vals = timeline.evaluate(), keys = [];
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined || S[k] === v) continue;
    S[k] = v; keys.push(k);
    if (TEXT_KEYS.has(k)) textDirty = true;
    if (LAYER_TEXT_KEYS.has(k)) layerDirty = true;
    if (k === 'tx.family' || k === 'tx.weight' || k === 'tx.italic') loadFont();
  }
  if (keys.length) { applyingTL = true; ui.syncKeys(keys); applyingTL = false; }
}

function lampUniforms() {
  const L = new Float32Array(16 * 4);
  const t = time;
  ['k1', 'k2', 'k3'].forEach((k, i) => {
    let x = S[`${k}.x`], y = S[`${k}.y`], dist = S[`${k}.dist`];
    const m = S[`${k}.motion`], sp = S[`${k}.mspeed`], a = S[`${k}.mamt`];
    if (m === 1) x += a * Math.sin(t * sp * 2);
    else if (m === 2) { x += a * Math.cos(t * sp * 2); y += a * Math.sin(t * sp * 2); }
    else if (m === 3) { const span = S['pane.w'] + 2 * a + 40; x = ((t * sp * 40) % span) - span / 2; }
    else if (m === 4) dist = Math.max(2, dist + a * 0.5 * (1 - Math.cos(t * sp * 2)));
    let I = S[`${k}.on`] ? 2 ** S[`${k}.ev`] : 0;
    if (S.fall) I *= (60 / dist) ** 2 * 0.25 + 0.75 * Math.min(1, (60 / dist));
    const f = S[`${k}.flicker`];
    if (f > 0) {
      const n = Math.sin(t * S[`${k}.fspeed`] * 7.3 + i) * 0.5 + Math.sin(t * S[`${k}.fspeed`] * 17.1 + i * 3) * 0.3 + Math.sin(t * S[`${k}.fspeed`] * 41.7) * 0.2;
      I *= 1 - f * Math.max(0, n) * 0.9;
    }
    const col = mul(kelvin(S[`${k}.temp`]), S[`${k}.cycle`] > 0 ? hueTurn(S[`${k}.gel`], t * S[`${k}.cycle`]) : hex(S[`${k}.gel`]));
    const shape = S[`${k}.shape`];
    const hw = shape === 0 || shape === 5 ? S[`${k}.w`] / 2 : S[`${k}.w`] / 2, hh = S[`${k}.h`] / 2;
    L.set([x, y, dist, shape, hw, hh, (S[`${k}.rot`] * Math.PI) / 180, I, ...col, S[`${k}.slats`], S[`${k}.open`], S[`${k}.mull`], 0, 0], i * 16);
  });
  // the projector's own lamp, behind the words, when the words are projected
  if (S.scene === 9) {
    const c = [S['tx.x'], S['tx.y'] - S['tx.size'] * 0.9];
    L.set([c[0], c[1], 160, 0, 1.6, 1.6, 0, 2 ** (S['pj.int'] + 3), ...hex(S['pj.color']), 1, 1, 0, 0, 0], 48);
  }
  return L;
}

// a scenario's settings, onto the source and composite passes' generic slots
function sceneUniforms() {
  const s = S.scene, z = [0, 0, 0, 0];
  const E = (ev) => 2 ** ev;
  switch (s) {
    case 0: return { P: [S['sil.opacity'], S['sil.round'], 0, 0], Q: z, A: hex(S['sil.color']), B: [0, 0, 0] };
    case 1: return { P: [S['pr.press'], S['pr.round'], S['pr.contact'], 0], Q: z, A: hex(S['pr.color']), B: [0, 0, 0] };
    case 2: return { P: [0, S['lit.round'], S['lit.sheen'], 0], Q: z, A: hex(S['lit.color']), B: [0, 0, 0] };
    case 3: return { P: [S['st.opacity'], S['st.margin'], 0, S['st.fill'] ? 1 : 0], Q: z, A: hex(S['st.color']), B: [0, 0, 0] };
    case 4: return { P: [E(S['gl.int']), S['gl.body'], S['gl.soft'], S['gl.flicker']], Q: z, A: hex(S['gl.color']), B: [0, 0, 0] };
    case 5: return { P: [E(S['ne.int']), S['ne.dead'], S['ne.flicker'], S['ne.core']], Q: z, A: hex(S['ne.color']), B: [0, 0, 0] };
    case 6: return { P: [E(S['ha.int']), S['ha.spread'], S['ha.standoff'], 0], Q: z, A: hex(S['ha.face']), B: hex(S['ha.color']) };
    case 7: return { P: [S['ge.density'], S['ge.mode'], 0, 0], Q: z, A: hex(S['ge.color']), B: hex(S['ge.color2']) };
    case 8: return { P: [S['led.pitch'], S['led.dot'], E(S['led.int']), S['led.scroll']], Q: [S['led.off'], S['led.board'], S['led.thresh'], 0], A: hex(S['led.color']), B: [0, 0, 0] };
    case 9: return { P: [E(S['pj.int']), S['pj.focus'], 0, 0], Q: z, A: hex(S['pj.color']), B: [0, 0, 0] };
    case 10: return { P: [S['wr.finger'], S['wr.over'], 0, 0], Q: z, A: [1, 1, 1], B: [0, 0, 0] };
    case 11: return { P: [S['la.resist'], 0, 0, 0], Q: z, A: [1, 1, 1], B: [0, 0, 0] };
    case 12: return { P: [S['sm.density'], S['sm.turb'], S['sm.rise'], S['sm.dissolve']], Q: [S['sm.bright'], 0, 0, 0], A: hex(S['sm.color']), B: [0, 0, 0] };
    default: return { P: z, Q: z, A: [1, 1, 1], B: [0, 0, 0] };
  }
}
const paneVec = (slot) => {
  const g = (k) => S[`${slot}.${k}`];
  return new Float32Array([g('scatter'), g('clarity'), g('tail'), g('spread'), ...hex(g('tint')), g('absorb'), g('tex'), g('scale'), g('amount'), g('refract'), g('angle'), g('reflect'), g('grain'), g('wet')]);
};

// uniforms the composite, the shaft march and the still all read
function sharedU(prog, ctx) {
  const { L, sc, pane, pxCm, maxLod } = ctx;
  const lay = { D: [0, 0, 0, 0], M: [], C: [] };
  LAYERS.forEach((l, i) => {
    const on = S[`${l}.on`] && (S[`${l}.text`] || '').trim() ? 1 : 0;
    lay.D[i] = S[`${l}.depth`]; lay.M.push(on, S[`${l}.mode`], S[`${l}.opacity`], 2 ** S[`${l}.ev`]); lay.C.push(...hex(S[`${l}.color`]));
  });
  const el = rad(S['in.el']), inner = mul(kelvin(S['in.temp']), 2 ** S['in.ev']);
  const lit = inner.map((v, i) => v * Math.max(0.15, Math.sin(el)) + kelvin(S['in.temp'])[i] * S['in.amb']);
  const lampOn = ['k1', 'k2', 'k3'].filter((k) => S[`${k}.on`]).map((k) => S[`${k}.dist`]);
  prog.set('uO', cam.O).set('uAx', cam.Ax).set('uAy', cam.Ay).set('uToUv', cam.toUv)
    .set('uN1', pyrN1.main.t).set('uN2', pyrN2.main.t).set('uMask', pyrMask.main.t).set('uState', stateA.t)
    .set('uLay', pyrLay.main.t).set('uGobTex', pyrGob.main.t).set('uShTex', pyrSh.main.t)
    .set('uRes', [W, H]).set('uPaneCm', pane).set('uPxCm', pxCm).set('uTime', time).set('uMaxLod', maxLod)
    .set('uView', cam.view).set('uSurround', hex(S['pane.surround']))
    .set('uScene', S.scene).set('uDepth', S['tx.depth']).set('uP', sc.P).set('uQ', sc.Q).set('uColA', sc.A).set('uColB', sc.B)
    .set('uLayD', lay.D).set('uLayM', new Float32Array(lay.M)).set('uLayC', new Float32Array(lay.C)).set('uLit', lit)
    .set('uGobK', S['gb.kind'] - 1).set('uGob', [S['gb.scale'], S['gb.amt'], S['gb.sway'], rad(S['gb.angle'])]).set('uGobT', time * S['gb.speed']).set('uGobD', S['gb.dist'])
    .set('uLampD', lampOn.length ? Math.min(...lampOn) : 1e4)
    .set('uShOn', shaftsOn() ? 1 : 0).set('uHg', S['rm.hg']).set('uShDen', S['rm.haze'] * S['rm.shaftamt'] * 0.0025).set('uShD', shaftDepth()).set('uShTop', pyrSh.top)
    .set('uL', L).set('uBk', S['cam.bokeh'] * S['cam.zoom']).set('uFd', S['cam.focusd']).set('uCamD', S['cam.camd']);
  return prog;
}
const shaftsOn = () => S['rm.shafts'] && S['rm.haze'] > 0;
const shaftDepth = () => Math.min(S['rm.dist'], Math.max(20, ...['k1', 'k2', 'k3'].filter((k) => S[`${k}.on`]).map((k) => S[`${k}.dist`])));
// the surface's uniforms (composite and still)
function surfU(prog, ctx) {
  const { L } = ctx;
  const front = mul(kelvin(S['fr.temp']), 2 ** S['fr.ev']);
  const occluder = [0, 1, 2, 3, 6, 7].includes(S.scene);
  const k1on = S['k1.on'] && L[7] > 0;
  return prog.set('uPA', paneVec('a')).set('uPB', paneVec('b'))
    .set('uArr', S.arr).set('uArrP', S.arr === 1 ? [S['arr.split'], 0, 0, 0] : S.arr === 2 ? [S['arr.bandy'], S['arr.bandh'], 0, 0] : S.arr === 3 ? [S['arr.g0'], S['arr.g1'], 0, 0] : S.arr === 4 ? [S['arr.gap'], 0, 0, 0] : [0, 0, S['arr.grid'], S['arr.louvre']])
    .set('uFrameW', S['arr.frame']).set('uFrameCol', hex(S['arr.framecol']))
    .set('uC0', [S['c.bead'], S['c.beadsz'], S['c.rain'], S['c.wet']])
    .set('uC1', [S['c.dust'], S['c.dustsz'], S['c.smudge'], S['c.scratch']])
    .set('uC2', [S['c.scratchlen'], S['c.frost'], S['c.frostreach'], S['c.crack']])
    .set('uC3', [S['c.crackx'], S['c.cracky'], S['c.shimmer'], S['c.shimspd']])
    .set('uC4', [S['c.streak'], S['c.glint'], S['c.steam'], S['c.steamspd']])
    .set('uDrops', dropArr).set('uDropN', drops.length)
    .set('uPen', k1on && occluder ? [S['k1.shape'] === 0 ? S['k1.w'] / 2 : Math.min(S['k1.w'], S['k1.h']) / 2, L[2]] : [0, 1])
    .set('uWall', mul(hex(S['rm.wall']), S['rm.bright'])).set('uWallDist', S['rm.dist']).set('uWash', S['rm.wash'])
    .set('uHaze', S['rm.haze']).set('uHazeCol', hex(S['rm.hazecol']))
    .set('uFront', front).set('uFrontPos', [S['fr.x'], S['fr.y']]).set('uFrontSpread', S['fr.spread']).set('uFrontGloss', S['fr.gloss'])
    .set('uRefl', [S['rf.amt'], S['rf.soft']]);
}
// the glass's own blur when the lens is focused behind it
const paneBlur = () => { const C = S['cam.camd'], fd = S['cam.focusd']; return S['cam.bokeh'] * S['cam.zoom'] * fd / (C + fd); };

// everything up to the composite: the words, the surface, the pattern, the shafts
function prepare(dt, opt = {}) {
  const pane = [S['pane.w'], S['pane.h']], pxCm = cam.pxCm;
  const camU = (p) => p.set('uO', cam.O).set('uAx', cam.Ax).set('uAy', cam.Ay).set('uToUv', cam.toUv);
  const maxLod = pyrN1.top;
  const L = lampUniforms();
  const sc = sceneUniforms();
  const ctx = { L, sc, pane, pxCm, maxLod };

  // ---- source ----
  const k1 = { x: S['k1.x'], y: S['k1.y'], dist: L[2] };
  const occluder = [0, 1, 2, 3, 6, 7].includes(S.scene);
  let mag = 1, magC = [0.5, 0.5];
  if (S['tx.persp'] && occluder && S['k1.on']) {
    const D = Math.min(S['tx.depth'], k1.dist * 0.7);
    mag = Math.min(3, k1.dist / Math.max(1, k1.dist - D));
    const u = cam.toUv; const dx = L[0] - cam.O[0], dy = L[1] - cam.O[1];
    magC = [u[0] * dx + u[2] * dy, u[1] * dx + u[3] * dy];
  }
  const az = rad(S['in.az']), el = rad(S['in.el']);
  const inner = mul(kelvin(S['in.temp']), 2 ** S['in.ev']);
  camU(P.source.use())
    .set('uMask', pyrMask.main.t).set('uText', textTex.t)
    .set('uRes', [W, H]).set('uPxCm', pxCm).set('uTime', time).set('uSeed', S['tx.seed']).set('uMaxLod', maxLod)
    .set('uScene', S.scene).set('uDepth', S['tx.depth']).set('uTilt', [Math.tan(rad(S['tx.tiltx'])), Math.tan(rad(S['tx.tilty']))]).set('uTextCm', [S['tx.x'], S['tx.y']])
    .set('uScatter', S['tx.scatter']).set('uWaveAmp', S['tx.wave']).set('uWaveLen', S['tx.wavelen']).set('uWaveSpd', S['tx.wavespd'])
    .set('uApprAmp', reduced.matches ? 0 : S['tx.appr']).set('uApprPeriod', S['tx.period']).set('uStagger', S['tx.stagger'])
    .set('uMagC', magC).set('uMag', mag)
    .set('uP', sc.P).set('uQ', sc.Q).set('uColA', sc.A).set('uColB', sc.B)
    .set('uInnerCol', inner).set('uInnerDir', [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]).set('uInnerAmb', mul(kelvin(S['in.temp']), S['in.amb']))
    .set('uBBox', textInfo.bbox).set('uL', L);
  gl.bindFramebuffer(gl.FRAMEBUFFER, srcFbo);
  gl.viewport(0, 0, W, H);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  pyrN1.build(); pyrN2.build();

  // ---- surface state ----
  if (!opt.noState) {
    breathClock += dt; fogAge += dt;
    if (resetState) fogAge = 0;
    let breath = [0.5, 0.5, 1, 0];
    if (S['c.breath'] > 0) {
      const per = S['c.breath'], ph = (breathClock % per) / per;
      // a breath: a quick bloom of fog for the first fifth of the cycle, then left to clear
      const amt = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI * 0.5) : 0;
      const bc = paneUv([S['tx.x'], S['tx.y'] - S['tx.size'] * 0.2]);
      breath = [bc[0], bc[1], S['c.breathsz'] * (0.6 + 0.4 * Math.min(1, ph / 0.18)), amt];
    }
    const fogTarget = Math.max(S['c.fog'], S.scene === 10 ? 0.6 : 0);
    P.state.use().set('uPrev', stateA.t).set('uPaneCm', pane).set('uDt', dt).set('uTime', time)
      .set('uFogTarget', fogTarget).set('uRegrow', S['c.regrow']).set('uEvap', S['c.evap']).set('uDry', S['c.dry'])
      .set('uBrush', [brush.x, brush.y, brush.px, brush.py]).set('uBrushP', [S['tool.size'], S['tool.str'], TOOL_ID[tool] || 0, brush.down ? 1 : 0])
      .set('uBreath', breath).set('uDrops', packDrops()).set('uDropN', drops.length).set('uReset', resetState ? 1 : 0)
      .set('uTimeC', [S['c.creep'], fogAge, S['c.warm'], S['c.steam']]).set('uSteamSpd', S['c.steamspd']).set('uL', L);
    G.draw(gl, G.fbo(gl, stateB, 0), stateW, stateH);
    [stateA, stateB] = [stateB, stateA];
    brush.px = brush.x; brush.py = brush.y;
    resetState = false;
  }

  // ---- the pattern in the light ----
  if (S['gb.kind'] > 0) {
    sharedU(P.gobo.use(), ctx);
    G.draw(gl, G.fbo(gl, pyrGob.main, 0), W, H);
    pyrGob.build();
  }
  // ---- the shafts in the haze ----
  if (shaftsOn() && !opt.noShafts) {
    sharedU(P.shaft.use(), ctx);
    const [sw, sh] = G.size(pyrSh.main, 0);
    G.draw(gl, G.fbo(gl, pyrSh.main, 0), sw, sh);
    pyrSh.build();
  }
  return ctx;
}

function finalPass(ctx, target, { split = -1, pBlur = paneBlur(), src = pyrC } = {}) {
  const needC = S['cam.bloom'] > 0 || S['cam.halation'] > 0 || S['cam.focus'] > 0.01 || pBlur > 0.3;
  if (needC) src.build(Math.min(src.top, 9));
  const wb = kelvin(S['cam.wb']), ref = kelvin(6500);
  const om = cam.m;
  P.final.use().set('uOrbit', new Float32Array([...om[0], ...om[1], ...om[2]])).set('uF0', F0).set('uAspect', W / H).set('uBB', cam.bb).set('uBg', mul(hex(S['pane.surround']), 0.03))
    .set('uC', src.main.t).set('uRes', [W, H]).set('uTime', time).set('uMaxLod', needC ? Math.min(src.top, 9) : 0)
    .set('uExposure', S['cam.ev']).set('uContrast', S['cam.contrast']).set('uSat', S['cam.sat'])
    .set('uBloom', S['cam.bloom']).set('uBloomR', S['cam.bloomr']).set('uHalation', S['cam.halation']).set('uVig', S['cam.vig'])
    .set('uGrain', S['cam.grain']).set('uGrainSize', S['cam.grains']).set('uCA', S['cam.ca']).set('uFocus', S['cam.focus'])
    .set('uSplit', S['cam.split']).set('uShadow', hex(S['cam.shadow'])).set('uHigh', hex(S['cam.high'])).set('uTone', S['cam.tone'])
    .set('uWB', ref.map((v, i) => v / wb[i]))
    .set('uPaneBlur', pBlur).set('uAB', split > 0 && abTex ? abTex.t : dummy.t).set('uSplitX', split);
  G.draw(gl, target, W, H);
}

function render(dt, opt = {}) {
  const ctx = prepare(dt, opt);
  sharedU(surfU(P.comp.use(), ctx), ctx);
  G.draw(gl, G.fbo(gl, pyrC.main, 0), W, H);
  finalPass(ctx, opt.target ?? null, { split: opt.target ? -1 : compare ? compare.split : -1 });
}

// ---- compare: the left of the stage drawn from another set of settings, with the same view ----
let compare = null;              // { A: settings, split, name }
function ensureA() {
  if (resA.textTex) return;
  resA.textTex = canvasTex(); resA.layTex = canvasTex();
  resA.pyrMask = G.pyramid(gl, W, H); resA.pyrLay = G.pyramid(gl, W, H); resA.key = '';
  abTex = G.texture(gl, W, H, { format: 'rgba8' }); abFbo = G.fbo(gl, abTex, 0);
}
const resKey = () => JSON.stringify([...TEXT_KEYS, ...LAYER_TEXT_KEYS].map((k) => S[k])) + camKey();
function renderA() {
  ensureA();
  const keepB = {}; for (const k of Object.keys(compare.A)) if (k in S) keepB[k] = S[k];
  const view = Object.fromEntries(CAM_KEYS.map((k) => [k, S[k]]));
  const flags = [textDirty, layerDirty], fam = family;
  for (const [k, v] of Object.entries(compare.A)) if (k in S && k !== 'tl') S[k] = v;
  Object.assign(S, view);
  swapRes();
  const key = resKey();
  if (key !== resA.key) { resA.key = key; family = S['tx.family']; words(); layerWords(); family = fam; }
  render(0, { target: abFbo, noState: true });
  swapRes();
  Object.assign(S, keepB);
  [textDirty, layerDirty] = flags;
}
function startCompare(A, name) {
  const { tl, ...rest } = A;
  compare = { A: structuredClone(rest), split: compare?.split ?? 0.5, name };
  $('compare').setAttribute('aria-pressed', 'true');
  window.Matte?.toast(name ? `Left of the line: “${name}”. Drag the line to move it.` : 'Left of the line stays as it is now; your next changes show on the right.');
}
function stopCompare() { compare = null; $('compare').setAttribute('aria-pressed', 'false'); cvs.classList.remove('is-near-split'); }

// ---- the still: the scene ray traced, many passes averaged, at a size and shape of your choosing ----
let still = null;
const ASPECTS = { stage: 0, '1:1': 1, '4:5': 0.8, '3:2': 1.5, '16:9': 16 / 9, '9:16': 9 / 16, '2:1': 2 };
function stillSize(aspect, long) {
  const r = stage.getBoundingClientRect();
  const a = ASPECTS[aspect] || r.width / r.height;
  return a >= 1 ? [long, Math.round(long / a)] : [Math.round(long * a), long];
}
function startStill({ aspect, long, samples }) {
  const [w, h] = stillSize(aspect, long);
  still = { w, h, n: 0, total: samples, k: 1, wasPlaying: playing, lastShow: 0, last: performance.now(), done: false, prepared: false };
  playing = false; $('play').textContent = 'Play'; $('play').setAttribute('aria-pressed', 'true');
  W = 0; resize();
  still.acc = [G.texture(gl, w, h, { format: 'rgba32f' }), G.texture(gl, w, h, { format: 'rgba32f' })];
  cvs.classList.add('is-still');
  stillUI();
}
function textDepthMax() {
  const half = Math.max(S['pane.w'], S['pane.h']) / 2;
  let z = S['tx.depth'] + (Math.abs(Math.tan(rad(S['tx.tiltx']))) + Math.abs(Math.tan(rad(S['tx.tilty'])))) * half
    + S['tx.scatter'] + S['tx.wave'] + S['tx.appr'] + (S.scene === 1 ? S['pr.press'] : 0) + 1;
  return Math.min(400, z);
}
function stillFrame(now) {
  if (!still.prepared) {
    resize(); camera(); words(); layerWords();
    still.ctx = prepare(0, { noState: true, noShafts: true });
    still.prepared = true;
  }
  if (!still.done) {
    const interval = now - still.last; still.last = now;
    if (interval < 30) still.k = Math.min(24, still.k + 1); else if (interval > 55) still.k = Math.max(1, still.k - 1);
    const ctx = still.ctx, zT = textDepthMax();
    for (let i = 0; i < still.k && still.n < still.total; i++) {
      sharedU(surfU(P.trace.use(), ctx), ctx)
        .set('uAcc', still.acc[0].t).set('uN', still.n).set('uLensA', (S['cam.bokeh'] * S['cam.zoom']) / cam.pxCm)
        .set('uTextZ', zT).set('uThick', S['tx.thick']);
      G.draw(gl, G.fbo(gl, still.acc[1], 0), still.w, still.h);
      still.acc.reverse(); still.n++;
    }
    if (still.n >= still.total) still.done = true;
    if (now - still.lastShow > 250 || still.done) { showStill(); still.lastShow = now; stillUI(); }
  }
}
function showStill() {
  P.copy.use().set('uSrc', still.acc[0].t);
  G.draw(gl, G.fbo(gl, pyrC.main, 0), W, H);
  finalPass(still.ctx, null, { pBlur: 0 });
}
function endStill() {
  if (!still) return;
  for (const t of still.acc) gl.deleteTexture(t.t);
  playing = still.wasPlaying; $('play').textContent = playing ? 'Pause' : 'Play'; $('play').setAttribute('aria-pressed', String(!playing));
  still = null; cvs.classList.remove('is-still');
  W = 0; textDirty = layerDirty = true;
  stillUI();
}
function saveStill() {
  if (!still) return;
  showStill();
  cvs.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `diffusion-studio-still-${still?.w}x${still?.h}-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
}

// ---- settings ----
function changed(k) {
  if (TEXT_KEYS.has(k)) textDirty = true;
  if (LAYER_TEXT_KEYS.has(k)) { layerDirty = true; if (/\.(family|weight|italic)$/.test(k)) loadLayerFont(k.split('.')[0]); }
  if (k === 'c.creep') { fogAge = 0; resetState = true; }
  if (!applyingTL && timeline.keyChanged(k, shadow[k])) ui.markKeyed(Object.keys(S.tl.tracks));
  if (k === 'tx.family' || k === 'tx.face' || k === 'tx.weight' || k === 'tx.italic') loadFont();
  if (k === 'c.fog' && S['c.fog'] > 0) { /* condensation settles on its own */ }
  if (k === 'scene' || k === 'arr' || k === 'pane.fit' || k.endsWith('.tex') || k.endsWith('.shape') || k.endsWith('.on') || k.endsWith('.motion') || k.includes('tail') || k.includes('flicker')
    || k.startsWith('c.') || k.startsWith('gb.') || k === 'rm.shafts' || /^l\d\.(on|mode)$/.test(k) || k.startsWith('ge.mode') || k.startsWith('st.fill') || k.startsWith('tx.appr') || k.startsWith('tx.scatter') || k.startsWith('tx.wave') || k.startsWith('rm.haze') || k.startsWith('cam.') || k.startsWith('rf.') || k.startsWith('arr.') || k.startsWith('ge.')) ui.visibility();
  saveSoon();
}

function applyLook(i) {
  const look = LOOKS[i];
  $('looks').value = String(i);
  try { localStorage.setItem('diffusion-studio-look', String(i)); } catch (e) { /* private mode */ }
  const keep = Object.fromEntries([...TYPE_KEYS, ...LAYER_KEYS, 'tl'].map((k) => [k, S[k]]));
  const view = Object.fromEntries(CAM_KEYS.filter((k) => k.startsWith('cam.')).map((k) => [k, S[k]]));
  Object.assign(S, DEFAULTS, keep, view, look.set);
  S['tx.text'] = keep['tx.text'];
  textDirty = true; layerDirty = true; resetState = true; drops.length = 0; breathClock = 0;
  ui.rebase();
  shadow = { ...S };
  loadFont();
  saveSoon();
}

// ---- fonts: any installed font, by family, or a single face from the Local Font Access list ----
let localFonts = null;           // family → [{ style, postscriptName, fullName }]
const BUILT_IN = ['Söhne', 'Söhne Breit', 'Söhne Mono', 'Geist', 'Helvetica Neue', 'Helvetica', 'Avenir Next', 'Avenir', 'Futura', 'Gill Sans', 'Optima', 'Didot', 'Bodoni 72',
  'Baskerville', 'Big Caslon', 'Hoefler Text', 'Georgia', 'Times New Roman', 'Palatino', 'Rockwell', 'American Typewriter', 'Courier New', 'Menlo', 'Copperplate', 'Impact', 'Arial Black'];
let faceSeq = 0;
async function loadFont() {
  const fam = S['tx.family'] || 'sans-serif';
  if (S['tx.face'] && localFonts?.[fam]) {
    const f = localFonts[fam].find((x) => x.postscriptName === S['tx.face']);
    if (f) {
      const name = `ds-face-${++faceSeq}`;
      try {
        const ff = new FontFace(name, `local("${f.postscriptName}"), local("${f.fullName}")`);
        await ff.load(); document.fonts.add(ff); family = name; textDirty = true; return;
      } catch (e) { /* fall through to the family */ }
    }
  }
  family = fam;
  try { await document.fonts.load(`${S['tx.italic'] ? 'italic ' : ''}${S['tx.weight']} 40px "${fam}"`); } catch (e) { /* not a web font */ }
  textDirty = true;
}
document.fonts.addEventListener?.('loadingdone', () => { textDirty = true; layerDirty = true; });

// A font list: a search field over every family, each shown in its own face. (A text field with suggestions
// filters them by what is already typed, so the current family hid all the others.)
function fontRow() {
  const el = document.createElement('div');
  el.className = 'font';
  el.innerHTML = `
    <label class="m-legend m-legend--dim" for="font-search">Font</label>
    <div class="font__pick">
      <input class="m-input" id="font-search" type="search" placeholder="Search" autocomplete="off" spellcheck="false"
        role="combobox" aria-controls="font-list" aria-expanded="true" aria-autocomplete="list">
      <button class="m-key" id="font-local" type="button">Installed fonts</button>
    </div>
    <div class="font__list" id="font-list" role="listbox" aria-label="Font families" tabindex="-1"></div>
    <p class="m-legend m-legend--dim" id="font-note" hidden></p>
    <label class="m-legend m-legend--dim" for="font-face" id="font-face-l" hidden>Style</label>
    <select class="m-input" id="font-face" hidden></select>`;
  const search = el.querySelector('#font-search'), list = el.querySelector('#font-list'), btn = el.querySelector('#font-local');
  const faceSel = el.querySelector('#font-face'), faceL = el.querySelector('#font-face-l'), note = el.querySelector('#font-note');
  let names = BUILT_IN.slice(), shown = [], active = -1;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function draw() {
    const q = search.value.trim().toLowerCase();
    shown = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
    list.innerHTML = shown.map((n, i) => `<div class="font__item" role="option" id="font-o-${i}" data-i="${i}" aria-selected="${n === S['tx.family']}" style="font-family: &quot;${esc(n)}&quot;, var(--font-sans)">${esc(n)}</div>`).join('')
      || `<p class="m-legend m-legend--dim font__none">Enter uses “${esc(search.value.trim())}”</p>`;
    active = shown.indexOf(S['tx.family']);
    mark();
  }
  function mark(scroll) {
    list.querySelectorAll('.font__item').forEach((o, i) => o.classList.toggle('is-active', i === active));
    search.setAttribute('aria-activedescendant', active >= 0 ? `font-o-${active}` : '');
    if (scroll && active >= 0) list.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  function pick(name) {
    if (!name) return;
    S['tx.family'] = name; S['tx.face'] = '';
    list.querySelectorAll('.font__item').forEach((o) => o.setAttribute('aria-selected', String(shown[o.dataset.i] === name)));
    faces(); changed('tx.family'); ui.visibility();
  }
  const faces = () => {
    const fs = localFonts?.[S['tx.family']];
    faceSel.hidden = faceL.hidden = !fs;
    if (!fs) { S['tx.face'] = ''; return; }
    faceSel.innerHTML = `<option value="">By weight</option>` + fs.map((f) => `<option value="${f.postscriptName}">${esc(f.style)}</option>`).join('');
    faceSel.value = fs.some((f) => f.postscriptName === S['tx.face']) ? S['tx.face'] : '';
    S['tx.face'] = faceSel.value;
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      mark(true); pick(shown[active]);
    } else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active] ?? shown[0] ?? search.value.trim()); }
  });
  list.addEventListener('click', (e) => { const o = e.target.closest('.font__item'); if (o) { active = Number(o.dataset.i); mark(); pick(shown[active]); } });
  faceSel.addEventListener('change', () => { S['tx.face'] = faceSel.value; changed('tx.face'); ui.visibility(); });
  async function local() {
    const all = await window.queryLocalFonts();
    localFonts = {};
    for (const f of all) (localFonts[f.family] ||= []).push({ style: f.style, postscriptName: f.postscriptName, fullName: f.fullName });
    names = [...new Set([...Object.keys(localFonts), 'Söhne', 'Söhne Breit', 'Söhne Mono', 'Geist'])].sort((a, b) => a.localeCompare(b));
    setFontNames(names);
    btn.hidden = true;
    note.hidden = false; note.textContent = `${Object.keys(localFonts).length} families installed`;
    draw(); faces(); ui.visibility(); loadFont();
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  if (!('queryLocalFonts' in window)) btn.hidden = true;
  btn.addEventListener('click', () => local().catch(() => { note.hidden = false; note.textContent = 'The browser did not allow the font list.'; }));
  // permission already given on an earlier visit: list them straight away
  navigator.permissions?.query({ name: 'local-fonts' }).then((p) => { if (p.state === 'granted') local().catch(() => {}); }).catch(() => {});
  fontRow.sync = () => { draw(); faces(); };
  draw();
  return el;
}

// every font name known: the built-in list, and the installed ones once the browser shares them
let fontNames = BUILT_IN.slice();
const fontListeners = [];
function setFontNames(n) { fontNames = n; fontListeners.forEach((f) => f()); }
function layerFontRow(slot, label) {
  const el = document.createElement('div');
  el.className = 'row row--pick';
  const id = `lf-${slot}`;
  el.innerHTML = `<label class="m-legend m-legend--dim" for="${id}">${label}</label><select class="m-input" id="${id}"></select>`;
  const sel = el.querySelector('select');
  const fill = () => {
    const cur = S[`${slot}.family`];
    const list = cur && !fontNames.includes(cur) ? [cur, ...fontNames] : fontNames;
    sel.innerHTML = `<option value="">Same as the main words</option>` + list.map((n) => `<option>${n.replace(/</g, '&lt;')}</option>`).join('');
    sel.value = cur;
  };
  fill(); fontListeners.push(fill);
  sel.addEventListener('change', () => { S[`${slot}.family`] = sel.value; changed(`${slot}.family`); });
  (layerFontRow.syncs ||= []).push(fill);
  return el;
}
function lampPresetRow(slot, label) {
  const el = document.createElement('div');
  el.className = 'row row--pick';
  el.innerHTML = `<label class="m-legend m-legend--dim" for="lp-${slot}">${label}</label>
    <select class="m-input" id="lp-${slot}"><option value="">Choose one</option>${LAMP_PRESETS.map(([n], i) => `<option value="${i}">${n}</option>`).join('')}</select>`;
  const sel = el.querySelector('select');
  sel.addEventListener('change', () => {
    if (sel.value === '') return;
    const [, set] = LAMP_PRESETS[Number(sel.value)];
    setKeys({ [`${slot}.on`]: true, ...Object.fromEntries(Object.entries(set).map(([k, v]) => [`${slot}.${k}`, v])) });
    sel.value = '';
  });
  return el;
}
function focusRow(key, label) {
  const el = document.createElement('div');
  el.className = 'row row--pick';
  el.innerHTML = `<span class="m-legend m-legend--dim">${label}</span>
    <div class="focus-keys"><button class="m-key m-key--quiet" type="button" data-f="glass">The glass</button><button class="m-key m-key--quiet" type="button" data-f="words">The words</button><button class="m-key m-key--quiet" type="button" data-f="lamp">The light</button></div>`;
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]')?.dataset.f; if (!f) return;
    setKeys({ 'cam.focusd': f === 'glass' ? 0 : f === 'words' ? S['tx.depth'] : S['k1.dist'] });
  });
  return el;
}

function sceneRow() {
  const el = document.createElement('div');
  el.className = 'm-seg scenes';
  el.setAttribute('role', 'radiogroup'); el.setAttribute('aria-label', 'Scenario');
  el.innerHTML = SCENES.map(([name, tip], i) => `<button type="button" role="radio" aria-checked="false" data-v="${i}" data-tip="${tip}">${name}</button>`).join('');
  el.addEventListener('change', () => { const on = el.querySelector('[aria-checked="true"]'); if (on) { S.scene = Number(on.dataset.v); textDirty = true; changed('scene'); } });
  sceneRow.sync = () => el.querySelectorAll('[role="radio"]').forEach((b) => { const on = Number(b.dataset.v) === S.scene; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  return el;
}

const TOOLS = [
  ['move', 'Move the words', 'Drag the words around behind the pane. Shift and scroll pushes them toward or away from the glass.'],
  ['pan', 'Pan', 'Drag to slide the view. Space and drag, or the middle button, pans with any tool.'],
  ['orbit', 'Orbit', 'Drag to look at the pane from an angle. With Option held, drag to roll.'],
  ['wipe', 'Wipe', 'Wipe the condensation off with a fingertip. It needs fog on the pane (Surface, Condensation), and fog creeps back.'],
  ['wet', 'Wet', 'Leave a film of water. Wet frosted glass and paper go clear, and fog won\'t form on it while it dries.'],
  ['breathe', 'Breathe', 'Hold to fog the glass with your breath. It clears again.'],
  ['grease', 'Grease', 'Draw with finger grease. It is invisible until the glass fogs, then it shows as clear marks.'],
  ['clean', 'Clean', 'Wipe the surface back to how it started.'],
];
function toolRow() {
  const el = document.createElement('div');
  el.className = 'm-seg tools';
  el.setAttribute('role', 'radiogroup'); el.setAttribute('aria-label', 'What your hand does on the pane');
  el.innerHTML = TOOLS.map(([v, l, tip]) => `<button type="button" role="radio" aria-checked="${v === tool}" data-v="${v}" data-tip="${tip}">${l}</button>`).join('');
  el.addEventListener('change', () => { const on = el.querySelector('[aria-checked="true"]'); if (on) setTool(on.dataset.v); });
  return el;
}
function setTool(v) {
  tool = v;
  // wiping and greasing only show on a fogged pane: put some condensation on a clear one
  if ((v === 'wipe' || v === 'grease') && S['c.fog'] < 0.2 && S.scene !== 10 && typeof ui !== 'undefined') {
    setKeys({ 'c.fog': 0.55 });
    resetState = true;
    window.Matte?.toast(v === 'wipe' ? 'Condensation on, so there is something to wipe.' : 'Condensation on, so the grease shows.');
  }
  document.querySelectorAll('.tools [role="radio"]').forEach((b) => { const on = b.dataset.v === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  cvs.dataset.tool = v;
}
function buttonRow(key, label) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'm-key'; b.textContent = label;
  if (key === 'reset-surface') b.addEventListener('click', () => { resetState = true; drops.length = 0; });
  return b;
}

// ---- remembered between visits (this browser only) ----
// ---- undo: settings only (not paint on the surface); a burst of changes, like a drag, is one step ----
const undo = [], redo = [];
let committed = null, histTimer = 0, restoring = false;
function commit() {
  clearTimeout(histTimer); histTimer = 0;
  const now = JSON.stringify(S);
  if (committed !== null && now !== committed) { undo.push(committed); if (undo.length > 200) undo.shift(); redo.length = 0; }
  committed = now;
}
function noteChange() { if (restoring) return; clearTimeout(histTimer); histTimer = setTimeout(commit, 450); }
function restoreTo(json) {
  restoring = true;
  const snap = JSON.parse(json);
  for (const k of Object.keys(S)) if (k in snap) S[k] = snap[k];
  committed = json;
  textDirty = true; layerDirty = true; loadFont(); ui.sync(); saveSoon();
  shadow = { ...S }; timeline.redraw(); ui.markKeyed(Object.keys(S.tl.tracks));
  restoring = false;
}
function step(back) {
  if (histTimer) commit();
  const from = back ? undo : redo, to = back ? redo : undo;
  if (!from.length) return;
  to.push(JSON.stringify(S));
  restoreTo(from.pop());
}
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
  if (e.target.closest?.('textarea, input[type="text"], input:not([type]), input[list]')) return;   // text fields keep their own undo
  e.preventDefault();
  step(!(e.shiftKey || e.key.toLowerCase() === 'y'));
});

let saveTimer = 0;
function saveSoon() {
  noteChange(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem('diffusion-studio', JSON.stringify(S)); } catch (e) { /* private mode */ } }, 400); }
function restore() { try { const s = JSON.parse(localStorage.getItem('diffusion-studio') || 'null'); if (s) for (const k of Object.keys(DEFAULTS)) if (k in s && typeof s[k] === typeof DEFAULTS[k]) S[k] = s[k]; } catch (e) { /* nothing kept */ }
  if (!S.tl || typeof S.tl.tracks !== 'object') S.tl = structuredClone(DEFAULTS.tl); }
// a saved version, or anything else, put on the stage
function loadSettings(params) {
  for (const k of Object.keys(DEFAULTS)) S[k] = k in params && typeof params[k] === typeof DEFAULTS[k] ? structuredClone(params[k]) : structuredClone(DEFAULTS[k]);
  textDirty = true; layerDirty = true; resetState = true; drops.length = 0;
  loadFont(); LAYERS.forEach(loadLayerFont); ui.rebase(); timeline.redraw(); ui.markKeyed(Object.keys(S.tl.tracks)); saveSoon();
  shadow = { ...S };
}

// ---- start ----
restore();
const ui = buildPanel($('panel'), TABS, S, {
  onChange: changed,
  materials: MATERIALS,
  onMaterial: (slot, m) => { for (const [k, v] of Object.entries(MATERIALS[m].set)) S[`${slot}.${k}`] = v; ui.sync(); saveSoon(); },
  custom: { font: fontRow, scene: sceneRow, tools: toolRow, btn: buttonRow, lfont: layerFontRow, lpreset: lampPresetRow, focus: focusRow },
});
const syncAll = ui.sync.bind(ui);
const syncCustom = () => { fontRow.sync?.(); sceneRow.sync?.(); (layerFontRow.syncs || []).forEach((f) => f()); };
ui.sync = () => { syncAll(); syncCustom(); };
ui.rebase = ((rb) => () => { rb(); syncCustom(); })(ui.rebase.bind(ui));
const timeline = createTimeline({
  host: $('timeline'), toggle: $('tl-toggle'), S, meta: (k) => ui.meta(k),
  onEdit: () => { saveSoon(); ui.markKeyed(Object.keys(S.tl.tracks)); },
  onExport: exportVideo,
});
ui.markKeyed(Object.keys(S.tl.tracks));
ui.rebase();
$('tools').append(toolRow());
window.Matte?.init();
if (!localStorage.getItem?.('diffusion-studio')) applyLook(0);

$('looks').innerHTML = `<option value="" disabled>Looks</option>` + LOOKS.map((l, i) => `<option value="${i}">${l.name}</option>`).join('');
$('looks').addEventListener('change', (e) => applyLook(Number(e.target.value)));
$('play').addEventListener('click', () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; $('play').setAttribute('aria-pressed', String(!playing)); });
$('snap').addEventListener('click', () => {
  render(0);
  cvs.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `diffusion-studio-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
});
$('reset-all').addEventListener('click', () => { applyLook(0); });

// popovers open under the button that opens them
for (const [pop, btn] of [['versions-panel', 'versions'], ['still-panel', 'still']]) {
  $(pop).addEventListener('toggle', (e) => {
    if (e.newState !== 'open') return;
    const r = $(btn).getBoundingClientRect(), el = $(pop);
    el.style.top = `${r.bottom + 8}px`;
    el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, r.right - el.offsetWidth))}px`;
    if (pop === 'versions-panel') saved.refresh();
  });
}

// ---- versions ----
const say = (m) => window.Matte?.toast(m);
const saved = createSaved({
  panel: $('versions-panel'), key: 'diffusion-studio',
  snapshot: () => structuredClone(S),
  thumb: () => { const c = document.createElement('canvas'); c.width = 160; c.height = Math.round(160 * H / W); c.getContext('2d').drawImage(cvs, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); },
  apply: (params) => { stopCompare(); loadSettings(params); },
  compare: (params, name) => { startCompare(params, name); $('versions-panel').hidePopover?.(); },
  say,
});
$('compare').addEventListener('click', () => { if (compare) stopCompare(); else startCompare(structuredClone(S)); });

// ---- mutate: a nudge to several of the settings in view ----
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-9))) * Math.cos(2 * Math.PI * Math.random());
const NO_MUTATE = /^(tx\.(text|family|face|x|y|rot|size|mirror|seed)|cam\.(zoom|panx|pany|yaw|pitch|roll|scale)|pane\.|tool\.|l\d\.(x|y|size|rot|text|track|weight))/;
$('mutate').addEventListener('click', () => {
  const pool = ui.liveKeys().filter((k) => !NO_MUTATE.test(k));
  const n = Math.min(pool.length, 5 + Math.floor(Math.random() * 5)), out = {};
  for (let i = 0; i < n; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0], m = ui.meta(k);
    if (m.kind === 'n') {
      const v = S[k] + gauss() * 0.14 * (m.max - m.min);
      out[k] = Math.round(Math.min(m.max, Math.max(m.min, v)) / m.step) * m.step;
      out[k] = Number(out[k].toFixed(4));
    } else {
      const c = parseInt(S[k].slice(1), 16), rgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      const j = rgb.map((v) => Math.round(Math.min(255, Math.max(0, v + gauss() * 28))));
      out[k] = '#' + j.map((v) => v.toString(16).padStart(2, '0')).join('');
    }
  }
  setKeys(out);
  say(`Nudged ${n} settings. Cmd+Z puts them back.`);
});

// ---- render still ----
const stillPanel = $('still-panel');
function stillUI() {
  const busy = !!still;
  stillPanel.querySelector('[data-a="go"]').hidden = busy;
  stillPanel.querySelector('.st__run').hidden = !busy;
  if (busy) {
    stillPanel.querySelector('.st__count').textContent = `${still.n} of ${still.total} passes · ${still.w} × ${still.h}`;
    stillPanel.querySelector('.st__bar').style.setProperty('--p', String(still.n / still.total));
    stillPanel.querySelector('[data-a="stop"]').textContent = still.done ? 'Back to live' : 'Stop';
    stillPanel.querySelector('[data-a="savestill"]').disabled = still.n < 1;
  }
  $('still').setAttribute('aria-pressed', String(busy));
  frameGuide();
}
function numField(sel) { const f = stillPanel.querySelector(sel); return () => { const v = f.valueAsNumber; return Number.isFinite(v) ? Math.min(Number(f.max), Math.max(Number(f.min), v)) : Number(f.defaultValue); }; }
const stillLong = numField('[data-a="long"]'), stillPasses = numField('[data-a="passes"]');
stillPanel.querySelectorAll('input[type="number"]').forEach((f) => f.addEventListener('change', () => { const v = f.valueAsNumber; f.value = String(Number.isFinite(v) ? Math.min(Number(f.max), Math.max(Number(f.min), v)) : f.defaultValue); }));
stillPanel.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'go') startStill({ aspect: stillPanel.querySelector('[data-a="aspect"]').value, long: Math.round(stillLong()), samples: Math.round(stillPasses()) });
  else if (a === 'stop') { if (still && !still.done) { still.done = true; stillUI(); } else endStill(); }
  else if (a === 'savestill') saveStill();
});
stillPanel.querySelector('[data-a="aspect"]').addEventListener('change', frameGuide);
stillPanel.addEventListener('toggle', frameGuide);
// while choosing a shape, the stage shows where its edges fall
function frameGuide() {
  const g = $('frame-guide'), open = stillPanel.matches?.(':popover-open') && !still;
  const a = ASPECTS[stillPanel.querySelector('[data-a="aspect"]').value];
  if (!open || !a) { g.hidden = true; return; }
  const r = stage.getBoundingClientRect(), sa = r.width / r.height;
  const w = a > sa ? r.width : r.height * a, h = a > sa ? r.width / a : r.height;
  Object.assign(g.style, { width: `${w}px`, height: `${h}px`, left: `${(r.width - w) / 2}px`, top: `${(r.height - h) / 2}px` });
  g.hidden = false;
}

// ---- video: one pass of the timeline, recorded as it plays ----
async function exportVideo() {
  if (!timeline.hasTracks()) { say('Nothing is animated yet: turn on Key changes and move a setting.'); return; }
  const types = ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find((t) => window.MediaRecorder?.isTypeSupported(t));
  if (!type) { say('This browser can’t record video.'); return; }
  const rec = new MediaRecorder(cvs.captureStream(60), { mimeType: type, videoBitsPerSecond: 24e6 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    timeline.setExporting(false);
    const blob = new Blob(chunks, { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `diffusion-studio-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  timeline.setExporting(true); timeline.seek(0); timeline.play();
  rec.start();
  setTimeout(() => { rec.stop(); timeline.stop(); }, S.tl.dur * 1000 + 60);
}
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'p') $('play').click();
  if (e.key === '0') $('fit').click();
  if (e.key === '=' || e.key === '+') zoomBy(1.25);
  if (e.key === '-') zoomBy(1 / 1.25);
});
commit();
setTool('move');
try { const l = localStorage.getItem('diffusion-studio-look'); $('looks').value = l ?? ''; } catch (e) { $('looks').value = ''; }
// the view: zoom out, the zoom, zoom in, fit
const zoomEl = $('zoom');
function showZoom() { const t = `${Math.round(S['cam.zoom'] * 100)}%`; if (zoomEl.textContent !== t) zoomEl.textContent = t; }
const zoomBy = (f) => { setKeys({ 'cam.zoom': Math.max(0.2, Math.min(12, Math.round(S['cam.zoom'] * f * 1000) / 1000)) }); };
$('zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
$('zoom-in').addEventListener('click', () => zoomBy(1.25));
$('fit').addEventListener('click', () => setKeys({ 'cam.zoom': 1, 'cam.panx': 0, 'cam.pany': 0, 'cam.roll': 0, 'cam.yaw': 0, 'cam.pitch': 0 }));
if (init()) { loadFont(); requestAnimationFrame(frame); }
window.ds = { S, changed, startStill, endStill, get still() { return still; }, get timeline() { return timeline; }, startCompare, stopCompare, loadSettings, get time() { return time; }, set time(v) { time = v; }, set playing(v) { playing = v; }, applyLook, get gl() { return gl; }, render: () => render(0), get size() { return [W, H]; }, setTool, ui };
