/* Saved versions: snapshot every panel setting plus the camera, name it, come back to it.
   Stored in localStorage per page; export/import moves them between browsers.
   Usage: addVersions(gui, { key, params, defaults, apply, camera, controls }) */

export function addVersions(gui, { key, params, defaults, apply, camera, controls }) {
  const storeKey = 'tinkering-versions:' + key;
  const read = () => { try { return JSON.parse(localStorage.getItem(storeKey)) || []; } catch { return []; } };
  const write = list => { try { localStorage.setItem(storeKey, JSON.stringify(list)); return true; } catch { return false; } };

  let versions = read();
  const ui = { name: '', selected: '', status: versions.length ? `${versions.length} saved` : 'None saved yet' };
  const nextName = () => `Version ${versions.length + 1}`;
  ui.name = nextName();

  // only keys the page knows about, so old saves still load after new parameters are added
  const snapshot = () => Object.fromEntries(Object.keys(defaults).map(k => [k, params[k]]));

  function load(v) {
    const prev = { ...params };
    Object.assign(params, defaults, v.params);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    if (v.camera) {
      controls.target.fromArray(v.camera.target);
      camera.position.fromArray(v.camera.position);
      controls.update();
    }
    apply(prev);
  }

  const folder = gui.addFolder('Saved versions');
  folder.add(ui, 'name').name('Name');
  folder.add({
    save() {
      const name = ui.name.trim() || nextName();
      const v = {
        name,
        savedAt: new Date().toISOString(),
        params: snapshot(),
        camera: { position: camera.position.toArray(), target: controls.target.toArray() },
      };
      const at = versions.findIndex(x => x.name === name);   // same name overwrites
      if (at >= 0) versions[at] = v; else versions.push(v);
      say(write(versions) ? `Saved “${name}”` : 'Not saved: storage unavailable');
      ui.selected = name;
      refresh();
      ui.name = nextName();
      nameCtrl.updateDisplay();
    },
  }, 'save').name('Save current settings');

  const picker = folder.add(ui, 'selected', []).name('Version');
  folder.add({
    load() {
      const v = versions.find(x => x.name === ui.selected);
      if (!v) return;
      load(v);
      say(`Loaded “${v.name}”`);
    },
  }, 'load').name('Load selected');
  folder.add({
    remove() {
      const at = versions.findIndex(x => x.name === ui.selected);
      if (at < 0 || !confirm(`Delete “${ui.selected}”?`)) return;
      versions.splice(at, 1);
      write(versions);
      say(`Deleted “${ui.selected}”`);
      ui.selected = versions.at(-1)?.name || '';
      refresh();
    },
  }, 'remove').name('Delete selected');
  folder.add({
    exportAll() {
      const blob = new Blob([JSON.stringify(versions, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob), download: `${key}-versions.json`,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    },
  }, 'exportAll').name('Export all (JSON)');
  folder.add({
    importFile() {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
      input.onchange = async () => {
        try {
          const incoming = JSON.parse(await input.files[0].text());
          if (!Array.isArray(incoming)) throw new Error('not a list');
          incoming.filter(v => v && v.name && v.params).forEach(v => {
            const at = versions.findIndex(x => x.name === v.name);
            if (at >= 0) versions[at] = v; else versions.push(v);
          });
          write(versions);
          say(`Imported ${incoming.length}`);
          refresh();
        } catch {
          say('Import failed: not a versions file');
        }
      };
      input.click();
    },
  }, 'importFile').name('Import from file');
  const statusCtrl = folder.add(ui, 'status').name('Status').disable();
  function say(msg) { ui.status = msg; statusCtrl.updateDisplay(); }
  const nameCtrl = folder.controllers[0];

  function refresh() {
    const options = Object.fromEntries(versions.map(v =>
      [`${v.name} · ${new Date(v.savedAt).toLocaleDateString()}`, v.name]));
    if (!versions.some(v => v.name === ui.selected)) ui.selected = versions.at(-1)?.name || '';
    picker.options(options);
  }
  refresh();
  return folder;
}
