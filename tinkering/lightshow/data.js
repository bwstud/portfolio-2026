/* Plain data for the light desk: palettes, the shape of a look, the preset looks, and the ten
   venues' facts. The renderer, the show engine and the UI all read from here. */

export const PALETTES = {
  ice: { name: 'Ice', colors: ['#8fe6ff', '#3b62ff', '#ffffff'] },
  magenta: { name: 'Magenta', colors: ['#ff2f92', '#7b2cff', '#ffffff'] },
  sunset: { name: 'Sunset', colors: ['#ff7a2e', '#ff2f55', '#ffd27a'] },
  acid: { name: 'Acid', colors: ['#b8ff2e', '#2effd0', '#ffffff'] },
  deep: { name: 'Deep sea', colors: ['#2438ff', '#00c8ff', '#8a3dff'] },
  ember: { name: 'Ember', colors: ['#ff5a14', '#ff1e00', '#ffbd6e'] },
  mono: { name: 'White', colors: ['#ffffff', '#d6e2ff', '#fff1d8'] },
  rose: { name: 'Rose', colors: ['#ff8fc0', '#ffffff', '#ff3d7f'] },
  emerald: { name: 'Emerald', colors: ['#2eff86', '#00b2a0', '#e6fff0'] },
  gold: { name: 'Gold', colors: ['#ffc23d', '#fff0c4', '#ff8000'] },
};

// Every field a look can set, grouped the way the programmer panel shows them. The UI is built
// from this list, and every look is completed from these defaults, so old saves keep working.
const S = (key, label, options, value, hint) => ({ key, label, type: 'seg', options, value, hint });
const R = (key, label, min, max, step, value, unit = '', hint) => ({ key, label, type: 'range', min, max, step, value, unit, hint });
const RATE = [[0.5, '⅛'], [1, '¼'], [2, '½'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars']];
// which way chases, waves and colour runs travel; the same list as ORDERS in plot.js
const ORDER = () => S('order', 'Order', [['auto', 'Rig order'], ['lr', 'Left to right'], ['center', 'Centre out'], ['around', 'Around'], ['depth', 'Front to back'], ['random', 'Shuffled']], 'auto', 'Which way chases, waves and colour runs travel through the fixtures. Each group runs its own.');

export const GROUPS = [
  { id: 'beams', name: 'Beams', note: 'Moving heads on the trusses: tight beams that cut through the haze.', fields: [
    R('level', 'Level', 0, 1, 0.01, 0.9),
    S('aim', 'Aim', [['stage', 'Stage'], ['crowd', 'Crowd'], ['sky', 'Sky'], ['cross', 'Cross']], 'crowd'),
    S('move', 'Movement', [['still', 'Still'], ['fan', 'Fan'], ['sweep', 'Sweep'], ['circle', 'Circle'], ['wave', 'Wave'], ['ballyhoo', 'Ballyhoo'], ['crossfire', 'Crossfire']], 'sweep'),
    S('speed', 'Cycle', RATE, 8, 'How long one movement takes, in beats.'),
    R('size', 'Size', 0, 1, 0.01, 0.5),
    R('spread', 'Phase spread', 0, 1, 0.01, 0.35, '', 'Zero moves every head together; one spreads them into a wave.'),
    S('color', 'Colour', [['one', 'First'], ['split', 'Split'], ['chase', 'Chase'], ['rainbow', 'Rainbow'], ['white', 'White']], 'split'),
    S('dimmer', 'Dimmer', [['on', 'On'], ['pulse', 'Pulse'], ['chase', 'Chase'], ['random', 'Random'], ['strobe', 'Strobe']], 'on'),
    S('rate', 'Dimmer rate', RATE, 1),
    R('zoom', 'Zoom', 0, 1, 0.01, 0.2, '', 'Narrow pencil beams to wide shafts.'),
    ORDER(),
  ] },
  { id: 'washes', name: 'Washes', note: 'Soft, wide fixtures that colour the stage and the room.', fields: [
    R('level', 'Level', 0, 1, 0.01, 0.6),
    S('aim', 'Aim', [['stage', 'Stage'], ['crowd', 'Crowd']], 'stage'),
    S('color', 'Colour', [['one', 'First'], ['two', 'Second'], ['split', 'Split'], ['chase', 'Chase'], ['rainbow', 'Rainbow']], 'one'),
    S('dimmer', 'Dimmer', [['on', 'On'], ['pulse', 'Pulse'], ['chase', 'Chase'], ['breathe', 'Breathe']], 'on'),
    S('rate', 'Dimmer rate', RATE, 4),
    ORDER(),
  ] },
  { id: 'lasers', name: 'Lasers', note: 'Fans of light above the crowd. Haze makes them visible.', fields: [
    R('level', 'Level', 0, 1, 0.01, 0),
    S('pattern', 'Pattern', [['fan', 'Fan'], ['sweep', 'Sweep'], ['tunnel', 'Tunnel'], ['cross', 'Cross'], ['sheet', 'Sheet']], 'fan'),
    S('color', 'Colour', [['0', 'First'], ['1', 'Second'], ['2', 'Third'], ['chase', 'Chase']], '0'),
    S('speed', 'Cycle', RATE, 4),
    R('count', 'Rays', 2, 16, 1, 8),
    ORDER(),
  ] },
  { id: 'strobes', name: 'Strobes', note: 'Blinders and strobes. Use sparingly; they hit hardest after dark.', fields: [
    R('level', 'Level', 0, 1, 0.01, 0),
    S('mode', 'Mode', [['hits', 'On the bar'], ['backbeat', 'Two and four'], ['strobe', 'Strobe']], 'hits'),
    S('rate', 'Strobe rate', [[0.5, '⅛'], [0.25, '1/16'], [0.125, '1/32']], 0.25),
    ORDER(),
  ] },
  { id: 'pixels', name: 'Pixels', note: 'LED strips along the trusses and towers.', fields: [
    R('level', 'Level', 0, 1, 0.01, 0.5),
    S('mode', 'Effect', [['chase', 'Chase'], ['pulse', 'Pulse'], ['sparkle', 'Sparkle'], ['wave', 'Wave']], 'chase'),
    S('speed', 'Cycle', RATE, 2),
    ORDER(),
  ] },
  { id: 'screen', name: 'Screen', note: 'The LED wall behind the band, or the dome itself at the Sphere.', fields: [
    R('level', 'Level', 0, 1, 0.01, 0.7),
    S('visual', 'Visual', [['gradient', 'Gradient'], ['waves', 'Waves'], ['tunnel', 'Tunnel'], ['spectrum', 'Spectrum'], ['grid', 'Grid'], ['rings', 'Rings'], ['noise', 'Clouds']], 'waves'),
    S('speed', 'Cycle', RATE, 8),
  ] },
  { id: 'atmos', name: 'Room', note: 'Haze, house lights and how hard the rig follows the music.', fields: [
    R('haze', 'Haze', 0, 1, 0.01, 0.6),
    R('house', 'House lights', 0, 1, 0.01, 0),
    R('react', 'Follow the music', 0, 1, 0.01, 0.6, '', 'How much the audio pumps levels on top of the programmed look.'),
  ] },
];

export const DEFAULT_LOOK = Object.fromEntries([
  ['palette', PALETTES.ice.colors],
  ...GROUPS.map(g => [g.id, Object.fromEntries(g.fields.map(f => [f.key, f.value]))]),
]);

// complete a partial look from the defaults
export function fullLook(l = {}) {
  const out = { palette: (l.palette || DEFAULT_LOOK.palette).slice(0, 3) };
  for (const g of GROUPS) out[g.id] = { ...DEFAULT_LOOK[g.id], ...(l[g.id] || {}) };
  // a custom group's own settings, which override the type's for its fixtures
  if (l.groups && Object.keys(l.groups).length) out.groups = JSON.parse(JSON.stringify(l.groups));
  return out;
}

const off = { beams: { level: 0 }, washes: { level: 0 }, lasers: { level: 0 }, strobes: { level: 0 }, pixels: { level: 0 }, screen: { level: 0 } };
// Preset looks. Each one is a partial look laid over the defaults.
export const PRESETS = {
  house: { name: 'House lights', look: { ...off, palette: PALETTES.gold.colors, washes: { level: 0.35, color: 'one', dimmer: 'on' }, screen: { level: 0.18, visual: 'gradient', speed: 16 }, atmos: { haze: 0.35, house: 0.75, react: 0 } } },
  open: { name: 'Cold open', look: { ...off, palette: PALETTES.mono.colors, beams: { level: 0.95, aim: 'stage', move: 'wave', speed: 16, size: 0.25, spread: 0.6, color: 'white', dimmer: 'on', zoom: 0.05 }, atmos: { haze: 0.8, house: 0, react: 0.2 } } },
  ocean: { name: 'Ocean sweep', look: { palette: PALETTES.deep.colors, beams: { level: 0.85, aim: 'crowd', move: 'sweep', speed: 16, size: 0.6, spread: 0.3, color: 'split', zoom: 0.18 }, washes: { level: 0.55, color: 'one', dimmer: 'breathe', rate: 16 }, pixels: { level: 0.35, mode: 'wave', speed: 8 }, screen: { level: 0.6, visual: 'waves', speed: 16 }, lasers: { level: 0 }, strobes: { level: 0 }, atmos: { haze: 0.75, react: 0.45 } } },
  build: { name: 'Build chase', look: { palette: PALETTES.magenta.colors, beams: { level: 0.9, aim: 'sky', move: 'fan', size: 0.7, color: 'split', dimmer: 'chase', rate: 1, zoom: 0.08 }, washes: { level: 0.5, color: 'chase', dimmer: 'pulse', rate: 1 }, pixels: { level: 0.8, mode: 'chase', speed: 1 }, screen: { level: 0.75, visual: 'tunnel', speed: 4 }, lasers: { level: 0 }, strobes: { level: 0 }, atmos: { haze: 0.7, react: 0.6 } } },
  drop: { name: 'Drop', look: { palette: PALETTES.ice.colors, beams: { level: 1, aim: 'crowd', move: 'ballyhoo', speed: 4, size: 0.85, spread: 0.7, color: 'chase', dimmer: 'pulse', rate: 1, zoom: 0.14 }, washes: { level: 0.75, color: 'split', dimmer: 'pulse', rate: 1 }, lasers: { level: 0.9, pattern: 'fan', color: 'chase', speed: 2, count: 10 }, strobes: { level: 0.8, mode: 'hits' }, pixels: { level: 1, mode: 'pulse', speed: 1 }, screen: { level: 0.9, visual: 'spectrum', speed: 2 }, atmos: { haze: 0.7, react: 0.85 } } },
  tunnel: { name: 'Laser tunnel', look: { palette: PALETTES.emerald.colors, beams: { level: 0.2, aim: 'stage', move: 'still', color: 'one', zoom: 0.3 }, washes: { level: 0.2, color: 'two' }, lasers: { level: 1, pattern: 'tunnel', color: '0', speed: 8, count: 14 }, strobes: { level: 0 }, pixels: { level: 0.2, mode: 'sparkle' }, screen: { level: 0.35, visual: 'rings', speed: 4 }, atmos: { haze: 0.9, react: 0.5 } } },
  hymn: { name: 'Amber hymn', look: { palette: PALETTES.gold.colors, beams: { level: 0.55, aim: 'stage', move: 'still', color: 'one', dimmer: 'on', zoom: 0.55 }, washes: { level: 0.8, color: 'one', dimmer: 'breathe', rate: 16 }, lasers: { level: 0 }, strobes: { level: 0 }, pixels: { level: 0.25, mode: 'wave', speed: 16 }, screen: { level: 0.5, visual: 'gradient', speed: 16 }, atmos: { haze: 0.55, react: 0.25 } } },
  rainbow: { name: 'Rainbow circle', look: { palette: PALETTES.rose.colors, beams: { level: 0.95, aim: 'crowd', move: 'circle', speed: 8, size: 0.55, spread: 1, color: 'rainbow', dimmer: 'on', zoom: 0.12 }, washes: { level: 0.5, color: 'rainbow', dimmer: 'on' }, lasers: { level: 0 }, strobes: { level: 0 }, pixels: { level: 0.8, mode: 'wave', speed: 4 }, screen: { level: 0.7, visual: 'rings', speed: 8 }, atmos: { haze: 0.65, react: 0.6 } } },
  crowd: { name: 'Crowd sweep', look: { palette: PALETTES.sunset.colors, beams: { level: 0.9, aim: 'crowd', move: 'wave', speed: 8, size: 0.7, spread: 0.8, color: 'split', zoom: 0.35 }, washes: { level: 0.65, aim: 'crowd', color: 'one', dimmer: 'pulse', rate: 2 }, lasers: { level: 0 }, strobes: { level: 0 }, pixels: { level: 0.6, mode: 'chase', speed: 4 }, screen: { level: 0.6, visual: 'noise', speed: 8 }, atmos: { haze: 0.6, house: 0.08, react: 0.6 } } },
  storm: { name: 'Strobe storm', look: { palette: PALETTES.mono.colors, beams: { level: 1, aim: 'crowd', move: 'crossfire', speed: 2, size: 0.9, spread: 0.2, color: 'white', dimmer: 'strobe', zoom: 0.1 }, washes: { level: 0.2, color: 'one' }, lasers: { level: 0.6, pattern: 'cross', color: '2', speed: 1, count: 6 }, strobes: { level: 1, mode: 'strobe', rate: 0.25 }, pixels: { level: 1, mode: 'sparkle', speed: 1 }, screen: { level: 0.8, visual: 'grid', speed: 1 }, atmos: { haze: 0.75, react: 0.9 } } },
  sunset: { name: 'Sunset fan', look: { palette: PALETTES.ember.colors, beams: { level: 0.9, aim: 'sky', move: 'sweep', speed: 16, size: 0.4, spread: 0.15, color: 'split', zoom: 0.25 }, washes: { level: 0.7, color: 'one', dimmer: 'breathe', rate: 8 }, lasers: { level: 0.4, pattern: 'sheet', color: '2', speed: 16, count: 12 }, strobes: { level: 0 }, pixels: { level: 0.4, mode: 'wave', speed: 8 }, screen: { level: 0.65, visual: 'gradient', speed: 8 }, atmos: { haze: 0.6, react: 0.4 } } },
  blackout: { name: 'Blackout', look: { ...off, atmos: { haze: 0.6, house: 0, react: 0 } } },
};

// cue fades: names for GSAP eases
export const EASES = [['power1.inOut', 'Smooth'], ['none', 'Linear'], ['power3.out', 'Fast in'], ['power3.in', 'Slow in'], ['expo.out', 'Snap']];

/* The venues. Dimensions in metres, roughly true to each room. stage: deck width, depth and
   height; rig: truss height. screen: the LED wall, or the room's own surface that plays the
   screen's visuals. The architecture itself is built in venues.js. */
export const VENUES = {
  redrocks: { name: 'Red Rocks Amphitheatre', city: 'Morrison, Colorado', cap: 9525, kind: 'Open air',
    note: 'A stage at the foot of two 90-metre sandstone monoliths, with Denver glittering beyond it.',
    stage: { w: 22, d: 13, h: 1.6 }, rig: { h: 12, roof: true }, screen: { w: 16, h: 7, y: 4.4 },
    sky: 'night', swatch: 'linear-gradient(160deg,#1d2140,#6b2a1c 55%,#2a120c)' },
  bowl: { name: 'Hollywood Bowl', city: 'Los Angeles, California', cap: 17500, kind: 'Open air',
    note: 'The concentric white shell on a hillside, glowing in whatever colour you light it.',
    stage: { w: 24, d: 14, h: 1.4 }, rig: { h: 9 }, screen: { w: 14, h: 6, y: 4 },
    sky: 'la', swatch: 'linear-gradient(160deg,#20254a,#e8e4dc 50%,#2a2440)' },
  msg: { name: 'Madison Square Garden', city: 'New York, New York', cap: 19500, kind: 'Arena',
    note: 'An end stage in the round bowl, under the famous cable-hung ceiling. The ribbon boards follow the show.',
    stage: { w: 24, d: 14, h: 1.8 }, rig: { h: 16 }, screen: { w: 20, h: 9, y: 5 },
    sky: 'indoor', swatch: 'linear-gradient(160deg,#141a2e,#2a3a6a 50%,#0b0d16)' },
  sphere: { name: 'Sphere', city: 'Las Vegas, Nevada', cap: 17600, kind: 'Dome',
    note: 'The whole interior is a screen. Here the screen visuals wrap the dome above the crowd.',
    stage: { w: 22, d: 10, h: 1.4 }, rig: { h: 11 }, screen: { dome: true },
    sky: 'indoor', swatch: 'radial-gradient(circle at 50% 30%,#6fe3ff,#4b2cff 45%,#0a0620)' },
  ryman: { name: 'Ryman Auditorium', city: 'Nashville, Tennessee', cap: 2362, kind: 'Hall',
    note: 'The Mother Church: curved wooden pews, a horseshoe balcony and stained-glass windows.',
    stage: { w: 14, d: 8, h: 1.2 }, rig: { h: 8 }, screen: { w: 8, h: 3.6, y: 3.2 },
    sky: 'indoor', swatch: 'linear-gradient(160deg,#4a2a18,#c58b4a 50%,#2a160c)' },
  radiocity: { name: 'Radio City Music Hall', city: 'New York, New York', cap: 6015, kind: 'Theatre',
    note: 'Art deco arches that sweep from the proscenium over the whole hall, lit like a sunset.',
    stage: { w: 30, d: 14, h: 1.3 }, rig: { h: 11 }, screen: { w: 18, h: 7, y: 3.8 },
    sky: 'indoor', swatch: 'linear-gradient(160deg,#3a1c10,#d8a050 50%,#5a2a18)' },
  gorge: { name: 'The Gorge Amphitheatre', city: 'George, Washington', cap: 27500, kind: 'Open air',
    note: 'A lawn above the Columbia River, with the canyon open behind the stage at dusk.',
    stage: { w: 24, d: 14, h: 1.8 }, rig: { h: 13 }, screen: { w: 12, h: 6, y: 4.5, sides: true },
    sky: 'dusk', swatch: 'linear-gradient(170deg,#ff9a5a,#6a4a8a 40%,#22304a)' },
  sofi: { name: 'SoFi Stadium', city: 'Inglewood, California', cap: 70000, kind: 'Stadium',
    note: 'Seventy thousand under a translucent roof, with the oval Infinity Screen hanging overhead.',
    stage: { w: 60, d: 22, h: 2.4 }, rig: { h: 24 }, screen: { w: 44, h: 16, y: 8 },
    sky: 'indoor', swatch: 'linear-gradient(160deg,#0e1a2a,#3a7aa8 50%,#0a0e18)' },
  fillmore: { name: 'The Fillmore', city: 'San Francisco, California', cap: 1315, kind: 'Ballroom',
    note: 'A ballroom of chandeliers and red walls, with the crowd right up against the stage.',
    stage: { w: 13, d: 7, h: 1.2 }, rig: { h: 7 }, screen: { w: 9, h: 3.6, y: 3 },
    sky: 'indoor', swatch: 'linear-gradient(160deg,#3a0a12,#b02a34 50%,#1a0608)' },
  acl: { name: 'ACL Live at the Moody Theater', city: 'Austin, Texas', cap: 2750, kind: 'Theatre',
    note: 'Tiered balconies close to the stage, and the Austin skyline behind the band.',
    stage: { w: 16, d: 9, h: 1.2 }, rig: { h: 9 }, screen: { skyline: true, w: 22, h: 9, y: 1.2 },
    sky: 'indoor', swatch: 'linear-gradient(170deg,#1a2a5a,#ff9a4a 70%,#1a1210)' },
};
