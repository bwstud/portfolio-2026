/* Raptor Run: the ground painter. The forest floor, the title set across it, a footprint and a
   dust puff. The creatures come from art/ (painted cut-outs) or sculpt.js and creatures.js. */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.pick = (l) => l[Math.floor(f() * l.length)];
  f.chance = (p) => f() < p;
  return f;
}

// smooth value noise and fbm, seeded
function noiseField(seed) {
  const r = rng(seed);
  const N = 256, perm = new Uint8Array(N * 2), val = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = r(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const at = (x, y) => val[perm[(perm[x & 255] + y) & 511]];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  n.fbm = (x, y, o = 4) => { let a = 0, w = 0.5, s = 0; for (let i = 0; i < o; i++) { a += n(x, y) * w; s += w; x *= 2.03; y *= 2.03; w *= 0.5; } return a / s; };
  return n;
}

/* ---------- colour ---------- */
const rgb = (c, a = 1) => `rgba(${clamp(c[0] | 0, 0, 255)},${clamp(c[1] | 0, 0, 255)},${clamp(c[2] | 0, 0, 255)},${a})`;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* ---------- the ground ---------- */
// A flat field, the way the koi page lays its fish on one bold colour: deep moss, painted with
// large soft value shifts and a fine tooth, and the title set huge across it so the shadows
// run over the type.
export function paintGround(w, h, dpr, seed, title) {
  const r = rng(seed), nz = noiseField(seed + 11);
  const c = canvas(Math.round(w * dpr), Math.round(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#2d5b3a'; g.fillRect(0, 0, w, h);
  // broad soft value shifts, like a wet wash
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, rad = r.range(120, 420);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() < 0.5 ? [24, 52, 34] : [70, 104, 60];
    gr.addColorStop(0, rgb(tone, r.range(0.08, 0.2))); gr.addColorStop(1, rgb(tone, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // the title, huge, in bone
  if (title) {
    const size = Math.min(w * (w < h ? 0.25 : 0.16), h * 0.3);
    g.save();
    g.font = `600 ${size}px "Söhne Breit", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(232,224,203,0.9)';
    const lines = title.split('\n');
    lines.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 0.98));
    g.restore();
  }
  // tooth: a fine grain and the odd fleck of litter, all low contrast
  const id = g.getImageData(0, 0, c.width, c.height), px = id.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const n = nz.fbm(x / dpr * 0.012, y / dpr * 0.012, 3) - 0.5;
      const k = 1 + n * 0.22 + (r() - 0.5) * 0.07;
      px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
    }
  }
  g.putImageData(id, 0, 0);
  for (let i = 0; i < (w * h) / 2500; i++) {
    const x = r() * w, y = r() * h;
    g.fillStyle = r() < 0.5 ? 'rgba(18,34,22,0.35)' : 'rgba(120,128,82,0.18)';
    g.save(); g.translate(x, y); g.rotate(r() * TAU);
    g.beginPath(); g.ellipse(0, 0, r.range(1.5, 4.5), r.range(0.6, 1.6), 0, 0, TAU); g.fill();
    g.restore();
  }
  return c;
}

// a three-toed print with a dragged sickle mark, and a soft dust puff
export function paintPrint() {
  // pressed toe pads in a row along each toe, a heel pad, the sickle claw's little nick; blurred soft
  const c = canvas(128, 96), g = c.getContext('2d');
  g.filter = 'blur(2.2px)';
  g.translate(18, 48);
  g.fillStyle = 'rgba(0,0,0,0.9)';
  for (const [ang, len, w] of [[0.36, 54, 6.5], [0.0, 74, 7.5], [-0.36, 50, 6.5]]) {
    for (let t = 0.3; t <= 1.001; t += 0.23) {
      g.beginPath(); g.ellipse(Math.cos(ang) * len * t, Math.sin(ang) * len * t, w * 1.05, w * 0.85, ang, 0, TAU); g.fill();
    }
  }
  g.beginPath(); g.ellipse(4, 0, 10, 11, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(20, -20, 4, 2.5, -0.4, 0, TAU); g.fill();
  return c;
}
export function paintPuff() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
