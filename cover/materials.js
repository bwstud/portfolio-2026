// What the front page's plate is covered in. The cover (index.html) draws the figure; this file holds the
// materials it can draw it with, and the Controls menu, bottom left, that switches between them.
//
// Two kinds:
//   - grains: the plate's own simulation (sand, salt, iron filings). Each is a look and a few numbers for the physics.
//   - field: no grains. A shader draws the figure straight from the plate's maths, so it can be a vapour, a liquid,
//     a cloth, light. Each is the body of a GLSL function, vec3 shade(vec2 q, vec2 px): q is the point on the plate
//     (after the cursor and the pulses have pushed it about), px the point on the screen. plate(q) gives the plate's
//     movement there and its slope; line(r) the distance in px to the nearest still line, where sand would lie.
//
// To add one: add an entry to LIST. The choice is kept in the browser; ?material=<id> picks one for a screenshot.
(() => {
  // the figure, the same sum the cover's simulation uses: x is how far the plate moves, yz its slope per px
  const PLATE = `
    uniform vec2 uRes; uniform float uS, uW; uniform vec3 uA, uB;
    const float PI = 3.14159265;
    vec3 fig(vec3 f, vec2 p) {
      float a = f.x * PI, b = f.y * PI;
      float cax = cos(a * p.x), cby = cos(b * p.y), cbx = cos(b * p.x), cay = cos(a * p.y);
      float sax = sin(a * p.x), sby = sin(b * p.y), sbx = sin(b * p.x), say = sin(a * p.y);
      return vec3(cax * cby + f.z * cbx * cay, -a * sax * cby - f.z * b * sbx * cay, -b * cax * sby - f.z * a * cbx * say);
    }
    vec3 plate(vec2 px) {
      vec2 p = ((px - 0.5 * uRes) / uS + 1.0) * 0.5;
      vec3 r = mix(fig(uA, p), fig(uB, p), uW);
      return vec3(r.x, r.yz * (0.5 / uS));
    }`;

  const FIELD_HEAD = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    ${PLATE}
    uniform float uDpr, uTime, uDim, uFade, uGather;
    uniform vec4 uRect; uniform vec3 uMouse; uniform vec2 uKey; uniform vec4 uPulse[4];
    uniform sampler2D uStir; uniform vec3 uStirSize;               // the air the cursor has stirred: how far it has carried each point, and the size of that map in px (z: in use)
    float line(vec3 r) { return abs(r.x) / (length(r.yz) + 0.0015); }
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }
    vec2 drift(vec2 q, float scale, float speed, float seed) {      // a slow wander, -0.5 to 0.5 each way
      return vec2(fbm(q * scale + vec2(uTime * speed, seed)), fbm(q * scale + vec2(seed * 1.7 + 4.0, -uTime * speed * 0.9))) - 0.5;
    }
    // the cursor parts it, and a press sends a ring through it
    vec2 warp(vec2 q) {
      if (uStirSize.z > 0.5) q -= (texture2D(uStir, q / uStirSize.xy).rg - 128.0 / 255.0) * (255.0 / 127.0 * 150.0);   // carried along in the cursor's wake
      if (uMouse.z > 0.5) { vec2 d = q - uMouse.xy; float l = length(d) + 0.001, f = max(0.0, 1.0 - l / 170.0); q -= d / l * f * f * 70.0; }
      for (int i = 0; i < 4; i++) {
        vec4 P = uPulse[i];
        if (P.w > 0.0) { vec2 d = q - P.xy; float l = length(d) + 0.001, s = (l - P.z) / 90.0; if (abs(s) < 1.0) q -= d / l * P.w * (1.0 - s * s) * 26.0; }
      }
      return q;
    }`;
  const FIELD_MAIN = `
    void main() {
      vec2 px = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
      vec2 q = px; float m = 1.0;
      if (uGather > 0.001) {                                        // Recent Work under the pointer: the whole plate is drawn in under the key
        q = uKey + (px - uKey) / max(1.0 - uGather, 0.002);
        vec2 e = min(q, uRes - q); m = smoothstep(0.0, 60.0, min(e.x, e.y));
      }
      vec3 col = max(shade(warp(q), px), 0.0) * m;
      float d = max(max(uRect.x - px.x, px.x - uRect.z), max(uRect.y - px.y, px.y - uRect.w));   // it goes quiet behind the sentence
      col *= mix(1.0 - QUIET * uDim, 1.0, smoothstep(-10.0, 100.0, d)) * uFade;
      gl_FragColor = vec4(vec3(4.0, 10.0, 19.0) / 255.0 + col, 1.0);
    }`;

  const LIST = [
    // ---- grains ---------------------------------------------------------------------------------
    // per: one grain for this many square px. size: [smallest, extra] in px. shape: 0 round, 1 square crystal, 2 sliver.
    // wander: how much the plate tosses them. pull: how hard the slope moves them. tints: two body colours and a rare third.
    { id: 'sand', name: 'Sand', grains: { per: 11, size: [1.2, 1.3], shape: 0, wander: 1, pull: 1,
      tints: [[0.78, 0.718, 0.6], [0.855, 0.894, 0.89], [0.875, 0.753, 0.424]] } },
    { id: 'iron', name: 'Iron filings', grains: { per: 12, size: [2.4, 2.2], shape: 2, wander: 0.7, pull: 0.85,
      tints: [[0.27, 0.285, 0.31], [0.4, 0.42, 0.46], [0.68, 0.7, 0.75]] } },

    // ---- fields ---------------------------------------------------------------------------------
    // dpr: the most device pixels per px it is drawn at (soft ones don't need a sharp screen's full count).
    // quiet: how far it dims behind the sentence.
    // stir: the cursor drags the material along and leaves curling eddies behind it, as it does to the halftone bands
    //   (Halftone.stir, with these settings), in place of simply parting it.
    { id: 'vapor', name: 'Vapor', field: { dpr: 1.5, quiet: 0.8, stir: { cursorRadius: 64, cursorForce: 0.75, cursorSwirl: 1.3, cursorDrag: 1.3, cursorHeal: 3.2 }, body: `
      // three sheets of mist at different depths, hanging along the still lines. A slow swirl carries each one and
      // feeds smaller, quicker eddies, which tear it into thin strands; stray tendrils trail off the lines
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 a = drift(q, 0.0035, 0.09, fi * 7.0);
        vec2 b = drift(q + a * 240.0, 0.011, 0.17, fi * 3.0 + 2.0);
        vec2 w = q + a * (38.0 + 36.0 * fi) + b * (30.0 + 16.0 * fi);
        float d = line(plate(w)), wid = 10.0 + 20.0 * fi;
        float n = fbm(w * 0.014 + b * 2.2 + vec2(-uTime * 0.13, uTime * 0.06 + fi * 5.0));
        float strand = 1.0 - abs(2.0 * n - 1.0); strand *= strand * strand;
        float dens = exp(-d * d / (wid * wid)) * (0.04 + 1.5 * strand) + exp(-d / (wid * 3.0)) * strand * strand * 0.4;
        acc += mix(vec3(0.76, 0.84, 0.92), vec3(0.4, 0.5, 0.68), fi * 0.5) * dens * (0.4 - 0.1 * fi);
      }
      return acc;` } },
    { id: 'filaments', name: 'Luminous filaments', field: { dpr: 2, quiet: 0.85, body: `
      // four strands that wander a little apart along each still line: white-hot cores in a violet haze
      float core = 0.0, glow = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 w = q + (vec2(noise(q * 0.006 + vec2(uTime * 0.25, fi * 9.0)), noise(q * 0.006 + vec2(fi * 4.0, -uTime * 0.22))) - 0.5) * (14.0 + 15.0 * fi);
        float d = line(plate(w));
        float flick = 0.55 + 0.45 * noise(vec2((w.x + w.y) * 0.012, uTime * 1.4 + fi * 3.0));
        core += flick / (1.0 + d * d * 0.8);
        glow += flick / (1.0 + d * d * 0.003);
      }
      return vec3(0.5, 0.3, 1.0) * glow * 0.1 + vec3(0.85, 0.7, 1.0) * core * 0.34 + vec3(1.0) * core * core * 0.1;` } },
    { id: 'rays', name: 'Light rays', field: { dpr: 1, quiet: 0.8, body: `
      // the still lines are slits in the plate with a lamp behind it, above the page: shafts of light fan out through them
      vec2 lamp = vec2(0.5 * uRes.x, -0.45 * uRes.y);
      float jit = hash(px + fract(uTime) * 61.0), acc = 0.0;
      for (int i = 0; i < 22; i++) {
        float s = (float(i) + jit) / 22.0;
        float d = line(plate(mix(q, lamp, s * 0.42)));
        acc += exp(-d * d / 30.0) * (1.0 - s);
      }
      float d0 = line(plate(q));
      float dust = 0.75 + 0.5 * fbm(q * 0.006 + vec2(uTime * 0.03, uTime * 0.05));
      return vec3(0.62, 0.72, 0.95) * acc * 0.14 * dust + vec3(0.95, 0.97, 1.0) * exp(-d0 * d0 / 5.0) * 0.9;` } },
    { id: 'sliced', name: 'Sliced waves', field: { dpr: 2, quiet: 0.88, body: `
      // the figure seen through upright slats: each slat shows the plate at its own middle, in flat bands of colour
      float P = 30.0, bx = (floor(q.x / P) + 0.5) * P, fx = abs(q.x - bx) / P;
      float v = abs(plate(vec2(bx, q.y) + drift(vec2(bx, q.y), 0.003, 0.05, 5.0) * 60.0).x);
      vec3 col = v < 0.4 ? vec3(0.0) : v < 0.75 ? vec3(0.32, 0.36, 0.95) : v < 1.1 ? vec3(0.95, 0.24, 0.55) : v < 1.45 ? vec3(1.0, 0.62, 0.36) : vec3(1.0, 0.92, 0.84);
      return col * (smoothstep(0.36, 0.3, fx) + 0.16);` } },
    { id: 'fibers', name: 'Ghost fibers', field: { dpr: 2, quiet: 0.85, body: `
      // a veil of beads: small and faint over the moving plate, swelling and lighting along the still lines
      float P = 11.0;
      vec2 g = q / P; float row = floor(g.y); g.x += 0.5 * mod(row, 2.0);
      vec2 cell = floor(g), c = (cell + 0.5) * P; c.x -= 0.5 * mod(row, 2.0) * P;
      vec2 wob = drift(c, 0.004, 0.06, 8.0) * 50.0;
      float dc = line(plate(c + wob)), near = exp(-dc * dc / 1400.0);
      float rad = 0.7 + 3.4 * near;
      float bead = smoothstep(rad, rad - 1.2, length(q - c));
      float d = line(plate(q + wob));
      return vec3(0.58, 0.48, 1.0) * bead * (0.16 + 0.95 * near) + vec3(0.5, 0.36, 1.0) * exp(-d * d / 260.0) * 0.3;` } },
    { id: 'mesh', name: 'Line mesh', field: { dpr: 2, quiet: 0.88, body: `
      // level lines ruled across the plate and lifted by its movement, so the figure reads as a wire surface.
      // Where the surface turns away the lines crowd together and glow
      vec2 w = q + drift(q, 0.003, 0.04, 4.0) * 40.0;
      vec3 r = plate(w);
      float SP = 7.0, A = 24.0;
      float s = (q.y + A * r.x) / SP, crowd = length(vec2(A * r.y, 1.0 + A * r.z));
      float f = fract(s), dist = min(f, 1.0 - f) * SP / max(crowd, 0.05);
      float ln = mix(smoothstep(1.1, 0.25, dist), min(1.0, 1.3 * crowd / SP), smoothstep(2.0, 4.5, crowd));
      return vec3(0.92, 0.94, 1.0) * ln * (0.3 + 0.3 * min(crowd, 3.0));` } },
  ];

  const fragment = (m) => `${FIELD_HEAD}\n#define QUIET ${m.field.quiet.toFixed(3)}\nvec3 shade(vec2 q, vec2 px) {${m.field.body}\n}\n${FIELD_MAIN}`;

  // ---- the choice ---------------------------------------------------------------------------------
  const KEY = 'cover-material';
  const byId = (id) => LIST.find((m) => m.id === id);
  let current = LIST[0];
  try { current = byId(new URLSearchParams(location.search).get('material')) || byId(localStorage.getItem(KEY)) || LIST[0]; } catch (err) { /* sand */ }

  // ---- the Controls menu, bottom left: a Matte key that opens a list of the materials ---------------
  function menu(onPick) {
    const css = document.createElement('style');
    css.textContent = `
      .mats { position: fixed; left: 20px; bottom: 20px; z-index: 100; transition: opacity 200ms ease; }
      .is-leaving .mats { opacity: 0; pointer-events: none; }
      .is-lab .mats { display: none; }
      .mats .mats__toggle { height: 36px; margin-bottom: 0; padding: 0 14px; }
      .mats .mats__toggle[aria-expanded="true"] { color: var(--m-print-hi); }
      .mats__caret { width: 8px; height: 8px; border: solid currentColor; border-width: 1px 1px 0 0; transform: translateY(2px) rotate(-45deg); transition: transform 150ms; }
      .mats__toggle[aria-expanded="true"] .mats__caret { transform: translateY(-2px) rotate(135deg); }
      .mats .mats__menu { position: absolute; left: 0; bottom: calc(100% + 8px); display: flex; min-width: 220px; max-height: calc(100vh - 100px); overflow-y: auto; margin: 0; list-style: none;
        opacity: 0; transform: translateY(6px); visibility: hidden; transition: opacity 150ms, transform 150ms cubic-bezier(0.23, 1, 0.32, 1), visibility 0s 150ms; }
      .mats.is-open .mats__menu { opacity: 1; transform: none; visibility: visible; transition-delay: 0s; }
      .mats .mats__menu li { display: block; }
      .mats .mats__menu li.m-seam { flex: none; }
      .mats .mats__head { padding: 8px 10px 6px; }
      .mats .mats__menu button { appearance: none; border: 0; background: none; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; cursor: pointer; white-space: nowrap; padding: 8px 10px; }
      .mats .mats__menu button::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; }
      .mats .mats__menu button[aria-checked="true"] { color: var(--m-print-hi); }
      .mats .mats__menu button[aria-checked="true"]::before { background: var(--m-signal); box-shadow: 0 0 5px color-mix(in srgb, var(--m-signal) 60%, transparent); }
      @media (max-width: 600px), (max-height: 520px) {
        .mats { top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left)); bottom: auto; }
        .mats__caret { transform: translateY(-2px) rotate(135deg); }
        .mats__toggle[aria-expanded="true"] .mats__caret { transform: translateY(2px) rotate(-45deg); }
        .mats .mats__menu { top: calc(100% + 8px); bottom: auto; transform: translateY(-6px); }
      }
      @media (prefers-reduced-motion: reduce) { .mats__menu, .mats__caret { transition: none; } }`;
    document.head.append(css);

    const firstField = LIST.findIndex((m) => m.field);
    const nav = document.createElement('nav');
    nav.className = 'mats matte matte--dark';
    nav.setAttribute('aria-label', 'Plate controls: material');
    nav.innerHTML = `
      <ul class="mats__menu m-panel m-panel--col m-menu" id="mats-menu" role="radiogroup" aria-label="Material">
        <li class="mats__head m-legend m-legend--dim" role="presentation">Material</li>
        ${LIST.map((m, i) => `${i === firstField ? '<li class="m-seam" role="presentation"></li>' : ''}<li role="presentation"><button class="m-menu__item" type="button" role="radio" data-id="${m.id}" aria-checked="${m === current}">${m.name}</button></li>`).join('')}
      </ul>
      <button class="mats__toggle m-key" type="button" aria-expanded="false" aria-controls="mats-menu">Controls<span class="mats__caret" aria-hidden="true"></span></button>`;
    document.body.append(nav);

    const toggle = nav.querySelector('.mats__toggle');
    const set = (open) => { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', open); };
    toggle.addEventListener('click', () => set(!nav.classList.contains('is-open')));
    addEventListener('pointerdown', (e) => { if (!nav.contains(e.target)) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    nav.querySelector('.mats__menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      current = byId(b.dataset.id);
      nav.querySelectorAll('[data-id]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      try { localStorage.setItem(KEY, current.id); } catch (err) { /* it just won't be remembered */ }
      onPick(current);
    });
    if (new URLSearchParams(location.search).has('controls')) set(true);   // ?controls opens it on load, for screenshots
    return nav;
  }

  window.CoverMaterials = { LIST, PLATE, fragment, menu, get current() { return current; } };
})();
