/* Impact sounds, synthesised. A click is a short burst of filtered noise for the contact plus
   a few decaying partials for the body ringing; the material picks the filter and partials,
   the size of the domino scales the pitch, and the impact speed sets the level. */
import { PARAMS } from './params.js';

const BODY = {
  plastic: { band: 3300, q: 2.4, partials: [[2150, 1], [3650, 0.5], [5600, 0.2]], ring: 0.022, noise: 0.9 },
  wood: { band: 1500, q: 3.2, partials: [[880, 1], [1630, 0.45], [2900, 0.15]], ring: 0.03, noise: 0.8 },
  acrylic: { band: 4300, q: 2.6, partials: [[2600, 1], [4500, 0.55], [6900, 0.2]], ring: 0.026, noise: 0.8 },
  metal: { band: 5200, q: 4, partials: [[2900, 1], [4980, 0.7], [7600, 0.45], [9900, 0.2]], ring: 0.2, noise: 0.35 },
};
const SURFACE = {
  floor: { band: 900, q: 1.2, low: 150, lowRing: 0.045, gain: 1 },
  wood: { band: 680, q: 4.5, low: 220, lowRing: 0.07, gain: 0.9 },
  stone: { band: 2600, q: 2, low: 380, lowRing: 0.02, gain: 0.85 },
  wall: { band: 800, q: 1.5, low: 120, lowRing: 0.04, gain: 0.7 },
  fabric: { band: 380, q: 0.8, low: 90, lowRing: 0.03, gain: 0.25 },
};
const STYLE_BODY = { toppling: 'plastic', classic: 'plastic', wood: 'wood', acrylic: 'acrylic', steel: 'metal' };

export class Sound {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(0.7);
    this.wet = ctx.createGain();
    this.wet.connect(this.verb).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.levels();
    return ctx;
  }

  impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 40 ? i / 40 : 1);
    }
    return b;
  }

  levels() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : PARAMS.volume;
    this.wet.gain.value = PARAMS.reverb;
    this.dry.gain.value = 1;
  }

  out(pan) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let tail = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); tail = p;
    }
    tail.connect(this.dry);
    tail.connect(this.wet);
    return g;
  }

  burst(dest, at, { band, q, len, gain, type = 'bandpass' }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = Math.min(18000, band); f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 0.5, len + 0.02);
    return src;
  }

  tone(dest, at, freq, gain, len, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = Math.min(18000, freq);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(dest);
    o.start(at); o.stop(at + len + 0.02);
    return o;
  }

  /* one recorded impact. `pan` is -1..1 across the screen, `near` 0..1 for distance */
  impact(ev, pan = 0, near = 1) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    if (this.voices >= PARAMS.voices) return;
    if (ev.speed < PARAMS.threshold) return;
    const P = PARAMS;
    const at = ctx.currentTime + 0.005;
    const size = Math.sqrt(0.048 / ev.h);
    const k = size * P.pitch * (0.94 + Math.random() * 0.12);
    const level = Math.pow(Math.min(1.6, ev.speed / 0.25), 0.8) * Math.pow(ev.h / 0.048, 0.35) * (0.35 + 0.65 * near);
    const body = BODY[STYLE_BODY[ev.style] ?? 'plastic'];
    const dest = this.out(pan);
    const ring = P.decay;
    const bright = P.brightness;
    let last;
    if (ev.kind === 'domino') {
      const other = BODY[STYLE_BODY[ev.mat] ?? 'plastic'];
      const g = level * P.clicks * 0.5;
      this.burst(dest, at, { band: (body.band + other.band) / 2 * k * bright, q: body.q, len: 0.006 * ring, gain: g * body.noise });
      for (const [f, a] of body.partials) last = this.tone(dest, at, f * k * (0.97 + Math.random() * 0.06), g * a * 0.35, body.ring * ring);
      if (other !== body) for (const [f, a] of other.partials.slice(0, 2)) last = this.tone(dest, at, f * k, g * a * 0.2, other.ring * ring);
    } else {
      const s = SURFACE[ev.kind === 'floor' ? 'floor' : ev.mat] ?? SURFACE.floor;
      const g = level * (ev.kind === 'floor' ? P.floor : P.furniture) * 0.55 * s.gain;
      this.burst(dest, at, { band: s.band * bright * Math.sqrt(k), q: s.q, len: 0.012 * ring, gain: g });
      last = this.tone(dest, at, s.low * Math.sqrt(k), g * 0.9, s.lowRing * ring);
      // the domino's own click on top of the surface
      for (const [f, a] of body.partials.slice(0, 2)) last = this.tone(dest, at, f * k, g * a * 0.18, body.ring * ring * 0.8);
    }
    this.voices++;
    if (last) last.onended = () => { this.voices--; };
    else this.voices--;
  }

  /* ---------- effect sounds ---------- */
  chime(step = 0, pan = 0) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const scale = [0, 2, 4, 7, 9];
    const note = 76 + scale[step % 5] + 12 * Math.floor(step / 5 % 3);
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const dest = this.out(pan), at = ctx.currentTime + 0.005, g = 0.16 * PARAMS.effects;
    this.tone(dest, at, f, g, 1.6);
    this.tone(dest, at, f * 2.76, g * 0.35, 0.7);
    this.tone(dest, at, f * 5.4, g * 0.12, 0.3);
  }

  pop(pan = 0, big = false) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const dest = this.out(pan), at = ctx.currentTime + 0.005, g = (big ? 0.5 : 0.25) * PARAMS.effects;
    this.burst(dest, at, { band: big ? 600 : 1500, q: 0.7, len: big ? 0.35 : 0.09, gain: g, type: 'lowpass' });
    this.tone(dest, at, big ? 70 : 180, g * 0.8, big ? 0.4 : 0.12);
  }

  crackle(pan = 0, n = 14) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const dest = this.out(pan);
    for (let i = 0; i < n; i++) {
      const at = ctx.currentTime + 0.05 + Math.random() * 0.7;
      this.burst(dest, at, { band: 3000 + Math.random() * 4000, q: 1.5, len: 0.02, gain: 0.08 * PARAMS.effects });
    }
  }

  whoosh(pan = 0, rise = true) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const dest = this.out(pan), at = ctx.currentTime + 0.005;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(rise ? 300 : 2400, at);
    f.frequency.exponentialRampToValueAtTime(rise ? 2600 : 250, at + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.18 * PARAMS.effects, at + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1);
    src.connect(f).connect(g).connect(dest);
    src.start(at, 0, 1.05);
  }
}
