// What can go on the plate, and what the plate is made of.
// kind picks the renderer: grains (points), solids (instanced objects), liquid (a surface
// that carries the standing wave) or fire (a table of gas jets).
// sim tunes the grain physics in plate.js; hiss tunes the noise layered under the tone.

export const GROUPS = [
  { id: 'grains', name: 'Grains' },
  { id: 'solids', name: 'Solids' },
  { id: 'liquids', name: 'Liquids' },
  { id: 'fire', name: 'Fire' },
];

export const MEDIA = [
  {
    id: 'sand', name: 'Sand', group: 'grains', kind: 'grains', style: 0, count: 48000, size: 0.0062,
    about: 'Fine quartz sand, the classic. It piles into soft ridges on the still lines.',
    hiss: { type: 'bandpass', f: 4200, q: 0.6, g: 1 }, shade: 1,
    swatch: 'radial-gradient(circle at 35% 30%, #e9d6b0, #b39466 55%, #6e5638)',
  },
  {
    id: 'salt', name: 'Salt', group: 'grains', kind: 'grains', style: 1, count: 30000, size: 0.0078,
    sim: { kick: 3.6 },
    about: 'Cubes of salt. Look around the plate and the crystals catch the light.',
    hiss: { type: 'bandpass', f: 5200, q: 0.7, g: 1.1 }, shade: 0.6,
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #dfe5ea 45%, #9aa6b0)',
  },
  {
    id: 'iron', name: 'Iron filings', group: 'grains', kind: 'grains', style: 2, count: 34000, size: 0.012,
    sim: { kick: 2.6, damp: 0.74, align: true },
    about: 'Needles of iron. As they settle they turn to lie along the lines.',
    hiss: { type: 'bandpass', f: 6200, q: 1.1, g: 0.8 }, shade: 0.9,
    swatch: 'repeating-linear-gradient(60deg, #2a2c30 0 2px, #6f737a 2px 3px, #1b1c1f 3px 5px)',
  },
  {
    id: 'glitter', name: 'Glitter', group: 'grains', kind: 'grains', style: 3, count: 22000, size: 0.0095,
    sim: { kick: 3.4, cool: 0.9 },
    about: 'Holographic flakes. They flash as they tumble and change colour as you look around.',
    hiss: { type: 'bandpass', f: 5600, q: 0.5, g: 0.7 }, shade: 0.4,
    swatch: 'conic-gradient(from 30deg, #ff7ad9, #ffd36e, #7dffb2, #6ec8ff, #b88bff, #ff7ad9)',
  },
  {
    id: 'pigment', name: 'Pigment', group: 'grains', kind: 'grains', style: 4, count: 52000, size: 0.0062,
    about: 'Four colours of powder, poured in quarters. Every figure stirs them a little more.',
    hiss: { type: 'bandpass', f: 3600, q: 0.5, g: 0.8 }, shade: 0.8,
    swatch: 'conic-gradient(#e8236f 0 25%, #ff8a1c 0 50%, #2a7cf0 0 75%, #5cc93a 0)',
  },
  {
    id: 'glow', dark: true, name: 'Glow powder', group: 'grains', kind: 'grains', style: 5, count: 44000, size: 0.0062,
    sim: { cool: 0.985 },
    about: 'Phosphor that lights up when it’s thrown. The moving powder glows and the lines go dark.',
    hiss: { type: 'bandpass', f: 4200, q: 0.6, g: 0.9 }, shade: 0.5,
    swatch: 'radial-gradient(circle at 40% 35%, #d8ffe9, #4dffa6 40%, #0c3b2a 80%)',
  },
  {
    id: 'bearings', name: 'Ball bearings', group: 'solids', kind: 'solids', shape: 'ball', count: 2400, radius: 0.0115,
    sim: { kick: 2.2, damp: 0.88, stick: 0.1, drift: 0.02, repel: 0.023 },
    about: 'Steel balls. They roll more than they bounce, and line up shoulder to shoulder.',
    hiss: { type: 'bandpass', f: 2600, q: 0.9, g: 1.4 }, shade: 0.5,
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #c8ccd2 25%, #50545b 65%, #1d1f22)',
  },
  {
    id: 'beads', name: 'Glass beads', group: 'solids', kind: 'solids', shape: 'bead', count: 3000, radius: 0.0098,
    sim: { kick: 2.8, damp: 0.85, stick: 0.1, drift: 0.018, repel: 0.0196 },
    about: 'Sea-glass beads. Each one is a tiny lens, holding an upside-down picture of the plate.',
    hiss: { type: 'bandpass', f: 3800, q: 1.2, g: 1.2 }, shade: 0.35,
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #b6eadc 25%, #3fa58e 60%, #0d3029)',
  },
  {
    id: 'rice', name: 'Rice', group: 'solids', kind: 'solids', shape: 'rice', count: 5200, radius: 0.0045,
    sim: { kick: 3, damp: 0.8, drift: 0.016, align: true, repel: 0.0105 },
    about: 'Long grains of rice. They hop, spin and come to rest along the lines.',
    hiss: { type: 'bandpass', f: 3000, q: 0.7, g: 1.1 }, shade: 0.7,
    swatch: 'radial-gradient(ellipse 30% 14% at 35% 40%, #fbf6ea 70%, transparent 75%), radial-gradient(ellipse 30% 14% at 62% 62%, #f1e9d6 70%, transparent 75%), radial-gradient(circle, #cfc4ad, #8c8170)',
  },
  {
    id: 'water', name: 'Water', group: 'liquids', kind: 'liquid', look: 'water', height: 0.02,
    about: 'A shallow tray of water. The standing wave shows in its reflections.',
    hiss: { type: 'lowpass', f: 900, q: 0.4, g: 0 },
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #9fd8e8 25%, #2e7f99 65%, #0b2b38)',
  },
  {
    id: 'mercury', name: 'Mercury', group: 'liquids', kind: 'liquid', look: 'mercury', height: 0.013,
    about: 'Liquid metal: a moving mirror. Heavy, so its waves are low and smooth.',
    hiss: { type: 'lowpass', f: 900, q: 0.4, g: 0 },
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff, #d2d6dc 30%, #6a7078 60%, #202327)',
  },
  {
    id: 'ferro', name: 'Ferrofluid', group: 'liquids', kind: 'liquid', look: 'ferro', height: 0.003,
    about: 'Black magnetic fluid, with a magnet under the plate. Where it shakes, it rises in spikes.',
    hiss: { type: 'lowpass', f: 900, q: 0.4, g: 0 },
    swatch: 'radial-gradient(circle at 30% 28%, #8a8f99 0 6%, #16171a 30%, #000 75%)',
  },
  {
    id: 'lava', dark: true, name: 'Lava', group: 'liquids', kind: 'liquid', look: 'lava', height: 0.006,
    about: 'Molten rock under a cooling crust. The waves crack it open and the glow shows through.',
    hiss: { type: 'lowpass', f: 300, q: 0.5, g: 0.5 },
    swatch: 'radial-gradient(circle at 45% 45%, #ffd27a, #ff6a12 30%, #6b1404 60%, #170504)',
  },
  {
    id: 'flames', dark: true, name: 'Flame table', group: 'fire', kind: 'fire',
    about: 'Gas jets drilled through the plate. Each flame rises with the vibration above it.',
    hiss: { type: 'lowpass', f: 520, q: 0.5, g: 2.2 },
    swatch: 'radial-gradient(ellipse 40% 60% at 50% 70%, #fff3c4, #ffb02e 35%, #e2420c 65%, #2a0a04)',
  },
  {
    id: 'embers', dark: true, name: 'Embers', group: 'fire', kind: 'grains', style: 6, count: 15000, size: 0.0115,
    sim: { kick: 3.8, cool: 0.975 },
    about: 'Hot coals. They flare and throw sparks as they hop, then dim as they settle.',
    hiss: { type: 'bandpass', f: 2400, q: 0.5, g: 1.1 }, shade: 0.3,
    swatch: 'radial-gradient(circle at 40% 40%, #ffe9a8, #ff7a1a 30%, #8a1d06 60%, #1a0603)',
  },
];

export const PLATES = [
  { id: 'steel', name: 'Steel', swatch: 'linear-gradient(135deg, #e4e6ea, #8d9096 45%, #d2d5da 60%, #6f7278)' },
  { id: 'brass', name: 'Brass', swatch: 'linear-gradient(135deg, #f5dc9a, #a77c33 45%, #e6c473 60%, #7a5622)' },
  { id: 'obsidian', name: 'Black glass', swatch: 'linear-gradient(135deg, #3a3d44, #050506 40%, #16171a 70%, #000)' },
  { id: 'lightbox', name: 'Light table', swatch: 'radial-gradient(circle at 50% 50%, #fffaf0, #f1e6d3 50%, #b6aa98)' },
];

export const AMOUNTS = [
  { id: 'little', name: 'A little', k: 0.55 },
  { id: 'some', name: 'Some', k: 1 },
  { id: 'lots', name: 'Lots', k: 1.6 },
];

export const byId = (list, id) => list.find((m) => m.id === id) || list[0];
