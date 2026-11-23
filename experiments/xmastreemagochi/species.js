/* The three firs Troop 31 sells, and what makes each specimen different. */
import { rng, clamp } from './util.js';

export const SPECIES = {
  fraser: {
    name: 'Fraser fir', latin: 'Abies fraseri', origin: 'Grown in the Appalachians and on farms across the Northeast.',
    pricePerFt: 14,
    width: 0.62, taper: 1.0, gap: 0.2, perWhorl: 6, tilt: 0.32, droop: 0.12, latAngle: 0.85, latGap: 0.034,
    needle: { len: 0.021, w: 0.0019, sweep: 0.55, ranks: [[-1.15, 1], [1.15, 1], [-0.55, 0.85], [0.55, 0.85]], nodes: 11 },
    sprayLen: 0.12,
    colors: { top: [0.06, 0.15, 0.09], tip: [0.12, 0.24, 0.14], under: [0.36, 0.46, 0.44], twig: [0.2, 0.15, 0.08] },
    underMix: 0.3,
    shed: 2.2, drinkK: 1.0, dryHours: 72,
    fragrance: 'Clean and piney, with a hint of citrus.',
    branches: 'Stiff, upturned branches. Holds heavy glass with no sag.',
    retention: 'Excellent. Fraser firs hold their needles longer than almost anything on the lot.',
    needleNote: 'Short, flat needles, dark blue-green on top with two silvery bands underneath.',
  },
  balsam: {
    name: 'Balsam fir', latin: 'Abies balsamea', origin: 'Native to upstate New York and the Adirondacks.',
    pricePerFt: 10,
    width: 0.54, taper: 1.12, gap: 0.22, perWhorl: 6, tilt: 0.12, droop: 0.08, latAngle: 1.0, latGap: 0.036,
    needle: { len: 0.025, w: 0.002, sweep: 0.35, ranks: [[-1.45, 1], [1.45, 1], [-0.45, 0.55], [0.45, 0.55]], nodes: 11 },
    sprayLen: 0.13,
    colors: { top: [0.05, 0.14, 0.06], tip: [0.10, 0.22, 0.08], under: [0.30, 0.40, 0.32], twig: [0.18, 0.15, 0.08] },
    underMix: 0.3,
    shed: 4.0, drinkK: 1.05, dryHours: 60,
    fragrance: 'The strongest scent on the lot. Rich, sweet balsam that fills a room.',
    branches: 'Flexible branches, a little open. Fine for most ornaments; heavy glass dips.',
    retention: 'Good if it never runs dry. Sheds quickly once it does.',
    needleNote: 'Flat, glossy dark green needles in two neat rows, with whitish lines beneath.',
  },
  douglas: {
    name: 'Douglas fir', latin: 'Pseudotsuga menziesii', origin: 'Not a true fir. Shipped east from Oregon and grown locally too.',
    pricePerFt: 11,
    width: 0.68, taper: 0.92, gap: 0.19, perWhorl: 7, tilt: 0.05, droop: 0.32, latAngle: 0.75, latGap: 0.036,
    needle: { len: 0.03, w: 0.0016, sweep: 0.75, ranks: [[0, 0.9], [1.05, 1], [-1.05, 1], [2.1, 0.9], [-2.1, 0.9], [3.14, 0.8]], nodes: 9 },
    sprayLen: 0.14,
    colors: { top: [0.09, 0.2, 0.1], tip: [0.18, 0.31, 0.15], under: [0.24, 0.34, 0.22], twig: [0.22, 0.16, 0.09] },
    underMix: 0.18,
    shed: 3.2, drinkK: 1.15, dryHours: 64,
    fragrance: 'Sweet, with a citrus snap when you crush a needle.',
    branches: 'Soft, drooping branches. Best with lighter ornaments.',
    retention: 'Fair to good. Keep it watered and it lasts the season.',
    needleNote: 'Soft needles that radiate all around the twig. Look for the papery bracts on its cones.',
  },
};

export const SPECIES_KEYS = Object.keys(SPECIES);
const FT = 0.3048;
export const CEILING_FT = 9;

/* Today's stock: five of each, seeded by the date so the lot is the same all day */
export function lotStock(dayKey) {
  const r = rng(dayKey * 7919 + 31);
  const out = [];
  let tag = 101 + r.int(0, 40);
  for (const species of SPECIES_KEYS) {
    for (let i = 0; i < 5; i++) out.push(makeSpecimen(species, Math.floor(r() * 2 ** 31), tag++));
  }
  return out;
}

export function makeSpecimen(species, seed, tag) {
  const r = rng(seed);
  const heightFt = Math.round(clamp(r.range(5, 8.5) + r.norm() * 0.3, 5, 8.5) * 2) / 2;
  const cutDaysAgo = r.int(2, 21);
  // freshness falls with days since cut, plus luck in how the lot kept it
  const freshness = clamp(1.05 - cutDaysAgo * 0.018 - r() * 0.22, 0.45, 1);
  const S = SPECIES[species];
  const price = Math.round((heightFt * S.pricePerFt) / 5) * 5;
  return {
    species, seed, tag, heightFt, price,
    fullness: clamp(r.range(0.78, 1.08), 0.75, 1.1),
    bareAngle: r() * Math.PI * 2,
    bare: r() < 0.55 ? r.range(0.25, 0.7) : r.range(0, 0.15),
    lean: (r() < 0.35 ? r.range(2.5, 6) : r.range(0, 1.5)) * (r() < 0.5 ? -1 : 1),
    handleIn: Math.round(r.range(5, 12)),
    cutDaysAgo, freshness,
    nest: r() < 0.08,
  };
}

export const heightM = spec => spec.heightFt * FT;

/* What a buyer notices, written as the answer to each check */
export function inspect(spec) {
  const S = SPECIES[spec.species];
  const f = spec.freshness;
  const bend = f > 0.8 ? 'Flexes and springs back. Fresh.'
    : f > 0.64 ? 'Bends, but feels a little stiff. Cut a while ago.'
    : 'Snaps clean in half. This one is drying out.';
  const heft = f > 0.8 ? 'Heavy for its size. Full of water.' : f > 0.64 ? 'About what you\'d expect.' : 'Surprisingly light.';
  const cut = spec.cutDaysAgo <= 6 ? `Cut ${spec.cutDaysAgo} days ago. Sap is still beading on the stump.`
    : spec.cutDaysAgo <= 13 ? `Cut about ${Math.round(spec.cutDaysAgo / 7)} week${spec.cutDaysAgo > 9 ? 's' : ''} ago. A little sap, mostly sealed.`
    : `Cut ${Math.round(spec.cutDaysAgo / 7)} weeks ago. The face is grey and dry.`;
  const shape = spec.bare > 0.3 ? 'Thin on one side. Turn that side to the wall.'
    : spec.fullness > 0.98 ? 'Full and even all the way round.' : 'Even, a touch narrow.';
  const trunk = Math.abs(spec.lean) > 2.4 ? `Trunk bends about ${Math.abs(spec.lean).toFixed(0)}°. It will lean in the stand.` : 'Straight trunk.';
  const handle = spec.handleIn >= 8 ? `${spec.handleIn} in of clear trunk at the base. Easy to fit a stand.` : `Only ${spec.handleIn} in of clear trunk. Tight for some stands.`;
  const fit = spec.heightFt + 1 > CEILING_FT ? `With a stand and a topper it will brush a ${CEILING_FT} ft ceiling.` : `Leaves room for a topper under a ${CEILING_FT} ft ceiling.`;
  return [
    ['Height', `${spec.heightFt} ft. ${fit}`],
    ['Needle color', S.needleNote + (f < 0.64 ? ' Some tips look dull.' : '')],
    ['Bend a needle', bend],
    ['Shake test', 'Shake it and watch what falls.'],
    ['Lift it', heft],
    ['The cut', cut],
    ['Smell', S.fragrance + (f < 0.6 ? ' Faint.' : '')],
    ['Shape', shape],
    ['Trunk', `${trunk} ${handle}`],
    ['Branches', S.branches],
    ['Needle hold', S.retention],
    ...(spec.nest ? [['Look inside', 'There\'s a small bird\'s nest tucked deep in the branches. An old sign of good luck.']] : []),
  ];
}
