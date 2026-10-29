/* Note card: an author's note pinned top left on a tinkering page. The text lives in
   the page itself; this script only styles it and adds the collapse toggle.
   Usage: <aside class="notes"><p>…</p></aside> <script src="../notes.js"></script> */
(() => {
  const card = document.querySelector('.notes');
  if (!card) return;
  const openKey = 'tinkering-notes:' + location.pathname + ':open';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const css = `
    .notes {
      position: fixed; z-index: 3; top: 56px; left: 16px;
      width: min(300px, calc(100vw - 32px));
      border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px;
      background: rgba(8, 11, 16, 0.78);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      color: #e8ecf2; font: 13px/1.5 "Geist", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      overflow: hidden; cursor: auto;
    }
    .notes__head {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 9px 12px; border: 0; background: none; color: inherit;
      font: inherit; font-weight: 600; text-align: left; cursor: pointer;
    }
    .notes__head:focus-visible { outline: 2px solid var(--accent, var(--teal, #fff)); outline-offset: -2px; }
    .notes__caret { transition: transform 0.2s; opacity: 0.7; }
    .notes:not(.is-open) .notes__caret { transform: rotate(-90deg); }
    .notes__body { display: none; padding: 0 12px 12px; color: rgba(232, 236, 242, 0.85); }
    .notes.is-open .notes__body { display: block; }
    .notes__body p + p { margin-top: 0.6em; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // move the authored note into a collapsible body under a header button
  const body = document.createElement('div');
  body.className = 'notes__body';
  body.append(...card.childNodes);
  card.innerHTML = `
    <button class="notes__head" type="button" aria-expanded="false">
      <span class="notes__caret" aria-hidden="true">▾</span> Notes
    </button>`;
  card.appendChild(body);
  if (!card.hasAttribute('aria-label')) card.setAttribute('aria-label', 'Notes');

  const head = card.querySelector('.notes__head');
  const setOpen = open => {
    card.classList.toggle('is-open', open);
    head.setAttribute('aria-expanded', open);
  };
  setOpen(store.get(openKey) !== '0' && innerWidth >= 700);
  head.addEventListener('click', () => {
    const open = !card.classList.contains('is-open');
    setOpen(open);
    store.set(openKey, open ? '1' : '0');
  });

  // keep clicks and scrolling inside the card from reaching the 3D controls
  ['pointerdown', 'wheel'].forEach(type => card.addEventListener(type, e => e.stopPropagation()));
})();
