/* Stands, skirts and strands: the data. Builders live in decor.js and lights.js. */

export const STANDS = {
  classic: { name: 'Classic steel bowl', note: 'Red bowl, green legs, four eye bolts. Holds 1 gallon.', capacity: 3.8, mount: 0.17 },
  heirloom: { name: 'Cast-iron heirloom', note: 'Scrolled legs from the 1940s. Heavy, handsome, holds ¾ gallon.', capacity: 2.8, mount: 0.2 },
  reservoir: { name: 'Big reservoir', note: 'Deep green plastic well and a level window. Holds 2 gallons.', capacity: 7.5, mount: 0.2 },
  bucket: { name: 'Galvanized bucket', note: 'A pail packed with river stones, Scandinavian style. Holds 3 gallons.', capacity: 11, mount: 0.3 },
};

export const SKIRTS = [
  { id: 'none', name: 'No skirt' },
  { id: 'buffalo', name: 'Buffalo plaid' },
  { id: 'stewart', name: 'Royal Stewart tartan' },
  { id: 'fairisle', name: 'Fair Isle knit' },
  { id: 'velvet', name: 'Burgundy velvet, gold trim' },
  { id: 'patchwork', name: 'Quilted patchwork' },
  { id: 'burlap', name: 'Burlap and lace' },
  { id: 'fur', name: 'White faux fur' },
  { id: 'gingham', name: 'Green gingham' },
  { id: 'poinsettia', name: 'Poinsettia print' },
  { id: 'snowflake', name: 'Navy felt snowflakes' },
  { id: 'candy', name: 'Candy stripe' },
  { id: 'houndstooth', name: 'Houndstooth' },
  { id: 'scandi', name: 'Scandinavian hearts' },
];

const MULTI = ['#ff3b30', '#ffb020', '#2fd158', '#2f7bff', '#ff5ec8', '#ff8a1f'];
const RETRO = ['#e8322b', '#f2b12c', '#1fa44b', '#2559d9', '#e65b16'];

/* Strands. spacing is metres between bulbs along the wire. */
export const STRANDS = {
  c9: { name: 'C9 multicolor', note: 'Big ceramic-coated bulbs, the 1950s look.', kind: 'bulb', size: 0.018, spacing: 0.3, colors: RETRO, wire: '#1c3a1e', glow: 1.0, length: 7.5 },
  c7warm: { name: 'C7 warm white', note: 'Classic strawberry bulbs in a candle glow.', kind: 'bulb', size: 0.013, spacing: 0.22, colors: ['#ffc36b'], wire: '#1c3a1e', glow: 0.9, length: 7.5 },
  miniwarm: { name: 'Mini warm white', note: '100 tiny lights. The everyday choice.', kind: 'mini', size: 0.0055, spacing: 0.1, colors: ['#ffcf80'], wire: '#21401f', glow: 0.8, length: 10 },
  minimulti: { name: 'Mini multicolor', note: '100 tiny lights in five colors.', kind: 'mini', size: 0.0055, spacing: 0.1, colors: MULTI, wire: '#21401f', glow: 0.8, length: 10 },
  fairy: { name: 'Copper fairy wire', note: 'Seed-sized LEDs on bare copper.', kind: 'fairy', size: 0.003, spacing: 0.06, colors: ['#ffd9a0'], wire: '#b8733a', glow: 0.7, length: 10 },
  bubble: { name: 'Vintage bubble lights', note: 'Liquid-filled tubes that bubble once they warm up.', kind: 'bubble', size: 0.012, spacing: 0.28, colors: ['#ff4b3e', '#ffd23c', '#4bd16a', '#43a7ff', '#ff70d0'], wire: '#1c3a1e', glow: 0.8, length: 6 },
  coolwhite: { name: 'LED cool white', note: 'Crisp, icy light.', kind: 'mini', size: 0.005, spacing: 0.1, colors: ['#dfeaff'], wire: '#e8e8e8', glow: 0.8, length: 10 },
  popcorn: { name: 'Popcorn and cranberry', note: 'Threaded by hand, a 19th-century garland.', kind: 'garland', bead: 'popcorn', spacing: 0.018, length: 6 },
  beads: { name: 'Gold bead garland', note: 'Mercury-glass style beads.', kind: 'garland', bead: 'gold', spacing: 0.024, length: 6 },
  tinsel: { name: 'Silver tinsel', note: 'A shimmering rope of foil.', kind: 'garland', bead: 'tinsel', spacing: 0.007, length: 5 },
};

export const LIGHT_MODES = [
  { id: 'steady', name: 'Steady' },
  { id: 'twinkle', name: 'Twinkle' },
  { id: 'fade', name: 'Slow fade' },
  { id: 'chase', name: 'Chase' },
];
