/* Powers of Watts — the halftone. The world is a field (what is at this point, and how much of it), sampled by a
   regular dot screen locked to the world. The screen's pitch halves every time the zoom doubles: the new dots grow in
   between the old ones, so at every scale the picture is the same few-pixel dots, and zooming never shows a seam.
   A dot's area is its value, as in print. */

export function hash(i, j) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* Smooth value noise, about 0..1. */
export function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y) { return noise(x, y) * 0.55 + noise(x * 2.03 + 7.1, y * 2.03 - 3.3) * 0.3 + noise(x * 4.1 - 2, y * 4.1 + 5) * 0.15; }

const BASE = 1e-3;                 // the finest pitch, in metres (only the fire's plate ever gets near it)
const out = { v: 0 };

/* palette: [{ fill, add }] indexed by the category a field returns (0 = nothing). S: the pitch, in pixels, at which a
   level is fully grown; new dots start growing at S / 2. R: the field's radius (metres), to skip the empty sky. */
export function halftone(g, { ox, oy, ppm, w, h, field, palette, S = 12, R = Infinity, round = true, clip = null, jitter = 0 }) {
  const Lf = Math.ceil(Math.log2((S / 2) / (ppm * BASE)));
  const sF = BASE * Math.pow(2, Lf), sFpx = sF * ppm;
  const a = Math.min(1, Math.max(0, (sFpx - S / 2) / (S / 2)));
  const rEven = 0.47 * (2 * sFpx + (sFpx - 2 * sFpx) * a), rOdd = 0.47 * sFpx * a;
  const L = clip ? clip.l : 0, Rt = clip ? clip.r : w, Tp = clip ? clip.t : 0, Bt = clip ? clip.b : h;   // only the open stage: the card and panel are opaque
  let x0 = (L - ox) / ppm, x1 = (Rt - ox) / ppm, y0 = (Tp - oy) / ppm, y1 = (Bt - oy) / ppm;
  if (R < Infinity) { x0 = Math.max(x0, -R); x1 = Math.min(x1, R); y0 = Math.max(y0, -R); y1 = Math.min(y1, R); }
  if (x0 > x1 || y0 > y1) return 0;
  const i0 = Math.ceil(x0 / sF), i1 = Math.floor(x1 / sF), j0 = Math.ceil(y0 / sF), j1 = Math.floor(y1 / sF);
  if ((i1 - i0) * (j1 - j0) > 250000) return 0;
  const buckets = palette.map(() => []);
  const R2 = R * R, sEven = sF * (2 - a);
  for (let j = j0; j <= j1; j++) {
    const y = j * sF, py = oy + y * ppm, evenJ = (j & 1) === 0;
    for (let i = i0; i <= i1; i++) {
      const x = i * sF;
      if (x * x + y * y > R2) continue;
      const even = evenJ && (i & 1) === 0;
      if (!even && a <= 0.02) continue;
      const c = field(x, y, even ? sEven : sF, out, i, j);
      if (!c) continue;
      const r = (even ? rEven : rOdd) * Math.sqrt(Math.min(1, out.v));
      if (r < 0.3) continue;
      const b = buckets[c];
      if (jitter) { const jx = hash(i * 3 + 1, j * 5 + 2) - 0.5, jy = hash(i * 7 + 4, j * 2 + 9) - 0.5; b.push(ox + x * ppm + jx * jitter * sFpx, py + jy * jitter * sFpx, r); }
      else b.push(ox + x * ppm, py, r);
    }
  }
  let n = 0;
  for (let c = 1; c < palette.length; c++) {
    const b = buckets[c];
    if (!b || !b.length) continue;
    const P = palette[c];
    g.globalCompositeOperation = P.add ? 'lighter' : 'source-over';
    g.fillStyle = P.fill;
    g.beginPath();
    for (let k = 0; k < b.length; k += 3) {
      const x = b[k], y = b[k + 1], r = b[k + 2];
      if (round && r > 1.1) { g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832); }
      else g.rect(x - r, y - r, r * 2, r * 2);
    }
    g.fill();
    n += b.length / 3;
  }
  g.globalCompositeOperation = 'source-over';
  return n;
}
