/* Shapes the simulation and the drawing both need: the ski jump's profile, where the lens
   sits on the camera operator, and the whale's body. Plain numbers, no three.js. */

const D2R = Math.PI / 180;
export const WALL_THICK = 0.03;
export const SKI_HALF = 0.13;   // half a ski length; the tips hit the wall first

/* Side profile of the jump in its own frame: x forward (down the hill), y up, x = 0 under
   the start. Two surfaces: the inrun (start to the takeoff edge), then the landing hill
   plus outrun (knoll to the wall). */
export function jumpProfile(P) {
  const ai = P.inrunAngle * D2R, at = P.tableAngle * D2R, R = P.transition;
  const edge = [0, P.edgeHeight];
  const t0 = [edge[0] - P.tableLength * Math.cos(at), edge[1] + P.tableLength * Math.sin(at)];
  const C = [t0[0] + R * Math.sin(at), t0[1] + R * Math.cos(at)];
  const arc = b => [C[0] - R * Math.sin(b), C[1] - R * Math.cos(b)];
  const a0 = arc(ai);
  const start = [a0[0] - P.inrunLength * Math.cos(ai), a0[1] + P.inrunLength * Math.sin(ai)];

  const inrun = [];
  const n1 = Math.max(8, Math.round(P.inrunLength / 0.02));
  for (let i = 0; i <= n1; i++) { const f = i / n1; inrun.push([start[0] + (a0[0] - start[0]) * f, start[1] + (a0[1] - start[1]) * f]); }
  const n2 = Math.max(8, Math.round(R * (ai - at) / 0.01));
  for (let i = 1; i <= n2; i++) inrun.push(arc(ai + (at - ai) * i / n2));
  const n3 = Math.max(4, Math.round(P.tableLength / 0.01));
  for (let i = 1; i <= n3; i++) { const f = i / n3; inrun.push([t0[0] + (edge[0] - t0[0]) * f, t0[1] + (edge[1] - t0[1]) * f]); }

  // shift so the start sits at x = 0
  const sx = -start[0];
  for (const p of inrun) p[0] += sx;
  const xe = edge[0] + sx, ye = edge[1];
  const xk = xe + 0.015, yk = Math.max(0.02, ye - P.knollGap);
  const xh = xk + P.hillLength, xb = xh + P.outrunLength;

  const hill = [];
  const n4 = Math.max(20, Math.round(P.hillLength / 0.01));
  for (let i = 0; i <= n4; i++) { const x = xk + P.hillLength * i / n4; hill.push([x, hillY(x)]); }
  const n5 = Math.max(4, Math.round(P.outrunLength / 0.02));
  for (let i = 1; i <= n5; i++) hill.push([xh + P.outrunLength * i / n5, 0]);

  function hillY(x) {
    if (x <= xk) return yk;
    if (x >= xh) return 0;
    const u = (x - xk) / P.hillLength;
    return yk * (1 - u * u * (3 - 2 * u));
  }
  return {
    inrun: withLengths(inrun), hill: withLengths(hill), hillY,
    start: [0, start[1]], edge: [xe, ye], xk, yk, xh, xb, wallBack: xb + WALL_THICK,
    width: P.trackWidth, topY: start[1],
  };
}

function withLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, length: s[s.length - 1] };
}

/* position and slope angle (radians, negative going downhill) at arc length s */
export function along(path, s) {
  const { pts, s: L } = path;
  if (s <= 0) return seg(0, 0);
  if (s >= path.length) return seg(pts.length - 2, 1);
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
  return seg(lo, (s - L[lo]) / (L[lo + 1] - L[lo] || 1));
  function seg(i, f) {
    const a = pts[i], b = pts[i + 1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    // curvature from the neighbouring segment, for the normal force over the transition
    const c = pts[Math.min(pts.length - 1, i + 2)];
    const ang2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    const ds = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang, k: (ang2 - ang) / ds };
  }
}

/* arc length on a path nearest to x (paths here only ever move forward in x) */
export function sAtX(path, x) {
  const { pts, s } = path;
  if (x <= pts[0][0]) return 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) { const f = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1); return s[i - 1] + (s[i] - s[i - 1]) * f; }
  }
  return path.length;
}

/* The camera operator, in his own frame: feet at the origin, the wall on the -x side, facing
   it. He tips back towards +x by angle th. Proportions scale with his height h. */
export const OP = {
  com: 0.55,                         // centre of mass, as a share of height
  lens: [-0.27, 0.86, -0.1],         // lens centre on the shoulder camera
  hitAngle: 84 * D2R,                // he's flat on the floor
};
export function tipPoint(p, th, h) {
  const x = p[0] * h, y = p[1] * h, c = Math.cos(th), s = Math.sin(th);
  return [x * c + y * s, -x * s + y * c, p[2] * h];
}
export function tipVelocity(p, th, w, h) {
  const x = p[0] * h, y = p[1] * h, c = Math.cos(th), s = Math.sin(th);
  return [w * (-x * s + y * c), w * (-x * c - y * s), 0];
}

/* The whale lies on its belly along local x, head at +x, flattened where it meets the floor.
   u runs 0 (snout) to 1 (tail stock). Returns half width, half height and centre height. */
export function whaleSection(u, L, bloat) {
  const R = L * 0.12 * bloat;
  let f;
  if (u < 0.3) { const q = (0.3 - u) / 0.3; f = Math.sqrt(Math.max(0, 1 - q * q)) * 0.92 + 0.08 * (1 - q); }
  else if (u < 0.9) { const q = (u - 0.3) / 0.6; f = 1 - 0.86 * q * q * (3 - 2 * q); }
  else f = 0.14 - (u - 0.9) * 0.6;
  const w = R * Math.max(0.03, f);
  const hh = w * 0.82 / (0.85 + 0.15 * bloat);
  return { w, h: hh, cy: hh * 0.78 };
}
export const WHALE_SPLIT = [0.24, 0.7];   // head ends, tail begins: the middle is what blows

export const toWorld = (o, lx, lz) => {   // a placement {x, z, rot°} applied to a local point
  const a = (o.rot || 0) * D2R, c = Math.cos(a), s = Math.sin(a);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
};
export const toLocal = (o, wx, wz) => {
  const a = (o.rot || 0) * D2R, c = Math.cos(a), s = Math.sin(a);
  const dx = wx - o.x, dz = wz - o.z;
  return [dx * c - dz * s, dx * s + dz * c];
};

/* where the camera operator's feet are, and which way he faces, in world coordinates */
export function operatorPlacement(P, L, prof) {
  const [x, z] = toWorld(L.jump, prof.wallBack + L.operator.dx, L.operator.dz);
  return { x, z, rot: (L.jump.rot || 0) + (L.operator.rot || 0) };
}

/* the fuse end of the trail: low on the whale's flank, facing the trail's last bend */
export function fusePoint(P, L) {
  const W = L.whale, s = whaleSection(0.47, P.whaleLength, P.whaleBloat);
  const last = L.trail[L.trail.length - 1] || L.pile;
  const [lx, lz] = toLocal(W, last.x, last.z);
  const side = lz >= 0 ? 1 : -1;
  const [x, z] = toWorld(W, P.whaleLength * (0.5 - 0.47), side * s.w * 0.98);
  return { x, z };
}
