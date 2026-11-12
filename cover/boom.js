// The click sound for the front page (and the cover prototypes in lab/hook). Where you click decides which boom plays, so the
// same spot always sounds the same.
//
// The page is read like a target centred on the middle of the window, stretched to its shape:
//   - the bullseye plays the heaviest sound;
//   - an inner ring of four quarters plays the deep, short thuds;
//   - an outer ring of eight slices, out to the corners, plays the lighter and more tonal hits.
// Heavy in the middle, lighter and stranger towards the edges. Both covers' patterns are centred
// on the same point, so the sound map lines up with what's on screen.
//
// Usage: <script src="cover/boom.js"></script>, then boomOn(target, allow) to make clicks and taps on target play;
// allow(event) says whether a given press counts. boom(x, y) plays directly (window coordinates).
// On the prototypes in lab/, press Z to show or hide the map.
(() => {
  const CENTRE = 'rumble-super-low-shattering';
  const INNER = ['boom-low-sub-03', 'boom-thud-deep-low', 'boom-dark-ultra-low-short', 'boom-stone-slammer'];   // clockwise from the top right quarter
  const OUTER = ['boom-low-hit', 'boom-kick-hit', 'boom-electrical-gritty', 'boom-pulse-signal-suspense',      // clockwise from 12 o'clock
    'boom-dark-low-hit', 'boom-distant-hit', 'boom-piano-tonal-mysterious', 'boom-sustained-bass-tone'];
  const R_CENTRE = 0.16, R_INNER = 0.5;        // ring edges, as a share of the way from the middle to a corner
  const VOLUME = 0.7;

  const BASE = new URL('sounds/', document.currentScript.src);          // the sounds sit beside this script, wherever the page is
  const players = {};
  [CENTRE, ...INNER, ...OUTER].forEach((name) => { const a = new Audio(new URL(`${name}.mp3`, BASE)); a.preload = 'auto'; players[name] = a; });   // fetched up front so the first click isn't late

  // which sound lives at a point in the window
  function soundAt(x, y) {
    const nx = (x - innerWidth / 2) / (innerWidth / 2), ny = (y - innerHeight / 2) / (innerHeight / 2);
    const r = Math.hypot(nx, ny) / Math.SQRT2;                       // 0 in the middle, 1 at a corner
    const turn = ((Math.atan2(nx, -ny) / (Math.PI * 2)) + 1) % 1;    // 0 at 12 o'clock, clockwise to 1
    if (r < R_CENTRE) return CENTRE;
    if (r < R_INNER) return INNER[Math.floor(turn * 4) % 4];
    return OUTER[Math.floor(((turn + 1 / 16) % 1) * 8) % 8];         // slices centred on the clock positions
  }

  window.boom = (x, y) => {
    const names = Object.keys(players);
    const name = Number.isFinite(x) && Number.isFinite(y) ? soundAt(x, y) : names[Math.floor(Math.random() * names.length)];
    const a = players[name].cloneNode();       // a fresh copy each time, so quick clicks overlap instead of cutting off
    a.volume = VOLUME;
    a.play().catch(() => {});                  // the browser may refuse if this wasn't a real click
    return name;
  };

  // A mouse plays on the press. A finger plays as it lifts: phones only let a page start sound once a
  // tap has finished, and this also keeps a swipe or a pinch from setting one off.
  window.boomOn = (target, allow = () => true, capture = false) => {
    const downs = new Map();
    target.addEventListener('pointerdown', (e) => {
      if (!allow(e)) return;
      if (e.pointerType === 'mouse') { if (e.button === 0) window.boom(e.clientX, e.clientY); }
      else downs.set(e.pointerId, [e.clientX, e.clientY]);
    }, capture);
    target.addEventListener('pointerup', (e) => {
      const at = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (at && Math.hypot(e.clientX - at[0], e.clientY - at[1]) < 24) window.boom(at[0], at[1]);   // where the finger landed, same as the ripple
    }, capture);
    target.addEventListener('pointercancel', (e) => downs.delete(e.pointerId), capture);
  };

  // ---- Z: draw the map over the page ----------------------------------------------------------
  let map = null;
  function drawMap() {
    const w = innerWidth, h = innerHeight, rx = (w / 2) * Math.SQRT2, ry = (h / 2) * Math.SQRT2;
    const pt = (r, turn) => [w / 2 + Math.sin(turn * Math.PI * 2) * rx * r, h / 2 - Math.cos(turn * Math.PI * 2) * ry * r];
    const line = (r0, r1, turn) => { const [a, b] = pt(r0, turn), [c, d] = pt(r1, turn); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`; };
    const label = (r, turn, name) => { const [x, y] = pt(r, turn); return `<text x="${x}" y="${y}">${name.replace(/^(boom|rumble)-/, '').replace(/-/g, ' ')}</text>`; };
    let s = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${rx * R_CENTRE}" ry="${ry * R_CENTRE}"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${rx * R_INNER}" ry="${ry * R_INNER}"/>`;
    for (let i = 0; i < 4; i++) s += line(R_CENTRE, R_INNER, i / 4) + label((R_CENTRE + R_INNER) / 2, (i + 0.5) / 4, INNER[i]);
    for (let i = 0; i < 8; i++) s += line(R_INNER, 1.1, (i + 0.5) / 8) + label(0.62, i / 8, OUTER[i]);
    s += label(0, 0, CENTRE);
    map.setAttribute('viewBox', `0 0 ${w} ${h}`);
    map.innerHTML = s;
  }
  addEventListener('keydown', (e) => {
    if (!location.pathname.includes('/lab/') || e.key.toLowerCase() !== 'z' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
    if (map) { map.remove(); map = null; return; }
    map = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    map.setAttribute('aria-hidden', 'true');
    map.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:90;pointer-events:none;fill:none;stroke:#DFC06C;stroke-width:1;stroke-dasharray:4 5;' +
      'font:400 11px "Söhne Mono",ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;text-anchor:middle;dominant-baseline:middle';
    document.body.append(map);
    const css = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    drawMap();
    css.textContent = 'text{fill:#DFC06C;stroke:#040A13;stroke-width:4px;stroke-dasharray:none;paint-order:stroke}';
    map.prepend(css);
  });
  addEventListener('resize', () => { if (map) { const css = map.querySelector('style'); drawMap(); map.prepend(css); } });
  if (new URLSearchParams(location.search).has('zones')) addEventListener('load', () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })));   // for screenshots
})();
