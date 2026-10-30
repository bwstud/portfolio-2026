/* Species: everything that makes one tree grow differently from another.
   Lengths are metres, angles degrees, times fractions of a year (0 = 1 January).

   The growth model is the same for every species; only these numbers change.
   - phyllotaxis: how buds are arranged at each node. Opposite pairs turning 90° (maple),
     single buds alternating sides (elm), or whorls of three (juvenile juniper).
   - apical: apical dominance, the share of growth the leading shoot keeps at each fork (0.5 = even).
   - vigor / vmax: how much light becomes growth, and the most a pot of roots can feed per flush.
   - backBud: how readily dormant buds on old wood wake after a cut. budAge: how many years a
     dormant bud stays viable. Juniper's are short-lived, so bare wood stays bare.
   - flushes: when growth surges in the year, and how strongly.
   - wireSet: how fast a wired bend sets (per growing season). wireBite: how quickly the wire
     cuts in as the branch thickens. */

export const SPECIES = {
  maple: {
    id: 'maple',
    name: 'Japanese maple',
    latin: 'Acer palmatum',
    blurb: 'Deciduous, with opposite pairs of hand-shaped leaves that turn scarlet in autumn. Back-buds well after a cut, so it ramifies into fine twigs with pinching and patience.',
    habit: 'deciduous',
    phyllotaxis: 'opposite',
    internode: 0.026,
    tipRadius: 0.0008,
    pipe: 2.35,
    apical: 0.6,
    acrotony: 1.3,
    vigor: 1.8,
    vmax: 70,
    maxMetamers: 5,
    branchAngle: 52,
    nurseryChop: 0.11,
    gravi: 0.14,
    graviLateral: 0.05,
    photo: 0.22,
    wander: 0.12,
    flushes: [{ at: 0.24, strength: 1 }, { at: 0.5, strength: 0.4 }],
    backBud: 0.65,
    budAge: 6,
    shed: 0.08,
    leaf: { shape: 'palmate', size: 0.044, count: 2 },
    colors: {
      emerge: '#b8c95a', summer: '#4d7a2a', autumn: ['#b8200f', '#d8430f', '#8f0f1c'],
      autumnStart: 0.78, autumnPeak: 0.85, drop: [0.87, 0.93],
    },
    bark: { tex: 'trident_maple_bark', tint: '#a09a8e', young: '#6b6e3c', years: 6 },
    foliageYears: 0,
    wireSet: 1.1,
    wireBite: 1.3,
    defoliate: true,
  },

  elm: {
    id: 'elm',
    name: 'Chinese elm',
    latin: 'Ulmus parvifolia',
    blurb: 'Small, glossy, alternate leaves on zig-zag twigs, and bark that flakes into a patchwork with age. Very vigorous and forgiving: it buds back almost anywhere.',
    habit: 'deciduous',
    phyllotaxis: 'alternate',
    internode: 0.017,
    tipRadius: 0.0006,
    pipe: 2.4,
    apical: 0.54,
    acrotony: 1.1,
    vigor: 2,
    vmax: 95,
    maxMetamers: 6,
    branchAngle: 54,
    nurseryChop: 0.09,
    gravi: 0.1,
    graviLateral: 0.03,
    photo: 0.25,
    wander: 0.2,
    flushes: [{ at: 0.23, strength: 1 }, { at: 0.42, strength: 0.55 }, { at: 0.6, strength: 0.3 }],
    backBud: 0.92,
    budAge: 10,
    shed: 0.06,
    leaf: { shape: 'elm', size: 0.024, count: 1 },
    colors: {
      emerge: '#9fc24f', summer: '#3f6a26', autumn: ['#d8b23a', '#c9952b', '#b8a046'],
      autumnStart: 0.82, autumnPeak: 0.88, drop: [0.9, 0.97],
    },
    bark: { tex: 'japanese_zelkova_bark', tint: '#6b6157', young: '#6a5a48', years: 5 },
    foliageYears: 0,
    wireSet: 1.4,
    wireBite: 1.5,
    defoliate: true,
  },

  juniper: {
    id: 'juniper',
    name: 'Chinese juniper',
    latin: 'Juniperus chinensis',
    blurb: 'Evergreen sprays of scale foliage on reddish, stringy bark. Buds only on green growth: cut back into bare wood and nothing returns, which is why juniper styling leans on wire and deadwood.',
    habit: 'evergreen',
    phyllotaxis: 'whorl',
    internode: 0.011,
    tipRadius: 0.0005,
    pipe: 2.3,
    apical: 0.53,
    acrotony: 0.5,
    vigor: 2.2,
    vmax: 150,
    maxMetamers: 7,
    branchAngle: 44,
    gravi: 0.1,
    graviLateral: 0.06,
    photo: 0.2,
    wander: 0.16,
    flushes: [{ at: 0.27, strength: 1 }, { at: 0.43, strength: 0.7 }, { at: 0.6, strength: 0.45 }],
    backBud: 0.03,
    budAge: 3,
    shed: 0.05,
    leaf: { shape: 'spray', size: 0.026, count: 1, shade: 0.3 },
    colors: {
      emerge: '#8fb07a', summer: '#3d5f3c', autumn: ['#4a5a36'],
      winter: '#5a5a3a',
    },
    bark: { tex: 'japanese_cedar_bark', tint: '#b07a60', young: '#5e6a3a', years: 3 },
    foliageYears: 4,
    wireSet: 0.65,
    wireBite: 0.9,
    defoliate: false,
  },
};

export const SPECIES_LIST = Object.values(SPECIES);
