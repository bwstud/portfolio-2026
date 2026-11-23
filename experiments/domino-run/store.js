/* Saved runs and elements.
   Running on the local server (`npm run dev`), they're files in this project:
     experiments/domino-run/saves/states/<id>.json (+ .jpg thumbnail)
     experiments/domino-run/saves/elements/<id>.json
   Anywhere else (the deployed site), there's no server to write to, so they're kept in this
   browser's localStorage instead, and the page says so. */
const API = '/__domino';
let mode = null;   // 'project' | 'browser'

export async function storeMode() {
  if (mode) return mode;
  try {
    const res = await fetch(`${API}/ping`, { cache: 'no-store' });
    mode = res.ok ? 'project' : 'browser';
  } catch { mode = 'browser'; }
  return mode;
}

const LS = kind => `domino-run:${kind}`;
const lsRead = kind => { try { return JSON.parse(localStorage.getItem(LS(kind))) || []; } catch { return []; } };
const lsWrite = (kind, list) => { try { localStorage.setItem(LS(kind), JSON.stringify(list)); return true; } catch { return false; } };

function slug(name) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'untitled';
  return `${stamp}-${s}`;
}

async function json(res) {
  if (!res.ok) throw new Error((await res.text()) || `Error ${res.status}`);
  return res.json();
}

/* list: [{ id, name, savedAt, count, thumb }] newest first */
export async function list(kind) {
  if ((await storeMode()) === 'project') return json(await fetch(`${API}/${kind}`, { cache: 'no-store' }));
  return lsRead(kind).map(({ data, ...meta }) => meta).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function load(kind, id) {
  if ((await storeMode()) === 'project') return json(await fetch(`${API}/${kind}/${id}`, { cache: 'no-store' }));
  const hit = lsRead(kind).find(x => x.id === id);
  if (!hit) throw new Error('Not found.');
  return hit.data;
}

/* save `data` under `name`; pass an id to overwrite. thumb is a JPEG data URL or null */
export async function save(kind, name, data, thumb, id) {
  id = id || slug(name);
  const savedAt = new Date().toISOString();
  if ((await storeMode()) === 'project') {
    return json(await fetch(`${API}/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, savedAt, data, thumb }),
    }));
  }
  const listed = lsRead(kind).filter(x => x.id !== id);
  listed.push({ id, name, savedAt, count: data.dominoes?.length ?? 0, thumb, data });
  if (!lsWrite(kind, listed)) throw new Error('This browser is out of room for saves.');
  return { id };
}

export async function remove(kind, id) {
  if ((await storeMode()) === 'project') {
    const res = await fetch(`${API}/${kind}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    return;
  }
  lsWrite(kind, lsRead(kind).filter(x => x.id !== id));
}

/* the lab's settings, written to experiments/domino-run/params.json */
export async function saveParams(values) {
  if ((await storeMode()) !== 'project') throw new Error('Saving settings to the project needs the local server.');
  const res = await fetch(`${API}/params`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  if (!res.ok) throw new Error(await res.text());
}
