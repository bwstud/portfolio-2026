/* Every tunable number in the machine, grouped by the link in the chain it belongs to.
   type: 'range' (default) | 'toggle' | 'color'.  apply: 'sim' re-runs the bake, 'look' only
   changes how things are drawn, 'build' rebuilds meshes and re-runs the bake. */

export const SECTIONS = [
  { id: 'skier', name: 'Skier', element: 'jump' },
  { id: 'jump', name: 'Ski jump', element: 'jump' },
  { id: 'barrier', name: 'Wall', element: 'jump' },
  { id: 'operator', name: 'Camera operator', element: 'operator' },
  { id: 'lens', name: 'Lens', element: 'operator' },
  { id: 'pad', name: 'Spring pad', element: 'pad' },
  { id: 'cube', name: 'Gravity cube', element: 'cube' },
  { id: 'laser', name: 'Laser pointer', element: 'laser' },
  { id: 'pile', name: 'Gunpowder pile', element: 'pile' },
  { id: 'trail', name: 'Powder trail', element: 'trail' },
  { id: 'whale', name: 'Whale and explosives', element: 'whale' },
  { id: 'room', name: 'Room', element: null },
  { id: 'view', name: 'Playback and camera', element: null },
];

const r = (section, key, label, value, min, max, step, unit = '', apply = 'sim', note = '') =>
  ({ section, key, label, value, min, max, step, unit, apply, note, type: 'range' });
const t = (section, key, label, value, apply = 'sim', note = '') =>
  ({ section, key, label, value: value ? 1 : 0, type: 'toggle', apply, note });
const c = (section, key, label, value, apply = 'look') =>
  ({ section, key, label, value, type: 'color', apply });

export const SCHEMA = [
  // ---- skier
  r('skier', 'startDelay', 'Start delay', 1.0, 0, 5, 0.1, 's', 'sim', 'How long he waits on the start bar.'),
  r('skier', 'pushOff', 'Push-off speed', 0.4, 0, 2, 0.05, 'm/s'),
  r('skier', 'skierMass', 'Mass', 0.35, 0.05, 2, 0.01, 'kg', 'sim', 'Heavier means a harder bump into the wall.'),
  r('skier', 'wax', 'Ski friction', 0.025, 0, 0.2, 0.005, '', 'sim', 'Snow-to-ski friction on the inrun and landing hill.'),
  r('skier', 'tuckDrag', 'Drag in the tuck', 0.025, 0, 0.3, 0.005, '1/m'),
  r('skier', 'tuckDepth', 'Tuck depth', 0.85, 0, 1, 0.05, '', 'sim', 'How low he crouches. Lower is less drag.'),
  r('skier', 'pop', 'Takeoff pop', 0.15, 0, 2.5, 0.05, 'm/s', 'sim', 'The jump off the table edge, at right angles to it.'),
  r('skier', 'lift', 'Flight lift', 0.05, 0, 0.4, 0.005, '1/m', 'sim', 'How much the V-style flight position holds him up.'),
  r('skier', 'flightDrag', 'Flight drag', 0.03, 0, 0.3, 0.005, '1/m'),
  r('skier', 'tipAngle', 'Ski tip angle', 28, 0, 60, 1, '°', 'sim', 'Tips pointed up above the flight path. Most lift near 45°.'),
  r('skier', 'vAngle', 'Ski V spread', 14, 0, 35, 1, '°', 'look'),
  r('skier', 'landAbsorb', 'Landing loss', 0.12, 0, 0.8, 0.01, '', 'sim', 'Share of his speed along the hill lost on touchdown.'),
  r('skier', 'braking', 'Outrun braking', 5.2, 0, 15, 0.1, 'm/s²', 'sim', 'Snowplough on the flat. Tune it so he just reaches the wall.'),
  c('skier', 'suitColor', 'Suit', '#d8452f'),
  c('skier', 'helmetColor', 'Helmet', '#f2f2ee'),

  // ---- ski jump
  r('jump', 'inrunLength', 'Inrun length', 1.8, 0.6, 4, 0.05, 'm', 'build'),
  r('jump', 'inrunAngle', 'Inrun angle', 36, 15, 55, 0.5, '°', 'build'),
  r('jump', 'transition', 'Transition radius', 0.7, 0.15, 2, 0.05, 'm', 'build'),
  r('jump', 'tableAngle', 'Table angle', 10, 0, 20, 0.5, '°', 'build', 'Takeoff tables point slightly downhill.'),
  r('jump', 'tableLength', 'Table length', 0.22, 0.05, 0.8, 0.01, 'm', 'build'),
  r('jump', 'edgeHeight', 'Takeoff height', 0.95, 0.3, 2, 0.01, 'm', 'build'),
  r('jump', 'knollGap', 'Knoll drop', 0.07, 0, 0.3, 0.005, 'm', 'build', 'How far the top of the landing hill sits below the edge.'),
  r('jump', 'hillLength', 'Landing hill length', 2.4, 0.8, 5, 0.05, 'm', 'build'),
  r('jump', 'outrunLength', 'Outrun length', 2.4, 0.3, 4, 0.05, 'm', 'build'),
  r('jump', 'trackWidth', 'Track width', 0.32, 0.15, 0.8, 0.01, 'm', 'build'),
  r('jump', 'snowSparkle', 'Snow sparkle', 0.5, 0, 1, 0.05, '', 'look'),

  // ---- barrier
  r('barrier', 'wallHeight', 'Height', 0.12, 0.04, 0.4, 0.005, 'm', 'build', 'If he flies over it, he misses it.'),
  r('barrier', 'wallBounce', 'Bounce', 0.25, 0, 0.9, 0.01, '', 'sim', 'How much of his speed he bounces back with.'),
  r('barrier', 'wallShove', 'Shove passed through', 9, 0, 40, 0.5, 'rad/s per N·s', 'sim', 'How hard the bump rocks whoever leans on the far side.'),
  c('barrier', 'wallColor', 'Padding', '#2f5fa8'),

  // ---- operator
  r('operator', 'opHeight', 'Height', 0.2, 0.1, 0.4, 0.005, 'm', 'build'),
  r('operator', 'opLean', 'Lean on the wall', 7, 0, 25, 0.5, '°', 'sim', 'The further he leans, the bigger the shove needed to tip him back.'),
  r('operator', 'opReach', 'Contact reach', 0.07, 0, 0.3, 0.005, 'm', 'sim', 'Furthest from the wall he can stand and still feel the bump.'),
  r('operator', 'opDamping', 'Steadiness', 0.4, 0, 5, 0.05, '1/s', 'sim', 'Damping on his wobble. A steadier operator is harder to topple.'),
  c('operator', 'opColor', 'Jacket', '#4a5a3c'),

  // ---- lens
  r('lens', 'lensSize', 'Diameter', 0.03, 0.015, 0.12, 0.001, 'm', 'build'),
  r('lens', 'lensPop', 'Pop-off speed', 0.9, 0, 4, 0.05, 'm/s', 'sim', 'Extra speed as it snaps off the camera on impact.'),
  r('lens', 'lensBounce', 'Bounce', 0.3, 0, 0.9, 0.01, '', 'sim'),
  r('lens', 'rollResist', 'Rolling resistance', 0.06, 0, 0.5, 0.005, '', 'sim', 'Concrete is rough. Higher stops it sooner.'),
  t('lens', 'rollAim', 'Roll toward the pad', true, 'sim', 'Off, it rolls the way the operator falls plus the heading below.'),
  r('lens', 'rollHeading', 'Roll heading offset', 0, -90, 90, 1, '°', 'sim'),
  r('lens', 'focal', 'Focal length', 1.5, 0.2, 4, 0.01, 'm', 'sim', 'The pile catches fire fastest when it sits this far from the lens.'),
  r('lens', 'bendLimit', 'Beam bend limit', 95, 0, 180, 1, '°', 'sim', 'Widest turn the lens can put on the beam to reach the pile.'),

  // ---- pad
  r('pad', 'padRadius', 'Plate radius', 0.08, 0.02, 0.3, 0.005, 'm', 'build', 'The lens has to roll over the plate to set it off.'),
  t('pad', 'padAim', 'Aim at the cube', true, 'sim', 'Works out the heading and speed to reach the cube centre.'),
  r('pad', 'padAngle', 'Launch angle', 62, 10, 89, 0.5, '°'),
  r('pad', 'padSpeed', 'Launch speed', 4.5, 0.5, 15, 0.05, 'm/s', 'sim', 'Used when aiming is off.'),
  r('pad', 'padHeading', 'Launch heading', 0, -180, 180, 1, '°', 'sim', 'Used when aiming is off. 0° points along +x.'),
  r('pad', 'padSpeedScale', 'Spring strength', 1, 0.5, 1.5, 0.01, '×', 'sim', 'Scales the aimed speed: under 1 falls short, over 1 overshoots.'),

  // ---- cube
  r('cube', 'cubeSize', 'Size', 0.6, 0.2, 1.6, 0.01, 'm', 'build'),
  r('cube', 'cubePull', 'Pull to centre', 5, 0, 40, 0.1, '1/s²'),
  r('cube', 'cubeDamping', 'Damping', 4.2, 0, 20, 0.1, '1/s'),
  r('cube', 'cubeSyrup', 'Thickness', 22, 0, 80, 0.5, '1/m', 'sim', 'Drag that grows with speed. Catches the lens as it comes in.'),
  r('cube', 'cubeGravity', 'Gravity left inside', 0, 0, 1, 0.01, '×'),
  r('cube', 'cubeAlign', 'Alignment rate', 1.6, 0, 10, 0.05, '1/s', 'sim', 'How fast the lens turns to face the laser.'),
  r('cube', 'settleTol', 'At rest within', 3, 0.5, 20, 0.5, 'mm', 'sim', 'How close to the centre counts as at rest.'),
  r('cube', 'cubeGlow', 'Glow', 0.6, 0, 2, 0.05, '', 'look'),
  c('cube', 'cubeColor', 'Field', '#7fb6ff'),

  // ---- laser
  r('laser', 'laserDelay', 'Switch-on delay', 0.6, 0, 5, 0.05, 's', 'sim', 'After the lens comes to rest.'),
  r('laser', 'laserPower', 'Power', 6, 0.5, 40, 0.5, 'W'),
  r('laser', 'laserHold', 'Stays on for', 2.5, 0.2, 10, 0.1, 's', 'sim', 'After the pile lights.'),
  r('laser', 'beamWidth', 'Beam width', 6, 1, 30, 0.5, 'mm', 'look'),
  c('laser', 'beamColor', 'Beam', '#40ff7a'),

  // ---- pile
  r('pile', 'pileSize', 'Size', 0.12, 0.04, 0.4, 0.005, 'm', 'build'),
  r('pile', 'ignition', 'Energy to ignite', 3, 0.2, 30, 0.1, 'J', 'sim', 'Beam power times focus, summed over time.'),
  r('pile', 'pileBurn', 'Flare time', 1.4, 0.2, 5, 0.05, 's', 'look'),
  r('pile', 'pileFlame', 'Flare height', 0.45, 0.05, 1.5, 0.01, 'm', 'look'),

  // ---- trail
  r('trail', 'burnSpeed', 'Burn speed', 1.2, 0.05, 6, 0.05, 'm/s'),
  r('trail', 'trailWidth', 'Width', 0.035, 0.01, 0.12, 0.001, 'm', 'build'),
  r('trail', 'trailFlame', 'Flame height', 0.09, 0.02, 0.4, 0.005, 'm', 'look'),
  r('trail', 'trailBurnTime', 'Burns for', 0.7, 0.1, 3, 0.05, 's', 'look', 'How long each bit of powder keeps burning once lit.'),
  r('trail', 'emberTime', 'Embers glow for', 2.5, 0, 10, 0.1, 's', 'look'),

  // ---- whale
  r('whale', 'whaleLength', 'Whale length', 4.6, 1.5, 7, 0.05, 'm', 'build'),
  r('whale', 'whaleBloat', 'Bloat', 1.15, 0.8, 1.6, 0.01, '×', 'build'),
  r('whale', 'fuseDelay', 'Fuse delay', 0.5, 0, 5, 0.05, 's', 'sim', 'From the flame reaching the whale to the bang.'),
  r('whale', 'charge', 'Charge', 15, 2, 40, 0.5, 'm/s', 'sim', 'Speed it gives a small chunk. Big pieces go slower.'),
  r('whale', 'upBias', 'Upward kick', 0.45, 0, 1.5, 0.01, '', 'sim', 'Leans the blast towards the ceiling.'),
  r('whale', 'chunkCount', 'Chunks', 110, 10, 300, 1, '', 'sim'),
  r('whale', 'chunkSize', 'Chunk size', 1, 0.4, 2.5, 0.05, '×', 'sim'),
  r('whale', 'chunkBounce', 'Chunk bounce', 0.38, 0, 0.9, 0.01, '', 'sim', 'Ricochet off the walls, floor and ceiling.'),
  r('whale', 'chunkGrip', 'Chunk friction', 0.5, 0, 1, 0.01, '', 'sim', 'How quickly chunks stop sliding on the floor.'),
  r('whale', 'mistCount', 'Mist particles', 1500, 0, 4000, 50, '', 'sim'),
  r('whale', 'mistSpeed', 'Mist speed', 17, 2, 40, 0.5, 'm/s'),
  r('whale', 'mistDrag', 'Mist drag', 1.8, 0.1, 8, 0.05, '1/s', 'sim', 'Low drag lets the mist cross the room and bounce.'),
  r('whale', 'mistBounce', 'Mist bounce', 0.45, 0, 0.9, 0.01, ''),
  r('whale', 'mistHang', 'Mist hang time', 7, 1, 20, 0.5, 's', 'look'),
  t('whale', 'splatter', 'Splatter on surfaces', true, 'sim'),
  r('whale', 'runOn', 'Run on after the blast', 9, 2, 30, 0.5, 's', 'sim'),
  c('whale', 'goreColor', 'Gore', '#7a0d0f'),

  // ---- room
  r('room', 'roomWidth', 'Width', 18, 8, 30, 0.5, 'm', 'build', 'Wall to wall along x.'),
  r('room', 'roomDepth', 'Depth', 12, 6, 30, 0.5, 'm', 'build'),
  r('room', 'roomHeight', 'Height', 4.5, 2.5, 10, 0.1, 'm', 'build'),
  r('room', 'gravity', 'Gravity', 9.81, 1, 25, 0.01, 'm/s²'),
  r('room', 'lightLevel', 'Lights', 1, 0, 2.5, 0.05, '×', 'look'),
  r('room', 'exposure', 'Exposure', 1, 0.3, 2.5, 0.05, '', 'look'),
  r('room', 'floorTone', 'Concrete tone', 0.55, 0.2, 0.9, 0.01, '', 'build'),

  // ---- view
  t('view', 'follow', 'Follow the action', false, 'look', 'The camera target tracks whatever is moving in the chain.'),
  t('view', 'showPaths', 'Show paths', true, 'look', 'Dotted lines for where the skier and lens go in this run.'),
  r('view', 'shake', 'Blast shake', 0.6, 0, 2, 0.05, '', 'look'),
  r('view', 'flySpeed', 'Fly speed', 2.5, 0.2, 10, 0.1, 'm/s', 'look', 'For WASD flying. Hold Shift to go faster.'),
  r('view', 'fov', 'Field of view', 50, 20, 100, 1, '°', 'look'),
  r('view', 'volume', 'Sound', 0.6, 0, 1, 0.05, '', 'look'),
];

export const DEFAULTS = Object.fromEntries(SCHEMA.map(p => [p.key, p.value]));

/* Where things sit. World metres, y up. The camera operator is placed relative to the back of
   the wall, so he moves with the ski jump. */
export const DEFAULT_LAYOUT = {
  jump: { x: -6.75, z: -2.4, rot: 0 },
  operator: { dx: 0.05, dz: 0.02, rot: 0 },
  pad: { x: 0.55, z: -1.15 },
  cube: { x: 1.55, y: 1.15, z: -0.25 },
  laser: { x: 2.65, y: 1.55, z: 1.25 },
  pile: { x: 0.75, z: 0.55 },
  trail: [{ x: 1.4, z: 1.5 }, { x: 2.6, z: 2.05 }, { x: 3.4, z: 1.2 }],
  whale: { x: 4.45, z: -0.55, rot: 90 },
};

export const clone = o => JSON.parse(JSON.stringify(o));
