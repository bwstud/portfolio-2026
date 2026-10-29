/* Notes card: a small editable scratchpad pinned top left on each tinkering page.
   Saved to localStorage per page, so notes survive reloads and new sessions
   in the same browser. Usage: <script src="../notes.js" data-key="sandtable"></script> */
(() => {
  const script = document.currentScript;
  const key = 'tinkering-notes:' + (script.dataset.key || location.pathname);
  const openKey = key + ':open';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
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
    .notes__status { margin-left: auto; font-weight: 400; font-size: 12px; color: rgba(232, 236, 242, 0.5); }
    .notes__body { display: none; padding: 0 12px 12px; }
    .notes.is-open .notes__body { display: block; }
    .notes__text {
      display: block; width: 100%; min-height: 140px; max-height: 50vh; resize: vertical;
      padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px;
      background: rgba(255, 255, 255, 0.04); color: inherit; font: inherit;
    }
    .notes__text:focus { outline: none; border-color: var(--accent, var(--teal, #fff)); }
    .notes__text::placeholder { color: rgba(232, 236, 242, 0.4); }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const card = document.createElement('section');
  card.className = 'notes';
  card.setAttribute('aria-label', 'Notes');
  card.innerHTML = `
    <button class="notes__head" type="button" aria-expanded="false">
      <span class="notes__caret" aria-hidden="true">▾</span> Notes
      <span class="notes__status" aria-live="polite"></span>
    </button>
    <div class="notes__body">
      <textarea class="notes__text" placeholder="Capture ideas, settings worth keeping, things to try…" aria-label="Notes"></textarea>
    </div>`;
  document.body.appendChild(card);

  const head = card.querySelector('.notes__head');
  const text = card.querySelector('.notes__text');
  const status = card.querySelector('.notes__status');

  text.value = store.get(key) || '';
  const setOpen = open => {
    card.classList.toggle('is-open', open);
    head.setAttribute('aria-expanded', open);
    store.set(openKey, open ? '1' : '0');
  };
  setOpen(store.get(openKey) !== '0' && innerWidth >= 700);
  head.addEventListener('click', () => {
    setOpen(!card.classList.contains('is-open'));
    if (card.classList.contains('is-open')) text.focus();
  });

  let timer;
  const save = () => { status.textContent = store.set(key, text.value) ? 'Saved' : 'Not saved: storage unavailable'; };
  text.addEventListener('input', () => {
    status.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  });
  addEventListener('beforeunload', () => { clearTimeout(timer); store.set(key, text.value); });

  // keep typing and scrolling inside the card from reaching the 3D controls
  ['pointerdown', 'wheel', 'keydown'].forEach(type => card.addEventListener(type, e => e.stopPropagation()));
})();
