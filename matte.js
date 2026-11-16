/* Behaviour for the Matte system (matte.css). Call Matte.init(root) once the markup is in place.
   - .m-knob[role=slider]  data-min, data-max, data-step, data-value, data-ticks. Fires "input"; read el.value.
   - .m-switch[role=switch], .m-rocker[role=switch] flip aria-checked and fire "change".
   - .m-key[data-latch], .m-push flip aria-pressed and fire "change".
   - .m-meter               data-segments, data-hot; set its level with Matte.meter(el, 0..1).
   - .m-bank, .m-seg        role=radiogroup holding role=radio buttons; one choice at a time, arrow keys move it.
   - [role=tablist]         tabs show the panel named by aria-controls.
   - .m-knob[data-options]  a rotary select: "A|B|C"; read el.option; data-for names an element to write it to.
   - .m-pop[popover]        positioned under its popovertarget. dialog.m-dialog opens from [data-dialog=id]; [data-close] closes.
   - [data-tip]             a tooltip. .m-number [data-step] steps its input. Matte.toast(text) shows a toast.
   - .m-key, .m-knob, .m-switch, .m-push, .m-rocker, .m-fader, .m-seg   the paint holds iron filings that stand up to the
                            pointer and are thrown back by a press, when filings.js (site root) is loaded before this: on
                            a plain key's face, a pad, a knob's cap, a slide switch's thumb, a push switch's cap, a rocker's
                            paddle, a fader's thumb and the chosen segment of a segmented control. A lit pad has none.
                            Coloured, quiet and disabled keys and metal knobs are left
                            alone, and so is anything with data-plain. Not run for reduced motion.
     Meter variations: --v, --dots, --stereo (Matte.meter(el, left, right), with peak hold), --needle (add --lamp to light it). */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const ARC = 300, C = 50, R_RING = 38, R_TICK = 46.5;          // in the ring's 100-unit box; the gap in the arc faces down
  const polar = (u, r) => { const a = (-ARC / 2 + u * ARC - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const arc = (u0, u1) => {
    const [x0, y0] = polar(u0, R_RING), [x1, y1] = polar(u1, R_RING);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R_RING} ${R_RING} 0 ${(u1 - u0) * ARC > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  function knob(el) {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    const options = el.dataset.options ? el.dataset.options.split('|') : null;      // a rotary select: one detent per name
    const min = options ? 0 : Number(el.dataset.min ?? 0), max = options ? options.length - 1 : Number(el.dataset.max ?? 100), step = options ? 1 : Number(el.dataset.step ?? 1);
    const n = options ? options.length : Number(el.dataset.ticks ?? 0);
    el.innerHTML = '<span class="m-knob__side"></span><span class="m-knob__cap"></span><span class="m-knob__grip"><i class="m-knob__dot"></i></span>'
      + '<svg class="m-knob__ring" viewBox="0 0 100 100" aria-hidden="true"><path class="m-knob__track"/><path class="m-knob__value"/></svg>';
    const svg = el.querySelector('svg'), grip = el.querySelector('.m-knob__grip'), value = el.querySelector('.m-knob__value');
    el.querySelector('.m-knob__track').setAttribute('d', arc(0, 1));
    const ticks = Array.from({ length: n }, (_, i) => {
      const [x, y] = polar(n > 1 ? i / (n - 1) : 0.5, R_TICK);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'm-knob__tick'); c.setAttribute('cx', x.toFixed(2)); c.setAttribute('cy', y.toFixed(2)); c.setAttribute('r', '0.95');
      svg.appendChild(c);
      return c;
    });
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    el.setAttribute('aria-valuemin', min); el.setAttribute('aria-valuemax', max);

    let u = 0;
    function set(v, fire) {
      v = Math.min(max, Math.max(min, Math.round(v / step) * step));
      u = (v - min) / (max - min || 1);
      el.value = v;
      el.setAttribute('aria-valuenow', v);
      if (el.dataset.unit) el.setAttribute('aria-valuetext', `${v} ${el.dataset.unit}`);
      if (options) {
        el.option = options[v];
        el.setAttribute('aria-valuetext', options[v]);
        const out = el.dataset.for && document.getElementById(el.dataset.for);
        if (out) out.textContent = options[v];
      }
      grip.style.transform = `rotate(${-ARC / 2 + u * ARC}deg)`;
      value.setAttribute('d', arc(0, Math.max(0.0005, u)));
      ticks.forEach((t, i) => t.classList.toggle('is-near', n > 1 && Math.abs(i / (n - 1) - u) < 0.012));
      if (fire) el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.setValue = (v) => set(v, false);
    set(Number(el.dataset.value ?? min), false);

    // turn it by circling it; close to the centre, where an angle means little, drag up and down instead
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, u, a: null, y: e.clientY };
      el.focus({ preventScroll: true });
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
      if (Math.hypot(dx, dy) > 12) {
        const a = Math.atan2(dy, dx) * 180 / Math.PI;
        if (drag.a != null) drag.u += (((a - drag.a + 540) % 360) - 180) / ARC;
        drag.a = a;
      } else {
        drag.u += (drag.y - e.clientY) / 160;
        drag.a = null;
      }
      drag.y = e.clientY;
      drag.u = Math.min(1, Math.max(0, drag.u));
      set(min + drag.u * (max - min), true);
    });
    const end = () => { drag = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); set(el.value - e.deltaY * (max - min) / 1200, true); }, { passive: false });
    el.addEventListener('keydown', (e) => {
      const big = (max - min) / 10;
      const d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big }[e.key];
      if (d != null) set(el.value + d, true);
      else if (e.key === 'Home') set(min, true);
      else if (e.key === 'End') set(max, true);
      else return;
      e.preventDefault();
    });
  }

  const HOLD = 900;                                              // ms a stereo meter holds its peak
  function buildMeter(el) {
    const n = Number(el.dataset.segments ?? 12), hot = Number(el.dataset.hot ?? 2);
    const segs = Array.from({ length: n }, (_, i) => `<i${i >= n - hot ? ' class="is-hot"' : ''}></i>`).join('');
    if (el.classList.contains('m-meter--needle')) {
      // the pivot sits below the window; the scale sweeps 40° either side of straight up
      const P = [60, 86], at = (deg, r) => { const a = deg * Math.PI / 180; return [P[0] + r * Math.sin(a), P[1] - r * Math.cos(a)]; };
      const sweep = (d0, d1, r) => { const [x0, y0] = at(d0, r), [x1, y1] = at(d1, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
      let ticks = '';
      for (let i = 0; i <= 10; i++) {
        const d = -40 + i * 8, [x0, y0] = at(d, 62), [x1, y1] = at(d, i % 5 ? 65 : 68);
        ticks += `<path class="m-meter__scale${d > 20 ? ' m-meter__scale--hot' : ''}" d="M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}" style="stroke-width:0.8"/>`;
      }
      el.innerHTML = `<svg viewBox="0 0 120 64" aria-hidden="true"><path class="m-meter__scale" d="${sweep(-40, 20, 62)}"/><path class="m-meter__scale m-meter__scale--hot" d="${sweep(20, 40, 62)}"/>${ticks}`
        + `<text x="60" y="50">${el.dataset.label ?? 'VU'}</text><line class="m-meter__needle" x1="60" y1="86" x2="60" y2="20"/></svg>`;
    } else if (el.classList.contains('m-meter--stereo')) {
      el.innerHTML = ['L', 'R'].map((c) => `<span class="m-meter__row"><b>${c}</b>${segs}</span>`).join('');
    } else el.innerHTML = segs;
  }
  function fill(row, level, hold) {
    const items = row.querySelectorAll(':scope > i'), lit = Math.round(Math.min(1, Math.max(0, level)) * items.length);
    if (hold) {
      const now = performance.now();
      if (lit >= (row._peak ?? 0) || now - (row._at ?? 0) > HOLD) { row._peak = lit; row._at = now; }
    }
    items.forEach((it, i) => { it.classList.toggle('is-on', i < lit); if (hold) it.classList.toggle('is-peak', i === row._peak - 1 && i >= lit); });
  }
  function meter(el, level, right) {
    if (!el.dataset.ready) { el.dataset.ready = '1'; buildMeter(el); }
    if (level == null) return;
    if (el.classList.contains('m-meter--needle')) el.querySelector('.m-meter__needle').style.transform = `rotate(${-40 + Math.min(1, Math.max(0, level)) * 80}deg)`;
    else if (el.classList.contains('m-meter--stereo')) el.querySelectorAll('.m-meter__row').forEach((row, i) => fill(row, i ? right ?? level : level, true));
    else fill(el, level, false);
  }

  const ironed = new WeakSet();                                       // controls whose filings have their listeners already
  const IRON = '.m-key:not(.m-key--pad, .m-key--accent, .m-key--primary, .m-key--danger, .m-key--quiet, [disabled], [data-plain])';
  function init(root = document) {
    wire();
    if (window.Filings && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const iron = Filings.activeConfig();                           // the version tuned in the Button Lab
      root.querySelectorAll(IRON).forEach((el) => Filings.attach(el, iron));
    }
    root.querySelectorAll('.m-knob').forEach(knob);
    if (window.Filings && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const iron = Filings.activeConfig(), ok = ':not([data-plain], :disabled, [aria-disabled="true"])';
      root.querySelectorAll('.m-knob:not(.m-knob--metal)' + ok).forEach((el) => {      // the cap, under the grip's mark
        const cap = el.querySelector('.m-knob__cap');
        Filings.attach(el, iron, { after: cap, z: 'auto', pulse: false, face: () => ({ x: cap.offsetLeft, y: cap.offsetTop, w: cap.offsetWidth, h: cap.offsetHeight, round: true }) });
      });
      root.querySelectorAll('.m-switch' + ok).forEach((el) => Filings.attach(el, iron, { z: 1,       // the thumb, wherever it has slid to
        face: () => ({ x: el.getAttribute('aria-checked') === 'true' ? el.offsetWidth - 25 : 3, y: 3, w: 22, h: 22, round: true }) }));
      root.querySelectorAll('.m-push' + ok).forEach((el) => {                           // the cap, raised or down
        const rise = parseFloat(getComputedStyle(el).getPropertyValue('--rise')) || 0;
        Filings.attach(el, iron, { z: 'auto', face: () => {
          const down = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true';
          return { x: 4, y: 4 - (down ? 0 : rise), w: el.offsetWidth - 8, h: el.offsetHeight - 8, round: true };
        } });
      });
      const watchAttr = (el, name, fn) => new MutationObserver(fn).observe(el, { attributes: true, attributeFilter: [name] });
      root.querySelectorAll('.m-rocker' + ok).forEach((el) => Filings.attach(el, iron, { z: 1,      // the paddle, tipped either way (over its two faces)
        face: () => ({ x: 3, y: 3, w: el.offsetWidth - 6, h: el.offsetHeight - 6 }) }));
      root.querySelectorAll('.m-key--pad' + ok).forEach((el) => {                      // the whole pad while it is dark; a lit pad holds none
        if (ironed.has(el)) return; ironed.add(el);
        const f = Filings.attach(el, iron, { face: () => el.getAttribute('aria-pressed') === 'true' ? { x: 0, y: 0, w: 0, h: 0 } : { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight } });
        watchAttr(el, 'aria-pressed', () => f.wake());                                // the moment it lights, its filings are gone
      });
      root.querySelectorAll('.m-seg button' + ok).forEach((el) => {                   // only the chosen segment has a cap to hold iron
        if (ironed.has(el)) return; ironed.add(el);
        const f = Filings.attach(el, iron, { face: () => el.getAttribute('aria-checked') === 'true' ? { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 } });
        watchAttr(el, 'aria-checked', () => f.wake());                                // however the choice is made, by Matte or a page's own script
      });
      root.querySelectorAll('.m-fader' + ok).forEach((el) => {                        // the thumb, wherever it has been dragged or set to
        if (ironed.has(el) || !el.parentElement) return; ironed.add(el);
        const T = { w: 16, h: 26 };                                                    // the thumb's size in matte.css
        const f = Filings.attach(el, iron, { host: el.parentElement, z: 1, snap: true,   // a press throws the iron back, as on a key, and holds it off while dragging
          cut: () => ({ x: T.w * 0.43 - 0.5, y: 0, w: T.w * 0.14 + 1, h: T.h }),     // the white centre line (43% to 57% of the thumb in matte.css), with half a px either side, stays on top
          face: () => {
          const min = Number(el.min || 0), max = Number(el.max || 100), u = max > min ? (Number(el.value) - min) / (max - min) : 0;
          return { x: Math.min(1, Math.max(0, u)) * (el.offsetWidth - T.w), y: (el.offsetHeight - T.h) / 2, w: T.w, h: T.h };
        } });
        el.addEventListener('input', f.wake);
        // a page that sets the value from its own script (a typed number beside the fader) moves the thumb too
        for (const key of ['value', 'valueAsNumber']) {
          const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, key);
          Object.defineProperty(el, key, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); f.wake(); } });
        }
      });
    }
    root.querySelectorAll('.m-bank, .m-seg').forEach(radios);
    root.querySelectorAll('[role="tablist"]').forEach(tabs);
    root.querySelectorAll('.m-meter').forEach((el) => meter(el, Number(el.dataset.level ?? 0)));
    root.querySelectorAll('.m-switch, .m-rocker').forEach((el) => {
      if (el.dataset.ready) return;
      el.dataset.ready = '1';
      el.addEventListener('click', () => {
        el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true'));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    root.querySelectorAll('.m-key[data-latch], .m-push:not([role="radio"])').forEach((el) => {
      if (el.dataset.ready) return;
      el.dataset.ready = '1';
      el.addEventListener('click', () => {
        el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  // ---- groups where one choice releases the others: a bank of push switches, a segmented control ----
  function radios(group) {
    if (group.dataset.ready) return;
    group.dataset.ready = '1';
    const items = () => [...group.querySelectorAll('[role="radio"]')];
    const pick = (it, focus) => {
      items().forEach((o) => { o.setAttribute('aria-checked', String(o === it)); o.tabIndex = o === it ? 0 : -1; });
      if (focus) it.focus();
      group.dispatchEvent(new Event('change', { bubbles: true }));
    };
    items().forEach((o) => { o.tabIndex = o.getAttribute('aria-checked') === 'true' ? 0 : -1; });
    if (!group.querySelector('[role="radio"][tabindex="0"]') && items()[0]) items()[0].tabIndex = 0;
    group.addEventListener('click', (e) => { const it = e.target.closest('[role="radio"]'); if (it) pick(it, false); });
    group.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      const all = items(), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      pick(all[(i + d + all.length) % all.length], true);
    });
  }

  // ---- tabs: the chosen tab shows the panel named by its aria-controls ----
  function tabs(list) {
    if (list.dataset.ready) return;
    list.dataset.ready = '1';
    const all = () => [...list.querySelectorAll('[role="tab"]')];
    const show = (tab, focus) => {
      all().forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    show(all().find((t) => t.getAttribute('aria-selected') === 'true') ?? all()[0], false);
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) show(t, false); });
    list.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const a = all(), i = a.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      show(a[(i + d + a.length) % a.length], true);
    });
  }

  // ---- page-wide behaviours, wired once: popovers, dialogs, number steppers, tooltips ----
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    // a popover opens under the control that opened it, and stays on screen
    document.addEventListener('toggle', (e) => {
      const pop = e.target;
      if (!pop.classList?.contains('m-pop') || e.newState !== 'open') return;
      const from = document.querySelector(`[popovertarget="${pop.id}"]`);
      if (!from) return;
      const r = from.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      const top = r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - 8 - h) : r.bottom + 8;
      pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
      pop.style.top = `${top}px`;
    }, true);
    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-dialog]');
      if (opener) { document.getElementById(opener.dataset.dialog)?.showModal(); return; }
      const closer = e.target.closest('[data-close]');
      if (closer) { closer.closest('dialog, [popover]')?.[closer.closest('dialog') ? 'close' : 'hidePopover'](); return; }
      if (e.target.matches?.('dialog.m-dialog')) { e.target.close(); return; }       // a click on the scrim
      const step = e.target.closest('.m-number [data-step]');
      if (step) {
        const input = step.closest('.m-number').querySelector('input');
        if (Number(step.dataset.step) > 0) input.stepUp(); else input.stepDown();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    // tooltips: shown after the pointer rests, or at once for the keyboard; never for touch
    let tip = null, timer = 0;
    const hide = () => { clearTimeout(timer); tip?.classList.remove('is-on'); };
    const showTip = (el, wait) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!tip) { tip = document.createElement('div'); tip.className = 'm-tip'; tip.setAttribute('role', 'tooltip'); (document.querySelector('.matte') ?? document.body).appendChild(tip); }
        tip.textContent = el.dataset.tip;
        const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
        tip.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
        tip.classList.add('is-on');
      }, wait);
    };
    document.addEventListener('pointerover', (e) => { const el = e.target.closest?.('[data-tip]'); if (el && e.pointerType !== 'touch') showTip(el, 400); });
    document.addEventListener('pointerout', (e) => { if (e.target.closest?.('[data-tip]')) hide(); });
    document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el?.matches(':focus-visible')) showTip(el, 0); });
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }

  // ---- toast: a line that holds for five seconds, announced politely to screen readers ----
  function toast(text, hold = 5000) {
    let stack = document.querySelector('.m-toasts');
    if (!stack) { stack = document.createElement('div'); stack.className = 'm-toasts'; stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite'); (document.querySelector('.matte') ?? document.body).appendChild(stack); }
    const el = document.createElement('div');
    el.className = 'm-toast';
    el.innerHTML = '<span class="m-led is-on"></span>';
    el.append(text);
    stack.appendChild(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 200); }, hold);
    return el;
  }

  window.Matte = { init, meter, toast };
})();
