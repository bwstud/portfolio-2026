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
