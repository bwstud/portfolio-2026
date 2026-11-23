/* 1 · Falling — Newton's cannon. A mountain 500 km high (above the air), a cannon on top, real Earth gravity. */
import * as THREE from 'three';
import { propagate, elements, angularSpeed, GM_EARTH, R_EARTH } from '../physics.js';
import { FatLine, Trail, COLOR, halo } from '../draw.js';
import { pitchFor } from '../audio.js';

const H = 500;                                  // km, the mountain
const R0 = R_EARTH + H;
const K = 2.2 / R_EARTH;                         // world units per km
const V_CIRC = Math.sqrt(GM_EARTH / R0), V_ESC = Math.SQRT2 * V_CIRC;

/* The world as an engraved globe seen from above the North Pole: a dark sea, faint land, and a brass graticule every
   15°. Not a map of Earth's coasts, a chart of a sphere. */
function graticule(radius) {
  const pairs = [];
  const seg = (a, b) => pairs.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const P = (lat, lon) => new THREE.Vector3(radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(lon));
  for (let lat = -75; lat <= 75; lat += 15) for (let i = 0; i < 96; i++) seg(P(lat * D, i / 96 * TAU), P(lat * D, (i + 1) / 96 * TAU));
  for (let lon = 0; lon < 360; lon += 15) for (let i = 0; i < 48; i++) seg(P(-90 * D + i / 48 * Math.PI, lon * D), P(-90 * D + (i + 1) / 48 * Math.PI, lon * D));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pairs, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLOR.brass, transparent: true, opacity: 0.22, depthWrite: false }));
}
const D = Math.PI / 180, TAU = Math.PI * 2;

function atmosphere(radius) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x6fa8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 4.0); gl_FragColor = vec4(uColor * f * 0.7, f); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  }));
}

export default {
  id: 'falling',
  name: 'Falling',
  title: 'An orbit is a fall that keeps missing',
  prose: `<p>Newton pictured a cannon on a mountain so tall it stood above the air. Fire a ball gently and it falls nearby. Fire it harder and it lands farther off, because the ground curves away beneath it.</p>
    <p>Fire it hard enough and the ground curves away as fast as the ball falls. It never lands. It is still falling, all the way round.</p>`,
  predict: {
    question: 'One ball leaves at 4 km/s, another at 8 km/s. Where does the faster one land?',
    options: ['About twice as far away', 'Much more than twice as far', 'It never comes down'],
    answer: 2,
    reveal: `<p>At 7.45 km/s a ball lands on the far side of the world. At 7.50 it never lands at all: the ground curves away faster than it falls. At 7.62 its path is a perfect circle.</p>`,
  },
  goals: [
    { id: 'far', text: 'Land a ball on the far side of the world' },
    { id: 'round', text: 'Fire one that goes all the way round' },
  ],
  speeds: [
    { label: '1 s = 1 min', short: '1 min/s', value: 60 },
    { label: '1 s = 5 min', short: '5 min/s', value: 300 },
    { label: '1 s = 15 min', short: '15 min/s', value: 900 },
  ],
  speedIndex: 1,
  camera: { target: [0, 0, -0.5], radius: 3.3, polar: 0.01, azimuth: 0, min: 3, max: 60 },
  chordRoot: 220,

  enter(ctx) {
    const { group, ui } = ctx;
    this.ctx = ctx; this.ctxGroup = group;
    const s = this.s = { v: 6.0, shots: [], active: null, ghostCount: 0 };
    ctx.sunLight.position.set(-8, 16, 10);

    // the world
    const earth = new THREE.Group();
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * K, 96, 48), new THREE.MeshStandardMaterial({ color: 0x0f2342, roughness: 0.75, metalness: 0.05, emissive: 0x050b18, emissiveIntensity: 1 })));
    earth.add(graticule(R_EARTH * K * 1.002));
    group.add(earth, atmosphere(R_EARTH * K * 1.02));
    s.earth = earth;
    // the plane of the shots, faintly: the ground line where the plane cuts the Earth
    const rim = []; for (let i = 0; i < 180; i++) { const a = i / 180 * Math.PI * 2; rim.push(R_EARTH * Math.cos(a), R_EARTH * Math.sin(a)); }
    const rimLine = new FatLine({ capacity: 180, color: COLOR.brassDim, width: 1, opacity: 0.5, closed: true });
    rimLine.set(rim, K, R_EARTH * K * 0.002, 180);
    // the mountain: a cone standing out of the plane's edge at the top
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(0.13, (H + 60) * K, 5, 1, false), new THREE.MeshStandardMaterial({ color: 0xb9ab8a, roughness: 0.9, flatShading: true, emissive: 0x3a3226, emissiveIntensity: 1 }));
    mtn.position.set(0, 0, -(R_EARTH + (H - 60) / 2) * K);
    mtn.rotation.x = -Math.PI / 2;
    group.add(mtn);
    const muzzle = halo(COLOR.copper, 0.14, 0.9); muzzle.position.set(0, 0.01, -R0 * K); group.add(muzzle);
    // without gravity: the straight line the ball would take
    s.tangent = new FatLine({ capacity: 2, color: COLOR.brass, width: 1, opacity: 0.55, dashed: true, dash: 0.08, gap: 0.08 });
    s.tangent.set([0, R0, 9000, R0], K, 0.002, 2);
    group.add(s.tangent.object, rimLine.object);
    ctx.label('without gravity, the ball would go straight on', 'label--quiet label--right').at(4.2, 0, -R0 * K - 0.02);
    ctx.label('500 km mountain, above the air', 'label--quiet label--left').at(-0.12, 0, -R0 * K + 0.05);

    s.ball = new THREE.Group();
    s.ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8), new THREE.MeshBasicMaterial({ color: COLOR.copper })), halo(COLOR.copper, 0.32, 0.9));
    s.ball.visible = false;
    group.add(s.ball);
    s.trail = new Trail({ capacity: 900, color: COLOR.copper, width: 2, minStep: 15 });
    group.add(s.trail.object);
    // the same ball with gravity switched off, running along the straight line; the gap between them is the fall
    s.twin = halo(COLOR.brass, 0.34, 1); s.twin.visible = false; group.add(s.twin);
    s.drop = new FatLine({ capacity: 2, color: COLOR.brass, width: 1, opacity: 0.7 });
    group.add(s.drop.object);
    s.dropLabel = ctx.label('', 'label--quiet label--right').show(false);
    s.dropPts = new Float64Array(4);
    s.ghosts = [];

    // controls
    const g = ui.group('Cannon');
    s.fader = ui.fader(g, { label: 'Launch speed', unit: 'km/s', min: 0.5, max: 12, step: 0.01, value: s.v, digits: 2, onInput: v => { s.v = v; this.preview(ctx); } });
    ui.keys(g, [{ id: 'fire', label: 'Fire', accent: true, title: 'Fire (F)', onClick: () => this.fire(ctx) }, { id: 'clear', label: 'Clear shots', onClick: () => this.clearShots(ctx) }]);
    ui.note(g, 'Press F to fire. Earlier shots stay behind, faintly.');
    s.read = ui.readouts(ui.group('This shot'), [
      { id: 'what', label: 'Result' }, { id: 'time', label: 'Flight time' }, { id: 'top', label: 'Highest point' }, { id: 'first', label: 'Fell in its first second' },
    ]);
    s.apple = ui.note(s.read.el.parentElement, 'Fire at any speed: in its first second every ball falls the same distance, as far as an apple dropped from the mountain top. An orbit doesn\'t fall slower; it just moves sideways fast enough to keep missing.');
    const marks = ui.group('Speeds that matter here');
    ui.readouts(marks, [{ id: 'c', label: 'Circle' }, { id: 'e', label: 'Escape' }]).el.querySelectorAll('dd').forEach((dd, i) => { dd.textContent = i ? `${ctx.fmt(V_ESC, 1)} km/s` : `${ctx.fmt(V_CIRC, 2)} km/s`; });
    ctx.setSize('ball not to scale');
    this.preview(ctx);
  },

  preview(ctx) {
    const v = this.s.v;
    const el = elements({ x: 0, y: R0, vx: v, vy: 0 }, GM_EARTH);
    const what = el.e >= 1 ? 'Escapes for good' : el.rp > R_EARTH ? `Orbits` : 'Lands';
    this.s.read.set('what', `${what} (aim)`);
  },

  fire(ctx) {
    const s = this.s;
    if (s.active) this.retire(s.active);
    const s0 = { x: 0, y: R0, vx: s.v, vy: 0 };
    const el = elements(s0, GM_EARTH);
    // find where it comes down, if it does: sample, then bisect the crossing
    let tImpact = Infinity;
    const maxT = el.e < 1 ? el.period : 4 * 3600;
    if (el.rp < R_EARTH) {
      const n = 2000; let prev = 0;
      for (let i = 1; i <= n; i++) {
        const t = maxT * i / n, p = propagate(s0, t, GM_EARTH);
        if (Math.hypot(p.x, p.y) < R_EARTH) {
          let lo = prev, hi = t;
          for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, q = propagate(s0, m, GM_EARTH); if (Math.hypot(q.x, q.y) < R_EARTH) hi = m; else lo = m; }
          tImpact = hi; break;
        }
        prev = t;
      }
    }
    const top = el.e < 1 ? Math.min(el.ra, Infinity) - R_EARTH : Infinity;
    s.active = { s0, el, t: 0, tImpact, laps: 0, line: null };
    s.trail.reset();
    s.ball.visible = true;
    const r = s.read;
    r.set('what', tImpact < Infinity ? 'In flight' : el.e >= 1 ? 'Escaping' : 'In orbit');
    r.set('top', el.e >= 1 ? 'Never comes back' : `${ctx.fmt(top, 0)} km up`);
    r.set('time', '0 min');
    // how far below the straight line it is after one second: ½ g t², whatever the speed
    const p1 = propagate(s0, 1, GM_EARTH), fell = Math.hypot(p1.x - s0.vx * 1, p1.y - R0) * 1000;
    r.set('first', `${ctx.fmt(fell, 2)} m (an apple: ${ctx.fmt(0.5 * GM_EARTH / (R0 * R0) * 1000, 2)} m)`);
    ctx.audio.pluck(110 * Math.pow(2, s.v / 6), { gain: 0.16, decay: 1.6, bright: 0.6 });
    // the ball hums at a pitch set by how fast it sweeps round the world, Kepler's mapping again
    s.drone && s.drone.stop();
    s.drone = ctx.audio.ready ? ctx.audio.drone({ freq: 196, gain: 0.045 }) : null;
  },

  retire(shot) {
    // the finished path stays as a faint ghost; only the last six are kept
    const s = this.s, pts = [];
    const end = Math.min(shot.t, shot.tImpact, shot.el.e < 1 ? shot.el.period : shot.t);
    const n = 200;
    for (let i = 0; i <= n; i++) { const p = propagate(shot.s0, end * i / n, GM_EARTH); pts.push(p.x, p.y); }
    const line = new FatLine({ capacity: n + 1, color: COLOR.brass, width: 1, opacity: 0.35 });
    line.set(pts, K, 0.001, n + 1);
    this.ctxGroup.add(line.object);
    s.ghosts.push(line);
    if (s.ghosts.length > 6) { const old = s.ghosts.shift(); old.object.parent.remove(old.object); old.dispose(); }
  },

  clearShots() {
    const s = this.s;
    s.drone && s.drone.stop(); s.drone = null; s.twin.visible = false; s.drop.clear(); s.dropLabel.show(false);
    s.ghosts.forEach(l => { l.object.parent && l.object.parent.remove(l.object); l.dispose(); });
    s.ghosts = [];
    s.active = null; s.trail.reset(); s.ball.visible = false;
  },

  key(e) { if (e.key === 'f' || e.key === 'F') this.fire(this.ctx); },

  frame(ctx, real, dt) {
    this.ctx = ctx; this.ctxGroup = ctx.group;
    const s = this.s, a = s.active;
    s.earth.rotation.y += real * 0.02;   // the world turns under the shots, slowly
    if (!a) return;
    if (a.t < a.tImpact) {
      a.t = Math.min(a.t + dt, a.tImpact);
      const p = propagate(a.s0, a.t, GM_EARTH);
      s.ball.position.set(p.x * K, 0.004, -p.y * K);
      s.trail.push(p.x, p.y); s.trail.draw(K, 0.003);
      if (s.drone) s.drone.setFreq(pitchFor(angularSpeed(p), V_CIRC / R0, { base: 196 }));
      // the twin: where the ball would be without gravity, and how far it has fallen from there
      const tx = a.s0.vx * a.t;
      const showTwin = tx < R_EARTH * 1.25;
      s.twin.visible = showTwin; s.dropLabel.show(showTwin && a.t > 30);
      if (showTwin) {
        s.twin.position.set(tx * K, 0.004, -R0 * K);
        s.dropPts[0] = tx; s.dropPts[1] = R0; s.dropPts[2] = p.x; s.dropPts[3] = p.y;
        s.drop.set(s.dropPts, K, 0.004, 2);
        const fallen = Math.hypot(tx - p.x, R0 - p.y);
        s.dropLabel.at((tx + p.x) / 2 * K + 0.08, 0, -(R0 + p.y) / 2 * K + 0.1).text(`fallen ${ctx.fmt(fallen, 0)} km`);
      } else s.drop.clear();
      const mins = a.t / 60;
      s.read.set('time', mins < 120 ? `${ctx.fmt(mins, 0)} min` : `${ctx.fmt(mins / 60, 1)} h`);
      if (a.el.e < 1 && a.tImpact === Infinity) {
        const laps = Math.floor(a.t / a.el.period);
        if (laps > a.laps) {
          a.laps = laps;
          ctx.audio.pluck(440, { gain: 0.14, decay: 2.2 });
          s.read.set('what', `Orbits every ${ctx.fmt(a.el.period / 60, 0)} min`);
          ctx.goal('round', [s.ball.position.x, s.ball.position.z]);
        }
      }
      if (a.el.e >= 1 && Math.hypot(p.x, p.y) > R_EARTH * 6) { s.drone && s.drone.stop(); s.drone = null; s.read.set('what', 'Gone: it escaped'); this.retire(a); s.active = null; s.ball.visible = false; }
      if (a.t >= a.tImpact) {
        const ang = Math.abs(Math.atan2(p.x, p.y));        // angle round the world from the mountain
        const km = ang * R_EARTH;
        s.read.set('what', `Landed ${ctx.fmt(km, 0)} km away`);
        ctx.audio.pluck(70, { gain: 0.2, decay: 0.9, bright: 0.3 });
        s.drone && s.drone.stop(); s.drone = null;
        if (ang > Math.PI / 2) ctx.goal('far', [s.ball.position.x, s.ball.position.z]);
      }
    }
  },

  finale() {
    const a = this.s.active, p = this.s.ball.position;
    return { text: `Falling all the way round, ${a && a.el.e < 1 ? `one lap every ${Math.round(a.el.period / 60)} minutes` : 'and never landing'}. Newton sketched this cannon around 1687, three centuries before Sputnik.`, at: [p.x, p.z], radius: 2.6 };
  },

  exit() { this.s && this.s.drone && this.s.drone.stop(); this.s = null; },
};
