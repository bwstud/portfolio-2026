const dropdowns = [...document.querySelectorAll('.dropdown')];

function setOpen(dropdown, open) {
  dropdown.classList.toggle('is-open', open);
  dropdown.querySelector('.dropdown__toggle').setAttribute('aria-expanded', open);
}

dropdowns.forEach(dropdown => {
  dropdown.querySelector('.dropdown__toggle').addEventListener('click', () => {
    const open = !dropdown.classList.contains('is-open');
    dropdowns.forEach(d => setOpen(d, d === dropdown && open));
  });
  dropdown.querySelectorAll('.dropdown__menu a').forEach(a => a.addEventListener('click', () => setOpen(dropdown, false)));
});

document.addEventListener('click', e => dropdowns.forEach(d => { if (!d.contains(e.target)) setOpen(d, false); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') dropdowns.forEach(d => setOpen(d, false)); });

/* Light/dark switch. The choice is remembered; the page starts dark. An inline script in <head>
   applies a saved choice before first paint. Pages listen for "themechange" to redraw canvases. */
const themeToggle = document.querySelector('.theme-toggle');
if (themeToggle) {
  const root = document.documentElement;
  const sync = () => themeToggle.setAttribute('aria-pressed', root.dataset.theme === 'light');
  sync();
  themeToggle.addEventListener('click', () => {
    const light = root.dataset.theme !== 'light';
    if (light) root.dataset.theme = 'light'; else delete root.dataset.theme;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', light ? 'light' : 'dark');
    try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
    sync();
    document.dispatchEvent(new CustomEvent('themechange'));
  });
}

/* Phone menu. On a phone the bar keeps the first button (Work), Controls and the light/dark switch;
   every other link moves into a Menu button that opens a panel under the bar. The panel is built here
   from the links already on the page, so each page's nav stays written once. Wider than 600px, the
   button and panel are hidden by CSS and the links show as before. */
(() => {
  const nav = document.querySelector('header.nav');
  const links = nav?.querySelector('.nav__links');
  if (!nav || !links) return;
  const items = [...nav.querySelectorAll('.nav__start > a.chip:not(:first-child), .nav__links > a.chip')];
  if (!items.length) return;

  const panel = document.createElement('div');
  panel.className = 'nav__menu';
  panel.id = 'site-menu';
  panel.hidden = true;
  items.forEach(a => {
    const copy = a.cloneNode(true);
    copy.classList.add('nav__menu-link');
    panel.append(copy);
  });
  nav.append(panel);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chip nav__menu-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'site-menu');
  toggle.innerHTML = '<svg class="chip__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path class="nav__menu-bar nav__menu-bar--1" d="M4 7h16"/><path class="nav__menu-bar nav__menu-bar--2" d="M4 12h16"/><path class="nav__menu-bar nav__menu-bar--3" d="M4 17h16"/></svg><span>Menu</span>';
  links.insertBefore(toggle, links.querySelector('.dropdown, .theme-toggle'));

  const set = open => {
    nav.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', open);
    if (open) { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('is-open')); }
    else {
      panel.classList.remove('is-open');
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) panel.hidden = true;   // no fade, so no transitionend to wait for
    }
  };
  panel.addEventListener('transitionend', () => { if (!panel.classList.contains('is-open')) panel.hidden = true; });
  toggle.addEventListener('click', () => {
    const open = !nav.classList.contains('is-menu-open');
    if (open) dropdowns.forEach(d => setOpen(d, false));
    set(open);
  });
  panel.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  dropdowns.forEach(d => d.querySelector('.dropdown__toggle').addEventListener('click', () => set(false)));
  document.addEventListener('click', e => { if (!nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('is-menu-open')) { set(false); toggle.focus(); } });
  matchMedia('(min-width: 601px)').addEventListener('change', e => { if (e.matches) { set(false); panel.hidden = true; } });
})();

// The site's grid (matte-page.css): Shift+G, or ?grid in the address, lays its twelve columns over the page column, to check
// that things sit on them. It follows the page column's padding as the window changes.
(() => {
  const home = document.querySelector('.home');
  if (!home) return;
  let overlay = null;
  const place = () => {
    const r = home.getBoundingClientRect(), c = getComputedStyle(home);
    overlay.style.left = r.left + parseFloat(c.paddingLeft) + 'px';
    overlay.style.width = r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) + 'px';
  };
  const toggle = () => {
    if (overlay) { overlay.remove(); overlay = null; removeEventListener('resize', place); return; }
    overlay = document.createElement('div'); overlay.className = 'grid-overlay'; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<span></span>'.repeat(12);
    document.body.append(overlay); place(); addEventListener('resize', place);
  };
  document.addEventListener('keydown', e => {
    if (e.key !== 'G' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    toggle();
  });
  if (new URLSearchParams(location.search).has('grid')) toggle();
})();
