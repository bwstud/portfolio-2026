/* The rig editor: a plan of the stage seen from above, where trusses are drawn, moved and
   reshaped and fixtures are hung, slid, grouped and deleted; and the Rig tab's controls.
   It edits a copy of the plot while you drag and hands it back when you let go, so every
   gesture is one undo step. Mirror keeps the two sides of the rig in step. */

import {
  TYPES, TYPE, BUDGET, TEMPLATES, measure, trussPoint, trussLength, fixturePoint,
  closestT, spread, mirrorOf, mirrorT, mirroredCopy, tally, uid, clone,
} from './plot.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const GROUP_HUES = ['#ff7ad9', '#ffb547', '#8d9bff', '#5cf2c9', '#ff8a6b', '#c3f25c'];
const TYPE_FILL = { beam: '#eef1f6', wash: '#ffcf7a', laser: '#7dffb0', strobe: '#ffffff', pixel: '#7de2ff' };
const isRing = tr => tr.shape === 'arc' && Math.abs(tr.a1 - tr.a0) > TAU - 0.01;

export function rigEditor({ svg, panel, ctx }) {
  let drag = null, work = null, mirror = true;
  const sel = { truss: null, fx: new Set() };
  const hangOpts = { type: 'beam', n: 6, span: 0.9 };
  const plot = () => work || ctx.plot();
  const m = () => measure(ctx.def());
  // a plot we can change: the venue's own rig becomes an explicit one the first time
  const editable = () => clone(ctx.plot());

  /* ---------- names and lookups ---------- */
  function trussName(p, tr) {
    const kinds = { truss: 'Truss', tower: 'Tower', floor: 'Floor line' };
    const base = tr.kind === 'truss' && tr.shape === 'arc' ? (isRing(tr) ? 'Ring' : 'Arc') : kinds[tr.kind];
    const same = p.trusses.filter(o => (o.kind === 'truss' && o.shape === 'arc' ? (isRing(o) ? 'Ring' : 'Arc') : kinds[o.kind]) === base);
    return `${base} ${same.indexOf(tr) + 1}`;
  }
  const byId = (p, id) => p.trusses.find(t => t.id === id);
  const groupHue = (p, gid) => { const i = p.groups.findIndex(g => g.id === gid); return i < 0 ? null : GROUP_HUES[i % GROUP_HUES.length]; };
  function contents(p, trId) {
    const n = {}; for (const f of p.fixtures) if (f.truss === trId) n[f.type] = (n[f.type] || 0) + 1;
    const parts = TYPES.filter(t => n[t.id]).map(t => `${n[t.id]} ${n[t.id] === 1 ? t.one : t.plural}`);
    return parts.length ? parts.join(' · ') : 'Nothing hung yet';
  }

  /* ---------- drawing the plan ---------- */
  let view = null;
  function frameView() {
    const { W, D } = m(), k = clamp(W / 24, 0.6, 2.5);
    const mx = Math.max(2.4 * k, W * 0.09), x0 = -W / 2 - mx, y0 = -D - Math.max(1.6 * k, D * 0.12), w = W + mx * 2, h = -y0 + 2.6 * k;
    view = { k, x0, y0, w, h };
    svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  }
  function pathOf(tr, M, t0 = 0, t1 = 1, type = null) {
    const steps = tr.shape === 'arc' ? Math.max(8, Math.ceil(Math.abs(tr.a1 - tr.a0) * (t1 - t0) * 12)) : 1, p = [0, 0, 0];
    let d = '';
    for (let s = 0; s <= steps; s++) {
      const t = t0 + (t1 - t0) * s / steps;
      if (type) fixturePoint(tr, type, t, M, p); else trussPoint(tr, t, M, p);
      d += `${s ? 'L' : 'M'}${p[0].toFixed(3)} ${p[2].toFixed(3)}`;
    }
    return d;
  }
  function draw() {
    if (!view) frameView();
    const p = plot(), M = m(), { W, D } = M, k = view.k, fs = (k * 0.55).toFixed(2);
    let h = `<rect class="deck" x="${-W / 2}" y="${-D}" width="${W}" height="${D}" rx="${k * 0.15}"/>`;
    h += `<line class="cl" x1="0" y1="${-D - k}" x2="0" y2="${k * 1.5}"/>`;
    h += `<text class="lbl" x="0" y="${-D - k * 0.6}" font-size="${fs}">Upstage</text><text class="lbl" x="0" y="${k * 1.9}" font-size="${fs}">Audience</text>`;
    // trusses
    for (const tr of p.trusses) {
      const s = sel.truss === tr.id ? ' is-sel' : '';
      if (tr.kind === 'tower') {
        const q = trussPoint(tr, 0, M), r = k * 0.42;
        h += `<g class="tr tr--tower${s}" data-truss="${tr.id}"><rect class="hit" x="${q[0] - r * 1.6}" y="${q[2] - r * 1.6}" width="${r * 3.2}" height="${r * 3.2}"/><rect class="bar" x="${q[0] - r}" y="${q[2] - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.2}"/></g>`;
      } else {
        const d = pathOf(tr, M);
        h += `<g class="tr tr--${tr.kind}${s}" data-truss="${tr.id}"><path class="hit" d="${d}"/><path class="bar" d="${d}"/></g>`;
      }
    }
    // fixtures
    const r = k * 0.26;
    for (const f of p.fixtures) {
      const tr = byId(p, f.truss); if (!tr) continue;
      const on = sel.fx.has(f.id) ? ' is-sel' : '', hue = groupHue(p, f.group), fill = hue || TYPE_FILL[f.type];
      if (f.type === 'pixel') { h += `<path class="px${on}" data-fx="${f.id}" d="${pathOf(tr, M, f.t ?? 0, f.t1 ?? 1, 'pixel')}" style="stroke:${hue || ''}"/>`; continue; }
      const q = fixturePoint(tr, f.type, f.t, M), x = q[0], y = q[2];
      // on a tower the heads stack up; fan them out a little so each can be picked
      const off = tr.kind === 'tower' ? (f.t - 0.5) * k * 1.6 : 0;
      const X = (x + off).toFixed(3), Y = y.toFixed(3);
      if (f.type === 'beam') h += `<circle class="fx${on}" data-fx="${f.id}" cx="${X}" cy="${Y}" r="${r}" fill="${fill}"/>`;
      else if (f.type === 'wash') h += `<rect class="fx${on}" data-fx="${f.id}" x="${X - r * 1.1}" y="${Y - r * 1.1}" width="${r * 2.2}" height="${r * 2.2}" rx="${r * 0.5}" fill="${fill}"/>`;
      else if (f.type === 'laser') h += `<path class="fx${on}" data-fx="${f.id}" d="M${X} ${Y - r * 1.3}L${(x + off + r * 1.2).toFixed(3)} ${(y + r * 0.9).toFixed(3)}L${(x + off - r * 1.2).toFixed(3)} ${(y + r * 0.9).toFixed(3)}Z" fill="${fill}"/>`;
      else h += `<rect class="fx${on}" data-fx="${f.id}" x="${X - r * 1.4}" y="${Y - r * 0.55}" width="${r * 2.8}" height="${r * 1.1}" rx="${r * 0.2}" fill="${fill}"/>`;
    }
    // handles for the selected truss, and its height
    const st = sel.truss && byId(p, sel.truss);
    if (st) {
      const hr = k * 0.34;
      if (st.shape === 'line' && st.kind !== 'tower') for (const e of ['a', 'b']) { const q = trussPoint(st, e === 'a' ? 0 : 1, M); h += `<circle class="handle" data-handle="${e}" cx="${q[0]}" cy="${q[2]}" r="${hr}"/>`; }
      if (st.shape === 'arc') {
        const c = [st.c[0] * M.hw, st.c[1] * M.D], q = trussPoint(st, 0.5, M);
        h += `<circle class="handle handle--c" data-handle="c" cx="${c[0]}" cy="${c[1]}" r="${hr * 0.8}"/><circle class="handle" data-handle="r" cx="${q[0]}" cy="${q[2]}" r="${hr}"/>`;
      }
      const q = trussPoint(st, st.kind === 'tower' ? 1 : 0, M);
      h += `<text class="lbl lbl--sel" x="${q[0]}" y="${q[2] - k * 0.8}" font-size="${fs}">${trussName(p, st)} · ${(q[1] - M.H).toFixed(1)} m</text>`;
    }
    if (drag?.kind === 'lasso' && drag.moved) {
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.z0, drag.z1);
      h += `<rect class="lasso" x="${x}" y="${y}" width="${Math.abs(drag.x1 - drag.x0)}" height="${Math.abs(drag.z1 - drag.z0)}"/>`;
    }
    svg.innerHTML = h;
  }

  /* ---------- gestures ---------- */
  function toPlan(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, q.y];
  }
  const snap = (v, s = 0.25) => Math.round(v / s) * s;
  // the fixtures that mirror a set of fixtures, on the mirror truss or the same one
  function partners(p, ids) {
    const M = m(), out = new Map();
    if (!mirror) return out;
    for (const id of ids) {
      const f = p.fixtures.find(x => x.id === id); if (!f) continue;
      const tr = byId(p, f.truss), mt = mirrorOf(p, tr, M); if (!mt) continue;
      const want = mirrorT(tr, f.t, mt, M);
      let best = null, bd = 0.04;
      for (const o of p.fixtures) {
        if (o === f || o.type !== f.type || o.truss !== mt.id || ids.has(o.id)) continue;
        const d = Math.abs(o.t - want); if (d < bd) { bd = d; best = o; }
      }
      if (best) out.set(f.id, best.id);
    }
    return out;
  }

  svg.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const [x, z] = toPlan(e), M = m();
    svg.setPointerCapture(e.pointerId);
    const hEl = e.target.closest('[data-handle]'), fEl = e.target.closest('[data-fx]'), tEl = e.target.closest('[data-truss]');
    if (hEl && sel.truss) {
      work = editable();
      const tr = byId(work, sel.truss), mt = mirror ? mirrorOf(work, tr, M) : null;
      drag = { kind: 'handle', which: hEl.dataset.handle, id: tr.id, mid: mt && mt.id !== tr.id ? mt.id : null, self: mt?.id === tr.id, moved: false };
    } else if (fEl) {
      const id = fEl.dataset.fx;
      if (e.shiftKey || e.metaKey) { sel.fx.has(id) ? sel.fx.delete(id) : sel.fx.add(id); }
      else if (!sel.fx.has(id)) { sel.fx.clear(); sel.fx.add(id); }
      sel.truss = null;
      work = editable();
      const f = work.fixtures.find(q => q.id === id), tr = byId(work, f.truss);
      const orig = new Map([...sel.fx].map(i => { const q = work.fixtures.find(o => o.id === i); return [i, q ? [q.t, q.t1] : null]; }));
      const pr = partners(work, sel.fx);
      for (const pid of pr.values()) { const q = work.fixtures.find(o => o.id === pid); orig.set(pid, [q.t, q.t1]); }
      drag = { kind: 'fx', id, t0: tr.kind === 'tower' ? null : closestT(tr, x, z, M), orig, pr, moved: false, sx: e.clientX, sy: e.clientY };
    } else if (tEl) {
      sel.truss = tEl.dataset.truss; sel.fx.clear();
      work = editable();
      const tr = byId(work, sel.truss), mt = mirror ? mirrorOf(work, tr, M) : null;
      drag = { kind: 'truss', id: tr.id, x0: x, z0: z, orig: clone(tr), mid: mt && mt.id !== tr.id ? mt.id : null, morig: mt && mt.id !== tr.id ? clone(mt) : null, self: mt?.id === tr.id, moved: false };
    } else {
      drag = { kind: 'lasso', x0: x, z0: z, x1: x, z1: z, moved: false, add: e.shiftKey };
    }
    draw(); renderPanel();
  });

  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const [x, z] = toPlan(e), M = m();
    if (drag.kind === 'lasso') { drag.x1 = x; drag.z1 = z; drag.moved = drag.moved || Math.hypot(x - drag.x0, z - drag.z0) > view.k * 0.3; draw(); return; }
    if (drag.kind === 'fx') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      const f = work.fixtures.find(q => q.id === drag.id), tr = byId(work, f.truss);
      if (drag.t0 == null) return;           // heads on a tower are placed from the panel
      const dt = closestT(tr, x, z, M) - drag.t0;
      const wrap = isRing(tr);
      for (const id of sel.fx) moveBy(id, dt, wrap);
      for (const [id, pid] of drag.pr) {
        const a = work.fixtures.find(q => q.id === id), b = work.fixtures.find(q => q.id === pid);
        const ta = byId(work, a.truss), tb = byId(work, b.truss);
        b.t = mirrorT(ta, a.t, tb, M);
        if (a.type === 'pixel') { const t1 = mirrorT(ta, a.t1 ?? 1, tb, M); if (t1 < b.t) { b.t1 = b.t; b.t = t1; } else b.t1 = t1; }
      }
      ctx.preview(work); draw(); return;
    }
    if (drag.kind === 'truss') {
      let dx = snap(x - drag.x0) / M.hw, dz = snap(z - drag.z0) / M.D;
      if (!drag.moved && Math.hypot(x - drag.x0, z - drag.z0) < view.k * 0.25) return;
      drag.moved = true;
      if (drag.self) dx = 0;                 // a symmetric truss stays on the centre line
      shift(byId(work, drag.id), drag.orig, dx, dz);
      if (drag.mid) shift(byId(work, drag.mid), drag.morig, -dx, dz);
      ctx.preview(work); draw(); return;
    }
    if (drag.kind === 'handle') {
      drag.moved = true;
      const tr = byId(work, drag.id);
      if (drag.which === 'r') {
        tr.r = clamp(Math.hypot(x - tr.c[0] * M.hw, z - tr.c[1] * M.D) / M.hw, 0.08, 1.4);
      } else if (drag.which === 'c') {
        tr.c = [drag.self ? 0 : clamp(snap(x) / M.hw, -1.4, 1.4), clamp(snap(z) / M.D, -1.3, 0.4)];
      } else {
        const e1 = tr[drag.which];
        e1[0] = clamp(snap(x) / M.hw, -1.5, 1.5); e1[2] = clamp(snap(z) / M.D, -1.3, 0.4);
        // a symmetric truss keeps its other end mirrored
        if (drag.self) { const o = tr[drag.which === 'a' ? 'b' : 'a']; o[0] = -e1[0]; o[2] = e1[2]; }
      }
      if (drag.mid) { const mt = byId(work, drag.mid); Object.assign(mt, mirroredCopy(tr, mt.id)); }
      ctx.preview(work); draw();
    }
  });

  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'lasso') {
      if (d.moved) {
        const M = m(), p = plot(), x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), z0 = Math.min(d.z0, d.z1), z1 = Math.max(d.z0, d.z1);
        if (!d.add) sel.fx.clear();
        for (const f of p.fixtures) {
          const tr = byId(p, f.truss); if (!tr) continue;
          const q = fixturePoint(tr, f.type, f.type === 'pixel' ? ((f.t ?? 0) + (f.t1 ?? 1)) / 2 : f.t, M);
          if (q[0] >= x0 && q[0] <= x1 && q[2] >= z0 && q[2] <= z1) sel.fx.add(f.id);
        }
        sel.truss = null;
      } else { sel.fx.clear(); sel.truss = null; }
    } else if (d.kind === 'fx' && d.moved) ctx.apply(work, 'Slide fixtures');
    else if (d.kind === 'truss' && d.moved) ctx.apply(work, 'Move truss');
    else if (d.kind === 'handle' && d.moved) ctx.apply(work, d.which === 'r' ? 'Truss radius' : 'Reshape truss');
    work = null;
    draw(); renderPanel();
  });
  svg.addEventListener('pointercancel', () => { if (drag && work) ctx.revert(); drag = null; work = null; render(); });

  function moveBy(id, dt, wrap) {
    const f = work.fixtures.find(q => q.id === id), o = drag.orig.get(id); if (!f || !o) return;
    if (f.type === 'pixel') { const len = (o[1] ?? 1) - o[0], t = clamp(o[0] + dt, 0, 1 - len); f.t = t; f.t1 = t + len; return; }
    f.t = wrap ? ((o[0] + dt) % 1 + 1) % 1 : clamp(o[0] + dt, 0, 1);
  }
  function shift(tr, o, dx, dz) {
    if (tr.shape === 'arc') { tr.c = [clamp(o.c[0] + dx, -1.4, 1.4), clamp(o.c[1] + dz, -1.3, 0.4)]; return; }
    for (const e of ['a', 'b']) { tr[e][0] = clamp(o[e][0] + dx, -1.5, 1.5); tr[e][2] = clamp(o[e][2] + dz, -1.3, 0.4); }
  }

  /* ---------- edits from the panel ---------- */
  // run an edit on a fresh copy of the plot, then commit it as one undo step
  function edit(label, fn) { const p = editable(); if (fn(p) === false) return; ctx.apply(p, label); render(); }
  const within = (p, type, extra) => {
    const have = tally(p)[type] + extra;
    return have <= BUDGET[type];
  };
  function hangOn(p, tr, type, n, span) {
    p.fixtures = p.fixtures.filter(f => !(f.truss === tr.id && f.type === type));
    if (type === 'pixel') { const a = (1 - span) / 2; p.fixtures.push({ id: uid('x'), type, truss: tr.id, t: tr.kind === 'tower' ? 0.1 : a, t1: tr.kind === 'tower' ? 0.98 : 1 - a, group: '' }); return 1; }
    const ts = isRing(tr) ? Array.from({ length: n }, (_, k) => k / n) : tr.kind === 'tower' ? spread(n, span * 0.7).map(t => t * 0.9 + 0.08) : spread(n, span);
    const room = BUDGET[type] - tally(p)[type], take = Math.min(ts.length, room);
    for (const t of ts.slice(0, take)) p.fixtures.push({ id: uid('x'), type, truss: tr.id, t, group: '' });
    return take;
  }
  function hang() {
    const { type, n, span } = hangOpts;
    let short = false;
    edit(`Hang ${TYPE[type].plural}`, p => {
      const tr = byId(p, sel.truss), M = m(), mt = mirror ? mirrorOf(p, tr, M) : null;
      const want = type === 'pixel' ? 1 : n;
      if (hangOn(p, tr, type, n, span) < want) short = true;
      if (mt && mt.id !== tr.id && hangOn(p, mt, type, n, span) < want) short = true;
    });
    if (short) ctx.toast(`That's the most ${TYPE[type].plural} the rig can run: ${BUDGET[type]}`);
  }
  function addTruss(kind) {
    edit('Add truss', p => {
      const add = t => { p.trusses.push(t); return t; };
      let t;
      if (kind === 'line') t = add({ id: uid('t'), kind: 'truss', shape: 'line', a: [-0.6, 1.05, -0.55], b: [0.6, 1.05, -0.55] });
      else if (kind === 'arc') t = add({ id: uid('t'), kind: 'truss', shape: 'arc', c: [0, -0.75], y: 1.1, r: 0.55, a0: Math.PI * 0.18, a1: Math.PI * 0.82 });
      else if (kind === 'ring') t = add({ id: uid('t'), kind: 'truss', shape: 'arc', c: [0, -0.5], y: 1.12, r: 0.32, a0: 0, a1: TAU });
      else if (kind === 'floor') t = add({ id: uid('t'), kind: 'floor', shape: 'line', a: [-0.85, 0, -0.85], b: [0.85, 0, -0.85] });
      else {
        t = add({ id: uid('t'), kind: 'tower', shape: 'line', a: [-1.08, 0, -0.4], b: [-1.08, 1, -0.4] });
        if (mirror) add(mirroredCopy(t, uid('t')));
      }
      sel.truss = t.id; sel.fx.clear();
    });
  }
  function setTruss(fn, label, live) {
    const p = editable(), tr = byId(p, sel.truss), M = m();
    const mt = mirror ? mirrorOf(p, tr, M) : null;
    fn(tr);
    if (mt && mt.id !== tr.id) Object.assign(mt, mirroredCopy(tr, mt.id));
    if (live) { work = p; ctx.preview(p); draw(); work = null; } else { ctx.apply(p, label); render(); }
  }
  function duplicate() {
    edit('Duplicate truss', p => {
      const M = m(), tr = byId(p, sel.truss), mt = mirror ? mirrorOf(p, tr, M) : null;
      const copies = [tr, ...(mt && mt.id !== tr.id ? [mt] : [])];
      let first = null;
      for (const src of copies) {
        const c = { ...clone(src), id: uid('t') }, dz = -Math.min(2, M.D * 0.15) / M.D;
        if (c.shape === 'arc') c.c[1] = clamp(c.c[1] + dz, -1.3, 0.4); else { c.a[2] = clamp(c.a[2] + dz, -1.3, 0.4); c.b[2] = clamp(c.b[2] + dz, -1.3, 0.4); }
        p.trusses.push(c);
        for (const f of p.fixtures.filter(f => f.truss === src.id)) p.fixtures.push({ ...f, id: uid('x'), truss: c.id });
        first = first || c;
      }
      const over = TYPES.find(t => tally(p)[t.id] > BUDGET[t.id]);
      if (over) { ctx.toast(`Not enough room for more ${over.plural}: the rig can run ${BUDGET[over.id]}`); return false; }
      sel.truss = first.id;
    });
  }
  function removeTruss() {
    edit('Delete truss', p => {
      const M = m(), tr = byId(p, sel.truss), mt = mirror ? mirrorOf(p, tr, M) : null;
      const gone = new Set([tr.id, ...(mt ? [mt.id] : [])]);
      p.trusses = p.trusses.filter(t => !gone.has(t.id));
      p.fixtures = p.fixtures.filter(f => !gone.has(f.truss));
      sel.truss = null;
    });
  }
  function removeFixtures() {
    edit(sel.fx.size === 1 ? 'Delete fixture' : 'Delete fixtures', p => {
      const gone = new Set([...sel.fx, ...partners(p, sel.fx).values()]);
      p.fixtures = p.fixtures.filter(f => !gone.has(f.id));
      sel.fx.clear();
    });
  }
  function spaceEvenly() {
    edit('Space evenly', p => {
      const byTruss = new Map();
      for (const f of p.fixtures) if (sel.fx.has(f.id) && f.type !== 'pixel') { if (!byTruss.has(f.truss)) byTruss.set(f.truss, []); byTruss.get(f.truss).push(f); }
      for (const [tid, list] of byTruss) {
        if (list.length < 2) continue;
        const tr = byId(p, tid);
        list.sort((a, b) => a.t - b.t);
        if (isRing(tr)) { const t0 = list[0].t; list.forEach((f, k) => { f.t = (t0 + k / list.length) % 1; }); continue; }
        const lo = list[0].t, hi = list[list.length - 1].t;
        list.forEach((f, k) => { f.t = lo + (hi - lo) * k / (list.length - 1); });
      }
    });
  }
  function setGroup(gid) {
    edit(gid ? 'Group fixtures' : 'Ungroup fixtures', p => {
      const ids = new Set([...sel.fx, ...partners(p, sel.fx).values()]);
      for (const f of p.fixtures) if (ids.has(f.id)) f.group = gid;
    });
  }
  function newGroup(name) {
    const p0 = ctx.plot(), types = new Set(p0.fixtures.filter(f => sel.fx.has(f.id)).map(f => f.type));
    if (types.size !== 1) return;
    const type = TYPE[[...types][0]].group, gid = uid('g');
    edit('New group', p => {
      p.groups.push({ id: gid, name: name || `Group ${p.groups.length + 1}`, type });
      const ids = new Set([...sel.fx, ...partners(p, sel.fx).values()]);
      for (const f of p.fixtures) if (ids.has(f.id)) f.group = gid;
    });
    ctx.groupsChanged();
  }

  /* ---------- the panel ---------- */
  function renderPanel() {
    const p = plot(), M = m(), n = tally(p);
    const house = !ctx.custom();
    let h = `<section class="sec"><div class="sec__head"><h3>Start from</h3><span class="meta">${house ? 'This venue’s rig' : 'Your rig'}</span></div><div class="templates">`;
    for (const t of TEMPLATES) h += `<button type="button" data-template="${t.id}"><b>${t.name}</b><small>${t.note}</small></button>`;
    h += `</div></section>`;
    h += `<section class="sec"><div class="sec__head"><h3>Add a truss</h3></div><div class="row" style="margin-top:0">`;
    for (const [k, label] of [['line', 'Straight'], ['arc', 'Arc'], ['ring', 'Ring'], ['tower', mirror ? 'Towers' : 'Tower'], ['floor', 'Floor line']]) h += `<button class="btn" type="button" data-add="${k}">${label}</button>`;
    h += `</div></section>`;
    // the selection
    h += `<section class="sec" id="rig-sel">`;
    const tr = sel.truss && byId(p, sel.truss);
    if (tr) {
      const len = trussLength(tr, M), hgt = trussPoint(tr, tr.kind === 'tower' ? 1 : 0.5, M)[1] - M.H;
      h += `<div class="sec__head"><h3>${trussName(p, tr)}</h3><span class="meta">${len.toFixed(1)} m${tr.kind === 'floor' ? ' on the deck' : ` · ${hgt.toFixed(1)} m up`}</span></div>`;
      h += `<p class="say" style="margin-top:0">${contents(p, tr.id)}</p>`;
      if (tr.kind !== 'floor') {
        const y = tr.kind === 'tower' ? tr.b[1] : tr.shape === 'arc' ? tr.y : (tr.a[1] + tr.b[1]) / 2;
        h += range('height', tr.kind === 'tower' ? 'Height' : 'Trim height', 0.3, 1.7, 0.01, y, v => `${(v * M.rh + (tr.kind === 'tower' ? M.H : 0)).toFixed(1)} m`);
      }
      if (tr.kind === 'truss' && tr.shape === 'line') h += range('rake', 'Rake', -0.5, 0.5, 0.01, tr.b[1] - tr.a[1], v => `${v > 0 ? '+' : ''}${(v * M.rh).toFixed(1)} m`, 'Raise one end. With mirror on, the other side rakes to match.');
      if (tr.shape === 'arc') {
        h += range('radius', 'Radius', 0.08, 1.4, 0.01, tr.r, v => `${(v * M.hw).toFixed(1)} m`);
        h += range('sweep', 'Sweep', 40, 360, 5, Math.round(Math.abs(tr.a1 - tr.a0) * 180 / Math.PI), v => `${v}°`);
      }
      h += `<div class="field"><div class="label">Hang</div><div class="seg" id="hang-type"></div></div>`;
      if (hangOpts.type !== 'pixel') h += range('count', 'How many', 1, 24, 1, hangOpts.n, v => String(v), null, true);
      if (!isRing(tr)) h += range('span', 'Spread along it', 0.2, 1, 0.01, hangOpts.span, v => `${Math.round(v * 100)}%`, null, true);
      h += `<div class="row"><button class="btn btn--accent" type="button" data-act="hang">${hangOpts.type === 'pixel' ? 'Run a pixel strip' : `Hang ${hangOpts.type === 'beam' && hangOpts.n === 1 ? 'a spot' : `${hangOpts.n} ${hangOpts.n === 1 ? TYPE[hangOpts.type].one : TYPE[hangOpts.type].plural}`}`}</button>`;
      h += `<button class="btn" type="button" data-act="clear">Clear it</button><button class="btn" type="button" data-act="dup">Duplicate</button><button class="btn btn--danger" type="button" data-act="del-truss">Delete</button></div>`;
      h += `<p class="hint">Hanging replaces whatever of that kind is already on this truss.${mirror ? ' Mirror hangs the same on the other side.' : ''}</p>`;
    } else if (sel.fx.size) {
      const list = p.fixtures.filter(f => sel.fx.has(f.id)), types = [...new Set(list.map(f => f.type))];
      const what = types.map(t => { const k = list.filter(f => f.type === t).length; return `${k} ${k === 1 ? TYPE[t].one : TYPE[t].plural}`; }).join(', ');
      h += `<div class="sec__head"><h3>${what}</h3><span class="meta">selected</span></div>`;
      if (types.length === 1) {
        const gtype = TYPE[types[0]].group, gs = p.groups.filter(g => g.type === gtype);
        h += `<div class="field"><div class="label">Group</div><div class="seg" id="fx-group"></div></div>`;
        h += `<div class="row"><input class="text" id="group-name" type="text" maxlength="24" placeholder="New group name" aria-label="New group name" style="flex:1"><button class="btn" type="button" data-act="new-group">Make a group</button></div>`;
        if (!gs.length) h += `<p class="hint">A group gets its own settings in the cue editor, so these can do something different from the rest.</p>`;
      } else h += `<p class="hint">Select one kind of fixture to put them in a group.</p>`;
      const one = new Set(list.map(f => f.truss)).size === 1;
      h += `<div class="row">${one ? `<button class="btn" type="button" data-act="truss-of">Select its truss</button>` : ''}<button class="btn" type="button" data-act="space">Space evenly</button><button class="btn btn--danger" type="button" data-act="del-fx">Delete</button></div>`;
    } else {
      h += `<div class="sec__head"><h3>Selection</h3></div><p class="say" style="margin-top:0">Click a truss to hang lights on it, drag it to move it, or drag its handles to reshape it. Drag across empty space to select fixtures, then slide them along their truss.</p>`;
    }
    h += `</section>`;
    // groups
    h += `<section class="sec"><div class="sec__head"><h3>Groups</h3><span class="meta">${p.groups.length || ''}</span></div>`;
    if (!p.groups.length) h += `<p class="empty">No groups yet. Select some fixtures to make one.</p>`;
    p.groups.forEach((g, i) => {
      const k = p.fixtures.filter(f => f.group === g.id).length, t = TYPES.find(x => x.group === g.type);
      h += `<div class="grouprow"><i style="background:${GROUP_HUES[i % GROUP_HUES.length]}"></i><input class="text" type="text" maxlength="24" value="${esc(g.name)}" data-rename="${g.id}" aria-label="Group name"><small>${k} ${k === 1 ? t.one : t.plural}</small><button class="btn btn--danger" type="button" data-ungroup="${g.id}" aria-label="Delete group ${esc(g.name)}">✕</button></div>`;
    });
    h += `</section>`;
    // budget
    h += `<section class="sec"><div class="sec__head"><h3>Budget</h3><span class="meta">What the renderer can run</span></div><div class="budget">`;
    for (const t of TYPES) h += `<div><span>${t.plural[0].toUpperCase() + t.plural.slice(1)}</span><b>${n[t.id]} of ${BUDGET[t.id]}</b><i><em style="width:${Math.min(100, n[t.id] / BUDGET[t.id] * 100)}%"></em></i></div>`;
    h += `</div></section>`;
    panel.innerHTML = h;
    wirePanel(p);
  }
  function range(key, label, min, max, step, value, show, hint, opt = false) {
    return `<div class="field"><div class="label">${label} <output data-out="${key}">${show(value)}</output></div><input type="range" data-range="${key}" data-opt="${opt ? 1 : ''}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
  }
  function wirePanel(p) {
    const q = s => panel.querySelectorAll(s);
    for (const b of q('[data-template]')) b.addEventListener('click', () => {
      const t = TEMPLATES.find(x => x.id === b.dataset.template);
      sel.truss = null; sel.fx.clear();
      ctx.apply(t.make ? t.make(ctx.def()) : null, `Rig: ${t.name}`); ctx.groupsChanged(); render();
      ctx.toast(`Rig: ${t.name}`, 'Undo', ctx.undo);
    });
    for (const b of q('[data-add]')) b.addEventListener('click', () => addTruss(b.dataset.add));
    const tr = sel.truss && byId(p, sel.truss), M = m();
    const ht = panel.querySelector('#hang-type');
    if (ht) {
      ht.innerHTML = '';
      for (const t of TYPES) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = t.name; b.setAttribute('aria-pressed', t.id === hangOpts.type);
        b.addEventListener('click', () => { hangOpts.type = t.id; renderPanel(); });
        ht.append(b);
      }
    }
    for (const inp of q('[data-range]')) {
      const key = inp.dataset.range, out = panel.querySelector(`[data-out="${key}"]`);
      const show = v => key === 'height' ? `${(v * M.rh + (tr?.kind === 'tower' ? M.H : 0)).toFixed(1)} m` : key === 'rake' ? `${v > 0 ? '+' : ''}${(v * M.rh).toFixed(1)} m` : key === 'radius' ? `${(v * M.hw).toFixed(1)} m` : key === 'sweep' ? `${v}°` : key === 'span' ? `${Math.round(v * 100)}%` : String(v);
      const set = (v, live) => {
        if (key === 'count') { hangOpts.n = v; const b = panel.querySelector('[data-act="hang"]'); if (b && hangOpts.type !== 'pixel') b.textContent = `Hang ${v} ${v === 1 ? TYPE[hangOpts.type].one : TYPE[hangOpts.type].plural}`; return; }
        if (key === 'span') { hangOpts.span = v; return; }
        setTruss(t => {
          if (key === 'height') {
            if (t.kind === 'tower') t.b[1] = v;
            else if (t.shape === 'arc') t.y = v;
            else { const r = (t.b[1] - t.a[1]) / 2; t.a[1] = v - r; t.b[1] = v + r; }
          } else if (key === 'rake') { const mid = (t.a[1] + t.b[1]) / 2; t.a[1] = mid - v / 2; t.b[1] = mid + v / 2; }
          else if (key === 'radius') t.r = v;
          else if (key === 'sweep') { const mid = (t.a0 + t.a1) / 2, half = v * Math.PI / 360; t.a0 = mid - half; t.a1 = mid + half; }
        }, { height: 'Truss height', rake: 'Rake', radius: 'Truss radius', sweep: 'Sweep' }[key], live);
      };
      inp.addEventListener('input', () => { const v = Number(inp.value); out.textContent = show(v); set(v, true); });
      inp.addEventListener('change', () => { if (!inp.dataset.opt) set(Number(inp.value), false); });
    }
    const act = (a, fn) => panel.querySelector(`[data-act="${a}"]`)?.addEventListener('click', fn);
    act('hang', hang);
    act('clear', () => edit('Clear truss', p2 => { p2.fixtures = p2.fixtures.filter(f => f.truss !== sel.truss); }));
    act('dup', duplicate);
    act('del-truss', removeTruss);
    act('del-fx', removeFixtures);
    act('space', spaceEvenly);
    act('truss-of', () => { const f = p.fixtures.find(x => sel.fx.has(x.id)); sel.fx.clear(); sel.truss = f.truss; render(); });
    act('new-group', () => newGroup(panel.querySelector('#group-name').value.trim()));
    panel.querySelector('#group-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') newGroup(e.target.value.trim()); });
    const fg = panel.querySelector('#fx-group');
    if (fg) {
      const list = p.fixtures.filter(f => sel.fx.has(f.id)), gtype = TYPE[list[0].type].group;
      const cur = new Set(list.map(f => f.group || ''));
      const opts = [['', 'None'], ...p.groups.filter(g => g.type === gtype).map(g => [g.id, g.name])];
      fg.innerHTML = '';
      for (const [id, name] of opts) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
        b.setAttribute('aria-pressed', cur.size === 1 && cur.has(id));
        b.addEventListener('click', () => { setGroup(id); ctx.groupsChanged(); });
        fg.append(b);
      }
    }
    for (const inp of q('[data-rename]')) inp.addEventListener('change', () => {
      const name = inp.value.trim(); if (!name) return;
      edit('Rename group', p2 => { const g = p2.groups.find(x => x.id === inp.dataset.rename); if (g) g.name = name; });
      ctx.groupsChanged();
    });
    for (const b of q('[data-ungroup]')) b.addEventListener('click', () => {
      const gid = b.dataset.ungroup;
      edit('Delete group', p2 => { p2.groups = p2.groups.filter(g => g.id !== gid); for (const f of p2.fixtures) if (f.group === gid) f.group = ''; });
      ctx.groupDeleted(gid);
    });
  }

  function render() {
    // drop a selection the plot no longer has (after undo, say)
    const p = plot();
    if (sel.truss && !byId(p, sel.truss)) sel.truss = null;
    for (const id of [...sel.fx]) if (!p.fixtures.some(f => f.id === id)) sel.fx.delete(id);
    draw(); renderPanel();
  }
  return {
    render,
    reframe() { view = null; render(); },
    get mirror() { return mirror; },
    setMirror(v) { mirror = v; renderPanel(); },
    clear() { sel.truss = null; sel.fx.clear(); render(); },
    key(e) {
      if (e.key === 'Escape' && (sel.truss || sel.fx.size)) { sel.truss = null; sel.fx.clear(); render(); return true; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.fx.size) { removeFixtures(); return true; } if (sel.truss) { removeTruss(); return true; } }
      return false;
    },
    sel,
  };
}
