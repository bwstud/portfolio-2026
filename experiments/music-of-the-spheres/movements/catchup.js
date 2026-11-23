/* 5 · Catch up — rendezvous in low Earth orbit, seen the way crews fly it: from the station, with "up" away from
   Earth and "ahead" the way you're both going. Burn forward and you rise and fall behind; to catch up, slow down. */
import * as THREE from 'three';
import { propagate, burn, localFrame, circularState, elements, GM_EARTH, R_EARTH } from '../physics.js';
import { FatLine, Trail, COLOR, halo, ring } from '../draw.js';

const mu = GM_EARTH;
const R = R_EARTH + 400;
const K = 0.2;                                  // world units per km
const START_GAP = 16.6;                         // km behind: one lowered orbit at 1 m/s gains exactly this
const PERIOD = 2 * Math.PI * Math.sqrt(R ** 3 / mu);
const TAU_ = Math.PI * 2;

function station() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xcfc9bb, roughness: 0.5, metalness: 0.6, emissive: 0x2a2620, emissiveIntensity: 0.6 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.35, metalness: 0.4, emissive: 0x10182c, emissiveIntensity: 0.8 });
  const truss = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.62), metal);  // the truss, across the orbit
  g.add(truss);
  for (const z of [-0.25, 0.25]) for (const x of [-0.06, 0.06]) {          // four solar wings, each a pair of blankets
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.11), panel); p.position.set(x * 1.6, 0, z); g.add(p);
  }
  const mod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 16), metal); mod.rotation.z = Math.PI / 2; g.add(mod);   // modules along the orbit
  const node = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8), metal); g.add(node);
  g.add(halo(0xfff1d8, 0.45, 0.3));
  return g;
}
function capsule() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 20), new THREE.MeshStandardMaterial({ color: COLOR.copper, roughness: 0.45, metalness: 0.5, emissive: COLOR.copper, emissiveIntensity: 0.25 }));
  body.rotation.z = -Math.PI / 2;               // nose along +x: ahead
  g.add(body, halo(COLOR.copper, 0.45, 0.6));
  const flame = halo(0xffd29a, 0.3, 0); flame.position.x = -0.1; g.add(flame);
  g.userData.flame = flame;
  return g;
}

export default {
  id: 'catchup',
  name: 'Catch up',
  title: 'To catch up, slow down',
  prose: `<p>You are ${START_GAP} km behind the space station, on the same orbit, 400 km up. This view rides with the station: up is away from Earth, right is the way you are both flying.</p>
    <p>The dashed line shows where you will drift after each burn, and how close it brings you.</p>`,
  predict: {
    question: 'The station is ahead of you. Which way do you fire your engine to reach it?',
    options: ['Forward, towards the station', 'Backwards, away from it'],
    answer: 1,
    reveal: `<p>Speed up and you climb into a higher orbit, which is slower: you fall behind. Slow down instead, and you drop into a lower, quicker orbit and gain from below. Near the station, burn forward to rise and match it.</p>`,
  },
  goals: [
    { id: 'close', text: 'Get within 1 km of the station' },
    { id: 'dock', text: 'Arrive there moving slower than half a metre a second' },
  ],
  speeds: [
    { label: '1 s = 1 min', short: '1 min/s', value: 60 },
    { label: '1 s = 3 min', short: '3 min/s', value: 180 },
    { label: '1 s = 6 min', short: '6 min/s', value: 360 },
  ],
  speedIndex: 1,
  camera: { target: [-1.5, 0, 0], radius: 3.4, polar: 0.01, azimuth: 0, min: 2, max: 40 },
  rotate: false,
  storyTitle: 'Gemini 4, 1965',
  story: `<p>On Gemini 4, Jim McDivitt tried to fly up to the spent rocket stage he had just left. He pointed at it and thrust. It drifted away and down, and they gave up after using half their fuel.</p>
    <p>Buzz Aldrin had written his doctoral thesis on exactly this problem. Six months later, Gemini 6A's crew flew the first true rendezvous, coming within a foot of Gemini 7.</p>`,
  chordRoot: 246.94,

  enter(ctx) {
    const { group, ui } = ctx;
    this.ctx = ctx;
    ctx.sunLight.position.set(-6, 10, 4);
    const s = this.s = { t: 0, dv: 1, used: 0, answered: false, docked: false, minDist: Infinity };
    s.tgt0 = circularState(R, 0, mu);
    s.ch0 = circularState(R, -START_GAP / R, mu);

    // the frame: a grid of 5 km squares, and the way down to Earth
    const grid = new FatLine({ capacity: 64, color: COLOR.brass, width: 1, opacity: 0.16 });
    const pairs = [];
    for (let x = -45; x <= 20; x += 5) pairs.push(x, -15, x, 15);
    for (let y = -15; y <= 15; y += 5) pairs.push(-45, y, 20, y);
    grid.segments(pairs, K, -0.01);
    const axis = new FatLine({ capacity: 2, color: COLOR.brass, width: 1, opacity: 0.4 });
    axis.segments([-45, 0, 20, 0], K, -0.005);
    group.add(grid.object, axis.object);
    ctx.label('your shared orbit', 'label--quiet').at(-42 * K, 0, -0.18);
    ctx.label('up, away from Earth', 'label--quiet label--right').at(16 * K, 0, -14 * K);
    ctx.label('Earth is 400 km below', 'label--quiet label--right').at(16 * K, 0, 14 * K);
    ctx.label('ahead', 'label--quiet').at(19 * K, 0, 0.18);
    ctx.label('5 km', 'label--quiet').at(-42.5 * K, 0, 12.2 * K);
    const bar = new FatLine({ capacity: 3, color: COLOR.brass, width: 1.4, opacity: 0.8 });
    bar.segments([-45, 13, -40, 13, -45, 12.6, -45, 13.4, -40, 12.6, -40, 13.4].slice(0, 12), K, 0);
    group.add(bar.object);

    s.station = station(); group.add(s.station);
    s.ship = capsule(); group.add(s.ship);
    s.trail = new Trail({ capacity: 800, color: COLOR.brass, width: 1.2, opacity: 0.6, minStep: 0.05 });
    s.path = new FatLine({ capacity: 400, color: COLOR.copper, width: 1.6, opacity: 0.85, dashed: true, dash: 0.12, gap: 0.1 });
    s.closest = ring(0.12, COLOR.copper, 1.4, 0.9);
    s.zone = ring(1 * K, COLOR.brass, 1, 0.35, true);
    group.add(s.trail.object, s.path.object, s.closest.object, s.zone.object);
    s.closestLabel = ctx.label('', 'label--copper');
    s.shipLabel = ctx.label('you', 'label--planet label--copper');
    ctx.label('station', 'label--planet').at(0, 0, -0.3);

    const g = ui.group('Engine');
    s.gate = ui.note(g, 'Answer the question first, then fly.');
    s.keys = ui.keys(g, [
      { id: 'back', html: '<span aria-hidden="true">←</span> Back', aria: 'Burn backwards (left arrow)', onClick: () => this.burn(-1, 0) },
      { id: 'fwd', html: 'Forward <span aria-hidden="true">→</span>', aria: 'Burn forwards (right arrow)', onClick: () => this.burn(1, 0) },
      { id: 'up', html: '<span aria-hidden="true">↑</span> Up', aria: 'Burn upwards (up arrow)', onClick: () => this.burn(0, 1) },
      { id: 'down', html: '<span aria-hidden="true">↓</span> Down', aria: 'Burn downwards (down arrow)', onClick: () => this.burn(0, -1) },
    ]);
    ui.seg(g, { label: 'Each burn', options: [{ label: '0.5 m/s', value: 0.5 }, { label: '1 m/s', value: 1 }, { label: '2 m/s', value: 2 }], value: 1, onChange: v => { s.dv = v; } });
    ui.note(g, 'Arrow keys burn too.');
    s.loopNote = ui.note(g, 'An upward burn doesn\'t take you away. It sends you round a loop, back where you started one orbit later.');
    s.loopNote.hidden = true;
    ui.keys(g, [{ label: 'Start again', onClick: () => this.reset() }]);
    const og = ui.group('Your whole orbit, heights ×300');
    s.inset = ui.canvas(og, { height: 150, label: 'The whole orbit around Earth, with height differences exaggerated 300 times' });
    s.read = ui.readouts(ui.group('Flight'), [
      { id: 'dist', label: 'To the station' }, { id: 'rel', label: 'Relative speed' }, { id: 'near', label: 'Closest pass' },
      { id: 'orbit', label: 'Your height' }, { id: 'used', label: 'Fuel used, as Δv' }, { id: 'time', label: 'Time' },
    ]);
    this.setKeys(false);
    s.waitLabel = ctx.label(ctx.isPhone() ? 'answer the question in the lesson to start the clock' : 'answer the question on the left to start the clock', 'label--hint').at(-1.5, 0, 1.3);
    ctx.setSize('craft not to scale');
    this.forecast();
  },

  setKeys(on) { const s = this.s; Object.values(s.keys).forEach(b => { b.disabled = !on; }); s.gate.hidden = on; },
  onPredict() { this.s.answered = true; this.setKeys(true); this.s.waitLabel.show(false); },

  reset() {
    const s = this.s;
    s.t = 0; s.ch0 = circularState(R, -START_GAP / R, mu); s.chT0 = 0; s.used = 0; s.docked = false; s.minDist = Infinity;
    s.trail.reset();
    this.forecast();
  },

  states(t) {
    const s = this.s;
    return { tgt: propagate(s.tgt0, t, mu), ch: propagate(s.ch0, t - (s.chT0 || 0), mu) };
  },

  burn(along, up) {
    const s = this.s;
    if (!s.answered || s.docked) return;
    const { ch } = this.states(s.t);
    const dv = s.dv / 1000;                       // km/s
    s.ch0 = burn(ch, along * dv, up * dv); s.chT0 = s.t;
    s.used += s.dv;
    s.reveal = { t: 0, dur: up && !s.loopShown ? 2.4 : 0.6 };
    if (up && !s.loopShown) {
      s.loopShown = true;
      s.loopNote.hidden = false;
      this.ctx.announce('A burn upwards sends you round a loop that comes back to where you started, one orbit later.');
    }
    s.ship.userData.flame.material.opacity = 1;
    s.ship.userData.flame.position.x = along >= 0 ? -0.11 : 0.11;
    s.ship.userData.flame.position.z = up ? up * 0.08 : 0;
    this.ctx.audio.pluck(along < 0 || up < 0 ? 196 : 246.94, { gain: 0.1, decay: 0.6, bright: 0.5 });
    this.forecast();
  },

  forecast() {
    // where the chaser goes over the next orbit and a half, in the station's frame
    const s = this.s, n = 400, pts = [];
    let best = { d: Infinity, t: 0, x: 0, y: 0 };
    { const f0 = localFrame(this.states(s.t).tgt, this.states(s.t).ch); s.read_d = Math.hypot(f0.along, f0.up); }
    for (let i = 0; i <= n; i++) {
      const t = s.t + PERIOD * 1.5 * i / n;
      const { tgt, ch } = this.states(t);
      const f = localFrame(tgt, ch);
      pts.push(f.along, f.up);
      const d = Math.hypot(f.along, f.up);
      if (d < best.d && i > 0) best = { d, t: t - s.t, x: f.along, y: f.up };
    }
    s.pathPts = pts;
    s.path.set(pts, K, 0.002, s.reveal ? 2 : n + 1);
    s.best = best;
    const showClosest = best.t > 120 && best.d < s.read_d - 0.05;   // only when the closest point is ahead of you, not where you are
    s.closest.object.visible = showClosest; s.closestLabel.show(showClosest);
    s.closest.object.position.set(best.x * K, 0.003, -best.y * K);
    s.closestLabel.at(best.x * K + 0.15, 0, -best.y * K + 0.22).text(`closest ${this.ctx.fmt(best.d, best.d < 10 ? 1 : 0)} km`);
    const el = elements(this.states(s.t).ch, mu);
    this.s.read.set('orbit', el.e < 1 ? `${this.ctx.fmt(el.rp - R_EARTH, 1)}–${this.ctx.fmt(el.ra - R_EARTH, 1)} km` : 'escaping');
    this.s.read.set('near', `${this.ctx.fmt(best.d, 2)} km, ${this.ctx.fmt(best.t / 60, 0)} min ahead`);
  },

  key(e) {
    const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (map[e.key]) { e.preventDefault(); this.burn(...map[e.key]); }
  },

  frame(ctx, real, dt) {
    const s = this.s;
    if (!s) return;
    if (!s.answered) dt = 0;                      // nothing drifts until the question is answered
    s.t += dt;
    const { tgt, ch } = this.states(s.t);
    const f = localFrame(tgt, ch);
    s.ship.position.set(f.along * K, 0.01, -f.up * K);
    s.shipLabel.at(f.along * K, 0, -f.up * K + 0.26);
    if (dt > 0) s.trail.push(f.along, f.up);
    s.trail.draw(K, 0.001);
    if (s.reveal && s.pathPts) {
      s.reveal.t += real;
      const k = Math.min(1, s.reveal.t / s.reveal.dur), e = 1 - Math.pow(1 - k, 3);
      s.path.set(s.pathPts, K, 0.002, Math.max(2, Math.round(e * s.pathPts.length / 2)));
      if (k >= 1) { if (s.reveal.dur > 1) ctx.pulse(f.along * K, -f.up * K, 0xe7d7a8); s.reveal = null; }
    }
    const fl = s.ship.userData.flame.material;
    fl.opacity = Math.max(0, fl.opacity - real * 3);
    s.station.rotation.y += real * 0.05;
    // the dashed path shortens as you fly it: drop what has already been flown
    if (dt > 0 && s.pathPts) {
      const flown = Math.floor((s.t - (s.lastPredict || 0)) / (PERIOD * 1.5) * 400);
      if (flown > 6 && !s.reveal) { s.lastPredict = s.t; this.forecast(); }
    }
    this.drawInset(tgt, ch);
    const d = Math.hypot(f.along, f.up), rel = Math.hypot(f.vAlong, f.vUp) * 1000;
    s.minDist = Math.min(s.minDist, d);
    const r = s.read;
    r.set('dist', `${ctx.fmt(d, d < 10 ? 2 : 1)} km`);
    r.set('rel', `${ctx.fmt(rel, 1)} m/s`);
    r.set('used', `${ctx.fmt(s.used, 1)} m/s`);
    const mins = s.t / 60;
    r.set('time', `${ctx.fmt(mins, 0)} min (${ctx.fmt(s.t / PERIOD, 1)} orbits)`);
    if (d < 1) {
      ctx.goal('close', [s.ship.position.x, s.ship.position.z]);
      if (rel < 0.5 && !s.docked) {
        s.docked = true;
        ctx.goal('dock', [0, 0]);
        // hold alongside: put the chaser on the station's orbit, a little behind
        s.ch0 = propagate(s.tgt0, s.t, mu);
        const back = circularState(R, Math.atan2(s.ch0.y, s.ch0.x) - 0.15 / R, mu);
        s.ch0 = back; s.chT0 = s.t;
        ctx.announce('Docked. That took ' + ctx.fmt(s.used, 1) + ' metres per second of fuel.');
        this.forecast();
      }
    }
  },

  drawInset(tgt, ch) {
    const s = this.s, c = s.inset, g = c.g, w = c.w, h = c.h;
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 6, Re = 30, Ro = 52, X = 3;      // px: Earth, the station's orbit, px per km of height
    const th0 = Math.atan2(tgt.y, tgt.x);
    const at = (r, th) => { const a = th - th0 + Math.PI / 2, rr = Ro + (r - R) * X; return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    g.fillStyle = '#0f2342'; g.beginPath(); g.arc(cx, cy, Re, 0, TAU_); g.fill();
    g.strokeStyle = 'rgba(231,215,168,0.2)'; g.beginPath(); g.arc(cx, cy, Re, 0, TAU_); g.stroke();
    g.strokeStyle = 'rgba(231,215,168,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, Ro, 0, TAU_); g.stroke();
    // your orbit: the conic, sampled round the planet
    const el = elements(ch, mu);
    g.strokeStyle = '#e08a3c'; g.lineWidth = 1.4; g.setLineDash([3, 3]); g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const nu = i / 120 * TAU_, r = el.p / (1 + el.e * Math.cos(nu)), th = el.omega + el.dir * nu;
      const [x, y] = at(r, th); i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke(); g.setLineDash([]);
    const [sx, sy] = at(Math.hypot(tgt.x, tgt.y), th0), [px, py] = at(Math.hypot(ch.x, ch.y), Math.atan2(ch.y, ch.x));
    g.fillStyle = '#fff1d0'; g.beginPath(); g.arc(sx, sy, 3, 0, TAU_); g.fill();
    g.fillStyle = '#e08a3c'; g.beginPath(); g.arc(px, py, 3, 0, TAU_); g.fill();
    g.font = '11px Newsreader, Georgia, serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(231,215,168,0.75)';
    g.fillText('station', sx, sy - 8);
  },

  finale() {
    const s = this.s;
    return { text: `Docked on ${this.ctx.fmt(s.used, 1)} m/s of fuel, after ${this.ctx.fmt(s.t / PERIOD, 1)} orbits. Gemini 6A's crew flew this same dance in December 1965.`, at: [0, 0], radius: 1.4 };
  },

  exit() { this.s = null; },
};
