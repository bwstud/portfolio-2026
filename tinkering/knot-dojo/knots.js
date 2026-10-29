/* The knot library. Each rope is a path in centimetres, traced from where the rope enters
   the knot to where its tip finishes (x right, z toward the viewer, y up). The working end
   is led along that path and the rope follows it. `sequence` lists, in the order the end
   makes them, whether it goes Over or Under at each crossing; tracks.js finds the crossings.
   '#name' after a point names it, so steps and grips can refer to it.

   Sources for methods and notes: Wikipedia (Overhand, Figure-eight, Reef, Sheet bend,
   Bowline, Clove hitch, Round turn and two half-hitches, Taut-line, Timber hitch articles,
   citing The Ashley Book of Knots) and Scout Life's "How to tie the 7 basic Scout knots". */

// height of the standing part as it climbs from the table to the rail, cm
const SY = [[-60, 0], [-27, 0], [-14, 2.8], [-5, 5.2]];
function sy(x) {
  if (x <= SY[0][0]) return 0;
  for (let i = 1; i < SY.length; i++) {
    if (x <= SY[i][0]) {
      const [x0, y0] = SY[i - 1], [x1, y1] = SY[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return SY.at(-1)[1];
}
const at = (x, z) => [x, z, sy(x)];

function path(...items) {
  const points = [], marks = {};
  for (const it of items) {
    if (typeof it === 'string') marks[it.slice(1)] = points.length - 1;
    else points.push(it);
  }
  return { points, marks };
}

// the standing part runs in from the left along z, climbs to the rail and goes once round it
function railTurn(z, exitZ) {
  return [
    at(-40, z), at(-28, z), '#hold', at(-15, z), at(-6, z),
    { phi: -80, z }, '#rail', { phi: 0, z: z + 0.3 }, { phi: 90, z: z + 1.2 },
    { phi: 180, z: z + 2.6 }, { phi: 205, z: exitZ }, '#turn',
  ];
}

// two half hitches round the standing part (which runs along z = s), the end arriving along z = s + 4.5
function halfHitches(s) {
  const p = (x, z) => at(x, z + s);
  return [
    [-4.5, s + 4, 3.8], p(-9, 4.5), p(-12.5, 4.3), p(-14.5, 1.8), '#back',
    p(-14.6, -2), p(-13.5, -4.6), p(-11, -5.2), p(-9.6, -2.6), p(-9.1, 2.4), p(-8.7, 6.5), p(-9.6, 8.6), '#hitch1',
    p(-14, 8.9), p(-21, 8.7), p(-23.6, 6.5), p(-24.4, 2.5), p(-24.3, -2.5), p(-22.6, -5), p(-19.6, -4.9),
    p(-18.3, -2), p(-18, 3), p(-18, 6), p(-18, 11.5), p(-18, 17),
  ];
}

// grips pull with a bounded force, so a long pull just means "until it's snug"
const STANDING = { at: 'standing', dist: 0.22 };
const TIP = { at: 'tip', dist: 0.22 };
const RAIL_HOLD = { at: 'hold', dist: 0.2 };

export const KNOTS = [
  /* ---------------- stoppers ---------------- */
  {
    id: 'overhand',
    name: 'Overhand knot',
    group: 'Stoppers',
    abok: '#514',
    summary: 'The simplest knot there is, and the start of many others.',
    uses: 'A quick stopper at the end of a line, to keep cord from fraying, or to stop it slipping through a hole.',
    caution: 'It jams hard under load and roughly halves the rope’s strength, so tie it where you never need to untie it.',
    ropes: [path(
      [-16, 0], [-4, 0], [2, 0], '#start', [8, -2], [12, -8], [9, -15], [1, -17], [-6, -14], [-9, -7], [-8, -2],
      [-7.5, 3], '#loop', [-5, 7], [0, 9], [6, 7], [6.5, 3], [3.5, -2], [1, -6], [0, -10], [-1, -19], [2, -23.5], [9, -25.5], [18, -25.5], [26, -24.5],
    )],
    sequence: 'OUO',
    steps: [
      { title: 'Make a loop', text: 'Hold the standing part still. Carry the working end up and around, then lay it across the top of the standing part. That crossing makes a loop.', moves: [{ rope: 0, to: 'loop' }] },
      { title: 'Tuck the end through', text: 'Bring the end around, pass it under the standing part, and push it up through the loop from beneath.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Pull it snug', text: 'Pull the standing part and the end in opposite directions. The loop closes into a tight little knot.', tighten: [STANDING, TIP] },
    ],
  },
  {
    id: 'figure-eight',
    name: 'Figure-eight knot',
    group: 'Stoppers',
    abok: '#420',
    summary: 'The sailor’s and climber’s stopper: bigger than an overhand and easy to untie.',
    uses: 'Stopping a line from running out through a block, a cleat or a belay device. It’s also the base of the figure-eight loop climbers tie into.',
    caution: 'It can still jam after a hard shock load, but it usually loosens again with a push.',
    ropes: [path(
      [-26, 0], [-12, 0], [0, 0], [8, 0], '#start', [13, -6], [10, -14], [0, -17], [-8, -12], [-7, -5],
      [-6.5, 2], '#loop', [-8, 7], [-14, 8], [-18.5, 3.5], [-19.2, -2], [-18.5, -6], '#behind', [-15, -9], [-7.5, -8.5],
      [0, -8], [12, -8.5], [22, -10], [30, -10],
    )],
    sequence: 'OUOU',
    steps: [
      { title: 'Make a loop', text: 'Lead the working end up and back over the standing part, making a loop.', moves: [{ rope: 0, to: 'loop' }] },
      { title: 'Go behind the standing part', text: 'Take the end on around the back of the standing part. That extra half turn is what makes it an eight rather than an overhand.', moves: [{ rope: 0, to: 'behind' }] },
      { title: 'Down through the loop', text: 'Cross over the side of the loop, then pass the end down through it from the front.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Pull it snug', text: 'Pull both ends. The two lobes of the eight close down side by side.', tighten: [STANDING, TIP] },
    ],
  },

  /* ---------------- bends ---------------- */
  {
    id: 'square',
    name: 'Square (reef) knot',
    group: 'Bends and binding',
    abok: '#1204',
    summary: 'Two bends hooked through each other: right over left, then left over right.',
    uses: 'Binding: tying the two ends of one cord around a parcel, a sail being reefed, or a bandage. Here two coloured ropes stand in for the two ends.',
    caution: 'Not a safe way to join two ropes. Ashley warns it should never be tied as a bend, because it spills when one end is pulled. Use a sheet bend instead. Tied with both throws the same way it becomes a granny knot, which slips.',
    ropes: [
      path([-24, -5], [-10, -5], [1, -5], [7, -4], [10, 0], [7, 4], [1, 5], [-10, 5], [-22, 5.5]),
      path([24, -2.2], [12, -2.2], [0, -2.2], [-5, -2.2], [-7.5, 0], '#turn', [-5, 2.2], [0, 2.2], [12, 2.2], [22, 2.6]),
    ],
    sequence: 'UO',
    steps: [
      { title: 'Left end: make a bend', text: 'Bring the left end across and turn it back on itself, so it lies beside its own standing part. In the classic right-over-left, left-over-right, this is where the left end ends up.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Right end: under and in', text: 'Feed the right end under the curve of the left one and into the bend.', moves: [{ rope: 1, to: 'turn' }] },
      { title: 'Turn back over the top', text: 'Turn it back and lay it out over the curve, beside its own standing part. The two bends now hook through each other, and each rope\u2019s two parts leave on the same side.', moves: [{ rope: 1, to: 'end' }] },
      { title: 'Pull it flat', text: 'Pull each rope\u2019s two parts away from the other. The bends lock into a flat, symmetrical knot. If the ends leave on opposite corners, it\u2019s a thief knot, which slips.', tighten: [{ rope: 0, at: 'standing', dist: 0.15 }, { rope: 0, at: 'tip', dist: 0.15 }, { rope: 1, at: 'standing', dist: 0.15 }, { rope: 1, at: 'tip', dist: 0.15 }] },
    ],
  },
  {
    id: 'sheet-bend',
    name: 'Sheet bend',
    group: 'Bends and binding',
    abok: '#1431',
    summary: 'The go-to knot for joining two ropes, even ones of different thickness.',
    uses: 'Joining two lines: lengthening a rope, or tying a cord to a loop or bight. It’s ABOK #1, the first knot in the book.',
    caution: 'With rope of different thickness, make the bight in the thicker rope. Both short ends must finish on the same side; if they end up on opposite sides it’s a left-hand sheet bend, which is weaker.',
    ropes: [
      path([-24, -7], [-10, -7], [2, -7], [10, -6.5], [14, -3], [14, 3], [10, 6.5], [2, 7], [-10, 7], [-20, 7.5], [-26, 8]),
      path([26, 0], [20, 0], [12, 0.5], [9, 2.5], '#through', [5, 6], [3.5, 11.5], [-2, 13.5], [-6.5, 11.5],
        [-7, 4], [-7, -6], [-6.5, -11.5], [-2, -13.5], [3.5, -11.5], '#around', [4.5, -6], [6.5, -2.5], [9, 1.2], [10.5, 3.6]),
    ],
    sequence: 'UOUUOU',
    steps: [
      { title: 'Make a bight', text: 'Fold the end of the first (thicker) rope back on itself into a U-shaped bight, and hold it.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Up through the bight', text: 'Bring the second rope’s end up through the bight from underneath.', moves: [{ rope: 1, to: 'through' }] },
      { title: 'Around the back', text: 'Take the end around behind both legs of the bight.', moves: [{ rope: 1, to: 'around' }] },
      { title: 'Tuck under itself', text: 'Bring the end back across the front and tuck it under its own standing part, so it is trapped against the bight.', moves: [{ rope: 1, to: 'end' }] },
      { title: 'Snug it up', text: 'Hold the bight and pull the second rope’s standing part. Both short ends finish on the same side of the knot.', tighten: [{ rope: 0, at: 'standing', dist: 0.15 }, { rope: 0, at: 'tip', dist: 0.15 }, { rope: 1, at: 'standing', dist: 0.2 }, { rope: 1, at: 'tip', dist: 0.04 }] },
    ],
  },

  /* ---------------- loops ---------------- */
  {
    id: 'bowline',
    name: 'Bowline',
    group: 'Loops',
    abok: '#1010',
    summary: 'The king of knots: a fixed loop that won’t slip and still unties after a load.',
    uses: 'A loop at the end of a line: dropping over a post, tying a sail’s clew, or rescue, since it can be tied around yourself. The FAA recommends it for tying down light aircraft.',
    caution: 'It can work loose when it isn’t under load, and it can capsize if pulled sideways. For anything critical, back it up with a stopper on the tail.',
    rotate: 90,
    ropes: [path(
      [0, -36], [0, -28], [0, -17], [1.4, -12.6], [5.6, -9.8], [9.8, -12.6], [8.4, -18.2], [4.2, -19.6],
      [0, -21], '#hole', [-4.2, -18.2], [-7, -8.4], [-8.4, 5.6], [-6, 16], [2, 21], '#bottom', [10, 16], [11, 6], [8, -2], '#loop',
      [6, -9.6], [5.8, -14], '#up', [6.3, -19], [7, -26], [4, -31], [0, -31], [-4, -30], [-4.5, -26], [0, -24], '#tree',
      [3, -22], [2.8, -19.8], [2.6, -15], [2.7, -11.6], [2.8, -6], [3, 0],
    )],
    sequence: 'OUOUOOU',
    steps: [
      { title: 'Make the rabbit hole', text: 'Make a small overhand loop in the standing part, with the working side lying on top. This is the “rabbit hole”; the standing part above it is the “tree”.', moves: [{ rope: 0, to: 'hole' }] },
      { title: 'Size the loop', text: 'Lead the end down and back up. The rope you leave below the hole sets the size of the finished loop.', moves: [{ rope: 0, to: 'loop' }] },
      { title: 'Up through the hole', text: 'The rabbit comes up out of the hole: pass the end up through the small loop from underneath.', moves: [{ rope: 0, to: 'up' }] },
      { title: 'Around the tree', text: 'Take the end around behind the standing part.', moves: [{ rope: 0, to: 'tree' }] },
      { title: 'Back down the hole', text: 'Then back down through the small loop, the same way it came out. The tail ends up inside the big loop, beside its own leg.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Set the knot', text: 'Hold the tail against the loop and pull the standing part away. The collar locks around the end.', tighten: [STANDING, { at: 'bottom', dist: 0.12, dir: [0, 1] }, { at: 'tip', dist: 0.05, dir: [0, 1] }] },
    ],
  },

  /* ---------------- hitches (on the rail) ---------------- */
  {
    id: 'clove',
    name: 'Clove hitch',
    group: 'Hitches',
    abok: '#11',
    bar: true,
    summary: 'Two turns and a tuck. Fast to tie, and it can be adjusted along a rail.',
    uses: 'Tying a line to a post or rail, running a line along a row of posts, and starting or finishing lashings.',
    caution: 'Not especially secure: it can slip under a load that changes direction, and it works poorly on square posts.',
    ropes: [path(
      at(-40, 1.2), at(-28, 1.2), '#hold', at(-15, 1.2), at(-6, 1.2),
      { phi: -80, z: 1.2 }, '#rail', { phi: 0, z: 1.3 }, { phi: 90, z: 1.6 }, { phi: 180, z: 2.4 }, { phi: 270, z: 3.3 },
      { phi: 320, z: 3.2 }, '#turn1', { phi: 357, z: 1.3 }, { phi: 390, z: -0.4 }, { phi: 450, z: -3.4 }, '#cross',
      { phi: 540, z: -3.4 }, { phi: 630, z: -3.4 }, { phi: 650, z: -3.3 }, '#turn2', { phi: 690, z: -2.6 }, { phi: 740, z: -1.4 },
      { phi: 765, z: -1.0 }, { phi: 800, z: -0.9 }, [3.2, -0.9, 4.0], [4.6, -1.0, 1.2], [9, -1.2], [16, -1.5],
    )],
    sequence: 'OU',
    steps: [
      { title: 'Lead to the rail', text: 'Bring the working end up to the rail.', moves: [{ rope: 0, to: 'rail' }] },
      { title: 'First turn', text: 'Pass it over the rail and around underneath, coming back up beside the standing part.', moves: [{ rope: 0, to: 'turn1' }] },
      { title: 'Cross over: the X', text: 'Carry the end diagonally across the front, over the standing part. This crossing is the X.', moves: [{ rope: 0, to: 'cross' }] },
      { title: 'Second turn', text: 'Go around the rail a second time, in the same direction as the first.', moves: [{ rope: 0, to: 'turn2' }] },
      { title: 'Tuck under the X', text: 'Tuck the end under the diagonal of the X. It should come out between the two turns, heading away from the standing part. If it comes out to one side, it isn’t a clove hitch.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Pull both ways', text: 'Pull the standing part and the end in opposite directions to bed the turns down on the rail.', tighten: [RAIL_HOLD, { at: 'tip', dist: 0.08 }] },
    ],
  },
  {
    id: 'two-half-hitches',
    name: 'Two half hitches',
    group: 'Hitches',
    abok: '#1781',
    bar: true,
    summary: 'A turn around the rail, then two hitches around your own line.',
    uses: 'Tying a line to a post, ring or grommet: tarp corners, tie-downs, boat fenders.',
    caution: 'Both hitches must go the same way. Then the pair forms a clove hitch around the standing part. You can add an overhand in the tail for extra security.',
    ropes: [path(...railTurn(0, 3.3), ...halfHitches(0))],
    sequence: 'OUOOUU',
    steps: [
      { title: 'Around the rail', text: 'Pass the working end over the rail and back around underneath.', moves: [{ rope: 0, to: 'turn' }] },
      { title: 'First half hitch', text: 'Bring the end over the standing part, around behind it, and back up through the loop you just made.', moves: [{ rope: 0, to: 'hitch1' }] },
      { title: 'Second half hitch', text: 'Go around the standing part again in the same direction, this time outside the first hitch, and tuck through the same way.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Snug against the rail', text: 'Pull the standing part, then slide the two hitches up until they sit against the rail.', tighten: [RAIL_HOLD, { at: 'tip', dist: 0.05 }] },
    ],
  },
  {
    id: 'round-turn',
    name: 'Round turn & two half hitches',
    group: 'Hitches',
    abok: '#1720',
    bar: true,
    summary: 'Two half hitches with an extra wrap, which takes the strain before the knot does.',
    uses: 'Making fast to a ring, post or rail under load. You can tie it while the line is pulling, because the round turn holds the load.',
    caution: 'Ashley notes a round turn is stronger than a single turn and spreads the wear, especially on a thin spar.',
    ropes: [path(
      at(-40, -4.4), at(-28, -4.4), '#hold', at(-15, -4.4), at(-6, -4.4),
      { phi: -80, z: -4.4 }, '#rail', { phi: 0, z: -4.2 }, { phi: 90, z: -3.6 }, { phi: 180, z: -2.8 }, { phi: 270, z: -1.8 },
      { phi: 360, z: -0.8 }, '#turn1', { phi: 450, z: 0 }, { phi: 540, z: 0.8 }, { phi: 565, z: 1.2 }, '#turn',
      ...halfHitches(-4.4),
    )],
    sequence: 'OUOOUU',
    steps: [
      { title: 'First turn', text: 'Take the working end over the rail and around underneath.', moves: [{ rope: 0, to: 'turn1' }] },
      { title: 'Complete the round turn', text: 'Go around a second time, so the rope wraps the rail completely. It now holds the load by friction.', moves: [{ rope: 0, to: 'turn' }] },
      { title: 'First half hitch', text: 'Bring the end over the standing part, around it, and back through.', moves: [{ rope: 0, to: 'hitch1' }] },
      { title: 'Second half hitch', text: 'Repeat in the same direction, further along the standing part.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Snug it up', text: 'Draw the hitches tight and slide them up against the round turn.', tighten: [RAIL_HOLD, { at: 'tip', dist: 0.05 }] },
    ],
  },
  {
    id: 'taut-line',
    name: 'Taut-line hitch',
    group: 'Hitches',
    abok: '#1856',
    bar: true,
    summary: 'An adjustable loop: slide it to tighten or slacken a line.',
    uses: 'Tent guy-lines and tarp ridgelines. Astronauts used it to tie down equipment while repairing the Hubble telescope on STS-82.',
    caution: 'It can slip in slick synthetic rope; load it slowly. The midshipman’s hitch is the more secure version.',
    ropes: [path(
      ...railTurn(0, 3.3).slice(0, -1), '#turn',
      [-4.5, 5, 3.8], at(-10, 7), at(-16, 7), at(-19.5, 4.5), at(-20.2, 1.5), at(-20, -2.5), at(-18.5, -5), at(-16, -5.2),
      at(-15, -2.5), at(-14.7, 2.5), at(-13.6, 4.4), at(-12.2, 3.2), '#wrap1',
      at(-11.8, 1.6), at(-11.5, -2.5), at(-10, -5), at(-7.5, -4.9), at(-6.6, -2), at(-6.3, 3), '#wrap2',
      at(-5.8, 9), at(-7.5, 11.6), at(-14, 12.3), at(-24, 12), at(-30, 10.5), at(-31.8, 5), at(-32, -1.5), at(-30.5, -4.8),
      at(-27.5, -5.6), at(-25.8, -2.5), at(-25.6, 3), at(-25.6, 8), at(-25.6, 15), at(-25.6, 21),
    )],
    sequence: 'OUOUOOUU',
    steps: [
      { title: 'Around the anchor', text: 'Pass the working end around the rail (in the field, a tent stake) and bring it back alongside the standing part.', moves: [{ rope: 0, to: 'turn' }] },
      { title: 'Wrap inside the loop', text: 'Take the end over and around the standing part, coming back up inside the loop.', moves: [{ rope: 0, to: 'wrap1' }] },
      { title: 'Wrap again, nearer the anchor', text: 'Go around the standing part a second time, still inside the loop and closer to the anchor. The two wraps grip the line.', moves: [{ rope: 0, to: 'wrap2' }] },
      { title: 'Half hitch outside', text: 'Cross over and finish with a half hitch around the standing part outside the loop, going the same direction as the wraps.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Snug and adjust', text: 'Snug the hitch firmly. Slide it away from the anchor to tighten the line, or toward the anchor to slacken it.', tighten: [RAIL_HOLD, { at: 'tip', dist: 0.05 }] },
    ],
  },
  {
    id: 'timber',
    name: 'Timber hitch',
    group: 'Hitches',
    abok: '#1665',
    bar: true,
    summary: 'A loop that tightens around a log by itself, and spills the moment the load comes off.',
    uses: 'Dragging or hoisting logs, poles and timber, and starting a diagonal lashing. The bowyer’s knot on a longbow is a timber hitch.',
    caution: 'Ashley says three turns are ample in natural rope, but use five or more in slippery synthetics. Add a half hitch further along (a killick hitch) to tow a long pole straight.',
    ropes: [path(
      ...railTurn(0, 3.3).slice(0, -1), '#turn',
      [-4.5, 4.5, 3.8], at(-10, 5.5), at(-15, 5.5), at(-18.5, 3.5), at(-19.3, 1.5), at(-19, -2.5), at(-17, -5), at(-15, -4.6),
      at(-14.2, -2), at(-14, 1.5), at(-13.4, 3.2), '#around',
      ...[-13, -9.8, -6.6].flatMap(x0 => [at(x0, 7.8), at(x0 + 0.8, 8.6), at(x0 + 1.6, 7.8), at(x0 + 1.6, 3.4), at(x0 + 2.4, 2.6)]),
    )],
    sequence: 'OUOUOUOU',
    steps: [
      { title: 'Around the log', text: 'Pass the working end all the way around the log (here, the rail).', moves: [{ rope: 0, to: 'turn' }] },
      { title: 'Around the standing part', text: 'Bring the end around the standing part, making a loop that encircles the log.', moves: [{ rope: 0, to: 'around' }] },
      { title: 'Twist it three times', text: 'Twist the end around its own part three times, following the lay of the rope. Those turns are what grip.', moves: [{ rope: 0, to: 'end' }] },
      { title: 'Pull the standing part', text: 'Pull the standing part. The loop closes on the log and pins the twists against it.', tighten: [RAIL_HOLD, { at: 'tip', dist: 0.02 }] },
    ],
  },
];
