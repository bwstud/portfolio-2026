/* How a cut tree drinks, dries and sheds. Runs in real time, and catches up for the
   time the page was closed. Each needle the model drops is drawn on the floor. */
import { SPECIES, heightM } from './species.js';
import { clamp } from './util.js';
import { STANDS } from './decor-data.js';

export const NEEDLES_PER_DRAWN = 1;
export const TOTAL_NEEDLES = 60000;   // for how thin the tree looks

export function trunkInches(spec) { return 2.2 + spec.heightFt * 0.38; }

/* Litres per hour at full thirst. Rule of thumb: about a quart a day per inch of trunk,
   more in the first few days after the fresh cut. */
export function drinkRate(tree, ageHours) {
  const S = SPECIES[tree.spec.species];
  const quartsPerDay = trunkInches(tree.spec) * S.drinkK;
  const firstDays = 1 + 0.7 * Math.exp(-ageHours / 60);
  return (quartsPerDay * 0.946 / 24) * firstDays;
}

export function shedPerHour(tree, ageHours) {
  const S = SPECIES[tree.spec.species];
  const dry = 1 - tree.hydration;
  const age = 1 + ageHours / (24 * 40);
  const size = heightM(tree.spec) / 2;
  return 2 * S.shed * size * (1 + 16 * dry * dry) * age;
}

/* Advance one tree from tree.lastSim to `to`. Returns sim needles dropped. */
export function advance(tree, to) {
  if (!tree.lastSim) tree.lastSim = to;
  let t = tree.lastSim;
  const S = SPECIES[tree.spec.species];
  const cap = STANDS[tree.standId]?.capacity ?? 4;
  let dropped = 0;
  const STEP = 10 * 60000;
  while (t < to) {
    const dt = Math.min(STEP, to - t);
    const h = dt / 3600000;
    const age = (t - tree.boughtAt) / 3600000;
    if (tree.standId) {
      const need = drinkRate(tree, age) * h * (0.4 + 0.6 * (1 - tree.hydration) + 0.6);
      if (tree.water >= need) {
        tree.water -= need;
        tree.hydration = clamp(tree.hydration + (1 - tree.hydration) * Math.min(1, h * 0.06));
      } else {
        const frac = tree.water / need;
        tree.water = 0;
        tree.hydration = clamp(tree.hydration - (h / S.dryHours) * (1 - frac));
      }
      tree.water = Math.min(tree.water, cap);
    } else {
      tree.hydration = clamp(tree.hydration - h / S.dryHours);   // no stand, no water
    }
    const n = shedPerHour(tree, age) * h;
    tree.carry = (tree.carry || 0) + n;
    const whole = Math.floor(tree.carry);
    tree.carry -= whole;
    dropped += whole;
    t += dt;
  }
  tree.lastSim = to;
  tree.lost = (tree.lost || 0) + dropped;
  tree.onFloor = (tree.onFloor || 0) + dropped;
  return dropped;
}

export function thirstLabel(tree) {
  const cap = STANDS[tree.standId]?.capacity ?? 4;
  const w = tree.water / cap;
  if (tree.hydration < 0.45) return 'Parched. Needles are falling fast.';
  if (tree.hydration < 0.75) return 'Thirsty. Needles are starting to drop.';
  if (w <= 0.001) return 'The stand is dry.';
  if (w < 0.25) return 'Water is low.';
  return 'Happy and well watered.';
}

/* Hours until the stand runs dry at the current rate */
export function hoursToDry(tree, now) {
  const r = drinkRate(tree, (now - tree.boughtAt) / 3600000) * (0.4 + 0.6 * (1 - tree.hydration) + 0.6);
  return tree.water / Math.max(r, 1e-6);
}
