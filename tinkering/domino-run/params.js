/* Every number the lab can tune, with its range and what it touches when it changes.
   `apply` says what has to happen after a change:
     'run'   – the recorded run is out of date (physics, timings that shape the run)
     'room'  – rebuild the room
     'light' – update lights and exposure
     'look'  – restyle the dominoes
     'cam'   – camera only
     'live'  – read every frame, nothing to do */

export const SECTIONS = [
  { id: 'physics', name: 'Physics' },
  { id: 'room', name: 'Room layout' },
  { id: 'camera', name: 'Camera' },
  { id: 'lighting', name: 'Lighting' },
  { id: 'dominoes', name: 'Dominoes' },
  { id: 'timings', name: 'Timings' },
  { id: 'sounds', name: 'Sounds' },
];

const P = (section, key, label, value, min, max, step, apply, extra = {}) =>
  ({ section, key, label, value, min, max, step, apply, ...extra });

export const SCHEMA = [
  // physics
  P('physics', 'gravity', 'Gravity', 9.81, 1, 20, 0.01, 'run', { unit: 'm/s²' }),
  P('physics', 'hz', 'Steps per second', 240, 120, 600, 30, 'run', { unit: 'Hz', note: 'Higher is steadier and slower to compute.' }),
  P('physics', 'iterations', 'Solver iterations', 4, 1, 16, 1, 'run'),
  P('physics', 'friction', 'Domino on domino friction', 0.35, 0, 1.2, 0.01, 'run'),
  P('physics', 'floorFriction', 'Floor friction', 0.5, 0, 1.2, 0.01, 'run'),
  P('physics', 'restitution', 'Bounce', 0.08, 0, 0.8, 0.01, 'run'),
  P('physics', 'densityScale', 'Density', 1, 0.2, 4, 0.05, 'run', { unit: '×', note: 'Multiplies each style’s own density.' }),
  P('physics', 'push', 'Starting push', 1, 0.2, 4, 0.05, 'run', { unit: '×' }),
  P('physics', 'angularDamping', 'Air drag (turning)', 0.02, 0, 1, 0.01, 'run'),
  P('physics', 'linearDamping', 'Air drag (moving)', 0, 0, 1, 0.01, 'run'),
  P('physics', 'ccd', 'Continuous collision', 1, 0, 1, 1, 'run', { type: 'toggle', note: 'Stops fast dominoes passing through thin ones.' }),
  P('physics', 'maxDuration', 'Longest run', 120, 10, 600, 5, 'run', { unit: 's' }),

  // room
  P('room', 'width', 'Room width', 6.4, 4.5, 9, 0.05, 'room', { unit: 'm' }),
  P('room', 'depth', 'Room depth', 5.4, 4, 8, 0.05, 'room', { unit: 'm' }),
  P('room', 'ceiling', 'Ceiling height', 2.7, 2.3, 3.6, 0.05, 'room', { unit: 'm' }),
  P('room', 'couchZ', 'Couch distance from back wall', 0.45, 0.1, 1.6, 0.01, 'room', { unit: 'm', note: 'Measured from the front wall behind it.' }),
  P('room', 'couchX', 'Couch side to side', 0, -1.5, 1.5, 0.01, 'room', { unit: 'm' }),
  P('room', 'couchLength', 'Couch length', 2.3, 1.6, 3.2, 0.01, 'room', { unit: 'm' }),
  P('room', 'tableGap', 'Coffee table gap', 0.45, 0.25, 1.2, 0.01, 'room', { unit: 'm' }),
  P('room', 'tableLength', 'Coffee table length', 1.25, 0.8, 1.8, 0.01, 'room', { unit: 'm' }),
  P('room', 'tableHeight', 'Coffee table height', 0.42, 0.3, 0.55, 0.01, 'room', { unit: 'm' }),
  P('room', 'cabinetDepth', 'Built-in depth', 0.42, 0.3, 0.65, 0.01, 'room', { unit: 'm' }),
  P('room', 'cabinetHeight', 'Built-in height', 0.72, 0.5, 1.0, 0.01, 'room', { unit: 'm' }),
  P('room', 'tvSize', 'TV size', 65, 42, 98, 1, 'room', { unit: 'in' }),
  P('room', 'windowWidth', 'Window width', 1.05, 0.6, 1.6, 0.01, 'room', { unit: 'm' }),
  P('room', 'windowHeight', 'Window height', 1.45, 0.9, 2.0, 0.01, 'room', { unit: 'm' }),
  P('room', 'sill', 'Sill height', 0.7, 0.3, 1.1, 0.01, 'room', { unit: 'm' }),
  P('room', 'floorScale', 'Floorboard scale', 1, 0.5, 2, 0.01, 'room', { unit: '×' }),
  P('room', 'wallColor', 'Wall colour', '#e7e1d6', null, null, null, 'room', { type: 'color' }),
  P('room', 'couchColor', 'Couch colour', '#5f6b66', null, null, null, 'room', { type: 'color' }),
  P('room', 'cabinetColor', 'Built-in colour', '#f1ede6', null, null, null, 'room', { type: 'color' }),

  // camera
  P('camera', 'fov', 'Field of view', 42, 20, 80, 1, 'cam', { unit: '°' }),
  P('camera', 'damping', 'Orbit smoothing', 0.09, 0.01, 0.4, 0.01, 'cam'),
  P('camera', 'minDistance', 'Closest zoom', 0.08, 0.03, 0.5, 0.01, 'cam', { unit: 'm' }),
  P('camera', 'maxDistance', 'Farthest zoom', 7, 2, 12, 0.1, 'cam', { unit: 'm' }),
  P('camera', 'followLag', 'Follow lag', 0.6, 0.05, 3, 0.05, 'live', { unit: 's' }),
  P('camera', 'followWindow', 'Wave window', 0.45, 0.1, 2, 0.05, 'live', { unit: 's', note: 'How recently a domino must have been hit to count as the wave front.' }),
  P('camera', 'wallMargin', 'Keep off walls', 0.12, 0.02, 0.5, 0.01, 'live', { unit: 'm' }),

  // lighting
  P('lighting', 'exposure', 'Exposure', 1.2, 0.3, 2.5, 0.01, 'light'),
  P('lighting', 'sun', 'Sunlight', 5.5, 0, 14, 0.1, 'light'),
  P('lighting', 'sunAzimuth', 'Sun direction', 62, 0, 360, 1, 'light', { unit: '°' }),
  P('lighting', 'sunElevation', 'Sun height', 34, 5, 85, 1, 'light', { unit: '°' }),
  P('lighting', 'sunColor', 'Sun colour', '#fff1dc', null, null, null, 'light', { type: 'color' }),
  P('lighting', 'environment', 'Room bounce light', 1.35, 0, 3, 0.01, 'light'),
  P('lighting', 'outside', 'View outside brightness', 1.0, 0.1, 3, 0.01, 'light'),
  P('lighting', 'lamps', 'Lamp brightness', 1.4, 0, 6, 0.05, 'light'),
  P('lighting', 'lampColor', 'Lamp colour', '#ffcf94', null, null, null, 'light', { type: 'color' }),
  P('lighting', 'fill', 'Fill light', 0.6, 0, 2, 0.01, 'light'),
  P('lighting', 'shadowSoftness', 'Shadow softness', 2.5, 0, 8, 0.1, 'light'),
  P('lighting', 'shadowSize', 'Shadow detail', 4096, 1024, 4096, 1024, 'light', { unit: 'px' }),

  // dominoes
  P('dominoes', 'standardHeight', 'Standard height', 48, 40, 60, 0.5, 'look', { unit: 'mm', note: 'The smallest size. A toppling domino is about 48 mm.' }),
  P('dominoes', 'widthRatio', 'Width', 0.5, 0.3, 0.8, 0.01, 'look', { unit: '× height' }),
  P('dominoes', 'thicknessRatio', 'Thickness', 0.156, 0.08, 0.3, 0.001, 'look', { unit: '× height' }),
  P('dominoes', 'bevel', 'Edge rounding', 0.22, 0, 0.5, 0.01, 'look', { unit: '× thickness' }),
  P('dominoes', 'spacing', 'Default spacing', 0.55, 0.25, 1.0, 0.01, 'live', { unit: '× height', note: 'Centre to centre, used by Place and Draw.' }),
  P('dominoes', 'gloss', 'Gloss', 1, 0, 2, 0.01, 'look', { unit: '×' }),
  P('dominoes', 'pipSize', 'Pip size', 1, 0.5, 1.6, 0.01, 'look', { unit: '×' }),
  P('dominoes', 'outline', 'Selection outline', 0.04, 0.01, 0.12, 0.005, 'look', { unit: '× height' }),

  // timings
  P('timings', 'startDelay', 'Start delay', 0.6, 0, 5, 0.05, 'run', { unit: 's' }),
  P('timings', 'recordHz', 'Recording rate', 60, 30, 120, 10, 'run', { unit: 'Hz' }),
  P('timings', 'settle', 'End after stillness', 1.0, 0.2, 5, 0.1, 'run', { unit: 's' }),
  P('timings', 'slowFactor', 'Slow motion speed', 0.2, 0.05, 0.6, 0.01, 'live', { unit: '×' }),
  P('timings', 'slowLength', 'Slow motion length', 2.2, 0.5, 6, 0.1, 'live', { unit: 's' }),
  P('timings', 'effectScale', 'Effect length', 1, 0.3, 3, 0.05, 'live', { unit: '×' }),
  P('timings', 'trailLength', 'Trail length', 0.9, 0.2, 4, 0.05, 'live', { unit: 's' }),
  P('timings', 'hitAngle', 'Counts as hit at', 3, 0.5, 20, 0.5, 'run', { unit: '°' }),

  // sounds
  P('sounds', 'volume', 'Master volume', 0.8, 0, 1.5, 0.01, 'live'),
  P('sounds', 'clicks', 'Domino on domino', 0.9, 0, 2, 0.01, 'live'),
  P('sounds', 'floor', 'Domino on floor', 0.9, 0, 2, 0.01, 'live'),
  P('sounds', 'furniture', 'Domino on furniture', 0.8, 0, 2, 0.01, 'live'),
  P('sounds', 'pitch', 'Pitch', 1, 0.5, 2, 0.01, 'live', { unit: '×' }),
  P('sounds', 'decay', 'Ring time', 1, 0.3, 3, 0.01, 'live', { unit: '×' }),
  P('sounds', 'brightness', 'Brightness', 1, 0.3, 2, 0.01, 'live', { unit: '×' }),
  P('sounds', 'threshold', 'Quietest impact', 0.04, 0, 0.5, 0.005, 'live', { unit: 'm/s', note: 'Contacts slower than this make no sound.' }),
  P('sounds', 'voices', 'Most sounds at once', 24, 4, 64, 1, 'live'),
  P('sounds', 'reverb', 'Room echo', 0.18, 0, 0.8, 0.01, 'live'),
  P('sounds', 'effects', 'Effect sounds', 0.7, 0, 2, 0.01, 'live'),
];

export const DEFAULTS = Object.fromEntries(SCHEMA.map(p => [p.key, p.value]));
export const PARAMS = { ...DEFAULTS };
export const byKey = Object.fromEntries(SCHEMA.map(p => [p.key, p]));

/* The lab writes params.json next to this file. Anything in it overrides the defaults. */
export async function loadParams() {
  try {
    const res = await fetch(new URL('./params.json', import.meta.url), { cache: 'no-store' });
    if (!res.ok) return false;
    const saved = await res.json();
    for (const [k, v] of Object.entries(saved)) if (k in DEFAULTS) PARAMS[k] = v;
    return true;
  } catch { return false; }
}

export function changedFromDefaults() {
  return Object.fromEntries(Object.entries(PARAMS).filter(([k, v]) => v !== DEFAULTS[k]));
}

export const INCH = 0.0254;
export const MAX_HEIGHT = 12 * INCH;
export const stdHeight = () => PARAMS.standardHeight / 1000;
export function dims(h) {
  return { h, w: h * PARAMS.widthRatio, t: h * PARAMS.thicknessRatio };
}
