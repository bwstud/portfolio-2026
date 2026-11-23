/* Dissolve: a panel crumbles into particles that fall upward, slowly at first and then in a rush.
   Used by the cover when Recent Work is pressed, and tuned in experiments/dissolve-lab/.

   At several points along the panel's upper edge a bite opens and grows, slowly at first. Crumbs break off each
   bite's rim and are pulled upward, as if gravity had turned over; the pull strengthens as it goes. At the rush
   threshold nothing pops: the same crumbling speeds up sharply and eats through whatever is left.
   The bites are ellipses cut from the panel with a CSS mask. The particles are drawn on a canvas above the page.

   Dissolve.run(panel, config, { onDone, hold }) starts it and returns { restore() }.
   Dissolve.activeConfig() is the version the Dissolve Lab marked active (dissolve-versions.js), over DEFAULTS. */
(() => {
  const DEFAULTS = {
    // the rest of the cover's exit, which the cover itself plays (index.html, "leaving"); all in ms from the press.
    // The sand has no setting: it is gone the instant the key is pressed.
    textDelay: 0,        // when the sentence starts to rise away
    keyDelay: 60,        // when the Recent Work key starts to rise away
    textOut: 320,        // how long each takes to rise and fade
    rise: 56,            // how far they rise, px
    // the panel
    delay: 0,            // when the panel starts to crumble
    bites: 7,            // how many places the upper edge starts to crumble
    stagger: 380,        // ms over which the bites begin, at random
    popAt: 820,          // ms from the press until the crumbling starts to rush
    rush: 240,           // ms the rush takes to eat through everything left
    rushCurve: 2,        // how the rush builds: 1 is steady, higher starts gently and ends fast
    curve: 3,            // how late the crumbling gathers speed: 1 is steady, higher holds back longer
    reach: 0.8,          // how deep a bite gets by the rush, as a share of the panel's height
    crumbs: 9,           // particles shed per pixel a bite grows
    gravityStart: 60,    // upward pull at the press, px/s²
    gravityEnd: 5200,    // upward pull from the rush on
    gravityCurve: 3,     // how late the pull builds
    drift: 26,           // sideways wander of a crumb, px/s
    size: 1.9,           // particle size, px
    life: 680,           // how long a crumb lasts, ms
    after: 300,          // ms from the last of the panel until it is over (the cover then opens the work page)
  };
  // the panel's own greys only: its body, its raised parts and knurling, and now and then the grey of its printed legends
  const COLOURS = ['#212122', '#262627', '#2f2f31', '#2f2f31', '#3a3a3c', '#3a3a3c', '#48484b', '#48484b', '#5a5a5e', '#8a8a8c', '#b4b4b6'];
  const PAD = 80;        // the mask reaches this far past the panel, so its shadow is not cut off
  const MASK = ['maskImage', 'webkitMaskImage', 'maskSize', 'webkitMaskSize', 'maskPosition', 'webkitMaskPosition', 'maskRepeat', 'webkitMaskRepeat',
    'maskClip', 'webkitMaskClip', 'maskComposite', 'webkitMaskComposite', 'visibility', 'pointerEvents'];

  function activeConfig() {
    const store = window.DISSOLVE_VERSIONS;
    const version = store && store.versions && store.versions.find((v) => v.id === store.active);
    return { ...DEFAULTS, ...(version ? version.config : {}) };
  }

  function run(panel, config, { onDone, hold } = {}) {
    const c = { ...DEFAULTS, ...config };
    const r = panel.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const bites = [], motes = [];
    for (let i = 0, n = Math.max(1, Math.round(c.bites)); i < n; i++) {
      bites.push({ x: r.width * ((i + 0.15 + Math.random() * 0.7) / n), delay: Math.random() * Math.min(c.stagger, c.popAt * 0.9), at: 0,
        ax: 0.8 + Math.random() * 0.9, ay: 0.7 + Math.random() * 0.6, reach: r.height * c.reach * (0.7 + Math.random() * 0.6), rx: 0, ry: 0 });
    }
    const full = 1.5 * Math.hypot(r.width / bites.length / 0.8, r.height / 0.7);   // a bite this big, with its neighbours, covers the whole panel
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    const ps = panel.style;
    ps.pointerEvents = 'none';
    ps.maskRepeat = ps.webkitMaskRepeat = 'no-repeat'; ps.maskClip = ps.webkitMaskClip = 'no-clip';
    ps.maskComposite = 'intersect'; ps.webkitMaskComposite = 'source-in';
    ps.maskSize = ps.webkitMaskSize = `${r.width + PAD * 2}px ${r.height + PAD * 2}px`;
    ps.maskPosition = ps.webkitMaskPosition = `${-PAD}px ${-PAD}px`;

    let gone = false, done = false, raf = 0, last = 0;
    const start = performance.now();
    const inBite = (b, x, y) => b.rx > 0 && (x - b.x) * (x - b.x) / (b.rx * b.rx) + y * y / (b.ry * b.ry) < 1;
    const mote = (x, y) => motes.push({
      x: r.left + x, y: r.top + y, vx: (Math.random() - 0.5) * c.drift, vy: (Math.random() - 0.3) * 14,
      size: c.size * (0.55 + Math.random() * 0.9), life: 0, span: c.life * (0.65 + Math.random() * 0.7), lift: 0.6 + Math.random() * 0.9,
      c: COLOURS[Math.random() * COLOURS.length | 0],
    });

    function step(t, dt) {                                           // t: ms since the start; dt: ms since the last step
      const u = Math.min(1, t / c.popAt);
      if (!gone) {
        const rushing = Math.max(0, Math.min(1, (t - c.popAt) / c.rush)), rushK = Math.pow(rushing, c.rushCurve);
        for (const b of bites) {
          const k = Math.max(0, Math.min(1, (t - b.delay) / (c.popAt - b.delay))), was = b.ry;
          if (t <= c.popAt) b.at = b.reach * Math.pow(k, c.curve);     // the slow part: how far this bite has got
          const size = b.at + Math.max(0, full - b.at) * rushK;        // the rush carries it on from there until nothing is left
          b.rx = size * b.ax; b.ry = size * b.ay;
          // crumbs break off the bite's rim, wherever the rim is still panel
          for (let n = Math.min(90, (b.ry - was) * c.crumbs + (size > 0.5 ? c.crumbs / 26 : 0)), j = 0; j < n; j++) {
            if (n - j < 1 && Math.random() > n - j) break;
            const a = Math.random() * Math.PI, x = b.x + Math.cos(a) * b.rx, y = Math.sin(a) * b.ry;
            if (x < 0 || x > r.width || y > r.height || bites.some((o) => o !== b && inBite(o, x, y))) continue;
            mote(x, y);
          }
        }
        ps.maskImage = ps.webkitMaskImage = bites.map((b) =>
          `radial-gradient(${Math.max(0.01, b.rx).toFixed(2)}px ${Math.max(0.01, b.ry).toFixed(2)}px at ${(b.x + PAD).toFixed(1)}px ${PAD}px, transparent 96%, #000 100%)`).join(',');
        if (rushing >= 1) { gone = true; ps.visibility = 'hidden'; }  // eaten through
      }
      const g = c.gravityStart + (c.gravityEnd - c.gravityStart) * Math.pow(u, c.gravityCurve), s = dt / 1000;
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.life += dt; m.vy -= g * m.lift * s; m.vx *= 0.985; m.x += m.vx * s; m.y += m.vy * s;
        if (m.life > m.span || m.y < -10) { motes[i] = motes[motes.length - 1]; motes.pop(); }
      }
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const m of motes) {
        const k = 1 - m.life / m.span, z = m.size * (0.5 + 0.5 * k);
        ctx.globalAlpha = Math.min(1, k * 2.2); ctx.fillStyle = m.c;
        ctx.fillRect(m.x - z / 2, m.y - z / 2, z, z);
      }
    }
    function frame(now) {
      const t = (now - start) * (api.rate || 1) - c.delay;
      if (t < 0) { raf = requestAnimationFrame(frame); return; }      // not yet
      step(t, Math.min(50, t - last)); last = t;
      draw();
      if (t >= c.popAt + c.rush + c.after) { done = true; onDone && onDone(); return; }
      raf = requestAnimationFrame(frame);
    }
    const api = {
      rate: 1,                                                       // the lab slows this down to study the motion
      restore() {                                                    // put the panel back as it was
        cancelAnimationFrame(raf); cv.remove();
        for (const p of MASK) ps[p] = '';
      },
      get done() { return done; },
    };
    if (hold) { for (let t = 16; t <= hold - c.delay; t += 16) step(t, 16); draw(); }   // frozen partway, for screenshots
    else raf = requestAnimationFrame(frame);
    return api;
  }

  window.Dissolve = { DEFAULTS, activeConfig, run };
})();
