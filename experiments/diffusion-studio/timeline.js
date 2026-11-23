// The timeline: keyframes for any setting, a playhead, and a recording of one pass to video.
//
// S.tl holds it all, so it is saved, undone and kept in versions with the rest: { dur, loop, tracks: { key: [{ t, v, e }] } }.
// A setting with a track is driven by it: moving that setting writes a key at the playhead. With Key changes on,
// moving any setting starts a track for it (with its old value at 0 s, so there is something to move from).
// Numbers ease between keys (each key's ease shapes the stretch after it), colours blend, everything else holds.

const EASES = {
  smooth: (x) => x * x * (3 - 2 * x),
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - (1 - x) ** 3,
  hold: () => 0,
};
const EASE_NAMES = [['smooth', 'Smooth'], ['linear', 'Even'], ['in', 'Speeds up'], ['out', 'Slows down'], ['hold', 'Holds, then jumps']];
const FPS = 30;

const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createTimeline({ host, toggle, S, meta, onEdit, onExport, onSeek }) {
  const TL = () => S.tl;
  let t = 0, playing = false, armed = false, sel = null, exporting = false;

  host.innerHTML = `
    <div class="tl__head">
      <button class="m-key" type="button" data-a="play" aria-pressed="false" data-tip="Play the timeline (L)">Play</button>
      <button class="m-key m-key--quiet" type="button" data-a="start" aria-label="Back to the start" data-tip="Back to the start">|◀</button>
      <label class="tl__field"><span class="m-legend m-legend--dim">At, s</span><input class="m-input" type="number" data-a="time" min="0" step="any" aria-label="Playhead, seconds, typed"></label>
      <label class="tl__field"><span class="m-legend m-legend--dim">Length, s</span><input class="m-input" type="number" data-a="dur" min="1" max="120" step="any" aria-label="Length, seconds, typed"></label>
      <span class="tl__sw"><span class="m-legend m-legend--dim" id="tl-loop-l">Loop</span><button class="m-switch" type="button" role="switch" aria-checked="true" aria-labelledby="tl-loop-l" data-a="loop"></button></span>
      <button class="m-key tl__rec" type="button" data-a="rec" aria-pressed="false" data-tip="While on, moving any setting keys it at the playhead">Key changes</button>
      <span class="tl__key" hidden>
        <select class="m-input" data-a="ease" aria-label="Ease after this key">${EASE_NAMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <button class="m-key m-key--quiet" type="button" data-a="del" data-tip="Delete this key (Delete)">Delete key</button>
      </span>
      <button class="m-key tl__export" type="button" data-a="export" data-tip="Record one pass of the timeline as a video">Export video</button>
    </div>
    <div class="tl__body" tabindex="-1">
      <div class="tl__names"></div>
      <div class="tl__lanes"><div class="tl__ruler"></div><div class="tl__rows"></div><div class="tl__head-line"></div></div>
    </div>
    <p class="m-legend m-legend--dim tl__empty">Turn on Key changes, then move any setting to animate it.</p>`;
  const q = (s) => host.querySelector(s);
  const playBtn = q('[data-a="play"]'), timeIn = q('[data-a="time"]'), durIn = q('[data-a="dur"]'), loopSw = q('[data-a="loop"]');
  const recBtn = q('[data-a="rec"]'), keyBox = q('.tl__key'), easeSel = q('[data-a="ease"]'), exportBtn = q('[data-a="export"]');
  const names = q('.tl__names'), lanes = q('.tl__lanes'), ruler = q('.tl__ruler'), rowsEl = q('.tl__rows'), line = q('.tl__head-line'), empty = q('.tl__empty'), body = q('.tl__body');

  const snap = (x) => Math.round(x * FPS) / FPS;
  const tracks = () => TL().tracks;
  const hasTracks = () => Object.keys(tracks()).length > 0;

  function valueAt(k, time) {
    const ks = tracks()[k];
    if (!ks?.length) return undefined;
    if (time <= ks[0].t) return ks[0].v;
    const last = ks[ks.length - 1];
    if (time >= last.t) return last.v;
    let i = 0; while (i < ks.length - 2 && ks[i + 1].t <= time) i++;
    const a = ks[i], b = ks[i + 1];
    const kind = meta(k)?.kind;
    if (kind !== 'n' && kind !== 'c') return a.v;
    const x = (EASES[a.e] || EASES.smooth)((time - a.t) / Math.max(1e-6, b.t - a.t));
    if (kind === 'n') return a.v + (b.v - a.v) * x;
    const ca = hexToRgb(a.v), cb = hexToRgb(b.v);
    return rgbToHex(ca.map((v, j) => v + (cb[j] - v) * x));
  }

  // ---- drawing ----
  const pct = (time) => `${(time / TL().dur) * 100}%`;
  function drawRuler() {
    const dur = TL().dur, step = dur > 40 ? 5 : dur > 16 ? 2 : 1;
    let h = '';
    for (let s = 0; s <= dur + 1e-6; s += step) h += `<span class="tl__tick" style="left:${pct(s)}">${s}</span>`;
    ruler.innerHTML = h;
  }
  function drawRows() {
    const ks = Object.keys(tracks());
    empty.hidden = ks.length > 0;
    body.hidden = ks.length === 0;
    const nameOf = (k) => { const m = meta(k); return m ? `${m.group ? m.group + ' · ' : ''}${m.label.replace(/, [^,]+$/, '')}` : k; };
    names.innerHTML = ks.map((k) => `<div class="tl__name"><span class="m-legend" title="${esc(nameOf(k))}">${esc(nameOf(k))}</span>
      <button class="tl__x" type="button" data-k="${esc(k)}" aria-label="Stop animating ${esc(meta(k)?.label || k)}">×</button></div>`).join('');
    rowsEl.innerHTML = ks.map((k) => `<div class="tl__lane" data-k="${esc(k)}">${tracks()[k].map((key, i) =>
      `<button class="tl__dia${sel && sel.k === k && sel.i === i ? ' is-sel' : ''}" type="button" data-k="${esc(k)}" data-i="${i}" style="left:${pct(key.t)}" aria-label="Key at ${key.t.toFixed(2)} s"></button>`).join('')}</div>`).join('');
    keyBox.hidden = !sel;
    if (sel) easeSel.value = tracks()[sel.k]?.[sel.i]?.e || 'smooth';
    drawHead();
  }
  function drawHead() {
    line.style.left = pct(t);
    if (document.activeElement !== timeIn) timeIn.value = t.toFixed(2);
    if (document.activeElement !== durIn) durIn.value = String(TL().dur);
    loopSw.setAttribute('aria-checked', String(!!TL().loop));
    timeIn.max = String(TL().dur);
  }
  function redraw() { drawRuler(); drawRows(); }

  // ---- editing ----
  function edited() { onEdit?.(); drawRows(); }
  function upsert(k, time, v) {
    const ks = (tracks()[k] ||= []);
    const at = ks.findIndex((x) => Math.abs(x.t - time) < 0.5 / FPS);
    if (at >= 0) ks[at].v = v;
    else { ks.push({ t: time, v, e: 'smooth' }); ks.sort((a, b) => a.t - b.t); }
    sel = { k, i: ks.findIndex((x) => Math.abs(x.t - time) < 0.5 / FPS) };
  }
  // a setting was moved by hand: key it, if it has a track or keying is on
  function keyChanged(k, oldV) {
    if (exporting || k === 'tl') return false;
    const m = meta(k);
    if (!m || !['n', 'c', 's', 'g', 'w', 't'].includes(m.kind)) return false;
    const has = !!tracks()[k];
    if (!has && !armed) return false;
    if (!has && t > 0.5 / FPS && oldV !== undefined) upsert(k, 0, oldV);
    upsert(k, snap(t), S[k]);
    edited();
    return true;
  }

  // ---- controls ----
  function setPlaying(v) { playing = v; playBtn.textContent = v ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', String(v)); }
  function seek(time) { t = Math.max(0, Math.min(TL().dur, time)); drawHead(); onSeek?.(); }
  playBtn.addEventListener('click', () => { if (!playing && t >= TL().dur - 1e-3) t = 0; setPlaying(!playing); });
  q('[data-a="start"]').addEventListener('click', () => seek(0));
  timeIn.addEventListener('input', () => { const v = timeIn.valueAsNumber; if (Number.isFinite(v) && v >= 0 && v <= TL().dur) seek(v); });
  timeIn.addEventListener('change', () => { const v = timeIn.valueAsNumber; seek(Number.isFinite(v) ? v : t); timeIn.value = t.toFixed(2); });
  durIn.addEventListener('input', () => { const v = durIn.valueAsNumber; if (Number.isFinite(v) && v >= 1 && v <= 120) { TL().dur = v; if (t > v) t = v; redraw(); onEdit?.(); } });
  durIn.addEventListener('change', () => { const v = durIn.valueAsNumber; TL().dur = Number.isFinite(v) ? Math.min(120, Math.max(1, v)) : TL().dur; redraw(); onEdit?.(); });
  loopSw.addEventListener('click', () => setTimeout(() => { TL().loop = loopSw.getAttribute('aria-checked') === 'true'; onEdit?.(); }));
  recBtn.addEventListener('click', () => { armed = !armed; recBtn.setAttribute('aria-pressed', String(armed)); recBtn.classList.toggle('is-on', armed); });
  easeSel.addEventListener('change', () => { const key = sel && tracks()[sel.k]?.[sel.i]; if (key) { key.e = easeSel.value; edited(); } });
  function deleteSel() {
    if (!sel) return;
    const ks = tracks()[sel.k]; if (!ks) return;
    ks.splice(sel.i, 1);
    if (!ks.length) delete tracks()[sel.k];
    sel = null; edited();
  }
  q('[data-a="del"]').addEventListener('click', deleteSel);
  exportBtn.addEventListener('click', () => onExport?.());
  names.addEventListener('click', (e) => { const b = e.target.closest('.tl__x'); if (!b) return; delete tracks()[b.dataset.k]; if (sel?.k === b.dataset.k) sel = null; edited(); });
  host.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSel(); }
  });

  // scrub on the ruler or an empty stretch of lane; drag a key to move it in time; double-click a lane to key it there
  const timeAt = (e) => { const r = rowsEl.getBoundingClientRect(); return snap(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * TL().dur); };
  let drag = null;
  lanes.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const d = e.target.closest('.tl__dia');
    lanes.setPointerCapture(e.pointerId);
    if (d) { sel = { k: d.dataset.k, i: Number(d.dataset.i) }; drag = { mode: 'key', k: d.dataset.k, key: tracks()[d.dataset.k][Number(d.dataset.i)], moved: false }; seek(drag.key.t); drawRows(); }
    else { drag = { mode: 'scrub' }; seek(timeAt(e)); }
  });
  lanes.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.mode === 'scrub') seek(timeAt(e));
    else { drag.key.t = timeAt(e); drag.moved = true; const ks = tracks()[drag.k]; ks.sort((a, b) => a.t - b.t); sel = { k: drag.k, i: ks.indexOf(drag.key) }; seek(drag.key.t); drawRows(); }
  });
  const up = () => { if (drag?.mode === 'key' && drag.moved) { const ks = tracks()[drag.k]; const seen = new Set(); tracks()[drag.k] = ks.filter((x) => { const s = Math.round(x.t * FPS); if (seen.has(s)) return false; seen.add(s); return true; }); edited(); } drag = null; };
  lanes.addEventListener('pointerup', up);
  lanes.addEventListener('pointercancel', up);
  rowsEl.addEventListener('dblclick', (e) => { const lane = e.target.closest('.tl__lane'); if (!lane || e.target.closest('.tl__dia')) return; const k = lane.dataset.k; upsert(k, timeAt(e), valueAt(k, timeAt(e))); edited(); });

  // the strip opens and closes from the transport
  toggle?.addEventListener('click', () => { const open = host.hidden; host.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) redraw(); window.dispatchEvent(new Event('resize')); });
  document.addEventListener('keydown', (e) => { if (e.key === 'l' && !e.metaKey && !e.ctrlKey && !e.target.closest('input, textarea, select')) playBtn.click(); });
  redraw();

  return {
    hasTracks,
    get time() { return t; },
    get playing() { return playing; },
    get armed() { return armed; },
    evaluate() { const out = {}; for (const k of Object.keys(tracks())) out[k] = valueAt(k, t); return out; },
    step(dt) {
      if (!playing) return;
      const dur = TL().dur;
      t += dt;
      if (t >= dur) { if (TL().loop && !exporting) t %= dur; else { t = dur; setPlaying(false); } }
      drawHead();
    },
    keyChanged,
    seek,
    play() { setPlaying(true); },
    stop() { setPlaying(false); },
    setExporting(v) { exporting = v; exportBtn.disabled = v; exportBtn.textContent = v ? 'Recording…' : 'Export video'; },
    redraw,
  };
}
