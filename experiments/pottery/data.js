/* Clay bodies, glazes, settings and tools. Plain data, shared by the model, the renderer and the UI. */

// wet/fired: colour on the wheel and after the kiln. plastic: how readily it moves under a pull.
// strength: how much overhang a wet wall will hold. thirst: how fast it dries while you work.
export const BODIES = {
  stoneware: {
    name: 'Grey stoneware', note: 'The all-rounder. Forgiving, strong, and fires to a warm oatmeal.',
    wet: '#8e897f', fired: '#cdbba1', speck: 0.18, speckCol: '#5a3d26', rough: 0.78,
    shrink: 0.12, plastic: 1, strength: 1.1, thirst: 1, cone: '6', temp: 1222,
  },
  porcelain: {
    name: 'Porcelain', note: 'Bright white and silky. Throws thin, but slumps if you push it.',
    wet: '#c8c5bd', fired: '#f3f1ec', speck: 0, speckCol: '#7a7a7a', rough: 0.55,
    shrink: 0.14, plastic: 0.9, strength: 0.8, thirst: 1.25, cone: '6', temp: 1222,
  },
  speckled: {
    name: 'Speckled buff', note: 'Iron flecks bloom through the glaze. Grogged, so it stands tall.',
    wet: '#a2907a', fired: '#dcc8a8', speck: 1, speckCol: '#3a2314', rough: 0.86,
    shrink: 0.11, plastic: 0.95, strength: 1.3, thirst: 0.9, cone: '6', temp: 1222,
  },
  terracotta: {
    name: 'Terracotta', note: 'Soft, plastic red earthenware. Fires to a warm orange at a low temperature.',
    wet: '#7c4029', fired: '#b8603a', speck: 0.12, speckCol: '#5b2a17', rough: 0.82,
    shrink: 0.07, plastic: 1.15, strength: 0.95, thirst: 1.1, cone: '04', temp: 1060,
  },
  black: {
    name: 'Black stoneware', note: 'Manganese-dark. Glazes glow against it; bare, it reads like slate.',
    wet: '#3b3633', fired: '#2c2725', speck: 0.25, speckCol: '#7a6c60', rough: 0.72,
    shrink: 0.11, plastic: 0.95, strength: 1.05, thirst: 1, cone: '6', temp: 1222,
  },
};

// thin/thick: the colour where the glaze breaks thin over rims and ridges, and where it pools.
// opaThin/opaThick: how much of the clay shows through. rough/coat: satin to glassy.
export const GLAZES = {
  celadon: { name: 'Celadon', note: 'Jade green and glassy. Pools darker in carved lines.', thin: '#c2d4b6', thick: '#6f9d80', opaThin: 0.4, opaThick: 0.85, rough: 0.07, coat: 1, crackle: 0.35 },
  tenmoku: { name: 'Tenmoku', note: 'Black gloss that breaks rust-brown on rims and ridges.', thin: '#94501f', thick: '#120c08', opaThin: 0.92, opaThick: 1, rough: 0.05, coat: 1 },
  shino: { name: 'Shino', note: 'Thick satin white, flashing orange where it runs thin.', thin: '#de9257', thick: '#efe6da', opaThin: 0.85, opaThick: 1, rough: 0.42, coat: 0.2, carbon: 0.7 },
  chun: { name: 'Chun blue', note: 'Opalescent sky blue that thins to brown at the edges.', thin: '#8a7458', thick: '#7f9fca', opaThin: 0.75, opaThick: 0.96, rough: 0.13, coat: 0.8 },
  ash: { name: 'Wood ash', note: 'Runny green-gold rivulets, as if from a wood-fired kiln.', thin: '#b89d5a', thick: '#46663a', opaThin: 0.55, opaThick: 0.96, rough: 0.2, coat: 0.8, runs: 1 },
  oxblood: { name: 'Copper red', note: 'Deep oxblood that clears to white at the rim.', thin: '#ddd2c3', thick: '#760d17', opaThin: 0.55, opaThick: 1, rough: 0.05, coat: 1 },
  white: { name: 'Matte white', note: 'Soft, dry, chalky white. Breaks to the clay on edges.', thin: '#d6cebf', thick: '#efebe3', opaThin: 0.5, opaThick: 1, rough: 0.74, coat: 0 },
  clear: { name: 'Clear', note: 'A glassy window onto the clay itself.', thin: '#ffffff', thick: '#f2ede2', opaThin: 0, opaThick: 0.1, rough: 0.05, coat: 1 },
  none: { name: 'Unglazed', note: 'Bare fired clay, matte and warm to the touch.', none: true },
};
export const LINER = { thin: '#e7e2d7', thick: '#f5f2eb', opaThin: 0.8, opaThick: 1, rough: 0.12, coat: 0.9 };

// Each setting is a stage, not a photographed room: a floor, a cove wall and one shaped light.
// hdr: Poly Haven, CC0, used only for reflections and fill. light.pos: where the gobo light hangs.
// lux: brightness where it lands. gobo: what it shines through.
export const SETTINGS = {
  workshop: { name: 'Workshop', note: 'Cool north light through a tall studio window.', hdr: 'artist_workshop_1k.hdr',
    exposure: 1.0, env: 0.5, floor: { kind: 'concrete', color: '#8d8a84', rough: 0.9 }, wall: '#a4a8aa', fog: '#3e4144',
    light: { pos: [-1.7, 1.9, 2.3], color: '#f3f1ec', lux: 2.6, angle: 0.44, penumbra: 0.3, gobo: 'window' } },
  attic: { name: 'Pine attic', note: 'Warm boards under the roof, lit from a skylight.', hdr: 'pine_attic_1k.hdr',
    exposure: 1.05, env: 0.45, floor: { kind: 'planks', color: '#8a5f39', rough: 0.7 }, wall: '#b0855a', fog: '#2e2015',
    light: { pos: [1.5, 2.5, 1.9], color: '#ffdcaa', lux: 3, angle: 0.4, penumbra: 0.35, gobo: 'skylight' } },
  veranda: { name: 'Veranda', note: 'Out on the porch in a bright morning, under the leaves.', hdr: 'veranda_1k.hdr',
    exposure: 0.92, env: 0.8, floor: { kind: 'painted', color: '#9ea4a2', rough: 0.6 }, wall: '#c3cbbd', fog: '#7f8c80',
    light: { pos: [-1.3, 2.9, 1.7], color: '#fff5e2', lux: 3.4, angle: 0.55, penumbra: 0.25, gobo: 'leaves', sway: 1 } },
  fireside: { name: 'Fireside', note: 'Night by the stove, in low, flickering light.', hdr: 'fireplace_1k.hdr',
    exposure: 1.2, env: 0.24, floor: { kind: 'planks', color: '#4a3324', rough: 0.75 }, wall: '#5a4232', fog: '#140d09',
    light: { pos: [1.9, 0.45, 1.4], color: '#ff9e5a', lux: 3.2, angle: 0.6, penumbra: 0.6, gobo: 'glow', flicker: 1 } },
};

// rpm: what the auto pedal sets when you pick the tool. min: below this the tool loses grip.
// size: the default reach of the tool in metres. spin: false for tools that work on a still wheel.
export const TOOLS = {
  center: { name: 'Centre and cone', key: 'C', rpm: 200, min: 110, size: 0.02, group: 'hands',
    how: 'Hold on the clay to centre it. Drag up to cone it tall, down to press it flat.' },
  open: { name: 'Open', key: 'O', rpm: 140, min: 60, size: 0.01, group: 'hands',
    how: 'Press into the top centre and drag down to the floor, then outward to widen it.' },
  pull: { name: 'Pull up', key: 'P', rpm: 110, min: 50, size: 0.009, group: 'hands',
    how: 'Start low on the wall and drag slowly up. Each pass thins the wall and raises it.' },
  shape: { name: 'Shape', key: 'S', rpm: 90, min: 35, size: 0.02, group: 'hands',
    how: 'Grab the wall and drag it out to belly it, or in to collar it.' },
  rib: { name: 'Rib', key: 'R', rpm: 100, min: 30, size: 0.014, group: 'tools',
    how: 'Run along a wall to smooth throwing lines and true the curve. Press in to compress.' },
  sponge: { name: 'Sponge', key: 'B', rpm: 60, min: 0, size: 0.016, group: 'tools',
    how: 'Soak up water and soften the rim. Wet clay slumps; dry clay grabs.' },
  needle: { name: 'Needle', key: 'N', rpm: 80, min: 30, size: 0.004, group: 'tools',
    how: 'Point to a height and let go to trim the rim level there.' },
  loop: { name: 'Trimming loop', key: 'L', rpm: 70, min: 30, size: 0.005, group: 'tools',
    how: 'Shave clay off where you touch: foot bevels, grooves, a cleaner profile.' },
  carve: { name: 'Carve', key: 'K', rpm: 0, min: 0, size: 0.003, group: 'detail', spin: false,
    how: 'With the wheel stopped, drag to carve flutes. Spinning, it cuts a ring.' },
  press: { name: 'Thumb press', key: 'T', rpm: 0, min: 0, size: 0.006, group: 'detail', spin: false,
    how: 'With the wheel stopped, press dimples into the wall. Drag to leave a row.' },
};
