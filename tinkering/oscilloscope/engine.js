/* Oscilloscope engine: the signal generators, the recording that makes rewind possible,
   and the sweep and trigger logic that decides where the beam goes.

   Every signal is a pure function of time, so the past can be replayed exactly. What can
   change over time is the generator settings, and the Recorder keeps a log of those. The
   scope settings (timebase, trigger, volts per division) are not recorded, so you can
   rewind and look at the same signal again with a different timebase. */

export const TAU = Math.PI * 2;
const NOISE_RATE = 1e6;   // noise bandwidth, samples per second
const HOLDOFF = 2e-6;     // dead time between sweeps

export const WAVES = [
  { id: 'sine', name: 'Sine' },
  { id: 'square', name: 'Square' },
  { id: 'triangle', name: 'Triangle' },
  { id: 'saw', name: 'Sawtooth' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'noise', name: 'Noise' },
  { id: 'am', name: 'AM' },
  { id: 'fm', name: 'FM' },
  { id: 'heart', name: 'Heartbeat' },
  { id: 'ring', name: 'Ringing' },
];

export const inputDefaults = () => ({
  wave: 'sine', freq: 1000, amp: 1.5, offset: 0, phase: 0, noise: 0,
  duty: 0.25, modFreq: 50, modDepth: 0.5, damping: 0.3,
});

/* ---------- noise ---------- */

function hash(i, seed) {
  let h = (i | 0) ^ Math.imul(seed, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483648 - 1;
}
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hash(i, seed), b = hash(i + 1, seed);
  return a + (b - a) * u;
}
// roughly unit RMS, band limited to NOISE_RATE
function noise(t, seed) {
  const x = t * NOISE_RATE;
  return (vnoise(x, seed) + vnoise(x * 0.37 + 11.3, seed + 17)) * 1.5;
}

/* ---------- waveforms ---------- */

const g = (x, c, w) => { const d = (x - c) / w; return Math.exp(-0.5 * d * d); };
function heart(f) {
  return 0.12 * g(f, 0.16, 0.022) - 0.1 * g(f, 0.265, 0.008) + g(f, 0.285, 0.009)
    - 0.22 * g(f, 0.305, 0.01) + 0.28 * g(f, 0.52, 0.04);
}

// p is a recorded channel entry: user settings plus phase bookkeeping (t0, cyc0, mcyc0)
export function rawValue(p, t, ch) {
  const dt = t - p.t0;
  const cyc = p.cyc0 + p.freq * dt + p.phase / 360;
  const fr = cyc - Math.floor(cyc);
  let v;
  switch (p.wave) {
    case 'square': v = fr < 0.5 ? 1 : -1; break;
    case 'triangle': v = fr < 0.5 ? 4 * fr - 1 : 3 - 4 * fr; break;
    case 'saw': v = 2 * fr - 1; break;
    case 'pulse': v = fr < p.duty ? 1 : 0; break;
    case 'noise': v = noise(t, ch * 31 + 5) * 0.5; break;
    case 'am': {
      const m = p.mcyc0 + p.modFreq * dt;
      v = (1 + p.modDepth * Math.sin(TAU * m)) / (1 + p.modDepth) * Math.sin(TAU * cyc);
      break;
    }
    case 'fm': {
      const m = p.mcyc0 + p.modFreq * dt;
      const beta = p.modDepth * p.freq / Math.max(p.modFreq, 1e-3);
      v = Math.sin(TAU * cyc + beta * Math.sin(TAU * m));
      break;
    }
    case 'heart': v = heart(fr); break;
    case 'ring': {
      const m = p.mcyc0 + p.modFreq * dt + p.phase / 360;
      const since = (m - Math.floor(m)) / Math.max(p.modFreq, 1e-3);
      const n = since * p.freq;
      v = Math.exp(-n * (0.03 + p.damping * 0.6)) * Math.sin(TAU * n);
      break;
    }
    default: v = Math.sin(TAU * cyc);
  }
  v = v * p.amp + p.offset;
  if (p.noise > 0) v += noise(t, ch * 31 + 9) * p.noise;
  return v;
}

// average of the wave before offset, used by AC coupling
function waveMean(p) {
  if (p.wave === 'pulse') return p.duty * p.amp;
  if (p.wave === 'heart') return 0.035 * p.amp;
  return 0;
}

// the highest frequency worth resolving, used to choose how finely to sample
export function detail(p) {
  let f;
  switch (p.wave) {
    case 'noise': f = NOISE_RATE; break;
    case 'heart': f = p.freq * 40; break;
    case 'square': case 'pulse': case 'saw': f = p.freq * 4; break;
    case 'fm': f = p.freq * (1 + p.modDepth) * 1.5; break;
    case 'ring': f = Math.max(p.freq, p.modFreq * 8); break;
    default: f = p.freq;
  }
  if (p.noise > 0) f = Math.max(f, NOISE_RATE);
  return f;
}

/* ---------- recorder ---------- */

export class Recorder {
  constructor(inputs, windowSeconds = 300) {
    this.window = windowSeconds;
    this.edge = 0;
    this.entries = [this.entry(0, inputs, null)];
    this.ci = 0;
  }

  get start() { return Math.max(0, this.edge - this.window); }

  entry(t, inputs, prev) {
    return {
      t,
      ch: inputs.map((p, c) => {
        let cyc0 = 0, mcyc0 = 0;
        if (prev) {
          // keep each generator's phase continuous across the change
          const q = prev.ch[c];
          cyc0 = q.cyc0 + q.freq * (t - q.t0);
          mcyc0 = q.mcyc0 + q.modFreq * (t - q.t0);
          cyc0 -= Math.floor(cyc0);
          mcyc0 -= Math.floor(mcyc0);
        }
        return { ...p, t0: t, cyc0, mcyc0 };
      }),
    };
  }

  at(t) {
    const e = this.entries;
    let i = this.ci;
    if (i < e.length && e[i].t <= t && (i + 1 >= e.length || e[i + 1].t > t)) return e[i];
    let lo = 0, hi = e.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (e[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    this.ci = lo;
    return e[lo];
  }

  // record new generator settings at time t; returns true if later recording was dropped
  change(t, inputs) {
    let cut = false;
    if (t < this.edge - 1e-9) {
      cut = true;
      this.edge = t;
      while (this.entries.length > 1 && this.entries[this.entries.length - 1].t > t) this.entries.pop();
    }
    const last = this.entries[this.entries.length - 1];
    const next = this.entry(t, inputs, this.at(t));
    if (last.t >= t) this.entries[this.entries.length - 1] = next;
    else this.entries.push(next);
    this.ci = 0;
    return cut;
  }

  advance(t) {
    if (t <= this.edge) return;
    this.edge = t;
    const cutoff = this.start;
    while (this.entries.length > 1 && this.entries[1].t <= cutoff) { this.entries.shift(); this.ci = 0; }
  }
}

/* ---------- sweep and trigger ---------- */

const armed = (at) => ({ mode: 'armed', armedAt: at, searched: at, low: false });

export class Engine {
  constructor(recorder, settings) {
    this.rec = recorder;
    this.S = settings;
    this.state = armed(0);
    this.checkpoints = [];
    this.points = new Float32Array(1 << 16);
    this.used = 0;
    this.strips = [];
    this.eScale = 1;        // energy per second of beam time, set by the app
    this.colors = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
    this.triggered = 0;     // count of triggers seen, for the lamp
  }

  /* values */

  value(c, t) {
    const set = this.S.ch[c];
    if (set.coupling === 'gnd') return 0;
    const p = this.rec.at(t).ch[c];
    let v = rawValue(p, t, c);
    if (set.coupling === 'ac') v -= p.offset + waveMean(p);
    return v;
  }

  traceValue(k, t) {
    if (k < 2) return this.value(k, t);
    const a = this.value(0, t), b = this.value(1, t);
    const op = this.S.math.op;
    return op === 'sub' ? a - b : op === 'mul' ? a * b : a + b;
  }

  traceDetail(k, t) {
    const e = this.rec.at(t);
    if (k < 2) return this.S.ch[k].coupling === 'gnd' ? 1 : detail(e.ch[k]);
    return Math.max(detail(e.ch[0]), detail(e.ch[1]));
  }

  traceScale(k) {
    const s = k < 2 ? this.S.ch[k] : this.S.math;
    return [s.vdiv, s.pos];
  }

  visible() {
    const out = [];
    if (this.S.ch[0].show) out.push(0);
    if (this.S.ch[1].show) out.push(1);
    if (this.S.math.show) out.push(2);
    return out;
  }

  /* drawing output: a list of strips of points in division units */

  begin() { this.used = 0; this.strips.length = 0; }

  reserve(n) {
    const need = (this.used + n) * 2;
    if (need > this.points.length) {
      const grown = new Float32Array(Math.max(need, this.points.length * 2));
      grown.set(this.points.subarray(0, this.used * 2));
      this.points = grown;
    }
  }

  strip(k, n, energy, fill) {
    if (!(energy > 0) || n < 2) return;
    this.reserve(n);
    const start = this.used;
    fill(this.points, start * 2);
    this.used += n;
    this.strips.push({ start, n, energy, color: this.colors[k] });
  }

  // one part of a Y–T sweep, from time a to b, for every visible trace
  sweepPortion(ts, D, a, b, weight) {
    if (b <= a) return;
    for (const k of this.visible()) {
      const [vdiv, pos] = this.traceScale(k);
      const full = Math.min(5000, Math.max(600, D * this.traceDetail(k, a) * 40));
      const n = Math.max(2, Math.ceil(full * (b - a) / D) + 1);
      const dt = (b - a) / (n - 1);
      this.strip(k, n, this.eScale * dt * weight, (P, o) => {
        for (let i = 0; i < n; i++) {
          const t = a + dt * i;
          let y = this.traceValue(k, t) / vdiv + pos;
          y = y > 60 ? 60 : y < -60 ? -60 : y;
          P[o++] = (t - ts) / D * 10;
          P[o++] = y;
        }
      });
    }
  }

  drawXY(t0, t1) {
    const S = this.S;
    const f = Math.max(this.traceDetail(0, t1), this.traceDetail(1, t1), 1e-3);
    let a = t0, m = 1;
    let n = Math.ceil((t1 - t0) * f * 40);
    const MAX = 6000;
    if (n > MAX) {
      const W = MAX / (f * 40);
      a = t1 - W; m = (t1 - t0) / W; n = MAX;
    }
    n = Math.max(8, n);
    const dt = (t1 - a) / (n - 1);
    const [vx, px] = [S.ch[0].vdiv, S.ch[0].pos], [vy, py] = [S.ch[1].vdiv, S.ch[1].pos];
    this.strip(0, n, this.eScale * dt * m, (P, o) => {
      for (let i = 0; i < n; i++) {
        const t = a + dt * i;
        const x = 5 + this.value(0, t) / vx + px, y = this.value(1, t) / vy + py;
        P[o++] = x > 60 ? 60 : x < -60 ? -60 : x;
        P[o++] = y > 60 ? 60 : y < -60 ? -60 : y;
      }
    });
  }

  /* trigger */

  // first trigger event in [a, b]; low carries the hysteresis state between calls
  findTrigger(a, b, st) {
    const S = this.S, src = S.trig.source, lvl = S.trig.level;
    const rising = S.trig.slope === 'rise';
    const D = S.tdiv * 10;
    const hyst = S.ch[src].vdiv * 0.06;
    let step = Math.min(D / 250, 1 / (this.traceDetail(src, a) * 24));
    let n = Math.ceil((b - a) / step);
    if (n > 6000) { n = 6000; step = (b - a) / n; }
    let low = st.low;
    let prevT = a;
    for (let i = 0; i <= n; i++) {
      const t = i === n ? b : a + i * step;
      const v = (this.value(src, t) - lvl) * (rising ? 1 : -1);
      if (v < -hyst) low = true;
      else if (low && v >= 0 && i > 0) {
        // refine the crossing between prevT and t
        let lo = prevT, hi = t;
        for (let j = 0; j < 26; j++) {
          const mid = (lo + hi) / 2;
          if ((this.value(src, mid) - lvl) * (rising ? 1 : -1) >= 0) hi = mid; else lo = mid;
        }
        st.low = false;
        return hi;
      }
      prevT = t;
    }
    st.low = low;
    return null;
  }

  autoTimeout(D) { return Math.max(0.1, D * 1.5); }

  // many sweeps per frame: draw a few representative ones, weighted for the rest
  fastSweeps(t0, t1, D, pre) {
    const S = this.S, F = t1 - t0, mode = S.trig.mode;
    const K = mode === 'off' ? 6 : 4;
    const starts = [];
    let wait = 0, found = 0;
    const win = Math.min(0.05, Math.max(3 * D, 3 / this.traceDetail(S.trig.source, t0)));
    for (let k = 0; k < K; k++) {
      const s = t0 + F * (mode === 'off' ? Math.random() : (k + 0.5) / K);
      if (mode === 'off') { starts.push(s); continue; }
      const T = this.findTrigger(s + pre, s + pre + win, { low: false });
      if (T !== null) { starts.push(T - pre); wait += T - pre - s; found++; }
      else if (mode === 'auto') starts.push(s);
    }
    if (found) this.triggered++;
    const m = F / (K * (D + HOLDOFF + (found ? wait / found : 0)));
    for (const ts of starts) this.sweepPortion(ts, D, ts, ts + D, m);
  }

  // advance the beam from t0 to t1, drawing what it traces when draw is true
  simulate(t0, t1, draw) {
    const S = this.S;
    if (!(t1 > t0)) return;
    if (S.mode === 'xy') { if (draw) this.drawXY(t0, t1); this.state = armed(t1); return; }
    const D = S.tdiv * 10, pre = S.trigPos * S.tdiv, F = t1 - t0;
    if (D + HOLDOFF < F / 4) {
      if (draw) this.fastSweeps(t0, t1, D, pre);
      this.state = armed(t1);
      return;
    }
    let st = this.state;
    for (let guard = 0; guard < 40; guard++) {
      if (st.mode === 'sweep') {
        const end = st.ts + D, to = Math.min(t1, end);
        if (draw && to > st.drawn) this.sweepPortion(st.ts, D, st.drawn, to, 1);
        st.drawn = Math.max(st.drawn, to);
        if (end <= t1) { st = armed(end + HOLDOFF); continue; }
        break;
      }
      if (st.armedAt > t1) break;
      if (S.trig.mode === 'off') { st = { mode: 'sweep', ts: st.armedAt, drawn: st.armedAt }; continue; }
      const from = Math.max(st.searched, st.armedAt + pre);
      const T = from < t1 ? this.findTrigger(from, t1, st) : null;
      if (T !== null) {
        this.triggered++;
        st = { mode: 'sweep', ts: T - pre, drawn: T - pre };
        continue;
      }
      st.searched = Math.max(st.searched, t1);
      if (S.trig.mode === 'auto') {
        const to = this.autoTimeout(D);
        if (t1 - st.armedAt > to) {
          const ts = st.armedAt + to;
          st = { mode: 'sweep', ts, drawn: ts };
          continue;
        }
      }
      break;
    }
    this.state = st;
  }

  /* checkpoints let a rewind pick up the sweep exactly where it was */

  checkpoint(t) {
    const cps = this.checkpoints;
    const last = cps[cps.length - 1];
    if (last && t - last.t < 1 / 240) return;
    cps.push({ t, st: { ...this.state } });
    const cutoff = this.rec.start;
    let drop = 0;
    while (drop < cps.length - 1 && cps[drop + 1].t <= cutoff) drop++;
    if (drop > 512) cps.splice(0, drop);
  }

  truncate(t) {
    const cps = this.checkpoints;
    while (cps.length && cps[cps.length - 1].t > t) cps.pop();
  }

  forget() { this.checkpoints.length = 0; }

  // put the sweep state where it would have been at time t
  restore(t) {
    const cps = this.checkpoints;
    let lo = 0, hi = cps.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cps[mid].t <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best >= 0 && t - cps[best].t < 0.5) {
      this.state = { ...cps[best].st };
      this.simulate(cps[best].t, t, false);
      return;
    }
    const D = this.S.tdiv * 10;
    const back = Math.min(D + 0.05, 12);
    const from = Math.max(this.rec.start, t - back);
    this.state = armed(from);
    this.simulate(from, t, false);
  }
}
