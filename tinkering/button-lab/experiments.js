/* Button Lab experiments: one-off effects tried on a single large Matte key, below the nav previews.
   Each experiment adds its own strip to the stage.

   1. Iron filings. The effect itself is filings.js at the site root; this is its bench: a big key, the faders,
      saved versions (filings-versions.js, written by the local server), a switch to try it on the nav previews
      above, and "Use on the site", which puts a version on every page's nav buttons. */
(() => {
  const stage = document.getElementById('stage');
  if (!stage || !window.Filings) return;
  Filings.manual = true;                                           // this page decides where the effect goes

  const strip = document.createElement('section');
  strip.className = 'strip xp';
  strip.innerHTML = `
    <style>
      .xp { --ground: #0d0d0e; position: relative; }
      .xp__row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 28px 48px; padding: 36px 24px 28px; }
      .xp__key { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 260px; height: 76px; margin: 44px 0; border-radius: 8px;
        font: 400 12px/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: #b4b4b6; cursor: pointer;
        background: linear-gradient(180deg, #2e2e30, #1f1f21);
        box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.11), 0 0 0 1px #070707, 0 4px 0 #0c0c0c, 0 9px 12px rgb(0 0 0 / 0.5);
        transition: transform 110ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 110ms cubic-bezier(0.23, 1, 0.32, 1); }
      .xp__key:active { transform: translateY(2px); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px #070707, 0 2px 0 #0c0c0c, 0 4px 6px rgb(0 0 0 / 0.5); }
      .xp__tune { display: grid; grid-template-columns: auto 160px 5em; gap: 8px 12px; align-items: center; color: var(--muted); font-size: 12px; }
      .xp__tune output { color: var(--fg); font-variant-numeric: tabular-nums; }
      .xp__tune input[type="number"] { width: 64px; padding: 2px 4px; text-align: right; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; color: var(--fg); font-variant-numeric: tabular-nums; }   /* type a value in place of dragging */
      .xp__tune input[type="color"] { width: 44px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: none; }
      .xp__saved { display: grid; gap: 10px; width: 280px; font-size: 12px; color: var(--muted); }
      .xp__saved h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--fg); }
      .xp__saved select, .xp__saved input[type="text"] { width: 100%; min-width: 0; padding: 4px 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; box-sizing: border-box; }
      .xp__line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .xp__line input[type="text"] { flex: 1; width: auto; }
      .xp__saved .btn { font-size: 12px; color: var(--fg); }
      .xp__try { display: flex; gap: 8px; align-items: center; color: var(--fg); cursor: pointer; }
      .xp__status { min-height: 2.8em; margin: 0; }
      .xp__note { max-width: 60ch; padding: 0 24px; margin: 0; color: var(--muted); font-size: 12px; }
    </style>
    <div class="strip__label">Experiments</div>
    <div class="xp__row">
      <button class="xp__key" id="xp-key" type="button">Iron filings</button>
      <div class="xp__tune" id="xp-tune"></div>
      <div class="xp__saved">
        <h3>Saved versions</h3>
        <select id="xp-versions" aria-label="Saved iron filings version"></select>
        <div class="xp__line">
          <button class="btn" id="xp-use" type="button">Use on the site</button>
          <button class="btn" id="xp-remove" type="button">Delete</button>
        </div>
        <div class="xp__line">
          <input id="xp-name" type="text" placeholder="Name for a new version" aria-label="Name for a new version">
          <button class="btn" id="xp-save" type="button">Save</button>
        </div>
        <label class="xp__try"><input id="xp-try" type="checkbox"> Try it on the buttons above</label>
        <p class="xp__status" id="xp-status" role="status"></p>
      </div>
    </div>
    <p class="xp__note">Move the pointer over and around the key: it is a magnet, and the speckle in the paint is iron. Press, and the magnet reverses for a moment.</p>`;
  stage.append(strip);
  const $ = (id) => strip.querySelector('#' + id);

  // [key, label, min, max, step]. The keys are the effect's settings (filings.js).
  const TUNE = [
    ['count', 'Filings', 300, 6000, 100],
    ['reach', 'Magnet reach, px', 30, 220, 2],
    ['length', 'Spike length, px', 4, 40, 1],
    ['pull', 'Drawn toward it, px', 0, 30, 1],
    ['size', 'Filing size', 0.4, 4, 0.1],
    ['glow', 'Tip brightness', 0, 1, 0.05],
    ['rest', 'Speckle at rest', 0, 1, 0.05],
    ['push', 'Pulse push, px', 0, 40, 1],
    ['speed', 'Pulse speed, px/s', 100, 1500, 20],
  ];
  const KEYS = [...TUNE.map((t) => t[0]), 'color'];
  const cfg = Filings.activeConfig();                              // one live object: the key and the previews all read it
  const tune = $('xp-tune');
  tune.innerHTML = TUNE.map(([key, label, min, max, step]) =>
    `<label for="xp-${key}">${label}</label><input id="xp-${key}" type="range" min="${min}" max="${max}" step="${step}"><input type="number" min="${min}" max="${max}" step="${step}" aria-label="${label}, typed">`).join('')
    + `<label for="xp-color">Filing colour</label><input id="xp-color" type="color"><output></output>`;
  // beside each slider is a number field showing the same value (beside the colour, its hex as text)
  const readout = (input, v) => { const next = input.nextElementSibling; if (next.matches('input')) next.value = v; else next.textContent = v; };
  function show() { for (const k of KEYS) { const input = $('xp-' + k); input.value = cfg[k]; readout(input, cfg[k]); } Filings.wake(); }
  for (const k of KEYS) {
    const input = $('xp-' + k), num = input.nextElementSibling.matches('input') ? input.nextElementSibling : null;
    input.addEventListener('input', () => { cfg[k] = k === 'color' ? input.value : Number(input.value); readout(input, input.value); Filings.wake(); });
    if (!num) continue;
    // typed: a number inside the slider's range takes effect as it is typed; leaving the field (or Enter) tidies it,
    // bringing anything outside the range to its nearest end and an empty field back to the current value
    const lo = Number(input.min), hi = Number(input.max);
    num.addEventListener('input', () => { const v = num.valueAsNumber; if (Number.isFinite(v) && v >= lo && v <= hi) { cfg[k] = v; input.value = v; Filings.wake(); } });
    num.addEventListener('change', () => { const v = num.valueAsNumber; if (Number.isFinite(v)) cfg[k] = Math.min(hi, Math.max(lo, v)); input.value = cfg[k]; num.value = cfg[k]; Filings.wake(); });
  }
  show();

  const bench = Filings.attach($('xp-key'), cfg);

  // the nav previews above, with the same live settings
  const tried = [];
  $('xp-try').addEventListener('change', () => {
    while (tried.length) tried.pop().remove();
    if ($('xp-try').checked) for (const el of document.querySelectorAll('.strip:not(.xp) .chip')) tried.push(Filings.attach(el, cfg));
  });

  // ---- saved versions: kept in filings-versions.js, written by the local server ----
  const OFF = Filings.OFF;
  let store = JSON.parse(JSON.stringify(window.FILINGS_VERSIONS || { active: OFF, versions: [{ id: OFF, name: 'Off: plain buttons', savedAt: null, config: {} }, { id: 'original', name: 'Original', savedAt: null, config: {} }] }));
  const say = (text) => { $('xp-status').textContent = text; };
  const changed = () => Object.fromEntries(KEYS.filter((k) => cfg[k] !== Filings.DEFAULTS[k]).map((k) => [k, cfg[k]]));   // a version stores only what differs
  function list(selected) {
    $('xp-versions').innerHTML = store.versions.map((v) => `<option value="${v.id}">${v.name.replace(/[<&]/g, '')}${v.id === store.active ? ' · on the site' : ''}</option>`).join('');
    $('xp-versions').value = selected || (store.active === OFF ? 'original' : store.active);
  }
  async function write(message) {
    try {
      const res = await fetch('/__lab/filings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store) });
      say(res.ok ? message : `Not saved: ${await res.text()}`);
      return res.ok;
    } catch (err) { say('Not saved: this only works on the local server (dvs).'); return false; }
  }
  $('xp-versions').addEventListener('change', () => {
    const v = store.versions.find((x) => x.id === $('xp-versions').value);
    if (v.id === OFF) return say('“Use on the site” with this chosen takes the filings off the site’s buttons.');
    Object.assign(cfg, Filings.DEFAULTS, v.config); show(); say(`Loaded “${v.name}”.`);
  });
  $('xp-save').addEventListener('click', async () => {
    const name = $('xp-name').value.trim() || `Version ${store.versions.length - 1}`;
    const at = store.versions.find((v) => v.name === name && v.id !== OFF && v.id !== 'original');   // the same name overwrites
    const v = at || { id: Date.now().toString(36), name };
    v.savedAt = new Date().toISOString(); v.config = changed();
    if (!at) store.versions.push(v);
    list(v.id); $('xp-name').value = '';
    await write(`Saved “${name}”. Press “Use on the site” to put it on the site’s buttons.`);
  });
  $('xp-use').addEventListener('click', async () => {
    store.active = $('xp-versions').value; list($('xp-versions').value);
    await write(store.active === OFF ? 'The site’s buttons are plain again.' : `The site’s buttons now have “${store.versions.find((v) => v.id === store.active).name}”. Open any page to see it.`);
  });
  $('xp-remove').addEventListener('click', async () => {
    const id = $('xp-versions').value;
    if (id === OFF || id === 'original') return say('That one stays.');
    if (id === store.active) return say('That version is on the site. Put another on the site first.');
    store.versions = store.versions.filter((v) => v.id !== id); list();
    await write('Deleted.');
  });
  list();

  // ?filings=x,y holds the magnet at a spot on the key, for screenshots; &pulse=ms adds a press there, frozen that many ms later (&down: still held).
  // &try switches on "Try it on the buttons above".
  const q = new URLSearchParams(location.search), spot = (q.get('filings') || '').split(',').map(Number);
  if (spot.length === 2) bench.hold(spot[0], spot[1], q.has('pulse') ? Number(q.get('pulse')) : null, q.has('down'));   // &down: the press is still held
  if (q.has('try')) { $('xp-try').checked = true; $('xp-try').dispatchEvent(new Event('change')); }
})();
