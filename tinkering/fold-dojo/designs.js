/* The five designs, written as fold steps for engine.js.

   Coordinates are the model plane as you look down at the table: x to the right, y away from
   you, with the sheet one unit across and centred on 0,0. A hinge is a line (a to b), the side
   that moves (toward) and how far it turns: +π is a valley fold (the flap comes up toward
   you and over), -π a mountain fold (it goes underneath). `layers: [0, 0]` means only the top
   layer where the facet sits, `[1, 1]` the one under it. `addTag` labels what a move carries,
   so a later step can pick the same flap up again with `tag`. */

import { Aff } from './engine.js';

const V = Math.PI, M = -Math.PI;
const h = (a, b, toward, angle = V) => ({ a, b, toward, angle });
const R2 = Math.SQRT1_2;

const square = () => [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const diamond = () => ({ poly: square(), M: Aff.rotate(Math.PI / 4) });

function reflectPt(p, a, b) {
  const u = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...u);
  u[0] /= l; u[1] /= l;
  const v = [p[0] - a[0], p[1] - a[1]], d = v[0] * u[0] + v[1] * u[1];
  return [a[0] + 2 * d * u[0] - v[0], a[1] + 2 * d * u[1] - v[1]];
}
const mirror = p => [-p[0], p[1]];

/* ---------- paper airplane ---------- */
const airplane = {
  id: 'dart',
  name: 'Paper airplane',
  summary: 'The classic dart, from a sheet of printer paper.',
  level: 'Beginner',
  about: [
    'The dart is the plane most people learn first: a sharp nose, swept wings and a narrow keel to hold it by. Every fold is a straight valley or mountain fold, so it is the best design to start with.',
    'It needs a rectangle, so it uses A4, A5 or US Letter instead of square origami paper. Firmer paper flies straighter.',
  ],
  shape: 'rect',
  colorSide: 'back',
  sheet: ({ aspect = Math.SQRT2 }) => {
    const H = aspect / 2;
    return { poly: [[-0.5, -H], [0.5, -H], [0.5, H], [-0.5, H]], M: Aff.I(), w: 1, h: aspect };
  },
  steps: ({ aspect = Math.SQRT2 }) => {
    const H = aspect / 2;
    // the second pair of folds bisects the angle between the first fold and the centre line
    const d = [-Math.sin(Math.PI / 8), -Math.cos(Math.PI / 8)];
    const far = [d[0] * 2, H + d[1] * 2];
    const k = 0.1;   // depth of the keel at the tail
    return [
      { type: 'fold', title: 'Fold in half the long way', text: 'Fold the right edge over to the left edge and crease down the middle.', moves: [{ hinges: [h([0, -1], [0, 1], [1, 0])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it flat again. The centre crease is your guide for the next folds.' },
      { type: 'fold', title: 'Fold the top left corner to the centre', text: 'Bring the top left corner down so the top edge lies along the centre crease.', moves: [{ hinges: [h([0, H], [-0.5, H - 0.5], [-0.5, H])] }] },
      { type: 'fold', title: 'Fold the top right corner to the centre', text: 'Do the same on the right. You now have a point at the top, like a house.', moves: [{ hinges: [h([0, H], [0.5, H - 0.5], [0.5, H])] }] },
      { type: 'fold', title: 'Fold the left edge to the centre again', text: 'Fold the new slanted edge on the left in to the centre crease. The nose gets sharper.', moves: [{ hinges: [h([0, H], far, [-0.5, 0])] }] },
      { type: 'fold', title: 'Fold the right edge to the centre again', text: 'Same on the right. Keep the point at the top crisp.', moves: [{ hinges: [h([0, H], mirror(far), [0.5, 0])] }] },
      { type: 'fold', title: 'Fold in half, folds on the outside', text: 'Mountain fold the left half behind along the centre crease, so the flaps stay on the outside.', moves: [{ hinges: [h([0, -1], [0, 1], [-1, 0], M)] }] },
      { type: 'fold', title: 'Fold the first wing down', text: 'Fold the top layer back toward the spine along a line from the nose to just short of the tail. This makes the first wing and the keel.', moves: [{ hinges: [h([0, H], [k, -H], [0.5, 0])], paper: p => p[0] > 0, addTag: 'wing1' }] },
      { type: 'flip', title: 'Turn it over', text: 'Turn the plane over from left to right.', axis: 0 },
      { type: 'fold', title: 'Fold the second wing down', text: 'Fold the other wing to match, lining its edge up with the first wing.', moves: [{ hinges: [h([0, H], [-k, -H], [-0.5, 0])], paper: p => p[0] < 0, addTag: 'wing2' }] },
      {
        type: 'fold', title: 'Open the wings', text: 'Lift both wings out level and hold the plane by the keel. Ready to throw.', dur: 1.6,
        moves: [
          { hinges: [h([0, H], [-k, -H], [0.5, 0], Math.PI / 2)], tag: 'wing2' },
          { hinges: [h([0, H], [-k, -H], [0.5, 0], -Math.PI / 2)], tag: 'wing1' },
        ],
        present: { axis: [0, 0, 1], angle: -Math.PI / 2 },
      },
    ];
  },
};

/* ---------- samurai helmet ---------- */
const r = R2;
const helmet = {
  id: 'kabuto',
  display: { axis: [1, 0, 0], angle: Math.PI / 2 },   // stood upright in the viewer
  name: 'Samurai helmet',
  summary: 'Kabuto, with horns and a folded brim.',
  level: 'Beginner',
  about: [
    'The kabuto is a traditional Japanese model, folded for Children\'s Day in May. Made from a sheet of newspaper it is big enough to wear.',
    'It uses only valley and mountain folds, worked from a triangle. The horns are the two side corners, folded up and then out.',
  ],
  shape: 'square',
  colorSide: 'back',
  sheet: diamond,
  steps: () => {
    // horn fold: the tip at the top swings out to the upper left
    const X = [-0.3, 0.1], mid = [X[0] / 2, X[1] / 2], dir = [0.1, 0.3];
    const hornA = [mid[0] - dir[0], mid[1] - dir[1]], hornB = [mid[0] + dir[0], mid[1] + dir[1]];
    const base = h([-1, -r / 2], [1, -r / 2], [0, 0]);   // the horns are only the flaps above here
    return [
      { type: 'fold', title: 'Fold into a triangle', text: 'With the paper as a diamond, fold the top corner down to the bottom corner.', moves: [{ hinges: [h([-1, 0], [1, 0], [0, 1])], addTag: 'front' }] },
      { type: 'fold', title: 'Fold the left corner down', text: 'Bring the left corner down to the bottom point.', moves: [{ hinges: [h([0, 0], [-1, -1], [-r, 0])] }] },
      { type: 'fold', title: 'Fold the right corner down', text: 'Bring the right corner down to meet it. You have a diamond again, smaller.', moves: [{ hinges: [h([0, 0], [1, -1], [r, 0])] }] },
      { type: 'fold', title: 'Fold the left flap up', text: 'Fold the bottom point of the left flap up to the top point.', moves: [{ hinges: [h([-1, -r / 2], [1, -r / 2], [0, -r])], within: [h([-1, -r / 2], [1, -r / 2], [0, -r]), h([0, -1], [0, 1], [-1, 0])], layers: [0, 1] }] },
      { type: 'fold', title: 'Fold the right flap up', text: 'Do the same with the right flap.', moves: [{ hinges: [h([-1, -r / 2], [1, -r / 2], [0, -r])], within: [h([-1, -r / 2], [1, -r / 2], [0, -r]), h([0, -1], [0, 1], [1, 0])], layers: [0, 1] }] },
      {
        type: 'fold', title: 'Fold the horns out', text: 'Fold the top points of both flaps down and outward, so they stick out past the sides as horns.',
        moves: [
          { hinges: [h(hornA, hornB, [0, -0.1])], within: [h(hornA, hornB, [0, -0.1]), h([0, -1], [0, 1], [-1, 0]), base], layers: [0, 1] },
          { hinges: [h(mirror(hornA), mirror(hornB), [0, -0.1])], within: [h(mirror(hornA), mirror(hornB), [0, -0.1]), h([0, -1], [0, 1], [1, 0]), base], layers: [0, 1] },
        ],
      },
      { type: 'fold', title: 'Fold the front point up', text: 'Fold the bottom point of the front layer only up to the base of the horns.', moves: [{ hinges: [h([-1, -0.75 * r], [1, -0.75 * r], [0, -r])], tag: 'front', within: [h([-1, -0.75 * r], [1, -0.75 * r], [0, -r])] }] },
      { type: 'fold', title: 'Fold the brim up', text: 'Fold the same layer up again along the base of the horns. This is the brim.', moves: [{ hinges: [h([-1, -r / 2], [1, -r / 2], [0, -r])], tag: 'front' }] },
      { type: 'fold', title: 'Fold the back flap inside', text: 'Mountain fold the last bottom point up behind the helmet. Open the bottom a little and it will sit on your hand.', moves: [{ hinges: [h([-1, -r / 2], [1, -r / 2], [0, -r], M)] }] },
    ];
  },
};

/* ---------- heart ---------- */
const heart = {
  id: 'heart',
  display: { axis: [1, 0, 0], angle: Math.PI / 2 },   // stood upright in the viewer
  name: 'Heart',
  summary: 'A flat heart, good for cards and notes.',
  level: 'Beginner',
  about: [
    'A quick, satisfying model that lies flat, so it can go in an envelope. It starts with two centre creases that everything else lines up against.',
    'The rounded top comes from folding small corners behind. The smaller you make them, the squarer the heart.',
  ],
  shape: 'square',
  colorSide: 'back',
  sheet: () => ({ poly: square(), M: Aff.I() }),
  steps: () => {
    const c = 0.08, s = 0.05;
    const V1 = [0, -0.125];
    return [
      { type: 'fold', title: 'Fold in half side to side', text: 'Fold the right edge over to the left edge.', moves: [{ hinges: [h([0, -1], [0, 1], [1, 0])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it flat. You have a vertical centre crease.' },
      { type: 'fold', title: 'Fold in half top to bottom', text: 'Fold the top edge down to the bottom edge.', moves: [{ hinges: [h([-1, 0], [1, 0], [0, 1])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it again. Now there is a crease each way.' },
      { type: 'fold', title: 'Fold the top edge to the centre', text: 'Fold the top edge down to the horizontal centre crease.', moves: [{ hinges: [h([-1, 0.25], [1, 0.25], [0, 1])] }] },
      { type: 'fold', title: 'Fold the bottom edge up', text: 'Fold the bottom edge up to meet the top edge.', moves: [{ hinges: [h([-1, -0.125], [1, -0.125], [0, -1])] }] },
      { type: 'flip', title: 'Turn it over', text: 'Turn the paper over, keeping the long edges at the top and bottom.', axis: 0 },
      { type: 'fold', title: 'Fold the right half up', text: 'Fold the right half of the bottom edge up so it lies along the centre crease. It will stick out past the top.', moves: [{ hinges: [h(V1, [1, 0.875], [0.5, -0.125])] }] },
      { type: 'fold', title: 'Fold the left half up', text: 'Do the same on the left. The bottom is now the point of the heart.', moves: [{ hinges: [h(V1, [-1, 0.875], [-0.5, -0.125])] }] },
      { type: 'flip', title: 'Turn it over', text: 'Turn it over. The heart is there; now round it off.', axis: 0 },
      {
        type: 'fold', title: 'Fold the top corners behind', text: 'Mountain fold the outer top corners of both humps behind.',
        moves: [
          { hinges: [h([0.375 - c, 0.375], [0.375, 0.375 - c], [0.5, 0.5], M)] },
          { hinges: [h([-0.375 + c, 0.375], [-0.375, 0.375 - c], [-0.5, 0.5], M)] },
        ],
      },
      {
        type: 'fold', title: 'Fold the middle corners behind', text: 'Mountain fold the two corners at the top middle behind, making the dip between the humps.',
        moves: [
          { hinges: [h([0, 0.375 - c], [c, 0.375], [0, 0.4], M)], within: [h([0, 0.375 - c], [c, 0.375], [0, 0.4], M), h([0, -1], [0, 1], [1, 0])] },
          { hinges: [h([0, 0.375 - c], [-c, 0.375], [0, 0.4], M)], within: [h([0, 0.375 - c], [-c, 0.375], [0, 0.4], M), h([0, -1], [0, 1], [-1, 0])] },
        ],
      },
      {
        type: 'fold', title: 'Fold the side corners behind', text: 'Finally take the small corners at the sides behind, so the outline flows into the point.',
        moves: [
          { hinges: [h([0.375, 0.25 + s], [0.375 - s * R2, 0.25 - s * R2], [0.5, 0.25], M)] },
          { hinges: [h([-0.375, 0.25 + s], [-0.375 + s * R2, 0.25 - s * R2], [-0.5, 0.25], M)] },
        ],
      },
    ];
  },
};

/* ---------- cup ---------- */
const cup = {
  id: 'cup',
  display: { axis: [1, 0, 0], angle: Math.PI / 2 },   // stood upright in the viewer
  name: 'Cup',
  summary: 'A drinking cup that really holds water, for a while.',
  level: 'Beginner',
  about: [
    'The paper cup is a useful model: five folds and it holds water for a few minutes. Waxed or heavier paper lasts longer.',
    'The key fold is the second one. The corner goes across to the far edge so that the top of the flap ends up level.',
  ],
  shape: 'square',
  colorSide: 'back',
  sheet: diamond,
  steps: () => {
    const Q = [(Math.SQRT2 - 1) * r, (2 - Math.SQRT2) * r], Mi = [(1 - R2) * r, (1 - R2) * r];
    const top = Q[1];
    return [
      { type: 'fold', title: 'Fold into a triangle', text: 'With the paper as a diamond, fold the bottom corner up to the top corner.', moves: [{ hinges: [h([-1, 0], [1, 0], [0, -1])], addTag: 'front' }] },
      { type: 'fold', title: 'Fold the right corner across', text: 'Fold the right corner over to touch the left edge, so the top edge of the flap is level.', moves: [{ hinges: [h(Q, Mi, [r, 0])] }] },
      { type: 'fold', title: 'Fold the left corner across', text: 'Fold the left corner over to the right edge the same way.', moves: [{ hinges: [h(mirror(Q), mirror(Mi), [-r, 0])] }] },
      { type: 'fold', title: 'Fold the front flap down', text: 'Fold the front layer of the top point down over the front. Tuck it into the pocket below if you like.', moves: [{ hinges: [h([-1, top], [1, top], [0, 1])], tag: 'front' }] },
      { type: 'fold', title: 'Fold the back flap behind', text: 'Mountain fold the back layer down behind. Squeeze the sides gently and the cup opens.', moves: [{ hinges: [h([-1, top], [1, top], [0, 1], M)] }] },
    ];
  },
};

/* ---------- crane ---------- */
// the square base, collapsed for real: the eight triangles round the centre stay rigid and turn
// about the creases between them. First the corners rise together into a four-pointed star,
// then the star flattens into a square lying on the table.
function squareBase() {
  const deg = Math.PI / 180, s = 0.5 * R2;
  const ray = (polar, az) => [Math.sin(polar) * Math.cos(az), Math.cos(polar), -Math.sin(polar) * Math.sin(az)];
  // final turn of the flattened star: its axis to point toward the viewer, its sides left/right
  const Rg = [[R2, 0, R2], [R2, 0, -R2], [0, 1, 0]];
  const qg = quatFromMatrix(Rg);
  const clamp = x => Math.max(0, Math.min(1, x));
  const sm = x => x * x * x * (x * (x * 6 - 15) + 10);
  return (m, t) => {
    const u1 = sm(clamp(t / 0.55)), u2 = sm(clamp((t - 0.55) / 0.45));
    const alpha = (Math.PI / 2) * (1 - u1);
    let beta;
    if (alpha < 1e-6) beta = Math.PI / 4;
    else {
      const c = Math.cos(alpha), sn = Math.sin(alpha) * R2;
      const R = Math.hypot(c, sn), dl = Math.atan2(sn, c);
      beta = dl + Math.acos(Math.min(1, R2 / R));
    }
    // which of the eight triangles the point is in
    let psi = Math.atan2(m[1], m[0]);
    if (psi < 0) psi += 2 * Math.PI;
    const k = Math.min(7, Math.floor(psi / (Math.PI / 4)));
    const a0 = k * Math.PI / 4, a1 = (k + 1) * Math.PI / 4;
    const medAz = a => a + u2 * ((Math.round(a / (Math.PI / 2)) % 2 === 0) ? -45 : 45) * deg;
    // rays at a0 and a1: even multiples of 45° are the medians (to edge midpoints)
    const isMed = i => i % 2 === 0;
    const r0 = isMed(k) ? ray(beta, medAz(a0)) : ray(alpha, a0);
    const r1 = isMed(k + 1) ? ray(beta, medAz(a1 % (2 * Math.PI))) : ray(alpha, a1);
    // m = a e0 + b e1 in the flat sheet
    const e0 = [Math.cos(a0), Math.sin(a0)], e1 = [Math.cos(a1), Math.sin(a1)];
    const det = e0[0] * e1[1] - e1[0] * e0[1];
    const a = (m[0] * e1[1] - e1[0] * m[1]) / det, b = (e0[0] * m[1] - m[0] * e0[1]) / det;
    let p = [a * r0[0] + b * r1[0], a * r0[1] + b * r1[1], a * r0[2] + b * r1[2]];
    const q = slerp([0, 0, 0, 1], qg, u2);
    p = quatApply(q, p);
    return [p[0], p[1], p[2] - s * u2];
  };
}
function quatFromMatrix(m) {
  const tr = m[0][0] + m[1][1] + m[2][2];
  let x, y, z, w;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    w = 0.25 * S; x = (m[2][1] - m[1][2]) / S; y = (m[0][2] - m[2][0]) / S; z = (m[1][0] - m[0][1]) / S;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const S = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    w = (m[2][1] - m[1][2]) / S; x = 0.25 * S; y = (m[0][1] + m[1][0]) / S; z = (m[0][2] + m[2][0]) / S;
  } else if (m[1][1] > m[2][2]) {
    const S = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    w = (m[0][2] - m[2][0]) / S; x = (m[0][1] + m[1][0]) / S; y = 0.25 * S; z = (m[1][2] + m[2][1]) / S;
  } else {
    const S = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    w = (m[1][0] - m[0][1]) / S; x = (m[0][2] + m[2][0]) / S; y = (m[1][2] + m[2][1]) / S; z = 0.25 * S;
  }
  return [x, y, z, w];
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map(v => -v); d = -d; }
  if (d > 0.9995) { const r = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...r); return r.map(v => v / l); }
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + b[i] * wb);
}
function quatApply(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

const crane = {
  id: 'crane',
  name: 'Crane',
  summary: 'Orizuru, the traditional Japanese crane.',
  level: 'Intermediate',
  about: [
    'The crane is the best known origami model of all. Folding a thousand of them, senbazuru, is said to grant a wish.',
    'It teaches the important techniques: the square base, petal folds, and inside reverse folds for the neck, tail and head. Take your time over the petal fold; it is the one everybody finds hard the first time.',
  ],
  shape: 'square',
  colorSide: 'back',
  sheet: () => ({ poly: square(), M: Aff.I() }),
  steps: () => {
    const s = 0.5 * R2;                           // half the diagonal of the square base
    const Bt = [0, -s], T = [0, s], Lf = [-s, 0], Rt = [s, 0];
    const KL = [-0.207107, 0.146447];            // where the kite crease meets the upper edge
    const KR = mirror(KL);
    const H = KL[1];
    const hH = (toward, angle = V) => h([-1, H], [1, H], toward, angle);
    const kite = [
      { hinges: [h(Bt, KL, Lf)], layers: [0, 0] },
      { hinges: [h(Bt, KR, Rt)], layers: [0, 0] },
    ];
    const petal = tag => {
      const inL = h(Bt, KL, [0, -0.1]), inR = h(Bt, KR, [0, -0.1]);
      const down = hH(Bt);
      return [
        { hinges: [down], within: [down, inL, inR], layers: [0, 0], addTag: tag },
        // the sides tuck in behind the rising flap: their crease turns the other way
        { hinges: [down, h(Bt, KL, Lf, M)], within: [down, h(Bt, KL, Lf)], layers: [0, 0], addTag: tag },
        { hinges: [h(Bt, KL, Lf)], within: [down, h(Bt, KL, Lf)], layers: [1, 1] },
        { hinges: [down, h(Bt, KR, Rt, M)], within: [down, h(Bt, KR, Rt)], layers: [0, 0], addTag: tag },
        { hinges: [h(Bt, KR, Rt)], within: [down, h(Bt, KR, Rt)], layers: [1, 1] },
      ];
    };
    const NL = [-0.0994588, H];                    // where the narrowing fold meets the waist
    const narrow = [
      { hinges: [h(Bt, NL, [-1, 0])], within: [h(Bt, NL, [-1, 0]), hH(Bt)], layers: [0, 1] },
      { hinges: [h(Bt, mirror(NL), [1, 0])], within: [h(Bt, mirror(NL), [1, 0]), hH(Bt)], layers: [0, 1] },
    ];
    // neck and tail: each leg swings up between the wings
    // (a crease at angle φ sends the downward leg off at 2φ + 90°, here 134°, up and out)
    const phi = 22 * Math.PI / 180, deg = Math.PI / 180;
    const nA = [0, 0], nB = [-Math.cos(phi), -Math.sin(phi)];
    const tip = reflectPt(Bt, nA, nB);
    const nd = [Math.cos(2 * phi + Math.PI / 2), Math.sin(2 * phi + Math.PI / 2)];
    const hp = [tip[0] - 0.06 * nd[0], tip[1] - 0.06 * nd[1]];
    const hd = [Math.cos(167 * deg), Math.sin(167 * deg)];
    const headA = hp, headB = [hp[0] + hd[0], hp[1] + hd[1]];
    return [
      { type: 'fold', title: 'Fold in half corner to corner', text: 'Start white side up. Fold the top left corner down to the bottom right corner.', moves: [{ hinges: [h([-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it flat.' },
      { type: 'fold', title: 'Fold the other diagonal', text: 'Fold the top right corner down to the bottom left corner.', moves: [{ hinges: [h([-0.5, 0.5], [0.5, -0.5], [0.5, 0.5])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it again. The two diagonals cross in the middle.' },
      { type: 'flip', title: 'Turn it over', text: 'Turn the paper over so the coloured side is up.', axis: 0 },
      { type: 'fold', title: 'Fold in half edge to edge', text: 'Fold the top edge down to the bottom edge.', moves: [{ hinges: [h([-1, 0], [1, 0], [0, 1])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it flat.' },
      { type: 'fold', title: 'Fold in half the other way', text: 'Fold the right edge over to the left edge.', moves: [{ hinges: [h([0, -1], [0, 1], [1, 0])] }] },
      { type: 'unfold', title: 'Unfold', text: 'Open it. You have creased a star of eight lines through the centre.' },
      { type: 'flip', title: 'Turn it over', text: 'Turn it white side up again.', axis: 0 },
      {
        type: 'custom', title: 'Collapse into a square base', dur: 3.2,
        text: 'Bring all four corners up and together. The creases do the work: the diagonals fold up, the edge-to-edge creases fold in, and the sheet flattens into a small square with the open end at the bottom.',
        cuts: [[[-1, -1], [1, 1]], [[-1, 1], [1, -1]], [[-1, 0], [1, 0]], [[0, -1], [0, 1]]],
        motion: squareBase(),
        // the two triangles of each pressed flap: the one nearer the front flap's corner is in front
        tieBreak: p => {
          let a = Math.atan2(p[1], p[0]); if (a < 0) a += 2 * Math.PI;
          const k = Math.floor(a / (Math.PI / 4)), diag = (k % 2 ? k : k + 1) * Math.PI / 4;
          return Math.cos(diag - Math.PI / 4);
        },
      },
      { type: 'fold', title: 'Fold the front edges to the centre', text: 'Fold the lower edges of the front flap in so they meet on the centre line. Front layer only.', moves: kite },
      { type: 'fold', title: 'Fold the top down', text: 'Fold the top triangle down over the flaps you just made, and crease it hard.', moves: [{ hinges: [hH(T)], layers: [0, 0] }] },
      { type: 'unfold', title: 'Unfold the top', text: 'Lift the triangle back up.' },
      { type: 'unfold', title: 'Unfold the sides', text: 'Open the two side flaps. These three creases guide the petal fold.' },
      {
        type: 'custom-petal', title: 'Petal fold', dur: 2.6,
        text: 'Lift the bottom point of the front layer up along the top crease. As it rises, the sides swing in along their creases and meet in the middle. Flatten it into a long diamond.',
        moves: petal('wing1'),
      },
      { type: 'flip', title: 'Turn it over', text: 'Turn the model over from side to side.', axis: 0 },
      { type: 'fold', title: 'Fold the front edges to the centre', text: 'Repeat on this side: lower edges of the front flap to the centre line.', moves: kite },
      { type: 'fold', title: 'Fold the top down', text: 'Fold the top triangle down and crease it.', moves: [{ hinges: [hH(T)], layers: [0, 0] }] },
      { type: 'unfold', title: 'Unfold the top', text: 'Lift it back up.' },
      { type: 'unfold', title: 'Unfold the sides', text: 'Open the side flaps.' },
      { type: 'custom-petal', title: 'Petal fold', dur: 2.6, text: 'Petal fold this side too. This is the bird base.', moves: petal('wing2') },
      { type: 'fold', title: 'Narrow the legs', text: 'Fold the lower edges of the front layers in to the centre line, so the two lower points get thin.', moves: narrow },
      { type: 'flip', title: 'Turn it over', text: 'Turn the model over.', axis: 0 },
      { type: 'fold', title: 'Narrow the legs', text: 'Narrow this side the same way.', moves: narrow },
      { type: 'fold', title: 'Reverse fold the neck', text: 'Open the left leg a little and push it up between the wings, folding it inside out along the crease. This is an inside reverse fold.', dur: 1.8, moves: [{ hinges: [h(nA, nB, [-0.05, -0.3])], inside: true, paper: p => p[0] < 0 && p[1] > 0, addTag: 'neck' }] },
      { type: 'fold', title: 'Reverse fold the tail', text: 'Do the same with the right leg to make the tail.', dur: 1.8, moves: [{ hinges: [h(mirror(nA), mirror(nB), [0.05, -0.3])], inside: true, paper: p => p[0] > 0 && p[1] < 0 }] },
      { type: 'fold', title: 'Reverse fold the head', text: 'Near the tip of the neck, reverse fold a small point down to make the head.', moves: [{ hinges: [h(headA, headB, tip)], inside: true, tag: 'neck' }] },
      {
        type: 'fold', title: 'Fold the wings down', text: 'Fold the front wing down toward you and the back wing down behind, along the top of the body.',
        moves: [
          { hinges: [hH([0, 0.5])], tag: 'wing1' },
          { hinges: [hH([0, 0.5], M)], tag: 'wing2' },
        ],
      },
      {
        type: 'fold', title: 'Spread the wings', text: 'Lift the wings out level and stand the crane up. Pull the wings gently apart to round the body.', dur: 1.8,
        moves: [
          { hinges: [hH([0, -0.3], Math.PI / 2)], tag: 'wing1', within: [hH([0, -0.3])] },
          { hinges: [hH([0, -0.3], -Math.PI / 2)], tag: 'wing2', within: [hH([0, -0.3])] },
        ],
        present: { axis: [1, 0, 0], angle: Math.PI / 2 },
      },
    ].map(st => (st.type === 'custom-petal' ? { ...st, type: 'fold' } : st));
  },
};

export const DESIGNS = [crane, airplane, helmet, heart, cup];
