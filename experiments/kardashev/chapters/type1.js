/* 4 · Type I — 10¹⁶ W, two ways: caught from sunlight (panels spread over the globe), or made on Earth (fusion,
   fission, fuel), where every watt ends as heat the planet has to shed. */
import { EARTH_R } from '../plates.js';
import { hash } from '../field.js';
import { TODAY, PEOPLE, kOf, pOfK, watts, supHTML } from '../data.js';

const AREA = 4 * Math.PI * EARTH_R * EARTH_R;      // 5.1 × 10¹⁴ m²
const LAND = 0.292;                                // of the surface
const HARVEST = 0.2 * 180;                         // W/m²: 20% panels under the ~180 W/m² that reaches the ground on average
const PLANCK = 0.3, FEEDBACK = 0.8;                // K per W/m²: the bare radiation response, and with feedbacks
const GREENHOUSE = 2.7;                            // W/m²: human greenhouse forcing so far (IPCC AR6, 2019)
const HEAT_K = kOf(GREENHOUSE * AREA);             // ≈ 0.914
const NEED = 1e16 / (AREA * HARVEST);              // ≈ 0.54 of the surface for Type I on sunlight

export default {
  id: 'type1',
  name: 'Type I',
  p: 16,
  view: { z: 7.42, phase: 0.18 },
  chordRoot: 349.23,
  title: 'Type I: where does the heat go?',
  prose: `<p>Type I is <b>10<sup>16</sup> watts</b>, about a seventeenth of the sunlight that reaches Earth. Shared out, it's <b>1.2 million watts</b> for every person alive: a locomotive each, or twelve thousand bodies.</p>
    <p>There are two ways to get it. Catch sunlight, which was going to warm the ground anyway. Or make power here, from fusion, fission or fuel. Every watt you use ends as heat, and the planet has to shed it.</p>`,
  predict: {
    question: 'Make 10<sup>16</sup> watts on Earth, from fusion, not sunlight. How much does the planet warm?',
    options: ['Less than a degree', 'Roughly 6 to 15 °C', 'About 100 °C'],
    answer: 1,
    reveal: `<p>That's about <b>20 watts on every square metre</b> of the planet, seven times the push from all our greenhouse gases so far. The heat alone warms Earth about 6 °C, and closer to 15 °C once melting ice and extra water vapour join in.</p>`,
  },
  goals: [
    { id: 'land', text: 'Cover all the land with solar panels' },
    { id: 'sun', text: 'Reach Type I on sunlight' },
    { id: 'heat', text: 'Make power on Earth until its waste heat matches today’s greenhouse push' },
  ],
  storyTitle: 'The arithmetic of heat',
  story: `<p>Earth absorbs about 240 watts per square metre of sunlight and radiates the same back to space. Add heat and it must warm until it radiates the extra. With nothing else changing, that's about 0.3 °C for each watt per square metre; with the feedbacks climate scientists measure, about 0.8 °C.</p>
    <p>Our waste heat today is about <b>0.04 W/m²</b>, tiny next to the <b>2.7 W/m²</b> our greenhouse gases add (IPCC AR6). At 2.3% a year growth, waste heat alone would match today's greenhouse push in about 190 years.</p>
    <p>Panels: we assume 20% efficiency under the 180 or so watts per square metre that reach the ground on average, day and night. Better panels would help a little, not a lot.</p>`,

  enter(ctx) {
    const s = this.s = { mode: 'sun', cover: 0.02, K: kOf(TODAY) };
    const { ui } = ctx;
    const g = ui.group('Source');
    s.seg = ui.seg(g, { options: [{ label: 'Sunlight', value: 'sun' }, { label: 'Made on Earth', value: 'made' }], value: 'sun', onChange: v => { s.mode = v; this.layout(); this.update(ctx); } });
    s.gSun = ui.group('Panels');
    s.fc = ui.fader(s.gSun, { label: 'Panels cover', unit: '% of Earth', min: 0, max: 100, step: 0.1, value: s.cover * 100, digits: 1, onInput: v => { s.cover = v / 100; this.update(ctx); } });
    s.gMade = ui.group('Power plants');
    s.fk = ui.fader(s.gMade, { label: 'Power made on Earth, as K', min: 0.7, max: 1.05, step: 0.001, value: s.K, digits: 3, onInput: v => { s.K = v; this.update(ctx); } });
    const g3 = ui.group('Result');
    s.read = ui.readouts(g3, [{ id: 'power', label: 'Power' }, { id: 'k', label: 'Kardashev' }, { id: 'each', label: 'Each person' }, { id: 'a', label: '' }, { id: 'b', label: '' }]);
    s.labels = s.read.el.querySelectorAll('dt');
    ctx.view.state.panels = (lat, lon, land) => this.covered(lat, lon, land);
    this.layout();
    this.update(ctx);
  },
  layout() { const s = this.s; s.gSun.hidden = s.mode !== 'sun'; s.gMade.hidden = s.mode !== 'made'; },
  /* Land first, then sea: each half-degree cell has a fixed draw, and the cells under the coverage get panels. */
  covered(lat, lon, land) {
    const s = this.s;
    const h = hash(Math.floor(lat * 114.6), Math.floor(lon * 114.6));
    if (s.ghost > 0 && !(s.mode === 'sun' && this.under(h, land, s.cover)) && this.under(h, land, NEED)) return 0.3 * s.ghost;
    if (s.mode !== 'sun' || s.cover <= 0) return false;
    if (s.cover <= LAND) return land && h < s.cover / LAND;
    return land || h < (s.cover - LAND) / (1 - LAND);
  },
  under(h, land, c) { return c <= LAND ? land && h < c / LAND : land || h < (c - LAND) / (1 - LAND); },
  reward() { this.s.ghostT = 0; },
  frame(ctx, dt) {
    const s = this.s;
    if (s.ghostT == null) return;
    // the reward: the share of the planet Type I on sunlight would need, shown faintly, land and sea
    s.ghostT += dt;
    s.ghost = Math.min(1, s.ghostT / 0.9);
  },
  update(ctx) {
    const s = this.s;
    let P;
    if (s.mode === 'sun') {
      P = Math.max(TODAY, s.cover * AREA * HARVEST);
      s.labels[3].textContent = 'Panel area'; s.labels[4].textContent = 'Extra heat';
      s.read.set('a', s.cover <= LAND ? `${(s.cover / LAND * 100).toFixed(0)}% of all land` : `all land, and ${((s.cover - LAND) / (1 - LAND) * 100).toFixed(0)}% of the sea`);
      s.read.set('b', 'none: that sunlight was landing anyway');
      ctx.view.state.heat = 0;
      ctx.view.state.earthLight = 1;
    } else {
      P = pOfK(s.K);
      const F = P / AREA;
      s.labels[3].textContent = 'Heat on each m²'; s.labels[4].textContent = 'Earth warms by';
      s.read.set('a', `${F < 1 ? F.toFixed(2) : F.toFixed(1)} W, ${F / GREENHOUSE < 1 ? (F / GREENHOUSE).toFixed(2) : (F / GREENHOUSE).toFixed(1)}× our greenhouse push`);
      s.read.set('b', `${(F * PLANCK).toFixed(1)} °C, or ${(F * FEEDBACK).toFixed(1)} °C with feedbacks`);
      ctx.view.state.heat = Math.min(1, F / 20);
      ctx.view.state.earthLight = Math.min(3, 1 + Math.log10(P / TODAY) * 0.8);
    }
    const K = kOf(P);
    s.read.set('power', supHTML(watts(P)));
    s.read.set('k', K.toFixed(3));
    s.read.set('each', watts(P / PEOPLE));
    ctx.setLive(P);
    const at = () => ctx.zoom.toScreen('earth', 0, 0);
    if (s.mode === 'sun' && s.cover >= LAND) ctx.goal('land', at);
    if (s.mode === 'sun' && K >= 1) ctx.goal('sun', at);
    if (s.mode === 'made' && Math.abs(s.K - HEAT_K) < 0.004) ctx.goal('heat', at);
  },
  exit(ctx) { ctx.view.state.panels = null; },
  finale() {
    return 'Type I on sunlight means paving <b>more than half the planet</b>, oceans included: all the land only gets you to 0.97. Type I made on Earth cooks it. A planet-sized civilization has to send its heat out to space, and that glow is exactly what the next chapter looks for.';
  },
};
