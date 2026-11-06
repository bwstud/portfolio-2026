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
