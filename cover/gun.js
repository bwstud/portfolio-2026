// A cursor: a toy revolver. Used on the bio page, over the photo switches and the resume key (it was tried on the cover first). Press, and a rod shoots out of the barrel and a flag reading BANG drops from it;
// it stays out while the button is held (and for a beat at least), then snaps back in.
// The tip of the barrel is the pointer's hot spot. Over the chosen elements only: anywhere else the ordinary pointer
// comes back. Mouse only; a finger has no cursor to replace.
//
// Usage: <script src="cover/gun.js" data-over="#plate"></script> (the address from the site root).
// data-over: a selector for the elements the gun is the cursor for (it may match several); without it, the page's first canvas.
(() => {
  const sel = document.currentScript?.dataset.over || 'canvas', overs = [...document.querySelectorAll(sel)];
  if (!overs.length) return;
  const inside = (t) => overs.some((o) => o.contains(t));
  const W = 96, VIEW = [220, 120], TIP = [80, 34];              // drawn size in px; the drawing's own units; where the barrel ends in them
  const scale = W / VIEW[0], HOLD = 850;                         // ms the flag stays out at least

  // the white burst behind the word: a ring of spikes
  const burst = Array.from({ length: 28 }, (_, i) => {
    const a = i / 28 * Math.PI * 2, r = i % 2 ? 0.62 : 1;
    return `${(46 + Math.cos(a) * 29 * r).toFixed(1)},${(66 + Math.sin(a) * 22 * r).toFixed(1)}`;
  }).join(' ');

  const css = document.createElement('style');
  css.textContent = `
    .has-gun .gun-over, .has-gun .gun-over * { cursor: none !important; }
    .gun { position: fixed; left: 0; top: 0; z-index: 200; width: ${W}px; pointer-events: none; opacity: 0; will-change: transform; }
    .gun.is-on { opacity: 1; }
    .gun svg { display: block; width: 100%; height: auto; overflow: visible; transform-origin: 78% 62%; }
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
      <!-- flat, two-tone, after a poster revolver: one charcoal silhouette, its details cut out in cream, and a cream
           edge around the whole of it so it reads on the dark page as well as the light one -->
      <defs>
        <g id="gun-sil">
          <path d="M82 29h60v11H82q-2 0-2-2v-7q0-2 2-2z"/>                         <!-- barrel -->
          <path d="M84 29l1.5-5h5l1.5 5z"/>                                         <!-- front sight -->
          <path d="M98 40h40v4H100q-2 0-2-2z"/>                                     <!-- ejector housing -->
          <path d="M134 23h40l6 7 4 12-2 8h-46l-2-6z"/>                             <!-- frame -->
          <path d="M173 25l7-8q3-2 5 0l0 3-6 7z"/>                                <!-- hammer -->
          <path d="M168 46h20q6 8 9 22l7 30q1 6-5 7l-13 2q-6 1-7-5l-5-28q-2-12-8-18z"/>   <!-- grip -->
          <path d="M142 49Q141 68 156 68Q171 68 173 50L168 50Q166 63 156 63Q146 63 147 49Z"/>  <!-- trigger guard -->
          <path d="M156 50q0 8-4 12l3 1q5-5 5-13z"/>                                <!-- trigger -->
          <path fill-rule="evenodd" d="M192 112a4 4 0 1 0 8 0a4 4 0 1 0-8 0zm2.4 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0z"/>  <!-- lanyard ring -->
        </g>
      </defs>
      <g class="gun__rod">
        <path d="M80 34H10" stroke="#f3ead8" stroke-width="5" stroke-linecap="round"/>
        <circle cx="8" cy="34" r="5" fill="#f3ead8"/>
        <path d="M80 34H10" stroke="#25292d" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="8" cy="34" r="3.2" fill="#25292d"/>
        <g class="gun__flag">
          <path d="M16 36h60v78l-30-14-30 14z" fill="#c8313f" stroke="#f3ead8" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke"/>
          <polygon fill="#fbf7ee" stroke="#25292d" stroke-width="1.4" stroke-linejoin="round" points="${burst}"/>
          <text x="46" y="71" text-anchor="middle" transform="rotate(-8 46 66)" font-family="Arial Black, Impact, system-ui, sans-serif" font-weight="900" font-style="italic" font-size="12.5" letter-spacing="-0.4" fill="#25292d">BANG!</text>
        </g>
      </g>
      <use href="#gun-sil" fill="#f3ead8" stroke="#f3ead8" stroke-width="5" stroke-linejoin="round"/>
      <use href="#gun-sil" fill="#25292d"/>
      <!-- the cut-out details -->
      <g fill="none" stroke="#f3ead8" stroke-width="1.6" stroke-linecap="round">
        <rect x="141" y="27.5" width="26" height="19" rx="4"/>
        <path d="M145 33h18M145 37h18M145 41h18"/>
        <path d="M104 34.5h32" stroke-width="1.2"/>
        <path d="M175 55q5 3 8 14l5 25" stroke-width="1.3"/>
      </g>
      <circle cx="184" cy="78" r="2" fill="#f3ead8"/>
    </svg>`;
  document.body.append(gun);
  overs.forEach((o) => o.classList.add('gun-over'));

  let downAt = 0, held = false, timer = 0;
  const at = (e) => { gun.style.transform = `translate(${(e.clientX - TIP[0] * scale).toFixed(1)}px, ${(e.clientY - TIP[1] * scale).toFixed(1)}px)`; };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    document.documentElement.classList.add('has-gun');
    at(e);
    gun.classList.toggle('is-on', inside(e.target) || held);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => gun.classList.remove('is-on'));
  const retract = () => { clearTimeout(timer); timer = setTimeout(() => gun.classList.remove('is-bang'), Math.max(0, HOLD - (performance.now() - downAt))); };
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !inside(e.target)) return;
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
