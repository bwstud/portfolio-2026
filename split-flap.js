/* Split-flap board: one canvas module per letter, flipping through a drum of characters.
   Each frame is drawn at several instants across a simulated camera shutter and averaged,
   so fast flaps smear and neighbouring letters overlap like on film.

   Used by the home page and by the Split-Flap Lab (tinkering/split-flap-lab/).
   DEFAULTS is the live home page configuration: the lab's "Copy config" output is a set of
   overrides for it, passed as the second argument to SplitFlap.mount(). */
(function () {
  const DEFAULTS = {
    // Message
    lines: ['BRIAN', 'STUDWELL'],
    chars: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ',   // the order every module flips through

    // Timing
    flipMs: 55,                 // one full flip: top leaf falls, bottom leaf lands
    startMs: 150,               // earliest any module starts
    staggerMs: 125,             // modules start at random within this window
    minFlips: 14,               // every module spins this long; the last one longer
    maxFlips: 20,
    bounceMs: 90,               // the final leaf rebounds as it lands
    bounceDeg: 12,
    flipEase: 'gravity',        // leaf angle across one flip
    spinEase: 'linear',         // how flips are spaced across a module's whole spin
    seed: null,                 // null: a new schedule every load

    // Motion blur
    shutterMs: 33,              // simulated exposure per frame
    samples: 10,

    // Board
    boardWidth: 560,            // px
    gap: 6,                     // px between modules

    // Tile
    tileRatio: 1.4,             // height / width
    radius: 0.07,               // corner radius, fraction of tile width
    slotSize: 0.016,            // gap between the halves, fraction of tile height

    // Glyph
    glyphSize: 0.92,            // fraction of tile width
    fontWeight: 800,

    // Leaf
    overhang: 0.12,             // canvas spills past the tile so leaves can swing out
    slices: 16,                 // strips per leaf for the perspective warp
    eye: 2.2,                   // viewer distance, in tile heights

    // Light
    topShade: 0.5,              // falling top leaf darkens by this much at 90°
    bottomShine: 0.08,          // landing bottom leaf brightens by this much at 90°
    edgeLight: 0.25,            // highlight along the leaf's free edge
    edgeMinDeg: 3,              // leaf angle where that highlight appears
    edgeSize: 0.006,            // highlight thickness, fraction of tile height

    // Colour
    tileTop: '#242427',         // top of the tile, fading to tileBottom at the hinge
    tileBottom: '#1c1c1e',
    glyphColor: '#f2f0ec',
    slotColor: '#0e0e0f',
  };

  // Curves take progress 0–1. Anything else accepted as an ease is a cubic-bezier array.
  const EASES = {
    linear: p => p,
    // gravity: the leaf speeds up as it falls and carries that speed through the hinge
    gravity: p => p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) ** 2,
    bounce: p => {
      const n = 7.5625, d = 2.75;
      if (p < 1 / d) return n * p * p;
      if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
      if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
      return n * (p -= 2.625 / d) * p + 0.984375;
    },
    elastic: p => p <= 0 ? 0 : p >= 1 ? 1 : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * 2 * Math.PI / 3) + 1,
  };

  function bezier(x1, y1, x2, y2) {
    const curve = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
    return p => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      let lo = 0, hi = 1, s = p;
      for (let i = 0; i < 24; i++) {
        if (curve(x1, x2, s) < p) lo = s; else hi = s;
        s = (lo + hi) / 2;
      }
      return curve(y1, y2, s);
    };
  }

  const resolveEase = e => typeof e === 'function' ? e : Array.isArray(e) ? bezier(...e) : EASES[e] || EASES.linear;

  function seeded(seed) {   // mulberry32
    return () => {
      seed = seed + 0x6d2b79f5 | 0;
      let r = Math.imul(seed ^ seed >>> 15, 1 | seed);
      r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  // What a module shows at time t (ms since the animation began)
  function flapState(m, t, cfg, flipEase, spinEase) {
    const n = m.seq.length - 1, local = t - m.start, spinMs = n * cfg.flipMs;
    if (local < 0 || n === 0) return { top: m.seq[0], bottom: m.seq[0] };
    if (local >= spinMs) {
      const u = (local - spinMs) / cfg.bounceMs;
      if (!(u < 1)) return { top: m.seq[n], bottom: m.seq[n] };
      return { top: m.seq[n], bottom: m.seq[n - 1],
               leaf: { half: 'bottom', ch: m.seq[n], deg: cfg.bounceDeg * Math.sin(Math.PI * u) } };
    }
    const f = Math.min(Math.max(n * spinEase(local / spinMs), 0), n - 1e-6);
    const i = Math.floor(f), from = m.seq[i], to = m.seq[i + 1];
    // the leaf turns through 180°: past the hinge it becomes the bottom half, and an ease
    // that overshoots 180° rebounds off the stop
    const deg = 180 * flipEase(f - i);
    if (deg < 90) return { top: to, bottom: from, leaf: { half: 'top', ch: from, deg: Math.max(deg, 0) } };
    return { top: to, bottom: from, leaf: { half: 'bottom', ch: to, deg: Math.abs(180 - deg) } };
  }

  const flapEnd = (m, cfg) => m.start + (m.seq.length - 1) * cfg.flipMs + cfg.bounceMs;

  // host gets the board appended to it. Nothing animates by itself: call seek(t) with a clock.
  function mount(host, options) {
    const board = document.createElement('span');
    board.className = 'sf-board';
    board.setAttribute('aria-hidden', 'true');
    host.appendChild(board);

    const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d');
    let cfg, mods, flipEase, spinEase, duration;
    // geometry in device pixels; tiles (background + glyph) are cached per character
    let tw, th, pad, tiles = {}, fontReady = false, time = 0;

    function build(next) {
      cfg = { ...DEFAULTS, ...next };
      flipEase = resolveEase(cfg.flipEase);
      spinEase = resolveEase(cfg.spinEase);
      const lines = cfg.lines.some(l => l.length) ? cfg.lines : [' '];
      const chars = cfg.chars || ' ';

      board.style.setProperty('--cols', Math.max(...lines.map(l => [...l].length)));
      board.style.setProperty('--sf-width', cfg.boardWidth + 'px');
      board.style.setProperty('--sf-gap', cfg.gap + 'px');
      board.style.setProperty('--sf-ratio', cfg.tileRatio);
      board.style.setProperty('--sf-overhang', cfg.overhang);

      board.textContent = '';
      mods = [];
      lines.forEach(line => {
        const row = document.createElement('span');
        row.className = 'sf-row';
        [...line].forEach(ch => {
          const el = document.createElement('span');
          el.className = 'sf';
          const canvas = document.createElement('canvas');
          el.appendChild(canvas); row.appendChild(el);
          mods.push({ el, canvas, ctx: canvas.getContext('2d'), target: ch });
        });
        board.appendChild(row);
      });

      // schedule: every module opens on some earlier letter and spins forward around the drum
      // to its target, so all of them flip; the last one gets enough extra flips to land last
      const random = cfg.seed === null ? Math.random : seeded(cfg.seed);
      const len = chars.length, at = i => chars[(i % len + len) % len];
      const spinTo = (m, flips) => {
        const end = Math.max(chars.indexOf(m.target), 0);
        if (at(end - flips) === ' ' && len > 1) flips++;   // never open on a blank
        m.seq = Array.from({ length: flips + 1 }, (_, i) => at(end - flips + i));
      };
      const minFlips = Math.min(cfg.minFlips, cfg.maxFlips), maxFlips = Math.max(cfg.minFlips, cfg.maxFlips);
      const rest = mods.slice(0, -1), last = mods[mods.length - 1];
      mods.forEach(m => { m.start = cfg.startMs + random() * cfg.staggerMs; });
      rest.forEach(m => spinTo(m, minFlips + Math.floor(random() * (maxFlips - minFlips + 1))));
      const restEnd = rest.length ? Math.max(...rest.map(m => flapEnd(m, cfg))) : 0;
      spinTo(last, Math.max(Math.ceil((restEnd - cfg.bounceMs / 2 - last.start) / cfg.flipMs) + 1, minFlips, 1));
      duration = Math.max(...mods.map(m => flapEnd(m, cfg))) + cfg.shutterMs;

      layout();
      redraw();
    }

    function layout() {
      const dpr = window.devicePixelRatio || 1;
      tw = Math.round(mods[0].el.clientWidth * dpr);
      th = Math.round(tw * cfg.tileRatio);
      pad = Math.round(tw * cfg.overhang);
      tiles = {};
      [...mods.map(m => m.canvas), scratch].forEach(c => { c.width = tw + pad * 2; c.height = th; });
      if (fontReady) [...cfg.chars].forEach(tile);   // build every tile up front, not mid-spin
    }

    function tile(ch) {
      if (tiles[ch]) return tiles[ch];
      const c = document.createElement('canvas'); c.width = tw; c.height = th;
      const g = c.getContext('2d'), r = tw * cfg.radius;
      const grad = g.createLinearGradient(0, 0, 0, th / 2);
      grad.addColorStop(0, cfg.tileTop); grad.addColorStop(1, cfg.tileBottom);
      g.fillStyle = grad;
      g.beginPath(); g.roundRect(0, 0, tw, th / 2, [r, r, 0, 0]); g.fill();
      g.fillStyle = cfg.tileBottom;
      g.beginPath(); g.roundRect(0, th / 2, tw, th / 2, [0, 0, r, r]); g.fill();
      if (!fontReady) return (tiles[ch] = c);   // plain tile until Geist arrives
      // every glyph shares one baseline, with capitals centred on the hinge
      g.font = cfg.fontWeight + ' ' + Math.round(tw * cfg.glyphSize) + 'px Geist, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = cfg.glyphColor;
      g.fillText(ch, tw / 2, th / 2 + g.measureText('H').actualBoundingBoxAscent / 2);
      return (tiles[ch] = c);
    }

    // a leaf rotating about the hinge, drawn in strips so its free edge swings toward the viewer
    function drawLeaf(g, leaf) {
      const img = tile(leaf.ch), h = th / 2, hinge = th / 2, cx = pad + tw / 2, slices = cfg.slices;
      const a = leaf.deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      const eye = th * cfg.eye, dir = leaf.half === 'top' ? -1 : 1;
      const proj = d => { const sc = eye / (eye - d * sin); return { y: hinge + dir * d * cos * sc, sc }; };
      // shading: the falling top leaf turns away from the light, the landing bottom leaf faces it
      g.fillStyle = leaf.half === 'top' ? `rgba(0, 0, 0, ${cfg.topShade * sin})` : `rgba(255, 255, 255, ${cfg.bottomShine * sin})`;
      for (let k = 0; k < slices; k++) {
        const d0 = k / slices * h, d1 = (k + 1) / slices * h;
        const p0 = proj(d0), p1 = proj(d1), w = tw * (p0.sc + p1.sc) / 2;
        const sy = leaf.half === 'top' ? h - d1 : h + d0;
        const x = cx - w / 2, y = Math.min(p0.y, p1.y), sh = Math.abs(p1.y - p0.y) + 1;
        g.drawImage(img, 0, sy, tw, h / slices, x, y, w, sh);
        g.fillRect(x, y, w, sh);
      }
      if (leaf.deg > cfg.edgeMinDeg) {   // light catching the leaf's free edge
        const e = proj(h);
        g.fillStyle = `rgba(255, 255, 255, ${cfg.edgeLight * sin})`;
        g.fillRect(cx - tw * e.sc / 2, e.y - (dir < 0 ? 0 : 1), tw * e.sc, Math.max(1, th * cfg.edgeSize));
      }
    }

    function drawState(g, st) {
      g.clearRect(0, 0, tw + pad * 2, th);
      g.drawImage(tile(st.top), 0, 0, tw, th / 2, pad, 0, tw, th / 2);
      g.drawImage(tile(st.bottom), 0, th / 2, tw, th / 2, pad, th / 2, tw, th / 2);
      if (st.leaf) drawLeaf(g, st.leaf);
      g.fillStyle = cfg.slotColor;   // the slot between the halves
      g.fillRect(pad, th / 2 - th * cfg.slotSize / 2, tw, th * cfg.slotSize);
    }

    const stateAt = (m, t) => flapState(m, t, cfg, flipEase, spinEase);

    function drawModule(m, t) {
      const moving = t > m.start - cfg.shutterMs && t < flapEnd(m, cfg) + cfg.shutterMs;
      if (!moving) {
        const st = stateAt(m, t), key = st.top + st.bottom;
        if (m.drawn !== key) { drawState(m.ctx, st); m.drawn = key; }
        return;
      }
      // running average of samples: sample j is laid over the mean of the ones before it
      m.drawn = null;
      const samples = cfg.samples;
      for (let j = 0; j < samples; j++) {
        const behind = samples > 1 ? 1 - j / (samples - 1) : 0;
        drawState(sctx, stateAt(m, t - cfg.shutterMs * behind));
        if (j === 0) m.ctx.clearRect(0, 0, tw + pad * 2, th);
        m.ctx.globalAlpha = 1 / (j + 1);
        m.ctx.drawImage(scratch, 0, 0);
      }
      m.ctx.globalAlpha = 1;
    }

    function seek(t) { time = t; mods.forEach(m => drawModule(m, t)); }
    function redraw() { mods.forEach(m => { m.drawn = null; }); seek(time); }

    build(options);

    // resizing a canvas clears it, so every layout change redraws straight away
    new ResizeObserver(() => { layout(); redraw(); }).observe(board);

    const ready = document.fonts.load('800 64px Geist').catch(() => {}).then(() => {
      fontReady = true; tiles = {};
      [...cfg.chars].forEach(tile);
      redraw();
    });

    return {
      seek,
      ready,
      update: build,                  // rebuild from a new set of overrides, keeping the playhead
      get duration() { return duration; },
      // the schedule, for drawing a timeline
      get tracks() {
        return mods.map(m => ({ ch: m.target, start: m.start, flips: m.seq.length - 1,
                                spinMs: (m.seq.length - 1) * cfg.flipMs, end: flapEnd(m, cfg) }));
      },
    };
  }

  window.SplitFlap = { DEFAULTS, EASES, resolveEase, flapState, flapEnd, mount };
})();
