// The plate's physics: a square plate, free at its edges and driven at its centre,
// and the sand that rides on it. No three.js here, so it can be tested on its own.

// Plate coordinates run from -1 to 1 on both axes, centre at 0.
export const F_MIN = 60;
export const F_MAX = 4800;
const F0 = 18;     // sets the frequency of the lowest mode
const Q = 45;      // how sharp each resonance is
export const GRID = 192;

// Modes. A free square plate's shapes are close to cos(nπx)cos(mπy) + cos(mπx)cos(nπy)
// on a unit square. A drive at the centre only reaches modes that move the centre,
// which means n and m both even. Frequency rises with n² + m², detuned a little per
// mode so that modes that share a value of n² + m² don't sound together.
export const MODES = [];
for (let n = 2; n <= 20; n += 2) {
  for (let m = 0; m <= n; m += 2) {
    const f = F0 * (n * n + m * m) * (1 + 0.03 * Math.sin(n * 12.9898 + m * 78.233));
    if (f >= F_MIN && f <= F_MAX) MODES.push({ n, m, f });
  }
}
MODES.sort((a, b) => a.f - b.f);

// Each mode's shape sampled on the grid, scaled to a peak of 1 at the centre.
const basis = MODES.map(({ n, m }) => {
  const g = new Float32Array(GRID * GRID);
  const cn = new Float32Array(GRID), cm = new Float32Array(GRID);
  for (let i = 0; i < GRID; i++) {
    const u = i / (GRID - 1);
    cn[i] = Math.cos(n * Math.PI * u);
    cm[i] = Math.cos(m * Math.PI * u);
  }
  const sign = Math.cos(n * Math.PI / 2) * Math.cos(m * Math.PI / 2);   // ±1, so every mode drives in phase
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) g[j * GRID + i] = 0.5 * sign * (cn[i] * cm[j] + cm[i] * cn[j]);
  }
  return g;
});

// The plate's steady response to a sine at f Hz.
// amp is how far each point of the plate moves (0 still, about 1 at an antinode on
// a resonance); gx and gy are the gradient of amp², which pushes sand towards the nodes.
export function createField() {
  const N = GRID;
  const amp = new Float32Array(N * N);
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N);
  const re = new Float32Array(N * N), im = new Float32Array(N * N);
  const field = { amp, gx, gy, re, im, f: 0, strength: 0, mode: null, version: 0 };

  field.set = (f) => {
    if (f === field.f) return;
    field.f = f;
    re.fill(0); im.fill(0);
    let best = 0, mode = null;
    MODES.forEach((md, k) => {
      const r = f / md.f, a = 1 - r * r, b = r / Q, d = a * a + b * b;
      const R = Math.sqrt(1 / d);
      if (R > best) { best = R; mode = md; }
      if (R < 1.5) return;                       // far from this mode: too small to matter
      const wr = a / d / Q, wi = -b / d / Q;
      const g = basis[k];
      for (let i = 0; i < g.length; i++) { re[i] += wr * g[i]; im[i] += wi * g[i]; }
    });
    for (let i = 0; i < amp.length; i++) amp[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    const h = 2 / (N - 1);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const l = amp[j * N + Math.max(0, i - 1)], r = amp[j * N + Math.min(N - 1, i + 1)];
        const t = amp[Math.max(0, j - 1) * N + i], b = amp[Math.min(N - 1, j + 1) * N + i];
        gx[k] = (r * r - l * l) / (2 * h);
        gy[k] = (b * b - t * t) / (2 * h);
      }
    }
    field.strength = Math.min(1, best / Q);
    field.mode = best / Q > 0.35 ? mode : null;
    field.version++;
  };
  return field;
}

export function sample(g, x, y) {
  const N = GRID;
  const fx = (x + 1) * 0.5 * (N - 1), fy = (y + 1) * 0.5 * (N - 1);
  const i = Math.min(N - 2, Math.max(0, fx | 0)), j = Math.min(N - 2, Math.max(0, fy | 0));
  const u = fx - i, v = fy - j, k = j * N + i;
  return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + N] * (1 - u) + g[k + N + 1] * u) * v;
}

// Sand, and anything else loose on the plate. A grain only moves when the plate under it
// accelerates harder than gravity, so it sits still between resonances and settles where
// the plate doesn't move. Each material tunes how it bounces.
export const NUT = 0.06;       // radius of the centre nut, in plate units
export const DENS = 128;       // resolution of the sand-depth map
const DEFAULTS = {
  stick: 0.12,                 // vibration below this doesn't lift a grain
  kick: 3.2,                   // how hard a bounce throws a grain sideways
  drift: 0.014,                // how strongly grains slide off the antinodes
  damp: 0.78,                  // speed kept from one step to the next
  cool: 0.965,                 // how fast a grain's heat fades once it stops hopping
  align: false,                // long grains turn to lie along the still lines
  repel: 0,                    // solid objects keep this far apart
};

export function createSand(count, opts = {}, rand = Math.random) {
  const o = { ...DEFAULTS, ...opts };
  const x = new Float32Array(count), y = new Float32Array(count);
  const vx = new Float32Array(count), vy = new Float32Array(count);
  const hop = new Float32Array(count);
  const heat = new Float32Array(count);         // recent motion, for materials that glow
  const ang = new Float32Array(count);          // which way a long grain points
  const depth = new Float32Array(DENS * DENS);
  const sand = { count, x, y, hop, heat, ang, depth, moving: 0, opts: o };
  const gauss = () => rand() + rand() + rand() - 1.5;

  // Poured from above: even overall, with the soft clumps of a hand shaking it out.
  sand.scatter = () => {
    const clumps = Array.from({ length: 26 }, () => [rand() * 2 - 1, rand() * 2 - 1, 0.15 + rand() * 0.3]);
    for (let i = 0; i < count; i++) {
      let px, py;
      do {
        if (rand() < 0.35) {
          const c = clumps[(rand() * clumps.length) | 0];
          px = c[0] + gauss() * c[2]; py = c[1] + gauss() * c[2];
        } else { px = rand() * 2 - 1; py = rand() * 2 - 1; }
      } while (Math.abs(px) > 0.985 || Math.abs(py) > 0.985 || px * px + py * py < NUT * NUT);
      x[i] = px; y[i] = py; vx[i] = vy[i] = 0; hop[i] = 0; heat[i] = 0;
      ang[i] = rand() * Math.PI * 2;
    }
    if (o.repel) for (let k = 0; k < 6; k++) separate();
    sand.measure();
  };

  sand.step = (field, drive, dt) => {
    const lim = 0.985, { stick, kick, drift, damp, cool, align } = o;
    let moving = 0;
    for (let i = 0; i < count; i++) {
      heat[i] *= cool;
      const a = sample(field.amp, x[i], y[i]) * drive;
      if (a < 0.02) {                            // still: friction holds it
        vx[i] *= 0.5; vy[i] *= 0.5; hop[i] *= 0.6;
        x[i] += vx[i] * dt; y[i] += vy[i] * dt;
        continue;
      }
      // Above the lift threshold a grain bounces and scatters. Below it, the buzz still
      // lets it creep downhill, so the sand gathers on the node line, not either side of it.
      const e = Math.max(0, (a - stick) / (1 - stick));
      if (e > 0) moving++;
      const k = kick * e, d = drift * drive * Math.min(1, a / stick);
      const gx = sample(field.gx, x[i], y[i]), gy = sample(field.gy, x[i], y[i]);
      vx[i] = vx[i] * damp + gauss() * k - gx * d;
      vy[i] = vy[i] * damp + gauss() * k - gy * d;
      let px = x[i] + vx[i] * dt, py = y[i] + vy[i] * dt;
      if (px > lim) { px = 2 * lim - px; vx[i] *= -0.4; } else if (px < -lim) { px = -2 * lim - px; vx[i] *= -0.4; }
      if (py > lim) { py = 2 * lim - py; vy[i] *= -0.4; } else if (py < -lim) { py = -2 * lim - py; vy[i] *= -0.4; }
      const r2 = px * px + py * py;
      if (r2 < NUT * NUT) { const s = NUT / Math.sqrt(r2 + 1e-9); px *= s; py *= s; }
      x[i] = px; y[i] = py;
      hop[i] = e > 0 ? e * rand() : hop[i] * 0.6;
      if (e > heat[i]) heat[i] = e;
      // A long grain buzzing near a line turns to lie along it, across the downhill slope.
      if (align && a < 0.6 && gx * gx + gy * gy > 1e-6) {
        let t = Math.atan2(gy, gx) + Math.PI / 2 - ang[i];
        t -= Math.PI * Math.round(t / Math.PI);  // a grain has no front, so turn the short way
        ang[i] += t * 0.12 * Math.min(1, a / stick) + gauss() * e * 0.6;
      } else if (e > 0) ang[i] += gauss() * e * 0.8;
    }
    if (o.repel) separate();
    sand.moving = moving / count;
  };

  // Solid objects can't overlap: push apart any pair closer than their size.
  // A coarse grid keeps it to neighbours only.
  const R = o.repel, G = R ? Math.ceil(2 / R) : 0;
  const head = R ? new Int32Array(G * G) : null, next = R ? new Int32Array(count) : null;
  function separate() {
    head.fill(-1);
    for (let i = 0; i < count; i++) {
      const c = Math.min(G - 1, ((y[i] + 1) / R) | 0) * G + Math.min(G - 1, ((x[i] + 1) / R) | 0);
      next[i] = head[c]; head[c] = i;
    }
    const r2 = R * R;
    for (let i = 0; i < count; i++) {
      const ci = Math.min(G - 1, ((x[i] + 1) / R) | 0), cj = Math.min(G - 1, ((y[i] + 1) / R) | 0);
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cj + dj; if (jj < 0 || jj >= G) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di; if (ii < 0 || ii >= G) continue;
          for (let j = head[jj * G + ii]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy;
            if (d2 >= r2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2), push = (R - d) * 0.5 / d;
            x[i] -= dx * push; y[i] -= dy * push; x[j] += dx * push; y[j] += dy * push;
          }
        }
      }
    }
  }

  // How deep the sand lies, softened so piles have shoulders.
  const tmp = new Float32Array(DENS * DENS);
  sand.measure = () => {
    tmp.fill(0);
    const s = (DENS - 1) * 0.5;
    for (let i = 0; i < count; i++) {
      const gx = Math.round((x[i] + 1) * s), gy = Math.round((y[i] + 1) * s);
      tmp[gy * DENS + gx] += 1;
    }
    const norm = (DENS * DENS) / count;      // 1 is an even layer
    for (let j = 0; j < DENS; j++) {
      for (let i = 0; i < DENS; i++) {
        let sum = 0, w = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj; if (jj < 0 || jj >= DENS) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = i + di; if (ii < 0 || ii >= DENS) continue;
            const ww = (di ? 1 : 2) * (dj ? 1 : 2);
            sum += tmp[jj * DENS + ii] * ww; w += ww;
          }
        }
        depth[j * DENS + i] = (sum / w) * norm;
      }
    }
  };
  sand.depthAt = (px, py) => {
    const s = (DENS - 1) * 0.5;
    return depth[Math.round((py + 1) * s) * DENS + Math.round((px + 1) * s)];
  };

  return sand;
}

// Where f sits along the knob's range, 0 to 1, on a log scale.
export const toUnit = (f) => Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN);
export const fromUnit = (u) => F_MIN * Math.pow(F_MAX / F_MIN, u);
