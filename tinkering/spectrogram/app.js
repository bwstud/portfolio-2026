import { SR, SOURCES, sourceDefaults, whiteNoise, BEATS } from './signals.js';
import { History, HISTORY_S, STFT, Columns, WINDOWS, SCALES, SCALE_INDEX, toAxis, fromAxis, noteOf, makeWindow, DB_FLOOR } from './analysis.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);

/* ---------- formatting ---------- */

const minus = (s) => String(s).replace('-', '−');
const trim = (x) => minus(String(+(+x).toPrecision(3)));
const fmtHz = (f) => (f >= 1000 ? `${trim(f / 1000)} kHz` : `${trim(f)} Hz`);
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtX = (x) => `${trim(x)}×`;
const fmtS = (x) => (x < 1 ? `${trim(x * 1000)} ms` : `${trim(x)} s`);
const fmtDb = (x) => `${minus(Math.round(x))} dB`;
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/* ---------- palettes ---------- */

const PALETTES = [
  { id: 'magma', name: 'Magma', stops: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feb078', '#fcfdbf'] },
  { id: 'inferno', name: 'Inferno', stops: ['#000004', '#320a5e', '#781c6d', '#bc3754', '#ed6925', '#fbb61a', '#fcffa4'] },
  { id: 'viridis', name: 'Viridis', stops: ['#0b0420', '#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  { id: 'spectrum', name: 'Spectrum', stops: ['#0a0520', '#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ffe3d0'] },
  { id: 'sonar', name: 'Sonar', stops: ['#000000', '#001a0d', '#00602f', '#2fd479', '#c9ffd9'] },
  { id: 'ice', name: 'Ice', stops: ['#00040a', '#0b1a33', '#2f5d9a', '#a9d4ff', '#ffffff'] },
  { id: 'ember', name: 'Ember', stops: ['#000000', '#300400', '#a3200a', '#ff7a2a', '#ffe7c2'] },
  { id: 'neon', name: 'Neon', stops: ['#05010d', '#2a0845', '#8a0f84', '#ff3fbf', '#ffc1f0', '#ffffff'] },
  { id: 'gray', name: 'Silver', stops: ['#000000', '#262626', '#7a7a7a', '#d9d9d9', '#ffffff'] },
  { id: 'ink', name: 'Ink on paper', stops: ['#f3eee3', '#d8cfbe', '#93876f', '#3c3428', '#0e0b07'] },
  { id: 'gold', name: 'Gold leaf', stops: ['#000000', '#2a1400', '#8a4f0c', '#e3a83a', '#fff2c4'] },
  { id: 'custom', name: 'Custom' },
];

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lumOf = (hex) => { const [r, g, b] = hexRgb(hex).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

function paletteStops() {
  if (ST.palette === 'custom') return ST.custom;
  return PALETTES.find((p) => p.id === ST.palette).stops;
}

function paletteBytes(stops) {
  const rgb = stops.map(hexRgb);
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1);
    const a = Math.min(rgb.length - 2, Math.floor(t)), f = t - a;
    for (let c = 0; c < 3; c++) {
      const lin = (v) => Math.pow(v / 255, 2.2);
      const v = lin(rgb[a][c]) * (1 - f) + lin(rgb[a + 1][c]) * f;
      out[i * 4 + c] = Math.round(Math.pow(v, 1 / 2.2) * 255);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}
const gradientCss = (stops) => `linear-gradient(to right, ${stops.join(', ')})`;

/* ---------- state ---------- */

function defaults() {
  return {
    S: { source: 'chirp', src: sourceDefaults(), level: 1, noise: -120, volume: 0.5 },
    A: { size: 2048, window: 'hann', param: { gauss: 0.35, kaiser: 9 }, overlap: 0.75, pad: 1, mag: 'db' },
    V: {
      layout: 'across', motion: 'scroll', scale: 'log', fmin: 40, fmax: 20000, span: 10,
      axes: true, live: true, trace: false, harmonics: false, hole: 0.16,
      ridge: { lines: 64, height: 0.6, depth: 0.35, width: 1.4, color: 'level', fill: 'hide' },
    },
    ST: {
      palette: 'magma', custom: ['#000000', '#16233f', '#d0485f', '#ffd8a8', '#ffffff'],
      lo: -100, hi: 0, auto: false, gamma: 1, levels: 0, blocky: false,
      glow: 0.2, grain: 0.015, vignette: 0.15, scan: 0, invert: false,
    },
  };
}

const D = defaults();
const S = D.S, A = D.A, V = D.V, ST = D.ST;

/* ---------- presets ---------- */

const PRESETS = [
  { name: 'Rising chirp', S: {}, A: {}, V: {}, ST: {} },
  { name: 'Birdsong', S: { source: 'birds' }, A: { size: 1024, overlap: 0.875 }, V: { scale: 'linear', fmin: 0, fmax: 10000, span: 6 }, ST: { palette: 'viridis', lo: -90 } },
  { name: 'Vowels', S: { source: 'voice' }, A: { size: 4096, overlap: 0.875 }, V: { scale: 'linear', fmin: 0, fmax: 5000, span: 8 }, ST: { palette: 'inferno', lo: -88, hi: -14 } },
  { name: 'Phonetics lab', S: { source: 'voice', src: { voice: { pitch: 110 } } }, A: { size: 256, overlap: 0.9375 }, V: { scale: 'linear', fmin: 0, fmax: 5000, span: 6 }, ST: { palette: 'ink', lo: -80, hi: -18, glow: 0, vignette: 0, grain: 0.03 } },
  { name: 'Piano', S: { source: 'piano' }, A: { size: 8192, overlap: 0.875 }, V: { scale: 'piano', fmin: 55, fmax: 4200, span: 10 }, ST: { palette: 'ember', lo: -96, hi: -14, glow: 0.35 } },
  { name: 'Whale song', S: { source: 'whale' }, A: { size: 4096, overlap: 0.875 }, V: { layout: 'down', scale: 'linear', fmin: 0, fmax: 2000, span: 20 }, ST: { palette: 'sonar', lo: -92, hi: -12, glow: 0.55, scan: 0.35, vignette: 0.4 } },
  { name: 'Hidden message', S: { source: 'message' }, A: { size: 2048, overlap: 0.875 }, V: { scale: 'linear', fmin: 0, fmax: 14000, span: 7 }, ST: { palette: 'ice', lo: -78, hi: -22, glow: 0.6 } },
  { name: 'Phone call', S: { source: 'phone' }, A: { size: 2048, overlap: 0.75 }, V: { scale: 'linear', fmin: 250, fmax: 1750, span: 9 }, ST: { palette: 'spectrum', blocky: true, lo: -62, hi: -8 } },
  { name: 'FM bells', S: { source: 'fm', src: { fm: { mode: 'bells', carrier: 330, ratio: 3.5, index: 5 } } }, A: { size: 4096, overlap: 0.875 }, V: { layout: 'polar', scale: 'log', fmin: 120, fmax: 14000, span: 8 }, ST: { palette: 'neon', glow: 0.8, lo: -90, hi: -12 } },
  { name: 'Pulsar plot', S: { source: 'voice', src: { voice: { pitch: 150, rate: 1.6, breath: 0.3, pauses: false } } }, A: { size: 1024, overlap: 0.75 }, V: { layout: 'ridge', scale: 'linear', fmin: 0, fmax: 4000, span: 5, ridge: { lines: 64, height: 0.32, depth: 0.15, width: 1.6 } }, ST: { palette: 'gray', lo: -78, hi: -16, glow: 0.25, vignette: 0.3 } },
  { name: 'Drum machine', S: { source: 'drums' }, A: { size: 512, overlap: 0.875 }, V: { motion: 'wipe', scale: 'log', fmin: 30, fmax: 20000, span: 4 }, ST: { palette: 'gold', lo: -85, hi: -8 } },
  { name: 'Noise sweep', S: { source: 'noise' }, A: { size: 2048, overlap: 0.75 }, V: { scale: 'log', fmin: 60, fmax: 20000, span: 20 }, ST: { palette: 'spectrum', levels: 9, lo: -80, hi: -20 } },
  { name: 'Leaky window', S: { src: { chirp: { harmonics: 6, from: 200, to: 4000, period: 10 } } }, A: { window: 'rect', size: 2048, overlap: 0.875 }, V: { scale: 'linear', fmin: 0, fmax: 12000, span: 10 }, ST: { palette: 'magma', lo: -130, hi: 0 } },
  { name: 'Radar', S: { src: { chirp: { from: 200, to: 12000, period: 3, harmonics: 3 } } }, A: { size: 1024, overlap: 0.875 }, V: { layout: 'polar', motion: 'wipe', scale: 'log', fmin: 100, fmax: 20000, span: 6, hole: 0.06 }, ST: { palette: 'sonar', glow: 0.7, scan: 0.25, vignette: 0.5 } },
];

function applyPreset(pr) {
  const d = defaults();
  const src = d.S.src;
  for (const [k, v] of Object.entries(pr.S.src || {})) Object.assign(src[k], v);
  if (S.src.file.data) src.file = S.src.file;
  Object.assign(S, d.S, pr.S, { src, volume: S.volume });
  Object.assign(A, d.A, pr.A, { param: { ...d.A.param, ...(pr.A.param || {}) } });
  Object.assign(V, d.V, pr.V, { ridge: { ...d.V.ridge, ...(pr.V.ridge || {}) } });
  Object.assign(ST, d.ST, pr.ST, { custom: ST.custom });
  stopMic();
  makeSource();
  hist.clear();
  paletteChanged();
  analysisChanged();
  renderAll();
  goLive();
}

/* ---------- toast ---------- */

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-shown'), 3600);
}

/* ---------- control builders ---------- */

let uid = 0;
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...kids.filter((k) => k != null));
  return e;
}

const paint = (input) => input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);

function slider({ label, get, set, min, max, step = 0.01, log = false, fmt, disabled = false }) {
  const id = `f${++uid}`;
  const out = el('span', { class: 'field__value m-value' });
  const input = el('input', { class: 'm-fader', type: 'range', id });
  let toS, fromS;
  if (log) {
    Object.assign(input, { min: 0, max: 1000, step: 1 });
    toS = (v) => Math.round((Math.log(v / min) / Math.log(max / min)) * 1000);
    fromS = (s) => +(min * Math.pow(max / min, s / 1000)).toPrecision(3);
  } else {
    Object.assign(input, { min, max, step });
    toS = (v) => v;
    fromS = (s) => +s;
  }
  input.disabled = disabled;
  const show = () => {
    const text = fmt(get());
    out.textContent = text;
    input.setAttribute('aria-valuetext', text);
    paint(input);
  };
  const sync = () => { input.value = toS(get()); show(); };
  input.addEventListener('input', () => { set(fromS(+input.value)); show(); });
  sync();
  const node = el('div', { class: 'field' },
    el('div', { class: 'field__top' }, el('label', { class: 'field__label m-legend', for: id, text: label }), out),
    input);
  node.sync = sync;
  return node;
}

function seg(label, options, get, set) {
  const wrap = el('div', { class: 'seg m-seg m-seg--fill', role: 'group', 'aria-label': label });
  const sync = () => {
    for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(get())));
  };
  for (const [v, text, title, disabled] of options) {
    wrap.append(el('button', {
      type: 'button', 'data-v': v, text, title, disabled: !!disabled,
      onclick: () => { set(typeof get() === 'number' ? +v : v); sync(); },
    }));
  }
  sync();
  return wrap;
}

function field(label, control) {
  return el('div', { class: 'field' }, el('div', { class: 'field__top' }, el('span', { class: 'field__label m-legend', text: label })), control);
}

function toggle(label, get, set) {
  const b = el('button', { class: 'switch', type: 'button', role: 'switch' },
    el('span', { class: 'm-legend', text: label }), el('span', { class: 'switch__track m-switch m-switch--sm', 'aria-hidden': 'true' }));
  const sync = () => b.setAttribute('aria-checked', String(!!get()));
  b.addEventListener('click', () => { set(!get()); sync(); });
  sync();
  return b;
}

function group(title, end, ...kids) {
  return el('section', { class: 'group' },
    el('div', { class: 'group__head' },
      el('h3', { class: 'group__title m-legend m-legend--lg', text: title }),
      end ? el('div', { class: 'group__end' }, end) : null),
    ...kids);
}

function hint(text) { return el('p', { class: 'hint', text }); }

function choices(cls, options, get, set) {
  return el('div', { class: cls }, ...options.map(([id, name, title]) => el('button', {
    class: 'btn m-key', type: 'button', text: name, title, 'aria-pressed': String(get() === id), onclick: () => set(id),
  })));
}

/* ---------- Sound panel ---------- */

const SOURCE_LIST = [...Object.entries(SOURCES).map(([id, s]) => [id, s.name]), ['mic', 'Microphone']];
let micMeter, micText;

function sourceControls() {
  const p = S.src[S.source];
  const k = [];
  const sl = (o) => k.push(slider(o));
  switch (S.source) {
    case 'chirp':
      sl({ label: 'From', min: 20, max: 24000, log: true, get: () => p.from, set: (v) => { p.from = v; }, fmt: fmtHz });
      sl({ label: 'To', min: 20, max: 24000, log: true, get: () => p.to, set: (v) => { p.to = v; }, fmt: fmtHz });
      sl({ label: 'Time for each sweep', min: 0.5, max: 60, log: true, get: () => p.period, set: (v) => { p.period = v; }, fmt: fmtS });
      k.push(field('Glide', seg('Glide', [['exp', 'Even in pitch'], ['lin', 'Even in hertz']], () => p.curve, (v) => { p.curve = v; })));
      k.push(toggle('Sweep back down again', () => p.updown, (v) => { p.updown = v; }));
      sl({ label: 'Harmonics', min: 1, max: 12, step: 1, get: () => p.harmonics, set: (v) => { p.harmonics = v; }, fmt: (v) => (v === 1 ? 'Pure tone' : `${v}`) });
      k.push(hint('Even in pitch draws a straight line on the log and piano scales; even in hertz draws one on the linear scale.'));
      break;
    case 'piano':
      k.push(field('Pattern', seg('Pattern', [['arp', 'Arpeggio'], ['chords', 'Chords'], ['melody', 'Melody']], () => p.pattern, (v) => { p.pattern = v; })));
      sl({ label: 'Tempo', min: 40, max: 220, step: 1, get: () => p.tempo, set: (v) => { p.tempo = v; }, fmt: (v) => `${v} bpm` });
      sl({ label: 'Key', min: 0, max: 11, step: 1, get: () => p.key, set: (v) => { p.key = v; }, fmt: (v) => `${KEYS[v]} major` });
      sl({ label: 'Brightness', min: 0, max: 1, get: () => p.brightness, set: (v) => { p.brightness = v; }, fmt: fmtPct });
      k.push(hint('Each note is a stack of harmonics that run slightly sharp, as a stiff steel string does, and the high ones die away first.'));
      break;
    case 'voice':
      k.push(field('Vowel', seg('Vowel', [['cycle', 'All'], ['a', 'ah'], ['e', 'eh'], ['i', 'ee'], ['o', 'oh'], ['u', 'oo']], () => p.vowel, (v) => { p.vowel = v; })));
      sl({ label: 'Pitch', min: 60, max: 400, log: true, get: () => p.pitch, set: (v) => { p.pitch = v; }, fmt: fmtHz });
      sl({ label: 'Vowel speed', min: 0.2, max: 4, log: true, get: () => p.rate, set: (v) => { p.rate = v; }, fmt: (v) => `${trim(v)} a second` });
      sl({ label: 'Vibrato', min: 0, max: 2, get: () => p.vibrato, set: (v) => { p.vibrato = v; }, fmt: fmtPct });
      sl({ label: 'Breath', min: 0, max: 1, get: () => p.breath, set: (v) => { p.breath = v; }, fmt: fmtPct });
      k.push(toggle('Pause between phrases', () => p.pauses, (v) => { p.pauses = v; }));
      k.push(hint('The voice is a buzz of harmonics shaped by the mouth. With a long window you see the harmonics; with a short one they blur into dark bands, the formants, that move as the vowel changes.'));
      break;
    case 'birds':
      sl({ label: 'Birds', min: 1, max: 3, step: 1, get: () => p.count, set: (v) => { p.count = v; }, fmt: (v) => `${v}` });
      sl({ label: 'Pitch', min: 1200, max: 8000, log: true, get: () => p.pitch, set: (v) => { p.pitch = v; }, fmt: fmtHz });
      sl({ label: 'Busyness', min: 0.1, max: 1.5, get: () => p.busy, set: (v) => { p.busy = v; }, fmt: fmtPct });
      break;
    case 'whale':
      sl({ label: 'Pitch', min: 60, max: 700, log: true, get: () => p.pitch, set: (v) => { p.pitch = v; }, fmt: fmtHz });
      sl({ label: 'Pace', min: 0.3, max: 3, log: true, get: () => p.pace, set: (v) => { p.pace = v; }, fmt: fmtX });
      sl({ label: 'Sea noise', min: 0, max: 1, get: () => p.sea, set: (v) => { p.sea = v; }, fmt: fmtPct });
      break;
    case 'fm':
      k.push(field('Playing', seg('Playing', [['drone', 'Drone'], ['bells', 'Bells']], () => p.mode, (v) => { p.mode = v; renderSound(); })));
      sl({ label: 'Carrier', min: 50, max: 4000, log: true, get: () => p.carrier, set: (v) => { p.carrier = v; }, fmt: fmtHz });
      sl({ label: 'Modulator ratio', min: 0.25, max: 8, step: 0.01, get: () => p.ratio, set: (v) => { p.ratio = v; }, fmt: fmtX });
      sl({ label: 'Modulation index', min: 0, max: 20, step: 0.1, get: () => p.index, set: (v) => { p.index = v; }, fmt: (v) => trim(v) });
      if (p.mode === 'drone') sl({ label: 'Index swell', min: 1, max: 30, log: true, get: () => p.sweep, set: (v) => { p.sweep = v; }, fmt: fmtS });
      k.push(hint('Frequency modulation grows sidebands either side of the carrier, spaced by the modulator. Whole-number ratios sound like notes; others sound like bells.'));
      break;
    case 'phone':
      k.push(field('Number to dial', el('input', { class: 'text m-input m-input--sm', type: 'text', value: p.number, maxlength: 20, inputmode: 'tel', 'aria-label': 'Number to dial', oninput: (e) => { p.number = e.target.value; } })));
      sl({ label: 'Dialling speed', min: 0.4, max: 3, log: true, get: () => p.speed, set: (v) => { p.speed = v; }, fmt: fmtX });
      k.push(hint('Each key on a phone sends two tones at once, one for its row and one for its column. You can read the number back off the picture.'));
      break;
    case 'message':
      k.push(field('Message', el('input', { class: 'text m-input m-input--sm', type: 'text', value: p.text, maxlength: 32, 'aria-label': 'Message', oninput: (e) => { p.text = e.target.value; } })));
      sl({ label: 'Lowest', min: 100, max: 20000, log: true, get: () => p.low, set: (v) => { p.low = Math.min(v, p.high - 100); }, fmt: fmtHz });
      sl({ label: 'Highest', min: 200, max: 23000, log: true, get: () => p.high, set: (v) => { p.high = Math.max(v, p.low + 100); }, fmt: fmtHz });
      sl({ label: 'Time per letter', min: 0.2, max: 3, log: true, get: () => p.perChar, set: (v) => { p.perChar = v; }, fmt: fmtS });
      k.push(el('div', { class: 'row' }, el('button', { class: 'btn m-key', type: 'button', text: 'Fit the view to the message', onclick: () => {
        Object.assign(V, { scale: 'linear', fmin: Math.max(0, p.low - (p.high - p.low) * 0.2), fmax: Math.min(24000, p.high + (p.high - p.low) * 0.2) });
        renderView();
      } })));
      k.push(hint('The text is drawn as sound: a row of tones, each switched on where a letter covers it. It reads best on the linear scale.'));
      break;
    case 'drums':
      k.push(field('Beat', seg('Beat', Object.keys(BEATS).map((b) => [b, b === 'break' ? 'Breakbeat' : b[0].toUpperCase() + b.slice(1)]), () => p.beat, (v) => { p.beat = v; })));
      sl({ label: 'Tempo', min: 60, max: 180, step: 1, get: () => p.tempo, set: (v) => { p.tempo = v; }, fmt: (v) => `${v} bpm` });
      sl({ label: 'Swing', min: 0, max: 0.6, get: () => p.swing, set: (v) => { p.swing = v; }, fmt: fmtPct });
      k.push(hint('Drums are short bursts of noise, so they show as thin columns from top to bottom. A short window keeps them sharp.'));
      break;
    case 'noise':
      k.push(field('Colour', seg('Colour', [['white', 'White'], ['pink', 'Pink'], ['brown', 'Brown']], () => p.color, (v) => { p.color = v; })));
      k.push(toggle('Sweep a filter through it', () => p.sweep, (v) => { p.sweep = v; renderSound(); }));
      if (p.sweep) {
        sl({ label: 'Sweep time', min: 1, max: 60, log: true, get: () => p.period, set: (v) => { p.period = v; }, fmt: fmtS });
        sl({ label: 'Resonance', min: 1, max: 60, log: true, get: () => p.q, set: (v) => { p.q = v; }, fmt: (v) => `Q ${trim(v)}` });
      }
      break;
    case 'file':
      k.push(hint(p.data ? `Playing ${p.name}, ${fmtClock(p.data.length / SR)} long, on a loop.` : 'Choose an audio file, or drop one on the picture. It stays on this computer.'));
      k.push(el('div', { class: 'row' }, el('button', { class: 'btn m-key', type: 'button', text: p.data ? 'Choose another file' : 'Choose a file', onclick: () => $('file').click() })));
      break;
    case 'mic':
      k.push((micText = hint(mic ? 'Listening. Talk, whistle or play something near the microphone.' : 'Asking for the microphone…')));
      k.push(el('div', { class: 'meter', 'aria-hidden': 'true' }, (micMeter = el('span'))));
      k.push(hint('Nothing is recorded or sent anywhere. The last minute and a half stays in this page so you can look back through it.'));
      break;
  }
  return k;
}

function renderSound() {
  const panel = $('panel-sound');
  panel.replaceChildren();
  panel.append(group('Presets', null,
    el('div', { class: 'presets' }, ...PRESETS.map((pr) => el('button', { class: 'preset m-key', type: 'button', text: pr.name, onclick: () => applyPreset(pr) })))));
  panel.append(group('Source', null, choices('sources', SOURCE_LIST, () => S.source, (v) => setSource(v))));
  const ctl = sourceControls();
  if (ctl.length) panel.append(group(SOURCES[S.source]?.name || 'Microphone', null, ...ctl));
  panel.append(group('Mix', null,
    slider({ label: 'Level', min: 0.05, max: 2, log: true, get: () => S.level, set: (v) => { S.level = v; }, fmt: (v) => fmtDb(20 * Math.log10(v)) }),
    slider({ label: 'Background noise', min: -120, max: -20, step: 1, get: () => S.noise, set: (v) => { S.noise = v; }, fmt: (v) => (v <= -120 ? 'None' : fmtDb(v)) }),
    hint('Noise under the sound shows how much quieter detail each window can still pull out.')));
  panel.append(group('Speakers', null,
    toggle('Hear the sound', () => !!out?.on, (v) => setHear(v)),
    slider({ label: 'Volume', min: 0, max: 1, get: () => S.volume, set: (v) => { S.volume = v; updateVolume(); }, fmt: fmtPct }),
    S.source === 'mic' ? hint('The speakers stay quiet while the microphone is on, so it doesn’t hear itself.') : null));
}

/* ---------- Analysis panel ---------- */

let winCanvas;
function renderFft() {
  const panel = $('panel-fft');
  panel.replaceChildren();
  const sizes = [256, 512, 1024, 2048, 4096, 8192].filter((n) => n / 2 <= renderer.maxBins);
  panel.append(group('Window length', null,
    seg('FFT size', sizes.map((n) => [n, n >= 1024 ? `${n / 1024}k` : `${n}`, `${n} samples`]), () => A.size, (v) => { A.size = v; if ((A.size * A.pad) / 2 > renderer.maxBins) A.pad = 1; analysisChanged(); renderFft(); }),
    (resText = hint('')),
    hint('A longer window resolves pitch more finely but blurs when things happen. A shorter one shows timing sharply but smears pitch. No window does both: that is the uncertainty principle at work.')));
  updateResText();

  const w = WINDOWS.find((x) => x.id === A.window);
  winCanvas = el('canvas', { class: 'winplot', 'aria-hidden': 'true' });
  panel.append(group('Window shape', null,
    choices('presets', WINDOWS.map((x) => [x.id, x.name]), () => A.window, (v) => { A.window = v; analysisChanged(); renderFft(); }),
    w.param ? slider({ label: w.param.label, min: w.param.min, max: w.param.max, get: () => A.param[w.id], set: (v) => { A.param[w.id] = v; analysisChanged(); drawWindow(); }, fmt: (v) => trim(v) }) : null,
    winCanvas,
    hint(`${w.note} Left: the window’s shape. Right: how a single pure tone spreads across the neighbouring bins.`)));
  requestAnimationFrame(drawWindow);

  const pads = [1, 2, 4, 8].map((p) => [p, `${p}×`, null, (A.size * p) / 2 > renderer.maxBins]);
  panel.append(group('Slicing', null,
    field('Overlap', seg('Overlap', [[0, '0%'], [0.5, '50%'], [0.75, '75%'], [0.875, '88%'], [0.9375, '94%']], () => A.overlap, (v) => { A.overlap = v; analysisChanged(); updateResText(); })),
    field('Zero padding', seg('Zero padding', pads, () => A.pad, (v) => { A.pad = v; analysisChanged(); updateResText(); })),
    hint('Overlap draws more columns, so the picture is smoother in time. Zero padding interpolates between bins: smoother peaks, but no finer detail.')));
  panel.append(group('Loudness', null,
    field('Measure', seg('Measure', [['db', 'Decibels'], ['linear', 'Amplitude']], () => A.mag, (v) => { A.mag = v; analysisChanged(); })),
    hint('Decibels follow how loudness is heard and show quiet detail. Amplitude shows only the loudest parts, as a meter would.')));
}

let resText;
function updateResText() {
  if (!resText) return;
  resText.textContent = `Each slice is ${fmtS(A.size / SR)} long. Bins are ${trim(SR / (A.size * A.pad))} Hz apart, and the true resolution is about ${trim(SR / A.size * 1.5)} Hz. A new column every ${fmtS(hop / SR)}.`;
}

function drawWindow() {
  const c = winCanvas;
  if (!c || !c.isConnected) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#fff';
  const N = 256, win = makeWindow(A.window, N, A.param[A.window]);
  const split = W * 0.36;
  g.strokeStyle = 'rgba(255,255,255,0.1)';
  g.beginPath(); g.moveTo(split, 6); g.lineTo(split, H - 6); g.stroke();
  // shape
  g.strokeStyle = accent; g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i < N; i++) {
    const x = 8 + (i / (N - 1)) * (split - 16), y = H - 8 - win[i] * (H - 16);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  // leakage: the window's own spectrum, finely sampled, in dB
  let sum = 0;
  for (let i = 0; i < N; i++) sum += win[i];
  const bins = 12, pts = 360;
  g.beginPath();
  for (let j = 0; j < pts; j++) {
    const b = (j / (pts - 1) - 0.5) * 2 * bins;
    let r = 0, q = 0;
    for (let i = 0; i < N; i++) { const a = (2 * Math.PI * b * i) / N; r += win[i] * Math.cos(a); q -= win[i] * Math.sin(a); }
    const db = Math.max(-130, 20 * Math.log10(Math.hypot(r, q) / sum + 1e-12));
    const x = split + 8 + (j / (pts - 1)) * (W - split - 16), y = 8 + (-db / 130) * (H - 16);
    j ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.font = '10px "Söhne Mono", ui-monospace, monospace';
  g.fillText('0 dB', W - 34, 16);
  g.fillText(minus('-130'), W - 34, H - 8);
}

/* ---------- View panel ---------- */

function renderView() {
  const panel = $('panel-view');
  panel.replaceChildren();
  panel.append(group('Layout', null,
    choices('presets', [['across', 'Scrolling', 'Time runs left to right'], ['down', 'Waterfall', 'Time falls from the top'], ['polar', 'Polar', 'Time runs round the circle, pitch out from the middle'], ['ridge', 'Ridgelines', 'Each moment is a line, stacked like a mountain range']], () => V.layout, (v) => { V.layout = v; renderView(); }),
    V.layout !== 'ridge' ? field('Motion', seg('Motion', [['scroll', 'Scroll'], ['wipe', 'Wipe']], () => V.motion, (v) => { V.motion = v; })) : null,
    V.layout === 'polar' ? slider({ label: 'Centre hole', min: 0, max: 0.6, get: () => V.hole, set: (v) => { V.hole = v; }, fmt: fmtPct }) : null));

  if (V.layout === 'ridge') {
    const r = V.ridge;
    panel.append(group('Ridgelines', null,
      slider({ label: 'Lines', min: 8, max: 160, step: 1, get: () => r.lines, set: (v) => { r.lines = v; }, fmt: (v) => `${v}` }),
      slider({ label: 'Height', min: 0.05, max: 1.5, get: () => r.height, set: (v) => { r.height = v; }, fmt: fmtPct }),
      slider({ label: 'Depth', min: 0, max: 1, get: () => r.depth, set: (v) => { r.depth = v; }, fmt: fmtPct }),
      slider({ label: 'Line width', min: 0.5, max: 6, step: 0.1, get: () => r.width, set: (v) => { r.width = v; }, fmt: (v) => `${trim(v)} px` }),
      field('Line colour', seg('Line colour', [['level', 'By loudness'], ['one', 'One colour'], ['age', 'By age']], () => r.color, (v) => { r.color = v; })),
      field('Behind each line', seg('Fill', [['hide', 'Hidden'], ['tint', 'Tinted']], () => r.fill, (v) => { r.fill = v; }))));
  }

  let fminS, fmaxS;
  panel.append(group('Frequency', null,
    seg('Scale', SCALES.map((s) => [s.id, s.name]), () => V.scale, (v) => { V.scale = v; if (v !== 'linear' && V.fmin < 10) { V.fmin = 20; fminS.sync(); } }),
    // log slider; its very bottom means 0 Hz on the linear scale
    (fminS = slider({ label: 'Lowest', min: 10, max: 20000, log: true, get: () => Math.max(10, V.fmin), set: (v) => { V.fmin = Math.min(v <= 10 && V.scale === 'linear' ? 0 : v, V.fmax * 0.9); }, fmt: () => fmtHz(V.fmin) })),
    (fmaxS = slider({ label: 'Highest', min: 100, max: 24000, log: true, get: () => V.fmax, set: (v) => { V.fmax = Math.max(v, V.fmin * 1.12 + 10); }, fmt: fmtHz })),
    hint('Log and piano scales give each octave the same height, as the ear hears it. Mel is a scale fitted to how far apart people judge pitches to be.')));
  freqSliders = [fminS, fmaxS];

  panel.append(group('Time', null,
    (spanSlider = slider({ label: 'Time across the view', min: 1, max: 60, log: true, get: () => V.span, set: (v) => { V.span = v; spanChanged(); }, fmt: fmtS }))));

  panel.append(group('Overlays', null,
    toggle('Axes and grid', () => V.axes, (v) => { V.axes = v; }),
    V.layout === 'across' || V.layout === 'down' ? toggle('Live spectrum', () => V.live, (v) => { V.live = v; }) : null,
    V.layout !== 'ridge' ? toggle('Trace the loudest pitch', () => V.trace, (v) => { V.trace = v; }) : null,
    V.layout !== 'ridge' ? toggle('Harmonics under the cursor', () => V.harmonics, (v) => { V.harmonics = v; }) : null,
    hint('Hover over the picture to read the pitch, note and loudness at any point. With harmonics on, lines mark whole-number multiples of the pitch under the cursor.')));
}
let freqSliders = [], spanSlider;

/* ---------- Style panel ---------- */

let loS, hiS;
function renderStyle() {
  const panel = $('panel-style');
  panel.replaceChildren();
  const pals = el('div', { class: 'swatches swatches--pal' }, ...PALETTES.map((p) => el('button', {
    class: 'swatch m-key m-key--tile', type: 'button', 'aria-pressed': String(ST.palette === p.id),
    onclick: () => { ST.palette = p.id; paletteChanged(); renderStyle(); },
  }, el('span', { class: 'swatch__bar', style: `--g:${gradientCss(p.stops || ST.custom)}`, 'aria-hidden': 'true' }), p.name)));
  const custom = ST.palette === 'custom'
    ? field('Custom colours, quiet to loud', el('div', { class: 'colors' }, ...ST.custom.map((c, i) => el('input', {
      type: 'color', value: c, 'aria-label': `Colour ${i + 1}`,
      oninput: (e) => { ST.custom[i] = e.target.value; paletteChanged(); pals.lastChild.querySelector('.swatch__bar').style.setProperty('--g', gradientCss(ST.custom)); },
    }))))
    : null;
  panel.append(group('Palette', null, pals, custom));

  panel.append(group('Levels', null,
    (loS = slider({ label: 'Quietest shown', min: -180, max: -20, step: 1, get: () => ST.lo, set: (v) => { ST.lo = Math.min(v, ST.hi - 6); }, fmt: fmtDb })),
    (hiS = slider({ label: 'Loudest shown', min: -80, max: 12, step: 1, get: () => ST.hi, set: (v) => { ST.hi = Math.max(v, ST.lo + 6); }, fmt: fmtDb })),
    toggle('Follow the loudest sound', () => ST.auto, (v) => { ST.auto = v; }),
    slider({ label: 'Contrast', min: 0.3, max: 3, log: true, get: () => ST.gamma, set: (v) => { ST.gamma = v; }, fmt: fmtX }),
    slider({ label: 'Bands', min: 0, max: 16, step: 1, get: () => ST.levels, set: (v) => { ST.levels = v; }, fmt: (v) => (v === 0 ? 'Smooth' : `${v}`) }),
    field('Pixels', seg('Pixels', [[false, 'Smooth'], [true, 'Blocky']], () => String(ST.blocky), (v) => { ST.blocky = v === 'true'; })),
    hint('Blocky shows each bin and column as it really is. Bands step the colours like the contours on a map.')));

  panel.append(group('Finish', null,
    slider({ label: 'Glow', min: 0, max: 1.5, get: () => ST.glow, set: (v) => { ST.glow = v; }, fmt: fmtPct }),
    slider({ label: 'Scanlines', min: 0, max: 0.8, get: () => ST.scan, set: (v) => { ST.scan = v; }, fmt: fmtPct }),
    slider({ label: 'Grain', min: 0, max: 0.2, get: () => ST.grain, set: (v) => { ST.grain = v; }, fmt: (v) => fmtPct(v * 5) }),
    slider({ label: 'Vignette', min: 0, max: 1, get: () => ST.vignette, set: (v) => { ST.vignette = v; }, fmt: fmtPct }),
    toggle('Invert', () => ST.invert, (v) => { ST.invert = v; })));
}

function renderAll() {
  renderSound();
  renderFft();
  renderView();
  renderStyle();
}

// the controls are greyscale: keep the accent's lightness, drop its hue
function greyHex(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const n = parseInt(hex.slice(1), 16);
  const y = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const v = Math.round(255 * Math.min(1, y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055));
  return '#' + v.toString(16).padStart(2, '0').repeat(3);
}
function paletteChanged() {
  const stops = paletteStops();
  renderer.setPalette(paletteBytes(stops));
  let pick = '#8fd0ff';
  for (let i = stops.length - 2; i >= 1; i--) {
    const l = lumOf(stops[i]);
    if (l > 0.3 && l < 0.85) { pick = stops[i]; break; }
  }
  document.documentElement.style.setProperty('--accent', greyHex(pick));
  bgRgb = hexRgb(stops[0]).map((v) => v / 255);
  lightBg = lumOf(stops[0]) > 0.5;
  drawWindow();
}
let bgRgb = [0, 0, 0], lightBg = false;

/* ---------- the engine ---------- */

let renderer;
const hist = new History();
const stft = new STFT();
let cols;
let hop = 512;
let sNow = 0;              // the present, in samples
let viewEnd = null;        // null follows the present; otherwise a sample position
let playing = true;
let source = null;
const chunk = new Float32Array(8192);
const bgNoise = whiteNoise(99);

let fadeOut = null, fadeN = 0;
const FADE = 1200;
function makeSource() {
  // the old source fades out under the new one, so switching doesn't click
  fadeOut = source;
  fadeN = 0;
  source = S.source === 'mic' ? null : SOURCES[S.source].make(S.src[S.source]);
}
const fadeBuf = new Float32Array(8192);

function computeHop() {
  const want = Math.max(16, Math.round(A.size * (1 - A.overlap)));
  // never more columns across the view than the ring can hold
  return Math.max(want, Math.ceil((V.span * SR) / (renderer.ring * 0.9)));
}

function analysisChanged() {
  hop = computeHop();
  stft.configure({ size: A.size, pad: A.pad, window: A.window, param: A.param[A.window], hop, mag: A.mag });
  cols.clear();
  renderer.clearSlots();
  updateResText();
}

function spanChanged() {
  if (computeHop() !== hop) analysisChanged();
}

function generate(upTo) {
  if (!source) return;
  const nAmp = S.noise <= -120 ? 0 : Math.pow(10, S.noise / 20);
  while (hist.end < upTo) {
    const n = Math.min(chunk.length, upTo - hist.end);
    source.fill(chunk, n);
    if (fadeN < FADE) {
      if (fadeOut) fadeOut.fill(fadeBuf, n); else fadeBuf.fill(0, 0, n);
      for (let i = 0; i < n && fadeN < FADE; i++, fadeN++) {
        const g = 0.5 - 0.5 * Math.cos((Math.PI * fadeN) / FADE);
        chunk[i] = chunk[i] * g + fadeBuf[i] * (1 - g);
      }
      if (fadeN >= FADE) fadeOut = null;
    }
    for (let i = 0; i < n; i++) chunk[i] = chunk[i] * S.level + (nAmp ? bgNoise() * nAmp : 0);
    hist.push(chunk, n);
  }
}

function setSource(v) {
  if (v === S.source && v !== 'file') return;
  if (v === 'file' && !S.src.file.data) { $('file').click(); return; }
  if (S.source === 'mic') stopMic();
  S.source = v;
  makeSource();
  if (v === 'mic') startMic();
  renderSound();
  goLive();
}

/* ---------- speakers ---------- */

let out = null;
function ensureOut() {
  if (out) return out;
  let ctx;
  try { ctx = new AudioContext({ sampleRate: SR }); } catch { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  out = { ctx, master, on: false, nodes: new Set(), anchorT: 0, anchorS: 0, sched: 0, tmp: new Float32Array(4096) };
  return out;
}
function setHear(on) {
  ensureOut();
  out.on = on;
  if (on) out.ctx.resume();
  $('hear').setAttribute('aria-pressed', String(on));
  stopNodes();
  if (on && playing) anchor();
  updateVolume();
  if (on && S.source === 'mic') toast('The speakers stay quiet while the microphone is listening.');
}
function updateVolume() {
  if (!out) return;
  const audible = out.on && playing && S.source !== 'mic';
  out.master.gain.setTargetAtTime(audible ? S.volume * 0.6 : 0, out.ctx.currentTime, 0.03);
}
function anchor() {
  out.anchorT = out.ctx.currentTime + 0.08;
  out.anchorS = sNow;
  out.sched = Math.floor(sNow);
}
function stopNodes() {
  if (!out) return;
  for (const n of out.nodes) { try { n.stop(); } catch {} }
  out.nodes.clear();
}
function schedule() {
  const { ctx } = out;
  while (out.sched < hist.end) {
    const n = Math.min(4096, hist.end - out.sched);
    if (n < 512) break;
    const when = out.anchorT + (out.sched - out.anchorS) / SR;
    if (when < ctx.currentTime) { anchor(); return; }
    const buf = ctx.createBuffer(1, n, SR);
    hist.read(out.sched, n, out.tmp);
    buf.copyToChannel(out.tmp.subarray(0, n), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out.master);
    src.start(when);
    out.nodes.add(src);
    src.onended = () => out.nodes.delete(src);
    out.sched += n;
  }
}
const hearing = () => out && out.on && S.source !== 'mic' && out.ctx.state === 'running';

/* ---------- microphone ---------- */

let mic = null;
let micQueue = [];
async function startMic() {
  const token = {};
  mic = null;
  micPending = token;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    await ctx.audioWorklet.addModule('capture.js');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (micPending !== token || S.source !== 'mic') { stream.getTracks().forEach((t) => t.stop()); ctx.close(); return; }
    ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'capture');
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(node).connect(sink).connect(ctx.destination);
    const rs = { pos: 0, prev: 0, step: ctx.sampleRate / SR };
    let peak = 0;
    node.port.onmessage = (e) => {
      const block = e.data;
      for (let i = 0; i < block.length; i++) peak = Math.max(peak * 0.9995, Math.abs(block[i]));
      mic.peak = peak;
      if (!playing) return;
      micQueue.push(rs.step === 1 ? block : resample(block, rs));
    };
    mic = { ctx, stream, node, peak: 0 };
    renderSound();
  } catch (err) {
    if (micPending !== token) return;
    S.source = 'chirp';
    makeSource();
    renderSound();
    toast('The microphone isn’t available, so the chirp is back on.');
  }
}
let micPending = null;
function resample(block, rs) {
  const outArr = [];
  const L = block.length;
  while (rs.pos < L - 1) {
    const i = Math.floor(rs.pos), f = rs.pos - i;
    const a = i < 0 ? rs.prev : block[i], b = block[i + 1];
    outArr.push(a + (b - a) * f);
    rs.pos += rs.step;
  }
  rs.pos -= L;
  rs.prev = block[L - 1];
  return Float32Array.from(outArr);
}
function stopMic() {
  micPending = null;
  micQueue = [];
  if (!mic) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.node.port.onmessage = null;
  mic.ctx.close();
  mic = null;
}

/* ---------- audio files ---------- */

async function loadFile(file) {
  if (!file) return;
  try {
    const bytes = await file.arrayBuffer();
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ac = new Off(1, 1, SR);
    const buf = await ac.decodeAudioData(bytes);
    const n = Math.min(buf.length, SR * 600);
    const mono = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    S.src.file.data = mono;
    S.src.file.name = file.name;
    if (S.source === 'mic') stopMic();
    S.source = 'file';
    makeSource();
    renderSound();
    goLive();
    toast(`Analysing ${file.name}.`);
  } catch {
    toast('That file couldn’t be read as audio.');
  }
}

/* ---------- layout and mapping ---------- */

let cssW = 1, cssH = 1, dpr = 1;
let plot = { x: 0, y: 0, w: 1, h: 1 };

function layoutPlot() {
  const ax = V.axes;
  if (V.layout === 'across') {
    const left = ax ? 58 : 0, bottom = ax ? 24 : 0, right = V.live ? (cssW < 600 ? 58 : 86) : 0;
    plot = { x: left, y: 0, w: Math.max(10, cssW - left - right), h: Math.max(10, cssH - bottom) };
  } else if (V.layout === 'down') {
    const left = ax ? 50 : 0, bottom = ax ? 24 : 0, top = V.live ? 72 : 0;
    plot = { x: left, y: top, w: Math.max(10, cssW - left), h: Math.max(10, cssH - top - bottom) };
  } else if (V.layout === 'polar') {
    const s = Math.min(cssW, cssH) - (ax ? 28 : 12);
    plot = { x: (cssW - s) / 2, y: (cssH - s) / 2, w: s, h: s };
  } else {
    const mx = cssW * 0.12, mt = cssH * 0.1, mb = ax ? 34 : cssH * 0.08;
    plot = { x: mx, y: mt, w: cssW - mx * 2, h: cssH - mt - mb };
  }
}

const spanCols = () => (V.span * SR) / hop;
const viewCol = () => (viewEnd ?? sNow) / hop;
const fracOf = (x) => x - Math.floor(x);

// time (as a column) and frequency -> CSS pixel; u runs 0..1 along the time axis
function timeU(col) {
  const span = spanCols(), now = viewCol();
  if (V.motion === 'wipe') return fracOf(col / span);
  return 1 - (now - col) / span;
}
function project(col, f) {
  const u = timeU(col), y = toAxis(f, V.scale, V.fmin, V.fmax);
  if (V.layout === 'across') return [plot.x + u * plot.w, plot.y + (1 - y) * plot.h];
  if (V.layout === 'down') return [plot.x + y * plot.w, plot.y + (1 - u) * plot.h];
  if (V.layout === 'polar') {
    const R = plot.w / 2, r0 = R * V.hole, r = r0 + y * (R - r0), a = u * Math.PI * 2;
    return [plot.x + R + r * Math.sin(a), plot.y + R - r * Math.cos(a)];
  }
  return null;
}
// CSS pixel -> { col, f } or null if outside the picture
function unproject(x, y) {
  let u, ay;
  if (V.layout === 'across') { u = (x - plot.x) / plot.w; ay = 1 - (y - plot.y) / plot.h; }
  else if (V.layout === 'down') { ay = (x - plot.x) / plot.w; u = 1 - (y - plot.y) / plot.h; }
  else if (V.layout === 'polar') {
    const R = plot.w / 2, dx = x - plot.x - R, dy = y - plot.y - R, r = Math.hypot(dx, dy), r0 = R * V.hole;
    if (r > R || r < r0) return null;
    ay = (r - r0) / (R - r0);
    u = fracOf(Math.atan2(dx, -dy) / (Math.PI * 2) + 1);
  } else {
    ay = (x - plot.x) / plot.w;
    if (ay < 0 || ay > 1 || y < plot.y || y > plot.y + plot.h) return null;
    return { col: Math.floor(viewCol()), f: fromAxis(ay, V.scale, V.fmin, V.fmax) };
  }
  if (u < 0 || u > 1 || ay < 0 || ay > 1) return null;
  const span = spanCols(), now = viewCol();
  const col = V.motion === 'wipe' ? now - (((now - u * span) % span) + span) % span : now - (1 - u) * span;
  return { col, f: fromAxis(ay, V.scale, V.fmin, V.fmax) };
}

/* ---------- ticks ---------- */

function freqTicks(px) {
  const lo = V.fmin, hi = V.fmax;
  let list = [];
  if (V.scale === 'piano') {
    for (let m = 12; m < 140; m += 12) { const f = 440 * Math.pow(2, (m - 69) / 12); if (f >= lo && f <= hi) list.push({ f, label: `C${m / 12 - 1}` }); }
  } else if (V.scale === 'linear') {
    const raw = (hi - lo) / Math.max(2, px / 46);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
    for (let f = Math.ceil(lo / step) * step; f <= hi; f += step) list.push({ f, label: fmtTick(f) });
  } else {
    for (let d = 1; d <= 100000; d *= 10) for (const m of [1, 2, 5]) { const f = m * d; if (f >= lo && f <= hi) list.push({ f, label: fmtTick(f) }); }
    // thin out when crowded
    const keep = [];
    let last = -1e9;
    for (const t of list) { const y = toAxis(t.f, V.scale, lo, hi) * px; if (y - last >= 16) { keep.push(t); last = y; } }
    list = keep;
  }
  return list;
}
const fmtTick = (f) => (f >= 1000 ? `${+(f / 1000).toFixed(1)}k` : `${Math.round(f)}`);

function timeTicks() {
  const raw = V.span / 6;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

/* ---------- overlay ---------- */

let pointer = null;           // { x, y } in CSS px over the picture
let hover = null;             // { col, f, db, ago }
const hoverData = new Float32Array(8192);
let hoverKey = '';

function drawOverlay() {
  const c = $('overlay');
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssW, cssH);
  const ink = lightBg ? 'rgba(40,34,26,' : 'rgba(232,238,234,';
  g.font = '10.5px "Söhne Mono", ui-monospace, "SF Mono", Menlo, monospace';
  g.textBaseline = 'middle';
  const now = viewCol();

  if (V.layout === 'across' || V.layout === 'down') {
    const across = V.layout === 'across';
    const fpx = across ? plot.h : plot.w;
    if (V.axes) {
      const ticks = freqTicks(fpx);
      g.fillStyle = ink + '0.72)';
      g.strokeStyle = ink + '0.1)';
      g.lineWidth = 1;
      for (const t of ticks) {
        const a = toAxis(t.f, V.scale, V.fmin, V.fmax);
        if (across) {
          const y = Math.round(plot.y + (1 - a) * plot.h) + 0.5;
          g.beginPath(); g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); g.stroke();
          g.textAlign = 'right';
          g.fillText(t.label, plot.x - (V.scale === 'piano' ? 18 : 6), clamp(y, 7, cssH - 30));
        } else {
          const x = Math.round(plot.x + a * plot.w) + 0.5;
          g.beginPath(); g.moveTo(x, plot.y); g.lineTo(x, plot.y + plot.h); g.stroke();
          g.textAlign = 'center';
          g.fillText(t.label, clamp(x, 14, cssW - 14), plot.y + plot.h + 12);
        }
      }
      if (V.scale === 'piano') drawKeys(g, across);
      // time ticks: seconds before the right edge (or the top, for the waterfall)
      if (V.motion === 'scroll') {
        const step = timeTicks();
        const tEnd = (viewEnd ?? sNow) / SR;
        g.fillStyle = ink + '0.6)';
        const tStart = hist.start / SR;
        for (let t = Math.floor(tEnd / step) * step; t > tEnd - V.span && t >= tStart - 1e-6; t -= step) {
          const u = 1 - (tEnd - t) / V.span;
          const label = `${trim(t)} s`;
          if (across) {
            const x = Math.round(plot.x + u * plot.w) + 0.5;
            g.strokeStyle = ink + '0.08)';
            g.beginPath(); g.moveTo(x, plot.y); g.lineTo(x, plot.y + plot.h); g.stroke();
            g.textAlign = 'center';
            if (x > plot.x + 16 && x < plot.x + plot.w - 16) g.fillText(label, x, plot.y + plot.h + 12);
          } else {
            const y = Math.round(plot.y + (1 - u) * plot.h) + 0.5;
            g.strokeStyle = ink + '0.08)';
            g.beginPath(); g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); g.stroke();
            g.textAlign = 'right';
            if (y > plot.y + 8 && y < plot.y + plot.h - 8) g.fillText(label, plot.x - 6, y);
          }
        }
      }
    }
    if (V.motion === 'wipe') {
      const u = fracOf(now / spanCols());
      g.strokeStyle = ink + '0.85)';
      g.lineWidth = 1.5;
      g.beginPath();
      if (across) { const x = plot.x + u * plot.w; g.moveTo(x, plot.y); g.lineTo(x, plot.y + plot.h); }
      else { const y = plot.y + (1 - u) * plot.h; g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); }
      g.stroke();
    }
    if (V.live) drawLive(g, across, ink);
  } else if (V.layout === 'polar') {
    const R = plot.w / 2, cx = plot.x + R, cy = plot.y + R, r0 = R * V.hole;
    if (V.axes) {
      g.strokeStyle = ink + '0.12)';
      g.fillStyle = ink + '0.65)';
      g.textAlign = 'left';
      for (const t of freqTicks(R - r0)) {
        const r = r0 + toAxis(t.f, V.scale, V.fmin, V.fmax) * (R - r0);
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.fillText(t.label, cx + 4, cy - r - 6);
      }
    }
    if (V.motion === 'wipe') {
      const a = fracOf(now / spanCols()) * Math.PI * 2;
      g.strokeStyle = ink + '0.85)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx + r0 * Math.sin(a), cy - r0 * Math.cos(a)); g.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a)); g.stroke();
    } else {
      g.strokeStyle = ink + '0.5)';
      g.beginPath(); g.moveTo(cx, cy - r0); g.lineTo(cx, cy - R); g.stroke();
    }
  } else if (V.axes) {
    g.fillStyle = ink + '0.65)';
    g.strokeStyle = ink + '0.25)';
    g.textAlign = 'center';
    const yb = plot.y + plot.h + 16;
    for (const t of freqTicks(plot.w)) {
      const x = plot.x + toAxis(t.f, V.scale, V.fmin, V.fmax) * plot.w;
      g.beginPath(); g.moveTo(x, yb - 12); g.lineTo(x, yb - 8); g.stroke();
      g.fillText(t.label, x, yb);
    }
  }

  if (V.trace && V.layout !== 'ridge') drawTrace(g);
  if (hover && pointer) drawCursor(g, ink);
}

function drawKeys(g, across) {
  const lo = V.fmin, hi = V.fmax;
  const m0 = Math.ceil(12 * Math.log2(lo / 440) + 69), m1 = Math.floor(12 * Math.log2(hi / 440) + 69);
  for (let m = m0; m <= m1; m++) {
    const black = [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const a = toAxis(f, V.scale, lo, hi), da = toAxis(f * Math.pow(2, 1 / 24), V.scale, lo, hi) - a;
    g.fillStyle = black ? (lightBg ? '#2a241c' : '#16171a') : (lightBg ? '#fffdf8' : '#d9dcd8');
    if (across) {
      const y = plot.y + (1 - a - da) * plot.h, h = Math.max(1, da * 2 * plot.h - 0.6);
      g.fillRect(plot.x - (black ? 9 : 14), y, black ? 9 : 14, h);
    } else {
      const x = plot.x + (a - da) * plot.w, w = Math.max(1, da * 2 * plot.w - 0.6);
      g.fillRect(x, plot.y + plot.h, w, black ? 5 : 8);
    }
  }
}

const liveData = new Float32Array(8192);
let liveKey = '';
function drawLive(g, across, ink) {
  const n = stft.bins;
  // the spectrum at the right-hand edge of the view: now, or wherever it was paused
  const c = Math.floor(viewCol());
  if (c < 0) return;
  const key = `${c}|${hop}|${A.size}|${A.window}|${A.pad}|${A.mag}|${A.param[A.window]}`;
  if (key !== liveKey) { liveKey = key; stft.column(hist, c, liveData); }
  const data = liveData;
  const lo = ST.lo, hi = ST.hi;
  const lvl = (v) => clamp(A.mag === 'linear' ? v / Math.pow(10, hi / 20) : (v - lo) / (hi - lo), 0, 1);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  g.strokeStyle = accent;
  g.lineWidth = 1.2;
  g.beginPath();
  const len = across ? plot.h : plot.w;
  const steps = Math.min(600, Math.round(len));
  for (let i = 0; i <= steps; i++) {
    const a0 = i / steps, a1 = (i + 1) / steps;
    const b0 = fromAxis(a0, V.scale, V.fmin, V.fmax) / stft.binHz, b1 = fromAxis(a1, V.scale, V.fmin, V.fmax) / stft.binHz;
    let v = -1e9;
    for (let b = Math.floor(b0); b <= Math.max(Math.floor(b0), Math.floor(b1)); b++) if (b >= 0 && b < n) v = Math.max(v, data[b]);
    const l = v < -1e8 ? 0 : lvl(v);
    if (across) {
      const x = plot.x + plot.w + 6 + l * (cssW < 600 ? 46 : 74), y = plot.y + (1 - a0) * plot.h;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    } else {
      const x = plot.x + a0 * plot.w, y = plot.y - 6 - l * 62;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  }
  g.stroke();
  g.fillStyle = ink + '0.5)';
  g.textAlign = 'left';
  if (across) g.fillText(viewEnd == null || playing ? 'Now' : 'Here', plot.x + plot.w + 8, cssH - 12);
}

function drawTrace(g) {
  const span = spanCols(), now = Math.floor(viewCol());
  const step = Math.max(1, Math.round(span / 700));
  g.strokeStyle = lightBg ? 'rgba(200,30,30,0.85)' : 'rgba(255,255,255,0.9)';
  g.lineWidth = 1.6;
  g.beginPath();
  let pen = false, last = null;
  for (let c = now - Math.floor(span); c <= now; c += step) {
    const pk = cols.peak(c);
    const ok = pk && pk.level > ST.lo + (ST.hi - ST.lo) * 0.35 && pk.hz >= V.fmin && pk.hz <= V.fmax;
    const p = ok ? project(c, pk.hz) : null;
    if (p && last && Math.hypot(p[0] - last[0], p[1] - last[1]) > 40) pen = false;
    if (p) { pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; } else pen = false;
    last = p;
  }
  g.stroke();
}

function drawCursor(g, ink) {
  const { x, y } = pointer;
  g.strokeStyle = ink + '0.55)';
  g.lineWidth = 1;
  g.setLineDash([3, 3]);
  g.beginPath();
  if (V.layout === 'across') { g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); g.moveTo(x, plot.y); g.lineTo(x, plot.y + plot.h); }
  else if (V.layout === 'down' || V.layout === 'ridge') { g.moveTo(x, plot.y); g.lineTo(x, plot.y + plot.h); if (V.layout === 'down') { g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); } }
  else {
    const R = plot.w / 2, cx = plot.x + R, cy = plot.y + R;
    g.arc(cx, cy, Math.hypot(x - cx, y - cy), 0, Math.PI * 2);
  }
  g.stroke();
  g.setLineDash([]);
  if (V.harmonics && V.layout !== 'ridge') {
    g.strokeStyle = ink + '0.4)';
    for (let k = 2; k <= 12; k++) {
      const f = hover.f * k;
      if (f > V.fmax) break;
      const a = toAxis(f, V.scale, V.fmin, V.fmax);
      g.beginPath();
      if (V.layout === 'across') { const yy = plot.y + (1 - a) * plot.h; g.moveTo(plot.x, yy); g.lineTo(plot.x + plot.w, yy); }
      else if (V.layout === 'down') { const xx = plot.x + a * plot.w; g.moveTo(xx, plot.y); g.lineTo(xx, plot.y + plot.h); }
      else { const R = plot.w / 2, r = R * V.hole + a * (R - R * V.hole); g.arc(plot.x + R, plot.y + R, r, 0, Math.PI * 2); }
      g.stroke();
      if (V.layout === 'across') { g.fillStyle = ink + '0.5)'; g.textAlign = 'left'; g.fillText(`${k}×`, plot.x + 4, plot.y + (1 - a) * plot.h - 7); }
    }
  }
}

function updateHover() {
  hover = null;
  if (!pointer) return;
  const q = unproject(pointer.x, pointer.y);
  if (!q) return;
  const c = Math.round(q.col);
  const key = `${c}|${hop}|${A.size}|${A.window}|${A.pad}|${A.mag}|${A.param[A.window]}`;
  if (key !== hoverKey && c >= 0 && c * hop <= sNow) { hoverKey = key; stft.column(hist, c, hoverData); }
  const b = Math.round(q.f / stft.binHz);
  const db = c >= 0 && c * hop <= sNow && b >= 0 && b < stft.bins ? hoverData[b] : null;
  hover = { col: c, f: q.f, db, ago: (sNow - c * hop) / SR };
}

/* ---------- readout ---------- */

function updateReadout() {
  const box = $('readout');
  const parts = [];
  if (hover) {
    const n = noteOf(hover.f);
    parts.push(el('span', {}, el('b', { text: fmtHz(hover.f) }), ` ${n.name} ${n.cents >= 0 ? '+' : '−'}${Math.abs(n.cents)}¢`));
    if (hover.db != null) parts.push(el('span', { text: A.mag === 'linear' ? `Amplitude ${trim(hover.db)}` : hover.db <= DB_FLOOR + 1 ? 'Silent' : fmtDb(hover.db) }));
    parts.push(el('span', { text: hover.ago < 0.05 ? 'Now' : `${trim(hover.ago)} s ago` }));
  } else {
    const label = S.source === 'mic' ? 'Microphone' : SOURCES[S.source].name;
    parts.push(el('span', {}, el('b', { text: label })));
    const pk = cols.latestCol >= 0 ? cols.peak(cols.latestCol) : null;
    if (pk && pk.level > ST.lo + 6) {
      const n = noteOf(pk.hz);
      parts.push(el('span', { text: `Loudest ${fmtHz(pk.hz)} · ${n.name}` }));
    } else parts.push(el('span', { text: 'Quiet' }));
  }
  const w = WINDOWS.find((x) => x.id === A.window).name;
  parts.push(el('span', { class: 'gap', text: `${A.size}-point ${w} · ${trim(SR / (A.size * A.pad))} Hz bins · ${fmtS(hop / SR)} hop` }));
  box.replaceChildren(...parts);
}

/* ---------- transport ---------- */

function setPlaying(on) {
  if (on === playing) return;
  playing = on;
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('play').title = on ? 'Pause (Space)' : 'Play (Space)';
  $('play-icon').setAttribute('d', on ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5l9 5.5-9 5.5z');
  $('overlay').classList.toggle('is-paused', !on);
  if (on) {
    viewEnd = null;
    micQueue = [];
    if (out?.on) { stopNodes(); anchor(); }
  } else {
    stopNodes();
  }
  updateVolume();
}
function goLive() {
  viewEnd = null;
  setPlaying(true);
}
function lookBack(frac) {
  setPlaying(false);
  const lo = Math.min(sNow, hist.start + V.span * SR * 0.2);
  viewEnd = clamp((viewEnd ?? sNow) + frac * V.span * SR, lo, sNow);
  if (viewEnd >= sNow) viewEnd = sNow;
}

let scrubbing = false;
function updateTimeline() {
  const scrub = $('scrub');
  const lo = Math.min(sNow, hist.start + V.span * SR * 0.2);
  const end = viewEnd ?? sNow;
  const len = sNow - lo;
  if (!scrubbing) {
    scrub.value = len > 0 ? Math.round(((end - lo) / len) * 1000) : 1000;
    paint(scrub);
  }
  const behind = (sNow - end) / SR;
  $('tstart').textContent = `Recorded ${fmtClock(Math.min(sNow, HISTORY_S * SR) / SR)}`;
  $('tnow').textContent = playing ? 'Live' : behind < 0.01 ? 'Paused' : `Paused, ${trim(behind)} s back`;
  scrub.setAttribute('aria-valuetext', behind < 0.01 ? 'Now' : `${trim(behind)} seconds back`);
  $('live').setAttribute('aria-pressed', String(playing));
}

/* ---------- interaction ---------- */

function wireView() {
  const c = $('overlay');
  let drag = null;
  const local = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  c.addEventListener('pointerdown', (e) => {
    const p = local(e);
    drag = { x: p.x, y: p.y, end: viewEnd ?? sNow, moved: false };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => {
    pointer = local(e);
    if (!drag) return;
    // drag the picture: right (or up, in the waterfall) to look back in time
    const down = V.layout === 'down';
    const d = down ? drag.y - pointer.y : pointer.x - drag.x;
    if (!drag.moved && Math.abs(d) < 4) return;
    if (!drag.moved) { drag.moved = true; setPlaying(false); c.classList.add('is-dragging'); }
    const len = down ? plot.h : plot.w;
    const lo = Math.min(sNow, hist.start + V.span * SR * 0.2);
    viewEnd = clamp(drag.end - (d / len) * V.span * SR, lo, sNow);
  });
  const end = () => { drag = null; c.classList.remove('is-dragging'); };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => { pointer = null; });
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    V.span = clamp(V.span * Math.exp(e.deltaY * 0.0015), 1, 60);
    spanChanged();
    spanSlider?.sync();
  }, { passive: false });
  c.addEventListener('dblclick', () => goLive());

  const stage = $('stage');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').hidden = false; });
  stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) $('drop').hidden = true; });
  stage.addEventListener('drop', (e) => { e.preventDefault(); $('drop').hidden = true; loadFile(e.dataTransfer.files[0]); });
  $('file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
}

function wire() {
  $('play').addEventListener('click', () => { if (playing) setPlaying(false); else goLive(); });
  $('stepb').addEventListener('click', () => lookBack(-0.1));
  $('stepf').addEventListener('click', () => lookBack(0.1));
  $('live').addEventListener('click', goLive);
  $('hear').addEventListener('click', () => setHear(!out?.on));
  $('snap').addEventListener('click', () => { snapPending = true; });
  $('full').addEventListener('click', toggleFull);
  $('hide').addEventListener('click', toggleHide);

  const scrub = $('scrub');
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('input', () => {
    setPlaying(false);
    const lo = Math.min(sNow, hist.start + V.span * SR * 0.2);
    viewEnd = lo + (sNow - lo) * (+scrub.value / 1000);
    paint(scrub);
  });

  const tabs = [...document.querySelectorAll('.tab')];
  const select = (tab) => {
    for (const x of tabs) {
      const on = x === tab;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      $(x.getAttribute('aria-controls')).hidden = !on;
    }
    if (tab.id === 'tab-fft') requestAnimationFrame(drawWindow);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' && e.target.type === 'text' || tag === 'SELECT' || tag === 'TEXTAREA';
    const k = e.key.toLowerCase();
    if (k === ' ' && !(tag === 'BUTTON' || typing)) { e.preventDefault(); if (playing) setPlaying(false); else goLive(); return; }
    if (typing || tag === 'INPUT') return;
    if (k === 'l') goLive();
    else if (k === 'f') toggleFull();
    else if (k === 'h') toggleHide();
    else if (k === 's') snapPending = true;
    else if (k === 't') setHear(!out?.on);
    else if (e.key === 'ArrowLeft' && !e.target.closest('[role=tablist]')) { e.preventDefault(); lookBack(-0.1); }
    else if (e.key === 'ArrowRight' && !e.target.closest('[role=tablist]')) { e.preventDefault(); lookBack(0.1); }
  });

  wireView();
  new ResizeObserver(() => fit()).observe($('stage'));
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here.'));
}
function toggleHide() {
  const hidden = document.body.classList.toggle('ui-hidden');
  $('hide-text').textContent = hidden ? 'Show controls' : 'Hide controls';
  $('hide').setAttribute('aria-expanded', String(!hidden));
}

function fit() {
  const stage = $('stage');
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = Math.max(1, stage.clientWidth);
  cssH = Math.max(1, stage.clientHeight);
  renderer.resize(Math.round(cssW * dpr), Math.round(cssH * dpr));
  const o = $('overlay');
  o.width = Math.round(cssW * dpr);
  o.height = Math.round(cssH * dpr);
}

/* ---------- frame loop ---------- */

let snapPending = false;
let last = 0, lastUi = 0, seed = 0;

function advance(dt) {
  if (!playing) return;
  if (S.source === 'mic') {
    for (const b of micQueue) hist.push(b, b.length);
    micQueue = [];
    sNow = hist.end;
    return;
  }
  if (hearing()) {
    const t = out.anchorS + (out.ctx.currentTime - out.anchorT) * SR;
    if (t - hist.end > SR) { sNow = hist.end; stopNodes(); anchor(); }
    else sNow = Math.max(sNow, t);
    generate(Math.ceil(sNow + 0.25 * SR));
    schedule();
  } else {
    sNow += dt * SR;
    generate(Math.ceil(sNow) + 64);
  }
}

function autoLevel() {
  if (!ST.auto) return;
  const span = Math.floor(spanCols()), now = Math.floor(viewCol());
  let mx = -Infinity;
  for (let c = now - span; c <= now; c += Math.max(1, Math.floor(span / 400))) { const pk = cols.peak(c); if (pk) mx = Math.max(mx, pk.level); }
  if (!isFinite(mx) || A.mag === 'linear') return;
  const range = ST.hi - ST.lo;
  const hi = clamp(mx + 2, -60, 12);
  ST.hi += (hi - ST.hi) * 0.08;
  ST.lo = ST.hi - range;
}

function draw() {
  const span = spanCols();
  const colNow = viewCol();
  const latest = Math.floor(sNow / hop);
  const r = V.ridge;
  const ridge = V.layout === 'ridge';
  const lines = Math.round(r.lines);
  const stepCols = Math.max(1, Math.floor(span / lines));
  const c1 = Math.min(latest, Math.floor(colNow) + 1);
  const c0 = ridge ? Math.floor(colNow) - stepCols * lines : Math.floor(colNow - span) - 1;
  cols.fill(stft, hist, c0, c1, 7);
  autoLevel();
  layoutPlot();
  seed = (seed + 17.31) % 1000;
  const viewIndex = { across: 0, down: 1, polar: 2, ridge: 3 }[V.layout];
  const H = cssH;
  renderer.draw({
    plot: [plot.x * dpr, (H - plot.y - plot.h) * dpr, plot.w * dpr, plot.h * dpr],
    colNow, span, latest: Math.min(latest, Math.floor(colNow) + 1), bins: stft.bins, binHz: stft.binHz,
    fmin: Math.max(V.scale === 'linear' ? 0 : 1, V.fmin), fmax: V.fmax, scale: SCALE_INDEX[V.scale],
    lo: ST.lo, hi: ST.hi, gamma: ST.gamma, levels: ST.levels, blocky: ST.blocky, linearMag: A.mag === 'linear',
    view: viewIndex, wipe: V.motion === 'wipe' && !ridge, hole: V.hole, bg: bgRgb,
    ridge: {
      lines, points: Math.min(420, Math.max(60, Math.round(plot.w * dpr / 3))), stepCols, height: r.height, depth: r.depth,
      width: r.width * dpr, colorMode: { level: 0, one: 1, age: 2 }[r.color], fill: r.fill === 'tint' ? 1 : 0,
    },
    glow: ST.glow, grain: ST.grain, vignette: ST.vignette, scan: ST.scan, dpr, seed, invert: ST.invert,
  });
  updateHover();
  drawOverlay();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  advance(dt);
  draw();
  if (snapPending) { snapPending = false; saveSnapshot(); }
  if (now - lastUi > 120) {
    lastUi = now;
    updateReadout();
    updateTimeline();
    if (ST.auto) { loS?.sync(); hiS?.sync(); }
    if (micMeter && mic) micMeter.style.width = `${clamp(mic.peak * 1.4, 0, 1) * 100}%`;
  }
}

function saveSnapshot() {
  const c = el('canvas');
  c.width = renderer.w; c.height = renderer.h;
  const g = c.getContext('2d');
  g.drawImage($('view'), 0, 0);
  g.drawImage($('overlay'), 0, 0);
  c.toBlob((blob) => {
    if (!blob) return;
    const a = el('a', { href: URL.createObjectURL(blob), download: 'spectrogram.png' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

/* ---------- start ---------- */

try {
  renderer = new Renderer($('view'));
} catch (err) {
  document.body.append(el('div', { class: 'fatal', text: `This needs WebGL 2, which isn’t available here. ${err.message}` }));
  throw err;
}
cols = new Columns(renderer.ring, renderer.maxBins, (slot, col, data) => renderer.upload(slot, col, data, stft.bins));
makeSource();
paletteChanged();
analysisChanged();
wire();
renderAll();
fit();
requestAnimationFrame(frame);

// for scripted checks
window.__spec = {
  S, A, V, ST, hist, cols, stft, get sNow() { return sNow; }, get hop() { return hop; }, get hover() { return hover; },
  applyPreset: (i) => applyPreset(PRESETS[i]), presets: PRESETS.map((p) => p.name), setSource, renderAll,
  setPointer: (x, y) => { pointer = x == null ? null : { x, y }; }, get plot() { return plot; },
};
