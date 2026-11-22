// The instrument panel, built from the schema (schema.js TABS). Every fader has a number field beside it,
// kept in step both ways: a typed number inside the range takes effect as it is typed; leaving the field, or
// Enter, tidies it (outside the range goes to the nearest end, empty goes back to the current value). A typed
// value is kept as typed even off the fader's step. A setting moved off the value the look loaded with shows a
// Reset beside its name.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const idOf = (k) => 'c-' + k.replace(/[^a-z0-9]/gi, '-');

export function buildPanel(root, tabs, S, { onChange, custom = {}, onMaterial, materials }) {
  const rows = [];          // { el, when, key, kind, range }
  const groups = [];        // { el, when }
  let base = { ...S };

  const tablist = document.createElement('div');
  tablist.className = 'm-tabs tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Settings');
  root.append(tablist);
  const body = document.createElement('div');
  body.className = 'side__body';
  root.append(body);

  tabs.forEach((tab, ti) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'tab-' + tab.id;
    b.setAttribute('aria-controls', 'pane-' + tab.id); b.setAttribute('aria-selected', String(ti === 0));
    b.textContent = tab.label;
    tablist.append(b);
    const pane = document.createElement('div');
    pane.id = 'pane-' + tab.id; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', b.id);
    pane.className = 'tabpane';
    body.append(pane);
    for (const g of tab.groups) {
      const wrap = document.createElement('div');
      wrap.className = 'm-panel m-panel--col m-panel--flat';
      const cell = document.createElement('div');
      cell.className = 'm-cell group';
      cell.innerHTML = `<h2 class="m-legend m-legend--lg">${esc(g.t)}</h2>`;
      wrap.append(cell);
      pane.append(wrap);
      groups.push({ el: wrap, when: g.when });
      if (g.mat) cell.append(materialRow(g.mat));
      for (const r of g.rows) cell.append(row(r));
    }
  });

  function materialRow(slot) {
    const el = document.createElement('div');
    el.className = 'row row--pick';
    const id = 'mat-' + slot;
    el.innerHTML = `<label class="m-legend m-legend--dim" for="${id}">Material</label>
      <select class="m-input" id="${id}"><option value="">Custom</option>${Object.entries(materials).map(([k, m]) => `<option value="${k}">${esc(m.name)}</option>`).join('')}</select>`;
    const sel = el.querySelector('select');
    sel.addEventListener('change', () => { if (sel.value) onMaterial(slot, sel.value); });
    rows.push({ el, key: null, kind: 'mat', slot, sel });
    return el;
  }

  function row(r) {
    const when = typeof r[r.length - 1] === 'function' ? r[r.length - 1] : null;
    const [kind, key, label] = r;
    const el = document.createElement('div');
    if (custom[kind]) {
      el.className = 'row row--custom';
      el.append(custom[kind](key, label));
      rows.push({ el, when, key: null, kind });
      return el;
    }
    const id = idOf(key);
    if (kind === 'n') {
      const [, , , min, max, step] = r;
      el.className = 'row';
      el.innerHTML = `<label class="m-legend m-legend--dim" for="${id}">${esc(label)}</label>
        <button class="row__reset" type="button" hidden aria-label="Reset ${esc(label.replace(/, [^,]+$/, ''))}">Reset</button>
        <input class="m-fader" type="range" id="${id}" min="${min}" max="${max}" step="${step}">
        <input class="m-input row__num" type="number" min="${min}" max="${max}" step="any" aria-label="${esc(label)}, typed">`;
      const [fader, num] = el.querySelectorAll('input');
      const reset = el.querySelector('.row__reset');
      const put = (v, from) => {
        S[key] = v;
        if (from !== 'fader') fader.value = v;
        if (from !== 'number') num.value = fmt(v, step);
        mark();
        onChange(key);
      };
      const mark = () => {
        const off = S[key] !== base[key];
        reset.hidden = !off; reset.title = off ? `Back to ${base[key]}` : '';
        el.classList.toggle('is-changed', off);
      };
      fader.addEventListener('input', () => put(Number(fader.value), 'fader'));
      num.addEventListener('input', () => { const v = num.valueAsNumber; if (Number.isFinite(v) && v >= min && v <= max) put(v, 'number'); });
      num.addEventListener('change', () => { const v = num.valueAsNumber; put(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : S[key]); });
      reset.addEventListener('click', () => { put(base[key]); fader.focus(); });
      rows.push({ el, when, key, kind, sync: () => { fader.value = S[key]; num.value = fmt(S[key], step); mark(); } });
    } else if (kind === 's') {
      const opts = r[3];
      el.className = 'row row--pick';
      el.innerHTML = `<label class="m-legend m-legend--dim" for="${id}">${esc(label)}</label>
        <select class="m-input" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
      const sel = el.querySelector('select');
      const numeric = typeof opts[0][0] === 'number';
      sel.addEventListener('change', () => { S[key] = numeric ? Number(sel.value) : sel.value; onChange(key); });
      rows.push({ el, when, key, kind, sync: () => { sel.value = String(S[key]); } });
    } else if (kind === 'g') {
      const opts = r[3];
      el.className = 'row row--pick';
      el.innerHTML = `<span class="m-legend m-legend--dim" id="${id}-l">${esc(label)}</span>
        <div class="m-seg" role="radiogroup" aria-labelledby="${id}-l">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="false" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
      const seg = el.querySelector('.m-seg');
      const numeric = typeof opts[0][0] === 'number';
      seg.addEventListener('change', () => {
        const on = seg.querySelector('[aria-checked="true"]');
        if (on) { S[key] = numeric ? Number(on.dataset.v) : on.dataset.v; onChange(key); }
      });
      rows.push({ el, when, key, kind, sync: () => { seg.querySelectorAll('[role="radio"]').forEach((b) => { const on = b.dataset.v === String(S[key]); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); } });
    } else if (kind === 'w') {
      el.className = 'row row--switch';
      el.innerHTML = `<span class="m-legend m-legend--dim" id="${id}-l">${esc(label)}</span>
        <button class="m-switch" type="button" role="switch" aria-checked="false" aria-labelledby="${id}-l"></button>`;
      const sw = el.querySelector('.m-switch');
      // matte.js flips the switch on click; read it once it has
      sw.addEventListener('click', () => setTimeout(() => { S[key] = sw.getAttribute('aria-checked') === 'true'; onChange(key); }));
      rows.push({ el, when, key, kind, sync: () => sw.setAttribute('aria-checked', String(!!S[key])) });
    } else if (kind === 'c') {
      el.className = 'row row--switch';
      el.innerHTML = `<label class="m-legend m-legend--dim" for="${id}">${esc(label)}</label>
        <input class="swatch" type="color" id="${id}">`;
      const c = el.querySelector('input');
      c.addEventListener('input', () => { S[key] = c.value; onChange(key); });
      rows.push({ el, when, key, kind, sync: () => { c.value = S[key]; } });
    } else if (kind === 't') {
      el.className = 'row row--text';
      el.innerHTML = `<textarea class="m-input" id="${id}" rows="2" aria-label="${esc(label)}" spellcheck="false"></textarea>`;
      const ta = el.querySelector('textarea');
      ta.addEventListener('input', () => { S[key] = ta.value; onChange(key); });
      rows.push({ el, when, key, kind, sync: () => { if (document.activeElement !== ta) ta.value = S[key]; } });
    }
    return el;
  }

  function fmt(v, step) {
    if (!Number.isFinite(v)) return '';
    const d = String(step).includes('.') ? String(step).split('.')[1].length : 0;
    const r = Number(v.toFixed(Math.max(d, 0)));
    return r === v ? String(v) : String(Number(v.toFixed(4)));
  }

  function visibility() {
    for (const r of rows) if (r.when) r.el.hidden = !r.when(S);
    for (const g of groups) if (g.when) g.el.hidden = !g.when(S);
    for (const r of rows) if (r.kind === 'mat') r.sel.value = matchMaterial(r.slot);
  }
  function matchMaterial(slot) {
    for (const [k, m] of Object.entries(materials)) if (Object.entries(m.set).every(([p, v]) => S[`${slot}.${p}`] === v)) return k;
    return '';
  }

  return {
    sync() { for (const r of rows) r.sync?.(); visibility(); },
    syncKeys(keys) { for (const r of rows) if (keys.includes(r.key)) r.sync?.(); visibility(); },
    visibility,
    rebase() { base = { ...S }; this.sync(); },
  };
}
