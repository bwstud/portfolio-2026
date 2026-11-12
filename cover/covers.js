// Cover switcher: a small menu in the bottom right corner of every cover page.
// The front page (index.html, at the site root) is the Chladni cover; the others live in cover/.
// To add a cover: make a new page in cover/, load this script in it
// (<script src="covers.js"></script>), and add a line to COVERS. Addresses are from the site root.
(() => {
  const COVERS = [
    { file: '/', name: 'Chladni sand' },
    { file: '/cover/cymascope.html', name: 'Cymascope' },
  ];

  const here = location.pathname.replace(/\/index\.html$/, '/');
  const css = document.createElement('style');
  css.textContent = `
    .covers { position: fixed; right: 20px; bottom: 20px; z-index: 100; font: 400 12px/1 "Söhne Mono", ui-monospace, Menlo, monospace;
      letter-spacing: .06em; text-transform: uppercase; }
    .covers__toggle, .covers__menu { background: rgba(4, 10, 19, .82); color: #DAE4E3; border: 1px solid rgba(218, 228, 227, .35);
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
    .covers__toggle { display: flex; align-items: center; gap: 8px; margin-left: auto; padding: 12px 16px; border-radius: 999px; font: inherit;
      letter-spacing: inherit; text-transform: inherit; cursor: pointer; transition: border-color 150ms, background 150ms; }
    .covers__toggle:hover, .covers__toggle[aria-expanded="true"] { border-color: #DAE4E3; }
    .covers__toggle:focus-visible, .covers__menu a:focus-visible { outline: 2px solid #DFC06C; outline-offset: 2px; }
    .covers__caret { width: 8px; height: 8px; border: solid currentColor; border-width: 1px 1px 0 0; transform: translateY(2px) rotate(-45deg); transition: transform 150ms; }
    .covers__toggle[aria-expanded="true"] .covers__caret { transform: translateY(-2px) rotate(135deg); }
    .covers__menu { position: absolute; right: 0; bottom: calc(100% + 8px); min-width: 220px; margin: 0; padding: 8px; list-style: none; border-radius: 12px;
      opacity: 0; transform: translateY(6px); visibility: hidden; transition: opacity 150ms, transform 150ms cubic-bezier(0.23, 1, 0.32, 1), visibility 0s 150ms; }
    .covers.is-open .covers__menu { opacity: 1; transform: none; visibility: visible; transition-delay: 0s; }
    .covers__menu a { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px; color: inherit; text-decoration: none; white-space: nowrap; }
    .covers__menu a:hover { background: rgba(218, 228, 227, .1); }
    .covers__menu a::before { content: ""; width: 6px; height: 6px; border-radius: 50%; }
    .covers__menu a[aria-current="page"] { color: #DFC06C; }
    .covers__menu a[aria-current="page"]::before { background: currentColor; }
    .covers__num { margin-left: auto; opacity: .5; }
    @media (prefers-reduced-motion: reduce) { .covers__menu, .covers__caret { transition: none; } }
  `;
  document.head.append(css);

  const nav = document.createElement('nav');
  nav.className = 'covers';
  nav.setAttribute('aria-label', 'Cover prototypes');
  nav.innerHTML = `
    <ul class="covers__menu" id="covers-menu">
      ${COVERS.map((c, i) => `<li><a href="${c.file}"${c.file === here ? ' aria-current="page"' : ''}>${c.name}<span class="covers__num">${i + 1}</span></a></li>`).join('')}
    </ul>
    <button class="covers__toggle" type="button" aria-expanded="false" aria-controls="covers-menu">Covers<span class="covers__caret" aria-hidden="true"></span></button>`;
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
