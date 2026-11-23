/* Typed commands for the precise taxidermist:
     move left femur 40 up          move skull 3 cm forward       move femur 40 units up
     rotate femur 90 degrees counterclockwise around its y axis    turn jaw -15 x
     select tail vertebra 5         undo · redo · reset
   Distances are millimetres unless given in cm or m; a turn is counterclockwise unless
   it says clockwise (cw), looking down the bone's own axis. A bone named without a side
   takes the side of the bone already picked, else the left. */

const VERBS = {
  move: 'move', shift: 'move', nudge: 'move', lift: 'move', raise: 'move', lower: 'move',
  rotate: 'rotate', turn: 'rotate', spin: 'rotate', twist: 'rotate', tilt: 'rotate',
  select: 'select', pick: 'select', choose: 'select', grab: 'select',
  undo: 'undo', redo: 'redo', reset: 'reset',
};
const DIR = { up: 'up', upward: 'up', upwards: 'up', down: 'down', downward: 'down', downwards: 'down',
  forward: 'forward', forwards: 'forward', ahead: 'forward', back: 'back', backward: 'back', backwards: 'back',
  left: 'left', right: 'right' };
const MM = { mm: 1, millimetre: 1, millimetres: 1, millimeter: 1, millimeters: 1, unit: 1, units: 1,
  cm: 10, centimetre: 10, centimetres: 10, centimeter: 10, centimeters: 10, m: 1000, metre: 1000, metres: 1000, meter: 1000, meters: 1000 };
const FILLER = new Set(['the', 'its', 'it', 'a', 'by', 'around', 'about', 'on', 'axis', 'degrees', 'degree', 'deg', '°', 'to', 'bone', 'of']);
const ALIAS = { head: 'skull', cranium: 'skull', mandible: 'jaw', hoof: 'hoof bone', pelvis: 'hip bone', hip: 'hip bone',
  shoulder: 'scapula', 'shoulder blade': 'scapula', 'knee cap': 'kneecap', heel: 'heel bone', cannon: 'cannon bone',
  radius: 'radius and ulna', ulna: 'radius and ulna', breastbone: 'sternebra' };

const words = s => s.toLowerCase().replace(/[,]/g, ' ').replace(/°/g, ' ° ').split(/\s+/).filter(Boolean);

export function parseCommand(text, rig, selected) {
  const w = words(text);
  const verb = VERBS[w[0]];
  if (!verb) return { error: `Start with move, rotate, select, undo, redo or reset` };
  if (verb === 'undo' || verb === 'redo' || verb === 'reset') return { verb };

  // the amount is the last number; the bone is named between the verb and the amount
  let at = -1;
  for (let i = w.length - 1; i > 0; i--) if (/^[-+]?\d*\.?\d+$/.test(w[i])) { at = i; break; }
  if (verb !== 'select' && at < 0) return { error: verb === 'move' ? 'How far? e.g. “move skull 40 up”' : 'How far? e.g. “rotate skull 30 ccw around y”' };
  const nameWords = w.slice(1, verb === 'select' ? w.length : at);
  const rest = verb === 'select' ? [] : w.slice(at + 1);
  // "lift"/"raise"/"lower" carry their own direction
  const implied = { lift: 'up', raise: 'up', lower: 'down' }[w[0]];

  // a direction or axis written before the number belongs to the instruction, not the name
  const sideWords = nameWords.filter(x => x === 'left' || x === 'right');
  const bone = findBone(nameWords.filter(x => !FILLER.has(x)).join(' '), rig, selected);
  if (bone.error) return bone;
  if (verb === 'select') return { verb, bone: bone.name };

  const amount = parseFloat(w[at]);
  if (verb === 'move') {
    let unit = 1, dir = implied;
    for (const x of rest) { if (MM[x]) unit = MM[x]; if (DIR[x]) dir = DIR[x]; }
    if (!dir) return { error: 'Which way? up, down, forward, back, left or right' };
    let mm = amount * unit;
    if (mm < 0) { mm = -mm; dir = { up: 'down', down: 'up', forward: 'back', back: 'forward', left: 'right', right: 'left' }[dir]; }
    return { verb, bone: bone.name, mm, dir, sideWords };
  }
  let sign = 1, axis = null;
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    if (/^(cw|clockwise)$/.test(x)) sign = -1;
    if (/^(ccw|counterclockwise|anticlockwise|counter-clockwise|anti-clockwise)$/.test(x)) sign = 1;
    if (x === 'counter' || x === 'anti') sign = 1, i++;
    if (/^[xyz]$/.test(x)) axis = x;
    const m = x.match(/^([xyz])-?axis$/); if (m) axis = m[1];
  }
  if (!axis) return { error: 'About which axis? x, y or z, e.g. “rotate skull 30 ccw around y”' };
  return { verb: 'rotate', bone: bone.name, deg: amount * sign, axis };
}

/* every word asked for must appear in the bone's label (or name); prefer the selected side */
export function findBone(q, rig, selected) {
  if (!q) return selected ? { name: selected } : { error: 'Which bone? e.g. “left femur”, “skull”, “C3”, “tail vertebra 5”' };
  for (const [k, v] of Object.entries(ALIAS)) q = q.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  const want = q.split(/\s+/);
  const tokens = n => {
    const label = rig.label(n).toLowerCase();
    const t = new Set(label.split(/[\s,()+]+/));
    for (const x of [...t]) { const m = x.match(/^(c|t|l|ca)(\d+)$/); if (m) { t.add(m[2]); t.add(m[1] + m[2]); } }
    for (const x of n.toLowerCase().split('_')) t.add(x);
    return { t, label };
  };
  let hits = rig.names.filter(n => {
    const { t, label } = tokens(n);
    return want.every(x => t.has(x) || (x.length > 3 && label.includes(x)));
  });
  if (!hits.length) return { error: `No bone called “${q}”` };
  if (hits.length > 1 && !want.includes('left') && !want.includes('right')) {
    const side = selected && /^right/i.test(rig.label(selected)) ? 'right' : 'left';
    const sided = hits.filter(n => rig.label(n).toLowerCase().startsWith(side));
    if (sided.length) hits = hits.filter(n => !/^(left|right)/i.test(rig.label(n)) || sided.includes(n));
  }
  hits.sort((a, b) => rig.label(a).length - rig.label(b).length);
  return { name: hits[0] };
}
