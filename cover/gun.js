// A cursor: a toy revolver. Not in use on any page at the moment (it was tried on the cover); kept to use elsewhere. Press, and a rod shoots out of the barrel and a flag reading BANG drops from it;
// it stays out while the button is held (and for a beat at least), then snaps back in.
// The tip of the barrel is the pointer's hot spot. Over the plate only: on the keys, the panel and the menus the
// ordinary pointer comes back. Mouse only; a finger has no cursor to replace.
//
// Usage: <script src="cover/gun.js" data-over="#plate"></script> (the address from the site root).
// data-over: a selector for the element the gun is the cursor for; without it, the page's first canvas.
(() => {
  const over = document.querySelector(document.currentScript?.dataset.over || 'canvas');
  if (!over) return;
  const W = 132, VIEW = [220, 120], TIP = [80, 34];              // drawn size in px; the drawing's own units; where the barrel ends in them
  const scale = W / VIEW[0], HOLD = 850;                         // ms the flag stays out at least

  // the white burst behind the word: a ring of spikes
  const burst = Array.from({ length: 28 }, (_, i) => {
    const a = i / 28 * Math.PI * 2, r = i % 2 ? 0.62 : 1;
    return `${(51 + Math.cos(a) * 24 * r).toFixed(1)},${(63 + Math.sin(a) * 19 * r).toFixed(1)}`;
  }).join(' ');

  const css = document.createElement('style');
  css.textContent = `
    .has-gun .gun-over { cursor: none !important; }
    .gun { position: fixed; left: 0; top: 0; z-index: 200; width: ${W}px; pointer-events: none; opacity: 0; will-change: transform; }
    .gun.is-on { opacity: 1; }
    .gun svg { display: block; width: 100%; height: auto; overflow: visible; transform-origin: 78% 62%; }
    .gun .ink { stroke: #131d26; stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
    .gun .steel { fill: #6689a3; } .gun .shade { fill: #486a83; } .gun .dark { fill: #2c4354; }
    .gun .line { fill: none; stroke: #131d26; stroke-width: 1.5; stroke-linecap: round; }
    .gun__rod, .gun__flag { transform-box: view-box; transform-origin: ${TIP[0]}px ${TIP[1]}px; }
    .gun__rod { transform: scaleX(0); transition: transform 110ms cubic-bezier(0.3, 0, 0.8, 0.4) 60ms; }
    .gun__flag { transform: scaleY(0); transition: transform 90ms ease-in; }
    .gun.is-bang .gun__rod { transform: none; transition: transform 90ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
    .gun.is-bang .gun__flag { transform: none; transition: transform 300ms cubic-bezier(0.3, 1.7, 0.5, 1) 70ms; }
    .gun.is-bang svg { animation: gun-kick 280ms cubic-bezier(0.2, 0.8, 0.3, 1); }
    @keyframes gun-kick { 0% { transform: none; } 22% { transform: rotate(9deg) translateX(3px); } 100% { transform: none; } }
    @media (prefers-reduced-motion: reduce) { .gun__rod, .gun__flag, .gun.is-bang .gun__rod, .gun.is-bang .gun__flag { transition: none; } .gun.is-bang svg { animation: none; } }`;
  document.head.append(css);

  const gun = document.createElement('div');
  gun.className = 'gun'; gun.setAttribute('aria-hidden', 'true');
  gun.innerHTML = `
    <svg viewBox="0 0 ${VIEW[0]} ${VIEW[1]}">
      <g class="gun__rod">
        <path class="ink" fill="none" d="M80 34H21"/>
        <circle class="ink dark" cx="19" cy="34" r="2.6"/>
        <g class="gun__flag">
          <path class="ink" fill="#d8566b" d="M23 34h56v55q-14 4-28 0t-28 1z"/>
          <polygon fill="#fff" stroke="#131d26" stroke-width="1.2" stroke-linejoin="round" points="${burst}"/>
          <text x="51" y="68.5" text-anchor="middle" font-family="Arial Black, Impact, system-ui, sans-serif" font-weight="900" font-size="14" letter-spacing="-0.4" fill="#22394b" stroke="#fff" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">BANG</text>
        </g>
      </g>
      <!-- barrel, with its front sight and the rib along the top -->
      <path class="ink steel" d="M80 29h58v12H80z"/>
      <path class="ink shade" d="M84 29l2-6h5l1 6z"/>
      <path class="ink shade" d="M92 24h46v5H92z"/>
      <!-- frame, top strap and hammer -->
      <path class="ink steel" d="M136 22h34l8 6 6 12-4 10h-30l-6 8h-10l-2-10V30z"/>
      <path class="ink shade" d="M172 20l9-6 5 3-4 9-6 2z"/>
      <!-- cylinder, with its flutes -->
      <path class="ink shade" d="M139 27h27q3 0 3 3v15q0 3-3 3h-27q-3 0-3-3V30q0-3 3-3z"/>
      <path class="line" d="M140 33h25M140 38h25M140 43h25"/>
      <!-- trigger guard and trigger -->
      <path class="ink" fill="none" d="M142 56q-2 17 11 17t15-15"/>
      <path class="ink dark" d="M155 56q-1 7-5 11l3 1q5-5 6-12z"/>
      <!-- grip, its plate, the screw and the lanyard ring -->
      <path class="ink steel" d="M166 48h18q7 6 10 20l8 30q1 5-4 6l-14 2q-5 0-6-5l-6-28q-2-9-8-13z"/>
      <path class="ink shade" d="M178 56q6 2 9 14l6 24q0 3-3 3l-7 1q-3 0-4-3l-5-24q-1-7-4-11z"/>
      <circle class="ink dark" cx="186" cy="80" r="2"/>
      <circle class="ink" fill="none" cx="195" cy="112" r="4"/>
    </svg>`;
  document.body.append(gun);
  over.classList.add('gun-over');

  let downAt = 0, held = false, timer = 0;
  const at = (e) => { gun.style.transform = `translate(${(e.clientX - TIP[0] * scale).toFixed(1)}px, ${(e.clientY - TIP[1] * scale).toFixed(1)}px)`; };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    document.documentElement.classList.add('has-gun');
    at(e);
    gun.classList.toggle('is-on', e.target === over || held);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => gun.classList.remove('is-on'));
  const retract = () => { clearTimeout(timer); timer = setTimeout(() => gun.classList.remove('is-bang'), Math.max(0, HOLD - (performance.now() - downAt))); };
  over.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    at(e); clearTimeout(timer);
    gun.classList.remove('is-bang'); void gun.offsetWidth;        // a second shot while the flag is out fires again
    gun.classList.add('is-on', 'is-bang');
    downAt = performance.now(); held = true;
  });
  const up = () => { if (held) { held = false; retract(); } };
  addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', up);

  // ?gun=x,y shows it at a point, and &bang with the flag out, for screenshots
  const q = new URLSearchParams(location.search), g = (q.get('gun') || '').split(',').map(Number);
  if (g.length === 2) { at({ clientX: g[0], clientY: g[1] }); gun.classList.add('is-on'); gun.classList.toggle('is-bang', q.has('bang')); }
})();
