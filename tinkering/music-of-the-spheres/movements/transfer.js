/* 6 · Transfer — Earth to Mars on a Hohmann-like ellipse. Earth and Mars run on their real elliptical orbits from
   the J2000 elements, starting where they are tonight, so the launch windows fall on real dates. One plane: Mars's
   1.85° tilt is left out, and the page says so. */
import * as THREE from 'three';
import { propagate, elements, conicPoints, keplerState, burn, wrapAngle, angularSpeed, GM_SUN, KMS_PER_AU_YR, DAYS_PER_YEAR, TAU, GM_EARTH, R_EARTH } from '../physics.js';
import { FatLine, Trail, COLOR, star, planet, ring } from '../draw.js';
import { PLANETS, yearsSinceJ2000 } from '../data.js';

const mu = GM_SUN;
const K = 2.0;
const D2R = Math.PI / 180;
const CAPTURE = 0.0039;                                 // AU: Mars's sphere of influence, about 0.58 million km: inside it, Mars's pull wins over the Sun's
const orbitOf = p => ({ a: p.a, e: p.e, w: p.varpi * D2R, M0: (p.L - p.varpi) * D2R, n: TAU / p.P, pp: p.a * (1 - p.e * p.e) });
const EARTH = orbitOf(PLANETS[2]), MARS = orbitOf(PLANETS[3]);
const stateAt = (o, t, out = {}) => keplerState(o.a, o.e, o.w, o.M0 + o.n * t, mu, out);
const lonAt = (o, t) => { const s = stateAt(o, t); return Math.atan2(s.y, s.x); };
const radiusAtLon = (o, lon) => o.pp / (1 + o.e * Math.cos(lon - o.w));
const meanFromTrue = (e, nu) => { const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)); return E - e * Math.sin(E); };
const deg360 = a => ((a / D2R) % 360 + 360) % 360;
const MKM = 149.598;                                    // million km per AU

const HZ_EARTH = 220;                                   // pitch from angular speed: Earth's mean motion sounds A3
const hz = omega => HZ_EARTH * omega / EARTH.n;
const GM_MARS = 42828.37, R_MARS = 3389.5;           // km³/s², km
/* Captured into a 300 km circular orbit, the burn made low over Mars where it is worth most: the Oberth effect again. */
const marsCapture = vinf => Math.sqrt(vinf * vinf + 2 * GM_MARS / (R_MARS + 300)) - Math.sqrt(GM_MARS / (R_MARS + 300));
const leoBurn = vinf => Math.sqrt(vinf * vinf + 2 * GM_EARTH / (R_EARTH + 300)) - Math.sqrt(GM_EARTH / (R_EARTH + 300));

/* The Hohmann-like plan for leaving at t0: half an ellipse from Earth's distance now to Mars's distance on the far
   side; the burn it needs, the trip time, and the angle Mars must lead Earth by at departure to be there on arrival. */
function hohmannAt(t0) {
  const e = stateAt(EARTH, t0), r1 = Math.hypot(e.x, e.y), lE = Math.atan2(e.y, e.x);
  const lA = lE + Math.PI, r2 = radiusAtLon(MARS, lA), at = (r1 + r2) / 2;
  const dv = Math.sqrt(mu * (2 / r1 - 1 / at)) - Math.hypot(e.vx, e.vy);
  const tof = Math.PI * Math.sqrt(at ** 3 / mu);
  const mDep = meanFromTrue(MARS.e, wrapAngle(lA - MARS.w)) - MARS.n * tof;
  const st = keplerState(MARS.a, MARS.e, MARS.w, mDep, mu);
  const need = wrapAngle(Math.atan2(st.y, st.x) - lE);
  const have = wrapAngle(lonAt(MARS, t0) - lE);
  return { dv: dv * KMS_PER_AU_YR, tof, need, have, err: wrapAngle(have - need) };
}
/* The next moment the error passes through zero (Mars leading by just the right angle), searched a day at a time. */
function nextWindow(t, { skipOpen = false } = {}) {
  let prev = hohmannAt(t).err;
  if (!skipOpen && Math.abs(prev) < 4 * D2R) return t;
  for (let d = 1; d < 1000; d++) {
    const tt = t + d / DAYS_PER_YEAR, err = hohmannAt(tt).err;
    if (prev > 0 && err <= 0 && prev - err < 1) {
      let lo = tt - 1 / DAYS_PER_YEAR, hi = tt;
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (hohmannAt(m).err > 0) lo = m; else hi = m; }
      return hi;
    }
    prev = err;
  }
  return null;
}
const dateOf = t => new Date(Date.UTC(2000, 0, 1, 12) + t * 365.25 * 86400000);
const monthYear = t => dateOf(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export default {
  id: 'transfer',
  name: 'Transfer',
  title: 'Half an ellipse, and impeccable timing',
  prose: `<p>Mars is half again as far from the Sun as Earth. The cheapest way there is half of an ellipse that grazes Earth's orbit at one end and Mars's at the other.</p>
    <p>But Mars moves while you coast. The ghost shows where it will be when you arrive. Wait until it sits on your arrival point, then burn.</p>`,
  predict: {
    question: 'Mars is farther from the Sun. Which way do you point the engine to get there?',
    options: ['Straight out, away from the Sun', 'Forward, the way Earth is going', 'Straight at Mars'],
    answer: 1,
    reveal: `<p>Speed up along your orbit and its far side rises. About 2.5 to 3 km/s on top of Earth's 29.8 lifts the far side out to Mars. The trip is half an orbit: seven to nine months.</p>`,
  },
  goals: [
    { id: 'arrive', text: 'Reach Mars: get inside its sphere of influence, 0.6 million km' },
    { id: 'thrifty', text: 'Get there on 3.1 km/s or less' },
  ],
  speeds: [
    { label: '1 s = 5 days', short: '5 d/s', value: 5 / DAYS_PER_YEAR },
    { label: '1 s = 20 days', short: '20 d/s', value: 20 / DAYS_PER_YEAR },
    { label: '1 s = 60 days', short: '60 d/s', value: 60 / DAYS_PER_YEAR },
  ],
  speedIndex: 1,
  camera: { target: [0, 0, 0], radius: 3.55, polar: 16, azimuth: 0, min: 2, max: 60 },
  chordRoot: 349.23,

  enter(ctx) {
    const { group, ui } = ctx;
    this.ctx = ctx;
    ctx.sunLight.position.set(0, 0, 0);
    const now = yearsSinceJ2000();
    const s = this.s = { t: now, dv: 2.6, ship: null, arrived: false, best: Infinity, lastPlan: -1 };

    group.add(star(0.1));
    for (const [o, c] of [[EARTH, 0x7fb0dc], [MARS, 0xd9825a]]) {
      const l = new FatLine({ capacity: 257, color: c, width: 1, opacity: 0.38 });
      l.set(conicPoints(elements(stateAt(o, 0), mu), 256), K, 0);
      group.add(l.object);
    }
    s.earth = planet(0.06, 0x7fb0dc); s.mars = planet(0.05, 0xd9825a);
    group.add(s.earth, s.mars);
    s.ghost = ring(0.09, 0xd9825a, 1.2, 0.7, true); group.add(s.ghost.object);
    s.arrival = ring(0.06, COLOR.copper, 1.4, 0.9); group.add(s.arrival.object);
    s.preview = new FatLine({ capacity: 361, color: COLOR.copper, width: 1.4, opacity: 0.8, dashed: true, dash: 0.1, gap: 0.08 });
    s.shipMesh = planet(0.028, COLOR.copper);
    s.trail = new Trail({ capacity: 600, color: COLOR.copper, width: 1.8, opacity: 0.9, minStep: 0.004 });
    group.add(s.preview.object, s.shipMesh, s.trail.object);
    s.lab = { earth: ctx.label('Earth', 'label--planet'), mars: ctx.label('Mars', 'label--planet'),
      ghost: ctx.label('Mars, when you arrive', 'label--quiet'), ship: ctx.label('you', 'label--planet label--copper') };

    const g = ui.group('Departure burn');
    s.fdv = ui.fader(g, { label: 'Speed added, forward', unit: 'km/s', min: 0, max: 6, step: 0.01, value: s.dv, digits: 2, onInput: v => { s.dv = v; this.plan(); } });
    s.keys = ui.keys(g, [
      { id: 'burn', label: 'Burn', accent: true, onClick: () => this.launch() },
      { id: 'wait', label: 'Skip to the next window', onClick: () => this.skip() },
      { id: 'again', label: 'Back to Earth', onClick: () => this.home() },
    ]);
    s.spent = ui.note(g, 'The burn is spent. Press Back to Earth to plan another.'); s.spent.hidden = true;
    s.read = ui.readouts(g, [{ id: 'trip', label: 'Trip' }, { id: 'miss', label: 'Closest to Mars' }, { id: 'window', label: 'Window' }]);
    const dg = ui.group('How far Mars leads Earth');
    s.dial = ui.canvas(dg, { height: 150, label: 'Dial of the angle by which Mars leads Earth, with the angle a launch today would need marked' });
    s.phaseRead = ui.readouts(dg, [{ id: 'have', label: 'Mars leads by' }, { id: 'need', label: 'Leaving then needs' }]);
    s.windowNote = ui.note(dg, '');
    const cg = ui.group('What it costs');
    s.cost = ui.readouts(cg, [{ id: 'helio', label: 'Added to Earth\'s speed' }, { id: 'leo', label: 'From low Earth orbit' }, { id: 'match', label: 'To match Mars, far out' }, { id: 'stop', label: 'Into orbit, burning low' }]);
    ui.note(cg, 'Earth and Mars on their real ellipses, in one plane (Mars\'s orbit is tilted 1.85°, which real missions also correct for). Arriving, a burn made low over Mars costs far less than matching its speed far out: the Oberth effect again.');
    ctx.setSize('planets ×1500, Sun ×20; tonight\'s positions');

    // tonight's sky: is a window open, coming, or just gone?
    const h = hohmannAt(now), next = nextWindow(now, { skipOpen: true });
    s.windowNote.textContent = Math.abs(h.err) < 6 * D2R
      ? `At tonight's real positions a window is open: Mars leads Earth by ${Math.round(deg360(h.have))}°, close to the ${Math.round(deg360(h.need))}° a launch now needs. The next opens around ${next ? monthYear(next) : 'two years from now'}.`
      : h.err < 0 && h.err > -40 * D2R
        ? `At tonight's real positions the best moment of this window passed ${this.daysSinceWindow(now)} days ago. A slightly faster burn can still catch Mars; the next window opens around ${next ? monthYear(next) : 'two years from now'}.`
        : `The next window opens around ${next ? monthYear(next) : 'two years from now'}. Earth laps Mars every 26 months or so.`;
    this.home();
    this.startDrones();
  },

  daysSinceWindow(t) {
    let prev = hohmannAt(t).err;
    for (let d = 1; d < 200; d++) { const e = hohmannAt(t - d / DAYS_PER_YEAR).err; if (e > 0 && prev <= 0) return d; prev = e; }
    return 'some';
  },

  startDrones() {
    const s = this.s, a = this.ctx.audio;
    if (!a.ready || s.drones) return;
    s.drones = { earth: a.drone({ freq: hz(EARTH.n), gain: 0.022, pan: -0.3 }), mars: a.drone({ freq: hz(MARS.n), gain: 0.022, pan: 0.3 }), ship: null };
  },
  onSound() { this.startDrones(); },

  home() {
    const s = this.s;
    s.ship = null; s.arrived = false; s.missed = false; s.flown = null; s.best = Infinity; s.trail.reset();
    s.spent.hidden = true;
    s.ghost.object.visible = true; s.arrival.object.visible = true; s.lab.ghost.show(true);
    if (s.drones && s.drones.ship) { s.drones.ship.stop(); s.drones.ship = null; }
    s.keys.burn.disabled = false;
    s.fdv.range.disabled = false; s.fdv.num.disabled = false;
    this.plan();
  },

  /* Where the burn would take you: the closest pass to Mars over the next 16 months, and when. */
  plan() {
    const s = this.s, f = this.ctx.fmt;
    s.lastPlan = s.t;
    const st0 = s.ship ? s.ship.st0 : burn(stateAt(EARTH, s.t), s.dv / KMS_PER_AU_YR);
    const t0 = s.ship ? s.ship.t0 : s.t;
    const el = elements(st0, mu);
    const pts = conicPoints(el, 360, 4);
    s.preview.set(pts, K, 0.002, pts.length / 2);
    s.preview.object.visible = !s.arrived;
    let best = { d: Infinity, t: 0, p: null };
    const m = {}, step = 2 / DAYS_PER_YEAR;
    for (let t = 30 / DAYS_PER_YEAR; t < 1.35; t += step) {
      const p = propagate(st0, t, mu);
      if (Math.hypot(p.x, p.y) < 1.3) continue;          // only out where Mars could be, not back near Earth at the start
      stateAt(MARS, t0 + t, m);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < best.d) best = { d, t, p, m: { ...m } };
    }
    // the samples are two days apart; refine the closest pass to within a few minutes
    if (best.p) {
      let lo = best.t - step, hi = best.t + step;
      const dist = t => { const p = propagate(st0, t, mu), mm = stateAt(MARS, t0 + t); return Math.hypot(p.x - mm.x, p.y - mm.y); };
      for (let k = 0; k < 40; k++) { const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618; if (dist(a) < dist(b)) hi = b; else lo = a; }
      const t = (lo + hi) / 2;
      best = { d: dist(t), t, p: propagate(st0, t, mu), m: stateAt(MARS, t0 + t) };
    }
    if (!best.p) { const p = propagate(st0, el.e < 1 ? el.period / 2 : 1, mu); best = { d: Infinity, t: el.e < 1 ? el.period / 2 : 1, p, m: stateAt(MARS, t0 + (el.e < 1 ? el.period / 2 : 1)) }; }
    s.plan_ = best;
    const reaches = el.e >= 1 || el.ra >= MARS.a * (1 - MARS.e);
    const show = !s.arrived;   // after arrival the plan's markers stay hidden, whoever calls plan()
    s.ghost.object.visible = show; s.arrival.object.visible = show; s.lab.ghost.show(show);
    s.ghost.object.position.set(best.m.x * K, 0, -best.m.y * K);
    s.lab.ghost.at(best.m.x * K, 0, -best.m.y * K - 0.2);
    s.arrival.object.position.set(best.p.x * K, 0.002, -best.p.y * K);
    s.plan_.reaches = reaches;
    this.writeFlight();
    s.cost.set('helio', `${f(s.ship ? s.ship.dv : s.dv, 2)} km/s`);
    s.cost.set('leo', `${f(leoBurn(s.ship ? s.ship.dv : s.dv), 2)} km/s`);
    // arriving: the speed you would still have to lose to fly alongside Mars
    const pa = propagate(st0, best.t, mu);
    const vinf = Math.hypot(pa.vx - best.m.vx, pa.vy - best.m.vy) * KMS_PER_AU_YR;
    s.cost.set('match', reaches ? `${f(vinf, 2)} km/s` : '–');
    s.cost.set('stop', reaches ? `${f(marsCapture(vinf), 2)} km/s` : '–');
    s.vinf = reaches ? vinf : null;
  },

  /* The one place the trip readouts are written, by state: planning, flying, arrived, or missed. */
  writeFlight() {
    const s = this.s, f = this.ctx.fmt, r = s.read, p = s.plan_;
    if (!p) return;
    if (!s.ship) {
      r.set('trip', p.reaches ? `${f(p.t * DAYS_PER_YEAR, 0)} days` : 'never reaches Mars\'s orbit');
      r.set('miss', isFinite(p.d) ? `${f(p.d * MKM, 1)} million km` : '–');
    } else if (s.arrived) {
      r.set('trip', `${s.flown.days} days, flown`);
      r.set('miss', `arrived, ${f(s.flown.d * MKM, 2)} million km out`);
      r.set('window', '–');
    } else if (s.missed) {
      r.set('trip', `missed Mars by ${f(s.best * MKM, 0)} million km`);
      r.set('miss', `${f(s.best * MKM, 1)} million km`);
    } else {
      r.set('trip', `${f(p.t * DAYS_PER_YEAR, 0)} days, planned`);
      r.set('miss', isFinite(s.best) ? `${f(s.best * MKM, 1)} million km so far` : '–');
    }
  },

  launch() {
    const s = this.s;
    if (s.ship) return;
    s.ship = { st0: burn(stateAt(EARTH, s.t), s.dv / KMS_PER_AU_YR), t0: s.t, dv: s.dv, h: hohmannAt(s.t) };
    s.keys.burn.disabled = true;
    s.fdv.range.disabled = true; s.fdv.num.disabled = true;   // the burn is spent: Back to Earth to try another
    s.spent.hidden = false;
    s.best = Infinity;
    this.ctx.setPlaying(true);
    this.ctx.audio.pluck(174.61, { gain: 0.15, decay: 2, bright: 0.8 });
    if (s.drones) { s.drones.ship && s.drones.ship.stop(); s.drones.ship = this.ctx.audio.drone({ freq: hz(EARTH.n), gain: 0.04, colour: 2000 }); }
    this.plan();
  },

  skip() {
    // to the next window, then stop the clock there so the burn can be set by hand
    const s = this.s;
    const w = nextWindow(s.t + 3 / DAYS_PER_YEAR, { skipOpen: true });
    if (w === null) return;
    if (s.ship && !s.arrived) this.home();
    const days = Math.round((w - s.t) * DAYS_PER_YEAR);
    s.t = w;
    const h = hohmannAt(w);
    this.ctx.setPlaying(false);
    this.ctx.announce(`Skipped ${days} days, to ${dateOf(w).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. The clock is stopped: set the burn, then press Burn.`);
    s.windowNote.textContent = `${dateOf(w).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}: Mars leads by the angle a launch needs. A Hohmann transfer from here takes ${Math.round(h.tof * DAYS_PER_YEAR)} days.`;
    this.plan();
  },

  frame(ctx, real, dt) {
    const s = this.s, f = ctx.fmt;
    s.t += dt;
    const E = stateAt(EARTH, s.t), M = stateAt(MARS, s.t);
    s.earth.position.set(E.x * K, 0, -E.y * K); s.mars.position.set(M.x * K, 0, -M.y * K);
    s.lab.earth.at(E.x * K, 0, -E.y * K - 0.18); s.lab.mars.at(M.x * K, 0, -M.y * K - 0.17);
    if (s.drones) { s.drones.earth.setFreq(hz(angularSpeed(E))); s.drones.mars.setFreq(hz(angularSpeed(M))); }   // each wobbles over its own year
    let P;
    if (!s.ship) {
      P = E;
      if (dt && Math.abs(s.t - s.lastPlan) > 0.5 / DAYS_PER_YEAR) this.plan();   // the plan moves with the planets; half a day is fine enough
    } else if (s.arrived) {
      P = M;
    } else {
      P = propagate(s.ship.st0, s.t - s.ship.t0, mu);
      s.trail.push(P.x, P.y);
      if (s.drones && s.drones.ship) s.drones.ship.setFreq(hz(angularSpeed(P)));   // slower as it climbs: the pitch falls
      const d = Math.hypot(P.x - M.x, P.y - M.y);
      s.best = Math.min(s.best, d);
      if (d < CAPTURE) {
        s.arrived = true;
        const at = [M.x * K, -M.y * K];
        const days = Math.round((s.t - s.ship.t0) * DAYS_PER_YEAR);
        s.finale = `Arrived ${dateOf(s.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${days} days after leaving, on ${f(s.ship.dv, 2)} km/s. Burned low over Mars, another ${f(marsCapture(s.vinf || 2.6), 2)} km/s would let you stay.`;
        s.flown = { days, d };
        ctx.setPlaying(false);   // hold the arrival: the trail ends at Mars while the finale frames the journey
        ctx.goal('arrive', at);
        if (s.ship.dv <= 3.1) ctx.goal('thrifty', at);
        if (s.drones && s.drones.ship) s.drones.ship.setFreq(hz(angularSpeed(M)));   // a second burn would match Mars: the ship's note joins Mars's
        ctx.announce(`Arrived at Mars after ${days} days.`);
        s.preview.object.visible = false; s.ghost.object.visible = false; s.arrival.object.visible = false; s.lab.ghost.show(false);
      } else if (s.t - s.ship.t0 > s.plan_.t + 0.12) {
        s.missed = true;
      }
      this.writeFlight();
    }
    s.trail.draw(K, 0.001);
    const r = Math.hypot(P.x, P.y), off = s.ship ? 0 : 0.09 / (K * r);     // riding along with Earth, just outside it
    s.shipMesh.position.set(P.x * K * (1 + off), 0.002, -P.y * K * (1 + off));
    s.lab.ship.at(s.shipMesh.position.x, 0, s.shipMesh.position.z + 0.2).show(!!s.ship && !s.arrived);

    // the phase: how far Mars leads, and what leaving now would need; the window rings as the two meet
    const h = s.ship ? s.ship.h : hohmannAt(s.t);   // after launch, the dial keeps the departure picture
    s.phaseRead.set('have', `${f(deg360(h.have), 1)}°`);
    s.phaseRead.set('need', `${f(deg360(h.need), 1)}°, ${f(h.dv, 2)} km/s`);
    const open = Math.abs(h.err) < 4 * D2R;
    if (!s.ship && s.prevErr !== undefined && s.prevErr > 0 && h.err <= 0 && s.prevErr - h.err < 1 && dt > 0) {
      ctx.audio.pluck(hz(MARS.n) * 2, { gain: 0.14, decay: 2.6 }); ctx.audio.pluck(hz(EARTH.n) * 2, { gain: 0.1, decay: 2.6, delay: 0.12 });
      ctx.pulse(E.x * K, -E.y * K, 0x7fb0dc); ctx.announce('The launch window is open.');
    }
    s.prevErr = h.err;
    if (!s.ship) {
      if (open) s.read.set('window', 'open now');
      else if (!s.nextW || s.nextW < s.t || Math.abs(s.t - (s.nextWAt || 0)) > 10 / DAYS_PER_YEAR) { s.nextW = nextWindow(s.t, { skipOpen: true }); s.nextWAt = s.t; }
      if (!open && s.nextW) s.read.set('window', `${f((s.nextW - s.t) * DAYS_PER_YEAR, 0)} days, ${dateOf(s.nextW).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`);
    }
    this.drawDial(h);
  },

  drawDial(h) {
    const s = this.s, c = s.dial, g = c.g, w = c.w, ht = c.h;
    g.clearRect(0, 0, w, ht);
    const cx = w / 2, cy = ht / 2 + 4, R = Math.min(w, ht) * 0.4;
    g.strokeStyle = 'rgba(231,215,168,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    // Earth's direction is straight up; angles go anticlockwise, the way the planets move
    const at = a => [cx + R * Math.cos(-Math.PI / 2 - a), cy + R * Math.sin(-Math.PI / 2 - a)];
    g.strokeStyle = 'rgba(224,138,60,0.9)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2 - h.need - 0.06, -Math.PI / 2 - h.need + 0.06); g.stroke();
    g.lineCap = 'butt';
    const [ex, ey] = at(0), [mx, my] = at(h.have);
    g.strokeStyle = 'rgba(231,215,168,0.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.moveTo(cx, cy); g.lineTo(mx, my); g.stroke();
    g.fillStyle = '#7fb0dc'; g.beginPath(); g.arc(ex, ey, 5, 0, TAU); g.fill();
    g.fillStyle = '#d9825a'; g.beginPath(); g.arc(mx, my, 4.5, 0, TAU); g.fill();
    g.fillStyle = '#fff1d0'; g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
    g.font = '11px Newsreader, Georgia, serif'; g.fillStyle = 'rgba(231,215,168,0.8)'; g.textAlign = 'center';
    g.fillText('Earth', ex, ey - 10);
    const [wx, wy] = at(h.need); g.fillStyle = 'rgba(224,138,60,0.95)';
    const left = wx < cx; g.textAlign = left ? 'left' : 'right';   // the label sits inside the dial, on the marker's side
    g.fillText('Mars needs to be here', wx + (left ? 10 : -10), wy + 4);
  },

  finale() {
    return { text: this.s.finale || 'Arrived at Mars.', at: [0, 0], radius: 3.55 };   // the whole journey: Sun, trail and Mars
  },

  exit() { const s = this.s; if (s && s.drones) Object.values(s.drones).forEach(d => d && d.stop()); this.s = null; },
};
