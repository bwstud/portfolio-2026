// node experiments/music-of-the-spheres/test/physics.test.mjs
import * as P from '../physics.js';
let fails = 0;
const check = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got.toPrecision(8)} (want ${want}, ±${tol})`);
};
const mu = P.GM_SUN;

// a 1 AU circle takes a year, and comes back exactly
let s0 = P.circularState(1, 0, mu);
let s1 = P.propagate(s0, 1, mu);
check('1 AU circle returns after 1 yr (x)', s1.x, 1, 1e-9);
check('1 AU circle returns after 1 yr (y)', s1.y, 0, 1e-9);

// an eccentric orbit: energy and h conserved over many long steps
const ecc = { x: 0.6, y: 0, vx: 0, vy: 11.2 };
const e0 = P.elements(ecc, mu);
let s = ecc;
for (let i = 0; i < 1000; i++) s = P.propagate(s, 0.137, mu);
const e1 = P.elements(s, mu);
check('energy conserved, 1000 steps', e1.energy, e0.energy, 1e-9);
check('h conserved, 1000 steps', e1.h, e0.h, 1e-9);
check('third law P² = a³', e0.period ** 2, e0.a ** 3, 1e-9);

// equal areas: area swept in equal times is equal (h/2 · dt), checked numerically at perihelion and aphelion
const area = (st, dt) => { let A = 0; const n = 2000; let p = st; for (let i = 0; i < n; i++) { const q = P.propagate(p, dt / n, mu); A += 0.5 * Math.abs(p.x * q.y - p.y * q.x); p = q; } return A; };
const peri = ecc, apo = P.propagate(ecc, e0.period / 2, mu);
check('equal areas, perihelion vs aphelion', area(peri, 0.05), area(apo, 0.05), 1e-7);

// hyperbola: escape, energy conserved
const hyp = { x: 1, y: 0, vx: 0, vy: 10 };
const h0 = P.elements(hyp, mu);
const h1 = P.elements(P.propagate(hyp, 3.7, mu), mu);
check('hyperbola e > 1', h0.e > 1 ? 1 : 0, 1, 0);
check('hyperbola energy conserved', h1.energy, h0.energy, 1e-9);
const hb = P.propagate(P.propagate(hyp, 3.7, mu), -3.7, mu);
check('hyperbola reversible', hb.x, 1, 1e-8);
// parabola exactly at escape speed
const par = { x: 1, y: 0, vx: 0, vy: Math.sqrt(2 * mu) };
const p1 = P.propagate(par, 2, mu);
check('parabola energy ~0', P.elements(p1, mu).energy, 0, 1e-8);

// Kepler-equation state agrees with propagation
const ks = P.keplerState(e0.a, e0.e, e0.omega, Math.PI / 3, mu);
const kp = P.propagate(ecc, (Math.PI / 3) / (P.TAU / e0.period), mu);
check('keplerState vs propagate (x)', ks.x, kp.x, 1e-8);

// Earth's angular-speed ratio, aphelion to perihelion
const eE = 0.0167;
check('Earth ω ratio', ((1 + eE) / (1 - eE)) ** 2, 1.0691, 2e-4);

// Hohmann Earth → Mars, circular coplanar
const ho = P.hohmann(1, 1.523679, mu);
check('Hohmann Δv1 (km/s, heliocentric)', ho.dv1 * P.KMS_PER_AU_YR, 2.94, 0.01);
check('Hohmann time (days)', ho.time * P.DAYS_PER_YEAR, 258.9, 0.3);
check('Hohmann phase (deg)', ho.phase * 180 / Math.PI, 44.3, 0.1);

// Newton's cannon: circular speed at Earth's surface
check('v circular at surface (km/s)', Math.sqrt(P.GM_EARTH / P.R_EARTH), 7.91, 0.01);

// rendezvous frame: a chaser 10 km behind on the same circle is fixed in the local frame
const rL = P.R_EARTH + 400;
const tgt = P.circularState(rL, 0, P.GM_EARTH), ch = P.circularState(rL, -10 / rL, P.GM_EARTH);
const lf = P.localFrame(P.propagate(tgt, 3000, P.GM_EARTH), P.propagate(ch, 3000, P.GM_EARTH));
check('co-orbiting chaser stays 10 km behind', lf.along, -10, 0.01);
check('…with no relative speed', Math.hypot(lf.vAlong, lf.vUp), 0, 1e-6);
// a retrograde burn makes the chaser drop and move ahead: the paradox
const slowed = P.burn(ch, -0.002);   // −2 m/s
const after = P.localFrame(P.propagate(tgt, 5554, P.GM_EARTH), P.propagate(slowed, 5554, P.GM_EARTH));
check('slowing down moves you ahead (along > -10)', after.along > -10 ? 1 : 0, 1, 0);

// curvilinear frame: 1 km lower on a circle drifts ahead at 1.5·n·Δr, and stays 1 km lower
const n = Math.sqrt(P.GM_EARTH / rL ** 3);
const low = P.circularState(rL - 1, 0, P.GM_EARTH), ref = P.circularState(rL, 0, P.GM_EARTH);
const lf2 = P.localFrame(ref, low);
check('1 km lower: height -1 km', lf2.up, -1, 1e-9);
check('1 km lower: drifts ahead at 1.5 n Δr (km/s)', lf2.vAlong, 1.5 * n * 1, 2e-6);
const lf3 = P.localFrame(P.propagate(ref, 3000, P.GM_EARTH), P.propagate(low, 3000, P.GM_EARTH));
check('…and has moved ahead by that rate × time (km)', lf3.along, 1.5 * n * 3000, 0.01);
// phasing: 1 m/s back, one lowered orbit, 1 m/s forward ends 16.6 km ahead, matched
const lowered = P.burn(ref, -0.001), T1 = P.elements(lowered, P.GM_EARTH).period;
const after1 = P.propagate(lowered, T1, P.GM_EARTH), refT = P.propagate(ref, T1, P.GM_EARTH);
const fin = P.localFrame(refT, P.burn(after1, 0.001));
check('phasing gain over one orbit (km)', fin.along, 16.63, 0.02);
check('phasing: matched speed after second burn (m/s)', Math.hypot(fin.vAlong, fin.vUp) * 1000, 0, 0.01);
// a stopped body falls into the Sun in P/(4√2): 64.6 days from 1 AU
let fallS = { x: 1, y: 0, vx: 0, vy: 1e-4 * 2 * Math.PI }, tf = 0;
while (Math.hypot(fallS.x, fallS.y) > 0.005 && tf < 1) { tf += 0.0002; fallS = P.propagate({ x: 1, y: 0, vx: 0, vy: 1e-4 * 2 * Math.PI }, tf, mu); }
check('fall into the Sun from 1 AU (days)', tf * 365.25, 64.6, 0.3);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
