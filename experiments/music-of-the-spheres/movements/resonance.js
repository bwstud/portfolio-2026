/* 4 · Resonance — moons whose periods form small whole-number ratios meet in the same places every time, and with
   each moon given a tone at a pitch set by its speed, those ratios are musical intervals: 2:1 an octave, 3:2 a fifth.
   Orbits here are set by hand (no mutual pull), which the text says. */
import * as THREE from 'three';
import { keplerState, wrapAngle, TAU, GM_SUN } from '../physics.js';
import { FatLine, Trail, COLOR, planet, halo } from '../draw.js';
import { TRAPPIST, GALILEAN } from '../data.js';

const MOON_COLORS = [0xf0e2b6, 0x9cc3e0, 0xd99a6c, 0xb9d39a, 0xd7a9d0, 0x8fd1c7, 0xe9c46a];
const OUTER_HZ = 130.81;                 // the outermost moon sounds C3; the others sit above it by their speed ratios
const SPAN = 3.1;                        // world radius of the outermost orbit

// the simplest fraction near x, denominators up to 6
function nearestFraction(x) {
  let best = { p: 1, q: 1, err: Infinity };
  for (let q = 1; q <= 6; q++) { const p = Math.round(x * q); const err = Math.abs(x - p / q); if (err < best.err - 1e-9) best = { p, q, err }; }
  const g = (a, b) => b ? g(b, a % b) : a, d = g(best.p, best.q);
  return { p: best.p / d, q: best.q / d, err: best.err };
}
const INTERVALS = { '2:1': 'an octave', '3:2': 'a perfect fifth', '4:3': 'a perfect fourth', '5:4': 'a major third', '6:5': 'a minor third', '5:3': 'a major sixth', '3:1': 'an octave and a fifth', '4:1': 'two octaves', '5:2': 'an octave and a major third', '8:5': 'a minor sixth' };

const SYSTEMS = {
  two: null,
  venus: { name: 'Venus and Earth', periods: [224.701, 365.256], names: ['Venus', 'Earth'], phase: [0, 0] },   // 13 Venus years ≈ 8 Earth years
  pluto: { name: 'Neptune and Pluto', periods: [164.8, 247.94], e: [0.0086, 0.2488], names: ['Neptune', 'Pluto'], phase: [0, 180], omega: [0, 0] },
  laplace: { name: 'Io, Europa, Ganymede', periods: GALILEAN, names: ['Io', 'Europa', 'Ganymede'], phase: [0, 0, 90] },   // λ1 − 3λ2 + 2λ3 = 180°
  trappist: { name: 'TRAPPIST-1', periods: TRAPPIST, names: ['b', 'c', 'd', 'e', 'f', 'g', 'h'], phase: [0, 137, 251, 19, 300, 88, 212] },
};

export default {
  id: 'resonance',
  name: 'Resonance',
  title: 'Orbits in small whole numbers keep time together',
  prose: `<p>When one moon takes exactly twice as long as another, they always meet in the same place. Any ratio of small whole numbers does this. A ratio that is nearly whole makes the meeting place creep round.</p>
    <p>Give each moon a tone pitched by its speed and the ratios become intervals: 2:1 is an octave, 3:2 a fifth. A near miss beats, and the closer the ratio, the slower both the beat and the creep.</p>
`,
  predict: {
    question: 'Set your pair so the outer moon takes exactly twice as long as the inner one. Where do they meet?',
    options: ['All the way round, sooner or later', 'Always in the same place', 'In two places, opposite each other'],
    answer: 1,
    reveal: `<p>The inner moon laps the outer once every outer orbit, so they meet each time the outer moon is back where it started. Watch the spokes pile up on one line.</p>`,
  },
  goals: [
    { id: 'lock', text: 'Find a ratio where the meeting places stop moving' },
    { id: 'fifth', text: 'Tune the pair to a perfect fifth' },
  ],
  speeds: [
    { label: '1 s = a quarter of the inner lap', short: '¼ lap/s', value: 0.25 },
    { label: '1 s = half the inner lap', short: '½ lap/s', value: 0.5 },
    { label: '1 s = one inner lap', short: '1 lap/s', value: 1 },
  ],
  speedIndex: 1,
  camera: { target: [0, 0, 0], radius: 3.3, polar: 12, azimuth: 0, min: 2, max: 50 },
  storyTitle: 'Two real ones',
  story: `<p>Real resonances are not set by hand: the moons' pull on each other nudges them into step and holds them there.</p>
    <p><b>Io, Europa and Ganymede</b> run 1:2:4. Io meets Europa, Europa meets Ganymede, but all three never line up together: whenever Io and Europa meet, Ganymede is on the far side. Their pull on each other holds it so, and keeps Io's orbit stretched enough for Jupiter's tides to heat it into the most volcanic place we know.</p>
    <p><b>Pluto</b> crosses Neptune's orbit, yet the 3:2 lock means it never comes within about 17 AU of Neptune. Watch while turning with Neptune.</p>`,
  chordRoot: 196,

  enter(ctx) {
    const { group, ui } = ctx;
    this.ctx = ctx;
    ctx.sunLight.position.set(-30, 40, 20);   // a distant sun, off to one side
    const s = this.s = { t: 0, ratio: 1.62, system: 'two', view: 'still', lines: false, linePairs: [], lastLine: 0, moons: [], spokes: [], score: [], byHand: false, lockedFor: 0 };
    const centre = planet(0.16, 0xd8b892, { glow: 0.6 });
    centre.userData.mesh.material.emissiveIntensity = 0.12;
    group.add(centre);
    s.centre = centre;
    s.spokeLine = new FatLine({ capacity: 64, color: COLOR.brass, width: 1, opacity: 0.9 });
    s.strings = new FatLine({ capacity: 1100, color: COLOR.brass, width: 1, opacity: 0.5 });
    group.add(s.spokeLine.object, s.strings.object);

    const sg0 = ui.group('Which moons');
    s.sys = ui.seg(sg0, { options: [{ label: 'Your pair', value: 'two' }, { label: 'Venus and Earth', value: 'venus' }, { label: 'Neptune and Pluto', value: 'pluto' }, { label: 'Io, Europa, Ganymede', value: 'laplace' }, { label: 'TRAPPIST-1', value: 'trappist' }], value: 'two', onChange: v => this.build(v, s.ratio) });
    ui.note(sg0, 'No mutual pull here: you set the timing. Real moons are held in step by gravity.');
    const g = ui.group('Your pair');
    s.pairGroup = g;
    s.fr = ui.fader(g, { label: 'Outer lap ÷ inner lap', min: 1.1, max: 4, step: 0.001, value: s.ratio, digits: 3, onInput: v => { s.byHand = true; this.build('two', v); } });
    ui.keys(g, [
      { label: '2:1', onClick: () => { s.byHand = false; this.build('two', 2); } }, { label: '3:2', onClick: () => { s.byHand = false; this.build('two', 1.5); } },
      { label: '5:3', onClick: () => { s.byHand = false; this.build('two', 5 / 3); } }, { label: 'Nearly 3:2', onClick: () => { s.byHand = false; this.build('two', 1.508); } },
    ]);
    s.read = ui.readouts(ui.group('What you hear'), [{ id: 'near', label: 'Ratio' }, { id: 'interval', label: 'Heard as' }, { id: 'drift', label: 'Meeting place' }]);
    const vg = ui.group('Watch from');
    s.frame = ui.seg(vg, { options: [{ label: 'The stars', value: 'still' }, { label: 'The outer one', value: 'from' }, { label: 'Turning with it', value: 'riding' }], value: 'still', onChange: v => { s.view = v; this.resetTrails(); this.frameIt(); } });
    s.linesKey = ui.keys(vg, [{ id: 'lines', html: '<span class="m-led" aria-hidden="true"></span>Draw the line between the inner two', onClick: b => { s.lines = !s.lines; b.setAttribute('aria-pressed', String(s.lines)); s.linePairs = []; s.strings.clear(); } }]).lines;
    s.linesKey.setAttribute('aria-pressed', 'false');
    s.viewNote = ui.note(vg, '');
    const sg = ui.group('The score: a mark for every lap');
    s.scoreCanvas = ui.canvas(sg, { height: 112, label: 'A scrolling score with a mark each time a moon completes a lap' });
    s.sysNote = ui.note(sg, '');
    ctx.setSize('moons ×100');
    this.build('two', s.ratio);
  },

  build(system, ratio) {
    const s = this.s, ctx = this.ctx;
    s.moons.forEach(m => { ctx.group.remove(m.body); ctx.group.remove(m.trail.object); m.trail.dispose(); ctx.group.remove(m.orbit.object); m.orbit.dispose(); m.label.remove(); m.drone && m.drone.stop(); });
    s.moons = []; s.spokes = []; s.score = []; s.t = 0; s.linePairs = []; s.lastLine = 0; s.strings && s.strings.clear();
    // the string art belongs to one pair: a new system starts without it
    if (s.linesKey && system !== 'venus') { s.lines = false; s.linesKey.setAttribute('aria-pressed', 'false'); } s.system = system; s.ratio = ratio;
    s.sys.set(system);
    const sysDef = SYSTEMS[system];
    let periods, e = [], names = [], phase = [], omega = [];
    if (!sysDef) { periods = [1, ratio]; names = ['inner', 'outer']; phase = [0, 0]; s.fr.set(ratio); }
    else { const p0 = sysDef.periods[0]; periods = sysDef.periods.map(p => p / p0); e = sysDef.e || []; names = sysDef.names; phase = sysDef.phase; omega = sysDef.omega || []; }
    s.pairGroup.hidden = !!sysDef;   // the pair's own controls only show for your pair
    const aMax = Math.pow(periods[periods.length - 1], 2 / 3);
    s.K = SPAN / aMax;
    periods.forEach((P, i) => {
      const a = Math.pow(P, 2 / 3);                       // the third law places each moon
      const col = MOON_COLORS[i % MOON_COLORS.length];
      const body = planet(0.06 + 0.012 * (i === periods.length - 1), col);
      ctx.group.add(body);
      const trail = new Trail({ capacity: 2400, color: col, width: 1.1, opacity: 0.85, minStep: 0.004 * aMax });
      ctx.group.add(trail.object);
      const orbit = new FatLine({ capacity: 129, color: col, width: 1, opacity: 0.22, closed: true });
      ctx.group.add(orbit.object);
      const label = ctx.label(names[i], 'label--planet');
      s.moons.push({ P, a, e: e[i] || 0, omega: (omega[i] || 0) * Math.PI / 180, phase0: (phase[i] || 0) * Math.PI / 180, body, trail, orbit, label, col, laps: 0, x: 0, y: 0, lon: 0, drone: null });
    });
    s.sysNote.innerHTML = !sysDef
      ? 'A mark for each lap. A simple ratio repeats exactly.'
      : system === 'venus' ? '13 Venus years ≈ 8 of ours. Draw the lines for the rose.'
      : system === 'pluto' ? 'Pluto at its real eccentricity. Choose Turning with it, and watch Pluto swing wide of Neptune every time.'
      : system === 'laplace' ? 'Real periods: 1.77, 3.55 and 7.15 days. Not exact doubles, yet the three never line up together.'
      : 'Seven Earth-sized planets, 40 light years away, in a chain of 8:5, 5:3, 3:2, 3:2, 4:3 and 3:2.';
    this.resetTrails();
    this.readouts();
    this.startDrones();
    this.frameIt();
  },

  /* fit the camera to what this view shows: the outermost far point, or both orbits seen from the outer one */
  frameIt() {
    const s = this.s, outer = s.moons[s.moons.length - 1];
    const far = Math.max(...s.moons.map(m => m.a * (1 + m.e))) * s.K;
    const r = s.view === 'from' ? (outer.a + s.moons[0].a) * s.K * 0.55 * 1.05 : far * 1.06;
    if (this.ctx.fit) this.ctx.fit(r);
  },

  startDrones() {
    const s = this.s, a = this.ctx.audio;
    if (!a.ready) return;
    const outer = s.moons[s.moons.length - 1];
    const gain = 0.05 / Math.sqrt(s.moons.length);
    s.moons.forEach((m, i) => { m.drone = a.drone({ freq: OUTER_HZ * outer.P / m.P, gain, wave: 'sawtooth', colour: 1600, pan: (i / Math.max(1, s.moons.length - 1)) * 1.2 - 0.6 }); });
  },
  onSound() { const s = this.s; if (s && !s.moons.some(m => m.drone)) this.startDrones(); },

  resetTrails() {
    const s = this.s;
    s.moons.forEach(m => m.trail.reset());
    // fixed orbit rings only make sense in the still frame
    s.moons.forEach(m => {
      const pts = []; for (let i = 0; i < 128; i++) { const st = keplerState(m.a, m.e, m.omega, i / 128 * TAU, GM_SUN); pts.push(st.x, st.y); }
      m.orbit.set(pts, s.K, 0, 128); m.orbit.object.visible = s.view === 'still';
    });
    s.spokes = []; s.linePairs = []; s.strings.clear();
    if (s.system === 'pluto' && s.view === 'riding') { s.viewNote.textContent = 'Neptune held still. Pluto swings in to Neptune\'s distance only when Neptune is a quarter of the way round: they never come within 17 AU.'; return; }
    s.viewNote.textContent = s.view === 'from' ? 'Standing on the outer moon, the others loop back on themselves: the epicycles astronomers drew for two thousand years.'
      : s.view === 'riding' ? 'The outer moon held still. A circle stays a circle; a stretched orbit, like Pluto\'s, swings wide of it every time.'
      : 'The line between the inner two leaves a figure with (top − bottom) petals: 13 − 8 = 5 for Venus.';
  },

  readouts() {
    const s = this.s, r = s.read, ctx = this.ctx;
    if (s.system !== 'two') {
      const real = { venus: ['13:8 (1.626)', 'near a minor sixth', '5 places'], pluto: ['3:2 (1.504)', 'a perfect fifth', 'Pluto\'s far side'],
        laplace: ['2:1, 2:1 (2.007, 2.015)', 'two octaves', 'never all three'], trappist: ['8:5 5:3 3:2 3:2 4:3 3:2', 'a seven-note chord', 'a chain'] }[s.system];
      r.set('near', real[0]); r.set('interval', real[1]); r.set('drift', real[2]); s.locked = false; return;
    }
    const f = nearestFraction(s.ratio), key = `${f.p}:${f.q}`;
    r.set('near', key);
    r.set('interval', f.err < 0.004 ? (INTERVALS[key] || 'an interval') : 'beating');
    // successive meetings advance by 360°/(ratio − 1); report how far that is from a fixed set of places
    const step = 360 / (s.ratio - 1);
    const places = f.p - f.q;
    const drift = ((step % (360 / places)) + 360 / places) % (360 / places);
    const d = Math.min(drift, 360 / places - drift);
    r.set('drift', d < 0.3 ? (places === 1 ? 'stays put' : `${places} fixed places`) : `${ctx.fmt(d, 1)}° a meeting`);
    s.locked = f.err < 0.004 && f.q > 0 && f.p !== f.q;
    s.isFifth = key === '3:2' && f.err < 0.004;
  },

  frame(ctx, real, dt) {
    const s = this.s;
    s.t += dt;
    const outer = s.moons[s.moons.length - 1];
    const tmp = {};
    // positions in the still frame
    for (const m of s.moons) {
      const M = m.phase0 + TAU * s.t / m.P;
      if (m.e > 0) keplerState(m.a, m.e, m.omega, M, GM_SUN, tmp); else { tmp.x = m.a * Math.cos(M); tmp.y = m.a * Math.sin(M); }
      m.prevLon = m.lon; m.x = tmp.x; m.y = tmp.y; m.lon = Math.atan2(tmp.y, tmp.x);
      const laps = Math.floor(M / TAU);
      if (laps !== m.laps) { m.laps = laps; s.score.push({ t: s.t, i: s.moons.indexOf(m) }); m.flash = 1; }
    }
    // meetings of neighbours: their longitude difference passes through zero
    for (let i = 0; i < s.moons.length - 1; i++) {
      const a = s.moons[i], b = s.moons[i + 1];
      const d = wrapAngle(a.lon - b.lon), dPrev = a.dPrev;
      if (dPrev !== undefined && dPrev < 0 && d >= 0 && dt > 0) {
        s.spokes.push({ lon: b.lon, r: Math.max(Math.hypot(b.x, b.y), Math.hypot(a.x, a.y)) * 1.08, born: s.t, pair: i });
        if (s.spokes.length > 60) s.spokes.shift();
        ctx.audio.pluck(OUTER_HZ * outer.P / b.P / 2, { gain: 0.1, decay: 0.7, bright: 0.25 });
        s.score.push({ t: s.t, i: -1 });
      }
      a.dPrev = d;
    }
    // the view: the stars, the outer moon (moving with it, not turning), or turning with it
    const ref = s.system === 'pluto' ? s.moons[0] : outer;   // for Pluto, hold Neptune still: that is where the avoidance shows
    const rot = s.view === 'riding' ? -ref.lon : 0, cr = Math.cos(rot), sr = Math.sin(rot);
    const ox = s.view === 'from' ? outer.x : 0, oy = s.view === 'from' ? outer.y : 0;
    const K = s.view === 'from' ? s.K * 0.55 : s.K;
    const view = (x, y) => [(x - ox) * cr - (y - oy) * sr, (x - ox) * sr + (y - oy) * cr];
    const [cx, cy] = view(0, 0);
    s.centre.position.set(cx * K, 0, -cy * K);
    for (const m of s.moons) {
      const [x, y] = view(m.x, m.y);
      m.body.position.set(x * K, 0, -y * K);
      m.label.at(x * K, 0, -y * K - 0.16);
      if (dt > 0 && !(s.view === 'from' && m === outer)) m.trail.push(x, y);
      m.trail.draw(K, 0);
      if (m.flash) { m.flash = Math.max(0, m.flash - real * 2); m.body.userData.halo.scale.setScalar((0.07) * 7 * (1 + m.flash * 1.2)); }
    }
    // string art: the line between the inner two, every 1/40 of the inner lap
    if (s.lines && dt > 0 && s.moons.length > 1) {
      while (s.t - s.lastLine >= s.moons[0].P / 40) {
        s.lastLine += s.moons[0].P / 40;
        const [ax, ay] = view(s.moons[0].x, s.moons[0].y), [bx, by] = view(s.moons[1].x, s.moons[1].y);
        s.linePairs.push(ax, ay, bx, by);
        if (s.linePairs.length > 520 * 4) s.linePairs.splice(0, 4);   // 13 Venus laps × 40: exactly one eight-year rose, nothing drawn twice
      }
      // each string is dim, so where they cross the light builds to brass, not white; the oldest fade out
      const n = s.linePairs.length / 4;
      if (!s.stringBright) s.stringBright = new Float32Array(1600);
      for (let i = 0; i < n; i++) s.stringBright[i] = 0.09 + 0.24 * Math.sqrt(i / n);   // the faded halves average out darker, so the middle can be brighter
      s.strings.fadedStrings(s.linePairs, K, -0.003, s.stringBright);   // bright where the rose is, gone by the orbits
    }
    // spokes: each meeting leaves a line from the centre, fading but never quite gone, so a lock piles them up
    const pairs = [], bright = [];
    for (const sp of s.spokes) {
      if (s.view === 'from') break;
      const lon = sp.lon + rot, age = s.t - sp.born;
      pairs.push(0.25 * Math.cos(lon), 0.25 * Math.sin(lon), sp.r * Math.cos(lon), sp.r * Math.sin(lon));
      bright.push(0.12 + 0.6 * Math.exp(-age / (outer.P * 2)));
    }
    s.spokeLine.segments(pairs, K, -0.002, bright);
    // a lock held for two seconds of real time counts (only for a pair you tuned yourself)
    if (s.system === 'two' && s.byHand && s.locked) { s.lockedFor += real; if (s.lockedFor > 2) { const at = [outer.body.position.x, outer.body.position.z]; ctx.goal('lock', at); if (s.isFifth) ctx.goal('fifth', at); } }
    else s.lockedFor = 0;
    this.drawScore();
  },

  drawScore() {
    const s = this.s, c = s.scoreCanvas, g = c.g, w = c.w, h = c.h;
    g.clearRect(0, 0, w, h);
    const outer = s.moons[s.moons.length - 1];
    const window_ = Math.max(4, outer.P * 3);           // three outer laps across the strip
    const n = s.moons.length, rowH = (h - 18) / n;
    const X = t => w - 6 - (s.t - t) / window_ * (w - 12);
    g.strokeStyle = 'rgba(231,215,168,0.1)'; g.lineWidth = 1;
    for (let i = 0; i <= n; i++) { const y = 14 + i * rowH; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    while (s.score.length && s.t - s.score[0].t > window_) s.score.shift();
    for (const ev of s.score) {
      const x = X(ev.t);
      if (ev.i < 0) { g.fillStyle = 'rgba(231,215,168,0.55)'; g.fillRect(x - 0.5, 2, 1, 9); continue; }
      const m = s.moons[ev.i]; if (!m) continue;
      g.fillStyle = '#' + m.col.toString(16).padStart(6, '0');
      const y = 14 + (n - 1 - ev.i) * rowH + rowH / 2;
      g.beginPath(); g.ellipse(x, y, 4.5, Math.min(3.2, rowH * 0.3), 0, 0, TAU); g.fill();
    }
  },

  finale() {
    const o = this.s.moons[this.s.moons.length - 1].body.position;
    return { text: 'Three laps against two: a perfect fifth. Neptune and Pluto have kept this time for billions of years.', at: [0, 0], radius: 3.3 };
  },

  exit() { const s = this.s; if (s) s.moons.forEach(m => m.drone && m.drone.stop()); this.s = null; },
};
