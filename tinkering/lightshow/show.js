/* The show engine. A program is a list of cues on a beat grid; each cue holds a complete look.
   The state of every fixture at any moment is a pure function of the program, the beat and the
   music, so scrubbing, seeking and loading a saved version always reproduce the same show.
   During a cue's fade both looks are evaluated and their outputs are mixed, the way a console
   crossfades: positions, colours and levels all move together. */

import { PRESETS, PALETTES, fullLook } from './data.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = x => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
// linear-light colours, so mixing and additive light behave
const lin = c => c.map(v => Math.pow(v, 2.2));
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return lin([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]);
}
const mixc = (a, b, k, o) => { o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k; return o; };
export const SCREEN_VISUALS = ['gradient', 'waves', 'tunnel', 'spectrum', 'grid', 'rings', 'noise'];
export const LASER_RAYS = 16;

/* ---------- looks ---------- */
const compiled = new WeakMap();
export function compile(look) {
  let c = compiled.get(look);
  if (!c) {
    c = fullLook(look);
    c.pal = c.palette.map(h => lin(hex(h)));
    c.merged = {};
    compiled.set(look, c);
  }
  return c;
}

// a fixture's settings: its group's own, laid over the look's settings for all of that type
function settings(L, type, group) {
  const own = group && L.groups?.[group];
  if (!own) return L[type];
  return L.merged[group] || (L.merged[group] = { ...L[type], ...own });
}
// where a fixture falls in an effect: 'auto' keeps the rig's own order
const place = (fx, order) => order === 'auto' || !fx.ord ? fx.gi / Math.max(1, fx.gn) : fx.ord[order];

/* ---------- frames: what every fixture is doing ---------- */
export function makeFrame(rig) {
  return {
    beams: new Float32Array(rig.beams.length * 8),     // dir xyz, rgb, level, zoom
    washes: new Float32Array(rig.washes.length * 5),   // rgb, level, crowd aim
    lasers: new Float32Array(rig.lasers.length * (LASER_RAYS * 2 + 5)),  // rgb, level, rays, then yaw/pitch per ray
    strobes: new Float32Array(rig.strobes.length),
    pixels: new Float32Array(rig.pixels.length * 3),
    screen: { vis: 0, level: 0, speed: 8, pal: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] },
    haze: 0.6, house: 0, react: 0.5,
  };
}

function mixFrames(a, b, k, out) {
  for (const key of ['beams', 'washes', 'lasers', 'strobes', 'pixels']) {
    const A = a[key], B = b[key], O = out[key];
    for (let i = 0; i < O.length; i++) O[i] = A[i] + (B[i] - A[i]) * k;
  }
  // beam directions: renormalise after the blend
  const o = out.beams;
  for (let i = 0; i < o.length; i += 8) { const l = Math.hypot(o[i], o[i + 1], o[i + 2]) || 1; o[i] /= l; o[i + 1] /= l; o[i + 2] /= l; }
  out.haze = a.haze + (b.haze - a.haze) * k;
  out.house = a.house + (b.house - a.house) * k;
  out.react = a.react + (b.react - a.react) * k;
  // the screen crossfades between two visuals in its shader
  out.screen.visA = a.screen.vis; out.screen.visB = b.screen.vis; out.screen.mix = k;
  out.screen.levelA = a.screen.level; out.screen.levelB = b.screen.level;
  out.screen.palA = a.screen.pal; out.screen.palB = b.screen.pal;
  out.screen.speedA = a.screen.speed; out.screen.speedB = b.screen.speed;
}

// q: where the fixture falls along the effect, 0 to 1
function colourFor(mode, L, i, q, beat, o) {
  const P = L.pal;
  switch (mode) {
    case 'one': case '0': o[0] = P[0][0]; o[1] = P[0][1]; o[2] = P[0][2]; break;
    case 'two': case '1': o[0] = P[1][0]; o[1] = P[1][1]; o[2] = P[1][2]; break;
    case '2': o[0] = P[2][0]; o[1] = P[2][1]; o[2] = P[2][2]; break;
    case 'split': { const c = P[i % 2]; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; break; }
    case 'chase': {
      const p = beat / 4 + q * 1.5, k = Math.floor(p) % 3, f = clamp((fract(p) - 0.75) * 4, 0, 1);
      mixc(P[k], P[(k + 1) % 3], f, o); break;
    }
    case 'rainbow': { const c = hsv(fract(beat / 32 + q), 0.85, 1); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; break; }
    default: o[0] = o[1] = o[2] = 1;
  }
  return o;
}

function dimmer(mode, rate, i, q, n, beat) {
  const r = Math.max(0.125, rate);
  switch (mode) {
    case 'pulse': return 0.15 + 0.85 * Math.exp(-fract(beat / r) * 4.5);
    case 'chase': { const pos = fract(beat / (r * 4)) * n; let d = Math.abs(q * n - pos); d = Math.min(d, n - d); return 0.06 + 0.94 * clamp(1 - d / Math.max(1, n * 0.12), 0, 1); }
    case 'random': return hash(i, Math.floor(beat / r)) > 0.5 ? 1 : 0.06;
    case 'strobe': return fract(beat / (r * 0.125)) < 0.3 ? 1 : 0;
    case 'breathe': return 0.55 + 0.45 * Math.sin(TAU * beat / r);
    default: return 1;
  }
}

const tmp = [0, 0, 0];
// write one look's output at this beat into a frame
function render(L, rig, beat, f) {
  const { stage, crowd } = rig.venue;
  // beams
  const nb = rig.beams.length, ob = f.beams;
  for (let i = 0; i < nb; i++) {
    const fx = rig.beams[i], side = fx.side, B = settings(L, 'beams', fx.group);
    const sp = Math.max(0.5, B.speed), sz = B.size, auto = B.order === 'auto', q = place(fx, B.order);
    // where this head points before any movement
    let tx, ty, tz;
    if (B.aim === 'stage') { tx = side * stage.w * 0.75; ty = stage.h; tz = -stage.d * (fx.floor ? 0.1 : 0.45); }
    else if (B.aim === 'sky') { tx = fx.pos[0] + side * 30; ty = fx.pos[1] + 26; tz = fx.pos[2] + 16; }
    else if (B.aim === 'cross') { tx = -side * crowd.w * 0.9; ty = 1.6; tz = crowd.mid; }
    else { tx = side * crowd.w * 0.85; ty = 1.6; tz = crowd.mid + (fx.row || 0) * crowd.depth * 0.18; }
    let dx = tx - fx.pos[0], dy = ty - fx.pos[1], dz = tz - fx.pos[2];
    let yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    // the rig's own order spreads the phase out from the centre; any other runs along it
    const ph = beat / sp + B.spread * (auto ? Math.abs(side) * 2 : q);
    let a = 0, b = 0;
    switch (B.move) {
      case 'fan': a = side * 2 * (0.6 + 0.08 * Math.sin(TAU * beat / sp)); break;
      case 'sweep': a = Math.sin(TAU * ph); break;
      case 'circle': a = Math.cos(TAU * ph); b = Math.sin(TAU * ph) * 0.7; break;
      case 'wave': b = Math.sin(TAU * ph); break;
      case 'ballyhoo': a = Math.sin(TAU * (ph + i * 0.37)) * 0.7 + Math.sin(TAU * (ph * 2.3 + i * 0.71)) * 0.35; b = Math.sin(TAU * (ph * 1.7 + i * 0.53)) * 0.8; break;
      case 'crossfire': a = (i % 2 ? 1 : -1) * Math.sin(TAU * ph) * 1.1; b = Math.cos(TAU * ph * 0.5) * 0.3; break;
    }
    yaw += a * sz * 0.85; pitch += b * sz * 0.5;
    const cp = Math.cos(pitch), o = i * 8;
    ob[o] = Math.sin(yaw) * cp; ob[o + 1] = Math.sin(pitch); ob[o + 2] = Math.cos(yaw) * cp;
    colourFor(B.color, L, i, q, beat, tmp);
    ob[o + 3] = tmp[0]; ob[o + 4] = tmp[1]; ob[o + 5] = tmp[2];
    ob[o + 6] = B.level * dimmer(B.dimmer, B.rate, i, q, fx.gn, beat);
    ob[o + 7] = B.zoom;
  }
  // washes
  const nw = rig.washes.length, ow = f.washes;
  for (let i = 0; i < nw; i++) {
    const fx = rig.washes[i], W = settings(L, 'washes', fx.group), q = place(fx, W.order);
    colourFor(W.color, L, i, q, beat, tmp);
    const o = i * 5;
    ow[o] = tmp[0]; ow[o + 1] = tmp[1]; ow[o + 2] = tmp[2];
    ow[o + 3] = W.level * dimmer(W.dimmer, W.rate, i, q, fx.gn, beat);
    ow[o + 4] = W.aim === 'crowd' ? 1 : 0;
  }
  // lasers: a fan of rays from each source, as yaw and pitch
  const nl = rig.lasers.length, ol = f.lasers, stride = LASER_RAYS * 2 + 5;
  for (let i = 0; i < nl; i++) {
    const fx = rig.lasers[i], Z = settings(L, 'lasers', fx.group), q = place(fx, Z.order);
    const ls = Math.max(0.5, Z.speed), rays = Math.round(clamp(Z.count, 1, LASER_RAYS));
    const o = i * stride, lx = fx.side;
    colourFor(Z.color, L, i, q, beat, tmp);
    ol[o] = tmp[0]; ol[o + 1] = tmp[1]; ol[o + 2] = tmp[2];
    ol[o + 3] = Z.level; ol[o + 4] = rays;
    const t = beat / ls + (Z.order === 'auto' ? 0 : q * 0.5);
    for (let k = 0; k < LASER_RAYS; k++) {
      const q = rays > 1 ? k / (rays - 1) - 0.5 : 0;
      let yaw = 0, pitch = 0.06;
      switch (Z.pattern) {
        case 'fan': yaw = q * 1.4 + Math.sin(TAU * t) * 0.15; pitch = 0.05 + Math.sin(TAU * (t * 0.5)) * 0.06; break;
        case 'sweep': yaw = Math.sin(TAU * t + i) * 0.8 + q * 0.18; pitch = 0.07 + Math.abs(q) * 0.05; break;
        case 'tunnel': { const th = TAU * (k / Math.max(1, rays) + t * 0.25); yaw = Math.cos(th) * 0.16 - lx * 0.25; pitch = 0.1 + Math.sin(th) * 0.11; break; }
        case 'cross': yaw = -Math.sign(lx || 1) * (0.35 + Math.sin(TAU * t) * 0.3) + q * 0.3; pitch = 0.06 + q * 0.04; break;
        case 'sheet': yaw = q * 1.6; pitch = 0.035 + Math.sin(TAU * t + q * 3) * 0.012; break;
      }
      ol[o + 5 + k * 2] = yaw; ol[o + 6 + k * 2] = pitch;
    }
  }
  // strobes and blinders
  const ns = rig.strobes.length;
  for (let i = 0; i < ns; i++) {
    const fx = rig.strobes[i], St = settings(L, 'strobes', fx.group);
    // any order but the rig's own ripples the hits through the group
    const auto = St.order === 'auto', lag = auto ? 0 : place(fx, St.order) * 0.75, b = beat - lag;
    const inBar = b - Math.floor(b / 4) * 4;
    let e = 0;
    if (St.mode === 'hits') e = Math.exp(-inBar * 5);
    else if (St.mode === 'backbeat') e = Math.floor(inBar) % 2 === 1 ? Math.exp(-fract(b) * 6) : 0;
    else e = fract(beat / St.rate + (auto ? (fx.gi % 2) * 0.5 : place(fx, St.order))) < 0.22 ? 1 : 0;
    f.strobes[i] = St.level * e;
  }
  // pixels along the trusses
  const np = rig.pixels.length, op = f.pixels;
  for (let i = 0; i < np; i++) {
    const c = rig.pixels[i], Px = settings(L, 'pixels', c.group), ps = Math.max(0.5, Px.speed);
    const u = Px.order === 'auto' || !c.ord ? c.u : c.ord[Px.order];
    let e = 0, ci = c.strip % 2;
    if (Px.mode === 'chase') { const h = fract(u - beat / ps); e = Math.pow(1 - h, 6) + 0.04; }
    else if (Px.mode === 'pulse') { e = 0.08 + 0.92 * Math.exp(-fract(beat / Math.max(0.5, ps / 2)) * 4); ci = Math.floor(beat / 4) % 3; }
    else if (Px.mode === 'sparkle') e = hash(i, Math.floor(beat * 4 / ps * 2)) > 0.88 ? 1 : 0.03;
    else { const w = 0.5 + 0.5 * Math.sin(TAU * (u * 2 - beat / ps)); e = 0.1 + 0.9 * w; ci = w > 0.5 ? 0 : 1; }
    const col = L.pal[ci], o = i * 3, lv = Px.level * e;
    op[o] = col[0] * lv; op[o + 1] = col[1] * lv; op[o + 2] = col[2] * lv;
  }
  // screen
  const Sc = L.screen;
  f.screen.vis = SCREEN_VISUALS.indexOf(Sc.visual); f.screen.level = Sc.level; f.screen.speed = Sc.speed; f.screen.pal = L.pal;
  f.haze = L.atmos.haze; f.house = L.atmos.house; f.react = L.atmos.react;
}

/* ---------- the program ---------- */
export const beatAt = (prog, t) => (t - prog.offset) * prog.bpm / 60;
export const timeAt = (prog, beat) => prog.offset + beat * 60 / prog.bpm;

export function cueIndexAt(prog, beat) {
  let i = -1;
  for (let k = 0; k < prog.cues.length; k++) if (prog.cues[k].at <= beat + 1e-6) i = k; else break;
  return i;
}

const blackoutLook = PRESETS.blackout.look;
export class Engine {
  constructor(rig) { this.setRig(rig); }
  setRig(rig) { this.rig = rig; this.A = makeFrame(rig); this.B = makeFrame(rig); this.out = makeFrame(rig); }
  // returns the frame, plus which cue is live and how far into its fade we are. fxBeat drives
  // the effects; while paused it keeps running so a held cue still moves as you edit it.
  evaluate(prog, beat, ease, fxBeat = beat) {
    const i = cueIndexAt(prog, beat);
    const cue = prog.cues[i], prev = prog.cues[i - 1];
    const lookB = compile(cue ? cue.look : blackoutLook), lookA = compile(prev ? prev.look : blackoutLook);
    const fadeBeats = cue ? cue.fade : 0;
    let k = cue ? (fadeBeats > 0 ? clamp((beat - cue.at) / fadeBeats, 0, 1) : 1) : 1;
    if (k < 1) {
      k = ease(cue.ease || 'power1.inOut')(k);
      render(lookA, this.rig, fxBeat, this.A);
      render(lookB, this.rig, fxBeat, this.B);
      mixFrames(this.A, this.B, k, this.out);
    } else {
      render(lookB, this.rig, fxBeat, this.out);
      const s = this.out.screen;
      s.visA = s.visB = s.vis; s.mix = 1; s.levelA = s.levelB = s.level; s.palA = s.palB = s.pal; s.speedA = s.speedB = s.speed;
    }
    return { frame: this.out, index: i, fade: k };
  }
}

let nextId = 1;
export const cueId = () => 'c' + Date.now().toString(36) + (nextId++).toString(36);

// a cue from a preset, with an optional palette and overrides laid on top
export function cueFrom(preset, at, { fade = 2, palette, name, over, ease } = {}) {
  const p = PRESETS[preset];
  const look = JSON.parse(JSON.stringify(p.look));
  if (palette) look.palette = PALETTES[palette].colors.slice();
  if (over) for (const [g, v] of Object.entries(over)) look[g] = { ...(look[g] || {}), ...v };
  return { id: cueId(), at, name: name || p.name, fade, ease: ease || 'power1.inOut', look: fullLook(look) };
}

// the hand-built show for the demo track
export function demoCues() {
  const b = x => x * 4;
  return [
    cueFrom('house', 0, { fade: 0, name: 'Doors' }),
    cueFrom('open', b(2), { fade: 12, name: 'Cold open', ease: 'power2.inOut' }),
    cueFrom('ocean', b(8), { fade: 8, name: 'Kick enters' }),
    cueFrom('crowd', b(16), { fade: 1, name: 'Groove', palette: 'sunset' }),
    cueFrom('rainbow', b(24), { fade: 4, name: 'Groove, turning' }),
    cueFrom('build', b(32), { fade: 0.5, name: 'Build', ease: 'expo.out' }),
    cueFrom('storm', b(38), { fade: 0, name: 'Snare roll', over: { lasers: { level: 0 } } }),
    cueFrom('drop', b(40), { fade: 0, name: 'Drop' }),
    cueFrom('drop', b(48), { fade: 0, name: 'Drop, second half', palette: 'magenta', over: { beams: { move: 'circle', aim: 'sky', speed: 4 }, lasers: { pattern: 'sweep', count: 6 }, screen: { visual: 'tunnel' } } }),
    cueFrom('tunnel', b(56), { fade: 2, name: 'Breakdown' }),
    cueFrom('build', b(64), { fade: 1, name: 'Second build', palette: 'sunset', over: { beams: { aim: 'crowd', move: 'sweep', speed: 2 } } }),
    cueFrom('storm', b(70), { fade: 0, name: 'Roll', palette: 'sunset', over: { lasers: { level: 0 } } }),
    cueFrom('drop', b(72), { fade: 0, name: 'Last drop', palette: 'acid', over: { beams: { move: 'crossfire', speed: 2 }, lasers: { pattern: 'tunnel', count: 12 } } }),
    cueFrom('sunset', b(80), { fade: 0, name: 'Last drop, wide', over: { beams: { dimmer: 'pulse', rate: 1, speed: 8 }, strobes: { level: 0.6, mode: 'backbeat' }, pixels: { mode: 'pulse', level: 0.9, speed: 1 } } }),
    cueFrom('hymn', b(88), { fade: 8, name: 'Outro' }),
    cueFrom('blackout', b(95), { fade: 3, name: 'Final bow' }),
    cueFrom('house', b(96) + 2, { fade: 12, name: 'House lights' }),
  ];
}

// a show for any song: sections every eight bars, shaped by its energy when we can hear it
export function autoCues({ duration, bpm, offset = 0, energy = null }) {
  const bars = Math.max(8, Math.floor((duration - offset) * bpm / 240));
  const blocks = Math.ceil(bars / 8);
  let kinds;
  if (energy && energy.length >= 8) {
    const e = Array.from({ length: blocks }, (_, k) => { let s = 0, n = 0; for (let i = k * 8; i < Math.min(energy.length, k * 8 + 8); i++, n++) s += energy[i]; return n ? s / n : 0; });
    const sorted = [...e].sort((a, b) => a - b), lo = sorted[Math.floor(blocks * 0.3)], hi = sorted[Math.floor(blocks * 0.7)];
    kinds = e.map((v, k) => v >= hi && v > 0.55 ? 'drop' : v <= lo ? (k === 0 ? 'intro' : k === blocks - 1 ? 'outro' : 'break') : 'groove');
    for (let k = 1; k < blocks; k++) if (kinds[k] === 'drop' && kinds[k - 1] !== 'drop' && kinds[k - 1] !== 'intro') kinds[k - 1] = 'build';
    if (kinds[0] !== 'intro' && e[0] < hi) kinds[0] = 'intro';
  } else {
    const arc = ['intro', 'rise', 'groove', 'groove', 'build', 'drop', 'drop', 'break', 'build', 'drop', 'drop'];
    kinds = Array.from({ length: blocks }, (_, k) => k === blocks - 1 && blocks > 3 ? 'outro' : k < arc.length ? arc[k] : ['groove', 'groove', 'build', 'drop', 'drop', 'break'][(k - arc.length) % 6]);
  }
  const drops = ['ice', 'magenta', 'acid', 'sunset', 'deep', 'rose'], grooves = ['sunset', 'deep', 'rose', 'emerald', 'gold'];
  let nd = 0, ng = 0;
  const cues = [cueFrom('house', 0, { fade: 0, name: 'Doors' })];
  kinds.forEach((kind, k) => {
    const at = k * 32, prevKind = kinds[k - 1];
    if (kind === 'intro') cues.push(cueFrom('open', k === 0 ? 4 : at, { fade: 8, name: 'Opening' }));
    else if (kind === 'rise') cues.push(cueFrom('ocean', at, { fade: 8, name: 'Rising' }));
    else if (kind === 'groove') cues.push(cueFrom(ng % 2 ? 'rainbow' : 'crowd', at, { fade: 2, name: 'Groove', palette: grooves[ng++ % grooves.length] }));
    else if (kind === 'build') { cues.push(cueFrom('build', at, { fade: 1, name: 'Build' })); cues.push(cueFrom('storm', at + 24, { fade: 0, name: 'Lift', over: { lasers: { level: 0 } } })); }
    else if (kind === 'drop') {
      const pal = drops[nd % drops.length];
      cues.push(cueFrom(prevKind === 'drop' ? (nd % 2 ? 'sunset' : 'tunnel') : 'drop', at, { fade: 0, name: prevKind === 'drop' ? 'Drop, continued' : 'Drop', palette: pal, over: prevKind === 'drop' ? { beams: { level: 0.9, dimmer: 'pulse', rate: 1 }, strobes: { level: 0.5, mode: 'backbeat' } } : null }));
      if (prevKind !== 'drop') nd++;
    }
    else if (kind === 'break') cues.push(cueFrom(k % 2 ? 'hymn' : 'tunnel', at, { fade: 4, name: 'Breakdown' }));
    else if (kind === 'outro') cues.push(cueFrom('hymn', at, { fade: 8, name: 'Outro' }));
  });
  cues.push(cueFrom('blackout', bars * 4 - 2, { fade: 2, name: 'Final bow' }));
  cues.push(cueFrom('house', bars * 4 + 2, { fade: 12, name: 'House lights' }));
  return cues;
}
