/* 2 · Ellipse — Kepler's first and second laws, played by hand. Drag the tip of the planet's velocity arrow; the
   conic redraws live, the wedges show equal areas in equal times, and a tone follows the planet's angular speed. */
import * as THREE from 'three';
import { propagate, elements, conicPoints, angularSpeed, GM_SUN, KMS_PER_AU_YR, TAU, DAYS_PER_YEAR } from '../physics.js';
import { FatLine, Trail, Arrow, Wedges, COLOR, star, planet, ring } from '../draw.js';
import { pitchFor, cents } from '../audio.js';
import { burn as burnPhysics } from '../physics.js';
const burnForward = (st, dv) => burnPhysics(st, dv, 0);

const K = 2.0;                 // world units per AU
const A = 0.2;                 // world length of the arrow per AU/yr
const VMAX = 14;               // AU/yr (66 km/s)
const SLICES = 12;
const mu = GM_SUN;

const shapeName = e => e < 0.02 ? 'Circle' : e < 0.985 ? 'Ellipse' : e < 1.015 ? 'Parabola' : 'Hyperbola';

export default {
  id: 'ellipse',
  name: 'Ellipse',
  title: 'Every orbit is a conic, with the Sun at a focus',
  prose: `<p>Drag the tip of the copper arrow to change how fast, and which way, the planet is moving. Whatever you choose, its path is a circle, an ellipse, or, fast enough, an open curve that never comes back.</p>
    <p>The Sun sits at one focus of the ellipse, not at its centre. The shaded wedges are each swept in the same time: short and wide near the Sun, long and thin far out, always the same area.</p>`,
  predict: {
    question: 'On a stretched orbit, where does the planet move fastest?',
    options: ['Far from the Sun', 'Close to the Sun', 'At the same speed all the way round'],
    answer: 1,
    reveal: `<p>Falling in, it speeds up; climbing out, it slows. Kepler saw that the line to the Sun sweeps equal areas in equal times. Listen: the tone rises as it falls in.</p>`,
  },
  goals: [
    { id: 'circle', text: 'Drag the arrow until the orbit is a circle' },
    { id: 'escape', text: 'Throw the planet out of the solar system' },
    { id: 'oberth', text: 'Give the same kick close to the Sun, then far from it' },
  ],
  speeds: [
    { label: '1 s = 1 month', short: '1 mo/s', value: 1 / 12 },
    { label: '1 s = 3 months', short: '3 mo/s', value: 0.25 },
    { label: '1 s = 1 year', short: '1 yr/s', value: 1 },
  ],
  speedIndex: 1,
  camera: { target: [-0.3, 0, 0], radius: 2.5, polar: 14, azimuth: 0, min: 2, max: 80 },
  chordRoot: 293.66,

  enter(ctx) {
    const { group, ui } = ctx;
    this.ctx = ctx;
    ctx.sunLight.position.set(0, 0, 0);
    const s = this.s = { t: 0, t0: 0, st0: { x: 1, y: 0, vx: 0, vy: 5.2 }, dragging: false, byHand: false, wedges: [], sliceStart: 0, drone: null };

    const sun = star(0.11); group.add(sun);
    s.planet = planet(0.05, 0x8fb7d9); group.add(s.planet);
    s.orbit = new FatLine({ capacity: 361, color: COLOR.brass, width: 1.4, opacity: 0.9 });
    s.apsides = new FatLine({ capacity: 2, color: COLOR.brassDim, width: 1, opacity: 0.6, dashed: true, dash: 0.06, gap: 0.06 });
    s.arrow = new Arrow(COLOR.copper, 2.4);
    s.wedge = new Wedges(SLICES + 1, 24);
    s.trail = new Trail({ capacity: 400, color: COLOR.brass, width: 1.2, opacity: 0.5 });
    s.focus = ring(0.05, COLOR.brass, 1.2, 0.9);
    s.handle = ring(0.07, COLOR.copper, 1.4, 0.9);
    group.add(s.wedge.object, s.orbit.object, s.apsides.object, s.trail.object, s.arrow.object, s.focus.object, s.handle.object);
    s.lab = {
      peri: ctx.label('perihelion', 'label--quiet'), aph: ctx.label('aphelion', 'label--quiet'),
      focus: ctx.label('empty focus', 'label--quiet'), sun: ctx.label('Sun', 'label--quiet').at(0, 0, 0.18),
      drag: ctx.label('drag the arrow', 'label--hint'),
    };

    // direct manipulation: the arrow's tip
    const tip = () => s.tipWorld;
    // a tap on the planet itself kicks it forward, there and then: the gesture for the Oberth comparison
    ctx.onPointer({
      down: e => {
        const pp = s.planet.position, touch = e.pointerType === 'touch';
        const t0 = tip();
        const dTip = t0 ? ctx.screenDist(e, t0.x, 0, t0.z) : Infinity, dPlanet = ctx.screenDist(e, pp.x, 0, pp.z);
        if (dPlanet < (touch ? 26 : 14) && dPlanet < dTip) { this.kick(); return true; }
        return false;
      },
      hover: e => { const pp = s.planet.position; return ctx.screenDist(e, pp.x, 0, pp.z) < 14 ? 'pointer' : ''; },
    });
    ctx.onPointer({
      down: e => {
        const t = tip(); if (!t) return false;
        const touch = e.pointerType === 'touch';
        if (ctx.screenDist(e, t.x, 0, t.z) > (touch ? 30 : 18)) return false;
        s.dragging = true; s.lab.drag.show(false);
        s.dragPos = this.state();               // freeze the planet where it is
        return true;
      },
      move: e => {
        const p = ctx.planeHit(e); if (!p) return;
        const pos = s.dragPos;
        let vx = (p.x / K - pos.x) * K / A, vy = (-p.z / K - pos.y) * K / A;
        const v = Math.hypot(vx, vy);
        if (v > VMAX) { vx *= VMAX / v; vy *= VMAX / v; }
        this.setState({ x: pos.x, y: pos.y, vx, vy }, true);
      },
      up: () => { s.dragging = false; this.checkGoals(); },
      hover: e => { const t = tip(); return t && ctx.screenDist(e, t.x, 0, t.z) < 18 ? 'grab' : ''; },
    });

    // the panel
    const g = ui.group('Push');
    s.fSpeed = ui.fader(g, { label: 'Speed', unit: 'km/s', min: 1, max: VMAX * KMS_PER_AU_YR, step: 0.1, value: 0, digits: 1, onInput: v => this.fromFaders(v, null) });
    s.fAngle = ui.fader(g, { label: 'Angle out from sideways', unit: '°', min: -80, max: 80, step: 1, value: 0, digits: 0, onInput: a => this.fromFaders(null, a) });
    ui.keys(g, [
      { label: 'Circle', onClick: () => this.preset(0) }, { label: 'Earth\'s shape', onClick: () => this.preset(0.0167) },
      { label: 'Mercury\'s shape', onClick: () => this.preset(0.2056) }, { label: 'A comet\'s shape', onClick: () => this.preset(0.9) },
    ]);
    s.back = ui.keys(g, [{ id: 'back', label: 'Bring it back', accent: true, onClick: () => this.preset(0.3) }]).back;
    s.back.hidden = true;
    ui.note(g, 'The shapes are set at 1 AU from the Sun, so their years are not the real planets\' years.');
    const kg = ui.group('The same kick, anywhere');
    ui.keys(kg, [{ id: 'kick', label: 'Kick it forward, 1 km/s', accent: true, onClick: () => this.kick() }]);
    ui.note(kg, 'Or tap the planet itself, at the moment you choose.');
    s.kickRead = ui.readouts(kg, [{ id: 'near', label: 'Added near the Sun' }, { id: 'far', label: 'Added far out' }]);
    s.kickNote = ui.note(kg, 'Kick it near perihelion, then again near aphelion, and compare the energy each kick adds.');
    s.kicks = {};
    s.kickLabel = ctx.label('', 'label--copper').show(false);
    s.read = ui.readouts(ui.group('The orbit'), [
      { id: 'shape', label: 'Shape' }, { id: 'e', label: 'Eccentricity' }, { id: 'year', label: 'One lap' },
      { id: 'fast', label: 'Fastest' }, { id: 'slow', label: 'Slowest' }, { id: 'energy', label: 'Energy per kilogram' }, { id: 'song', label: 'Its song spans' },
    ]);
    s.kepler = ui.note(s.read.el.parentElement, '');
    const hg = ui.group('Velocity, drawn from one point');
    s.hodo = ui.canvas(hg, { height: 150, label: 'Hodograph: the tip of the velocity vector over one orbit traces a circle' });
    ui.note(hg, 'Every arrow the planet will ever have, from one point: for any orbit, a perfect circle.');
    ctx.setSize('planet ×2000, Sun ×20');

    this.setState(s.st0, false);
  },

  state() { const s = this.s; return propagate(s.st0, s.t - s.t0, mu); },

  setState(st, byHand) {
    const s = this.s;
    s.st0 = { ...st }; s.t0 = s.t;
    s.wedges = []; s.sliceStart = s.t; s.trail.reset(); s.escaped = false;
    if (byHand !== undefined) s.byHand = byHand;
    s.el = elements(st, mu);
    this.drawOrbit();
    this.syncFaders(st);
    this.readouts();
  },

  fromFaders(kms, ang) {
    const s = this.s, st = this.state();
    const r = Math.hypot(st.x, st.y), ux = st.x / r, uy = st.y / r;
    const dir = s.el.dir || 1;
    const tx = -uy * dir, ty = ux * dir;              // sideways, the way it's going round
    const cur = this.speedAngle(st);
    const v = (kms ?? cur.kms) / KMS_PER_AU_YR, a = (ang ?? cur.ang) * Math.PI / 180;
    this.setState({ x: st.x, y: st.y, vx: v * (Math.cos(a) * tx + Math.sin(a) * ux), vy: v * (Math.cos(a) * ty + Math.sin(a) * uy) }, true);
    clearTimeout(s.goalTimer); s.goalTimer = setTimeout(() => this.checkGoals(), 400);
  },

  speedAngle(st) {
    const r = Math.hypot(st.x, st.y), v = Math.hypot(st.vx, st.vy);
    const vr = (st.x * st.vx + st.y * st.vy) / r;
    return { kms: v * KMS_PER_AU_YR, ang: Math.asin(Math.max(-1, Math.min(1, vr / (v || 1)))) * 180 / Math.PI };
  },
  syncFaders(st) {
    const s = this.s, sa = this.speedAngle(st);
    if (document.activeElement !== s.fSpeed.num && document.activeElement !== s.fSpeed.range) s.fSpeed.set(Math.max(1, sa.kms));
    if (document.activeElement !== s.fAngle.num && document.activeElement !== s.fAngle.range) s.fAngle.set(Math.round(sa.ang));
  },

  preset(e) {
    // put the planet at perihelion, 1 AU from the Sun, with the speed that gives this eccentricity
    const s = this.s, st = this.state();
    const th = Math.atan2(st.y, st.x);
    const v = Math.sqrt(mu * (1 + e) / 1);
    this.setState({ x: Math.cos(th), y: Math.sin(th), vx: -Math.sin(th) * v, vy: Math.cos(th) * v }, false);
  },

  /* 1 km/s along the direction of travel. The energy it adds is v·Δv + Δv²/2, so the same kick is worth more where the
     planet is already fast: the Oberth effect, which is why rockets burn low and fast. */
  kick() {
    const s = this.s, st = this.state(), f = this.ctx.fmt;
    const el = s.el, r = Math.hypot(st.x, st.y);
    const before = el.energy, kicked = burnForward(st, 1 / KMS_PER_AU_YR);
    this.setState(kicked, true);
    const gained = (s.el.energy - before) * KMS_PER_AU_YR * KMS_PER_AU_YR;    // MJ per kg
    this.ctx.audio.pluck(392, { gain: 0.13, decay: 1.4, bright: 0.8 });
    // the kick happens on stage: the arrow swells, and what it added rises off the planet
    s.kickFx = { t: 0, label: s.kickLabel.text(`+${f(gained, 0)} MJ/kg`).show(true) };
    if (el.e > 0.15 && el.e < 1) {
      const where = r < el.a * (1 - el.e / 2) ? 'near' : r > el.a * (1 + el.e / 2) ? 'far' : null;
      if (where) {
        s.kicks[where] = gained;
        s.kickRead.set(where, `${f(gained, 0)} MJ/kg at ${f(r, 2)} AU`);
        if (s.kicks.near && s.kicks.far) {
          s.kickNote.textContent = `The same 1 km/s added ${f(s.kicks.near / s.kicks.far, 1)} times as much energy near the Sun. A kick is worth most where you are already fast: the Oberth effect, and why rockets burn low and fast.`;
          this.ctx.goal('oberth', [s.planet.position.x, s.planet.position.z]);
          this.checkGoals();
        } else s.kickNote.textContent = where === 'near' ? 'Now let it climb out and kick it again near aphelion.' : 'Now let it fall in and kick it again near perihelion.';
      } else s.kickNote.textContent = 'That one was halfway. Wait until it is close to the Sun, or far from it.';
    } else s.kickNote.textContent = 'Stretch the orbit first (try Mercury\'s shape), then kick near perihelion and near aphelion.';
  },

  checkGoals() {
    const s = this.s;
    if (!s.byHand) return;
    const at = [s.planet.position.x, s.planet.position.z];
    if (s.el.e < 0.02) this.ctx.goal('circle', at);
    if (s.el.e >= 1) this.ctx.goal('escape', at);
  },

  drawOrbit() {
    const s = this.s, el = s.el;
    const pts = conicPoints(el, 360, 60);
    s.orbit.set(pts, K, 0, pts.length / 2);
    const co = Math.cos(el.omega), so = Math.sin(el.omega);
    const ellipse = el.e < 0.985 && el.e > 0.02;
    s.lab.peri.show(el.e > 0.02).at(co * el.rp * K * 1.0 + co * 0.18, 0, -(so * el.rp * K + so * 0.18));
    if (ellipse) {
      const c = -2 * el.a * el.e;                       // the empty focus
      s.focus.object.visible = true;
      s.focus.object.position.set(co * c * K, 0, -so * c * K);
      s.lab.focus.show(true).at(co * c * K, 0, -so * c * K + 0.16);
      s.lab.aph.show(true).at(-co * el.ra * K - co * 0.2, 0, so * el.ra * K + so * 0.2);
      s.apsides.set([co * el.rp, so * el.rp, -co * el.ra, -so * el.ra], K, 0, 2);
      s.apsides.object.visible = true;
    } else {
      s.focus.object.visible = false; s.lab.focus.show(false); s.lab.aph.show(false); s.apsides.object.visible = false;
    }
  },

  readouts() {
    const s = this.s, el = s.el, f = this.ctx.fmt, r = s.read;
    r.set('shape', shapeName(el.e));
    const mj = el.energy * KMS_PER_AU_YR * KMS_PER_AU_YR;   // (km/s)² is MJ per kg
    r.set('energy', `${mj < 0 ? '−' : '+'}${f(Math.abs(mj), 0)} MJ, ${mj < 0 ? 'held' : 'free'}`);
    s.back.hidden = el.e < 1;
    r.set('e', f(el.e, 3));
    if (el.e < 1) {
      const yr = el.period;
      r.set('year', yr < 2 ? `${f(yr * DAYS_PER_YEAR, 0)} days` : `${f(yr, 1)} years`);
      const vp = el.h / el.rp, va = el.h / el.ra;
      r.set('fast', `${f(Math.abs(vp) * KMS_PER_AU_YR, 1)} km/s`);
      r.set('slow', `${f(Math.abs(va) * KMS_PER_AU_YR, 1)} km/s`);
      const ratio = Math.pow((1 + el.e) / (1 - el.e), 2);    // angular speed, perihelion over aphelion
      const c = cents(ratio);
      r.set('song', c < 1200 ? `${f(c, 0)} cents` : `${f(c / 1200, 1)} octaves`);
      const earthish = Math.abs(el.e - 0.0167) < 0.002;
      s.kepler.innerHTML = earthish
        ? `Earth's song: its angular speed changes by about 116 cents between aphelion and perihelion. Kepler wrote it as 16:15, a semitone of 112 cents, mi to fa.`
        : 'A hundred cents is a semitone. The more stretched the orbit, the wider the song.';
    } else {
      r.set('year', 'Never returns'); r.set('slow', `${f(Math.sqrt(Math.max(0, 2 * el.energy)) * KMS_PER_AU_YR, 1)} km/s, far away`);
      r.set('fast', `${f(Math.abs(el.h / el.rp) * KMS_PER_AU_YR, 1)} km/s`); r.set('song', 'falls silent');
      const st = this.state(), vesc = Math.sqrt(2 * mu / Math.hypot(st.x, st.y)) * KMS_PER_AU_YR;
      s.kepler.innerHTML = `Escape speed where the planet is now: ${f(vesc, 1)} km/s. Above it, its energy is positive and the Sun can't hold it.`;
    }
  },

  onSound() { const s = this.s; if (s && !s.drone && this.ctx.audio.ready) s.drone = this.ctx.audio.drone({ freq: 220, gain: 0.05 }); },

  frame(ctx, real, dt) {
    const s = this.s;
    if (!s.drone && ctx.audio.ready) this.onSound();
    if (!s.dragging) s.t += dt;
    const st = s.dragging ? s.st0 : this.state();
    const x = st.x * K, z = -st.y * K;
    s.planet.position.set(x, 0, z);
    const tipX = x + st.vx * A, tipZ = z - st.vy * A;
    let swell = 1;
    if (s.kickFx) {
      const k = s.kickFx.t = s.kickFx.t + real;
      swell = 1 + 0.6 * Math.exp(-k * 5) * Math.sin(Math.min(Math.PI, k * 12));
      s.kickLabel.at(x, 0, z - 0.18 - k * 0.25); s.kickLabel.el.style.opacity = String(Math.max(0, 1 - k / 1.8));
      if (k > 1.8) { s.kickLabel.show(false); s.kickLabel.el.style.opacity = ''; s.kickFx = null; }
    }
    s.arrow.set(x, st.y * K, x + (tipX - x) * swell, -(z + (tipZ - z) * swell), 0.11 * swell);
    s.tipWorld = { x: tipX, z: tipZ };
    s.handle.object.position.set(tipX, 0.003, tipZ);
    s.lab.drag.at(tipX, 0, tipZ - 0.2);
    if (!s.dragging) s.trail.push(st.x, st.y);
    s.trail.draw(K, 0.001);

    // wedges: slices of equal time (a twelfth of the year, or a fixed slice for open orbits)
    const slice = s.el.e < 1 ? s.el.period / SLICES : 0.04;
    if (!s.dragging) {
      while (s.t - s.sliceStart >= slice) {
        s.wedges.push(this.wedge(s.sliceStart, s.sliceStart + slice));
        if (s.wedges.length > SLICES) s.wedges.shift();
        s.sliceStart += slice;
      }
      const live = this.wedge(s.sliceStart, s.t);
      // an open orbit's wedges grow into long sails as it leaves; let them go once it is well out
      if (s.el.e >= 1 && Math.hypot(st.x, st.y) > 3) s.wedge.clear(); else s.wedge.set([...s.wedges, live], K);
    } else s.wedge.clear();

    // sound: pitch follows angular speed, referred to the orbit's mean motion
    if (s.drone) {
      const ref = s.el.e < 1 ? TAU / s.el.period : angularSpeed(s.st0);
      s.drone.setFreq(pitchFor(angularSpeed(st), ref, { base: 220 }));
      s.drone.setGain(s.el.e < 1 || Math.hypot(st.x, st.y) < 8 ? 0.05 : 0.0);
    }
    if (!s.dragging && s.el.e >= 1 && Math.hypot(st.x, st.y) > 30 && !s.escaped) { s.escaped = true; ctx.announce('The planet has left. Pick a preset to bring one back.'); }
    if (!s.dragging) this.syncFaders(st);
    this.drawHodograph(st);
  },

  wedge(t0, t1) {
    const s = this.s, n = 24, pts = new Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const p = propagate(s.st0, t0 + (t1 - t0) * i / n - s.t0, mu);
      pts[i * 2] = p.x; pts[i * 2 + 1] = p.y;
    }
    return pts;
  },

  drawHodograph(st) {
    const s = this.s, c = s.hodo, g = c.g, w = c.w, h = c.h;
    g.clearRect(0, 0, w, h);
    const el = s.el;
    // the hodograph of any Kepler orbit is a circle of radius mu/h, its centre offset by e·mu/h
    const R = mu / Math.abs(el.h), off = el.e * R;
    const scale = Math.min(w, h) * 0.42 / Math.max(R + off, Math.hypot(st.vx, st.vy), 1e-6);
    const cx = w / 2, cy = h / 2;
    // centre direction: perpendicular to periapsis, on the side of motion
    const dir = el.dir, ox = -Math.sin(el.omega) * dir * off, oy = Math.cos(el.omega) * dir * off;
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(231,215,168,0.18)';
    g.beginPath(); g.moveTo(cx - w, cy); g.lineTo(cx + w, cy); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke();
    g.strokeStyle = 'rgba(231,215,168,0.85)'; g.lineWidth = 1.25;
    g.beginPath();
    if (el.e < 1) g.arc(cx + ox * scale, cy - oy * scale, R * scale, 0, Math.PI * 2);
    else {
      // an open orbit only uses part of the circle: the arc between the two asymptotic speeds
      const n = 120, nuInf = Math.acos(-1 / el.e) * 0.999;
      for (let i = 0; i <= n; i++) {
        const nu = -nuInf + 2 * nuInf * i / n, ang = el.omega + dir * nu;
        const vx = -Math.sin(ang) * dir * R + ox, vy = Math.cos(ang) * dir * R + oy;   // v = (mu/h)(−sin θ, e + cos θ) rotated
        i ? g.lineTo(cx + vx * scale, cy - vy * scale) : g.moveTo(cx + vx * scale, cy - vy * scale);
      }
    }
    g.stroke();
    // the current velocity
    const tx = cx + st.vx * scale, ty = cy - st.vy * scale;
    g.strokeStyle = '#e08a3c'; g.fillStyle = '#e08a3c'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke();
    g.beginPath(); g.arc(tx, ty, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(231,215,168,0.9)';
    g.beginPath(); g.arc(cx, cy, 2, 0, Math.PI * 2); g.fill();
  },

  finale() {
    return { text: 'A circle, an escape, and a kick worth more near the Sun: the same Sun and the same law each time. Only the push was different.', at: [0, 0], radius: 2.5 };
  },

  exit() { const s = this.s; if (s) { clearTimeout(s.goalTimer); s.drone && s.drone.stop(); } this.s = null; },
};
