const dropdown = document.querySelector('.dropdown');
const toggle = dropdown.querySelector('.dropdown__toggle');

function setOpen(open) {
  dropdown.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', open);
}

toggle.addEventListener('click', () => setOpen(!dropdown.classList.contains('is-open')));
dropdown.querySelectorAll('.dropdown__menu a').forEach(a => a.addEventListener('click', () => setOpen(false)));
document.addEventListener('click', e => { if (!dropdown.contains(e.target)) setOpen(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
