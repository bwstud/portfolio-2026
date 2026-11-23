/* Kardashev — the zoom. One canvas, one number: z, the log of the frame's width in metres (the shorter side of the
   open stage). Plates are drawn at their own scale and nested like the Eameses' photographs; the camera's centre is
   handed from the fire, to the Sun, to the middle of the galaxy as the frame grows, so the numbers never need more
   precision than the frame they are seen in. */
import { PLATES, NODES } from './plates.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/* Power and frame width travel together: each stop pairs a frame (log m) with the power that lives at that scale
   (log W). Between stops both move linearly in log space. */
export const STOPS = [
  { z: -0.6, p: 0 },                                    // the floor: a watt
  { z: 0.55, p: 2, name: 'a person' },                  // 100 W
  { z: 1.7, p: 3.36, name: 'one person\u2019s share' }, // about 2.3 kW
  { z: 3.5, p: 7.0, name: 'a town of 5,000' },          // about 10 MW
  { z: 5.0, p: 9.4, name: 'a city of a million' },      // about 2.3 GW
  { z: 7.25, p: 13.27, name: 'all of humanity' },       // 18.8 TW, 2024
  { z: 7.45, p: 16 },                                   // Type I (Sagan): 10¹⁶ W
  { z: 7.6, p: 17.24 },                                 // all the sunlight that reaches Earth
  { z: 11.7, p: 26.58, name: 'the Sun' },               // 3.83 × 10²⁶ W (Type II)
  { z: 21.1, p: 36.6, name: 'the Milky Way' },          // about 4 × 10³⁶ W (Type III is 10³⁶)
];
export function powerAt(z) {
  if (z <= STOPS[0].z) return STOPS[0].p + (z - STOPS[0].z) * 1.7;
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1], b = STOPS[i];
    if (z <= b.z) return a.p + (z - a.z) / (b.z - a.z) * (b.p - a.p);
  }
  return STOPS[STOPS.length - 1].p;
}
export function zAt(p) {
  if (p <= STOPS[0].p) return STOPS[0].z + (p - STOPS[0].p) / 1.7;
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1], b = STOPS[i];
    if (p <= b.p) return a.z + (p - a.p) / (b.p - a.p) * (b.z - a.z);
  }
  return STOPS[STOPS.length - 1].z;
}
export const Z_MIN = -0.6, Z_MAX = 21.4;

export function createZoom(canvas, assets) {
  const g = canvas.getContext('2d');
  const view = {
    z: 0.55, phase: 0.5, lit: 1,          // phase: 0 = the Sun behind the viewer (full day), 1 = behind the Earth (night)
    stage: { cx: 0, cy: 0, side: 600, w: 800, h: 600 },
    dpr: 1, t: 0, overlays: [], state: {},
  };
  let tween = null;
  const listeners = new Set();

  function resize(stage) {
    view.dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * view.dpr); canvas.height = Math.round(h * view.dpr);
    view.stage = { ...stage, w, h };
  }

  /* Where a node's origin sits relative to the camera's centre, in metres. */
  function nodeOffset(node, z) {
    const s1 = smooth(9.4, 12.0, z), s2 = smooth(17.4, 20.4, z);
    const sun = NODES.sun, gal = NODES.gal;
    const C = [s1 * sun[0] + s2 * gal[0], s1 * sun[1] + s2 * gal[1]];
    if (node === 'earth') return [-C[0], -C[1]];
    if (node === 'sun') return [sun[0] * (1 - s1) - s2 * gal[0], sun[1] * (1 - s1) - s2 * gal[1]];
    return [sun[0] * (1 - s1) + gal[0] * (1 - s2), sun[1] * (1 - s1) + gal[1] * (1 - s2)];
  }

  function frame(dt) {
    view.t += dt;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.d);
      const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      view.z = tween.from + (tween.to - tween.from) * k;
      if (tween.t >= 1) { const done = tween.done; tween = null; done && done(); }
      listeners.forEach(f => f(view.z));
    }
    draw();
  }

  function draw() {
    const { w, h, cx, cy, side } = view.stage, r = view.dpr;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#03060c';
    g.fillRect(0, 0, w, h);
    const ppm = side / Math.pow(10, view.z);      // pixels per metre
    const diag = Math.hypot(w, h);
    // biggest first, so the smaller plates sit on top, like prints laid on prints
    for (let i = PLATES.length - 1; i >= 0; i--) {
      const P = PLATES[i];
      const px = P.size * ppm;
      const maxPx = P.maxPx ?? diag * 60, minPx = P.minPx ?? 6;
      if (px < minPx || px > maxPx) continue;
      let a = smooth(minPx, minPx * 3, px) * (maxPx === Infinity ? 1 : 1 - smooth(maxPx / 4, maxPx, px));
      if (a <= 0.003) continue;
      const o = nodeOffset(P.node, view.z);
      const ox = cx + (o[0] + (P.at ? P.at[0] : 0)) * ppm, oy = cy + (o[1] + (P.at ? P.at[1] : 0)) * ppm;
      // skip if wholly off screen
      const half = px * (P.extent ?? 0.5);
      if (ox + half < -50 || ox - half > w + 50 || oy + half < -50 || oy - half > h + 50) continue;
      g.save();
      g.globalAlpha = a;
      P.draw(g, { ox, oy, ppm, px, alpha: a, view, assets, w, h });
      g.restore();
    }
    for (const o of view.overlays) {
      const off = nodeOffset(o.node || 'earth', view.z);
      g.save();
      o.draw(g, { ox: cx + off[0] * ppm, oy: cy + off[1] * ppm, ppm, view, w, h });
      g.restore();
    }
  }

  function toScreen(node, x, y) {
    const ppm = view.stage.side / Math.pow(10, view.z), o = nodeOffset(node, view.z);
    return [view.stage.cx + (o[0] + x) * ppm, view.stage.cy + (o[1] + y) * ppm];
  }
  function fromScreen(node, sx, sy) {
    const ppm = view.stage.side / Math.pow(10, view.z), o = nodeOffset(node, view.z);
    return [(sx - view.stage.cx) / ppm - o[0], (sy - view.stage.cy) / ppm - o[1]];
  }

  return {
    view, resize, frame, draw, toScreen, fromScreen,
    get z() { return view.z; },
    set z(v) { tween = null; view.z = Math.min(Z_MAX, Math.max(Z_MIN, v)); listeners.forEach(f => f(view.z)); },
    get moving() { return !!tween; },
    /* Fly to a frame. The pace is set in orders of magnitude per second, like the film's ten seconds a power. */
    fly(to, { perOrder = 0.42, min = 0.9, max = 7, done } = {}) {
      to = Math.min(Z_MAX, Math.max(Z_MIN, to));
      const d = Math.min(max, Math.max(min, Math.abs(to - view.z) * perOrder));
      if (reduced.matches) { view.z = to; tween = null; listeners.forEach(f => f(view.z)); done && done(); return; }
      tween = { from: view.z, to, t: 0, d, done };
    },
    stop() { tween = null; },
    onZ(f) { listeners.add(f); return () => listeners.delete(f); },
  };
}
