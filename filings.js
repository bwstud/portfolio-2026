/* Iron filings: pretend the speckle in a button's paint is iron, and the pointer is a magnet held just above it.
   Lying flat, a filing is a speck. As the magnet nears, it stands up along the field: straight up right under the
   magnet (seen end-on, a point), leaning away further out (seen as a spike), and flat again beyond the magnet's
   reach. Filings are also drawn in a little toward the magnet, and settle back slowly when it leaves.
   A press reverses the magnet for as long as the button is held: a ring of repulsion travels out from the press,
   shoving filings outward and throwing them over, and behind it they stay pushed away, lying pointed outward.
   On release the field comes back over most of a second.

   This is how a Matte key answers the pointer (tinkering/design-system/): with this file loaded, Matte.init() puts it on
   every plain .m-key. The iron takes two Matte tokens where they are set: --m-iron, a colour that replaces the
   tuned one (the light finish sets a dark iron), and --m-iron-lift, what tips and resting specks lean toward
   (255, paler, on a dark body; 0, darker, on a grey one).

   Tuned in the Button Lab (tinkering/button-lab/, Experiments), which saves versions to filings-versions.js.
   On a page that loads this file, every nav button gets the version named "active" there, unless that is "off".

   Filings.attach(element, config, options) puts the effect on one element and returns { wake(), hold(), press(), release(), remove() }.
   Options, for a control whose painted face is only part of it (a knob's cap, a switch's thumb):
     face(element)  the face, in the element's own px: { x, y, w, h, round }. It is asked every frame, so it may move.
                    A face of no size draws nothing (a segment that isn't the chosen one).
     pulse          false for a control that is dragged, not pressed: a press sends no pulse.
     cut(element)   a strip of the face, in the face's px ({ x, y, w, h }), kept clear of filings so the paint under it
                    shows on top: a fader's centre line.
     snap           true when the face jumps rather than slides (a fader's thumb under a drag): the filings keep up with it.
     host           an element to hold the canvas, for one that can't (an <input>): the element's parent, usually. The
                    canvas is laid over the element from there.
     z              the canvas's z-index (default -1: over the paint, under a label). after: a child to put the canvas after.
   The config object is read live, so a lab can change it and call Filings.wake(). */
(() => {
  const DEFAULTS = {
    count: 2600,       // filings on a 260 by 76 key; other sizes get the same density
    reach: 96,         // how far the magnet is felt, px
    length: 17,        // spike length, px
    pull: 9,           // how far filings are drawn toward the magnet, px
    size: 1,           // thickness of spikes, tips and specks
    glow: 0.4,         // how bright the tips are
    rest: 0.3,         // how visible a filing is while it lies flat, away from the magnet: 0 hides them, 1 is full speckle
    push: 16,          // how far the pulse shoves a filing, px
    speed: 520,        // how fast the pulse ring travels, px/s
    color: '#8b8e95',  // the metal: spikes run from a darker shade of it to this, with paler tips
  };
  const OFF = 'off';
  const REF = 260 * 76;                                            // the key the count is tuned on
  const MARGIN = 44;                                               // room round the element for spikes that lean over its edge
  const WAVE = 22, FAR = 340;                                      // the pulse ring's thickness, and how far it gets before it has faded out
  const all = new Set();

  function activeConfig() {
    const store = window.FILINGS_VERSIONS;
    const version = store && store.versions && store.versions.find((v) => v.id === store.active);
    return { ...DEFAULTS, ...(version ? version.config : {}) };
  }
  const isOn = () => { const store = window.FILINGS_VERSIONS; return !!store && store.active !== OFF && store.versions.some((v) => v.id === store.active); };

  const made = new WeakMap();
  function attach(el, cfg, opts = {}) {
    if (made.has(el)) return made.get(el);                         // one set of filings per element
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = `position:absolute;left:50%;top:50%;pointer-events:none;z-index:${opts.z ?? -1}`;   // over the paint, under the label
    const box = opts.host || el;                                   // what holds the canvas
    const was = { position: box.style.position, isolation: box.style.isolation };
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    box.style.isolation = 'isolate';
    if (opts.after) opts.after.after(cv); else if (opts.host) box.append(cv); else el.prepend(cv);   // last in a host, so its :first-child and its siblings stay as they were
    let at = '';                                                   // in a host: where the element sits in it

    let W = 0, H = 0, dpr = 1, filings = [], seeded = -1, shaded = '';   // W, H: the painted face
    let EW = 0, EH = 0, fx = 0, fy = 0, round = false;                   // the element's size; where the face sits in it; whether it is a disc
    let tones = [], tipRgb = '', speckRgb = '';
    let pulses = [], clock = 0, seen = 0, raf = 0, held = false;
    const magnet = { x: 0, y: 0, on: false, power: 0 };            // power eases in and out, so the field arrives and leaves softly

    function shades() {
      shaded = cfg.color;
      const style = getComputedStyle(el), iron = style.getPropertyValue('--m-iron').trim(), lift = Number(style.getPropertyValue('--m-iron-lift') || 255);
      const hex = /^#[0-9a-f]{6}$/i.test(iron) ? iron : cfg.color;   // the finish's own iron, where it names one
      const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
      const mix = (to, k) => c.map((v) => Math.round(v + (to - v) * k));
      tones = [mix(0, 0.45), mix(0, 0.22), c].map((v) => `rgb(${v.join(' ')})`);
      tipRgb = mix(lift, 0.4).join(' '); speckRgb = mix(lift, 0.75).join(' ');
    }
    function size() {
      EW = el.offsetWidth; EH = el.offsetHeight; dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round((EW + MARGIN * 2) * dpr); cv.height = Math.round((EH + MARGIN * 2) * dpr);
      cv.style.width = `${EW + MARGIN * 2}px`; cv.style.height = `${EH + MARGIN * 2}px`;
      cv.style.marginLeft = `${-(EW + MARGIN * 2) / 2}px`; cv.style.marginTop = `${-(EH + MARGIN * 2) / 2}px`;
      at = ''; lay();
      seeded = -1;                                                   // lay the filings out again for the new size
      place(true);
    }
    function lay() {                                               // in a host, the canvas centres on the element, wherever the layout has put it
      if (!opts.host) return;
      const now = `${el.offsetLeft + EW / 2}px ${el.offsetTop + EH / 2}px`;
      if (now !== at) { at = now; [cv.style.left, cv.style.top] = now.split(' '); }
    }
    function place(snap) {                                           // find the face; true while it is still sliding to where it should be
      const f = opts.face ? opts.face(el) : { x: 0, y: 0, w: EW, h: EH };
      if (f.w !== W || f.h !== H) { W = f.w; H = f.h; seeded = -1; }
      round = !!f.round;
      if (snap) { fx = f.x; fy = f.y; return false; }
      fx += (f.x - fx) * 0.3; fy += (f.y - fy) * 0.3;
      if (Math.abs(f.x - fx) + Math.abs(f.y - fy) < 0.1) { fx = f.x; fy = f.y; return false; }
      return true;
    }
    function seed() {
      seeded = cfg.count;
      const n = Math.min(12000, Math.round(cfg.count * W * H / REF * (round ? 0.785 : 1)));
      const spot = () => {                                                  // somewhere on the face: a rectangle, or a disc
        for (;;) {
          const x = 2 + Math.random() * (W - 4), y = 2 + Math.random() * (H - 4);
          if (!round || ((x / W - 0.5) ** 2 + (y / H - 0.5) ** 2) < 0.23) return [x, y];
        }
      };
      filings = Array.from({ length: n }, () => spot()).map(([x, y]) => ({
        x, y,                                                               // where it lies on the face
        len: 0.45 + Math.random() * 0.75, lean: (Math.random() - 0.5) * 0.5,  // its own length, and how far off the field line it sits
        quick: held ? 1 : 0.1 + Math.random() * 0.2, tone: Math.random(), speck: 0.08 + Math.random() * 0.22,
        up: 0, ang: Math.random() * 6.283, ox: 0, oy: 0,                    // how far it has stood up, its heading, how far it has been drawn in
        kx: 0, ky: 0,                                                       // how far a pulse has knocked it, easing back
      }));
    }

    const wake = () => { if (!raf && !held) raf = requestAnimationFrame(frame); };
    function frame(now) {
      raf = 0;
      tick(seen && now - seen < 200 ? now - seen : 16); seen = now;
    }
    function tick(dt) {
      const sliding = held || opts.snap ? place(true) : place(false);
      lay();
      if (!W || !H) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); return; }   // no face just now: nothing shows
      if (seeded !== cfg.count) seed();
      if (shaded !== cfg.color) shades();
      clock += dt;
      const k = dt / 16.7;
      magnet.power += ((magnet.on ? 1 : 0) - magnet.power) * (magnet.on ? 0.22 : 0.07);
      const R = cfg.reach, L = cfg.length;
      for (const p of pulses) {
        if (p.holding) { p.x = magnet.x; p.y = magnet.y; }                   // while the button is down the reversed magnet follows the pointer
        p.rad = (clock - p.born) / 1000 * cfg.speed; p.force = Math.max(0, 1 - p.rad / FAR);
        p.dead = p.holding ? 0 : Math.min(1, (clock - p.freed) / 900);       // the field stays dead until the release, then comes back
      }
      pulses = pulses.filter((p) => p.holding || p.force > 0 || p.dead < 1);
      let busy = sliding || magnet.on || magnet.power > 0.004 || pulses.length > 0;
      ctx.setTransform(dpr, 0, 0, dpr, (MARGIN + fx) * dpr, (MARGIN + fy) * dpr);
      ctx.clearRect(-MARGIN - fx, -MARGIN - fy, EW + MARGIN * 2, EH + MARGIN * 2);
      ctx.lineCap = 'round';
      // three passes, so shadows lie under every spike and the tips sit on top
      const shadows = new Path2D(), spikes = [new Path2D(), new Path2D(), new Path2D()], tips = [];
      for (const f of filings) {
        const dx = f.x - magnet.x, dy = f.y - magnet.y, d = Math.hypot(dx, dy) || 0.001;
        let s = Math.pow(Math.max(0, 1 - d / R), 1.4) * magnet.power;        // field strength here
        let hit = 0, hx = 0, hy = 0;                                         // the strongest pulse ring passing over it, and which way it shoves
        for (const p of pulses) {
          const px = f.x - p.x, py = f.y - p.y, pd = Math.hypot(px, py) || 0.001, off = (pd - p.rad) / WAVE;
          if (pd < p.rad) s *= p.dead * p.dead;                              // the ring has passed: the field is dead here, and comes back slowly
          if (p.holding && pd < p.rad) {                                     // and while the press is held it stays reversed: filings are kept shoved away, thrown outward
            const g = Math.max(0, 1 - pd / (R * 1.6));
            f.kx += px / pd * cfg.push * g * 0.08 * k; f.ky += py / pd * cfg.push * g * 0.08 * k;
            if (g > hit) { hit = g; hx = px / pd; hy = py / pd; }
          }
          const w = Math.exp(-off * off) * p.force;
          if (w > 0.01) {
            f.kx += px / pd * cfg.push * w * 0.3 * k; f.ky += py / pd * cfg.push * w * 0.3 * k;
            if (w > hit) { hit = w; hx = px / pd; hy = py / pd; }
          }
        }
        const kick = Math.hypot(f.kx, f.ky);
        if (kick > cfg.push) { f.kx *= cfg.push / kick; f.ky *= cfg.push / kick; }
        f.kx *= Math.pow(0.95, k); f.ky *= Math.pow(0.95, k);
        if (kick > 0.05) busy = true;
        const thrown = hit > s;                                              // the ring has hold of it, not the magnet
        const aim = Math.max(s, hit);
        f.up += (aim - f.up) * (aim > f.up ? (thrown ? 0.6 : f.quick) : f.quick * 0.3);   // stands up quickly, lies down slowly
        if (f.up > 0.004) {
          busy = true;
          let turn = (thrown ? Math.atan2(hy, hx) : Math.atan2(dy, dx)) + f.lean - f.ang;   // swing round to point away from the magnet, or from the press
          turn = Math.atan2(Math.sin(turn), Math.cos(turn)); f.ang += turn * (thrown ? 0.6 : 0.25);
        }
        const tilt = thrown ? 1 : Math.min(1, d / (R * 0.42));               // upright under the magnet, leaning further out
        const want = cfg.pull * f.up * tilt;
        f.ox += (-dx / d * want - f.ox) * 0.18; f.oy += (-dy / d * want - f.oy) * 0.18;
        const x = f.x + f.ox + f.kx, y = f.y + f.oy + f.ky;
        if (f.up < 0.03) {                                                   // lying flat: a speck in the paint, quiet until the field stirs it
          if (cfg.rest <= 0 && f.up <= 0) continue;
          const z = Math.max(0.6, cfg.size); ctx.fillStyle = `rgb(${speckRgb} / ${f.speck * Math.min(1, cfg.rest + f.up * 30)})`; ctx.fillRect(x - z / 2, y - z / 2, z, z);
          continue;
        }
        const reach = L * f.len * f.up * (0.18 + 0.82 * tilt), cx = Math.cos(f.ang), cy = Math.sin(f.ang);
        const tx = x + cx * reach, ty = y + cy * reach - f.up * 2.5 * (1 - tilt);   // an upright one's tip sits a little above its foot
        shadows.moveTo(x + 1, y + 1.5); shadows.lineTo(tx + 1 + f.up * 2, ty + 1.5 + f.up * 3);
        const p = spikes[f.tone < 0.35 ? 0 : f.tone < 0.75 ? 1 : 2];
        p.moveTo(x, y); p.lineTo(tx, ty);
        tips.push(tx, ty, f.up, tilt);
      }
      ctx.strokeStyle = 'rgb(0 0 0 / 0.45)'; ctx.lineWidth = 1.4 * cfg.size; ctx.stroke(shadows);
      tones.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = (0.9 + i * 0.15) * cfg.size; ctx.stroke(spikes[i]); });
      for (let i = 0; i < tips.length; i += 4) {                             // the tip catches the light, most of all when it points straight at you
        const up = tips[i + 2], tilt = tips[i + 3], r = (0.4 + up * (0.85 - tilt * 0.55)) * cfg.size;
        ctx.fillStyle = `rgb(${tipRgb} / ${(0.2 + 0.7 * up) * cfg.glow})`;
        ctx.beginPath(); ctx.arc(tips[i], tips[i + 1], r, 0, 6.283); ctx.fill();
      }
      if (opts.cut) { const c = opts.cut(el); ctx.clearRect(c.x, c.y, c.w, c.h); }   // a mark in the paint that stays on top
      if (busy && !raf && !held) raf = requestAnimationFrame(frame);
    }

    const watch = new ResizeObserver(() => { size(); if (held) tick(0); else wake(); });
    watch.observe(el); if (opts.host) watch.observe(box);
    el.addEventListener('click', wake);                              // a switch's thumb may have moved
    size();

    const inst = {
      el, wake,
      reshade() { shaded = ''; if (held) tick(0); else wake(); },      // the finish changed: read the iron's colour again
      move(cx, cy) {                                                 // the pointer, in viewport px: only the button it is over feels the magnet
        if (held) return;
        const r = el.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
        const near = x >= 0 && x <= r.width && y >= 0 && y <= r.height;
        if (!near && !magnet.on) return;
        magnet.x = x - fx; magnet.y = y - fy; magnet.on = near; wake();
      },
      leave() { if (!held && magnet.on) { magnet.on = false; wake(); } },
      press(cx, cy) {                                                // a press on this button
        if (held || !magnet.on || opts.pulse === false) return;
        const r = el.getBoundingClientRect();
        pulses.push({ x: cx - r.left - fx, y: cy - r.top - fy, born: clock, freed: clock, holding: true, rad: 0, force: 1, dead: 0 }); wake();
      },
      release() {                                                    // the button came up: the field starts to return
        for (const p of pulses) if (p.holding) { p.holding = false; p.freed = clock; }
        if (!held) wake();
      },
      hold(x, y, pulseAfter, down) {                                 // a frozen frame, for screenshots: the magnet at a spot, and a press there this many ms ago (down: still held)
        cancelAnimationFrame(raf); raf = 0; held = true; seeded = -1;
        magnet.x = x; magnet.y = y; magnet.on = true; magnet.power = 1;
        for (let i = 0; i < 20; i++) tick(16);
        if (pulseAfter != null) {
          pulses.push({ x, y, born: clock, freed: clock, holding: !!down, rad: 0, force: 1, dead: 0 });
          for (let t = 0; t < pulseAfter; t += 16) tick(16);
        }
      },
      remove() {
        cancelAnimationFrame(raf); watch.disconnect(); cv.remove(); all.delete(inst); made.delete(el);
        box.style.position = was.position; box.style.isolation = was.isolation;
      },
    };
    all.add(inst); made.set(el, inst);
    wake();
    return inst;
  }

  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') for (const i of all) i.move(e.clientX, e.clientY); }, { passive: true });
  addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') for (const i of all) i.press(e.clientX, e.clientY); }, { passive: true });
  for (const up of ['pointerup', 'pointercancel']) addEventListener(up, () => { for (const i of all) i.release(); }, { passive: true });
  addEventListener('dragend', () => { for (const i of all) i.release(); });   // a dragged link sends no pointerup
  // A finger has no hover, so it is the magnet while it is on the glass: a tap brings the filings up under it, and a
  // finger dragged across the page raises them on each button it passes over. Touch events, not pointer events: those
  // stop the moment the page starts to scroll, and these keep coming. The field lingers a moment after the finger
  // lifts, so a quick tap still shows. No pulse: on a phone the press and the lift are the same gesture.
  let lifted = 0;
  const finger = (e) => { const t = e.touches[0]; if (!t) return; clearTimeout(lifted); for (const i of all) i.move(t.clientX, t.clientY); };
  const unfinger = (e) => { if (e.touches.length) return; clearTimeout(lifted); lifted = setTimeout(() => { for (const i of all) i.leave(); }, 420); };
  addEventListener('touchstart', finger, { passive: true }); addEventListener('touchmove', finger, { passive: true });
  addEventListener('touchend', unfinger, { passive: true }); addEventListener('touchcancel', unfinger, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { for (const i of all) i.leave(); });
  addEventListener('blur', () => { for (const i of all) { i.release(); i.leave(); } });
  document.addEventListener('themechange', () => { for (const i of all) i.reshade(); });

  // the site's nav buttons
  let onSite = [];
  function site(config) {
    for (const i of onSite) i.remove();
    onSite = config ? [...document.querySelectorAll('.nav .chip')].map((el) => attach(el, config)) : [];
    return onSite;
  }

  const Filings = window.Filings = { DEFAULTS, OFF, activeConfig, isOn, attach, site, manual: false, wake() { for (const i of all) i.wake(); } };

  // On a page: the active version on every nav button. A lab sets Filings.manual and does this itself.
  const start = () => { if (!Filings.manual && isOn() && !matchMedia('(prefers-reduced-motion: reduce)').matches) site(activeConfig()); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start); else start();
})();
