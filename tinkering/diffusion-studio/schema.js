// Diffusion Studio: every setting, its starting value, the panel that sets it, and the presets.
//
// Units are the studio's own: distances in cm (the pane is pane.w cm across), angles in degrees, light in
// stops (EV), colour temperature in kelvin.

export const SCENES = [
  ['Silhouette', 'Solid letters between the light and the glass. You see their shadow.'],
  ['Pressed', 'Soft letters pushed against the glass. Where they touch is sharp, and the rest falls away.'],
  ['Lit object', 'Solid letters lit from your side by a lamp inside the box.'],
  ['Stencil', 'An opaque card with the letters cut out. The light comes through the holes.'],
  ['Glowing', 'Letters that give off light themselves, like lit panels.'],
  ['Neon', 'Glass tubes bent into the letterforms, filled with glowing gas.'],
  ['Halo-lit', 'Dark letters held off a wall, with lights behind them washing it.'],
  ['Gel', 'Letters cut from coloured film. They tint the light passing through.'],
  ['LED matrix', 'Letters drawn in a grid of lamps.'],
  ['Projected', 'A projector behind throws the words onto the pane, focused on its face.'],
  ['Written in fog', 'Letters wiped through the condensation with a fingertip.'],
  ['Breath reveal', 'Letters drawn in finger grease. They stay hidden until the glass fogs.'],
  ['Smoke', 'Letters of smoke lit by the light behind, drifting and coming apart.'],
];

export const TEXTURES = [[0, 'None'], [1, 'Sandblast grain'], [2, 'Paper fibres'], [3, 'Weave'], [4, 'Reeds'], [5, 'Hammered'], [6, 'Glass block'], [7, 'Ice'], [8, 'Ripple']];

// pane settings, in order: scatter °, straight-through, tail, tail spread ×, tint, absorption, texture, texture
// scale cm, texture amount, refraction, texture angle °, surface reflection, micro-relief, cleared by water
const PANE = ['scatter', 'clarity', 'tail', 'spread', 'tint', 'absorb', 'tex', 'scale', 'amount', 'refract', 'angle', 'reflect', 'grain', 'wet'];
const mat = (name, ...v) => ({ name, set: Object.fromEntries(PANE.map((k, i) => [k, v[i]])) });
export const MATERIALS = {
  frosted:   mat('Frosted glass',      24, 0, 0.3, 3,   '#e3efe8', 0.1,  0, 1,   0,    0,   0, 0.05, 0.25, 0.9),
  sandblast: mat('Sandblasted glass',  34, 0,    0.35, 3,  '#f0f0ec', 0.15, 1, 0.5, 0.6,  0,   0, 0.08, 0.1,  0.8),
  opal:      mat('Opal acrylic',       50, 0,    0.5, 4,   '#fff6ee', 0.45, 0, 1,   0,    0,   0, 0.07, 0,    0.2),
  rice:      mat('Rice paper',         40, 0,    0.4, 2.5, '#ffe7c4', 0.35, 2, 4,   0.8,  0,   0, 0.08, 0,    0.7),
  vellum:    mat('Tracing paper',      18, 0.04, 0.3, 3,   '#fbf6ec', 0.18, 2, 1.2, 0.25, 0,   0, 0.06, 0.05, 0.8),
  voile:     mat('Voile curtain',      20, 0.5,  0.2, 2,   '#f5f2ec', 0.1,  3, 0.3, 0.45, 0,   0, 0.04, 0,    0.3),
  reeded:    mat('Reeded glass',       2,  0.92, 0,   2,   '#eef6f2', 0.04, 4, 1.4, 0,    0.35,   0, 0.06, 0,    0),
  hammered:  mat('Hammered glass',     5,  0.85, 0.1, 2,   '#eef5f1', 0.05, 5, 3,   0,    0.35, 0, 0.06, 0,    0),
  block:     mat('Glass block',        6,  0.75, 0.1, 2,   '#e8f2f0', 0.08, 6, 19,  0.6,  0.4, 0, 0.06, 0,    0),
  ice:       mat('Ice',                16, 0.45, 0.2, 2.5, '#e4f1fb', 0.12, 7, 9,   0.5,  0.25, 0, 0.07, 0.2,  0.6),
  ripple:    mat('Cathedral glass',    3,  0.85, 0,   2,   '#f3ead2', 0.06, 8, 5,   0,    0.4, 0, 0.06, 0,    0),
  clear:     mat('Clear glass',        0,  1,    0,   2,   '#eef5f1', 0.03, 0, 1,   0,    0,   0, 0.06, 0,    0),
};
const paneDefaults = (slot, m) => Object.fromEntries(PANE.map((k) => [`${slot}.${k}`, MATERIALS[m].set[k]]));

const lightDefaults = (slot, o) => ({
  [`${slot}.on`]: true, [`${slot}.shape`]: 0, [`${slot}.x`]: 0, [`${slot}.y`]: 0, [`${slot}.dist`]: 45,
  [`${slot}.w`]: 6, [`${slot}.h`]: 6, [`${slot}.rot`]: 0, [`${slot}.temp`]: 2800, [`${slot}.gel`]: '#ffffff', [`${slot}.ev`]: 9,
  [`${slot}.slats`]: 12, [`${slot}.open`]: 0.5, [`${slot}.mull`]: 4, [`${slot}.flicker`]: 0, [`${slot}.fspeed`]: 1,
  [`${slot}.motion`]: 0, [`${slot}.mspeed`]: 0.3, [`${slot}.mamt`]: 10,
  ...Object.fromEntries(Object.entries(o).map(([k, v]) => [`${slot}.${k}`, v])),
});

export const DEFAULTS = {
  // the words
  'tx.text': 'Hello', 'tx.family': 'Söhne Breit', 'tx.face': '', 'tx.weight': 600, 'tx.italic': false, 'tx.stretch': 'normal',
  'tx.size': 24, 'tx.track': 0, 'tx.lead': 1.05, 'tx.word': 0, 'tx.align': 'center', 'tx.case': 'none', 'tx.kern': true,
  'tx.liga': true, 'tx.outline': 0, 'tx.hscale': 100, 'tx.skew': 0,
  // where they are
  'tx.x': 0, 'tx.y': 0, 'tx.rot': 0, 'tx.mirror': false, 'tx.depth': 2, 'tx.tiltx': 0, 'tx.tilty': 0, 'tx.scatter': 0,
  'tx.wave': 0, 'tx.wavelen': 4, 'tx.wavespd': 1, 'tx.appr': 0, 'tx.period': 7, 'tx.stagger': 0.08, 'tx.persp': true, 'tx.seed': 1,
  // what they are
  scene: 1,
  'sil.opacity': 1, 'sil.round': 1.5, 'sil.color': '#151515',
  'pr.press': 3, 'pr.round': 1.6, 'pr.contact': 0.4, 'pr.color': '#1a1714',
  'lit.color': '#d9a487', 'lit.round': 2.5, 'lit.sheen': 0.3,
  'st.opacity': 1, 'st.margin': 10, 'st.fill': true, 'st.color': '#16130f',
  'gl.color': '#ffd9a8', 'gl.int': 3, 'gl.body': 1, 'gl.soft': 1.2, 'gl.flicker': 0,
  'ne.color': '#ff3b2f', 'ne.int': 5, 'ne.tube': 0.9, 'ne.dead': 0, 'ne.flicker': 0.1, 'ne.core': 0.6,
  'ha.face': '#0d0d0d', 'ha.color': '#ffe2b8', 'ha.int': 5, 'ha.spread': 4, 'ha.standoff': 5,
  'ge.mode': 1, 'ge.color': '#e8431c', 'ge.color2': '#1c6be8', 'ge.density': 1.4,
  'led.pitch': 1.6, 'led.dot': 0.7, 'led.color': '#ffae3d', 'led.int': 5, 'led.off': 0.5, 'led.board': 1, 'led.thresh': 0.45, 'led.scroll': 0,
  'pj.color': '#fff4e6', 'pj.int': 2, 'pj.focus': 0,
  'wr.finger': 1.2, 'wr.over': 0, 'wr.drips': 0.4,
  'la.resist': 0.95,
  'sm.color': '#e9e4dc', 'sm.density': 1.3, 'sm.turb': 0.6, 'sm.rise': 0.4, 'sm.dissolve': 0.35, 'sm.bright': 1,
  // the pane(s)
  arr: 0, 'arr.split': 0, 'arr.bandy': 0, 'arr.bandh': 30, 'arr.g0': -30, 'arr.g1': 30, 'arr.gap': 4, 'arr.grid': 25, 'arr.louvre': 12,
  'arr.frame': 0, 'arr.framecol': '#1b1c1e',
  ...paneDefaults('a', 'frosted'), ...paneDefaults('b', 'clear'),
  // on the surface
  'c.fog': 0, 'c.bead': 0, 'c.beadsz': 0.25, 'c.regrow': 0.15, 'c.evap': 0.25, 'c.dry': 0.03, 'c.rain': 0,
  'c.drops': 0, 'c.dropsz': 0.35, 'c.dropspd': 1, 'c.breath': 0, 'c.breathsz': 25, 'c.wet': 0,
  'c.dust': 0, 'c.dustsz': 0.12, 'c.smudge': 0, 'c.scratch': 0, 'c.scratchlen': 4, 'c.glint': 1,
  'c.frost': 0, 'c.frostreach': 30, 'c.crack': 0, 'c.crackx': 15, 'c.cracky': 10, 'c.shimmer': 0, 'c.shimspd': 1, 'c.streak': 0,
  'tool.size': 3, 'tool.str': 1,
  // the light
  ...lightDefaults('k1', { x: 22, y: 16, dist: 45, w: 6, h: 6, temp: 2800, ev: 9 }),
  ...lightDefaults('k2', { on: false, shape: 1, x: -30, y: -10, dist: 80, w: 40, h: 60, temp: 6500, ev: 4 }),
  fall: true,
  'in.ev': -5, 'in.temp': 3200, 'in.az': 30, 'in.el': 40, 'in.amb': 0.02,
  'fr.ev': -3, 'fr.temp': 5000, 'fr.x': -20, 'fr.y': 25, 'fr.spread': 50, 'fr.gloss': 60,
  // the room and the camera
  'rm.wall': '#2f3a36', 'rm.bright': 0.4, 'rm.dist': 120, 'rm.wash': 1, 'rm.haze': 0, 'rm.hazecol': '#ffffff',
  'rf.amt': 0, 'rf.soft': 0.5, 'pane.w': 110, 'pane.h': 82, 'pane.surround': '#1c1d1f',
  'cam.zoom': 1, 'cam.panx': 0, 'cam.pany': 0, 'cam.roll': 0, 'cam.yaw': 0, 'cam.pitch': 0,
  'cam.ev': 0, 'cam.wb': 5000, 'cam.contrast': 1, 'cam.sat': 1, 'cam.tone': 0, 'cam.bloom': 0.4, 'cam.bloomr': 0.5,
  'cam.halation': 0, 'cam.vig': 0.25, 'cam.grain': 0.25, 'cam.grains': 1.2, 'cam.ca': 0, 'cam.focus': 0, 'cam.bokeh': 0,
  'cam.split': 0, 'cam.shadow': '#2a4a5a', 'cam.high': '#e8c8a0', 'cam.scale': 1,
};

// Settings a look leaves alone unless it names them: the words and how they are set.
export const TYPE_KEYS = ['tx.text', 'tx.family', 'tx.face', 'tx.weight', 'tx.italic', 'tx.stretch', 'tx.track', 'tx.lead', 'tx.word',
  'tx.align', 'tx.case', 'tx.kern', 'tx.liga', 'tx.outline', 'tx.hscale', 'tx.skew'];

// Keys whose change means the words must be set again (the text canvas re-rendered).
export const TEXT_KEYS = new Set([...TYPE_KEYS, 'tx.size', 'tx.x', 'tx.y', 'tx.rot', 'tx.mirror', 'ne.tube', 'cam.scale', 'scene']);

// ---- the panel ----
// rows: ['n', key, label, min, max, step] a fader with a typed field; ['s', key, label, options] a select;
// ['g', key, label, options] segmented; ['w', key, label] a switch; ['c', key, label] a colour; ['t', key, label] text;
// a function as the last item hides the row unless it returns true
const SHAPES = [[0, 'Bulb'], [1, 'Softbox'], [2, 'Window'], [3, 'Blinds'], [4, 'Strip'], [5, 'Ring']];
const MOTIONS = [[0, 'Still'], [1, 'Sway'], [2, 'Orbit'], [3, 'Passing'], [4, 'Breathing']];
const sc = (n) => (S) => S.scene === n;
const lightGroup = (slot, title) => ({
  t: title, rows: [
    ['w', `${slot}.on`, 'On'],
    ['s', `${slot}.shape`, 'Shape', SHAPES],
    ['n', `${slot}.ev`, 'Intensity, EV', -4, 16, 0.1],
    ['n', `${slot}.temp`, 'Colour temperature, K', 1200, 12000, 50],
    ['c', `${slot}.gel`, 'Gel'],
    ['n', `${slot}.x`, 'Across, cm', -120, 120, 0.5],
    ['n', `${slot}.y`, 'Up, cm', -120, 120, 0.5],
    ['n', `${slot}.dist`, 'Behind the glass, cm', 2, 400, 1],
    ['n', `${slot}.w`, 'Width, cm', 0.5, 200, 0.5],
    ['n', `${slot}.h`, 'Height, cm', 0.5, 200, 0.5, (S) => S[`${slot}.shape`] !== 0 && S[`${slot}.shape`] !== 5],
    ['n', `${slot}.rot`, 'Rotation, °', -180, 180, 1, (S) => S[`${slot}.shape`] !== 0 && S[`${slot}.shape`] !== 5],
    ['n', `${slot}.slats`, 'Slats', 2, 40, 1, (S) => S[`${slot}.shape`] === 3],
    ['n', `${slot}.open`, 'Slats open', 0.02, 1, 0.01, (S) => S[`${slot}.shape`] === 3],
    ['n', `${slot}.mull`, 'Window bars, cm', 0, 20, 0.5, (S) => S[`${slot}.shape`] === 2],
    ['n', `${slot}.flicker`, 'Flicker', 0, 1, 0.01],
    ['n', `${slot}.fspeed`, 'Flicker speed', 0.1, 10, 0.1, (S) => S[`${slot}.flicker`] > 0],
    ['s', `${slot}.motion`, 'Moves', MOTIONS],
    ['n', `${slot}.mspeed`, 'Speed', 0.02, 3, 0.01, (S) => S[`${slot}.motion`] > 0],
    ['n', `${slot}.mamt`, 'Travel, cm', 0, 150, 0.5, (S) => S[`${slot}.motion`] > 0],
  ],
});
const paneGroup = (slot, title, when) => ({
  t: title, when, mat: slot, rows: [
    ['n', `${slot}.scatter`, 'Scatter, °', 0, 84, 0.5],
    ['n', `${slot}.clarity`, 'Straight through', 0, 1, 0.01],
    ['n', `${slot}.tail`, 'Glow tail', 0, 1, 0.01],
    ['n', `${slot}.spread`, 'Tail spread, ×', 1, 8, 0.1, (S) => S[`${slot}.tail`] > 0],
    ['c', `${slot}.tint`, 'Tint'],
    ['n', `${slot}.absorb`, 'Absorption', 0, 3, 0.01],
    ['n', `${slot}.grain`, 'Micro-relief', 0, 1, 0.01],
    ['s', `${slot}.tex`, 'Texture', TEXTURES],
    ['n', `${slot}.scale`, 'Texture scale, cm', 0.1, 40, 0.1, (S) => S[`${slot}.tex`] > 0],
    ['n', `${slot}.amount`, 'Texture amount', 0, 1, 0.01, (S) => [1, 2, 3, 6, 7].includes(S[`${slot}.tex`])],
    ['n', `${slot}.refract`, 'Refraction', 0, 3, 0.01, (S) => [4, 5, 6, 7, 8].includes(S[`${slot}.tex`])],
    ['n', `${slot}.angle`, 'Texture angle, °', -90, 90, 1, (S) => S[`${slot}.tex`] > 0],
    ['n', `${slot}.reflect`, 'Surface reflection', 0, 0.5, 0.005],
    ['n', `${slot}.wet`, 'Cleared by water', 0, 1, 0.01],
  ],
});

export const TABS = [
  { id: 'text', label: 'Text', groups: [
    { t: 'Words', rows: [['t', 'tx.text', 'Words'], ['font']] },
    { t: 'Setting', rows: [
      ['n', 'tx.weight', 'Weight', 100, 1000, 1, (S) => !S['tx.face']],
      ['w', 'tx.italic', 'Italic', (S) => !S['tx.face']],
      ['s', 'tx.stretch', 'Width', [['ultra-condensed', 'Ultra condensed'], ['extra-condensed', 'Extra condensed'], ['condensed', 'Condensed'], ['semi-condensed', 'Semi condensed'], ['normal', 'Normal'], ['semi-expanded', 'Semi expanded'], ['expanded', 'Expanded'], ['extra-expanded', 'Extra expanded'], ['ultra-expanded', 'Ultra expanded']], (S) => !S['tx.face']],
      ['n', 'tx.size', 'Size, cm', 1, 120, 0.1],
      ['n', 'tx.track', 'Tracking, ‰ em', -200, 1000, 1],
      ['n', 'tx.lead', 'Line height', 0.6, 3, 0.01],
      ['n', 'tx.word', 'Word spacing, em', -0.5, 2, 0.01],
      ['g', 'tx.align', 'Align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]],
      ['s', 'tx.case', 'Case', [['none', 'As typed'], ['upper', 'Upper case'], ['lower', 'Lower case'], ['title', 'Title Case'], ['small-caps', 'Small caps'], ['all-small-caps', 'All small caps']]],
      ['w', 'tx.kern', 'Kerning'],
      ['w', 'tx.liga', 'Ligatures'],
      ['n', 'tx.outline', 'Outline only, cm', 0, 4, 0.05],
      ['n', 'tx.hscale', 'Horizontal scale, %', 25, 300, 1],
      ['n', 'tx.skew', 'Slant, °', -45, 45, 0.5],
    ] },
    { t: 'Placement', rows: [
      ['n', 'tx.x', 'Across, cm', -120, 120, 0.1],
      ['n', 'tx.y', 'Up, cm', -120, 120, 0.1],
      ['n', 'tx.rot', 'Rotation, °', -180, 180, 0.5],
      ['n', 'tx.depth', 'Behind the glass, cm', 0, 150, 0.1],
      ['n', 'tx.tiltx', 'Turned, left to right, °', -80, 80, 0.5],
      ['n', 'tx.tilty', 'Tipped, top to bottom, °', -80, 80, 0.5],
      ['w', 'tx.persp', 'Shadows grow toward the lamp'],
      ['w', 'tx.mirror', 'Mirrored'],
    ] },
    { t: 'Motion in depth', rows: [
      ['n', 'tx.appr', 'Comes and goes, cm', 0, 80, 0.1],
      ['n', 'tx.period', 'Every, s', 0.5, 60, 0.1, (S) => S['tx.appr'] > 0],
      ['n', 'tx.stagger', 'Letter by letter', 0, 0.5, 0.005, (S) => S['tx.appr'] > 0],
      ['n', 'tx.scatter', 'Letters scattered in depth, cm', 0, 40, 0.1],
      ['n', 'tx.seed', 'Scatter seed', 1, 99, 1, (S) => S['tx.scatter'] > 0 || S.scene === 5 || S.scene === 7],
      ['n', 'tx.wave', 'Wave in depth, cm', 0, 40, 0.1],
      ['n', 'tx.wavelen', 'Wave length, letters', 1, 20, 0.1, (S) => S['tx.wave'] > 0],
      ['n', 'tx.wavespd', 'Wave speed', -6, 6, 0.05, (S) => S['tx.wave'] > 0],
    ] },
  ] },
  { id: 'scene', label: 'Scenario', groups: [
    { t: 'Scenario', rows: [['scene']] },
    { t: 'Silhouette', when: sc(0), rows: [['c', 'sil.color', 'Colour'], ['n', 'sil.opacity', 'Opacity', 0, 1, 0.01], ['n', 'sil.round', 'Roundness, cm', 0, 10, 0.1]] },
    { t: 'Pressed', when: sc(1), rows: [['c', 'pr.color', 'Colour'], ['n', 'pr.press', 'Falls away by, cm', 0, 40, 0.1], ['n', 'pr.round', 'Roundness, cm', 0.2, 10, 0.1], ['n', 'pr.contact', 'Darker where it touches', 0, 1, 0.01]] },
    { t: 'Lit object', when: sc(2), rows: [['c', 'lit.color', 'Colour'], ['n', 'lit.round', 'Roundness, cm', 0.2, 10, 0.1], ['n', 'lit.sheen', 'Sheen', 0, 2, 0.01]] },
    { t: 'Stencil', when: sc(3), rows: [['c', 'st.color', 'Card colour'], ['n', 'st.opacity', 'Opacity', 0, 1, 0.01], ['w', 'st.fill', 'Card fills the frame'], ['n', 'st.margin', 'Card margin, cm', 0, 80, 0.5, (S) => !S['st.fill']]] },
    { t: 'Glowing', when: sc(4), rows: [['c', 'gl.color', 'Colour'], ['n', 'gl.int', 'Intensity, EV', -4, 10, 0.1], ['n', 'gl.body', 'Body blocks light', 0, 1, 0.01], ['n', 'gl.soft', 'Glow within, cm', 0, 10, 0.1], ['n', 'gl.flicker', 'Flicker', 0, 1, 0.01]] },
    { t: 'Neon', when: sc(5), rows: [['c', 'ne.color', 'Gas colour'], ['n', 'ne.int', 'Intensity, EV', -4, 10, 0.1], ['n', 'ne.tube', 'Tube, cm', 0.2, 4, 0.05], ['n', 'ne.core', 'White-hot core', 0, 2, 0.01], ['n', 'ne.flicker', 'Flicker', 0, 1, 0.01], ['n', 'ne.dead', 'Letters out', 0, 1, 0.01]] },
    { t: 'Halo-lit', when: sc(6), rows: [['c', 'ha.face', 'Face colour'], ['c', 'ha.color', 'Halo colour'], ['n', 'ha.int', 'Halo, EV', -4, 10, 0.1], ['n', 'ha.spread', 'Halo spread, cm', 0.5, 40, 0.1], ['n', 'ha.standoff', 'Off the wall, cm', 0.5, 60, 0.5]] },
    { t: 'Gel', when: sc(7), rows: [['g', 'ge.mode', 'Colours', [[0, 'One'], [1, 'Spectrum'], [2, 'Two']]], ['c', 'ge.color', 'Colour', (S) => S['ge.mode'] !== 1], ['c', 'ge.color2', 'Second colour', (S) => S['ge.mode'] === 2], ['n', 'ge.density', 'Density', 0, 6, 0.01]] },
    { t: 'LED matrix', when: sc(8), rows: [['c', 'led.color', 'Colour'], ['n', 'led.int', 'Intensity, EV', -4, 10, 0.1], ['n', 'led.pitch', 'Pitch, cm', 0.3, 8, 0.05], ['n', 'led.dot', 'Lamp size', 0.1, 1, 0.01], ['n', 'led.thresh', 'Threshold', 0.05, 0.95, 0.01], ['n', 'led.off', 'Unlit lamps glow', 0, 3, 0.01], ['n', 'led.board', 'Board blocks light', 0, 1, 0.01], ['n', 'led.scroll', 'Scroll, cm/s', -60, 60, 0.5]] },
    { t: 'Projected', when: sc(9), rows: [['c', 'pj.color', 'Colour'], ['n', 'pj.int', 'Intensity, EV', -4, 10, 0.1], ['n', 'pj.focus', 'Focus off the pane, cm', -60, 60, 0.1]] },
    { t: 'Written in fog', when: sc(10), rows: [['n', 'wr.finger', 'Fingertip, cm', 0.1, 6, 0.05], ['n', 'wr.over', 'Fogged over', 0, 1, 0.01], ['n', 'wr.drips', 'Drips', 0, 3, 0.01]] },
    { t: 'Breath reveal', when: sc(11), rows: [['n', 'la.resist', 'Grease keeps fog off', 0, 1, 0.01]] },
    { t: 'Smoke', when: sc(12), rows: [['c', 'sm.color', 'Colour'], ['n', 'sm.density', 'Density', 0, 4, 0.01], ['n', 'sm.bright', 'Catches the light', 0, 5, 0.01], ['n', 'sm.turb', 'Turbulence', 0, 3, 0.01], ['n', 'sm.rise', 'Drift', 0, 3, 0.01], ['n', 'sm.dissolve', 'Coming apart', 0, 1, 0.01]] },
    { t: 'Light on the letters', when: (S) => [0, 1, 2, 3, 6, 12].includes(S.scene), rows: [
      ['n', 'in.ev', 'Intensity, EV', -8, 8, 0.1], ['n', 'in.temp', 'Colour temperature, K', 1200, 12000, 50],
      ['n', 'in.az', 'From, °', -180, 180, 1], ['n', 'in.el', 'Height, °', 0, 90, 1], ['n', 'in.amb', 'Fill', 0, 1, 0.005]] },
  ] },
  { id: 'material', label: 'Material', groups: [
    { t: 'Arrangement', rows: [
      ['s', 'arr', 'Panes', [[0, 'One pane'], [1, 'Side by side'], [2, 'A band across'], [3, 'Graded'], [4, 'Stacked'], [5, 'Checkerboard'], [6, 'Louvres']]],
      ['n', 'arr.split', 'Seam at, cm', -80, 80, 0.5, (S) => S.arr === 1],
      ['n', 'arr.bandy', 'Band at, cm', -80, 80, 0.5, (S) => S.arr === 2],
      ['n', 'arr.bandh', 'Band height, cm', 1, 160, 0.5, (S) => S.arr === 2],
      ['n', 'arr.g0', 'Pane A until, cm', -80, 80, 0.5, (S) => S.arr === 3],
      ['n', 'arr.g1', 'Pane B from, cm', -80, 80, 0.5, (S) => S.arr === 3],
      ['n', 'arr.gap', 'Pane B behind by, cm', 0, 60, 0.1, (S) => S.arr === 4],
      ['n', 'arr.grid', 'Square, cm', 4, 80, 0.5, (S) => S.arr === 5],
      ['n', 'arr.louvre', 'Louvre width, cm', 2, 60, 0.5, (S) => S.arr === 6],
      ['n', 'arr.frame', 'Frame bars, cm', 0, 12, 0.1, (S) => [1, 2, 5, 6].includes(S.arr)],
      ['c', 'arr.framecol', 'Frame colour', (S) => [1, 2, 5, 6].includes(S.arr) && S['arr.frame'] > 0],
      ['n', 'pane.w', 'Pane width, cm', 20, 400, 1], ['n', 'pane.h', 'Pane height, cm', 20, 400, 1],
      ['c', 'pane.surround', 'Wall around the pane'],
    ] },
    paneGroup('a', 'Pane A'),
    paneGroup('b', 'Pane B', (S) => S.arr > 0),
  ] },
  { id: 'surface', label: 'Surface', groups: [
    { t: 'Your hand', rows: [['n', 'tool.size', 'Brush, cm', 0.3, 30, 0.1], ['n', 'tool.str', 'Strength', 0.05, 1, 0.01], ['btn', 'reset-surface', 'Reset the surface']] },
    { t: 'Condensation', rows: [
      ['n', 'c.fog', 'Fog', 0, 1, 0.01], ['n', 'c.regrow', 'Comes back, per s', 0, 3, 0.01], ['n', 'c.evap', 'Clears, per s', 0, 3, 0.01],
      ['n', 'c.bead', 'Beads', 0, 1, 0.01], ['n', 'c.beadsz', 'Bead size, cm', 0.05, 2, 0.01, (S) => S['c.bead'] > 0 || S['c.rain'] > 0],
      ['n', 'c.breath', 'Breath, every s', 0, 30, 0.1], ['n', 'c.breathsz', 'Breath size, cm', 3, 120, 0.5, (S) => S['c.breath'] > 0]] },
    { t: 'Water', rows: [
      ['n', 'c.rain', 'Raindrops', 0, 1, 0.01], ['n', 'c.drops', 'Running drops, per s', 0, 6, 0.01],
      ['n', 'c.dropsz', 'Drop size, cm', 0.1, 2, 0.01, (S) => S['c.drops'] > 0 || S.scene === 10],
      ['n', 'c.dropspd', 'Run speed', 0.1, 5, 0.01, (S) => S['c.drops'] > 0 || S.scene === 10],
      ['n', 'c.wet', 'Wet patches', 0, 1, 0.01], ['n', 'c.dry', 'Dries, per s', 0, 1, 0.005]] },
    { t: 'Wear', rows: [
      ['n', 'c.dust', 'Dust and specks', 0, 1, 0.01], ['n', 'c.dustsz', 'Speck size, cm', 0.02, 1, 0.01, (S) => S['c.dust'] > 0],
      ['n', 'c.smudge', 'Fingerprints', 0, 1, 0.01],
      ['n', 'c.scratch', 'Scratches', 0, 1, 0.01], ['n', 'c.scratchlen', 'Scratch length, cm', 0.5, 20, 0.1, (S) => S['c.scratch'] > 0],
      ['n', 'c.glint', 'Scratches catch the light', 0, 4, 0.01, (S) => S['c.scratch'] > 0],
      ['n', 'c.streak', 'Water marks', 0, 1, 0.01]] },
    { t: 'Ice and breaks', rows: [
      ['n', 'c.frost', 'Frost', 0, 1.5, 0.01], ['n', 'c.frostreach', 'Frost reaches, cm', 2, 100, 0.5, (S) => S['c.frost'] > 0],
      ['n', 'c.crack', 'Cracked', 0, 1, 0.01], ['n', 'c.crackx', 'Break at, across, cm', -80, 80, 0.5, (S) => S['c.crack'] > 0],
      ['n', 'c.cracky', 'Break at, up, cm', -80, 80, 0.5, (S) => S['c.crack'] > 0]] },
    { t: 'Air', rows: [['n', 'c.shimmer', 'Heat shimmer', 0, 3, 0.01], ['n', 'c.shimspd', 'Shimmer speed', 0, 5, 0.01, (S) => S['c.shimmer'] > 0]] },
  ] },
  { id: 'light', label: 'Light', groups: [
    lightGroup('k1', 'Light behind'),
    lightGroup('k2', 'Second light behind'),
    { t: 'Falloff', rows: [['w', 'fall', 'Dims with distance']] },
    { t: 'Light on your side', rows: [
      ['n', 'fr.ev', 'Intensity, EV', -10, 6, 0.1], ['n', 'fr.temp', 'Colour temperature, K', 1200, 12000, 50],
      ['n', 'fr.x', 'Hits across, cm', -120, 120, 0.5], ['n', 'fr.y', 'Hits up, cm', -120, 120, 0.5],
      ['n', 'fr.spread', 'Spread, cm', 5, 200, 0.5], ['n', 'fr.gloss', 'Glints, sharpness', 2, 400, 1]] },
  ] },
  { id: 'room', label: 'Room', groups: [
    { t: 'Room behind', rows: [
      ['c', 'rm.wall', 'Wall colour'], ['n', 'rm.bright', 'Wall brightness', 0, 4, 0.01], ['n', 'rm.dist', 'Wall behind the glass, cm', 10, 600, 1],
      ['n', 'rm.wash', 'Lamps light the wall', 0, 5, 0.01], ['n', 'rm.haze', 'Haze', 0, 3, 0.01], ['c', 'rm.hazecol', 'Haze colour', (S) => S['rm.haze'] > 0]] },
    { t: 'Your side', rows: [['n', 'rf.amt', 'Reflection of the room', 0, 4, 0.01], ['n', 'rf.soft', 'Reflection softness', 0, 1, 0.01, (S) => S['rf.amt'] > 0]] },
  ] },
  { id: 'camera', label: 'Camera', groups: [
    { t: 'View', rows: [
      ['n', 'cam.zoom', 'Zoom, ×', 0.2, 12, 0.01],
      ['n', 'cam.panx', 'Pan across, cm', -300, 300, 0.1], ['n', 'cam.pany', 'Pan up, cm', -300, 300, 0.1],
      ['n', 'cam.yaw', 'Orbit, left to right, °', -75, 75, 0.1], ['n', 'cam.pitch', 'Orbit, up and down, °', -75, 75, 0.1],
      ['n', 'cam.roll', 'Roll, °', -180, 180, 0.1]] },
    { t: 'Lens and film', rows: [
      ['n', 'cam.ev', 'Exposure, EV', -6, 6, 0.05], ['n', 'cam.wb', 'White balance, K', 2000, 12000, 50],
      ['s', 'cam.tone', 'Tone curve', [[0, 'Filmic'], [1, 'Soft'], [2, 'Punchy'], [3, 'Linear']]],
      ['n', 'cam.contrast', 'Contrast', 0.3, 2.5, 0.01], ['n', 'cam.sat', 'Saturation', 0, 2, 0.01],
      ['n', 'cam.bokeh', 'Behind the pane out of focus, px', 0, 80, 0.1],
      ['n', 'cam.focus', 'Everything out of focus, px', 0, 60, 0.1],
      ['n', 'cam.bloom', 'Bloom', 0, 3, 0.01], ['n', 'cam.bloomr', 'Bloom size', 0, 1, 0.01, (S) => S['cam.bloom'] > 0],
      ['n', 'cam.halation', 'Halation', 0, 3, 0.01], ['n', 'cam.ca', 'Colour fringing', 0, 5, 0.01],
      ['n', 'cam.vig', 'Vignette', 0, 1, 0.01], ['n', 'cam.grain', 'Grain', 0, 2, 0.01], ['n', 'cam.grains', 'Grain size, px', 1, 4, 0.05, (S) => S['cam.grain'] > 0],
      ['n', 'cam.split', 'Split tone', 0, 1, 0.01], ['c', 'cam.shadow', 'Shadows', (S) => S['cam.split'] > 0], ['c', 'cam.high', 'Highlights', (S) => S['cam.split'] > 0],
      ['n', 'cam.scale', 'Render resolution, ×', 0.4, 2, 0.05]] },
  ] },
];

// ---- looks: whole scenes, applied over the defaults (the words and their type are kept) ----
const pane = (slot, m, extra = {}) => ({ ...paneDefaults(slot, m), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`${slot}.${k}`, v])) });
export const LOOKS = [
  { name: 'Bathroom door', set: { scene: 1, 'tx.depth': 0, 'tx.appr': 9, 'tx.period': 8, 'tx.stagger': 0.12, 'c.dust': 0.1, 'c.dustsz': 0.12, 'k1.temp': 4800, 'k1.ev': 8.4, 'rm.wall': '#3b4641', 'cam.wb': 5600 } },
  { name: 'Hand on the pane', set: { scene: 2, 'tx.depth': 0.6, 'tx.tilty': 35, 'lit.color': '#e2ad91', 'in.ev': 0.6, 'in.temp': 4200, 'in.az': -40, 'in.el': 50, 'in.amb': 0.06,
    'k1.shape': 1, 'k1.x': -25, 'k1.y': 30, 'k1.w': 90, 'k1.h': 70, 'k1.dist': 90, 'k1.ev': 0.6, 'k1.temp': 6200, 'rm.wall': '#8d969c', 'rm.bright': 0.5,
    ...pane('a', 'frosted', { tint: '#eef1f4' }), 'cam.grain': 0.15 } },
  { name: 'Shower', set: { scene: 0, 'tx.depth': 3, 'tx.appr': 6, 'tx.period': 10, ...pane('a', 'reeded', { scatter: 4, clarity: 0.75 }), 'c.fog': 0.3, 'c.bead': 0.7, 'c.drops': 1.2, 'c.dropsz': 0.4,
    'k1.temp': 3400, 'k1.ev': 8.5, 'k1.y': 40, 'rm.wall': '#3d4a4f', 'rm.haze': 0.6, 'c.streak': 0.4 } },
  { name: 'Shoji at dusk', set: { scene: 0, 'tx.tiltx': -3, ...pane('a', 'rice'), 'arr': 5, 'arr.grid': 30, ...pane('b', 'rice', { tint: '#ffdfb5' }), 'arr.frame': 1.6, 'arr.framecol': '#2a1c12',
    'tx.depth': 2, 'k1.temp': 2100, 'k1.ev': 9.5, 'k1.x': 10, 'k1.y': 5, 'k1.dist': 50, 'k1.w': 8, 'k1.flicker': 0.15, 'k1.fspeed': 0.6, 'rm.wall': '#3a2a1c', 'cam.wb': 4200 } },
  { name: 'Rainy window', set: { scene: 5, 'tx.depth': 70, ...pane('a', 'clear'), 'c.rain': 0.35, 'c.beadsz': 0.5, 'c.drops': 1.2, 'c.dropsz': 0.55, 'c.fog': 0.1, 'c.streak': 0.2, 'cam.bokeh': 9, 'fr.ev': -1.5,
    'ne.color': '#ff3d6e', 'ne.int': 2.4, 'k1.on': true, 'k1.shape': 0, 'k1.temp': 2400, 'k1.ev': 7, 'k1.x': -35, 'k1.y': -15, 'k1.dist': 300, 'k1.w': 3,
    'k2.on': true, 'k2.shape': 0, 'k2.x': 38, 'k2.y': 22, 'k2.dist': 500, 'k2.w': 4, 'k2.temp': 9000, 'k2.ev': 7, 'rm.wall': '#0e1418', 'rm.bright': 0.25, 'cam.focus': 0, 'tx.persp': false } },
  { name: 'Morning mirror', set: { scene: 10, 'tx.depth': 40, ...pane('a', 'clear'), 'c.fog': 0.85, 'c.bead': 0.25, 'c.beadsz': 0.2, 'wr.drips': 0.6, 'c.regrow': 0.02,
    'k1.shape': 2, 'k1.x': 5, 'k1.y': 10, 'k1.w': 90, 'k1.h': 90, 'k1.dist': 250, 'k1.temp': 7000, 'k1.ev': 0.6, 'cam.bokeh': 5, 'k1.mull': 4, 'rm.wall': '#5c6870', 'rm.bright': 0.6, 'fr.ev': -2 } },
  { name: 'Breath on glass', set: { scene: 11, 'tx.depth': 60, ...pane('a', 'clear'), 'c.fog': 0, 'c.breath': 6, 'c.breathsz': 45, 'c.evap': 0.35, 'c.regrow': 1.5, 'c.smudge': 0.3,
    'k1.shape': 3, 'k1.x': 0, 'k1.y': 0, 'k1.w': 90, 'k1.h': 90, 'k1.dist': 200, 'k1.temp': 5200, 'k1.ev': 0.8, 'cam.bokeh': 6, 'k1.slats': 14, 'k1.open': 0.45, 'rm.wall': '#202629' } },
  { name: 'Lightbox', set: { scene: 3, 'tx.depth': 0.25, ...pane('a', 'opal', { tail: 0.2 }), 'st.fill': false, 'st.margin': 14, 'k1.shape': 1, 'k1.w': 110, 'k1.h': 80, 'k1.x': 0, 'k1.y': 0, 'k1.dist': 12, 'k1.temp': 5600, 'k1.ev': -0.6, 'fall': false,
    'rm.wall': '#101112', 'rm.bright': 0.1, 'c.dust': 0.2 } },
  { name: 'Marquee', set: { scene: 8, 'tx.depth': 0.5, 'led.int': 3, ...pane('a', 'sandblast'), 'led.scroll': -12, 'k1.on': false, 'rm.bright': 0.05, 'rm.wall': '#151515', 'cam.bloom': 0.9 } },
  { name: 'Halo sign', set: { scene: 6, 'tx.depth': 25, ...pane('a', 'voile'), 'k1.on': false, 'rm.wall': '#2a2622', 'rm.bright': 0.15, 'ha.int': 1.2, 'ha.spread': 3 } },
  { name: 'Glass block', set: { scene: 4, 'tx.depth': 30, ...pane('a', 'block'), 'gl.color': '#7fd8ff', 'gl.int': 1.5, 'k1.on': false, 'rm.bright': 0.8, 'rm.wash': 0, 'rm.wall': '#16202a', 'rm.bright': 0.4, 'fr.ev': -1.5 } },
  { name: 'Smoke', set: { scene: 12, 'tx.depth': 20, ...pane('a', 'clear'), 'cam.bokeh': 3, 'k1.shape': 0, 'k1.x': 0, 'k1.y': 38, 'k1.dist': 70, 'k1.w': 4, 'k1.ev': 8, 'k1.temp': 4300,
    'rm.haze': 0.8, 'rm.wall': '#0b0c0d', 'rm.bright': 0.1, 'sm.bright': 1.5 } },
  { name: 'Stained window', set: { scene: 7, 'tx.depth': 1.5, ...pane('a', 'vellum'), 'k1.shape': 2, 'k1.x': 0, 'k1.y': 0, 'k1.w': 90, 'k1.h': 100, 'k1.dist': 60, 'k1.temp': 5800, 'k1.ev': -1.2, 'k1.mull': 3,
    'ge.mode': 1, 'ge.density': 2.5, 'rm.bright': 0.15 } },
  { name: 'Projection', set: { scene: 9, 'tx.depth': 0, 'arr': 2, 'arr.bandy': 0, 'arr.bandh': 40, 'arr.frame': 0.4, ...pane('a', 'clear'), ...pane('b', 'sandblast'), 'pj.int': 2.5,
    'k1.shape': 0, 'k1.x': 0, 'k1.y': 0, 'k1.w': 2.5, 'k1.dist': 220, 'k1.ev': 6.5, 'k1.temp': 6000, 'rm.wall': '#1a1c1e', 'rm.bright': 0.2 } },
  { name: 'Frozen', set: { scene: 4, 'tx.depth': 12, ...pane('a', 'ice'), 'c.frost': 0.7, 'c.frostreach': 35, 'gl.color': '#9cc8ff', 'gl.int': 1.5, 'k1.temp': 9000, 'k1.ev': 7, 'k1.y': -30,
    'rm.wall': '#1d2a38', 'cam.wb': 6500 } },
];
