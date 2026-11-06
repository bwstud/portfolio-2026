/* Split-Flap Lab: every setting in split-flap.js as a control, plus an easing editor and a
   transport. The board on the stage is the same code the home page runs. */
(function () {
  const { DEFAULTS, resolveEase } = SplitFlap;
  const STORE = 'split-flap-lab/v1';
  const LAB_ONLY = { seed: 1, stageColor: '#0e0e0f' };   // never part of a site config
  // where the lab starts: the padded board, which reaches the site only through a saved version
  const LAB_START = { padX: 2, padY: 1, fillRows: true, boardWidth: 840, grain: 0.08, frame: true };
  const $ = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const base = { ...DEFAULTS, ...LAB_ONLY, ...LAB_START };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { /* start clean */ }
  const cfg = { ...base, ...saved };

  /* ---- Parameter definitions ---- */
  const n = (key, label, min, max, step, unit, hint) => ({ key, label, min, max, step, unit, hint, type: 'number' });
  const c = (key, label, hint) => ({ key, label, hint, type: 'color' });
  const b = (key, label, hint) => ({ key, label, hint, type: 'toggle' });
  const GROUPS = [
    ['Message', [
      { key: 'lines', label: 'Text', type: 'lines', hint: 'What the board spells, one row per line.' },
      { key: 'chars', label: 'Drum', type: 'text', hint: 'Every character on a module, in flip order.' },
    ]],
    ['Timing', [
      n('flipMs', 'Flip', 10, 400, 1, 'ms', 'Average time for one character change.'),
      n('startMs', 'Start delay', 0, 1000, 5, 'ms', 'Pause before the first module moves.'),
      n('staggerMs', 'Stagger', 0, 1000, 5, 'ms', 'Modules start at random within this window.'),
      n('minFlips', 'Min flips', 0, 60, 1, '', 'Fewest flips a module makes.'),
      n('maxFlips', 'Max flips', 0, 60, 1, '', 'Most flips a module makes. The last module always runs long enough to land last.'),
      { key: 'seed', label: 'Seed', type: 'seed', hint: 'Fixes the random schedule so replays match. The site rolls a new one each load.' },
    ]],
    ['Landing', [
      n('bounceMs', 'Bounce time', 0, 400, 5, 'ms', 'How long the final leaf rebounds.'),
      n('bounceDeg', 'Bounce height', 0, 60, 1, '°', 'How far the final leaf lifts off its stop.'),
    ]],
    ['Motion blur', [
      n('shutterMs', 'Shutter', 0, 120, 1, 'ms', 'Simulated exposure time. 0 is sharp.'),
      n('samples', 'Samples', 1, 24, 1, '', 'Instants averaged per frame. More is smoother and slower.'),
    ]],
    ['Board', [
      n('boardWidth', 'Width', 200, 1200, 10, 'px', 'Widest the board may grow.'),
      n('gap', 'Gap', 0, 24, 1, 'px', 'Space between modules when flat.'),
      n('padX', 'Side cells', 0, 8, 1, '', 'Empty modules left and right of the text.'),
      n('padY', 'Top and bottom cells', 0, 6, 1, '', 'Empty rows above and below the text.'),
      b('fillRows', 'Fill short lines', 'Empty modules out to the full width, such as beside the first name.'),
      b('blankFlips', 'Empty cells flip', 'Empty modules spin with the rest and land blank.'),
      c('stageColor', 'Stage', 'Lab backdrop. Not part of the config.'),
    ]],
    ['Frame', [
      c('frameColor', 'Plate colour', 'The faceplate around the windows.'),
      c('wellColor', 'Window colour', 'The dark visible around each tile.'),
      n('framePad', 'Border', 0, 80, 1, 'px', 'Plate around the whole grid.'),
      n('frameGap', 'Window spacing', 0, 40, 1, 'px', 'Plate between windows. Replaces Gap when framed.'),
      n('frameInset', 'Tile inset', 0, 0.2, 0.005, '× window', 'Space between tile and window edge.'),
      n('frameDepth', 'Recess depth', 0, 1, 0.01, '', 'Shadow the plate casts into each window.'),
      n('frameLip', 'Lip light', 0, 0.5, 0.01, '', 'Light catching each window’s lower edge.'),
      n('frameSheen', 'Plate sheen', 0, 0.3, 0.01, '', 'Side light falling across the plate.'),
    ]],
    ['Tile', [
      n('tileRatio', 'Height', 1, 2, 0.01, '× width', 'Tile height against its width.'),
      n('radius', 'Corners', 0, 0.3, 0.005, '× width', 'Outer corner radius.'),
      n('slotSize', 'Slot', 0, 0.06, 0.001, '× height', 'Dark gap between the two halves.'),
      n('grain', 'Film grain', 0, 1, 0.01, '', 'Grain on the leaf surfaces. It moves with the leaf.'),
      n('grainSize', 'Grain size', 0.5, 4, 0.1, 'px', 'Size of each speck.'),
      c('tileTop', 'Top colour', 'Top edge, fading down to the bottom colour at the hinge.'),
      c('tileBottom', 'Bottom colour', 'Lower half, and the end of the top half’s fade.'),
      c('slotColor', 'Slot colour', 'The gap between the halves.'),
    ]],
    ['Glyph', [
      n('glyphSize', 'Size', 0.3, 1.4, 0.01, '× width', 'Letter size against tile width.'),
      n('fontWeight', 'Weight', 100, 900, 10, '', 'Geist weight.'),
      c('glyphColor', 'Colour', 'Letter colour.'),
    ]],
    ['Leaf', [
      n('eye', 'Viewer distance', 0.8, 8, 0.1, '× height', 'Closer makes the swinging leaf loom more.'),
      n('overhang', 'Overhang', 0, 0.4, 0.01, '× width', 'Room past the tile edge for the leaf to swing into. Too little clips it.'),
      n('slices', 'Strips', 2, 48, 1, '', 'Strips in the perspective warp. Too few looks stepped.'),
    ]],
    ['Light', [
      n('topShade', 'Top shade', 0, 1, 0.01, '', 'How dark the falling top leaf gets at 90°.'),
      n('bottomShine', 'Bottom shine', 0, 0.5, 0.01, '', 'How bright the landing bottom leaf gets at 90°.'),
      n('edgeLight', 'Edge light', 0, 1, 0.01, '', 'Highlight along the leaf’s free edge.'),
      n('edgeMinDeg', 'Edge angle', 0, 45, 1, '°', 'Leaf angle where that highlight appears.'),
      n('edgeSize', 'Edge size', 0, 0.03, 0.001, '× height', 'Highlight thickness.'),
    ]],
  ];

  /* ---- Board ---- */
  const engineConfig = () => {
    const { stageColor, ...rest } = cfg;
    return rest;
  };
  const stage = $('stage');
  const flap = SplitFlap.mount($('fit'), engineConfig());
  const applyStage = () => { stage.style.background = cfg.stageColor; };

  // shrink the board when it would be taller than the stage
  function fitBoard() {
    const { cols, rows } = flap.grid, style = getComputedStyle(stage);
    const room = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const gap = cfg.frame ? cfg.frameGap : cfg.gap, plate = cfg.frame ? cfg.framePad * 2 : 0;
    const tile = (room - plate - (rows - 1) * gap) / (rows * cfg.tileRatio);
    $('fit').style.maxWidth = Math.max(cols * tile + (cols - 1) * gap + plate, 120) + 'px';
  }

  let queued = false;
  function changed() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      flap.update(engineConfig());
      applyStage();
      fitBoard();
      if (time > flap.duration) time = flap.duration;
      flap.seek(time);
      drawTracks();
      drawPlot();
      showTime();
      refreshCount();
      const diff = {};
      Object.keys(base).forEach(k => { if (!same(cfg[k], base[k])) diff[k] = cfg[k]; });
      try { localStorage.setItem(STORE, JSON.stringify(diff)); } catch (e) { /* private mode */ }
    });
  }

  /* ---- Parameter panel ---- */
  const rows = [];
  function buildRow(p) {
    const row = document.createElement('div');
    row.className = 'row';
    const id = 'p-' + p.key;
    row.innerHTML = `<label class="row__name" for="${id}">${p.label}</label><span class="row__value"></span>
      <button class="row__reset" type="button" aria-label="Reset ${p.label}" title="Reset">↺</button>`;
    const value = row.querySelector('.row__value');
    const hint = document.createElement('small');
    hint.className = 'row__hint';
    hint.textContent = p.hint;

    const set = v => { cfg[p.key] = v; sync(); changed(); };
    let sync;

    if (p.type === 'number') {
      const box = document.createElement('input'), range = document.createElement('input');
      box.type = 'number'; box.id = id; box.className = 'num';
      range.type = 'range'; range.setAttribute('aria-label', p.label);
      [box, range].forEach(el => { el.min = p.min; el.max = p.max; el.step = p.step; });
      value.append(box, Object.assign(document.createElement('span'), { textContent: p.unit }));
      row.append(range);
      range.addEventListener('input', () => set(+range.value));
      box.addEventListener('change', () => {
        if (box.value !== '') set(clamp(+box.value, p.min, p.max)); else sync();
      });
      sync = () => { box.value = range.value = cfg[p.key]; };
    } else if (p.type === 'toggle') {
      const box = document.createElement('input');
      box.type = 'checkbox'; box.id = id;
      value.append(box);
      box.addEventListener('change', () => set(box.checked));
      sync = () => { box.checked = cfg[p.key]; };
    } else if (p.type === 'color') {
      const box = document.createElement('input');
      box.type = 'color'; box.id = id;
      const code = Object.assign(document.createElement('span'), { className: 'num' });
      value.append(code, box);
      box.addEventListener('input', () => set(box.value));
      sync = () => { box.value = code.textContent = cfg[p.key]; };
    } else if (p.type === 'seed') {
      const box = document.createElement('input'), roll = document.createElement('button');
      box.type = 'number'; box.id = id; box.className = 'num'; box.min = 0; box.step = 1;
      roll.type = 'button'; roll.className = 'chip'; roll.textContent = 'Shuffle';
      value.append(roll, box);
      roll.addEventListener('click', () => set(Math.floor(Math.random() * 1e6)));
      box.addEventListener('change', () => { if (box.value !== '') set(Math.abs(Math.round(+box.value))); else sync(); });
      sync = () => { box.value = cfg.seed; };
    } else {
      const lines = p.type === 'lines';
      const box = document.createElement(lines ? 'textarea' : 'input');
      if (lines) box.rows = 2; else box.type = 'text';
      box.id = id; box.spellcheck = false;
      row.append(box);
      box.addEventListener('input', () => {
        cfg[p.key] = lines ? box.value.split('\n') : box.value;
        checkDrum();
        changed();
        mark();
      });
      sync = () => {
        const v = lines ? cfg.lines.join('\n') : cfg.chars;
        if (box.value !== v) box.value = v;
      };
    }

    row.append(hint);
    const mark = () => row.classList.toggle('is-changed', !same(cfg[p.key], base[p.key]));
    const syncOuter = sync;
    sync = () => { syncOuter(); mark(); };
    row.querySelector('.row__reset').addEventListener('click', () => {
      cfg[p.key] = base[p.key]; sync(); checkDrum(); changed();
    });
    rows.push({ p, sync, hint });
    sync();
    return row;
  }

  GROUPS.forEach(([title, params]) => {
    const group = document.createElement('section');
    group.className = 'group';
    group.append(Object.assign(document.createElement('h2'), { textContent: title }));
    params.forEach(p => group.append(buildRow(p)));
    $('params').append(group);
  });

  // Flat or Framed, in the header so it's one click from anywhere in the panel
  const frameButtons = [...document.querySelectorAll('#frame-switch button')];
  const syncFrame = () => frameButtons.forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.frame === String(cfg.frame));
  });
  frameButtons.forEach(button => button.addEventListener('click', () => {
    cfg.frame = button.dataset.frame === 'true';
    syncFrame();
    changed();
  }));
  rows.push({ p: { key: 'frame' }, sync: syncFrame });
  syncFrame();

  function checkDrum() {
    const row = rows.find(r => r.p.key === 'lines');
    const missing = [...new Set([...cfg.lines.join('')])].filter(ch => !cfg.chars.includes(ch));
    row.hint.classList.toggle('is-warning', missing.length > 0);
    row.hint.textContent = missing.length
      ? `Not on the drum, so shown as its first character: ${missing.join(' ')}`
      : row.p.hint;
  }

  const SITE_KEYS = Object.keys(DEFAULTS).filter(k => k !== 'seed');

  // what a site config needs to reproduce the current settings
  function overrides() {
    const diff = {};
    SITE_KEYS.forEach(k => { if (!same(cfg[k], DEFAULTS[k])) diff[k] = cfg[k]; });
    return diff;
  }

  // how many site settings on the panel differ from a version
  function differences(version) {
    const config = { ...DEFAULTS, ...version.config };
    return SITE_KEYS.filter(k => !same(cfg[k], config[k])).length;
  }

  function refreshCount() {
    const count = differences(activeVersion());
    $('count').textContent = count ? `${count} from active` : 'Matches active';
    $('version-use').disabled = !count;
    $('version-use').textContent = count ? 'Use on landing page' : 'On landing page';
  }

  $('reset').addEventListener('click', () => {
    Object.assign(cfg, base);
    rows.forEach(r => r.sync());
    checkDrum();
    refreshEase();
    changed();
  });

  $('copy').addEventListener('click', async () => {
    const button = $('copy');
    const text = `SplitFlap.mount(heading, ${JSON.stringify(overrides(), null, 2)});`;
    let label = 'Copied';
    try { await navigator.clipboard.writeText(text); } catch (e) { label = 'Copy failed'; console.log(text); }
    button.textContent = label;
    setTimeout(() => { button.textContent = 'Copy config'; }, 1200);
  });

  /* ---- Versions: kept in split-flap-versions.js, which the site reads. The local server
     (tools/lab-server.mjs, started by `dvs`) writes that file. Deployed, the lab can only read it. ---- */
  const FILE = 'split-flap-versions.js';
  const FILE_URL = '../../' + FILE;
  const API = '/__lab/versions';
  const ORIGINAL = 'original';   // the site's baseline: it can go active, but never be replaced
  const PUBLISH = `Push ${FILE} to publish.`;
  let store = { active: ORIGINAL, versions: [{ id: ORIGINAL, name: 'Original', savedAt: null, config: {} }] };
  let canWrite = false;

  const activeVersion = () => store.versions.find(v => v.id === store.active) || { config: {} };
  const parseStore = text => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const status = text => { $('version-status').textContent = text; };

  async function readStore() {
    const response = await fetch(API, { cache: 'no-store' });
    if (!response.ok) throw new Error(`The server answered ${response.status}.`);
    return response.json();
  }

  // change() edits a fresh copy of the file; nothing shows as saved until the file has it
  async function commit(change, done) {
    try {
      const next = await readStore();
      change(next);
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error(await response.text());
      store = next;
      renderVersions();
      refreshCount();
      status(done);
    } catch (e) {
      status(`Not saved. ${e instanceof TypeError ? 'The local server has stopped: run dvs.' : e.message}`);
    }
  }

  function saveBoard(name, makeActive, done) {
    if (store.versions.some(v => v.id === ORIGINAL && v.name === name)) {
      status('Original stays as it is. Give this board a new name.');
      $('version-name').focus();
      return;
    }
    commit(next => {
      const i = next.versions.findIndex(v => v.name === name);
      const entry = {
        id: i < 0 ? Date.now().toString(36) : next.versions[i].id,
        name, savedAt: new Date().toISOString(), config: overrides(),
        lab: { seed: cfg.seed, stageColor: cfg.stageColor },
      };
      if (i < 0) next.versions.push(entry); else next.versions[i] = entry;
      if (makeActive) next.active = entry.id;
    }, done);
  }

  function loadVersion(version) {
    Object.keys(cfg).forEach(k => { delete cfg[k]; });
    Object.assign(cfg, DEFAULTS, LAB_ONLY, version.lab, version.config);
    rows.forEach(r => r.sync());
    checkDrum();
    refreshEase();
    changed();
    $('version-name').value = version.name;
    refreshSaveLabel();
    status(`Loaded ${version.name}.`);
  }

  const dateLabel = iso => iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const chip = (text, onClick) => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: text });
    button.addEventListener('click', onClick);
    return button;
  };

  function renderVersions() {
    $('version-list').replaceChildren(...store.versions.map(version => {
      const item = document.createElement('li');
      item.className = 'version';
      const isActive = version.id === store.active;
      const actions = document.createElement('div');
      actions.className = 'version__actions';
      actions.append(chip('Load', () => loadVersion(version)));
      if (isActive) {
        actions.append(Object.assign(document.createElement('span'), { className: 'version__badge', textContent: 'Active' }));
      } else if (canWrite) {
        actions.append(chip('Set active', () => commit(
          next => { next.active = version.id; },
          `${version.name} is on the local landing page. ${PUBLISH}`,
        )));
        if (version.id !== ORIGINAL) {
          const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'version__delete', textContent: 'Delete' });
          remove.setAttribute('aria-label', `Delete ${version.name}`);
          remove.addEventListener('click', () => {
            if (confirm(`Delete ${version.name}?`)) {
              commit(next => { next.versions = next.versions.filter(v => v.id !== version.id); }, `Deleted ${version.name}.`);
            }
          });
          actions.append(remove);
        }
      }
      item.append(
        Object.assign(document.createElement('span'), { className: 'version__name', textContent: version.name }),
        Object.assign(document.createElement('span'), { className: 'version__date', textContent: dateLabel(version.savedAt) }),
        actions,
      );
      return item;
    }));
    refreshSaveLabel();
  }

  function refreshSaveLabel() {
    const name = $('version-name').value.trim();
    $('version-save').textContent = store.versions.some(v => v.name === name) ? 'Replace' : 'Save';
  }

  $('version-name').addEventListener('input', refreshSaveLabel);
  $('version-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('version-name').value.trim();
    if (!name) return status('Name the version first.');
    saveBoard(name, false, `Saved ${name}.`);
  });

  // one step from the panel to the landing page: a board that's already saved just goes active
  $('version-use').addEventListener('click', () => {
    const name = $('version-name').value.trim();
    const match = store.versions.find(v => differences(v) === 0);
    if (match) {
      commit(next => { next.active = match.id; }, `${match.name} is on the local landing page. ${PUBLISH}`);
    } else if (name) {
      saveBoard(name, true, `Saved ${name}. It's on the local landing page. ${PUBLISH}`);
    } else {
      status('Name this board first.');
      $('version-name').focus();
    }
  });

  /* ---- Easing editor ---- */
  const PRESETS = [
    { label: 'Gravity (site leaf)', spec: 'gravity', handles: [0.455, 0.03, 0.515, 0.955] },
    { label: 'Linear (site spin)', spec: 'linear', handles: [0, 0, 1, 1] },
    { label: 'Ease in', spec: [0.42, 0, 1, 1] },
    { label: 'Ease out', spec: [0, 0, 0.58, 1] },
    { label: 'Ease in-out', spec: [0.42, 0, 0.58, 1] },
    { label: 'Slow landing', spec: [0.16, 1, 0.3, 1] },
    { label: 'Windup', spec: [0.7, 0, 0.84, 0] },
    { label: 'Overshoot', spec: [0.34, 1.4, 0.64, 1] },
    { label: 'Bounce', spec: 'bounce' },
    { label: 'Elastic', spec: 'elastic' },
  ];
  const ABOUT = {
    spinEase: 'Spacing of flips across a module’s whole spin. Reshapes the run: try Slow landing.',
    flipEase: 'Leaf angle within one flip. At 55 ms it reads as texture: slow playback to see it.',
  };
  const AXES = ['x1', 'y1', 'x2', 'y2'];
  const Y_MIN = -0.4, Y_MAX = 1.4, W = 250, H = 200, PAD_X = 14;
  const px = x => PAD_X + x * (W - PAD_X * 2);
  const py = y => (Y_MAX - y) / (Y_MAX - Y_MIN) * H;
  let target = 'spinEase';

  const plot = $('plot');
  const handlesOf = spec => Array.isArray(spec) ? spec : (PRESETS.find(p => p.spec === spec) || {}).handles;

  PRESETS.forEach((p, i) => $('preset').add(new Option(p.label, i)));
  $('preset').add(new Option('Custom', 'custom'));
  $('preset').addEventListener('change', e => {
    if (e.target.value === 'custom') return;
    cfg[target] = PRESETS[+e.target.value].spec;
    refreshEase();
    changed();
  });

  const bezInputs = AXES.map((axis, i) => {
    const label = document.createElement('label');
    label.textContent = axis;
    const input = document.createElement('input');
    input.type = 'number'; input.className = 'num'; input.step = 0.01;
    input.min = i % 2 ? Y_MIN : 0; input.max = i % 2 ? Y_MAX : 1;
    input.addEventListener('change', () => {
      const h = [...handlesOf(cfg[target])];
      h[i] = clamp(+input.value, +input.min, +input.max);
      cfg[target] = h;
      refreshEase();
      changed();
    });
    label.append(input);
    $('bez').append(label);
    return input;
  });

  document.querySelectorAll('#target button').forEach(button => button.addEventListener('click', () => {
    target = button.dataset.target;
    document.querySelectorAll('#target button').forEach(b => b.setAttribute('aria-pressed', b === button));
    refreshEase();
  }));

  function refreshEase() {
    $('about').textContent = ABOUT[target];
    const i = PRESETS.findIndex(p => same(p.spec, cfg[target]));
    $('preset').value = i < 0 ? 'custom' : i;
    const h = handlesOf(cfg[target]);
    bezInputs.forEach((input, k) => {
      input.disabled = !h;
      input.value = h ? h[k] : '';
      input.placeholder = h ? '' : '–';
    });
    drawPlot();
  }

  function drawPlot() {
    const ease = resolveEase(cfg[target]), h = handlesOf(cfg[target]);
    let d = '';
    for (let i = 0; i <= 160; i++) d += `${i ? 'L' : 'M'}${px(i / 160).toFixed(1)} ${py(ease(i / 160)).toFixed(1)}`;
    const handle = (x, y, ax, ay, i) => `
      <line x1="${px(ax)}" y1="${py(ay)}" x2="${px(x)}" y2="${py(y)}" stroke="#f0b25e" stroke-opacity=".5" vector-effect="non-scaling-stroke"/>
      <circle data-handle="${i}" cx="${px(x)}" cy="${py(y)}" r="6" fill="#f0b25e" style="cursor:grab"/>`;
    plot.innerHTML = `
      <rect x="${px(0)}" y="${py(1)}" width="${px(1) - px(0)}" height="${py(0) - py(1)}" fill="#161618" stroke="#2a2a2c"/>
      <path d="${d}" fill="none" stroke="#f2f0ec" stroke-width="2" stroke-linejoin="round"/>
      ${h ? handle(h[0], h[1], 0, 0, 0) + handle(h[2], h[3], 1, 1, 1) : ''}
      <circle id="probe" r="4" fill="#f2f0ec" visibility="hidden"/>`;
  }

  let dragging = null;
  plot.addEventListener('pointerdown', e => {
    if (!e.target.dataset.handle) return;
    dragging = +e.target.dataset.handle;
    plot.setPointerCapture(e.pointerId);
  });
  plot.addEventListener('pointermove', e => {
    if (dragging === null) return;
    const box = plot.getBoundingClientRect();
    const sx = (e.clientX - box.left) / box.width * W, sy = (e.clientY - box.top) / box.height * H;
    const x = clamp((sx - PAD_X) / (W - PAD_X * 2), 0, 1);
    const y = clamp(Y_MAX - sy / H * (Y_MAX - Y_MIN), Y_MIN, Y_MAX);
    const h = [...handlesOf(cfg[target])];
    h[dragging * 2] = +x.toFixed(2);
    h[dragging * 2 + 1] = +y.toFixed(2);
    cfg[target] = h;
    refreshEase();
    changed();
  });
  ['pointerup', 'pointercancel'].forEach(type => plot.addEventListener(type, () => { dragging = null; }));

  // a dot riding the curve, following the module that lands last
  function moveProbe() {
    const probe = $('probe');
    if (!probe) return;
    const track = textTracks().at(-1);
    const u = (time - track.start) / track.spinMs;
    if (!(u > 0 && u < 1)) return probe.setAttribute('visibility', 'hidden');
    const spun = resolveEase(cfg.spinEase)(u);
    const p = target === 'spinEase' ? u : (clamp(spun, 0, 1) * track.flips) % 1;
    probe.setAttribute('cx', px(p));
    probe.setAttribute('cy', py(resolveEase(cfg[target])(p)));
    probe.setAttribute('visibility', 'visible');
  }

  /* ---- Timeline ---- */
  const tracksEl = $('tracks'), canvas = $('tracks-canvas'), head = $('head');
  const LABEL_W = 18, RULER_H = 16, RIGHT = 6;
  // empty cells would swamp the view, so the timeline follows the letters
  const textTracks = () => {
    const letters = flap.tracks.filter(m => !m.blank);
    return letters.length ? letters : flap.tracks;
  };
  const timeX = t => LABEL_W + t / flap.duration * (tracksEl.clientWidth - LABEL_W - RIGHT);

  function drawTracks() {
    const dpr = window.devicePixelRatio || 1;
    const w = tracksEl.clientWidth, h = tracksEl.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.font = '10px Geist, sans-serif';
    g.textBaseline = 'middle';

    // ruler
    const stepMs = [50, 100, 250, 500, 1000, 2000, 5000].find(s => timeX(s) - timeX(0) > 56) || 10000;
    g.fillStyle = '#9a9894'; g.textAlign = 'left';
    for (let t = 0; t <= flap.duration; t += stepMs) {
      g.fillRect(timeX(t), 2, 1, RULER_H - 6);
      if (timeX(t) + 40 < w) g.fillText((t / 1000).toFixed(stepMs < 1000 ? 2 : 0) + 's', timeX(t) + 4, 7);
    }

    const tracks = textTracks(), ease = resolveEase(cfg.spinEase);
    const rowH = (h - RULER_H) / tracks.length, barH = Math.max(3, Math.min(rowH - 2, 10));
    tracks.forEach((m, i) => {
      const y = RULER_H + i * rowH + (rowH - barH) / 2;
      g.fillStyle = '#9a9894'; g.textAlign = 'center';
      if (rowH >= 8) g.fillText(m.ch, LABEL_W / 2 - 2, y + barH / 2);
      const x0 = timeX(m.start), x1 = timeX(m.start + m.spinMs), x2 = timeX(m.end);
      g.fillStyle = '#2a2a2c'; g.fillRect(x0, y, x1 - x0, barH);
      g.fillStyle = 'rgba(240, 178, 94, 0.7)'; g.fillRect(x1, y, Math.max(x2 - x1, 1), barH);
      // a tick at every character change, so the spin curve shows up as their spacing
      g.fillStyle = '#6d6b67';
      let seen = 0;
      for (let k = 0; k <= 400; k++) {
        const f = Math.floor(clamp(ease(k / 400), 0, 1) * m.flips);
        if (f !== seen) { seen = f; g.fillRect(x0 + k / 400 * (x1 - x0), y, 1, barH); }
      }
    });
  }

  function showTime() {
    $('now').textContent = (time / 1000).toFixed(3);
    $('total').textContent = (flap.duration / 1000).toFixed(3);
    head.style.transform = `translateX(${timeX(time)}px)`;
    tracksEl.setAttribute('aria-valuemax', Math.round(flap.duration));
    tracksEl.setAttribute('aria-valuenow', Math.round(time));
    tracksEl.setAttribute('aria-valuetext', (time / 1000).toFixed(2) + ' seconds');
    moveProbe();
  }

  /* ---- Transport: direction is 1 playing, -1 rewinding, 0 paused ---- */
  const LOOP_HOLD_MS = 600;   // rest on the finished word before looping
  let time = 0, direction = 0, last = 0, holdUntil = 0;

  function setDirection(d) {
    direction = d;
    $('play').setAttribute('aria-pressed', d === 1);
    $('rewind').setAttribute('aria-pressed', d === -1);
    $('pause').setAttribute('aria-pressed', d === 0);
    if (d) { last = performance.now(); requestAnimationFrame(tick); }
  }

  function moveTo(t) {
    time = clamp(t, 0, flap.duration);
    flap.seek(time);
    showTime();
  }

  function tick(now) {
    if (!direction) return;
    const dt = now - last;
    last = now;
    if (now < holdUntil) return requestAnimationFrame(tick);
    if (holdUntil) { holdUntil = 0; moveTo(0); return requestAnimationFrame(tick); }
    moveTo(time + dt * direction * +$('speed').value);
    if (direction === 1 && time >= flap.duration) {
      if (!$('loop').checked) return setDirection(0);
      holdUntil = now + LOOP_HOLD_MS;
    } else if (direction === -1 && time <= 0) {
      return setDirection(0);
    }
    requestAnimationFrame(tick);
  }

  const play = () => {
    if (direction === 1) return;
    if (time >= flap.duration) moveTo(0);
    holdUntil = 0;
    setDirection(1);
  };
  const restart = () => { holdUntil = 0; moveTo(0); if (direction !== 1) setDirection(1); };
  const pause = () => { holdUntil = 0; setDirection(0); };
  const rewind = () => { holdUntil = 0; if (time > 0 && direction !== -1) setDirection(-1); };

  $('play').addEventListener('click', play);
  $('pause').addEventListener('click', pause);
  $('rewind').addEventListener('click', rewind);
  $('restart').addEventListener('click', restart);

  function scrubTo(e) {
    const box = tracksEl.getBoundingClientRect();
    moveTo((e.clientX - box.left - LABEL_W) / (box.width - LABEL_W - RIGHT) * flap.duration);
  }
  let scrubbing = false;
  tracksEl.addEventListener('pointerdown', e => {
    pause();
    scrubbing = true;
    tracksEl.setPointerCapture(e.pointerId);
    scrubTo(e);
  });
  tracksEl.addEventListener('pointermove', e => { if (scrubbing) scrubTo(e); });
  ['pointerup', 'pointercancel'].forEach(type => tracksEl.addEventListener(type, () => { scrubbing = false; }));

  // Space drives the timeline wherever focus is, unless you're typing. Capture runs first, and
  // the keyup is swallowed too, or a focused button would also click.
  const typing = el => el.matches('textarea, input[type="text"]');
  document.addEventListener('keydown', e => {
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) direction ? pause() : play();
    } else if (e.target.closest('input, select')) {
      return;
    } else if (e.key === 'r' || e.key === 'R') {
      restart();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      pause();
      moveTo(time + (e.key === 'ArrowLeft' ? -1 : 1) * 1000 / 60);
    }
  }, true);
  document.addEventListener('keyup', e => {
    if (e.key === ' ' && !typing(e.target)) e.preventDefault();
  }, true);

  new ResizeObserver(() => { drawTracks(); showTime(); }).observe(tracksEl);
  new ResizeObserver(fitBoard).observe(stage);

  /* ---- Start ---- */
  applyStage();
  fitBoard();
  checkDrum();
  refreshEase();
  renderVersions();
  refreshCount();
  readStore().then(data => {
    canWrite = true;
    $('version-tools').hidden = false;
    return data;
  }).catch(async () => {
    status('Read only here. Run the lab locally with dvs to save versions.');
    return parseStore(await (await fetch(FILE_URL, { cache: 'no-store' })).text());
  }).then(data => {
    store = data;
    renderVersions();
    refreshCount();
  }).catch(() => status(`Couldn't read ${FILE}.`));
  drawTracks();
  showTime();
  setDirection(0);
  flap.ready.then(() => {
    drawTracks();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) moveTo(flap.duration);
    else play();
  });
})();
