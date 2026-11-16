/* A galloping bison set in type, for the foot of a page. The same drawing as the Bison Lab (tinkering/bison-lab/),
   with the lab's settings as they stood when it was placed here: the sheet holds fourteen frames of a 3D model's
   gallop (red its tones, green a height, blue the outline; the marks sheet the horn and eye), a grid is laid over the
   animal and each cell gets one character by how bright it is. It comes in as a wall of flickering characters that
   turns into the animal, the first time the section is scrolled into view.
   Bison.mount(canvas, { src, marks, config }) draws into the canvas, sized to the canvas's parent. Bison.activeConfig() is
   the version the Bison Lab has marked for the site (bison-versions.js); CONFIG is what a version leaves unset. */
(function () {
  'use strict';
  const CONFIG = {
    cell: 9, size: 72, ramp: '.:+xB#', glyph: 125, dim: 0.28, bright: 1,
    fps: 30, bob: 0, blend: 0.5,
    light: 0.4, angle: -18, outline: 0.5, tones: 1.15, marks: 1.2, floor: -0.12, gamma: 1,
    holdMs: 1100, resolveMs: 750, density: 42, wall: 0.7, wallRamp: '', ground: 1, patchStrength: 1, flicker: 9, patch: 30, drift: 1, stagger: 60, close: 70, seed: 7,
    reach: 110, push: 26, falloff: 2,
    narrow: 700, narrowCell: 5, narrowSize: 96,   // on a stage narrower than this, a finer grid and a larger animal, so it still reads
  };
  const SHEET = { w: 400, h: 240, per: 4 };   // one frame's size in the sheet, and frames across

  function mount(view, opts) {
    const cfg = Object.assign({}, CONFIG, opts && opts.config);
    const stage = view.parentElement, ctx = view.getContext('2d');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let sheet = null, frames = 0, grid = [], T, Hh, M, K;
    let cols = 0, rws = 0, ox = 0, oy = 0, W = 0, H = 0, dpr = 1, font = '', ink = '#fff';
    let at = 0, last = 0, enterAt = null, seen = false, inView = false, dirty = true, px = -1e5, py = -1e5;

    const picture = src => new Promise((done, fail) => { const img = new Image(); img.onload = () => done(img); img.onerror = fail; img.src = src; });
    const pixels = img => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return { w: c.width, h: c.height, px: g.getImageData(0, 0, c.width, c.height).data }; };

    function face() {
      const css = getComputedStyle(view);
      const family = css.getPropertyValue('--font-mono').trim() || 'ui-monospace, Menlo, monospace';
      font = `500 ${((cfg.cellNow || cfg.cell) * cfg.glyph / 100).toFixed(2)}px ${family}`; ink = css.color || '#fff'; dirty = true;
    }
    // the grid over the animal's frame, as large as the stage allows, and every frame of the stride averaged down to it
    function layout() {
      const box = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1); W = box.width; H = box.height;
      view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
      if (!sheet) return;
      const small = W < cfg.narrow, cell = small ? cfg.narrowCell : cfg.cell, size = small ? cfg.narrowSize : cfg.size;
      if (cell !== cfg.cellNow) { cfg.cellNow = cell; face(); }
      const across = Math.min(W * size / 100, H * 0.94 * SHEET.w / SHEET.h);
      cols = Math.max(8, Math.round(across / cell)); rws = Math.max(5, Math.round(cols * SHEET.h / SHEET.w));
      ox = Math.round((W - cols * cell) / 2); oy = Math.round((H - rws * cell) / 2);
      const n = cols * rws; grid = [];
      for (let k = 0; k < frames; k++) {
        const sx = (k % SHEET.per) * SHEET.w, sy = Math.floor(k / SHEET.per) * SHEET.h;
        const tone = new Float32Array(n), height = new Float32Array(n), mask = new Float32Array(n), mark = new Float32Array(n);
        for (let r = 0; r < rws; r++) for (let c = 0; c < cols; c++) {
          const x0 = Math.floor(c * SHEET.w / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * SHEET.w / cols));
          const y0 = Math.floor(r * SHEET.h / rws), y1 = Math.max(y0 + 1, Math.floor((r + 1) * SHEET.h / rws));
          let t = 0, h = 0, m = 0, q = 0;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = ((sy + y) * sheet.w + sx + x) * 4; t += sheet.px[i]; h += sheet.px[i + 1]; m += sheet.px[i + 2]; if (sheet.marks) q += sheet.marks[i]; }
          const area = (x1 - x0) * (y1 - y0) * 255, i = r * cols + c;
          mask[i] = m / area; height[i] = h / area; mark[i] = q / area; tone[i] = m > 0 ? t / m : 0;
        }
        grid.push({ tone, height, mask, mark });
      }
      T = new Float32Array(n); Hh = new Float32Array(n); M = new Float32Array(n); K = new Float32Array(n);
      dirty = true;
    }

    const hash = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!frames || !grid.length) return;
      const n = cols * rws, a = grid[Math.floor(at) % frames], b = grid[(Math.floor(at) + 1) % frames];
      const f = at - Math.floor(at), w = cfg.blend > 0 ? Math.min(1, Math.max(0, (f - (1 - cfg.blend)) / cfg.blend)) : 0, u = 1 - w;
      for (let i = 0; i < n; i++) { M[i] = a.mask[i] * u + b.mask[i] * w; Hh[i] = a.height[i] * u + b.height[i] * w; T[i] = a.tone[i] * u + b.tone[i] * w; K[i] = a.mark[i] * u + b.mark[i] * w; }
      const ramp = [...cfg.ramp], levels = ramp.length, cell = cfg.cellNow || cfg.cell;
      const rad = cfg.angle * Math.PI / 180, lx = Math.sin(rad), ly = -Math.cos(rad);
      const slope = cfg.light * cols / 62, edge = cfg.outline * cols / 62, g = cfg.gamma, reach = cfg.reach, push = cfg.push;
      const lift = Math.round(-cfg.bob * Math.cos(at / frames * Math.PI * 2) / cell * 2) * cell / 2;   // the lab's rise and fall, in half cells so the grid holds
      const buckets = ramp.map(() => []);
      const shade = (r, c) => {   // how bright the animal is in a cell, or -1 where it is not
        if (r < 0 || c < 0 || r >= rws || c >= cols) return -1;
        const i = r * cols + c;
        if (M[i] < 0.42) return -1;
        const hl = c > 0 ? Hh[i - 1] : 0, hr = c < cols - 1 ? Hh[i + 1] : 0, hu = r > 0 ? Hh[i - cols] : 0, hd = r < rws - 1 ? Hh[i + cols] : 0;
        const gx = hl - hr, gy = hu - hd, lit = Math.max(0, gx * lx + gy * ly) * slope;
        let v = cfg.floor + lit + Math.sqrt(gx * gx + gy * gy) * edge + T[i] * cfg.tones;
        v = v <= 0 ? 0 : v >= 1 ? 1 : Math.pow(v, g);
        if (K[i] > 0.04) v = Math.max(v, Math.min(1, Math.pow(K[i], 0.7) * cfg.marks));
        return v;
      };
      const wramp = [...(cfg.wallRamp || cfg.ramp)], wlevels = wramp.length, wbuckets = wramp.map(() => []);   // the wall's own characters, or the animal's
      const put = (r, c, v, alpha, wall) => {
        let x = ox + (c + 0.5) * cell, y = oy + lift + (r + 0.5) * cell;
        if (reach > 0) {
          const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
          if (d2 < reach * reach) { const d = Math.sqrt(d2) || 1, k = Math.pow(1 - d / reach, cfg.falloff) * push; x += dx / d * k; y += dy / d * k; }
        }
        if (wall) wbuckets[v].push(x, y, alpha);   // a wall cell: v is which of the wall's characters, alpha carries its brightness
        else buckets[Math.min(levels - 1, Math.floor(v * levels))].push(x, y, alpha);
      };
      const since = enterAt === null ? -1 : now - enterAt;
      if (enterAt !== null && since >= cfg.holdMs + cfg.resolveMs || still.matches) {
        for (let r = 0; r < rws; r++) for (let c = 0; c < cols; c++) { const v = shade(r, c); if (v >= 0) put(r, c, v, 1); }
      } else {
        // the wall over the whole section, then each cell in its turn (the far ones first) goes over to the animal or to nothing
        const turn = since < 0 ? 0 : cfg.resolveMs > 0 ? Math.max(0, since - cfg.holdMs) / cfg.resolveMs : 1;
        const wait = Math.min(0.9, cfg.stagger / 100), close = cfg.close / 100, t = Math.max(0, now) / 1000;
        const seed = cfg.seed * 0.37, beat = t * cfg.flicker, size = cfg.patch / 6.283, slide = t * cfg.drift;
        const c0 = -Math.ceil(ox / cell), c1 = cols + Math.ceil((W - ox - cols * cell) / cell), r0 = -Math.ceil(oy / cell) - 1, r1 = rws + Math.ceil((H - oy - rws * cell) / cell) + 1;
        const far = Math.hypot(Math.max(-c0, c1 - cols) / cols * 2 + 1, Math.max(-r0, r1 - rws) / rws * 2 + 1) - 0.6;
        for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
          const own = hash(c, r, seed), nth = Math.floor(beat + own * 7);
          const more = 0.5 + cfg.patchStrength * (0.28 * Math.sin(c / size + slide * 1.1 + 1.6 * Math.sin(r / size * 0.7 - slide * 0.6 + seed)) + 0.22 * Math.sin(r / size * 1.3 - slide * 0.8 + 1.4 * Math.sin(c / size * 0.6 + slide * 0.5)));
          const on = hash(c, r, seed + 1 + nth) < cfg.density / 100 * more * 2;
          // a lit cell takes any of the wall's characters after the first, at random, and its own brightness; an unlit one the first, faintly
          const glyph = on && wlevels > 1 ? 1 + Math.floor(hash(c, r, seed + 3 + nth) * (wlevels - 1)) : 0;
          const glow = (on ? cfg.dim + (cfg.bright - cfg.dim) * (0.3 + 0.7 * hash(c, r, seed + 2 + nth)) * cfg.wall : cfg.dim * cfg.ground);
          const away = Math.min(1, Math.max(0, (Math.hypot((c + 0.5) / cols * 2 - 1, (r + 0.5) / rws * 2 - 1) - 0.6) / far));
          const order = own * (1 - close) + (1 - away) * close * (0.75 + 0.25 * own);
          const done = Math.min(1, Math.max(0, (turn - order * wait) / (1 - wait)));
          const v = shade(r, c);
          if (done < 1 && glow > 0) put(r, c, glyph, (1 - done) * glow, true);   // the wall fades out of the cell
          if (v >= 0 && done > 0) put(r, c, v, done);                             // and the animal, where it is, fades in
        }
      }
      ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink;
      for (let l = 0; l < levels; l++) {
        const list = buckets[l], ch = ramp[l], bright = levels > 1 ? cfg.dim + (cfg.bright - cfg.dim) * l / (levels - 1) : cfg.bright;
        for (let j = 0; j < list.length; j += 3) { ctx.globalAlpha = bright * list[j + 2]; ctx.fillText(ch, list[j], list[j + 1]); }
      }
      for (let l = 0; l < wlevels; l++) {
        const list = wbuckets[l], ch = wramp[l];
        for (let j = 0; j < list.length; j += 3) { ctx.globalAlpha = Math.min(1, list[j + 2]); ctx.fillText(ch, list[j], list[j + 1]); }
      }
      ctx.globalAlpha = 1;
    }

    // it runs only while it is on screen; the entrance starts the first time it is well into view
    let running = false;
    function tick(now) {
      if (!inView) { running = false; return; }
      requestAnimationFrame(tick);
      const dt = Math.min(100, now - (last || now)); last = now;
      const settled = enterAt !== null && now - enterAt > cfg.holdMs + cfg.resolveMs + 50;
      if (!still.matches && settled && frames) { at = (at + dt / 1000 * cfg.fps) % frames; dirty = true; }
      if (!still.matches && !settled) dirty = true;   // the wall flickers
      if (!dirty) return;
      dirty = false; draw(now);
    }
    const wake = () => { if (!running && inView && sheet) { running = true; last = 0; requestAnimationFrame(tick); } };
    new IntersectionObserver(entries => {
      for (const e of entries) {
        inView = e.isIntersecting;
        if (e.intersectionRatio >= 0.35 && !seen) { seen = true; enterAt = still.matches ? -1e9 : performance.now(); }
      }
      wake();
    }, { threshold: [0, 0.35] }).observe(stage);
    stage.addEventListener('pointermove', e => { const b = stage.getBoundingClientRect(); px = e.clientX - b.left; py = e.clientY - b.top; dirty = true; });
    stage.addEventListener('pointerleave', () => { px = py = -1e5; dirty = true; });
    new ResizeObserver(() => { layout(); wake(); }).observe(stage);
    document.addEventListener('themechange', face);
    document.fonts && document.fonts.ready.then(face);

    face(); layout();
    Promise.all([picture(opts.src), picture(opts.marks).catch(() => null)]).then(([img, lights]) => {
      sheet = pixels(img); sheet.marks = lights ? pixels(lights).px : null;
      const slots = Math.round(img.naturalWidth / SHEET.w) * Math.round(img.naturalHeight / SHEET.h);
      for (let k = 0; k < slots; k++) {   // the sheet's last row may be short: a frame counts if anything is drawn in it
        const sx = (k % SHEET.per) * SHEET.w, sy = Math.floor(k / SHEET.per) * SHEET.h; let any = false;
        for (let y = 20; y < SHEET.h && !any; y += 9) for (let x = 20; x < SHEET.w; x += 9) if (sheet.px[((sy + y) * sheet.w + sx + x) * 4 + 2] > 128) { any = true; break; }
        if (any) frames = k + 1;
      }
      layout(); wake();
    }).catch(() => { stage.hidden = true; });
  }
  function activeConfig() {
    const store = window.BISON_VERSIONS, list = store && Array.isArray(store.versions) ? store.versions : [];
    const v = list.find(x => x.id === store.active);
    return Object.assign({}, v && v.config);
  }
  window.Bison = { mount, CONFIG, activeConfig };
})();
