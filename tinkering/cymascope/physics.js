/* Surface physics for a cymascope: a shallow round dish of liquid driven from below.
   The surface can only hold the dish's standing waves, J_m(k r) cos(m θ), with the wall
   forcing a flat slope at the rim (J'_m(k R) = 0). Each tone picks its wavenumber from the
   capillary-gravity dispersion relation, and every dish mode near that wavenumber answers
   with a resonance curve whose width comes from the liquid's viscosity. */

export const TAU = Math.PI * 2;
const G = 9.81;

export const FLUIDS = [
  { id: 'water', name: 'Water', rho: 1000, sigma: 0.072, nu: 1.0e-6 },
  { id: 'alcohol', name: 'Alcohol', rho: 789, sigma: 0.022, nu: 1.5e-6 },
  { id: 'glycerin', name: 'Glycerin mix', rho: 1150, sigma: 0.066, nu: 8e-6 },
  { id: 'oil', name: 'Silicone oil', rho: 960, sigma: 0.021, nu: 2e-5 },
  { id: 'mercury', name: 'Mercury', rho: 13534, sigma: 0.485, nu: 1.1e-7 },
];

/* ---------- dispersion ---------- */

// angular frequency of a surface wave with wavenumber k (1/m) on liquid of depth d (m)
export function omegaOf(k, fl, d) {
  return Math.sqrt((G * k + (fl.sigma / fl.rho) * k * k * k) * Math.tanh(k * d));
}

export function kOf(omega, fl, d) {
  let lo = Math.log(1e-3), hi = Math.log(1e7);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (omegaOf(Math.exp(mid), fl, d) < omega) lo = mid; else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

/* ---------- Bessel functions ---------- */

function j0(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const b = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a / b;
  }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
  const p = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const q = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

function j1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
    const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const r = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
  return x < 0 ? -r : r;
}

// fills out[0..M+1] with J_0(x)..J_{M+1}(x), x >= 0
export function besselRange(M, x, out) {
  const top = M + 1;
  if (x < 1e-12) {
    for (let n = 0; n <= top; n++) out[n] = n === 0 ? 1 : 0;
    return out;
  }
  if (x > top) {
    // upward recurrence is stable while n < x
    out[0] = j0(x);
    out[1] = j1(x);
    for (let n = 1; n < top; n++) out[n + 1] = (2 * n / x) * out[n] - out[n - 1];
    return out;
  }
  // Miller's downward recurrence, normalised with J0 + 2(J2 + J4 + ...) = 1
  const N = 2 * Math.floor((top + Math.floor(Math.sqrt(40 * top)) + 2) / 2);
  let hi = 0, cur = 1e-30, sum = 0;
  for (let n = N; n > 0; n--) {
    const lower = (2 * n / x) * cur - hi;
    hi = cur;
    cur = lower;
    const idx = n - 1;
    if (idx <= top) out[idx] = cur;
    if (idx > 0 && (idx & 1) === 0) sum += 2 * cur;
    if (Math.abs(cur) > 1e10) {
      cur *= 1e-10; hi *= 1e-10; sum *= 1e-10;
      for (let i = idx; i <= top; i++) out[i] *= 1e-10;
    }
  }
  sum += cur;
  const s = 1 / sum;
  for (let n = 0; n <= top; n++) out[n] *= s;
  return out;
}

/* ---------- dish modes ---------- */

export const PROFILE_N = 512;   // samples per radial profile
export const PROFILE_U = 1.5;   // profiles run past the rim, for the fill-frame view
export const MAX_X = 320;       // finest pattern we try to draw (k R)

const BIN = 2;

export class Dish {
  constructor() {
    this.buf = new Float64Array(2048);
    this.zeroBins = new Map();
    this.profiles = new Map();
  }

  // J'_m(x)
  dprime(m, x) {
    const b = besselRange(m + 1, x, this.buf);
    return m === 0 ? -b[1] : 0.5 * (b[m - 1] - b[m + 1]);
  }

  scan(m, lo, hi) {
    const zs = [];
    if (hi < m) return zs;            // j'_{m,1} is always above m
    const step = 0.12;
    let x0 = Math.max(lo, 1e-3), f0 = this.dprime(m, x0);
    for (let x1 = x0 + step; x0 < hi; x1 += step) {
      const xe = Math.min(x1, hi);
      const f1 = this.dprime(m, xe);
      if (f0 === 0 && x0 > 1e-3) zs.push(x0);
      else if (f0 * f1 < 0) {
        let a = x0, b = xe, fa = f0;
        for (let i = 0; i < 34; i++) {
          const c = (a + b) / 2, fc = this.dprime(m, c);
          if (fa * fc <= 0) b = c; else { a = c; fa = fc; }
        }
        zs.push((a + b) / 2);
      }
      x0 = xe; f0 = f1;
    }
    return zs;
  }

  // zeros of J'_m in [a, b], cached in bins of width 2
  zeros(m, a, b) {
    const out = [];
    for (let bin = Math.max(0, Math.floor(a / BIN)); bin * BIN < b; bin++) {
      const key = m * 4096 + bin;
      let z = this.zeroBins.get(key);
      if (!z) { z = this.scan(m, bin * BIN, (bin + 1) * BIN); this.zeroBins.set(key, z); }
      for (const x of z) if (x >= a && x <= b) out.push(x);
    }
    return out;
  }

  // radial order n of the zero x of J'_m (1 = the first ring)
  order(m, x) {
    let n = 0;
    for (const z of this.zeros(m, 0, x + 1e-6)) if (z <= x + 1e-6) n++;
    return n;
  }

  // radial profile J_m(x u) and its slope d/du, peak-normalised inside the dish
  profile(m, x) {
    const key = `${m}:${x.toFixed(6)}`;
    let p = this.profiles.get(key);
    if (p) return p;
    const data = new Float32Array(PROFILE_N * 2);
    let peak = 0;
    for (let i = 0; i < PROFILE_N; i++) {
      const u = (i / (PROFILE_N - 1)) * PROFILE_U;
      const b = besselRange(m + 1, x * u, this.buf);
      const J = b[m];
      const dJ = m === 0 ? -b[1] : 0.5 * (b[m - 1] - b[m + 1]);
      data[i * 2] = J;
      data[i * 2 + 1] = x * dJ;
      if (u <= 1) peak = Math.max(peak, Math.abs(J));
    }
    const s = peak > 0 ? 1 / peak : 1;
    for (let i = 0; i < data.length; i++) data[i] *= s;
    p = { m, x, data };
    if (this.profiles.size > 400) this.profiles.clear();
    this.profiles.set(key, p);
    return p;
  }

  /* Every mode that answers the given tones, with its steady-state amplitude and phase lag.
     tones: [{ f, level, id }]; opts: { fluid, R (m), depth (m), damping, mix } */
  respond(tones, opts) {
    const { fluid, R, depth, damping, mix } = opts;
    const out = [];
    const info = [];
    for (const tone of tones) {
      const w = TAU * tone.f;
      const k = kOf(w, fluid, depth);
      const x0 = k * R;
      // viscous damping of capillary-gravity waves, plus a little from the wall and contact line
      const gamma = (2 * fluid.nu * k * k + 0.004 * w) * damping;
      const dk = 1e-3 * k;
      const cg = (omegaOf(k + dk, fluid, depth) - omegaOf(k - dk, fluid, depth)) / (2 * dk);
      const dx = Math.min(6, Math.max(0.8, (4 * gamma / cg) * R));
      info.push({ k, x0, gamma, Q: w / gamma, tone });
      if (x0 - dx > MAX_X || tone.level <= 0) continue;
      const lo = Math.max(0.5, x0 - dx), hi = Math.min(MAX_X + dx, x0 + dx);
      for (let m = 0; m <= Math.ceil(hi); m++) {
        // the transducer pushes the middle of the dish, so rings answer most;
        // the mix control stands in for the small asymmetries that excite the rest
        const couple = mix + (1 - mix) * Math.exp(-m / 3);
        for (const x of this.zeros(m, lo, hi)) {
          const wm = omegaOf(x / R, fluid, depth);
          const det = (wm * wm - w * w) / (gamma * w);
          const resp = 1 / Math.sqrt(1 + det * det);
          const amp = tone.level * couple * resp;
          if (amp < 0.02 * tone.level) continue;
          out.push({ key: `${tone.id}|${m}|${x.toFixed(5)}`, m, x, tone: tone.id, amp, resp, lag: Math.atan2(gamma * w, wm * wm - w * w) });
        }
      }
    }
    return { modes: out, info };
  }
}

/* ---------- notes ---------- */

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteOf(f) {
  const n = 12 * Math.log2(f / 440) + 57;
  const r = Math.round(n);
  const cents = Math.round((n - r) * 100);
  return { name: `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12)}`, cents };
}

// partials of each waveform: [harmonic, weight]
export const WAVEFORMS = {
  sine: [[1, 1]],
  triangle: [[1, 1], [3, 1 / 9], [5, 1 / 25]],
  square: [[1, 1], [3, 1 / 3], [5, 1 / 5], [7, 1 / 7]],
  saw: [[1, 1], [2, 1 / 2], [3, 1 / 3], [4, 1 / 4]],
};
