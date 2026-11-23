/* 3 · Today — humanity on the night side, K = 0.73, and what exponential growth does to the distance to Type I. */
import { TODAY, TODAY_YEAR, TYPE, PEOPLE, kOf, watts, supHTML } from '../data.js';

const yearsTo = (P, r) => r <= 0 ? Infinity : Math.log(P / TODAY) / Math.log(1 + r);

export default {
  id: 'today',
  name: 'Today',
  p: 13.27,
  view: { z: 7.27, phase: 0.86 },
  chordRoot: 329.63,
  title: 'Seven-tenths of the way is one five-hundredth',
  prose: `<p>Pull back far enough and all of humanity's power shows up as light on the night side: <b>18.8 trillion watts</b> in 2024. That's the twenty-three bodies, times every person alive.</p>
    <p>Kardashev named three types. Carl Sagan turned them into a dial, where each whole number is <b>ten billion times</b> the one before: Type I at 10<sup>16</sup> watts, Type II at 10<sup>26</sup>, Type III at 10<sup>36</sup>. On that dial we read <b>0.73</b>.</p>`,
  predict: {
    question: 'We’re at 0.73 on the scale. How much more power to reach Type I?',
    options: ['About 37% more', 'About four times as much', 'About five hundred times as much'],
    answer: 2,
    reveal: `<p>Each step on the dial is ten powers of ten, so the last 0.27 of a step is 10<sup>2.7</sup>: about <b>530 times</b> what we use now. Seven-tenths of the way, measured in watts, is one five-hundredth.</p>`,
  },
  goals: [
    { id: 'rate', text: 'Set growth to 2.3% a year, the long-run average, and read how often power grows tenfold' },
    { id: 'arrive', text: 'Run the years forward until we reach Type I' },
    { id: 'life', text: 'Find the growth that gets us there by 2100' },
    { id: 'slow', text: 'Find the fastest growth whose waste heat stays under today\u2019s greenhouse push for a thousand years' },
  ],
  storyTitle: 'Kardashev, Sagan, and a formula from 2004',
  story: `<p>Nikolai Kardashev's 1964 paper was about <b>radio signals</b>: how loud a civilization could be across interstellar space. His Type I was the whole Earth's energy use in 1964, about 4 × 10<sup>12</sup> watts; Type II a star's, 4 × 10<sup>26</sup>; Type III a galaxy's, 4 × 10<sup>37</sup>.</p>
    <p>In <i>The Cosmic Connection</i> (1973) Carl Sagan proposed filling in between the types and moved Type I to 10<sup>16</sup> watts. The neat formula K = (log<sub>10</sub>P − 6) / 10 that everyone quotes isn't in his book; Robert H. Gray traced it, in 2020, to an encyclopedia edit from 2004. It's still the most useful way to read the scale.</p>
    <p>Our figure: 592 exajoules of primary energy in 2024 (Energy Institute, Statistical Review 2025). Their newer method counts wind, solar and nuclear a little lower than the older one did; either way K comes out at 0.73.</p>
    <p>Tom Murphy's point (2011): 2.3% a year is ten times every century. Keep it up and the scale reads like a road, about a step per thousand years. The next two chapters ask what's at the end of it.</p>`,

  enter(ctx) {
    const s = this.s = { r: 0.01, year: TODAY_YEAR };
    const { ui } = ctx;
    const g = ui.group('Growth');
    s.fr = ui.fader(g, { label: 'Growth a year', unit: '%', min: 0, max: 12, step: 0.1, value: s.r * 100, digits: 1, onInput: v => { s.r = v / 100; this.update(ctx); } });
    s.fy = ui.fader(g, { label: 'Year', min: TODAY_YEAR, max: 2800, step: 1, value: s.year, digits: 0, onInput: v => { s.year = Math.round(v); this.update(ctx); } });
    s.read = ui.readouts(g, [{ id: 'power', label: 'Power that year' }, { id: 'k', label: 'Kardashev' }, { id: 'each', label: 'Each person' }, { id: 'ten', label: 'Ten times every' }, { id: 't1', label: 'Type I in' }, { id: 't2', label: 'Type II in' }, { id: 'heat', label: 'Waste heat passes 2.7 W/m²' }]);
    const g2 = ui.group('The dial, over time');
    s.plot = ui.canvas(g2, { height: 150, label: 'Kardashev value by year at the chosen growth rate, with Type I marked', onResize: () => this.s && this.drawPlot() });
    ui.note(g2, 'Population held at 8.2 billion, so every extra watt goes to the same people.');
    this.update(ctx);
  },
  P(s) { return TODAY * Math.pow(1 + s.r, s.year - TODAY_YEAR); },
  update(ctx) {
    const s = this.s, P = this.P(s), K = kOf(P);
    const at = () => ctx.zoom.toScreen('earth', 0, 0);
    s.read.set('power', supHTML(watts(P)));
    s.read.set('k', K.toFixed(3));
    const each = P / PEOPLE;
    s.read.set('each', each < 1e5 ? `${Math.round(each / 100).toLocaleString('en-US')} bodies` : watts(each));
    const ten = s.r > 0 ? Math.log(10) / Math.log(1 + s.r) : Infinity;
    s.read.set('ten', isFinite(ten) ? `${Math.round(ten)} years` : 'never');
    const y1 = yearsTo(TYPE[1], s.r), y2 = yearsTo(TYPE[2], s.r);
    s.read.set('t1', isFinite(y1) ? `${Math.round(TODAY_YEAR + y1)}` : 'never');
    s.read.set('t2', isFinite(y2) ? `${Math.round(TODAY_YEAR + y2).toLocaleString('en-US')}` : 'never');
    // waste heat today is about 0.04 W/m²; it matches today's greenhouse push (2.7 W/m²) at about 73 times our power
    const yh = s.r > 0 ? Math.log(73) / Math.log(1 + s.r) : Infinity;
    s.read.set('heat', isFinite(yh) ? `${Math.round(TODAY_YEAR + yh).toLocaleString('en-US')}` : 'never');
    if (s.r > 0.0035 && yh >= 1000) ctx.goal('slow', at);
    // the night side brightens as power grows: city light is the power we spend
    s.light = Math.min(3, 1 + Math.log10(P / TODAY) * 0.8);
    ctx.view.state.earthLight = s.light + (s.flare || 0);
    ctx.setLive(P);
    if (Math.abs(s.r - 0.023) < 0.0006) ctx.goal('rate', at);
    if (K >= 1) ctx.goal('arrive', at);
    if (TODAY_YEAR + y1 <= 2100) ctx.goal('life', at);
    this.drawPlot();
  },
  reward() { this.s.flareT = 0; },
  frame(ctx, dt) {
    const s = this.s;
    if (s.flareT == null) return;
    s.flareT += dt;
    // the reward: every city on the night side brightens to the year you chose, then settles back
    s.flare = 1.4 * Math.sin(Math.min(1, s.flareT / 2.4) * Math.PI);
    ctx.view.state.earthLight = s.light + s.flare;
    if (s.flareT > 2.4) s.flareT = null;
  },
  drawPlot() {
    const s = this.s, c = s.plot, g = c.g, w = c.w, h = c.h;
    g.clearRect(0, 0, w, h);
    const pad = { l: 30, r: 10, t: 12, b: 22 }, y0 = TODAY_YEAR, y1 = 2800, k0 = 0.6, k1 = 2.1;
    const X = y => pad.l + (y - y0) / (y1 - y0) * (w - pad.l - pad.r);
    const Y = k => h - pad.b - (k - k0) / (k1 - k0) * (h - pad.t - pad.b);
    g.font = '10px "Söhne Mono", ui-monospace, monospace'; g.lineWidth = 1;
    for (const k of [1, 2]) {
      g.strokeStyle = 'rgba(224,138,60,0.45)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(pad.l, Y(k)); g.lineTo(w - pad.r, Y(k)); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(224,138,60,0.8)'; g.textAlign = 'right'; g.fillText(k === 1 ? 'I' : 'II', pad.l - 6, Y(k) + 3);
    }
    g.fillStyle = 'rgba(236,230,216,0.45)'; g.textAlign = 'center';
    for (const y of [2100, 2300, 2500, 2700]) { g.fillText(String(y), X(y), h - 7); g.strokeStyle = 'rgba(236,230,216,0.08)'; g.beginPath(); g.moveTo(X(y), pad.t); g.lineTo(X(y), h - pad.b); g.stroke(); }
    g.strokeStyle = '#ece6d8'; g.lineWidth = 1.4; g.beginPath();
    for (let y = y0; y <= y1; y += 5) { const k = kOf(TODAY * Math.pow(1 + s.r, y - y0)); const yy = Y(Math.min(k1 + 0.1, k)); y === y0 ? g.moveTo(X(y), yy) : g.lineTo(X(y), yy); if (k > k1) break; }
    g.stroke();
    const k = kOf(this.P(s));
    g.fillStyle = '#e08a3c'; g.beginPath(); g.arc(X(s.year), Y(Math.min(k1, k)), 4, 0, Math.PI * 2); g.fill();
  },
  exit() {},
  finale(ctx) {
    return 'At 2.3% a year, power grows <b>tenfold every century</b>: Type I around <b>2300</b>, Type II around <b>3300</b>. Exponential growth makes the scale look like a road. The next chapter asks where Type I’s heat would go.';
  },
};
