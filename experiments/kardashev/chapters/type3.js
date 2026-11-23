/* 6 · Type III — a galaxy's power, and the speed limit on getting it. Ships hop star to star, stopping to build the
   next ships; the front spreads at hop ÷ (hop/speed + pause), however hungry the people behind it are. */
import { NODES, LY, rng } from '../plates.js';
import { MILKY_WAY, PEOPLE, years } from '../data.js';

const TAU = Math.PI * 2;
const HOP = 7;                     // light years between neighbouring stars, roughly
const FAR = 76000;                 // light years from the Sun to the far edge of the disc (26,000 to the centre, 50,000 beyond)
const SAPIENS = 300000, GALAXY_AGE = 13.6e9;
const DURATION = 8;                // seconds the animation takes to fill the disc, whatever the real time

export default {
  id: 'type3',
  name: 'Type III',
  p: 36,
  view: { z: 21.02, phase: 0.5 },
  chordRoot: 440.0,
  title: 'Type III: the galaxy is too wide to hurry',
  prose: `<p>Type III is a galaxy's worth, <b>10<sup>36</sup> watts</b>. The Milky Way's hundred-odd billion stars make about four times that. Shared out, it's a dozen or more <b>stars for each person</b> alive.</p>
    <p>But the galaxy is a hundred thousand light years across. Growth of 2.3% a year would take us from Type II to Type III in a thousand years; nothing can cross the disc in less than seventy-six thousand. On this last step, distance sets the pace, not appetite.</p>`,
  predict: {
    question: 'Ships at a tenth of light speed hop from star to star, stopping 500 years at each to build the next ships. How long to settle the galaxy?',
    options: ['About 100,000 years', 'About 6 million years', 'About 5 billion years'],
    answer: 1,
    reveal: `<p>Each 7-light-year hop takes 70 years of flight and 500 of building, so the front creeps at about a hundredth of a light year a year. That's <b>6 million years</b> to the far edge: long for us, but under a two-thousandth of the galaxy's age.</p>`,
  },
  goals: [
    { id: 'launch', text: 'Launch, and settle the galaxy' },
    { id: 'fast', text: 'Halve the stops, then double the speed: which helps more?' },
    { id: 'light', text: 'Try the limit: light speed, no stops' },
  ],
  storyTitle: 'The silence',
  story: `<p>If settling a galaxy takes a few million years, and the galaxy is thirteen and a half billion years old, someone should have done it by now. That's the puzzle Enrico Fermi put over lunch in 1950 ("Where is everybody?") and Michael Hart sharpened in 1975.</p>
    <p>A Type III civilization would turn a galaxy's starlight into heat, so its galaxy would glow in the mid-infrared. The G-HAT search (Griffith, Wright and colleagues, 2015) checked about <b>100,000 galaxies</b> in WISE images. None turns more than 85% of its starlight into such heat; about fifty exceed half, and those look like ordinary dusty star formation.</p>
    <p>Kardashev's own Type III was 4 × 10<sup>37</sup> watts; Sagan's dial puts it at 10<sup>36</sup>. The Milky Way's real output is somewhere in between, about 4 × 10<sup>36</sup>.</p>`,

  enter(ctx) {
    const s = this.s = { v: 0.1, pause: 500, front: 0, running: false, t: 0, years: 0, done: false };
    const { ui } = ctx;
    const g = ui.group('Ships');
    s.fv = ui.fader(g, { label: 'Ship speed', unit: '% of light', min: 0.1, max: 100, value: 10, log: true, digits: 1, onInput: v => { s.v = v / 100; this.update(ctx, true); } });
    s.fp = ui.fader(g, { label: 'Stop at each star', unit: 'years', min: 0, max: 5000, step: 10, value: 500, digits: 0, onInput: v => { s.pause = v; this.update(ctx, true); } });
    s.keys = ui.keys(g, [{ id: 'go', label: 'Launch', accent: true, onClick: () => this.launch(ctx) }, { id: 'reset', label: 'Reset', onClick: () => this.reset(ctx) }]);
    s.read = ui.readouts(g, [{ id: 'speed', label: 'The front moves at' }, { id: 'time', label: 'Galaxy settled in' }, { id: 'age', label: 'Of the galaxy’s age' }, { id: 'elapsed', label: 'Since launch' }]);
    ui.note(g, `One hop is ${HOP} light years, about the gap between neighbouring stars here.`);
    const g2 = ui.group('Power');
    s.read2 = ui.readouts(g2, [{ id: 'each', label: 'Stars for each person' }]);
    s.read2.set('each', '12 to 50');
    // a sample of the disc's stars, to light up as the front passes
    const r = rng(97), stars = [];
    const pitch = Math.tan(12.5 * Math.PI / 180), R = 5.0e20;
    for (let i = 0; i < 5000; i++) {
      const arm = Math.floor(r() * 4), t = Math.pow(r(), 0.9), rr = (0.12 + t * 0.95) * R;
      const th = Math.log(rr / (0.12 * R)) / pitch + arm * Math.PI / 2 + 0.45;
      const sp = (0.035 + 0.05 * t) * R * 1.2;
      const gx = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r());
      stars.push([Math.cos(th) * rr + gx() * sp, Math.sin(th) * rr + gx() * sp]);
    }
    const sun = [-NODES.gal[0], -NODES.gal[1]];
    s.stars = stars.map(([x, y]) => ({ x, y, d: Math.hypot(x - sun[0], y - sun[1]) / LY })).sort((a, b) => a.d - b.d);
    s.sun = sun;
    ctx.view.state.hideSunMark = false;
    ctx.overlay({ node: 'gal', draw: (gg, o) => this.draw(gg, o) });
    ctx.setLive(MILKY_WAY);
    this.update(ctx);
  },
  speed() { const s = this.s; return HOP / (HOP / s.v + s.pause); },           // light years per year
  update(ctx, changed) {
    const s = this.s, vf = this.speed(), T = FAR / vf;
    s.read.set('speed', vf >= 0.1 ? `${(vf * 100).toFixed(0)}% of light` : `${(vf * 100).toFixed(vf < 0.01 ? 2 : 1)}% of light`);
    s.read.set('time', years(T));
    const frac = T / GALAXY_AGE;
    s.read.set('age', frac < 0.001 ? `1 part in ${Math.round(1 / frac).toLocaleString('en-US')}` : `${(frac * 100).toFixed(1)}%`);
    if (changed && s.running) this.reset(ctx);
  },
  launch(ctx) {
    const s = this.s;
    s.dimT = null; ctx.view.state.galDim = 0;
    s.front = 0; s.years = 0; s.running = true; s.done = false;
    s.T = FAR / this.speed();
    s.cfg = { v: s.v, pause: s.pause };
    s.whir = s.whir || ctx.audio.whir();
    ctx.announce(`Launched. The galaxy fills in ${years(s.T)}.`);
  },
  reset(ctx) {
    const s = this.s;
    s.running = false; s.front = 0; s.years = 0; s.done = false;
    s.read.set('elapsed', '–');
    s.whir && s.whir.set(0);
  },
  frame(ctx, dt) {
    const s = this.s;
    // the reward: everything unsettled fades back, and what's left glowing is one civilization's heat
    if (s.dimT != null) { s.dimT += dt; ctx.view.state.galDim = 0.7 * Math.min(1, s.dimT / 1.2); }
    if (!s.running) return;
    s.years = Math.min(s.T, s.years + dt * s.T / DURATION);
    s.front = s.years * this.speed();
    s.read.set('elapsed', years(s.years));
    s.whir && s.whir.set(0.035, s.years / s.T);
    if (s.years >= s.T && !s.done) {
      s.done = true; s.running = false;
      s.whir && s.whir.set(0);
      const at = () => ctx.zoom.toScreen('gal', 0, 0);
      ctx.goal('launch', at);
      s.tried = s.tried || {};
      if (s.cfg.pause <= 250 && s.cfg.pause > 0) s.tried.stop = true;
      if (s.cfg.v >= 0.2 && s.cfg.pause >= 400) s.tried.speed = true;
      if (s.tried.stop && s.tried.speed) ctx.goal('fast', at);
      if (s.cfg.v >= 0.999 && s.cfg.pause === 0) ctx.goal('light', at);
      ctx.announce(`Settled, in ${years(s.T)}.`);
    }
  },
  draw(g, { ox, oy, ppm }) {
    const s = this.s;
    if (!s.running && !s.done) return;
    const sx = ox + s.sun[0] * ppm, sy = oy + s.sun[1] * ppm, R = s.front * LY * ppm;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(224,138,60,0.85)';
    for (const st of s.stars) {
      if (st.d > s.front) break;
      g.fillRect(ox + st.x * ppm - 1, oy + st.y * ppm - 1, 2, 2);
    }
    g.globalCompositeOperation = 'source-over';
    if (s.running) { g.strokeStyle = 'rgba(255,176,106,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(sx, sy, R, 0, TAU); g.stroke(); }
  },
  exit(ctx) { const s = this.s; s && s.whir && s.whir.stop(); ctx.view.state.galDim = 0; },
  reward(ctx) { const s = this.s; s.dimT = 0; ctx.pulse(() => ctx.zoom.toScreen('gal', s.sun[0], s.sun[1])); setTimeout(() => this.s === s && ctx.pulse(() => ctx.zoom.toScreen('gal', s.sun[0], s.sun[1])), 450); },
  finale() {
    return 'Even crawling, a civilization could fill the galaxy in a few million years, a sliver of its age. Astronomers have checked <b>a hundred thousand galaxies</b> for one glowing with that much waste heat. They found none.';
  },
};
