/* 2 · Your share — a country's power per person, counted in hundred-watt bodies standing in the yard. */
import { COUNTRIES, PEOPLE, watts } from '../data.js';
import { setPeople } from '../plates.js';

const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
const bodiesOf = kw => kw * 1000 / 100;

export default {
  id: 'share',
  name: 'Your share',
  p: 3.36,
  view: { z: 1.63, phase: 1 },
  chordRoot: 293.66,
  title: 'Two dozen bodies work for you, all day',
  prose: `<p>Now add up everything that runs on your behalf: the lights and the fridge, but also the trucks that brought your food, the furnace that made your steel, the server that answered your search. Divide the world's power by its people.</p>
    <p>Each copper dot in the yard is one body, a hundred watts, working without a break. Pick a country to see how many stand behind one person there.</p>`,
  predict: {
    question: 'The average person on Earth uses power nonstop. In hundred-watt bodies, how many?',
    options: ['Three', 'Twenty-three', 'Two hundred and thirty'],
    answer: 1,
    reveal: `<p>The world's average is <b>2.3 kilowatts</b> a person, day and night: twenty-three bodies. The average American has about eighty-six, the average Ethiopian less than one.</p>`,
  },
  goals: [
    { id: 'us', text: 'Count the bodies behind the average American' },
    { id: 'under', text: 'Find a country under ten' },
    { id: 'over', text: 'Find one over a hundred and fifty' },
  ],
  storyTitle: 'Where the numbers come from',
  story: `<p>These are primary energy figures per person for the latest year, from Our World in Data (Energy Institute and US EIA). They count commercial energy only: the firewood and dung that much of rural Africa and South Asia cook with is left out, so the smallest numbers are lower than what people actually burn.</p>
    <p>Primary energy is measured before losses: a coal plant turns about a third of its heat into electricity. That waste is part of what a civilization commands, and part of what the Kardashev scale counts.</p>
    <p>In 1940 Buckminster Fuller called these invisible helpers "energy slaves". We count them as bodies instead: the same arithmetic, without the word.</p>`,

  enter(ctx) {
    const s = this.s = { kw: 2.31, shown: 0, t: 0, placedN: -1, people: [] };
    const { ui } = ctx;
    const g = ui.group('Whose share');
    s.sel = ui.select(g, { label: 'Country', options: COUNTRIES.map((c, i) => ({ label: c.name, value: String(i) })), value: '9', onChange: v => this.set(ctx, COUNTRIES[+v].kw, +v) });
    s.f = ui.fader(g, { label: 'Power per person', unit: 'kW', min: 0.03, max: 30, value: s.kw, log: true, digits: 2, onInput: v => this.set(ctx, v, -1) });
    s.read = ui.readouts(g, [{ id: 'bodies', label: 'Bodies, nonstop' }, { id: 'day', label: 'Energy each day' }, { id: 'world', label: 'If all 8.2 billion lived so' }]);
    s.note = ui.note(g, '');
    ctx.overlay({ node: 'earth', draw: (gg, o) => this.draw(gg, o) });
    this.set(ctx, s.kw, 9);
  },
  set(ctx, kw, i) {
    const s = this.s;
    s.kw = kw;
    if (i >= 0) s.f.set(kw); else s.sel.set('');
    const b = bodiesOf(kw);
    s.read.set('bodies', b < 10 ? b.toFixed(1) : Math.round(b).toLocaleString('en-US'));
    s.read.set('day', `${(kw * 24).toFixed(kw < 1 ? 1 : 0)} kWh`);
    s.read.set('world', watts(kw * 1000 * PEOPLE));
    const name = i >= 0 ? COUNTRIES[i].name : '';
    s.note.textContent = kw < 0.5 ? 'Firewood isn’t counted, so the real figure is higher.' : name === 'Iceland' ? 'Mostly geothermal and hydro power, much of it for aluminium smelters.' : name === 'Qatar' ? 'Gas, much of it spent liquefying gas for export and cooling buildings.' : '';
    s.house = ctx.view.state.houseLight = Math.min(1.2, 0.2 + Math.log10(1 + kw) * 0.7);
    ctx.setLive(kw * 1000);
    if (name === 'United States') ctx.goal('us', () => ctx.zoom.toScreen('earth', -3, -10));
    if (b < 10) ctx.goal('under', () => ctx.zoom.toScreen('earth', 0, 0));
    if (b > 150) ctx.goal('over', () => ctx.zoom.toScreen('earth', 0, 0));
  },
  frame(ctx, dt) {
    const s = this.s;
    s.t += dt;
    const target = bodiesOf(s.kw);
    // the crowd gathers or leaves quickly, but you can watch it happen
    s.shown += (target - s.shown) * Math.min(1, dt * 5);
    if (Math.abs(target - s.shown) < 0.02) s.shown = target;
    const n = Math.round(s.shown);
    if (n !== s.placedN) { s.placedN = n; s.people = this.place(n); s.people.unshift({ x: -1.15, y: 0.42, kind: 'sit', lit: 1 }); }
    // the reward: a wave runs out through the crowd, block by block, and the house lights come full on
    if (s.reward != null) s.reward += dt;
    let k = 0;
    for (const p of s.people) if (p.kind === 'body') {
      const wave = s.reward != null ? Math.max(0, 1 - Math.abs(s.reward * 9 - Math.floor(k++ / 10) - 1)) : 0;
      p.pulse = 0.85 + 0.15 * Math.sin(s.t * 3 + p.x * 2 + p.y) + wave * 0.6;
    }
    if (s.reward != null) ctx.view.state.houseLight = Math.min(1.6, s.house + 0.6 * Math.min(1, s.reward));
    setPeople(s.people);
  },
  /* Bodies stand in the yard as halftone dots. Up to fifty, one by one on a spiral; beyond that in blocks of ten
     (two rows of five), so 236 reads as twenty-three blocks and six singles. */
  place(n) {
    const out = [], blocks = n > 50 ? Math.floor(n / 10) : 0, singles = n - blocks * 10;
    const free = (x, y) => !(Math.abs(x + 3) < 7.8 && Math.abs(y + 17) < 5.6) && Math.hypot(x + 1.15, y - 0.42) > 0.9 && y > -30 && Math.abs(x) < 14.4 && Math.hypot(x - 10, y + 12) > 3;
    let i = 0, placed = 0;
    while (placed < blocks && i < 4000) {
      const r = 2.4 + Math.sqrt(i) * 1.55, a = i++ * GOLDEN, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      if (!free(cx - 1.2, cy - 0.5) || !free(cx + 1.2, cy + 0.5)) continue;
      for (let k = 0; k < 10; k++) out.push({ x: cx + ((k % 5) - 2) * 0.55, y: cy + (Math.floor(k / 5) - 0.5) * 0.55, kind: 'body' });
      placed++;
    }
    const r0 = blocks ? 2.4 + Math.sqrt(i) * 1.55 : 1.8;
    for (let k = 0, j = 0; k < singles && j < 2000; j++) {
      const r = r0 + Math.sqrt(j) * 0.8, a = j * GOLDEN + 0.4, x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!free(x, y)) continue;
      out.push({ x, y, kind: 'body' }); k++;
    }
    return out;
  },
  draw() {},
  reward() { this.s.reward = 0; },
  exit(ctx) {},
  finale() {
    return 'The world’s average is <b>23 bodies a person</b>. Times 8.2 billion people, that’s about <b>19 trillion watts</b>. That number is where the Kardashev scale begins.';
  },
};
