// Saved versions: every setting (the timeline too), named, with a small picture, kept in this browser. They can be
// loaded, compared side by side with what is on the stage, deleted, and moved between browsers as a file.
// Same storage as the other experiments' versions (experiments/versions.js): 'tinkering-versions:<key>'.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createSaved({ panel, key, snapshot, thumb, apply, compare, say }) {
  const storeKey = 'tinkering-versions:' + key;
  const read = () => { try { return JSON.parse(localStorage.getItem(storeKey)) || []; } catch { return []; } };
  const write = (list) => { try { localStorage.setItem(storeKey, JSON.stringify(list)); return true; } catch { return false; } };
  let versions = read();
  let confirming = -1;

  panel.innerHTML = `
    <div class="sv__save">
      <input class="m-input" type="text" aria-label="Name for this version" spellcheck="false">
      <button class="m-key" type="button" data-a="save">Save</button>
    </div>
    <ul class="sv__list" aria-label="Saved versions"></ul>
    <div class="sv__foot">
      <button class="m-key m-key--quiet" type="button" data-a="export">Export all</button>
      <button class="m-key m-key--quiet" type="button" data-a="import">Import</button>
    </div>`;
  const name = panel.querySelector('input'), list = panel.querySelector('.sv__list');
  const nextName = () => `Version ${versions.length + 1}`;

  function draw() {
    name.placeholder = nextName();
    list.innerHTML = versions.length ? versions.map((v, i) => `
      <li class="sv__item">
        <button class="sv__load" type="button" data-i="${i}" data-a="load" aria-label="Load ${esc(v.name)}">
          ${v.thumb ? `<img src="${v.thumb}" alt="">` : '<span class="sv__blank"></span>'}
          <span class="sv__name">${esc(v.name)}</span>
          <span class="m-legend m-legend--dim">${new Date(v.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${new Date(v.savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        </button>
        <button class="m-key m-key--quiet" type="button" data-i="${i}" data-a="compare" data-tip="Show it beside the stage, split down the middle">Compare</button>
        <button class="m-key m-key--quiet${confirming === i ? ' is-warn' : ''}" type="button" data-i="${i}" data-a="del">${confirming === i ? 'Delete?' : 'Delete'}</button>
      </li>`).join('') : '<li class="m-legend m-legend--dim sv__none">None saved yet</li>';
  }
  function save() {
    const n = name.value.trim() || nextName();
    const v = { name: n, savedAt: new Date().toISOString(), params: snapshot(), thumb: thumb() };
    const at = versions.findIndex((x) => x.name === n);
    if (at >= 0) versions[at] = v; else versions.unshift(v);
    say(write(versions) ? `Saved “${n}”` : 'Not saved: this browser’s storage is full or blocked.');
    name.value = ''; confirming = -1; draw();
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const i = Number(b.dataset.i), a = b.dataset.a;
    if (a === 'save') save();
    else if (a === 'load') { apply(versions[i].params); say(`Loaded “${versions[i].name}”`); }
    else if (a === 'compare') { compare(versions[i].params, versions[i].name); }
    else if (a === 'del') {
      if (confirming !== i) { confirming = i; draw(); return; }
      const [gone] = versions.splice(i, 1); write(versions); confirming = -1; draw(); say(`Deleted “${gone.name}”`);
    } else if (a === 'export') {
      const blob = new Blob([JSON.stringify(versions, null, 2)], { type: 'application/json' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${key}-versions.json` });
      link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } else if (a === 'import') {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
      input.onchange = async () => {
        try {
          const incoming = JSON.parse(await input.files[0].text());
          if (!Array.isArray(incoming)) throw new Error('not a list');
          const ok = incoming.filter((v) => v && v.name && v.params);
          for (const v of ok) { const at = versions.findIndex((x) => x.name === v.name); if (at >= 0) versions[at] = v; else versions.push(v); }
          write(versions); draw(); say(`Imported ${ok.length}`);
        } catch { say('That file isn’t a list of saved versions.'); }
      };
      input.click();
    }
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  draw();
  return { refresh() { versions = read(); confirming = -1; draw(); } };
}
