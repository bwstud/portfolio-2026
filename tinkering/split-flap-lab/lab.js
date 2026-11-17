/* Split-Flap Lab: every setting in split-flap.js as a control, plus an easing editor and a
   transport. The board on the stage is the same code the home page runs. */
(function () {
  const { DEFAULTS, STYLE_KEYS, resolveEase, resolveConfig } = SplitFlap;
  const STORE = 'split-flap-lab/v2';   // v1 held settings for the two-line name board
  const LAB_ONLY = { seed: 1 };   // never part of a site config
  // where the lab starts: the home page's board, three project rows with a Released column
  const LAB_START = {
    lines: ['GROOM LAKE|1014', 'BLACKBIRD|0120', 'MAZLAN BUILDER|1002'],
    nameCols: 16, statusCols: 4, padX: 0, padY: 0, fillRows: true, boardWidth: 1180, grain: 0.08, frame: true,
  };
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
      { key: 'lines', label: 'Rows', type: 'lines', hint: 'One board row each. Leave Released empty for a row with no date.' },
      { key: 'chars', label: 'Drum', type: 'text', hint: 'Every character on a module, in flip order.' },
    ]],
    ['Columns', [
      n('nameCols', 'Project column', 0, 28, 1, 'modules', 'Width of the part before the |. 0 turns columns off and reads each line as written.'),
      n('statusCols', 'Released column', 0, 24, 1, 'modules', 'Width of the part after the |.'),
    ]],
    ['Record entrance', [
      n('recordFadeMs', 'Duration', 0, 2000, 10, 'ms', 'How long the project panel takes to fade in and settle. 0 shows it at once.'),
      n('recordLeadMs', 'Starts before landing', -1000, 3000, 10, 'ms', 'How long before the board’s last flap lands the panel starts. Negative waits until after.'),
      n('recordDrop', 'Drop', -120, 120, 1, 'px', 'How far above its place the panel starts. Negative makes it rise from below.'),
      n('recordBlur', 'Blur', 0, 24, 0.5, 'px', 'Blur the panel starts with, clearing as it settles.'),
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
      n('boardWidth', 'Width', 200, 1800, 10, 'px', 'Widest the board may grow.'),
      n('gap', 'Gap', 0, 24, 1, 'px', 'Space between modules when flat.'),
      n('padX', 'Side cells', 0, 8, 1, '', 'Empty modules left and right of the text.'),
      n('padY', 'Top and bottom cells', 0, 6, 1, '', 'Empty rows above and below the text.'),
      b('fillRows', 'Fill short lines', 'Empty modules out to the full width, such as beside the first name.'),
      b('blankFlips', 'Empty cells flip', 'Empty modules spin with the rest and land blank.'),
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
    ['Hologram', [
      n('holo', 'Strength', 0, 1, 0.01, '', 'Lifts the letters off the flaps as projected light. 0 prints them on the flaps.'),
      c('holoColor', 'Light colour', 'The colour of the projection.'),
      n('holoBloom', 'Bloom', 0, 2, 0.01, '', 'Glow around each letter.'),
      n('holoFringe', 'Fringe', 0, 4, 0.1, 'px', 'Red and cyan split at the letters’ edges.'),
      n('holoScan', 'Scanlines', 0, 1, 0.01, '', 'How much the scanlines take out of the light.'),
      n('holoScanGap', 'Scanline spacing', 1, 10, 0.5, 'px', 'Distance from one scanline to the next.'),
      n('holoFlicker', 'Flicker', 0, 1, 0.01, '', 'How unsteady the light is. Off under reduced motion.'),
      n('holoSpin', 'While spinning', 0, 1, 0.01, '', 'Brightness of the letters while the flaps spin under them. Each lights to full the moment it lands.'),
      n('holoShadow', 'Shadow opacity', 0, 1, 0.01, '', 'How strong the letter’s shadow on the flaps is. 0 removes it.'),
      c('holoShadowColor', 'Shadow colour', 'The colour of the letter’s shadow on the flap.'),
      n('holoShadowX', 'Shadow across', -0.3, 0.3, 0.005, '× width', 'Shadow offset to the right; negative to the left.'),
      n('holoShadowY', 'Shadow down', -0.3, 0.3, 0.005, '× width', 'Shadow offset downward; negative upward.'),
      n('holoShadowBlur', 'Shadow softness', 0, 0.3, 0.005, '× width', 'How soft the shadow is.'),
      n('holoSpill', 'Light on the flap', 0, 1, 0.01, '', 'The letter’s light falling on the flap straight behind it.'),
    ]],
  ];

  /* ---- Board ---- */
  // the stage shows the site's page background (--bg in styles.css), so the lab always
  // matches the home page; stageColor is stripped in case an older version still carries it
  const engineConfig = () => {
    const { stageColor, ...rest } = cfg;
    return rest;
  };
  const stage = $('stage');
  const flap = SplitFlap.mount($('fit'), engineConfig());

  /* The finish. Plain is the board as split-flap.js draws it. Work page adds what work.html puts on it, from the
     same stylesheet (board.css): the Matte housing, greyscale flaps, the column labels, a lamp beside each row and the
     lit row in view. It is the lab's view only and is never saved with a board; it needs the frame, so Flat stays plain. */
  const FINISH_STORE = 'split-flap-lab/finish';
  let finish = 'site', chosen = 0;
  try { if (localStorage.getItem(FINISH_STORE) === 'plain') finish = 'plain'; } catch (e) { /* private mode */ }
  const boardEl = $('board'), keysEl = $('keys'), headEl = boardEl.querySelector('.board__head');
  const onSite = () => finish === 'site' && cfg.frame;
  const boardRows = () => [...$('fit').querySelectorAll('.sf-row')];
  function wearFinish() {
    const site = onSite();
    boardEl.classList.toggle('board', site);
    boardEl.classList.toggle('matte', site);
    $('fit').classList.toggle('board__flap', site);
    stage.classList.toggle('is-site', site);
  }
  // the labels, lamps and lit row, placed against the board as it now stands (the work page's script does the same)
  function placeFinish() {
    const site = onSite(), rowEls = boardRows();
    const lines = Array.isArray(cfg.lines) ? cfg.lines : [];
    const project = k => !!(lines[k - cfg.padY] || '').split('|')[0].trim();   // a row with a name on it
    if (chosen >= rowEls.length || !project(chosen)) chosen = Math.max(0, rowEls.findIndex((_, k) => project(k)));
    rowEls.forEach((row, k) => row.classList.toggle('is-chosen', site && k === chosen));
    if (!site) return;
    const kinds = rowEls.map((_, k) => project(k) ? 'BUTTON' : 'SPAN');
    if (kinds.join() !== [...keysEl.children].map(key => key.tagName).join()) {
      keysEl.replaceChildren(...kinds.map((kind, k) => {
        const key = document.createElement(kind);
        if (kind === 'BUTTON') {
          key.type = 'button';
          key.innerHTML = '<span class="m-led" aria-hidden="true"></span>';
          key.setAttribute('aria-label', 'Row ' + (k + 1));
          key.addEventListener('click', () => { chosen = k; placeFinish(); });
          key.addEventListener('pointerenter', () => boardRows()[k]?.classList.add('is-hover'));
          key.addEventListener('pointerleave', () => boardRows()[k]?.classList.remove('is-hover'));
        }
        return key;
      }));
    }
    const first = cfg.padY * flap.grid.cols + cfg.padX, from = headEl.getBoundingClientRect().left;
    const x = col => flap.cell(Math.min(first + col, flap.grid.cols * flap.grid.rows - 1)).getBoundingClientRect().left - from;
    const longest = Math.min(cfg.statusCols, Math.max(0, ...lines.map(l => (l.split('|')[1] || '').trim().length)));
    headEl.style.setProperty('--project-x', x(0) + 'px');
    headEl.style.setProperty('--released-x', x(cfg.nameCols + cfg.statusCols - longest) + 'px');
    const plate = keysEl.getBoundingClientRect();
    keysEl.style.setProperty('--lamp-x', (flap.cell(first).getBoundingClientRect().left - plate.left) / 2 + 'px');
    [...keysEl.children].forEach((key, k) => {
      const row = rowEls[k].getBoundingClientRect(), box = key.getBoundingClientRect();
      key.setAttribute('aria-pressed', k === chosen);
      key.style.setProperty('--lamp-y', (row.top + row.bottom) / 2 - box.top + 'px');
    });
  }

  // shrink the board when it would be taller than the stage
  function fitBoard() {
    wearFinish();
    const { cols, rows } = flap.grid, style = getComputedStyle(stage);
    // the stand-in record under the board takes its share of the stage, and so do the labels over the board
    const room = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - $('record').offsetHeight - 24 - headEl.offsetHeight;
    const gap = cfg.frame ? cfg.frameGap : cfg.gap, plate = cfg.frame ? cfg.framePad * 2 : 0;
    const tile = (room - plate - (rows - 1) * gap) / (rows * cfg.tileRatio);
    boardEl.style.maxWidth = Math.max(cols * tile + (cols - 1) * gap + plate, 120) + 'px';
    placeFinish();
  }

  let queued = false;
  function changed() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      flap.update(engineConfig());
      fitBoard();
      checkDrum();
      if (time > span()) time = span();
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
    } else if (p.type === 'lines') {
      // one pair of fields per board row; a row with no release date is stored without the |
      const list = document.createElement('div'), add = document.createElement('button');
      list.className = 'pairs'; list.id = id; list.setAttribute('role', 'group');
      add.type = 'button'; add.className = 'chip'; add.textContent = 'Add row';
      const read = () => [...list.children].map(pair => {
        const [name, date] = [...pair.querySelectorAll('input')].map(input => input.value);
        return date.trim() ? name + '|' + date : name;
      });
      const commit = () => { cfg.lines = read(); checkDrum(); changed(); mark(); };
      const field = (text, label, cls) => {
        const input = document.createElement('input');
        input.type = 'text'; input.value = text; input.spellcheck = false; input.className = cls;
        input.setAttribute('aria-label', label);
        input.addEventListener('input', commit);
        return input;
      };
      const draw = () => {
        list.replaceChildren(...cfg.lines.map((line, i) => {
          const at = line.indexOf('|'), pair = document.createElement('div'), remove = document.createElement('button');
          pair.className = 'pair';
          remove.type = 'button'; remove.className = 'pair__remove'; remove.textContent = '×';
          remove.setAttribute('aria-label', `Remove row ${i + 1}`);
          remove.disabled = cfg.lines.length < 2;
          remove.addEventListener('click', () => { cfg.lines = cfg.lines.filter((_, k) => k !== i); draw(); checkDrum(); changed(); mark(); });
          pair.append(field(at < 0 ? line : line.slice(0, at).trimEnd(), `Row ${i + 1} project name`, 'pair__name'),
            field(at < 0 ? '' : line.slice(at + 1).trim(), `Row ${i + 1} release date`, 'pair__date'), remove);
          return pair;
        }));
      };
      add.addEventListener('click', () => { cfg.lines = [...cfg.lines, '']; draw(); list.lastChild.querySelector('input').focus(); checkDrum(); changed(); mark(); });
      const heads = document.createElement('div');
      heads.className = 'pair pair--head';
      heads.innerHTML = '<span>Project</span><span>Released</span><span></span>';
      row.append(heads, list, add);
      sync = () => { if (!same(read(), cfg.lines)) draw(); };
    } else {
      const box = document.createElement('input');
      box.type = 'text'; box.id = id; box.spellcheck = false;
      row.append(box);
      box.addEventListener('input', () => {
        cfg[p.key] = box.value;
        checkDrum();
        changed();
        mark();
      });
      sync = () => { if (box.value !== cfg[p.key]) box.value = cfg[p.key]; };
    }

    row.append(hint);
    const mark = () => row.classList.toggle('is-changed', !same(cfg[p.key], base[p.key]));
    const syncOuter = sync;
    sync = () => { syncOuter(); mark(); };
    row.querySelector('.row__reset').addEventListener('click', () => {
      cfg[p.key] = base[p.key]; sync(); checkDrum(); changed();
    });
    rows.push({ p, sync, hint, row });
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

  // Plain or Work page, beside it
  const finishButtons = [...document.querySelectorAll('#finish-switch button')];
  const syncFinish = () => finishButtons.forEach(button => button.setAttribute('aria-pressed', button.dataset.finish === finish));
  finishButtons.forEach(button => button.addEventListener('click', () => {
    finish = button.dataset.finish;
    try { localStorage.setItem(FINISH_STORE, finish); } catch (e) { /* private mode */ }
    syncFinish();
    fitBoard();
  }));
  syncFinish();

  function checkDrum() {
    const row = rows.find(r => r.p.key === 'lines');
    const missing = [...new Set([...cfg.lines.join('')])].filter(ch => ch !== '|' && !cfg.chars.includes(ch));
    // a part longer than its column is cut to fit on the board
    const wide = cfg.nameCols > 0 ? cfg.lines.filter(l => l.includes('|')).flatMap(l => {
      const [name, status = ''] = l.split('|').map(part => part.trim());
      const texts = [[name, cfg.nameCols], [status, cfg.statusCols]];
      return texts.filter(([text, cols]) => text.length > cols).map(([text]) => text);
    }) : [];
    row.hint.classList.toggle('is-warning', missing.length > 0 || wide.length > 0);
    row.hint.textContent = missing.length
      ? `Not on the drum, so added to the end of it: ${missing.join(' ')}`
      : wide.length ? `Cut to fit its column: ${[...new Set(wide)].join(', ')}`
      : row.p.hint;
  }

  const SITE_KEYS = Object.keys(DEFAULTS).filter(k => k !== 'seed');

  // what a site config needs to reproduce the current settings
  function overrides() {
    const diff = {};
    SITE_KEYS.forEach(k => { if (!same(cfg[k], DEFAULTS[k])) diff[k] = cfg[k]; });
    return diff;
  }

  // light boards only set the look, so in light mode only those settings count
  const keysFor = m => m === 'light' ? STYLE_KEYS : SITE_KEYS;
  const modeOf = version => version.mode === 'light' ? 'light' : 'dark';

  // how many settings on the panel differ from what a config would show, in the current mode
  const differences = config => {
    const full = { ...DEFAULTS, ...config };
    return keysFor(mode).filter(k => !same(cfg[k], full[k])).length;
  };

  function refreshCount() {
    const count = differences(resolveConfig(store, mode));
    $('count').textContent = count ? `${count} from ${mode} active` : `Matches ${mode} active`;
    $('version-use').disabled = !count;
    $('version-use').textContent = count ? 'Use on landing page' : 'On landing page';
  }

  $('reset').addEventListener('click', () => {
    if (mode === 'light') return takeMode();
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
  let mode = 'dark';   // which landing-page board the lab is working on; see setMode()
  try { if (localStorage.getItem('split-flap-lab/mode') === 'light') mode = 'light'; } catch (e) { /* private mode */ }

  // each mode has its own active version: store.active is dark, store.activeLight is light
  const activeId = m => m === 'light' ? store.activeLight : store.active;
  const setActive = (next, id, m) => { if (m === 'light') next.activeLight = id; else next.active = id; };
  const onPage = (m, name) => `${name} is the ${m} board on the local landing page. ${PUBLISH}`;
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
    // a board on the page in the other mode can't be replaced by this one
    const existing = store.versions.find(v => v.name === name);
    const other = mode === 'light' ? 'dark' : 'light';
    if (existing && existing.id === activeId(other)) {
      status(`${name} is the ${other} board on the landing page. Save this ${mode} board under a new name.`);
      $('version-name').focus();
      return;
    }
    commit(next => {
      const i = next.versions.findIndex(v => v.name === name);
      const entry = {
        id: i < 0 ? Date.now().toString(36) : next.versions[i].id,
        name, mode, savedAt: new Date().toISOString(),
        config: mode === 'light' ? pickStyle(cfg) : overrides(),
        lab: { seed: cfg.seed },
      };
      if (i < 0) next.versions.push(entry); else next.versions[i] = entry;
      if (makeActive) setActive(next, entry.id, mode);
    }, done);
  }

  function loadVersion(version) {
    if (modeOf(version) !== mode) setMode(modeOf(version), false);
    Object.keys(cfg).forEach(k => { delete cfg[k]; });
    Object.assign(cfg, DEFAULTS, LAB_ONLY, version.lab,
      modeOf(version) === 'light' ? { ...resolveConfig(store, 'dark'), ...pickStyle({ ...DEFAULTS, ...version.config }) } : version.config);
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
      const isActive = version.id === activeId(modeOf(version));
      const inUse = version.id === store.active || version.id === store.activeLight;
      const actions = document.createElement('div');
      actions.className = 'version__actions';
      actions.append(chip('Load', () => loadVersion(version)));
      if (isActive) {
        actions.append(Object.assign(document.createElement('span'), { className: 'version__badge', textContent: 'Active' }));
      } else if (canWrite) {
        actions.append(chip('Set active', () => commit(
          next => setActive(next, version.id, modeOf(version)),
          onPage(modeOf(version), version.name),
        )));
        if (version.id !== ORIGINAL && !inUse) {
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
      const label = Object.assign(document.createElement('span'), { className: 'version__name', textContent: version.name });
      label.append(Object.assign(document.createElement('span'), { className: 'version__mode', textContent: modeOf(version) === 'light' ? 'Light' : 'Dark' }));
      item.append(
        label,
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
    saveBoard(name, false, `Saved ${name} as a ${mode} board.`);
  });

  // one step from the panel to the landing page: a board that's already saved just goes active
  $('version-use').addEventListener('click', () => {
    const name = $('version-name').value.trim();
    const match = store.versions.find(v => modeOf(v) === mode && differences(v.config) === 0);
    if (match) {
      commit(next => setActive(next, match.id, mode), onPage(mode, match.name));
    } else if (name) {
      saveBoard(name, true, `Saved ${name}. ${onPage(mode, name)}`);
    } else {
      status('Name this board first.');
      $('version-name').focus();
    }
  });

  /* ---- Light and dark: the lab page takes the mode, and the board takes that mode's active look.
     A light board is only its look (STYLE_KEYS: colours and lighting); size, layout and timing are
     the dark active board's. So in Light mode the panel shows the dark board's settings and locks
     everything but the look, and a light save stores only the look. ---- */
  const pickStyle = config => Object.fromEntries(STYLE_KEYS.map(k => [k, config[k]]));
  const FREE = ['lines', 'chars', 'seed'];   // the lab's message and shuffle, never part of a board
  function takeMode() {
    const look = { ...DEFAULTS, ...resolveConfig(store, mode) };
    const keys = mode === 'light' ? SITE_KEYS.filter(k => !FREE.includes(k)) : STYLE_KEYS;
    keys.forEach(k => { cfg[k] = look[k]; });
    rows.forEach(r => r.sync());
    checkDrum();
    refreshEase();
    changed();
  }
  function lockRows() {
    const light = mode === 'light';
    rows.forEach(r => {
      if (!r.row) return;
      const locked = light && !STYLE_KEYS.includes(r.p.key) && !FREE.includes(r.p.key);
      r.row.classList.toggle('is-locked', locked);
      r.row.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = locked; });
    });
    frameButtons.forEach(button => { button.disabled = light; });
  }
  const MODE_STORE = 'split-flap-lab/mode';
  function setMode(next, takeLook = true) {
    mode = next;
    if (mode === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(MODE_STORE, mode); } catch (e) { /* private mode */ }
    $('mode-switch').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    lockRows();
    if (takeLook) {
      takeMode();
      status(mode === 'light'
        ? 'Showing the light board: its colours and lighting on the dark board. Only colours and lighting change in Light mode.'
        : "Showing the dark board's colours and lighting.");
    }
    drawPlot();
    drawTracks();
    renderVersions();
    refreshCount();
  }
  $('mode-switch').addEventListener('click', e => {
    const button = e.target.closest('button[data-mode]');
    if (button && button.dataset.mode !== mode) setMode(button.dataset.mode);
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
    recordEase: 'How the project panel fades in and settles under the board. Watch the stand-in panel.',
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
      <line x1="${px(ax)}" y1="${py(ay)}" x2="${px(x)}" y2="${py(y)}" style="stroke: var(--fg)" stroke-opacity=".5" vector-effect="non-scaling-stroke"/>
      <circle data-handle="${i}" cx="${px(x)}" cy="${py(y)}" r="6" style="fill: var(--fg); cursor: grab"/>`;
    plot.innerHTML = `
      <rect x="${px(0)}" y="${py(1)}" width="${px(1) - px(0)}" height="${py(0) - py(1)}" style="fill: var(--surface); stroke: var(--line-strong)"/>
      <path d="${d}" fill="none" style="stroke: var(--fg)" stroke-width="2" stroke-linejoin="round"/>
      ${h ? handle(h[0], h[1], 0, 0, 0) + handle(h[2], h[3], 1, 1, 1) : ''}
      <circle id="probe" r="4" style="fill: var(--fg)" visibility="hidden"/>`;
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
    if (target === 'recordEase') {
      const u = cfg.recordFadeMs > 0 ? (time - (flap.duration - cfg.recordLeadMs)) / cfg.recordFadeMs : -1;
      if (!(u > 0 && u < 1)) return probe.setAttribute('visibility', 'hidden');
      probe.setAttribute('cx', px(u));
      probe.setAttribute('cy', py(resolveEase(cfg.recordEase)(u)));
      return probe.setAttribute('visibility', 'visible');
    }
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
  // The timeline runs to the board's last flap or to the end of the record's entrance, whichever
  // is later, so an entrance that starts at or after the landing can still be seen and scrubbed.
  const span = () => Math.max(flap.duration, flap.duration - cfg.recordLeadMs + cfg.recordFadeMs);
  const timeX = t => LABEL_W + t / span() * (tracksEl.clientWidth - LABEL_W - RIGHT);

  function drawTracks() {
    const dpr = window.devicePixelRatio || 1;
    const w = tracksEl.clientWidth, h = tracksEl.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.font = '10px Geist, sans-serif';
    g.textBaseline = 'middle';
    // the page's own colours, so the timeline flips with light/dark
    const css = getComputedStyle(document.body), token = name => css.getPropertyValue(name).trim();
    const fg = token('--fg') || css.color, muted = token('--muted') || fg, line = token('--line-strong') || muted;

    // ruler
    const stepMs = [50, 100, 250, 500, 1000, 2000, 5000].find(s => timeX(s) - timeX(0) > 56) || 10000;
    g.fillStyle = muted; g.textAlign = 'left';
    for (let t = 0; t <= flap.duration; t += stepMs) {
      g.fillRect(timeX(t), 2, 1, RULER_H - 6);
      if (timeX(t) + 40 < w) g.fillText((t / 1000).toFixed(stepMs < 1000 ? 2 : 0) + 's', timeX(t) + 4, 7);
    }

    const tracks = textTracks(), ease = resolveEase(cfg.spinEase);
    const rowH = (h - RULER_H) / tracks.length, barH = Math.max(3, Math.min(rowH - 2, 10));
    tracks.forEach((m, i) => {
      const y = RULER_H + i * rowH + (rowH - barH) / 2;
      g.fillStyle = muted; g.textAlign = 'center';
      if (rowH >= 8) g.fillText(m.ch, LABEL_W / 2 - 2, y + barH / 2);
      const x0 = timeX(m.start), x1 = timeX(m.start + m.spinMs), x2 = timeX(m.end);
      g.fillStyle = line; g.fillRect(x0, y, x1 - x0, barH);
      g.globalAlpha = 0.8; g.fillStyle = fg; g.fillRect(x1, y, Math.max(x2 - x1, 1), barH); g.globalAlpha = 1;
      // a tick at every character change, so the spin curve shows up as their spacing
      g.fillStyle = muted;
      let seen = 0;
      for (let k = 0; k <= 400; k++) {
        const f = Math.floor(clamp(ease(k / 400), 0, 1) * m.flips);
        if (f !== seen) { seen = f; g.fillRect(x0 + k / 400 * (x1 - x0), y, 1, barH); }
      }
    });
  }

  function showTime() {
    $('now').textContent = (time / 1000).toFixed(3);
    $('total').textContent = (span() / 1000).toFixed(3);
    head.style.transform = `translateX(${timeX(time)}px)`;
    tracksEl.setAttribute('aria-valuemax', Math.round(span()));
    tracksEl.setAttribute('aria-valuenow', Math.round(time));
    tracksEl.setAttribute('aria-valuetext', (time / 1000).toFixed(2) + ' seconds');
    moveProbe();
    moveRecord();
  }

  // The stand-in for the home page's project panel: where it is at this point on the timeline.
  // Its curve is the easing editor's "Record" target.
  function moveRecord() {
    const start = flap.duration - cfg.recordLeadMs;
    const p = cfg.recordFadeMs > 0 ? clamp((time - start) / cfg.recordFadeMs, 0, 1) : (time >= start ? 1 : 0);
    const e = resolveEase(cfg.recordEase)(p), record = $('record');
    record.style.opacity = clamp(e, 0, 1);
    record.style.transform = `translateY(${-(1 - e) * cfg.recordDrop}px)`;
    record.style.filter = cfg.recordBlur > 0 && e < 1 ? `blur(${Math.max(0, 1 - e) * cfg.recordBlur}px)` : '';
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
    time = clamp(t, 0, span());
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
    if (direction === 1 && time >= span()) {
      if (!$('loop').checked) return setDirection(0);
      holdUntil = now + LOOP_HOLD_MS;
    } else if (direction === -1 && time <= 0) {
      return setDirection(0);
    }
    requestAnimationFrame(tick);
  }

  const play = () => {
    if (direction === 1) return;
    if (time >= span()) moveTo(0);
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
    moveTo((e.clientX - box.left - LABEL_W) / (box.width - LABEL_W - RIGHT) * span());
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
  setMode(mode, false);
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
    const active = store.versions.find(v => v.id === store.active);
    if (mode === 'light') takeMode();
    else if (active && !Object.keys(saved).length) loadVersion(active);
    renderVersions();
    refreshCount();
  }).catch(() => status(`Couldn't read ${FILE}.`));
  drawTracks();
  showTime();
  setDirection(0);
  flap.ready.then(() => {
    drawTracks();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) moveTo(span());
    else play();
  });
})();
