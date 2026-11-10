/* Split-flap board: one canvas module per letter, flipping through a drum of characters.
   Each frame is drawn at several instants across a simulated camera shutter and averaged,
   so fast flaps smear and neighbouring letters overlap like on film.

   Used by the home page and by the Split-Flap Lab (tinkering/split-flap-lab/).
   DEFAULTS is the base configuration. A config is a set of overrides for it, passed as the
   second argument to SplitFlap.mount(). The site runs the version marked active in
   split-flap-versions.js, which the lab writes. */
(function () {
  const DEFAULTS = {
    // Message
    lines: ['BRIAN', 'STUDWELL'],
    sequence: [],               // later messages for spinTo(); the board is sized to fit them all
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
    samples: 4,

    // Board
    boardWidth: 560,            // px
    gap: 6,                     // px between modules
    padX: 0,                    // empty modules left and right of the text
    padY: 0,                    // empty rows above and below the text
    fillRows: false,            // short lines get empty modules out to the full width
    blankFlips: true,           // empty modules spin with the rest and land blank

    // Frame: a plate with one recessed window per module
    frame: false,
    frameColor: '#1b1f26',
    wellColor: '#07080a',       // the dark behind the tile
    framePad: 28,               // px of plate around the grid
    frameGap: 12,               // px of plate between windows, replacing gap
    frameInset: 0.05,           // space between tile and window, fraction of window size
    frameDepth: 0.7,            // strength of the shadow the plate casts into each window
    frameLip: 0.1,              // light catching each window's lower edge
    frameSheen: 0.05,           // side light across the plate

    // Tile
    tileRatio: 1.4,             // height / width
    radius: 0.07,               // corner radius, fraction of tile width
    slotSize: 0.016,            // gap between the halves, fraction of tile height
    grain: 0,                   // film grain strength on the leaf surfaces
    grainSize: 1,               // grain size, CSS px

    // Glyph
    glyphSize: 0.92,            // fraction of tile width
    fontWeight: 800,
    icons: {},                  // character → SVG path data on a 24-unit grid, stroked like a Lucide icon
    iconSize: 0.62,             // fraction of tile width
    iconStroke: 2.75,           // stroke width on the 24-unit grid

    // Leaf
    overhang: 0.12,             // canvas spills past the tile so leaves can swing out
    slices: 16,                 // strips per leaf for the perspective warp
    blurSlices: 4,              // strips for the faint motion-blur copies behind the sharp one
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

  // Tileable noise: white and black specks of random strength, centred on no change
  let noise = null;
  function noiseTexture() {
    if (noise) return noise;
    const size = 256, random = seeded(7);
    noise = document.createElement('canvas');
    noise.width = noise.height = size;
    const g = noise.getContext('2d'), img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (random() + random() + random()) / 1.5 - 1;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0 ? 255 : 0;
      img.data[i + 3] = Math.abs(v) * 255;
    }
    g.putImageData(img, 0, 0);
    return noise;
  }

  // What a module shows at time t (ms since the animation began)
  function flapState(m, t, cfg, flipEase, spinEase) {
    const n = m.seq.length - 1, local = t - m.start, spinMs = n * (m.flipMs || cfg.flipMs);
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

  const flapEnd = (m, cfg) => m.start + (m.seq.length - 1) * (m.flipMs || cfg.flipMs) + cfg.bounceMs;

  // host gets the board appended to it. Nothing animates by itself: call seek(t) with a clock.
  function mount(host, options) {
    const board = document.createElement('span');
    board.className = 'sf-board';
    board.setAttribute('aria-hidden', 'true');
    host.appendChild(board);

    const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d');
    let cfg, mods, grid, flipEase, spinEase, duration, layoutMessage;
    const blanks = count => Array(count).fill(' ');
    // geometry in device pixels; tiles (background + glyph) are cached per character
    let tw, th, pad, tiles = {}, fontReady = false, time = 0;

    function build(next) {
      cfg = { ...DEFAULTS, ...next };
      flipEase = resolveEase(cfg.flipEase);
      spinEase = resolveEase(cfg.spinEase);
      const lines = cfg.lines.some(l => l.length) ? cfg.lines : [' '];
      const messages = [lines, ...cfg.sequence];
      // any character a message uses joins the end of the drum
      let chars = cfg.chars || ' ';
      messages.flat().forEach(l => [...l].forEach(c => { if (!chars.includes(c)) chars += c; }));
      cfg.chars = chars;

      // the text sits inside a margin of empty modules; a block narrower than the board centres
      const width = msg => Math.max(...msg.map(l => [...l].length));
      const cols = Math.max(...messages.map(width)) + cfg.padX * 2;
      const height = Math.max(...messages.map(m => m.length));
      layoutMessage = msg => {
        const left = Math.floor((cols - width(msg)) / 2);
        return Array.from({ length: height }, (_, r) => {
          const cells = [...blanks(left), ...(msg[r] || '')];
          return cfg.fillRows || messages.length > 1 ? [...cells, ...blanks(cols - cells.length)] : cells;
        });
      };
      const margin = Array.from({ length: cfg.padY }, () => blanks(cols));
      const rows = [...margin, ...layoutMessage(lines), ...margin];
      grid = { cols, rows: rows.length };

      board.style.setProperty('--cols', cols);
      board.style.setProperty('--sf-width', cfg.boardWidth + 'px');
      board.style.setProperty('--sf-gap', (cfg.frame ? cfg.frameGap : cfg.gap) + 'px');
      board.classList.toggle('is-framed', cfg.frame);
      board.style.setProperty('--sf-inset', cfg.frame ? cfg.frameInset : 0);
      board.style.setProperty('--sf-frame-pad', cfg.framePad + 'px');
      plateStyle();
      board.style.setProperty('--sf-ratio', cfg.tileRatio);
      board.style.setProperty('--sf-overhang', cfg.overhang);

      board.textContent = '';
      mods = [];
      rows.forEach(cells => {
        const row = document.createElement('span');
        row.className = 'sf-row';
        cells.forEach(ch => {
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
      const last = mods.findLast(m => m.target !== ' ') || mods[mods.length - 1];
      const rest = mods.filter(m => m !== last && (cfg.blankFlips || m.target !== ' '));
      mods.forEach(m => { m.start = cfg.startMs + random() * cfg.staggerMs; m.seq = [m.target]; });
      rest.forEach(m => spinTo(m, minFlips + Math.floor(random() * (maxFlips - minFlips + 1))));
      const restEnd = rest.length ? Math.max(...rest.map(m => flapEnd(m, cfg))) : 0;
      spinTo(last, Math.max(Math.ceil((restEnd - cfg.bounceMs / 2 - last.start) / cfg.flipMs) + 1, minFlips, 1));
      duration = Math.max(...mods.map(m => flapEnd(m, cfg))) + cfg.shutterMs;

      layout();
      redraw();
    }

    // Everything lands on whole device pixels: cells, tiles, the space around each tile and the
    // board's own position. Fractional sizes made each window blur its edges differently, so
    // tiles looked off-centre and the gaps changed from window to window. The few pixels left
    // over when the columns are rounded down go to the plate, split either side.
    function layout() {
      const dpr = window.devicePixelRatio || 1;
      const style = getComputedStyle(board), row = board.firstElementChild;
      const inner = (board.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * dpr;
      const gap = Math.round(parseFloat(getComputedStyle(row).columnGap) * dpr) || 0;
      const inset = cfg.frame ? cfg.frameInset : 0;
      const cellW = Math.max(4, Math.floor((inner - gap * (grid.cols - 1)) / grid.cols));
      const insetX = Math.round(cellW * inset), insetY = Math.round(insetX * cfg.tileRatio);
      tw = cellW - 2 * insetX;
      th = Math.round(tw * cfg.tileRatio);
      pad = Math.round(tw * cfg.overhang);
      board.style.setProperty('--sf-col', cellW / dpr + 'px');
      board.style.setProperty('--sf-row', (th + 2 * insetY) / dpr + 'px');
      board.style.setProperty('--sf-cell', cellW / dpr + 'px');
      const place = { left: (insetX - pad) / dpr + 'px', top: insetY / dpr + 'px', width: (tw + 2 * pad) / dpr + 'px', height: th / dpr + 'px' };
      mods.forEach(m => Object.assign(m.canvas.style, place));
      tiles = {};
      [...mods.map(m => m.canvas), scratch].forEach(c => { c.width = tw + pad * 2; c.height = th; });
      if (fontReady) [...cfg.chars].forEach(tile);   // build every tile up front, not mid-spin
      snap();
    }

    // nudge the board by under half a pixel so it starts on a device pixel; run again whenever
    // the page around it moves without the board itself resizing
    function snap() {
      const dpr = window.devicePixelRatio || 1;
      board.style.translate = '';
      const r = board.getBoundingClientRect();
      const dx = Math.round(r.left * dpr) - r.left * dpr, dy = Math.round(r.top * dpr) - r.top * dpr;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) board.style.translate = `${dx / dpr}px ${dy / dpr}px`;
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
      if (!fontReady) { addGrain(g, ch); return (tiles[ch] = c); }   // plain tile until Geist arrives
      if (cfg.icons[ch]) { drawIcon(g, cfg.icons[ch]); addGrain(g, ch); return (tiles[ch] = c); }
      // every glyph shares one baseline, with capitals centred on the hinge
      g.font = cfg.fontWeight + ' ' + Math.round(tw * cfg.glyphSize) + 'px Geist, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = cfg.glyphColor;
      g.fillText(ch, tw / 2, th / 2 + g.measureText('H').actualBoundingBoxAscent / 2);
      addGrain(g, ch);
      return (tiles[ch] = c);
    }

    // an icon centred on the hinge, in the glyph colour
    function drawIcon(g, paths) {
      const size = tw * cfg.iconSize, s = size / 24;
      g.save();
      g.translate((tw - size) / 2, (th - size) / 2);
      g.scale(s, s);
      g.strokeStyle = cfg.glyphColor;
      g.lineWidth = cfg.iconStroke;
      g.lineCap = 'round'; g.lineJoin = 'round';
      [].concat(paths).forEach(d => g.stroke(new Path2D(d)));
      g.restore();
    }

    // baked into the tile, over the glyph, so the grain travels with the leaf as it swings
    function addGrain(g, ch) {
      if (!cfg.grain) return;
      const pattern = g.createPattern(noiseTexture(), 'repeat'), code = ch.codePointAt(0);
      const scale = cfg.grainSize * (window.devicePixelRatio || 1);
      pattern.setTransform(new DOMMatrix().scale(scale).translate(code * 37, code * 61));
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = cfg.grain;
      g.fillStyle = pattern;
      g.fillRect(0, 0, tw, th);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // a leaf rotating about the hinge, drawn in strips so its free edge swings toward the viewer
    function drawLeaf(g, leaf, slices = cfg.slices) {
      const img = tile(leaf.ch), h = th / 2, hinge = th / 2, cx = pad + tw / 2;
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

    function drawState(g, st, slices) {
      g.clearRect(0, 0, tw + pad * 2, th);
      g.drawImage(tile(st.top), 0, 0, tw, th / 2, pad, 0, tw, th / 2);
      g.drawImage(tile(st.bottom), 0, th / 2, tw, th / 2, pad, th / 2, tw, th / 2);
      if (st.leaf) drawLeaf(g, st.leaf, slices);
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
        // only the newest, sharpest sample needs every strip; the faint ones behind it blur anyway
        drawState(sctx, stateAt(m, t - cfg.shutterMs * behind), j === samples - 1 ? cfg.slices : cfg.blurSlices);
        if (j === 0) m.ctx.clearRect(0, 0, tw + pad * 2, th);
        m.ctx.globalAlpha = 1 / (j + 1);
        m.ctx.drawImage(scratch, 0, 0);
      }
      m.ctx.globalAlpha = 1;
    }

    function seek(t) { time = t; mods.forEach(m => drawModule(m, t)); }

    // spin from whatever the board shows now to a new message, starting at time t0. Every module
    // runs forward around the drum to its new letter, so the board keeps its size. speed 2 flips
    // twice as fast.
    function spinTo(lines, t0, options) {
      const margin = Array.from({ length: cfg.padY }, () => blanks(grid.cols));
      const targets = [...margin, ...layoutMessage(lines), ...margin].flat();
      mods.forEach((m, i) => spinModule(m, targets[i], t0, options));
      duration = Math.max(...mods.map(m => flapEnd(m, cfg))) + cfg.shutterMs;
    }

    // spin one module (counted left to right, top to bottom; negative counts from the end)
    function spinCell(index, ch, t0, options) {
      spinModule(mods.at(index), ch, t0, options);
      duration = Math.max(...mods.map(m => flapEnd(m, cfg))) + cfg.shutterMs;
    }

    function spinModule(m, target, t0, { speed = 1 } = {}) {
      const chars = cfg.chars, len = chars.length, random = Math.random;
      const minFlips = Math.min(cfg.minFlips, cfg.maxFlips), maxFlips = Math.max(cfg.minFlips, cfg.maxFlips);
      const to = Math.max(chars.indexOf(target), 0);
      // the first flip lands on a random letter and the spin runs on from there, so neighbours
      // that showed the same thing don't march through the drum together
      const flips = minFlips + Math.floor(random() * (maxFlips - minFlips + 1));
      const at = i => chars[(i % len + len) % len];
      m.seq = [m.target, ...Array.from({ length: flips }, (_, k) => at(to - flips + 1 + k))];
      m.target = target;
      m.flipMs = cfg.flipMs / speed * (0.8 + random() * 0.4);   // each module keeps its own pace
      m.start = t0 + (cfg.startMs + random() * cfg.staggerMs) / speed;
    }
    function redraw() { mods.forEach(m => { m.drawn = null; }); seek(time); }

    // the plate's look lives in CSS custom properties on the board
    function plateStyle() {
      board.style.setProperty('--sf-frame-color', cfg.frameColor);
      board.style.setProperty('--sf-well-color', cfg.wellColor);
      board.style.setProperty('--sf-frame-depth', cfg.frameDepth);
      board.style.setProperty('--sf-frame-lip', cfg.frameLip);
      board.style.setProperty('--sf-frame-sheen', cfg.frameSheen);
    }

    // change colours and shading in place, without rebuilding: whatever is mid-spin carries on
    function restyle(overrides) {
      Object.assign(cfg, overrides);
      plateStyle();
      tiles = {};
      if (fontReady) [...cfg.chars].forEach(tile);
      redraw();
    }

    build(options);

    // resizing a canvas clears it, so every layout change redraws straight away
    new ResizeObserver(() => { layout(); redraw(); }).observe(board);
    let snapQueued = false;
    addEventListener('resize', () => {
      if (snapQueued) return;
      snapQueued = true;
      requestAnimationFrame(() => { snapQueued = false; snap(); });
    });

    const ready = document.fonts.load('800 64px Geist').catch(() => {}).then(() => {
      fontReady = true; tiles = {};
      [...cfg.chars].forEach(tile);
      redraw();
    });

    return {
      seek,
      spinTo,
      spinCell,
      cell: index => mods.at(index).el,   // a module's element, for placing things over it
      states: t => mods.map(m => stateAt(m, t)),   // what every module shows at time t
      ready,
      update: build,                  // rebuild from a new set of overrides, keeping the playhead
      restyle,                        // recolour in place from a few overrides
      get duration() { return duration; },
      get grid() { return grid; },
      // the schedule, for drawing a timeline
      get tracks() {
        return mods.map(m => ({ ch: m.target, blank: m.target === ' ', start: m.start, flips: m.seq.length - 1,
                                spinMs: (m.seq.length - 1) * cfg.flipMs, end: flapEnd(m, cfg) }));
      },
    };
  }

  // the overrides the site should run, from split-flap-versions.js
  // Light and dark. A board's size, layout and timing come from the dark active version; in
  // light mode only its look (STYLE_KEYS) comes from the light active version, so switching
  // modes can recolour a running board in place with restyle(). Until a light version is set
  // active, light mode uses LIGHT.
  const STYLE_KEYS = ['frameColor', 'wellColor', 'frameDepth', 'frameLip', 'frameSheen',
    'tileTop', 'tileBottom', 'slotColor', 'glyphColor', 'fontWeight', 'grain', 'grainSize',
    'topShade', 'bottomShine', 'edgeLight', 'edgeMinDeg', 'edgeSize'];
  // warm, to sit on the light page's paper (#F5F3ED): a plate a shade darker than the page,
  // cream tiles and Rust letters (tried: Night, Navy, #1C374E), like an enamel station board in daylight
  const LIGHT = {
    frameColor: '#e6e1d5', wellColor: '#cdc5b5', frameDepth: 0.3, frameLip: 0.7, frameSheen: 0.25,
    tileTop: '#fffdf7', tileBottom: '#f0ebe0', glyphColor: '#9F4933', slotColor: '#b3aa98',
    edgeLight: 0.55, grain: 0.035,
  };
  const pick = (config, keys) => Object.fromEntries(keys.map(k => [k, config[k]]));

  // the overrides the site runs for a mode, from a versions store (split-flap-versions.js)
  function resolveConfig(store, mode = 'dark') {
    const find = id => store && store.versions.find(v => v.id === id);
    const dark = find(store && store.active);
    const config = dark ? { ...dark.config } : {};
    if (mode !== 'light') return config;
    const light = find(store.activeLight);
    return { ...config, ...(light ? pick({ ...DEFAULTS, ...light.config }, STYLE_KEYS) : LIGHT) };
  }

  // just the look for a mode: what restyle() takes
  const activeStyle = (mode, store = window.SPLIT_FLAP_VERSIONS) =>
    pick({ ...DEFAULTS, ...resolveConfig(store, mode) }, STYLE_KEYS);

  const activeConfig = (mode, store = window.SPLIT_FLAP_VERSIONS) => resolveConfig(store, mode);

  window.SplitFlap = { DEFAULTS, EASES, STYLE_KEYS, LIGHT, resolveEase, flapState, flapEnd, mount,
    activeConfig, activeStyle, resolveConfig };
})();
