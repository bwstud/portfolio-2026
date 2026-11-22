/* Music of the Spheres — the physics.
   Everything here is two-dimensional, in the plane of the orbit. States are { x, y, vx, vy }.
   Every orbit is propagated exactly (universal-variable Kepler propagation), so nothing drifts however long the
   page is left open. No three.js in this file, so the tests can run it in node. */

export const TAU = Math.PI * 2;

// ---- units ----
export const GM_SUN = 4 * Math.PI * Math.PI;        // AU³ / yr², so a 1 AU circular orbit takes exactly one year
export const KMS_PER_AU_YR = 4.740470463533348;     // 1 AU/yr in km/s
export const DAYS_PER_YEAR = 365.25;
export const GM_EARTH = 398600.4418;                // km³ / s²
export const R_EARTH = 6371.0;                       // km, mean radius

// ---- Stumpff functions, with series near zero so a near-parabolic orbit stays stable ----
function stumpffC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + z * z / 720;
}
function stumpffS(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + z * z / 5040;
}

/* Where a body on state s will be after dt, around a centre of strength mu. Exact for every conic.
   Writes into out (or a new object) and returns it. */
export function propagate(s, dt, mu, out = {}) {
  const r0 = Math.hypot(s.x, s.y);
  const v0sq = s.vx * s.vx + s.vy * s.vy;
  const vr0 = (s.x * s.vx + s.y * s.vy) / r0;
  const alpha = 2 / r0 - v0sq / mu;                 // 1/a: positive for an ellipse
  const smu = Math.sqrt(mu);

  // an ellipse repeats: step only the part of dt that isn't whole periods, so Newton starts close
  if (alpha > 1e-12) {
    const T = TAU / Math.sqrt(mu * alpha * alpha * alpha);
    dt = dt % T;
  }
  if (dt === 0) { out.x = s.x; out.y = s.y; out.vx = s.vx; out.vy = s.vy; return out; }

  // Kepler's equation in the universal variable χ. Its slope is the radius, always positive, so the root can be
  // bracketed: Newton steps, falling back to bisection whenever a step would leave the bracket.
  const kepler = chi => {
    const z = alpha * chi * chi, C = stumpffC(z), S = stumpffS(z), chi2 = chi * chi;
    return [(r0 * vr0 / smu) * chi2 * C + (1 - alpha * r0) * chi2 * chi * S + r0 * chi - smu * dt,
            (r0 * vr0 / smu) * chi * (1 - z * S) + (1 - alpha * r0) * chi2 * C + r0];
  };
  let chi = alpha > 1e-12 ? smu * alpha * dt : smu * dt / r0;
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < 200; i++) {
    const [f, fp] = kepler(chi);
    if (f > 0) hi = Math.min(hi, chi); else lo = Math.max(lo, chi);
    let next = chi - f / fp;
    if (!(next > lo && next < hi)) {
      if (isFinite(lo) && isFinite(hi)) next = (lo + hi) / 2;
      else next = f > 0 ? chi - Math.max(1, Math.abs(chi)) : chi + Math.max(1, Math.abs(chi));   // widen until bracketed
    }
    if (Math.abs(next - chi) < 1e-13 * Math.max(1, Math.abs(chi))) { chi = next; break; }
    chi = next;
  }
  const z = alpha * chi * chi, C = stumpffC(z), S = stumpffS(z);
  const chi2 = chi * chi;
  const f = 1 - chi2 / r0 * C;
  const g = dt - chi2 * chi * S / smu;
  const x = f * s.x + g * s.vx, y = f * s.y + g * s.vy;
  const r = Math.hypot(x, y);
  const fd = smu / (r * r0) * (alpha * chi2 * chi * S - chi);
  const gd = 1 - chi2 / r * C;
  out.x = x; out.y = y;
  out.vx = fd * s.x + gd * s.vx; out.vy = fd * s.y + gd * s.vy;
  return out;
}

/* The shape of the orbit a state is on. */
export function elements(s, mu) {
  const r = Math.hypot(s.x, s.y);
  const v2 = s.vx * s.vx + s.vy * s.vy;
  const h = s.x * s.vy - s.y * s.vx;               // specific angular momentum (positive: anticlockwise)
  const energy = v2 / 2 - mu / r;
  const rv = s.x * s.vx + s.y * s.vy;
  const ex = ((v2 - mu / r) * s.x - rv * s.vx) / mu;
  const ey = ((v2 - mu / r) * s.y - rv * s.vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = h * h / mu;                              // semi-latus rectum
  const a = Math.abs(energy) < 1e-14 ? Infinity : -mu / (2 * energy);
  const omega = e > 1e-9 ? Math.atan2(ey, ex) : Math.atan2(s.y, s.x);   // direction of periapsis
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const period = e < 1 ? TAU * Math.sqrt(a * a * a / mu) : Infinity;
  let nu = Math.atan2(s.y, s.x) - omega;             // true anomaly, measured in the direction of motion
  if (h < 0) nu = -nu;
  nu = wrapAngle(nu);
  return { a, e, h, p, energy, omega, rp, ra, period, nu, r, v: Math.sqrt(v2), dir: h < 0 ? -1 : 1 };
}

/* Points along the conic an element set describes, as a flat [x0,y0,x1,y1,…] array. Open orbits are cut at rMax. */
export function conicPoints(el, n = 256, rMax = Infinity) {
  const pts = [];
  const { e, p, omega, dir } = el;
  if (!isFinite(p) || p <= 0) return pts;
  let lo = -Math.PI, hi = Math.PI;
  if (e >= 1) {
    const nuInf = Math.acos(-1 / e) * 0.9999;
    let nuMax = nuInf;
    if (isFinite(rMax)) {                             // where the branch leaves the frame
      const c = (p / rMax - 1) / e;
      if (c > -1 && c < 1) nuMax = Math.min(nuInf, Math.acos(c));
    }
    lo = -nuMax; hi = nuMax;
  }
  for (let i = 0; i <= n; i++) {
    const nu = lo + (hi - lo) * i / n;
    const r = p / (1 + e * Math.cos(nu));
    if (r < 0 || !isFinite(r)) continue;
    const ang = omega + dir * nu;
    pts.push(r * Math.cos(ang), r * Math.sin(ang));
  }
  return pts;
}

/* The state on an ellipse at a given mean anomaly, anticlockwise. Kepler's equation by Newton's method. */
export function keplerState(a, e, omega, M, mu, out = {}) {
  M = wrapAngle(M);
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = a * Math.sqrt(1 - e * e);
  const px = a * (cE - e), py = b * sE;              // in the orbit's own frame, periapsis along +x
  const n = Math.sqrt(mu / (a * a * a));
  const Ed = n / (1 - e * cE);
  const vxo = -a * sE * Ed, vyo = b * cE * Ed;
  const co = Math.cos(omega), so = Math.sin(omega);
  out.x = co * px - so * py; out.y = so * px + co * py;
  out.vx = co * vxo - so * vyo; out.vy = so * vxo + co * vyo;
  return out;
}

/* A circular orbit's state at angle theta. */
export function circularState(r, theta, mu, dir = 1) {
  const v = Math.sqrt(mu / r);
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), vx: -dir * v * Math.sin(theta), vy: dir * v * Math.cos(theta) };
}

/* Angular speed seen from the centre, in radians per time unit: |h| / r². Kepler's music. */
export function angularSpeed(s) {
  const r2 = s.x * s.x + s.y * s.y;
  return Math.abs(s.x * s.vy - s.y * s.vx) / r2;
}

/* An impulsive burn along the local prograde (+) and radial-out (+) directions. */
export function burn(s, dvPrograde, dvRadial = 0) {
  const v = Math.hypot(s.vx, s.vy), r = Math.hypot(s.x, s.y);
  const tx = s.vx / v, ty = s.vy / v;
  const rx = s.x / r, ry = s.y / r;
  return { x: s.x, y: s.y, vx: s.vx + tx * dvPrograde + rx * dvRadial, vy: s.vy + ty * dvPrograde + ry * dvRadial };
}

/* Where the chaser is as seen by the target's crew: x along the direction of travel (ahead positive), y radially
   out ("up", away from the planet). The rotating local frame astronauts fly rendezvous in. */
export function localFrame(target, chaser) {
  // curvilinear: distance along the target's orbit (arc), and height above it. The frame turns with the target,
  // so a body on the same circular orbit sits still.
  const rt = Math.hypot(target.x, target.y), rc = Math.hypot(chaser.x, chaser.y);
  const ht = target.x * target.vy - target.y * target.vx, hc = chaser.x * chaser.vy - chaser.y * chaser.vx;
  const sgn = ht >= 0 ? 1 : -1;
  const dTheta = wrapAngle(Math.atan2(chaser.y, chaser.x) - Math.atan2(target.y, target.x)) * sgn;
  const rdt = (target.x * target.vx + target.y * target.vy) / rt, rdc = (chaser.x * chaser.vx + chaser.y * chaser.vy) / rc;
  const wt = Math.abs(ht) / (rt * rt), wc = Math.abs(hc) / (rc * rc);
  return { along: rt * dTheta, up: rc - rt, vAlong: rt * (wc - wt), vUp: rdc - rdt };
}

/* Hohmann transfer between circular orbits r1 → r2: the two burns and the coast time. */
export function hohmann(r1, r2, mu) {
  const at = (r1 + r2) / 2;
  const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const vp = Math.sqrt(mu * (2 / r1 - 1 / at)), va = Math.sqrt(mu * (2 / r2 - 1 / at));
  const time = Math.PI * Math.sqrt(at * at * at / mu);
  const n2 = Math.sqrt(mu / (r2 * r2 * r2));
  return { dv1: vp - v1, dv2: v2 - va, time, phase: Math.PI - n2 * time, a: at };
}

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
