import { Dish, FLUIDS, WAVEFORMS, TAU, MAX_X, noteOf } from './physics.js';
import { Renderer, MAX_MODES } from './render.js?v=5';

const $ = (id) => document.getElementById(id);

/* ---------- formatting ---------- */

const minus = (s) => String(s).replace('-', '−');
const trim = (x) => minus(String(+(+x).toPrecision(3)));
const fmtHz = (f) => (f >= 1000 ? `${trim(f / 1000)} kHz` : `${trim(f)} Hz`);
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtMm = (x) => `${trim(x)} mm`;
const fmtX = (x) => `${trim(x)}×`;
const fmtDeg = (x) => `${Math.round(x)}°`;
const fmtS = (x) => `${trim(x)} s`;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/* ---------- palettes ---------- */

const PALETTES = [
  { id: 'moon', name: 'Moonlight', stops: ['#000000', '#0b1a33', '#2f5d9a', '#a9d4ff', '#ffffff'] },
  { id: 'gold', name: 'Gold leaf', stops: ['#000000', '#2a1400', '#8a4f0c', '#e3a83a', '#fff2c4'] },
  { id: 'glacier', name: 'Glacier', stops: ['#00070a', '#063a44', '#14958f', '#93f2df', '#f4fffd'] },
  { id: 'ember', name: 'Ember', stops: ['#000000', '#300400', '#a3200a', '#ff7a2a', '#ffe7c2'] },
  { id: 'infrared', name: 'Infrared', stops: ['#05000d', '#3a0a6e', '#c4146a', '#ff8a1c', '#fff4a8'] },
  { id: 'orchid', name: 'Orchid', stops: ['#05020a', '#2b0f4a', '#7c3bbf', '#e59cff', '#fff0ff'] },
  { id: 'ink', name: 'Ink on paper', stops: ['#f2ede2', '#d9d0bf', '#8a7f6c', '#2e2820', '#0d0a07'] },
  { id: 'mono', name: 'Silver', stops: ['#000000', '#1c1c1c', '#6b6b6b', '#d6d6d6', '#ffffff'] },
  { id: 'spectrum', name: 'Spectrum', stops: ['#000000', '#3b0a8f', '#0077ff', '#00d48a', '#ffe14a', '#ff5a3c', '#ffffff'] },
  { id: 'custom', name: 'Custom' },
];

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

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
      // blend in linear light so the ramps don't go muddy
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

const LIGHTS = [
  ['ring', 'Ring of lights', 'LEDs round the camera reflect off the slopes, as in a real cymascope'],
  ['shadow', 'Shadowgraph', 'Light from below is focused by the curved surface onto a screen'],
  ['relief', 'Raking light', 'A single lamp low to one side shows the surface as relief'],
  ['height', 'Height map', 'Colour shows how far the surface rises or falls'],
  ['contour', 'Contours', 'Lines of equal height, like a map'],
  ['schlieren', 'Schlieren', 'A knife edge in the light path turns slope into shade'],
];
const LIGHT_INDEX = Object.fromEntries(LIGHTS.map(([id], i) => [id, i]));

function defaults() {
  return {
    P: {
      source: 'tones',
      tones: [
        { on: true, freq: 141, level: 1, wave: 'sine' },
        { on: false, freq: 211, level: 0.7, wave: 'sine' },
      ],
      sweep: { on: false, from: 40, to: 600, period: 40 },
      volume: 0.35,
      fluid: 'water', diameter: 40, depth: 3, damping: 1, mix: 0.55,
      drive: 0.6, nonlin: 0.25, autoGain: true, strobe: 0.35, lock: 0.9, symmetry: 0,
    },
    L: {
      light: 'ring', rho: 0.42, size: 0.06, leds: 0, coax: 0.12, ambient: 0.02,
      split: 0, focus: 1.2, contour: 4, angle: 135,
    },
    ST: {
      palette: 'moon', custom: ['#000000', '#16233f', '#d0485f', '#ffd8a8', '#ffffff'],
      colorBy: 'light', hue: 0, exposure: 1.5, contrast: 1, glow: 0.45, grain: 0.03, vignette: 0.35,
      rim: 0.6, shape: 'dish', zoom: 1, rotation: 0, spin: 0, fold: 0, invert: false,
    },
  };
}

const D = defaults();
const P = D.P, L = D.L, ST = D.ST;

const fluid = () => FLUIDS.find((f) => f.id === P.fluid);

/* ---------- presets ---------- */

const PRESETS = [
  { name: 'Ring of lights', P: {}, L: {}, ST: {} },
  { name: 'Gold mandala', P: { tones: [{ freq: 287 }] }, L: { leds: 36, size: 0.08, rho: 0.38 }, ST: { palette: 'gold', glow: 0.7 } },
  { name: 'Shadowgraph', P: { tones: [{ freq: 96 }] }, L: { light: 'shadow', focus: 1.4 }, ST: { palette: 'glacier', exposure: 1.4 } },
  { name: 'Low hum', P: { tones: [{ freq: 32 }], depth: 5, drive: 0.7 }, L: { light: 'relief', angle: 120 }, ST: { palette: 'mono', exposure: 1.7 } },
  { name: 'Two-tone beat', P: { tones: [{ freq: 180, on: true }, { freq: 181.5, on: true, level: 0.8 }], strobe: 0.2 }, L: { leds: 24 }, ST: { palette: 'orchid' } },
  { name: 'Slow sweep', P: { sweep: { on: true, from: 30, to: 500, period: 60 } }, L: {}, ST: { palette: 'ember' } },
  { name: 'Rainbow LEDs', P: { tones: [{ freq: 287 }] }, L: { split: 0.22, leds: 0, size: 0.09 }, ST: { palette: 'mono', exposure: 1.8, glow: 0.6 } },
  { name: 'Ink on paper', P: { tones: [{ freq: 164 }] }, L: { light: 'contour', contour: 3 }, ST: { palette: 'ink', glow: 0, vignette: 0.15, grain: 0.05, rim: 0.4 } },
  { name: 'Iridescent', P: { tones: [{ freq: 180, wave: 'triangle' }] }, L: { light: 'relief' }, ST: { colorBy: 'direction', palette: 'mono', exposure: 1.6 } },
  { name: 'Heat map', P: { tones: [{ freq: 120 }] }, L: { light: 'height' }, ST: { palette: 'infrared', colorBy: 'light', glow: 0.3, exposure: 1.4, contrast: 1.5 } },
  { name: 'Mercury', P: { fluid: 'mercury', tones: [{ freq: 330 }], drive: 0.45 }, L: { leds: 48, size: 0.045, coax: 0.05 }, ST: { palette: 'mono', exposure: 2.2, glow: 0.8 } },
  { name: 'Kaleidoscope', P: { tones: [{ freq: 90, wave: 'square' }], mix: 0.9 }, L: { leds: 12 }, ST: { fold: 8, palette: 'spectrum', colorBy: 'light', shape: 'fill', glow: 0.6 } },
];

function applyPreset(pr) {
  const d = defaults();
  Object.assign(P, d.P, pr.P, { tones: d.P.tones.map((t, i) => ({ ...t, ...(pr.P.tones?.[i] || {}) })), sweep: { ...d.P.sweep, ...(pr.P.sweep || {}) } });
  Object.assign(L, d.L, pr.L);
  Object.assign(ST, d.ST, pr.ST);
  if (P.source === 'mic') stopMic();
  P.source = 'tones';
  T = 0;
  phase.clear();
  paletteChanged();
  renderAll();
  updateAudio();
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
  const out = el('span', { class: 'field__value' });
  const input = el('input', { type: 'range', id });
  let toS, fromS;
  if (log) {
    Object.assign(input, { min: 0, max: 1000, step: 1 });
    toS = (v) => Math.round((Math.log(v / min) / Math.log(max / min)) * 1000);
    fromS = (s) => +(min * Math.pow(max / min, s / 1000)).toPrecision(4);
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
    el('div', { class: 'field__top' }, el('label', { class: 'field__label', for: id, text: label }), out),
    input);
  node.sync = sync;
  node.input = input;
  return node;
}

function seg(label, options, get, set) {
  const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': label });
  const sync = () => {
    for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(get())));
  };
  for (const [v, text, title] of options) {
    wrap.append(el('button', {
      type: 'button', 'data-v': v, text, title,
      onclick: () => { set(typeof get() === 'number' ? +v : v); sync(); },
    }));
  }
  sync();
  return wrap;
}

function field(label, control) {
  return el('div', { class: 'field' }, el('div', { class: 'field__top' }, el('span', { class: 'field__label', text: label })), control);
}

function toggle(label, get, set) {
  const b = el('button', { class: 'switch', type: 'button', role: 'switch' },
    el('span', { text: label }), el('span', { class: 'switch__track', 'aria-hidden': 'true' }));
  const sync = () => b.setAttribute('aria-checked', String(!!get()));
  b.addEventListener('click', () => { set(!get()); sync(); });
  sync();
  return b;
}

function group(title, end, ...kids) {
  return el('section', { class: 'group' },
    el('div', { class: 'group__head' },
      el('h3', { class: 'group__title', text: title }),
      end ? el('div', { class: 'group__end' }, end) : null),
    ...kids);
}

function hint(text) { return el('p', { class: 'hint', text }); }

/* ---------- panels ---------- */

let freqSlider, micMeter, micText;

function renderSound() {
  const panel = $('panel-sound');
  panel.replaceChildren();

  panel.append(group('Presets', null,
    el('div', { class: 'presets' }, ...PRESETS.map((pr) => el('button', { class: 'preset', type: 'button', text: pr.name, onclick: () => applyPreset(pr) })))));

  panel.append(group('Source', null,
    seg('Source', [['tones', 'Tone generator'], ['mic', 'Microphone']], () => P.source, (v) => setSource(v)),
    P.source === 'mic'
      ? el('div', { class: 'field' },
        (micText = el('p', { class: 'hint', text: mic ? 'Listening. Sing, whistle or play something near the microphone.' : 'Asking for the microphone…' })),
        el('div', { class: 'meter', 'aria-hidden': 'true' }, (micMeter = el('span'))))
      : null));

  if (P.source === 'tones') {
    P.tones.forEach((tone, i) => {
      const body = [];
      const f = slider({
        label: 'Frequency', min: 10, max: 2000, log: true,
        get: () => tone.freq, set: (v) => { tone.freq = v; if (i === 0 && P.sweep.on) { P.sweep.on = false; renderSound(); } changed(); },
        fmt: (v) => { const n = noteOf(v); return `${fmtHz(v)} · ${n.name}`; },
        disabled: i === 0 && P.sweep.on,
      });
      if (i === 0) freqSlider = f;
      body.push(f);
      body.push(slider({ label: 'Level', min: 0, max: 1, get: () => tone.level, set: (v) => { tone.level = v; changed(); }, fmt: fmtPct }));
      body.push(field('Waveform', seg('Waveform', [['sine', 'Sine'], ['triangle', 'Triangle'], ['square', 'Square'], ['saw', 'Saw']], () => tone.wave, (v) => { tone.wave = v; changed(); })));
      const sec = group(i === 0 ? 'Tone 1' : 'Tone 2', i === 0 ? null : toggle('On', () => tone.on, (v) => { tone.on = v; changed(); sec.classList.toggle('tone-off', !v); }), ...body);
      if (i === 1 && !tone.on) sec.classList.add('tone-off');
      panel.append(sec);
    });

    panel.append(group('Sweep', toggle('On', () => P.sweep.on, (v) => { P.sweep.on = v; T = 0; renderSound(); changed(); }),
      hint('Glides tone 1 slowly up and back down, so you can watch the patterns change.'),
      slider({ label: 'From', min: 10, max: 2000, log: true, get: () => P.sweep.from, set: (v) => { P.sweep.from = v; changed(); }, fmt: fmtHz }),
      slider({ label: 'To', min: 10, max: 2000, log: true, get: () => P.sweep.to, set: (v) => { P.sweep.to = v; changed(); }, fmt: fmtHz }),
      slider({ label: 'Time for each way', min: 5, max: 240, log: true, get: () => P.sweep.period, set: (v) => { P.sweep.period = v; }, fmt: fmtS })));
  }

  panel.append(group('Speakers', null,
    toggle('Hear the tone', () => !!audio?.on, (v) => setHear(v)),
    slider({ label: 'Volume', min: 0, max: 1, get: () => P.volume, set: (v) => { P.volume = v; updateAudio(); }, fmt: fmtPct }),
    P.source === 'mic' ? hint('The speakers stay quiet while the microphone is on, so it doesn’t hear itself.') : null));
}

function renderDish() {
  const panel = $('panel-dish');
  panel.replaceChildren();
  panel.append(group('Liquid', null,
    el('div', { class: 'presets' }, ...FLUIDS.map((f) => {
      const b = el('button', { class: 'btn', type: 'button', text: f.name, 'aria-pressed': String(P.fluid === f.id), onclick: () => { P.fluid = f.id; renderDish(); changed(); } });
      return b;
    })),
    hint(fluidHint())));
  panel.append(group('Dish', null,
    slider({ label: 'Diameter', min: 10, max: 120, step: 1, get: () => P.diameter, set: (v) => { P.diameter = v; changed(); }, fmt: fmtMm }),
    slider({ label: 'Depth', min: 0.5, max: 20, log: true, get: () => P.depth, set: (v) => { P.depth = v; changed(); }, fmt: fmtMm }),
    hint('A bigger dish fits more waves across it, so the same tone draws a finer pattern. Depth matters for low tones, where gravity does most of the work.')));
  panel.append(group('Response', null,
    slider({ label: 'Drive', min: 0, max: 1.5, get: () => P.drive, set: (v) => { P.drive = v; }, fmt: fmtPct }),
    slider({ label: 'Damping', min: 0.2, max: 12, log: true, get: () => P.damping, set: (v) => { P.damping = v; changed(); }, fmt: fmtX }),
    slider({ label: 'Mode mixing', min: 0, max: 1, get: () => P.mix, set: (v) => { P.mix = v; changed(); }, fmt: fmtPct }),
    slider({ label: 'Symmetry lock', min: 0, max: 1, get: () => P.lock, set: (v) => { P.lock = v; changed(); }, fmt: fmtPct }),
    slider({ label: 'Symmetry', min: 0, max: 24, step: 1, get: () => P.symmetry, set: (v) => { P.symmetry = v; changed(); }, fmt: (v) => (v === 0 ? 'Follow the tone' : `${v}-fold`) }),
    slider({ label: 'Steep crests', min: 0, max: 1, get: () => P.nonlin, set: (v) => { P.nonlin = v; }, fmt: fmtPct }),
    toggle('Keep the pattern bright between resonances', () => P.autoGain, (v) => { P.autoGain = v; }),
    hint('Damping widens each resonance, so more modes answer at once. Mode mixing lets the uneven ones join in; at zero, a perfectly centred drive only makes rings. Symmetry lock keeps the modes that share the strongest one’s symmetry, as large waves do when they interact.')));
}

function fluidHint() {
  const f = fluid();
  return `Surface tension ${trim(f.sigma * 1000)} mN/m, density ${trim(f.rho)} kg/m³, viscosity ${trim(f.nu * 1e6)} mm²/s.`;
}

function renderLight() {
  const panel = $('panel-light');
  panel.replaceChildren();
  panel.append(group('Lighting', null,
    el('div', { class: 'presets' }, ...LIGHTS.map(([id, name, title]) => el('button', {
      class: 'btn', type: 'button', text: name, title, 'aria-pressed': String(L.light === id),
      onclick: () => { L.light = id; renderLight(); },
    }))),
    hint(LIGHTS.find(([id]) => id === L.light)[2] + '.')));

  const k = [];
  if (L.light === 'ring') {
    k.push(slider({ label: 'Ring size', min: 0.05, max: 1.2, get: () => L.rho, set: (v) => { L.rho = v; }, fmt: (v) => fmtDeg(Math.atan(v / 2) * 180 / Math.PI) }));
    k.push(slider({ label: 'Number of lights', min: 0, max: 64, step: 1, get: () => L.leds, set: (v) => { L.leds = v; }, fmt: (v) => (v === 0 ? 'Continuous ring' : `${v}`) }));
    k.push(slider({ label: 'Light size', min: 0.02, max: 0.4, log: true, get: () => L.size, set: (v) => { L.size = v; }, fmt: (v) => trim(v * 100) }));
    k.push(slider({ label: 'Light from the camera', min: 0, max: 1, get: () => L.coax, set: (v) => { L.coax = v; }, fmt: fmtPct }));
  }
  if (L.light === 'shadow') k.push(slider({ label: 'Screen distance', min: 0.1, max: 4, log: true, get: () => L.focus, set: (v) => { L.focus = v; }, fmt: fmtX }));
  if (L.light === 'contour') k.push(slider({ label: 'Lines', min: 1, max: 16, step: 0.5, get: () => L.contour, set: (v) => { L.contour = v; }, fmt: (v) => trim(v) }));
  if (L.light === 'relief' || L.light === 'schlieren') k.push(slider({ label: 'Light direction', min: 0, max: 360, step: 1, get: () => L.angle, set: (v) => { L.angle = v; }, fmt: fmtDeg }));
  if (L.light === 'ring' || L.light === 'shadow' || L.light === 'schlieren') {
    k.push(slider({ label: 'Colour split', min: 0, max: 0.5, get: () => L.split, set: (v) => { L.split = v; }, fmt: fmtPct }));
  }
  k.push(slider({ label: 'Room light', min: 0, max: 0.3, get: () => L.ambient, set: (v) => { L.ambient = v; }, fmt: fmtPct }));
  panel.append(group('Light settings', null, ...k));
}

function renderStyle() {
  const panel = $('panel-style');
  panel.replaceChildren();
  const pals = el('div', { class: 'swatches swatches--pal' }, ...PALETTES.map((p) => el('button', {
    class: 'swatch', type: 'button', 'aria-pressed': String(ST.palette === p.id),
    onclick: () => { ST.palette = p.id; paletteChanged(); renderStyle(); },
  }, el('span', { class: 'swatch__bar', style: `--g:${gradientCss(p.stops || ST.custom)}`, 'aria-hidden': 'true' }), p.name)));
  const custom = ST.palette === 'custom'
    ? field('Custom colours, dark to light', el('div', { class: 'colors' }, ...ST.custom.map((c, i) => el('input', {
      type: 'color', value: c, 'aria-label': `Colour ${i + 1}`,
      oninput: (e) => { ST.custom[i] = e.target.value; paletteChanged(); pals.lastChild.querySelector('.swatch__bar').style.setProperty('--g', gradientCss(ST.custom)); },
    }))))
    : null;
  panel.append(group('Palette', null, pals, custom,
    field('Colour by', seg('Colour by', [['light', 'Brightness'], ['direction', 'Slope'], ['height', 'Height']], () => ST.colorBy, (v) => { ST.colorBy = v; renderStyle(); })),
    ST.colorBy === 'direction' ? slider({ label: 'Hue shift', min: 0, max: 1, get: () => ST.hue, set: (v) => { ST.hue = v; }, fmt: (v) => fmtDeg(v * 360) }) : null));

  panel.append(group('Tone', null,
    slider({ label: 'Exposure', min: 0.2, max: 6, log: true, get: () => ST.exposure, set: (v) => { ST.exposure = v; }, fmt: fmtX }),
    slider({ label: 'Contrast', min: 0.4, max: 3, log: true, get: () => ST.contrast, set: (v) => { ST.contrast = v; }, fmt: fmtX }),
    slider({ label: 'Glow', min: 0, max: 1.5, get: () => ST.glow, set: (v) => { ST.glow = v; }, fmt: fmtPct }),
    slider({ label: 'Grain', min: 0, max: 0.2, get: () => ST.grain, set: (v) => { ST.grain = v; }, fmt: (v) => fmtPct(v * 5) }),
    slider({ label: 'Vignette', min: 0, max: 1, get: () => ST.vignette, set: (v) => { ST.vignette = v; }, fmt: fmtPct }),
    toggle('Invert', () => ST.invert, (v) => { ST.invert = v; })));

  let zoomS, rotS;
  panel.append(group('Frame', null,
    field('Shape', seg('Shape', [['dish', 'Round dish'], ['fill', 'Fill the frame']], () => ST.shape, (v) => { ST.shape = v; })),
    slider({ label: 'Dish rim', min: 0, max: 1, get: () => ST.rim, set: (v) => { ST.rim = v; }, fmt: fmtPct }),
    (zoomS = slider({ label: 'Zoom', min: 0.5, max: 6, log: true, get: () => ST.zoom, set: (v) => { ST.zoom = v; }, fmt: fmtX })),
    (rotS = slider({ label: 'Rotation', min: -180, max: 180, step: 1, get: () => wrapDeg(ST.rotation), set: (v) => { ST.rotation = v; }, fmt: fmtDeg })),
    slider({ label: 'Spin', min: -30, max: 30, step: 0.5, get: () => ST.spin, set: (v) => { ST.spin = v; }, fmt: (v) => `${minus(trim(v))}°/s` }),
    slider({ label: 'Mirror folds', min: 0, max: 24, step: 1, get: () => ST.fold, set: (v) => { ST.fold = v; }, fmt: (v) => (v === 0 ? 'Off' : `${v}`) }),
    hint('Mirror folds repeat one wedge of the dish round the circle, like a kaleidoscope.')));
  frameSliders = [zoomS, rotS];
}
function renderDistort() {
  const panel = $('panel-distort');
  panel.replaceChildren();
  panel.append(group('Cursor', null,
    slider({ label: 'Strength', min: 0, max: 1, get: () => TC.strength, set: (v) => { TC.strength = v; }, fmt: (v) => (v === 0 ? 'Off' : fmtPct(v)) }),
    slider({ label: 'Reach', min: 0.05, max: 0.7, get: () => TC.size, set: (v) => { TC.size = v; }, fmt: fmtPct }),
    slider({ label: 'Trail', min: 0, max: 0.97, get: () => 1 - TC.follow, set: (v) => { TC.follow = 1 - v; }, fmt: fmtPct }),
    hint('Move the pointer over the picture. It bends like a lens under a fingertip. Reach is a share of the picture’s shorter side; Trail is how far the bend lags behind the pointer.')));
  panel.append(group('Ripple', null,
    slider({ label: 'Amount', min: 0, max: 1, get: () => TC.ripple, set: (v) => { TC.ripple = v; }, fmt: (v) => (v === 0 ? 'Plain lens' : fmtPct(v)) }),
    slider({ label: 'Rings', min: 1, max: 20, step: 0.5, get: () => TC.waves, set: (v) => { TC.waves = v; }, fmt: (v) => trim(v / TAU * 1.6) }),
    slider({ label: 'Speed', min: -10, max: 10, step: 0.1, get: () => TC.speed, set: (v) => { TC.speed = v; }, fmt: (v) => (v === 0 ? 'Still' : `${trim(Math.abs(v) / TAU)} Hz ${v > 0 ? 'outward' : 'inward'}`) }),
    hint('Rings run out from the pointer across its reach. A negative speed draws them inward.')));
  panel.append(group('Click', null,
    slider({ label: 'Strength', min: 0, max: 1.5, get: () => TC.click, set: (v) => { TC.click = v; }, fmt: (v) => (v === 0 ? 'Off' : fmtPct(v)) }),
    slider({ label: 'Speed', min: 0.2, max: 3, get: () => TC.clickSpeed, set: (v) => { TC.clickSpeed = v; }, fmt: fmtX }),
    slider({ label: 'Ring width', min: 0.02, max: 0.3, get: () => TC.clickWidth, set: (v) => { TC.clickWidth = v; }, fmt: fmtPct }),
    hint('Click the picture and a ring spreads from that spot, bending the picture as it passes and fading as it goes.')));
}
let frameSliders = [];
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

function renderAll() {
  renderSound();
  renderDish();
  renderLight();
  renderStyle();
  renderDistort();
  strobeSlider?.sync();
}

/* ---------- accent follows the palette ---------- */
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
  for (const c of [stops[stops.length - 2], stops[stops.length - 3]]) {
    const [r, g, b] = hexRgb(c).map((v) => v / 255);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 0.3 && lum < 0.9) { pick = c; break; }
  }
  document.documentElement.style.setProperty('--accent', greyHex(pick));
}

/* ---------- the surface ---------- */

const dish = new Dish();
// Cursor distortion: the picture bends under the pointer like a lens, with ripples running out from it.
// TC is what the Distort tab tunes; it is kept apart from the presets, so choosing one doesn't reset it.
const TC = { strength: 0, size: 0.24, ripple: 0.45, waves: 7, speed: 3.2, follow: 0.16, click: 0, clickSpeed: 0.9, clickWidth: 0.09 };
// Where the fingertip is. tx, ty: where the pointer is (CSS pixels from the canvas's top left);
// x, y trail behind it; s eases between 0 and 1 as the pointer arrives and leaves. A page that
// frames this one (the cover prototype in lab/hook) sets tx, ty and on itself.
const touch = { x: 0, y: 0, tx: 0, ty: 0, s: 0, on: false, phase: 0 };
const stillPlease = matchMedia('(prefers-reduced-motion: reduce)');
// A click sends a ring outward from where it landed, bending the picture as it passes. Up to four at once.
const pulses = [];
const pulseData = new Float32Array(16);
function pulseAt(x, y) {
  if (TC.click <= 0 || stillPlease.matches) return;
  pulses.push({ x, y, age: 0 });
  if (pulses.length > 4) pulses.shift();
}
function updateTouch(dt) {
  const f = dt * 60;
  const k = 1 - Math.pow(1 - clamp(TC.follow, 0.01, 1), f);
  touch.x += (touch.tx - touch.x) * k; touch.y += (touch.ty - touch.y) * k;
  touch.s += ((touch.on && !stillPlease.matches ? 1 : 0) - touch.s) * (1 - Math.pow(0.93, f));
  touch.phase = (touch.phase + TC.speed * dt) % TAU;
  for (const p of pulses) p.age += dt;
}
let renderer;

let T = 0;                      // seconds of playback, for the sweep and the spin
const phase = new Map();        // tone id -> phase shown on screen
let playing = true, reverse = false;
let lastSig = '';
let targets = [];               // modes answering the current tones
let info = [];
const active = new Map();       // key -> { m, x, tone, harm, amp, target, lag, row }
const rows = new Array(MAX_MODES).fill(null);
let dominant = null;
let lockM = 0;

function changed() { lastSig = ''; }

function sweepFreq() {
  const { from, to, period } = P.sweep;
  const u = (((T / period) % 2) + 2) % 2;
  const tri = u < 1 ? u : 2 - u;
  return from * Math.pow(to / from, tri);
}

// tones that drive the dish right now, with each waveform's partials
function currentTones() {
  const list = [];
  if (P.source === 'mic') {
    micPeaks.forEach((pk, i) => list.push({ id: `m${i}`, base: `m${i}`, harm: 1, f: pk.f, level: pk.level }));
    return list;
  }
  P.tones.forEach((tone, i) => {
    if (!tone.on || tone.level <= 0) return;
    const f = i === 0 && P.sweep.on ? sweepFreq() : tone.freq;
    for (const [h, w] of WAVEFORMS[tone.wave]) list.push({ id: `t${i}h${h}`, base: `t${i}`, harm: h, f: f * h, level: tone.level * w });
  });
  return list;
}

function updateModes(dt) {
  const tones = currentTones();
  const R = P.diameter / 2000, depth = P.depth / 1000;
  const sig = tones.map((t) => `${t.id}:${t.f.toFixed(3)}:${t.level.toFixed(3)}`).join('|') + `|${P.fluid}|${R}|${depth}|${P.damping}|${P.mix}`;
  if (sig !== lastSig) {
    lastSig = sig;
    const r = dish.respond(tones, { fluid: fluid(), R, depth, damping: P.damping, mix: P.mix });
    const byTone = Object.fromEntries(tones.map((t) => [t.id, t]));
    targets = r.modes.map((m) => ({ ...m, harm: byTone[m.tone].harm, base: byTone[m.tone].base }));
    targets.sort((a, b) => b.amp - a.amp);
    // Large waves interact and settle into symmetric patterns: modes whose fold count shares
    // the strongest mode's symmetry are favoured, the rest are suppressed.
    lockM = P.symmetry > 0 ? P.symmetry : (targets.find((t) => t.m >= 3) || { m: 0 }).m;
    if (lockM >= 2 && P.lock > 0) {
      for (const t of targets) if (t.m % lockM !== 0) t.amp *= (1 - P.lock) * (1 - P.lock);
      targets.sort((a, b) => b.amp - a.amp);
    }
    targets.length = Math.min(targets.length, 40);
    info = r.info;
  }
  // modes grow and fade over a fraction of a second, as the liquid takes time to respond
  const ease = 1 - Math.exp(-Math.abs(dt) / 0.18);
  const want = new Set();
  for (const t of targets) {
    want.add(t.key);
    let a = active.get(t.key);
    if (!a) { a = { ...t, amp: 0, row: -1 }; active.set(t.key, a); }
    a.target = t.amp; a.lag = t.lag; a.resp = t.resp;
  }
  for (const [key, a] of active) {
    if (!want.has(key)) a.target = 0;
    a.amp += (a.target - a.amp) * (dt === 0 ? 1 : ease);
    if (a.target === 0 && a.amp < 0.004) { if (a.row >= 0) rows[a.row] = null; active.delete(key); }
  }
  // the strongest modes get a row in the profile texture
  const ranked = [...active.values()].sort((a, b) => b.amp - a.amp);
  const keep = new Set(ranked.slice(0, MAX_MODES));
  for (let i = 0; i < MAX_MODES; i++) if (rows[i] && !keep.has(rows[i])) { rows[i].row = -1; rows[i] = null; }
  for (const a of keep) {
    if (a.row >= 0) continue;
    const free = rows.indexOf(null);
    a.row = free;
    rows[free] = a;
    renderer.setProfile(free, dish.profile(a.m, a.x).data);
  }
  dominant = ranked[0] || null;
}

function advancePhases(dt) {
  const tones = currentTones();
  const f1 = tones.length ? tones[0].f / tones[0].harm : 1;
  const seen = new Set();
  for (const t of tones) {
    if (seen.has(t.base)) continue;
    seen.add(t.base);
    // the camera's strobe runs just off the tone, so the surface seems to breathe slowly
    const rate = TAU * P.strobe * (t.f / t.harm) / f1;
    phase.set(t.base, (phase.get(t.base) || 0) + rate * dt);
  }
}

function modeCoefs() {
  const list = [];
  let energy = 0;
  for (const a of rows) if (a) energy += a.amp * a.amp;
  const norm = P.autoGain ? 1 / Math.max(0.25, Math.sqrt(energy)) : 1;
  const out = new Array(MAX_MODES);
  for (let i = 0; i < MAX_MODES; i++) {
    const a = rows[i];
    if (!a) { out[i] = { m: 0, x: 0, coef: 0 }; continue; }
    const ph = (phase.get(a.base) || 0) * a.harm - a.lag;
    out[i] = { m: a.m, x: a.x, coef: a.amp * norm * Math.cos(ph) };
  }
  // trailing empty rows can be skipped
  let n = MAX_MODES;
  while (n > 0 && !rows[n - 1]) n--;
  out.length = n;
  list.push(...out);
  return list;
}

/* ---------- drawing ---------- */

let seed = 0;
function draw() {
  const w = renderer.w, h = renderer.h;
  const xref = info.length ? Math.max(4, info[0].x0) : 20;
  const radius = ST.shape === 'dish' ? Math.min(w, h) * 0.46 : Math.max(w, h) * 0.5;
  seed = (seed + 17.31) % 1000;
  const short = Math.min(w, h), far = Math.hypot(w, h);
  const sx = w / Math.max(1, $('view').clientWidth), sy = h / Math.max(1, $('view').clientHeight);
  while (pulses.length && pulses[0].age * TC.clickSpeed * short > far) pulses.shift();
  pulseData.fill(0);
  pulses.forEach((p, i) => {
    const r = p.age * TC.clickSpeed * short;
    pulseData.set([p.x * sx, h - p.y * sy, r, TC.click * 0.07 * short * Math.pow(Math.max(0, 1 - r / far), 1.2)], i * 4);   // fades as it spreads
  });
  renderer.draw(modeCoefs(), {
    center: [w / 2, h / 2], radius, zoom: ST.zoom, rot: (ST.rotation * Math.PI) / 180, fold: ST.fold,
    slope: (P.drive * 0.75) / xref * 3, lapScale: 1 / (xref * xref) * 3 * P.drive, nonlin: P.nonlin * 0.8,
    light: LIGHT_INDEX[L.light], ring: [L.rho, L.size, L.leds, L.coax], split: L.split,
    focus: L.focus, contour: L.contour, angle: (L.angle * Math.PI) / 180, ambient: L.ambient,
    colorBy: { light: 0, direction: 1, height: 2 }[ST.colorBy], exposure: ST.exposure, contrast: ST.contrast,
    crop: ST.shape === 'dish' ? 1 : 0, rim: ST.rim, hue: ST.hue,
    glow: ST.glow, grain: ST.grain, vignette: ST.vignette, seed, invert: ST.invert,
    touch: [touch.x * (w / Math.max(1, $('view').clientWidth)), h - touch.y * (h / Math.max(1, $('view').clientHeight)),
      TC.strength * 0.85 * touch.s, TC.size * Math.min(w, h), touch.phase, TC.ripple, TC.waves],
    pulses: pulseData, pulseW: TC.clickWidth * short,
  });
}

/* ---------- readout ---------- */

let orderCache = new Map();
function updateReadout() {
  const box = $('readout');
  const parts = [];
  const tones = currentTones();
  if (!tones.length || !info.length) {
    box.replaceChildren(el('span', { text: P.source === 'mic' ? 'Quiet. The surface is still.' : 'No tone. The surface is still.' }));
    return;
  }
  const t0 = tones[0], i0 = info[0];
  const n = noteOf(t0.f);
  parts.push(el('span', {}, el('b', { text: fmtHz(t0.f) }), ` ${n.name} ${n.cents >= 0 ? '+' : '−'}${Math.abs(n.cents)}¢`));
  parts.push(el('span', { text: `Wavelength ${trim((TAU / i0.k) * 1000)} mm` }));
  if (dominant) {
    const key = `${dominant.m}:${dominant.x.toFixed(4)}:${P.diameter}`;
    let ord = orderCache.get(key);
    if (ord == null) { ord = dish.order(dominant.m, dominant.x); orderCache.set(key, ord); }
    parts.push(el('span', { text: `Mode (${dominant.m}, ${ord})` }));
    parts.push(el('span', { text: dominant.m === 0 ? 'Rings' : `${dominant.m}-fold` }));
    parts.push(el('span', { class: 'gap', text: `Resonance ${Math.round((dominant.resp || 0) * 100)}%` }));
  }
  if (i0.x0 > MAX_X) parts.push(el('span', { class: 'gap', text: 'Too fine to draw here: lower the tone or use a smaller dish' }));
  box.replaceChildren(...parts);
}

/* ---------- sound ---------- */

let audio = null;
function setHear(on) {
  if (on && !audio) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    audio = { ctx, master, oscs: [], on: false };
  }
  if (!audio) return;
  audio.on = on;
  if (on) audio.ctx.resume();
  $('hear').setAttribute('aria-pressed', String(on));
  updateAudio();
  if (on && P.source === 'mic') toast('The speakers stay quiet while the microphone is listening.');
}

function updateAudio() {
  if (!audio) return;
  const { ctx, master } = audio;
  const now = ctx.currentTime;
  const audible = audio.on && P.source === 'tones' && playing;
  master.gain.setTargetAtTime(audible ? P.volume * 0.22 : 0, now, 0.05);
  P.tones.forEach((tone, i) => {
    let o = audio.oscs[i];
    if (!o) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(master);
      osc.start();
      o = audio.oscs[i] = { osc, g, wave: '' };
    }
    const type = tone.wave === 'saw' ? 'sawtooth' : tone.wave;
    if (o.wave !== type) { o.osc.type = type; o.wave = type; }
    const f = i === 0 && P.sweep.on ? sweepFreq() : tone.freq;
    o.osc.frequency.setTargetAtTime(f, now, 0.02);
    const soft = tone.wave === 'sine' || tone.wave === 'triangle' ? 1 : 0.45;
    o.g.gain.setTargetAtTime(tone.on ? tone.level * soft : 0, now, 0.04);
  });
}

/* ---------- microphone ---------- */

let mic = null;
let micPeaks = [];
async function setSource(v) {
  if (v === P.source) return;
  if (v === 'mic') {
    P.source = 'mic';
    renderSound();
    try {
      // make and wake the audio context while the click still counts as a gesture
      const ctx = audio?.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (!audio) {
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        audio = { ctx, master, oscs: [], on: false };
      }
      ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 8192;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      mic = { stream, src, an, data: new Float32Array(an.frequencyBinCount), rate: ctx.sampleRate };
      if (P.source !== 'mic') { stopMic(); return; }
      renderSound();
    } catch (err) {
      P.source = 'tones';
      renderSound();
      toast('The microphone isn’t available, so the tone generator is back on.');
    }
  } else {
    stopMic();
    P.source = 'tones';
    renderSound();
  }
  changed();
  updateAudio();
}

function stopMic() {
  if (!mic) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.src.disconnect();
  mic = null;
  micPeaks = [];
}

// the two loudest pitches the microphone hears
function listen() {
  if (!mic) return;
  const { an, data, rate } = mic;
  an.getFloatFrequencyData(data);
  const binHz = rate / an.fftSize;
  const lo = Math.ceil(30 / binHz), hi = Math.min(data.length - 2, Math.floor(2000 / binHz));
  const found = [];
  for (let i = lo; i <= hi; i++) {
    const v = data[i];
    if (v > -78 && v >= data[i - 1] && v > data[i + 1]) found.push(i);
  }
  found.sort((a, b) => data[b] - data[a]);
  const picks = [];
  for (const i of found) {
    if (picks.every((j) => Math.abs(j - i) > 6)) picks.push(i);
    if (picks.length === 2) break;
  }
  const top = picks.length ? data[picks[0]] : -100;
  micPeaks = picks.filter((i) => data[i] > top - 18).map((i) => {
    const a = data[i - 1], b = data[i], c = data[i + 1];
    const off = (0.5 * (a - c)) / (a - 2 * b + c || 1);
    return { f: +((i + off) * binHz).toFixed(1), level: clamp((data[i] + 78) / 40, 0, 1) };
  });
  // round so tiny wobbles don't re-solve the dish every frame
  micPeaks.forEach((p) => { p.f = Math.round(p.f / 2) * 2; p.level = Math.round(p.level * 10) / 10; });
  if (micMeter) micMeter.style.width = `${clamp((top + 90) / 60, 0, 1) * 100}%`;
}

/* ---------- transport ---------- */

let strobeSlider;
function setPlaying(on) {
  playing = on;
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('play').title = on ? 'Pause (Space)' : 'Play (Space)';
  $('play-icon').setAttribute('d', on ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5l9 5.5-9 5.5z');
  $('stepb').disabled = on;
  $('stepf').disabled = on;
  updateAudio();
}
function toggleReverse() {
  reverse = !reverse;
  $('rew').setAttribute('aria-pressed', String(reverse));
  if (!playing) setPlaying(true);
}
function step(dir) {
  if (playing) return;
  tick(dir / 30);
}

function tick(dt) {
  T += dt;
  if (P.sweep.on && P.source === 'tones') P.tones[0].freq = +sweepFreq().toPrecision(4);
  ST.rotation += ST.spin * dt;
  advancePhases(dt);
  updateModes(dt);
}

/* ---------- layout and interaction ---------- */

function fit() {
  const stage = $('stage');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(stage.clientWidth * dpr)), h = Math.max(1, Math.round(stage.clientHeight * dpr));
  renderer.resize(w, h);
}

function wireView() {
  const c = $('view');
  let drag = null;
  const angleAt = (e) => {
    const r = c.getBoundingClientRect();
    return Math.atan2(-(e.clientY - r.top - r.height / 2), e.clientX - r.left - r.width / 2);
  };
  c.addEventListener('pointerdown', (e) => {
    const box = c.getBoundingClientRect();
    pulseAt(e.clientX - box.left, e.clientY - box.top);
    drag = { a: angleAt(e), rot: ST.rotation };
    c.setPointerCapture(e.pointerId);
    c.classList.add('is-dragging');
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let d = angleAt(e) - drag.a;
    ST.rotation = drag.rot - (d * 180) / Math.PI;
    frameSliders[1]?.sync();
  });
  const end = () => { drag = null; c.classList.remove('is-dragging'); };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  // the fingertip for the Distort tab follows the pointer over the picture
  const feel = (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = c.getBoundingClientRect();
    touch.tx = e.clientX - r.left; touch.ty = e.clientY - r.top;
    if (!touch.on) { touch.x = touch.tx; touch.y = touch.ty; }
    touch.on = true;
  };
  c.addEventListener('pointermove', feel);
  c.addEventListener('pointerleave', () => { touch.on = false; });
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    ST.zoom = clamp(ST.zoom * Math.exp(-e.deltaY * 0.0015), 0.5, 6);
    frameSliders[0]?.sync();
  }, { passive: false });
  c.addEventListener('dblclick', () => { ST.zoom = 1; ST.rotation = 0; frameSliders.forEach((s) => s.sync()); });
}

function wire() {
  $('play').addEventListener('click', () => setPlaying(!playing));
  $('rew').addEventListener('click', toggleReverse);
  $('stepb').addEventListener('click', () => step(-1));
  $('stepf').addEventListener('click', () => step(1));
  $('hear').addEventListener('click', () => setHear(!audio?.on));
  $('snap').addEventListener('click', () => { snapPending = true; });
  $('full').addEventListener('click', toggleFull);
  $('exitfull').addEventListener('click', () => setFull(false));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('is-full')) setFull(false); });
  addEventListener('pointermove', wake);
  addEventListener('pointerdown', wake);
  $('hide').addEventListener('click', toggleHide);

  strobeSlider = slider({ label: 'Strobe drift', min: 0, max: 2, step: 0.01, get: () => P.strobe, set: (v) => { P.strobe = v; }, fmt: (v) => (v === 0 ? 'Frozen' : `${trim(v)} Hz`) });
  strobeSlider.title = 'How fast the surface seems to rise and fall. The real waves move far too fast to see, so a strobe slows them down.';
  $('strobe-wrap').append(strobeSlider);

  const tabs = [...document.querySelectorAll('.tab')];
  const select = (tab) => {
    for (const x of tabs) {
      const on = x === tab;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      $(x.getAttribute('aria-controls')).hidden = !on;
    }
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
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    const k = e.key.toLowerCase();
    if (k === ' ' && !(tag === 'BUTTON' || typing)) { e.preventDefault(); setPlaying(!playing); return; }
    if (typing) return;
    if (e.key === 'Escape' && document.body.classList.contains('is-full')) { setFull(false); return; }
    wake();
    if (k === 'r') toggleReverse();
    else if (k === 'f') toggleFull();
    else if (k === 'h') toggleHide();
    else if (k === 's') snapPending = true;
    else if (k === 't') setHear(!audio?.on);
    else if (e.key === 'ArrowLeft' && !e.target.closest('[role=tablist]')) { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight' && !e.target.closest('[role=tablist]')) { e.preventDefault(); step(1); }
  });

  wireView();
  new ResizeObserver(() => fit()).observe($('stage'));
}

// full screen shows the dish alone; the browser's own full screen is used where it exists,
// and the layout still fills the window where it doesn't (iPhone Safari)
function toggleFull() { setFull(!document.body.classList.contains('is-full')); }
let idleTimer = 0;
function setFull(on) {
  document.body.classList.toggle('is-full', on);
  $('full').setAttribute('aria-pressed', String(on));
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (on) wake();
  else { clearTimeout(idleTimer); document.body.classList.remove('is-idle'); $('full').focus(); }
}
// the exit button and cursor fade away while the dish is left alone
function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (document.body.classList.contains('is-full')) idleTimer = setTimeout(() => document.body.classList.add('is-idle'), 2500);
}
function toggleHide() {
  const hidden = document.body.classList.toggle('ui-hidden');
  $('hide-text').textContent = hidden ? 'Show controls' : 'Hide controls';
  $('hide').setAttribute('aria-expanded', String(!hidden));
}

/* ---------- frame loop ---------- */

let snapPending = false;
let last = 0, lastUi = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  listen();
  updateTouch(dtReal);
  if (playing) tick(reverse ? -dtReal : dtReal);
  else updateModes(dtReal);
  draw();
  if (snapPending) { snapPending = false; saveSnapshot(); }
  if (now - lastUi > 120) {
    lastUi = now;
    updateReadout();
    if (P.sweep.on && P.source === 'tones') { updateAudio(); freqSlider?.sync(); }
    if (ST.spin) frameSliders[1]?.sync();
  }
}

function saveSnapshot() {
  $('view').toBlob((blob) => {
    if (!blob) return;
    const a = el('a', { href: URL.createObjectURL(blob), download: 'cymascope.png' });
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
paletteChanged();
wire();
renderAll();
fit();
setPlaying(true);
updateModes(0);
requestAnimationFrame(frame);

// for scripted checks
window.__cyma = {
  P, L, ST, TC, touch, pulseAt, active, get dominant() { return dominant; }, get info() { return info; },
  applyPreset: (i) => applyPreset(PRESETS[i]), presets: PRESETS.map((p) => p.name), changed,
  apply: (state) => { if (state.TC) Object.assign(TC, state.TC); applyPreset({ P: {}, L: {}, ST: {}, ...state }); },   // load a whole look (used by the cover prototype in lab/hook)
};
