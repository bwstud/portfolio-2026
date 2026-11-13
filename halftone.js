/* Halftone transition: the dot band at the top of each coloured work section. It's drawn on a
   canvas so the Halftone Lab (tinkering/halftone-lab/) can reshape and distort it.
   halftone-versions.js holds saved settings, and the site draws the one named "active".

   How it draws: every pixel finds its nearest dots on a screen (a grid of dot centres). Each dot
   has a radius set by how far down the band it sits, sized so the band's colour coverage ramps
   from 0 to 1. Dots grow, touch, and the gaps between them shrink into holes, all in one motion.
   Distortions bend the transition line, the coverage, or the grid itself. */
(function () {
  const DEFAULTS = {
    height: 144,        // height of the transition, px. It's centred on the edge between two sections
    start: 0,           // where the ramp begins and ends, as fractions of the band height
    end: 1,
    curve: 1,           // above 1 keeps dots small for longer, below 1 fills in sooner
    cell: 12,           // dot pitch, px. The lab shows it as density: rows across the transition
    dotSize: 1,         // scales every dot. Below 1 leaves more space between them; they still
                        //   catch up and fill in at the bottom of the transition
    grid: 'offset',     // offset (every other row shifted half a dot), hex, square
    shape: 'round',     // round, square, diamond, line
    perDot: true,       // true: each dot one size. false: sized pixel by pixel, so dots taper
    angle: 0,           // screen rotation, degrees
    stretch: 1,         // vertical stretch of the screen
    softness: 1,        // edge blur, device pixels
    waveAmp: 0, waveLen: 480, wavePhase: 0,   // a swell along the transition line, px
    raggedAmp: 0, raggedScale: 90,            // noise along the transition line, px
    mottleAmp: 0, mottleScale: 60,            // patchy noise through the coverage
    // animation
    animate: false,     // mottle strength wanders between these limits, differently along the band
    mottleMin: 0, mottleMax: 0.4,
    flow: 0,            // px per second the whole band travels sideways (positive: left to right)
    heaveAmp: 0,        // px the band rises and falls, locally, as it travels
    heaveLen: 400,      // px between swells
    rise: 0,            // px per second the mottle drifts upward, like steam off the solid
    morph: 0,           // how fast the mottle changes shape: new shapes per second
    chaos: 0.6,         // randomness: the clock speeds up and slows down, and shapes keep shifting
    animPeriod: 4,      // seconds for a typical swing or swell
    shift: 0, time: 0,  // set by the animation for each frame; leave at 0
    animFps: 60,        // frames drawn per second (most screens top out at 60)
    warpAmp: 0, warpLen: 200,                 // bends the dot grid, px
    sizeTop: 1, sizeBottom: 1,                // dot pitch multiplier at the top and bottom
    jitter: 0,                                // random offset per dot, fraction of the pitch
    seed: 1,
    // cursor: the pointer stirs the air around the band and the dots ride it, like a hand moving
    // through smoke. Needs WebGL.
    cursor: true,
    cursorRadius: 44,   // px: size of the stirred patch around the pointer
    cursorForce: 0.7,   // how hard the pointer pushes the air (1: at the pointer's own speed)
    cursorDots: 0.3,    // how much the dot grid itself bends with the air. 0 keeps the dots in
                        //   place and only moves the transition; 1 drags the dots fully
    cursorSwirl: 1,     // how strongly the wake curls into vortices
    cursorDrag: 0.9,    // seconds the air keeps moving after the pointer passes
    cursorHeal: 2.2,    // seconds for the dots to drift back into place
  };

  /* ---- Noise ---- */
  function hash(n, seed) {
    let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const hash2 = (i, j, seed) => hash(Math.imul(i, 73856093) ^ Math.imul(j, 19349663), seed);
  const fade = t => t * t * (3 - 2 * t);
  function noise1(x, seed) {
    const i = Math.floor(x), a = hash(i, seed), b = hash(i + 1, seed);
    return (a + (b - a) * fade(x - i)) * 2 - 1;
  }
  function noise2(x, y, seed) {
    const i = Math.floor(x), j = Math.floor(y), fx = fade(x - i), fy = fade(y - j);
    const a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
    return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
  }
  const fbm1 = (x, seed) => noise1(x, seed) * 0.65 + noise1(x * 2.7, seed + 17) * 0.35;
  const fbm2 = (x, y, seed) => noise2(x, y, seed) * 0.65 + noise2(x * 2.3, y * 2.3, seed + 29) * 0.35;
  // mottle that changes shape over time: cross-fade between noise fields, keeping the contrast
  // steady through the fade. tm counts shapes (time × morph).
  function steam(x, y, seed, tm) {
    if (!tm) return fbm2(x, y, seed);
    const k = Math.floor(tm), f = fade(tm - k);
    const a = fbm2(x, y, seed + k * 7), b = fbm2(x, y, seed + (k + 1) * 7);
    return (a * (1 - f) + b * f) / Math.sqrt((1 - f) * (1 - f) + f * f);
  }

  /* ---- Screen geometry, in cell units ---- */
  const lattice = grid => ({ rp: grid === 'hex' ? Math.sqrt(3) / 2 : 1, off: grid === 'square' ? 0 : 0.5 });

  function metric(shape, dx, dy) {
    dx = Math.abs(dx); dy = Math.abs(dy);
    if (shape === 'square') return dx > dy ? dx : dy;
    if (shape === 'diamond') return (dx + dy) * 0.7071;
    if (shape === 'line') return dy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // every distance-to-nearest-dot across one tile, sorted: the radius that covers a fraction c
  // of the screen is simply the value c of the way along
  const TABLES = {};
  function coverageTable(grid, shape) {
    const key = grid + '|' + shape;
    if (TABLES[key]) return TABLES[key];
    const { rp, off } = lattice(grid);
    const n = 128, out = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n * 2, v = (j + 0.5) / n * 2 * rp;
        let best = Infinity;
        const r0 = Math.floor(v / rp);
        for (let r = r0 - 1; r <= r0 + 1; r++) {
          const o = (r & 1) ? off : 0, cy = (r + 0.5) * rp, c0 = Math.floor(u - o);
          for (let c = c0 - 1; c <= c0 + 1; c++) {
            const d = metric(shape, u - (c + 0.5 + o), v - cy);
            if (d < best) best = d;
          }
        }
        out[j * n + i] = best;
      }
    }
    out.sort();
    return (TABLES[key] = out);
  }

  // how far past the transition the canvas reaches, above and below, so nothing a distortion
  // pushes outward gets cut off. The canvas is height + 2 × bleed tall.
  function bleed(input) {
    const cfg = { ...DEFAULTS, ...input };
    const H = cfg.height, span = Math.max(1, (cfg.end - cfg.start) * H);
    const dot = cfg.cell * Math.max(cfg.sizeTop, cfg.sizeBottom) * Math.max(1, cfg.stretch);
    const mottle = cfg.animate ? Math.max(Math.abs(cfg.mottleMin), Math.abs(cfg.mottleMax)) : Math.abs(cfg.mottleAmp);
    const reach = Math.abs(cfg.waveAmp) + Math.abs(cfg.raggedAmp) + Math.abs(cfg.heaveAmp) + mottle * span + Math.abs(cfg.warpAmp) + dot
      + Math.max(0, -cfg.start * H, (cfg.end - 1) * H);
    return Math.ceil(reach);
  }

  // how high the dots really climb above the section edge, for laying out what sits above a band.
  // bleed() is a hard limit that assumes every noise field peaks at once; noise (ragged edge,
  // heave, mottle) seldom passes ~70% of its nominal amplitude, so here it counts at NOISE.
  // Checked against the active version: 480 frames over 4 minutes peaked at 308px; this gives 318.
  function peak(input) {
    const cfg = { ...DEFAULTS, ...input }, NOISE = 0.8;
    const H = cfg.height, span = Math.max(1, (cfg.end - cfg.start) * H);
    const dot = cfg.cell * Math.max(cfg.sizeTop, cfg.sizeBottom) * Math.max(1, cfg.stretch);
    const mottle = cfg.animate ? Math.max(Math.abs(cfg.mottleMin), Math.abs(cfg.mottleMax)) : Math.abs(cfg.mottleAmp);
    const noise = Math.abs(cfg.raggedAmp) + Math.abs(cfg.heaveAmp) + mottle * span;
    const top = H / 2 + Math.abs(cfg.waveAmp) + NOISE * noise + Math.abs(cfg.warpAmp) + dot + Math.max(0, -cfg.start * H);
    return Math.min(Math.ceil(top), H / 2 + bleed(cfg));
  }

  /* ---- The mask: 0 is the colour above, 255 the colour below ---- */
  function mask(input, width, dpr) {
    const cfg = { ...DEFAULTS, ...input };
    const H = cfg.height, B = bleed(cfg);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round((H + B * 2) * dpr));
    const data = new Uint8ClampedArray(w * h);

    const table = coverageTable(cfg.grid, cfg.shape), N = table.length, Rmax = table[N - 1];
    const { rp, off } = lattice(cfg.grid);
    const y0 = cfg.start * H, span = Math.max(1, (cfg.end - cfg.start) * H);
    const TAU = Math.PI * 2;

    // radius for a coverage t (0..1), with the curve baked in
    const RLUT = new Float32Array(1025);
    for (let i = 0; i <= 1024; i++) RLUT[i] = table[Math.min(N - 1, Math.round(Math.pow(i / 1024, cfg.curve) * (N - 1)))];
    const ds = cfg.dotSize;
    const radius = t => {
      if (t <= 0) return -1;
      if (t >= 1) return Rmax + 1;
      // bigger dots: reach each size sooner. Smaller dots: scale down, easing back to full size
      // near the end so the fill still completes
      if (ds >= 1) return t * ds >= 1 ? Rmax + 1 : RLUT[(t * ds * 1024) | 0];
      const t4 = t * t * t * t;
      return RLUT[(t * 1024) | 0] * (ds + (1 - ds) * t4);
    };

    // the transition line's offset per column, and the mottle field on a coarse grid
    const sMax = cfg.cell * Math.max(cfg.sizeTop, cfg.sizeBottom) * Math.max(1, cfg.stretch);
    const pad = Math.ceil(sMax * 2 + Math.abs(cfg.warpAmp)) + 2;
    // heave: swells that travel with the band and rise and fall over time. It lifts the whole
    // transition, mottle included, so the band moves up and down rather than stretching.
    const edge = new Float32Array(Math.ceil(width) + pad * 2 + 2);
    const heave = new Float32Array(edge.length);
    const tp = cfg.time / Math.max(0.1, cfg.animPeriod);
    for (let i = 0; i < edge.length; i++) {
      const x = i - pad - cfg.shift;
      heave[i] = cfg.heaveAmp ? cfg.heaveAmp * fbm2(x / cfg.heaveLen, tp, cfg.seed + 41) : 0;
      edge[i] = cfg.waveAmp * Math.sin(TAU * x / cfg.waveLen + cfg.wavePhase * Math.PI / 180)
        + (cfg.raggedAmp ? cfg.raggedAmp * fbm1(x / cfg.raggedScale, cfg.seed) : 0) + heave[i];
    }
    const lerpAt = arr => x => {
      let i = x + pad;
      i = i < 0 ? 0 : i > arr.length - 2 ? arr.length - 2 : i;
      const i0 = i | 0;
      return arr[i0] + (arr[i0 + 1] - arr[i0]) * (i - i0);
    };
    const edgeAt = lerpAt(edge), heaveAt = lerpAt(heave);
    const G = 4, mw = Math.ceil((width + pad * 2) / G) + 2, mh = Math.ceil((H + (B + pad) * 2) / G) + 2;
    let mott = null;
    // animated mottle: strength varies along the band as well as over time, so the whole band
    // never goes flat at once
    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    const ampAt = xs => (cfg.animate
      ? cfg.mottleMin + (cfg.mottleMax - cfg.mottleMin) * clamp01(0.55 + 0.5 * fbm2(xs / (cfg.mottleScale * 2.5), tp, cfg.seed + 101))
      : cfg.mottleAmp);
    if (cfg.mottleAmp || cfg.animate) {
      mott = new Float32Array(mw * mh);
      for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
        // scaled about the middle of the band, so changing the scale doesn't slide it sideways
        // rise: sample from further down as time passes, so the pattern drifts up
        mott[j * mw + i] = ampAt(i * G - pad - cfg.shift) * steam((i * G - pad - cfg.shift - width / 2) / cfg.mottleScale,
          (j * G - pad - B - H / 2 + cfg.rise * cfg.time) / cfg.mottleScale, cfg.seed + 5, cfg.time * cfg.morph);
      }
    }
    const mottleAt = (x, y) => {
      let gx = (x + pad) / G, gy = (y + pad + B) / G;
      gx = gx < 0 ? 0 : gx > mw - 2 ? mw - 2 : gx;
      gy = gy < 0 ? 0 : gy > mh - 2 ? mh - 2 : gy;
      const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * mw + i;
      const a = mott[k], b = mott[k + 1], c = mott[k + mw], d = mott[k + mw + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const coverage = (x, y) => (y - edgeAt(x) - y0) / span + (mott ? mottleAt(x, cfg.heaveAmp ? y - heaveAt(x) : y) : 0);

    const ang = cfg.angle * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang), mid = width / 2;
    const sT = cfg.cell * cfg.sizeTop, sB = cfg.cell * cfg.sizeBottom, slope = (sB - sT) / H, flat = Math.abs(slope) < 1e-6;
    const stretch = Math.max(0.05, cfg.stretch), jit = cfg.jitter, seed = cfg.seed | 0;
    const mottleMost = cfg.animate ? Math.max(Math.abs(cfg.mottleMin), Math.abs(cfg.mottleMax)) : Math.abs(cfg.mottleAmp);
    const margin = (sMax * 2 + Math.abs(cfg.warpAmp)) / span + mottleMost + 0.02;
    const sharp = dpr / Math.max(0.05, cfg.softness);
    const perDot = cfg.perDot, shape = cfg.shape;

    for (let py = 0; py < h; py++) {
      const y = (py + 0.5) / dpr - B;   // 0 is where the transition begins
      for (let px = 0; px < w; px++) {
        const x = (px + 0.5) / dpr;
        const t = coverage(x, y);
        let a;
        if (t < -margin) a = 0;
        else if (t > 1 + margin) a = 1;
        else {
          // into screen space: travel, warp, rotate about the middle, then scale by the local pitch
          const xs = x - cfg.shift;
          const wx = cfg.warpAmp ? xs + cfg.warpAmp * Math.sin(TAU * y / cfg.warpLen) : xs;
          const wy = cfg.warpAmp ? y + cfg.warpAmp * Math.sin(TAU * xs / cfg.warpLen + 1.3) : y;
          const X = wx - mid, rx = X * ca + wy * sa, ry = -X * sa + wy * ca;
          let s, v;
          if (flat) { s = sT; v = ry / sT; }
          else { s = Math.max(1, sT + slope * ry); v = Math.log(s / sT) / slope; }
          const u = rx / s;
          v /= stretch;

          let best = -Infinity;
          const r0 = Math.floor(v / rp);
          const R = perDot ? 0 : radius(t);
          for (let r = r0 - 1; r <= r0 + 1; r++) {
            const o = (r & 1) ? off : 0, c0 = Math.floor(u - o);
            for (let c = c0 - 1; c <= c0 + 1; c++) {
              let cu = c + 0.5 + o, cv = (r + 0.5) * rp;
              if (jit) { cu += (hash2(c, r, seed) - 0.5) * jit; cv += (hash2(c, r, seed + 1) - 0.5) * jit; }
              const du = cu - u, dv = cv - v;
              let rad = R;
              if (perDot) {
                // this dot's size comes from the coverage at its own centre
                const ox = du * s, oy = dv * s * stretch;
                rad = radius(coverage(x + ox * ca - oy * sa, y + ox * sa + oy * ca));
              }
              const score = rad - metric(shape, du, dv);
              if (score > best) best = score;
            }
          }
          a = 0.5 + best * s * sharp;
          a = a < 0 ? 0 : a > 1 ? 1 : a;
        }
        data[py * w + px] = a * 255;
      }
    }
    return { w, h, data, bleed: B };
  }

  /* ---- Colour the mask ---- */
  function paint(canvas, m, from, to) {
    if (canvas.width !== m.w) canvas.width = m.w;
    if (canvas.height !== m.h) canvas.height = m.h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(m.w, m.h), d = img.data;
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) for (let k = 0; k < 3; k++) lut[i * 3 + k] = from[k] + (to[k] - from[k]) * i / 255;
    for (let i = 0, n = m.data.length; i < n; i++) {
      const l = m.data[i] * 3, j = i * 4;
      d[j] = to[0]; d[j + 1] = to[1]; d[j + 2] = to[2]; d[j + 3] = m.data[i];   // only the "to" colour is painted: whatever lies behind shows as "from"
    }
    ctx.putImageData(img, 0, 0);
  }

  // any CSS colour, including var(...), as [r, g, b], resolved where `host` sits
  function rgb(value, host = document.body) {
    const probe = document.createElement('span');
    probe.style.color = value;
    host.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const n = (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    // color-mix() and other modern colours compute to color(srgb r g b), in 0–1
    return c.startsWith('color(') ? n.map(v => Math.round(v * 255)) : n;
  }

  function activeConfig() {
    const store = window.HALFTONE_VERSIONS;
    const version = store && store.versions.find(v => v.id === store.active);
    return { ...DEFAULTS, ...(version ? version.config : {}) };
  }

  /* ---- Animation ---- */
  const moves = cfg => !!(cfg.animate || cfg.flow || cfg.heaveAmp || (cfg.mottleAmp || cfg.animate) && (cfg.rise || cfg.morph));

  // the settings for one moment. Flow moves the band at a steady speed. Randomness wobbles the
  // clock that drives heave, rise and mottle (always forward, never backward) and keeps the mottle
  // slowly changing shape, so the motion doesn't settle into a visible rhythm.
  function at(input, seconds) {
    const cfg = { ...DEFAULTS, ...input };
    if (!moves(cfg)) return cfg;
    const P = Math.max(0.1, cfg.animPeriod), seed = cfg.seed | 0;
    cfg.shift += cfg.flow * seconds;
    const wobble = fbm1(seconds / (P * 2.9), seed + 303) * 0.6 + fbm1(seconds / (P * 7.3), seed + 307) * 0.4;
    cfg.time += seconds + cfg.chaos * 0.18 * P * wobble;
    cfg.morph += cfg.chaos * 0.3 / P;
    return cfg;
  }

  // runs onFrame(settings) once per screen refresh, capped at animFps. active() can pause it
  // (say, while no band is on screen).
  function animate(cfg, onFrame, active = () => true) {
    let stopped = false, raf = 0, last = -Infinity;
    const t0 = performance.now(), gap = 1000 / Math.max(1, cfg.animFps) - 1;
    function tick(now) {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (!active() || now - last < gap) return;
      last = now;
      onFrame(at(cfg, (now - t0) / 1000));
    }
    raf = requestAnimationFrame(tick);
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  }

  /* ---- WebGL: the same drawing as mask(), one pixel per shader run, fast enough to animate ---- */
  const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uDpr, uB, uH, uY0, uSpan, uMid, uMargin, uSharp, uRmax, uDotSize;
uniform float uST, uSlope, uFlat, uStretch, uCa, uSa, uRp, uOff, uJit;
uniform float uWarpAmp, uWarpLen, uWaveAmp, uWaveLen, uWavePhase, uRagAmp, uRagScale;
uniform float uMotAmp, uMotScale, uHeaveAmp, uHeaveLen, uTp, uShift, uRiseT, uTm, uMotMin, uMotMax;
uniform int uAnim;
uniform int uSeed, uShape, uPerDot;
uniform vec3 uFrom, uTo;
uniform sampler2D uLut;
uniform sampler2D uDisp;   // cursor displacement, px, over the whole canvas
uniform int uDispOn;
uniform vec2 uDispSize;
uniform float uDispDots;
out vec4 outColor;
const float TAU = 6.28318530718;

float hash(int n, int seed) {
  uint h = uint(n) * 374761393u + uint(seed) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967296.0;
}
float hash2(int i, int j, int seed) { return hash(int((uint(i) * 73856093u) ^ (uint(j) * 19349663u)), seed); }
float fade(float t) { return t * t * (3.0 - 2.0 * t); }
float noise1(float x, int seed) {
  float fi = floor(x); int i = int(fi);
  float a = hash(i, seed), b = hash(i + 1, seed);
  return (a + (b - a) * fade(x - fi)) * 2.0 - 1.0;
}
float noise2(float x, float y, int seed) {
  float fi = floor(x), fj = floor(y); int i = int(fi), j = int(fj);
  float fx = fade(x - fi), fy = fade(y - fj);
  float a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2.0 - 1.0;
}
float fbm1(float x, int seed) { return noise1(x, seed) * 0.65 + noise1(x * 2.7, seed + 17) * 0.35; }
float fbm2(float x, float y, int seed) { return noise2(x, y, seed) * 0.65 + noise2(x * 2.3, y * 2.3, seed + 29) * 0.35; }
float steam(float x, float y, int seed, float tm) {
  if (tm == 0.0) return fbm2(x, y, seed);
  float fk = floor(tm); int k = int(fk); float f = fade(tm - fk);
  float a = fbm2(x, y, seed + k * 7), b = fbm2(x, y, seed + (k + 1) * 7);
  return (a * (1.0 - f) + b * f) / sqrt((1.0 - f) * (1.0 - f) + f * f);
}

float metric(vec2 d) {
  d = abs(d);
  if (uShape == 1) return max(d.x, d.y);
  if (uShape == 2) return (d.x + d.y) * 0.7071;
  if (uShape == 3) return d.y;
  return length(d);
}
float lut(float t) { return texelFetch(uLut, ivec2(min(int(t * 1024.0), 1024), 0), 0).r; }
float radius(float t) {
  if (t <= 0.0) return -1.0;
  if (t >= 1.0) return uRmax + 1.0;
  if (uDotSize >= 1.0) { float k = t * uDotSize; return k >= 1.0 ? uRmax + 1.0 : lut(k); }
  float t4 = t * t * t * t;
  return lut(t) * (uDotSize + (1.0 - uDotSize) * t4);
}
float coverage(float x, float y) {
  float xs = x - uShift;
  float hv = uHeaveAmp != 0.0 ? uHeaveAmp * fbm2(xs / uHeaveLen, uTp, uSeed + 41) : 0.0;
  float e = uWaveAmp * sin(TAU * xs / uWaveLen + uWavePhase) + hv;
  if (uRagAmp != 0.0) e += uRagAmp * fbm1(xs / uRagScale, uSeed);
  float c = (y - e - uY0) / uSpan;
  float amp = uAnim == 1 ? mix(uMotMin, uMotMax, clamp(0.55 + 0.5 * fbm2(xs / (uMotScale * 2.5), uTp, uSeed + 101), 0.0, 1.0)) : uMotAmp;
  if (amp != 0.0) c += amp * steam((xs - uMid) / uMotScale, (y - hv - uH * 0.5 + uRiseT) / uMotScale, uSeed + 5, uTm);
  return c;
}

void main() {
  float x = gl_FragCoord.x / uDpr;
  float y = (uRes.y - gl_FragCoord.y) / uDpr - uB;
  // cursor: the colour here came from (x, y) - d. The transition follows the air fully and the
  // dot grid by uDispDots, so the smoke parts without the dots smearing into moire. Faded out
  // toward the canvas's top and bottom so nothing gets dragged past its edge
  vec2 d = vec2(0.0);
  if (uDispOn == 1) {
    float yc = (y + uB) / (uH + 2.0 * uB);
    d = texture(uDisp, vec2(x, y + uB) / uDispSize).rg * smoothstep(0.0, 0.16, yc) * smoothstep(0.0, 0.16, 1.0 - yc);
  }
  vec2 back = d * (1.0 - uDispDots);   // from the bent grid back to where the colour came from
  x -= d.x * uDispDots; y -= d.y * uDispDots;
  float t = coverage(x - back.x, y - back.y);
  float a;
  if (t < -uMargin) a = 0.0;
  else if (t > 1.0 + uMargin) a = 1.0;
  else {
    float xs = x - uShift;
    float wx = uWarpAmp != 0.0 ? xs + uWarpAmp * sin(TAU * y / uWarpLen) : xs;
    float wy = uWarpAmp != 0.0 ? y + uWarpAmp * sin(TAU * xs / uWarpLen + 1.3) : y;
    float X = wx - uMid, rx = X * uCa + wy * uSa, ry = -X * uSa + wy * uCa;
    float s, v;
    if (uFlat > 0.5) { s = uST; v = ry / uST; }
    else { s = max(1.0, uST + uSlope * ry); v = log(s / uST) / uSlope; }
    float u = rx / s;
    v /= uStretch;
    float best = -1e9;
    float R = uPerDot == 1 ? 0.0 : radius(t);
    int r0 = int(floor(v / uRp));
    for (int r = r0 - 1; r <= r0 + 1; r++) {
      float o = (r & 1) == 1 ? uOff : 0.0;
      int c0 = int(floor(u - o));
      for (int c = c0 - 1; c <= c0 + 1; c++) {
        float cu = float(c) + 0.5 + o, cv = (float(r) + 0.5) * uRp;
        if (uJit != 0.0) { cu += (hash2(c, r, uSeed) - 0.5) * uJit; cv += (hash2(c, r, uSeed + 1) - 0.5) * uJit; }
        float du = cu - u, dv = cv - v;
        float rad = R;
        if (uPerDot == 1) {
          float ox = du * s, oy = dv * s * uStretch;
          rad = radius(coverage(x - back.x + ox * uCa - oy * uSa, y - back.y + ox * uSa + oy * uCa));
        }
        best = max(best, rad - metric(vec2(du, dv)));
      }
    }
    a = clamp(0.5 + best * s * uSharp, 0.0, 1.0);
  }
  a = floor(a * 255.0) / 255.0;   // match the 8-bit mask the fallback draws
  outColor = vec4(uTo / 255.0 * a, a);   // only the "to" colour is painted (premultiplied): whatever lies behind the canvas shows as "from"
}`;
  const VERT = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  function glRenderer(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, depth: false, stencil: false });
    if (!gl) return null;
    const shader = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const loc = {};
    const U = name => (name in loc ? loc[name] : (loc[name] = gl.getUniformLocation(prog, name)));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U('uLut'), 0);
    // cursor displacement: two floats per sim cell, filtered so the warp is smooth
    const disp = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, disp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array(2));
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(U('uDisp'), 1);
    let lutKey = '';
    const SHAPES = { round: 0, square: 1, diamond: 2, line: 3 };

    return {
      gpu: true,
      // field: optional cursor displacement from stir() ({ data, cols, rows, cell })
      draw(input, width, dpr, from, to, field) {
        const cfg = { ...DEFAULTS, ...input };
        const H = cfg.height, B = bleed(cfg);
        const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round((H + B * 2) * dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        gl.viewport(0, 0, w, h);

        // radius table: the same one mask() builds
        const table = coverageTable(cfg.grid, cfg.shape), N = table.length;
        const key = cfg.grid + cfg.shape + cfg.curve;
        if (key !== lutKey) {
          gl.activeTexture(gl.TEXTURE0);
          const RLUT = new Float32Array(1025);
          for (let i = 0; i <= 1024; i++) RLUT[i] = table[Math.min(N - 1, Math.round(Math.pow(i / 1024, cfg.curve) * (N - 1)))];
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1025, 1, 0, gl.RED, gl.FLOAT, RLUT);
          lutKey = key;
        }
        const { rp, off } = lattice(cfg.grid);
        const span = Math.max(1, (cfg.end - cfg.start) * H);
        const sMax = cfg.cell * Math.max(cfg.sizeTop, cfg.sizeBottom) * Math.max(1, cfg.stretch);
        const sT = cfg.cell * cfg.sizeTop, sB = cfg.cell * cfg.sizeBottom, slope = (sB - sT) / H;
        const ang = cfg.angle * Math.PI / 180;
        const f = (name, v) => gl.uniform1f(U(name), v);
        gl.uniform2f(U('uRes'), w, h);
        f('uDpr', dpr); f('uB', B); f('uH', H); f('uY0', cfg.start * H); f('uSpan', span); f('uMid', width / 2);
        const mottleMost = cfg.animate ? Math.max(Math.abs(cfg.mottleMin), Math.abs(cfg.mottleMax)) : Math.abs(cfg.mottleAmp);
        f('uMargin', (sMax * 2 + Math.abs(cfg.warpAmp)) / span + mottleMost + 0.02);
        f('uSharp', dpr / Math.max(0.05, cfg.softness)); f('uRmax', table[N - 1]); f('uDotSize', cfg.dotSize);
        f('uST', sT); f('uSlope', slope); f('uFlat', Math.abs(slope) < 1e-6 ? 1 : 0); f('uStretch', Math.max(0.05, cfg.stretch));
        f('uCa', Math.cos(ang)); f('uSa', Math.sin(ang)); f('uRp', rp); f('uOff', off); f('uJit', cfg.jitter);
        f('uWarpAmp', cfg.warpAmp); f('uWarpLen', cfg.warpLen); f('uWaveAmp', cfg.waveAmp); f('uWaveLen', cfg.waveLen);
        f('uWavePhase', cfg.wavePhase * Math.PI / 180); f('uRagAmp', cfg.raggedAmp); f('uRagScale', cfg.raggedScale);
        f('uMotAmp', cfg.mottleAmp); f('uMotScale', cfg.mottleScale); f('uHeaveAmp', cfg.heaveAmp); f('uHeaveLen', cfg.heaveLen);
        f('uTp', cfg.time / Math.max(0.1, cfg.animPeriod)); f('uShift', cfg.shift);
        f('uRiseT', cfg.rise * cfg.time); f('uTm', cfg.time * cfg.morph);
        f('uMotMin', cfg.mottleMin); f('uMotMax', cfg.mottleMax); gl.uniform1i(U('uAnim'), cfg.animate ? 1 : 0);
        gl.uniform1i(U('uSeed'), cfg.seed | 0); gl.uniform1i(U('uShape'), SHAPES[cfg.shape] || 0); gl.uniform1i(U('uPerDot'), cfg.perDot ? 1 : 0);
        gl.uniform3f(U('uFrom'), from[0], from[1], from[2]); gl.uniform3f(U('uTo'), to[0], to[1], to[2]);
        gl.uniform1i(U('uDispOn'), field ? 1 : 0);
        if (field) {
          gl.activeTexture(gl.TEXTURE1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, field.cols, field.rows, 0, gl.RG, gl.FLOAT, field.data);
          gl.activeTexture(gl.TEXTURE0);
          gl.uniform2f(U('uDispSize'), field.cols * field.cell, field.rows * field.cell);
          f('uDispDots', Math.max(0, Math.min(1, cfg.cursorDots)));
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return { w, h, bleed: B };
      },
      dispose() { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); },
    };
  }

  // draws a band onto a canvas: WebGL when the browser has it, otherwise the slower mask() path
  function renderer(canvas) {
    let r = null;
    try { r = glRenderer(canvas); } catch (e) { console.warn('Halftone: WebGL failed, drawing without it.', e); r = null; }
    return r || {
      gpu: false,
      draw(cfg, width, dpr, from, to) { const m = mask(cfg, width, dpr); paint(canvas, m, from, to); return m; },
      dispose() {},
    };
  }

  /* ---- Cursor: the pointer stirs the air and the dots ride it ----
     A vortex method. As the pointer moves it sheds pairs of counter-rotating vortices either
     side of its path, the way a hand moving through smoke does. Their combined flow can't bunch
     up or thin out, pushes the air along the stroke, and dies away quickly with distance. The
     vortices drift on each other's flow, so pairs curl and roll into wisps, and they weaken and
     spread as they age. The dots follow a displacement field that the flow carries along and that
     relaxes back to zero, so the band heals once the air settles.
     Coordinates are the band's own px (the canvas's CSS size at zoom 1). */
  const stirs = new Set();
  let listening = false;
  function listen() {
    if (listening || typeof addEventListener !== 'function') return;
    listening = true;
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      stirs.forEach(s => s.move(e.clientX, e.clientY, e.timeStamp));
    }, { passive: true });
    // the page moving under a still pointer isn't a stroke
    const lift = () => stirs.forEach(s => s.lift());
    addEventListener('scroll', lift, { passive: true, capture: true });
    addEventListener('blur', lift);
    document.addEventListener('pointerleave', lift);
  }

  function stir(canvas, CELL = 10) {
    let cols = 0, rows = 0, n = 0, W = 0, Hc = 0;
    let vx, vy, dx, dy, bx, by;
    let prev = null, carry = 0, live = false;
    const strokes = [], vortices = [];
    const self = { data: null, cols: 0, rows: 0, cell: CELL };

    function resize(width, height) {
      W = width; Hc = height;
      const c = Math.ceil(width / CELL) + 1, r = Math.ceil(height / CELL) + 1;
      if (c === cols && r === rows) return;
      cols = self.cols = c; rows = self.rows = r; n = c * r;
      [vx, vy, dx, dy, bx, by] = Array.from({ length: 6 }, () => new Float32Array(n));
      self.data = new Float32Array(n * 2);
      vortices.length = 0; live = false;
    }
    function move(clientX, clientY, time) {
      if (!n) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (clientX - rect.left) * W / rect.width, y = (clientY - rect.top) * Hc / rect.height;
      if (x < -80 || x > W + 80 || y < -80 || y > Hc + 80) { prev = null; return; }
      if (prev) {
        const dt = (time - prev.t) / 1000;
        if (dt > 0.0005 && dt < 0.12) strokes.push({ x0: prev.x, y0: prev.y, x1: x, y1: y, dt });
      }
      prev = { x, y, t: time };
    }
    // flow at (x, y) from every vortex: Lamb-Oseen cores, so nothing blows up near a centre
    function flow(x, y, skip) {
      let u = 0, v = 0;
      for (const w of vortices) {
        if (w === skip) continue;
        const ex = x - w.x, ey = y - w.y, r2 = ex * ex + ey * ey;
        if (r2 > w.reach2 || r2 < 1e-6) continue;
        const f = w.g * (1 - Math.exp(-r2 / w.s2)) / (2 * Math.PI * r2) * w.taper(r2);
        u -= f * ey; v += f * ex;
      }
      return [u, v];
    }
    function vortex(x, y, g, s) {
      const s2 = s * s, reach2 = s2 * 49;   // ignored beyond 7 core radii
      return { x, y, g, g0: Math.abs(g), s2, reach2, taper: r2 => r2 < reach2 * 0.5 ? 1 : 2 - 2 * r2 / reach2 };
    }

    // advance by dt seconds. Returns false once everything has settled (nothing to draw)
    function step(dt, cfg) {
      if (!n || (!live && !strokes.length)) return false;
      dt = Math.min(Math.max(dt, 1 / 240), 1 / 30);
      const R = Math.max(4, cfg.cursorRadius), a = R * 0.55, gap = R * 0.45;
      const core = R * 0.42 / (0.6 + 0.4 * Math.max(0, cfg.cursorSwirl));

      // 1. shed vortex pairs along each stroke: one pair every `gap` px of travel. Each pair's
      //    strength makes the air between them move at the pointer's speed (times force)
      for (const st of strokes) {
        const lx = st.x1 - st.x0, ly = st.y1 - st.y0, len = Math.hypot(lx, ly);
        if (len < 0.5) continue;
        const ux = lx / len, uy = ly / len, speed = Math.min(len / st.dt, 3500);
        const g = cfg.cursorForce * speed * gap;
        let d = gap - carry;
        for (; d <= len; d += gap) {
          const px = st.x0 + ux * d, py = st.y0 + uy * d;
          // a little unevenness between the two, more with swirl, so pairs veer and roll up
          const tilt = 1 + (Math.random() - 0.5) * 0.7 * cfg.cursorSwirl;
          const jit = (Math.random() - 0.5) * a * 0.3;
          vortices.push(vortex(px - uy * (a + jit), py + ux * (a + jit), g * tilt, core));
          vortices.push(vortex(px + uy * (a - jit), py - ux * (a - jit), -g / tilt, core));
        }
        carry = len - (d - gap);
      }
      strokes.length = 0;
      if (vortices.length > 320) vortices.splice(0, vortices.length - 320);

      // 2. vortices drift on each other's flow, weaken, and spread
      const fade = Math.exp(-dt / Math.max(0.05, cfg.cursorDrag)), spread = R * R * 0.12 * dt;
      const moves = vortices.map(w => flow(w.x, w.y, w));
      vortices.forEach((w, i) => {
        w.x += moves[i][0] * dt; w.y += moves[i][1] * dt;
        w.g *= fade; w.s2 += spread; w.reach2 = w.s2 * 49;
      });
      for (let i = vortices.length - 1; i >= 0; i--) if (Math.abs(vortices[i].g) < vortices[i].g0 * 0.03) vortices.splice(i, 1);

      // 3. the air at every cell, then carry the displacement along it (semi-Lagrangian) while
      //    it relaxes back to zero
      vx.fill(0); vy.fill(0);
      for (const w of vortices) {
        const rc = Math.sqrt(w.reach2);
        const i0 = Math.max(0, Math.floor((w.x - rc) / CELL)), i1 = Math.min(cols - 1, Math.ceil((w.x + rc) / CELL));
        const j0 = Math.max(0, Math.floor((w.y - rc) / CELL)), j1 = Math.min(rows - 1, Math.ceil((w.y + rc) / CELL));
        for (let j = j0; j <= j1; j++) {
          const ey = (j + 0.5) * CELL - w.y;
          for (let i = i0; i <= i1; i++) {
            const ex = (i + 0.5) * CELL - w.x, r2 = ex * ex + ey * ey;
            if (r2 > w.reach2 || r2 < 1e-6) continue;
            const f = w.g * (1 - Math.exp(-r2 / w.s2)) / (2 * Math.PI * r2) * w.taper(r2), c = j * cols + i;
            vx[c] -= f * ey; vy[c] += f * ex;
          }
        }
      }
      const heal = Math.exp(-dt / Math.max(0.1, cfg.cursorHeal)), sc = dt / CELL;
      let most = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const c = j * cols + i;
        let ex = dx[c], ey = dy[c];
        if (vx[c] || vy[c]) {
          const fi = i - vx[c] * sc, fj = j - vy[c] * sc;
          ex = sample(dx, fi, fj) + vx[c] * dt; ey = sample(dy, fi, fj) + vy[c] * dt;
        }
        ex *= heal; ey *= heal;
        const m = Math.hypot(ex, ey);
        if (m > 150) { ex *= 150 / m; ey *= 150 / m; }
        bx[c] = ex; by[c] = ey;
        if (m > most) most = m;
      }
      [dx, bx] = [bx, dx]; [dy, by] = [by, dy];
      for (let c = 0; c < n; c++) { self.data[2 * c] = dx[c]; self.data[2 * c + 1] = dy[c]; }
      live = vortices.length > 0 || most > 0.15;
      if (!live) { dx.fill(0); dy.fill(0); self.data.fill(0); }
      return live;
    }
    // bilinear sample of a grid at cell coordinates (i, j)
    function sample(f, i, j) {
      i = Math.max(0, Math.min(cols - 1.001, i)); j = Math.max(0, Math.min(rows - 1.001, j));
      const i0 = i | 0, j0 = j | 0, fx = i - i0, fy = j - j0, k = j0 * cols + i0;
      const top = f[k] + (f[k + 1] - f[k]) * fx, bottom = f[k + cols] + (f[k + cols + 1] - f[k + cols]) * fx;
      return top + (bottom - top) * fy;
    }

    Object.assign(self, {
      resize, move, step,
      lift() { prev = null; carry = 0; },
      dispose() { stirs.delete(self); },
    });
    stirs.add(self);
    listen();
    return self;
  }

  // runs the bands: draws a frame whenever the band animates or the cursor has stirred it.
  // items: [{ canvas, r: renderer, from, to }]. opts: width(), dpr(), visible(item), onFrame()
  function play(items, input, opts) {
    const cfg = { ...DEFAULTS, ...input };
    const moving = moves(cfg);
    if (!items.length || !items.every(item => item.r.gpu) || (!moving && !cfg.cursor)) return null;
    if (cfg.cursor) items.forEach(item => { if (!item.stir) item.stir = stir(item.canvas); });
    const tall = cfg.height + bleed(cfg) * 2, still = at(cfg, 0);
    const visible = opts.visible || (() => true);
    const gap = 1000 / Math.max(1, cfg.animFps) - 1, t0 = performance.now();
    let raf = 0, last = 0, stopped = false;
    function tick(now) {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (typeof document !== 'undefined' && document.hidden) { last = 0; return; }
      if (last && now - last < gap) return;
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const frame = moving ? at(cfg, (now - t0) / 1000) : still, W = opts.width(), dpr = opts.dpr();
      let drew = false;
      items.forEach(item => {
        if (!visible(item)) return;
        let stirring = false;
        if (cfg.cursor && item.stir) { item.stir.resize(W, tall); stirring = item.stir.step(dt, cfg); }
        if (moving || stirring || item.dirty) {
          item.r.draw(frame, W, dpr, item.from, item.to, stirring ? item.stir : null);
          item.dirty = stirring;   // one clean frame after the stirring settles
          drew = true;
        }
      });
      if (opts.onFrame) opts.onFrame(drew);
    }
    raf = requestAnimationFrame(tick);
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  }

  /* ---- Site: one canvas per band, spanning the window, redrawn when the width changes ---- */
  // options.autostart: false holds the animation until start() is called
  function mount(sections, config, options = {}) {
    const cfg = { ...DEFAULTS, ...config };
    const root = document.documentElement;
    // how far the canvas reaches either side of the section edge; styles.css spaces content by it
    const reach = cfg.height / 2 + bleed(cfg);
    root.style.setProperty('--halftone-reach', reach + 'px');
    // how high the dots realistically climb above the edge; styles.css keeps "Recent Work" above it
    root.style.setProperty('--halftone-peak', peak(cfg) + 'px');
    // where the transition starts above the section edge and finishes below it, before distortion
    root.style.setProperty('--halftone-above', Math.max(0, (0.5 - cfg.start) * cfg.height) + 'px');
    root.style.setProperty('--halftone-below', Math.max(0, (cfg.end - 0.5) * cfg.height) + 'px');
    const items = [...sections].map(section => {
      const canvas = document.createElement('canvas');
      canvas.className = 'halftone';
      canvas.setAttribute('aria-hidden', 'true');
      section.prepend(canvas);
      section.classList.add('has-halftone');
      return { section, canvas, r: renderer(canvas) };
    });
    // animated bands only redraw while they're on screen
    const visible = new Set();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      entries.forEach(e => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    }, { rootMargin: '100px' }) : null;
    if (io) items.forEach(item => io.observe(item.canvas));
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    let W = 0, timer = 0, anim = null;
    function draw() {
      if (root.clientWidth === W) return;
      W = root.clientWidth;
      items.forEach(item => {
        const { section, canvas } = item;
        const cs = getComputedStyle(section);
        item.from = rgb(cs.getPropertyValue('--band-from'), section);
        item.to = rgb(cs.getPropertyValue('--band-to'), section);
        item.r.draw(at(cfg, 0), W, dpr(), item.from, item.to);
        canvas.style.width = W + 'px';
        canvas.style.height = reach * 2 + 'px';
        canvas.style.top = -reach + 'px';
        canvas.style.left = -section.getBoundingClientRect().left + 'px';
      });
      run();
    }
    let started = options.autostart !== false;
    function run() {
      if (anim) { anim.stop(); anim = null; }
      // animation and the cursor need WebGL: without it the band stays still
      if (!started || still) return;
      anim = play(items, cfg, { width: () => W, dpr, visible: item => !io || visible.has(item.canvas) });
    }
    draw();
    addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });
    return {
      redraw() { W = 0; draw(); },
      start() { if (!started) { started = true; run(); } },
    };
  }

  (typeof window !== 'undefined' ? window : self).Halftone = { DEFAULTS, bleed, peak, mask, paint, rgb, activeConfig, mount, at, animate, moves, renderer, stir, play };
})();
