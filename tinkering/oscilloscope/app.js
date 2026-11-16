import { WAVES, inputDefaults, Recorder, Engine } from './engine.js';
import { CRT } from './crt.js';

const $ = (id) => document.getElementById(id);

/* ---------- scales and formatting ---------- */

const VDIV = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
const TDIV = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1];
const MARGIN = 0.25;                 // screen beyond the graticule, in divisions
const GW = 10 + 2 * MARGIN, GH = 8 + 2 * MARGIN;

const minus = (s) => s.replace('-', '−');
const trim = (x) => minus(String(+(+x).toPrecision(3)));
const fmtHz = (f) => (f >= 1000 ? `${trim(f / 1000)} kHz` : `${trim(f)} Hz`);
const fmtV = (v) => (v !== 0 && Math.abs(v) < 1 ? `${trim(v * 1000)} mV` : `${trim(v)} V`);
const fmtT = (s) => (s >= 1 ? `${trim(s)} s` : s >= 1e-3 ? `${trim(s * 1e3)} ms` : `${trim(s * 1e6)} µs`);
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtDiv = (d) => `${d > 0 ? '+' : ''}${minus(d.toFixed(2))} div`;
const fmtClock = (s) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};
const nearest = (list, v) => list.reduce((b, x, i) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(list[b] / v)) ? i : b), 0);

/* ---------- colours ---------- */

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
const PHOSPHORS = [
  { id: 'p31', name: 'P31 green', css: '#4dff8c' },
  { id: 'p1', name: 'P1 green', css: '#9dff3a' },
  { id: 'p3', name: 'P3 amber', css: '#ffa630' },
  { id: 'p7', name: 'P7 blue', css: '#9fd3ff' },
  { id: 'p4', name: 'P4 white', css: '#eef1ff' },
  { id: 'p11', name: 'P11 blue', css: '#5b8cff' },
  { id: 'multi', name: 'Per channel' },
  { id: 'custom', name: 'Custom' },
];
const CHANNEL_CSS = ['#ffd84a', '#4ae0ff', '#ff73d2'];

/* ---------- state ---------- */

function defaults() {
  return {
    inputs: [
      { ...inputDefaults(), wave: 'sine', freq: 1000, amp: 1.5 },
      { ...inputDefaults(), wave: 'triangle', freq: 2000, amp: 1.2 },
    ],
    S: {
      mode: 'yt',
      ch: [
        { show: true, vdiv: 1, pos: 2, coupling: 'dc' },
        { show: true, vdiv: 1, pos: -2, coupling: 'dc' },
      ],
      math: { show: false, op: 'add', vdiv: 2, pos: 0 },
      tdiv: 5e-4, trigPos: 5,
      trig: { mode: 'auto', source: 0, slope: 'rise', level: 0 },
    },
    look: { persist: 0.08 },
  };
}

const start = defaults();
const inputs = start.inputs;
const S = start.S;
const look = {
  phosphor: 'p31', custom: '#ff5a3c', intensity: 0.55, focus: 0.86, persist: 0.08, glow: 0.5,
  draw: 'lines', grat: 'lines', gratLight: 0.4, curve: 0.25, glass: true,
};

const rec = new Recorder(inputs);
const engine = new Engine(rec, S);

let t = 0;
let playing = true, reverse = false, speed = 1;
let needsRebuild = true, jumped = false, dirty = true;
let layout = { div: 1, origin: [0, 0], clip: [0, 0, 1, 1] };
let crt;

/* ---------- toast ---------- */

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3200);
}

/* ---------- changes ---------- */

function inputsChanged() {
  if (rec.change(t, inputs)) {
    engine.truncate(t);
    toast('You changed a generator while rewound, so the recording after this point was cleared.');
  }
  if (!playing) needsRebuild = true;
}

// sweep-affecting scope changes invalidate the saved sweep positions
function sweepChanged() {
  engine.forget();
  engine.restore(t);
  if (!playing) needsRebuild = true;
  updateMarkers();
  updateReadout();
}
function scopeChanged() {
  if (!playing) needsRebuild = true;
  updateMarkers();
  updateReadout();
}
function lookChanged(rebuild, recolour = false) {
  if (rebuild && !playing) needsRebuild = true;
  if (recolour) { renderInputs(); renderScope(); }
  applyAccent();
  updateMarkers();
  updateReadout();
  dirty = true;
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

const paint = (input) => input.style.setProperty('--p', `${(input.value - input.min) / (input.max - input.min) * 100}%`);

function slider({ label, get, set, min, max, step = 0.01, log = false, list, fmt, disabled = false }) {
  const id = `f${++uid}`;
  const out = el('span', { class: 'field__value m-value' });
  const input = el('input', { class: 'm-fader', type: 'range', id });
  let toS, fromS;
  if (list) {
    Object.assign(input, { min: 0, max: list.length - 1, step: 1 });
    toS = (v) => nearest(list, v);
    fromS = (s) => list[s];
  } else if (log) {
    Object.assign(input, { min: 0, max: 1000, step: 1 });
    toS = (v) => Math.round(Math.log(v / min) / Math.log(max / min) * 1000);
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

function group(title, color, end, ...kids) {
  return el('section', { class: 'group' },
    el('div', { class: 'group__head' },
      el('h3', { class: 'group__title m-legend m-legend--lg' }, color ? el('span', { class: 'dot', style: `--c:${color}`, 'aria-hidden': 'true' }) : null, title),
      end ? el('div', { class: 'group__end' }, end) : null),
    ...kids);
}

/* ---------- wave glyphs ---------- */

const GLYPH = {
  sine: 'M1 8 C5 -1 9 -1 12 8 S19 17 23 8 S27 2 29 5',
  square: 'M1 12V4h7v8h7V4h7v8h7',
  triangle: 'M1 12l5-8 7 8 7-8 7 8 2-3',
  saw: 'M1 12l9-8v8l9-8v8l9-8',
  pulse: 'M1 12h4V4h3v8h8V4h3v8h10',
  noise: 'M1 8l2-3 1 6 2-8 2 9 1-5 2 3 2-6 1 7 2-4 2 2 1-5 2 7 2-3 2 1',
  am: 'M1 8l2-2 2 4 2-5 2 6 2-6 2 6 2-5 2 4 2-3 2 2 2-1 2 2 2-1 2 1',
  fm: 'M1 8c1-6 2-6 3 0s2 6 3 0 1-5 2 0 1 5 2 0 2-6 3 0 3 6 4 0 3-6 5 0 4 6 5 0',
  heart: 'M1 9h7l1-2 1 2h2l1 2 2-9 2 11 1-4h3l2-2 2 2h5',
  ring: 'M1 8h2l1-6 1 12 1-10 1 8 1-6 1 4 1-2 1 1h2l1-6 1 12 1-10 1 8 1-6 1 4 1-2 1 1h3',
};
const glyph = (id) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 30 16');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<path d="${GLYPH[id]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  return s;
};

/* ---------- presets ---------- */

const PRESETS = [
  { name: 'Sine and triangle', apply() {} },
  {
    name: 'Lissajous 3:2',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), freq: 300, amp: 3 };
      d.inputs[1] = { ...inputDefaults(), freq: 200.1, amp: 3 };
      Object.assign(d.S, { mode: 'xy' });
      d.S.ch[0].pos = 0; d.S.ch[1].pos = 0;
      d.look.persist = 0.15;
    },
  },
  {
    name: 'Circle',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), freq: 440, amp: 3 };
      d.inputs[1] = { ...inputDefaults(), freq: 440, amp: 3, phase: 90 };
      d.S.mode = 'xy';
      d.S.ch[0].pos = 0; d.S.ch[1].pos = 0;
    },
  },
  {
    name: 'Beat frequencies',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), freq: 1000, amp: 1.5 };
      d.inputs[1] = { ...inputDefaults(), freq: 1040, amp: 1.5 };
      d.S.ch[0].show = false; d.S.ch[1].show = false;
      Object.assign(d.S.math, { show: true, op: 'add', vdiv: 1, pos: 0 });
      d.S.tdiv = 5e-3;
      d.look.persist = 0.2;
    },
  },
  {
    name: 'Heart monitor',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), wave: 'heart', freq: 1.2, amp: 2 };
      d.S.ch[0].vdiv = 0.5; d.S.ch[0].pos = -1;
      d.S.ch[1].show = false;
      d.S.tdiv = 0.5;
      d.S.trig.mode = 'off';
      d.look.persist = 2.5;
    },
  },
  {
    name: 'AM radio',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), wave: 'am', freq: 20000, amp: 3, modFreq: 500, modDepth: 0.8 };
      d.inputs[1] = { ...inputDefaults(), freq: 500, amp: 1 };
      d.S.ch[0].pos = 1; d.S.ch[1].pos = -3;
      d.S.tdiv = 5e-4;
      d.S.trig.source = 1;
      d.look.persist = 0.12;
    },
  },
  {
    name: 'FM wobble',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), wave: 'fm', freq: 5000, amp: 2.5, modFreq: 25, modDepth: 0.3 };
      d.S.ch[0].pos = 0; d.S.ch[1].show = false;
      d.S.tdiv = 2e-4; d.S.trigPos = 1;
      d.look.persist = 0.3;
    },
  },
  {
    name: 'Untriggered',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), wave: 'square', freq: 1000, amp: 2 };
      d.S.ch[0].pos = 0; d.S.ch[1].show = false;
      d.S.tdiv = 2e-4;
      d.S.trig.mode = 'off';
      d.look.persist = 0.15;
    },
  },
  {
    name: 'Ringing',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), wave: 'ring', freq: 8000, amp: 3, modFreq: 200, damping: 0.2 };
      d.S.ch[0].pos = 0; d.S.ch[1].show = false;
      d.S.tdiv = 2e-4; d.S.trigPos = 1;
      Object.assign(d.S.trig, { mode: 'normal', level: 1 });
    },
  },
  {
    name: 'Noisy sine',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), freq: 1000, amp: 2, noise: 0.3 };
      d.S.ch[0].pos = 0; d.S.ch[1].show = false;
      d.look.persist = 0.6;
    },
  },
  {
    name: 'Slow sweep',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), freq: 1.5, amp: 1.5 };
      d.inputs[1] = { ...inputDefaults(), wave: 'square', freq: 0.4, amp: 1 };
      d.S.tdiv = 0.2;
      d.S.trig.mode = 'off';
      d.look.persist = 1.5;
    },
  },
  {
    name: 'Pulse train',
    apply(d) {
      d.inputs[0] = { ...inputDefaults(), wave: 'pulse', freq: 2000, amp: 3, duty: 0.2 };
      d.inputs[1] = { ...inputDefaults(), wave: 'saw', freq: 500, amp: 1.5 };
      d.S.ch[0].pos = 0.5; d.S.ch[1].pos = -2.5;
      d.S.tdiv = 2e-4;
      Object.assign(d.S.trig, { level: 1.5 });
    },
  },
];

function applyPreset(p) {
  const d = defaults();
  p.apply(d);
  inputs.splice(0, 2, ...d.inputs);
  Object.assign(S, { mode: d.S.mode, tdiv: d.S.tdiv, trigPos: d.S.trigPos });
  S.ch.forEach((c, i) => Object.assign(c, d.S.ch[i]));
  Object.assign(S.math, d.S.math);
  Object.assign(S.trig, d.S.trig);
  look.persist = d.look.persist;
  inputsChanged();
  engine.forget();
  engine.restore(t);
  crt.clear();
  needsRebuild = !playing;
  renderAll();
  toast(p.name);
}

/* ---------- inputs panel ---------- */

let editCh = 0;

function renderInputs() {
  const panel = $('panel-inputs');
  panel.replaceChildren();

  panel.append(group('Presets', null, null,
    el('div', { class: 'presets' }, ...PRESETS.map((p) => el('button', { class: 'preset m-key', type: 'button', text: p.name, onclick: () => applyPreset(p) })))));

  panel.append(seg('Channel to edit', [['0', 'Channel 1'], ['1', 'Channel 2']], () => editCh, (v) => { editCh = v; renderInputs(); }));

  const p = inputs[editCh];
  const set = (k) => (v) => { p[k] = v; inputsChanged(); };
  const get = (k) => () => p[k];

  const waves = el('div', { class: 'waves', role: 'group', 'aria-label': 'Waveform' });
  for (const w of WAVES) {
    waves.append(el('button', {
      class: 'wave m-key m-key--tile', type: 'button', 'aria-pressed': String(p.wave === w.id),
      onclick: () => {
        const was = p.wave;
        p.wave = w.id;
        if (w.id === 'heart' && p.freq > 4) p.freq = 1.2;
        if (was === 'heart' && w.id !== 'heart') p.freq = 1000;
        inputsChanged();
        renderInputs();
      },
    }, glyph(w.id), el('span', { text: w.name })));
  }

  const heart = p.wave === 'heart';
  const fields = [
    heart
      ? slider({ label: 'Heart rate', min: 0.3, max: 4, log: true, get: get('freq'), set: set('freq'), fmt: (f) => `${Math.round(f * 60)} bpm` })
      : slider({ label: p.wave === 'ring' ? 'Ringing frequency' : p.wave === 'am' || p.wave === 'fm' ? 'Carrier frequency' : 'Frequency', min: 0.1, max: 100000, log: true, get: get('freq'), set: set('freq'), fmt: fmtHz }),
    slider({ label: p.wave === 'noise' ? 'Level' : 'Amplitude', min: 0, max: 10, step: 0.01, get: get('amp'), set: set('amp'), fmt: fmtV }),
  ];
  if (p.wave === 'pulse') fields.push(slider({ label: 'Duty cycle', min: 0.01, max: 0.99, step: 0.01, get: get('duty'), set: set('duty'), fmt: fmtPct }));
  if (p.wave === 'am' || p.wave === 'fm') {
    fields.push(slider({ label: 'Modulation rate', min: 0.1, max: 10000, log: true, get: get('modFreq'), set: set('modFreq'), fmt: fmtHz }));
    fields.push(slider({ label: p.wave === 'am' ? 'Modulation depth' : 'Deviation', min: 0, max: 1, step: 0.01, get: get('modDepth'), set: set('modDepth'), fmt: p.wave === 'am' ? fmtPct : (d) => `${fmtPct(d)} of carrier` }));
  }
  if (p.wave === 'ring') {
    fields.push(slider({ label: 'Repeat rate', min: 1, max: 10000, log: true, get: get('modFreq'), set: set('modFreq'), fmt: fmtHz }));
    fields.push(slider({ label: 'Damping', min: 0, max: 1, step: 0.01, get: get('damping'), set: set('damping'), fmt: fmtPct }));
  }
  fields.push(slider({ label: 'DC offset', min: -5, max: 5, step: 0.01, get: get('offset'), set: set('offset'), fmt: fmtV }));
  if (p.wave !== 'noise') fields.push(slider({ label: 'Phase', min: 0, max: 360, step: 1, get: get('phase'), set: set('phase'), fmt: (d) => `${Math.round(d)}°` }));
  fields.push(slider({ label: 'Added noise', min: 0, max: 2, step: 0.01, get: get('noise'), set: set('noise'), fmt: (v) => (v ? `${fmtV(v)} rms` : 'None') }));

  panel.append(group(`Channel ${editCh + 1} generator`, chColor(editCh), null,
    field('Waveform', waves), ...fields));
}

/* ---------- scope panel ---------- */

let levelField;

function renderScope() {
  const panel = $('panel-scope');
  panel.replaceChildren();
  const xy = S.mode === 'xy';

  panel.append(group('Display mode', null, null,
    seg('Display mode', [['yt', 'Y–T', 'Voltage against time'], ['xy', 'X–Y', 'Channel 1 across, channel 2 up']], () => S.mode, (v) => { S.mode = v; sweepChanged(); renderScope(); }),
    el('p', { class: 'hint', text: xy ? 'Channel 1 moves the beam across and channel 2 moves it up. Equal frequencies make a line, circle or ellipse; other ratios make Lissajous figures.' : 'Voltage up the screen against time across it. The trigger holds repeating signals still.' })));

  for (const c of [0, 1]) {
    const s = S.ch[c];
    panel.append(group(xy ? `Channel ${c + 1} (${c ? 'Y' : 'X'})` : `Channel ${c + 1}`, chColor(c),
      xy ? null : toggle('Show', () => s.show, (v) => { s.show = v; scopeChanged(); }),
      slider({ label: 'Volts per division', list: VDIV, get: () => s.vdiv, set: (v) => { s.vdiv = v; scopeChanged(); }, fmt: (v) => `${fmtV(v)}/div` }),
      slider({ label: 'Position', min: -4, max: 4, step: 0.05, get: () => s.pos, set: (v) => { s.pos = v; scopeChanged(); }, fmt: fmtDiv }),
      field('Coupling', seg('Coupling', [['dc', 'DC', 'Pass the whole signal'], ['ac', 'AC', 'Block the DC offset'], ['gnd', 'Ground', 'Show zero volts']], () => s.coupling, (v) => { s.coupling = v; sweepChanged(); }))));
  }

  if (!xy) {
    const m = S.math;
    panel.append(group('Math', chColor(2),
      toggle('Show', () => m.show, (v) => { m.show = v; scopeChanged(); }),
      field('Operation', seg('Operation', [['add', '1 + 2'], ['sub', '1 − 2'], ['mul', '1 × 2']], () => m.op, (v) => { m.op = v; scopeChanged(); })),
      slider({ label: 'Volts per division', list: VDIV, get: () => m.vdiv, set: (v) => { m.vdiv = v; scopeChanged(); }, fmt: (v) => `${fmtV(v)}/div` }),
      slider({ label: 'Position', min: -4, max: 4, step: 0.05, get: () => m.pos, set: (v) => { m.pos = v; scopeChanged(); }, fmt: fmtDiv })));

    panel.append(group('Timebase', null, null,
      slider({ label: 'Time per division', list: TDIV, get: () => S.tdiv, set: (v) => { S.tdiv = v; sweepChanged(); }, fmt: (v) => `${fmtT(v)}/div` }),
      slider({ label: 'Trigger point', min: 0, max: 10, step: 0.1, get: () => S.trigPos, set: (v) => { S.trigPos = v; sweepChanged(); }, fmt: (v) => `${v.toFixed(1)} div from left` })));

    const tr = S.trig;
    levelField = slider({ label: 'Level', min: -10, max: 10, step: 0.01, get: () => tr.level, set: (v) => { tr.level = v; sweepChanged(); }, fmt: fmtV });
    panel.append(group('Trigger', null,
      el('button', { class: 'tbtn m-key', type: 'button', text: 'Set to middle', title: 'Put the level halfway between the source signal’s high and low', onclick: centreLevel }),
      field('Mode', seg('Trigger mode', [['auto', 'Auto', 'Sweep anyway if no trigger arrives'], ['normal', 'Normal', 'Sweep only on a trigger'], ['off', 'Free run', 'Sweep continuously, no trigger']], () => tr.mode, (v) => { tr.mode = v; sweepChanged(); })),
      field('Source', seg('Trigger source', [['0', 'Channel 1'], ['1', 'Channel 2']], () => tr.source, (v) => { tr.source = v; sweepChanged(); })),
      field('Slope', seg('Trigger slope', [['rise', 'Rising'], ['fall', 'Falling']], () => tr.slope, (v) => { tr.slope = v; sweepChanged(); })),
      levelField));
  }
}

function centreLevel() {
  const src = S.trig.source;
  const span = Math.max(S.tdiv * 10, 0.02);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 2000; i++) {
    const v = engine.value(src, Math.max(0, t - span) + span * i / 2000);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  S.trig.level = +((lo + hi) / 2).toFixed(2);
  levelField.sync();
  sweepChanged();
}

/* ---------- display panel ---------- */

function renderDisplay() {
  const panel = $('panel-display');
  panel.replaceChildren();

  const sw = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Phosphor colour' });
  const syncSw = () => { for (const b of sw.children) b.setAttribute('aria-pressed', String(b.dataset.v === look.phosphor)); };
  for (const ph of PHOSPHORS) {
    let chip;
    if (ph.id === 'multi') chip = el('span', { class: 'swatch__chip', style: `--c:#888;background:conic-gradient(${CHANNEL_CSS[0]} 0 33%, ${CHANNEL_CSS[1]} 0 66%, ${CHANNEL_CSS[2]} 0);box-shadow:none` });
    else if (ph.id === 'custom') {
      chip = el('input', { type: 'color', value: look.custom, 'aria-label': 'Custom phosphor colour' });
      chip.addEventListener('input', () => { look.custom = chip.value; look.phosphor = 'custom'; syncSw(); lookChanged(true, true); });
    } else chip = el('span', { class: 'swatch__chip', style: `--c:${ph.css}` });
    const b = el('button', { class: 'swatch m-key m-key--tile', type: 'button', 'data-v': ph.id, onclick: (e) => {
      if (ph.id === 'custom' && e.target !== chip) chip.click();
      look.phosphor = ph.id; syncSw(); lookChanged(true, true);
    } }, chip, el('span', { text: ph.name }));
    sw.append(b);
  }
  syncSw();

  panel.append(group('Phosphor', null, null, sw,
    el('p', { class: 'hint', text: 'Classic scopes had one phosphor colour for every trace. Per channel colours them the way a digital scope does.' })));

  panel.append(group('Beam', null, null,
    slider({ label: 'Intensity', min: 0, max: 1, step: 0.01, get: () => look.intensity, set: (v) => { look.intensity = v; lookChanged(true); }, fmt: fmtPct }),
    slider({ label: 'Focus', min: 0, max: 1, step: 0.01, get: () => look.focus, set: (v) => { look.focus = v; lookChanged(true); }, fmt: fmtPct }),
    slider({ label: 'Persistence', min: 0.005, max: 10, log: true, get: () => look.persist, set: (v) => { look.persist = v; lookChanged(true); }, fmt: (v) => fmtT(v) }),
    slider({ label: 'Glow', min: 0, max: 1, step: 0.01, get: () => look.glow, set: (v) => { look.glow = v; lookChanged(false); }, fmt: fmtPct }),
    field('Draw as', seg('Draw as', [['lines', 'Lines', 'A continuous beam'], ['dots', 'Dots', 'Only the sample points, like a digital scope']], () => look.draw, (v) => { look.draw = v; lookChanged(true); }))));

  panel.append(group('Screen', null, null,
    field('Graticule', seg('Graticule', [['lines', 'Lines'], ['dots', 'Dots'], ['off', 'Off']], () => look.grat, (v) => { look.grat = v; lookChanged(false); })),
    slider({ label: 'Graticule light', min: 0, max: 1, step: 0.01, get: () => look.gratLight, set: (v) => { look.gratLight = v; lookChanged(false); }, fmt: fmtPct }),
    slider({ label: 'Curvature', min: 0, max: 1, step: 0.01, get: () => look.curve, set: (v) => { look.curve = v; lookChanged(false); }, fmt: fmtPct }),
    toggle('Glass reflection and vignette', () => look.glass, (v) => { look.glass = v; lookChanged(false); })));
}

function renderAll() {
  renderInputs();
  renderScope();
  renderDisplay();
  applyAccent();
  updateMarkers();
  updateReadout();
}

/* ---------- colours in use ---------- */

function phosphorCss() {
  if (look.phosphor === 'custom') return look.custom;
  const ph = PHOSPHORS.find((p) => p.id === look.phosphor);
  return ph && ph.css ? ph.css : null;
}
function chColor(k) { return look.phosphor === 'multi' ? CHANNEL_CSS[k] : phosphorCss(); }
function engineColors() {
  if (look.phosphor === 'multi') return CHANNEL_CSS.map(hexRgb);
  const c = hexRgb(phosphorCss());
  return [c, c, c];
}
// the controls are greyscale: keep the accent's lightness, drop its hue
function greyHex(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const n = parseInt(hex.slice(1), 16);
  const y = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const v = Math.round(255 * Math.min(1, y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055));
  return '#' + v.toString(16).padStart(2, '0').repeat(3);
}
function applyAccent() {
  const css = look.phosphor === 'multi' ? '#63f59a' : phosphorCss();
  const [r, g, b] = hexRgb(css);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  document.documentElement.style.setProperty('--accent', greyHex(lum > 0.35 ? css : '#63f59a'));
}

/* ---------- markers and readout ---------- */

const yPct = (y) => Math.min(97, Math.max(3, (GH / 2 - y) / GH * 100));
const xPct = (x) => (MARGIN + x) / GW * 100;

function updateMarkers() {
  const box = $('markers');
  box.replaceChildren();
  if (S.mode === 'xy') return;
  const mk = (cls, text, color, style) => box.append(el('span', { class: `marker ${cls}`, text, style: `--c:${color};${style}` }));
  S.ch.forEach((s, c) => { if (s.show) mk('marker--left', String(c + 1), chColor(c), `top:${yPct(s.pos)}%`); });
  if (S.math.show) mk('marker--left', 'M', chColor(2), `top:${yPct(S.math.pos)}%`);
  if (S.trig.mode !== 'off') {
    const src = S.ch[S.trig.source];
    mk('marker--right', 'T', chColor(S.trig.source), `top:${yPct(S.trig.level / src.vdiv + src.pos)}%`);
    mk('marker--top', 'T', 'var(--soft)', `left:${xPct(S.trigPos)}%`);
  }
}

const COUPLE = { dc: 'DC', ac: 'AC', gnd: 'Gnd' };
function updateReadout() {
  const r = $('readout');
  r.replaceChildren();
  const item = (label, color, rest) => r.append(el('span', {}, el('b', { style: `--c:${color}`, text: label }), ` ${rest}`));
  if (S.mode === 'xy') {
    item('X', chColor(0), `ch 1 · ${fmtV(S.ch[0].vdiv)}/div ${COUPLE[S.ch[0].coupling]}`);
    item('Y', chColor(1), `ch 2 · ${fmtV(S.ch[1].vdiv)}/div ${COUPLE[S.ch[1].coupling]}`);
    return;
  }
  S.ch.forEach((s, c) => { if (s.show) item(`Ch ${c + 1}`, chColor(c), `${fmtV(s.vdiv)}/div ${COUPLE[s.coupling]}`); });
  if (S.math.show) item('Math', chColor(2), `${{ add: '1 + 2', sub: '1 − 2', mul: '1 × 2' }[S.math.op]} · ${fmtV(S.math.vdiv)}/div`);
  r.append(el('span', { text: `${fmtT(S.tdiv)}/div` }));
  const tr = S.trig;
  r.append(el('span', { text: tr.mode === 'off' ? 'Free run' : `Trig ch ${tr.source + 1} ${tr.slope === 'rise' ? '↑' : '↓'} ${fmtV(tr.level)} · ${tr.mode === 'auto' ? 'Auto' : 'Normal'}` }));
  r.append(el('span', { class: 'lamp gap', id: 'lamp', text: 'Triggered' }));
}

/* ---------- layout ---------- */

function fit() {
  const stage = $('stage'), bezel = $('bezel'), screen = $('screen'), readout = $('readout');
  const cs = getComputedStyle(bezel);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const sw = stage.clientWidth - padX;
  readout.style.width = `${sw}px`;
  const sh = stage.clientHeight - padY - readout.offsetHeight;
  let w = sw, h = w * GH / GW;
  if (h > sh) { h = sh; w = h * GW / GH; }
  w = Math.max(120, Math.floor(w)); h = Math.max(100, Math.floor(w * GH / GW));
  screen.style.width = `${w}px`;
  screen.style.height = `${h}px`;
  readout.style.width = `${w}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  crt.resize(W, H);
  const div = W / GW;
  layout = { div, origin: [MARGIN * div, H / 2], clip: [0, 0, W, H] };
  needsRebuild = true;
}

/* ---------- drawing ---------- */

const sigmaPx = () => Math.max(0.7, (0.01 + (1 - look.focus) * 0.11) * layout.div);
const energyScale = () => 0.2 * Math.exp(look.intensity * 4.2) * 45 * layout.div * layout.div / speed;
const exposure = () => Math.pow(1 - Math.exp(-(1 / 60) / look.persist), 0.7);

function flush() {
  crt.beams(engine.points, engine.used, engine.strips, layout, sigmaPx(), look.draw === 'dots');
}

function advance(dtReal) {
  const span = dtReal * speed;
  if (!(span > 0)) return;
  crt.decay(Math.exp(-dtReal / look.persist));
  engine.colors = engineColors();
  engine.eScale = energyScale();
  engine.begin();
  if (!reverse) {
    if (jumped) { engine.restore(t); jumped = false; }
    if (t >= rec.edge) engine.checkpoint(t);
    const t1 = t + span;
    engine.simulate(t, t1, true);
    t = t1;
    rec.advance(t);
  } else {
    let t0 = t - span;
    if (t0 <= rec.start) { t0 = rec.start; setPlaying(false); setReverse(false); }
    if (t0 < t) { engine.restore(t0); engine.simulate(t0, t, true); }
    t = t0;
    jumped = true;
  }
  flush();
}

// redraw the screen at time t as it would look, including the persistence trail
function rebuild() {
  crt.clear();
  engine.colors = engineColors();
  engine.eScale = energyScale();
  const realSpan = Math.min(1.5, look.persist * 4);
  const n = Math.max(1, Math.ceil(realSpan * 60));
  const dt = speed / 60;
  const a = Math.max(rec.start, t - n * dt);
  engine.restore(a);
  const f = Math.exp(-(1 / 60) / look.persist);
  for (let ta = a; ta < t - 1e-12;) {
    const tb = Math.min(t, ta + dt);
    crt.decay(f);
    engine.begin();
    engine.simulate(ta, tb, true);
    flush();
    ta = tb;
  }
  jumped = false;
}

function present() {
  crt.present({
    exposure: exposure(),
    glow: look.glow,
    curve: look.curve,
    grat: { off: 0, lines: 1, dots: 2 }[look.grat],
    gratLight: look.gratLight,
    glass: look.glass,
    tint: look.phosphor === 'multi' ? [0.6, 0.7, 0.66] : engineColors()[0],
    origin: layout.origin,
    div: layout.div,
  });
}

/* ---------- transport ---------- */

function setPlaying(on) {
  playing = on;
  $('play-icon').setAttribute('d', on ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5l9 5.5-9 5.5z');
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('play').title = on ? 'Pause (Space)' : 'Play (Space)';
  $('stepb').disabled = on;
  $('stepf').disabled = on;
  updateTimeline();
}
function setReverse(on) {
  reverse = on;
  $('rew').setAttribute('aria-pressed', String(on));
  if (!on) jumped = true;
}

function togglePlay() {
  if (!playing && !reverse && t < rec.edge - 1e-9) jumped = true;
  setPlaying(!playing);
}
function toggleReverse() {
  setReverse(!reverse);
  if (!playing) setPlaying(true);
}
function goLive() {
  setReverse(false);
  t = rec.edge;
  needsRebuild = true;
  setPlaying(true);
}
function stepBack() {
  if (playing) setPlaying(false);
  t = Math.max(rec.start, t - speed / 60);
  needsRebuild = true;
}
function stepForward() {
  if (playing) setPlaying(false);
  setReverse(false);
  advance(1 / 60);
  dirty = true;
}

let scrubbing = false;
function updateTimeline() {
  const len = rec.edge - rec.start;
  const scrub = $('scrub');
  if (!scrubbing) {
    scrub.value = len > 0 ? Math.round((t - rec.start) / len * 1000) : 1000;
    paint(scrub);
  }
  const atEdge = t >= rec.edge - 1e-6;
  $('tstart').textContent = `Recorded ${fmtClock(len)}`;
  const behind = rec.edge - t;
  $('tnow').textContent = atEdge ? (playing ? 'Live' : 'Paused at live') : `${playing ? (reverse ? 'Rewinding' : 'Replaying') : 'Paused'}, ${behind < 60 ? `${behind.toFixed(behind < 10 ? 2 : 1)} s` : fmtClock(behind)} behind`;
  scrub.setAttribute('aria-valuetext', atEdge ? 'Live' : `${behind.toFixed(1)} seconds behind live`);
  $('live').setAttribute('aria-pressed', String(atEdge && playing && !reverse));
}

/* ---------- lamp ---------- */

let lastTrig = 0, lampUntil = 0;
function updateLamp(now) {
  if (engine.triggered !== lastTrig) { lastTrig = engine.triggered; lampUntil = now + 250; }
  const lamp = $('lamp');
  if (lamp) lamp.classList.toggle('is-on', now < lampUntil && S.trig.mode !== 'off');
}

/* ---------- loop ---------- */

let last = performance.now(), lastUi = 0, snapPending = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (needsRebuild) { rebuild(); needsRebuild = false; dirty = true; }
  else if (playing) { advance(dtReal); dirty = true; }
  if (dirty || snapPending) { present(); dirty = false; }
  if (snapPending) { snapPending = false; saveSnapshot(); }
  if (now - lastUi > 90) { updateTimeline(); updateLamp(now); lastUi = now; }
}

function saveSnapshot() {
  $('crt').toBlob((blob) => {
    if (!blob) return;
    const a = el('a', { href: URL.createObjectURL(blob), download: 'oscilloscope.png' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

/* ---------- wiring ---------- */

function wire() {
  $('play').addEventListener('click', togglePlay);
  $('rew').addEventListener('click', toggleReverse);
  $('live').addEventListener('click', goLive);
  $('stepb').addEventListener('click', stepBack);
  $('stepf').addEventListener('click', stepForward);
  $('speed').addEventListener('change', (e) => { speed = +e.target.value; if (!playing) needsRebuild = true; });

  const scrub = $('scrub');
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('input', () => {
    t = rec.start + (rec.edge - rec.start) * (+scrub.value / 1000);
    paint(scrub);
    needsRebuild = true;
    jumped = true;
    updateTimeline();
  });

  $('snap').addEventListener('click', () => { snapPending = true; });
  $('full').addEventListener('click', toggleFull);
  $('hide').addEventListener('click', toggleHide);

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
    if (k === ' ' && !(tag === 'BUTTON' || typing)) { e.preventDefault(); togglePlay(); return; }
    if (typing) return;
    if (k === 'r') toggleReverse();
    else if (k === 'l') goLive();
    else if (k === 'f') toggleFull();
    else if (k === 'h') toggleHide();
    else if (k === 's') snapPending = true;
    else if (e.key === 'ArrowLeft' && !e.target.closest('[role=tablist]')) { e.preventDefault(); stepBack(); }
    else if (e.key === 'ArrowRight' && !e.target.closest('[role=tablist]')) { e.preventDefault(); stepForward(); }
  });

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

/* ---------- start ---------- */

try {
  crt = new CRT($('crt'));
} catch (err) {
  document.body.append(el('div', { class: 'fatal', text: `This needs WebGL 2, which isn’t available here. ${err.message}` }));
  throw err;
}
renderAll();
wire();
fit();
setPlaying(true);
requestAnimationFrame(frame);

// for scripted checks
window.__scope = { S, look, inputs, rec, engine, get t() { return t; }, applyPreset: (i) => applyPreset(PRESETS[i]), presets: PRESETS.map((p) => p.name) };
