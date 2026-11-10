/* Halftone Lab: tune the dot transition at the top of each work section. halftone.js draws it
   here and on the home page from the same settings. */
(function () {
  const $ = id => document.getElementById(id);
  const DEFAULTS = Halftone.DEFAULTS;
  const KEYS = Object.keys(DEFAULTS);
  const cfg = { ...Halftone.activeConfig() };   // replaced once the saved versions load

  // the home page's section colours, top to bottom. Keep in step with index.html.
  const SECTIONS = [
    ['Night', '--c-night'], ['Rust', '--c-rust'], ['Navy', '--c-navy'],
    ['Ochre', '--c-ochre'], ['Night', '--c-night'], ['Sage', '--c-sage'],
  ];
  const DARK_TEXT = new Set(['Ochre', 'Sage']);

  /* ---- Parameters ---- */
  const PARAMS = [
    { group: 'Band' },
    { key: 'height', name: 'Height', min: 40, max: 400, step: 1, unit: 'px' },
    { key: 'start', name: 'Ramp start', min: -0.5, max: 1, step: 0.01, hint: 'Where dots begin, as a share of the band height' },
    { key: 'end', name: 'Ramp end', min: 0, max: 1.5, step: 0.01 },
    { key: 'curve', name: 'Curve', min: 0.25, max: 4, step: 0.01, hint: 'Above 1 keeps dots small for longer' },
    { group: 'Screen' },
    {
      key: 'cell', name: 'Density', min: 2, max: 60, step: 0.5, unit: 'rows',
      get: () => Math.round(cfg.height / cfg.cell * 2) / 2, set: v => { cfg.cell = cfg.height / v; },
      hint: 'Rows of dots across the transition. More rows: more, smaller dots',
    },
    { key: 'dotSize', name: 'Dot size', min: 0.3, max: 1.5, step: 0.01, unit: '×', hint: 'Below 1 leaves more space between dots. They still fill in at the bottom' },
    { key: 'grid', name: 'Grid', options: ['offset', 'hex', 'square'] },
    { key: 'shape', name: 'Dot shape', options: ['round', 'square', 'diamond', 'line'] },
    { key: 'perDot', name: 'One size per dot', bool: true, hint: 'Off: size follows each pixel, so dots taper' },
    { key: 'angle', name: 'Angle', min: -90, max: 90, step: 1, unit: '°' },
    { key: 'stretch', name: 'Vertical stretch', min: 0.25, max: 4, step: 0.01, unit: '×' },
    { key: 'softness', name: 'Edge softness', min: 0.2, max: 8, step: 0.1, unit: 'px' },
    { group: 'Distort', zero: true },
    { key: 'waveAmp', name: 'Wave height', min: 0, max: 160, step: 1, unit: 'px' },
    { key: 'waveLen', name: 'Wave length', min: 40, max: 2400, step: 10, unit: 'px' },
    { key: 'wavePhase', name: 'Wave phase', min: 0, max: 360, step: 1, unit: '°' },
    { key: 'raggedAmp', name: 'Ragged edge', min: 0, max: 160, step: 1, unit: 'px' },
    { key: 'raggedScale', name: 'Ragged scale', min: 5, max: 800, step: 1, unit: 'px' },
    { key: 'mottleAmp', name: 'Mottle', min: 0, max: 1, step: 0.01, hint: 'Patchy noise through the dots' },
    { key: 'mottleScale', name: 'Mottle scale', min: 5, max: 400, step: 1, unit: 'px' },
    { key: 'warpAmp', name: 'Grid warp', min: 0, max: 60, step: 0.5, unit: 'px' },
    { key: 'warpLen', name: 'Warp length', min: 20, max: 1200, step: 5, unit: 'px' },
    { key: 'sizeTop', name: 'Pitch at top', min: 0.25, max: 4, step: 0.01, unit: '×' },
    { key: 'sizeBottom', name: 'Pitch at bottom', min: 0.25, max: 4, step: 0.01, unit: '×' },
    { key: 'jitter', name: 'Jitter', min: 0, max: 1, step: 0.01 },
    { key: 'seed', name: 'Seed', min: 1, max: 999, step: 1, shuffle: true },
    { group: 'Animate' },
    { key: 'animate', name: 'Animate mottle', bool: true, hint: 'Mottle strength wanders between the limits below, differently along the band' },
    { key: 'mottleMin', name: 'Mottle low', min: 0, max: 1, step: 0.01 },
    { key: 'mottleMax', name: 'Mottle high', min: 0, max: 1, step: 0.01 },
    { key: 'flow', name: 'Flow', min: -400, max: 400, step: 1, unit: 'px/s', hint: 'Moves the whole band sideways: dots, mottle and edge travel together. Positive is left to right' },
    { key: 'heaveAmp', name: 'Heave', min: 0, max: 120, step: 1, unit: 'px', hint: 'Swells that rise and fall as the band travels, carrying the mottle with them' },
    { key: 'heaveLen', name: 'Heave length', min: 40, max: 2000, step: 10, unit: 'px' },
    { key: 'rise', name: 'Rise', min: 0, max: 200, step: 1, unit: 'px/s', hint: 'Mottle drifts upward, like steam lifting off the solid. Needs some mottle' },
    { key: 'morph', name: 'Morph', min: 0, max: 3, step: 0.01, unit: '/s', hint: 'How fast the mottle changes shape as it goes' },
    { key: 'chaos', name: 'Randomness', min: 0, max: 1, step: 0.01, hint: 'Speeds up and slows down the heave, rise and mottle at random, and keeps the mottle changing shape' },
    { key: 'animPeriod', name: 'Swing time', min: 0.5, max: 20, step: 0.1, unit: 's', hint: 'Roughly how long one swing or swell takes' },
    { key: 'animFps', name: 'Frame rate', min: 4, max: 60, step: 1, unit: 'fps' },
    { group: 'Cursor' },
    { key: 'cursor', name: 'Cursor stirs the dots', bool: true, hint: 'Move the pointer through the band, like a hand through smoke. Needs WebGL' },
    { key: 'cursorRadius', name: 'Hand size', min: 8, max: 160, step: 1, unit: 'px', hint: 'Width of the stirred patch, and of the vortices it sheds' },
    { key: 'cursorForce', name: 'Push', min: 0, max: 3, step: 0.05, unit: '×', hint: 'How hard the pointer drags the air: 1 moves it at the pointer\'s speed' },
    { key: 'cursorDots', name: 'Dot bend', min: 0, max: 1, step: 0.05, hint: 'How much the dot grid itself bends with the air. 0 keeps dots in place and only moves the transition' },
    { key: 'cursorSwirl', name: 'Swirl', min: 0, max: 3, step: 0.05, hint: 'Tighter, more uneven vortices that curl and roll up' },
    { key: 'cursorDrag', name: 'Air glide', min: 0.1, max: 4, step: 0.05, unit: 's', hint: 'How long the air keeps moving after the pointer passes' },
    { key: 'cursorHeal', name: 'Settle time', min: 0.2, max: 10, step: 0.1, unit: 's', hint: 'How long the dots take to drift back into place' },
  ];
  // what "Zero" in the Distort group puts back: every distortion off
  const DISTORT_KEYS = ['animate', 'flow', 'heaveAmp', 'rise', 'morph', 'waveAmp', 'raggedAmp', 'mottleAmp', 'warpAmp', 'sizeTop', 'sizeBottom', 'jitter'];

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rows = [];
  let group = null;

  PARAMS.forEach(p => {
    if (p.group) {
      group = document.createElement('section');
      group.className = 'group';
      const h = document.createElement('h2');
      h.textContent = p.group;
      if (p.zero) {
        const zero = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: 'All off' });
        zero.addEventListener('click', () => { DISTORT_KEYS.forEach(k => { cfg[k] = DEFAULTS[k]; }); syncAll(); changed(); });
        h.append(zero);
      }
      group.append(h);
      $('params').append(group);
      return;
    }
    const row = document.createElement('div');
    row.className = 'row';
    const name = Object.assign(document.createElement('label'), { className: 'row__name', textContent: p.name });
    const value = document.createElement('span');
    value.className = 'row__value';
    const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'row__reset', textContent: '↺' });
    reset.setAttribute('aria-label', `Reset ${p.name}`);
    row.append(name, value, reset);

    let sync;
    const id = 'p-' + p.key;
    if (p.options) {
      const select = document.createElement('select');
      select.id = id;
      p.options.forEach(o => select.append(new Option(o[0].toUpperCase() + o.slice(1), o)));
      select.addEventListener('change', () => { cfg[p.key] = select.value; changed(); });
      value.append(select);
      sync = () => { select.value = cfg[p.key]; };
    } else if (p.bool) {
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', id });
      box.addEventListener('change', () => { cfg[p.key] = box.checked; changed(); });
      value.append(box);
      sync = () => { box.checked = cfg[p.key]; };
    } else {
      const num = Object.assign(document.createElement('input'), { type: 'number', id, min: p.min, max: p.max, step: p.step });
      const range = Object.assign(document.createElement('input'), { type: 'range', min: p.min, max: p.max, step: p.step });
      range.setAttribute('aria-label', p.name);
      const get = p.get || (() => cfg[p.key]);
      const put = p.set || (v => { cfg[p.key] = v; });
      const set = v => { if (Number.isFinite(v) && v > 0 || (Number.isFinite(v) && !p.get)) { put(v); sync(); changed(); } };
      num.addEventListener('change', () => set(parseFloat(num.value)));
      range.addEventListener('input', () => set(parseFloat(range.value)));
      value.append(num);
      if (p.unit) value.append(p.unit);
      if (p.shuffle) {
        const dice = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: 'Shuffle' });
        dice.style.padding = '1px 8px';
        dice.addEventListener('click', () => set(1 + Math.floor(Math.random() * 999)));
        value.append(dice);
      }
      row.append(range);
      sync = () => { num.value = get(); range.value = get(); };
    }
    name.htmlFor = id;
    if (p.hint) row.append(Object.assign(document.createElement('small'), { className: 'row__hint', textContent: p.hint }));
    reset.addEventListener('click', () => { cfg[p.key] = DEFAULTS[p.key]; syncAll(); changed(); });
    const syncRow = () => { sync(); row.classList.toggle('is-changed', !same(cfg[p.key], DEFAULTS[p.key])); };
    rows.push(syncRow);
    group.append(row);
  });
  const syncAll = () => rows.forEach(r => r());

  /* ---- Preview ---- */
  const root = getComputedStyle(document.documentElement);
  const colour = token => Halftone.rgb(root.getPropertyValue(token).trim());
  const css = c => `rgb(${c.join(',')})`;

  // pair options: every transition on its own, or the whole page in order
  SECTIONS.slice(1).forEach(([name], i) => {
    $('pair').append(new Option(`${SECTIONS[i][0]} → ${name}`, String(i)));
  });
  $('pair').append(new Option('Whole page', 'all'));
  $('pair').value = '0';

  let zoom = 1;
  $('zoom').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    zoom = Number(b.dataset.zoom);
    $('zoom').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  $('pair').addEventListener('change', render);
  $('edge').addEventListener('change', render);

  function solid([name, token], height) {
    const el = document.createElement('div');
    el.className = 'preview__solid';
    const c = colour(token);
    el.style.background = css(c);
    el.style.color = DARK_TEXT.has(name) ? 'var(--c-night)' : 'var(--c-mist)';
    if (height) el.style.height = height + 'px';
    el.append(Object.assign(document.createElement('span'), { textContent: name }));
    return el;
  }

  // The layout (solid blocks and seams) is rebuilt only when the pair, zoom, width or band reach
  // changes; every other change just redraws the canvases, which WebGL does in a frame.
  let seams = [], layoutKey = '', anim = null;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  function layout(W, reach) {
    seams.forEach(sm => { sm.r.dispose(); if (sm.stir) sm.stir.dispose(); });
    seams = [];
    const seam = (from, to) => {
      const el = document.createElement('div');
      el.className = 'preview__seam';
      const canvas = document.createElement('canvas');
      canvas.style.top = -reach + 'px';
      canvas.style.height = reach * 2 + 'px';
      el.append(canvas);
      if ($('edge').checked) el.append(Object.assign(document.createElement('div'), { className: 'preview__edge' }));
      seams.push({ canvas, r: Halftone.renderer(canvas), from: colour(from[1]), to: colour(to[1]) });
      return el;
    };
    const room = Math.ceil(reach) + 120;
    const parts = [];
    if ($('pair').value === 'all') {
      SECTIONS.forEach((sec, i) => {
        if (i) parts.push(seam(SECTIONS[i - 1], sec));
        parts.push(solid(sec, i === 0 || i === SECTIONS.length - 1 ? room : room * 2 - 120));
      });
    } else {
      const i = Number($('pair').value);
      parts.push(solid(SECTIONS[i], room + 40), seam(SECTIONS[i], SECTIONS[i + 1]), solid(SECTIONS[i + 1], room + 40));
    }
    $('preview').replaceChildren(...parts);
  }

  // zoomed: draw the left 1/zoom of the band at zoom × the pixel density, shown at full width
  const paintAll = (settings, W) => seams.forEach(sm => sm.r.draw(settings, W / zoom, dpr() * zoom, sm.from, sm.to));

  function render() {
    const W = $('stage').clientWidth;
    if (!W) return;
    const reach = (cfg.height / 2 + Halftone.bleed(cfg)) * zoom;   // canvas reach either side of the edge
    const key = [W, zoom, $('pair').value, $('edge').checked, reach].join('|');
    if (key !== layoutKey) { layout(W, reach); layoutKey = key; }
    if (anim) { anim.stop(); anim = null; }
    const t0 = performance.now();
    paintAll(Halftone.at(cfg, 0), W);
    const gpu = seams.every(sm => sm.r.gpu);
    $('time').textContent = `${Math.round(performance.now() - t0)} ms${gpu ? '' : ' · no WebGL'}`;
    // animation and the cursor both draw through play(); the readout shows fps while drawing
    let last = performance.now(), frames = 0;
    anim = Halftone.play(seams, { ...cfg }, {
      width: () => W / zoom, dpr: () => dpr() * zoom,
      onFrame(drew) {
        if (drew) frames++;
        const now = performance.now();
        if (now - last > 500) { if (frames) $('time').textContent = `${Math.round(frames * 1000 / (now - last))} fps`; frames = 0; last = now; }
      },
    });
  }

  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
  new ResizeObserver(schedule).observe($('stage'));

  function changed() {
    rows.forEach(r => r());
    refreshCount();
    schedule();
  }

  /* ---- Config ---- */
  function overrides() {
    const diff = {};
    KEYS.forEach(k => { if (!same(cfg[k], DEFAULTS[k])) diff[k] = cfg[k]; });
    return diff;
  }
  function differences(version) {
    const config = { ...DEFAULTS, ...version.config };
    return KEYS.filter(k => !same(cfg[k], config[k])).length;
  }
  function refreshCount() {
    const count = differences(activeVersion());
    $('count').textContent = count ? `${count} from active` : 'Matches active';
    $('version-use').disabled = !count;
    $('version-use').textContent = count ? 'Use on landing page' : 'On landing page';
  }

  $('reset').addEventListener('click', () => { Object.assign(cfg, DEFAULTS); changed(); });
  $('copy').addEventListener('click', async () => {
    const button = $('copy');
    const text = JSON.stringify(overrides(), null, 2);
    let label = 'Copied';
    try { await navigator.clipboard.writeText(text); } catch (e) { label = 'Copy failed'; console.log(text); }
    button.textContent = label;
    setTimeout(() => { button.textContent = 'Copy config'; }, 1200);
  });

  /* ---- Versions: kept in halftone-versions.js, which the home page reads. The local server
     (tools/lab-server.mjs, started by `dvs`) writes that file. Deployed, the lab can only read it. ---- */
  const FILE = 'halftone-versions.js';
  const FILE_URL = '../../' + FILE;
  const API = '/__lab/halftone';
  const ORIGINAL = 'original';
  const PUBLISH = `Push ${FILE} to publish.`;
  let store = window.HALFTONE_VERSIONS || { active: ORIGINAL, versions: [{ id: ORIGINAL, name: 'Original', savedAt: null, config: {} }] };
  let canWrite = false;

  const activeVersion = () => store.versions.find(v => v.id === store.active) || { config: {} };
  const parseStore = text => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const status = text => { $('version-status').textContent = text; };

  async function readStore() {
    const response = await fetch(API, { cache: 'no-store' });
    if (!response.ok) throw new Error(`The server answered ${response.status}.`);
    return response.json();
  }

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

  function saveVersion(name, makeActive, done) {
    if (store.versions.some(v => v.id === ORIGINAL && v.name === name)) {
      status('Original stays as it is. Give this one a new name.');
      $('version-name').focus();
      return;
    }
    commit(next => {
      const i = next.versions.findIndex(v => v.name === name);
      const entry = { id: i < 0 ? Date.now().toString(36) : next.versions[i].id, name, savedAt: new Date().toISOString(), config: overrides() };
      if (i < 0) next.versions.push(entry); else next.versions[i] = entry;
      if (makeActive) next.active = entry.id;
    }, done);
  }

  function loadVersion(version) {
    Object.assign(cfg, DEFAULTS, version.config);
    changed();
    $('version-name').value = version.id === ORIGINAL ? '' : version.name;
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
      const actions = document.createElement('div');
      actions.className = 'version__actions';
      actions.append(chip('Load', () => loadVersion(version)));
      if (version.id === store.active) {
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
    saveVersion(name, false, `Saved ${name}.`);
  });

  $('version-use').addEventListener('click', () => {
    const name = $('version-name').value.trim();
    const match = store.versions.find(v => differences(v) === 0);
    if (match) {
      commit(next => { next.active = match.id; }, `${match.name} is on the local landing page. ${PUBLISH}`);
    } else if (name) {
      saveVersion(name, true, `Saved ${name}. It's on the local landing page. ${PUBLISH}`);
    } else {
      status('Name this version first.');
      $('version-name').focus();
    }
  });

  /* ---- Start: open on the active version ---- */
  readStore().then(data => {
    canWrite = true;
    $('version-tools').hidden = false;
    return data;
  }).catch(async () => {
    status('Read only here. Run the lab locally with dvs to save versions.');
    return parseStore(await (await fetch(FILE_URL, { cache: 'no-store' })).text());
  }).then(data => {
    store = data;
    Object.assign(cfg, DEFAULTS, activeVersion().config);
    renderVersions();
    changed();
  }).catch(() => { status(`Couldn't read ${FILE}.`); renderVersions(); changed(); });
})();
