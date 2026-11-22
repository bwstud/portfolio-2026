/* 3 · Harmony — Kepler's third law. The six planets Kepler knew, at their real distances and periods, roughly where
   they are tonight. Each rings once per lap of its own. A test planet you move shows P² = a³ on a log plot. */
import * as THREE from 'three';
import { keplerState, elements, conicPoints, propagate, GM_SUN, TAU, DAYS_PER_YEAR } from '../physics.js';
import { FatLine, COLOR, star, planet, halo } from '../draw.js';
import { PLANETS, yearsSinceJ2000 } from '../data.js';

const K = 0.5;                          // world units per AU
const D2R = Math.PI / 180;
const mu = GM_SUN;
const pitch = P => 330 * Math.pow(1 / P, 0.45);     // the bell: faster laps ring higher (squeezed so seven octaves fit in four)

function saturnRings(r) {
  const g = new THREE.RingGeometry(r * 1.35, r * 2.3, 64, 1);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe6d6a2, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2 + 0.47;
  return m;
}

export default {
  id: 'harmony',
  name: 'Harmony',
  title: 'The square of the year is the cube of the distance',
  prose: `<p>Kepler spent twenty years looking for the rule that ties a planet's distance to the length of its year. He found it in 1618 and published it in <i>Harmonices Mundi</i>, his book on the music of the planets.</p>
    <p>Each planet here rings once per lap. Farther out, the laps are longer and the bells lower. Plot distance against year on log scales and every planet falls on one straight line.</p>`,
  predict: {
    question: 'A planet four times farther from the Sun than Earth. How long is its year?',
    options: ['4 years', '8 years', '16 years'],
    answer: 1,
    reveal: `<p>The year squared is the distance cubed: 4 × 4 × 4 = 64, and 8 × 8 = 64. Eight years. Move the test planet to 4 AU and check.</p>`,
  },
  goals: [
    { id: 'two', text: 'Move the test planet until its year lasts two years' },
    { id: 'eight', text: 'Find the distance where a year lasts eight' },
  ],
  speeds: [
    { label: '1 s = 10 days', short: '10 d/s', value: 10 / DAYS_PER_YEAR },
    { label: '1 s = 30 days', short: '30 d/s', value: 30 / DAYS_PER_YEAR },
    { label: '1 s = 100 days', short: '100 d/s', value: 100 / DAYS_PER_YEAR },
    { label: '1 s = 1 year', short: '1 yr/s', value: 1 },
  ],
  speedIndex: 1,
  camera: { target: [0, 0, 0], radius: 5.0, polar: 34, azimuth: 0, min: 1, max: 80 },
  chordRoot: 329.63,

  enter(ctx) {
    const { group, ui } = ctx;
    this.ctx = ctx;
    ctx.sunLight.position.set(0, 0, 0);
    const s = this.s = { t: yearsSinceJ2000(), bodies: [], testA: 2.2 };
    group.add(star(0.09));

    for (const p of PLANETS) {
      const body = planet(p.size, p.color);
      if (p.name === 'Saturn') body.add(saturnRings(p.size));
      group.add(body);
      const st = keplerState(p.a, p.e, p.varpi * D2R, 0, mu);
      const line = new FatLine({ capacity: 257, color: p.color, width: 1, opacity: 0.32 });
      line.set(conicPoints(elements(st, mu), 256), K, 0);
      group.add(line.object);
      const label = ctx.label(p.name, 'label--planet');
      const n = TAU / p.P, M0 = (p.L - p.varpi) * D2R;
      s.bodies.push({ p, body, label, n, M0, laps: Math.floor((M0 + n * s.t) / TAU) });
    }

    if (ctx.ambient) return;

    // the test planet: a circular orbit you can move
    s.test = planet(0.04, COLOR.copper); group.add(s.test);
    s.testLine = new FatLine({ capacity: 129, color: COLOR.copper, width: 1.3, opacity: 0.8, closed: true });
    group.add(s.testLine.object);
    s.testLabel = ctx.label('test planet', 'label--planet label--copper');
    s.testPhase = 0; s.testLaps = 0;

    const g = ui.group('Test planet');
    s.fa = ui.fader(g, { label: 'Distance from the Sun', unit: 'AU', min: 0.2, max: 12, step: 0.01, value: s.testA, digits: 2, onInput: a => this.setTest(a) });
    s.read = ui.readouts(g, [{ id: 'year', label: 'Its year' }, { id: 'check', label: 'Year² ÷ distance³' }, { id: 'drop', label: 'Stopped dead, it falls in' }]);
    s.dropKey = ui.keys(g, [{ id: 'drop', label: 'Stop it dead, and let it fall', onClick: () => this.drop() }]).drop;
    s.dropNote = ui.note(g, 'A straight fall is the thinnest ellipse there is: half as wide as the orbit, so the third law times it.');
    ui.seg(ui.group('View'), { options: [{ label: 'Inner planets', value: 'inner' }, { label: 'All six', value: 'all' }], value: 'all', onChange: v => this.view(v) });
    const pg = ui.group('Distance against year, on log scales');
    s.plot = ui.canvas(pg, { height: 190, onResize: () => this.s && this.drawPlot(), label: 'Log-log plot of orbital distance against year length: all planets on one straight line of slope three halves' });
    s.table = document.createElement('table'); s.table.className = 'ktable';
    s.table.innerHTML = `<thead><tr><th scope="col">Planet</th><th scope="col">Distance, AU</th><th scope="col">Year, years</th><th scope="col">Year² ÷ distance³</th></tr></thead><tbody>${
      PLANETS.map(p => `<tr><th scope="row">${p.name}</th><td>${p.a.toFixed(3)}</td><td>${p.P.toFixed(3)}</td><td>${(p.P * p.P / (p.a ** 3)).toFixed(3)}</td></tr>`).join('')}</tbody>`;
    pg.appendChild(s.table);
    ui.note(pg, 'Measured years, not computed ones. Jupiter comes out a hair under 1 because its own mass pulls back on the Sun.');
    ctx.setSize('planets ×1000 or more, Sun ×10');
    this.setTest(s.testA);
  },

  view(v) {
    const ctx = this.ctx, phone = ctx.isPhone();
    ctx.fit(v === 'inner' ? Math.max(0.85, this.s.testA * K * 1.08) : 5.0, { polar: v === 'inner' ? 26 : 34 });
  },

  setTest(a) {
    const s = this.s;
    s.testA = a;
    const P = Math.pow(a, 1.5);
    const pts = []; for (let i = 0; i < 128; i++) { const t = i / 128 * TAU; pts.push(a * Math.cos(t), a * Math.sin(t)); }
    s.testLine.set(pts, K, 0, 128);
    s.read.set('year', P < 2 ? `${this.ctx.fmt(P * DAYS_PER_YEAR, 0)} days (${this.ctx.fmt(P, 2)} years)` : `${this.ctx.fmt(P, 2)} years`);
    s.read.set('check', this.ctx.fmt(P * P / (a * a * a), 3));
    const fall = P / (4 * Math.SQRT2);                   // half the period of an ellipse with a = r/2
    s.read.set('drop', fall < 1 ? `${this.ctx.fmt(fall * DAYS_PER_YEAR, 0)} days` : `${this.ctx.fmt(fall, 2)} years`);
    const at = [s.test.position.x, s.test.position.z];
    if (Math.abs(P - 2) < 0.02) this.ctx.goal('two', at);
    if (Math.abs(P - 8) < 0.05) this.ctx.goal('eight', at);
    this.drawPlot();
  },

  drawPlot() {
    const s = this.s, c = s.plot, g = c.g, w = c.w, h = c.h;
    g.clearRect(0, 0, w, h);
    const pad = { l: 34, r: 10, t: 10, b: 24 };
    const ax = [-0.7, 1.15], ay = [-1.0, 1.65];                  // log10 of AU and of years
    const X = v => pad.l + (Math.log10(v) - ax[0]) / (ax[1] - ax[0]) * (w - pad.l - pad.r);
    const Y = v => h - pad.b - (Math.log10(v) - ay[0]) / (ay[1] - ay[0]) * (h - pad.t - pad.b);
    g.font = '10px "Söhne Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(231,215,168,0.55)'; g.strokeStyle = 'rgba(231,215,168,0.12)'; g.lineWidth = 1;
    for (const a of [0.3, 1, 3, 10]) { g.beginPath(); g.moveTo(X(a), pad.t); g.lineTo(X(a), h - pad.b); g.stroke(); g.textAlign = 'center'; g.fillText(a + ' AU', X(a), h - 8); }
    for (const p of [0.1, 1, 10]) { g.beginPath(); g.moveTo(pad.l, Y(p)); g.lineTo(w - pad.r, Y(p)); g.stroke(); g.textAlign = 'right'; g.fillText(p + ' yr', pad.l - 4, Y(p) + 3); }
    // the law itself: slope 3/2 through (1 AU, 1 yr)
    g.strokeStyle = 'rgba(231,215,168,0.6)'; g.lineWidth = 1.25;
    g.beginPath(); g.moveTo(X(0.2), Y(Math.pow(0.2, 1.5))); g.lineTo(X(14), Y(Math.pow(14, 1.5))); g.stroke();
    for (const b of s.bodies) {
      const col = '#' + b.p.color.toString(16).padStart(6, '0');
      g.fillStyle = col;
      g.beginPath(); g.arc(X(b.p.a), Y(b.p.P), 3.2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(231,215,168,0.7)'; g.textAlign = 'left';
      g.fillText(b.p.name, X(b.p.a) + 6, Y(b.p.P) + 10);
    }
    const a = s.testA, P = Math.pow(a, 1.5);
    g.fillStyle = '#e08a3c'; g.strokeStyle = '#e08a3c';
    g.beginPath(); g.arc(X(a), Y(P), 4.5, 0, TAU); g.fill();
    g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(X(a), Y(P)); g.lineTo(X(a), h - pad.b); g.moveTo(X(a), Y(P)); g.lineTo(pad.l, Y(P)); g.stroke();
    g.setLineDash([]);
  },

  frame(ctx, real, dt) {
    const s = this.s;
    s.t += dt;
    const tmp = {};
    for (const b of s.bodies) {
      const M = b.M0 + b.n * s.t;
      keplerState(b.p.a, b.p.e, b.p.varpi * D2R, M, mu, tmp);
      b.body.position.set(tmp.x * K, 0, -tmp.y * K);
      b.body.rotation.y += real * 0.3;
      b.label.at(tmp.x * K, 0, -tmp.y * K - b.p.size - 0.08);
      if (b.p.a < 2) { const p = ctx.toScreen(tmp.x * K, 0, -tmp.y * K), o = ctx.toScreen(0, 0, 0); b.label.show(Math.hypot(p.x - o.x, p.y - o.y) > 46 || b.p.name === 'Earth'); }
      const laps = Math.floor(M / TAU);
      if (laps !== b.laps) {
        b.laps = laps;
        const pan = Math.max(-1, Math.min(1, tmp.x / 6));
        ctx.audio.pluck(pitch(b.p.P), { gain: 0.13, pan, decay: 2.6 + b.p.P * 0.05 });
        this.flash(b);
      }
      if (b.flash) { b.flash = Math.max(0, b.flash - real * 1.4); b.body.userData.halo.material.opacity = 0.55 + b.flash * 0.9; b.body.userData.halo.scale.setScalar(b.p.size * 7 * (1 + b.flash * 1.5)); }
    }
    if (s.falling) {
      // the test planet, stopped dead (a breath of sideways speed, so the fall is a very thin ellipse, not a singularity)
      const f = s.falling;
      f.t += dt;
      const p = propagate(f.s0, f.t, mu);
      s.test.position.set(p.x * K, 0, -p.y * K);
      s.testLabel.at(p.x * K, 0, -p.y * K - 0.12);
      if (Math.hypot(p.x, p.y) < 0.03 || f.t > f.limit) {
        ctx.audio.pluck(98, { gain: 0.2, decay: 1.4, bright: 0.4 });
        ctx.announce(`It fell into the Sun after ${Math.round(f.t * DAYS_PER_YEAR)} days.`);
        s.dropNote.textContent = `It fell in after ${Math.round(f.t * DAYS_PER_YEAR)} days. From Earth's distance it would take 65: about two months.`;
        s.falling = null; s.dropKey.disabled = false; s.fa.range.disabled = false; s.fa.num.disabled = false;
        ctx.pulse(0, 0, 0xfff1d0);
      }
    } else if (s.test) {
      const P = Math.pow(s.testA, 1.5);
      s.testPhase += dt / P * TAU;
      if (s.testPhase >= TAU) { s.testPhase -= TAU; ctx.audio.pluck(pitch(P), { gain: 0.13, decay: 2.4 }); }
      const x = s.testA * Math.cos(s.testPhase), y = s.testA * Math.sin(s.testPhase);
      s.test.position.set(x * K, 0, -y * K);
      s.testLabel.at(x * K, 0, -y * K - 0.12);
    }
  },

  flash(b) { b.flash = 1; },

  drop() {
    const s = this.s;
    if (s.falling) return;
    const x = s.testA * Math.cos(s.testPhase), y = s.testA * Math.sin(s.testPhase);
    const v = 1e-4 * Math.sqrt(mu / s.testA);
    s.falling = { s0: { x, y, vx: -v * Math.sin(s.testPhase), vy: v * Math.cos(s.testPhase) }, t: 0, limit: Math.pow(s.testA, 1.5) / (4 * Math.SQRT2) * 1.02 };
    s.dropKey.disabled = true; s.fa.range.disabled = true; s.fa.num.disabled = true;
    this.ctx.audio.pluck(392, { gain: 0.12, decay: 1.2 });
  },

  finale() {
    return { text: 'Two years at 1.59 AU, eight at 4. The year squared is the distance cubed, for every planet, and for the ones you made.', at: [0, 0], radius: 2.4 };
  },

  exit() { this.s = null; },
};
