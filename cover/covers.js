// Cover switcher: a small menu in the bottom right corner of every cover page.
// The front page (index.html, at the site root) is the Chladni cover; the others live in cover/.
// To add a cover: make a new page in cover/, load this script in it
// (<script src="covers.js"></script>), and add a line to COVERS. Addresses are from the site root.
(() => {
  const COVERS = [
    { file: '/', name: 'Chladni sand' },
    { file: '/cover/cymascope.html', name: 'Cymascope' },
  ];

  const matte = document.currentScript?.dataset.skin === 'matte';   // data-skin="matte" on the script tag: the page has matte.css, so use its key and menu
  const lab = document.currentScript?.dataset.lab, labName = document.currentScript?.dataset.labName || 'Lab';   // data-lab: a lab for this cover, listed under the covers
  const here = location.pathname.replace(/\/index\.html$/, '/');
  const css = document.createElement('style');
  const LAYOUT = `
    .covers { position: fixed; right: 20px; bottom: 20px; z-index: 100; }
    .covers__toggle { margin-left: auto; }
    .covers__caret { width: 8px; height: 8px; border: solid currentColor; border-width: 1px 1px 0 0; transform: translateY(2px) rotate(-45deg); transition: transform 150ms; }
    .covers__toggle[aria-expanded="true"] .covers__caret { transform: translateY(-2px) rotate(135deg); }
    .covers__menu { position: absolute; right: 0; bottom: calc(100% + 8px); min-width: 220px; margin: 0; list-style: none;
      opacity: 0; transform: translateY(6px); visibility: hidden; transition: opacity 150ms, transform 150ms cubic-bezier(0.23, 1, 0.32, 1), visibility 0s 150ms; }
    .covers.is-open .covers__menu { opacity: 1; transform: none; visibility: visible; transition-delay: 0s; }
    .covers__menu a { white-space: nowrap; }
    .covers__menu a::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; }
    .covers__menu a[aria-current="page"]::before { background: currentColor; }
    /* on a phone the bottom of the screen belongs to the controls and Recent Work: sit in the top corner and open downward */
    @media (max-width: 600px), (max-height: 520px) {
      .covers { top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); bottom: auto; }
      .covers__caret { transform: translateY(-2px) rotate(135deg); }
      .covers__toggle[aria-expanded="true"] .covers__caret { transform: translateY(2px) rotate(-45deg); }
      .covers__menu { top: calc(100% + 8px); bottom: auto; transform: translateY(-6px); }
    }
    @media (prefers-reduced-motion: reduce) { .covers__menu, .covers__caret { transition: none; } }
  `;
  const PLAIN = `
    .covers { font: 400 13px/1 "Söhne Mono", ui-monospace, Menlo, monospace; letter-spacing: .02em; }
    .covers__toggle, .covers__menu { background: rgba(4, 10, 19, .82); color: #DAE4E3; border: 1px solid rgba(218, 228, 227, .35);
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
    .covers__toggle { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 999px; font: inherit;
      letter-spacing: inherit; cursor: pointer; transition: border-color 150ms, background 150ms; }
    .covers__toggle:hover, .covers__toggle[aria-expanded="true"] { border-color: #DAE4E3; }
    .covers__toggle:focus-visible, .covers__menu a:focus-visible { outline: 2px solid #DFC06C; outline-offset: 2px; }
    .covers__menu { padding: 8px; border-radius: 12px; }
    .covers__menu a { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px; color: inherit; text-decoration: none; }
    .covers__menu a:hover { background: rgba(218, 228, 227, .1); }
    .covers__menu a[aria-current="page"] { color: #DFC06C; }
    .covers__num { margin-left: auto; opacity: .5; }
    .covers__rule { height: 1px; margin: 6px 0; background: rgba(218, 228, 227, .2); }
  `;
  // Matte: the toggle is an .m-key and the menu an .m-panel.m-menu, both from matte.css. Only what is particular to this menu is set here.
  const MATTE = `
    .covers .covers__toggle { height: 36px; margin-bottom: 0; padding: 0 14px; }
    .covers .covers__toggle[aria-expanded="true"] { color: var(--m-print-hi); }
    .covers .covers__menu { display: flex; }
    .covers .covers__menu li { display: block; }
    .covers .covers__menu li.m-seam { flex: none; }
    .covers .covers__menu a { padding: 12px 10px; }
    .covers .covers__menu a[aria-current="page"] { color: var(--m-print-hi); }
    .covers .covers__num { margin-left: auto; color: var(--m-print-dim); }
    .covers .covers__menu a[aria-current="page"]::before { background: var(--m-signal); box-shadow: 0 0 5px color-mix(in srgb, var(--m-signal) 60%, transparent); }
  `;
  css.textContent = LAYOUT + (matte ? MATTE : PLAIN);
  document.head.append(css);

  const nav = document.createElement('nav');
  nav.className = matte ? 'covers matte matte--dark' : 'covers';
  nav.setAttribute('aria-label', 'Cover prototypes');
  nav.innerHTML = `
    <ul class="covers__menu${matte ? ' m-panel m-panel--col m-menu' : ''}" id="covers-menu">
      ${COVERS.map((c, i) => `<li><a${matte ? ' class="m-menu__item"' : ''} href="${c.file}"${c.file === here ? ' aria-current="page"' : ''}>${c.name}<span class="covers__num">${i + 1}</span></a></li>`).join('')}
      ${lab ? `<li class="${matte ? 'm-seam' : 'covers__rule'}" role="presentation"></li><li><a${matte ? ' class="m-menu__item"' : ''} href="/${lab}">${labName}<span class="covers__num">Tune</span></a></li>` : ''}
    </ul>
    <button class="covers__toggle${matte ? ' m-key' : ''}" type="button" aria-expanded="false" aria-controls="covers-menu">Covers<span class="covers__caret" aria-hidden="true"></span></button>`;
  document.body.append(nav);

  const toggle = nav.querySelector('.covers__toggle');
  const set = (open) => { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', open); };
  toggle.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  addEventListener('pointerdown', (e) => { if (!nav.contains(e.target)) set(false); });
  if (new URLSearchParams(location.search).has('menu')) set(true);   // ?menu opens it on load, for screenshots
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { set(false); return; }
    if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = parseInt(e.key, 10);                            // number keys jump straight to a cover
    if (n >= 1 && n <= COVERS.length && COVERS[n - 1].file !== here) location.href = COVERS[n - 1].file;
  });
})();
