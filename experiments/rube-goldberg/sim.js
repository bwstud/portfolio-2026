/* The machine, simulated start to finish in one go ("baked") every time something changes.
   Playback then just reads frames, so pause, rewind, fast forward and frame stepping are all
   exact. Deterministic: same settings and layout, same run. No three.js in here.

   Links: skier -> wall -> camera operator -> lens rolls -> spring pad -> gravity cube ->
   laser -> gunpowder pile -> powder trail -> whale. Any link can fail; the run then stops a
   few seconds later and says why. */
import {
  jumpProfile, along, OP, tipPoint, tipVelocity, whaleSection, WHALE_SPLIT,
  toWorld, operatorPlacement, fusePoint, SKI_HALF,
} from './geom.js';

export const FPS = 60;
export const MIST_FPS = 30;
const SUB = 8;
const D2R = Math.PI / 180;
const MAX_T = 150;

/* ---------- small maths ---------- */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const len3 = v => Math.hypot(v[0], v[1], v[2]);
const norm3 = v => { const l = len3(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const qAxis = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
const qNorm = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
export function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}
const qAngle = (a, b) => 2 * Math.acos(clamp(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]), 0, 1));
function qIntegrate(q, w, dt) {
  const [x, y, z, s] = q, h = dt * 0.5;
  return qNorm([
    x + h * (w[0] * s + w[1] * z - w[2] * y),
    y + h * (w[1] * s + w[2] * x - w[0] * z),
    z + h * (w[2] * s + w[0] * y - w[1] * x),
    s - h * (w[0] * x + w[1] * y + w[2] * z),
  ]);
}
function qBasis(X, Y, Z) {   // columns are the local axes in world space
  const m00 = X[0], m10 = X[1], m20 = X[2], m01 = Y[0], m11 = Y[1], m21 = Y[2], m02 = Z[0], m12 = Z[1], m22 = Z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return qNorm([(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]); }
  if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return qNorm([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]); }
  if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return qNorm([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]); }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11); return qNorm([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]);
}
const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };

/* the lens's orientation while it's still on the camera: operator yaw, his tip back, and the
   lens's own axis (local +z) pointing where the camera points (his local -x) */
export function attachedLensQuat(opRotDeg, th) {
  return qMul(qMul(qAxis(0, 1, 0, opRotDeg * D2R), qAxis(0, 0, 1, -th)), qAxis(0, 1, 0, -Math.PI / 2));
}

/* the powder trail: a smooth curve from the pile, through the bend points, to the whale */
export function trailPath(P, L) {
  const fuse = fusePoint(P, L);
  const ctrl = [[L.pile.x, L.pile.z], ...L.trail.map(p => [p.x, p.z]), [fuse.x, fuse.z]];
  const pts = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(4, Math.ceil(seg / 0.02));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, length: s[s.length - 1], fuse };
}

/* ---------- the bake ---------- */
export function bake(P, L) {
  const g = P.gravity;
  const prof = jumpProfile(P);
  const J = L.jump, jRot = (J.rot || 0) * D2R;
  const jWorld = (x, y, z = 0) => { const [wx, wz] = toWorld(J, x, z); return [wx, y, wz]; };
  const opPl = operatorPlacement(P, L, prof), opRot = opPl.rot * D2R;
  const opH = P.opHeight;
  const fallDir = rotY([1, 0, 0], opRot);
  const hw = P.roomWidth / 2, hd = P.roomDepth / 2, H = P.roomHeight;
  const lensR = P.lensSize / 2;
  const pad = [L.pad.x, 0, L.pad.z];
  const cubeC = [L.cube.x, L.cube.y, L.cube.z], cubeH = P.cubeSize / 2;
  const laserPos = [L.laser.x, L.laser.y, L.laser.z];
  const beamIn = norm3([cubeC[0] - laserPos[0], cubeC[1] - laserPos[1], cubeC[2] - laserPos[2]]);
  const pileTop = [L.pile.x, P.pileSize * 0.42, L.pile.z];
  const trail = trailPath(P, L);

  const events = [];
  let fail = null;
  const ev = (id, t, text, ok = true) => { events.push({ id, t, text, ok }); if (!ok && !fail) fail = { id, t, text }; };

  const maxFrames = MAX_T * FPS + 1;
  const SK = 8, skier = new Float32Array(maxFrames * SK);
  const op = new Float32Array(maxFrames);
  const LN = 8, lens = new Float32Array(maxFrames * LN);

  /* skier */
  const sk = { phase: 0, s: 0.08, v: 0, x: 0, y: 0, vx: 0, vy: 0, side: 0, tStart: P.startDelay, tTake: -1, tLand: -1, tBump: -1, crash: 0, ang: 0 };
  { const a = along(prof.inrun, sk.s); sk.x = a.x; sk.y = a.y; sk.ang = a.ang; }
  const m = P.skierMass;
  const surfY = x => (x < prof.xb + 1e-6 ? prof.hillY(x) : 0);
  const tipRad = P.tipAngle * D2R;
  const liftMul = Math.sin(2 * tipRad) / Math.sin(2 * 28 * D2R);
  const dragMul = 1 + (P.tipAngle / 45) ** 2;
  let bumpJ = 0;

  /* operator */
  const th0 = -P.opLean * D2R;
  const opS = { phase: 0, th: th0, w: 0 };
  const opContact = L.operator.dx <= P.opReach && Math.abs(L.operator.dz) <= P.trackWidth / 2 + 0.06;

  /* lens */
  const ln = { mode: 0, p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0], heading: [1, 0, 0], spin: 0, rolls: 0, padDone: false, inCube: false, settled: false, closest: Infinity, tRollStart: -1 };
  const qTarget = (() => { const Z = beamIn; let Y = [0, 1, 0]; Y = norm3([Y[0] - dot3(Y, Z) * Z[0], Y[1] - dot3(Y, Z) * Z[1], Y[2] - dot3(Y, Z) * Z[2]]); return qBasis(cross3(Y, Z), Y, Z); })();

  /* beam and fire */
  const beam = { on: -1, off: -1, hit: false, out: null, focus: 0, bend: 0, energy: 0 };
  let tSettle = -1, tIgnite = -1, tReach = -1, tBoom = -1, tPad = -1, tDetach = -1, tTopple = -1;

  const dt = 1 / (FPS * SUB);
  let t = 0, frame = 0, tEnd = MAX_T;

  const rollQuat = (heading, spin) => qMul(qAxis(0, 1, 0, Math.atan2(-heading[2], heading[0])), qAxis(0, 0, 1, -spin));

  function startRoll(t, first) {
    const vh = Math.hypot(ln.v[0], ln.v[2]);
    let hd;
    if (first && P.rollAim) hd = norm3([pad[0] - ln.p[0], 0, pad[2] - ln.p[2]]);
    else if (first) hd = rotY(fallDir, P.rollHeading * D2R);
    else hd = vh > 1e-4 ? [ln.v[0] / vh, 0, ln.v[2] / vh] : ln.heading;
    ln.heading = hd;
    ln.speed = vh;
    ln.mode = 2;
    ln.p[1] = lensR;
    if (ln.tRollStart < 0) ln.tRollStart = t;
  }

  function launchFromPad(t) {
    tPad = t;
    let speed, hd, phi = P.padAngle * D2R;
    if (P.padAim) {
      const dx = cubeC[0] - ln.p[0], dz = cubeC[2] - ln.p[2], D = Math.hypot(dx, dz), Hh = cubeC[1] - ln.p[1];
      hd = [dx / (D || 1), 0, dz / (D || 1)];
      const den = 2 * Math.cos(phi) ** 2 * (D * Math.tan(phi) - Hh);
      if (den <= 1e-4) { speed = P.padSpeed; ev('pad', t, `Pad fired, but a ${P.padAngle}° launch can’t climb to the cube from here.`, false); }
      else { speed = Math.sqrt(g * D * D / den) * P.padSpeedScale; ev('pad', t, `Lens rolled onto the pad and was fired at ${speed.toFixed(1)} m/s.`); }
    } else {
      speed = P.padSpeed;
      hd = rotY([1, 0, 0], P.padHeading * D2R);
      ev('pad', t, `Lens rolled onto the pad and was fired at ${speed.toFixed(1)} m/s.`);
    }
    ln.v = [hd[0] * speed * Math.cos(phi), speed * Math.sin(phi), hd[2] * speed * Math.cos(phi)];
    ln.p[1] = lensR + 0.004;
    ln.w = [7, 2.5, -5];
    ln.mode = 1;
    ln.padDone = true;
  }

  function lensFree(t, dt) {
    const inside = Math.abs(ln.p[0] - cubeC[0]) < cubeH && Math.abs(ln.p[1] - cubeC[1]) < cubeH && Math.abs(ln.p[2] - cubeC[2]) < cubeH;
    if (inside && !ln.inCube) { ln.inCube = true; if (!events.some(e => e.id === 'enter')) ev('enter', t, 'Lens flew into the gravity cube.'); }
    if (!inside && ln.inCube) ln.inCube = false;
    const a = [0, -g, 0];
    if (inside) {
      const sp = len3(ln.v);
      for (let i = 0; i < 3; i++) a[i] = -P.cubePull * (ln.p[i] - cubeC[i]) - P.cubeDamping * ln.v[i] - P.cubeSyrup * sp * ln.v[i];
      a[1] -= g * P.cubeGravity;
      const wd = Math.exp(-(2 + P.cubeAlign * 2) * dt);
      ln.w = [ln.w[0] * wd, ln.w[1] * wd, ln.w[2] * wd];
      const calm = clamp(1 - len3(ln.w) / 3, 0, 1);
      ln.q = qSlerp(ln.q, qTarget, 1 - Math.exp(-P.cubeAlign * calm * dt));
    }
    // semi-implicit, and clamp the syrup so it can't overshoot within a step
    for (let i = 0; i < 3; i++) ln.v[i] += a[i] * dt;
    if (inside) { const sp = len3(ln.v); const lim = 1 / (1 + P.cubeSyrup * sp * dt); for (let i = 0; i < 3; i++) ln.v[i] *= lim; }
    for (let i = 0; i < 3; i++) ln.p[i] += ln.v[i] * dt;
    ln.q = qIntegrate(ln.q, ln.w, dt);
    // walls and ceiling
    for (const [i, lim] of [[0, hw], [2, hd]]) {
      if (ln.p[i] > lim - lensR) { ln.p[i] = lim - lensR; ln.v[i] = -Math.abs(ln.v[i]) * P.lensBounce; }
      if (ln.p[i] < -lim + lensR) { ln.p[i] = -lim + lensR; ln.v[i] = Math.abs(ln.v[i]) * P.lensBounce; }
    }
    if (ln.p[1] > H - lensR) { ln.p[1] = H - lensR; ln.v[1] = -Math.abs(ln.v[1]) * P.lensBounce; }
    if (ln.p[1] < lensR && ln.v[1] < 0) {
      ln.p[1] = lensR;
      ln.v[1] = -ln.v[1] * P.lensBounce;
      ln.v[0] *= 0.85; ln.v[2] *= 0.85;
      ln.w = [ln.w[1] * 0.6 + ln.v[2] * 30, ln.w[2] * 0.6, ln.w[0] * 0.6 - ln.v[0] * 30];
      if (Math.abs(ln.v[1]) < 0.3) {
        if (Math.hypot(ln.v[0], ln.v[2]) > 0.02) startRoll(t, ln.rolls++ === 0 && !ln.padDone);
        else { ln.mode = 3; ln.v = [0, 0, 0]; }
      }
    }
    if (ln.inCube && !ln.settled) {
      const off = Math.hypot(ln.p[0] - cubeC[0], ln.p[1] - cubeC[1], ln.p[2] - cubeC[2]);
      if (off < P.settleTol / 1000 && len3(ln.v) < 0.004 && qAngle(ln.q, qTarget) < 1.5 * D2R) {
        ln.settled = true; tSettle = t;
        ev('settle', t, 'Lens came to rest in the centre, lined up with the laser.');
      }
    }
  }

  function lensRoll(t, dt) {
    ln.speed = Math.max(0, ln.speed - P.rollResist * g * dt);
    for (const i of [0, 2]) ln.p[i] += ln.heading[i] * ln.speed * dt;
    ln.spin += ln.speed * dt / lensR;
    ln.q = qSlerp(ln.q, rollQuat(ln.heading, ln.spin), 1 - Math.exp(-25 * dt));
    for (const [i, lim] of [[0, hw], [2, hd]]) {
      if (Math.abs(ln.p[i]) > lim - lensR) { ln.p[i] = Math.sign(ln.p[i]) * (lim - lensR); ln.heading[i] = -ln.heading[i]; ln.speed *= P.lensBounce; }
    }
    if (!ln.padDone) {
      const d = Math.hypot(ln.p[0] - pad[0], ln.p[2] - pad[2]);
      ln.closest = Math.min(ln.closest, d);
      if (d <= P.padRadius) { launchFromPad(t); return; }
    }
    ln.v = [ln.heading[0] * ln.speed, 0, ln.heading[2] * ln.speed];
    if (ln.speed <= 0) {
      ln.mode = 3; ln.v = [0, 0, 0];
      if (!ln.padDone) ev('lensStop', t, `Lens stopped ${Math.round(Math.max(0, ln.closest - P.padRadius) * 100)} cm short of the pad.`, false);
      else if (!ln.settled) ev('lensStop', t, 'Lens missed the gravity cube and came to rest on the floor.', false);
    }
  }

  function stepSkier(t, dt) {
    if (sk.phase === 0) {
      if (t >= sk.tStart) { sk.phase = 1; sk.v = P.pushOff; ev('start', t, 'Skier pushed off the start bar.'); }
      return;
    }
    if (sk.phase === 1) {
      const a = along(prof.inrun, sk.s);
      const tuck = clamp((t - sk.tStart) / 0.35, 0, 1) * P.tuckDepth;
      const drag = P.tuckDrag * (1.6 - 0.6 * tuck);
      const N = g * Math.cos(a.ang) + sk.v * sk.v * Math.max(0, a.k);
      sk.v += (-g * Math.sin(a.ang) - P.wax * N - drag * sk.v * sk.v) * dt;
      sk.s += sk.v * dt;
      const b = along(prof.inrun, sk.s);
      sk.x = b.x; sk.y = b.y; sk.ang = b.ang;
      if (sk.s >= prof.inrun.length) {
        const at = P.tableAngle * D2R;
        sk.vx = sk.v * Math.cos(at) + P.pop * Math.sin(at);
        sk.vy = -sk.v * Math.sin(at) + P.pop * Math.cos(at);
        sk.x = prof.edge[0]; sk.y = prof.edge[1];
        sk.phase = 2; sk.tTake = t;
        ev('takeoff', t, `Skier left the table at ${sk.v.toFixed(1)} m/s.`);
      }
      return;
    }
    if (sk.phase === 2) {
      const V = Math.hypot(sk.vx, sk.vy);
      const kd = P.flightDrag * dragMul, kl = P.lift * liftMul * (sk.crash ? 0 : 1);
      sk.vx += (-kd * V * sk.vx - kl * V * sk.vy) * dt;
      sk.vy += (-g - kd * V * sk.vy + kl * V * sk.vx) * dt;
      const px = sk.x;
      sk.x += sk.vx * dt; sk.y += sk.vy * dt;
      sk.ang = Math.atan2(sk.vy, sk.vx) + (sk.crash ? 0 : tipRad);
      if (sk.side === 0 && px + SKI_HALF < prof.xb && sk.x + SKI_HALF >= prof.xb) {
        if (sk.y < P.wallHeight) {
          sk.crash = 1; sk.x = prof.xb - SKI_HALF;
          bumpJ = m * Math.abs(sk.vx) * (1 + P.wallBounce);
          sk.vx = -Math.abs(sk.vx) * P.wallBounce;
          sk.tBump = t;
          ev('bump', t, `Skier flew straight into the wall at ${Math.abs(sk.vx / (P.wallBounce || 1)).toFixed(1)} m/s.`);
          onBump(t);
        } else {
          sk.side = 1;
          ev('bump', t, 'Skier flew clean over the wall.', false);
        }
      }
      const ground = sk.side ? 0 : surfY(sk.x);
      if (sk.y <= ground && sk.x >= prof.edge[0]) {
        sk.y = ground;
        const e = 0.002, th = sk.side ? 0 : Math.atan2(surfY(sk.x + e) - surfY(sk.x - e), 2 * e);
        const vt = sk.vx * Math.cos(th) + sk.vy * Math.sin(th);
        sk.v = vt * (1 - P.landAbsorb);
        sk.phase = 3; sk.tLand = t;
        if (!sk.crash && !sk.side) ev('land', t, `Skier landed ${Math.max(0, sk.x - prof.edge[0]).toFixed(2)} m past the edge.`);
      }
      return;
    }
    if (sk.phase === 3) {
      const e = 0.002, th = sk.side ? 0 : Math.atan2(surfY(sk.x + e) - surfY(sk.x - e), 2 * e);
      const flat = sk.side || sk.x >= prof.xh;
      const dir = Math.sign(sk.v);
      let a = -g * Math.sin(th) - dir * P.wax * g * Math.cos(th) - P.tuckDrag * sk.v * Math.abs(sk.v);
      if (flat) a -= dir * P.braking;
      const nv = sk.v + a * dt;
      if (flat && Math.sign(nv) !== dir) {   // braked to a standstill
        sk.v = 0; sk.phase = 4;
        if (sk.tBump < 0 && !sk.side) ev('stop', t, `Skier stopped ${Math.round((prof.xb - sk.x - SKI_HALF) * 100)} cm short of the wall.`, false);
        return;
      }
      sk.v = nv;
      sk.x += sk.v * Math.cos(th) * dt;
      sk.y = sk.side ? 0 : surfY(sk.x);
      sk.ang = th;
      if (!sk.side && sk.tBump < 0 && sk.x + SKI_HALF >= prof.xb) {
        sk.x = prof.xb - SKI_HALF;
        bumpJ = m * sk.v * (1 + P.wallBounce);
        ev('bump', t, `Skier bumped the wall at ${sk.v.toFixed(2)} m/s.`);
        sk.v = -sk.v * P.wallBounce; sk.tBump = t;
        onBump(t);
      } else if (!sk.side && sk.x + SKI_HALF >= prof.xb) {
        sk.x = prof.xb - SKI_HALF; sk.v = -Math.abs(sk.v) * P.wallBounce;
      }
    }
  }

  function onBump(t) {
    if (!opContact) { ev('topple', t, 'The bump didn’t reach the camera operator: he’s standing too far from the wall.', false); return; }
    opS.phase = 1;
    opS.w = P.wallShove * bumpJ;
  }

  function stepOperator(t, dt) {
    if (opS.phase !== 1) return;
    const Lc = OP.com * opH;
    opS.w += ((g / Lc) * Math.sin(opS.th) - P.opDamping * opS.w) * dt;
    opS.th += opS.w * dt;
    if (opS.th <= th0 && opS.w < 0) {
      opS.th = th0; opS.w = -opS.w * 0.25;
      if (opS.w < 0.05) { opS.phase = 0; opS.w = 0; ev('topple', t, 'The camera operator rocked, then settled back against the wall.', false); }
    }
    if (opS.th >= OP.hitAngle) {
      // the lens snaps off as he hits the floor
      const lp = tipPoint(OP.lens, opS.th, opH);
      const lv = tipVelocity(OP.lens, opS.th, opS.w, opH);
      const wp = rotY(lp, opRot), wv = rotY(lv, opRot);
      ln.p = [opPl.x + wp[0], Math.max(lensR, wp[1]), opPl.z + wp[2]];
      ln.v = [wv[0] + fallDir[0] * P.lensPop, wv[1], wv[2] + fallDir[2] * P.lensPop];
      ln.q = attachedLensQuat(opPl.rot, opS.th);
      ln.w = [rotY([0, 0, -opS.w], opRot)[0] * 2 + 3, -4, rotY([0, 0, -opS.w], opRot)[2] * 2 - 2];
      ln.mode = 1;
      tDetach = tTopple = t;
      ev('topple', t, 'The camera operator toppled backwards.');
      ev('detach', t, 'The lens snapped off the camera.');
      opS.phase = 2; opS.th = OP.hitAngle + 4 * D2R; opS.w = 0;
    }
  }

  function stepBeam(t, dt) {
    if (tSettle >= 0 && beam.on < 0 && t >= tSettle + P.laserDelay) {
      beam.on = t;
      const d = norm3([pileTop[0] - ln.p[0], pileTop[1] - ln.p[1], pileTop[2] - ln.p[2]]);
      beam.bend = Math.acos(clamp(dot3(d, beamIn), -1, 1)) / D2R;
      const dist = Math.hypot(pileTop[0] - ln.p[0], pileTop[1] - ln.p[1], pileTop[2] - ln.p[2]);
      if (beam.bend <= P.bendLimit) {
        beam.hit = true; beam.out = pileTop.slice();
        beam.focus = 1 / (1 + ((dist - P.focal) / (0.25 * P.focal)) ** 2);
        ev('laser', t, `Laser on. The lens turns the beam ${Math.round(beam.bend)}° onto the pile, ${Math.round(beam.focus * 100)}% in focus.`);
      } else {
        beam.hit = false;
        // carries straight on to whatever it meets
        let k = 50;
        for (let i = 0; i < 3; i++) {
          const lim = i === 1 ? (beamIn[1] > 0 ? H : 0) : (beamIn[i] > 0 ? (i === 0 ? hw : hd) : -(i === 0 ? hw : hd));
          if (Math.abs(beamIn[i]) > 1e-6) { const kk = (lim - ln.p[i]) / beamIn[i]; if (kk > 0) k = Math.min(k, kk); }
        }
        beam.out = [ln.p[0] + beamIn[0] * k, ln.p[1] + beamIn[1] * k, ln.p[2] + beamIn[2] * k];
        ev('laser', t, `Laser on, but the pile is ${Math.round(beam.bend)}° off the beam, past the lens’s bend limit.`, false);
      }
    }
    if (beam.on >= 0 && beam.hit && tIgnite < 0) {
      beam.energy += P.laserPower * beam.focus * dt;
      if (beam.energy >= P.ignition) { tIgnite = t; beam.off = t + P.laserHold; ev('ignite', t, 'The gunpowder pile caught.'); }
      else if (t - beam.on > 30) ev('ignite', t, 'Thirty seconds of laser and the pile still hasn’t lit. More power, or bring it into focus.', false);
    }
    if (tIgnite >= 0 && tReach < 0) {
      tReach = tIgnite + trail.length / P.burnSpeed;
      tBoom = tReach + P.fuseDelay;
      ev('reach', tReach, `The flame ran ${trail.length.toFixed(1)} m of powder to the whale.`);
      ev('boom', tBoom, 'The charges inside the whale went off.');
    }
  }

  /* ---------- the blast: chunks, the two big ends, mist and splatter ---------- */
  const W = L.whale, wRot = (W.rot || 0) * D2R, WL = P.whaleLength;
  const R = rng(1234567);
  const chunkN = Math.round(P.chunkCount);
  const ch = { r: new Float32Array(chunkN), shape: new Uint8Array(chunkN), skin: new Float32Array(chunkN) };
  const cs = [];   // live state
  const pieces = [];
  const mistN = Math.round(P.mistCount);
  const mi = { p: new Float32Array(mistN * 3), v: new Float32Array(mistN * 3), stuck: new Uint8Array(mistN), life: new Float32Array(mistN), size: new Float32Array(mistN), tone: new Float32Array(mistN) };
  const decals = [];
  const MAX_DECALS = 500;
  const chargeL = [WL * (0.5 - 0.47), whaleSection(0.47, WL, P.whaleBloat).cy, 0];
  const toW = (lx, ly, lz) => { const [x, z] = toWorld(W, lx, lz); return [x, ly, z]; };
  const charge = toW(...chargeL);
  let blown = false;
  for (let i = 0; i < chunkN; i++) {
    ch.r[i] = P.chunkSize * (0.03 + 0.15 * Math.pow(R(), 2.4));
    ch.shape[i] = Math.floor(R() * 8);
    ch.skin[i] = R();
  }

  function blow() {
    blown = true;
    const [u0, u1] = WHALE_SPLIT;
    for (let i = 0; i < chunkN; i++) {
      const u = u0 + (u1 - u0) * R();
      const s = whaleSection(u, WL, P.whaleBloat);
      const a = R() * Math.PI * 2, rf = Math.sqrt(R());
      const r = ch.r[i];
      const lp = [WL * (0.5 - u), Math.max(r, s.cy + s.h * rf * Math.sin(a)), s.w * rf * Math.cos(a)];
      const p = toW(...lp);
      let d = norm3([p[0] - charge[0], p[1] - charge[1], p[2] - charge[2]]);
      d = norm3([d[0], d[1] + P.upBias + 0.2 * R(), d[2]]);
      const sp = P.charge * (0.45 + 0.9 * R()) / (1 + 5 * r / P.chunkSize);
      const ws = 25 / (1 + 12 * r);
      cs.push({ p, v: [d[0] * sp, d[1] * sp, d[2] * sp], q: qNorm([R() - 0.5, R() - 0.5, R() - 0.5, R() - 0.5]), w: [(R() - 0.5) * ws, (R() - 0.5) * ws, (R() - 0.5) * ws], r, sleep: false, rest: 0 });
    }
    // the head and the tail stock stay in one piece and get shoved apart
    for (const [u, dir] of [[WHALE_SPLIT[0] * 0.5, 1], [(WHALE_SPLIT[1] + 1) * 0.5, -1]]) {
      const lp = [WL * (0.5 - u), 0, 0];
      const p = toW(...lp);
      const v = rotY([dir * P.charge * 0.11, 0, (R() - 0.5) * P.charge * 0.05], wRot);
      pieces.push({ p, v: [v[0], 1.2 + P.charge * 0.06, v[2]], yaw: wRot, wy: (R() - 0.5) * 2.4, tilt: 0, wt: dir * (1.2 + R()), half: WL * (dir > 0 ? WHALE_SPLIT[0] : 1 - WHALE_SPLIT[1]) * 0.5 });
    }
    for (let i = 0; i < mistN; i++) {
      const o = norm3([R() - 0.5, R() - 0.5, R() - 0.5]);
      let d = norm3([R() - 0.5, R() * 1.2 - 0.25, R() - 0.5]);
      d = norm3([d[0], d[1] + P.upBias * 0.5, d[2]]);
      const sp = P.mistSpeed * (0.2 + 0.8 * Math.sqrt(R()));
      mi.p.set([charge[0] + o[0] * 0.35, Math.max(0.05, charge[1] + o[1] * 0.35), charge[2] + o[2] * 0.35], i * 3);
      mi.v.set([d[0] * sp, d[1] * sp, d[2] * sp], i * 3);
      mi.life[i] = 0.55 + 0.9 * R();
      mi.size[i] = 0.5 + R();
      mi.tone[i] = R();
    }
  }

  function decal(t, p, n, size, kind) {
    if (!P.splatter || decals.length >= MAX_DECALS) return;
    decals.push({ t, p: [p[0] + n[0] * 0.002, p[1] + n[1] * 0.002, p[2] + n[2] * 0.002], n, size, kind, rot: R() * Math.PI * 2, shape: Math.floor(R() * 4) });
  }

  const planes = [
    [1, 0, [0, 1, 0]], [1, H, [0, -1, 0]],
    [0, -hw, [1, 0, 0]], [0, hw, [-1, 0, 0]],
    [2, -hd, [0, 0, 1]], [2, hd, [0, 0, -1]],
  ];

  function stepBlast(t, dt) {
    for (const c of cs) {
      if (c.sleep) continue;
      c.v[1] -= g * dt;
      const dr = Math.exp(-0.08 * dt);
      for (let i = 0; i < 3; i++) { c.v[i] *= dr; c.p[i] += c.v[i] * dt; }
      c.q = qIntegrate(c.q, c.w, dt);
      let onFloor = false;
      for (const [ax, at, n] of planes) {
        const side = n[ax];   // +1: plane below/behind, -1: above/in front
        const pen = side > 0 ? at + c.r - c.p[ax] : c.p[ax] - (at - c.r);
        if (pen <= 0) continue;
        c.p[ax] += side * pen;
        const vn = c.v[ax] * side;
        if (ax === 1 && side > 0) onFloor = true;
        if (vn < 0) {
          const sp = -vn;
          if (sp > 1.8) decal(t, [c.p[0] - n[0] * c.r, c.p[1] - n[1] * c.r, c.p[2] - n[2] * c.r], n, c.r * (1.6 + 0.25 * Math.min(sp, 14)), 0);
          c.v[ax] = side * sp * P.chunkBounce;
          for (let i = 0; i < 3; i++) if (i !== ax) c.v[i] *= 1 - 0.35 * P.chunkGrip;
          for (let i = 0; i < 3; i++) c.w[i] *= 0.7;
          c.w[(ax + 1) % 3] += (R() - 0.5) * sp * 4;
        }
      }
      if (onFloor && Math.abs(c.v[1]) < 0.4) {
        c.v[1] = 0;
        const sp = Math.hypot(c.v[0], c.v[2]);
        const ns = Math.max(0, sp - P.chunkGrip * 6 * g * dt);
        if (sp > 0) { c.v[0] *= ns / sp; c.v[2] *= ns / sp; }
        for (let i = 0; i < 3; i++) c.w[i] *= Math.exp(-6 * P.chunkGrip * dt);
        if (ns < 0.03 && len3(c.w) < 0.4) { if ((c.rest += dt) > 0.2) { c.sleep = true; c.v = [0, 0, 0]; c.w = [0, 0, 0]; } }
        else c.rest = 0;
      }
    }
    for (const pc of pieces) {
      pc.v[1] -= g * dt;
      for (const i of [0, 1, 2]) pc.p[i] += pc.v[i] * dt;
      pc.yaw += pc.wy * dt;
      pc.tilt += pc.wt * dt;
      pc.wt += -pc.tilt * 30 * dt; pc.wt *= Math.exp(-3 * dt);
      if (pc.p[1] < 0) {
        pc.p[1] = 0;
        if (pc.v[1] < -0.5) decal(t, [pc.p[0], 0.001, pc.p[2]], [0, 1, 0], pc.half * 0.9, 0);
        pc.v[1] = -pc.v[1] * 0.2;
        if (Math.abs(pc.v[1]) < 0.3) pc.v[1] = 0;
      }
      if (pc.p[1] === 0) {
        const sp = Math.hypot(pc.v[0], pc.v[2]), ns = Math.max(0, sp - 3.5 * dt);
        if (sp > 0) { pc.v[0] *= ns / sp; pc.v[2] *= ns / sp; }
        pc.wy *= Math.exp(-2.5 * dt);
      }
      for (const [i, lim] of [[0, hw], [2, hd]]) {
        if (Math.abs(pc.p[i]) > lim - pc.half) { pc.p[i] = Math.sign(pc.p[i]) * (lim - pc.half); pc.v[i] = -pc.v[i] * 0.3; }
      }
    }
  }

  function stepMist(t, dt) {
    const gm = g * 0.3, dr = Math.exp(-P.mistDrag * dt);
    for (let i = 0; i < mistN; i++) {
      if (mi.stuck[i]) continue;
      const o = i * 3;
      mi.v[o + 1] -= gm * dt;
      for (let k = 0; k < 3; k++) { mi.v[o + k] *= dr; mi.p[o + k] += mi.v[o + k] * dt; }
      for (const [ax, at, n] of planes) {
        const side = n[ax];
        const pen = side > 0 ? at + 0.01 - mi.p[o + ax] : mi.p[o + ax] - (at - 0.01);
        if (pen <= 0) continue;
        mi.p[o + ax] += side * pen;
        const sp = -mi.v[o + ax] * side;
        if (ax === 1 && side > 0) {
          mi.stuck[i] = 1;
          if (sp > 1 && R() < 0.06) decal(t, [mi.p[o], 0.001, mi.p[o + 2]], n, 0.05 + 0.06 * R(), 1);
          break;
        }
        if (sp > 2.5 && R() < 0.12) decal(t, [mi.p[o] - n[0] * 0.01, mi.p[o + 1] - n[1] * 0.01, mi.p[o + 2] - n[2] * 0.01], n, 0.04 + 0.08 * R(), 1);
        mi.v[o + ax] = side * Math.abs(mi.v[o + ax]) * P.mistBounce;
      }
    }
  }

  /* ---------- run it ---------- */
  let chunkData = null, pieceData = null, mistData = null, boomFrame = -1, mistFrames = 0;
  const mistStep = FPS / MIST_FPS;
  const chunkFrames = [], pieceFrames = [], mistFramesArr = [];

  const record = f => {
    const o = f * SK;
    const tuck = sk.phase === 1 ? clamp((t - sk.tStart) / 0.35, 0, 1) * P.tuckDepth : sk.phase === 0 ? 0 : 0;
    const fly = sk.phase === 2 && !sk.crash ? clamp((t - sk.tTake) / 0.25, 0, 1) : sk.phase >= 3 && sk.tLand >= 0 && !sk.crash ? clamp(1 - (t - sk.tLand) / 0.2, 0, 1) : 0;
    const land = sk.tLand >= 0 && !sk.crash ? clamp((t - sk.tLand) / 0.12, 0, 1) * clamp(1 - (t - sk.tLand - 0.5) / 0.8, 0.25, 1) : 0;
    const speed = sk.phase === 2 ? Math.hypot(sk.vx, sk.vy) : Math.abs(sk.v);
    skier.set([sk.x, sk.y, sk.ang, tuck, fly, land, speed, sk.crash ? 1 : 0], o);
    op[f] = opS.th;
    lens.set([ln.p[0], ln.p[1], ln.p[2], ln.q[0], ln.q[1], ln.q[2], ln.q[3], ln.mode], f * LN);
    if (blown) {
      const cd = new Float32Array(chunkN * 7);
      for (let i = 0; i < chunkN; i++) cd.set([cs[i].p[0], cs[i].p[1], cs[i].p[2], cs[i].q[0], cs[i].q[1], cs[i].q[2], cs[i].q[3]], i * 7);
      chunkFrames.push(cd);
      const pd = new Float32Array(2 * 7);
      pieces.forEach((pc, i) => {
        const q = qMul(qAxis(0, 1, 0, pc.yaw), qAxis(0, 0, 1, pc.tilt * 0.15));
        pd.set([pc.p[0], pc.p[1], pc.p[2], ...q], i * 7);
      });
      pieceFrames.push(pd);
      if ((f - boomFrame) % mistStep === 0) mistFramesArr.push(mi.p.slice());
    }
  };

  record(0);
  for (frame = 1; frame < maxFrames; frame++) {
    for (let k = 0; k < SUB; k++) {
      t += dt;
      stepSkier(t, dt);
      stepOperator(t, dt);
      if (ln.mode === 1) lensFree(t, dt);
      else if (ln.mode === 2) lensRoll(t, dt);
      stepBeam(t, dt);
      if (tBoom >= 0 && !blown && t >= tBoom) { boomFrame = frame; blow(); }
      if (blown) { stepBlast(t, dt); if (k % 2 === 0) stepMist(t, dt * 2); }
    }
    if (ln.inCube && !ln.settled && tSettle < 0 && t - (events.find(e => e.id === 'enter')?.t ?? t) > 40) ev('settle', t, 'The lens never settled in the cube. More damping, or less pull.', false);
    record(frame);
    if (fail && t >= fail.t + 3) { tEnd = t; break; }
    if (tBoom >= 0 && t >= tBoom + P.runOn) { tEnd = t; break; }
  }
  const frames = Math.min(frame + 1, maxFrames);
  if (frames >= maxFrames && !fail) ev('timeout', t, 'The run went on too long and was cut off.', false);

  if (blown) {
    chunkData = chunkFrames; pieceData = pieceFrames; mistData = mistFramesArr; mistFrames = mistFramesArr.length;
  }
  events.sort((a, b) => a.t - b.t);
  return {
    frames, duration: (frames - 1) / FPS, events, fail, ok: !fail, prof,
    skier: skier.subarray(0, frames * SK), SK, op: op.subarray(0, frames), lens: lens.subarray(0, frames * LN), LN,
    opPlacement: opPl, opContact,
    times: { settle: tSettle, ignite: tIgnite, reach: tReach, boom: tBoom, pad: tPad, detach: tDetach, topple: tTopple, bump: sk.tBump, takeoff: sk.tTake, land: sk.tLand, start: sk.tStart },
    beam, beamIn, laserPos, cubeC, pileTop, qTarget,
    trail,
    blast: blown ? { boomFrame, charge, chunkN, chunk: ch, chunkData, pieceData, mistN, mist: { data: mistData, frames: mistFrames, life: mi.life, size: mi.size, tone: mi.tone }, decals } : null,
  };
}
