/* Button Lab: tune the nav buttons ("chips") and the static spark. buttons.js applies the same
   settings on the site, from the version named "active" in button-versions.js. */
(function () {
  const $ = id => document.getElementById(id);
  const DEFAULTS = Buttons.DEFAULTS;
  const KEYS = Object.keys(DEFAULTS);
  const clone = v => JSON.parse(JSON.stringify(v));
  const cfg = clone(Buttons.activeConfig());   // replaced once the saved versions load
  // fill cfg from a config, copying the shadow list so edits never touch DEFAULTS or a version
  const load = config => { Object.assign(cfg, clone({ ...DEFAULTS, ...config })); };

  /* ---- Parameters ---- */
  const PARAMS = [
    { group: 'Shape' },
    { key: 'height', name: 'Height', min: 20, max: 64, step: 1, unit: 'px' },
    { key: 'padX', name: 'Side padding', min: 0, max: 48, step: 1, unit: 'px' },
    { key: 'radius', name: 'Corner radius', min: 0, max: 32, step: 1, unit: 'px', hint: 'Half the height or more makes a full pill' },
    { key: 'border', name: 'Border width', min: 0, max: 4, step: 0.5, unit: 'px' },
    { key: 'gap', name: 'Gap between buttons', min: 0, max: 40, step: 1, unit: 'px' },
    { group: 'Type' },
    { key: 'fontSize', name: 'Size', min: 10, max: 22, step: 0.5, unit: 'px' },
    { key: 'fontWeight', name: 'Weight', min: 300, max: 800, step: 100 },
    { key: 'tracking', name: 'Letter spacing', min: -0.05, max: 0.2, step: 0.005, unit: 'em' },
    { key: 'uppercase', name: 'Uppercase', bool: true },
    { key: 'mono', name: 'Mono type', bool: true },
    { key: 'labelLift', name: 'Label lift', min: -3, max: 3, step: 0.25, unit: 'px', hint: 'Raises the label above true centre so it looks centred. Icons stay put' },
    { group: 'Fill' },
    { key: 'angle', name: 'Gradient angle', min: 0, max: 360, step: 1, unit: '°', hint: '180 runs top colour to bottom colour, straight down' },
    { group: 'Dark theme' },
    { key: 'topD', name: 'Top', color: true },
    { key: 'bottomD', name: 'Bottom', color: true },
    { key: 'edgeD', name: 'Border', color: true },
    { key: 'textD', name: 'Label', color: true },
    { group: 'Light theme' },
    { key: 'topL', name: 'Top', color: true },
    { key: 'bottomL', name: 'Bottom', color: true },
    { key: 'edgeL', name: 'Border', color: true },
    { key: 'textL', name: 'Label', color: true },
    { group: 'Grain' },
    { key: 'grain', name: 'Strength', min: 0, max: 1, step: 0.01, hint: 'The split-flap film grain. The boards use 0.08' },
    { key: 'grainSize', name: 'Scale', min: 20, max: 300, step: 1, unit: 'px', hint: 'Size of the repeating tile: smaller is finer' },
    { key: 'grainBlend', name: 'Blend', options: ['normal', 'overlay', 'soft-light', 'multiply', 'screen'] },
    { group: 'Shadows', stack: true },
    { group: 'States' },
    { key: 'hoverBright', name: 'Hover brightness', min: 0.5, max: 2, step: 0.01, unit: '×' },
    { key: 'pressBright', name: 'Pressed brightness', min: 0.5, max: 1.5, step: 0.01, unit: '×' },
    { key: 'pressY', name: 'Pressed nudge', min: 0, max: 4, step: 0.5, unit: 'px' },
    { key: 'currentBright', name: 'Current page brightness', min: 0.5, max: 1.5, step: 0.01, unit: '×', hint: 'Also an open menu' },
    { key: 'speed', name: 'Transition', min: 0, max: 600, step: 10, unit: 'ms' },
    { group: 'Spark' },
    { key: 'spark', name: 'Spark on', bool: true, hint: 'Bring the pointer close to a button above to try it' },
    { key: 'sparkJump', name: 'Jump distance', min: 5, max: 150, step: 1, unit: 'px', hint: 'How close the pointer gets before a bolt jumps' },
    { key: 'sparkLife', name: 'Duration', min: 50, max: 1500, step: 10, unit: 'ms' },
    { key: 'sparkRestrike', name: 'Flicker', min: 16, max: 300, step: 1, unit: 'ms', hint: 'How often the bolt re-strikes in a new shape' },
    { key: 'sparkJag', name: 'Jaggedness', min: 0, max: 1.2, step: 0.01 },
    { key: 'sparkCore', name: 'Core width', min: 0, max: 4, step: 0.1, unit: 'px' },
    { key: 'sparkGlow', name: 'Glow width', min: 0, max: 10, step: 0.1, unit: 'px' },
    { key: 'sparkBlur', name: 'Glow blur', min: 0, max: 30, step: 1, unit: 'px' },
    { key: 'sparkCoreColor', name: 'Core colour', color: true },
    { key: 'sparkGlowColor', name: 'Glow colour', color: true },
    { key: 'sparkFlash', name: 'Button flashes', bool: true },
  ];

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const HEX = /^#[0-9a-f]{6}$/i;
  // one shared <datalist> of the site palette (from buttons.js) for every colour picker
  function paletteList() {
    if (!document.getElementById('palette-swatches')) {
      const list = Object.assign(document.createElement('datalist'), { id: 'palette-swatches' });
      Object.values(Buttons.PALETTE).forEach(hex => list.append(Object.assign(document.createElement('option'), { value: hex })));
      document.body.append(list);
    }
    return 'palette-swatches';
  }
  const rows = [];
  let group = null;

  PARAMS.forEach(p => {
    if (p.group) {
      group = document.createElement('section');
      group.className = 'group';
      const h = Object.assign(document.createElement('h2'), { textContent: p.group });
      group.append(h);
      $('params').append(group);
      if (p.stack) shadowStack(group, h);
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
      p.options.forEach(o => select.append(new Option(o[0].toUpperCase() + o.slice(1).replace('-', ' '), o)));
      select.addEventListener('change', () => { cfg[p.key] = select.value; changed(); });
      value.append(select);
      sync = () => { select.value = cfg[p.key]; };
    } else if (p.bool) {
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', id });
      box.addEventListener('change', () => { cfg[p.key] = box.checked; changed(); });
      value.append(box);
      sync = () => { box.checked = cfg[p.key]; };
    } else if (p.color) {
      // a swatch and a hex field, kept in step
      const text = Object.assign(document.createElement('input'), { type: 'text', id, spellcheck: false, maxLength: 7 });
      const swatch = Object.assign(document.createElement('input'), { type: 'color' });
      swatch.setAttribute('aria-label', `${p.name} swatch`);
      // the site palette shows as suggested swatches in the picker; picking one links the button to it
      swatch.setAttribute('list', paletteList());
      swatch.addEventListener('input', () => { cfg[p.key] = swatch.value; changed(); });
      text.addEventListener('change', () => {
        const v = text.value.trim().startsWith('#') ? text.value.trim() : '#' + text.value.trim();
        if (HEX.test(v)) { cfg[p.key] = v.toLowerCase(); changed(); } else sync();
      });
      value.append(text, swatch);
      sync = () => { text.value = cfg[p.key]; swatch.value = cfg[p.key]; };
    } else {
      const num = Object.assign(document.createElement('input'), { type: 'number', id, min: p.min, max: p.max, step: p.step });
      const range = Object.assign(document.createElement('input'), { type: 'range', min: p.min, max: p.max, step: p.step });
      range.setAttribute('aria-label', p.name);
      const set = v => { if (Number.isFinite(v)) { cfg[p.key] = v; changed(); } };
      num.addEventListener('change', () => set(parseFloat(num.value)));
      range.addEventListener('input', () => set(parseFloat(range.value)));
      value.append(num);
      if (p.unit) value.append(p.unit);
      row.append(range);
      sync = () => { num.value = cfg[p.key]; range.value = cfg[p.key]; };
    }
    name.htmlFor = id;
    if (p.hint) row.append(Object.assign(document.createElement('small'), { className: 'row__hint', textContent: p.hint }));
    reset.addEventListener('click', () => { cfg[p.key] = DEFAULTS[p.key]; changed(); });
    rows.push(() => { sync(); row.classList.toggle('is-changed', !same(cfg[p.key], DEFAULTS[p.key])); });
    group.append(row);
  });

  /* ---- Shadow stack: any number of box shadows, first on top, as in CSS ---- */
  function shadowStack(group, heading) {
    const SH = Buttons.SHADOW;
    const FIELDS = [
      { key: 'x', name: 'X', min: -20, max: 20, step: 0.5, unit: 'px' },
      { key: 'y', name: 'Y', min: -20, max: 20, step: 0.5, unit: 'px' },
      { key: 'blur', name: 'Blur', min: 0, max: 40, step: 0.5, unit: 'px' },
      { key: 'spread', name: 'Spread', min: -10, max: 10, step: 0.5, unit: 'px' },
      { key: 'alpha', name: 'Opacity', min: 0, max: 1, step: 0.01 },
    ];
    const tools = document.createElement('span');
    tools.style.cssText = 'display:flex;gap:6px';
    const add = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: 'Add' });
    const clear = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: 'Clear' });
    tools.append(clear, add);
    heading.append(tools);
    const list = document.createElement('div');
    group.append(list);
    const empty = Object.assign(document.createElement('small'), { className: 'row__hint', textContent: 'No shadows. Add one: an inset 1px white one at y 1 makes a lit top edge.' });
    let syncs = [];

    add.addEventListener('click', () => { cfg.shadows.push({ ...SH }); build(); changed(); });
    clear.addEventListener('click', () => { cfg.shadows = []; build(); changed(); });

    function build() {
      syncs = [];
      list.replaceChildren(...cfg.shadows.map((sh, i) => card(i)));
      if (!cfg.shadows.length) list.append(empty);
    }

    function card(i) {
      const box = document.createElement('div');
      box.className = 'shadow';
      const top = document.createElement('div');
      top.className = 'shadow__top';
      const title = Object.assign(document.createElement('span'), { className: 'shadow__title', textContent: `Shadow ${i + 1}` });
      const theme = document.createElement('select');
      theme.setAttribute('aria-label', `Shadow ${i + 1} theme`);
      [['both', 'Both themes'], ['dark', 'Dark only'], ['light', 'Light only']].forEach(([v, t]) => theme.append(new Option(t, v)));
      theme.addEventListener('change', () => { cfg.shadows[i].theme = theme.value; changed(); });
      const insetLabel = Object.assign(document.createElement('label'), { className: 'shadow__inset' });
      const inset = Object.assign(document.createElement('input'), { type: 'checkbox' });
      inset.addEventListener('change', () => { cfg.shadows[i].inset = inset.checked; changed(); });
      insetLabel.append(inset, ' Inset');
      const move = (d, label, glyph) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'row__reset shadow__icon', textContent: glyph });
        b.setAttribute('aria-label', `${label} shadow ${i + 1}`);
        const j = i + d;
        if (j < 0 || j >= cfg.shadows.length) b.disabled = true;
        b.addEventListener('click', () => { [cfg.shadows[i], cfg.shadows[j]] = [cfg.shadows[j], cfg.shadows[i]]; build(); changed(); });
        return b;
      };
      const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'row__reset shadow__icon', textContent: '✕' });
      remove.setAttribute('aria-label', `Remove shadow ${i + 1}`);
      remove.addEventListener('click', () => { cfg.shadows.splice(i, 1); build(); changed(); });
      top.append(title, theme, insetLabel, move(-1, 'Raise', '↑'), move(1, 'Lower', '↓'), remove);
      box.append(top);

      const fieldSyncs = FIELDS.map(f => {
        const row = document.createElement('div');
        row.className = 'row row--compact';
        const id = `sh-${i}-${f.key}`;
        const name = Object.assign(document.createElement('label'), { className: 'row__name', textContent: f.name, htmlFor: id });
        const value = document.createElement('span');
        value.className = 'row__value';
        const num = Object.assign(document.createElement('input'), { type: 'number', id, min: f.min, max: f.max, step: f.step });
        const range = Object.assign(document.createElement('input'), { type: 'range', min: f.min, max: f.max, step: f.step });
        range.setAttribute('aria-label', `Shadow ${i + 1} ${f.name}`);
        const set = v => { if (Number.isFinite(v)) { cfg.shadows[i][f.key] = v; changed(); } };
        num.addEventListener('change', () => set(parseFloat(num.value)));
        range.addEventListener('input', () => set(parseFloat(range.value)));
        value.append(num);
        if (f.unit) value.append(f.unit);
        row.append(name, value, document.createElement('span'), range);
        box.append(row);
        return () => { num.value = cfg.shadows[i][f.key]; range.value = cfg.shadows[i][f.key]; };
      });

      const colorRow = document.createElement('div');
      colorRow.className = 'row row--compact';
      const cid = `sh-${i}-color`;
      const cvalue = document.createElement('span');
      cvalue.className = 'row__value';
      const text = Object.assign(document.createElement('input'), { type: 'text', id: cid, spellcheck: false, maxLength: 7 });
      const swatch = Object.assign(document.createElement('input'), { type: 'color' });
      swatch.setAttribute('aria-label', `Shadow ${i + 1} colour swatch`);
      swatch.addEventListener('input', () => { cfg.shadows[i].color = swatch.value; changed(); });
      text.addEventListener('change', () => {
        const v = text.value.trim().startsWith('#') ? text.value.trim() : '#' + text.value.trim();
        if (HEX.test(v)) { cfg.shadows[i].color = v.toLowerCase(); changed(); } else sync();
      });
      cvalue.append(text, swatch);
      colorRow.append(Object.assign(document.createElement('label'), { className: 'row__name', textContent: 'Colour', htmlFor: cid }), cvalue, document.createElement('span'));
      box.append(colorRow);

      function sync() {
        const sh = cfg.shadows[i] = { ...SH, ...cfg.shadows[i] };
        theme.value = sh.theme; inset.checked = sh.inset;
        text.value = sh.color; swatch.value = sh.color;
        fieldSyncs.forEach(f => f());
      }
      syncs.push(sync);
      return box;
    }

    // rebuild only when the number of shadows changes (a load or reset); otherwise refresh in
    // place, so a slider being dragged keeps its focus
    rows.push(() => {
      if (syncs.length !== cfg.shadows.length || (!cfg.shadows.length && !list.contains(empty))) build();
      syncs.forEach(f => f());
      heading.classList.toggle('is-changed', cfg.shadows.length > 0);
    });
  }

  /* ---- Preview: the nav in both themes, over a chosen backdrop ---- */
  const BACKDROPS = [
    ['Page', null], ['Night', '--c-night'], ['Navy', '--c-navy'], ['Pine', '--c-pine'], ['Slate', '--c-slate'],
    ['Rust', '--c-rust'], ['Ochre', '--c-ochre'], ['Sage', '--c-sage'], ['Mist', '--c-mist'],
  ];
  BACKDROPS.forEach(([label], i) => $('backdrop').append(new Option(label, String(i))));

  const strips = [['Dark', null], ['Light', 'light']].map(([label, scope]) => {
    const strip = $('strip').content.firstElementChild.cloneNode(true);
    strip.querySelector('.strip__label').textContent = label;
    if (scope) strip.dataset.themeScope = scope;
    strip.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
    $('stage').append(strip);
    return strip;
  });
  $('stage').append(Object.assign(document.createElement('p'), {
    className: 'hint',
    textContent: 'Hover and press the top rows to feel the transitions. The bottom rows hold each state still.',
  }));

  $('backdrop').addEventListener('change', () => {
    const token = BACKDROPS[Number($('backdrop').value)][1];
    strips.forEach(s => { s.style.background = token ? `var(${token})` : ''; });
  });

  $('zoom').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('stage').style.setProperty('--zoom', b.dataset.zoom);
    $('zoom').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  function changed() {
    Buttons.apply(cfg);
    rows.forEach(r => r());
    refreshCount();
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
    $('version-use').textContent = count ? 'Use on site' : 'On site';
  }

  $('reset').addEventListener('click', () => { load({}); changed(); });
  $('copy').addEventListener('click', async () => {
    const button = $('copy');
    const text = JSON.stringify(overrides(), null, 2);
    let label = 'Copied';
    try { await navigator.clipboard.writeText(text); } catch (e) { label = 'Copy failed'; console.log(text); }
    button.textContent = label;
    setTimeout(() => { button.textContent = 'Copy config'; }, 1200);
  });

  /* ---- Versions: kept in button-versions.js, which the site reads. The local server
     (tools/lab-server.mjs, started by `dvs`) writes that file. Deployed, the lab can only read it. ---- */
  const FILE = 'button-versions.js';
  const FILE_URL = '../../' + FILE;
  const API = '/__lab/buttons';
  const ORIGINAL = 'original';
  const PUBLISH = `Push ${FILE} to publish.`;
  let store = window.BUTTON_VERSIONS || { active: ORIGINAL, versions: [{ id: ORIGINAL, name: 'Original', savedAt: null, config: {} }] };
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
    load(version.config);
    changed();
    $('version-name').value = version.id === ORIGINAL ? '' : version.name;
    refreshSaveLabel();
    status(`Loaded ${version.name}.`);
  }

  const dateLabel = iso => iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const btn = (text, onClick) => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: text });
    button.addEventListener('click', onClick);
    return button;
  };

  function renderVersions() {
    $('version-list').replaceChildren(...store.versions.map(version => {
      const item = document.createElement('li');
      item.className = 'version';
      const actions = document.createElement('div');
      actions.className = 'version__actions';
      actions.append(btn('Load', () => loadVersion(version)));
      if (version.id === store.active) {
        actions.append(Object.assign(document.createElement('span'), { className: 'version__badge', textContent: 'Active' }));
      } else if (canWrite) {
        actions.append(btn('Set active', () => commit(
          next => { next.active = version.id; },
          `${version.name} is on the local site. ${PUBLISH}`,
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
      commit(next => { next.active = match.id; }, `${match.name} is on the local site. ${PUBLISH}`);
    } else if (name) {
      saveVersion(name, true, `Saved ${name}. It's on the local site. ${PUBLISH}`);
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
    load(activeVersion().config);
    renderVersions();
    changed();
  }).catch(() => { status(`Couldn't read ${FILE}.`); renderVersions(); changed(); });
})();
