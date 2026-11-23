/* 1 · A body — the unit everything else is counted in. Each press is a pedal stroke: the faster you keep it up,
   the more watts, until your breath runs out. Holding just coasts. Other riders join around the fire until a kettle
   boils. */
import { PERSON, glow, setPeople, setItems } from '../plates.js';
import { BODY, RIDER, watts } from '../data.js';

const KETTLE = 2000, LAPTOP = 60, LED = 9, FRIDGE = 150;
const BOIL_J = 570e3;                     // 1.7 L from 15 °C to 100 °C, with the kettle's own losses
const TAU = Math.PI * 2;
const KX = 0.85, KY = -0.4;               // the kettle, on a flat stone by the fire
const BX = PERSON.x * 1.45, BY = PERSON.y * 1.45;   // your bulb, just behind you

/* Seats around the fire: you first, then rings outward. */
function seats(n) {
  const out = [{ x: PERSON.x, y: PERSON.y, kind: 'sit' }];
  const base = Math.atan2(PERSON.y, PERSON.x);
  const rings = [[1.35, 6, 1], [2.15, 10, 0.5], [2.95, 12, 0], [3.7, 14, 0.5]];
  let k = 1;
  for (const [r, m, off] of rings) for (let i = 0; i < m && k < n; i++, k++) {
    const a = base + (i + off) / m * TAU;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, kind: 'sit' });
  }
  return out;
}

export default {
  id: 'body',
  name: 'A body',
  p: 2,
  view: { z: 0.8, phase: 1 },
  chordRoot: 261.63,
  title: 'You run at a hundred watts',
  prose: `<p>Every number on this scale is in <b>watts</b>: how fast energy is used. Start with the one you know from the inside. The 2,000 calories you eat in a day keep you running at about <b>100 watts</b>, day and night. A dim old light bulb.</p>
    <p>Your legs can hold about <b>75 watts</b> at a bicycle's pedals for an hour, burning three or four times that in food to do it. The fire beside you gives off about ten thousand: a hundred of you.</p>`,
  predict: {
    question: 'Pedalling alone at a steady 75 watts, how long to boil a full kettle?',
    options: ['Five minutes', 'Half an hour', 'About two hours'],
    answer: 2,
    reveal: `<p>A full kettle needs about 570 kilojoules. At 75 watts that's over two hours of steady work. The kettle itself draws 2,000 watts and does it in five minutes, which is twenty-seven of you at once.</p>`,
  },
  goals: [
    { id: 'led', text: 'Pedal to light a 9-watt LED' },
    { id: 'laptop', text: 'Keep a 60-watt laptop running for ten seconds' },
    { id: 'kettle', text: 'Bring in enough riders to boil the kettle' },
  ],
  storyTitle: 'Watts, and the people who measured them',
  story: `<p>A watt is one joule each second. James Watt sold his steam engines in <b>horsepower</b> (about 746 watts) so mill owners could compare them with the horses they replaced. The Kardashev scale does the same thing with whole civilizations.</p>
    <p>Muscles turn about a quarter of the food they burn into work; the rest leaves as heat, which is why exercise warms you. A trained cyclist can hold 250 watts for an hour and sprint past 1,000 for a few seconds. An ordinary adult holds about 75.</p>`,

  enter(ctx) {
    const s = this.s = { taps: [], cad: 0, you: 0, stamina: 1, riders: 1, P: 0, laptopT: 0, ledT: 0, kettleT: 0, boiled: 0, held: false, party: 0 };
    const { ui } = ctx;
    const g = ui.group('Pedal');
    s.keys = ui.keys(g, [{ id: 'pedal', label: 'Press to pedal', cls: 'pedal', aria: 'Pedal: each press is a stroke; keep pressing to keep the power up. The space bar works too.' }]);
    const key = s.keys.pedal;
    key.addEventListener('pointerdown', e => { e.preventDefault(); this.stroke(); s.held = true; key.classList.add('is-held'); });
    const up = () => { s.held = false; key.classList.remove('is-held'); };
    key.addEventListener('pointerup', up); key.addEventListener('pointercancel', up); key.addEventListener('pointerleave', up);
    key.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); e.stopPropagation(); this.stroke(); } });
    s.staminaEl = document.createElement('div'); s.staminaEl.className = 'stamina'; s.staminaEl.innerHTML = '<i></i>';
    s.staminaEl.setAttribute('role', 'meter'); s.staminaEl.setAttribute('aria-label', 'Breath'); s.staminaEl.setAttribute('aria-valuemin', '0'); s.staminaEl.setAttribute('aria-valuemax', '100');
    const lab = document.createElement('span'); lab.className = 'm-legend m-legend--dim'; lab.textContent = 'Breath';
    g.append(lab, s.staminaEl);
    s.read = ui.readouts(g, [{ id: 'cad', label: 'Strokes a second' }, { id: 'you', label: 'At the pedals' }, { id: 'food', label: 'Your body burns' }, { id: 'boil', label: 'A kettle, at this rate' }]);
    ui.note(g, 'A steady rhythm of about two a second is the 75 watts you could keep up for an hour. Faster runs your breath down.');

    const g2 = ui.group('What it runs');
    s.lamps = ui.lamps(g2, [
      { id: 'led', label: 'LED bulb', value: '9 W' }, { id: 'laptop', label: 'Laptop', value: '60 W' },
      { id: 'fridge', label: 'Fridge', value: '150 W' }, { id: 'kettle', label: 'Kettle', value: '2,000 W' },
    ]);
    const g3 = ui.group('Riders');
    s.fRiders = ui.fader(g3, { label: 'Riders, counting you', min: 1, max: 34, step: 1, value: 1, digits: 0, onInput: v => { s.riders = Math.max(1, Math.round(v)); } });
    s.read2 = ui.readouts(g3, [{ id: 'all', label: 'Everyone at the pedals' }]);
    ui.note(g3, 'The others hold a steady 75 W each. You add whatever you’re putting in.');

    ctx.view.state.fireLit = 1;
    ctx.overlay({ node: 'earth', draw: (gg, o) => this.draw(gg, o) });
    s.whir = ctx.audio.whir();
  },
  stroke() {
    const s = this.s, now = performance.now();
    s.taps.push(now);
  },
  key(e) {
    if (e.key === ' ' && !e.target.closest('button, a, input, select')) { e.preventDefault(); if (!e.repeat) this.stroke(); return true; }
    return false;
  },

  frame(ctx, dt) {
    const s = this.s, now = performance.now();
    // cadence: strokes in the last 1.5 s; the watts follow its square, as a real crank's do, and settle smoothly
    while (s.taps.length && now - s.taps[0] > 1500) s.taps.shift();
    const rate = s.taps.length / 1.5;
    s.cad += (rate - s.cad) * Math.min(1, dt * 3);
    let target = 170 * Math.pow(s.cad / 3, 2) + (s.held ? 8 : 0);
    if (s.stamina <= 0.02) target = Math.min(target, 70);        // out of breath: you can only just keep going
    s.you += (target - s.you) * Math.min(1, dt * 4);
    const you = s.you;
    if (you > 90) s.stamina = Math.max(0, s.stamina - dt * (you - 90) / 220);
    else s.stamina = Math.min(1, s.stamina + dt * (you < 50 ? 0.12 : 0.03));
    if (s.fRiders.value !== s.riders) s.fRiders.set(s.riders);
    const P = you + (s.riders - 1) * RIDER;
    s.P = P;
    ctx.setLive(BODY + P);

    s.read.set('cad', s.cad.toFixed(1));
    s.read.set('you', `${Math.round(you)} W`);
    s.read.set('food', `${Math.round(BODY + you / 0.25)} W`);
    s.read.set('boil', P > 1 ? (BOIL_J / P < 3600 ? `${Math.round(BOIL_J / P / 60)} min` : `${(BOIL_J / P / 3600).toFixed(1)} hours`) : 'never');
    s.read2.set('all', watts(P));
    s.staminaEl.firstChild.style.transform = `scaleX(${s.stamina.toFixed(3)})`;
    s.staminaEl.setAttribute('aria-valuenow', String(Math.round(s.stamina * 100)));
    s.lamps.set('led', P >= LED); s.lamps.set('laptop', P >= LAPTOP); s.lamps.set('fridge', P >= FRIDGE); s.lamps.set('kettle', P >= KETTLE);
    s.whir.set(Math.min(0.08, you / 2600 + (s.riders - 1) * 0.0012), Math.min(1, you / 200));

    const at = () => ctx.zoom.toScreen('earth', PERSON.x, PERSON.y);
    s.ledT = P >= LED ? s.ledT + dt : 0;
    if (s.ledT > 0.6) ctx.goal('led', at);
    s.laptopT = P >= LAPTOP ? s.laptopT + dt : 0;
    if (s.laptopT >= 10) ctx.goal('laptop', at);
    s.kettleT = P >= KETTLE ? s.kettleT + dt : 0;
    if (s.kettleT > 1.2) ctx.goal('kettle', () => ctx.zoom.toScreen('earth', KX, KY));
    if (P >= KETTLE) s.boiled = Math.min(1, s.boiled + dt / 4); else s.boiled = Math.max(0, s.boiled - dt / 8);
    if (ctx.goalMet('kettle') && ctx.goalMet('laptop') && ctx.goalMet('led')) s.party = Math.min(1, s.party + dt / 2);

    // ease the view out a little once the crowd outgrows the first rings
    const want = this.view.z + (s.riders > 12 ? 0.14 : 0) + (s.riders > 22 ? 0.1 : 0);
    if (!ctx.zoom.moving && ctx.atHome && Math.abs(ctx.zoom.z - want) > 0.005) ctx.zoom.z += (want - ctx.zoom.z) * Math.min(1, dt * 2);
    const people = seats(s.riders);
    people.forEach(p => { p.lit = 1; });
    setPeople(people);
    const bulb = Math.min(1, P / 60);
    setItems([{ x: KX, y: KY, r: 0.11, c: 'stone', v: 0.9 }, { x: KX, y: KY, r: 0.045, c: s.boiled > 0.5 ? 'hot' : 'wood', v: 0.8 }, { x: BX, y: BY, r: 0.05, c: bulb > 0.05 ? 'hot' : 'stone', v: 0.4 + 0.6 * bulb }]);
  },

  draw(g, { ox, oy, ppm, view }) {
    const s = this.s;
    // light from the bulb, and from every rider's bulb once the kettle has boiled
    const b = Math.min(1, s.P / 60);
    g.globalCompositeOperation = 'lighter';
    if (b > 0.01) glow(g, ox + BX * ppm, oy + BY * ppm, (0.35 + 1.2 * b) * ppm, `rgba(255,190,120,${0.42 * b})`);
    if (s.party > 0) for (const p of seats(s.riders).slice(1)) glow(g, ox + p.x * 1.2 * ppm, oy + p.y * 1.2 * ppm, 0.6 * ppm, `rgba(255,190,120,${0.3 * s.party})`);
    g.globalCompositeOperation = 'source-over';
    // steam from the kettle once it boils
    if (s.boiled > 0.02) for (let i = 0; i < 10; i++) {
      const k = (view.t * 0.5 + i / 10) % 1;
      g.fillStyle = `rgba(230,236,240,${0.3 * s.boiled * (1 - k)})`;
      g.beginPath(); g.arc(ox + (KX + Math.sin(i * 2.3 + view.t) * 0.08) * ppm, oy + (KY - k * 0.5) * ppm, (0.04 + k * 0.12) * ppm, 0, TAU); g.fill();
    }
  },
  exit() { const s = this.s; s && s.whir && s.whir.stop(); setItems([]); },
  finale() {
    return 'You can hold about <b>75 watts</b>. A kettle wants <b>2,000</b>. Every machine at home is a crowd of riders you never see, and the next chapter counts yours.';
  },
};
