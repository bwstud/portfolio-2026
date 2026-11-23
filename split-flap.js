/* Split-flap board: one canvas module per letter, flipping through a drum of characters.
   Each frame is drawn at several instants across a simulated camera shutter and averaged,
   so fast flaps smear and neighbouring letters overlap like on film.

   Used by the home page and by the Split-Flap Lab (experiments/split-flap-lab/).
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

    // Rows: a line written "NAME|STATUS" is set in two columns, each padded to its width
    nameCols: 0,                // modules in the left column; 0 leaves lines as written
    statusCols: 0,              // modules in the right column

    // Record: the project panel under the board on the home page. It waits above its place,
    // unseen, and lowers into it as the board lands. The engine doesn't draw it; the page does.
    recordFadeMs: 700,          // how long the fade and the drop take
    recordDrop: 24,             // px it starts above its resting place; negative starts below
    recordLeadMs: 450,          // it starts this long before the board's last flap lands
    recordBlur: 0,              // px of blur it starts with
    // Touch: hover(index, t, { half, amount }) lifts a resting module's upper or lower flap, part or all of the way; spinCell(..., { flips }) turns it
    liftDeg: 36,                // how far a flap swings out under the cursor, at its fullest
    liftMs: 160,                // how long it takes to lift and to drop back

    recordEase: [0.23, 1, 0.32, 1],   // how it settles: a named ease or a cubic-bezier array

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

    // Hologram: the letters leave the flaps and float in front of them as projected light. 0 turns it off and prints
    // the letters on the flaps as usual. The flaps keep only the letter's shadow and a little of its light.
    holo: 0,                    // strength of the projection, 0–1
    holoColor: '#e6f2ff',       // the light's colour
    holoBloom: 0.5,             // glow around each letter
    holoFringe: 0.8,            // px of red and cyan split at the letters' edges
    holoScan: 0.3,              // how much the scanlines take out
    holoScanGap: 3,             // px from one scanline to the next
    holoFlicker: 0.25,          // how unsteady the light is
    holoSpin: 0.35,             // how bright the letters run while the flaps spin under them; a landed one is at full strength
    holoShadow: 0.6,            // the opacity of the letter's shadow, cast on the flaps behind it
    holoShadowColor: '#000000', // its colour
    holoShadowX: 0.05,          // its offset, fraction of tile width
    holoShadowY: 0.12,
    holoShadowBlur: 0.06,       // its softness, fraction of tile width
    holoSpill: 0.3,             // the letter's light falling on the flap straight behind it
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

  // Rows. "NAME|STATUS" becomes one line with each part padded to its column, so the status
  // column starts at the same module on every row. Lines without a bar pass through.
  const compose = (lines, cfg) => lines.map(l => {
    if (!(cfg.nameCols > 0) || !l.includes('|')) return l.replaceAll('|', ' ');
    const [name, status = ''] = l.split('|');
    // Each column is exactly its width: a name too long is cut at its end, a status at its start
    // (so "SHIPPED 1014" in four modules is "1014"), and the status ends at the board's right edge.
    const cut = (text, cols, fromEnd) => cols > 0 ? (fromEnd ? text.slice(-cols) : text.slice(0, cols)) : '';
    return cut(name.trim(), cfg.nameCols).padEnd(cfg.nameCols) + cut(status.trim(), cfg.statusCols, true).padStart(Math.max(0, cfg.statusCols));
  });

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
    let tw, th, pad, insetX = 0, insetY = 0, tiles = {}, fontReady = false, time = 0;

    function build(next) {
      cfg = { ...DEFAULTS, ...next };
      flipEase = resolveEase(cfg.flipEase);
      spinEase = resolveEase(cfg.spinEase);
      const lines = compose(cfg.lines.some(l => l.length) ? cfg.lines : [' '], cfg);
      const messages = [lines, ...cfg.sequence.map(m => compose(m, cfg))];
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
      rows.forEach((cells, r) => {
        const row = document.createElement('span');
        row.className = 'sf-row';
        cells.forEach(ch => {
          const el = document.createElement('span');
          el.className = 'sf';
          const canvas = document.createElement('canvas');
          el.appendChild(canvas); row.appendChild(el);
          mods.push({ el, canvas, ctx: canvas.getContext('2d'), target: ch, row: r });
        });
        board.appendChild(row);
      });
      holoSetup();

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
      insetX = Math.round(cellW * inset); insetY = Math.round(insetX * cfg.tileRatio);
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
      holoPlace();
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
      if (!fontReady || ch === ' ') { addGrain(g, ch); return (tiles[ch] = c); }   // plain tile until Geist arrives
      if (cfg.holo > 0) {   // the letter is light in front of the flap: the flap keeps only the glow it casts
        g.save();
        // the shadow isn't here: it is drawn on its own layer over the flaps (holoFrame), where the work page's
        // greyscale doesn't reach it and nothing is painted over it
        if (cfg.holoSpill > 0) { g.filter = `blur(${Math.max(0, cfg.holoShadowBlur * tw) * 2.5}px)`; g.globalAlpha = Math.min(1, cfg.holoSpill * cfg.holo); paintGlyph(g, ch, cfg.holoColor, 0, 0); }
        g.restore();
      } else paintGlyph(g, ch, cfg.glyphColor, 0, 0);
      addGrain(g, ch);
      return (tiles[ch] = c);
    }

    // a letter or icon as the tile prints it, moved by dx, dy: every glyph shares one baseline, with capitals centred
    // on the hinge, and an icon sits centred on it
    function paintGlyph(g, ch, color, dx, dy) {
      if (cfg.icons[ch]) {
        const size = tw * cfg.iconSize, s = size / 24;
        g.save();
        g.translate((tw - size) / 2 + dx, (th - size) / 2 + dy);
        g.scale(s, s);
        g.strokeStyle = color;
        g.lineWidth = cfg.iconStroke;
        g.lineCap = 'round'; g.lineJoin = 'round';
        [].concat(cfg.icons[ch]).forEach(d => g.stroke(new Path2D(d)));
        g.restore();
        return;
      }
      g.font = cfg.fontWeight + ' ' + Math.round(tw * cfg.glyphSize) + 'px Geist, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = color;
      g.fillText(ch, tw / 2 + dx, th / 2 + g.measureText('H').actualBoundingBoxAscent / 2 + dy);
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
      for (let k = 0; k < slices; k++) {
        const d0 = k / slices * h, d1 = (k + 1) / slices * h;
        const p0 = proj(d0), p1 = proj(d1), w = tw * (p0.sc + p1.sc) / 2;
        const sy = leaf.half === 'top' ? h - d1 : h + d0;
        const x = cx - w / 2, y = Math.min(p0.y, p1.y), span = Math.abs(p1.y - p0.y), hs = h / slices;
        // Each strip runs about a pixel past its share, under the next one, so no seam shows between them. It takes
        // that much more of the picture with it rather than stretching: stretched, every strip sat a little out of
        // step with the one below and the grain showed a line at each join.
        const edge = leaf.half === 'top' ? h : th;   // the picture's half ends here; a strip takes nothing from past it
        const more = span > 0 ? Math.max(0, Math.min(hs / span, hs, edge - (sy + hs))) : 0;
        g.drawImage(img, 0, sy, tw, hs + more, x, y, w, span * (hs + more) / hs);
      }
      // shading: the falling top leaf turns away from the light, the landing bottom leaf faces it. Laid over the whole
      // leaf in one piece: shaded strip by strip, the pixel where two strips overlap took it twice and showed as a line.
      const near = proj(0), far = proj(h);
      g.fillStyle = leaf.half === 'top' ? `rgba(0, 0, 0, ${cfg.topShade * sin})` : `rgba(255, 255, 255, ${cfg.bottomShine * sin})`;
      g.beginPath();
      g.moveTo(cx - tw * near.sc / 2, near.y); g.lineTo(cx + tw * near.sc / 2, near.y);
      g.lineTo(cx + tw * far.sc / 2, far.y); g.lineTo(cx - tw * far.sc / 2, far.y);
      g.closePath();
      g.fill();
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
        const st = stateAt(m, t), up = liftAt(m, t), key = st.top + st.bottom + (up !== 0 ? up.toFixed(3) : '');
        if (m.drawn === key) return;
        // A resting module under the cursor. Its lower flap swings up, showing the lower half of the leaf before it on
        // the drum; or its upper flap swings forward, showing the upper half of the leaf after it.
        const at = cfg.chars.indexOf(st.top), len = cfg.chars.length;
        if (up > 0) {
          const n = m.seq.length - 1;
          const behind = n > 0 ? m.seq[n - 1] : cfg.chars[(at - 1 + len) % len];
          drawState(m.ctx, { top: st.top, bottom: behind, leaf: { half: 'bottom', ch: st.bottom, deg: cfg.liftDeg * up } });
        } else if (up < 0) {
          drawState(m.ctx, { top: cfg.chars[(at + 1) % len], bottom: st.bottom, leaf: { half: 'top', ch: st.top, deg: cfg.liftDeg * -up } });
        } else drawState(m.ctx, st);
        m.drawn = key;
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

    // how far a module's flap is lifted at time t: 0 to 1 for the lower flap, 0 to -1 for the upper
    function liftAt(m, t) {
      const l = m.lift;
      if (!l) return 0;
      const u = cfg.liftMs > 0 ? Math.min(Math.max((t - l.t0) / cfg.liftMs, 0), 1) : 1;
      return l.from + (l.to - l.from) * (1 - (1 - u) ** 3);
    }
    // Lift one module's flap (index as in spinCell) and let every other one drop; null drops all. half is 'top' or
    // 'bottom', the flap to lift, and amount is how far, from 0 (resting) to 1 (liftDeg). Calling again for the same
    // module moves its flap to the new amount, through rest if the other flap is asked for.
    // Returns the time the motion ends, so the caller knows how long to keep seeking.
    function hover(index, t, { half = 'bottom', amount = 1 } = {}) {
      const on = index === null || index === undefined ? null : mods.at(index);
      const want = Math.min(Math.max(amount, 0), 1) * (half === 'top' ? -1 : 1);
      mods.forEach(m => {
        const to = m === on ? want : 0;
        if ((m.lift ? m.lift.to : 0) !== to) m.lift = { from: liftAt(m, t), to, t0: t };
      });
      return t + cfg.liftMs;
    }

    function seek(t) { time = t; mods.forEach(m => drawModule(m, t)); }

    // spin from whatever the board shows now to a new message, starting at time t0. Every module
    // runs forward around the drum to its new letter, so the board keeps its size. speed 2 flips
    // twice as fast.
    function spinTo(lines, t0, options) {
      const margin = Array.from({ length: cfg.padY }, () => blanks(grid.cols));
      const targets = [...margin, ...layoutMessage(compose(lines, cfg)), ...margin].flat();
      mods.forEach((m, i) => spinModule(m, targets[i], t0, options));
      duration = Math.max(...mods.map(m => flapEnd(m, cfg))) + cfg.shutterMs;
    }

    // spin one module (counted left to right, top to bottom; negative counts from the end)
    function spinCell(index, ch, t0, options) {
      spinModule(mods.at(index), ch, t0, options);
      duration = Math.max(...mods.map(m => flapEnd(m, cfg))) + cfg.shutterMs;
    }

    // flips: an exact count (the drum's length is one full turn back to the same letter). delay: ms before it starts.
    function spinModule(m, target, t0, { speed = 1, flips: exact, delay } = {}) {
      const chars = cfg.chars, len = chars.length, random = Math.random;
      const minFlips = Math.min(cfg.minFlips, cfg.maxFlips), maxFlips = Math.max(cfg.minFlips, cfg.maxFlips);
      const to = Math.max(chars.indexOf(target), 0);
      // the first flip lands on a random letter and the spin runs on from there, so neighbours
      // that showed the same thing don't march through the drum together
      const flips = exact || minFlips + Math.floor(random() * (maxFlips - minFlips + 1));
      const at = i => chars[(i % len + len) % len];
      m.seq = [m.target, ...Array.from({ length: flips }, (_, k) => at(to - flips + 1 + k))];
      m.target = target;
      m.flipMs = cfg.flipMs / speed * (0.8 + random() * 0.4);   // each module keeps its own pace
      m.start = t0 + (delay ?? (cfg.startMs + random() * cfg.staggerMs) / speed);
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

    /* ---- Hologram: the letters as light in front of the flaps ----
       Each row carries a canvas a little larger than itself, laid over its modules, so the projection moves, folds and
       fades with its row. It runs on its own clock (the page only seeks the board while it spins), drawing what each
       module shows at the board's playhead: faint and unsteady while the flaps spin, then at full strength the moment
       its last flap lands, held with a slight flicker. Red and cyan copies at the edges, a bloom and scanlines make it
       read as light. Each letter sits still, centred on its tile. */
    let holoRows = [], sprites = {}, holoRaf = 0, inView = true, margin = 0;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lightBoard = () => { const h = (cfg.tileBottom || '#000').replace('#', ''), v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
      return ((v >> 16 & 255) * 0.299 + (v >> 8 & 255) * 0.587 + (v & 255) * 0.114) / 255 > 0.5; };
    // a board of light flaps can't take added light: there the projection is laid on as colour

    function holoSetup() {
      holoRows.forEach(h => { h.canvas.remove(); h.shade.remove(); });
      holoRows = []; sprites = {};
      if (!(cfg.holo > 0)) { holoStop(); return; }
      [...board.querySelectorAll('.sf-row')].forEach((row, r) => {
        row.style.position = 'relative';
        const layer = (name, z, blend) => {
          const c = document.createElement('canvas');
          c.className = name;
          Object.assign(c.style, { position: 'absolute', pointerEvents: 'none', zIndex: z, mixBlendMode: blend });
          row.appendChild(c);
          return c;
        };
        // the shadow is laid on as plain colour; the light over it is added, on a dark board
        const shade = layer('sf-holo-shade', 2, 'normal'), canvas = layer('sf-holo', 3, lightBoard() ? 'normal' : 'screen');
        holoRows.push({ row, canvas, ctx: canvas.getContext('2d'), shade, sctx: shade.getContext('2d'), mods: mods.filter(m => m.row === r) });
      });
      holoStart();
    }

    // where each letter's light sits, in its row canvas's device pixels
    function holoPlace() {
      if (!holoRows.length || !tw) return;
      const dpr = window.devicePixelRatio || 1;
      margin = Math.ceil(tw / dpr * 0.6 + 4);
      sprites = {};
      holoRows.forEach(h => {
        const w = h.row.clientWidth + 2 * margin, ht = h.row.clientHeight + 2 * margin;
        [h.canvas, h.shade].forEach(c => {
          Object.assign(c.style, { left: -margin + 'px', top: -margin + 'px', width: w + 'px', height: ht + 'px' });
          c.width = Math.round(w * dpr); c.height = Math.round(ht * dpr);
        });
        h.mods.forEach(m => {
          m.hx = (m.el.offsetLeft + margin) * dpr + insetX + tw / 2;
          m.hy = (m.el.offsetTop + margin) * dpr + insetY + th / 2;
        });
      });
    }

    // one letter in light: the core with its bloom, and the red and cyan copies for the fringe
    function sprite(ch) {
      if (sprites[ch]) return sprites[ch];
      const sw = Math.ceil(tw * 1.6), sh = Math.ceil(th * 1.3), ox = (sw - tw) / 2, oy = (sh - th) / 2;
      const make = (color, bloom, soft = 0) => {
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        const g = c.getContext('2d');
        if (soft > 0) g.filter = `blur(${soft}px)`;
        if (bloom > 0) { g.shadowColor = color; g.shadowBlur = bloom * tw * 0.35; paintGlyph(g, ch, color, ox, oy); g.shadowBlur = 0; }
        paintGlyph(g, ch, color, ox, oy);
        return c;
      };
      const light = lightBoard();
      return (sprites[ch] = { sw, sh, core: make(cfg.holoColor, cfg.holoBloom), red: light ? null : make('#ff3d64', 0), cyan: light ? null : make('#3de4ff', 0),
        shade: make(cfg.holoShadowColor, 0, Math.max(0, cfg.holoShadowBlur * tw)) });
    }

    let scan = null;
    function scanPattern(g, dpr) {
      const gap = Math.max(2, Math.round(cfg.holoScanGap * dpr)), key = gap;
      if (!scan || scan.key !== key) {
        const c = document.createElement('canvas'); c.width = 1; c.height = gap;
        const sg = c.getContext('2d'); sg.fillStyle = '#000'; sg.fillRect(0, 0, 1, Math.max(1, Math.round(gap / 3)));
        scan = { key, gap, pattern: null, canvas: c };
      }
      return scan;
    }

    // a steady hash, so a letter's flicker is the same however often it is drawn within one beat
    const hash = n => { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return ((n ^ n >>> 16) >>> 0) / 4294967296; };

    function holoFrame(now) {
      holoRaf = 0;
      if (!holoRows.length || !fontReady) { holoStart(); return; }
      const dpr = window.devicePixelRatio || 1, still = reduced(), light = lightBoard();
      const beat = Math.floor(now / 70);
      holoRows.forEach((h, r) => {
        const g = h.ctx, sg = h.sctx;
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, h.canvas.width, h.canvas.height);
        sg.globalAlpha = 1; sg.clearRect(0, 0, h.shade.width, h.shade.height);
        const sdx = cfg.holoShadowX * tw, sdy = cfg.holoShadowY * tw;
        g.globalCompositeOperation = light ? 'source-over' : 'lighter';
        h.mods.forEach((m, i) => {
          const st = stateAt(m, time), spinning = time >= m.start && time < flapEnd(m, cfg);
          const ch = st.top;
          let a = spinning ? cfg.holoSpin : 1;
          if (ch === ' ') return;
          if (!still && cfg.holoFlicker > 0) { const k = hash(beat * 7919 + r * 613 + i * 97); a *= 1 - cfg.holoFlicker * (k < 0.05 ? 0.75 : k * 0.18); }
          a *= Math.min(1, cfg.holo);
          const sp = sprite(ch), x = m.hx - sp.sw / 2, y = m.hy - sp.sh / 2;
          if (cfg.holoShadow > 0) {   // the shadow: its own colour and opacity, steady while the light flickers
            sg.globalAlpha = Math.min(1, cfg.holoShadow * Math.min(1, cfg.holo) * (spinning ? cfg.holoSpin : 1));
            sg.drawImage(sp.shade, x + sdx, y + sdy);
          }
          const f = cfg.holoFringe * dpr;
          if (f > 0 && sp.red) { g.globalAlpha = a * 0.55; g.drawImage(sp.red, x - f, y); g.drawImage(sp.cyan, x + f, y); }
          g.globalAlpha = a;
          g.drawImage(sp.core, x, y);
        });
        if (cfg.holoScan > 0) {   // scanlines, drifting slowly down
          const sc = scanPattern(g, dpr);
          const pattern = g.createPattern(sc.canvas, 'repeat');
          pattern.setTransform(new DOMMatrix().translate(0, still ? 0 : (now * 0.02 * dpr) % sc.gap));
          g.globalCompositeOperation = 'destination-out';
          g.globalAlpha = Math.min(1, cfg.holoScan);
          g.fillStyle = pattern;
          g.fillRect(0, 0, h.canvas.width, h.canvas.height);
        }
      });
      holoStart();
    }
    function holoStart() { if (!holoRaf && holoRows.length && inView && !document.hidden) holoRaf = requestAnimationFrame(holoFrame); }
    function holoStop() { if (holoRaf) cancelAnimationFrame(holoRaf); holoRaf = 0; }
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; inView ? holoStart() : holoStop(); }).observe(board);
    document.addEventListener('visibilitychange', () => document.hidden ? holoStop() : holoStart());

    // change colours and shading in place, without rebuilding: whatever is mid-spin carries on
    function restyle(overrides) {
      const wasHolo = cfg.holo > 0;
      Object.assign(cfg, overrides);
      plateStyle();
      if (wasHolo !== cfg.holo > 0 || cfg.holo > 0) { holoSetup(); holoPlace(); }
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
      fontReady = true; tiles = {}; sprites = {};
      [...cfg.chars].forEach(tile);
      redraw();
    });

    return {
      seek,
      spinTo,
      spinCell,
      hover,                          // lift the upper or lower flap of the module under the cursor
      get chars() { return cfg.chars; },
      get count() { return mods.length; },
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
    'topShade', 'bottomShine', 'edgeLight', 'edgeMinDeg', 'edgeSize',
    'holo', 'holoColor', 'holoBloom', 'holoFringe', 'holoScan', 'holoScanGap', 'holoFlicker',
    'holoSpin', 'holoShadow', 'holoShadowColor', 'holoShadowX', 'holoShadowY', 'holoShadowBlur', 'holoSpill'];
  // warm, to sit on the light page's paper (#F5F3ED): a plate a shade darker than the page,
  // cream tiles and Rust letters (tried: Night, Navy, #1C374E), like an enamel station board in daylight
  const LIGHT = {
    frameColor: '#e6e1d5', wellColor: '#cdc5b5', frameDepth: 0.3, frameLip: 0.7, frameSheen: 0.25,
    tileTop: '#fffdf7', tileBottom: '#f0ebe0', glyphColor: '#9F4933', slotColor: '#b3aa98',
    edgeLight: 0.55, grain: 0.035,
    holo: 0,   // the hologram is a dark board's; a light board has it only from a light version
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

  window.SplitFlap = { DEFAULTS, EASES, STYLE_KEYS, LIGHT, resolveEase, flapState, flapEnd, mount, compose,
    activeConfig, activeStyle, resolveConfig };
})();
