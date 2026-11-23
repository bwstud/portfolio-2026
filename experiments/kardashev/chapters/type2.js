/* 5 · Type II — a swarm of collectors around the Sun, at Earth's distance. The star dims; the swarm, warmed to room
   temperature, glows in the infrared instead. The spectrum shows both, with the energy conserved. */
import { AU, glow } from '../plates.js';
import { SUN, PEOPLE, TYPE, kOf, watts, supHTML } from '../data.js';

const TAU = Math.PI * 2;
const T_SUN = 5772, T_SWARM = 300;          // K: the Sun's surface; a collector at 1 AU shedding its heat both ways is ~ 280–390 K
const MERCURY_FOIL_MM = 0.22;               // all of Mercury, spread over a sphere at 1 AU (mean density 5.43 g/cm³)

/* The shape of a blackbody per log-wavelength, normalised to unit luminosity: (15/π⁴) x⁴ / (eˣ − 1), x = hc/λkT. */
const shape = (lambdaMicron, T) => { const x = 14388 / (lambdaMicron * T); return x > 700 ? 0 : (15 / Math.PI ** 4) * x ** 4 / Math.expm1(x); };

export default {
  id: 'type2',
  name: 'Type II',
  p: 26,
  view: { z: 11.55, phase: 0.5 },
  chordRoot: 392.0,
  title: 'Type II: a star that goes dark',
  prose: `<p>Type II is a star's whole output, <b>10<sup>26</sup> watts</b>. Our Sun makes 3.8 × 10<sup>26</sup>. Shared out, each of us would have about <b>five Type I planets</b> of power.</p>
    <p>In 1960 Freeman Dyson pointed out that a civilization that size would have to surround its star with collectors. Not a solid shell, which would tear itself apart, but a <b>swarm</b> of separate panels, each in its own orbit. Here they orbit at Earth's distance, which is one way to show how far that is.</p>`,
  predict: {
    question: 'Take all of Mercury and spread it as foil around the Sun, at Earth’s distance. How thick is the foil?',
    options: ['About 2 kilometres', 'About 2 metres', 'About 0.2 millimetres'],
    answer: 2,
    reveal: `<p>About <b>0.2 millimetres</b>, a few sheets of paper. A sphere at Earth's distance has 280 million million million square metres of surface, and even a planet doesn't go far over that. Dyson's own sums used Jupiter, for a shell a few metres thick.</p>`,
  },
  goals: [
    { id: 'one', text: 'Cover 1% of the sky around the Sun' },
    { id: 'ir', text: 'Look at the swarm in the infrared' },
    { id: 'full', text: 'Close the swarm and become Type II' },
  ],
  storyTitle: 'Looking for swarms',
  story: `<p>Dyson's 1960 paper in <i>Science</i> was called "Search for Artificial Stellar Sources of Infrared Radiation". Its point was the search: energy can't be destroyed, so a swarm must re-radiate what it catches as heat, at a few hundred kelvin. A star with too much infrared for its type is worth a look.</p>
    <p>Project Hephaistos (Suazo and colleagues, 2024) screened about <b>five million</b> stars from the Gaia, 2MASS and WISE surveys and kept <b>seven</b> odd ones, all small red dwarfs. Later work showed that background galaxies can mimic the infrared excess, and has found them behind some of the seven. None is a confirmed swarm.</p>
    <p>Mining Mercury for a swarm was worked through by Stuart Armstrong and Anders Sandberg (2013). The foil figure assumes Mercury's average density.</p>`,

  enter(ctx) {
    const s = this.s = { f: 0.0001, ir: false, t: 0 };
    const { ui } = ctx;
    const g = ui.group('Swarm');
    s.fc = ui.fader(g, { label: 'Sky around the Sun covered', unit: '%', min: 0.0001, max: 100, value: s.f * 100, log: true, digits: 2, onInput: v => { s.f = v / 100; this.update(ctx); } });
    s.view = ui.seg(g, { label: 'Look in', options: [{ label: 'Visible light', value: 'vis' }, { label: 'Infrared', value: 'ir' }], value: 'vis', onChange: v => { s.ir = v === 'ir'; this.update(ctx); } });
    s.read = ui.readouts(g, [{ id: 'power', label: 'Power caught' }, { id: 'k', label: 'Kardashev' }, { id: 'each', label: 'Each person' }, { id: 'mass', label: 'Material, as foil' }]);
    const g2 = ui.group('The star’s light, by wavelength');
    s.plot = ui.canvas(g2, { height: 150, label: 'Spectrum: the Sun’s light peaking in the visible, and the swarm’s heat peaking near 10 micrometres, the two summing to the Sun’s output', onResize: () => this.s && this.drawPlot() });
    ui.note(g2, 'Equal areas are equal power. Whatever the swarm takes from the star’s light comes back out as heat.');
    // collectors: a thin band around Earth's orbit, each on its own circular orbit
    const N = 4000;
    s.col = Array.from({ length: N }, (_, i) => ({ a: AU * (0.96 + 0.08 * Math.random()), th: Math.random() * TAU, inc: (Math.random() - 0.5) * 0.9, k: i / N }));
    ctx.overlay({ node: 'sun', draw: (gg, o) => this.draw(gg, o) });
    this.update(ctx);
  },
  update(ctx) {
    const s = this.s, P = s.f * SUN, K = kOf(Math.max(P, 1));
    s.read.set('power', supHTML(watts(P)));
    s.read.set('k', K.toFixed(2));
    const typeIs = P / PEOPLE / TYPE[1];
    s.read.set('each', typeIs >= 1 ? `${typeIs.toFixed(1)} Type I planets` : `${(typeIs * 100).toFixed(typeIs < 0.1 ? 1 : 0)}% of a Type I planet`);
    s.read.set('mass', s.f >= 0.01 ? `${(s.f).toFixed(2)} Mercury, 0.2 mm thick` : `${(s.f * 3.3e23 / 7.35e22).toFixed(4)} Moons, 0.2 mm thick`);
    ctx.view.state.swarm = s.f;
    ctx.view.state.infrared = s.ir ? 1 : 0;
    ctx.setLive(P);
    const at = () => ctx.zoom.toScreen('sun', AU * 0.71, -AU * 0.71);
    if (s.f >= 0.01) ctx.goal('one', at);
    if (s.ir && s.f >= 0.01) ctx.goal('ir', at);
    if (s.f >= 0.999) ctx.goal('full', () => ctx.zoom.toScreen('sun', 0, 0));
    this.drawPlot();
  },
  frame(ctx, dt) { const s = this.s; s.t += dt; if (s.flare != null) { s.flare += dt; if (s.flare > 3) s.flare = null; } },
  reward() { this.s.flare = 0; },
  draw(g, { ox, oy, ppm, view, w, h }) {
    const s = this.s, n = Math.round(Math.min(s.col.length, Math.max(24, s.f * s.col.length)));   // the dots are the coverage, honestly counted
    const ir = s.ir;
    if (ir || s.flare != null) {
      // in the infrared the swarm is the bright thing: a warm ring, brighter as it closes
      g.globalCompositeOperation = 'lighter';
      const R = AU * ppm, a = Math.min(1, 0.08 + Math.sqrt(s.f) * 1.2) * (1 + (s.flare != null ? 0.8 * Math.sin(Math.min(1, s.flare / 3) * Math.PI) : 0));
      const grd = g.createRadialGradient(ox, oy, R * 0.86, ox, oy, R * 1.14);
      grd.addColorStop(0, 'rgba(255,90,40,0)'); grd.addColorStop(0.5, `rgba(255,110,50,${0.5 * a})`); grd.addColorStop(1, 'rgba(255,90,40,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(ox, oy, R * 1.14, 0, TAU); g.arc(ox, oy, R * 0.86, 0, TAU, true); g.fill();
      // and the star, dim and red: only its own infrared tail remains
      glow(g, ox, oy, 14, `rgba(255,120,70,${0.5 * (1 - s.f)})`);
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = ir ? 'rgba(255,150,90,0.95)' : 'rgba(224,138,60,0.9)';
    const sz = Math.max(1.2, Math.min(3, 1e9 * ppm));
    for (let i = 0; i < n; i++) {
      const c = s.col[i];
      const th = c.th + view.t * 0.05 * Math.pow(AU / c.a, 1.5);    // a year in about two minutes, inner ones faster
      const x = ox + Math.cos(th) * c.a * ppm, y = oy + Math.sin(th) * c.a * ppm * (1 - Math.abs(c.inc) * 0.06);
      if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
      g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
  },
  drawPlot() {
    const s = this.s, c = s.plot, g = c.g, w = c.w, h = c.h;
    g.clearRect(0, 0, w, h);
    const pad = { l: 10, r: 10, t: 12, b: 22 }, L0 = Math.log10(0.1), L1 = Math.log10(100);
    const X = l => pad.l + (Math.log10(l) - L0) / (L1 - L0) * (w - pad.l - pad.r);
    const ymax = 0.85;
    const Y = v => h - pad.b - v / ymax * (h - pad.t - pad.b);
    // the visible band
    g.fillStyle = 'rgba(236,230,216,0.06)'; g.fillRect(X(0.38), pad.t, X(0.75) - X(0.38), h - pad.t - pad.b);
    g.font = '10px "Söhne Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.fillStyle = 'rgba(236,230,216,0.45)';
    for (const l of [0.1, 1, 10, 100]) g.fillText(`${l} µm`, Math.min(w - 22, Math.max(18, X(l))), h - 7);
    g.fillText('visible', (X(0.38) + X(0.75)) / 2, pad.t + 2);
    const curve = (fn, style, width, fill) => {
      g.beginPath();
      for (let i = 0; i <= 200; i++) { const l = Math.pow(10, L0 + (L1 - L0) * i / 200); const y = Y(fn(l)); i ? g.lineTo(X(l), y) : g.moveTo(X(l), y); }
      if (fill) { g.lineTo(X(100), Y(0)); g.lineTo(X(0.1), Y(0)); g.closePath(); g.fillStyle = fill; g.fill(); }
      else { g.strokeStyle = style; g.lineWidth = width; g.stroke(); }
    };
    const star = l => (1 - s.f) * shape(l, T_SUN), swarm = l => s.f * shape(l, T_SWARM);
    curve(swarm, null, 0, 'rgba(255,110,50,0.35)');
    curve(star, null, 0, 'rgba(255,214,150,0.22)');
    curve(l => star(l) + swarm(l), '#ece6d8', 1.3);
  },
  exit(ctx) { ctx.view.state.swarm = 0; ctx.view.state.infrared = 0; },
  finale() {
    return 'Wrap the Sun and it doesn’t vanish: it glows like a warm room, at about ten micrometres. That’s the signature astronomers look for. Of five million stars searched, seven looked odd, and <b>none is confirmed</b>.';
  },
};
