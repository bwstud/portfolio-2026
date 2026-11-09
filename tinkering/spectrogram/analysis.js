/* The analysis: a sample history long enough to look back through, a short-time Fourier
   transform with a choice of windows, and a cache of finished columns. Every column is
   worked out from the raw samples, so changing the window or the FFT size redraws the whole
   history with the new settings rather than only what comes after. */

import { SR } from './signals.js';

export const HISTORY_BITS = 22;            // 2^22 samples, about 87 s at 48 kHz
const HN = 1 << HISTORY_BITS, HMASK = HN - 1;
export const HISTORY_S = HN / SR;

export class History {
  constructor() { this.buf = new Float32Array(HN); this.end = 0; }
  push(src, n) {
    for (let i = 0; i < n; i++) this.buf[(this.end + i) & HMASK] = src[i];
    this.end += n;
  }
  get start() { return Math.max(this.floor || 0, this.end - HN); }
  // forget everything recorded so far; the clock keeps running
  clear() { this.floor = this.end; }
  // copies [a, a + n) into out, with silence outside what has been recorded
  read(a, n, out, off = 0) {
    const lo = this.start, hi = this.end;
    for (let i = 0; i < n; i++) {
      const j = a + i;
      out[off + i] = j >= lo && j < hi ? this.buf[j & HMASK] : 0;
    }
  }
}

/* ---------- windows ---------- */

function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; if (t < 1e-12 * s) break; }
  return s;
}

export const WINDOWS = [
  { id: 'rect', name: 'Rectangle', note: 'No taper. The sharpest peaks, but strong tones leak a long way across the spectrum.' },
  { id: 'hann', name: 'Hann', note: 'The usual choice: a good balance of sharp peaks and low leakage.' },
  { id: 'hamming', name: 'Hamming', note: 'Like Hann with a lower first sidelobe, but its far leakage falls off slowly.' },
  { id: 'blackman', name: 'Blackman–Harris', note: 'Wide peaks, and leakage down below 90 dB, for quiet sounds next to loud ones.' },
  { id: 'gauss', name: 'Gaussian', note: 'A bell curve. Its width trades time against frequency sharpness smoothly.', param: { label: 'Width', min: 0.15, max: 0.6, def: 0.35 } },
  { id: 'kaiser', name: 'Kaiser', note: 'Its beta sets how far the leakage is pushed down, at the cost of wider peaks.', param: { label: 'Beta', min: 0, max: 20, def: 9 } },
  { id: 'flattop', name: 'Flat top', note: 'Very wide peaks that read the true level of a tone wherever it falls between bins.' },
];

export function makeWindow(id, N, param) {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const a = 2 * Math.PI * x;
    switch (id) {
      case 'rect': w[i] = 1; break;
      case 'hamming': w[i] = 0.54 - 0.46 * Math.cos(a); break;
      case 'blackman': w[i] = 0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a); break;
      case 'gauss': { const d = (x - 0.5) / (param * 0.5); w[i] = Math.exp(-0.5 * d * d); break; }
      case 'kaiser': { const r = 2 * x - 1; w[i] = besselI0(param * Math.sqrt(Math.max(0, 1 - r * r))) / besselI0(param); break; }
      case 'flattop': w[i] = 0.21557895 - 0.41663158 * Math.cos(a) + 0.277263158 * Math.cos(2 * a) - 0.083578947 * Math.cos(3 * a) + 0.006947368 * Math.cos(4 * a); break;
      default: w[i] = 0.5 - 0.5 * Math.cos(a);
    }
  }
  return w;
}

/* ---------- FFT ---------- */

class FFT {
  constructor(n) {
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos((2 * Math.PI * i) / n); this.sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
  }
  // in place on this.re / this.im
  run() {
    const { n, rev, re, im } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const wr = this.cos[k], wi = this.sin[k];
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
}

/* ---------- STFT ---------- */

export const DB_FLOOR = -200;

export class STFT {
  // size: window length, pad: zero-padding factor, hop: samples between columns
  configure({ size, pad, window, param, hop, mag }) {
    this.size = size;
    this.n = size * pad;
    this.bins = this.n / 2;
    this.hop = hop;
    this.mag = mag;
    if (!this.fft || this.fft.n !== this.n) this.fft = new FFT(this.n);
    this.win = makeWindow(window, size, param);
    let sum = 0;
    for (let i = 0; i < size; i++) sum += this.win[i];
    this.norm = 2 / sum;        // a full-scale sine reads 0 dB
    this.frame = new Float32Array(size);
    this.binHz = SR / this.n;
  }
  /* Column c covers the samples that end at c * hop. Writes dB per bin into out and
     returns the loudest bin. */
  column(hist, c, out) {
    const { size, n, fft, win, frame, norm } = this;
    const end = c * this.hop;
    hist.read(end - size, size, frame);
    const re = fft.re, im = fft.im;
    for (let i = 0; i < size; i++) { re[i] = frame[i] * win[i]; im[i] = 0; }
    for (let i = size; i < n; i++) { re[i] = 0; im[i] = 0; }
    fft.run();
    let best = 1, bestV = -Infinity;
    for (let k = 0; k < this.bins; k++) {
      const m = Math.hypot(re[k], im[k]) * norm;
      let v;
      if (this.mag === 'linear') v = m;
      else v = m > 1e-10 ? 20 * Math.log10(m) : DB_FLOOR;
      out[k] = v;
      if (k > 0 && v > bestV) { bestV = v; best = k; }
    }
    // refine the peak between bins with a parabola through its neighbours (in dB)
    let f = best;
    if (this.mag !== 'linear' && best > 0 && best < this.bins - 1) {
      const a = out[best - 1], b = out[best], d = out[best + 1];
      const den = a - 2 * b + d;
      if (den < 0) f = best + Math.max(-0.5, Math.min(0.5, (0.5 * (a - d)) / den));
    }
    return { hz: f * this.binHz, level: bestV };
  }
}

/* ---------- column cache ---------- */

/* A ring of finished columns, keyed by absolute column number. The renderer keeps the
   same ring on the GPU; slots hold the column number they contain, so stale slots show
   as silence until they are filled again. */
export class Columns {
  constructor(ring, maxBins, upload) {
    this.ring = ring;
    this.maxBins = maxBins;
    this.upload = upload;                       // (slot, col, data) => void
    this.slot = new Int32Array(ring).fill(-1);
    this.peakHz = new Float32Array(ring);
    this.peakDb = new Float32Array(ring);
    this.data = new Float32Array(maxBins);
    this.latest = new Float32Array(maxBins);    // the newest column, for the live spectrum
    this.latestCol = -1;
  }
  clear() { this.slot.fill(-1); this.latestCol = -1; }
  has(c) { return c >= 0 && this.slot[c % this.ring] === c; }
  /* fills [c0, c1] newest first, within a time budget; returns how many are still missing */
  fill(stft, hist, c0, c1, budgetMs) {
    const t0 = performance.now();
    let missing = 0;
    for (let c = c1; c >= Math.max(0, c0); c--) {
      if (this.has(c)) continue;
      if (performance.now() - t0 > budgetMs) { missing++; continue; }
      const s = c % this.ring;
      const pk = stft.column(hist, c, this.data);
      this.slot[s] = c;
      this.peakHz[s] = pk.hz;
      this.peakDb[s] = pk.level;
      this.upload(s, c, this.data);
      if (c > this.latestCol) { this.latestCol = c; this.latest.set(this.data.subarray(0, stft.bins)); }
    }
    return missing;
  }
  peak(c) { const s = c % this.ring; return this.slot[s] === c ? { hz: this.peakHz[s], level: this.peakDb[s] } : null; }
}

/* ---------- frequency scales ---------- */

export const SCALES = [
  { id: 'linear', name: 'Linear' },
  { id: 'log', name: 'Log' },
  { id: 'mel', name: 'Mel' },
  { id: 'piano', name: 'Piano' },
];
export const SCALE_INDEX = { linear: 0, log: 1, mel: 2, piano: 1 };

const mel = (f) => 2595 * Math.log10(1 + f / 700);
const melInv = (m) => 700 * (Math.pow(10, m / 2595) - 1);

// position 0..1 up the axis for frequency f, and back
export function toAxis(f, scale, lo, hi) {
  if (scale === 'linear') return (f - lo) / (hi - lo);
  if (scale === 'mel') return (mel(f) - mel(lo)) / (mel(hi) - mel(lo));
  return Math.log(Math.max(f, 1e-3) / lo) / Math.log(hi / lo);
}
export function fromAxis(y, scale, lo, hi) {
  if (scale === 'linear') return lo + (hi - lo) * y;
  if (scale === 'mel') return melInv(mel(lo) + (mel(hi) - mel(lo)) * y);
  return lo * Math.pow(hi / lo, y);
}

/* ---------- notes ---------- */

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteOf(f) {
  const n = 12 * Math.log2(f / 440) + 57;
  const r = Math.round(n);
  return { name: `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12)}`, cents: Math.round((n - r) * 100), midi: r + 12, black: [1, 3, 6, 8, 10].includes(((r % 12) + 12) % 12) };
}
