/* Tatankagram: thirty thousand beads that ride a ring of dust, rise into a bison from the hooves up, hold, and are blown
   off by the wind, left to right, back into the ring.

   The points: head.bin and whole.bin, written by tools/bison/tatankagram.py from the 3DRT bison model. Each point is 10 bytes:
   its place (three unsigned 16-bit numbers, -1 to 1 across the frame, z toward the viewer), the coat's tone there, a
   size, and the way the surface faces (two bytes, octahedral).

   The drawing: WebGL 2, one draw of points per pass. Every bead's whole path is worked out on the graphics card from
   one loop clock, so nothing is moved bead by bead in script. Each bead is shaded as a small sphere under one key
   light, and the beads cast shadows on each other: before each frame they are drawn once from the light into a depth
   map, and every bead looks itself up in it. When the animal has formed, the surface's own facing shades it too, so
   the form reads under the light as it turns. */
(() => {
  'use strict';
  const canvas = document.getElementById('view');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // ---- the settings: every one a fader with a typed number beside it ----
  const GROUPS = [
    ['Loop', [
      ['gather', 'Gather', 0.6, 4, 0.05, 1.8, 's', 'How long the beads take to rise into the animal'],
      ['hold', 'Hold', 0.5, 12, 0.1, 4, 's', 'How long the animal stands before the wind takes it'],
      ['release', 'Blow away', 0.6, 5, 0.05, 2.4, 's', 'How long the wind takes to carry it off'],
      ['dust', 'In the dust', 0.3, 5, 0.05, 1.2, 's', 'How long the beads ride the ring between animals'],
      ['swirl', 'Dust speed', 0, 3, 0.05, 1, '×', 'How fast the shape between animals moves (the orbits keep their own speeds, below)'],
    ]],
    ['Beads', [
      ['bead', 'Bead size', 35, 180, 1, 115, '%', ''],
      ['beads', 'Number of beads', 2000, 60000, 500, 30000, '', 'How many beads make the animal'],
      ['density', 'Density', 0, 1, 0.01, 0.7, '', 'How close the beads keep to the skin: 1 packed on it, lower standing out in the coat and scattering'],
      ['contrast', 'Coat contrast', 0.4, 2.5, 0.01, 1.1, '', 'How far apart the dark and pale parts of the coat sit'],
      ['shade', 'Shadows', 0, 1, 0.01, 0.7, '', 'How dark the beads in another bead’s shadow go'],
    ]],
    ['Forming the head', [
      ['gx1', 'Start handle, time', 0, 1, 0.01, 0.42, '', 'The curve’s first handle: how far along the time it reaches'],
      ['gy1', 'Start handle, progress', -0.6, 1.6, 0.01, 0, '', 'Below 0, the beads first pull back the other way'],
      ['gx2', 'End handle, time', 0, 1, 0.01, 0.58, '', ''],
      ['gy2', 'End handle, progress', -0.6, 1.6, 0.01, 1, '', 'Above 1, the beads overshoot their place and come back'],
    ]],
    ['Forming the shape', [
      ['rx1', 'Start handle, time', 0, 1, 0.01, 0.11, '', ''],
      ['ry1', 'Start handle, progress', -0.6, 1.6, 0.01, 0, '', 'Below 0, the beads first pull back the other way'],
      ['rx2', 'End handle, time', 0, 1, 0.01, 0.5, '', ''],
      ['ry2', 'End handle, progress', -0.6, 1.6, 0.01, 0, '', 'Above 1, the beads overshoot their place and come back'],
      ['bounce', 'Landing bounce', 0, 0.3, 0.005, 0.07, '', 'How far past its place a bead is carried as it lands'],
    ]],
    ['Orbits', [
      ['ring1Spin', 'Inner ring: spin', -180, 180, 1, 83, '°/s', 'How fast the beads run round this ring; negative the other way'],
      ['ring1Tumble', 'Inner ring: tumble', -60, 60, 0.5, 8, '°/s', 'How fast this ring turns over about its own diameter; negative the other way, 0 holds its tilt'],
      ['ring1Tilt', 'Inner ring: starting tilt', -90, 90, 1, 20, '°', 'How far this ring is tipped from lying flat, when the head lets go'],
      ['ring1Turn', 'Inner ring: starting turn', -180, 180, 1, 0, '°', 'Which way this ring faces round the vertical, when the head lets go'],
      ['ring2Spin', 'Middle ring: spin', -180, 180, 1, 57, '°/s', 'How fast the beads run round this ring; negative the other way'],
      ['ring2Tumble', 'Middle ring: tumble', -60, 60, 0.5, -6, '°/s', 'How fast this ring turns over about its own diameter; negative the other way, 0 holds its tilt'],
      ['ring2Tilt', 'Middle ring: starting tilt', -90, 90, 1, 60, '°', 'How far this ring is tipped from lying flat, when the head lets go'],
      ['ring2Turn', 'Middle ring: starting turn', -180, 180, 1, 120, '°', 'Which way this ring faces round the vertical, when the head lets go'],
      ['ring3Spin', 'Outer ring: spin', -180, 180, 1, 41, '°/s', 'How fast the beads run round this ring; negative the other way'],
      ['ring3Tumble', 'Outer ring: tumble', -60, 60, 0.5, 4.5, '°/s', 'How fast this ring turns over about its own diameter; negative the other way, 0 holds its tilt'],
      ['ring3Tilt', 'Outer ring: starting tilt', -90, 90, 1, 36, '°', 'How far this ring is tipped from lying flat, when the head lets go'],
      ['ring3Turn', 'Outer ring: starting turn', -180, 180, 1, -114, '°', 'Which way this ring faces round the vertical, when the head lets go'],
    ]],
    ['Camera', [
      ['turn', 'Turn', -180, 180, 1, 20, '°', 'Round the animal: 0 is straight on, positive brings its left side (on the viewer’s right) forward'],
      ['tilt', 'Tilt', -80, 80, 1, 12, '°', 'Where the camera starts: negative looks down on it from above, positive up from below'],
      ['sweepLead', 'Tilt lead', 0, 3, 0.05, 0.5, 's', 'How long before each head is fully assembled it starts to tilt'],
      ['tiltTo', 'Tilt by the release', -80, 80, 1, -16, '°', 'The heads alternate: the first tips from Tilt to this, the next back to Tilt, and so on. Each keeps its angle as it falls away, and the next forms there'],
      ['spin', 'Rotation speed', -30, 30, 0.5, 4, '°/s', 'The whole scene turning slowly about the vertical: negative turns it the other way, 0 holds it still'],
      ['spinSway', 'Sway', 0, 1, 0.01, 0, '', '0 turns all the way round; above 0 the turn swings back and forth instead, by this much of a half turn'],
    ]],
    ['Light', [
      ['azimuth', 'Light angle', -180, 180, 1, -62, '°', 'Round the animal: 0 is from the viewer, negative from the left'],
      ['elevation', 'Light height', 5, 85, 1, 34, '°', ''],
    ]],
    ['Light sweep', [
      ['sweepFront', 'Angle in front', -90, 90, 1, -25, '°', 'Where the light is as it passes in front of the head, in the middle of the hold: 0 straight from the viewer, negative from the left'],
      ['sweepTurns', 'Turns', -3, 3, 0.05, 1, '', 'Laps of the light round the head per head and per rings: 1 a full circle, left to right; negative the other way'],
      ['sweepEase', 'Linger in front', 0, 0.95, 0.01, 0.6, '', 'How much the light slows as it passes in front of the head (and hurries round the back): 0 an even pace'],
      ['sweepArc', 'Rise behind', -40, 60, 1, 0, '°', 'How much higher the light passes behind the head; negative lower'],
    ]],
  ];
  const set = {};
  GROUPS.forEach(([, rows]) => rows.forEach(r => { set[r[0]] = r[5]; }));

  // the loop's timings, from the settings
  const timing = () => {
    const g0 = set.dust, hold0 = g0 + set.gather * 1.55, rel0 = hold0 + set.hold;
    return { gatherAt: g0, releaseAt: rel0, duration: rel0 + set.release * 1.6 };   // the last bead lets go at 0.75 and falls for 0.75
  };

  // ---- the panel ----
  const groupsEl = document.getElementById('groups');
  const rowsById = {}, cellsByTitle = {};
  for (const [title, rows] of GROUPS) {
    const panel = document.createElement('div');
    panel.className = 'm-panel m-panel--col m-panel--flat';
    const cell = document.createElement('div');
    cell.className = 'm-cell group';
    cell.innerHTML = `<h2 class="m-legend m-legend--lg">${title}</h2>`;
    cellsByTitle[title] = cell;
    for (const [id, label, min, max, step, start, unit, note] of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<label class="m-legend" for="f-${id}">${label}${unit && unit !== '×' ? ` (${unit})` : ''}</label>
        <input class="m-fader" type="range" id="f-${id}" min="${min}" max="${max}" step="${step}" value="${start}"${note ? ` title="${note}"` : ''}>
        <input class="m-input row__num" type="number" min="${min}" max="${max}" step="${step}" value="${start}" aria-label="${label}, typed">
        <button class="row__reset" type="button" hidden aria-label="Reset ${label}">Reset</button>`;
      const fader = row.querySelector('.m-fader'), num = row.querySelector('.row__num'), reset = row.querySelector('.row__reset');
      const apply = (v, from) => {
        set[id] = v;
        if (from !== 'fader') fader.value = v;          // the fader shows the nearest step; the number keeps what was typed
        if (from !== 'number') num.value = +(+v).toFixed(4);
        const changed = Math.abs(v - start) > 1e-9;
        row.classList.toggle('is-changed', changed); reset.hidden = !changed;
        changedSetting(id);
      };
      fader.addEventListener('input', () => apply(Number(fader.value), 'fader'));
      num.addEventListener('input', () => { const v = num.valueAsNumber; if (Number.isFinite(v) && v >= min && v <= max) apply(v, 'number'); });
      num.addEventListener('change', () => { const v = num.valueAsNumber; apply(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : set[id]); });
      reset.addEventListener('click', () => apply(start));
      rowsById[id] = { apply, start };
      cell.append(row);
    }
    panel.append(cell);
    groupsEl.append(panel);
  }
  // ---- easing: each animation a cubic Bézier, as in CSS (time and progress of the two handles), with presets and
  // a drawing of the curve. Each bead runs the curve over its own stretch of the gather or the fall ----
  const EASES = [
    ['Linear', [0, 0, 1, 1]], ['Ease', [0.25, 0.1, 0.25, 1]], ['Ease in', [0.42, 0, 1, 1]], ['Ease out', [0, 0, 0.58, 1]],
    ['Ease in and out', [0.42, 0, 0.58, 1]], ['Gravity (from rest)', [0.11, 0, 0.5, 0]], ['Heavy fall', [0.55, 0, 1, 0.45]],
    ['Settle (fast, then slow)', [0.16, 1, 0.3, 1]], ['Overshoot', [0.34, 1.56, 0.64, 1]], ['Anticipate (pull back first)', [0.36, 0, 0.66, -0.56]],
    ['Anticipate and overshoot', [0.68, -0.6, 0.32, 1.6]],
  ];
  const easeUI = {};
  for (const [title, pre] of [['Forming the head', 'g'], ['Forming the shape', 'r']]) {
    const cell = cellsByTitle[title], ids = ['x1', 'y1', 'x2', 'y2'].map(k => pre + k);
    const box = document.createElement('div');
    box.className = 'ease';
    box.innerHTML = `<svg class="ease__curve" viewBox="-0.08 -0.68 1.16 2.36" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="-0.6" width="1" height="2.2" class="ease__field"/><line x1="0" x2="1" y1="0" y2="0" class="ease__rule"/><line x1="0" x2="1" y1="1" y2="1" class="ease__rule"/>
        <line class="ease__arm"/><line class="ease__arm"/><path class="ease__path"/><line class="ease__dot"/><line class="ease__dot"/></svg>
      <label class="m-legend" for="ease-${pre}">Easing</label>
      <select class="m-input" id="ease-${pre}">${EASES.map(([name], i) => `<option value="${i}">${name}</option>`).join('')}<option value="custom" disabled>Custom</option></select>`;
    cell.querySelector('h2').after(box);
    const select = box.querySelector('select');
    select.addEventListener('change', () => EASES[select.value][1].forEach((v, i) => rowsById[ids[i]].apply(v)));
    easeUI[pre] = { box, select, ids };
  }
  function showEase(pre) {
    const ui = easeUI[pre]; if (!ui) return;
    const [x1, y1, x2, y2] = ui.ids.map(id => set[id]), Y = v => 1 - v;   // drawn with progress upward
    ui.box.querySelector('.ease__path').setAttribute('d', `M0 1 C${x1} ${Y(y1)} ${x2} ${Y(y2)} 1 0`);
    const [a1, a2] = ui.box.querySelectorAll('.ease__arm'), [d1, d2] = ui.box.querySelectorAll('.ease__dot');
    Object.entries({ x1: 0, y1: 1, x2: x1, y2: Y(y1) }).forEach(([k, v]) => a1.setAttribute(k, v));
    Object.entries({ x1: 1, y1: 0, x2: x2, y2: Y(y2) }).forEach(([k, v]) => a2.setAttribute(k, v));
    [[d1, x1, Y(y1)], [d2, x2, Y(y2)]].forEach(([d, x, y]) => { d.setAttribute('x1', x); d.setAttribute('x2', x); d.setAttribute('y1', y); d.setAttribute('y2', y); });
    const at = EASES.findIndex(([, c]) => c.every((v, i) => Math.abs(v - [x1, y1, x2, y2][i]) < 1e-6));
    ui.select.value = at < 0 ? 'custom' : String(at);
  }
  showEase('g'); showEase('r');

  // the sweep key: whether the light sweeps across the animal as it stands
  set.sun = true;
  const sunKey = document.createElement('div');
  sunKey.className = 'keys';
  sunKey.innerHTML = '<button class="m-key" type="button" id="sun" aria-pressed="true"><span class="m-led" aria-hidden="true"></span>Light circles the head</button>';
  cellsByTitle['Light sweep'].querySelector('h2').after(sunKey);
  function setSun(on) { set.sun = on; document.getElementById('sun').setAttribute('aria-pressed', String(on)); if (typeof wake === 'function') wake(); }
  document.getElementById('sun').addEventListener('click', () => setSun(!set.sun));

  // the shape the beads keep between animals
  const SHAPES = [['ring', 'Smoke ring'], ['devil', 'Dust devil'], ['nebula', 'Nebula'], ['flock', 'Murmuration'],
    ['galaxy', 'Galaxy'], ['prairie', 'Prairie grass'], ['orbits', 'Orbits'], ['globe', 'Globe']];
  set.form = 'orbits';   // the beads start in their orbits
  let shapeFrom = 0, shapeTo = 0, shapeMix = 1;
  const formPick = document.getElementById('form');
  formPick.innerHTML = SHAPES.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  function setShape(id, instant) {
    const k = Math.max(0, SHAPES.findIndex(([x]) => x === id));
    set.form = SHAPES[k][0]; formPick.value = set.form;
    if (instant) { shapeFrom = shapeTo = k; shapeMix = 1; }
    else if (k !== shapeTo) {
      shapeFrom = shapeMix < 0.5 ? shapeFrom : shapeTo;   // caught mid-change: from whichever it was nearer
      shapeTo = k; shapeMix = 0;
    }
    if (typeof wake === 'function') wake();
  }
  formPick.addEventListener('change', () => setShape(formPick.value));

  // the beads' material and colour
  const MATERIALS = [['metal', 'Brushed metal'], ['chrome', 'Chrome'], ['glass', 'Glass'], ['pearl', 'Pearl'], ['clay', 'Clay'], ['plastic', 'Plastic']];
  const COLOR_MODES = [['coat', 'The coat’s own colours'], ['one', 'One colour'], ['two', 'Dark to pale']];
  Object.assign(set, { material: 'metal', colorMode: 'one', pale: '#efd2b8', dark: '#3a2418' });
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const pick = (id, options) => { const el = document.getElementById(id); el.innerHTML = options.map(([v, name]) => `<option value="${v}">${name}</option>`).join(''); return el; };
  const matPick = pick('material', MATERIALS), modePick = pick('color-mode', COLOR_MODES);
  const palePick = document.getElementById('pale'), darkPick = document.getElementById('dark');
  function setLook(key, value) {
    set[key] = value;
    matPick.value = set.material; modePick.value = set.colorMode; palePick.value = set.pale; darkPick.value = set.dark;
    document.getElementById('pale-row').hidden = set.colorMode === 'coat';
    document.getElementById('dark-row').hidden = set.colorMode !== 'two';
    document.getElementById('pale-label').textContent = set.colorMode === 'two' ? 'Pale' : 'Colour';
    if (typeof wake === 'function') wake();
  }
  matPick.addEventListener('change', () => setLook('material', matPick.value));
  modePick.addEventListener('change', () => setLook('colorMode', modePick.value));
  palePick.addEventListener('input', () => setLook('pale', palePick.value));
  darkPick.addEventListener('input', () => setLook('dark', darkPick.value));

  const DEFAULTS = { ...set };
  const KEYS = Object.keys(DEFAULTS);
  function loadConfig(config, instant) {
    for (const id of Object.keys(rowsById)) rowsById[id].apply(config[id] ?? DEFAULTS[id]);
    setShape(config.form ?? DEFAULTS.form, instant);
    for (const key of ['material', 'colorMode', 'pale', 'dark']) setLook(key, config[key] ?? DEFAULTS[key]);
    setSun(config.sun ?? DEFAULTS.sun);
  }
  document.getElementById('reset-all').addEventListener('click', () => loadConfig({}));

  // ---- saved versions: kept in versions.js, written by the local server (tools/lab-server.mjs) ----
  const $ = id => document.getElementById(id);
  let store = JSON.parse(JSON.stringify(window.TATANKAGRAM_VERSIONS || { active: 'original', versions: [{ id: 'original', name: 'Original', savedAt: null, config: {} }] }));
  const say = text => { $('status').textContent = text; };
  const differs = () => Object.fromEntries(KEYS.filter(k => set[k] !== DEFAULTS[k]).map(k => [k, set[k]]));   // a version keeps only what differs
  function list(selected) {
    $('versions').innerHTML = store.versions.map(v => `<option value="${v.id}">${v.name.replace(/[<&]/g, '')}${v.id === store.active ? ' · opens with' : ''}</option>`).join('');
    $('versions').value = selected || store.active;
  }
  async function write(message) {
    try {
      const res = await fetch('/__lab/tatankagram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store) });
      say(res.ok ? message : `Not saved: ${await res.text()}`);
      return res.ok;
    } catch (err) { say('Not saved: saving only works on the local server (dvs).'); return false; }
  }
  $('versions').addEventListener('change', () => {
    const v = store.versions.find(x => x.id === $('versions').value);
    loadConfig(v.config); say(`Loaded “${v.name}”.`);
  });
  $('save').addEventListener('click', async () => {
    const name = $('name').value.trim() || `Version ${store.versions.length}`;
    const at = store.versions.find(v => v.name === name && v.id !== 'original');   // the same name overwrites
    const v = at || { id: Date.now().toString(36), name };
    v.savedAt = new Date().toISOString(); v.config = differs();
    if (!at) store.versions.push(v);
    list(v.id); $('name').value = '';
    await write(`Saved “${name}”. Press “Open with this” to make it the one the experiment opens with.`);
  });
  $('use').addEventListener('click', async () => {
    store.active = $('versions').value; list(store.active);
    await write(`The experiment now opens with “${store.versions.find(v => v.id === store.active).name}”.`);
  });
  $('remove').addEventListener('click', async () => {
    const id = $('versions').value;
    if (id === 'original') return say('The original stays.');
    if (id === store.active) return say('The experiment opens with that one. Choose another to open with first.');
    store.versions = store.versions.filter(v => v.id !== id); list();
    await write('Deleted.');
  });
  list();

  // ---- WebGL ----
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) { document.getElementById('fail').hidden = false; canvas.hidden = true; return; }

  const SHADOW = 2048;
  const vs = `#version 300 es
    precision highp float;
    in vec3 aTarget; in vec2 aFinish; in vec3 aNormal; in vec4 aSeed; in vec3 aColor; in float aLift; in float aLoose;
    uniform float uClock, uFlow, uGatherAt, uGather, uReleaseAt, uRelease, uCount, uShapeMix, uFlowRel;
    uniform int uShape, uShapeFrom;
    uniform float uSide, uBead, uShadowRes;
    uniform vec2 uView, uOrbit;
    uniform float uHeadTilt;
    uniform vec3 uCam, uLight;
    uniform float uDensity;
    uniform bool uShadowPass;
    out float vTone, vBlend, vSurf, vDust;
    out vec3 vCoat;
    out float vFade;
    out vec3 vShadow;
    const float TAU = 6.2831853, PI = 3.14159265;
    uniform vec3 RING_R, RING_TILT, RING_YAW, RING_W;
    uniform vec2 RING_SPLIT;
    uniform vec3 RING_SPUN, RING_TUMBLED;   // radians, since the head let go
    uniform vec4 uEaseG, uEaseR;
    uniform float uBounce;
    // a cubic Bézier easing, as CSS has it: c is the two handles (x1, y1, x2, y2). Finds the curve's parameter for the
    // time x (halving, then Newton to finish), and returns the progress there
    float ease(float x, vec4 c) {
      x = clamp(x, 0.0, 1.0);
      float lo = 0.0, hi = 1.0, t = x;
      for (int i = 0; i < 10; i++) {
        t = 0.5 * (lo + hi);
        float it = 1.0 - t, xt = 3.0 * it * it * t * c.x + 3.0 * it * t * t * c.z + t * t * t;
        if (xt < x) lo = t; else hi = t;
      }
      for (int i = 0; i < 2; i++) {
        float it = 1.0 - t, xt = 3.0 * it * it * t * c.x + 3.0 * it * t * t * c.z + t * t * t;
        float dx = 3.0 * it * it * c.x + 6.0 * it * t * (c.z - c.x) + 3.0 * t * t * (1.0 - c.z);
        if (abs(dx) > 1e-4) t = clamp(t - (xt - x) / dx, 0.0, 1.0);
      }
      float it = 1.0 - t;
      return 3.0 * it * it * t * c.y + 3.0 * it * t * t * c.w + t * t * t;
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

    // The shapes the beads keep between animals. 0, the smoke ring: a ring lying low on the ground, turning about the vertical, its beads rolling round its tube as smoke
    // does in a smoke ring. Each bead keeps its own place on the ring and its own pace (its seed).
    vec3 dust(vec4 s, float t) {
      float around = TAU * s.x + t * (0.32 + 0.22 * s.z);
      float roll = TAU * s.y + t * (1.0 + 0.7 * s.w);
      float tube = 0.03 + 0.13 * sqrt(s.w);
      float ring = 0.8 + 0.08 * sin(3.0 * around + 0.5 * t);
      float out_ = ring + tube * cos(roll);
      vec3 p = vec3(out_ * cos(around), tube * sin(roll) * 1.4 + 0.05 * sin(2.0 * around + t), out_ * sin(around));
      p.yz = rot(0.42) * p.yz;            // tipped toward the viewer, so the ring reads as a ring
      return p + vec3(0.0, -0.62, 0.0);
    }

    // 1 Dust devil: a column of beads twisting up from the ground, wider at the top, faster near the bottom, its
    // middle wandering as a real one does
    vec3 devil(vec4 s, float t) {
      float h = s.y, y = -0.9 + 1.75 * h;
      float r = 0.06 + 0.42 * h * h + 0.05 * s.w;
      float a = TAU * s.x + t * (2.2 - 1.4 * h);
      vec2 c = vec2(0.12 * sin(1.7 * y + 0.6 * t), 0.08 * cos(1.3 * y + 0.5 * t));
      return vec3(c.x + r * cos(a), y, c.y + r * sin(a));
    }
    // 2 Nebula: a ball of gas, densest in the middle, slowly folding in on itself
    vec3 nebula(vec4 s, float t) {
      float r = 0.82 * pow(s.w, 0.45), th = TAU * s.x + 0.15 * t * (0.5 + s.z), ph = acos(2.0 * s.y - 1.0);
      vec3 p = r * vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
      p += 0.12 * vec3(sin(2.1 * p.y + 0.7 * t), sin(1.9 * p.z + 0.5 * t + 1.0), sin(2.3 * p.x + 0.6 * t + 2.0));
      p.y *= 0.85;
      return p;
    }
    // 3 Murmuration: a thin sheet, as starlings make, folding over itself as it drifts
    vec3 flock(vec4 s, float t) {
      float u = s.x * 2.0 - 1.0, v = s.y * 2.0 - 1.0;
      vec3 p = vec3(u * 0.9, 0.28 * sin(2.4 * u + 0.9 * t) + 0.18 * sin(3.1 * v - 0.7 * t), v * 0.45);
      p.xz = rot(0.6 * sin(0.3 * t) + 0.5 * u * sin(0.5 * t)) * p.xz;
      p.xy = rot(0.35 * sin(0.4 * t + u)) * p.xy;
      return p + vec3(0.18 * sin(0.35 * t), 0.12 * sin(0.7 * t), 0.0) + (s.zww - 0.5) * vec3(0.04, 0.05, 0.04);
    }
    // 4 Galaxy: a thin disc with two spiral arms, turning
    vec3 galaxy(vec4 s, float t) {
      float r = 0.06 + 0.92 * pow(s.w, 0.7), arm = floor(s.y * 2.0);
      float a = arm * PI + 3.2 * log(r + 0.08) + (s.z - 0.5) * (0.9 - 0.5 * r) + 0.35 * t;
      vec3 p = vec3(r * cos(a), (s.x - 0.5) * 0.08 * (1.0 - r), r * sin(a));
      p.yz = rot(0.5) * p.yz;
      return p;
    }
    // 5 Prairie grass: a field of beads low on the ground, gusts of wind running across it
    vec3 prairie(vec4 s, float t) {
      float x = s.x * 2.2 - 1.1, z = s.y * 1.2 - 0.6, blade = s.w * 0.14;
      float gust = sin(3.0 * x - 1.6 * t + 1.5 * sin(1.3 * z)) * 0.5 + 0.5;
      vec3 p = vec3(x + blade * gust * 0.8, -0.82 + blade * (1.0 - 0.4 * gust), z);
      p.yz = rot(0.35) * p.yz;
      return p;
    }
    // 6 Orbits: three rings, one inside the next round the same centre (so they never cross), each tipped its own way
    // and turning at its own pace, the inner fastest, as orbits do. Which ring a bead keeps is its distance from the
    // animal's middle, and its place on the ring the point nearest where it sat in the animal, evened out round the
    // ring (aSeed.y and aSeed.x: see load()). At the moment the animal lets go (uFlowRel) every bead's place is right
    // there, so each falls the shortest way to its own orbit.
    vec3 orbits(vec4 s, float t) {
      int k = s.y < RING_SPLIT.x ? 0 : (s.y < RING_SPLIT.y ? 1 : 2);
      // how far each ring has spun and tumbled since the head let go, added up frame by frame at the faders' speeds
      // (so a new speed changes how it goes on, never where it is), whatever the Dust speed. Asked where they were at
      // that moment (t is uFlowRel), none
      bool atRelease = t == uFlowRel;
      float a = TAU * s.x + (atRelease ? 0.0 : RING_SPUN[k]);
      float r = RING_R[k] + (s.w - 0.5) * 0.035;
      vec3 p = vec3(r * cos(a), (s.z - 0.5) * 0.022, r * sin(a));
      p.yz = rot(RING_TILT[k] + (atRelease ? 0.0 : RING_TUMBLED[k])) * p.yz;   // tumbling: the ring turning over as it spins
      p.xz = rot(RING_YAW[k]) * p.xz;
      return p;
    }
    // 7 Globe: an even sphere (each bead a golden angle round from the last), turning
    vec3 globe(float t) {
      float n = float(gl_VertexID), y = 1.0 - 2.0 * (n + 0.5) / uCount;
      float r = sqrt(max(0.0, 1.0 - y * y)), a = n * 2.39996323 + 0.3 * t;
      return 0.72 * vec3(r * cos(a), y, r * sin(a));
    }
    vec3 shape(int k, vec4 s, float t, vec3 home) {
      if (k == 1) return devil(s, t);
      if (k == 2) return nebula(s, t);
      if (k == 3) return flock(s, t);
      if (k == 4) return galaxy(s, t);
      if (k == 5) return prairie(s, t);
      if (k == 6) return orbits(s, t);
      if (k == 7) return globe(t);
      return dust(s, t);
    }

    void main() {
      // density: how close the beads keep to the skin. Packed, they lie on it; looser, they stand out in the coat by
      // their own lift (more in the shag) and scatter a little round it
      float loose = 1.0 - uDensity;
      vec3 target = aTarget + aNormal * aLift * 0.1 * loose * 3.3 + (aSeed.xyz - 0.5) * 0.09 * loose * loose;
      vec3 swarm = mix(shape(uShapeFrom, aSeed, uFlow, target), shape(uShape, aSeed, uFlow, target), uShapeMix);   // a change of shape crossfades
      // rising: the hooves first, the hump last, each bead a little early or late
      float up = aTarget.y * 0.5 + 0.5;
      float g0 = uGatherAt + uGather * (0.62 * up + 0.38 * aSeed.w);
      float g = ease((uClock - g0) / (uGather * 0.55), uEaseG);
      // letting go: gravity, not wind. The beads nearest their place in the shape feel its pull first and go first;
      // each starts from rest and falls faster and faster (the distance goes as the square of the time), chasing its
      // place as it turns, so it swings in along the orbit rather than straight at it, and lands with a small bounce
      vec3 slot0 = mix(shape(uShapeFrom, aSeed, uFlowRel, target), shape(uShape, aSeed, uFlowRel, target), uShapeMix);
      float far = clamp(length(slot0 - target) / 1.3, 0.0, 1.0);
      float r0 = uReleaseAt + uRelease * (0.5 * far + 0.25 * aSeed.z);
      float fall = uRelease * (0.45 + 0.3 * far);                   // the farther to fall, the longer it takes
      float lin = clamp((uClock - r0) / fall, 0.0, 1.0);
      float r = ease(lin, uEaseR);
      float b = g * (1.0 - r);
      // the head's own tilt, about the screen's level axis as the camera now stands, so it reads as the camera tilting,
      // though only the animal moves
      vec3 hn = aNormal;
      target.xz = rot(-uOrbit.x) * target.xz; hn.xz = rot(-uOrbit.x) * hn.xz;   // into the camera's turn,
      target.yz = rot(uHeadTilt) * target.yz; hn.yz = rot(uHeadTilt) * hn.yz;   // tipped as a camera tilt would,
      target.xz = rot(uOrbit.x) * target.xz;  hn.xz = rot(uOrbit.x) * hn.xz;    // and back
      vec3 p = mix(swarm, target, b);
      float rise = sin(PI * g) * (1.0 - r);
      p.xz = rot(rise * (0.4 + 0.9 * aSeed.z)) * p.xz;              // swept round as they rise, like a dust devil
      p.y += rise * 0.16 * (aSeed.x - 0.3);
      // the neck's loose trail: its beads drift, slowly and each its own way, the further out the more
      p += b * aLoose * (0.03 + 0.09 * aLoose) * vec3(sin(0.5 * uClock + TAU * aSeed.x), 0.6 * sin(0.4 * uClock + TAU * aSeed.y), sin(0.45 * uClock + TAU * aSeed.w));
      float since = uClock - r0 - fall;                             // landed: carried a little past, and back
      if (since > 0.0 && g > 0.5) p += (swarm - target) * uBounce * sin(since * 11.0) * exp(-since * 5.0);

      vec3 n = hn;
      p.xz = rot(-uOrbit.x) * p.xz;     n.xz = rot(-uOrbit.x) * n.xz;
      p.yz = rot(uOrbit.y) * p.yz;      n.yz = rot(uOrbit.y) * n.yz;

      // the light's own view, for the shadow map
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), uLight));
      vec3 lup = cross(uLight, right);
      vec3 ls = vec3(dot(p, right), dot(p, lup), -dot(p, uLight)) / 1.7;
      vShadow = ls * 0.5 + 0.5;
      float size = (0.0085 + 0.0075 * aFinish.y) * uBead * (1.0 - 0.45 * aLoose * b);
      if (uShadowPass) {
        gl_Position = vec4(ls, 1.0);
        gl_PointSize = max(1.0, size / 1.7 * uShadowRes * 0.5);
      } else {
        float near = 1.0 / (1.0 - 0.22 * p.z);                     // a little perspective: what is nearer is a little larger
        gl_Position = vec4((p.xy * near * uCam.x + uCam.yz) * uSide / uView, clamp(-p.z * 0.45, -0.99, 0.99), 1.0);
        gl_PointSize = max(1.0, size * near * uSide * 0.5 * uCam.x);
      }
      vBlend = b;
      vSurf = max(0.0, dot(normalize(n), uLight));
      vTone = mix(0.32 + 0.25 * aSeed.z, aFinish.x, b);
      vDust = 1.0 - b;
      vCoat = aColor;
      vFade = 1.0 - 0.75 * aLoose * b;                              // the trail dims as it goes off
    }`;
  const fs = `#version 300 es
    precision highp float;
    in float vTone, vBlend, vSurf, vDust;
    in vec3 vShadow, vCoat;
    in float vFade;
    uniform bool uShadowPass;
    uniform highp sampler2D uShadowMap;
    uniform float uShadowRes, uShade, uContrast, uSun;
    uniform int uColorMode, uMat;
    uniform vec3 uLight, uPale, uDark;
    out vec4 color;
    float blocked(vec2 o) {
      float near = texture(uShadowMap, vShadow.xy + o / uShadowRes).r;
      return smoothstep(0.002, 0.008, vShadow.z - near);
    }
    void main() {
      vec2 q = gl_PointCoord * 2.0 - 1.0;
      float r2 = dot(q, q);
      if (r2 > 1.0) discard;
      if (uShadowPass) { color = vec4(0.0); return; }
      float sh = (blocked(vec2(-1.2, -0.5)) + blocked(vec2(0.6, -1.3)) + blocked(vec2(1.2, 0.7)) + blocked(vec2(-0.7, 1.3))) * 0.25;
      vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r2));                  // the bead's own round face
      vec3 L = uLight, V = vec3(0.0, 0.0, 1.0), H = normalize(L + V);
      float ndl = max(0.0, dot(n, L)), ndh = max(0.0, dot(n, H)), fres = pow(1.0 - n.z, 3.0);
      float form = mix(1.0, 0.12 + 1.05 * vSurf, vBlend);        // the animal's surface, once it has formed
      float light = 1.0 - uShade * mix(0.55, 1.0, vBlend) * sh;
      float tone = 0.14 + 0.86 * pow(clamp(vTone, 0.0, 1.0), uContrast);
      float k = form * light;

      // the colour: the coat's own (its hue at the bead's tone), one colour at the bead's tone, or dark to pale by tone
      vec3 base;
      if (uColorMode == 0) {
        // the coat's hue at the bead's tone. The texture's near-black spots keep only a stray channel or two, (21, 0, 21)
        // say, which scaled up would read as pink or lilac: so the darker the sample the more it goes neutral, and no
        // hue is let past the saturation the coat itself has (its 99th percentile is about 0.2)
        vec3 W = vec3(0.2126, 0.7152, 0.0722);
        float l = dot(vCoat, W);
        vec3 hue = mix(vec3(1.0), vCoat / max(l, 0.03), smoothstep(0.05, 0.22, l));
        float hi = max(hue.r, max(hue.g, hue.b)), sat = (hi - min(hue.r, min(hue.g, hue.b))) / max(hi, 1e-3);
        if (sat > 0.22) { float g = dot(hue, W); hue = vec3(g) + (hue - vec3(g)) * (0.22 / sat); }
        hue.b = min(hue.b, hue.g);                                   // and never cooler than neutral: a bison is brown, not mauve
        base = clamp(hue * tone, 0.0, 1.4);
      }
      else if (uColorMode == 1) base = uPale * tone;
      else base = mix(uDark, uPale, tone);
      vec3 tint = base / max(max(base.r, max(base.g, base.b)), 0.05);

      // what a polished bead reflects: a dark ground, a pale sky above, a bright band at the horizon
      vec3 R = reflect(-V, n);
      vec3 env = mix(vec3(0.02, 0.03, 0.05), vec3(0.82, 0.86, 0.92), smoothstep(-0.3, 0.7, R.y)) + 0.3 * exp(-pow((R.y - 0.05) * 9.0, 2.0));

      vec3 c;
      if (uMat == 1) {          // chrome: a mirror, tinted by its colour, the form only in what it reflects
        c = env * tint * (0.45 + 0.55 * tone) * (0.5 + 0.5 * form) * light + vec3(1.0) * pow(ndh, 90.0) * 1.4 * light;
      } else if (uMat == 2) {   // glass: dark through the middle, the sky at its rim, the light gathered on the far side
        vec2 spot = vec2(-L.x, L.y) * 0.45;
        float caustic = exp(-dot(q - spot, q - spot) * 9.0);
        c = base * 0.45 * k + env * fres * 1.1 * light + base * 2.2 * caustic * (0.4 + 0.6 * form) * light + vec3(1.0) * pow(ndh, 140.0) * 2.0 * light;
      } else if (uMat == 3) {   // pearl: a soft sheen, and colour shifting at the rim
        vec3 rim = mix(vec3(0.6, 0.78, 1.0), vec3(1.0, 0.76, 0.86), q.x * 0.5 + 0.5);
        c = base * (0.5 + 0.65 * (ndl * 0.5 + 0.5)) * k + vec3(0.96, 0.92, 1.0) * pow(ndh, 10.0) * 0.28 * light + rim * fres * 0.4 * light;
      } else if (uMat == 4) {   // clay: unglazed, no shine, the light wrapping a little round the bead
        c = base * (0.22 + 0.95 * max(0.0, (dot(n, L) + 0.35) / 1.35)) * k * 1.15;
      } else if (uMat == 5) {   // plastic: its own colour, and a small sharp white highlight
        c = base * (0.3 + 0.88 * ndl) * k * 1.1 + vec3(1.0) * pow(ndh, 48.0) * 0.7 * light;
      } else {                  // metal: brushed, its colour in its highlight too
        c = base * 1.2 * (0.36 + 0.95 * ndl) * k + mix(vec3(1.0, 0.96, 0.9), tint, 0.35) * pow(ndh, 22.0) * (0.06 + 0.22 * tone) * light;
      }
      c *= mix(1.0, 0.8, vDust);                                  // the dust a little dimmer than the animal
      color = vec4(c * uSun * vFade, 1.0);                                  // dim at dawn and dusk
    }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {};
  for (const name of ['uClock', 'uFlow', 'uGatherAt', 'uGather', 'uReleaseAt', 'uRelease', 'uSide', 'uBead', 'uShadowRes',
    'uView', 'uOrbit', 'uCam', 'uLight', 'uShadowPass', 'uShadowMap', 'uShade', 'uContrast', 'uDensity', 'uColorMode', 'uMat', 'uPale', 'uDark', 'uCount', 'uShape', 'uShapeFrom', 'uShapeMix', 'uFlowRel', 'RING_R', 'RING_TILT', 'RING_YAW', 'RING_W', 'RING_SPLIT', 'uEaseG', 'uEaseR', 'uBounce', 'uSun', 'RING_SPUN', 'RING_TUMBLED', 'uHeadTilt']) U[name] = gl.getUniformLocation(prog, name);

  // the shadow map: depth only, drawn from the light
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW, SHADOW, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const shadowFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.uniform1i(U.uShadowMap, 0);
  gl.uniform1f(U.uShadowRes, SHADOW);
  gl.enable(gl.DEPTH_TEST);

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  let count = 0;
  const sets = {};
  // the orbits' rings: radius, tip, turn, pace, and where the beads' rank by distance splits between them (the
  // larger rings get more beads, so all three look as full)
  // radius and where the beads' rank by distance splits between them are fixed; the rest comes from the Orbits faders
  const RINGS = { r: [0.42, 0.64, 0.87], split: [0.22, 0.55],
    get tilt() { return [1, 2, 3].map(k => set[`ring${k}Tilt`] * Math.PI / 180); },
    get yaw() { return [1, 2, 3].map(k => set[`ring${k}Turn`] * Math.PI / 180); },
    get w() { return [1, 2, 3].map(k => set[`ring${k}Spin`] * Math.PI / 180); } };
  const F = 17, RANGE = 1.8;   // floats per bead in the buffer; the stored positions' reach (tatankagram.py)
  async function load(name) {
    if (sets[name]) return sets[name];
    const bytes = new Uint8Array(await (await fetch(name + '.bin')).arrayBuffer());
    const n = bytes.length / 15, data = new Float32Array(n * F), view = new DataView(bytes.buffer);
    let seed = 1887;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      const o = i * 15, j = i * F;
      for (let k = 0; k < 3; k++) data[j + k] = (view.getUint16(o + k * 2, true) / 65535 * 2 - 1) * RANGE;   // stored from -RANGE to RANGE, so the neck's loose trail can run out past the frame
      data[j + 3] = bytes[o + 6] / 255;
      data[j + 4] = bytes[o + 7] / 255;
      let x = bytes[o + 8] / 255 * 2 - 1, y = bytes[o + 9] / 255 * 2 - 1, z = 1 - Math.abs(x) - Math.abs(y);
      if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * Math.sign(ox || 1); y = (1 - Math.abs(ox)) * Math.sign(y || 1); }
      const len = Math.hypot(x, y, z) || 1;
      data[j + 5] = x / len; data[j + 6] = y / len; data[j + 7] = z / len;
      for (let k = 8; k < 12; k++) data[j + k] = random();
      for (let k = 0; k < 3; k++) data[j + 12 + k] = bytes[o + 10 + k] / 255;   // the coat's colour
      data[j + 15] = bytes[o + 13] / 255;                                        // its lift in the coat
      data[j + 16] = bytes[o + 14] / 255;                                        // how loose: 0 on the animal, 1 far out in the trail
    }
    // aSeed.y becomes each bead's rank by distance from the middle (still even from 0 to 1, so the shapes that
    // treat it as random don't change): the orbits give the inner beads the inner ring
    const order = Array.from({ length: n }, (_, i) => i);
    const dist = i => Math.hypot(data[i * F], data[i * F + 1], data[i * F + 2]);
    const d = Float32Array.from(order, dist);
    order.sort((a, b) => d[a] - d[b]);
    order.forEach((i, rank) => { data[i * F + 9] = (rank + random()) / n; });
    data.order = order;
    placeOnRings(data);
    return (sets[name] = data);
  }
  // aSeed.x becomes each bead's place round its ring: the angle nearest where it sat, in the ring's own plane, then
  // spread evenly round the ring in the same order, and turned so the beads move as little as they can (still even
  // from 0 to 1). Worked out again when a ring's starting tilt or turn changes
  function placeOnRings(data) {
    const order = data.order, tilt = RINGS.tilt, yaw = RINGS.yaw;
    for (let k = 0; k < 3; k++) {
      const lo = k ? RINGS.split[k - 1] : 0, hi = k < 2 ? RINGS.split[k] : 1;
      const ring = order.filter(i => data[i * F + 9] >= lo && data[i * F + 9] < hi);
      const cy = Math.cos(yaw[k]), sy = Math.sin(yaw[k]), ct = Math.cos(tilt[k]), st = Math.sin(tilt[k]);
      const ang = new Map(ring.map(i => {
        const x = data[i * F], y = data[i * F + 1], z = data[i * F + 2];
        const qx = cy * x + sy * z, qz = -sy * x + cy * z;           // undo the ring's turn
        const qz2 = -st * y + ct * qz;                                // and its tip
        return [i, Math.atan2(qz2, qx)];
      }));
      ring.sort((a, b) => ang.get(a) - ang.get(b));
      let cs = 0, sn = 0;
      const even = (rank) => (rank + 0.5) / ring.length * 2 * Math.PI - Math.PI;
      ring.forEach((i, rank) => { const dd = ang.get(i) - even(rank); cs += Math.cos(dd); sn += Math.sin(dd); });
      const shift = Math.atan2(sn, cs);
      ring.forEach((i, rank) => { const a = even(rank) + shift; data[i * F + 8] = ((a / (2 * Math.PI)) % 1 + 1) % 1; });
    }
  }
  function use(data) {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = F * 4;
    for (const [name, size, offset] of [['aTarget', 3, 0], ['aFinish', 2, 3], ['aNormal', 3, 5], ['aSeed', 4, 8], ['aColor', 3, 12], ['aLift', 1, 15], ['aLoose', 1, 16]]) {
      const at = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, size, gl.FLOAT, false, stride, offset * 4);
    }
    count = data.length / F;
    current = data;
  }
  let current = null, replace = 0;
  // a ring's starting tilt or turn changed: place the beads on the rings again (once a frame at most)
  function replaceRings() {
    if (replace || !current) return;
    replace = requestAnimationFrame(() => { replace = 0; for (const d of Object.values(sets)) placeOnRings(d); use(current); wake(); });
  }

  // ---- the clock and the view ----
  // the light's place along a lap (u from 0 to 1). Each lap starts and ends with the light behind the head, at the
  // moments the head starts forming and lets go, and passes in front of it, at the Angle in front and the Light height,
  // lingering there (Linger in front) and hurrying round the back. null: at rest, at the Light angle and height.
  // [angle, height, brightness]
  // front: the point of the lap (0 to 1) at which the light is in front: for the head, the middle of the hold
  const sunAt = (u, front = 0.5) => {
    if (u === null) return [set.azimuth, set.elevation, 1];
    const x = u < front ? (u / front - 1) * 0.5 : (u - front) / (1 - front) * 0.5, g = x - set.sweepEase * Math.sin(2 * Math.PI * x) / (2 * Math.PI);   // slow through x = 0, the front
    const behind = (1 - Math.cos(2 * Math.PI * x)) / 2;                                        // 0 in front, 1 straight behind
    return [set.sweepFront + 360 * set.sweepTurns * g, Math.max(-85, Math.min(85, set.elevation + set.sweepArc * behind)), 1];
  };

  // the scene's slow turn: spinT runs while the loop plays. Full turns, or (with Sway) back and forth
  let spinT = 0;
  let tiltT = 0, tiltNow = null, cycle = 0, wasHolding = false, sweepOn = false, heldT = 0;   // the head's tilt (degrees), how many heads have stood, whether the light has set off   // the camera's tilt as the head is held, degrees
  const spinNow = () => {
    const a = rad(set.spin) * spinT;
    if (!set.spinSway) return a;
    const reach = Math.PI / 2 * set.spinSway;                      // a swing of up to a quarter turn each way
    return reach * Math.sin(a / reach);                            // the same pace through the middle as the full turn
  };
  const sunNow = [set.azimuth, set.elevation, 1];
  const spun = [0, 0, 0], tumbled = [0, 0, 0];   // each ring's spin and tumble since the head let go, radians
  let clock = 0, flow = 0, flowRel = 0, playing = !reduce.matches, last, frame = 0;
  const rad = d => d * Math.PI / 180;
  let subject = 'head';
  const cam = { zoom: 0.9, x: 0, y: 0 };
  const orbit = [rad(set.turn), rad(set.tilt)];   // the camera's turn and tilt, radians; the Starting angle faders set where it starts
  let turning = null;

  const clockFader = document.getElementById('clock'), clockNum = document.getElementById('clock-num');
  const playKey = document.getElementById('play');
  function changedSetting(id) {
    if (/^[gr][xy][12]$/.test(id)) showEase(id[0]);
    if (/^ring\dT(ilt|urn)$/.test(id)) replaceRings();
    // the bison held, or on its way: a new gather or wait moves where it is formed, so the clock goes with it
    if (park && park.form && ['gather', 'dust'].includes(id)) { park.at = formedAt(); if (park.done) clock = park.at; }
    if (park && park.back && id === 'dust') park.at = timing().gatherAt;
    if (id === 'turn' || id === 'tilt') { orbit[0] = rad(set.turn); orbit[1] = rad(set.tilt); }
    if (['gather', 'hold', 'release', 'dust'].includes(id)) {
      const d = timing().duration;
      clockFader.max = clockNum.max = d.toFixed(2);
      clock = Math.min(clock, d);
    }
    wake();
  }
  changedSetting('gather');
  loadConfig((store.versions.find(v => v.id === store.active) || { config: {} }).config, true);   // open with the chosen version

  // The form key: plays the beads into the bison and holds it there, or blows it away into the shape and holds that.
  // park is where the clock is heading and stops: null while the loop runs. While parked the shape keeps moving.
  var park = null;   // var: changedSetting can look at it before this line has run
  const formKey = document.getElementById('form-toggle');
  const formedAt = () => { const t = timing(); return t.gatherAt + set.gather * 1.55; };   // every bead has arrived (the last starts at 1 gather, and takes 0.55)
  const isFormed = () => clock >= formedAt() - 0.02 && clock < timing().releaseAt;
  function showForm() {
    const formed = park ? park.form : isFormed();
    formKey.textContent = formed ? 'Back to the shape' : 'Form the bison';
  }
  formKey.addEventListener('click', () => {
    const t = timing(), toForm = !(park ? park.form : isFormed());
    // the beads stand still through the hold and the wait in the dust, so either can be skipped without a jump
    if (toForm) { if (clock < t.gatherAt) clock = t.gatherAt; park = { form: true, at: formedAt(), done: isFormed() }; }
    else if (clock >= t.gatherAt && clock < formedAt() - 0.02) park = { form: false, back: true, at: t.gatherAt, done: false };   // caught mid-gather: the gather runs backward
    else { if (isFormed()) clock = t.releaseAt; park = { form: false, at: 0, done: clock < t.gatherAt }; }
    if (reduce.matches) { clock = park.at; park.done = true; showClock(); showForm(); setPlaying(false, true); draw(performance.now()); return; }   // no travel: straight there
    showForm(); setPlaying(true, true);
  });
  function setPlaying(on, keepPark) {
    if (!keepPark) { park = null; showForm(); }
    playing = on;
    playKey.textContent = on ? 'Pause' : 'Play';
    playKey.setAttribute('aria-label', on ? 'Pause' : 'Play');
    last = undefined; wake();
  }
  playKey.addEventListener('click', () => setPlaying(!playing));
  // Restart: everything from the very beginning, as the page opens. The loop, the shape's turning, the scene's
  // rotation, the camera's tilt and angle, the light, all back to their starts, and playing
  document.getElementById('replay').addEventListener('click', () => {
    clock = 0; flow = 0; flowRel = 0; spun.fill(0); tumbled.fill(0); spinT = 0; tiltT = 0; tiltNow = set.tilt; cycle = 0; wasHolding = false; sweepOn = false;
    sunNow[0] = set.azimuth; sunNow[1] = set.elevation; sunNow[2] = 1;
    shapeMix = 1; shapeFrom = shapeTo;
    resetView(); showClock(); setPlaying(true);
  });
  const showClock = (from) => {
    if (from !== 'fader') clockFader.value = clock;
    if (from !== 'number') clockNum.value = clock.toFixed(2);
  };
  clockFader.addEventListener('input', () => { clock = Number(clockFader.value); showClock('fader'); setPlaying(false); });
  clockNum.addEventListener('input', () => { const v = clockNum.valueAsNumber; if (Number.isFinite(v) && v >= 0 && v <= +clockNum.max) { clock = v; showClock('number'); setPlaying(false); } });
  clockNum.addEventListener('change', () => { const v = clockNum.valueAsNumber; clock = Number.isFinite(v) ? Math.min(+clockNum.max, Math.max(0, v)) : clock; showClock(); setPlaying(false); });

  async function choose(next) {
    subject = next;
    document.querySelectorAll('[data-subject]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.subject === next)));
    canvas.setAttribute('aria-label', next === 'head' ? 'A bison seen head on, made of thousands of small metal beads' : 'A whole bison seen from the side, made of thousands of small metal beads');
    use(await load(next));
    resetView();
  }
  document.querySelectorAll('[data-subject]').forEach(k => k.addEventListener('click', () => { if (k.dataset.subject !== subject) choose(k.dataset.subject); }));
  function resetView() {
    orbit[0] = rad(set.turn); orbit[1] = rad(set.tilt);
    cam.zoom = 0.9; cam.x = cam.y = 0; spinT = 0;
    wake();
  }
  document.getElementById('reset-view').addEventListener('click', resetView);
  // Start here: the view you've dragged to becomes the starting angle
  document.getElementById('take-view').addEventListener('click', () => {
    const deg = r => r * 180 / Math.PI;
    rowsById.turn.apply(Math.round(((deg(orbit[0] + spinNow()) + 540) % 360) - 180)); spinT = 0;
    rowsById.tilt.apply(Math.round(Math.max(-80, Math.min(80, deg(orbit[1])))));
  });

  // the screen's units: the fitted square's half side is 1, y up
  const fitted = (w, h) => Math.min(w, h * 0.96);
  function point(e) {
    const r = canvas.getBoundingClientRect(), s = 2 / fitted(r.width, r.height);
    return { x: (e.clientX - r.left - r.width / 2) * s, y: (r.top + r.height / 2 - e.clientY) * s, at: performance.now() / 1000 };
  }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 2) return;
    canvas.setPointerCapture(e.pointerId);
    turning = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.classList.add('is-turning');   // any drag turns the animal
    wake();
  });
  canvas.addEventListener('pointermove', e => {
    if (turning && e.pointerId === turning.id) {
      const k = 2 * Math.PI / Math.max(300, Math.min(canvas.clientWidth, canvas.clientHeight));
      orbit[0] = (orbit[0] + (e.clientX - turning.x) * k) % (2 * Math.PI);
      orbit[1] = Math.max(-1.4, Math.min(1.4, orbit[1] + (e.clientY - turning.y) * k));
      turning.x = e.clientX; turning.y = e.clientY;
    }
    wake();
  });
  const end = e => {
    if (turning && e.pointerId === turning.id) { turning = null; canvas.classList.remove('is-turning'); }
    wake();
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
    const p = point(e), z = Math.max(0.5, Math.min(4, cam.zoom * Math.exp(-e.deltaY * unit * 0.002))), k = z / cam.zoom;
    const lim = Math.max(0, z - 0.9);
    cam.x = Math.max(-lim, Math.min(lim, p.x + (cam.x - p.x) * k));
    cam.y = Math.max(-lim, Math.min(lim, p.y + (cam.y - p.y) * k));
    cam.zoom = z; wake();
  }, { passive: false });

  // ---- drawing ----
  function draw(now) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const t = timing();
    const az = sunNow[0] * Math.PI / 180, el = sunNow[1] * Math.PI / 180;
    gl.uniform1f(U.uSun, sunNow[2]);
    gl.uniform3f(U.uLight, Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    gl.uniform1f(U.uClock, clock); gl.uniform1f(U.uFlow, flow);
    { const t = timing(); if (clock >= t.gatherAt + set.gather * 1.55 && clock < t.releaseAt) { flowRel = flow; spun.fill(0); tumbled.fill(0); } }
    gl.uniform3fv(U.RING_SPUN, spun); gl.uniform3fv(U.RING_TUMBLED, tumbled);   // while the animal stands, the shape's beads are hidden: keep their places in step
    gl.uniform1f(U.uFlowRel, flowRel);
    gl.uniform4f(U.uEaseG, set.gx1, set.gy1, set.gx2, set.gy2); gl.uniform4f(U.uEaseR, set.rx1, set.ry1, set.rx2, set.ry2); gl.uniform1f(U.uBounce, set.bounce);
    gl.uniform3fv(U.RING_R, RINGS.r); gl.uniform3fv(U.RING_TILT, RINGS.tilt); gl.uniform3fv(U.RING_YAW, RINGS.yaw); gl.uniform3fv(U.RING_W, RINGS.w); gl.uniform2fv(U.RING_SPLIT, RINGS.split);
    gl.uniform1f(U.uGatherAt, t.gatherAt); gl.uniform1f(U.uGather, set.gather);
    gl.uniform1f(U.uReleaseAt, t.releaseAt); gl.uniform1f(U.uRelease, set.release);
    gl.uniform1f(U.uSide, fitted(w, h)); gl.uniform2f(U.uView, w, h);
    gl.uniform1f(U.uBead, set.bead / 100);
    gl.uniform2f(U.uOrbit, orbit[0] + spinNow(), orbit[1]);
    gl.uniform1f(U.uHeadTilt, rad((tiltNow ?? set.tilt) - set.tilt));
    gl.uniform3f(U.uCam, cam.zoom, cam.x, cam.y);
    gl.uniform1f(U.uShade, set.shade); gl.uniform1f(U.uContrast, set.contrast); gl.uniform1f(U.uDensity, set.density);
    gl.uniform1i(U.uColorMode, COLOR_MODES.findIndex(([id]) => id === set.colorMode)); gl.uniform1i(U.uMat, MATERIALS.findIndex(([id]) => id === set.material));
    gl.uniform3fv(U.uPale, rgb(set.pale)); gl.uniform3fv(U.uDark, rgb(set.dark));
    const shown = Math.min(count, Math.round(set.beads));
    gl.uniform1f(U.uCount, Math.min(count, Math.round(set.beads))); gl.uniform1i(U.uShape, shapeTo); gl.uniform1i(U.uShapeFrom, shapeFrom);
    gl.uniform1f(U.uShapeMix, 1 - Math.pow(1 - shapeMix, 3));
    // the light's pass, then the viewer's
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
    gl.viewport(0, 0, SHADOW, SHADOW);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(U.uShadowPass, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.drawArrays(gl.POINTS, 0, shown);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.016, 0.039, 0.075, 1);   // Night, #040A13
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(U.uShadowPass, 0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.drawArrays(gl.POINTS, 0, shown);
  }
  function tick(now) {
    frame = 0;
    const dt = last === undefined ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) {
      const d = timing().duration;
      if (!park) clock = (clock + dt) % d;
      else if (!park.done) {
        let next = park.back ? clock - dt : clock + dt;
        if (park.back ? next <= park.at : !park.form ? next >= d : clock < park.at && next >= park.at) { next = park.at; park.done = true; }
        else if (next >= d) next = timing().gatherAt;               // heading for the bison: no waiting in the dust
        clock = next;
      }
      flow += dt * set.swirl;
      spinT += dt;
      for (let k = 0; k < 3; k++) { spun[k] += rad(set[`ring${k + 1}Spin`]) * dt; tumbled[k] += rad(set[`ring${k + 1}Tumble`]) * dt; }
      showClock();
      if (!park) showForm();
    }
    if (shapeMix < 1) shapeMix = Math.min(1, shapeMix + dt / 0.9);   // a new shape: the beads travel to it in 0.9 s
    // the sweep: while the animal stands the light goes round it, from rest back to rest, lap after lap.
    // Otherwise the light is where the Light faders put it
    // the light sweep keeps time with the loop: one lap from when the head starts forming until it releases, the next
    // from when the rings start forming until the next head starts, however long each of those is. Held with the form
    // key, it carries on round at the same pace. Turning it off puts it back at rest
    const t = timing(), sweepAt = t.gatherAt + set.gather * 1.55 - set.sweepLead;
    sweepOn = set.sun;
    if (park && park.done && playing) heldT += dt; else heldT = 0;
    const headSpan = t.releaseAt - t.gatherAt, ringSpan = t.duration - headSpan;
    const lap = clock >= t.gatherAt && clock < t.releaseAt ? (clock - t.gatherAt + heldT) / headSpan
      : ((clock >= t.releaseAt ? clock - t.releaseAt : clock + t.duration - t.releaseAt) + heldT) / ringSpan;
    const inHead = clock >= t.gatherAt && clock < t.releaseAt;
    const holdMid = (t.gatherAt + set.gather * 1.55 + t.releaseAt) / 2;          // when the head is most on show
    const sunTarget = sunAt(sweepOn ? ((lap % 1) + 1) % 1 : null, inHead && !heldT ? Math.min(0.9, Math.max(0.1, (holdMid - t.gatherAt) / headSpan)) : 0.5);
    // followed exactly while it runs; where the clock jumps (the form key skipping a wait), it glides over instead
    const turn = ((sunTarget[0] - sunNow[0]) % 360 + 540) % 360 - 180;
    const glide = dt > 0 && Math.abs(turn) > 12 ? 1 - Math.exp(-dt * 4) : 1;
    sunNow[0] += turn * glide;
    for (const k of [1, 2]) sunNow[k] += (sunTarget[k] - sunNow[k]) * glide;
    // the head's tilt alternates: the first head tips from Tilt to Tilt by the release, the second back from there to
    // Tilt, the third up again, and so on. Each tips softly from when the light sweep would set off until its release,
    // keeps its angle as it falls away into the rings (the rings and the camera don't tip with it), and the next head
    // forms at that same angle, so nothing ever jumps
    if (tiltNow === null) tiltNow = set.tilt;
    const formedAt0 = sweepAt, holding = clock >= formedAt0 && clock < t.releaseAt;
    if (holding && !wasHolding && playing && !park?.back) cycle++;   // a new head has begun to stand
    wasHolding = holding;
    const n = Math.max(1, cycle), [fromTilt, toTilt] = n % 2 ? [set.tilt, set.tiltTo] : [set.tiltTo, set.tilt];
    const tiltAt = tt => { const u = Math.min(1, tt / Math.max(0.1, t.releaseAt - sweepAt)), e = u * u * (3 - 2 * u); return fromTilt + (toTilt - fromTilt) * e; };
    if (holding) {
      if (playing && !park?.back) tiltT += dt; else if (!playing) tiltT = clock - formedAt0;
      tiltNow = tiltAt(tiltT);
    } else if (clock < formedAt0) { tiltT = 0; tiltNow = cycle % 2 ? set.tiltTo : set.tilt; }   // the next head forms where the last one ended
    else if (!playing) tiltNow = tiltAt(t.releaseAt - sweepAt);   // scrubbed into the fall: where its hold left it
    // (playing through the fall: tiltNow stays where the hold left it)
    draw(now);
    const settling = (holding && tiltT < t.releaseAt - sweepAt) || shapeMix < 1 || sweepOn || Math.abs(sunNow[0] - sunTarget[0]) + Math.abs(sunNow[1] - sunTarget[1]) + Math.abs(sunNow[2] - sunTarget[2]) > 1e-3;
    if (playing || settling) wake();
  }
  function wake() { if (!frame && !document.hidden && count) frame = requestAnimationFrame(tick); }
  document.addEventListener('visibilitychange', () => { last = undefined; wake(); });
  new ResizeObserver(() => wake()).observe(canvas);
  reduce.addEventListener('change', () => { if (reduce.matches) { clock = timing().releaseAt - 0.01; setPlaying(false); } });

  // ?t=4.2 holds the loop at a moment, ?whole starts on the whole animal, ?view= sets the turn (for screenshots)
  const q = new URLSearchParams(location.search);
  if (reduce.matches) clock = timing().releaseAt - 0.01;
  if (q.has('t')) { clock = Math.max(0, parseFloat(q.get('t')) || 0); playing = false; }
  if (q.has('shape')) setShape(q.get('shape'), true);
  for (const key of ['material', 'colorMode']) if (q.has(key)) setLook(key, q.get(key));   // for screenshots
  for (const key of ['beads', 'density']) if (q.has(key)) rowsById[key].apply(Number(q.get(key)));   // ?shape=galaxy starts with that shape
  const asked = (q.get('view') || '').split(',').map(Number);   // ?view=0.5,0.1 starts at that turn and tilt (radians)
  if (asked.length === 2 && asked.every(Number.isFinite)) { rowsById.turn.apply(Math.round(asked[0] * 180 / Math.PI)); rowsById.tilt.apply(Math.round(asked[1] * 180 / Math.PI)); }
  choose(q.has('whole') ? 'whole' : 'head').then(() => { setPlaying(playing); showClock(); });
})();
