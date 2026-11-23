/* Kaleidoscope Lab: make and edit kaleidoscope configurations.
   Built-in ones can't be changed, only copied. New ones are saved to the project's
   configs.json when this runs on the local server, or to this browser otherwise. */
import { Scope, cellOutline, MIRRORS } from '../scope.js';
import { SECTIONS, FIELDS, DEFAULTS, loadAll, saveList, storeMode, makeId, normalise, encodeShare } from '../configs.js';
import { GALLERY, galleryUrl, thumbUrl, loadImageUrl, loadFile } from '../sources.js';
import { attachGestures, renderThumb, download, fileSlug, toaster, store } from '../shared.js';

const $ = id => document.getElementById(id);
const toast = toaster($('toast'));
const BASE = '../';

let scope;
try {
  scope = new Scope($('preview'));
} catch (e) {
  document.querySelector('.view').innerHTML = `<p style="padding:24px;color:var(--soft)">${e.message}</p>`;
  throw e;
}

const state = {
  mode: 'browser',
  all: [],
  sel: null,             // the saved configuration being edited, or a new unsaved one
  draft: null,           // { name, about, params }
  picture: null,
  user: { x: 0, y: 0, rot: 0, scale: 1 },
  motion: true,
  t: 0,
  showCell: true,
};

const ownOrigin = () => state.mode;                      // 'project' | 'browser'
const editable = c => c && c.origin === ownOrigin();
const ownList = () => state.all.filter(editable);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isDirty = () => !!state.sel && (state.sel.origin === 'new' ||
  state.draft.name !== state.sel.name || state.draft.about !== (state.sel.about ?? '') || !same(state.draft.params, state.sel.params));

/* ---------- configuration list ---------- */
function groups() {
  const out = [{ title: 'Built in', note: 'Copy one to change it', items: state.all.filter(c => c.origin === 'builtin') }];
  const project = state.all.filter(c => c.origin === 'project');
  const browser = state.all.filter(c => c.origin === 'browser');
  if (state.mode === 'project') {
    out.push({ title: 'In the project', note: 'configs.json', items: project, empty: 'Nothing saved yet.' });
  } else {
    if (project.length) out.push({ title: 'In the project', note: 'Read only here', items: project });
    out.push({ title: 'In this browser', note: 'Only you see these', items: browser, empty: 'Nothing saved yet.' });
  }
  return out;
}

function renderList() {
  const root = $('groups');
  root.replaceChildren();
  for (const g of groups()) {
    const sec = document.createElement('section');
    const head = document.createElement('div');
    head.className = 'group__title';
    head.innerHTML = `<span></span><small></small>`;
    head.firstChild.textContent = g.title;
    head.lastChild.textContent = g.note ?? '';
    sec.append(head);
    if (!g.items.length && g.empty) {
      const p = document.createElement('p');
      p.className = 'group__empty';
      p.textContent = g.empty;
      sec.append(p);
    }
    for (const c of g.items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item';
      b.dataset.id = c.id;
      b.setAttribute('aria-current', String(c === state.sel));
      const cv = document.createElement('canvas');
      cv.width = cv.height = 72;
      const name = document.createElement('span');
      name.className = 'item__name';
      name.textContent = c.name;
      const dot = document.createElement('span');
      dot.className = 'item__dot';
      dot.hidden = true;
      b.append(cv, name, dot);
      b.addEventListener('click', () => select(c));
      sec.append(b);
    }
    root.append(sec);
  }
  if (state.sel?.origin === 'new') {
    const sec = document.createElement('section');
    sec.innerHTML = '<div class="group__title"><span>Unsaved</span></div>';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item';
    b.setAttribute('aria-current', 'true');
    b.dataset.id = '__new';
    b.innerHTML = '<canvas width="72" height="72"></canvas><span class="item__name"></span><span class="item__dot"></span>';
    b.querySelector('.item__name').textContent = state.draft.name;
    sec.append(b);
    root.prepend(sec);
  }
  listThumbs();
  markList();
}

function listThumbs() {
  if (!state.picture) return;
  for (const b of $('groups').querySelectorAll('.item')) {
    const isSel = b.dataset.id === '__new' || b.dataset.id === state.sel?.id;
    const c = isSel ? { params: state.draft.params } : state.all.find(x => x.id === b.dataset.id);
    if (c) renderThumb(b.querySelector('canvas'), c.params, state.picture.el);
  }
}

let thumbTimer = 0;
function selectedThumbSoon() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    const b = $('groups').querySelector('.item[aria-current="true"]');
    if (b && state.picture) renderThumb(b.querySelector('canvas'), state.draft.params, state.picture.el);
  }, 120);
}

function markList() {
  const dirty = isDirty();
  for (const b of $('groups').querySelectorAll('.item')) {
    const cur = b.dataset.id === '__new' || b.dataset.id === state.sel?.id;
    b.setAttribute('aria-current', String(cur));
    b.querySelector('.item__dot').hidden = !(cur && dirty);
    if (cur) b.querySelector('.item__name').textContent = state.draft.name || 'Untitled';
  }
}

/* ---------- choosing what to edit ---------- */
function confirmDiscard() {
  return !isDirty() || confirm(`Discard your changes to “${state.draft.name || 'Untitled'}”?`);
}

function select(c, { force = false } = {}) {
  if (c === state.sel) return;
  if (!force && !confirmDiscard()) return;
  state.sel = c;
  state.draft = { name: c.name, about: c.about ?? '', params: { ...c.params } };
  if (c.origin !== 'new') store.set('kaleidoscopes:lab', c.id);
  renderList();
  renderEditor();
}

function startNew(params = DEFAULTS, name = 'New kaleidoscope', about = '') {
  if (!confirmDiscard()) return;
  const c = { id: null, origin: 'new', name, about, params: normalise(params) };
  state.sel = null;
  select(c, { force: true });
  $('name').focus();
  $('name').select();
}

$('new').addEventListener('click', () => startNew());
$('duplicate').addEventListener('click', () => {
  if (!state.sel) return;
  startNew(state.draft.params, `${state.draft.name} copy`, state.draft.about);
});

/* ---------- the editor ---------- */
const inputs = {};

function buildEditor() {
  const root = $('sections');
  for (const sec of SECTIONS) {
    const el = document.createElement('section');
    el.className = 'section';
    const head = document.createElement('div');
    head.className = 'section__head';
    const title = document.createElement('h2');
    title.className = 'section__title';
    title.textContent = sec.title;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'section__reset';
    reset.textContent = 'Undo section';
    reset.hidden = true;
    reset.addEventListener('click', () => {
      for (const f of sec.fields) state.draft.params[f.key] = baseParams()[f.key];
      changed();
    });
    head.append(title, reset);
    el.append(head);
    if (sec.note) {
      const note = document.createElement('p');
      note.className = 'section__note';
      note.textContent = sec.note;
      el.append(note);
    }
    for (const f of sec.fields) el.append(buildField(f));
    inputs[`section:${sec.title}`] = { el, reset, fields: sec.fields };
    root.append(el);
  }
}

function buildField(f) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const top = document.createElement('div');
  top.className = 'field__top';
  const id = `f-${f.key}`;
  const label = document.createElement('label');
  label.className = 'field__label';
  label.htmlFor = id;
  label.textContent = f.label;
  const value = document.createElement('span');
  value.className = 'field__value';
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'field__undo';
  undo.textContent = 'Undo';
  undo.title = 'Back to the saved value';
  undo.hidden = true;
  undo.addEventListener('click', () => { state.draft.params[f.key] = baseParams()[f.key]; changed(); });
  top.append(label);

  let input, num = null;
  if (f.type === 'range') {
    input = document.createElement('input');
    input.type = 'range';
    Object.assign(input, { min: f.min, max: f.max, step: f.step });
    input.addEventListener('input', () => { state.draft.params[f.key] = Number(input.value); changed(); });
    // a number field beside the slider: type a value in place of dragging. A number inside the slider's range takes
    // effect as it is typed; leaving the field (or Enter) tidies it, bringing anything outside to the nearest end.
    num = document.createElement('input');
    num.type = 'number';
    num.className = 'field__num';
    Object.assign(num, { min: f.min, max: f.max, step: f.step });
    num.setAttribute('aria-label', f.label + ', typed');
    num.addEventListener('input', () => {
      const v = num.valueAsNumber;
      if (Number.isFinite(v) && v >= f.min && v <= f.max) { state.draft.params[f.key] = v; changed(); }
    });
    num.addEventListener('change', () => {
      const v = num.valueAsNumber;
      if (Number.isFinite(v)) state.draft.params[f.key] = Math.min(f.max, Math.max(f.min, v));
      num.value = state.draft.params[f.key];
      changed();
    });
    top.append(value, num, undo);
    wrap.append(top, input);
  } else if (f.type === 'select') {
    input = document.createElement('select');
    for (const o of f.options) input.add(new Option(o.label, o.value));
    input.addEventListener('change', () => { state.draft.params[f.key] = input.value; changed(); });
    top.append(value, undo);
    wrap.append(top, input);
  } else {
    input = document.createElement('input');
    input.type = 'color';
    input.addEventListener('input', () => { state.draft.params[f.key] = input.value; changed(); });
    top.append(undo, input);
    wrap.append(top);
  }
  input.id = id;
  if (f.help) {
    const help = document.createElement('p');
    help.className = 'field__help';
    help.textContent = f.help;
    wrap.append(help);
  }
  inputs[f.key] = { wrap, input, num, value, undo, f };
  return wrap;
}

const baseParams = () => state.sel?.origin === 'new' ? DEFAULTS : state.sel.params;

function renderEditor() {
  const c = state.sel;
  $('name').value = state.draft.name;
  $('about').value = state.draft.about;
  $('name').readOnly = $('about').readOnly = false;
  const where = {
    builtin: 'Built in. Change anything, then save it as a new kaleidoscope.',
    project: state.mode === 'project' ? 'Saved in the project (configs.json).' : 'Saved in the project. It can only be changed on the local server, so save a copy to keep changes.',
    browser: 'Saved in this browser.',
    new: 'Not saved yet.',
  };
  $('origin').textContent = where[c.origin] ?? '';
  syncFields();
}

function syncFields() {
  const p = state.draft.params, base = baseParams();
  for (const key of Object.keys(FIELDS)) {
    const { wrap, input, num, value, undo, f } = inputs[key];
    if (String(input.value) !== String(p[key])) input.value = p[key];
    // the number field holds the value; the text beside it stays only where it says more than the number (a format)
    if (num && document.activeElement !== num && String(num.value) !== String(p[key])) num.value = p[key];
    if (f.type === 'range') value.textContent = f.format ? f.format(p[key]) : '';
    if (f.type === 'select') value.textContent = '';
    const diff = p[key] !== base[key];
    wrap.classList.toggle('is-changed', diff && state.sel.origin !== 'new');
    undo.hidden = !diff || state.sel.origin === 'new';
    wrap.hidden = f.only ? !f.only(p) : false;
  }
  for (const sec of SECTIONS) {
    const s = inputs[`section:${sec.title}`];
    s.reset.hidden = state.sel.origin === 'new' || sec.fields.every(f => p[f.key] === base[f.key]);
  }
  saveBar();
}

function changed() {
  syncFields();
  markList();
  selectedThumbSoon();
}

$('name').addEventListener('input', () => { state.draft.name = $('name').value; markList(); saveBar(); });
$('about').addEventListener('input', () => { state.draft.about = $('about').value; saveBar(); });

/* ---------- saving ---------- */
function saveBar() {
  const c = state.sel, dirty = isDirty();
  const status = $('status');
  status.classList.toggle('is-changed', dirty);
  if (c.origin === 'new') status.textContent = 'Not saved yet.';
  else if (dirty) status.textContent = 'Changed since it was saved.';
  else status.textContent = 'No changes.';
  $('save').hidden = !editable(c);
  $('save').disabled = !dirty;
  $('save-new').classList.toggle('btn--primary', !editable(c));
  $('revert').disabled = !dirty || c.origin === 'new';
  $('delete').hidden = !editable(c);
  updateOpenLink();
}

async function persist(list, message) {
  try {
    await saveList(list);
    toast(message);
    return true;
  } catch (e) {
    toast(e.message, { bad: true, ms: 5000 });
    return false;
  }
}

function cleanName() {
  return (state.draft.name || '').trim() || 'Untitled';
}

$('save').addEventListener('click', async () => {
  const c = state.sel;
  if (!editable(c)) return;
  const updated = { ...c, name: cleanName(), about: state.draft.about.trim(), params: { ...state.draft.params }, savedAt: new Date().toISOString() };
  const list = ownList().map(x => x === c ? updated : x);
  if (!(await persist(list, `Saved “${updated.name}”.`))) return;
  state.all = state.all.map(x => x === c ? updated : x);
  state.sel = updated;
  state.draft.name = updated.name;
  renderList();
  renderEditor();
});

$('save-new').addEventListener('click', async () => {
  let name = cleanName();
  const names = new Set(state.all.map(c => c.name.toLowerCase()));
  if (names.has(name.toLowerCase())) {
    let n = 2;
    while (names.has(`${name} ${n}`.toLowerCase())) n++;
    name = `${name} ${n}`;
  }
  const id = makeId(name, new Set(state.all.map(c => c.id)));
  const made = { id, name, about: state.draft.about.trim(), params: { ...state.draft.params }, savedAt: new Date().toISOString(), origin: ownOrigin() };
  if (!(await persist([...ownList(), made], `Saved “${name}”.`))) return;
  state.all.push(made);
  state.sel = null;
  select(made, { force: true });
});

$('revert').addEventListener('click', () => {
  const c = state.sel;
  state.draft = { name: c.name, about: c.about ?? '', params: { ...c.params } };
  renderEditor();
  markList();
  selectedThumbSoon();
});

$('delete').addEventListener('click', async () => {
  const c = state.sel;
  if (!editable(c) || !confirm(`Delete “${c.name}”? This can't be undone.`)) return;
  if (!(await persist(ownList().filter(x => x !== c), `Deleted “${c.name}”.`))) return;
  state.all = state.all.filter(x => x !== c);
  state.sel = null;
  select(state.all[0], { force: true });
});

/* ---------- sharing, export and import ---------- */
function shareUrl() {
  return new URL(`${BASE}#c=${encodeShare(cleanName(), state.draft.params)}`, location.href).href;
}

function updateOpenLink() {
  const c = state.sel;
  $('open').href = c.origin !== 'new' && !isDirty() ? `${BASE}?config=${encodeURIComponent(c.id)}` : shareUrl();
}

$('share').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrl());
    toast('Copied a link that opens this kaleidoscope.');
  } catch {
    toast('The clipboard is not available here.', { bad: true });
  }
});

$('export').addEventListener('click', () => {
  const data = { name: cleanName(), about: state.draft.about.trim(), params: state.draft.params };
  download(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }), `${fileSlug(data.name)}.kaleidoscope.json`);
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let items;
  try {
    const data = JSON.parse(await file.text());
    items = (Array.isArray(data) ? data : [data]).filter(d => d && typeof d === 'object' && d.params);
    if (!items.length) throw new Error();
  } catch {
    return toast('That file has no kaleidoscopes in it.', { bad: true });
  }
  if (!confirmDiscard()) return;
  const taken = new Set(state.all.map(c => c.id));
  const made = items.map(d => {
    const name = String(d.name ?? 'Imported').slice(0, 60);
    const id = makeId(name, taken);
    taken.add(id);
    return { id, name, about: String(d.about ?? '').slice(0, 200), params: normalise(d.params), savedAt: new Date().toISOString(), origin: ownOrigin() };
  });
  if (!(await persist([...ownList(), ...made], made.length === 1 ? `Imported “${made[0].name}”.` : `Imported ${made.length} kaleidoscopes.`))) return;
  state.all.push(...made);
  state.sel = null;
  select(made[0], { force: true });
});

window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- pictures ---------- */
function pictureButtons() {
  const row = $('pics');
  for (const g of GALLERY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pic';
    b.dataset.id = g.id;
    b.title = `${g.title}, ${g.by}`;
    b.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img');
    img.src = thumbUrl(BASE, g);
    img.alt = g.title;
    b.append(img);
    b.addEventListener('click', () => chooseGallery(g));
    row.append(b);
  }
}

const markPic = id => { for (const b of $('pics').querySelectorAll('.pic[data-id]')) b.setAttribute('aria-pressed', String(b.dataset.id === id)); };

let token = 0;
async function chooseGallery(g) {
  const mine = ++token;
  markPic(g.id);
  try {
    const el = await loadImageUrl(galleryUrl(BASE, g));
    if (mine !== token) return;
    setPicture({ kind: 'image', el, gallery: g });
    store.set('kaleidoscopes:lab-picture', g.id);
  } catch (e) { toast(e.message, { bad: true }); }
}

$('add').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const mine = ++token;
  try {
    const pic = await loadFile(file);
    if (mine !== token) return URL.revokeObjectURL(pic.url);
    markPic(null);
    setPicture(pic);
  } catch (err) { toast(err.message, { bad: true, ms: 5000 }); }
});

function setPicture(pic) {
  const old = state.picture;
  if (old && old !== pic) {
    if (old.kind === 'video') { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); }
    if (old.url) URL.revokeObjectURL(old.url);
  }
  state.picture = pic;
  scope.setSource(pic.el);
  sizeCellCanvas();
  listThumbs();
  if (pic.kind === 'video') setTimeout(listThumbs, 600);
}

/* ---------- object cell inset ---------- */
const cellCanvas = $('cell');
const cellCtx = cellCanvas.getContext('2d');
function sizeCellCanvas() {
  const el = state.picture?.el;
  if (!el) return;
  const w = el.videoWidth || el.width, h = el.videoHeight || el.height;
  const k = Math.min(220 / w, 150 / h);
  const dpr = Math.min(2, devicePixelRatio || 1);
  cellCanvas.style.width = `${Math.round(w * k)}px`;
  cellCanvas.style.height = `${Math.round(h * k)}px`;
  cellCanvas.width = Math.round(w * k * dpr);
  cellCanvas.height = Math.round(h * k * dpr);
}

function drawCell() {
  const el = state.picture?.el;
  if (!el || !state.showCell) return;
  const W = cellCanvas.width, H = cellCanvas.height;
  cellCtx.drawImage(el, 0, 0, W, H);
  const view = $('preview');
  const pts = cellOutline(state.draft.params, state.t, state.user, scope.aspect, view.clientWidth / Math.max(1, view.clientHeight));
  cellCtx.save();
  cellCtx.beginPath();
  cellCtx.rect(0, 0, W, H);
  pts.forEach(([x, y], i) => (i ? cellCtx.lineTo : cellCtx.moveTo).call(cellCtx, x * W, y * H));
  cellCtx.closePath();
  cellCtx.fillStyle = 'rgba(8, 8, 10, 0.62)';
  cellCtx.fill('evenodd');
  cellCtx.beginPath();
  pts.forEach(([x, y], i) => (i ? cellCtx.lineTo : cellCtx.moveTo).call(cellCtx, x * W, y * H));
  cellCtx.closePath();
  cellCtx.lineWidth = 1.5 * Math.min(2, devicePixelRatio || 1);
  cellCtx.strokeStyle = '#e7b75a';
  cellCtx.stroke();
  cellCtx.restore();
}

$('cell-toggle').addEventListener('click', () => {
  state.showCell = !state.showCell;
  $('cell-toggle').setAttribute('aria-pressed', String(state.showCell));
  $('cell-inset').hidden = !state.showCell;
});

/* ---------- motion ---------- */
$('motion').addEventListener('click', () => {
  state.motion = !state.motion;
  $('motion').setAttribute('aria-pressed', String(state.motion));
  $('motion').textContent = state.motion ? 'Motion on' : 'Motion off';
});
$('restart').addEventListener('click', () => { state.t = 0; Object.assign(state.user, { x: 0, y: 0, rot: 0, scale: 1 }); });

attachGestures($('preview'), { user: state.user, config: () => state.draft.params });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.motion) state.t += dt;
  scope.resize();
  if (state.picture && state.draft) {
    scope.draw(state.draft.params, state.t, state.user);
    drawCell();
  }
  requestAnimationFrame(frame);
}

/* ---------- start ---------- */
async function start() {
  state.mode = await storeMode();
  const mode = $('mode');
  mode.classList.toggle('is-project', state.mode === 'project');
  mode.textContent = state.mode === 'project' ? 'Saving to the project' : 'Saving in this browser';
  mode.title = state.mode === 'project'
    ? 'Running on the local server: saves go to experiments/kaleidoscopes/configs.json, which ships with the site.'
    : 'No local server: saves stay in this browser. Run npm run dev to save into the project.';

  buildEditor();
  pictureButtons();
  state.all = await loadAll(BASE);
  const wanted = new URLSearchParams(location.search).get('config') ?? store.get('kaleidoscopes:lab');
  select(state.all.find(c => c.id === wanted) ?? state.all[0], { force: true });
  const g = GALLERY.find(x => x.id === store.get('kaleidoscopes:lab-picture')) ?? GALLERY[0];
  await chooseGallery(g);
  requestAnimationFrame(frame);
}
start();

// mirror labels are used for the arrangement select; keep the import so it's clear where they come from
void MIRRORS;
